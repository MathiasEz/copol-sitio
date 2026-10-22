// Última versión publicada del APK de la app de Android. La app la compara con la instalada y, si hay una más
// nueva, muestra "Hay una versión nueva" con el botón para descargarla. Se genera en el build.
import type { APIRoute } from 'astro';
import { APP_ANDROID } from '../../../../data/confirmado/app-celular';
import { VERSION_API_APP } from '../../../../lib/api-app';

export const prerender = true;

export const GET: APIRoute = () => {
  const datos = { version: VERSION_API_APP, generado: new Date().toISOString(), enVivo: true, android: APP_ANDROID };
  return new Response(JSON.stringify(datos), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
};
