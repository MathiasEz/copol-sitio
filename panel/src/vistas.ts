// Vistas HTML del panel (anatomía y tokens de shadcn/ui: Sidebar, Card, Table, Tabs, Badge, Button,
// Input, Select, Dialog). `html` de Hono escapa toda interpolación (protección contra XSS); `raw` solo
// se usa con contenido fijo del propio código (íconos SVG y atributos booleanos).
import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import { ACCIONES, type Evento } from './auditoria.ts';
import { BASE } from './config.ts';
import { variante } from './imagenes.ts';
import { GRUPOS, qrSvg, type Grupo, type ImagenPortal, type Portal } from './empleados.ts';
import { estadoNovedad, PLANTILLAS, type Novedad, type Plantilla } from './novedades.ts';
import { MAX_PIEZAS, vencidas, type Ofertas } from './ofertas.ts';
import { proximas, type Apertura } from './creditos.ts';
import {
  CATEGORIAS as CATEGORIAS_NOTIFICACION, DESTINOS as DESTINOS_NOTIFICACION, DIAS_SEMANA, LIMITES as LIMITES_NOTIFICACION,
  type Ajustes as AjustesNotificaciones, type Categoria as CategoriaNotificacion, type Destino as DestinoNotificacion, type Instancia, type Notificacion,
} from './notificaciones.ts';
import { nombreMes, nombreRuta, type MesArchivado, type Resumen } from './estadisticas.ts';
import { DISENOS, estadoDiapositiva, FOCOS, hoyUruguay, htmlBanner, MAX_DIAPOSITIVAS, SEGUNDOS, tituloCompleto, vigentes, type Banner, type Diapositiva, type Diseno, type Foco } from './banner.ts';
import type * as AC from './acceso.ts';
import type { MensajeGuardado, ResumenConversacion, TarjetaGuardada } from './conversaciones.ts';
import { describirEquipo } from './acceso.ts';
import type { Conexion } from './oauth.ts';
import { ESTADOS, miniatura, type Categoria, type EstadoStock, type Producto } from './productos.ts';
import { GRUPOS_ROL, nombresRoles, puede, ROLES, type Rol } from './seguridad.ts';
import type { UsuarioPublico } from './usuarios.ts';
import type { EstadoPlanilla, Registro } from './registros.ts';

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
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  basura: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  llave: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  chispa: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/>',
  enviar: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  luna: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  empleados: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="11" r="2.5"/><path d="M5.5 17a3.5 3.5 0 0 1 7 0M15 9h3M15 13h3"/>',
  grafico: '<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V8M17 16v-8"/>',
  etiqueta: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  'flecha-externa': '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  izquierda: '<path d="m15 18-6-6 6-6"/>',
  pausa: '<path d="M9 5v14M15 5v14"/>',
  recibo: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2Z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  derecha: '<path d="m9 18 6-6-6-6"/>',
  pagina: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 13h6M7 16h4"/><rect x="14" y="12.5" width="3.5" height="4" rx=".5"/>',
  monitor: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  celular: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  campana: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  calendario: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  formulario: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  planilla: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  microfono: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>',
  clip: '<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
  camara: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/>',
  descargar: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  nuevo: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
};
export const icono = (n: string, t = 18) => raw(`<svg class="i" width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[n] ?? ''}</svg>`);

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleString('es-UY', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Montevideo' }) : '—');
export const csrfCampo = (c: Contexto) => html`<input type="hidden" name="_csrf" value="${c.csrf}">`;
const etiquetaCodigo = 'Código interno COPOL';

/** Archivos extra de una página (p. ej. la vista previa del banner de Inicio). */
export interface Recursos { estilos?: string[]; scripts?: string[] }

function cabeza(titulo: string, extra: Recursos = {}) {
  return html`<!doctype html>
<html lang="es-UY" data-base="${BASE}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<title>${titulo} · Panel de Administración COPOL</title>
<link rel="stylesheet" href="/panel-recursos/panel.css">
<link rel="icon" href="/favicon.png">
<script src="/panel-recursos/tema.js"></script>
<script src="/panel-recursos/panel.js" defer></script>
${(extra.estilos ?? []).map((e) => html`<link rel="stylesheet" href="${e}">`)}
${(extra.scripts ?? []).map((e) => html`<script src="${e}" defer></script>`)}
</head>`;
}

/** Alterna claro/oscuro; lo activa tema.js (sin JavaScript queda oculto). */
const botonTema = (clase: string) =>
  html`<button type="button" class="${clase}" data-tema-boton aria-pressed="false" hidden>${raw(icono('luna', 16).toString().replace('class="i"', 'class="i i--luna"'))}${raw(icono('sol', 16).toString().replace('class="i"', 'class="i i--sol"'))}<span data-tema-texto>Modo oscuro</span></button>`;

const alerta = (a: Contexto['aviso']) =>
  a ? html`<div class="alert alert--${a.tipo}" role="${a.tipo === 'error' ? 'alert' : 'status'}" data-aviso>${icono(a.tipo === 'ok' ? 'check' : 'info')}<p>${a.texto}</p></div>` : '';

export function layout(c: Contexto, titulo: string, cuerpo: H, acciones: H | '' = '', extra: Recursos = {}) {
  const u = c.usuario!;
  const activo = (p: string) => (p === '/productos' ? c.ruta === r() || c.ruta.startsWith(r('/productos')) || c.ruta.startsWith(r('/?')) : p === '/banner' ? ['/banner', '/ofertas', '/creditos', '/novedades', '/notificaciones'].some((s) => c.ruta.startsWith(r(s))) : p === '/registros' ? c.ruta === r(p) || c.ruta.startsWith(`${r(p)}?`) : c.ruta === r(p) || c.ruta.startsWith(`${r(p)}/`) || c.ruta.startsWith(`${r(p)}?`));
  const item = (p: string, texto: string, ic: string) => html`<a href="${r(p === '/productos' ? '' : p)}" class="nav__item" ${si(activo(p), 'aria-current="page"')}>${icono(ic)}<span>${texto}</span></a>`;
  // El menú se arma en tres secciones; cada una aparece solo si la persona tiene algo para hacer en ella.
  const seccion = (titulo: string, items: (H | '')[]) => {
    const visibles = items.filter(Boolean);
    return visibles.length ? html`<div class="nav__grupo" role="group" aria-label="${titulo}"><p class="nav__titulo">${titulo}</p>${visibles}</div>` : '';
  };
  return html`${cabeza(titulo, extra)}
<body class="app">
<a class="saltar" href="#contenido">Saltar al contenido</a>
<aside class="sidebar" aria-label="Panel">
  <div class="sidebar__marca"><img src="/panel-recursos/logo-copol.svg" alt="COPOL" width="78" height="32"><span>Panel de Administración</span></div>
  <details class="sidebar__menu" data-menu open>
    <summary class="btn btn--ghost btn--icono" aria-label="Menú">${icono('menu', 20)}</summary>
    <nav class="nav">
      ${seccion('Stock Bazar', [
        puede(u, 'ver') ? item('/productos', 'Inventario', 'caja') : '',
        puede(u, 'productos') ? item('/nuevo', 'Agregar producto', 'mas') : '',
        puede(u, 'asistente') ? item('/asistente', 'Asistente', 'chispa') : '',
      ])}
      ${seccion('Registros', [
        puede(u, 'registros') ? item('/registros', 'Nuevo registro', 'formulario') : '',
        puede(u, 'registros') ? item('/registros/planilla', 'Planilla', 'planilla') : '',
      ])}
      ${seccion('Administración', [
        puede(u, 'novedades') ? item('/banner', 'Administración Página', 'pagina') : '',
        item('/empleados', 'Información empleados', 'empleados'),
        puede(u, 'auditoria') ? item('/estadisticas', 'Estadísticas', 'grafico') : '',
        puede(u, 'usuarios') ? item('/usuarios', 'Usuarios', 'usuarios') : '',
        puede(u, 'auditoria') ? item('/registro', 'Registro de cambios', 'registro') : '',
        puede(u, 'auditoria') ? item('/accesos', 'Accesos', 'escudo') : '',
      ])}
    </nav>
    <div class="sidebar__pie">
      <a href="${r('/perfil')}" class="perfil" ${si(c.ruta.startsWith(r('/perfil')), 'aria-current="page"')}>
        <span class="avatar" aria-hidden="true">${u.usuario.slice(0, 1).toUpperCase()}</span>
        <span class="perfil__texto"><strong>${u.usuario}</strong><small>${nombresRoles(u)}</small></span>
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
  <div><h1 class="titulo">Panel de Administración</h1><p class="muted">Ingresá con tu usuario o correo.</p></div>
  ${error ? html`<div class="alert alert--error" role="alert">${icono('info')}<p>${error}</p></div>` : ''}
  <form method="post" action="${r('/ingresar')}" class="form">
    ${csrfCampo(c)}
    <label class="campo"><span class="label">Usuario o correo</span><input class="input" name="usuario" autocomplete="username" required maxlength="120" value="${usuario}" autofocus></label>
    <label class="campo"><span class="label">Contraseña</span><input class="input" type="password" name="clave" autocomplete="current-password" required maxlength="200"></label>
    <label class="check"><input type="checkbox" name="mantener" value="1" checked><span>Mantener la sesión iniciada</span></label>
    <p class="ayuda">No se cierra mientras uses el panel (hasta 30 días sin entrar). Desmarcalo si la computadora o el celular es compartido.</p>
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
    <dl class="datos"><dt>Usuario</dt><dd>${u.usuario}</dd><dt>${u.roles.length > 1 ? 'Roles' : 'Rol'}</dt><dd>${nombresRoles(u)}</dd><dt>Correo</dt><dd>${u.correo ?? 'Sin correo'}</dd><dt>Último acceso</dt><dd>${fecha(u.ultimo_acceso)}</dd></dl>
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
  ${puede(u, 'usuarios') ? html`<section class="card form" aria-labelledby="pin-titulo"><h2 class="card__titulo" id="pin-titulo">PIN de acceso al panel</h2>
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
  <p>Vas a conectar la app de Claude con tu usuario <strong>${u.usuario}</strong> (${nombresRoles(u)}). Después volvés a <strong>${d.destino}</strong>.</p>
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
  const editable = c.usuario ? puede(c.usuario, 'stock') : false;
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
</nav>` : ''}`, c.usuario && puede(c.usuario, 'productos') ? html`<a class="btn" href="${r('/nuevo')}">${icono('mas')}Agregar producto</a>` : '');
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
  const editable = c.usuario ? puede(c.usuario, 'productos') : false;
  const stockEditable = c.usuario ? puede(c.usuario, 'stock') : false;
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

// ── Administración Página: banner de Inicio y novedades ──
type SeccionPagina = 'banner' | 'ofertas' | 'creditos' | 'novedades' | 'notificaciones';
const SECCIONES_PAGINA: [SeccionPagina, string, string][] = [['banner', 'Banner de inicio', 'imagen'], ['ofertas', 'Ofertas', 'etiqueta'], ['creditos', 'Créditos', 'calendario'], ['novedades', 'Novedades', 'noticia'], ['notificaciones', 'Notificaciones', 'campana']];
const tabsPagina = (activo: SeccionPagina) => html`<nav class="tabs" aria-label="Secciones de la web">
  ${SECCIONES_PAGINA.map(([k, texto, ic]) => html`<a class="tabs__item" href="${r(`/${k}`)}" ${si(activo === k, 'aria-current="true"')}>${icono(ic, 16)}${texto}</a>`)}
</nav>`;
const RECURSOS_BANNER: Recursos = { estilos: ['/panel-recursos/banner-inicio.css'], scripts: ['/panel-recursos/banner-inicio.js'] };
const fechaCorta = (f: string) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-UY', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** Recuadro de vista previa con selector Computadora / Celular. `contenido` es HTML de htmlBanner (escapa todo dato). */
const vistaPrevia = (contenido: string, titulo: string, ayuda: string, fija = false) => html`<section class="card previa${fija ? ' previa--fija' : ''}" data-previa aria-label="${titulo}">
  <div class="previa__cabecera">
    <div><h2 class="card__titulo">${titulo}</h2><p class="ayuda">${ayuda}</p></div>
    <div class="segmentado" role="group" aria-label="Tamaño de la vista previa" data-previa-modos hidden>
      <button type="button" class="segmentado__item" data-previa-modo="computadora" aria-pressed="true">${icono('monitor', 16)}Computadora</button>
      <button type="button" class="segmentado__item" data-previa-modo="celular" aria-pressed="false">${icono('celular', 16)}Celular</button>
    </div>
  </div>
  <div class="previa__lienzo"><div class="previa__marco" data-previa-marco>${raw(contenido)}</div></div>
</section>`;

const ESTADOS_DIAPOSITIVA = {
  publicada: { clase: 'con-stock', icono: 'ojo', texto: () => 'Publicada' },
  borrador: { clase: 'sin-stock', icono: 'ojoNo', texto: () => 'Borrador' },
  programada: { clase: 'sin-dato', icono: 'calendario', texto: (d: Pick<Diapositiva, 'desde' | 'hasta'>) => `Desde el ${fechaCorta(d.desde)}` },
  vencida: { clase: 'sin-stock', icono: 'reloj', texto: (d: Pick<Diapositiva, 'desde' | 'hasta'>) => `Terminó el ${fechaCorta(d.hasta)}` },
} as const;
/** Estado de algo publicable con fechas (diapositivas y novedades). */
const badgePublicacion = (e: keyof typeof ESTADOS_DIAPOSITIVA, desde: string, hasta: string) => {
  const est = ESTADOS_DIAPOSITIVA[e];
  return html`<span class="badge badge--${est.clase}">${icono(est.icono, 14)}${est.texto({ desde, hasta })}</span>`;
};

export function vistaBanner(c: Contexto, banner: Banner) {
  const hoy = hoyUruguay();
  const visibles = vigentes(banner, hoy);
  const lista = banner.diapositivas;
  const lleno = lista.length >= MAX_DIAPOSITIVAS;
  return layout(c, 'Administración Página', html`
${tabsPagina('banner')}
<p class="muted subtitulo">El banner es lo primero que se ve en Inicio. Las diapositivas publicadas aparecen en este orden y cambian solas.</p>
${visibles.length
  ? vistaPrevia(htmlBanner(visibles, { segundos: banner.segundos }), 'Vista previa', 'Así se ve hoy la portada. Pasá el mouse por encima para detenerla.')
  : html`<div class="alert alert--error" role="status">${icono('info')}<p>No hay diapositivas publicadas y vigentes: la portada se muestra sin banner.</p></div>`}
<section class="card" aria-labelledby="diapositivas-titulo">
  <div class="card__cabecera"><h2 class="card__titulo" id="diapositivas-titulo">Diapositivas</h2><span class="muted ayuda">${lista.length} de ${MAX_DIAPOSITIVAS} como máximo</span></div>
  ${lista.length
    ? html`<ol class="novedades diapositivas">${lista.map((d, i) => {
      const e = estadoDiapositiva(d, hoy);
      const est = ESTADOS_DIAPOSITIVA[e];
      return html`<li class="novedad diapositiva">
        <div class="novedad__orden">
          <form method="post" action="${r(`/banner/${d.id}/mover`)}">${csrfCampo(c)}<input type="hidden" name="direccion" value="arriba"><button class="btn btn--ghost btn--icono" type="submit" aria-label="Subir ${tituloCompleto(d)}" ${si(i === 0, 'disabled')}>${icono('arriba')}</button></form>
          <form method="post" action="${r(`/banner/${d.id}/mover`)}">${csrfCampo(c)}<input type="hidden" name="direccion" value="abajo"><button class="btn btn--ghost btn--icono" type="submit" aria-label="Bajar ${tituloCompleto(d)}" ${si(i === lista.length - 1, 'disabled')}>${icono('abajo')}</button></form>
        </div>
        <div class="novedad__img diapositiva__img"><img src="${variante(d.imagen, 800)}" alt="" loading="lazy"></div>
        <div class="novedad__texto"><strong>${tituloCompleto(d)}</strong><span class="muted">${DISENOS[d.diseno].nombre}${d.completa ? ' · imagen completa' : ''}${d.hasta && e !== 'vencida' ? ` · hasta el ${fechaCorta(d.hasta)}` : ''}</span></div>
        <span class="badge badge--${est.clase}">${icono(est.icono, 14)}${est.texto(d)}</span>
        <div class="novedad__acciones">
          <form method="post" action="${r(`/banner/${d.id}/publicar`)}">${csrfCampo(c)}<input type="hidden" name="publicado" value="${d.publicado ? '0' : '1'}"><button class="btn btn--outline btn--sm" type="submit">${d.publicado ? 'Despublicar' : 'Publicar'}</button></form>
          <a class="btn btn--ghost btn--sm" href="${r(`/banner/${d.id}`)}">${icono('editar', 16)}Editar</a>
        </div>
      </li>`;
    })}</ol>`
    : html`<div class="vacio"><p><strong>Todavía no hay diapositivas.</strong></p></div>`}
</section>
<form class="card form ajustes-banner" method="post" action="${r('/banner/ajustes')}">
  ${csrfCampo(c)}
  <label class="campo"><span class="label">Tiempo de cada diapositiva</span>
    <select class="input" name="segundos">${Array.from({ length: SEGUNDOS.max - SEGUNDOS.min + 1 }, (_, k) => SEGUNDOS.min + k).map((s) => html`<option value="${s}" ${si(s === banner.segundos, 'selected')}>${s} segundos</option>`)}</select>
    <span class="ayuda">Cuánto se muestra cada una antes de pasar a la siguiente. Se detiene sola cuando alguien pasa el mouse por encima.</span>
  </label>
  <button class="btn btn--outline" type="submit">Guardar tiempo</button>
</form>`, lleno ? html`<span class="ayuda">Máximo de ${MAX_DIAPOSITIVAS} diapositivas</span>` : html`<a class="btn" href="${r('/banner/nueva')}">${icono('mas')}Nueva diapositiva</a>`, RECURSOS_BANNER);
}

const FOCOS_NOMBRES: Record<Foco, string> = {
  'arriba-izquierda': 'Arriba a la izquierda', arriba: 'Arriba', 'arriba-derecha': 'Arriba a la derecha',
  izquierda: 'Izquierda', centro: 'Centro', derecha: 'Derecha',
  'abajo-izquierda': 'Abajo a la izquierda', abajo: 'Abajo', 'abajo-derecha': 'Abajo a la derecha',
};

export function vistaFormBanner(c: Contexto, d: Diapositiva, errores: Record<string, string>, existe: boolean, segundos: number) {
  const err = (k: string) => (errores[k] ? html`<span class="error" id="err-${k}">${errores[k]}</span>` : '');
  const inv = (k: string) => (errores[k] ? raw(`aria-invalid="true" aria-describedby="err-${k}"`) : '');
  const accion = existe ? r(`/banner/${d.id}`) : r('/banner/nueva');
  const campoTexto = (nombre: string, etiqueta: string, valor: string, max: number, extra: { opcional?: boolean; ayuda?: string; placeholder?: string } = {}) => html`<label class="campo"><span class="label">${etiqueta}${extra.opcional ? html` <span class="opcional">(opcional)</span>` : ''}</span>
    <input class="input" name="${nombre}" value="${valor}" maxlength="${max}" placeholder="${extra.placeholder ?? ''}" ${inv(nombre)} data-bi-entrada="${nombre}">${extra.ayuda ? html`<span class="ayuda">${extra.ayuda}</span>` : ''}${err(nombre)}</label>`;
  const boton = (n: 1 | 2, b: Diapositiva['boton1'], etiqueta: string, ejemplo: string) => html`<div class="fila">
    <label class="campo"><span class="label">${etiqueta} <span class="opcional">(opcional)</span></span><input class="input" name="boton${n}_texto" value="${b?.texto ?? ''}" maxlength="30" placeholder="${ejemplo}" ${inv(`boton${n}_texto`)} data-bi-entrada="boton${n}_texto">${err(`boton${n}_texto`)}</label>
    <label class="campo"><span class="label">Enlace</span><input class="input" name="boton${n}_url" value="${b?.url ?? ''}" maxlength="500" placeholder="/hacete-socio/ o https://wa.me/…" ${inv(`boton${n}_url`)} data-bi-entrada="boton${n}_url">${err(`boton${n}_url`)}</label>
  </div>`;
  const previa = htmlBanner([{ ...d, titulo: d.titulo || 'Título de la diapositiva' }], { segundos, editable: true });
  return layout(c, existe ? 'Editar diapositiva' : 'Nueva diapositiva', html`
${tabsPagina('banner')}
${Object.keys(errores).length ? html`<div class="alert alert--error" role="alert">${icono('info')}<p>Revisá los campos marcados. No se guardó nada.</p></div>` : ''}
<form method="post" action="${accion}" enctype="multipart/form-data" novalidate class="grid-form grid-form--previa" data-comprimir data-bi-editor>
  ${csrfCampo(c)}
  <div class="col">
    <section class="card form"><h2 class="card__titulo">Texto</h2>
      ${campoTexto('antetitulo', 'Antetítulo', d.antetitulo, 50, { opcional: true, placeholder: 'Servicios sociales · Turismo', ayuda: 'Línea chica arriba del título.' })}
      ${campoTexto('titulo', 'Título', d.titulo, 90)}
      ${campoTexto('resaltado', 'Final del título resaltado', d.resaltado, 40, { opcional: true, placeholder: 'tu familia', ayuda: 'Se agrega al final del título, sobre fondo amarillo.' })}
      <label class="campo"><span class="label">Texto <span class="opcional">(opcional)</span></span><textarea class="input" name="texto" rows="3" maxlength="220" ${inv('texto')} data-bi-entrada="texto">${d.texto}</textarea><span class="ayuda">Una o dos frases: el banner se lee de un vistazo. Sin precios.</span>${err('texto')}</label>
      ${campoTexto('etiqueta', 'Etiqueta sobre la imagen', d.etiqueta, 40, { opcional: true, placeholder: 'Próximamente', ayuda: 'Cartel chico en una esquina de la imagen.' })}
    </section>
    <section class="card form"><h2 class="card__titulo">Diseño</h2>
      <fieldset class="campo"><legend class="label">Dónde va el texto</legend>
        <div class="plantillas">${(Object.keys(DISENOS) as Diseno[]).map((k) => html`<label class="plantilla">
          <input type="radio" name="diseno" value="${k}" ${si(k === d.diseno, 'checked')} data-bi-entrada="diseno">
          <span class="plantilla__dibujo diseno__dibujo diseno__dibujo--${k}" aria-hidden="true"><i></i><b></b><b></b></span>
          <span class="plantilla__nombre">${DISENOS[k].nombre}</span>
          <span class="ayuda">${DISENOS[k].ayuda}</span>
        </label>`)}</div>${err('diseno')}
      </fieldset>
      <label class="check"><input type="checkbox" name="completa" value="1" ${si(d.completa, 'checked')} data-bi-entrada="completa"><span>Mostrar la imagen completa, sin recortar <span class="opcional">(para piezas gráficas con texto)</span></span></label>
      <fieldset class="campo"><legend class="label">Punto de interés de la foto</legend>
        <div class="foco">${(Object.keys(FOCOS) as Foco[]).map((k) => html`<label class="foco__punto" title="${FOCOS_NOMBRES[k]}"><input type="radio" name="foco" value="${k}" ${si(k === d.foco, 'checked')} data-bi-entrada="foco"><span class="sr">${FOCOS_NOMBRES[k]}</span></label>`)}</div>
        <span class="ayuda">La parte de la foto que siempre queda a la vista cuando hay que recortarla para llenar el banner.</span>
      </fieldset>
    </section>
    <section class="card form"><h2 class="card__titulo">Botones</h2>
      ${boton(1, d.boton1, 'Botón principal', 'Hacete socio')}
      ${boton(2, d.boton2, 'Botón secundario', 'Consultá por WhatsApp')}
      <p class="ayuda">Con "Solo imagen", el botón principal convierte toda la imagen en un enlace.</p>
    </section>
    <section class="card form"><h2 class="card__titulo">Imágenes</h2>
      <label class="campo"><span class="label">${d.imagen ? 'Cambiar imagen' : 'Imagen'}</span><input class="input" type="file" name="imagen" accept="image/jpeg,image/png,image/webp,image/avif" ${inv('imagen')} data-bi-archivo="imagen">
        <span class="ayuda">Ancha, de 1920 × 1080 px o más. JPG, PNG, WebP o AVIF · máx. 5 MB.</span>${err('imagen')}</label>
      <label class="campo"><span class="label">Descripción de la imagen <span class="opcional">${d.diseno === 'solo-imagen' ? '' : '(para lectores de pantalla)'}</span></span><input class="input" name="alt" value="${d.alt}" maxlength="250" ${inv('alt')}><span class="ayuda">Qué se ve (y, si es una pieza con texto, qué dice).</span>${err('alt')}</label>
      <label class="campo"><span class="label">Imagen para celular <span class="opcional">(opcional)</span></span><input class="input" type="file" name="imagen_movil" accept="image/jpeg,image/png,image/webp,image/avif" ${inv('imagen_movil')} data-bi-archivo="imagen-movil">
        <span class="ayuda">Se muestra entera en pantallas chicas, por ejemplo 1080 × 1080 px.</span>${err('imagen_movil')}</label>
      ${d.imagenMovil ? html`<label class="check"><input type="checkbox" name="quitar_movil" value="1" data-bi-entrada="quitar_movil"><span>Quitar la imagen para celular</span></label>` : ''}
    </section>
    <section class="card form"><h2 class="card__titulo">Publicación</h2>
      <label class="check"><input type="checkbox" name="publicado" value="1" ${si(d.publicado, 'checked')}><span>Publicada en la portada</span></label>
      <div class="fila">
        <label class="campo"><span class="label">${icono('calendario', 14)} Desde <span class="opcional">(opcional)</span></span><input class="input" type="date" name="desde" value="${d.desde}" ${inv('desde')}>${err('desde')}</label>
        <label class="campo"><span class="label">${icono('calendario', 14)} Hasta <span class="opcional">(opcional)</span></span><input class="input" type="date" name="hasta" value="${d.hasta}" ${inv('hasta')}>${err('hasta')}</label>
      </div>
      <p class="ayuda">Con fechas, se muestra solo entre esos días (hora de Uruguay). Útil para promociones con vencimiento.</p>
    </section>
  </div>
  <div class="col col--previa">
    ${vistaPrevia(previa, 'Vista previa', 'Se actualiza mientras escribís. Probá cómo se ve en celular.', true)}
    <div class="acciones-form acciones-form--previa"><button class="btn btn--lg" type="submit">${existe ? 'Guardar cambios' : 'Crear diapositiva'}</button><a class="btn btn--ghost" href="${r('/banner')}">Cancelar</a></div>
  </div>
</form>
${existe ? html`<form method="post" action="${r(`/banner/${d.id}/eliminar`)}" class="zona-peligro" data-confirmar="¿Eliminar la diapositiva “${tituloCompleto(d)}”?">${csrfCampo(c)}<button class="btn btn--peligro btn--sm" type="submit">${icono('basura', 16)}Eliminar diapositiva</button></form>` : ''}`, '', RECURSOS_BANNER);
}

// ── Estadísticas de la web ──
const numero = (n: number) => n.toLocaleString('es-UY');
const diaCorto = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-UY', { weekday: 'short', day: 'numeric', month: 'short' });

export function vistaEstadisticas(c: Contexto, d: Resumen, dias: number, mes?: { id: string; archivado: string | null }) {
  const anterior = mes ? 'mes anterior' : `${dias} días anteriores`;
  const variacion = (actual: number, antes: number) => {
    if (!antes) return html`<span class="kpi__var muted">Sin datos del ${mes ? 'mes anterior' : 'período anterior'}</span>`;
    const p = Math.round(((actual - antes) / antes) * 100);
    return p === 0
      ? html`<span class="kpi__var muted">Igual que el ${anterior}</span>`
      : html`<span class="kpi__var ${p > 0 ? 'kpi__var--sube' : 'kpi__var--baja'}">${p > 0 ? '▲' : '▼'} ${Math.abs(p)} % ${p > 0 ? 'más' : 'menos'} que el ${anterior}</span>`;
  };
  const t = d.totales;
  const pctCelular = t.celular + t.computadora ? Math.round((t.celular / (t.celular + t.computadora)) * 100) : 0;
  const kpi = (titulo: string, valor: string, extra: H | string) => html`<div class="card kpi"><span class="kpi__titulo">${titulo}</span><strong class="kpi__valor">${valor}</strong>${extra}</div>`;

  // Gráfico de barras (vistas por día). SVG con atributos (la política de seguridad del panel no admite estilos en línea).
  const W = 960, H = 220, gap = 2;
  const max = Math.max(1, ...d.dias.map((x) => x.vistas));
  const tope = (() => { const p = 10 ** Math.floor(Math.log10(max)); return Math.ceil(max / p) * p; })();
  const ancho = W / d.dias.length;
  const barra = Math.max(2, ancho - gap);
  const grafico = raw(`<svg class="grafico__svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Vistas por día, del ${diaCorto(d.desde)} al ${diaCorto(d.hasta)}">
    ${[0.25, 0.5, 0.75, 1].map((f) => `<line class="grafico__guia" x1="0" x2="${W}" y1="${(H - H * f).toFixed(1)}" y2="${(H - H * f).toFixed(1)}"/>`).join('')}
    <line class="grafico__base" x1="0" x2="${W}" y1="${H - 0.5}" y2="${H - 0.5}"/>
    ${d.dias.map((x, i) => {
      const h = x.vistas ? Math.max(3, (x.vistas / tope) * H) : 0;
      const etiqueta = `${diaCorto(x.fecha)}: ${numero(x.vistas)} vistas · ${numero(x.visitantes)} visitantes · ${numero(x.whatsapp)} clics a WhatsApp`;
      return `<g class="grafico__dia" data-grafico-dia data-etiqueta="${etiqueta.replace(/"/g, '&quot;')}"><title>${etiqueta}</title>
        <rect class="grafico__zona" x="${(i * ancho).toFixed(1)}" y="0" width="${ancho.toFixed(1)}" height="${H}"/>
        ${h ? `<path class="grafico__barra" d="M${(i * ancho + gap / 2).toFixed(1)} ${H}V${(H - h + Math.min(4, h / 2)).toFixed(1)}q0 -${Math.min(4, h / 2).toFixed(1)} ${Math.min(4, barra / 2).toFixed(1)} -${Math.min(4, h / 2).toFixed(1)}H${(i * ancho + gap / 2 + barra - Math.min(4, barra / 2)).toFixed(1)}q${Math.min(4, barra / 2).toFixed(1)} 0 ${Math.min(4, barra / 2).toFixed(1)} ${Math.min(4, h / 2).toFixed(1)}V${H}Z"/>` : ''}
      </g>`;
    }).join('')}
  </svg>`);
  const lista = (titulo: string, filas: { clave: string; valor: number }[], nombre: (k: string) => string, vacio: string) => {
    const tope2 = Math.max(1, ...filas.map((f) => f.valor));
    return html`<section class="card ranking"><h2 class="card__titulo">${titulo}</h2>
      ${filas.length ? html`<ol class="ranking__lista">${filas.map((f) => html`<li>
        <span class="ranking__nombre" title="${nombre(f.clave)}">${nombre(f.clave)}</span><span class="ranking__valor">${numero(f.valor)}</span>
        ${raw(`<svg class="ranking__barra" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true"><rect width="${Math.max(1, (f.valor / tope2) * 100).toFixed(1)}" height="4" rx="2"/></svg>`)}
      </li>`)}</ol>` : html`<p class="muted ayuda">${vacio}</p>`}
    </section>`;
  };
  const periodo = (n: number) => html`<a class="tabs__item" href="${r(`/estadisticas?dias=${n}`)}" ${si(!mes && n === dias, 'aria-current="true"')}>Últimos ${n} días</a>`;
  const hayDatos = t.vistas > 0;
  return layout(c, mes ? `Estadísticas · ${nombreMes(mes.id)}` : 'Estadísticas', html`
${mes
  ? html`<p class="muted subtitulo">Registro de ${nombreMes(mes.id)}: del ${diaCorto(d.desde)} al ${diaCorto(d.hasta)}. ${mes.archivado ? `Guardado el ${fecha(mes.archivado)}; no cambia más.` : 'Mes en curso: se actualiza solo y queda guardado al terminar.'}</p>
<nav class="tabs" aria-label="Período"><a class="tabs__item" href="${r('/estadisticas/meses')}">${icono('izquierda', 16)}Todos los meses</a><a class="tabs__item" href="${r(`/estadisticas/meses/${mes.id}.csv`)}" download>${icono('descargar', 16)}Descargar (Excel / CSV)</a></nav>`
  : html`<p class="muted subtitulo">Visitas a la web pública, sin cookies ni datos personales: solo contadores por día. Las visitas del panel no se cuentan.</p>
<nav class="tabs" aria-label="Período">${periodo(7)}${periodo(30)}${periodo(90)}<a class="tabs__item" href="${r('/estadisticas/meses')}">${icono('calendario', 16)}Mes a mes</a></nav>`}
<div class="kpis">
  ${kpi('Vistas de páginas', numero(t.vistas), variacion(t.vistas, d.anteriores.vistas))}
  ${kpi('Visitantes', numero(t.visitantes), variacion(t.visitantes, d.anteriores.visitantes))}
  ${kpi('Clics a WhatsApp', numero(t.whatsapp), variacion(t.whatsapp, d.anteriores.whatsapp))}
  ${kpi('Desde el celular', hayDatos ? `${pctCelular} %` : '—', html`<span class="kpi__var muted">${hayDatos ? `${numero(t.celular)} de ${numero(t.celular + t.computadora)} vistas` : 'Sin visitas en el período'}</span>`)}
</div>
<section class="card grafico" aria-labelledby="grafico-titulo">
  <div class="card__cabecera"><h2 class="card__titulo" id="grafico-titulo">Vistas por día</h2><span class="ayuda grafico__lectura" data-grafico-lectura aria-live="polite">Pasá el mouse por las barras para ver el detalle de cada día.</span></div>
  ${hayDatos ? html`<div class="grafico__area">
    <div class="grafico__eje" aria-hidden="true"><span>${numero(tope)}</span><span>${numero(tope / 2)}</span><span>0</span></div>
    <div class="grafico__lienzo" data-grafico>${grafico}</div>
  </div>
  <div class="grafico__fechas" aria-hidden="true"><span>${diaCorto(d.desde)}</span><span>${diaCorto(d.hasta)}</span></div>
  <details class="grafico__tabla"><summary>Ver como tabla</summary>
    <table class="tabla"><thead><tr><th scope="col">Día</th><th scope="col">Vistas</th><th scope="col">Visitantes</th><th scope="col">Clics a WhatsApp</th></tr></thead>
    <tbody>${[...d.dias].reverse().map((x) => html`<tr><td>${diaCorto(x.fecha)}</td><td>${numero(x.vistas)}</td><td>${numero(x.visitantes)}</td><td>${numero(x.whatsapp)}</td></tr>`)}</tbody></table>
  </details>` : html`<div class="vacio"><p><strong>Todavía no hay visitas registradas en este período.</strong></p><p class="muted">Se empiezan a contar desde la publicación de esta función.</p></div>`}
</section>
<div class="rankings">
  ${lista('Páginas más vistas', d.ranking.pagina, nombreRuta, 'Sin visitas.')}
  ${lista('De dónde llegan', d.ranking.origen, (k) => (k === 'Directo' ? 'Directo (enlace guardado, WhatsApp o escrito a mano)' : k), 'Sin datos.')}
  ${lista('Productos más consultados por WhatsApp', d.ranking.producto, (k) => k, 'Todavía nadie consultó un producto del Bazar por WhatsApp.')}
  ${lista('Páginas desde donde escriben por WhatsApp', d.ranking.whatsapp_pagina, nombreRuta, 'Sin clics a WhatsApp.')}
  ${lista('Clics en el banner de Inicio', d.ranking.banner, (k) => k, 'Sin clics en el banner.')}
  ${lista('Imágenes ampliadas (por página)', d.ranking.visor, nombreRuta, 'Nadie amplió imágenes todavía.')}
</div>`);
}

/** Archivo mes a mes: cada mes cerrado con sus cifras principales y acceso a su registro completo. */
export function vistaEstadisticasMeses(c: Contexto, d: { enCurso: { mes: string; resumen: Resumen }; meses: MesArchivado[] }) {
  const fila = (mes: string, res: Resumen, etiqueta: H | string) => html`<tr>
    <td><a class="usuario-fila" href="${r_(mes)}">${nombreMes(mes)}</a> ${etiqueta}</td>
    <td data-etiqueta="Vistas">${numero(res.totales.vistas)}</td><td data-etiqueta="Visitantes">${numero(res.totales.visitantes)}</td><td data-etiqueta="Clics a WhatsApp">${numero(res.totales.whatsapp)}</td>
    <td data-etiqueta="Desde el celular">${res.totales.celular + res.totales.computadora ? `${Math.round((res.totales.celular / (res.totales.celular + res.totales.computadora)) * 100)} %` : '—'}</td>
    <td class="derecha"><a class="btn btn--ghost btn--sm" href="${r_(mes)}">${icono('ojo', 16)}Ver</a> <a class="btn btn--ghost btn--sm" href="${r(`/estadisticas/meses/${mes}.csv`)}" download>${icono('descargar', 16)}CSV</a></td>
  </tr>`;
  const r_ = (mes: string) => r(`/estadisticas/meses/${mes}`);
  return layout(c, 'Estadísticas · Mes a mes', html`
<p class="muted subtitulo">Al terminar cada mes, el panel guarda su registro completo (por día, rankings y comparación con el mes anterior). Acá quedan todos los meses para consultarlos o descargarlos.</p>
<nav class="tabs" aria-label="Período"><a class="tabs__item" href="${r('/estadisticas')}">${icono('izquierda', 16)}Volver a Estadísticas</a></nav>
<div class="tabla-caja"><table class="tabla tabla--lista">
<thead><tr><th scope="col">Mes</th><th scope="col">Vistas</th><th scope="col">Visitantes</th><th scope="col">Clics a WhatsApp</th><th scope="col">Desde el celular</th><th scope="col"><span class="sr">Acciones</span></th></tr></thead>
<tbody>${fila(d.enCurso.mes, d.enCurso.resumen, html`<span class="badge badge--aviso">En curso</span>`)}${d.meses.map((m) => fila(m.mes, m.resumen, html`<span class="badge badge--ok">Guardado</span>`))}</tbody></table></div>
${d.meses.length ? '' : html`<p class="muted ayuda">Todavía no hay meses cerrados: el primero se guarda solo cuando termine el mes en curso.</p>`}`);
}

// ── Ofertas del supermercado (Promociones) ──
export function vistaOfertas(c: Contexto, o: Ofertas, errores: Record<string, string> = {}) {
  const err = (k: string) => (errores[k] ? html`<span class="error" id="err-${k}">${errores[k]}</span>` : '');
  const inv = (k: string) => (errores[k] ? raw(`aria-invalid="true" aria-describedby="err-${k}"`) : '');
  const vencio = vencidas(o);
  const sinDescribir = o.piezas.filter((p) => !p.alt.trim()).length;
  return layout(c, 'Administración Página', html`
${tabsPagina('ofertas')}
<p class="muted subtitulo">Piezas del supermercado que pasan en la cinta de Promociones. Es la única sección de la web que muestra precios.</p>
${vencio
  ? html`<div class="alert alert--error" role="status">${icono('info')}<p>Estas ofertas vencieron el ${fechaCorta(o.hasta)}: la web ya no las muestra. Quitalas y cargá las del mes nuevo.</p></div>`
  : !o.piezas.length
    ? html`<div class="alert alert--error" role="status">${icono('info')}<p>No hay piezas: la sección de ofertas no aparece en Promociones.</p></div>`
    : ''}
${Object.keys(errores).length ? html`<div class="alert alert--error" role="alert">${icono('info')}<p>Revisá los campos marcados. No se guardó nada.</p></div>` : ''}
<form class="card form ofertas-subir" method="post" action="${r('/ofertas/piezas')}" enctype="multipart/form-data" data-subir-piezas>
  ${csrfCampo(c)}
  <h2 class="card__titulo">Agregar piezas</h2>
  <label class="campo"><span class="label">Imágenes de las ofertas</span>
    <input class="input" type="file" name="piezas" accept="image/jpeg,image/png,image/webp,image/avif" multiple ${si(o.piezas.length >= MAX_PIEZAS, 'disabled')}>
    <span class="ayuda">Podés elegir todas juntas; se agregan al final, en el orden de los nombres de archivo. Formato vertical 4:5 (por ejemplo 1080 × 1350). Hasta ${MAX_PIEZAS} piezas.</span>${err('piezas')}</label>
  <div class="acciones-form acciones-form--previa"><button class="btn" type="submit" ${si(o.piezas.length >= MAX_PIEZAS, 'disabled')}>${icono('mas')}Agregar piezas</button><span class="ayuda" data-subir-estado aria-live="polite"></span></div>
</form>
<form class="grid-form ofertas-form" method="post" action="${r('/ofertas')}" novalidate>
  ${csrfCampo(c)}
  <div class="col">
    <section class="card form"><h2 class="card__titulo">Datos de la sección</h2>
      <label class="campo"><span class="label">Título</span><input class="input" name="titulo" value="${o.titulo}" maxlength="80" placeholder="Ofertas de noviembre" ${inv('titulo')}>${err('titulo')}</label>
      <label class="campo"><span class="label">Período</span><input class="input" name="mes" value="${o.mes}" maxlength="60" placeholder="noviembre de 2026" ${inv('mes')}><span class="ayuda">Se lee: "Ofertas del supermercado de COPOL para …".</span>${err('mes')}</label>
      <label class="campo"><span class="label">${icono('calendario', 14)} Válidas hasta</span><input class="input" type="date" name="hasta" value="${o.hasta}" ${inv('hasta')}><span class="ayuda">Al día siguiente la sección se retira sola de la web.</span>${err('hasta')}</label>
      <div class="acciones-form acciones-form--previa"><button class="btn btn--lg" type="submit" name="accion" value="guardar">Guardar cambios</button><a class="btn btn--ghost" href="/hipermercado/promociones/" target="_blank" rel="noopener">Ver en la web${icono('flecha-externa', 16)}</a></div>
    </section>
  </div>
  <section class="card form ofertas-piezas" aria-labelledby="piezas-titulo">
    <div class="card__cabecera"><h2 class="card__titulo" id="piezas-titulo">Piezas</h2><span class="muted ayuda">${o.piezas.length} de ${MAX_PIEZAS}${sinDescribir ? html` · <strong class="texto-aviso">${sinDescribir} sin describir</strong>` : ''}</span></div>
    ${o.piezas.length
      ? html`<ul class="piezas">${o.piezas.map((p, i) => html`<li class="pieza">
        <img src="${variante(p.imagen, 400)}" alt="" loading="lazy">
        <label class="campo"><span class="label">Producto y precio</span><textarea class="input" name="alt_${p.id}" rows="2" maxlength="200" placeholder="Oferta: Galletas Chocolinas, a 69 pesos." ${inv(`alt_${p.id}`)}>${p.alt}</textarea>${err(`alt_${p.id}`)}</label>
        <div class="pieza__acciones">
          <button class="btn btn--ghost btn--icono" type="submit" name="accion" value="arriba:${p.id}" aria-label="Mover antes" ${si(i === 0, 'disabled')}>${icono('izquierda')}</button>
          <button class="btn btn--ghost btn--icono" type="submit" name="accion" value="abajo:${p.id}" aria-label="Mover después" ${si(i === o.piezas.length - 1, 'disabled')}>${icono('derecha')}</button>
          <label class="check check--chico"><input type="checkbox" name="quitar_${p.id}" value="1"><span>Quitar</span></label>
        </div>
      </li>`)}</ul>
      <p class="ayuda">Describí cada pieza con el producto y el precio tal como figuran: lo leen los lectores de pantalla. Para quitar, marcá "Quitar" y guardá.</p>`
      : html`<p class="muted">Todavía no hay piezas.</p>`}
  </section>
</form>
${o.piezas.length ? html`<form method="post" action="${r('/ofertas/vaciar')}" class="zona-peligro" data-confirmar="¿Quitar todas las piezas de ofertas? La sección dejará de verse en la web hasta que cargues otras.">${csrfCampo(c)}<button class="btn btn--peligro btn--sm" type="submit">${icono('basura', 16)}Quitar todas las piezas (para empezar un mes nuevo)</button></form>` : ''}`);
}

// ── Aperturas de crédito ──
export function vistaCreditos(c: Contexto, lista: Apertura[], error: string | null = null) {
  const futuras = proximas(lista);
  const pasadas = lista.filter((a) => !futuras.includes(a));
  const fecha = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fila = (a: Apertura, pasada = false) => html`<li class="credito${pasada ? ' credito--pasada' : ''}">
    <span class="credito__fecha">${icono('calendario', 16)}<strong>${fecha(a.fecha)}</strong></span>
    ${pasada ? html`<span class="badge badge--sin-stock">Ya pasó</span>` : a.confirmada ? html`<span class="badge badge--con-stock">${icono('check', 14)}Confirmada</span>` : html`<span class="badge badge--sin-dato">A confirmar</span>`}
    <div class="novedad__acciones">
      ${pasada ? '' : html`<form method="post" action="${r('/creditos/confirmar')}">${csrfCampo(c)}<input type="hidden" name="fecha" value="${a.fecha}"><input type="hidden" name="confirmada" value="${a.confirmada ? '0' : '1'}"><button class="btn btn--outline btn--sm" type="submit">${a.confirmada ? 'Marcar "a confirmar"' : 'Marcar confirmada'}</button></form>`}
      <form method="post" action="${r('/creditos/quitar')}" data-confirmar="¿Quitar la apertura del ${fecha(a.fecha)}?">${csrfCampo(c)}<input type="hidden" name="fecha" value="${a.fecha}"><button class="btn btn--ghost btn--sm" type="submit">${icono('basura', 16)}Quitar</button></form>
    </div>
  </li>`;
  return layout(c, 'Administración Página', html`
${tabsPagina('creditos')}
<p class="muted subtitulo">Fechas de apertura de créditos que se ven en Inicio, Beneficios, Hacete socio y Acceso web. Las fechas pasadas se ocultan solas.</p>
${error ? html`<div class="alert alert--error" role="alert">${icono('info')}<p>${error}</p></div>` : ''}
<section class="card" aria-labelledby="proximas-titulo">
  <h2 class="card__titulo" id="proximas-titulo">Próximas aperturas</h2>
  ${futuras.length ? html`<ul class="creditos">${futuras.map((a) => fila(a))}</ul>` : html`<p class="muted">No hay fechas próximas: la web muestra "Las próximas aperturas se publicarán aquí".</p>`}
</section>
<form class="card form ajustes-banner" method="post" action="${r('/creditos')}">
  ${csrfCampo(c)}
  <label class="campo"><span class="label">Nueva fecha</span><input class="input" type="date" name="fecha" required min="${new Date().toISOString().slice(0, 10)}"></label>
  <label class="check"><input type="checkbox" name="confirmada" value="1" checked><span>Confirmada</span></label>
  <button class="btn" type="submit">${icono('mas')}Agregar fecha</button>
</form>
${pasadas.length ? html`<details class="card"><summary class="card__titulo">Fechas pasadas (${pasadas.length})</summary><ul class="creditos">${pasadas.map((a) => fila(a, true))}</ul></details>` : ''}`);
}

// ── Novedades ──
const nombrePlantilla = (p: Plantilla) => PLANTILLAS[p].nombre;
export function vistaNovedades(c: Contexto, lista: Novedad[], imgUrl: (n: Novedad) => string | null) {
  return layout(c, 'Administración Página', html`
${tabsPagina('novedades')}
<p class="muted subtitulo">Las publicadas aparecen en la portada, debajo de Pinecoop, en este orden.</p>
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
      ${badgePublicacion(estadoNovedad(n), n.desde ?? '', n.hasta ?? '')}
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
${tabsPagina('novedades')}
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
      <div class="fila">
        <label class="campo"><span class="label">Desde <span class="opcional">(opcional)</span></span><input class="input" type="date" name="desde" value="${n.desde ?? ''}" ${inv('desde')}>${err('desde')}</label>
        <label class="campo"><span class="label">Hasta <span class="opcional">(opcional)</span></span><input class="input" type="date" name="hasta" value="${n.hasta ?? ''}" ${inv('hasta')}>${err('hasta')}</label>
      </div>
      <p class="ayuda">Con fechas, la novedad aparece y se retira sola (hora de Uruguay).</p>
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

// ── Notificaciones de la app ──
export type NotificacionForm = Partial<Notificacion> & { cuando?: 'ahora' | 'programar' | 'repetir' };
type DatosVistaNotificaciones = { agenda: Instancia[]; ajustes: AjustesNotificaciones; enviadasHoy: number; lista: Notificacion[]; dispositivos: { total: number; porCategoria: Record<CategoriaNotificacion, number> } };
const RECURSOS_NOTIFICACIONES: Recursos = { scripts: ['/panel-recursos/notificaciones.js'] };
const diaAgenda = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long' });
const diasTexto = (dias: string | null) => (dias ? dias.split(',').map((d) => DIAS_SEMANA[Number(d)]?.slice(0, 3)).join(', ') : 'todos los días');
const repeticionTexto = (n: Pick<Notificacion, 'repeticion' | 'fecha' | 'hora' | 'dias' | 'hasta'>) =>
  n.repeticion === 'diaria' ? `Se repite ${diasTexto(n.dias)} a las ${n.hora}, desde el ${fechaCorta(n.fecha)}${n.hasta ? ` hasta el ${fechaCorta(n.hasta)}` : ''}` : `${diaAgenda(n.fecha)} a las ${n.hora}`;

export function vistaNotificaciones(c: Contexto, d: DatosVistaNotificaciones, errores: Record<string, string> = {}) {
  const a = d.ajustes;
  const err = (k: string) => (errores[k] ? html`<span class="error" id="err-${k}">${errores[k]}</span>` : '');
  const hoy = hoyUruguay();
  const usadosHoy = d.enviadasHoy + d.agenda.filter((x) => x.fecha === hoy && !x.omitida).length;
  const porDia = new Map<string, Instancia[]>();
  for (const x of d.agenda) porDia.set(x.fecha, [...(porDia.get(x.fecha) ?? []), x]);
  const ahoraMs = Date.now();
  const manuales = new Map(d.lista.map((n) => [n.id, n]));
  const item = (x: Instancia) => {
    const n = x.notificacionId ? manuales.get(x.notificacionId) : undefined;
    const paso = Date.parse(x.en) <= ahoraMs;
    return html`<li class="aviso-app${x.omitida || paso ? ' aviso-app--apagado' : ''}">
      <span class="aviso-app__hora">${icono('reloj', 16)}${x.hora}</span>
      <div class="aviso-app__texto"><strong>${x.titulo}</strong><span class="muted">${x.texto}</span>
        ${n?.repeticion === 'diaria' ? html`<span class="tabla__sub">${repeticionTexto(n)}</span>` : ''}</div>
      <div class="aviso-app__marcas">
        <span class="badge badge--sin-dato">${CATEGORIAS_NOTIFICACION[x.categoria]}</span>
        ${x.automatica ? html`<span class="badge badge--sin-stock">${icono('chispa', 14)}Automática</span>` : ''}
        ${x.omitida ? html`<span class="badge badge--sin-stock" title="${x.motivo ?? ''}">${icono('pausa', 14)}No sale: ${x.motivo}</span>` : paso ? html`<span class="badge badge--con-stock">${icono('check', 14)}Ya salió</span>` : ''}
      </div>
      ${n && !x.automatica && n.estado === 'programada' ? html`<div class="novedad__acciones">
        <a class="btn btn--ghost btn--sm" href="${r(`/notificaciones/${n.id}`)}">${icono('editar', 16)}Editar</a>
        <form method="post" action="${r(`/notificaciones/${n.id}/cancelar`)}" data-confirmar="¿Cancelar “${n.titulo}”? ${n.repeticion === 'diaria' ? 'Se cancelan todas sus repeticiones.' : 'No va a salir.'}">${csrfCampo(c)}<button class="btn btn--ghost btn--sm" type="submit">${icono('x', 16)}Cancelar</button></form>
      </div>` : x.categoria === 'creditos' && x.automatica ? html`<a class="btn btn--ghost btn--sm" href="${r('/creditos')}">${icono('calendario', 16)}Ver fechas</a>` : ''}
    </li>`;
  };
  const historial = d.lista.filter((n) => n.estado !== 'programada').slice(0, 30);
  // Programadas que todavía no entran en los próximos días de la agenda.
  const enAgenda = new Set(d.agenda.map((x) => x.notificacionId));
  const masAdelante = d.lista.filter((n) => n.estado === 'programada' && !enAgenda.has(n.id)).sort((x, y) => x.fecha.localeCompare(y.fecha));
  const chk = (nombre: string, valor: boolean, texto: string) => html`<label class="check"><input type="checkbox" name="${nombre}" value="1" ${si(valor, 'checked')}><span>${texto}</span></label>`;
  return layout(c, 'Administración Página', html`
${tabsPagina('notificaciones')}
<p class="muted subtitulo">Avisos que llegan al celular de quienes tienen la app de COPOL y los activaron. Cada celular baja la agenda y muestra los avisos a su hora; "Enviar ahora" le llega la próxima vez que la app se actualiza (en general, en menos de una hora).</p>
${!a.activas ? html`<div class="alert alert--error" role="status">${icono('pausa')}<p>Las notificaciones están en pausa: no sale ningún aviso. Activalas en Ajustes.</p></div>` : ''}
${Object.keys(errores).length ? html`<div class="alert alert--error" role="alert">${icono('info')}<p>Revisá los ajustes marcados.</p></div>` : ''}
<div class="metricas-avisos">
  <div class="card metrica-aviso">${icono('celular', 20)}<div><strong>${d.dispositivos.total ? d.dispositivos.total.toLocaleString('es-UY') : 'Sin activar'}</strong><span class="muted">${d.dispositivos.total ? 'celulares con avisos instantáneos' : 'avisos instantáneos (necesitan Firebase): los celulares reciben todo al actualizarse'}</span></div></div>
  <div class="card metrica-aviso">${icono('campana', 20)}<div><strong>${usadosHoy} de ${a.maxPorDia}</strong><span class="muted">avisos hoy (máximo por día)</span></div></div>
  <div class="card metrica-aviso">${icono('reloj', 20)}<div><strong>${a.desde} a ${a.hasta}</strong><span class="muted">horario permitido</span></div></div>
</div>
<section class="card" aria-labelledby="agenda-titulo">
  <h2 class="card__titulo" id="agenda-titulo">Próximos ${LIMITES_NOTIFICACION.diasAgenda} días</h2>
  ${porDia.size
    ? html`<div class="agenda-avisos">${[...porDia].map(([fecha, lista]) => html`<div class="agenda-avisos__dia"><h3>${fecha === hoy ? 'Hoy' : diaAgenda(fecha)}</h3><ul class="avisos-app">${lista.map(item)}</ul></div>`)}</div>`
    : html`<p class="muted">No hay avisos programados. Las aperturas de crédito confirmadas generan sus avisos solas.</p>`}
  ${masAdelante.length ? html`<h3 class="agenda-avisos__mas">Más adelante</h3><ul class="avisos-app">${masAdelante.map((n) => html`<li class="aviso-app">
    <span class="aviso-app__hora">${icono('calendario', 16)}${fechaCorta(n.fecha)}</span>
    <div class="aviso-app__texto"><strong>${n.titulo}</strong><span class="tabla__sub">${repeticionTexto(n)}</span></div>
    ${n.origen === 'manual' ? html`<div class="novedad__acciones">
      <a class="btn btn--ghost btn--sm" href="${r(`/notificaciones/${n.id}`)}">${icono('editar', 16)}Editar</a>
      <form method="post" action="${r(`/notificaciones/${n.id}/cancelar`)}" data-confirmar="¿Cancelar “${n.titulo}”?">${csrfCampo(c)}<button class="btn btn--ghost btn--sm" type="submit">${icono('x', 16)}Cancelar</button></form>
    </div>` : html`<span class="badge badge--sin-stock">${icono('chispa', 14)}Automática</span>`}
  </li>`)}</ul>` : ''}
</section>
<form class="card form" method="post" action="${r('/notificaciones/ajustes')}" aria-labelledby="ajustes-titulo">
  ${csrfCampo(c)}
  <h2 class="card__titulo" id="ajustes-titulo">Ajustes</h2>
  ${chk('activas', a.activas, 'Notificaciones activas (desmarcá para poner todo en pausa)')}
  <div class="fila">
    <label class="campo"><span class="label">Máximo de avisos por día</span><select class="input" name="max_por_dia">${Array.from({ length: LIMITES_NOTIFICACION.maxPorDia }, (_, i) => i + 1).map((n) => html`<option value="${n}" ${si(n === a.maxPorDia, 'selected')}>${n}</option>`)}</select>${err('max_por_dia')}</label>
    <label class="campo"><span class="label">Desde las</span><input class="input" type="time" name="desde" value="${a.desde}" required></label>
    <label class="campo"><span class="label">Hasta las</span><input class="input" type="time" name="hasta" value="${a.hasta}" required>${err('horario')}</label>
  </div>
  <p class="ayuda">Ningún aviso sale fuera de ese horario. Si un día se pasa del máximo, primero salen los de crédito, después los tuyos, las ofertas y las novedades.</p>
  <fieldset class="campo"><legend class="label">Avisos automáticos</legend>
    ${chk('credito_activo', a.credito.activo, 'Aperturas de crédito (solo fechas confirmadas)')}
    <div class="fila sangria">
      ${chk('credito_anterior', a.credito.diaAnterior, 'El día anterior')}
      ${chk('credito_dia', a.credito.mismoDia, 'El mismo día')}
      <label class="campo"><span class="label">A las</span><input class="input" type="time" name="credito_hora" value="${a.credito.hora}" required>${err('credito_hora')}</label>
    </div>
    ${chk('ofertas_activo', a.ofertas.activo, 'Ofertas del supermercado nuevas (al cargar las de un mes nuevo)')}
    ${chk('novedades_activo', a.novedades.activo, 'Novedades (al publicar una)')}
  </fieldset>
  <div class="acciones-form"><button class="btn" type="submit">${icono('check')}Guardar ajustes</button></div>
</form>
<section class="card" aria-labelledby="historial-titulo">
  <h2 class="card__titulo" id="historial-titulo">Enviadas y canceladas</h2>
  ${historial.length ? html`<ul class="avisos-app">${historial.map((n) => html`<li class="aviso-app">
    <span class="aviso-app__hora">${icono(n.estado === 'enviada' ? 'enviar' : 'x', 16)}${n.enviada_en ? fecha(n.enviada_en) : fechaCorta(n.fecha)}</span>
    <div class="aviso-app__texto"><strong>${n.titulo}</strong><span class="muted">${n.texto}</span></div>
    <div class="aviso-app__marcas">
      ${n.estado === 'enviada' ? html`<span class="badge badge--con-stock">${icono('check', 14)}Enviada${n.alcance != null ? ` a ${n.alcance.toLocaleString('es-UY')} celulares` : ''}</span>` : html`<span class="badge badge--sin-stock">Cancelada</span>`}
      ${n.origen !== 'manual' ? html`<span class="badge badge--sin-stock">${icono('chispa', 14)}Automática</span>` : ''}
    </div>
    <form method="post" action="${r(`/notificaciones/${n.id}/eliminar`)}" data-confirmar="¿Quitar “${n.titulo}” del historial?">${csrfCampo(c)}<button class="btn btn--ghost btn--sm" type="submit" aria-label="Quitar ${n.titulo} del historial">${icono('basura', 16)}</button></form>
  </li>`)}</ul>` : html`<p class="muted">Todavía no salió ninguna.</p>`}
</section>`, html`<a class="btn" href="${r('/notificaciones/nueva')}">${icono('mas')}Nueva notificación</a>`);
}

export function vistaFormNotificacion(c: Contexto, n: NotificacionForm, errores: Record<string, string>, a: AjustesNotificaciones, dispositivos: { total: number; porCategoria: Record<CategoriaNotificacion, number> }) {
  const err = (k: string) => (errores[k] ? html`<span class="error" id="err-${k}">${errores[k]}</span>` : '');
  const inv = (k: string) => (errores[k] ? raw(`aria-invalid="true" aria-describedby="err-${k}"`) : '');
  const cuando = n.cuando ?? 'programar';
  const destino = (n.destino && n.destino in DESTINOS_NOTIFICACION ? n.destino : 'inicio') as DestinoNotificacion;
  const categoria = (n.categoria && n.categoria in CATEGORIAS_NOTIFICACION ? n.categoria : 'avisos') as CategoriaNotificacion;
  const dias = n.dias ? String(n.dias).split(',') : n.id ? [] : ['1', '2', '3', '4', '5'];
  const accion = n.id ? r(`/notificaciones/${n.id}`) : r('/notificaciones/nueva');
  const opcionCuando = (v: string, titulo: string, ayuda: string) => html`<label class="opcion-cuando"><input type="radio" name="cuando" value="${v}" ${si(cuando === v, 'checked')}><span><strong>${titulo}</strong><small class="muted">${ayuda}</small></span></label>`;
  const alcance = (cat: CategoriaNotificacion) => dispositivos.porCategoria[cat] ?? 0;
  return layout(c, n.id ? 'Editar notificación' : 'Nueva notificación', html`
${tabsPagina('notificaciones')}
${Object.keys(errores).length ? html`<div class="alert alert--error" role="alert">${icono('info')}<p>${errores.cuando ?? 'Revisá los campos marcados.'}</p></div>` : ''}
<form method="post" action="${accion}" novalidate class="grid-form" data-form-notificacion data-alcance='${JSON.stringify(dispositivos.porCategoria)}'>
  ${csrfCampo(c)}
  <div class="col">
    <section class="card form"><h2 class="card__titulo">Mensaje</h2>
      <label class="campo"><span class="label">Título</span><input class="input" name="titulo" value="${n.titulo ?? ''}" required maxlength="${LIMITES_NOTIFICACION.titulo}" placeholder="Hoy hay apertura de créditos" ${inv('titulo')} data-np="titulo">${err('titulo')}</label>
      <label class="campo"><span class="label">Texto</span><textarea class="input" name="texto" rows="3" required maxlength="${LIMITES_NOTIFICACION.texto}" ${inv('texto')} data-np="texto">${n.texto ?? ''}</textarea><span class="ayuda">Corto y claro: se lee en la pantalla bloqueada. Máximo ${LIMITES_NOTIFICACION.texto} caracteres.</span>${err('texto')}</label>
      <div class="fila">
        <label class="campo"><span class="label">Tipo de aviso</span><select class="input" name="categoria" data-np="categoria">${(Object.keys(CATEGORIAS_NOTIFICACION) as CategoriaNotificacion[]).map((k) => html`<option value="${k}" ${si(k === categoria, 'selected')}>${CATEGORIAS_NOTIFICACION[k]} (${alcance(k)})</option>`)}</select><span class="ayuda">Cada persona elige en la app qué tipos recibe. Entre paréntesis: celulares que lo reciben al instante.</span></label>
        <label class="campo"><span class="label">Al tocarlo abre</span><select class="input" name="destino" data-np="destino">${(Object.keys(DESTINOS_NOTIFICACION) as DestinoNotificacion[]).map((k) => html`<option value="${k}" data-boton="${DESTINOS_NOTIFICACION[k].boton}" ${si(k === destino, 'selected')}>${DESTINOS_NOTIFICACION[k].nombre}</option>`)}</select></label>
      </div>
      <label class="check"><input type="checkbox" name="con_boton" value="1" ${si(n.con_boton ?? 1, 'checked')} data-np="boton"><span>Mostrar un botón en el aviso (“<span data-np-boton>${DESTINOS_NOTIFICACION[destino].boton}</span>”)</span></label>
    </section>
    <section class="card form"><h2 class="card__titulo">Cuándo</h2>
      <fieldset class="campo opciones-cuando"><legend class="sr">Cuándo sale</legend>
        ${opcionCuando('ahora', 'Enviar ahora', dispositivos.total ? 'Llega en segundos a los celulares con avisos instantáneos; al resto, cuando la app se actualiza.' : 'Le llega a cada celular la próxima vez que la app se actualiza (en general, en menos de una hora).')}
        ${opcionCuando('programar', 'Programar', 'Un día y una hora.')}
        ${opcionCuando('repetir', 'Repetir', 'Todos los días o algunos días de la semana, a la misma hora.')}
      </fieldset>
      <div class="fila" data-cuando="programar repetir">
        <label class="campo"><span class="label" data-cuando-texto>${cuando === 'repetir' ? 'Desde el día' : 'Día'}</span><input class="input" type="date" name="fecha" value="${n.fecha ?? ''}" min="${hoyUruguay()}" ${inv('fecha')}>${err('fecha')}</label>
        <label class="campo"><span class="label">Hora</span><input class="input" type="time" name="hora" value="${n.hora ?? ''}" min="${a.desde}" max="${a.hasta}" ${inv('hora')}>${err('hora')}</label>
      </div>
      <div data-cuando="repetir">
        <fieldset class="campo"><legend class="label">Días de la semana</legend>
          <div class="dias-semana">${[1, 2, 3, 4, 5, 6, 0].map((i) => html`<label class="check check--chico"><input type="checkbox" name="dias" value="${i}" ${si(dias.includes(String(i)), 'checked')}><span>${DIAS_SEMANA[i]}</span></label>`)}</div>${err('dias')}
        </fieldset>
        <label class="campo"><span class="label">Hasta el día <span class="opcional">(opcional)</span></span><input class="input" type="date" name="hasta" value="${n.hasta ?? ''}" ${inv('hasta')}>${err('hasta')}</label>
      </div>
      <p class="ayuda">Horario permitido: ${a.desde} a ${a.hasta} · máximo ${a.maxPorDia} ${a.maxPorDia === 1 ? 'aviso' : 'avisos'} por día (se cambia en Ajustes). Conviene programar con un día de anticipación para que llegue a todos los celulares.</p>
    </section>
  </div>
  <div class="col">
    <section class="card previa-aviso" aria-label="Vista previa del aviso">
      <h2 class="card__titulo">Vista previa</h2>
      <p class="ayuda">Así se ve en la pantalla de un celular Android.</p>
      <div class="previa-aviso__pantalla">
        <div class="previa-aviso__burbuja">
          <div class="previa-aviso__app"><img src="/favicon.png" alt="" width="18" height="18"><span>COPOL · ahora</span></div>
          <strong data-np-ver="titulo">${n.titulo || 'Título del aviso'}</strong>
          <p data-np-ver="texto">${n.texto || 'Texto del aviso.'}</p>
          <span class="previa-aviso__boton" data-np-ver="boton" ${si(!(n.con_boton ?? 1), 'hidden')}>${DESTINOS_NOTIFICACION[destino].boton}</span>
        </div>
      </div>
    </section>
    <div class="acciones-form"><button class="btn btn--lg" type="submit" data-boton-enviar>${cuando === 'ahora' ? html`${icono('enviar')}Enviar ahora` : n.id ? 'Guardar cambios' : 'Programar'}</button><a class="btn btn--ghost" href="${r('/notificaciones')}">Volver</a></div>
  </div>
</form>
${n.id && n.estado === 'programada' ? html`<form method="post" action="${r(`/notificaciones/${n.id}/cancelar`)}" class="zona-peligro" data-confirmar="¿Cancelar “${n.titulo}”?">${csrfCampo(c)}<button class="btn btn--peligro btn--sm" type="submit">${icono('x', 16)}Cancelar esta notificación</button></form>` : ''}`, '', RECURSOS_NOTIFICACIONES);
}

// ── Usuarios ──
/** Casillas de roles: se puede marcar más de uno (los permisos se suman). Agrupadas por sección del panel. */
function selectorRoles(marcados: readonly string[], error: H | '') {
  const grupos = (Object.keys(GRUPOS_ROL) as (keyof typeof GRUPOS_ROL)[]).map((g) => ({ g, roles: (Object.keys(ROLES) as Rol[]).filter((rr) => ROLES[rr].grupo === g) })).filter((x) => x.roles.length);
  return html`<fieldset class="campo roles"><legend class="label">Roles <span class="opcional">(se puede elegir más de uno)</span></legend>
    ${grupos.map(({ g, roles }) => html`<div class="roles__grupo"><p class="roles__titulo">${GRUPOS_ROL[g]}</p>${roles.map((rr) => html`<label class="check check--rol"><input type="checkbox" name="roles" value="${rr}" ${si(marcados.includes(rr), 'checked')}><span><strong>${ROLES[rr].nombre}</strong><small>${ROLES[rr].descripcion}</small></span></label>`)}</div>`)}
    ${error}</fieldset>`;
}

export function vistaUsuarios(c: Contexto, usuarios: UsuarioPublico[], errores: Record<string, string> = {}, previo: Record<string, string> = {}) {
  const err = (k: string) => (errores[k] ? html`<span class="error">${errores[k]}</span>` : '');
  return layout(c, 'Usuarios', html`
<div class="grid-usuarios">
<div class="tabla-caja"><table class="tabla">
<thead><tr><th scope="col">Usuario</th><th scope="col">Roles</th><th scope="col" class="ocultar-movil">Correo</th><th scope="col" class="ocultar-movil">Último acceso</th><th scope="col"><span class="sr">Acciones</span></th></tr></thead>
<tbody>${usuarios.map((u) => html`<tr>
  <td><strong>${u.usuario}</strong>${!u.activo ? html` <span class="badge badge--sin-stock">Desactivado</span>` : ''}${u.debe_cambiar_clave ? html` <span class="badge badge--sin-dato">Clave temporal</span>` : ''}</td>
  <td>${nombresRoles(u)}${u.protegido ? html` <span class="muted" title="Administrador principal">${icono('escudo', 14)}</span>` : ''}</td>
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
    ${selectorRoles(previo.roles ? previo.roles.split(',') : ['visualizador'], err('roles'))}
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
<section class="card form"><h2 class="card__titulo">Roles y acceso</h2>
<form method="post" action="${r(`/usuarios/${u.id}`)}" class="form">
  ${csrfCampo(c)}
  ${selectorRoles(u.roles, err('roles'))}
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
  <td><strong>${s.usuario}</strong><span class="tabla__sub">${nombresRoles(s.roles.split(',') as Rol[])}</span></td>
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
/** Fila del historial: enlace a la conversación y botón para eliminarla sin abrirla. */
export const itemHistorial = (c: Contexto, h: ResumenConversacion, actual: boolean) => html`<li class="historial__fila"><a class="historial__item" href="${r(`/asistente?c=${h.id}`)}" data-conversacion="${h.id}" ${si(actual, 'aria-current="page"')}>
  <span class="historial__titulo">${h.titulo}</span>
  <span class="historial__meta"><span>${cuando(h.actualizada_en)}</span>${h.cambios ? html`<span class="historial__cambios">${icono('check', 12)}${h.cambios === 1 ? '1 cambio' : `${h.cambios} cambios`}</span>` : ''}</span>
</a><form class="historial__borrar-form" method="post" action="${r(`/asistente/conversaciones/${h.id}/eliminar`)}" data-eliminar data-titulo="${h.titulo}">${csrfCampo(c)}<button class="historial__borrar" type="submit" title="Eliminar conversación">${icono('basura', 15)}<span class="sr">Eliminar conversación: ${h.titulo}</span></button></form></li>`;

export function vistaAsistente(c: Contexto, d: DatosAsistente) {
  const id = d.conversacionId;
  const actual = d.historial.find((h) => h.id === id);
  return layout(c, 'Asistente', html`
<div class="asistente-app">
<details class="card historial" data-historial open>
  <summary class="historial__cabecera"><span class="historial__nombre">${icono('registro', 16)}Historial <span class="historial__n" data-historial-n>${d.historial.length}</span></span>${icono('chevron', 16)}</summary>
  <a class="btn btn--outline btn--sm btn--bloque historial__nueva" href="${r('/asistente')}" ${si(!id, 'aria-current="page"')}>${icono('mas', 16)}Nueva conversación</a>
  <ul class="historial__lista" data-historial-lista aria-label="Conversaciones anteriores">${d.historial.map((h) => itemHistorial(c, h, h.id === id))}</ul>
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

  <section class="portal-doc" aria-labelledby="portal-reglamento">
    <div class="portal-doc__texto">
      <span class="portal-doc__eyebrow">Documentos</span>
      <h2 id="portal-reglamento">Reglamento Interno del Personal</h2>
      <p>Consultá el reglamento interno: derechos, obligaciones, normas de conducta y procedimientos disciplinarios del personal de COPOL.</p>
    </div>
    ${p.reglamentoUrl
      ? html`<div class="portal-doc__qr">
        <div class="portal-doc__codigo">${raw(qrSvg(p.reglamentoUrl, 'Código QR: Reglamento Interno del Personal'))}</div>
        <p>Escaneá el código con la cámara del celular o abrilo desde acá.</p>
        <a class="btn portal-doc__boton" href="${p.reglamentoUrl}" target="_blank" rel="noopener noreferrer">Abrir el reglamento${icono('flecha-externa', 16)}</a>
      </div>`
      : pendiente(editar, 'Falta el enlace del reglamento.')}
  </section>

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
    <div class="portal__pronto">
      <h2 id="portal-cdp" class="portal__titulo">Ciudad del Plata abre pronto</h2>
      <p class="muted">Estamos ultimando detalles de la nueva sede. En breve vas a encontrar acá fotos del espacio, servicios y horarios.</p>
      <span class="portal__obras">${icono('reloj', 14)}En obras · cooperativapolicial.com.uy</span>
    </div>
    ${p.ciudadDelPlata.length ? html`<div class="portal__foto">${fotoPortal(p.ciudadDelPlata[0], '(min-width: 900px) 760px, 92vw')}</div>` : ''}
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
      ${enlace('reglamento_url', 'Reglamento Interno del Personal', p.reglamentoUrl, 'Documento del reglamento. Si es de Google Docs, compartilo como "Cualquier persona con el enlace".')}
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

// ── Registros ──
const RECURSOS_REGISTROS: Recursos = { estilos: ['/panel-recursos/registros.css'], scripts: ['/panel-recursos/registros-direccion.js', '/panel-recursos/registros.js'] };

const avisoPlanilla = (p: EstadoPlanilla) =>
  p.aviso ? html`<div class="alert ${p.listo ? 'alert--aviso' : 'alert--error'}" role="status">${icono('info')}<p>${p.aviso}</p></div>` : '';

export function vistaRegistros(c: Contexto, d: { planilla: EstadoPlanilla; ia: boolean }) {
  const campo = (etiqueta: H | string, input: H) => html`<label class="campo"><span class="label">${etiqueta}</span>${input}</label>`;
  return layout(c, 'Nuevo registro', html`
${avisoPlanilla(d.planilla)}
<div class="carga ${d.ia ? '' : 'carga--sola'}" data-registros data-csrf="${c.csrf}" data-usuario="${c.usuario?.usuario ?? ''}" data-ia="${d.ia ? '1' : '0'}">
  ${d.ia ? html`<section class="card chat" aria-labelledby="t-chat">
    <div class="chat__cabeza">
      <h2 class="card__titulo chat__titulo" id="t-chat">${icono('chispa')}Asistente</h2>
      <button type="button" class="btn btn--ghost btn--sm" data-nuevo-chat>${icono('nuevo', 16)}Nueva conversación</button>
    </div>
    <div class="asistente__registro" data-mensajes aria-live="polite"></div>
    <form class="chat__entrada" data-chat>
      <label class="sr" for="chat-texto">Mensaje para el asistente</label>
      <div class="chat__caja">
        <textarea id="chat-texto" class="input" name="texto" rows="3" maxlength="4000" placeholder="Pegá o escribí los datos como te llegaron…"></textarea>
        <button type="button" class="microfono" data-microfono aria-pressed="false" title="Dictar los datos" aria-label="Dictar los datos con el micrófono" hidden>${icono('microfono', 18)}</button>
      </div>
      <div class="chat__adjuntos" data-adjuntos hidden aria-live="polite"></div>
      <div class="chat__herramientas">
        <button type="button" class="btn btn--outline btn--sm" data-camara title="Sacar una foto de un documento">${icono('camara', 16)}Foto</button>
        <button type="button" class="btn btn--outline btn--sm" data-clip title="Adjuntar una foto, un PDF o un archivo de texto">${icono('clip', 16)}Adjuntar</button>
        <input type="file" data-archivo-camara accept="image/*" capture="environment" hidden>
        <input type="file" data-archivo-clip accept="image/*,application/pdf,text/plain,.txt" multiple hidden>
      </div>
      <div class="chat__acciones">
        <span class="chat__ayuda" data-ayuda-chat>Enter envía · Shift+Enter hace un salto de línea</span>
        <button class="btn" type="submit">${icono('enviar', 16)}Completar</button>
      </div>
    </form>
  </section>` : ''}
  <section class="card registro" aria-labelledby="t-form">
    <h2 class="card__titulo" id="t-form">Datos del registro</h2>
    <form class="form" data-registro novalidate autocomplete="off">
      ${campo('Nombre', html`<input class="input" name="nombre" maxlength="120" required>`)}
      <div class="fila-2">
        ${campo('N° de socio', html`<input class="input" name="socio" inputmode="numeric" maxlength="12" required>`)}
        ${campo('Cédula', html`<input class="input" name="cedula" inputmode="numeric" maxlength="14" placeholder="Solo números, ej.: 55605392" required>`)}
      </div>
      <div class="campo" data-direccion>
        <label class="label" for="f-direccion">Dirección</label>
        <div class="input-grupo">
          <input class="input" id="f-direccion" name="direccion" maxlength="200" required autocomplete="off" aria-describedby="dir-ayuda" aria-controls="dir-resultados" enterkeyhint="search">
          <button type="button" class="btn btn--outline" data-buscar-dir>Buscar</button>
        </div>
        <span id="dir-ayuda" class="ayuda">Escribí calle y número y elegí la ubicación de la lista: se guarda con un link a Google Maps.</span>
        <div id="dir-resultados" class="dir-resultados" data-dir-resultados hidden aria-live="polite"></div>
        <div data-dir-elegida></div>
      </div>
      ${campo('Producto', html`<input class="input" name="producto" maxlength="200" required>`)}
      <div class="fila-2">
        ${campo('Código interno', html`<input class="input" name="codigo" maxlength="40" required>`)}
        <fieldset class="campo" data-flete><legend class="label">Flete</legend>
          <div class="opciones-fila">
            <label class="opcion"><input type="radio" name="flete" value="Sí">Sí</label>
            <label class="opcion"><input type="radio" name="flete" value="No" checked>No</label>
          </div>
        </fieldset>
      </div>
      ${campo(html`Service <span class="opcional">(opcional)</span>`, html`<input class="input" name="service" maxlength="300" placeholder="Ej.: instalación, reparación en garantía">`)}
      ${campo(html`Información adicional <span class="opcional">(opcional)</span>`, html`<textarea class="input" name="adicional" rows="3" maxlength="500" placeholder="Ej.: teléfono, horario de entrega, cómo llegar"></textarea>`)}
      <div data-estado-registro></div>
      <div class="registro__acciones">
        <button class="btn btn--lg" type="submit">Guardar en la planilla</button>
        <button class="btn btn--outline btn--lg" type="button" data-limpiar>Limpiar</button>
      </div>
    </form>
  </section>
</div>
<noscript><div class="alert alert--error" role="alert">${icono('info')}<p>El formulario de registros necesita JavaScript.</p></div></noscript>`, '', RECURSOS_REGISTROS);
}

export function vistaPlanilla(c: Contexto, d: { planilla: EstadoPlanilla; registros: Registro[]; total: number }) {
  const prueba = d.planilla.modo === 'prueba';
  const esAdmin = Boolean(c.usuario && puede(c.usuario, 'usuarios'));
  const td = (etiqueta: string, v: string | null, clase = '') => html`<td data-etiqueta="${etiqueta}" class="${clase}">${v || '—'}</td>`;
  const acciones = prueba
    ? html`<a class="btn" href="${r('/registros/planilla.xlsx')}" download>${icono('descargar', 16)}Descargar Excel (.xlsx)</a>
      ${esAdmin && d.total ? html`<form method="post" action="${r('/registros/planilla/vaciar')}" data-confirmar="¿Borrar todas las filas de la planilla de prueba? Conviene descargarla antes en Excel.">${csrfCampo(c)}<button class="btn btn--outline" type="submit">${icono('basura', 16)}Vaciar</button></form>` : ''}`
    : html`${d.planilla.enlace ? html`<a class="btn" href="${d.planilla.enlace}" target="_blank" rel="noopener noreferrer">${icono('flecha-externa', 16)}Abrir hoja de Google</a>` : ''}`;
  return layout(c, prueba ? 'Planilla de prueba' : 'Planilla de registros', html`
${avisoPlanilla(d.planilla)}
${!prueba && d.planilla.listo ? html`<section class="card form"><h2 class="card__titulo">Hoja de Google Sheets</h2>
  <dl class="datos"><dt>Archivo</dt><dd>${d.planilla.nombre ?? '—'}</dd><dt>Pestaña de este mes</dt><dd>${d.planilla.pestana ?? '—'} <span class="muted">(al cambiar el mes, los registros pasan solos a la pestaña nueva)</span></dd><dt>Cuenta</dt><dd>${d.planilla.cuenta ?? '—'}</dd></dl>
  <p class="muted">Los datos completos de cada registro (cédula, dirección, service e información adicional) están solo en la hoja. Acá se ve un resumen de lo que se cargó desde el panel.</p>
</section>` : ''}
<p class="muted">${d.total ? `${d.total.toLocaleString('es-UY')} registro${d.total === 1 ? '' : 's'}${d.total > d.registros.length ? ` (se muestran los últimos ${d.registros.length})` : ''}. El más nuevo arriba.` : prueba ? 'La planilla de prueba está vacía.' : 'Todavía no se cargó ningún registro desde el panel.'}</p>
${d.registros.length ? html`<div class="tabla-caja"><table class="tabla tabla--lista tabla--registros">
  <thead><tr><th scope="col">Nombre</th><th scope="col">Fecha</th><th scope="col">Socio</th>${prueba ? html`<th scope="col">Cédula</th><th scope="col">Dirección</th>` : ''}<th scope="col">Producto</th><th scope="col">Código</th><th scope="col">Flete</th>${prueba ? html`<th scope="col">Service</th>` : ''}<th scope="col">Cargado por</th>${prueba ? html`<th scope="col">Información adicional</th>` : html`<th scope="col">Dónde quedó</th>`}</tr></thead>
  <tbody>${d.registros.map((x) => html`<tr>${td('Nombre', x.nombre)}${td('Fecha', x.fecha, 'nowrap')}${td('Socio', x.socio)}${prueba ? html`${td('Cédula', x.cedula, 'nowrap')}${x.mapa ? html`<td data-etiqueta="Dirección"><a href="${x.mapa}" target="_blank" rel="noopener noreferrer">${x.direccion}</a></td>` : td('Dirección', x.direccion)}` : ''}${td('Producto', x.producto)}${td('Código', x.codigo)}${td('Flete', x.flete)}${prueba ? td('Service', x.service) : ''}${td('Cargado por', x.cargado_por)}${prueba ? td('Información adicional', x.adicional) : td('Dónde quedó', x.destino)}</tr>`)}</tbody></table></div>` : ''}`, acciones);
}
