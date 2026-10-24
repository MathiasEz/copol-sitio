// Acceso al panel, igual que el panel de stock (además de la dirección secreta PANEL_RUTA):
//   1. PIN de 6 dígitos (uno para todo el panel; se guarda solo su hash).
//   2. Usuario y contraseña (5 intentos fallidos bloquean la cuenta 15 minutos).
//   3. Correo de la cuenta y código de 6 dígitos que llega a ese correo (Resend).
// Un equipo verificado puede quedar «recordado» 30 días: en él no se piden el PIN ni el código.
// Todo se guarda en cookies firmadas (HttpOnly) y los intentos, en el almacén (valen en todas las instancias).
import { randomInt } from 'node:crypto';
import { agregarALista, leerLista } from './almacen.js';
import { abrir, hashCodigo, sellar, tokenAleatorio } from './seguridad.js';

export const DURACION = {
  pin: 30 * 60_000,
  equipo: 30 * 86_400_000,
  verificacion: 15 * 60_000,
  codigo: 10 * 60_000,
};
export const MAX_INTENTOS_CODIGO = 5;
export const MAX_ENVIOS = 3;
export const ESPERA_REENVIO_S = 60;
export const sesionInactividadMs = () => (Number(process.env.PANEL_SESION_INACTIVIDAD_MIN) || 30) * 60_000;
export const sesionMaxMs = () => (Number(process.env.PANEL_SESION_MAX_HORAS) || 8) * 3_600_000;

// ── Cookies firmadas ──

export const COOKIES = { sesion: 'reg_sesion', pin: 'reg_pin', equipo: 'reg_equipo', verif: 'reg_verif', ms: 'reg_ms' };

export const pasePin = (pv) => sellar({ t: 'pin', pv, exp: Date.now() + DURACION.pin });
export const leerPasePin = (valor, pv) => {
  const d = abrir(valor, 'pin');
  return Boolean(d && pv && d.pv === pv);
};

export const paseEquipo = (u) => sellar({ t: 'equipo', u: u.usuario, sv: u.sv, exp: Date.now() + DURACION.equipo });
export const leerPaseEquipo = (valor) => abrir(valor, 'equipo');

export function sesionNueva(u) {
  const t = Date.now();
  return sellar({ t: 'sesion', u: u.usuario, sv: u.sv, ini: t, act: t, exp: t + sesionMaxMs() });
}
/** Sesión vigente (por vencimiento total y por inactividad) o null. */
export function leerSesion(valor) {
  const d = abrir(valor, 'sesion');
  return d && d.act + sesionInactividadMs() > Date.now() ? d : null;
}
/** La misma sesión con la actividad al día (se renueva como máximo una vez por minuto). */
export const renovarSesion = (d) => (Date.now() - d.act > 60_000 ? sellar({ ...d, act: Date.now() }) : null);

// ── Verificación por correo (después de la contraseña) ──

export function verificacionNueva(u) {
  return { t: 'verif', u: u.usuario, sv: u.sv, n: tokenAleatorio(12), correoOk: false, ch: null, env: null, envios: 0, exp: Date.now() + DURACION.verificacion };
}
export const sellarVerificacion = (v) => sellar(v);
export const leerVerificacion = (valor) => abrir(valor, 'verif');

/** Código nuevo: devuelve el código (para el correo) y la verificación actualizada (solo con su hash). */
export function nuevoCodigo(v) {
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
  return { codigo, v: { ...v, correoOk: true, ch: hashCodigo(v.n, codigo), env: Date.now(), envios: v.envios + 1 } };
}
export function codigoValido(v, codigo) {
  if (!v.ch || !v.env || !/^\d{6}$/.test(codigo)) return false;
  if (v.env + DURACION.codigo < Date.now()) return false;
  return hashCodigo(v.n, codigo) === v.ch;
}
export const codigoVencido = (v) => Boolean(v.env && v.env + DURACION.codigo < Date.now());
export const segundosParaReenviar = (v) => (v.env ? Math.max(0, ESPERA_REENVIO_S - Math.floor((Date.now() - v.env) / 1000)) : 0);

// ── Correo (Resend: https://resend.com/docs/api-reference/emails/send-email) ──

/** En la computadora, CORREO_CONSOLA=1 muestra el código en la consola en lugar de mandarlo (para probar). */
const correoEnConsola = () => !process.env.VERCEL && process.env.CORREO_CONSOLA === '1';
export const correoConfigurado = () => Boolean(process.env.RESEND_API_KEY) || correoEnConsola();
const remitente = () => process.env.PANEL_CORREO_REMITENTE || 'Panel COPOL <onboarding@resend.dev>';

let enviarFalso = null;
/** Solo para las pruebas: reemplaza el envío. */
export const usarEnvio = (f) => { enviarFalso = f; };

export async function enviarCorreo(m) {
  if (enviarFalso) return enviarFalso(m);
  if (correoEnConsola()) {
    console.log(`[correo para ${m.para}] ${m.asunto}`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: remitente(), to: [m.para], subject: m.asunto, text: m.texto, html: m.html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Resend respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
export function correoCodigo(codigo, usuario, o) {
  const desde = [o.lugar, o.ip, describirEquipo(o.agente)].filter(Boolean).join(' · ');
  const texto = `Tu código para ingresar al panel de registros de COPOL es: ${codigo}\n\nVence en 10 minutos. Usuario: ${usuario}. Pedido desde: ${desde || 'sin datos'}.\n\nSi no fuiste vos, alguien conoce tu contraseña: cambiala desde «Mi perfil» y avisá al administrador. No compartas este código con nadie.`;
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#18181b;max-width:480px">
<p>Tu código para ingresar al <strong>panel de registros de COPOL</strong> es:</p>
<p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:12px 0;color:#006633">${codigo}</p>
<p>Vence en 10 minutos. Usuario: <strong>${esc(usuario)}</strong>.<br>Pedido desde: ${esc(desde || 'sin datos')}.</p>
<p style="color:#63636b;font-size:13px">Si no fuiste vos, alguien conoce tu contraseña: cambiala desde «Mi perfil» y avisá al administrador. No compartas este código con nadie.</p></div>`;
  return { asunto: `${codigo} es tu código del panel de registros COPOL`, texto, html };
}

/** "m•••s@gmail.com" */
export function ocultarCorreo(correo) {
  const [u, d] = String(correo).split('@');
  if (!d) return '•••';
  return `${u.slice(0, 1)}${'•'.repeat(Math.max(3, Math.min(6, u.length - 2)))}${u.length > 2 ? u.slice(-1) : ''}@${d}`;
}

// ── Equipo, ubicación aproximada (cabeceras de Vercel) y registro de accesos ──

export function describirEquipo(agente) {
  if (!agente) return null;
  const a = agente;
  const nav = /Edg\//.test(a) ? 'Edge' : /OPR\/|Opera/.test(a) ? 'Opera' : /SamsungBrowser/.test(a) ? 'Samsung Internet' : /Firefox\//.test(a) ? 'Firefox'
    : /Chrome\/|CriOS/.test(a) ? 'Chrome' : /Safari\//.test(a) ? 'Safari' : null;
  const so = /iPhone/.test(a) ? 'iPhone' : /iPad/.test(a) ? 'iPad' : /Android/.test(a) ? 'Android' : /Windows/.test(a) ? 'Windows' : /Mac OS X|Macintosh/.test(a) ? 'Mac' : /Linux/.test(a) ? 'Linux' : null;
  return nav && so ? `${nav} en ${so}` : nav ?? so ?? 'Otro navegador';
}

export function origenDe(request) {
  const h = (n) => request.headers.get(n) ?? '';
  const dec = (v) => { try { return v ? decodeURIComponent(v) : ''; } catch { return v; } };
  const lugar = [dec(h('x-vercel-ip-city')), dec(h('x-vercel-ip-country'))].filter(Boolean).join(', ');
  return { ip: h('x-forwarded-for').split(',')[0].trim() || null, agente: h('user-agent').slice(0, 200) || null, lugar: lugar.slice(0, 80) || null };
}

export const EVENTOS = {
  'ingreso': 'Ingreso',
  'ingreso-fallido': 'Contraseña incorrecta',
  'bloqueo': 'Cuenta bloqueada 15 min',
  'pin-fallido': 'PIN incorrecto',
  'codigo-enviado': 'Código enviado',
  'codigo-fallido': 'Código incorrecto',
  'correo-incorrecto': 'Correo incorrecto',
  'equipo-recordado': 'Equipo recordado',
  'salida': 'Cerró sesión',
  'clave-cambio': 'Cambió su contraseña',
  'correo-cambio': 'Cambió su correo',
  'pin-cambio': 'Cambió el PIN del panel',
  'usuario-creado': 'Creó un usuario',
  'usuario-editado': 'Editó un usuario',
  'usuario-clave': 'Restableció una contraseña',
  'usuario-sesiones': 'Cerró las sesiones de un usuario',
  'usuario-eliminado': 'Eliminó un usuario',
  'configuracion-inicial': 'Configuración inicial',
  'planilla-vaciada': 'Vació la planilla de prueba',
  'microsoft-conectado': 'Conectó la cuenta de Microsoft',
  'microsoft-desconectado': 'Desconectó la cuenta de Microsoft',
};
const MAX_EVENTOS = 400;

/** Anota un evento en el registro de accesos (si falla, no interrumpe lo que se estaba haciendo). */
export async function registrar(tipo, { usuario = null, detalle = null, origen = null } = {}) {
  try {
    await agregarALista('accesos', {
      fecha: new Date().toISOString(), tipo, usuario, detalle: detalle ? String(detalle).slice(0, 200) : null,
      ip: origen?.ip ?? null, lugar: origen?.lugar ?? null, equipo: describirEquipo(origen?.agente),
    }, MAX_EVENTOS, { rotar: true });
  } catch (e) {
    console.error('registro de accesos:', e.message);
  }
}
export const eventos = async () => (await leerLista('accesos')).reverse();
