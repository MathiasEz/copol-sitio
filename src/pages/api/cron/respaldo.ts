// Respaldo diario automático (Cron de Vercel, ver "crons" en vercel.json): exporta la base del panel, la
// cifra (panel/src/respaldo.ts) y la guarda en Vercel Blob (carpeta respaldos/), conservando las últimas 30.
// Vercel llama con "Authorization: Bearer <CRON_SECRET>"; cualquier otro pedido recibe 401.
// Requiere CRON_SECRET, RESPALDO_CLAVE y BLOB_READ_WRITE_TOKEN en Vercel.
import type { APIRoute } from 'astro';
import { obtenerDb } from '../../../../panel/src/db.ts';
import { registrar } from '../../../../panel/src/auditoria.ts';
import { cifrar, exportarDatos, secretoValido } from '../../../../panel/src/respaldo.ts';

export const prerender = false;
const CONSERVAR = 30;

export const GET: APIRoute = async ({ request }) => {
  const sinCache = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
  if (!secretoValido(request.headers.get('authorization'), process.env.CRON_SECRET)) return new Response('No autorizado', { status: 401, headers: sinCache });
  const clave = process.env.RESPALDO_CLAVE;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!clave || !token) return new Response('Falta configurar RESPALDO_CLAVE o BLOB_READ_WRITE_TOKEN.', { status: 503, headers: sinCache });

  const db = await obtenerDb();
  const datos = await exportarDatos(db);
  const archivo = cifrar(JSON.stringify(datos), clave);
  const { put, list, del } = await import('@vercel/blob');
  const sello = datos.exportado.replace(/[:.]/g, '-').slice(0, 19);
  await put(`respaldos/${sello}.copol`, archivo, { access: 'public', addRandomSuffix: true, contentType: 'application/octet-stream', token });
  const { blobs } = await list({ prefix: 'respaldos/', limit: 1000, token });
  const viejos = blobs.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()).slice(CONSERVAR);
  if (viejos.length) await del(viejos.map((b) => b.url), { token });
  const filas = Object.fromEntries(Object.entries(datos.tablas).map(([t, f]) => [t, f.length]));
  await registrar(db, { id: null, usuario: 'sistema', ip: null }, 'sistema.respaldo', 'respaldo', sello, { filas, bytes: archivo.length, borrados: viejos.length });
  return Response.json({ ok: true, filas, bytes: archivo.length }, { headers: sinCache });
};
