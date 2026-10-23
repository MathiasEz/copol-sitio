// Respuestas JSON, cookies y controles comunes a todas las funciones.
import { leerSesion } from './sesion.js';

export const json = (datos, status = 200, cabeceras = {}) => new Response(JSON.stringify(datos), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cabeceras },
});

export const error = (mensaje, status = 400, extra = {}) => json({ error: mensaje, ...extra }, status);

export function leerCookie(request, nombre) {
  for (const parte of (request.headers.get('cookie') ?? '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nombre) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

/** En localhost (desarrollo) la cookie va sin Secure para que funcione con http://. */
const esLocal = (request) => /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(new URL(request.url).host);

export function cookie(request, nombre, valor, segundos) {
  const partes = [`${nombre}=${encodeURIComponent(valor)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.max(0, Math.floor(segundos))}`];
  if (!esLocal(request)) partes.push('Secure');
  return partes.join('; ');
}

/**
 * Los pedidos que cambian algo tienen que venir de esta misma página (fetch con JSON): así otro sitio no
 * puede usar la sesión abierta de un empleado para cargar filas.
 */
export function mismoOrigen(request) {
  const origen = request.headers.get('origin');
  if (!origen) return false;
  try {
    return new URL(origen).host === (request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host);
  } catch {
    return false;
  }
}

/** Cuerpo JSON acotado (los registros son chicos). */
export async function leerJson(request, maximo = 20_000) {
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) return null;
  const texto = await request.text();
  if (texto.length > maximo) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

/** Para POST/DELETE: mismo origen y sesión iniciada. Devuelve { sesion } o { respuesta } con el error. */
export function exigirSesion(request, { cambia = true } = {}) {
  if (cambia && !mismoOrigen(request)) return { respuesta: error('Pedido rechazado: tiene que hacerse desde el panel.', 403) };
  const sesion = leerSesion(request);
  if (!sesion) return { respuesta: error('La sesión venció. Volvé a ingresar.', 401, { sesion: false }) };
  return { sesion };
}

export const ipDe = (request) => (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
