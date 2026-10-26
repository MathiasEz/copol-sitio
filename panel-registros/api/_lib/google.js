// Escritura en una hoja de Google Sheets con una «cuenta de servicio» (sin librerías): el panel firma un JWT con
// la clave de la cuenta de servicio, lo cambia por un token y agrega filas con la API de Sheets. La cuenta de
// servicio solo ve las hojas que se le compartieron (solo esta), y no hay inicio de sesión de ninguna persona.
// Gratis y sin tarjeta. Variables: GOOGLE_CREDENCIALES (el JSON de la clave) o GOOGLE_CLIENT_EMAIL +
// GOOGLE_PRIVATE_KEY, y GOOGLE_HOJA (el enlace o el ID de la hoja). Pestaña: GOOGLE_PESTANA (Registros).
import { createSign } from 'node:crypto';
import { COLUMNAS } from './campos.js';
import { ErrorPlanilla } from './microsoft.js';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const ALCANCE = 'https://www.googleapis.com/auth/spreadsheets';

let pedir = (...a) => fetch(...a);
/** Solo para las pruebas. */
export function usarFetch(f) {
  pedir = f;
  token = null;
  hojaLista = null;
}

const env = () => process.env;

/** { email, clave } de la cuenta de servicio, o null. */
function credenciales() {
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
export const pestana = () => (env().GOOGLE_PESTANA || 'Registros').slice(0, 90);
export const enlaceHoja = () => `https://docs.google.com/spreadsheets/d/${idHoja()}/edit`;
export const correoCuenta = () => credenciales()?.email ?? null;

// ── Token ──
let token = null; // { valor, vence }
const b64 = (x) => Buffer.from(x).toString('base64url');

async function tokenAcceso() {
  if (token && token.vence > Date.now() + 60_000) return token.valor;
  const c = credenciales();
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

const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function api(camino, { metodo = 'GET', cuerpo } = {}) {
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
      const e = new Error(`Sheets ${metodo} ${camino.split('?')[0]} → ${res.status} ${datos.error?.status ?? ''}: ${(datos.error?.message ?? '').slice(0, 200)}`);
      e.status = res.status;
      throw e;
    }
    return datos;
  }
}

function traducir(e) {
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
let hojaLista = null; // { id, titulo }
const letra = (n) => String.fromCharCode(64 + n);
const rangoPestana = (r) => `'${pestana().replace(/'/g, "''")}'!${r}`;

/** Título del archivo; crea la pestaña con su cabecera la primera vez. */
export async function asegurarHoja() {
  if (hojaLista && hojaLista.pestana === pestana()) return hojaLista;
  try {
    const meta = await api('?fields=properties.title,sheets.properties(sheetId,title)');
    let hoja = meta.sheets?.find((s) => s.properties.title === pestana());
    if (!hoja) {
      const r = await api(':batchUpdate', { metodo: 'POST', cuerpo: { requests: [{ addSheet: { properties: { title: pestana() } } }] } });
      hoja = { properties: r.replies[0].addSheet.properties };
    }
    const cab = await api(`/values/${encodeURIComponent(rangoPestana(`A1:${letra(COLUMNAS.length)}1`))}`);
    const filas = cab.values ?? [];
    if (!filas.length || filas[0].every((c) => !c)) {
      await api(`/values/${encodeURIComponent(rangoPestana(`A1:${letra(COLUMNAS.length)}1`))}?valueInputOption=RAW`, { metodo: 'PUT', cuerpo: { values: [COLUMNAS] } });
      await api(':batchUpdate', { metodo: 'POST', cuerpo: { requests: [
        { repeatCell: { range: { sheetId: hoja.properties.sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: { red: 0, green: 0.4, blue: 0.2 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
        { updateSheetProperties: { properties: { sheetId: hoja.properties.sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
        { setBasicFilter: { filter: { range: { sheetId: hoja.properties.sheetId, startRowIndex: 0 } } } },
      ] } }).catch(() => {}); // el formato es un detalle: si falla, se guarda igual
    } else if (filas[0].length !== COLUMNAS.length || filas[0].some((c, i) => c !== COLUMNAS[i])) {
      throw new ErrorPlanilla(`La pestaña «${pestana()}» de la hoja tiene otras columnas en la fila 1. Tienen que ser: ${COLUMNAS.join(', ')}. Usá otra pestaña (GOOGLE_PESTANA) o dejala vacía.`, { status: 409 });
    }
    hojaLista = { id: idHoja(), titulo: meta.properties.title, pestana: pestana() };
    return hojaLista;
  } catch (e) {
    throw traducir(e);
  }
}

/** Texto para USER_ENTERED: lo numérico con ceros adelante (cédulas, códigos) se guarda como texto. */
const comoTexto = (v, i) => (i > 0 && typeof v === 'string' && /^0\d+$/.test(v) ? `'${v}` : v);

/** Agrega la fila al final de la pestaña. */
export async function agregarFila(fila) {
  await asegurarHoja();
  try {
    await api(`/values/${encodeURIComponent(rangoPestana(`A:${letra(COLUMNAS.length)}`))}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      metodo: 'POST', cuerpo: { values: [fila.map(comoTexto)] },
    });
  } catch (e) {
    throw traducir(e);
  }
}
