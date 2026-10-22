// API de solo lectura para la app de celular (carpeta copol-sitio-app): /api/app/v1/inicio, /bazar y
// /contenido.json (este último se genera en el build; la extensión hace que Vercel lo sirva como JSON). Devuelve los mismos datos que ve
// la web pública, en JSON y sin nada privado: ni stock numérico, ni precios del Bazar, ni datos del panel.
// - Las respuestas con datos de la base se guardan en la CDN con las mismas etiquetas que las páginas
//   (src/lib/cache-publica.ts): al guardar un cambio en el panel, la app también lo ve en la visita siguiente.
// - Si la base no responde, se devuelve el contenido inicial sin guardarlo en la CDN (`enVivo` = false).
// - Solo GET: la app no envía datos al sitio.
import { cachearEnCdn, sinCache } from './cache-publica';
import type { EtiquetaWeb } from '../../panel/src/web-publica.ts';

/** Versión del formato. La app rechaza respuestas de otra versión y usa su copia guardada. */
export const VERSION_API_APP = 1;

export function respuestaApp(datos: Record<string, unknown>, enVivo: boolean, ...etiquetas: EtiquetaWeb[]) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'X-Robots-Tag': 'noindex',
    'X-Content-Type-Options': 'nosniff',
    // Datos públicos de solo lectura: cualquier origen puede leerlos (la versión web de la app, en pruebas).
    'Access-Control-Allow-Origin': '*',
  });
  if (enVivo && etiquetas.length) cachearEnCdn(headers, ...etiquetas);
  else if (!enVivo) sinCache(headers);
  return new Response(JSON.stringify({ version: VERSION_API_APP, generado: new Date().toISOString(), enVivo, ...datos }), { headers });
}

/** Mayor variante de un srcset ("a 400w, b 800w" → b), o null. */
export function varianteGrande(srcset: string | undefined): string | null {
  if (!srcset) return null;
  const partes = srcset.split(',').map((p) => p.trim().split(/\s+/)).filter((p) => p[0]);
  return partes.sort((a, b) => parseInt(b[1] ?? '0', 10) - parseInt(a[1] ?? '0', 10))[0]?.[0] ?? null;
}
