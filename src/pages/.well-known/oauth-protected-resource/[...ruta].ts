// Metadatos del recurso protegido (RFC 9728) para el conector de Claude: el servidor MCP del panel.
// Solo existen con PANEL_CONECTOR_CLAUDE=1 (anuncian la dirección del panel, que no es pública).
import type { APIRoute } from 'astro';
import { BASE, cargarConfig } from '../../../../panel/src/config.ts';
import { metadatosRecurso } from '../../../../panel/src/oauth.ts';

export const prerender = false;

export const GET: APIRoute = ({ url, params }) => {
  const ruta = params.ruta ?? '';
  if (!cargarConfig().conectorClaude || (ruta && ruta !== `${BASE.slice(1)}/mcp`)) return new Response('No encontrado', { status: 404 });
  return new Response(JSON.stringify(metadatosRecurso(url.origin)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*', 'X-Robots-Tag': 'noindex' },
  });
};
