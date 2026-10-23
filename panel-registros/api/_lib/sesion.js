// Acceso con una clave compartida (PANEL_CLAVE) y el nombre de quien carga. La sesión es una cookie firmada
// con HMAC: no hace falta base de datos. Cambiar PANEL_CLAVE en Vercel cierra todas las sesiones abiertas.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { leerCookie, cookie } from './http.js';

export const COOKIE_SESION = 'registros_sesion';
export const DURACION_HORAS = Number(process.env.PANEL_SESION_HORAS) || 12;
const LARGO_MINIMO_CLAVE = 10;

const clavePanel = () => {
  const c = process.env.PANEL_CLAVE ?? '';
  return c.length >= LARGO_MINIMO_CLAVE ? c : null;
};
export const accesoConfigurado = () => clavePanel() !== null;

const llaveFirma = () => createHash('sha256').update(`registros-sesion\0${clavePanel()}\0${process.env.SESION_SECRETO ?? ''}`).digest();

const b64 = (b) => Buffer.from(b).toString('base64url');
export const firmar = (texto) => b64(createHmac('sha256', llaveFirma()).update(texto).digest());

/** Texto firmado (datos.firma), para la cookie de sesión y el estado del inicio de sesión de Microsoft. */
export function sellar(datos) {
  const cuerpo = b64(JSON.stringify(datos));
  return `${cuerpo}.${firmar(cuerpo)}`;
}

export function abrir(sellado) {
  if (!clavePanel() || typeof sellado !== 'string') return null;
  const [cuerpo, firma] = sellado.split('.');
  if (!cuerpo || !firma) return null;
  const esperada = Buffer.from(firmar(cuerpo));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
    return typeof datos.exp === 'number' && datos.exp > Date.now() ? datos : null;
  } catch {
    return null;
  }
}

export function claveCorrecta(intento) {
  const c = clavePanel();
  if (!c || typeof intento !== 'string') return false;
  const a = createHash('sha256').update(intento).digest();
  const b = createHash('sha256').update(c).digest();
  return timingSafeEqual(a, b);
}

/** Nombre de quien carga: va a la columna «Cargado por». */
export const limpiarNombre = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) : '');

export function crearSesion(request, nombre) {
  const datos = { nombre, exp: Date.now() + DURACION_HORAS * 3600_000, n: b64(randomBytes(9)) };
  return cookie(request, COOKIE_SESION, sellar(datos), DURACION_HORAS * 3600);
}

export const cerrarSesion = (request) => cookie(request, COOKIE_SESION, '', 0);

export function leerSesion(request) {
  const datos = abrir(leerCookie(request, COOKIE_SESION));
  return datos && typeof datos.nombre === 'string' && datos.nombre ? { nombre: datos.nombre, exp: datos.exp } : null;
}
