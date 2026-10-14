// Monta el panel de stock (panel/src/app.ts) en /panel. Se ejecuta en el servidor en cada petición
// (en Vercel, como función); nunca se genera como página estática ni se enlaza desde el sitio.
import type { APIRoute } from 'astro';
import { crearApp } from '../../../panel/src/app.ts';
import { cargarConfig } from '../../../panel/src/config.ts';
import { obtenerDb } from '../../../panel/src/db.ts';

export const prerender = false;

let app: ReturnType<typeof crearApp> | null = null;

export const ALL: APIRoute = ({ request, clientAddress }) => {
  app ??= crearApp({ db: obtenerDb, config: cargarConfig() });
  let ip: string | null = null;
  try { ip = clientAddress; } catch { /* no disponible en algunos entornos */ }
  return app.fetch(request, { ip });
};
