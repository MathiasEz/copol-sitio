// Estadísticas de la web pública, propias y respetuosas de la privacidad (plan de mejoras F5):
// - Sin cookies ni almacenamiento en el navegador, sin IP guardada y sin servicios de terceros: no hace falta
//   aviso de cookies.
// - Se guardan solo contadores por día (vistas por página, origen de la visita, celular/computadora, clics a
//   WhatsApp por página y por producto, clics en el banner y piezas ampliadas).
// - Visitantes únicos: hash de (sal del día + IP + navegador). La sal cambia cada día y los hash se borran a
//   los 2 días: no se puede seguir a nadie de un día a otro ni recuperar la IP.
// La web avisa cada vista y clic a /api/e (src/pages/api/e.ts); el panel muestra el resumen en "Estadísticas".
import crypto from 'node:crypto';
import { BASE } from './config.ts';
import { ejecutar, todas, una, type Db } from './db.ts';
import { hoyUruguay } from './fechas.ts';

export type TipoEvento = 'vista' | 'whatsapp' | 'banner' | 'visor';
export interface EventoWeb {
  tipo: TipoEvento;
  ruta: string;
  /** Dominio de origen (solo en vistas que llegan desde otro sitio). */
  origen?: string;
  celular?: boolean;
  /** Detalle del clic: producto consultado, título del banner, etc. */
  detalle?: string;
}

// Secciones del sitio que se cuentan por separado; cualquier otra dirección se cuenta como "Otras".
const RUTAS = /^\/(?:$|sobre-nosotros\/(?:locales\/|nuestra-historia\/)?$|beneficios\/(?:convenios\/|servicios-sociales\/(?:[a-z0-9-]{2,40}\/)?)?$|hipermercado\/(?:bazar\/|tienda\/|promociones\/)?$|hacete-socio\/$|contacto\/$|acceso-web\/$|portal-empleados\/$)/;
const BOTS = /bot|crawl|spider|slurp|headless|lighthouse|pingdom|preview|facebookexternalhit|whatsapp|curl|wget|python|node-fetch|axios/i;

const limpiar = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '');

export function normalizarRuta(v: unknown): string | null {
  let r = limpiar(v, 200).split(/[?#]/)[0];
  if (!r.startsWith('/') || r.startsWith(BASE) || r.startsWith('/api/') || r.startsWith('/_')) return null;
  if (!r.endsWith('/')) r += '/';
  return RUTAS.test(r) ? r : '/otras/';
}

/** Valida lo que manda el navegador (nada de lo que llega es confiable). */
export function leerEvento(v: unknown, hostPropio: string): EventoWeb | null {
  const e = v as Record<string, unknown>;
  if (!e || typeof e !== 'object') return null;
  const tipo = e.t;
  if (tipo !== 'vista' && tipo !== 'whatsapp' && tipo !== 'banner' && tipo !== 'visor') return null;
  const ruta = normalizarRuta(e.r);
  if (!ruta) return null;
  let origen: string | undefined;
  const ref = limpiar(e.ref, 300);
  if (tipo === 'vista') {
    try {
      const h = ref ? new URL(ref).hostname.replace(/^www\./, '').toLowerCase() : '';
      if (!h) origen = 'Directo';
      else if (h !== hostPropio.replace(/^www\./, '').toLowerCase()) origen = /^[a-z0-9.-]{1,80}$/.test(h) ? h : undefined;
    } catch { origen = undefined; }
  }
  // WhatsApp: el producto se deduce del mensaje del enlace (solo enlaces a wa.me); el resto manda su detalle.
  const enlace = limpiar(e.u, 600);
  const detalle = (tipo === 'whatsapp' ? (enlace.startsWith('https://wa.me/') ? productoDeWhatsapp(enlace) : null) : limpiar(e.d, 120)) || undefined;
  return { tipo, ruta, origen, celular: e.m === true, detalle };
}

/** Producto consultado, a partir del mensaje de WhatsApp que arma el Bazar. */
export function productoDeWhatsapp(url: string): string | null {
  try {
    const texto = new URL(url).searchParams.get('text') ?? '';
    const m = texto.match(/consultar por el producto: (.+?)(?: \(código interno COPOL ([\w-]+)\))?$/i);
    return m ? limpiar(m[2] ? `${m[1]} · ${m[2]}` : m[1], 120) : null;
  } catch {
    return null;
  }
}

export const esBot = (agente: string | null) => !agente || BOTS.test(agente);

// Sal del día: al azar, guardada en `ajustes` (compartida entre instancias); al cambiar de día se borran
// los identificadores viejos.
let salCache: { fecha: string; sal: string } | null = null;
async function salDelDia(db: Db, hoy: string) {
  if (salCache?.fecha === hoy) return salCache.sal;
  const fila = await una<{ valor: string }>(db, "SELECT valor FROM ajustes WHERE clave = 'estadisticas_sal'");
  let actual: { fecha: string; sal: string } | null = null;
  try { actual = fila ? JSON.parse(fila.valor) : null; } catch { /* se regenera */ }
  if (actual?.fecha !== hoy) {
    actual = { fecha: hoy, sal: crypto.randomBytes(32).toString('base64url') };
    await ejecutar(db, "INSERT INTO ajustes (clave, valor, actualizado_en) VALUES ('estadisticas_sal', ?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en", [JSON.stringify(actual), new Date().toISOString()]);
    const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    await ejecutar(db, 'DELETE FROM visitantes_dia WHERE fecha < ?', [ayer]);
  }
  salCache = actual;
  return actual.sal;
}

const sumar = (fecha: string, tipo: string, clave: string) => ({
  sql: 'INSERT INTO estadisticas_dia (fecha, tipo, clave, valor) VALUES (?, ?, ?, 1) ON CONFLICT (fecha, tipo, clave) DO UPDATE SET valor = valor + 1',
  args: [fecha, tipo, clave],
});

export async function registrarEvento(db: Db, e: EventoWeb, quien: { ip: string | null; agente: string | null }, hoy = hoyUruguay()) {
  const lote = [];
  if (e.tipo === 'vista') {
    lote.push(sumar(hoy, 'vistas', ''), sumar(hoy, 'pagina', e.ruta), sumar(hoy, 'dispositivo', e.celular ? 'celular' : 'computadora'));
    if (e.origen) lote.push(sumar(hoy, 'origen', e.origen));
    const hash = crypto.createHash('sha256').update(`${await salDelDia(db, hoy)}|${quien.ip ?? ''}|${quien.agente ?? ''}`).digest('base64url').slice(0, 32);
    const nuevo = await ejecutar(db, 'INSERT INTO visitantes_dia (fecha, hash) VALUES (?, ?) ON CONFLICT DO NOTHING', [hoy, hash]);
    if (nuevo.cambios) lote.push(sumar(hoy, 'visitantes', ''));
  } else if (e.tipo === 'whatsapp') {
    lote.push(sumar(hoy, 'whatsapp', ''), sumar(hoy, 'whatsapp_pagina', e.ruta));
    if (e.detalle) lote.push(sumar(hoy, 'producto', e.detalle));
  } else if (e.tipo === 'banner') {
    lote.push(sumar(hoy, 'banner', e.detalle ?? 'Sin título'));
  } else {
    lote.push(sumar(hoy, 'visor', e.ruta));
  }
  await db.batch(lote, 'write');
}

// ── Resumen para el panel ──
export interface Resumen {
  desde: string;
  hasta: string;
  dias: { fecha: string; vistas: number; visitantes: number; whatsapp: number }[];
  totales: { vistas: number; visitantes: number; whatsapp: number; celular: number; computadora: number };
  anteriores: { vistas: number; visitantes: number; whatsapp: number };
  ranking: Record<'pagina' | 'origen' | 'whatsapp_pagina' | 'producto' | 'banner' | 'visor', { clave: string; valor: number }[]>;
}

const sumarDias = (fecha: string, n: number) => new Date(Date.parse(`${fecha}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export async function resumen(db: Db, dias: number, hoy = hoyUruguay()): Promise<Resumen> {
  const desde = sumarDias(hoy, -(dias - 1));
  return resumenRango(db, desde, hoy, sumarDias(desde, -dias), sumarDias(desde, -1));
}

/** Resumen de un rango de días (inclusive) y, para comparar, del rango anterior. */
export async function resumenRango(db: Db, desde: string, hasta: string, antDesde: string, antHasta: string): Promise<Resumen> {
  const dias = Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000) + 1;
  const filas = await todas<{ fecha: string; tipo: string; valor: number }>(db,
    "SELECT fecha, tipo, SUM(valor) valor FROM estadisticas_dia WHERE fecha BETWEEN ? AND ? AND tipo IN ('vistas', 'visitantes', 'whatsapp') GROUP BY fecha, tipo", [desde, hasta]);
  const porDia = new Map<string, Resumen['dias'][number]>();
  for (let i = 0; i < dias; i++) { const f = sumarDias(desde, i); porDia.set(f, { fecha: f, vistas: 0, visitantes: 0, whatsapp: 0 }); }
  for (const f of filas) { const d = porDia.get(f.fecha); if (d) d[f.tipo as 'vistas'] = Number(f.valor); }
  const lista = [...porDia.values()];
  const total = (k: 'vistas' | 'visitantes' | 'whatsapp') => lista.reduce((a, d) => a + d[k], 0);

  const prev = await todas<{ tipo: string; valor: number }>(db,
    "SELECT tipo, SUM(valor) valor FROM estadisticas_dia WHERE fecha BETWEEN ? AND ? AND tipo IN ('vistas', 'visitantes', 'whatsapp') GROUP BY tipo", [antDesde, antHasta]);
  const anterior = (k: string) => Number(prev.find((p) => p.tipo === k)?.valor ?? 0);

  const tops = await todas<{ tipo: string; clave: string; valor: number }>(db,
    "SELECT tipo, clave, SUM(valor) valor FROM estadisticas_dia WHERE fecha BETWEEN ? AND ? AND tipo IN ('pagina', 'origen', 'whatsapp_pagina', 'producto', 'banner', 'visor', 'dispositivo') GROUP BY tipo, clave ORDER BY valor DESC", [desde, hasta]);
  const ranking = Object.fromEntries((['pagina', 'origen', 'whatsapp_pagina', 'producto', 'banner', 'visor'] as const)
    .map((t) => [t, tops.filter((x) => x.tipo === t).slice(0, 12).map((x) => ({ clave: x.clave, valor: Number(x.valor) }))])) as Resumen['ranking'];
  const disp = (k: string) => Number(tops.find((x) => x.tipo === 'dispositivo' && x.clave === k)?.valor ?? 0);
  return {
    desde, hasta, dias: lista,
    totales: { vistas: total('vistas'), visitantes: total('visitantes'), whatsapp: total('whatsapp'), celular: disp('celular'), computadora: disp('computadora') },
    anteriores: { vistas: anterior('vistas'), visitantes: anterior('visitantes'), whatsapp: anterior('whatsapp') },
    ranking,
  };
}

// ── Archivo mes a mes ──
// Cada mes cerrado queda guardado con su resumen completo (días, totales, rankings y comparación con el mes
// anterior): así se puede ver mes a mes aunque cambie la forma de contar o se limpien datos viejos.
const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;
export const mesValido = (m: unknown): m is string => typeof m === 'string' && RE_MES.test(m);
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
export const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1][0].toUpperCase()}${MESES[Number(m.slice(5, 7)) - 1].slice(1)} de ${m.slice(0, 4)}`;
const mesAnterior = (m: string) => { const [a, n] = m.split('-').map(Number); return n === 1 ? `${a - 1}-12` : `${a}-${String(n - 1).padStart(2, '0')}`; };
const finDeMes = (m: string) => { const [a, n] = m.split('-').map(Number); return new Date(Date.UTC(a, n, 0)).toISOString().slice(0, 10); };

/** Resumen de un mes calendario (comparado con el mes anterior). Hasta `hoy` si el mes está en curso. */
export const resumenMes = (db: Db, mes: string, hoy = hoyUruguay()) => {
  const prev = mesAnterior(mes);
  const fin = finDeMes(mes);
  return resumenRango(db, `${mes}-01`, fin < hoy ? fin : hoy, `${prev}-01`, finDeMes(prev));
};

export interface MesArchivado { mes: string; resumen: Resumen; archivadoEn: string }

/**
 * Guarda el resumen de cada mes ya terminado que todavía no está archivado. Es seguro repetirlo: no pisa los
 * guardados. Lo llama el Cron del día 1 y, por si el Cron falla, también la pantalla de Estadísticas.
 */
export async function archivarMeses(db: Db, hoy = hoyUruguay()): Promise<string[]> {
  const actual = hoy.slice(0, 7);
  const conDatos = await todas<{ mes: string }>(db, "SELECT DISTINCT substr(fecha, 1, 7) mes FROM estadisticas_dia WHERE tipo = 'vistas' AND substr(fecha, 1, 7) < ?", [actual]);
  const hechos = new Set((await todas<{ mes: string }>(db, 'SELECT mes FROM estadisticas_mes')).map((f) => f.mes));
  const nuevos: string[] = [];
  for (const { mes } of conDatos) {
    if (hechos.has(mes) || !mesValido(mes)) continue;
    const r = await resumenMes(db, mes, hoy);
    await ejecutar(db, 'INSERT INTO estadisticas_mes (mes, resumen, archivado_en) VALUES (?, ?, ?) ON CONFLICT (mes) DO NOTHING', [mes, JSON.stringify(r), new Date().toISOString()]);
    nuevos.push(mes);
  }
  return nuevos;
}

export async function listarMeses(db: Db): Promise<MesArchivado[]> {
  const filas = await todas<{ mes: string; resumen: string; archivado_en: string }>(db, 'SELECT mes, resumen, archivado_en FROM estadisticas_mes ORDER BY mes DESC');
  return filas.flatMap((f) => { try { return [{ mes: f.mes, resumen: JSON.parse(f.resumen) as Resumen, archivadoEn: f.archivado_en }]; } catch { return []; } });
}

export async function mesArchivado(db: Db, mes: string): Promise<MesArchivado | null> {
  const f = await una<{ mes: string; resumen: string; archivado_en: string }>(db, 'SELECT mes, resumen, archivado_en FROM estadisticas_mes WHERE mes = ?', [mes]);
  if (!f) return null;
  try { return { mes: f.mes, resumen: JSON.parse(f.resumen) as Resumen, archivadoEn: f.archivado_en }; } catch { return null; }
}

/** CSV de un mes (días y rankings), con coma y comillas, para abrir en Excel o Google Sheets. */
export function csvMes(mes: string, r: Resumen): string {
  const q = (v: string | number) => (/[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const fila = (...c: (string | number)[]) => c.map(q).join(',');
  const lineas = [fila(`Estadísticas de la web · ${nombreMes(mes)}`), '', fila('Día', 'Vistas', 'Visitantes', 'Clics a WhatsApp'), ...r.dias.map((d) => fila(d.fecha, d.vistas, d.visitantes, d.whatsapp)),
    fila('Total', r.totales.vistas, r.totales.visitantes, r.totales.whatsapp), '', fila('Vistas desde celular', r.totales.celular), fila('Vistas desde computadora', r.totales.computadora)];
  const nombres: Record<string, string> = { pagina: 'Páginas más vistas', origen: 'De dónde llegan', producto: 'Productos más consultados por WhatsApp', whatsapp_pagina: 'Páginas desde donde escriben por WhatsApp', banner: 'Clics en el banner de Inicio', visor: 'Imágenes ampliadas' };
  for (const [k, titulo] of Object.entries(nombres)) {
    lineas.push('', fila(titulo, 'Cantidad'));
    for (const x of r.ranking[k as keyof Resumen['ranking']]) lineas.push(fila(k === 'pagina' || k === 'whatsapp_pagina' || k === 'visor' ? nombreRuta(x.clave) : x.clave, x.valor));
  }
  return `\ufeff${lineas.join('\r\n')}\r\n`;
}

/** Nombre legible de una sección del sitio. */
export const NOMBRES_RUTA: Record<string, string> = {
  '/': 'Inicio', '/sobre-nosotros/': 'Sobre nosotros', '/sobre-nosotros/locales/': 'Locales', '/sobre-nosotros/nuestra-historia/': 'Nuestra historia',
  '/beneficios/': 'Beneficios', '/beneficios/convenios/': 'Convenios', '/beneficios/servicios-sociales/': 'Servicios sociales',
  '/hipermercado/': 'Hipermercado', '/hipermercado/bazar/': 'Bazar', '/hipermercado/tienda/': 'Tienda', '/hipermercado/promociones/': 'Promociones',
  '/hacete-socio/': 'Hacete socio', '/contacto/': 'Contacto', '/acceso-web/': 'Acceso web', '/portal-empleados/': 'Portal de empleados', '/otras/': 'Otras direcciones',
};
export const nombreRuta = (r: string) => NOMBRES_RUTA[r] ?? (r.startsWith('/beneficios/servicios-sociales/') ? `Servicio: ${r.split('/')[3]}` : r);
