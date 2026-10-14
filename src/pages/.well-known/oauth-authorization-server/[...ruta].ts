// Metadatos del servidor de autorización (RFC 8414) para el conector de Claude. El emisor es el propio
// sitio; los endpoints viven en <BASE>/oauth/*. Solo existen con PANEL_CONECTOR_CLAUDE=1.
import type { APIRoute } from 'astro';
import { cargarConfig } from '../../../../panel/src/config.ts';
import { metadatosServidor } from '../../../../panel/src/oauth.ts';

export const prerender = false;

export const GET: APIRoute = ({ url }) =>
  cargarConfig().conectorClaude
    ? new Response(JSON.stringify(metadatosServidor(url.origin)), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*', 'X-Robots-Tag': 'noindex' },
      })
    : new Response('No encontrado', { status: 404 });
