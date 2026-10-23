// Notificaciones de la app de celular ("Administración Página → Notificaciones").
// Dos caminos de entrega, con las mismas reglas (pausa general, máximo por día y horario permitido, en hora de Uruguay):
// - Programadas (fecha y hora, o repetidas): forman la AGENDA (/api/app/v1/notificaciones). Cada celular la baja al
//   abrir la app, en segundo plano y al recibir un aviso silencioso de "sincronizar", y muestra él mismo cada aviso a
//   su hora. No hace falta un reloj en el servidor (Vercel Hobby solo admite tareas diarias) y el aviso sale aunque el
//   celular no tenga señal en ese momento.
// - "Enviar ahora": aviso instantáneo por el servicio de Expo (push.ts) a los celulares registrados.
// Automáticas: aperturas de crédito (el día anterior y el mismo día, calculadas de las fechas del panel), y ofertas
// del mes y novedades cuando se publican (se guardan como una fila con `origen` único para no repetirse).
import { ahora, ejecutar, todas, una, type Db } from './db.ts';
import { fechaValida, hoyUruguay } from './fechas.ts';
import type { Apertura } from './creditos.ts';

export type Categoria = 'avisos' | 'creditos' | 'ofertas' | 'novedades';
export const CATEGORIAS: Record<Categoria, string> = {
  avisos: 'Avisos generales',
  creditos: 'Aperturas de crédito',
  ofertas: 'Ofertas del supermercado',
  novedades: 'Novedades',
};
export const esCategoria = (v: unknown): v is Categoria => typeof v === 'string' && v in CATEGORIAS;

/** Pantalla que abre el aviso al tocarlo y texto de su botón (la app arma los botones con esta lista). */
export type Destino = 'inicio' | 'acceso-socios' | 'promociones' | 'bazar' | 'beneficios' | 'convenios' | 'locales' | 'hacete-socio' | 'contacto';
export const DESTINOS: Record<Destino, { nombre: string; boton: string }> = {
  inicio: { nombre: 'Inicio de la app', boton: 'Abrir COPOL' },
  'acceso-socios': { nombre: 'Acceso web para socios', boton: 'Consultá tu crédito' },
  promociones: { nombre: 'Ofertas del supermercado', boton: 'Ver ofertas' },
  bazar: { nombre: 'Bazar', boton: 'Ver el Bazar' },
  beneficios: { nombre: 'Beneficios', boton: 'Ver beneficios' },
  convenios: { nombre: 'Convenios', boton: 'Ver convenios' },
  locales: { nombre: 'Locales', boton: 'Ver locales' },
  'hacete-socio': { nombre: 'Hacete socio', boton: 'Hacete socio' },
  contacto: { nombre: 'Contacto', boton: 'Contactanos' },
};
export const esDestino = (v: unknown): v is Destino => typeof v === 'string' && v in DESTINOS;

/** recienteHoras: los avisos que ya debían salir siguen en la agenda este tiempo, para el celular que se conecta tarde. */
export const LIMITES = { titulo: 60, texto: 180, diasAgenda: 14, maxInstancias: 60, maxPorDia: 6, maxDiasRepeticion: 366, recienteHoras: 12 } as const;
export const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// ── Ajustes (tabla `ajustes`, clave "notificaciones") ──
export interface Ajustes {
  /** false: pausa general (no sale ningún aviso, ni programado ni automático). */
  activas: boolean;
  maxPorDia: number;
  /** Horario permitido, HH:MM (hora de Uruguay). */
  desde: string;
  hasta: string;
  credito: { activo: boolean; diaAnterior: boolean; mismoDia: boolean; hora: string };
  ofertas: { activo: boolean };
  novedades: { activo: boolean };
}
export const AJUSTES_INICIALES: Ajustes = {
  activas: true,
  maxPorDia: 2,
  desde: '09:00',
  hasta: '21:00',
  credito: { activo: true, diaAnterior: true, mismoDia: true, hora: '10:00' },
  ofertas: { activo: true },
  novedades: { activo: true },
};

export const horaValida = (v: unknown) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim()) ? v.trim() : '');
export const dentroDelHorario = (hora: string, a: Pick<Ajustes, 'desde' | 'hasta'>) => hora >= a.desde && hora <= a.hasta;

export async function obtenerAjustes(db: Db): Promise<Ajustes> {
  const fila = await una<{ valor: string }>(db, "SELECT valor FROM ajustes WHERE clave = 'notificaciones'");
  let d: Partial<Ajustes> = {};
  try { d = fila ? JSON.parse(fila.valor) : {}; } catch { d = {}; }
  const i = AJUSTES_INICIALES;
  const desde = horaValida(d.desde) || i.desde;
  const hasta = horaValida(d.hasta) || i.hasta;
  return {
    activas: d.activas !== false,
    maxPorDia: Math.min(LIMITES.maxPorDia, Math.max(1, Math.trunc(Number(d.maxPorDia)) || i.maxPorDia)),
    desde,
    hasta: hasta > desde ? hasta : i.hasta,
    credito: {
      activo: d.credito?.activo !== false,
      diaAnterior: d.credito?.diaAnterior !== false,
      mismoDia: d.credito?.mismoDia !== false,
      hora: horaValida(d.credito?.hora) || i.credito.hora,
    },
    ofertas: { activo: d.ofertas?.activo !== false },
    novedades: { activo: d.novedades?.activo !== false },
  };
}
export const guardarAjustes = (db: Db, a: Ajustes) =>
  ejecutar(db, "INSERT INTO ajustes (clave, valor, actualizado_en) VALUES ('notificaciones', ?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en", [JSON.stringify(a), ahora()]);

// ── Notificaciones guardadas (manuales y automáticas de ofertas/novedades) ──
export type Repeticion = 'una-vez' | 'diaria';
export interface Notificacion {
  id: number;
  titulo: string;
  texto: string;
  destino: Destino;
  con_boton: number;
  categoria: Categoria;
  /** 'manual' o 'auto:ofertas:…' / 'auto:novedad:…' (único: cada publicación avisa una sola vez). */
  origen: string;
  repeticion: Repeticion;
  /** Una vez: el día. Diaria: desde qué día. AAAA-MM-DD */
  fecha: string;
  hora: string;
  /** Diaria: días de la semana (0 = domingo), separados por coma; null = todos. */
  dias: string | null;
  /** Diaria: hasta qué día (inclusive); null = sin fin. */
  hasta: string | null;
  estado: 'programada' | 'enviada' | 'cancelada';
  enviada_en: string | null;
  /** Enviadas: a cuántos celulares se mandó. */
  alcance: number | null;
  creado_en: string;
  actualizado_en: string;
  actualizado_por: string | null;
}
export interface DatosNotificacion {
  titulo: string;
  texto: string;
  destino: Destino;
  conBoton: boolean;
  categoria: Categoria;
  repeticion: Repeticion;
  fecha: string;
  hora: string;
  dias: number[] | null;
  hasta: string | null;
}

export const listarNotificaciones = (db: Db) => todas<Notificacion>(db, "SELECT * FROM notificaciones ORDER BY CASE estado WHEN 'programada' THEN 0 ELSE 1 END, COALESCE(enviada_en, fecha || 'T' || hora) DESC, id DESC LIMIT 200");
export const obtenerNotificacion = (db: Db, id: number) => una<Notificacion>(db, 'SELECT * FROM notificaciones WHERE id = ?', [id]);

const filaDe = (d: DatosNotificacion) => [d.titulo, d.texto, d.destino, d.conBoton ? 1 : 0, d.categoria, d.repeticion, d.fecha, d.hora, d.dias?.join(',') ?? null, d.hasta];

export async function crearNotificacion(db: Db, d: DatosNotificacion, por: string, origen = 'manual', estado: Notificacion['estado'] = 'programada') {
  const t = ahora();
  const r = await ejecutar(db, `INSERT INTO notificaciones (titulo, texto, destino, con_boton, categoria, repeticion, fecha, hora, dias, hasta, origen, estado, creado_en, actualizado_en, actualizado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [...filaDe(d), origen, estado, t, t, por]);
  return (await obtenerNotificacion(db, r.id!))!;
}
export async function editarNotificacion(db: Db, id: number, d: DatosNotificacion, por: string) {
  await ejecutar(db, 'UPDATE notificaciones SET titulo = ?, texto = ?, destino = ?, con_boton = ?, categoria = ?, repeticion = ?, fecha = ?, hora = ?, dias = ?, hasta = ?, actualizado_en = ?, actualizado_por = ? WHERE id = ?', [...filaDe(d), ahora(), por, id]);
  return obtenerNotificacion(db, id);
}
export const cancelarNotificacion = (db: Db, id: number, por: string) =>
  ejecutar(db, "UPDATE notificaciones SET estado = 'cancelada', actualizado_en = ?, actualizado_por = ? WHERE id = ? AND estado = 'programada'", [ahora(), por, id]);
export const eliminarNotificacion = (db: Db, id: number) => ejecutar(db, 'DELETE FROM notificaciones WHERE id = ?', [id]);
export const marcarEnviada = (db: Db, id: number, alcance: number) =>
  ejecutar(db, "UPDATE notificaciones SET estado = 'enviada', enviada_en = ?, alcance = ? WHERE id = ?", [ahora(), alcance, id]);
export const existeOrigen = async (db: Db, origen: string) => Boolean(await una(db, 'SELECT 1 FROM notificaciones WHERE origen = ?', [origen]));

// ── Fechas y horas (Uruguay: UTC−3 todo el año) ──
export const horaUruguay = (f = new Date()) => f.toLocaleTimeString('en-GB', { timeZone: 'America/Montevideo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const sumarDias = (fecha: string, n: number) => new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const diaSemana = (fecha: string) => new Date(`${fecha}T12:00:00Z`).getUTCDay();
export const instante = (fecha: string, hora: string) => `${fecha}T${hora}:00-03:00`;

/** Próximo momento permitido para un aviso que se dispara ahora (publicación de ofertas o novedades). */
export function proximoMomento(a: Pick<Ajustes, 'desde' | 'hasta'>, f = new Date()): { fecha: string; hora: string; yaMismo: boolean } {
  const hoy = hoyUruguay(f);
  const h = horaUruguay(f);
  if (h < a.desde) return { fecha: hoy, hora: a.desde, yaMismo: false };
  if (h > a.hasta) return { fecha: sumarDias(hoy, 1), hora: a.desde, yaMismo: false };
  return { fecha: hoy, hora: h, yaMismo: true };
}

// ── Agenda: los avisos de los próximos días, con el máximo por día aplicado ──
export interface Instancia {
  id: string;
  notificacionId: number | null;
  titulo: string;
  texto: string;
  destino: Destino;
  boton: boolean;
  categoria: Categoria;
  fecha: string;
  hora: string;
  /** ISO con zona de Uruguay. */
  en: string;
  automatica: boolean;
  /** true: no sale porque ese día ya tiene el máximo de avisos (o está fuera del horario permitido). */
  omitida: boolean;
  motivo: string | null;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const fechaLarga = (f: string) => {
  const [, m, d] = f.split('-').map(Number);
  return `${DIAS_SEMANA[diaSemana(f)].toLowerCase()} ${d} de ${MESES[m - 1]}`;
};

/** Avisos automáticos de las aperturas de crédito (solo fechas confirmadas). */
export function avisosDeCredito(aperturas: Apertura[], a: Ajustes): Omit<Instancia, 'omitida' | 'motivo'>[] {
  if (!a.credito.activo) return [];
  const comun = { notificacionId: null, destino: 'acceso-socios' as const, boton: true, categoria: 'creditos' as const, automatica: true, hora: a.credito.hora };
  const cola = 'Consultá tu crédito disponible desde Acceso web o acercate a cualquiera de nuestros locales.';
  return aperturas.filter((x) => x.confirmada).flatMap((x) => [
    ...(a.credito.diaAnterior ? [{ ...comun, id: `credito-${x.fecha}-antes`, fecha: sumarDias(x.fecha, -1), titulo: 'Mañana hay apertura de créditos', texto: `Es el ${fechaLarga(x.fecha)}. ${cola}`, en: instante(sumarDias(x.fecha, -1), a.credito.hora) }] : []),
    ...(a.credito.mismoDia ? [{ ...comun, id: `credito-${x.fecha}-dia`, fecha: x.fecha, titulo: 'Hoy hay apertura de créditos', texto: cola, en: instante(x.fecha, a.credito.hora) }] : []),
  ]);
}

/** Días en que se repite una notificación, dentro de [desde, hasta]. */
export function diasDe(n: Pick<Notificacion, 'repeticion' | 'fecha' | 'dias' | 'hasta'>, desde: string, hasta: string): string[] {
  if (n.repeticion === 'una-vez') return n.fecha >= desde && n.fecha <= hasta ? [n.fecha] : [];
  const semana = n.dias ? n.dias.split(',').map(Number) : null;
  const salida: string[] = [];
  const fin = n.hasta && n.hasta < hasta ? n.hasta : hasta;
  for (let d = n.fecha > desde ? n.fecha : desde; d <= fin; d = sumarDias(d, 1)) if (!semana || semana.includes(diaSemana(d))) salida.push(d);
  return salida;
}

const PRIORIDAD: Record<Categoria, number> = { creditos: 0, avisos: 1, ofertas: 2, novedades: 3 };

export interface OpcionesAgenda { hoy?: string; dias?: number; aperturas: Apertura[]; ajustes: Ajustes; notificaciones: Notificacion[]; enviadasHoy: number }

/** Agenda completa (incluye las omitidas, para mostrarlas en el panel); la app recibe solo las que salen. */
export function armarAgenda({ hoy = hoyUruguay(), dias = LIMITES.diasAgenda, aperturas, ajustes, notificaciones, enviadasHoy }: OpcionesAgenda): Instancia[] {
  const hasta = sumarDias(hoy, dias - 1);
  const manuales = notificaciones.filter((n) => n.estado === 'programada').flatMap((n) =>
    diasDe(n, hoy, hasta).map((d) => ({
      id: n.repeticion === 'una-vez' ? `n${n.id}` : `n${n.id}-${d}`,
      notificacionId: n.id, titulo: n.titulo, texto: n.texto, destino: n.destino, boton: Boolean(n.con_boton), categoria: n.categoria,
      fecha: d, hora: n.hora, en: instante(d, n.hora), automatica: n.origen !== 'manual',
    })));
  const todas = [...manuales, ...avisosDeCredito(aperturas, ajustes).filter((x) => x.fecha >= hoy && x.fecha <= hasta)];
  const porDia = new Map<string, typeof todas>();
  for (const x of todas) porDia.set(x.fecha, [...(porDia.get(x.fecha) ?? []), x]);
  const salida: Instancia[] = [];
  for (const [fecha, lista] of porDia) {
    let lugar = ajustes.maxPorDia - (fecha === hoy ? enviadasHoy : 0);
    for (const x of lista.sort((a, b) => PRIORIDAD[a.categoria] - PRIORIDAD[b.categoria] || a.hora.localeCompare(b.hora))) {
      const fuera = !dentroDelHorario(x.hora, ajustes);
      const omitida = !ajustes.activas || fuera || lugar <= 0;
      if (!omitida) lugar--;
      salida.push({ ...x, omitida, motivo: !ajustes.activas ? 'Notificaciones en pausa' : fuera ? 'Fuera del horario permitido' : omitida ? `Ese día ya tiene ${ajustes.maxPorDia} avisos (máximo)` : null });
    }
  }
  return salida.sort((a, b) => a.en.localeCompare(b.en)).slice(0, LIMITES.maxInstancias * 2);
}

/** Lo que recibe la app: lo que sale (también lo de las últimas horas, para el celular que no se conectó a tiempo:
 * la app lo muestra apenas se entera, dentro del horario permitido, y una sola vez). */
export const agendaPublica = (agenda: Instancia[], f = new Date()) =>
  agenda.filter((x) => !x.omitida && Date.parse(x.en) > f.getTime() - LIMITES.recienteHoras * 3_600_000).slice(0, LIMITES.maxInstancias)
    .map(({ id, titulo, texto, destino, boton, categoria, en }) => ({ id, titulo, texto, destino, boton, categoria, en }));

/** "Enviar ahora" de las últimas horas: sin servicio de avisos instantáneos, cada celular los recibe al sincronizar. */
export async function enviadasRecientes(db: Db, f = new Date()) {
  const filas = await todas<Notificacion>(db, "SELECT * FROM notificaciones WHERE estado = 'enviada' AND enviada_en >= ? ORDER BY enviada_en", [new Date(f.getTime() - LIMITES.recienteHoras * 3_600_000).toISOString()]);
  return filas.map((n) => ({ id: `n${n.id}`, titulo: n.titulo, texto: n.texto, destino: n.destino, boton: Boolean(n.con_boton), categoria: n.categoria, en: n.enviada_en! }));
}

/** Avisos enviados al instante hoy (cuentan para el máximo del día). */
export async function enviadasHoy(db: Db, hoy = hoyUruguay()) {
  const desde = new Date(Date.parse(`${hoy}T00:00:00-03:00`)).toISOString();
  return Number((await una<{ n: number }>(db, "SELECT COUNT(*) n FROM notificaciones WHERE estado = 'enviada' AND enviada_en >= ?", [desde]))?.n ?? 0);
}

export async function agendaDe(db: Db, aperturas: Apertura[], hoy = hoyUruguay()) {
  const [ajustes, notificaciones, enviadas] = await Promise.all([obtenerAjustes(db), todas<Notificacion>(db, "SELECT * FROM notificaciones WHERE estado = 'programada'"), enviadasHoy(db, hoy)]);
  return { ajustes, enviadas, agenda: armarAgenda({ hoy, aperturas, ajustes, notificaciones, enviadasHoy: enviadas }) };
}

// ── Celulares registrados para avisos instantáneos ──
export type Plataforma = 'android' | 'ios';
export const TOKEN_EXPO = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,120}\]$/;
export interface Dispositivo { token: string; plataforma: Plataforma; categorias: string; creado_en: string; visto_en: string }

export async function registrarDispositivo(db: Db, token: string, plataforma: Plataforma, categorias: Categoria[]) {
  const t = ahora();
  await ejecutar(db, 'INSERT INTO dispositivos (token, plataforma, categorias, creado_en, visto_en) VALUES (?, ?, ?, ?, ?) ON CONFLICT (token) DO UPDATE SET plataforma = excluded.plataforma, categorias = excluded.categorias, visto_en = excluded.visto_en', [token, plataforma, JSON.stringify(categorias), t, t]);
}
export const bajaDispositivo = (db: Db, token: string) => ejecutar(db, 'DELETE FROM dispositivos WHERE token = ?', [token]);
export async function borrarDispositivos(db: Db, tokens: string[]) {
  if (tokens.length) await db.batch(tokens.map((t) => ({ sql: 'DELETE FROM dispositivos WHERE token = ?', args: [t] })), 'write');
}
/** Tokens que reciben una categoría (o todos, para la sincronización silenciosa). */
export const tokensPara = async (db: Db, categoria?: Categoria) =>
  (await todas<{ token: string }>(db, categoria ? 'SELECT token FROM dispositivos WHERE instr(categorias, ?) > 0' : 'SELECT token FROM dispositivos', categoria ? [`"${categoria}"`] : [])).map((f) => f.token);
export async function contarDispositivos(db: Db) {
  const filas = await todas<{ categorias: string }>(db, 'SELECT categorias FROM dispositivos');
  const porCategoria = Object.fromEntries((Object.keys(CATEGORIAS) as Categoria[]).map((k) => [k, filas.filter((f) => f.categorias.includes(`"${k}"`)).length])) as Record<Categoria, number>;
  return { total: filas.length, porCategoria };
}

/** Datos de una notificación a partir del formulario. `cuando`: ahora | programar | repetir. */
export function validarNotificacion(b: Record<string, unknown>, a: Ajustes, f = new Date()) {
  const t = (k: string, max: number) => (typeof b[k] === 'string' ? (b[k] as string).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max + 1) : '');
  const errores: Record<string, string> = {};
  const cuando = b.cuando === 'repetir' ? 'repetir' : b.cuando === 'ahora' ? 'ahora' : 'programar';
  const titulo = t('titulo', LIMITES.titulo);
  const texto = t('texto', LIMITES.texto);
  if (titulo.length < 3 || titulo.length > LIMITES.titulo) errores.titulo = `Escribí un título de 3 a ${LIMITES.titulo} caracteres.`;
  if (texto.length < 3 || texto.length > LIMITES.texto) errores.texto = `Escribí un texto de 3 a ${LIMITES.texto} caracteres.`;
  const destino = esDestino(b.destino) ? b.destino : 'inicio';
  const categoria = esCategoria(b.categoria) ? b.categoria : 'avisos';
  const hoy = hoyUruguay(f);
  let fecha = hoy, hora = horaUruguay(f), dias: number[] | null = null, hasta: string | null = null;
  if (cuando === 'ahora') {
    if (!a.activas) errores.cuando = 'Las notificaciones están en pausa: activalas en Ajustes para enviar.';
    else if (!dentroDelHorario(hora, a)) errores.cuando = `Ahora está fuera del horario permitido (${a.desde} a ${a.hasta}). Programala para más tarde.`;
  } else {
    hora = horaValida(b.hora);
    if (!hora) errores.hora = 'Elegí una hora.';
    else if (!dentroDelHorario(hora, a)) errores.hora = `Elegí una hora entre ${a.desde} y ${a.hasta} (horario permitido).`;
    fecha = fechaValida(b.fecha);
    if (!fecha) errores.fecha = 'Elegí una fecha.';
    else if (fecha < hoy) errores.fecha = 'La fecha ya pasó.';
    else if (cuando === 'programar' && hora && Date.parse(instante(fecha, hora)) < f.getTime() + 5 * 60_000) errores.hora = 'Elegí un momento al menos 5 minutos más adelante (o usá "Enviar ahora").';
    if (cuando === 'repetir') {
      const elegidos = (Array.isArray(b.dias) ? b.dias : [b.dias]).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
      dias = elegidos.length && elegidos.length < 7 ? [...new Set(elegidos)].sort() : null;
      if (!elegidos.length) errores.dias = 'Elegí al menos un día de la semana.';
      const h = fechaValida(b.hasta);
      if (b.hasta && !h) errores.hasta = 'Fecha inválida.';
      else if (h && fecha && h < fecha) errores.hasta = 'La fecha de fin es anterior a la de inicio.';
      else if (h && fecha && h > sumarDias(fecha, LIMITES.maxDiasRepeticion)) errores.hasta = 'Como máximo un año.';
      hasta = h || null;
    }
  }
  const datos: DatosNotificacion = { titulo, texto, destino, conBoton: b.con_boton === '1', categoria, repeticion: cuando === 'repetir' ? 'diaria' : 'una-vez', fecha, hora, dias, hasta };
  return { datos, errores, cuando };
}

/** Días de la agenda en los que una notificación nueva (o editada) quedaría afuera por el máximo diario. */
export function diasExcedidos(agenda: Instancia[], notificacionId: number) {
  return agenda.filter((x) => x.notificacionId === notificacionId && x.omitida).map((x) => x.fecha);
}
