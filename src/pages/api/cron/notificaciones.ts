// Mantenimiento diario de las notificaciones (Cron de Vercel, ver "crons" en vercel.json):
// - revisa los recibos de los avisos enviados y borra los celulares que ya no existen;
// - borra los celulares que no se reportan hace más de 180 días;
// - manda el aviso silencioso de "sincronizar" para que cada celular renueve su agenda (por si alguno no la bajó).
// Vercel llama con "Authorization: Bearer <CRON_SECRET>"; cualquier otro pedido recibe 401.
import type { APIRoute } from 'astro';
import { ejecutar, obtenerDb } from '../../../../panel/src/db.ts';
import { secretoValido } from '../../../../panel/src/respaldo.ts';
import { revisarRecibos, sincronizarCelulares } from '../../../../panel/src/push.ts';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const sinCache = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
  if (!secretoValido(request.headers.get('authorization'), process.env.CRON_SECRET)) return new Response('No autorizado', { status: 401, headers: sinCache });
  const db = await obtenerDb();
  const recibos = await revisarRecibos(db);
  const viejos = await ejecutar(db, 'DELETE FROM dispositivos WHERE visto_en < ?', [new Date(Date.now() - 180 * 86_400_000).toISOString()]);
  const sync = await sincronizarCelulares(db);
  return Response.json({ ok: true, recibos, borradosPorInactividad: viejos.cambios, sincronizados: sync.enviados }, { headers: sinCache });
};
