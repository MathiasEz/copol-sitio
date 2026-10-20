// Vistas HTML del panel (anatomía y tokens de shadcn/ui: Sidebar, Card, Table, Tabs, Badge, Button,
// Input, Select, Dialog). `html` de Hono escapa toda interpolación (protección contra XSS); `raw` solo
// se usa con contenido fijo del propio código (íconos SVG y atributos booleanos).
import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import { ACCIONES, type Evento } from './auditoria.ts';
import { BASE } from './config.ts';
import { variante } from './imagenes.ts';
import { GRUPOS, qrSvg, type Grupo, type ImagenPortal, type Portal } from './empleados.ts';
import { PLANTILLAS, type Novedad, type Plantilla } from './novedades.ts';
import type * as AC from './acceso.ts';
import type { MensajeGuardado, ResumenConversacion, TarjetaGuardada } from './conversaciones.ts';
import { describirEquipo } from './acceso.ts';
import type { Conexion } from './oauth.ts';
import { ESTADOS, miniatura, type Categoria, type EstadoStock, type Producto } from './productos.ts';
import { ROLES, puede, type Rol } from './seguridad.ts';
import type { UsuarioPublico } from './usuarios.ts';

type H = HtmlEscapedString | Promise<HtmlEscapedString>;
export interface Contexto {
  usuario: UsuarioPublico | null;
  csrf: string;
  ruta: string;
  aviso?: { tipo: 'ok' | 'error'; texto: string } | null;
  /** Aviso fijo para administradores (configuración pendiente). */
  sistema?: string | null;
}
export const r = (p = '') => `${BASE}${p}`;
const si = (c: unknown, attr: string) => (c ? raw(attr) : '');

const ICONOS: Record<string, string> = {
  caja: '<path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  usuarios: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
  registro: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  salir: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  imagen: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  editar: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
  escanear: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M10 8v8M13 8v8M17 8v8"/>',
  noticia: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/>',
  arriba: '<path d="m18 15-6-6-6 6"/>',
  abajo: '<path d="m6 9 6 6 6-6"/>',
  ojo: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  ojoNo: '<path d="M9.9 4.2A10 10 0 0 1 12 4c7 0 10 8 10 8a13 13 0 0 1-1.7 2.7M6.6 6.6A13 13 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20"/>',
  deshacer: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  basura: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  llave: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  chispa: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/>',
  enviar: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  luna: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  empleados: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="11" r="2.5"/><path d="M5.5 17a3.5 3.5 0 0 1 7 0M15 9h3M15 13h3"/>',
  'flecha-externa': '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  izquierda: '<path d="m15 18-6-6 6-6"/>',
  pausa: '<path d="M9 5v14M15 5v14"/>',
  recibo: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2Z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  derecha: '<path d="m9 18 6-6-6-6"/>',
};
export const icono = (n: string, t = 18) => raw(`<svg class="i" width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[n] ?? ''}</svg>`);

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-UY', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Montevideo' }) : '—');
export const csrfCampo = (c: Contexto) => html`<input type="hidden" name="_csrf" value="${c.csrf}">`;
const etiquetaCodigo = 'Código interno COPOL';

function cabeza(titulo: string) {
  return html`<!doctype html>
<html lang="es-UY" data-base="${BASE}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<title>${titulo} · Panel de stock COPOL</title>
<link rel="stylesheet" href="/panel-recursos/panel.css">
<link rel="icon" href="/favicon.png">
<script src="/panel-recursos/tema.js"></script>
<script src="/panel-recursos/panel.js" defer></script>
</head>`;
}

/** Alterna claro/oscuro; lo activa tema.js (sin JavaScript queda oculto). */
const botonTema = (clase: string) =>
  html`<button type="button" class="${clase}" data-tema-boton aria-pressed="false" hidden>${raw(icono('luna', 16).toString().replace('class="i"', 'class="i i--luna"'))}${raw(icono('sol', 16).toString().replace('class="i"', 'class="i i--sol"'))}<span data-tema-texto>Modo oscuro</span></button>`;

const alerta = (a: Contexto['aviso']) =>
  a ? html`<div class="alert alert--${a.tipo}" role="${a.tipo === 'error' ? 'alert' : 'status'}" data-aviso>${icono(a.tipo === 'ok' ? 'check' : 'info')}<p>${a.texto}</p></div>` : '';

export function layout(c: Contexto, titulo: string, cuerpo: H, acciones: H | '' = '') {
  const u = c.usuario!;
  const activo = (p: string) => (p === '/productos' ? c.ruta === r() || c.ruta.startsWith(r('/productos')) || c.ruta.startsWith(r('/?')) : c.ruta.startsWith(r(p)));
  const item = (p: string, texto: string, ic: string) => html`<a href="${r(p === '/productos' ? '' : p)}" class="nav__item" ${si(activo(p), 'aria-current="page"')}>${icono(ic)}<span>${texto}</span></a>`;
  return html`${cabeza(titulo)}
<body class="app">
<a class="saltar" href="#contenido">Saltar al contenido</a>
<aside class="sidebar" aria-label="Panel">
  <div class="sidebar__marca"><img src="/panel-recursos/logo-copol.svg" alt="COPOL" width="78" height="32"><span>Stock Bazar</span></div>
  <details class="sidebar__menu" data-menu open>
    <summary class="btn btn--ghost btn--icono" aria-label="Menú">${icono('menu', 20)}</summary>
    <nav class="nav">
      ${item('/productos', 'Inventario', 'caja')}
      ${puede(u.rol, 'productos') ? item('/nuevo', 'Agregar producto', 'mas') : ''}
      ${puede(u.rol, 'novedades') ? item('/novedades', 'Novedades', 'noticia') : ''}
      ${puede(u.rol, 'usuarios') ? item('/usuarios', 'Usuarios', 'usuarios') : ''}
      ${puede(u.rol, 'auditoria') ? item('/registro', 'Registro', 'registro') : ''}
      ${puede(u.rol, 'auditoria') ? item('/accesos', 'Accesos', 'escudo') : ''}
      ${puede(u.rol, 'asistente') ? item('/asistente', 'Asistente', 'chispa') : ''}
      ${item('/empleados', 'Información empleados', 'empleados')}
    </nav>
    <div class="sidebar__pie">
      <a href="${r('/perfil')}" class="perfil" ${si(c.ruta.startsWith(r('/perfil')), 'aria-current="page"')}>
        <span class="avatar" aria-hidden="true">${u.usuario.slice(0, 1).toUpperCase()}</span>
        <span class="perfil__texto"><strong>${u.usuario}</strong><small>${ROLES[u.rol].nombre}</small></span>
      </a>
      ${botonTema('btn btn--ghost btn--sm btn--bloque')}
      <form method="post" action="${r('/salir')}">${csrfCampo(c)}<button class="btn btn--ghost btn--sm btn--bloque" type="submit">${icono('salir', 16)}Cerrar sesión</button></form>
    </div>
  </details>
</aside>
<main id="contenido" class="main">
  <header class="main__cabecera"><h1>${titulo}</h1>${acciones ? html`<div class="main__acciones">${acciones}</div>` : ''}</header>
  ${c.sistema ? html`<div class="alert alert--error" role="status">${icono('info')}<p>${c.sistema}</p></div>` : ''}
  ${alerta(c.aviso)}
  ${cuerpo}
</main>
</body>
</html>`;
}

/** Páginas sin barra lateral (ingreso y cambio obligatorio de contraseña). */
function pantallaSimple(c: Contexto, titulo: string, cuerpo: H) {
  return html`${cabeza(titulo)}
<body class="simple">${botonTema('btn btn--outline btn--sm tema-flotante')}<main id="contenido" class="simple__caja card">
  <img src="/panel-recursos/logo-copol.svg" alt="COPOL" width="110" height="46">
  ${alerta(c.aviso)}
  ${cuerpo}
</main></body></html>`;
}

export const badgeEstado = (e: EstadoStock, cantidad: number | null = null) =>
  html`<span class="badge badge--${e}">${icono(e === 'con-stock' ? 'check' : e === 'sin-stock' ? 'x' : 'info', 14)}${ESTADOS[e]}${cantidad != null ? html` · ${cantidad} u.` : ''}</span>`;

// ── Ingreso y contraseña ──
export function vistaIngreso(c: Contexto, error: string | null, usuario = '') {
  return pantallaSimple(c, 'Ingresar', html`
  <div><h1 class="titulo">Panel de stock</h1><p class="muted">Ingresá con tu usuario o correo.</p></div>
  ${error ? html`<div class="alert alert--error" role="alert">${icono('info')}<p>${error}</p></div>` : ''}
  <form method="post" action="${r('/ingresar')}" class="form">
    ${csrfCampo(c)}
    <label class="campo"><span class="label">Usuario o correo</span><input class="input" name="usuario" autocomplete="username" required maxlength="120" value="${usuario}" autofocus></label>
    <label class="campo"><span class="label">Contraseña</span><input class="input" type="password" name="clave" autocomplete="current-password" required maxlength="200"></label>
    <button class="btn btn--lg btn--bloque" type="submit">Ingresar</button>
  </form>`);
}

const formClave = (c: Contexto, accion: string) => html`<form method="post" action="${accion}" class="form">
  ${csrfCampo(c)}
  <input type="text" name="usuario" autocomplete="username" value="${c.usuario?.usuario ?? ''}" hidden>
  <label class="campo"><span class="label">Contraseña actual</span><input class="input" type="password" name="actual" autocomplete="current-password" required maxlength="200"></label>
  <label class="campo"><span class="label">Contraseña nueva</span><input class="input" type="password" name="nueva" autocomplete="new-password" required minlength="10" maxlength="200" aria-describedby="ayuda-clave"><span id="ayuda-clave" class="ayuda">Mínimo 10 caracteres.</span></label>
  <label class="campo"><span class="label">Repetí la contraseña nueva</span><input class="input" type="password" name="repetir" autocomplete="new-password" required maxlength="200"></label>
  <button class="btn" type="submit">Guardar contraseña</button>
</form>`;

export function vistaCambioObligatorio(c: Contexto, error: string | null) {
  return pantallaSimple(c, 'Elegí una contraseña', html`
  <div><h1 class="titulo">Elegí una contraseña nueva</h1><p class="muted">Tu contraseña es temporal.</p></div>
  ${error ? html`<div class="alert alert--error" role="alert">${icono('info')}<p>${error}</p></div>` : ''}
  ${formClave(c, r('/perfil/clave'))}`);
}

export interface ErroresPerfil { clave?: string; correo?: string; pin?: string }
export function vistaPerfil(c: Contexto, errores: ErroresPerfil, d: { conector: { url: string; conexiones: Conexion[] } | null; correoActivo: boolean }) {
  const u = c.usuario!;
  const err = (k: keyof ErroresPerfil) => (errores[k] ? html`<div class="alert alert--error" role="alert">${icono('info')}<p>${errores[k]}</p></div>` : '');
  const campoClave = html`<label class="campo"><span class="label">Tu contraseña actual</span><input class="input" type="password" name="clave" autocomplete="current-password" required maxlength="200"></label>`;
  return layout(c, 'Mi perfil', html`
<div class="grid-2">
  <section class="card"><h2 class="card__titulo">Cuenta</h2>
    <dl class="datos"><dt>Usuario</dt><dd>${u.usuario}</dd><dt>Rol</dt><dd>${ROLES[u.rol].nombre}</dd><dt>Correo</dt><dd>${u.correo ?? 'Sin correo'}</dd><dt>Último acceso</dt><dd>${fecha(u.ultimo_acceso)}</dd></dl>
  </section>
  <section class="card"><h2 class="card__titulo">Cambiar contraseña</h2>
    ${err('clave')}
    ${formClave(c, r('/perfil/clave'))}
  </section>
  <section class="card form" aria-labelledby="correo-titulo"><h2 class="card__titulo" id="correo-titulo">Correo de verificación</h2>
    <p class="muted">Al ingresar desde un equipo nuevo te pedimos este correo y te mandamos un código de 6 números.${d.correoActivo ? '' : ' (El envío de correos todavía no está configurado.)'}</p>
    ${err('correo')}
    <form method="post" action="${r('/perfil/correo')}" class="form">
      ${csrfCampo(c)}
      <label class="campo"><span class="label">Correo</span><input class="input" type="email" name="correo" autocomplete="email" required maxlength="160" value="${u.correo ?? ''}"></label>
      ${campoClave}
      <button class="btn btn--outline" type="submit">Guardar correo</button>
    </form>
  </section>
  ${puede(u.rol, 'usuarios') ? html`<section class="card form" aria-labelledby="pin-titulo"><h2 class="card__titulo" id="pin-titulo">PIN de acceso al panel</h2>
    <p class="muted">Se pide antes del usuario y la contraseña en los equipos que no están recordados. Es uno solo para todo el equipo: al cambiarlo, compartilo de nuevo con quienes usan el panel.</p>
    ${err('pin')}
    <form method="post" action="${r('/perfil/pin')}" class="form">
      ${csrfCampo(c)}
      <div class="fila">
        <label class="campo"><span class="label">PIN nuevo</span><input class="input input--pin" type="password" name="pin" inputmode="numeric" pattern="\\d{6}" minlength="6" maxlength="6" autocomplete="off" required></label>
        <label class="campo"><span class="label">Repetí el PIN</span><input class="input input--pin" type="password" name="repetir" inputmode="numeric" pattern="\\d{6}" minlength="6" maxlength="6" autocomplete="off" required></label>
      </div>
      ${campoClave}
      <button class="btn btn--outline" type="submit">Cambiar PIN</button>
    </form>
  </section>` : ''}
</div>
${d.conector ? html`<section class="card form" aria-labelledby="claude-titulo">
  <h2 class="card__titulo" id="claude-titulo">Conexión con Claude</h2>
  <p class="muted">Desde la app de Claude podés consultar el stock y cambiarlo (si tu rol lo permite). Para conectarla, en Claude: Configuración → Conectores → Agregar conector personalizado, con esta dirección:</p>
  <p><code class="url-conector">${d.conector.url}</code></p>
  ${d.conector.conexiones.length ? html`<ul class="conexiones">${d.conector.conexiones.map((x) => html`<li class="conexion">
      <span><strong>${x.nombre ?? 'Claude'}</strong><small class="muted">Conectado desde ${fecha(x.desde)} · último uso ${fecha(x.ultimo_uso)}</small></span>
      <form method="post" action="${r(`/perfil/claude/${encodeURIComponent(x.cliente_id)}/desconectar`)}" data-confirmar="¿Desconectar a Claude? Dejará de poder consultar y cambiar el stock.">${csrfCampo(c)}<button class="btn btn--outline btn--sm" type="submit">Desconectar</button></form>
    </li>`)}</ul>` : html`<p class="muted">No hay ninguna conexión activa.</p>`}
</section>` : ''}`);
}

// ── PIN de entrada y verificación por correo ──
export function vistaPin(c: Contexto, error: string | null, volver: string) {
  return pantallaSimple(c, 'Acceso restringido', html`
  <div><h1 class="titulo">Acceso restringido</h1><p class="muted">Ingresá el PIN de 6 números del panel.</p></div>
  ${error ? html`<div class="alert alert--error" role="alert">${icono('info')}<p>${error}</p></div>` : ''}
  <form method="post" action="${r('/pin')}${volver ? `?volver=${encodeURIComponent(volver)}` : ''}" class="form">
    ${csrfCampo(c)}
    <label class="campo"><span class="label">PIN</span><input class="input input--pin" type="password" name="pin" inputmode="numeric" pattern="\\d{6}" minlength="6" maxlength="6" autocomplete="off" required autofocus></label>
    <button class="btn btn--lg btn--bloque" type="submit">Continuar</button>
  </form>`);
}

export function vistaCrearPin(c: Contexto, error: string | null) {
  return pantallaSimple(c, 'Creá el PIN de acceso', html`
  <div><h1 class="titulo">Creá el PIN de acceso</h1><p class="muted">Desde ahora, quien abra el panel en un equipo que no esté recordado tendrá que escribir este PIN antes del usuario y la contraseña. Es uno solo para todo el equipo de COPOL: compartilo solo con quienes usan el panel.</p></div>
  ${error ? html`<div class="alert alert--error" role="alert">${icono('info')}<p>${error}</p></div>` : ''}
  <form method="post" action="${r('/pin/crear')}" class="form">
    ${csrfCampo(c)}
    <label class="campo"><span class="label">PIN de 6 números</span><input class="input input--pin" type="password" name="pin" inputmode="numeric" pattern="\\d{6}" minlength="6" maxlength="6" autocomplete="off" required autofocus><span class="ayuda">Evitá números repetidos o seguidos (como 111111 o 123456).</span></label>
    <label class="campo"><span class="label">Repetí el PIN</span><input class="input input--pin" type="password" name="repetir" inputmode="numeric" pattern="\\d{6}" minlength="6" maxlength="6" autocomplete="off" required></label>
    <label class="campo"><span class="label">Tu contraseña actual</span><input class="input" type="password" name="clave" autocomplete="current-password" required maxlength="200"></label>
    <button class="btn btn--lg btn--bloque" type="submit">Guardar PIN</button>
  </form>
  <form method="post" action="${r('/salir')}">${csrfCampo(c)}<button class="btn btn--ghost btn--sm btn--bloque" type="submit">Cerrar sesión</button></form>`);
}

export function vistaVerificar(c: Contexto, d: { paso: 'correo' | 'codigo'; correo: string | null; espera: number; puedeReenviar: boolean }, error: string | null) {
  const alertaError = error ? html`<div class="alert alert--error" role="alert">${icono('info')}<p>${error}</p></div>` : '';
  if (d.paso === 'correo') {
    return pantallaSimple(c, 'Verificá tu identidad', html`
  <div><h1 class="titulo">Verificá que sos vos</h1><p class="muted">Escribí el correo de tu cuenta y te mandamos un código de 6 números.</p></div>
  ${alertaError}
  <form method="post" action="${r('/verificar/correo')}" class="form">
    ${csrfCampo(c)}
    <label class="campo"><span class="label">Correo</span><input class="input" type="email" name="correo" autocomplete="email" required maxlength="160" autofocus></label>
    <button class="btn btn--lg btn--bloque" type="submit">Enviar código</button>
  </form>
  <a class="btn btn--ghost btn--sm" href="${r('/ingresar')}">Volver al ingreso</a>`);
  }
  return pantallaSimple(c, 'Código de verificación', html`
  <div><h1 class="titulo">Revisá tu correo</h1><p class="muted">Te mandamos un código de 6 números a <strong>${d.correo}</strong>. Vence en 10 minutos; si no lo ves, revisá la carpeta de spam.</p></div>
  ${alertaError}
  <form method="post" action="${r('/verificar/codigo')}" class="form">
    ${csrfCampo(c)}
    <label class="campo"><span class="label">Código</span><input class="input input--pin" name="codigo" inputmode="numeric" pattern="\\d{6}" minlength="6" maxlength="6" autocomplete="one-time-code" required autofocus></label>
    <label class="check"><input type="checkbox" name="recordar" value="1" checked><span>Recordar este equipo por 30 días (no volver a pedir el PIN ni el código)</span></label>
    <p class="ayuda">Desmarcalo si la computadora o el celular es compartido.</p>
    <button class="btn btn--lg btn--bloque" type="submit">Ingresar</button>
  </form>
  ${d.puedeReenviar ? html`<form method="post" action="${r('/verificar/reenviar')}">${csrfCampo(c)}<button class="btn btn--ghost btn--sm btn--bloque" type="submit">${d.espera > 0 ? `Reenviar código (disponible en ${d.espera} s)` : 'Reenviar código'}</button></form>` : ''}`);
}

/** Pantalla de permiso para el conector de Claude (OAuth). */
export function vistaAutorizarClaude(c: Contexto, d: { id: string; cliente: string; destino: string; puedeCambiar: boolean }) {
  const u = c.usuario!;
  return layout(c, 'Conectar Claude', html`
<section class="card form autorizar">
  <h2 class="card__titulo">${d.cliente} quiere usar tu panel de stock</h2>
  <p>Vas a conectar la app de Claude con tu usuario <strong>${u.usuario}</strong> (${ROLES[u.rol].nombre}). Después volvés a <strong>${d.destino}</strong>.</p>
  <div class="grid-2">
    <div><h3 class="label">Podrá</h3><ul class="lista-permisos lista-permisos--si">
      <li>Buscar productos y ver su stock y cantidad</li>
      <li>Ver las categorías y los últimos cambios</li>
      ${d.puedeCambiar ? html`<li><strong>Cambiar el stock y la cantidad</strong> de uno o varios productos (queda en el Registro)</li>` : ''}
    </ul></div>
    <div><h3 class="label">No podrá</h3><ul class="lista-permisos lista-permisos--no">
      ${d.puedeCambiar ? '' : html`<li>Cambiar el stock (tu rol solo permite consultar)</li>`}
      <li>Cambiar nombres, descripciones, imágenes o precios</li>
      <li>Ver ni cambiar usuarios o contraseñas</li>
      <li>Tocar novedades, el sitio o su código</li>
    </ul></div>
  </div>
  <p class="muted">Podés desconectarlo cuando quieras desde Mi perfil. Claude nunca ve tu contraseña.</p>
  <div class="acciones-form">
    <form method="post" action="${r(`/oauth/autorizar/${d.id}`)}">${csrfCampo(c)}<input type="hidden" name="accion" value="cancelar"><button class="btn btn--ghost" type="submit">Cancelar</button></form>
    <form method="post" action="${r(`/oauth/autorizar/${d.id}`)}">${csrfCampo(c)}<input type="hidden" name="accion" value="permitir"><button class="btn" type="submit">${icono('check', 16)}Permitir</button></form>
  </div>
</section>`);
}

// ── Inventario ──
export function vistaProductos(
  c: Contexto,
  datos: { items: Producto[]; total: number; pagina: number; paginas: number },
  categorias: Categoria[],
  resumen: { total: number; 'con-stock': number; 'sin-stock': number; 'sin-dato': number },
  f: { q: string; categoria: string; estado: string },
) {
  const editable = c.usuario ? puede(c.usuario.rol, 'stock') : false;
  const qs = (cambios: Record<string, string>) => {
    const p = new URLSearchParams({ ...(f.q && { q: f.q }), ...(f.categoria && { categoria: f.categoria }), ...(f.estado && { estado: f.estado }), ...cambios });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    const s = p.toString();
    return r(s ? `/productos?${s}` : '/productos');
  };
  const tab = (valor: string, texto: string, n: number) => html`<a class="tabs__item" href="${qs({ estado: valor, pagina: '' })}" ${si(f.estado === valor, 'aria-current="true"')}>${texto}<span class="tabs__n">${n.toLocaleString('es-UY')}</span></a>`;
  return layout(c, 'Inventario', html`
<nav class="tabs" aria-label="Filtrar por stock">
  ${tab('', 'Todos', resumen.total)}${tab('con-stock', 'Con stock', resumen['con-stock'])}${tab('sin-stock', 'Sin stock', resumen['sin-stock'])}${resumen['sin-dato'] ? tab('sin-dato', 'Sin dato', resumen['sin-dato']) : ''}
</nav>
<form class="toolbar" method="get" action="${r('/productos')}" role="search">
  ${f.estado ? html`<input type="hidden" name="estado" value="${f.estado}">` : ''}
  <label class="toolbar__buscar"><span class="sr">Buscar</span>${icono('buscar', 16)}<input class="input" type="search" name="q" value="${f.q}" placeholder="Buscar por código interno, nombre o marca" maxlength="80"></label>
  <label><span class="sr">Categoría</span><select class="input" name="categoria" data-autoenvio>
    <option value="">Todas las categorías</option>${categorias.map((cat) => html`<option value="${cat.id}" ${si(cat.id === f.categoria, 'selected')}>${cat.nombre} (${cat.total ?? 0})</option>`)}
  </select></label>
  <button class="btn btn--outline" type="submit">Buscar</button>
  ${f.q || f.categoria ? html`<a class="btn btn--ghost" href="${qs({ q: '', categoria: '', pagina: '' })}">Limpiar</a>` : ''}
</form>
<p class="resultado" role="status">${datos.total.toLocaleString('es-UY')} ${datos.total === 1 ? 'producto' : 'productos'}${datos.paginas > 1 ? ` · página ${datos.pagina} de ${datos.paginas}` : ''}</p>
${datos.items.length
  ? html`<div class="tabla-caja"><table class="tabla">
  <thead><tr><th scope="col"><span class="sr">Imagen</span></th><th scope="col">Producto</th><th scope="col" class="ocultar-movil">Categoría</th><th scope="col">Stock</th>${editable ? html`<th scope="col"><span class="sr">Cambiar stock</span></th>` : ''}</tr></thead>
  <tbody>${datos.items.map((p) => {
    const img = p.imagen_publicable ? miniatura(p.imagen) : null;
    return html`<tr id="p-${p.id}">
    <td class="tabla__img">${img ? html`<img src="${img}" alt="" width="48" height="48" loading="lazy">` : html`<span class="sin-img">${icono('imagen', 18)}</span>`}</td>
    <td><a class="tabla__nombre" href="${r(`/productos/${encodeURIComponent(p.id)}`)}">${p.nombre}</a><span class="tabla__sub">${p.codigo ? `${etiquetaCodigo} ${p.codigo}` : `Sin ${etiquetaCodigo.toLowerCase()}`}</span></td>
    <td class="ocultar-movil">${p.categoria_nombre}${p.subcategoria ? html`<span class="tabla__sub">${p.subcategoria}</span>` : ''}</td>
    <td data-estado>${badgeEstado(p.stock_estado, p.stock_cantidad)}</td>
    ${editable ? html`<td class="tabla__accion">${formStock(c, p)}</td>` : ''}
  </tr>`;
  })}</tbody></table></div>`
  : html`<div class="card vacio"><p><strong>No hay productos con esos filtros.</strong></p><a class="btn btn--outline" href="${r('/productos')}">Ver todos</a></div>`}
${datos.paginas > 1 ? html`<nav class="paginacion" aria-label="Páginas">
  ${datos.pagina > 1 ? html`<a class="btn btn--outline btn--sm" href="${qs({ pagina: String(datos.pagina - 1) })}">Anterior</a>` : ''}
  <span>Página ${datos.pagina} de ${datos.paginas}</span>
  ${datos.pagina < datos.paginas ? html`<a class="btn btn--outline btn--sm" href="${qs({ pagina: String(datos.pagina + 1) })}">Siguiente</a>` : ''}
</nav>` : ''}`, c.usuario && puede(c.usuario.rol, 'productos') ? html`<a class="btn" href="${r('/nuevo')}">${icono('mas')}Agregar producto</a>` : '');
}

/** Cambio rápido: sí/no cuando la cantidad se desconoce, o una cantidad cuando se conoce. */
export const formStock = (c: Contexto, p: Producto) => html`<form class="stock" method="post" action="${r(`/productos/${encodeURIComponent(p.id)}/stock`)}" data-stock>
  ${csrfCampo(c)}<input type="hidden" name="version" value="${p.version}"><input type="hidden" name="volver" value="${c.ruta}">
  <div class="segmento" role="radiogroup" aria-label="Stock de ${p.nombre}">
    <label class="segmento__op segmento__op--ok"><input type="radio" name="estado" value="con-stock" ${si(p.stock_estado === 'con-stock', 'checked')}><span>Con stock</span></label>
    <label class="segmento__op segmento__op--gris"><input type="radio" name="estado" value="sin-stock" ${si(p.stock_estado === 'sin-stock', 'checked')}><span>Sin stock</span></label>
  </div>
  <label><span class="sr">Cantidad de ${p.nombre} (opcional)</span><input class="input input--cant" type="number" name="cantidad" min="0" max="100000" step="1" inputmode="numeric" placeholder="Cant." value="${p.stock_cantidad ?? ''}"></label>
  <button class="btn btn--sm" type="submit">Guardar</button>
  <span class="stock__nota" role="status" aria-live="polite"></span>
</form>`;

// ── Alta y edición de productos ──
export function vistaFormProducto(c: Contexto, modo: 'nuevo' | 'editar', p: Partial<Producto> & { version?: number }, categorias: Categoria[], errores: Record<string, string>, historial: Evento[] = []) {
  const editable = c.usuario ? puede(c.usuario.rol, 'productos') : false;
  const stockEditable = c.usuario ? puede(c.usuario.rol, 'stock') : false;
  const err = (k: string) => (errores[k] ? html`<span class="error" id="err-${k}">${errores[k]}</span>` : '');
  const inv = (k: string) => (errores[k] ? raw(`aria-invalid="true" aria-describedby="err-${k}"`) : '');
  const des = si(!editable, 'disabled');
  const img = p.imagen && p.imagen_publicable !== 0 ? miniatura(p.imagen) : null;
  const accion = modo === 'nuevo' ? r('/nuevo') : r(`/productos/${encodeURIComponent(p.id ?? '')}`);
  return layout(c, modo === 'nuevo' ? 'Agregar producto' : 'Editar producto', html`
${modo === 'editar' ? html`<p class="muted subtitulo">${p.nombre} · ${p.origen === 'importado' ? 'importado del catálogo' : 'agregado en el panel'} · actualizado ${fecha(p.actualizado_en ?? null)}${p.actualizado_por ? ` por ${p.actualizado_por}` : ''}</p>` : ''}
${Object.keys(errores).length ? html`<div class="alert alert--error" role="alert">${icono('info')}<p>Revisá los campos marcados.</p></div>` : ''}
<form method="post" action="${accion}" enctype="multipart/form-data" novalidate class="grid-form">
  ${csrfCampo(c)}${modo === 'editar' ? html`<input type="hidden" name="version" value="${p.version}">` : ''}
  <div class="col">
    <section class="card form"><h2 class="card__titulo">Datos del producto</h2>
      <div class="campo">
        <label class="label" for="codigo">${etiquetaCodigo}</label>
        <div class="input-grupo">
          <input class="input" id="codigo" name="codigo" value="${p.codigo ?? ''}" maxlength="20" autocomplete="off" ${inv('codigo')} ${des} data-campo-codigo>
          ${editable ? html`<button type="button" class="btn btn--outline" data-escanear aria-controls="escaner">${icono('escanear')}<span>Escanear código</span></button>` : ''}
        </div>
        ${err('codigo')}<span class="ayuda" data-escaner-estado role="status"></span>
      </div>
      <label class="campo"><span class="label">Nombre</span><input class="input" name="nombre" value="${p.nombre ?? ''}" required maxlength="160" ${inv('nombre')} ${des}>${err('nombre')}</label>
      <div class="fila">
        <label class="campo"><span class="label">Categoría</span><select class="input" name="categoria" required ${inv('categoria')} ${des}>
          <option value="">Elegí una categoría</option>${categorias.map((cat) => html`<option value="${cat.id}" ${si(cat.id === p.categoria_id, 'selected')}>${cat.nombre}</option>`)}
        </select>${err('categoria')}</label>
        <label class="campo"><span class="label">Marca <span class="opcional">(opcional)</span></span><input class="input" name="marca" value="${p.marca ?? ''}" maxlength="60" ${des}></label>
      </div>
      <label class="campo"><span class="label">Descripción <span class="opcional">(opcional, sin precios)</span></span><textarea class="input" name="descripcion" rows="5" maxlength="4000" ${inv('descripcion')} ${des}>${p.descripcion ?? ''}</textarea>${err('descripcion')}</label>
    </section>
  </div>
  <div class="col">
    <section class="card form"><h2 class="card__titulo">Stock</h2>
      <div class="segmento segmento--grande" role="radiogroup" aria-label="Stock">
        <label class="segmento__op segmento__op--ok"><input type="radio" name="estado" value="con-stock" ${si(p.stock_estado === 'con-stock', 'checked')} ${si(!stockEditable, 'disabled')}><span>Con stock</span></label>
        <label class="segmento__op segmento__op--gris"><input type="radio" name="estado" value="sin-stock" ${si(p.stock_estado === 'sin-stock', 'checked')} ${si(!stockEditable, 'disabled')}><span>Sin stock</span></label>
      </div>
      <label class="campo"><span class="label">Cantidad <span class="opcional">(si se conoce)</span></span><input class="input input--cant" type="number" name="cantidad" min="0" max="100000" step="1" value="${p.stock_cantidad ?? ''}" ${inv('cantidad')} ${si(!stockEditable, 'disabled')}></label>
      ${err('estado')}${err('cantidad')}
    </section>
    <section class="card form"><h2 class="card__titulo">Imagen</h2>
      <div class="vista-imagen">${img ? html`<img src="${img}" alt="Imagen actual" data-vista-img>` : html`<div class="sin-img sin-img--grande" data-vista-vacio>${icono('imagen', 28)}<span>Sin imagen</span></div><img alt="" hidden data-vista-img>`}</div>
      ${editable ? html`<label class="campo"><span class="label">${img ? 'Cambiar imagen' : 'Subir imagen'}</span><input class="input" type="file" name="imagen" accept="image/jpeg,image/png,image/webp,image/avif" ${inv('imagen')} data-vista-previa><span class="ayuda">JPG, PNG, WebP o AVIF · máx. 5 MB</span>${err('imagen')}</label>` : ''}
    </section>
    ${editable || stockEditable ? html`<div class="acciones-form"><button class="btn btn--lg" type="submit">${modo === 'nuevo' ? 'Agregar producto' : 'Guardar cambios'}</button><a class="btn btn--ghost" href="${r('/productos')}">Cancelar</a></div>` : ''}
    ${historial.length ? html`<section class="card"><h2 class="card__titulo">Historial</h2><ol class="eventos">${historial.map(evento)}</ol></section>` : ''}
  </div>
</form>
${dialogoEscaner()}`);
}

const dialogoEscaner = () => html`<dialog id="escaner" class="dialogo" aria-labelledby="escaner-titulo">
  <div class="dialogo__cabecera"><h2 id="escaner-titulo">Escanear código</h2><button type="button" class="btn btn--ghost btn--icono" data-cerrar-escaner aria-label="Cerrar">${icono('x')}</button></div>
  <div class="escaner__video"><video playsinline muted></video><span class="escaner__marco" aria-hidden="true"></span></div>
  <p class="ayuda" data-escaner-mensaje role="status">Apuntá la cámara al código de barras.</p>
  <button type="button" class="btn btn--outline btn--bloque" data-cerrar-escaner>Cancelar e ingresar a mano</button>
</dialog>`;

const evento = (e: Evento) => {
  let det = '';
  try {
    const d = e.detalle ? JSON.parse(e.detalle) : null;
    if (d?.nombre) det = d.nombre;
    if (d?.titulo) det = d.titulo;
    if (d?.cambios?.stock_estado) det += ` · ${ESTADOS[d.cambios.stock_estado[0] as EstadoStock] ?? '—'} → ${ESTADOS[d.cambios.stock_estado[1] as EstadoStock] ?? '—'}`;
    if (d?.usuario && !det) det = d.usuario;
  } catch { /* detalle no legible */ }
  return html`<li><span class="eventos__fecha">${fecha(e.fecha)} · ${e.usuario ?? 'sistema'}</span><span>${ACCIONES[e.accion] ?? e.accion}${det ? html` — ${det}` : ''}</span></li>`;
};

// ── Novedades ──
const nombrePlantilla = (p: Plantilla) => PLANTILLAS[p].nombre;
export function vistaNovedades(c: Contexto, lista: Novedad[], imgUrl: (n: Novedad) => string | null) {
  return layout(c, 'Novedades', html`
<p class="muted subtitulo">Las publicadas aparecen en la portada en este orden.</p>
${lista.length
  ? html`<ol class="novedades">${lista.map((n, i) => {
    const img = imgUrl(n);
    return html`<li class="card novedad">
      <div class="novedad__orden">
        <form method="post" action="${r(`/novedades/${n.id}/mover`)}">${csrfCampo(c)}<input type="hidden" name="direccion" value="arriba"><button class="btn btn--ghost btn--icono" type="submit" aria-label="Subir ${n.titulo}" ${si(i === 0, 'disabled')}>${icono('arriba')}</button></form>
        <span class="novedad__n">${i + 1}</span>
        <form method="post" action="${r(`/novedades/${n.id}/mover`)}">${csrfCampo(c)}<input type="hidden" name="direccion" value="abajo"><button class="btn btn--ghost btn--icono" type="submit" aria-label="Bajar ${n.titulo}" ${si(i === lista.length - 1, 'disabled')}>${icono('abajo')}</button></form>
      </div>
      <div class="novedad__img">${img ? html`<img src="${img}" alt="" loading="lazy">` : html`<span class="sin-img">${icono('noticia', 20)}</span>`}</div>
      <div class="novedad__texto"><strong>${n.titulo}</strong><span class="muted">${nombrePlantilla(n.plantilla)}</span></div>
      ${n.publicado ? html`<span class="badge badge--con-stock">${icono('ojo', 14)}Publicada</span>` : html`<span class="badge badge--sin-stock">${icono('ojoNo', 14)}Borrador</span>`}
      <div class="novedad__acciones">
        <form method="post" action="${r(`/novedades/${n.id}/publicar`)}">${csrfCampo(c)}<input type="hidden" name="publicado" value="${n.publicado ? '0' : '1'}"><button class="btn btn--outline btn--sm" type="submit">${n.publicado ? 'Despublicar' : 'Publicar'}</button></form>
        <a class="btn btn--ghost btn--sm" href="${r(`/novedades/${n.id}`)}">${icono('editar', 16)}Editar</a>
      </div>
    </li>`;
  })}</ol>`
  : html`<div class="card vacio"><p><strong>Todavía no hay novedades.</strong></p></div>`}`, html`<a class="btn" href="${r('/novedades/nueva')}">${icono('mas')}Nueva novedad</a>`);
}

export function vistaFormNovedad(c: Contexto, n: Partial<Novedad>, errores: Record<string, string>, imgUrl: string | null) {
  const err = (k: string) => (errores[k] ? html`<span class="error" id="err-${k}">${errores[k]}</span>` : '');
  const inv = (k: string) => (errores[k] ? raw(`aria-invalid="true" aria-describedby="err-${k}"`) : '');
  const plantilla = n.plantilla ?? 'imagen-izquierda';
  const accion = n.id ? r(`/novedades/${n.id}`) : r('/novedades/nueva');
  return layout(c, n.id ? 'Editar novedad' : 'Nueva novedad', html`
${Object.keys(errores).length ? html`<div class="alert alert--error" role="alert">${icono('info')}<p>Revisá los campos marcados.</p></div>` : ''}
<form method="post" action="${accion}" enctype="multipart/form-data" novalidate class="grid-form" data-form-novedad>
  ${csrfCampo(c)}
  <div class="col">
    <section class="card form"><h2 class="card__titulo">Contenido</h2>
      <label class="campo"><span class="label">Título</span><input class="input" name="titulo" value="${n.titulo ?? ''}" required maxlength="120" ${inv('titulo')} data-prev="titulo">${err('titulo')}</label>
      <label class="campo"><span class="label">Texto <span class="opcional">(opcional)</span></span><textarea class="input" name="texto" rows="4" maxlength="600" ${inv('texto')} data-prev="texto">${n.texto ?? ''}</textarea>${err('texto')}</label>
      <fieldset class="campo"><legend class="label">Plantilla</legend>
        <div class="plantillas">${(Object.keys(PLANTILLAS) as Plantilla[]).map((p) => html`<label class="plantilla">
          <input type="radio" name="plantilla" value="${p}" ${si(p === plantilla, 'checked')}>
          <span class="plantilla__dibujo plantilla__dibujo--${p}" aria-hidden="true"><i></i><b></b><b></b></span>
          <span class="plantilla__nombre">${nombrePlantilla(p)}</span>
        </label>`)}</div>${err('plantilla')}
      </fieldset>
      <div class="fila">
        <label class="campo"><span class="label">Texto del botón <span class="opcional">(opcional)</span></span><input class="input" name="enlace_texto" value="${n.enlace_texto ?? ''}" maxlength="40" placeholder="Ver más" ${inv('enlace_texto')} data-prev="boton">${err('enlace_texto')}</label>
        <label class="campo"><span class="label">Enlace del botón</span><input class="input" name="enlace_url" value="${n.enlace_url ?? ''}" maxlength="500" placeholder="/hipermercado/bazar/ o https://…" ${inv('enlace_url')}>${err('enlace_url')}</label>
      </div>
      <label class="check"><input type="checkbox" name="publicado" value="1" ${si(n.publicado, 'checked')}><span>Publicada en la portada</span></label>
    </section>
  </div>
  <div class="col">
    <section class="card form"><h2 class="card__titulo">Imagen</h2>
      <div class="vista-imagen vista-imagen--ancha">${imgUrl ? html`<img src="${imgUrl}" alt="" data-vista-img>` : html`<div class="sin-img sin-img--grande" data-vista-vacio>${icono('imagen', 28)}<span>Sin imagen</span></div><img alt="" hidden data-vista-img>`}</div>
      <label class="campo"><span class="label">${imgUrl ? 'Cambiar imagen' : 'Subir imagen'}</span><input class="input" type="file" name="imagen" accept="image/jpeg,image/png,image/webp,image/avif" ${inv('imagen')} data-vista-previa><span class="ayuda">JPG, PNG, WebP o AVIF · máx. 5 MB</span>${err('imagen')}</label>
      <label class="campo"><span class="label">Descripción de la imagen <span class="opcional">(para lectores de pantalla)</span></span><input class="input" name="imagen_alt" value="${n.imagen_alt ?? ''}" maxlength="160"></label>
    </section>
    <div class="acciones-form"><button class="btn btn--lg" type="submit">${n.id ? 'Guardar cambios' : 'Crear novedad'}</button><a class="btn btn--ghost" href="${r('/novedades')}">Cancelar</a></div>
  </div>
</form>
${n.id ? html`<form method="post" action="${r(`/novedades/${n.id}/eliminar`)}" class="zona-peligro" data-confirmar="¿Eliminar la novedad “${n.titulo}”?">${csrfCampo(c)}<button class="btn btn--peligro btn--sm" type="submit">${icono('basura', 16)}Eliminar novedad</button></form>` : ''}`);
}

// ── Usuarios ──
export function vistaUsuarios(c: Contexto, usuarios: UsuarioPublico[], errores: Record<string, string> = {}, previo: Record<string, string> = {}) {
  const err = (k: string) => (errores[k] ? html`<span class="error">${errores[k]}</span>` : '');
  return layout(c, 'Usuarios', html`
<div class="grid-usuarios">
<div class="tabla-caja"><table class="tabla">
<thead><tr><th scope="col">Usuario</th><th scope="col">Rol</th><th scope="col" class="ocultar-movil">Correo</th><th scope="col" class="ocultar-movil">Último acceso</th><th scope="col"><span class="sr">Acciones</span></th></tr></thead>
<tbody>${usuarios.map((u) => html`<tr>
  <td><strong>${u.usuario}</strong>${!u.activo ? html` <span class="badge badge--sin-stock">Desactivado</span>` : ''}${u.debe_cambiar_clave ? html` <span class="badge badge--sin-dato">Clave temporal</span>` : ''}</td>
  <td>${ROLES[u.rol].nombre}${u.protegido ? html` <span class="muted" title="Administrador principal">${icono('escudo', 14)}</span>` : ''}</td>
  <td class="ocultar-movil">${u.correo ?? html`<span class="badge badge--sin-dato">Sin correo</span>`}</td>
  <td class="ocultar-movil">${fecha(u.ultimo_acceso)}</td>
  <td class="derecha">${u.protegido || u.id === c.usuario?.id ? '' : html`<a class="btn btn--ghost btn--sm" href="${r(`/usuarios/${u.id}`)}">${icono('editar', 16)}Editar</a>`}</td>
</tr>`)}</tbody></table></div>
<section class="card form">
  <h2 class="card__titulo">Agregar usuario</h2>
  <form method="post" action="${r('/usuarios')}" class="form" novalidate>
    ${csrfCampo(c)}
    <label class="campo"><span class="label">Usuario o correo</span><input class="input" name="usuario" required maxlength="120" autocomplete="off" value="${previo.usuario ?? ''}">${err('usuario')}</label>
    <label class="campo"><span class="label">Correo <span class="opcional">(para el código de ingreso)</span></span><input class="input" type="email" name="correo" maxlength="160" autocomplete="off" value="${previo.correo ?? ''}"><span class="ayuda">Si el usuario ya es un correo, se usa ese.</span>${err('correo')}</label>
    <label class="campo"><span class="label">Rol</span><select class="input" name="rol">${(Object.keys(ROLES) as Rol[]).map((rr) => html`<option value="${rr}" ${si(rr === (previo.rol ?? 'visualizador'), 'selected')}>${ROLES[rr].nombre}</option>`)}</select>${err('rol')}</label>
    <label class="campo"><span class="label">Contraseña temporal</span><input class="input" type="password" name="clave" required minlength="10" maxlength="200" autocomplete="new-password">${err('clave')}</label>
    <button class="btn" type="submit">${icono('mas')}Agregar usuario</button>
  </form>
</section>
</div>`);
}

export function vistaEditarUsuario(c: Contexto, u: UsuarioPublico, errores: Record<string, string> = {}) {
  const err = (k: string) => (errores[k] ? html`<span class="error">${errores[k]}</span>` : '');
  return layout(c, u.usuario, html`
<div class="grid-2">
<section class="card form"><h2 class="card__titulo">Rol y acceso</h2>
<form method="post" action="${r(`/usuarios/${u.id}`)}" class="form">
  ${csrfCampo(c)}
  <label class="campo"><span class="label">Rol</span><select class="input" name="rol">${(Object.keys(ROLES) as Rol[]).map((rr) => html`<option value="${rr}" ${si(rr === u.rol, 'selected')}>${ROLES[rr].nombre}</option>`)}</select>${err('rol')}</label>
  <label class="campo"><span class="label">Correo (para el código de ingreso)</span><input class="input" type="email" name="correo" maxlength="160" autocomplete="off" value="${u.correo ?? ''}">${err('correo')}</label>
  <label class="check"><input type="checkbox" name="activo" value="1" ${si(u.activo, 'checked')}><span>Cuenta activa</span></label>
  <button class="btn" type="submit">Guardar</button>
</form></section>
<div class="col">
<section class="card form"><h2 class="card__titulo">Restablecer contraseña</h2>
<form method="post" action="${r(`/usuarios/${u.id}/clave`)}" class="form">
  ${csrfCampo(c)}
  <label class="campo"><span class="label">Contraseña temporal nueva</span><input class="input" type="password" name="clave" required minlength="10" maxlength="200" autocomplete="new-password">${err('clave')}</label>
  <button class="btn btn--outline" type="submit">Restablecer</button>
</form></section>
<form method="post" action="${r(`/usuarios/${u.id}/eliminar`)}" class="zona-peligro" data-confirmar="¿Eliminar a ${u.usuario}?">
  ${csrfCampo(c)}<button class="btn btn--peligro btn--sm" type="submit">${icono('basura', 16)}Eliminar usuario</button>
</form>
</div></div>`, html`<a class="btn btn--ghost" href="${r('/usuarios')}">Volver</a>`);
}

// ── Registro de cambios ──
export function vistaRegistro(c: Contexto, eventos: Evento[], pagina: number, hayMas: boolean) {
  return layout(c, 'Registro de cambios', html`
<div class="tabla-caja"><table class="tabla">
<thead><tr><th scope="col">Fecha</th><th scope="col">Usuario</th><th scope="col">Acción</th><th scope="col" class="ocultar-movil">Detalle</th></tr></thead>
<tbody>${eventos.map((e) => html`<tr><td class="nowrap">${fecha(e.fecha)}</td><td>${e.usuario ?? 'sistema'}</td><td>${ACCIONES[e.accion] ?? e.accion}</td><td class="detalle ocultar-movil">${e.detalle ?? ''}</td></tr>`)}</tbody>
</table></div>
<nav class="paginacion" aria-label="Páginas">${pagina > 1 ? html`<a class="btn btn--outline btn--sm" href="${r(`/registro?pagina=${pagina - 1}`)}">Más recientes</a>` : ''}<span>Página ${pagina}</span>${hayMas ? html`<a class="btn btn--outline btn--sm" href="${r(`/registro?pagina=${pagina + 1}`)}">Anteriores</a>` : ''}</nav>`);
}

// ── Accesos (solo administradores) ──
const detalleDe = (e: Evento): Record<string, unknown> => { try { return e.detalle ? JSON.parse(e.detalle) : {}; } catch { return {}; } };
const ipLugar = (ip: string | null, lugar: string | null) => html`<span class="ip">${ip ?? '—'}</span>${lugar ? html`<span class="tabla__sub">${lugar}</span>` : ''}`;
const NEGATIVOS = new Set(['sesion.ingreso-fallido', 'sesion.bloqueo', 'acceso.pin-fallido', 'acceso.pin-bloqueo', 'acceso.codigo-fallido', 'acceso.correo-incorrecto', 'acceso.sin-correo']);
export function vistaAccesos(c: Contexto, d: { sesiones: AC.SesionAbierta[]; equipos: AC.EquipoRecordado[]; eventos: Evento[]; hayMas: boolean; pagina: number; usuario: string; usuarios: string[]; sesionActual: string }) {
  const filtro = (p: number) => r(`/accesos?${new URLSearchParams({ ...(d.usuario ? { usuario: d.usuario } : {}), pagina: String(p) })}`);
  return layout(c, 'Accesos', html`
<p class="muted subtitulo">Quién ingresa al panel, con qué usuario, desde qué IP y equipo. La ubicación es aproximada (según la IP).</p>
<section class="seccion" aria-labelledby="s-sesiones"><h2 class="seccion__titulo" id="s-sesiones">Sesiones abiertas (${d.sesiones.length})</h2>
<div class="tabla-caja"><table class="tabla">
<thead><tr><th scope="col">Usuario</th><th scope="col">IP y lugar</th><th scope="col" class="ocultar-movil">Equipo</th><th scope="col" class="ocultar-movil">Ingresó</th><th scope="col">Última actividad</th><th scope="col"><span class="sr">Acciones</span></th></tr></thead>
<tbody>${d.sesiones.length ? d.sesiones.map((s) => html`<tr>
  <td><strong>${s.usuario}</strong><span class="tabla__sub">${ROLES[s.rol as Rol]?.nombre ?? s.rol}</span></td>
  <td>${ipLugar(s.ip, s.lugar)}</td>
  <td class="ocultar-movil">${describirEquipo(s.agente) ?? '—'}</td>
  <td class="ocultar-movil nowrap">${fecha(s.creada_en)}</td>
  <td class="nowrap">${fecha(s.ultima_actividad)}</td>
  <td class="derecha">${s.id_hash === d.sesionActual ? html`<span class="badge badge--con-stock">Esta sesión</span>` : html`<form method="post" action="${r(`/accesos/sesiones/${s.id_hash}/cerrar`)}" data-confirmar="¿Cerrar la sesión de ${s.usuario}?">${csrfCampo(c)}<button class="btn btn--outline btn--sm" type="submit">Cerrar sesión</button></form>`}</td>
</tr>`) : html`<tr><td colspan="6" class="muted">No hay sesiones abiertas.</td></tr>`}</tbody></table></div>
</section>
<section class="seccion" aria-labelledby="s-equipos"><h2 class="seccion__titulo" id="s-equipos">Equipos recordados (${d.equipos.length})</h2>
<p class="muted ayuda">En estos equipos no se pide el PIN ni el código por correo durante 30 días. Si alguno no te suena, olvidalo.</p>
<div class="tabla-caja"><table class="tabla">
<thead><tr><th scope="col">Usuario</th><th scope="col">IP y lugar al recordarlo</th><th scope="col" class="ocultar-movil">Equipo</th><th scope="col" class="ocultar-movil">Último uso</th><th scope="col">Vence</th><th scope="col"><span class="sr">Acciones</span></th></tr></thead>
<tbody>${d.equipos.length ? d.equipos.map((e) => html`<tr>
  <td><strong>${e.usuario}</strong></td>
  <td>${ipLugar(e.ip, e.lugar)}</td>
  <td class="ocultar-movil">${describirEquipo(e.agente) ?? '—'}</td>
  <td class="ocultar-movil nowrap">${fecha(e.ultimo_uso)}</td>
  <td class="nowrap">${fecha(e.expira_en)}</td>
  <td class="derecha"><form method="post" action="${r(`/accesos/equipos/${e.token_hash}/olvidar`)}" data-confirmar="¿Olvidar este equipo de ${e.usuario}? La próxima vez se le pedirán el PIN y el código.">${csrfCampo(c)}<button class="btn btn--outline btn--sm" type="submit">Olvidar</button></form></td>
</tr>`) : html`<tr><td colspan="6" class="muted">No hay equipos recordados.</td></tr>`}</tbody></table></div>
</section>
<section class="seccion" aria-labelledby="s-historial"><h2 class="seccion__titulo" id="s-historial">Historial de accesos</h2>
<form method="get" action="${r('/accesos')}" class="toolbar">
  <label class="campo"><span class="sr">Usuario</span><select class="input" name="usuario"><option value="">Todos los usuarios</option>${d.usuarios.map((u) => html`<option value="${u}" ${si(u === d.usuario, 'selected')}>${u}</option>`)}</select></label>
  <button class="btn btn--outline" type="submit">Filtrar</button>
</form>
<div class="tabla-caja"><table class="tabla">
<thead><tr><th scope="col">Fecha</th><th scope="col">Usuario</th><th scope="col">Evento</th><th scope="col">IP y lugar</th><th scope="col" class="ocultar-movil">Equipo</th></tr></thead>
<tbody>${d.eventos.length ? d.eventos.map((e) => {
    const det = detalleDe(e);
    const nota = [det.motivo, det.verificacion].filter((x) => typeof x === 'string').join(' · ');
    return html`<tr>
  <td class="nowrap">${fecha(e.fecha)}</td>
  <td>${e.usuario ?? html`<span class="muted">—</span>`}</td>
  <td><span class="${NEGATIVOS.has(e.accion) ? 'evento evento--malo' : 'evento'}">${ACCIONES[e.accion] ?? e.accion}</span>${nota ? html`<span class="tabla__sub">${nota}</span>` : ''}</td>
  <td>${ipLugar(e.ip, typeof det.lugar === 'string' ? det.lugar : null)}</td>
  <td class="ocultar-movil">${typeof det.equipo === 'string' ? det.equipo : '—'}</td>
</tr>`;
  }) : html`<tr><td colspan="5" class="muted">Sin registros.</td></tr>`}</tbody></table></div>
<nav class="paginacion" aria-label="Páginas">${d.pagina > 1 ? html`<a class="btn btn--outline btn--sm" href="${filtro(d.pagina - 1)}">Más recientes</a>` : ''}<span>Página ${d.pagina}</span>${d.hayMas ? html`<a class="btn btn--outline btn--sm" href="${filtro(d.pagina + 1)}">Anteriores</a>` : ''}</nav>
</section>`);
}

// ── Asistente (Claude vía Vercel AI Gateway; los cambios se aplican solo al confirmarlos) ──
export interface PropuestaVisible {
  id: string;
  expira: string;
  errores: string[];
  items: { codigo: string | null; nombre: string; cambios: { campo: string; antes: string; despues: string }[] }[];
}
/** Campo oculto con la conversación a la que pertenece cada acción (confirmar, cancelar, deshacer). */
const campoConversacion = (id: string) => (id ? html`<input type="hidden" name="conversacion" value="${id}">` : '');
const ESTADO_TARJETA: Record<Exclude<TarjetaGuardada['estado'], 'pendiente'>, string> = {
  aplicada: 'Aplicados', cancelada: 'Cancelados', reemplazada: 'Sin efecto',
};
/**
 * Tarjeta "antes → después". Pendiente y vigente: con Confirmar y Cancelar. En el historial, las ya
 * resueltas se muestran con su estado (el JavaScript del asistente arma la misma tarjeta).
 */
const tarjetaPropuesta = (c: Contexto, p: PropuestaVisible & { estado?: TarjetaGuardada['estado']; revierte?: string }, conversacionId: string, activa: boolean) => {
  const estado = p.estado === 'pendiente' && !activa ? 'reemplazada' : p.estado ?? 'pendiente';
  return html`<section class="propuesta ${estado === 'pendiente' ? '' : `propuesta--${estado}`}" data-propuesta aria-label="${p.revierte ? 'Vuelta atrás para confirmar' : 'Cambios para confirmar'}">
  <h2 class="propuesta__titulo">${icono(p.revierte ? 'deshacer' : 'editar', 16)}${p.revierte ? 'Deshacer' : estado === 'pendiente' ? 'Cambios para confirmar' : 'Cambios propuestos'} (${p.items.length})${estado !== 'pendiente' ? html`<span class="propuesta__estado">${ESTADO_TARJETA[estado]}</span>` : ''}</h2>
  <ul class="propuesta__lista">${p.items.map((i) => html`<li><strong>${i.nombre}</strong> <span class="muted">· ${etiquetaCodigo} ${i.codigo ?? '—'}</span>
    <ul>${i.cambios.map((x) => html`<li>${x.campo}: <span class="propuesta__antes">${x.antes}</span> → <strong>${x.despues}</strong></li>`)}</ul></li>`)}</ul>
  ${p.errores.length ? html`<div class="propuesta__errores"><strong>No incluidos:</strong><ul>${p.errores.map((e) => html`<li>${e}</li>`)}</ul></div>` : ''}
  ${estado === 'pendiente' ? html`<div class="propuesta__acciones">
    <form method="post" action="${r(`/asistente/propuestas/${p.id}`)}">${csrfCampo(c)}${campoConversacion(conversacionId)}<input type="hidden" name="accion" value="cancelar"><button class="btn btn--ghost btn--sm" type="submit">Cancelar</button></form>
    <form method="post" action="${r(`/asistente/propuestas/${p.id}`)}">${csrfCampo(c)}${campoConversacion(conversacionId)}<input type="hidden" name="accion" value="confirmar"><button class="btn btn--sm" type="submit">${icono('check', 16)}Confirmar cambios</button></form>
  </div>
  <p class="muted propuesta__nota">Nada se modifica hasta que confirmes. La propuesta vence en 15 minutos.</p>` : ''}
</section>`;
};

/** Flecha para deshacer los cambios que aplicó una respuesta (o la marca de que ya se deshicieron). */
const botonDeshacer = (c: Contexto, m: MensajeGuardado, conversacionId: string, puedeCambiar: boolean) => {
  if (!m.deshacer) return '';
  if (m.deshecho) return html`<span class="msj__deshecho">${icono('deshacer', 14)}Cambios deshechos</span>`;
  if (!puedeCambiar) return '';
  return html`<form class="msj__deshacer-form" method="post" action="${r(`/asistente/propuestas/${m.deshacer}/deshacer`)}" data-deshacer="${m.deshacer}">
    ${csrfCampo(c)}${campoConversacion(conversacionId)}
    <button class="msj__deshacer" type="submit" title="Deshacer estos cambios">${icono('deshacer', 16)}<span>Deshacer</span><span class="sr"> estos cambios</span></button>
  </form>`;
};

export interface DatosAsistente {
  disponible: boolean;
  /** Rol con permiso de stock: puede preparar y confirmar cambios. */
  puedeCambiar: boolean;
  restantes: number;
  modelos: { valor: string; nombre: string }[];
  modelo: string;
  /** Conversaciones anteriores del usuario (más recientes primero). */
  historial: ResumenConversacion[];
  /** Conversación abierta ('' = nueva). */
  conversacionId: string;
  mensajes: MensajeGuardado[];
  /** Única propuesta todavía confirmable del usuario (las demás tarjetas pendientes quedaron sin efecto). */
  pendienteId: string | null;
  error?: string | null;
}
const SUGERENCIAS = [
  '¿Cuántos productos sin stock hay en Celulares?',
  '¿Qué cambios de stock se hicieron hoy?',
  '¿Qué horarios y teléfono tiene la Casa Central?',
  'Poné sin stock el producto con código …',
];
/** "hoy 14:05", "ayer", "lun 12/10"… para la lista del historial. */
const cuando = (iso: string) => {
  const zona = 'America/Montevideo';
  const dia = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: zona });
  const d = new Date(iso);
  const hoy = new Date();
  if (dia(d) === dia(hoy)) return `hoy ${d.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit', timeZone: zona })}`;
  if (dia(d) === dia(new Date(hoy.getTime() - 86_400_000))) return 'ayer';
  return d.toLocaleDateString('es-UY', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: zona });
};
export const itemHistorial = (h: ResumenConversacion, actual: boolean) => html`<li><a class="historial__item" href="${r(`/asistente?c=${h.id}`)}" data-conversacion="${h.id}" ${si(actual, 'aria-current="page"')}>
  <span class="historial__titulo">${h.titulo}</span>
  <span class="historial__meta"><span>${cuando(h.actualizada_en)}</span>${h.cambios ? html`<span class="historial__cambios">${icono('check', 12)}${h.cambios === 1 ? '1 cambio' : `${h.cambios} cambios`}</span>` : ''}</span>
</a></li>`;

export function vistaAsistente(c: Contexto, d: DatosAsistente) {
  const id = d.conversacionId;
  const actual = d.historial.find((h) => h.id === id);
  return layout(c, 'Asistente', html`
<div class="asistente-app">
<details class="card historial" data-historial open>
  <summary class="historial__cabecera"><span class="historial__nombre">${icono('registro', 16)}Historial <span class="historial__n" data-historial-n>${d.historial.length}</span></span>${icono('chevron', 16)}</summary>
  <a class="btn btn--outline btn--sm btn--bloque historial__nueva" href="${r('/asistente')}" ${si(!id, 'aria-current="page"')}>${icono('mas', 16)}Nueva conversación</a>
  <ul class="historial__lista" data-historial-lista aria-label="Conversaciones anteriores">${d.historial.map((h) => itemHistorial(h, h.id === id))}</ul>
  <p class="muted historial__vacio" data-historial-vacio ${si(d.historial.length, 'hidden')}>Todavía no hay conversaciones. Las que tengas quedan guardadas acá.</p>
</details>
<section class="card asistente" data-asistente>
  ${d.disponible ? '' : html`<div class="alert alert--error" role="alert">${icono('info')}<p>El asistente funciona en la web publicada en Vercel (usa Vercel AI Gateway). En este equipo no está configurado.</p></div>`}
  <div class="asistente__cabeza">
    <h2 class="asistente__titulo" data-titulo>${actual?.titulo ?? 'Nueva conversación'}</h2>
    ${id ? html`<form method="post" action="${r(`/asistente/conversaciones/${id}/eliminar`)}" data-eliminar>${csrfCampo(c)}<button class="btn btn--ghost btn--sm" type="submit">${icono('basura', 16)}<span>Eliminar</span><span class="sr"> esta conversación</span></button></form>` : ''}
  </div>
  <div class="asistente__registro" data-registro role="log" aria-live="polite" aria-label="Conversación con el asistente">
    ${d.mensajes.length ? d.mensajes.map((m) => html`<div class="msj msj--${m.rol}"${m.deshacer ? raw(` data-deshacer-de="${m.deshacer}"`) : ''}><span class="msj__autor">${m.rol === 'usuario' ? 'Vos' : 'Asistente'}</span><div class="msj__texto" ${si(m.rol === 'asistente', 'data-formato')}>${m.texto}</div>${botonDeshacer(c, m, id, d.puedeCambiar)}</div>
    ${m.propuesta ? tarjetaPropuesta(c, m.propuesta, id, m.propuesta.id === d.pendienteId) : ''}`) : html`
    <div class="asistente__vacio" data-vacio>
      ${d.puedeCambiar
        ? html`<p>Preguntame sobre la web pública, el stock del Bazar o cómo usar el panel. También puedo preparar cambios de stock, cantidades o datos de productos: <strong>nada se aplica hasta que lo confirmes.</strong> Cada cambio aplicado se puede deshacer con la flecha ${icono('deshacer', 14)} de su respuesta.</p>`
        : html`<p>Preguntame sobre la web pública, el stock del Bazar o cómo usar el panel. <strong>Tu rol es de solo consulta: no puedo hacer cambios.</strong></p>`}
      <ul class="asistente__sugerencias">${SUGERENCIAS.filter((s) => d.puedeCambiar || !s.startsWith('Poné')).map((s) => html`<li><button class="btn btn--outline btn--sm" type="button" data-sugerencia>${s}</button></li>`)}</ul>
    </div>`}
  </div>
  ${d.error ? html`<div class="alert alert--error" role="alert">${icono('info')}<p>${d.error}</p></div>` : ''}
  <p class="asistente__error alert alert--error" role="alert" data-error hidden></p>
  <form class="asistente__form" method="post" action="${r('/asistente')}" data-asistente-form>
    ${csrfCampo(c)}
    <input type="hidden" name="conversacion" value="${id}" data-conversacion-id>
    <label class="sr" for="pregunta">Tu pregunta</label>
    <textarea class="input" id="pregunta" name="pregunta" rows="2" maxlength="1000" required placeholder="Escribí tu pregunta…" ${si(!d.disponible || d.restantes <= 0, 'disabled')}></textarea>
    <div class="asistente__acciones">
      ${d.modelos.length > 1
        ? html`<label class="asistente__modelo"><span class="sr">Modelo</span><select class="input" name="modelo" data-modelo>${d.modelos.map((m) => html`<option value="${m.valor}" ${si(m.valor === d.modelo, 'selected')}>${m.nombre}</option>`)}</select></label>`
        : html`<input type="hidden" name="modelo" value="${d.modelo}"><span class="asistente__modelo muted">${d.modelos[0]?.nombre ?? ''}</span>`}
      <button class="btn" type="submit" ${si(!d.disponible || d.restantes <= 0, 'disabled')}>${icono('enviar', 16)}Enviar</button>
    </div>
    <p class="asistente__nota muted"><span data-restantes>${d.restantes <= 0 ? 'Llegaste al límite de consultas de hoy.' : `Te quedan ${d.restantes} consultas hoy.`}</span> Usa Gemini 2.5 Flash (Google) a través de Vercel AI Gateway. Las respuestas pueden tener errores: confirmá los datos importantes.</p>
  </form>
</section>
</div>
<script src="/panel-recursos/asistente.js" defer></script>`);
}

// ── Información empleados (todo el personal; edita el administrador) ──
/** Imagen del portal: las fotos iniciales son estáticas; las subidas tienen variantes de 800 y 1600 px. */
const imgPortal = (src: string) => (src.startsWith('/panel-recursos/') ? { src, srcset: null } : { src: variante(src, 800), srcset: `${variante(src, 800)} 800w, ${variante(src, 1600)} 1600w` });
const fotoPortal = (i: ImagenPortal, sizes: string, clase = '') => {
  const f = imgPortal(i.src);
  return f.srcset
    ? html`<img class="${clase}" src="${f.src}" srcset="${f.srcset}" sizes="${sizes}" alt="${i.alt}" loading="lazy" decoding="async">`
    : html`<img class="${clase}" src="${f.src}" alt="${i.alt}" loading="lazy" decoding="async">`;
};
const pendiente = (editar: boolean, texto: string) => html`<div class="portal-pendiente">${icono('info', 18)}<p>${editar ? html`${texto} <a href="${r('/empleados/editar')}">Cargalo en Editar</a>.` : 'Disponible pronto.'}</p></div>`;

export function vistaEmpleados(c: Contexto, p: Portal, editar: boolean) {
  const tarjetaQr = (titulo: string, eyebrow: string, texto: string, url: string, boton: string, faltante: string) => html`<section class="card portal-qr">
    <div class="portal-qr__texto"><span class="portal__eyebrow">${eyebrow}</span><h2>${titulo}</h2><p class="muted">${texto}</p></div>
    ${url
      ? html`<div class="portal-qr__codigo">${raw(qrSvg(url, `Código QR: ${titulo}`))}</div>
        <p class="muted portal-qr__ayuda">Escaneá el código con la cámara del celular o abrilo desde acá.</p>
        <a class="btn" href="${url}" target="_blank" rel="noopener noreferrer">${boton}${icono('flecha-externa', 16)}</a>`
      : pendiente(editar, faltante)}
  </section>`;
  return layout(c, 'Información empleados', html`
<div class="portal">
  <div class="portal__qrs">
    ${tarjetaQr('Acoso laboral', 'RR.HH.', 'Protocolo de prevención y erradicación del acoso en cualquiera de sus modalidades, violencia laboral y discriminación en el ambiente de trabajo.', p.acosoUrl, 'Abrir el protocolo', 'Falta el enlace del protocolo.')}
    ${tarjetaQr('¿Cómo te sentís hoy?', 'Bienestar', 'Contanos cómo estás: tu respuesta nos ayuda a cuidar el ambiente de trabajo.', p.animoUrl, 'Responder', 'Falta el enlace de la encuesta.')}
  </div>

  <section class="card portal__bloque" aria-labelledby="portal-coop">
    <h2 id="portal-coop" class="portal__titulo">Tu cooperativa</h2>
    ${p.carrusel.length
      ? html`<div class="carrusel-panel" data-carrusel-panel>
        <ul class="carrusel-panel__pista" tabindex="0" aria-label="Piezas de la cooperativa (se desplazan solas; pasá el mouse o tocá para detenerlas)" data-pista>
          ${p.carrusel.map((i, k) => html`<li class="carrusel-panel__item">${fotoPortal(i, '(min-width: 900px) 360px, 80vw')}<span class="sr">Pieza ${k + 1} de ${p.carrusel.length}</span></li>`)}
        </ul>
        ${p.carrusel.length > 1 ? html`<div class="carrusel-panel__controles" data-controles hidden>
          <button class="btn btn--outline btn--sm" type="button" data-pausa aria-pressed="false">${icono('pausa', 16)}<span data-pausa-texto>Pausar</span></button>
        </div>` : ''}
      </div>`
      : pendiente(editar, 'Todavía no hay fotos.')}
  </section>

  <section class="card portal__bloque" aria-labelledby="portal-cdp">
    <div><span class="portal__eyebrow">Próximamente</span><h2 id="portal-cdp" class="portal__titulo">Ciudad del Plata</h2></div>
    ${p.ciudadDelPlata.length ? html`<div class="portal__foto">${fotoPortal(p.ciudadDelPlata[0], '(min-width: 900px) 760px, 92vw')}</div>` : editar ? pendiente(true, 'Falta la imagen.') : ''}
  </section>

  <section class="card portal__bloque" aria-labelledby="portal-chuy">
    <div><h2 id="portal-chuy" class="portal__titulo">Pinecoop Chuy</h2><p class="muted">En obras para que puedas disfrutarlo.</p></div>
    ${p.chuy.length ? html`<div class="portal__fotos portal__fotos--${p.chuy.length}">${p.chuy.map((i) => html`<div class="portal__foto">${fotoPortal(i, '(min-width: 900px) 380px, 92vw')}</div>`)}</div>` : editar ? pendiente(true, 'Faltan las imágenes.') : ''}
  </section>

  <section class="portal-recibos" aria-labelledby="portal-recibos">
    <span class="portal-recibos__icono" aria-hidden="true">${icono('recibo', 30)}</span>
    <div class="portal-recibos__texto">
      <span class="portal-recibos__eyebrow">Funcionarios</span>
      <h2 id="portal-recibos">Tus recibos</h2>
      <p>Consultá tus recibos de sueldo en el portal oficial de COPOL.</p>
    </div>
    ${p.recibosUrl
      ? html`<a class="btn portal-recibos__boton" href="${p.recibosUrl}" target="_blank" rel="noopener noreferrer">Aquí<span class="sr">: ver tus recibos</span>${icono('flecha-externa', 20)}</a>`
      : pendiente(editar, 'Falta el enlace de los recibos.')}
  </section>
</div>`, editar ? html`<a class="btn btn--outline" href="${r('/empleados/editar')}">${icono('editar', 16)}Editar</a>` : '');
}

export function vistaFormEmpleados(c: Contexto, p: Portal, errores: Record<string, string> = {}) {
  const err = (k: string) => (errores[k] ? html`<span class="error" id="err-${k}">${errores[k]}</span>` : '');
  const inv = (k: string) => (errores[k] ? raw(`aria-invalid="true" aria-describedby="err-${k}"`) : '');
  const enlace = (nombre: string, etiqueta: string, valor: string, ayuda: string) => html`<label class="campo"><span class="label">${etiqueta}</span>
    <input class="input" type="url" name="${nombre}" value="${valor}" maxlength="500" placeholder="https://…" ${inv(nombre)}><span class="ayuda">${ayuda}</span>${err(nombre)}</label>`;
  const grupo = (g: Grupo) => {
    const { titulo, max } = GRUPOS[g];
    const imgs = p[g];
    return html`<section class="card form"><h2 class="card__titulo">${titulo}</h2>
      ${imgs.length ? html`<ul class="portal-editar__imgs">${imgs.map((i, k) => html`<li class="portal-editar__img">
        ${fotoPortal(i, '160px')}
        <label class="campo"><span class="label">Descripción</span><input class="input" name="alt_${g}_${k}" value="${i.alt}" maxlength="400"></label>
        <label class="check"><input type="checkbox" name="quitar_${g}_${k}" value="1"><span>Quitar</span></label>
      </li>`)}</ul>` : html`<p class="muted">Sin imágenes.</p>`}
      ${imgs.length < max ? html`<label class="campo"><span class="label">${max - imgs.length > 1 ? 'Agregar imágenes' : 'Agregar imagen'}</span>
        <input class="input" type="file" name="nuevas_${g}" accept="image/jpeg,image/png,image/webp,image/avif" ${si(max - imgs.length > 1, 'multiple')} ${inv(`nuevas_${g}`)}>
        <span class="ayuda">${max === 1 ? 'Una sola imagen' : `Hasta ${max} en total; podés elegir varias a la vez`} · JPG, PNG, WebP o AVIF</span>${err(`nuevas_${g}`)}</label>
        <label class="campo"><span class="label">${max - imgs.length > 1 ? 'Descripción de las nuevas' : 'Descripción de la imagen'} <span class="opcional">(opcional)</span></span><input class="input" name="alt_nueva_${g}" maxlength="400"></label>` : html`<p class="ayuda">${max === 1 ? 'Para cambiar la imagen, marcá "Quitar", guardá y subí la nueva.' : `Llegaste al máximo de ${max}. Quitá una para agregar otra.`}</p>${err(`nuevas_${g}`)}`}
    </section>`;
  };
  return layout(c, 'Editar información empleados', html`
${Object.keys(errores).length ? html`<div class="alert alert--error" role="alert">${icono('info')}<p>Revisá los campos marcados. No se guardó nada.</p></div>` : ''}
<form method="post" action="${r('/empleados')}" enctype="multipart/form-data" novalidate class="grid-form" data-comprimir>
  ${csrfCampo(c)}
  <div class="col">
    <section class="card form"><h2 class="card__titulo">Enlaces</h2>
      ${enlace('acoso_url', 'Protocolo de acoso laboral (RR.HH.)', p.acosoUrl, 'El QR se genera solo con este enlace. Si es un archivo de Drive, compartilo como "Cualquier persona con el enlace".')}
      ${enlace('animo_url', '¿Cómo te sentís hoy?', p.animoUrl, 'Enlace de la encuesta (por ejemplo, un formulario de Google).')}
      ${enlace('recibos_url', 'Tus recibos', p.recibosUrl, 'Dirección donde cada empleado ve sus recibos (botón "Aquí").')}
    </section>
    ${grupo('carrusel')}
  </div>
  <div class="col">
    ${grupo('ciudadDelPlata')}
    ${grupo('chuy')}
    <div class="acciones-form"><button class="btn btn--lg" type="submit">Guardar cambios</button><a class="btn btn--ghost" href="${r('/empleados')}">Cancelar</a></div>
  </div>
</form>`);
}

export function vistaError(c: Contexto, estado: number, titulo: string, texto: string) {
  const cuerpo = html`<section class="card vacio"><span class="muted">Error ${estado}</span><h2>${titulo}</h2><p class="muted">${texto}</p><a class="btn" href="${r()}">Volver al inventario</a></section>`;
  return c.usuario ? layout(c, titulo, cuerpo) : pantallaSimple(c, titulo, cuerpo);
}

export { variante };
