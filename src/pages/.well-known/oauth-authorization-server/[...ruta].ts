// Metadatos del servidor de autorización (RFC 8414) para el conector de Claude. El emisor es el propio
// sitio; los endpoints viven en /panel/oauth/*.
import type { APIRoute } from 'astro';
import { metadatosServidor } from '../../../../panel/src/oauth.ts';

export const prerender = false;

export const GET: APIRoute = ({ url }) =>
  new Response(JSON.stringify(metadatosServidor(url.origin)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*', 'X-Robots-Tag': 'noindex' },
  });
