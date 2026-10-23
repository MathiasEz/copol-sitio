// Registro de celulares para avisos instantáneos (el único pedido en que la app envía datos al sitio).
// Solo se guarda el identificador anónimo de Expo ("ExponentPushToken[…]"), la plataforma y los tipos de aviso
// elegidos: nada personal. `activo: false` lo borra (cuando la persona apaga los avisos en la app).
// Límite: 30 pedidos por hora por conexión (en la base: vale para todas las instancias).
import type { APIRoute } from 'astro';
import { obtenerDb } from '../../../../../panel/src/db.ts';
import { anotarIntento, excedido } from '../../../../../panel/src/acceso.ts';
import { bajaDispositivo, esCategoria, registrarDispositivo, TOKEN_EXPO } from '../../../../../panel/src/notificaciones.ts';

export const prerender = false;
const MAX_BYTES = 2_000;
const LIMITE = { max: 30, ventanaMs: 3_600_000 };
const respuesta = (estado: number, texto = '') => new Response(texto || null, { status: estado, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'X-Content-Type-Options': 'nosniff' } });

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!request.headers.get('content-type')?.includes('application/json')) return respuesta(415);
  const crudo = await request.text();
  if (crudo.length > MAX_BYTES) return respuesta(413);
  let b: Record<string, unknown>;
  try {
    b = JSON.parse(crudo);
  } catch {
    return respuesta(400, 'JSON inválido');
  }
  const token = typeof b?.token === 'string' ? b.token : '';
  const plataforma = b?.plataforma === 'ios' ? 'ios' : b?.plataforma === 'android' ? 'android' : null;
  const categorias = Array.isArray(b?.categorias) ? [...new Set(b.categorias.filter(esCategoria))] : [];
  if (!TOKEN_EXPO.test(token) || !plataforma) return respuesta(400, 'Datos inválidos');

  const db = await obtenerDb();
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || clientAddress || 'desconocida';
  const clave = `dispositivo:${ip}`;
  if (await excedido(db, clave, LIMITE.max, LIMITE.ventanaMs)) return respuesta(429, 'Demasiados pedidos');
  await anotarIntento(db, clave);

  if (b.activo === false || !categorias.length) await bajaDispositivo(db, token);
  else await registrarDispositivo(db, token, plataforma, categorias);
  return respuesta(204);
};
