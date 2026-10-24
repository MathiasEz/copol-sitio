// Escritura en la planilla de Excel guardada en OneDrive / SharePoint, con Microsoft Graph (sin librerías).
//
// Dos formas de conectarse (ver README):
// - Modo «cuenta» (MS_CUENTA): una persona inicia sesión una vez con la cuenta de Microsoft dueña del archivo
//   (personal u organizacional) desde el panel. Microsoft entrega un permiso renovable que se guarda en el almacén del panel.
//   Solo se acepta la cuenta indicada en MS_CUENTA y el permiso alcanza a los archivos de esa cuenta.
// - Modo «aplicación» (MS_USUARIO, solo Microsoft 365 empresa): la aplicación de Entra ID entra con su propio
//   secreto, sin inicio de sesión, al OneDrive de MS_USUARIO. Requiere el permiso Files.ReadWrite.All
//   aprobado por un administrador de Microsoft 365 (alcanza a todo el OneDrive de la organización).
//
// Si la tabla no existe, se crea sola en una hoja nueva del archivo; nunca se tocan las otras hojas.
import { COLUMNAS } from './campos.js';
import * as almacen from './almacen.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';
export const ALCANCE_CUENTA = 'offline_access openid email profile User.Read Files.ReadWrite';

export class ErrorPlanilla extends Error {
  constructor(mensaje, { reconectar = false, status = 502 } = {}) {
    super(mensaje);
    this.reconectar = reconectar;
    this.status = status;
  }
}

let pedir = (...a) => fetch(...a);
/** Solo para las pruebas. */
export function usarFetch(f) {
  pedir = f;
  cacheToken = null;
  cacheArchivo = null;
}

const env = () => process.env;
const ruta = () => (env().EXCEL_RUTA || 'Registros COPOL.xlsx').replace(/^\/+|\/+$/g, '');
export const nombreTabla = () => env().EXCEL_TABLA || 'Registros';
const tenant = () => env().MS_TENANT || 'common';

/** 'aplicacion' | 'cuenta' | null según las variables cargadas. */
export function modoMicrosoft() {
  const e = env();
  if (!e.MS_CLIENT_ID || !e.MS_CLIENT_SECRET) return null;
  if (e.MS_USUARIO) return 'aplicacion';
  if (e.MS_CUENTA) return 'cuenta';
  return null;
}

/** Problema de configuración que impide usar Excel, o null. */
export function faltaConfigurar() {
  const modo = modoMicrosoft();
  if (modo === 'aplicacion' && ['common', 'organizations', 'consumers'].includes(tenant())) return 'En el modo aplicación, MS_TENANT tiene que ser el ID del inquilino (Directory/tenant ID) de Microsoft 365.';
  if (modo === 'cuenta' && !almacen.almacenConfigurado()) return 'Falta conectar el almacén del panel (Vercel → Storage → Blob privado): ahí se guarda la conexión con la cuenta de Microsoft.';
  return null;
}

// ── Permisos (tokens) ──

let cacheToken = null; // { valor, vence }

async function pedirToken(parametros) {
  const res = await pedir(`https://login.microsoftonline.com/${encodeURIComponent(tenant())}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env().MS_CLIENT_ID, client_secret: env().MS_CLIENT_SECRET, ...parametros }),
    signal: AbortSignal.timeout(10_000),
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`microsoft: token ${res.status} ${datos.error ?? ''} ${(datos.error_description ?? '').slice(0, 200)}`);
    const e = new ErrorPlanilla(
      datos.error === 'invalid_client' ? 'Microsoft rechazó la aplicación: revisá MS_CLIENT_ID y MS_CLIENT_SECRET (el secreto vence; puede haber que crear uno nuevo).'
      : datos.error === 'invalid_grant' ? 'La conexión con la cuenta de Microsoft venció o se revocó. Hay que volver a conectarla.'
      : 'No se pudo obtener permiso de Microsoft. Probá de nuevo en un momento.',
      { reconectar: datos.error === 'invalid_grant' },
    );
    e.codigo = datos.error;
    throw e;
  }
  return datos;
}

async function tokenAcceso() {
  if (cacheToken && cacheToken.vence > Date.now() + 60_000) return cacheToken.valor;
  const modo = modoMicrosoft();
  if (modo === 'aplicacion') {
    const t = await pedirToken({ grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' });
    cacheToken = { valor: t.access_token, vence: Date.now() + (t.expires_in ?? 3600) * 1000 };
    return t.access_token;
  }
  // Modo cuenta: primero el token vigente guardado por otra instancia; si no, se renueva.
  const guardado = await almacen.leer('ms:acceso');
  if (guardado) {
    try {
      const g = JSON.parse(guardado);
      if (g.vence > Date.now() + 60_000) {
        cacheToken = g;
        return g.valor;
      }
    } catch { /* se renueva */ }
  }
  const renovacion = await almacen.leer('ms:renovacion');
  if (!renovacion) throw new ErrorPlanilla('Falta conectar la cuenta de Microsoft dueña de la planilla.', { reconectar: true, status: 503 });
  let t;
  try {
    t = await pedirToken({ grant_type: 'refresh_token', refresh_token: renovacion, scope: ALCANCE_CUENTA });
  } catch (e) {
    if (e.codigo === 'invalid_grant') await desconectar();
    throw e;
  }
  await guardarTokens(t);
  return t.access_token;
}

async function guardarTokens(t) {
  cacheToken = { valor: t.access_token, vence: Date.now() + (t.expires_in ?? 3600) * 1000 };
  // Microsoft entrega un permiso de renovación nuevo cada vez: se guarda para que la conexión no venza
  // mientras el panel se use (vence a los 90 días sin uso).
  if (t.refresh_token) await almacen.guardar('ms:renovacion', t.refresh_token);
  await almacen.guardar('ms:acceso', JSON.stringify(cacheToken), Math.max(60, (t.expires_in ?? 3600) - 120));
}

export async function desconectar() {
  cacheToken = null;
  cacheArchivo = null;
  await almacen.borrar('ms:renovacion');
  await almacen.borrar('ms:acceso');
  await almacen.borrar('ms:cuenta');
}

/** Cuenta conectada en el modo cuenta (correo), o null. */
export async function cuentaConectada() {
  if (modoMicrosoft() !== 'cuenta' || !almacen.almacenConfigurado()) return null;
  return (await almacen.leer('ms:cuenta')) || null;
}

// ── Inicio de sesión con Microsoft (modo cuenta) ──

/** Dirección a la que vuelve Microsoft (dentro de la dirección secreta del panel); tiene que estar registrada
 *  tal cual en la aplicación de Entra ID. */
export function redireccion(request, base) {
  if (env().MS_REDIRECT_URI) return env().MS_REDIRECT_URI;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host;
  const protocolo = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? 'http' : 'https';
  return `${protocolo}://${host}${base}/api/microsoft/vuelta`;
}

export function urlAutorizacion({ redireccion, estado, desafio }) {
  const p = new URLSearchParams({
    client_id: env().MS_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redireccion,
    response_mode: 'query',
    scope: ALCANCE_CUENTA,
    state: estado,
    code_challenge: desafio,
    code_challenge_method: 'S256',
    login_hint: env().MS_CUENTA ?? '',
    prompt: 'select_account',
  });
  return `https://login.microsoftonline.com/${encodeURIComponent(tenant())}/oauth2/v2.0/authorize?${p}`;
}

/** Canjea el código de Microsoft, comprueba que sea la cuenta de MS_CUENTA y guarda la conexión. */
export async function completarConexion({ codigo, redireccion, verificador }) {
  const t = await pedirToken({ grant_type: 'authorization_code', code: codigo, redirect_uri: redireccion, code_verifier: verificador, scope: ALCANCE_CUENTA });
  const res = await pedir(`${GRAPH}/me?$select=userPrincipalName,mail`, { headers: { authorization: `Bearer ${t.access_token}` }, signal: AbortSignal.timeout(10_000) });
  const yo = await res.json().catch(() => ({}));
  const correos = [yo.userPrincipalName, yo.mail].filter(Boolean).map((c) => c.toLowerCase());
  const esperada = env().MS_CUENTA.trim().toLowerCase();
  if (!correos.includes(esperada)) {
    throw new ErrorPlanilla(`Se inició sesión con ${correos[0] ?? 'otra cuenta'}, pero la planilla es de ${env().MS_CUENTA}. Volvé a conectar eligiendo esa cuenta.`, { status: 403 });
  }
  cacheArchivo = null;
  await guardarTokens(t);
  await almacen.guardar('ms:cuenta', esperada);
  return esperada;
}

// ── Microsoft Graph ──

const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function graph(camino, { metodo = 'GET', cuerpo } = {}) {
  const token = await tokenAcceso();
  for (let intento = 0; ; intento++) {
    const res = await pedir(`${GRAPH}${camino}`, {
      method: metodo,
      headers: { authorization: `Bearer ${token}`, ...(cuerpo ? { 'content-type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    // Excel puede estar ocupado si otra computadora guarda al mismo tiempo: se reintenta.
    if ([409, 429, 503, 504].includes(res.status) && intento < 3) {
      const segundos = Number(res.headers.get('retry-after')) || 1 + intento;
      await espera(Math.min(segundos, 5) * 1000);
      continue;
    }
    const datos = res.status === 204 ? {} : await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(`Graph ${metodo} ${camino.split('?')[0]} → ${res.status} ${datos.error?.code ?? ''}: ${(datos.error?.message ?? '').slice(0, 200)}`);
      e.status = res.status;
      e.codigo = datos.error?.code ?? '';
      throw e;
    }
    return datos;
  }
}

const unidad = () => (modoMicrosoft() === 'aplicacion' ? `/users/${encodeURIComponent(env().MS_USUARIO)}/drive` : '/me/drive');
const archivo = () => `${unidad()}/root:/${ruta().split('/').map(encodeURIComponent).join('/')}:`;
const libro = () => `${archivo()}/workbook`;
const comillas = (s) => s.replace(/'/g, "''");
const letra = (n) => String.fromCharCode(64 + n);

let cacheArchivo = null; // { ruta, nombre, enlace, tablaLista }

function traducir(e) {
  if (e instanceof ErrorPlanilla) return e;
  console.error(`microsoft: ${e.message}`);
  if (e.status === 401) {
    cacheToken = null;
    return new ErrorPlanilla('Microsoft no aceptó el permiso. Si sigue pasando, volvé a conectar la cuenta.', { reconectar: modoMicrosoft() === 'cuenta' });
  }
  if (e.status === 403) return new ErrorPlanilla('La cuenta no tiene permiso para modificar la planilla de Excel.');
  if (e.status === 404 && /itemNotFound/i.test(e.codigo)) return new ErrorPlanilla(`No se encontró la planilla «${ruta()}» en OneDrive. Revisá EXCEL_RUTA.`, { status: 503 });
  if (e.name === 'TimeoutError' || e.name === 'AbortError') return new ErrorPlanilla('Excel tardó demasiado en responder. Probá de nuevo; si la fila aparece duplicada, borrá una.', { status: 504 });
  return new ErrorPlanilla('Excel no respondió como se esperaba. Probá de nuevo en un momento.');
}

/** Nombre y enlace para abrir la planilla en Excel para la web. */
export async function infoArchivo() {
  if (cacheArchivo?.ruta === ruta()) return cacheArchivo;
  try {
    const item = await graph(`${archivo()}?$select=name,webUrl`);
    cacheArchivo = { ruta: ruta(), nombre: item.name, enlace: item.webUrl, tablaLista: false };
    return cacheArchivo;
  } catch (e) {
    throw traducir(e);
  }
}

/** Comprueba la tabla (o la crea). Devuelve la dirección de una primera fila vacía a completar, si la hay. */
async function asegurarTabla() {
  const info = await infoArchivo();
  if (info.tablaLista) return null;
  const tabla = encodeURIComponent(nombreTabla());
  try {
    const cabecera = await graph(`${libro()}/tables/${tabla}/headerRowRange?$select=values`);
    const columnas = cabecera.values?.[0]?.length ?? 0;
    if (columnas !== COLUMNAS.length) {
      throw new ErrorPlanilla(`La tabla «${nombreTabla()}» de la planilla tiene ${columnas} columnas y tiene que tener ${COLUMNAS.length}: ${COLUMNAS.join(', ')}.`, { status: 409 });
    }
    info.tablaLista = true;
    return null;
  } catch (e) {
    if (!(e.status === 404)) throw e;
  }
  return crearTabla(info);
}

async function crearTabla(info) {
  const hoja = nombreTabla();
  const fin = letra(COLUMNAS.length);
  const rango = (direccion) => `${libro()}/worksheets/${encodeURIComponent(hoja)}/range(address='${direccion}')`;
  try {
    await graph(`${libro()}/worksheets/add`, { metodo: 'POST', cuerpo: { name: hoja } });
  } catch (e) {
    if (e.status !== 409 && !/exist/i.test(e.codigo + e.message)) throw e;
    // Ya hay una hoja con ese nombre: se usa solo si está vacía (o si otra computadora la está creando ahora).
    const actual = await graph(`${rango(`A1:${fin}2`)}?$select=values`);
    const valores = actual.values.flat().filter((v) => v !== '');
    const soloCabecera = valores.length === COLUMNAS.length && COLUMNAS.every((c, i) => actual.values[0][i] === c);
    if (valores.length && !soloCabecera) {
      throw new ErrorPlanilla(`La planilla ya tiene una hoja «${hoja}» con datos pero sin la tabla «${hoja}». Renombrá esa hoja o convertí sus datos en una tabla con ese nombre.`, { status: 409 });
    }
    await espera(1500);
    try {
      await graph(`${libro()}/tables/${encodeURIComponent(hoja)}?$select=name`);
      info.tablaLista = true;
      return null;
    } catch (e2) {
      if (e2.status !== 404) throw e2;
    }
  }
  await graph(rango(`A1:${fin}1`), { metodo: 'PATCH', cuerpo: { values: [COLUMNAS] } });
  const creada = await graph(`${libro()}/worksheets/${encodeURIComponent(hoja)}/tables/add`, { metodo: 'POST', cuerpo: { address: `A1:${fin}1`, hasHeaders: true } });
  await graph(`${libro()}/tables/${encodeURIComponent(creada.id)}`, { metodo: 'PATCH', cuerpo: { name: hoja } });
  await graph(`${rango(`A1:${fin}1`)}/format/font`, { metodo: 'PATCH', cuerpo: { bold: true } }).catch(() => {});
  info.tablaLista = true;
  // Excel crea la tabla con una fila vacía debajo de la cabecera: la primera carga va ahí.
  const cuerpo = await graph(`${libro()}/tables/${encodeURIComponent(hoja)}/dataBodyRange?$select=address,values`).catch(() => null);
  if (cuerpo?.values?.length === 1 && cuerpo.values[0].every((v) => v === '')) return cuerpo.address.split('!').pop();
  return null;
}

/** Agrega la fila al final de la tabla. */
export async function agregarFila(fila) {
  try {
    const vacia = await asegurarTabla();
    if (vacia) {
      await graph(`${libro()}/worksheets/${encodeURIComponent(nombreTabla())}/range(address='${comillas(vacia)}')`, { metodo: 'PATCH', cuerpo: { values: [fila] } });
    } else {
      await graph(`${libro()}/tables/${encodeURIComponent(nombreTabla())}/rows/add`, { metodo: 'POST', cuerpo: { index: null, values: [fila] } });
    }
  } catch (e) {
    if (e.status === 404 && cacheArchivo) cacheArchivo.tablaLista = false;
    throw traducir(e);
  }
}
