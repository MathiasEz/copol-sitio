// /api/sesion — GET: estado del panel (sesión, planilla, asistente) · POST: ingresar · DELETE: salir.
import { contador, contar, resumen } from './_lib/almacen.js';
import { error, ipDe, json, leerJson, mismoOrigen } from './_lib/http.js';
import { estado } from './_lib/planilla.js';
import { accesoConfigurado, cerrarSesion, claveCorrecta, crearSesion, leerSesion, limpiarNombre } from './_lib/sesion.js';
import { tokenGateway } from './_lib/asistente.js';

const MAX_INTENTOS = 10; // claves equivocadas por IP en 15 minutos (si hay almacén)

export async function GET(request) {
  const sesion = leerSesion(request);
  if (!sesion) return json({ sesion: null, configurado: accesoConfigurado() });
  const ia = process.env.IA_APAGADA !== '1' && Boolean(tokenGateway(request.headers.get('x-vercel-oidc-token')));
  return json({ sesion: { nombre: sesion.nombre }, configurado: true, planilla: await estado(), ia });
}

export async function POST(request) {
  if (!mismoOrigen(request)) return error('Pedido rechazado.', 403);
  if (!accesoConfigurado()) return error('El panel todavía no tiene clave: falta PANEL_CLAVE (10 caracteres o más) en Vercel.', 503);
  const clave = `ingreso-${resumen(ipDe(request))}`;
  if ((await contador(clave)) >= MAX_INTENTOS) return error('Demasiados intentos. Esperá 15 minutos.', 429);
  const cuerpo = await leerJson(request);
  const nombre = limpiarNombre(cuerpo?.nombre);
  if (nombre.length < 2) return error('Escribí tu nombre: queda anotado en cada registro que cargues.');
  if (!claveCorrecta(cuerpo?.clave)) {
    await Promise.all([contar(clave, 900), new Promise((ok) => setTimeout(ok, 700))]);
    return error('Clave incorrecta.', 401);
  }
  return json({ ok: true, sesion: { nombre } }, 200, { 'set-cookie': crearSesion(request, nombre) });
}

export async function DELETE(request) {
  if (!mismoOrigen(request)) return error('Pedido rechazado.', 403);
  return json({ ok: true }, 200, { 'set-cookie': cerrarSesion(request) });
}
