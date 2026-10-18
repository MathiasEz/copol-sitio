// Caché de las páginas que se generan con datos de la base (Bazar, estantes y novedades de Inicio).
// - La CDN de Vercel guarda la respuesta y la entrega sin ejecutar la función: así un pico de visitas
//   (p. ej. un enlace enviado por WhatsApp a muchos socios) no hace cola en el servidor ni en la base.
// - Cada respuesta lleva una etiqueta; el panel la borra al guardar un cambio (panel/src/web-publica.ts),
//   de modo que la visita siguiente ya muestra el stock o la novedad actualizados.
// - Si el borrado fallara, la copia se renueva sola a los 60 s (en segundo plano: nadie espera).
// - El navegador no guarda copia propia: siempre pregunta a la CDN.
import { ETIQUETAS_WEB, type EtiquetaWeb } from '../../panel/src/web-publica.ts';

export { ETIQUETAS_WEB };

export function cachearEnCdn(headers: Headers, ...etiquetas: EtiquetaWeb[]) {
  headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  headers.set('Vercel-CDN-Cache-Control', 'max-age=60, stale-while-revalidate=86400');
  headers.set('Vercel-Cache-Tag', etiquetas.join(','));
}

/** Sin caché: para respuestas degradadas (la base no respondió), que no deben quedar guardadas. */
export function sinCache(headers: Headers) {
  headers.set('Cache-Control', 'no-store, max-age=0');
  headers.delete('Vercel-CDN-Cache-Control');
  headers.delete('Vercel-Cache-Tag');
}
