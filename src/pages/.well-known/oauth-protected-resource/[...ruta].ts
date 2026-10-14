// Metadatos del recurso protegido (RFC 9728) para el conector de Claude: el servidor MCP del panel.
// Se publican en /.well-known/oauth-protected-resource y /.well-known/oauth-protected-resource/panel/mcp.
import type { APIRoute } from 'astro';
import { metadatosRecurso } from '../../../../panel/src/oauth.ts';

export const prerender = false;

export const GET: APIRoute = ({ url, params }) => {
  const ruta = params.ruta ?? '';
  if (ruta && ruta !== 'panel/mcp') return new Response('No encontrado', { status: 404 });
  return new Response(JSON.stringify(metadatosRecurso(url.origin)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*', 'X-Robots-Tag': 'noindex' },
  });
};
