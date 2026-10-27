// Cierre mensual de estadísticas (Cron de Vercel, el día 1 de cada mes; ver "crons" en vercel.json): guarda el
// resumen completo de cada mes terminado para verlo mes a mes en el panel (Estadísticas → Mes a mes).
// Vercel llama con "Authorization: Bearer <CRON_SECRET>"; cualquier otro pedido recibe 401. Es seguro repetirlo.
import type { APIRoute } from 'astro';
import { obtenerDb } from '../../../../panel/src/db.ts';
import { registrar } from '../../../../panel/src/auditoria.ts';
import { archivarMeses } from '../../../../panel/src/estadisticas.ts';
import { secretoValido } from '../../../../panel/src/respaldo.ts';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const sinCache = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
  if (!secretoValido(request.headers.get('authorization'), process.env.CRON_SECRET)) return new Response('No autorizado', { status: 401, headers: sinCache });
  const db = await obtenerDb();
  const meses = await archivarMeses(db);
  if (meses.length) await registrar(db, { id: null, usuario: 'sistema', ip: null }, 'sistema.estadisticas', 'estadisticas', meses.join(','), { meses });
  return Response.json({ ok: true, meses }, { headers: sinCache });
};
