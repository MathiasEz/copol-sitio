// Acceso al panel en tres pasos (además de la dirección no adivinable, ver BASE en config.ts):
//   1. PIN de 6 dígitos antes de la pantalla de ingreso (uno para todo el panel; se guarda solo su hash).
//   2. Usuario y contraseña.
//   3. Código de 6 dígitos enviado al correo de la cuenta (la persona primero escribe ese correo).
// Un equipo verificado puede quedar "recordado" 30 días: en él no se piden el PIN ni el código.
// Los límites de intentos se guardan en la base para que valgan en todas las instancias de Vercel.
import crypto from 'node:crypto';
import { ahora, ejecutar, todas, una, type Db } from './db.ts';
import { hashClave, sha256, tokenAleatorio, verificarClave } from './seguridad.ts';

export const DURACION = {
  /** Tras ingresar el PIN, para completar el ingreso. */
  pin: 30 * 60_000,
  /** Equipo recordado. */
  equipo: 30 * 86_400_000,
  /** Ingreso a medio verificar (correo y código). */
  verificacion: 15 * 60_000,
  /** Validez de cada código enviado. */
  codigo: 10 * 60_000,
};
export const MAX_INTENTOS_CODIGO = 5;
export const MAX_ENVIOS = 3;
export const ESPERA_REENVIO_S = 60;

// ── PIN de entrada ──
const conPin = new WeakSet<Db>(); // una vez creado el PIN no se borra: se puede recordar en memoria
export async function pinConfigurado(db: Db) {
  if (conPin.has(db)) return true;
  const hay = Boolean(await una(db, "SELECT 1 FROM ajustes WHERE clave = 'pin_hash'"));
  if (hay) conPin.add(db);
  return hay;
}
export function problemaPin(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return 'El PIN tiene que tener exactamente 6 números.';
  if (/^(\d)\1{5}$/.test(pin) || '01234567890'.includes(pin) || '09876543210'.includes(pin)) return 'Ese PIN es demasiado fácil de adivinar: evitá números repetidos o seguidos.';
  return null;
}
/** Guarda el PIN (solo su hash) y anula los pases de PIN vigentes; los equipos recordados se mantienen. */
export async function guardarPin(db: Db, pin: string) {
  await db.batch([
    { sql: "INSERT INTO ajustes (clave, valor, actualizado_en) VALUES ('pin_hash', ?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en", args: [await hashClave(pin), ahora()] },
    { sql: "DELETE FROM pases WHERE tipo = 'pin'", args: [] },
  ], 'write');
  conPin.add(db);
}
export async function verificarPin(db: Db, pin: string) {
  const f = await una<{ valor: string }>(db, "SELECT valor FROM ajustes WHERE clave = 'pin_hash'");
  return Boolean(f && /^\d{6}$/.test(pin) && (await verificarClave(pin, f.valor)));
}

// ── Pases guardados en cookies: PIN ingresado (30 min) y equipo recordado (30 días) ──
export interface Origen { ip: string | null; agente: string | null; lugar: string | null }
export interface Pase { token_hash: string; tipo: 'pin' | 'equipo'; usuario_id: number | null; creado_en: string; expira_en: string; ultimo_uso: string | null; ip: string | null; agente: string | null; lugar: string | null }

export async function crearPase(db: Db, tipo: Pase['tipo'], usuarioId: number | null, o: Origen) {
  const token = tokenAleatorio();
  const t = ahora();
  await ejecutar(db, 'INSERT INTO pases (token_hash, tipo, usuario_id, creado_en, expira_en, ultimo_uso, ip, agente, lugar) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    sha256(token), tipo, usuarioId, t, new Date(Date.now() + DURACION[tipo]).toISOString(), t, o.ip, o.agente?.slice(0, 200) ?? null, o.lugar,
  ]);
  return token;
}
export async function leerPase(db: Db, token: string | undefined, tipo: Pase['tipo']): Promise<Pase | null> {
  if (!token || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const p = await una<Pase>(db, 'SELECT * FROM pases WHERE token_hash = ? AND tipo = ?', [sha256(token), tipo]);
  if (!p) return null;
  if (Date.parse(p.expira_en) < Date.now()) {
    await ejecutar(db, 'DELETE FROM pases WHERE token_hash = ?', [p.token_hash]);
    return null;
  }
  if (!p.ultimo_uso || Date.now() - Date.parse(p.ultimo_uso) > 3_600_000) await ejecutar(db, 'UPDATE pases SET ultimo_uso = ? WHERE token_hash = ?', [ahora(), p.token_hash]);
  return p;
}
export const borrarPase = (db: Db, tokenHash: string) => ejecutar(db, 'DELETE FROM pases WHERE token_hash = ?', [tokenHash]);
export const borrarPasesDe = (db: Db, usuarioId: number) => ejecutar(db, "DELETE FROM pases WHERE usuario_id = ? AND tipo = 'equipo'", [usuarioId]);
export const purgarVencidos = (db: Db) => db.batch([
  { sql: 'DELETE FROM pases WHERE expira_en < ?', args: [ahora()] },
  { sql: 'DELETE FROM verificaciones WHERE expira_en < ?', args: [ahora()] },
  { sql: 'DELETE FROM intentos WHERE fecha < ?', args: [new Date(Date.now() - 86_400_000).toISOString()] },
], 'write');

// ── Verificación por correo (después de la contraseña) ──
export interface Verificacion { id_hash: string; usuario_id: number; correo_ok: number; codigo_hash: string | null; intentos: number; envios: number; enviado_en: string | null; expira_en: string; volver: string | null }

export async function crearVerificacion(db: Db, usuarioId: number, volver: string | null) {
  const token = tokenAleatorio();
  await ejecutar(db, 'DELETE FROM verificaciones WHERE usuario_id = ?', [usuarioId]);
  await ejecutar(db, 'INSERT INTO verificaciones (id_hash, usuario_id, expira_en, volver) VALUES (?, ?, ?, ?)', [sha256(token), usuarioId, new Date(Date.now() + DURACION.verificacion).toISOString(), volver]);
  return token;
}
export async function leerVerificacion(db: Db, token: string | undefined): Promise<Verificacion | null> {
  if (!token || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const v = await una<Verificacion>(db, 'SELECT * FROM verificaciones WHERE id_hash = ?', [sha256(token)]);
  if (!v) return null;
  if (Date.parse(v.expira_en) < Date.now()) {
    await ejecutar(db, 'DELETE FROM verificaciones WHERE id_hash = ?', [v.id_hash]);
    return null;
  }
  return v;
}
export const borrarVerificacion = (db: Db, idHash: string) => ejecutar(db, 'DELETE FROM verificaciones WHERE id_hash = ?', [idHash]);
export const sumarIntento = (db: Db, idHash: string) => ejecutar(db, 'UPDATE verificaciones SET intentos = intentos + 1 WHERE id_hash = ?', [idHash]);

const hashCodigo = (idHash: string, codigo: string) => sha256(`${idHash}:${codigo}`);
/** Genera un código nuevo (invalida el anterior) y devuelve el texto para enviarlo. */
export async function nuevoCodigo(db: Db, v: Verificacion) {
  const codigo = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await ejecutar(db, 'UPDATE verificaciones SET correo_ok = 1, codigo_hash = ?, envios = envios + 1, enviado_en = ?, intentos = 0 WHERE id_hash = ?', [hashCodigo(v.id_hash, codigo), ahora(), v.id_hash]);
  return codigo;
}
export function codigoValido(v: Verificacion, codigo: string) {
  if (!v.codigo_hash || !v.enviado_en || !/^\d{6}$/.test(codigo)) return false;
  if (Date.parse(v.enviado_en) + DURACION.codigo < Date.now()) return false;
  return crypto.timingSafeEqual(Buffer.from(hashCodigo(v.id_hash, codigo)), Buffer.from(v.codigo_hash));
}
export const segundosParaReenviar = (v: Verificacion) => (v.enviado_en ? Math.max(0, ESPERA_REENVIO_S - Math.floor((Date.now() - Date.parse(v.enviado_en)) / 1000)) : 0);

// ── Límite de intentos (en la base: vale para todas las instancias) ──
export async function excedido(db: Db, clave: string, max: number, ventanaMs: number) {
  const f = await una<{ n: number }>(db, 'SELECT COUNT(*) n FROM intentos WHERE clave = ? AND fecha > ?', [clave, new Date(Date.now() - ventanaMs).toISOString()]);
  return Number(f?.n ?? 0) >= max;
}
export const anotarIntento = (db: Db, clave: string) => ejecutar(db, 'INSERT INTO intentos (clave, fecha) VALUES (?, ?)', [clave, ahora()]);
export const limpiarIntentos = (db: Db, clave: string) => ejecutar(db, 'DELETE FROM intentos WHERE clave = ?', [clave]);

// ── Correo (Resend: https://resend.com/docs/api-reference/emails/send-email) ──
export type EnviarCorreo = (m: { para: string; asunto: string; texto: string; html: string }) => Promise<void>;
export function correoResend(clave: string, remitente: string, f: typeof fetch = fetch): EnviarCorreo {
  return async (m) => {
    const res = await f('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${clave}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: remitente, to: [m.para], subject: m.asunto, text: m.texto, html: m.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
  };
}
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
export function correoCodigo(codigo: string, usuario: string, o: Origen) {
  const desde = [o.lugar, o.ip, describirEquipo(o.agente)].filter(Boolean).join(' · ');
  const texto = `Tu código para ingresar al panel de COPOL es: ${codigo}\n\nVence en 10 minutos. Usuario: ${usuario}. Pedido desde: ${desde || 'sin datos'}.\n\nSi no fuiste vos, alguien conoce tu contraseña: cambiala desde "Mi perfil" y avisá al administrador. No compartas este código con nadie.`;
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#18181b;max-width:480px">
<p>Tu código para ingresar al <strong>panel de COPOL</strong> es:</p>
<p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:12px 0;color:#006633">${codigo}</p>
<p>Vence en 10 minutos. Usuario: <strong>${esc(usuario)}</strong>.<br>Pedido desde: ${esc(desde || 'sin datos')}.</p>
<p style="color:#63636b;font-size:13px">Si no fuiste vos, alguien conoce tu contraseña: cambiala desde «Mi perfil» y avisá al administrador. No compartas este código con nadie.</p></div>`;
  return { asunto: `${codigo} es tu código del panel COPOL`, texto, html };
}

/** "m•••s@gmail.com" */
export function ocultarCorreo(correo: string) {
  const [u, d] = correo.split('@');
  if (!d) return '•••';
  return `${u.slice(0, 1)}${'•'.repeat(Math.max(3, Math.min(6, u.length - 2)))}${u.length > 2 ? u.slice(-1) : ''}@${d}`;
}

// ── Datos del equipo y la ubicación aproximada (cabeceras de Vercel) ──
export function describirEquipo(agente: string | null | undefined) {
  if (!agente) return null;
  const a = agente;
  const nav = /Edg\//.test(a) ? 'Edge' : /OPR\/|Opera/.test(a) ? 'Opera' : /SamsungBrowser/.test(a) ? 'Samsung Internet' : /Firefox\//.test(a) ? 'Firefox'
    : /Chrome\/|CriOS/.test(a) ? 'Chrome' : /Safari\//.test(a) ? 'Safari' : null;
  const so = /iPhone/.test(a) ? 'iPhone' : /iPad/.test(a) ? 'iPad' : /Android/.test(a) ? 'Android' : /Windows/.test(a) ? 'Windows' : /Mac OS X|Macintosh/.test(a) ? 'Mac' : /Linux/.test(a) ? 'Linux' : null;
  return nav && so ? `${nav} en ${so}` : nav ?? so ?? 'Otro navegador';
}
export function lugarDe(cabecera: (n: string) => string | undefined) {
  const dec = (v: string | undefined) => { try { return v ? decodeURIComponent(v) : ''; } catch { return v ?? ''; } };
  const ciudad = dec(cabecera('x-vercel-ip-city'));
  const pais = dec(cabecera('x-vercel-ip-country'));
  const lugar = [ciudad, pais].filter(Boolean).join(', ');
  return lugar ? lugar.slice(0, 80) : null;
}

// ── Para la sección Accesos ──
export interface SesionAbierta { id_hash: string; usuario: string; roles: string; ip: string | null; agente: string | null; lugar: string | null; creada_en: string; ultima_actividad: string }
export const sesionesAbiertas = (db: Db, inactividadMin: number) => todas<SesionAbierta>(db,
  'SELECT s.id_hash, u.usuario, COALESCE(u.roles, u.rol) AS roles, s.ip, s.agente, s.lugar, s.creada_en, s.ultima_actividad FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.expira_en > ? AND s.ultima_actividad > ? ORDER BY s.ultima_actividad DESC',
  [ahora(), new Date(Date.now() - inactividadMin * 60_000).toISOString()]);
export interface EquipoRecordado { token_hash: string; usuario: string; ip: string | null; agente: string | null; lugar: string | null; creado_en: string; expira_en: string; ultimo_uso: string | null }
export const equiposRecordados = (db: Db) => todas<EquipoRecordado>(db,
  "SELECT p.token_hash, u.usuario, p.ip, p.agente, p.lugar, p.creado_en, p.expira_en, p.ultimo_uso FROM pases p JOIN usuarios u ON u.id = p.usuario_id WHERE p.tipo = 'equipo' AND p.expira_en > ? ORDER BY p.ultimo_uso DESC",
  [ahora()]);
