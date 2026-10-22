// Recepción de las estadísticas de la web (vistas y clics), sin cookies ni datos personales: ver
// panel/src/estadisticas.ts. La web lo llama con navigator.sendBeacon desde src/layouts/Base.astro.
// Solo acepta pedidos del propio sitio; los robots no se cuentan. Responde siempre 204 (no revela nada).
import type { APIRoute } from 'astro';
import { obtenerDb } from '../../../panel/src/db.ts';
import { esBot, leerEvento, registrarEvento } from '../../../panel/src/estadisticas.ts';

export const prerender = false;
const nada = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

export const POST: APIRoute = async ({ request, clientAddress, url }) => {
  try {
    const origen = request.headers.get('origin');
    const sitio = request.headers.get('sec-fetch-site');
    if (origen ? new URL(origen).host !== url.host : sitio !== 'same-origin') return nada();
    const agente = request.headers.get('user-agent');
    if (esBot(agente)) return nada();
    const cuerpo = await request.text();
    if (cuerpo.length > 2000) return nada();
    const evento = leerEvento(JSON.parse(cuerpo), url.hostname);
    if (!evento) return nada();
    let ip: string | null = null;
    try { ip = clientAddress; } catch { /* no disponible */ }
    await registrarEvento(await obtenerDb(), evento, { ip, agente });
  } catch (e) {
    console.error('estadísticas:', (e as Error).message);
  }
  return nada();
};
