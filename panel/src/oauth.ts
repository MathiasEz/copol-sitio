// Autorización OAuth 2.1 para el conector de Claude (MCP). El panel es a la vez el servidor de
// autorización y el recurso protegido:
// - Registro dinámico de clientes (RFC 7591) solo para direcciones de regreso de Claude (claude.ai,
//   claude.com) o herramientas locales de prueba (localhost).
// - Código de autorización de un solo uso, 5 minutos, con PKCE S256 obligatorio.
// - Token de acceso de 1 hora y de renovación de 30 días (rotativo: cada uso entrega uno nuevo).
// - Códigos y tokens se guardan solo como hash SHA-256; la persona entra con su usuario del panel
//   (Claude nunca ve la contraseña) y puede desconectar a Claude desde "Mi perfil".
import crypto from 'node:crypto';
import { ahora, ejecutar, todas, una, type Db } from './db.ts';
import { sha256, tokenAleatorio } from './seguridad.ts';

export const ALCANCE = 'stock';
const VIDA_SEG = { pedido: 10 * 60, codigo: 5 * 60, acceso: 60 * 60, renovacion: 30 * 24 * 3600 };
const dentroDe = (seg: number) => new Date(Date.now() + seg * 1000).toISOString();
const vencido = (iso: string) => Date.parse(iso) <= Date.now();

/** Direcciones a las que se puede devolver el código: Claude o herramientas locales de prueba. */
export function redirectPermitido(uri: unknown): uri is string {
  if (typeof uri !== 'string' || uri.length > 500) return false;
  try {
    const u = new URL(uri);
    if (u.username || u.password || u.hash) return false;
    if (u.protocol === 'https:' && ['claude.ai', 'claude.com'].includes(u.hostname)) return true;
    return u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname);
  } catch {
    return false;
  }
}

/** Metadatos del servidor de autorización (RFC 8414). */
export const metadatosServidor = (origen: string) => ({
  issuer: origen,
  authorization_endpoint: `${origen}/panel/oauth/autorizar`,
  token_endpoint: `${origen}/panel/oauth/token`,
  registration_endpoint: `${origen}/panel/oauth/registro`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
  scopes_supported: [ALCANCE],
  service_documentation: `${origen}/panel`,
});
/** Metadatos del recurso protegido (RFC 9728): el servidor MCP del panel. */
export const metadatosRecurso = (origen: string) => ({
  resource: `${origen}/panel/mcp`,
  authorization_servers: [origen],
  scopes_supported: [ALCANCE],
  bearer_methods_supported: ['header'],
  resource_name: 'Panel de stock COPOL',
});

// ── Clientes ──
export interface Cliente { id: string; nombre: string | null; redirect_uris: string; creado_en: string }
export const obtenerCliente = (db: Db, id: string) => una<Cliente>(db, 'SELECT * FROM oauth_clientes WHERE id = ?', [id]);
export const urisDe = (c: Cliente) => JSON.parse(c.redirect_uris) as string[];

export async function registrarCliente(db: Db, datos: unknown) {
  const d = (datos && typeof datos === 'object' ? datos : {}) as Record<string, unknown>;
  const uris = Array.isArray(d.redirect_uris) ? d.redirect_uris : [];
  if (!uris.length || uris.length > 5 || !uris.every(redirectPermitido)) {
    return { ok: false as const, error: 'invalid_redirect_uri', descripcion: 'Solo se aceptan direcciones de regreso de Claude (claude.ai o claude.com) o de localhost.' };
  }
  const metodo = d.token_endpoint_auth_method ?? 'none';
  if (metodo !== 'none') return { ok: false as const, error: 'invalid_client_metadata', descripcion: 'Solo clientes públicos (token_endpoint_auth_method "none").' };
  const nombre = typeof d.client_name === 'string' ? d.client_name.slice(0, 100) : null;
  const id = tokenAleatorio(18);
  const t = ahora();
  await ejecutar(db, 'INSERT INTO oauth_clientes (id, nombre, redirect_uris, creado_en) VALUES (?, ?, ?, ?)', [id, nombre, JSON.stringify(uris), t]);
  return {
    ok: true as const,
    cliente: {
      client_id: id, client_id_issued_at: Math.floor(Date.parse(t) / 1000), client_name: nombre ?? undefined, redirect_uris: uris,
      token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], scope: ALCANCE,
    },
  };
}

// ── Pedido de autorización → consentimiento → código ──
export interface Pedido { id: string; cliente_id: string; redirect_uri: string; estado_cliente: string | null; desafio: string; alcance: string | null; recurso: string | null; expira_en: string }

export async function crearPedido(db: Db, p: Omit<Pedido, 'id' | 'expira_en'>) {
  await ejecutar(db, 'DELETE FROM oauth_pedidos WHERE expira_en < ?', [ahora()]);
  const id = tokenAleatorio(18);
  await ejecutar(db, 'INSERT INTO oauth_pedidos (id, cliente_id, redirect_uri, estado_cliente, desafio, alcance, recurso, expira_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
    id, p.cliente_id, p.redirect_uri, p.estado_cliente, p.desafio, p.alcance, p.recurso, dentroDe(VIDA_SEG.pedido),
  ]);
  return id;
}
export async function leerPedido(db: Db, id: string) {
  const p = await una<Pedido>(db, 'SELECT * FROM oauth_pedidos WHERE id = ?', [id]);
  return p && !vencido(p.expira_en) ? p : null;
}
export const borrarPedido = (db: Db, id: string) => ejecutar(db, 'DELETE FROM oauth_pedidos WHERE id = ?', [id]);

/** Dirección de regreso con los parámetros de respuesta (incluye "iss", RFC 9207). */
export function volverA(redirectUri: string, params: Record<string, string | null | undefined>) {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v);
  return u.toString();
}

export async function emitirCodigo(db: Db, pedido: Pedido, usuarioId: number) {
  const codigo = tokenAleatorio(32);
  await borrarPedido(db, pedido.id);
  await ejecutar(db, 'INSERT INTO oauth_codigos (codigo_hash, cliente_id, usuario_id, redirect_uri, desafio, alcance, recurso, expira_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
    sha256(codigo), pedido.cliente_id, usuarioId, pedido.redirect_uri, pedido.desafio, pedido.alcance, pedido.recurso, dentroDe(VIDA_SEG.codigo),
  ]);
  return codigo;
}

// ── Tokens ──
type ErrorToken = { error: 'invalid_request' | 'invalid_grant' | 'invalid_client' | 'unsupported_grant_type' | 'invalid_target'; error_description: string };
interface RespuestaToken { access_token: string; token_type: 'Bearer'; expires_in: number; refresh_token: string; scope: string }

async function emitirTokens(db: Db, clienteId: string, usuarioId: number, alcance: string | null, recurso: string | null): Promise<RespuestaToken> {
  const acceso = tokenAleatorio(32);
  const renovacion = tokenAleatorio(32);
  const t = ahora();
  await db.batch([
    { sql: "INSERT INTO oauth_tokens (token_hash, tipo, cliente_id, usuario_id, alcance, recurso, creado_en, expira_en) VALUES (?, 'acceso', ?, ?, ?, ?, ?, ?)", args: [sha256(acceso), clienteId, usuarioId, alcance, recurso, t, dentroDe(VIDA_SEG.acceso)] },
    { sql: "INSERT INTO oauth_tokens (token_hash, tipo, cliente_id, usuario_id, alcance, recurso, creado_en, expira_en) VALUES (?, 'renovacion', ?, ?, ?, ?, ?, ?)", args: [sha256(renovacion), clienteId, usuarioId, alcance, recurso, t, dentroDe(VIDA_SEG.renovacion)] },
    { sql: 'DELETE FROM oauth_tokens WHERE expira_en < ?', args: [t] },
  ], 'write');
  return { access_token: acceso, token_type: 'Bearer', expires_in: VIDA_SEG.acceso, refresh_token: renovacion, scope: alcance ?? ALCANCE };
}

/** PKCE S256: el desafío (43 caracteres base64url) es el SHA-256 del verificador. */
export const desafioValido = (d: unknown): d is string => typeof d === 'string' && /^[A-Za-z0-9_-]{43}$/.test(d);
const pkceValido = (verificador: unknown, desafio: string) =>
  typeof verificador === 'string' && /^[A-Za-z0-9\-._~]{43,128}$/.test(verificador) && desafioValido(desafio) &&
  crypto.timingSafeEqual(Buffer.from(crypto.createHash('sha256').update(verificador).digest('base64url')), Buffer.from(desafio));

export async function canjearCodigo(db: Db, p: Record<string, unknown>): Promise<RespuestaToken | ErrorToken> {
  const codigo = typeof p.code === 'string' ? p.code : '';
  const fila = codigo ? await una<{ cliente_id: string; usuario_id: number; redirect_uri: string; desafio: string; alcance: string | null; recurso: string | null; expira_en: string }>(
    db, 'SELECT * FROM oauth_codigos WHERE codigo_hash = ?', [sha256(codigo)]) : undefined;
  if (!fila) return { error: 'invalid_grant', error_description: 'Código inválido o ya usado.' };
  // Un solo uso: se borra antes de seguir (si dos pedidos llegan juntos, solo uno lo consigue).
  const borrado = await ejecutar(db, 'DELETE FROM oauth_codigos WHERE codigo_hash = ?', [sha256(codigo)]);
  if (!borrado.cambios) return { error: 'invalid_grant', error_description: 'Código inválido o ya usado.' };
  if (vencido(fila.expira_en)) return { error: 'invalid_grant', error_description: 'El código venció.' };
  if (p.client_id !== fila.cliente_id) return { error: 'invalid_grant', error_description: 'El código no corresponde a este cliente.' };
  if (p.redirect_uri !== fila.redirect_uri) return { error: 'invalid_grant', error_description: 'redirect_uri distinta de la autorizada.' };
  if (!pkceValido(p.code_verifier, fila.desafio)) return { error: 'invalid_grant', error_description: 'PKCE inválido.' };
  if (p.resource != null && p.resource !== fila.recurso) return { error: 'invalid_target', error_description: 'El recurso no coincide con el autorizado.' };
  return emitirTokens(db, fila.cliente_id, fila.usuario_id, fila.alcance, fila.recurso);
}

export async function renovarToken(db: Db, p: Record<string, unknown>): Promise<RespuestaToken | ErrorToken> {
  const token = typeof p.refresh_token === 'string' ? p.refresh_token : '';
  const fila = token ? await una<{ cliente_id: string; usuario_id: number; alcance: string | null; recurso: string | null; expira_en: string }>(
    db, "SELECT * FROM oauth_tokens WHERE token_hash = ? AND tipo = 'renovacion'", [sha256(token)]) : undefined;
  if (!fila || vencido(fila.expira_en)) return { error: 'invalid_grant', error_description: 'Token de renovación inválido o vencido.' };
  if (p.client_id !== fila.cliente_id) return { error: 'invalid_grant', error_description: 'El token no corresponde a este cliente.' };
  const borrado = await ejecutar(db, 'DELETE FROM oauth_tokens WHERE token_hash = ?', [sha256(token)]); // rotación
  if (!borrado.cambios) return { error: 'invalid_grant', error_description: 'Token de renovación ya usado.' };
  return emitirTokens(db, fila.cliente_id, fila.usuario_id, fila.alcance, fila.recurso);
}

/** Valida un token de acceso para el recurso indicado. Devuelve el usuario y el cliente, o null. */
export async function validarAcceso(db: Db, token: string, recurso: string) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const fila = await una<{ usuario_id: number; cliente_id: string; recurso: string | null; expira_en: string; ultimo_uso: string | null }>(
    db, "SELECT usuario_id, cliente_id, recurso, expira_en, ultimo_uso FROM oauth_tokens WHERE token_hash = ? AND tipo = 'acceso'", [sha256(token)]);
  if (!fila || vencido(fila.expira_en)) return null;
  if (fila.recurso && fila.recurso !== recurso) return null;
  if (!fila.ultimo_uso || Date.now() - Date.parse(fila.ultimo_uso) > 60_000) {
    await ejecutar(db, 'UPDATE oauth_tokens SET ultimo_uso = ? WHERE token_hash = ?', [ahora(), sha256(token)]);
  }
  return { usuarioId: Number(fila.usuario_id), clienteId: fila.cliente_id };
}

// ── Conexiones visibles en "Mi perfil" ──
export interface Conexion { cliente_id: string; nombre: string | null; desde: string; ultimo_uso: string | null }
export const conexionesDe = (db: Db, usuarioId: number) => todas<Conexion>(db, `
  SELECT t.cliente_id, c.nombre, MIN(t.creado_en) desde, MAX(t.ultimo_uso) ultimo_uso
  FROM oauth_tokens t LEFT JOIN oauth_clientes c ON c.id = t.cliente_id
  WHERE t.usuario_id = ? AND t.expira_en > ? GROUP BY t.cliente_id, c.nombre ORDER BY desde DESC`, [usuarioId, ahora()]);
export const desconectar = (db: Db, usuarioId: number, clienteId: string) =>
  ejecutar(db, 'DELETE FROM oauth_tokens WHERE usuario_id = ? AND cliente_id = ?', [usuarioId, clienteId]);
