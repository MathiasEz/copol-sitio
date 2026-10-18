// Descripción de un producto del Bazar, pedida por la ficha que se abre al tocar una tarjeta. Se carga
// recién al abrirla para no sumar ~350 KB de texto a la página del catálogo. Sin precios (el panel y
// el importador ya los rechazan).
import type { APIRoute } from 'astro';
import { descripcionProducto } from '../../../../lib/inventario';
import { ETIQUETAS_WEB } from '../../../../lib/cache-publica';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const id = String(params.id ?? '');
  // Etiqueta "bazar": al editar un producto en el panel se renueva también la copia de la CDN.
  const json = (cuerpo: unknown, estado = 200, cache = 'public, max-age=300, s-maxage=3600') =>
    new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache, 'Vercel-Cache-Tag': ETIQUETAS_WEB.bazar, 'X-Robots-Tag': 'noindex' } });
  if (!/^[a-z0-9-]{1,160}$/.test(id)) return json({ error: 'Producto inválido.' }, 400, 'no-store');
  return json({ descripcion: await descripcionProducto(id) });
};
