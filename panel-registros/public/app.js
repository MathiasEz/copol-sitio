// Panel de registros: ingreso, asistente opcional y formulario que guarda una fila en la planilla de Excel.
// Las validaciones de acá solo avisan antes de enviar; las que valen son las del servidor (api/_lib/campos.js).
'use strict';

const $ = (sel) => document.querySelector(sel);
const CAMPOS = ['nombre', 'socio', 'cedula', 'direccion', 'producto', 'codigo', 'service'];
const OBLIGATORIOS = new Set(['nombre', 'socio', 'cedula', 'direccion', 'producto', 'codigo']);
const CLAVE_ULTIMOS = 'registros-ultimos';

async function api(ruta, { metodo = 'GET', datos } = {}) {
  const res = await fetch(ruta, {
    method: metodo,
    headers: datos ? { 'content-type': 'application/json' } : {},
    body: datos ? JSON.stringify(datos) : undefined,
    credentials: 'same-origin',
  });
  const cuerpo = await res.json().catch(() => ({}));
  if (res.status === 401 && cuerpo.sesion === false) {
    mostrarIngreso('La sesión venció. Volvé a ingresar.');
  }
  return { ok: res.ok, status: res.status, ...cuerpo };
}

function mensaje(elemento, texto, tipo = '') {
  elemento.textContent = texto;
  elemento.className = `mensaje ${tipo}`.trim();
  elemento.hidden = !texto;
}

// ── Cédula uruguaya (mismo cálculo que el servidor) ──
function cedulaValida(valor) {
  const d = valor.replace(/[\s.\-_/]/g, '');
  if (!/^\d{7,8}$/.test(d)) return false;
  const base = d.slice(0, -1).padStart(7, '0');
  const suma = [2, 9, 8, 7, 6, 3, 4].reduce((s, p, i) => s + p * Number(base[i]), 0);
  return (10 - (suma % 10)) % 10 === Number(d.at(-1));
}

// ── Pantallas ──
function mostrarIngreso(error = '') {
  $('#cargando').hidden = true;
  $('#pantalla-panel').hidden = true;
  $('#barra-usuario').hidden = true;
  $('#pantalla-ingreso').hidden = false;
  mensaje($('#ingreso-error'), error, 'error');
  ($('#i-nombre').value ? $('#i-clave') : $('#i-nombre')).focus();
}

function mostrarPanel(estado) {
  $('#cargando').hidden = true;
  $('#pantalla-ingreso').hidden = true;
  $('#pantalla-panel').hidden = false;
  $('#barra-usuario').hidden = false;
  $('#usuario-nombre').textContent = estado.sesion.nombre;
  $('#seccion-asistente').hidden = !estado.ia;
  $('.columnas').style.gridTemplateColumns = estado.ia ? '' : '1fr';
  mostrarPlanilla(estado.planilla);
  dibujarUltimos();
}

function mostrarPlanilla(planilla) {
  const aviso = $('#aviso-planilla');
  aviso.hidden = !planilla?.aviso;
  aviso.classList.toggle('error', Boolean(planilla && !planilla.listo));
  $('#aviso-planilla-texto').textContent = planilla?.aviso ?? '';
  $('#btn-conectar').hidden = !planilla?.conectar;
  const enlace = $('#enlace-planilla');
  enlace.hidden = !planilla?.enlace;
  if (planilla?.enlace) enlace.href = planilla.enlace;
}

async function iniciar() {
  // Vuelta del inicio de sesión con Microsoft
  const params = new URLSearchParams(location.search);
  const vueltaMs = params.get('microsoft');
  if (vueltaMs) history.replaceState(null, '', location.pathname);

  const estado = await api('/api/sesion').catch(() => null);
  if (!estado) {
    $('#cargando').textContent = 'No se pudo conectar con el panel. Revisá la conexión a internet y recargá la página.';
    return;
  }
  if (!estado.sesion) {
    mostrarIngreso(estado.configurado ? '' : 'El panel todavía no tiene clave configurada (PANEL_CLAVE).');
    return;
  }
  mostrarPanel(estado);
  if (vueltaMs === 'conectado') mensaje($('#registro-estado'), 'Cuenta de Microsoft conectada: ya se puede guardar en la planilla.', 'ok');
  if (vueltaMs === 'error') {
    $('#aviso-planilla').hidden = false;
    $('#aviso-planilla').classList.add('error');
    $('#aviso-planilla-texto').textContent = params.get('mensaje') || 'No se pudo conectar la cuenta de Microsoft.';
  }
}

// ── Ingreso y salida ──
$('#form-ingreso').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const boton = ev.submitter ?? $('#form-ingreso button');
  boton.disabled = true;
  const r = await api('/api/sesion', { metodo: 'POST', datos: { nombre: $('#i-nombre').value, clave: $('#i-clave').value } })
    .catch(() => ({ ok: false, error: 'No se pudo conectar. Revisá internet.' }));
  boton.disabled = false;
  if (!r.ok) {
    mensaje($('#ingreso-error'), r.error || 'No se pudo ingresar.', 'error');
    $('#i-clave').select();
    return;
  }
  $('#i-clave').value = '';
  $('#cargando').hidden = false;
  $('#pantalla-ingreso').hidden = true;
  iniciar();
});

$('#btn-salir').addEventListener('click', async () => {
  await api('/api/sesion', { metodo: 'DELETE' }).catch(() => {});
  try { sessionStorage.removeItem(CLAVE_ULTIMOS); } catch { /* sin almacenamiento */ }
  limpiarFormulario();
  $('#a-texto').value = '';
  mostrarIngreso();
});

// ── Formulario ──
const form = $('#form-registro');
const input = (campo) => form.elements[campo];

function marcarError(campo, texto) {
  const el = input(campo);
  el.setAttribute('aria-invalid', texto ? 'true' : 'false');
  let nota = el.parentElement.querySelector('.error-campo');
  if (texto && !nota) {
    nota = document.createElement('span');
    nota.className = 'error-campo';
    nota.id = `error-${campo}`;
    el.parentElement.append(nota);
    el.setAttribute('aria-describedby', nota.id);
  }
  if (nota) {
    nota.textContent = texto;
    nota.hidden = !texto;
  }
}

function validarLocal() {
  const errores = {};
  for (const campo of CAMPOS) {
    const v = input(campo).value.trim();
    if (!v && OBLIGATORIOS.has(campo)) errores[campo] = 'Falta completar.';
  }
  const socio = input('socio').value.replace(/[\s.]/g, '');
  if (socio && !/^\d+$/.test(socio)) errores.socio = 'Solo números.';
  const ced = input('cedula').value.trim();
  if (ced && !cedulaValida(ced)) errores.cedula = 'Cédula no válida: revisá los números y el dígito después del guion.';
  return errores;
}

function mostrarErrores(errores) {
  for (const campo of CAMPOS) marcarError(campo, errores[campo] ?? '');
  const primero = CAMPOS.find((c) => errores[c]);
  if (primero) input(primero).focus();
}

function limpiarFormulario() {
  form.reset();
  for (const campo of CAMPOS) {
    marcarError(campo, '');
    input(campo).classList.remove('completado');
  }
}

for (const campo of CAMPOS) {
  input(campo).addEventListener('input', () => {
    input(campo).classList.remove('completado');
    if (input(campo).getAttribute('aria-invalid') === 'true') marcarError(campo, '');
  });
}

$('#btn-limpiar').addEventListener('click', () => {
  limpiarFormulario();
  mensaje($('#registro-estado'), '');
  input('nombre').focus();
});

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const estado = $('#registro-estado');
  const errores = validarLocal();
  mostrarErrores(errores);
  if (Object.keys(errores).length) {
    mensaje(estado, 'Revisá los campos marcados.', 'error');
    return;
  }
  const datos = Object.fromEntries(CAMPOS.map((c) => [c, input(c).value.trim()]));
  const boton = $('#btn-guardar');
  boton.disabled = true;
  mensaje(estado, 'Guardando en la planilla…');
  const r = await api('/api/registro', { metodo: 'POST', datos }).catch(() => ({ ok: false, error: 'No se pudo conectar. Revisá internet y probá de nuevo.' }));
  boton.disabled = false;
  if (!r.ok) {
    if (r.errores) mostrarErrores(r.errores);
    if (r.conectar) $('#btn-conectar').hidden = false;
    if (r.status !== 401) mensaje(estado, r.error || 'No se pudo guardar.', 'error');
    return;
  }
  guardarUltimo({ fecha: r.fecha, ...r.registro });
  limpiarFormulario();
  mensaje(estado, `Guardado en la planilla: ${r.registro.nombre} · ${r.registro.producto}.`, 'ok');
  input('nombre').focus();
});

// ── Asistente ──
$('#btn-asistente').addEventListener('click', async () => {
  const texto = $('#a-texto').value.trim();
  const estado = $('#asistente-estado');
  if (texto.length < 5) {
    mensaje(estado, 'Escribí o pegá los datos del socio y del producto.', 'error');
    $('#a-texto').focus();
    return;
  }
  const boton = $('#btn-asistente');
  boton.disabled = true;
  mensaje(estado, 'Leyendo el texto…');
  const r = await api('/api/asistente', { metodo: 'POST', datos: { texto } }).catch(() => ({ ok: false, error: 'No se pudo conectar. Revisá internet.' }));
  boton.disabled = false;
  if (!r.ok) {
    if (r.status !== 401) mensaje(estado, r.error || 'El asistente no respondió.', 'error');
    return;
  }
  limpiarFormulario();
  const completados = Object.entries(r.campos ?? {}).filter(([campo]) => CAMPOS.includes(campo));
  for (const [campo, valor] of completados) {
    input(campo).value = valor;
    input(campo).classList.add('completado');
  }
  const partes = [completados.length ? `Completé ${completados.length} campo${completados.length === 1 ? '' : 's'} (en amarillo): revisalos antes de guardar.` : 'No encontré datos para el formulario.'];
  if (r.faltan?.length) partes.push(`Faltan: ${r.faltan.join(', ')}.`);
  if (r.notas) partes.push(r.notas);
  mensaje(estado, partes.join(' '), completados.length ? 'ok' : 'error');
  mostrarErrores(Object.fromEntries(Object.entries(validarLocal()).filter(([campo]) => input(campo).value.trim())));
});

$('#btn-asistente-borrar').addEventListener('click', () => {
  $('#a-texto').value = '';
  mensaje($('#asistente-estado'), '');
  $('#a-texto').focus();
});

// ── Últimos cargados (solo en esta pestaña; la planilla es la fuente de verdad) ──
function leerUltimos() {
  try { return JSON.parse(sessionStorage.getItem(CLAVE_ULTIMOS) || '[]'); } catch { return []; }
}

function guardarUltimo(registro) {
  const lista = [registro, ...leerUltimos()].slice(0, 20);
  try { sessionStorage.setItem(CLAVE_ULTIMOS, JSON.stringify(lista)); } catch { /* sin almacenamiento */ }
  dibujarUltimos(lista);
}

function dibujarUltimos(lista = leerUltimos()) {
  const tabla = $('#ultimos');
  const cuerpo = tabla.querySelector('tbody');
  cuerpo.replaceChildren(...lista.map((r) => {
    const fila = document.createElement('tr');
    for (const v of [r.fecha, r.nombre, r.socio, r.cedula, r.producto, r.codigo, r.service]) {
      const celda = document.createElement('td');
      celda.textContent = v || '—';
      fila.append(celda);
    }
    return fila;
  }));
  tabla.hidden = !lista.length;
  $('#ultimos-vacio').hidden = Boolean(lista.length);
}

iniciar();
