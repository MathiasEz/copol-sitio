// Panel de registros COPOL (navegador). Pantallas de acceso (PIN, usuario y contraseña, código por correo),
// y el panel: Formulario (con el asistente tipo chat y micrófono), Planilla, Usuarios, Accesos y Mi perfil.
// Todo lo que se valida o se permite se decide en el servidor; acá solo se muestra y se avisa antes de enviar.
'use strict';

const BASE = location.pathname.replace(/\/+$/, '');
const raiz = document.getElementById('raiz');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const ICONOS = {
  formulario: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  registro: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  planilla: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  usuarios: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
  escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
  salir: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chispa: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/>',
  enviar: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  deshacer: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  microfono: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>',
  clip: '<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
  camara: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/>',
  parar: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  descargar: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  externo: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  basura: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  luna: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  nuevo: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
};
const icono = (n, t = 18, clase = 'i') => `<svg class="${clase}" width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[n] ?? ''}</svg>`;
const botonTema = (clase) => `<button type="button" class="${clase}" data-tema-boton aria-pressed="false">${icono('luna', 16, 'i i--luna')}${icono('sol', 16, 'i i--sol')}<span data-tema-texto>Modo oscuro</span></button>`;
const alerta = (tipo, texto) => (texto ? `<div class="alert alert--${tipo}" role="${tipo === 'error' ? 'alert' : 'status'}">${icono(tipo === 'ok' ? 'check' : 'info')}<p>${esc(texto)}</p></div>` : '');
const fecha = (iso) => (iso ? new Date(iso).toLocaleString('es-UY', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Montevideo' }) : '—');

let estado = null; // respuesta de /api/estado (fase, usuario, planilla, ia…)

// ── API ──
async function api(ruta, { metodo = 'GET', datos } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}/api/${ruta}`, {
      method: metodo, credentials: 'same-origin',
      headers: datos !== undefined ? { 'content-type': 'application/json' } : {},
      body: datos !== undefined ? JSON.stringify(datos) : undefined,
    });
  } catch {
    return { ok: false, status: 0, error: 'No se pudo conectar. Revisá internet y probá de nuevo.' };
  }
  const cuerpo = await res.json().catch(() => ({}));
  const r = { ok: res.ok, status: res.status, ...cuerpo };
  // La sesión venció o falta un paso: se vuelve a la pantalla que corresponde.
  if ((res.status === 401 || res.status === 403) && cuerpo.fase && estado?.fase === 'panel' && ruta !== 'salir') {
    await iniciar(cuerpo.error);
  }
  return r;
}

/** Envía un formulario de una pantalla de acceso y pasa a la fase siguiente. */
function alEnviar(form, ruta, armar, alResponder) {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const boton = $('button[type="submit"]', form);
    boton.setAttribute('aria-busy', 'true');
    const r = await api(ruta, { metodo: 'POST', datos: armar(new FormData(form)) });
    boton.removeAttribute('aria-busy');
    if (alResponder && alResponder(r) === false) return;
    if (r.ok || r.fase) {
      if (r.fase === 'panel' || r.fase === 'clave') {
        estado = r;
        pintar();
      } else {
        await iniciar(r.ok ? null : r.error);
      }
      return;
    }
    const error = $('[data-error]', form);
    error.innerHTML = alerta('error', r.error || 'No se pudo continuar.');
    if (r.errores) for (const [k, v] of Object.entries(r.errores)) marcar(form, k, v);
    else if (r.campo) marcar(form, r.campo, '');
    $('input:not([type="hidden"])', form)?.focus();
  });
}

function marcar(form, campo, texto) {
  const input = form.elements[campo];
  if (!input || !input.setAttribute) return;
  input.setAttribute('aria-invalid', 'true');
  const caja = input.closest('.campo');
  let nota = caja && $('.error', caja);
  if (caja && texto) {
    if (!nota) {
      nota = document.createElement('span');
      nota.className = 'error';
      caja.append(nota);
    }
    nota.textContent = texto;
  }
  input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); nota?.remove(); }, { once: true });
}

// ── Pantallas de acceso ──
function simple(titulo, texto, cuerpo, aviso = null) {
  document.body.className = 'simple';
  raiz.removeAttribute('aria-busy');
  raiz.style.display = '';
  raiz.className = 'simple__caja card';
  raiz.innerHTML = `${botonTema('btn btn--outline btn--sm tema-flotante')}
    <img src="recursos/logo-copol.svg" alt="COPOL" width="110" height="46">
    <div class="pantalla-texto"><h1 class="titulo">${esc(titulo)}</h1>${texto ? `<p class="muted">${texto}</p>` : ''}</div>
    ${aviso ? alerta('error', aviso) : ''}
    ${cuerpo}`;
  pintarTema();
  $('input:not([type="hidden"]):not([readonly])', raiz)?.focus();
}

const campo = (etiqueta, input, ayuda = '') => `<label class="campo"><span class="label">${etiqueta}</span>${input}${ayuda ? `<span class="ayuda">${ayuda}</span>` : ''}</label>`;
const inputPin = (nombre, extra = '') => `<input class="input input--pin" type="password" name="${nombre}" inputmode="numeric" pattern="\\d{6}" minlength="6" maxlength="6" autocomplete="off" required ${extra}>`;

const PANTALLAS = {
  configurar(e, aviso) {
    simple('Configuración inicial', 'Se crea el administrador principal y el PIN del panel. Esta pantalla se usa una sola vez.', `
      <form class="form" novalidate>
        <div data-error></div>
        ${e.codigoConfigurado ? '' : alerta('error', 'Falta PANEL_CODIGO_INICIAL en Vercel.')}
        ${campo('Código de configuración', '<input class="input secreto" name="codigo" autocomplete="off" required maxlength="100">', 'Te lo pasó quien instaló el panel.')}
        ${campo('Usuario', `<input class="input" name="usuario" value="${esc(e.admin)}" readonly>`, 'Administrador principal (protegido).')}
        ${campo('Tu nombre', '<input class="input" name="nombre" autocomplete="name" maxlength="80">', 'Queda en la columna «Cargado por» de la planilla.')}
        ${campo('Correo', '<input class="input" type="email" name="correo" autocomplete="email" required maxlength="160">', 'Ahí llega el código de 6 números en cada ingreso.')}
        ${campo('Contraseña', '<input class="input" type="password" name="clave" autocomplete="new-password" required minlength="10" maxlength="200">', 'Mínimo 10 caracteres, con 3 de estos tipos: minúsculas, mayúsculas, números y símbolos.')}
        ${campo('Repetí la contraseña', '<input class="input" type="password" name="repetir" autocomplete="new-password" required maxlength="200">')}
        <div class="fila">
          ${campo('PIN del panel (6 números)', inputPin('pin'))}
          ${campo('Repetí el PIN', inputPin('repetirPin'))}
        </div>
        <p class="ayuda">El PIN se pide antes del usuario en las computadoras que no están recordadas. Es uno solo para todo el equipo: evitá números repetidos o seguidos.</p>
        <button class="btn btn--lg btn--bloque" type="submit">Crear y entrar</button>
      </form>`, aviso);
    alEnviar($('form', raiz), 'configurar', (f) => Object.fromEntries(f));
  },
  pin(e, aviso) {
    simple('Acceso restringido', 'Ingresá el PIN de 6 números del panel.', `
      <form class="form"><div data-error></div>
        ${campo('PIN', inputPin('pin'))}
        <button class="btn btn--lg btn--bloque" type="submit">Continuar</button>
      </form>`, aviso);
    alEnviar($('form', raiz), 'pin', (f) => ({ pin: f.get('pin') }));
  },
  ingreso(e, aviso) {
    simple('Panel de registros', 'Ingresá con tu usuario o correo.', `
      <form class="form"><div data-error></div>
        ${campo('Usuario o correo', '<input class="input" name="usuario" autocomplete="username" required maxlength="120" autocapitalize="none">')}
        ${campo('Contraseña', '<input class="input" type="password" name="clave" autocomplete="current-password" required maxlength="200">')}
        ${e.sinCorreo ? '<label class="check"><input type="checkbox" name="recordar" checked><span>Recordar este equipo (la sesión no se cierra mientras lo uses; si salís, solo piden usuario y contraseña)</span></label><p class="ayuda">Desmarcalo si la computadora o el celular es compartido.</p>' : ''}
        <button class="btn btn--lg btn--bloque" type="submit">Ingresar</button>
      </form>`, aviso);
    alEnviar($('form', raiz), 'ingresar', (f) => ({ usuario: f.get('usuario'), clave: f.get('clave'), recordar: f.get('recordar') === 'on' }));
  },
  correo(e, aviso) {
    simple('Verificá que sos vos', 'Escribí el correo de tu cuenta y te mandamos un código de 6 números.', `
      <form class="form"><div data-error></div>
        ${campo('Correo', '<input class="input" type="email" name="correo" autocomplete="email" required maxlength="160">')}
        <button class="btn btn--lg btn--bloque" type="submit">Enviar código</button>
      </form>
      <button type="button" class="btn btn--ghost btn--sm" data-cancelar>Volver al ingreso</button>`, aviso);
    alEnviar($('form', raiz), 'verificar/correo', (f) => ({ correo: f.get('correo') }));
    cancelarVerificacion();
  },
  codigo(e, aviso) {
    simple('Revisá tu correo', `Te mandamos un código de 6 números a <strong>${esc(e.correo)}</strong>. Vence en 10 minutos; si no lo ves, revisá la carpeta de spam.`, `
      <form class="form"><div data-error></div>
        ${campo('Código', '<input class="input input--pin" name="codigo" inputmode="numeric" pattern="\\d{6}" minlength="6" maxlength="6" autocomplete="one-time-code" required>')}
        <label class="check"><input type="checkbox" name="recordar" checked><span>Recordar este equipo (la sesión no se cierra mientras lo uses; si salís, no piden PIN ni código)</span></label>
        <p class="ayuda">Desmarcalo si la computadora o el celular es compartido.</p>
        <button class="btn btn--lg btn--bloque" type="submit">Ingresar</button>
      </form>
      ${e.puedeReenviar ? `<button type="button" class="btn btn--ghost btn--sm btn--bloque" data-reenviar>Reenviar código</button>` : ''}
      <button type="button" class="btn btn--ghost btn--sm" data-cancelar>Volver al ingreso</button>`, aviso);
    alEnviar($('form', raiz), 'verificar/codigo', (f) => ({ codigo: f.get('codigo'), recordar: f.get('recordar') === 'on' }));
    cancelarVerificacion();
    const reenviar = $('[data-reenviar]', raiz);
    if (reenviar) {
      let s = e.espera || 0;
      const pintarBoton = () => {
        reenviar.disabled = s > 0;
        reenviar.textContent = s > 0 ? `Reenviar código (disponible en ${s} s)` : 'Reenviar código';
      };
      pintarBoton();
      const reloj = setInterval(() => { s = Math.max(0, s - 1); pintarBoton(); if (!s) clearInterval(reloj); }, 1000);
      reenviar.addEventListener('click', async () => {
        reenviar.setAttribute('aria-busy', 'true');
        const r = await api('verificar/reenviar', { metodo: 'POST', datos: {} });
        reenviar.removeAttribute('aria-busy');
        if (r.ok) { estado = r; PANTALLAS.codigo(r, null); $('[data-error]', raiz).innerHTML = alerta('ok', 'Te mandamos un código nuevo.'); } else if (r.fase) iniciar(r.error);
        else $('[data-error]', raiz).innerHTML = alerta('error', r.error);
      });
    }
  },
  clave(e, aviso) {
    simple('Elegí una contraseña nueva', 'Tu contraseña es temporal: elegí una nueva para seguir.', `
      <form class="form"><div data-error></div>
        <input type="text" name="usuario" autocomplete="username" value="${esc(e.usuario?.usuario)}" hidden>
        ${campo('Contraseña actual', '<input class="input" type="password" name="actual" autocomplete="current-password" required maxlength="200">')}
        ${campo('Contraseña nueva', '<input class="input" type="password" name="nueva" autocomplete="new-password" required minlength="10" maxlength="200">', 'Mínimo 10 caracteres, con 3 de estos tipos: minúsculas, mayúsculas, números y símbolos.')}
        ${campo('Repetí la contraseña nueva', '<input class="input" type="password" name="repetir" autocomplete="new-password" required maxlength="200">')}
        <button class="btn btn--lg btn--bloque" type="submit">Guardar contraseña</button>
      </form>
      <button type="button" class="btn btn--ghost btn--sm" data-salir>Cerrar sesión</button>`, aviso);
    alEnviar($('form', raiz), 'perfil/clave', (f) => ({ actual: f.get('actual'), nueva: f.get('nueva'), repetir: f.get('repetir') }));
    $('[data-salir]', raiz).addEventListener('click', salir);
  },
};

function cancelarVerificacion() {
  $('[data-cancelar]', raiz)?.addEventListener('click', async () => {
    await api('verificar/cancelar', { metodo: 'POST', datos: {} });
    iniciar();
  });
}

async function salir() {
  await api('salir', { metodo: 'POST', datos: {} });
  try { sessionStorage.clear(); } catch { /* sin almacenamiento */ }
  iniciar();
}

// ── Panel: barra lateral y secciones ──
const SECCIONES = [
  { id: 'formulario', texto: 'Formulario', icono: 'formulario', permiso: 'formulario' },
  { id: 'planilla', texto: 'Planilla', icono: 'planilla', permiso: 'planilla' },
  { id: 'usuarios', texto: 'Usuarios', icono: 'usuarios', permiso: 'usuarios' },
  { id: 'actividad', texto: 'Actividad', icono: 'registro', permiso: 'accesos' },
  { id: 'accesos', texto: 'Accesos', icono: 'escudo', permiso: 'accesos' },
];
const puede = (p) => estado?.usuario?.permisos?.includes(p);
const seccionActual = () => {
  const [id, ...resto] = location.hash.replace(/^#\/?/, '').split('/');
  const valida = id === 'perfil' || SECCIONES.some((s) => s.id === id && puede(s.permiso));
  return { id: valida ? id : 'formulario', resto: resto.map(decodeURIComponent) };
};

function layout() {
  const u = estado.usuario;
  const { id } = seccionActual();
  document.body.className = 'app';
  raiz.removeAttribute('aria-busy');
  raiz.className = '';
  raiz.style.display = 'contents';
  raiz.innerHTML = `
<a class="saltar" href="#contenido">Saltar al contenido</a>
<aside class="sidebar" aria-label="Panel">
  <div class="sidebar__marca"><img src="recursos/logo-copol.svg" alt="COPOL" width="78" height="32"><span>Registros</span></div>
  <details class="sidebar__menu" data-menu open>
    <summary class="btn btn--ghost btn--icono" aria-label="Menú">${icono('menu', 20)}</summary>
    <nav class="nav">
      ${SECCIONES.filter((s) => puede(s.permiso)).map((s) => `<a href="#/${s.id}" class="nav__item" ${s.id === id ? 'aria-current="page"' : ''}>${icono(s.icono)}<span>${s.texto}</span></a>`).join('')}
    </nav>
    <div class="sidebar__pie">
      <a href="#/perfil" class="perfil" ${id === 'perfil' ? 'aria-current="page"' : ''}>
        <span class="avatar" aria-hidden="true">${esc((u.nombre || u.usuario).slice(0, 1).toUpperCase())}</span>
        <span class="perfil__texto"><strong>${esc(u.nombre || u.usuario)}</strong><small>${esc(u.rolNombre)}</small></span>
      </a>
      ${botonTema('btn btn--ghost btn--sm btn--bloque')}
      <button type="button" class="btn btn--ghost btn--sm btn--bloque" data-salir>${icono('salir', 16)}Cerrar sesión</button>
    </div>
  </details>
</aside>
<main id="contenido" class="main" tabindex="-1"></main>`;
  $('[data-salir]').addEventListener('click', salir);
  if (matchMedia('(max-width: 899px)').matches) $('[data-menu]').open = false;
  pintarTema();
  return $('#contenido');
}

function cabecera(titulo, acciones = '') {
  return `<header class="main__cabecera"><h1>${esc(titulo)}</h1>${acciones ? `<div class="main__acciones">${acciones}</div>` : ''}</header>
    ${estado.aviso ? alerta('error', estado.aviso) : ''}`;
}

function pintar(aviso = null) {
  if (!estado) return;
  if (estado.fase !== 'panel') {
    (PANTALLAS[estado.fase] ?? PANTALLAS.ingreso)(estado, aviso);
    return;
  }
  const main = layout();
  const { id, resto } = seccionActual();
  ({ formulario: vistaFormulario, planilla: vistaPlanilla, usuarios: vistaUsuarios, actividad: vistaActividad, accesos: vistaAccesos, perfil: vistaPerfil }[id])(main, resto, aviso);
}

addEventListener('hashchange', () => {
  if (estado?.fase === 'panel') {
    detenerMicrofono();
    pintar();
    $('#contenido')?.focus({ preventScroll: true });
    scrollTo(0, 0);
  }
});

// ── Formulario y asistente ──
const CAMPOS = ['nombre', 'socio', 'cedula', 'direccion', 'producto', 'codigo', 'service', 'adicional'];
const OBLIGATORIOS = new Set(['nombre', 'socio', 'cedula', 'direccion', 'producto', 'codigo']);
const ETIQUETAS = { nombre: 'Nombre', socio: 'N° de socio', cedula: 'Cédula', direccion: 'Dirección', producto: 'Producto', codigo: 'Código interno', service: 'Service', flete: 'Flete', adicional: 'Información adicional' };
const CLAVE_CHAT = () => `registros-chat-${estado.usuario.usuario}`;
const CLAVE_FORM = () => `registros-form-${estado.usuario.usuario}`;
const leerSesionLocal = (k, def) => { try { return JSON.parse(sessionStorage.getItem(k)) ?? def; } catch { return def; } };
const guardarSesionLocal = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

function cedulaValida(valor) {
  const d = valor.replace(/[\s.\-_/]/g, '');
  if (!/^\d{7,8}$/.test(d)) return false;
  const base = d.slice(0, -1).padStart(7, '0');
  const suma = [2, 9, 8, 7, 6, 3, 4].reduce((s, p, i) => s + p * Number(base[i]), 0);
  return (10 - (suma % 10)) % 10 === Number(d.at(-1));
}

function vistaFormulario(main) {
  const conIA = estado.ia;
  main.innerHTML = `${cabecera('Formulario')}
  ${avisoPlanilla()}
  <div class="carga" ${conIA ? '' : 'style="grid-template-columns:1fr"'}>
    ${conIA ? `<section class="card chat" aria-labelledby="t-chat">
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
        ${campo('Nombre', '<input class="input" name="nombre" maxlength="120" required>')}
        <div class="fila-2">
          ${campo('N° de socio', '<input class="input" name="socio" inputmode="numeric" maxlength="12" required>')}
          ${campo('Cédula', '<input class="input" name="cedula" inputmode="numeric" maxlength="11" placeholder="1.234.567-2" required>')}
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
        ${campo('Producto', '<input class="input" name="producto" maxlength="200" required>')}
        <div class="fila-2">
          ${campo('Código interno', '<input class="input" name="codigo" maxlength="40" required>')}
          <fieldset class="campo" data-flete><legend class="label">Flete</legend>
            <div class="opciones-fila">
              <label class="opcion"><input type="radio" name="flete" value="Sí">Sí</label>
              <label class="opcion"><input type="radio" name="flete" value="No" checked>No</label>
            </div>
          </fieldset>
        </div>
        ${campo('Service <span class="opcional">(opcional)</span>', '<input class="input" name="service" maxlength="300" placeholder="Ej.: instalación, reparación en garantía">')}
        ${campo('Información adicional <span class="opcional">(opcional)</span>', '<textarea class="input" name="adicional" rows="3" maxlength="500" placeholder="Ej.: teléfono, horario de entrega, cómo llegar"></textarea>')}
        <div data-estado-registro></div>
        <div class="registro__acciones">
          <button class="btn btn--lg" type="submit">Guardar en la planilla</button>
          <button class="btn btn--outline btn--lg" type="button" data-limpiar>Limpiar</button>
        </div>
      </form>
    </section>
  </div>`;
  const form = $('[data-registro]', main);
  dirUI = iniciarDireccion(form);
  restaurarFormulario(form);
  form.addEventListener('input', (ev) => {
    ev.target.classList?.remove('completado');
    if (ev.target.name === 'flete') $('[data-flete]', form).classList.remove('completado');
    guardarSesionLocal(CLAVE_FORM(), valoresFormulario(form));
  });
  form.addEventListener('change', () => guardarSesionLocal(CLAVE_FORM(), valoresFormulario(form)));
  $('[data-limpiar]', form).addEventListener('click', () => {
    limpiarFormulario(form);
    $('[data-estado-registro]', form).innerHTML = '';
    form.elements.nombre.focus();
  });
  form.addEventListener('submit', (ev) => { ev.preventDefault(); guardarRegistro(form); });
  if (conIA) iniciarChat(main, form);
}

const modoPrueba = () => Boolean(estado.planilla?.prueba);

// Dirección: busca mientras se escribe (o con Enter / Buscar, en más fuentes), la persona elige la ubicación de
// la lista y se genera el link a Google Maps. Sin elegir, se guarda solo el texto.
let dirUI = null;
function iniciarDireccion(form) {
  const B = window.BuscadorDireccion;
  const campoDir = form.elements.direccion;
  const caja = $('[data-dir-resultados]', form);
  const elegidaCaja = $('[data-dir-elegida]', form);
  let enlace = '';
  let temporizador = null;
  let control = null;
  let numero = 0;

  const mostrar = (html) => { caja.innerHTML = html; caja.hidden = !html; };
  const pintarElegida = (dir) => {
    elegidaCaja.innerHTML = enlace
      ? `<p class="dir-elegida">${icono('check', 16)}<span>Ubicación elegida${dir ? ` · <span class="badge ${dir.precision === 'exacta' ? 'badge--ok' : 'badge--aviso'}">${esc(dir.precisionTexto)}</span>` : ''}</span>
          <a href="${esc(enlace)}" target="_blank" rel="noopener noreferrer">Ver en Google Maps ${icono('externo', 14)}</a>
          <button type="button" class="btn btn--ghost btn--sm" data-quitar-dir>Quitar</button></p>`
      : '';
    $('[data-quitar-dir]', elegidaCaja)?.addEventListener('click', () => {
      enlace = '';
      pintarElegida();
      guardarSesionLocal(CLAVE_FORM(), valoresFormulario(form));
    });
  };

  async function buscar(completa) {
    const texto = campoDir.value.trim();
    clearTimeout(temporizador);
    control?.abort();
    $$('.error', $('[data-direccion]', form)).forEach((e) => e.remove());
    campoDir.removeAttribute('aria-invalid');
    if (!B || texto.length < 3) { mostrar(''); return; }
    const mio = ++numero;
    control = new AbortController();
    mostrar('<p class="dir-estado">Buscando…</p>');
    let r;
    try {
      r = await B.buscar(texto, { completa, signal: control.signal });
    } catch (e) {
      if (e.name === 'AbortError') return;
      mostrar('<p class="dir-estado dir-estado--error">No se pudo buscar la dirección. Podés guardar el texto igual.</p>');
      return;
    }
    if (mio !== numero) return;
    if (r.error) {
      mostrar('');
      marcar(form, 'direccion', r.error.mensaje);
      return;
    }
    if (!r.resultados.length) {
      mostrar(`<p class="dir-estado${r.fallaron && r.fallaron === r.consultas ? ' dir-estado--error' : ''}">${r.fallaron && r.fallaron === r.consultas
        ? 'El servicio de mapas no respondió. Podés guardar el texto igual, sin link.'
        : 'No encontré esa dirección. Revisá cómo está escrita (calle y número) o tocá «Buscar» para consultar más fuentes.'}</p>`);
      return;
    }
    mostrar(`<ul class="dir-lista" role="listbox" aria-label="Direcciones encontradas">${r.resultados.map((d, i) => `<li role="option">
        <button type="button" class="dir-opcion" data-i="${i}"><strong>${esc(d.titulo)}</strong><span>${esc(d.detalle)}</span>
        <em class="dir-precision dir-precision--${d.precision}">${esc(d.precisionTexto)}</em></button></li>`).join('')}</ul>
      ${completa ? '' : '<button type="button" class="btn btn--ghost btn--sm" data-mas-dir>Buscar en más fuentes</button>'}`);
    $$('[data-i]', caja).forEach((b) => b.addEventListener('click', () => elegir(r.resultados[Number(b.dataset.i)])));
    $('[data-mas-dir]', caja)?.addEventListener('click', () => buscar(true));
  }

  function elegir(d) {
    const motivo = B.validar(d);
    if (motivo) {
      $$('.error', $('[data-direccion]', form)).forEach((e) => e.remove());
      marcar(form, 'direccion', motivo);
      return;
    }
    const zona = [d.barrio && d.barrio !== d.ciudad ? d.barrio : '', d.ciudad, d.departamento];
    const texto = [...new Set([`${d.titulo}${d.unidad ? ` ${d.unidad}` : ''}`, ...zona].filter(Boolean))].join(', ');
    campoDir.value = texto;
    campoDir.classList.remove('completado');
    campoDir.removeAttribute('aria-invalid');
    enlace = B.urlGoogleMaps(d);
    mostrar('');
    pintarElegida(d);
    guardarSesionLocal(CLAVE_FORM(), valoresFormulario(form));
  }

  // Si se vuelve a escribir, la ubicación elegida ya no corresponde.
  campoDir.addEventListener('input', () => {
    if (enlace) { enlace = ''; pintarElegida(); }
    clearTimeout(temporizador);
    temporizador = setTimeout(() => buscar(false), 450);
  });
  campoDir.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); buscar(true); }
    if (ev.key === 'Escape') mostrar('');
    if (ev.key === 'ArrowDown') { ev.preventDefault(); $('.dir-opcion', caja)?.focus(); }
  });
  caja.addEventListener('keydown', (ev) => {
    const botones = $$('.dir-opcion', caja);
    const i = botones.indexOf(document.activeElement);
    if (ev.key === 'ArrowDown') { ev.preventDefault(); botones[Math.min(i + 1, botones.length - 1)]?.focus(); }
    if (ev.key === 'ArrowUp') { ev.preventDefault(); (i > 0 ? botones[i - 1] : campoDir).focus(); }
    if (ev.key === 'Escape') { mostrar(''); campoDir.focus(); }
  });
  $('[data-buscar-dir]', form).addEventListener('click', () => buscar(true));

  return {
    url: () => enlace,
    restaurar(url) { enlace = typeof url === 'string' ? url : ''; pintarElegida(); },
    reiniciar() { enlace = ''; clearTimeout(temporizador); control?.abort(); mostrar(''); pintarElegida(); },
    /** La dirección se cambió desde afuera (asistente o deshacer): la ubicación elegida ya no vale. */
    cambioExterno(buscarAhora) {
      enlace = '';
      pintarElegida();
      if (buscarAhora) buscar(false); else mostrar('');
    },
  };
}

function avisoPlanilla() {
  const p = estado.planilla;
  if (!p?.aviso) return '';
  const conectar = p.conectar && puede('configuracion') ? `<a class="btn btn--sm alert__accion" href="${BASE}/api/microsoft/conectar">Conectar cuenta de Microsoft</a>` : '';
  return `<div class="alert ${p.listo ? 'alert--aviso' : 'alert--error'}" role="status">${icono('info')}<p>${esc(p.aviso)}</p>${conectar}</div>`;
}

const valoresFormulario = (form) => ({ ...Object.fromEntries(CAMPOS.map((c) => [c, form.elements[c].value.trim()])), flete: form.elements.flete.value || 'No', mapa: dirUI?.url() ?? '' });

function restaurarFormulario(form) {
  const v = leerSesionLocal(CLAVE_FORM(), null);
  if (!v) return;
  for (const c of CAMPOS) form.elements[c].value = v[c] ?? '';
  form.elements.flete.value = v.flete || 'No';
  dirUI?.restaurar(v.mapa);
}

function limpiarFormulario(form) {
  form.reset();
  dirUI?.reiniciar();
  $$('.completado', form).forEach((el) => el.classList.remove('completado'));
  $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
  $$('.error', form).forEach((el) => el.remove());
  guardarSesionLocal(CLAVE_FORM(), null);
}

function aplicarCampos(form, campos) {
  for (const [c, v] of Object.entries(campos)) {
    if (c === 'flete') {
      form.elements.flete.value = v;
      $('[data-flete]', form).classList.add('completado');
    } else if (form.elements[c]) {
      form.elements[c].value = v;
      form.elements[c].classList.add('completado');
      form.elements[c].removeAttribute('aria-invalid');
      // El asistente escribió la dirección: se buscan las ubicaciones para que la persona elija la correcta.
      if (c === 'direccion') dirUI?.cambioExterno(true);
    }
  }
  guardarSesionLocal(CLAVE_FORM(), valoresFormulario(form));
}

function validarLocal(form) {
  const errores = {};
  for (const c of CAMPOS) if (OBLIGATORIOS.has(c) && !form.elements[c].value.trim()) errores[c] = 'Falta completar.';
  const socio = form.elements.socio.value.replace(/[\s.]/g, '');
  if (socio && !/^\d+$/.test(socio)) errores.socio = 'Solo números.';
  const dir = window.BuscadorDireccion?.problemaNumero(window.BuscadorDireccion.partirDireccion(form.elements.direccion.value).numero);
  if (dir) errores.direccion = dir;
  const ced = form.elements.cedula.value.trim();
  if (ced && !cedulaValida(ced)) errores.cedula = 'Cédula no válida: revisá los números y el dígito después del guion.';
  return errores;
}

async function guardarRegistro(form) {
  const caja = $('[data-estado-registro]', form);
  $$('.error', form).forEach((el) => el.remove());
  const errores = validarLocal(form);
  if (Object.keys(errores).length) {
    for (const [k, v] of Object.entries(errores)) marcar(form, k, v);
    caja.innerHTML = '<p class="estado estado--error">Revisá los campos marcados.</p>';
    form.elements[Object.keys(errores)[0]].focus();
    return;
  }
  const boton = $('button[type="submit"]', form);
  boton.setAttribute('aria-busy', 'true');
  caja.innerHTML = '<p class="estado">Guardando…</p>';
  const r = await api('registro', { metodo: 'POST', datos: valoresFormulario(form) });
  boton.removeAttribute('aria-busy');
  if (!r.ok) {
    if (r.errores) for (const [k, v] of Object.entries(r.errores)) marcar(form, k, v);
    caja.innerHTML = `<p class="estado estado--error">${esc(r.error || 'No se pudo guardar.')}</p>`;
    return;
  }
  limpiarFormulario(form);
  caja.innerHTML = `<p class="estado estado--ok">Guardado: ${esc(r.registro.nombre)} · ${esc(r.registro.producto)}.</p>`;
  // Cada registro es una conversación: se empieza otra, con una nota de lo guardado.
  if (chat) chat.reiniciar(`Guardado: ${r.registro.nombre} · ${r.registro.producto}`);
  form.elements.nombre.focus();
}

// Chat del asistente. Cada respuesta que cambió campos guarda cómo estaban antes, para poder deshacerla.
let chat = null;
function iniciarChat(main, form) {
  const caja = $('[data-mensajes]', main);
  const entrada = $('[data-chat]', main);
  const texto = entrada.elements.texto;
  let mensajes = leerSesionLocal(CLAVE_CHAT(), []);
  let ocupado = false;
  const adjuntos = []; // { tipo: 'imagen'|'pdf', datos (base64), nombre }
  const cajaAdjuntos = $('[data-adjuntos]', main);

  function pintarAdjuntos() {
    cajaAdjuntos.hidden = !adjuntos.length;
    cajaAdjuntos.innerHTML = adjuntos.map((a, i) => `<span class="adjunto">${icono('clip', 12)}<span>${esc(a.nombre)}</span><button type="button" data-quitar="${i}" aria-label="Quitar ${esc(a.nombre)}">×</button></span>`).join('');
  }
  cajaAdjuntos.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-quitar]');
    if (b) { adjuntos.splice(Number(b.dataset.quitar), 1); pintarAdjuntos(); }
  });

  /** Foto reducida (máx. 1600 px, JPEG) para que suba rápido y entre en el límite de tamaño. */
  const reducirImagen = async (archivo) => {
    const img = await createImageBitmap(archivo); // sin imágenes temporales (blob:), que la política de seguridad no permite
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    img.close?.();
    return c.toDataURL('image/jpeg', 0.82).split(',')[1];
  };
  const aBase64 = (archivo) => new Promise((ok, mal) => {
    const l = new FileReader();
    l.onload = () => ok(String(l.result).split(',')[1]);
    l.onerror = () => mal(new Error('lectura'));
    l.readAsDataURL(archivo);
  });
  const avisoChat = (t) => { mensajes.push({ rol: 'error', texto: t }); dibujar(); };

  async function agregarArchivos(lista) {
    for (const f of [...lista]) {
      if (adjuntos.length >= 3) { avisoChat('Se pueden adjuntar hasta 3 archivos por mensaje.'); break; }
      try {
        if (f.type.startsWith('image/')) {
          adjuntos.push({ tipo: 'imagen', datos: await reducirImagen(f), nombre: f.name || 'foto.jpg' });
        } else if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
          if (f.size > 2_500_000) { avisoChat(`«${f.name}» pesa demasiado (máximo 2,5 MB por PDF). Probá con una foto de la página.`); continue; }
          adjuntos.push({ tipo: 'pdf', datos: await aBase64(f), nombre: f.name });
        } else if (f.type === 'text/plain' || /\.txt$/i.test(f.name)) {
          const t = (await f.text()).trim().slice(0, 4000);
          texto.value = `${texto.value.trim()} ${t}`.trim();
          texto.focus();
        } else {
          avisoChat(`No puedo leer «${f.name}». Adjuntá una foto, un PDF o un archivo de texto (.txt).`);
        }
      } catch {
        avisoChat(`No se pudo abrir «${f.name}». Probá con otro archivo.`);
      }
    }
    pintarAdjuntos();
  }
  for (const [boton, input] of [['[data-camara]', '[data-archivo-camara]'], ['[data-clip]', '[data-archivo-clip]']]) {
    $(boton, main).addEventListener('click', () => $(input, main).click());
    $(input, main).addEventListener('change', async (ev) => { await agregarArchivos(ev.target.files); ev.target.value = ''; });
  }
  // También se puede pegar una captura (Ctrl+V) o arrastrar un archivo a la caja.
  texto.addEventListener('paste', (ev) => { const f = [...(ev.clipboardData?.files ?? [])]; if (f.length) { ev.preventDefault(); agregarArchivos(f); } });
  texto.addEventListener('dragover', (ev) => ev.preventDefault());
  texto.addEventListener('drop', (ev) => { if (ev.dataTransfer?.files?.length) { ev.preventDefault(); agregarArchivos(ev.dataTransfer.files); } });

  const vacio = `<div class="chat__vacio">
    <p><strong>Contame los datos como te llegaron</strong> y completo el formulario. Podés pegar un mensaje, escribirlo o dictarlo con el micrófono. Después revisás y guardás.</p>
    <p class="chat__ejemplo">«María Rodríguez, socia 48213, cédula 1.234.567-2, Bv. Artigas 1520 apto 503. Lavarropas Samsung 8 kg, código 467972. Va con flete.»</p>
    <p>También podés corregir: «el código es 467973» o «no lleva flete».</p>
  </div>`;

  const dibujar = () => {
    caja.innerHTML = mensajes.length ? mensajes.map((m, i) => {
      if (m.rol === 'nota') return `<div class="msj msj--nota"><div class="msj__texto">${icono('check', 14)} ${esc(m.texto)}</div></div>`;
      if (m.rol === 'usuario') return `<div class="msj msj--usuario"><span class="msj__autor">Vos</span><div class="msj__texto">${esc(m.texto)}</div>${m.archivos?.length ? `<ul class="msj__cambios">${m.archivos.map((a) => `<li>${icono('clip', 12)} ${esc(a)}</li>`).join('')}</ul>` : ''}</div>`;
      if (m.rol === 'error') return `<div class="msj msj--asistente msj--error"><span class="msj__autor">Asistente</span><div class="msj__texto">${esc(m.texto)}</div></div>`;
      const cambios = Object.entries(m.campos ?? {});
      return `<div class="msj msj--asistente ${m.deshecho ? 'msj--deshecho' : ''}"><span class="msj__autor">Asistente</span>
        <div class="msj__texto">${esc(m.texto)}</div>
        ${cambios.length ? `<ul class="msj__cambios" aria-label="Campos completados">${cambios.map(([c, v]) => `<li title="${esc(v)}">${esc(ETIQUETAS[c] ?? c)}: ${esc(v)}</li>`).join('')}</ul>` : ''}
        ${m.faltan?.length && !m.deshecho ? `<span class="msj__faltan">Falta: ${esc(m.faltan.join(', '))}</span>` : ''}
        ${cambios.length ? (m.deshecho
          ? `<span class="msj__deshecho">${icono('deshacer', 14)}Deshecho</span>`
          : `<button type="button" class="msj__deshacer" data-deshacer="${i}" title="Volver el formulario a como estaba antes de esta respuesta">${icono('deshacer', 16)}Deshacer</button>`) : ''}
      </div>`;
    }).join('') : vacio;
    if (ocupado) caja.insertAdjacentHTML('beforeend', '<div class="msj msj--asistente msj--pendiente"><span class="msj__autor">Asistente</span><div class="msj__texto">Completando el formulario…</div></div>');
    caja.scrollTop = caja.scrollHeight;
    guardarSesionLocal(CLAVE_CHAT(), mensajes);
  };

  caja.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-deshacer]');
    if (!b) return;
    const m = mensajes[Number(b.dataset.deshacer)];
    if (!m || m.deshecho) return;
    // Solo se devuelven los campos que cambió esta respuesta (los que cambiaste después quedan como están).
    for (const [c, v] of Object.entries(m.antes ?? {})) {
      if (c === 'flete') form.elements.flete.value = v || 'No';
      else if (form.elements[c]) form.elements[c].value = v;
      (c === 'flete' ? $('[data-flete]', form) : form.elements[c])?.classList.remove('completado');
      if (c === 'direccion') dirUI?.cambioExterno(false);
    }
    guardarSesionLocal(CLAVE_FORM(), valoresFormulario(form));
    m.deshecho = true;
    dibujar();
  });

  const enviar = async () => {
    const t = texto.value.trim() || (adjuntos.length ? 'Completá el formulario con los datos de lo que adjunté.' : '');
    if (!t || ocupado) return;
    detenerMicrofono();
    const enviados = adjuntos.splice(0);
    pintarAdjuntos();
    mensajes.push({ rol: 'usuario', texto: t, archivos: enviados.map((a) => a.nombre) });
    texto.value = '';
    ocupado = true;
    dibujar();
    const historial = mensajes.filter((m) => m.rol === 'usuario' || m.rol === 'asistente').map((m) => ({ rol: m.rol, texto: m.texto }));
    const r = await api('asistente', { metodo: 'POST', datos: { mensajes: historial, formulario: valoresFormulario(form), adjuntos: enviados.map(({ tipo, datos, nombre }) => ({ tipo, datos, nombre })) } });
    ocupado = false;
    if (!r.ok) {
      if (r.status !== 401) mensajes.push({ rol: 'error', texto: r.error || 'El asistente no respondió.' });
      dibujar();
      return;
    }
    const actual = valoresFormulario(form);
    const antes = Object.fromEntries(Object.keys(r.campos ?? {}).map((c) => [c, actual[c] ?? '']));
    aplicarCampos(form, r.campos ?? {});
    mensajes.push({ rol: 'asistente', texto: r.respuesta, campos: r.campos ?? {}, faltan: r.faltan ?? [], antes });
    dibujar();
  };

  entrada.addEventListener('submit', (ev) => { ev.preventDefault(); enviar(); });
  texto.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); enviar(); }
  });
  $('[data-nuevo-chat]', main).addEventListener('click', () => {
    if (mensajes.length && !confirm('¿Empezar una conversación nueva? El formulario queda como está.')) return;
    mensajes = [];
    dibujar();
    texto.focus();
  });
  prepararMicrofono($('[data-microfono]', main), texto, $('[data-ayuda-chat]', main));
  chat = {
    reiniciar(nota) {
      mensajes = nota ? [{ rol: 'nota', texto: nota }] : [];
      dibujar();
    },
  };
  dibujar();
}

// Micrófono: dictado con el reconocimiento de voz del navegador (Chrome y Edge; en otros navegadores no aparece).
let reconocimiento = null;
let escuchando = false;
function detenerMicrofono() {
  escuchando = false;
  try { reconocimiento?.stop(); } catch { /* ya estaba detenido */ }
}
const ERRORES_VOZ = {
  'not-allowed': 'El navegador no dejó usar el micrófono. Tocá el candado de la barra de direcciones y permitilo.',
  'service-not-allowed': 'El navegador no dejó usar el dictado. Tocá el candado de la barra de direcciones y permitilo.',
  'audio-capture': 'No se encontró un micrófono. Conectá uno y probá de nuevo.',
  network: 'El dictado necesita internet y los servicios de voz de Google. Si usás Brave u otro navegador que los bloquea, probá con Chrome o Edge.',
  'language-not-supported': 'Este navegador no entiende el idioma español.',
};

// Dictado con el reconocimiento de voz del navegador (Chrome, Edge, Safari y Chrome del celular). Se escucha de a
// frases y se reinicia solo mientras el botón siga rojo: así funciona igual en la computadora y en el celular.
function prepararMicrofono(boton, texto, ayuda) {
  if (!boton) return;
  boton.hidden = false;
  const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
  const ayudaNormal = ayuda.textContent;
  const decir = (t, clase = '') => { ayuda.innerHTML = `<span class="${clase}">${esc(t)}</span>`; };
  const pintarBoton = (activo) => {
    boton.setAttribute('aria-pressed', String(activo));
    boton.innerHTML = icono(activo ? 'parar' : 'microfono', activo ? 16 : 18);
    boton.title = activo ? 'Dejar de escuchar' : 'Dictar los datos';
  };
  if (!Reconocimiento) {
    boton.addEventListener('click', () => decir('Este navegador no permite dictar. Usá Chrome o Edge, o el micrófono del teclado de tu celular.', 'chat__escuchando'));
    return;
  }
  let base = '';
  let acumulado = '';
  let silencios = 0;
  let tope = null;

  const terminar = (mensaje) => {
    escuchando = false;
    clearTimeout(tope);
    pintarBoton(false);
    if (mensaje) decir(mensaje, 'chat__escuchando'); else ayuda.textContent = ayudaNormal;
    reconocimiento = null;
  };

  function escuchar() {
    const r = new Reconocimiento();
    reconocimiento = r;
    r.lang = 'es-UY';
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = (ev) => {
      silencios = 0;
      let parcial = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) acumulado = `${acumulado} ${t}`.trim(); else parcial += t;
      }
      if (escuchando) texto.value = `${base} ${acumulado} ${parcial}`.replace(/\s+/g, ' ').trim();
    };
    r.onerror = (ev) => {
      if (ev.error === 'no-speech') { silencios++; return; }
      if (ev.error === 'aborted') return;
      terminar(ERRORES_VOZ[ev.error] ?? `No se pudo usar el micrófono (${ev.error}).`);
    };
    r.onend = () => {
      if (!escuchando) { if (reconocimiento === r) terminar(); texto.focus(); return; }
      if (silencios >= 3) { terminar('No se escuchó nada. Acercate al micrófono y probá de nuevo.'); return; }
      try { escuchar(); } catch { terminar('Se cortó el dictado. Tocá el micrófono para seguir.'); }
    };
    r.start();
  }

  boton.addEventListener('click', () => {
    if (escuchando) { detenerMicrofono(); return; }
    base = texto.value.trim();
    acumulado = '';
    silencios = 0;
    escuchando = true;
    pintarBoton(true);
    decir('Escuchando… hablá claro y tocá el botón rojo al terminar.', 'chat__escuchando');
    clearTimeout(tope);
    tope = setTimeout(() => detenerMicrofono(), 120_000); // corte de seguridad: 2 minutos
    try { escuchar(); } catch { terminar('No se pudo usar el micrófono. Probá de nuevo.'); }
  });
}

// ── Planilla ──
async function vistaPlanilla(main, resto, aviso) {
  const p = estado.planilla ?? {};
  const params = new URLSearchParams(location.search);
  const ms = params.get('microsoft');
  if (ms) history.replaceState(null, '', `${BASE}/${location.hash}`);
  const avisoMs = ms === 'conectado' ? alerta('ok', 'Cuenta de Microsoft conectada: desde ahora se guarda en Excel en la nube.') : ms === 'error' ? alerta('error', params.get('mensaje') || 'No se pudo conectar la cuenta de Microsoft.') : '';
  if (!p.prueba) {
    main.innerHTML = `${cabecera('Planilla')}${avisoMs}${avisoPlanilla()}
      <section class="card form"><h2 class="card__titulo">${p.google ? 'Hoja de Google Sheets' : 'Planilla de Excel en la nube'}</h2>
        ${p.listo ? `<dl class="datos"><dt>Archivo</dt><dd>${esc(p.nombre ?? '—')}</dd>${p.pestana ? `<dt>Pestaña de este mes</dt><dd>${esc(p.pestana)} <span class="muted">(al cambiar el mes, los registros pasan solos a la pestaña nueva)</span></dd>` : ''}<dt>Cuenta</dt><dd>${esc(p.cuenta ?? '—')}</dd></dl>` : ''}
        <div class="botones">${p.enlace ? `<a class="btn" href="${esc(p.enlace)}" target="_blank" rel="noopener noreferrer">${icono('externo', 16)}Abrir la planilla${p.google ? ' en Google Sheets' : ' en Excel'}</a>` : ''}
        ${puede('configuracion') && p.modo === 'cuenta' && p.cuenta ? '<button type="button" class="btn btn--outline" data-desconectar>Desconectar la cuenta de Microsoft</button>' : ''}</div>
      </section>`;
    $('[data-desconectar]', main)?.addEventListener('click', async () => {
      if (!confirm('¿Desconectar la cuenta de Microsoft? No se podrá guardar hasta volver a conectarla.')) return;
      await api('microsoft/conectar', { metodo: 'DELETE', datos: {} });
      await iniciar();
    });
    return;
  }
  main.innerHTML = `${cabecera('Planilla de prueba', `<a class="btn" href="${BASE}/api/planilla?formato=xlsx" download>${icono('descargar', 16)}Descargar Excel (.xlsx)</a>
    ${puede('configuracion') ? `<button type="button" class="btn btn--outline" data-vaciar>${icono('basura', 16)}Vaciar</button>` : ''}`)}
    ${avisoMs}${alerta('aviso', p.aviso)}${aviso ? alerta('error', aviso) : ''}
    <p class="muted" data-total>Cargando…</p>
    <div class="tabla-caja"><table class="tabla tabla--lista tabla--registros">
      <thead><tr><th>Nombre</th><th>Fecha</th><th>Socio</th><th>Cédula</th><th>Dirección</th><th>Producto</th><th>Código</th><th>Flete</th><th>Service</th><th>Cargado por</th><th>Información adicional</th></tr></thead>
      <tbody data-filas></tbody></table></div>`;
  $('[data-vaciar]', main)?.addEventListener('click', async () => {
    if (!confirm('¿Borrar todas las filas de la planilla de prueba? Conviene descargarla antes en Excel.')) return;
    const r = await api('planilla', { metodo: 'DELETE', datos: {} });
    if (r.ok) vistaPlanilla(main, resto, null); else alert(r.error || 'No se pudo vaciar.');
  });
  const r = await api('planilla');
  if (!r.ok) { $('[data-total]', main).textContent = r.error || 'No se pudo leer la planilla.'; return; }
  $('[data-total]', main).textContent = r.total ? `${r.total} fila${r.total === 1 ? '' : 's'}${r.total > r.registros.length ? ` (se muestran las últimas ${r.registros.length})` : ''}. La más nueva arriba.` : 'La planilla de prueba está vacía.';
  const celda = (etiqueta, v, clase = '') => `<td data-etiqueta="${etiqueta}" class="${clase}">${esc(v || '—')}</td>`;
  $('[data-filas]', main).innerHTML = r.registros.map((x) => `<tr>${celda('Nombre', x.nombre)}${celda('Fecha', x.fecha, 'nowrap')}${celda('Socio', x.socio)}${celda('Cédula', x.cedula, 'nowrap')}${x.mapa ? `<td data-etiqueta="Dirección"><a href="${esc(x.mapa)}" target="_blank" rel="noopener noreferrer">${esc(x.direccion)}</a></td>` : celda('Dirección', x.direccion)}${celda('Producto', x.producto)}${celda('Código', x.codigo)}${celda('Flete', x.flete)}${celda('Service', x.service)}${celda('Cargado por', x.cargadoPor)}${celda('Información adicional', x.adicional)}</tr>`).join('');
}

// ── Usuarios (administradores) ──
async function vistaUsuarios(main, resto) {
  main.innerHTML = `${cabecera('Usuarios')}<p class="muted">Cargando…</p>`;
  const r = await api('usuarios');
  if (!r.ok) { main.innerHTML = `${cabecera('Usuarios')}${alerta('error', r.error)}`; return; }
  if (resto[0]) return vistaUsuario(main, r, resto[0]);
  const opcionesRol = Object.entries(r.roles).map(([k, x]) => `<option value="${k}" ${k === 'carga' ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('');
  main.innerHTML = `${cabecera('Usuarios')}
  <div class="grid-usuarios">
    <div class="tabla-caja"><table class="tabla tabla--lista tabla--usuarios">
      <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Correo</th><th>Estado</th><th>Último acceso</th></tr></thead>
      <tbody>${r.usuarios.map((u) => `<tr>
        <td data-etiqueta="Usuario"><a class="usuario-fila" href="#/usuarios/${encodeURIComponent(u.usuario)}">${esc(u.usuario)}</a>${u.protegido ? ' <span class="badge badge--gris">protegido</span>' : ''}</td>
        <td data-etiqueta="Nombre">${esc(u.nombre)}</td>
        <td data-etiqueta="Rol">${esc(r.roles[u.rol]?.nombre ?? u.rol)}</td>
        <td data-etiqueta="Correo">${esc(u.correo ?? '—')}</td>
        <td data-etiqueta="Estado">${!u.activo ? '<span class="badge badge--gris">Inactivo</span>' : u.bloqueado ? '<span class="badge badge--aviso">Bloqueado 15 min</span>' : u.debeCambiar ? '<span class="badge badge--aviso">Contraseña temporal</span>' : '<span class="badge badge--ok">Activo</span>'}</td>
        <td data-etiqueta="Último acceso" class="nowrap">${fecha(u.ultimoAcceso)}</td>
      </tr>`).join('')}</tbody></table></div>
    <section class="card form" aria-labelledby="t-nuevo">
      <h2 class="card__titulo" id="t-nuevo">Nuevo usuario</h2>
      <form class="form" data-nuevo novalidate><div data-error></div>
        ${campo('Usuario', '<input class="input" name="usuario" required maxlength="80" autocomplete="off" autocapitalize="none" placeholder="ej.: jperez">', 'Minúsculas, números, puntos o guiones (o un correo).')}
        ${campo('Nombre', '<input class="input" name="nombre" maxlength="80" autocomplete="off">', 'Aparece en «Cargado por».')}
        ${campo('Correo', '<input class="input" type="email" name="correo" required maxlength="160" autocomplete="off">', 'Ahí le llega el código de 6 números al ingresar.')}
        ${campo('Rol', `<select class="input" name="rol">${opcionesRol}</select>`)}
        ${campo('Contraseña temporal', '<input class="input" type="text" name="clave" required minlength="10" maxlength="200" autocomplete="off">', 'La va a tener que cambiar al entrar por primera vez.')}
        <button class="btn" type="submit">${icono('mas', 16)}Crear usuario</button>
      </form>
      <div class="muted ayuda">${Object.values(r.roles).map((x) => `<p><strong>${esc(x.nombre)}:</strong> ${esc(x.descripcion)}</p>`).join('')}</div>
    </section>
  </div>`;
  const form = $('[data-nuevo]', main);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const b = $('button[type="submit"]', form);
    b.setAttribute('aria-busy', 'true');
    const x = await api('usuarios', { metodo: 'POST', datos: Object.fromEntries(new FormData(form)) });
    b.removeAttribute('aria-busy');
    if (!x.ok) {
      $('[data-error]', form).innerHTML = alerta('error', x.error);
      if (x.campo) marcar(form, x.campo, '');
      return;
    }
    location.hash = `#/usuarios/${encodeURIComponent(x.usuario.usuario)}`;
  });
}

function vistaUsuario(main, r, nombre) {
  const u = r.usuarios.find((x) => x.usuario === nombre);
  if (!u) { location.hash = '#/usuarios'; return; }
  const yo = u.usuario === r.yo;
  main.innerHTML = `${cabecera(u.usuario, '<a class="btn btn--ghost" href="#/usuarios">Volver</a>')}
  <div data-aviso></div>
  <div class="grid-2">
    <section class="card form"><h2 class="card__titulo">Datos y acceso</h2>
      <form class="form" data-editar novalidate>
        ${campo('Nombre', `<input class="input" name="nombre" maxlength="80" value="${esc(u.nombre)}">`)}
        ${campo('Correo (para el código de ingreso)', `<input class="input" type="email" name="correo" maxlength="160" value="${esc(u.correo ?? '')}">`)}
        ${campo('Rol', `<select class="input" name="rol" ${u.protegido || yo ? 'disabled' : ''}>${Object.entries(r.roles).map(([k, x]) => `<option value="${k}" ${k === u.rol ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select>`)}
        <label class="check"><input type="checkbox" name="activo" ${u.activo ? 'checked' : ''} ${u.protegido || yo ? 'disabled' : ''}><span>Cuenta activa</span></label>
        <dl class="datos"><dt>Creado</dt><dd>${fecha(u.creadoEn)}${u.creadoPor ? ` por ${esc(u.creadoPor)}` : ''}</dd><dt>Último acceso</dt><dd>${fecha(u.ultimoAcceso)}</dd></dl>
        <button class="btn" type="submit">Guardar</button>
      </form>
    </section>
    <div class="col">
      <section class="card form"><h2 class="card__titulo">Restablecer contraseña</h2>
        <form class="form" data-clave novalidate>
          ${campo('Contraseña temporal nueva', '<input class="input" type="text" name="clave" required minlength="10" maxlength="200" autocomplete="off">', yo ? 'Es tu propia cuenta: queda como tu contraseña.' : 'La va a tener que cambiar al entrar. Cierra sus sesiones abiertas.')}
          <button class="btn btn--outline" type="submit">Restablecer</button>
        </form>
      </section>
      <section class="card form"><h2 class="card__titulo">Sesiones</h2>
        <p class="muted">Cierra todas sus sesiones abiertas y olvida sus equipos recordados.</p>
        <div class="botones"><button type="button" class="btn btn--outline" data-sesiones>Cerrar sus sesiones</button>
        ${u.protegido || yo ? '' : `<button type="button" class="btn btn--peligro" data-eliminar>${icono('basura', 16)}Eliminar usuario</button>`}</div>
      </section>
    </div>
  </div>`;
  const aviso = (tipo, t) => { $('[data-aviso]', main).innerHTML = alerta(tipo, t); scrollTo(0, 0); };
  $('[data-editar]', main).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = ev.target;
    const datos = { nombre: f.elements.nombre.value, correo: f.elements.correo.value };
    if (!f.elements.rol.disabled) datos.rol = f.elements.rol.value;
    if (!f.elements.activo.disabled) datos.activo = f.elements.activo.checked;
    const x = await api(`usuarios/${encodeURIComponent(u.usuario)}`, { metodo: 'PATCH', datos });
    aviso(x.ok ? 'ok' : 'error', x.ok ? 'Cambios guardados.' : x.error);
  });
  $('[data-clave]', main).addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const x = await api(`usuarios/${encodeURIComponent(u.usuario)}/clave`, { metodo: 'POST', datos: { clave: ev.target.elements.clave.value } });
    aviso(x.ok ? 'ok' : 'error', x.ok ? 'Contraseña restablecida. Pasásela a la persona por un medio seguro.' : x.error);
    if (x.ok) ev.target.reset();
    if (x.ok && yo) iniciar();
  });
  $('[data-sesiones]', main).addEventListener('click', async () => {
    const x = await api(`usuarios/${encodeURIComponent(u.usuario)}/sesiones`, { metodo: 'POST', datos: {} });
    if (x.ok && yo) { iniciar(); return; }
    aviso(x.ok ? 'ok' : 'error', x.ok ? 'Sesiones cerradas.' : x.error);
  });
  $('[data-eliminar]', main)?.addEventListener('click', async () => {
    if (!confirm(`¿Eliminar a ${u.usuario}? No se puede deshacer.`)) return;
    const x = await api(`usuarios/${encodeURIComponent(u.usuario)}`, { metodo: 'DELETE', datos: {} });
    if (x.ok) location.hash = '#/usuarios'; else aviso('error', x.error);
  });
}

// ── Actividad: quién cargó qué (administradores) ──
async function vistaActividad(main) {
  main.innerHTML = `${cabecera('Actividad')}<p class="muted">Cargando…</p>`;
  const r = await api('actividad');
  if (!r.ok) { main.innerHTML = `${cabecera('Actividad')}${alerta('error', r.error)}`; return; }
  main.innerHTML = `${cabecera('Actividad')}
    <p class="muted">Quién cargó cada registro y qué cambios hizo cada administrador (los últimos 500, el más nuevo arriba).</p>
    <div class="tabla-caja"><table class="tabla tabla--lista tabla--accesos">
      <thead><tr><th>Fecha</th><th>Usuario</th><th>Qué hizo</th><th>Detalle</th><th>Dónde quedó</th></tr></thead>
      <tbody>${r.eventos.map((e) => `<tr>
        <td data-etiqueta="Fecha" class="nowrap">${fecha(e.fecha)}</td>
        <td data-etiqueta="Usuario">${esc(e.nombre || e.usuario)}${e.nombre && e.nombre !== e.usuario ? ` <span class="muted">(${esc(e.usuario)})</span>` : ''}</td>
        <td data-etiqueta="Qué hizo" class="evento">${esc(r.tipos[e.tipo] ?? e.tipo)}</td>
        <td data-etiqueta="Detalle">${esc(e.detalle ?? '')}</td>
        <td data-etiqueta="Dónde quedó">${esc(e.destino ?? '—')}</td>
      </tr>`).join('') || '<tr><td colspan="5">Todavía no hay actividad.</td></tr>'}</tbody></table></div>`;
}

// ── Accesos (administradores) ──
async function vistaAccesos(main) {
  main.innerHTML = `${cabecera('Accesos')}<p class="muted">Cargando…</p>`;
  const r = await api('accesos');
  if (!r.ok) { main.innerHTML = `${cabecera('Accesos')}${alerta('error', r.error)}`; return; }
  const malos = new Set(['ingreso-fallido', 'bloqueo', 'pin-fallido', 'codigo-fallido', 'correo-incorrecto']);
  main.innerHTML = `${cabecera('Accesos')}
    <p class="muted">Ingresos, intentos fallidos y cambios de usuarios (los últimos 300).</p>
    <div class="tabla-caja"><table class="tabla tabla--lista tabla--accesos">
      <thead><tr><th>Evento</th><th>Fecha</th><th>Usuario</th><th>Detalle</th><th>Desde</th></tr></thead>
      <tbody>${r.eventos.map((e) => `<tr>
        <td data-etiqueta="Evento" class="evento ${malos.has(e.tipo) ? 'evento--malo' : ''}">${esc(r.tipos[e.tipo] ?? e.tipo)}</td>
        <td data-etiqueta="Fecha" class="nowrap">${fecha(e.fecha)}</td>
        <td data-etiqueta="Usuario">${esc(e.usuario ?? '—')}</td>
        <td data-etiqueta="Detalle">${esc(e.detalle ?? '')}</td>
        <td data-etiqueta="Desde"><span class="ip">${esc([e.lugar, e.ip, e.equipo].filter(Boolean).join(' · ') || '—')}</span></td>
      </tr>`).join('') || '<tr><td colspan="5">Sin eventos todavía.</td></tr>'}</tbody></table></div>`;
}

// ── Mi perfil ──
function vistaPerfil(main) {
  const u = estado.usuario;
  const campoClave = campo('Tu contraseña actual', '<input class="input" type="password" name="clave" autocomplete="current-password" required maxlength="200">');
  main.innerHTML = `${cabecera('Mi perfil')}
  <div class="grid-2">
    <section class="card"><h2 class="card__titulo">Cuenta</h2>
      <dl class="datos"><dt>Usuario</dt><dd>${esc(u.usuario)}</dd><dt>Nombre</dt><dd>${esc(u.nombre)}</dd><dt>Rol</dt><dd>${esc(u.rolNombre)}</dd><dt>Correo</dt><dd>${esc(u.correo ?? 'Sin correo')}</dd><dt>Último acceso</dt><dd>${fecha(u.ultimoAcceso)}</dd></dl>
    </section>
    <section class="card form"><h2 class="card__titulo">Cambiar contraseña</h2>
      <form class="form" data-f="clave" novalidate><div data-error></div>
        <input type="text" name="usuario" autocomplete="username" value="${esc(u.usuario)}" hidden>
        ${campo('Contraseña actual', '<input class="input" type="password" name="actual" autocomplete="current-password" required maxlength="200">')}
        ${campo('Contraseña nueva', '<input class="input" type="password" name="nueva" autocomplete="new-password" required minlength="10" maxlength="200">', 'Mínimo 10 caracteres. Cierra tus otras sesiones.')}
        ${campo('Repetí la contraseña nueva', '<input class="input" type="password" name="repetir" autocomplete="new-password" required maxlength="200">')}
        <button class="btn" type="submit">Guardar contraseña</button>
      </form>
    </section>
    <section class="card form"><h2 class="card__titulo">Correo de verificación</h2>
      <p class="muted">Al ingresar desde un equipo nuevo te pedimos este correo y te mandamos un código de 6 números.${estado.correoActivo ? '' : ' (El envío de correos todavía no está configurado.)'}</p>
      <form class="form" data-f="correo" novalidate><div data-error></div>
        ${campo('Correo', `<input class="input" type="email" name="correo" autocomplete="email" required maxlength="160" value="${esc(u.correo ?? '')}">`)}
        ${campoClave}
        <button class="btn btn--outline" type="submit">Guardar correo</button>
      </form>
    </section>
    ${puede('configuracion') ? `<section class="card form"><h2 class="card__titulo">PIN de acceso al panel</h2>
      <p class="muted">Se pide antes del usuario y la contraseña en los equipos que no están recordados. Es uno solo para todo el equipo: al cambiarlo, compartilo de nuevo con quienes usan el panel.</p>
      <form class="form" data-f="pin" novalidate><div data-error></div>
        <div class="fila">${campo('PIN nuevo', inputPin('pin'))}${campo('Repetí el PIN', inputPin('repetir'))}</div>
        ${campoClave}
        <button class="btn btn--outline" type="submit">Cambiar PIN</button>
      </form>
    </section>` : ''}
  </div>`;
  for (const form of $$('form[data-f]', main)) {
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const paso = form.dataset.f;
      const x = await api(`perfil/${paso}`, { metodo: 'POST', datos: Object.fromEntries(new FormData(form)) });
      if (!x.ok) {
        $('[data-error]', form).innerHTML = alerta('error', x.error);
        if (x.campo) marcar(form, x.campo, '');
        return;
      }
      form.reset();
      if (paso === 'correo') estado.usuario.correo = form.elements.correo?.value || estado.usuario.correo;
      if (x.usuario) estado = x;
      const textos = { clave: 'Contraseña cambiada.', correo: 'Correo guardado.', pin: 'PIN cambiado. Compartilo con quienes usan el panel.' };
      if (paso === 'correo') await iniciar();
      $(`form[data-f="${paso}"] [data-error]`)?.insertAdjacentHTML('afterbegin', alerta('ok', textos[paso]));
    });
  }
}

// ── Tema (claro u oscuro) ──
function pintarTema() {
  const oscuro = document.documentElement.dataset.tema === 'oscuro';
  $$('[data-tema-boton]').forEach((b) => {
    b.hidden = false;
    b.setAttribute('aria-pressed', String(oscuro));
    const t = $('[data-tema-texto]', b);
    if (t) t.textContent = oscuro ? 'Modo claro' : 'Modo oscuro';
    b.title = oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
  });
}
document.addEventListener('click', (ev) => { if (ev.target.closest?.('[data-tema-boton]')) setTimeout(pintarTema); });

// ── Inicio ──
async function iniciar(aviso = null) {
  const r = await api('estado');
  if (!r.ok && !r.fase) {
    document.body.className = 'simple';
    raiz.className = 'simple__caja card';
    raiz.innerHTML = alerta('error', r.error || 'No se pudo abrir el panel. Probá recargar la página.');
    return;
  }
  estado = r;
  pintar(aviso);
}

iniciar();
