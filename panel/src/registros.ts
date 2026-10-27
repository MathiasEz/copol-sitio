// Registros: guarda cada registro cargado desde el formulario en la hoja de Google Sheets (una pestaña por mes)
// y deja constancia en la base del panel (quién, cuándo y dónde quedó). Sin hoja conectada, la base ES la
// planilla ("modo de prueba"): se ve en el panel y se descarga como .xlsx.
// Privacidad: con la hoja conectada, la base guarda solo un resumen (sin cédula, dirección, service ni
// información adicional); esos datos viven únicamente en la hoja de la cooperativa.
import { ejecutar, todas, una, type Db } from './db.ts';
import { COLUMNAS, fechaMontevideo, filaPlanilla, formulaEnlace, type DatosRegistro } from './registros-campos.ts';
import * as google from './registros-google.ts';
import { ErrorPlanilla } from './registros-planilla-error.ts';
import { colorDe, rgbSheets } from './colores.ts';
import { libroXlsx, type Valor } from './registros-xlsx.ts';

export { ErrorPlanilla };
export const MAX_FILAS_PRUEBA = 5000;
export const MAX_LISTA = 300;

export type Modo = 'google' | 'prueba';
/** 'google' si la hoja está conectada; si no, 'prueba' (la base hace de planilla). */
export const modo = (): Modo => (google.googleConfigurado() ? 'google' : 'prueba');

export interface EstadoPlanilla { modo: Modo; listo: boolean; aviso?: string; nombre?: string; pestana?: string; enlace?: string; cuenta?: string | null }

/** Estado para la pantalla: si se puede guardar, en qué hoja y el enlace para abrirla. */
export async function estado(): Promise<EstadoPlanilla> {
  if (modo() === 'prueba') {
    return { modo: 'prueba', listo: true, aviso: 'Modo de prueba: los registros se guardan en la planilla de prueba del panel (en «Planilla»), que se puede descargar como Excel. Cuando se conecte la hoja de Google (variables GOOGLE_CREDENCIALES y GOOGLE_HOJA en Vercel), se guardarán allí.' };
  }
  try {
    const h = await google.asegurarHoja();
    return { modo: 'google', listo: true, nombre: h.titulo, pestana: h.pestana, enlace: google.enlaceHoja(), cuenta: google.correoCuenta() };
  } catch (e) {
    return { modo: 'google', listo: false, aviso: (e as Error).message };
  }
}

export interface Registro {
  id: number; fecha: string; nombre: string; socio: string; producto: string; codigo: string; flete: string;
  cedula: string | null; direccion: string | null; mapa: string | null; service: string | null; adicional: string | null;
  usuario_id: number | null; cargado_por: string; destino: string;
}

/** Guarda el registro: primero en la hoja (si está conectada) y, si salió bien, la constancia en la base. */
export async function agregar(db: Db, datos: DatosRegistro, quien: { id: number | null; nombre: string; color?: string | null }, cuando = new Date()) {
  const m = modo();
  let destino = 'Planilla de prueba';
  let fecha = fechaMontevideo(cuando);
  if (m === 'google') {
    // La pestaña es la del mes de este momento (hora de Montevideo): al cambiar el mes se pasa sola a la siguiente.
    const { separador } = await google.asegurarHoja(cuando);
    const fila = filaPlanilla(datos, quien.nombre, cuando, separador);
    const c = colorDe(quien.color);
    await google.agregarFila(fila, cuando, c && { fondo: rgbSheets(c.fondo), texto: rgbSheets(c.texto) });
    fecha = fila[0];
    destino = `Google Sheets · ${google.pestanaDe(cuando)}`;
  } else if (Number((await una<{ n: number }>(db, 'SELECT COUNT(*) n FROM registros'))?.n ?? 0) >= MAX_FILAS_PRUEBA) {
    throw new ErrorPlanilla(`La planilla de prueba llegó al máximo de ${MAX_FILAS_PRUEBA} registros. Descargala y conectá la hoja de Google.`, { status: 409 });
  }
  const completo = m === 'prueba';
  const r = await ejecutar(db, 'INSERT INTO registros (fecha, nombre, socio, producto, codigo, flete, cedula, direccion, mapa, service, adicional, usuario_id, cargado_por, destino) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    fecha, datos.nombre, datos.socio, datos.producto, datos.codigo, datos.flete,
    completo ? datos.cedula : null, completo ? datos.direccion : null, completo ? datos.mapa || null : null, completo ? datos.service || null : null, completo ? datos.adicional || null : null,
    quien.id, quien.nombre, destino,
  ]);
  return { id: r.id!, fecha, destino };
}

/** Últimos registros (más nuevos primero). */
export const listar = (db: Db, limite = MAX_LISTA) => todas<Registro>(db, 'SELECT * FROM registros ORDER BY id DESC LIMIT ?', [limite]);
export const contar = async (db: Db) => Number((await una<{ n: number }>(db, 'SELECT COUNT(*) n FROM registros'))?.n ?? 0);
/**
 * Con la hoja conectada, la planilla del panel es la hoja misma: se lee en el momento (lo que se borre en Google
 * deja de verse acá). Solo se muestran las columnas del resumen; los datos personales quedan en la hoja.
 */
export async function listarHoja(pestana?: string) {
  const l = await google.leerPestana(pestana, MAX_LISTA);
  const registros: Registro[] = l.filas.map(({ fila, celdas: c }) => ({
    id: fila, fecha: c[0], nombre: c[1], socio: c[2], producto: c[7], codigo: c[8], flete: c[6],
    cedula: null, direccion: null, mapa: null, service: null, adicional: null,
    usuario_id: null, cargado_por: c[9], destino: `Fila ${fila} de la hoja`,
  }));
  return { registros, total: l.total, pestana: l.pestana, pestanas: l.pestanas };
}
export const vaciar = (db: Db) => ejecutar(db, 'DELETE FROM registros');

/** La dirección como enlace clicable a Google Maps (si se eligió la ubicación) o como texto. */
const enlazar = (r: Registro): Valor => {
  const formula = formulaEnlace(r.mapa, r.direccion);
  return formula ? { formula, texto: r.direccion ?? '', estilo: 2 } : (r.direccion ?? '');
};

/** La planilla de prueba como .xlsx, con las mismas columnas que la hoja de Google. */
export function xlsxPrueba(registros: Registro[]) {
  const filas: Valor[][] = registros.map((r) => [
    r.fecha, r.nombre, /^[1-9]\d{0,14}$/.test(r.socio) ? Number(r.socio) : r.socio, r.cedula ?? '', enlazar(r),
    r.service ?? '', r.flete, r.producto, r.codigo, r.cargado_por, r.adicional ?? '',
  ]);
  return libroXlsx({ hoja: 'Registros', columnas: COLUMNAS, filas, anchos: [17, 28, 12, 13, 36, 26, 8, 34, 15, 18, 40] });
}
