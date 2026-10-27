// Escritura en una hoja de Google Sheets con una «cuenta de servicio» (sin librerías): el panel firma un JWT con
// la clave de la cuenta de servicio, lo cambia por un token y agrega filas con la API de Sheets. La cuenta de
// servicio solo ve las hojas que se le compartieron (solo esta), y no hay inicio de sesión de ninguna persona.
// Gratis y sin tarjeta. Variables: GOOGLE_CREDENCIALES (el JSON de la clave) o GOOGLE_CLIENT_EMAIL +
// GOOGLE_PRIVATE_KEY, y GOOGLE_HOJA (el enlace o el ID de la hoja). Una pestaña por mes.
import { createSign } from 'node:crypto';
import { COLUMNAS, nombreMes } from './registros-campos.ts';
import { ErrorPlanilla } from './registros-planilla-error.ts';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const ALCANCE = 'https://www.googleapis.com/auth/spreadsheets';

let pedir: typeof fetch = (...a) => fetch(...a);
/** Solo para las pruebas. */
export function usarFetch(f: typeof fetch) {
  pedir = f;
  token = null;
  hojas.clear();
}

const env = () => process.env;

/** { email, clave } de la cuenta de servicio, o null. */
function credenciales(): { email: string; clave: string } | null {
  const e = env();
  try {
    if (e.GOOGLE_CREDENCIALES) {
      const j = JSON.parse(e.GOOGLE_CREDENCIALES);
      if (j.client_email && j.private_key) return { email: j.client_email, clave: j.private_key };
    }
  } catch { /* se prueba con las otras variables */ }
  if (e.GOOGLE_CLIENT_EMAIL && e.GOOGLE_PRIVATE_KEY) return { email: e.GOOGLE_CLIENT_EMAIL, clave: e.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n') };
  return null;
}

/** ID de la hoja a partir del enlace (docs.google.com/spreadsheets/d/ID/edit…) o del ID suelto. */
export function idHoja() {
  const v = (env().GOOGLE_HOJA || '').trim();
  const m = v.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(v) ? v : null;
}

export const googleConfigurado = () => Boolean(credenciales() && idHoja());
/** Una pestaña por mes («Octubre 2026»): el panel pasa a la siguiente solo al cambiar el mes (hora de Montevideo). */
export const pestanaDe = (fecha = new Date()) => nombreMes(fecha);
export const enlaceHoja = () => `https://docs.google.com/spreadsheets/d/${idHoja()}/edit`;
export const correoCuenta = () => credenciales()?.email ?? null;

// ── Token ──
let token: { valor: string; vence: number } | null = null;
const b64 = (x: string) => Buffer.from(x).toString('base64url');

async function tokenAcceso(): Promise<string> {
  if (token && token.vence > Date.now() + 60_000) return token.valor;
  const c = credenciales()!;
  const ahora = Math.floor(Date.now() / 1000);
  const cuerpo = `${b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64(JSON.stringify({ iss: c.email, scope: ALCANCE, aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3300 }))}`;
  let firma;
  try {
    firma = createSign('RSA-SHA256').update(cuerpo).sign(c.clave).toString('base64url');
  } catch {
    throw new ErrorPlanilla('La clave de la cuenta de Google (GOOGLE_CREDENCIALES) no es válida. Volvé a copiar el archivo JSON completo.', { status: 503 });
  }
  const res = await pedir('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${cuerpo}.${firma}` }),
    signal: AbortSignal.timeout(10_000),
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`google: token ${res.status} ${datos.error ?? ''} ${(datos.error_description ?? '').slice(0, 200)}`);
    throw new ErrorPlanilla('Google rechazó la cuenta de servicio. Revisá GOOGLE_CREDENCIALES (puede haberse borrado la clave).', { status: 503 });
  }
  token = { valor: datos.access_token, vence: Date.now() + (datos.expires_in ?? 3600) * 1000 };
  return token.valor;
}

const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

type Json = any; // respuestas de la API de Sheets (solo se leen los campos que se usan)
async function api(camino: string, { metodo = 'GET', cuerpo }: { metodo?: string; cuerpo?: unknown } = {}): Promise<Json> {
  const t = await tokenAcceso();
  for (let intento = 0; ; intento++) {
    const res = await pedir(`${SHEETS}/${idHoja()}${camino}`, {
      method: metodo,
      headers: { authorization: `Bearer ${t}`, ...(cuerpo ? { 'content-type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if ([429, 500, 503].includes(res.status) && intento < 3) {
      await espera(Math.min(Number(res.headers.get('retry-after')) || 1 + intento, 5) * 1000);
      continue;
    }
    const datos = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e: Error & { status?: number } = new Error(`Sheets ${metodo} ${camino.split('?')[0]} → ${res.status} ${datos.error?.status ?? ''}: ${(datos.error?.message ?? '').slice(0, 200)}`);
      e.status = res.status;
      throw e;
    }
    return datos;
  }
}

function traducir(e: Error & { status?: number }): ErrorPlanilla {
  if (e instanceof ErrorPlanilla) return e;
  console.error(`google: ${e.message}`);
  if (e.status === 403 || e.status === 404) {
    return new ErrorPlanilla(`El panel no puede abrir la hoja de Google. Compartila con ${correoCuenta()} como «Editor» y revisá GOOGLE_HOJA.`, { status: 503 });
  }
  if (e.status === 401) {
    token = null;
    return new ErrorPlanilla('Google no aceptó la cuenta de servicio. Probá de nuevo; si sigue, revisá GOOGLE_CREDENCIALES.', { status: 503 });
  }
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return new ErrorPlanilla('Google tardó demasiado en responder. Probá de nuevo; si la fila aparece duplicada, borrá una.', { status: 504 });
  return new ErrorPlanilla('Google Sheets no respondió como se esperaba. Probá de nuevo en un momento.');
}

// ── Hoja y pestaña ──
interface InfoHoja { id: string | null; titulo: string; pestana: string; separador: string; sheetId: number }
const hojas = new Map<string, InfoHoja>();
const letra = (n: number) => String.fromCharCode(64 + n);
const rangoPestana = (pest: string, r: string) => `'${pest.replace(/'/g, "''")}'!${r}`;

/**
 * Separador de argumentos de las fórmulas: Google Sheets interpreta lo que se escribe con la configuración
 * regional de la hoja; donde el decimal es una coma (es_UY, es_AR, pt_BR…) los argumentos se separan con «;».
 */
export function separadorDe(locale: unknown) {
  try {
    return new Intl.NumberFormat(String(locale || 'en_US').replace('_', '-')).format(1.5).includes(',') ? ';' : ',';
  } catch {
    return ',';
  }
}

/** Título del archivo y pestaña del mes de `fecha`; crea la pestaña con su cabecera la primera vez que se usa. */
export async function asegurarHoja(fecha = new Date()): Promise<InfoHoja> {
  const pest = pestanaDe(fecha);
  if (hojas.has(pest)) return hojas.get(pest)!;
  try {
    const leerMeta = () => api('?fields=properties(title,locale),sheets.properties(sheetId,title)');
    let meta = await leerMeta();
    let hoja = meta.sheets?.find((s: Json) => s.properties.title === pest);
    if (!hoja) {
      try {
        const r = await api(':batchUpdate', { metodo: 'POST', cuerpo: { requests: [{ addSheet: { properties: { title: pest } } }] } });
        hoja = { properties: r.replies[0].addSheet.properties };
      } catch (e) {
        // Otra computadora la acaba de crear (el primer registro del mes llegó al mismo tiempo): se usa esa.
        meta = await leerMeta();
        hoja = meta.sheets?.find((s: Json) => s.properties.title === pest);
        if (!hoja) throw e;
      }
    }
    const rangoCab = rangoPestana(pest, `A1:${letra(COLUMNAS.length)}1`);
    const cab = await api(`/values/${encodeURIComponent(rangoCab)}`);
    const filas = cab.values ?? [];
    const antigua = filas.length && filas[0].length < COLUMNAS.length && filas[0].every((c: string, i: number) => c === COLUMNAS[i]);
    if (!filas.length || filas[0].every((c: string) => !c) || antigua) {
      await api(`/values/${encodeURIComponent(rangoCab)}?valueInputOption=RAW`, { metodo: 'PUT', cuerpo: { values: [COLUMNAS] } });
      await api(':batchUpdate', { metodo: 'POST', cuerpo: { requests: [
        { repeatCell: { range: { sheetId: hoja.properties.sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 0, green: 0.4, blue: 0.2 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
        { updateSheetProperties: { properties: { sheetId: hoja.properties.sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
        { setBasicFilter: { filter: { range: { sheetId: hoja.properties.sheetId, startRowIndex: 0 } } } },
      ] } }).catch(() => {}); // el formato es un detalle: si falla, se guarda igual
    } else if (filas[0].length !== COLUMNAS.length || filas[0].some((c: string, i: number) => c !== COLUMNAS[i])) {
      throw new ErrorPlanilla(`La pestaña «${pest}» de la hoja tiene otras columnas en la fila 1. Tienen que ser: ${COLUMNAS.join(', ')}. Renombrala o vaciala y el panel la vuelve a preparar.`, { status: 409 });
    }
    // La fecha se guarda como fecha y hora de verdad (se puede ordenar y filtrar): la columna A se muestra con ese
    // formato, también en las filas que ya estaban. Si falla, no importa: el dato queda igual.
    await api(':batchUpdate', { metodo: 'POST', cuerpo: { requests: [
      { repeatCell: { range: { sheetId: hoja.properties.sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { numberFormat: { type: 'DATE_TIME', pattern: 'dd/mm/yyyy hh:mm' } } }, fields: 'userEnteredFormat.numberFormat' } },
    ] } }).catch(() => {});
    const info = { id: idHoja(), titulo: meta.properties.title, pestana: pest, separador: separadorDe(meta.properties.locale), sheetId: hoja.properties.sheetId };
    hojas.set(pest, info);
    return info;
  } catch (e) {
    throw traducir(e as Error);
  }
}

/** Texto para USER_ENTERED: lo numérico con ceros adelante (cédulas, códigos) se guarda como texto. */
const comoTexto = (v: string, i: number) => (i > 0 && typeof v === 'string' && /^0\d+$/.test(v) ? `'${v}` : v);

/** Color de la celda «Cargado por» de una fila nueva (componentes 0 a 1 de la API de Sheets). */
export interface ColorCelda { fondo: { red: number; green: number; blue: number }; texto: { red: number; green: number; blue: number } }

/** Agrega la fila al final de la pestaña del mes de `fecha`. Si se pasa `color`, pinta la celda de «Cargado por». */
export async function agregarFila(fila: string[], fecha = new Date(), color?: ColorCelda | null) {
  const { pestana: pest, sheetId } = await asegurarHoja(fecha);
  try {
    const r = await api(`/values/${encodeURIComponent(rangoPestana(pest, `A:${letra(COLUMNAS.length)}`))}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      metodo: 'POST', cuerpo: { values: [fila.map(comoTexto)] },
    });
    const numero = Number(String(r?.updates?.updatedRange ?? '').match(/!?[A-Z]+(\d+)(?::[A-Z]+\d+)?$/)?.[1]);
    if (color && numero > 1) {
      // El color es un detalle: si falla, la fila ya quedó guardada.
      const col = COLUMNAS.indexOf('Cargado por');
      await api(':batchUpdate', { metodo: 'POST', cuerpo: { requests: [
        { repeatCell: { range: { sheetId, startRowIndex: numero - 1, endRowIndex: numero, startColumnIndex: col, endColumnIndex: col + 1 }, cell: { userEnteredFormat: { backgroundColor: color.fondo, textFormat: { bold: true, foregroundColor: color.texto } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
      ] } }).catch(() => {});
    }
  } catch (e) {
    throw traducir(e as Error);
  }
}

export interface FilaLeida { fila: number; celdas: string[] }
export interface LecturaHoja { pestana: string; pestanas: string[]; filas: FilaLeida[]; total: number }

/**
 * Lee lo que hay HOY en la hoja (lo que se borre o cambie en Google se refleja acá): los últimos `limite`
 * registros de la pestaña pedida (por defecto la del mes), el más nuevo primero. No crea pestañas.
 */
export async function leerPestana(pedida?: string, limite = 300): Promise<LecturaHoja> {
  try {
    const meta = await api('?fields=properties(title,locale),sheets.properties(sheetId,title)');
    const pestanas: string[] = (meta.sheets ?? []).map((s: Json) => String(s.properties.title));
    const pestana = pedida && pestanas.includes(pedida) ? pedida : pestanaDe();
    if (!pestanas.includes(pestana)) return { pestana, pestanas, filas: [], total: 0 };
    const datos = await api(`/values/${encodeURIComponent(rangoPestana(pestana, `A2:${letra(COLUMNAS.length)}`))}?valueRenderOption=FORMATTED_VALUE`);
    const filas: FilaLeida[] = ((datos.values ?? []) as unknown[][])
      .map((v, i) => ({ fila: i + 2, celdas: COLUMNAS.map((_, k) => String(v[k] ?? '')) }))
      .filter((f) => f.celdas.some((c) => c.trim()));
    return { pestana, pestanas, filas: filas.slice(-limite).reverse(), total: filas.length };
  } catch (e) {
    throw traducir(e as Error);
  }
}
