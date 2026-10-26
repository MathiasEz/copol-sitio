// Todo el panel pasa por acá (vercel.json manda cada pedido a api/index.js). Solo responde dentro de la
// dirección secreta PANEL_RUTA; cualquier otra dirección da un 404 genérico, así no se puede descubrir que
// el panel existe. Adentro: la página (app/), los recursos y la API JSON (BASE/api/...).
import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as A from './acceso.js';
import { almacenConfigurado, contador, contar, reiniciar, resumen } from './almacen.js';
import { conversar, ErrorAsistente, limpiarAdjuntos, limpiarFormulario, limpiarHistorial, MAX_TEXTO, tokenGateway } from './asistente.js';
import { fechaMontevideo, validarRegistro } from './campos.js';
import { borrarCookie, conCookies, cookie, error, espera, json, leerCookie, leerJson, mismoOrigen, noEncontrado, texto } from './http.js';
import * as MS from './microsoft.js';
import { agregar, estado as estadoPlanilla, modo as modoPlanilla, registrosPrueba, vaciarPrueba, xlsxPrueba } from './planilla.js';
import { abrir, esRol, hashClave, hashFicticio, iguales, problemaClave, problemaPin, puede, ROLES, secreto, sellar, verificarClave } from './seguridad.js';
import * as U from './usuarios.js';

const RAIZ_APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };

/** Dirección secreta del panel (PANEL_RUTA, p. ej. /cr-x7k2m9q4vw). En Vercel sin ella no responde nada. */
export function base() {
  const r = (process.env.PANEL_RUTA ?? '').trim().replace(/\/+$/, '');
  if (/^\/[a-z0-9][a-z0-9-]{7,63}$/i.test(r)) return r;
  return process.env.VERCEL ? null : '/panel';
}

const ADMIN_INICIAL = () => U.limpiarUsuario(process.env.PANEL_ADMIN_INICIAL || 'bpereira');
const LIMITES = { pinIp: 10, ingresoIp: 20, configurarIp: 5, ventanaS: 900 };

// ── Página y recursos ──

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://photon.komoot.io https://nominatim.openstreetmap.org; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'";

async function archivo(relativo) {
  const camino = normalize(join(RAIZ_APP, relativo));
  if (!camino.startsWith(RAIZ_APP)) return noEncontrado();
  const contenido = await readFile(camino).catch(() => null);
  if (!contenido) return noEncontrado();
  return new Response(contenido, {
    headers: {
      'content-type': TIPOS[extname(camino)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
      etag: `"${createHash('sha1').update(contenido).digest('base64url')}"`,
      'x-robots-tag': 'noindex, nofollow',
      ...(camino.endsWith('.html') ? { 'content-security-policy': CSP } : {}),
    },
  });
}

// ── Sesión ──

/** Usuario con sesión vigente (y la cookie renovada, si toca), o null. */
async function sesionDe(request) {
  const s = A.leerSesion(leerCookie(request, A.COOKIES.sesion));
  if (!s) return null;
  const u = await U.buscar(s.u);
  if (!u || !u.activo || u.sv !== s.sv) return null;
  const renovada = A.renovarSesion(s);
  return { u, larga: Boolean(s.larga), renovar: renovada ? cookie(request, A.COOKIES.sesion, renovada, s.exp - Date.now()) : null };
}

/** Pase de equipo recordado válido (de una cuenta activa cuya contraseña no cambió), o null. */
async function equipoDe(request) {
  const e = A.leerPaseEquipo(leerCookie(request, A.COOKIES.equipo));
  if (!e) return null;
  const u = await U.buscar(e.u);
  return u && u.activo && u.sv === e.sv ? u : null;
}

async function pinOk(request) {
  const aj = await U.ajustes();
  if (!aj.pv) return true;
  return A.leerPasePin(leerCookie(request, A.COOKIES.pin), aj.pv) || Boolean(await equipoDe(request));
}

async function datosPanel(request, u) {
  const ia = process.env.IA_APAGADA !== '1' && Boolean(tokenGateway(request.headers.get('x-vercel-oidc-token')));
  return {
    fase: u.debeCambiar ? 'clave' : 'panel',
    usuario: { ...U.publico(u), permisos: ROLES[u.rol].permisos, rolNombre: ROLES[u.rol].nombre },
    planilla: u.debeCambiar ? null : await estadoPlanilla(),
    ia,
    correoActivo: A.correoConfigurado(),
    aviso: puede(u.rol, 'usuarios') && !A.correoConfigurado()
      ? 'La verificación por correo está en pausa: falta configurar el envío de correos (RESEND_API_KEY en Vercel). Mientras tanto se ingresa con PIN, usuario y contraseña.'
      : null,
  };
}

/** `larga`: equipo recordado, la sesión no se cierra mientras se use (ver acceso.js). */
async function iniciarSesion(request, u, origen, motivo, extra = [], larga = false) {
  const actualizado = await U.actualizar(u.usuario, { ultimoAcceso: new Date().toISOString(), intentos: 0, bloqueadoHasta: null });
  await A.registrar('ingreso', { usuario: u.usuario, detalle: motivo, origen });
  const sesion = A.sesionNueva(actualizado, larga);
  return conCookies(json({ ok: true, ...(await datosPanel(request, actualizado)) }), [
    cookie(request, A.COOKIES.sesion, sesion.valor, sesion.ms),
    borrarCookie(request, A.COOKIES.verif),
    ...extra,
  ]);
}

// ── Estado (qué pantalla mostrar) ──

async function estado(request) {
  if ((await U.listar()).length === 0) {
    return json({ fase: 'configurar', admin: ADMIN_INICIAL(), codigoConfigurado: Boolean(process.env.PANEL_CODIGO_INICIAL) });
  }
  const s = await sesionDe(request);
  if (s) return conCookies(json(await datosPanel(request, s.u)), [s.renovar]);
  const v = A.leerVerificacion(leerCookie(request, A.COOKIES.verif));
  const uv = v ? await U.buscar(v.u) : null;
  if (v && uv?.activo && uv.sv === v.sv && uv.correo) return json(fasesVerificacion(v, uv));
  return json({ fase: (await pinOk(request)) ? 'ingreso' : 'pin', sinCorreo: !A.correoConfigurado() });
}

const fasesVerificacion = (v, u) => (v.correoOk
  ? { fase: 'codigo', correo: A.ocultarCorreo(u.correo), espera: A.segundosParaReenviar(v), puedeReenviar: v.envios < A.MAX_ENVIOS }
  : { fase: 'correo' });

// ── Configuración inicial (solo mientras no hay usuarios) ──

async function configurar(request, b, origen) {
  if ((await U.listar({ fresco: true })).length) return error('El panel ya está configurado.', 409);
  const esperado = process.env.PANEL_CODIGO_INICIAL ?? '';
  if (esperado.length < 8) return error('Falta PANEL_CODIGO_INICIAL en Vercel.', 503);
  const ipClave = `configurar-${resumen(origen.ip ?? 'local')}`;
  if ((await contador(ipClave)) >= LIMITES.configurarIp) return error('Demasiados intentos. Esperá 15 minutos.', 429);
  if (!iguales(texto(b.codigo, 100).trim(), esperado)) {
    await Promise.all([contar(ipClave, LIMITES.ventanaS), espera(700)]);
    return error('El código de configuración no es correcto.', 401, { campo: 'codigo' });
  }
  const usuario = ADMIN_INICIAL();
  const clave = texto(b.clave, 200);
  const correo = U.limpiarCorreo(b.correo);
  const pin = texto(b.pin, 6);
  const errores = {};
  if (!U.correoValido(correo)) errores.correo = 'Escribí un correo válido: ahí llegan los códigos de ingreso.';
  const pClave = problemaClave(clave, usuario);
  if (pClave) errores.clave = pClave;
  else if (clave !== b.repetir) errores.repetir = 'Las contraseñas no coinciden.';
  const pPin = problemaPin(pin);
  if (pPin) errores.pin = pPin;
  else if (pin !== b.repetirPin) errores.repetirPin = 'Los PIN no coinciden.';
  if (Object.keys(errores).length) return error('Revisá los campos marcados.', 422, { errores });
  const u = await U.crear({ usuario, nombre: U.limpiarNombre(b.nombre) || usuario, rol: 'administrador', correo, clave, debeCambiar: false, protegido: true, creadoPor: 'configuración inicial' });
  await U.guardarPin(pin);
  await reiniciar(ipClave);
  await A.registrar('configuracion-inicial', { usuario, origen });
  const aj = await U.ajustes();
  return iniciarSesion(request, u, origen, 'configuración inicial', [cookie(request, A.COOKIES.pin, A.pasePin(aj.pv), A.DURACION.pin)]);
}

// ── PIN, contraseña y código por correo ──

async function ingresarPin(request, b, origen) {
  const aj = await U.ajustes();
  if (!aj.pinHash) return json({ ok: true, fase: 'ingreso' });
  const ipClave = `pin-${resumen(origen.ip ?? 'local')}`;
  if ((await contador(ipClave)) >= LIMITES.pinIp) return error('Demasiados intentos. Esperá 15 minutos.', 429);
  const pin = texto(b.pin, 6);
  if (!/^\d{6}$/.test(pin) || !(await verificarClave(pin, aj.pinHash))) {
    await Promise.all([contar(ipClave, LIMITES.ventanaS), A.registrar('pin-fallido', { origen }), espera(500)]);
    return error('PIN incorrecto.', 401);
  }
  await reiniciar(ipClave);
  return conCookies(json({ ok: true, fase: 'ingreso' }), [cookie(request, A.COOKIES.pin, A.pasePin(aj.pv), A.DURACION.pin)]);
}

async function ingresar(request, b, origen) {
  if (!(await pinOk(request))) return error('Primero ingresá el PIN del panel.', 403, { fase: 'pin' });
  const ipClave = `ingreso-${resumen(origen.ip ?? 'local')}`;
  if ((await contador(ipClave)) >= LIMITES.ingresoIp) return error('Demasiados intentos desde esta conexión. Esperá 15 minutos.', 429);
  const usuario = U.limpiarUsuario(b.usuario);
  const clave = texto(b.clave, 200);
  const u = usuario ? await U.buscar(usuario, { fresco: true }) : null;
  // Siempre se calcula un hash, exista o no el usuario, para no revelar cuáles existen.
  const ok = await verificarClave(clave, u?.hash ?? (await hashFicticio()));
  if (u?.bloqueadoHasta && Date.parse(u.bloqueadoHasta) > Date.now()) {
    await contar(ipClave, LIMITES.ventanaS);
    return error('La cuenta está bloqueada temporalmente por intentos fallidos. Probá en 15 minutos.', 401);
  }
  if (!u || !ok || !u.activo) {
    await contar(ipClave, LIMITES.ventanaS);
    if (u) {
      const intentos = (u.intentos ?? 0) + 1;
      const bloquear = intentos >= 5;
      await U.actualizar(u.usuario, { intentos: bloquear ? 0 : intentos, bloqueadoHasta: bloquear ? new Date(Date.now() + 15 * 60_000).toISOString() : null });
      await A.registrar(bloquear ? 'bloqueo' : 'ingreso-fallido', { usuario: u.usuario, origen });
    } else {
      await A.registrar('ingreso-fallido', { usuario: usuario || null, detalle: 'usuario inexistente', origen });
    }
    return error('Usuario o contraseña incorrectos.', 401);
  }
  const equipo = await equipoDe(request);
  if (equipo?.usuario === u.usuario) return iniciarSesion(request, u, origen, 'equipo recordado', [], true);
  if (!A.correoConfigurado()) {
    // Sin envío de correos no hay paso del código: el equipo se puede recordar igual (30 días) desde el ingreso.
    const extra = [];
    if (b.recordar === true) {
      extra.push(cookie(request, A.COOKIES.equipo, A.paseEquipo(u), A.DURACION.equipo));
      await A.registrar('equipo-recordado', { usuario: u.usuario, origen });
    }
    return iniciarSesion(request, u, origen, 'sin código: envío de correos sin configurar', extra, b.recordar === true);
  }
  if (!u.correo) return error('Tu cuenta no tiene un correo para enviarte el código de verificación. Pedile a un administrador que lo cargue.', 403);
  await U.actualizar(u.usuario, { intentos: 0, bloqueadoHasta: null });
  return conCookies(json({ ok: true, fase: 'correo' }), [cookie(request, A.COOKIES.verif, A.sellarVerificacion(A.verificacionNueva(u)), A.DURACION.verificacion)]);
}

async function verificacionDe(request) {
  const v = A.leerVerificacion(leerCookie(request, A.COOKIES.verif));
  const u = v ? await U.buscar(v.u) : null;
  if (!v || !u?.activo || u.sv !== v.sv || !u.correo || !A.correoConfigurado()) return null;
  if ((await contador(`verif-${v.n}`)) >= A.MAX_INTENTOS_CODIGO) return null;
  return { v, u };
}

const volverAlIngreso = (request, mensaje) => conCookies(error(mensaje, 401, { fase: 'ingreso' }), [borrarCookie(request, A.COOKIES.verif)]);

async function fallarVerificacion(request, d, tipo, mensaje, origen) {
  const n = await contar(`verif-${d.v.n}`, A.DURACION.verificacion / 1000);
  await A.registrar(tipo, { usuario: d.u.usuario, origen });
  if (n >= A.MAX_INTENTOS_CODIGO) return volverAlIngreso(request, 'Demasiados intentos. Volvé a ingresar con tu usuario y contraseña.');
  return error(mensaje, 401);
}

async function enviarCodigo(request, d, origen) {
  const { codigo, v } = A.nuevoCodigo(d.v);
  try {
    await A.enviarCorreo({ para: d.u.correo, ...A.correoCodigo(codigo, d.u.usuario, origen) });
  } catch (e) {
    console.error(`envío del código a ${d.u.usuario}:`, e.message);
    return error('No se pudo enviar el correo. Probá de nuevo en un minuto.', 502);
  }
  await A.registrar('codigo-enviado', { usuario: d.u.usuario, detalle: A.ocultarCorreo(d.u.correo), origen });
  return conCookies(json({ ok: true, ...fasesVerificacion(v, d.u) }), [cookie(request, A.COOKIES.verif, A.sellarVerificacion(v), Math.max(1000, v.exp - Date.now()))]);
}

async function verificar(request, paso, b, origen) {
  if (paso === 'cancelar') return conCookies(json({ ok: true, fase: 'ingreso' }), [borrarCookie(request, A.COOKIES.verif)]);
  const d = await verificacionDe(request);
  if (!d) return volverAlIngreso(request, 'La verificación venció. Volvé a ingresar.');
  if (paso === 'correo') {
    if (d.v.correoOk) return json({ ok: true, ...fasesVerificacion(d.v, d.u) });
    if (U.limpiarCorreo(b.correo) !== d.u.correo.toLowerCase()) return fallarVerificacion(request, d, 'correo-incorrecto', 'Ese correo no coincide con el de tu cuenta.', origen);
    return enviarCodigo(request, d, origen);
  }
  if (!d.v.correoOk) return json({ ok: true, fase: 'correo' });
  if (paso === 'reenviar') {
    if (d.v.envios >= A.MAX_ENVIOS) return error('Ya se enviaron varios códigos. Revisá también la carpeta de spam o volvé a ingresar más tarde.', 429);
    const s = A.segundosParaReenviar(d.v);
    if (s > 0) return error(`Esperá ${s} segundos para pedir otro código.`, 429);
    return enviarCodigo(request, d, origen);
  }
  if (paso === 'codigo') {
    const codigo = texto(b.codigo, 20).replace(/\D/g, '');
    if (!A.codigoValido(d.v, codigo)) {
      return fallarVerificacion(request, d, 'codigo-fallido', A.codigoVencido(d.v) ? 'El código venció. Pedí uno nuevo.' : 'Código incorrecto.', origen);
    }
    await reiniciar(`verif-${d.v.n}`);
    const extra = [];
    if (b.recordar === true) {
      extra.push(cookie(request, A.COOKIES.equipo, A.paseEquipo(d.u), A.DURACION.equipo));
      await A.registrar('equipo-recordado', { usuario: d.u.usuario, origen });
    }
    return iniciarSesion(request, d.u, origen, 'código por correo', extra, b.recordar === true);
  }
  return error('No encontrado.', 404);
}

// ── Perfil ──

async function perfil(request, paso, b, s, origen) {
  const u = await U.buscar(s.u.usuario, { fresco: true });
  const clave = texto(paso === 'clave' ? b.actual : b.clave, 200);
  if (!(await verificarClave(clave, u.hash))) return error(paso === 'clave' ? 'La contraseña actual no es correcta.' : 'Tu contraseña no es correcta.', 401, { campo: paso === 'clave' ? 'actual' : 'clave' });
  if (paso === 'clave') {
    const nueva = texto(b.nueva, 200);
    const problema = nueva !== b.repetir ? 'Las contraseñas nuevas no coinciden.' : nueva === clave ? 'La contraseña nueva tiene que ser distinta de la actual.' : problemaClave(nueva, u.usuario);
    if (problema) return error(problema, 422, { campo: 'nueva' });
    const tenia = await equipoDe(request);
    const act = await U.actualizar(u.usuario, { hash: await hashClave(nueva), debeCambiar: false, sv: U.nuevaVersionSesion(), intentos: 0, bloqueadoHasta: null });
    await A.registrar('clave-cambio', { usuario: u.usuario, origen });
    // Las demás sesiones y equipos recordados de la cuenta se cierran; este navegador sigue adentro.
    const nuevaSesion = A.sesionNueva(act, s.larga);
    return conCookies(json({ ok: true, ...(await datosPanel(request, act)) }), [
      cookie(request, A.COOKIES.sesion, nuevaSesion.valor, nuevaSesion.ms),
      tenia?.usuario === act.usuario ? cookie(request, A.COOKIES.equipo, A.paseEquipo(act), A.DURACION.equipo) : null,
    ]);
  }
  if (paso === 'correo') {
    const correo = U.limpiarCorreo(b.correo);
    if (!U.correoValido(correo)) return error('Escribí un correo válido.', 422, { campo: 'correo' });
    await U.actualizar(u.usuario, { correo });
    await A.registrar('correo-cambio', { usuario: u.usuario, detalle: A.ocultarCorreo(correo), origen });
    return json({ ok: true });
  }
  if (paso === 'pin') {
    if (!puede(u.rol, 'configuracion')) return error('No tenés permiso.', 403);
    const pin = texto(b.pin, 6);
    const problema = problemaPin(pin) ?? (pin !== b.repetir ? 'Los PIN no coinciden.' : null);
    if (problema) return error(problema, 422, { campo: 'pin' });
    await U.guardarPin(pin);
    await A.registrar('pin-cambio', { usuario: u.usuario, origen });
    const aj = await U.ajustes();
    return conCookies(json({ ok: true }), [cookie(request, A.COOKIES.pin, A.pasePin(aj.pv), A.DURACION.pin)]);
  }
  return error('No encontrado.', 404);
}

// ── Usuarios (administradores) ──

async function usuarios(request, metodo, partes, b, s, origen) {
  const yo = s.u.usuario;
  if (metodo === 'GET' && !partes.length) {
    const lista = await U.listar({ fresco: true });
    return json({ usuarios: lista.map(U.publico), roles: Object.fromEntries(Object.entries(ROLES).map(([k, r]) => [k, { nombre: r.nombre, descripcion: r.descripcion }])), yo });
  }
  if (metodo === 'POST' && !partes.length) {
    const usuario = U.limpiarUsuario(b.usuario);
    const clave = texto(b.clave, 200);
    const correo = U.limpiarCorreo(b.correo);
    if (!U.correoValido(correo)) return error('Escribí un correo válido: ahí le llegan los códigos de ingreso.', 422, { campo: 'correo' });
    const problema = problemaClave(clave, usuario);
    if (problema) return error(problema, 422, { campo: 'clave' });
    const nuevo = await U.crear({ usuario, nombre: b.nombre, rol: b.rol, correo, clave, debeCambiar: true, creadoPor: yo });
    await A.registrar('usuario-creado', { usuario: yo, detalle: `${nuevo.usuario} (${ROLES[nuevo.rol].nombre})`, origen });
    await A.registrarActividad('usuario-creado', { usuario: yo, nombre: s.u.nombre, detalle: `${nuevo.usuario} (${ROLES[nuevo.rol].nombre})` });
    return json({ ok: true, usuario: U.publico(nuevo) }, 201);
  }
  const objetivo = U.limpiarUsuario(decodeURIComponent(partes[0] ?? ''));
  const accion = partes[1] ?? '';
  const u = await U.buscar(objetivo, { fresco: true });
  if (!u) return error('El usuario no existe.', 404);
  if (metodo === 'PATCH' && !accion) {
    const cambios = {};
    if (b.nombre !== undefined) cambios.nombre = U.limpiarNombre(b.nombre) || u.usuario;
    if (b.correo !== undefined) {
      const c = U.limpiarCorreo(b.correo);
      if (!U.correoValido(c)) return error('Escribí un correo válido.', 422, { campo: 'correo' });
      cambios.correo = c;
    }
    if (b.rol !== undefined && b.rol !== u.rol) {
      if (!esRol(b.rol)) return error('Elegí un rol.', 422, { campo: 'rol' });
      if (u.protegido) return error('Este administrador está protegido: no se le puede cambiar el rol.', 403);
      if (u.usuario === yo) return error('No podés cambiar tu propio rol.', 403);
      cambios.rol = b.rol;
    }
    if (b.activo !== undefined && Boolean(b.activo) !== u.activo) {
      if (u.protegido || u.usuario === yo) return error(u.protegido ? 'Este administrador está protegido: no se puede desactivar.' : 'No podés desactivar tu propia cuenta.', 403);
      cambios.activo = Boolean(b.activo);
    }
    if (cambios.rol || cambios.activo === false) cambios.sv = U.nuevaVersionSesion();
    const lista = await U.listar({ fresco: true });
    const quedan = lista.filter((x) => x.rol === 'administrador' && x.activo && (x.usuario !== u.usuario || ((cambios.rol ?? u.rol) === 'administrador' && cambios.activo !== false))).length;
    if (!quedan) return error('Tiene que quedar al menos un administrador activo.', 409);
    const act = await U.actualizar(u.usuario, cambios);
    await A.registrar('usuario-editado', { usuario: yo, detalle: `${u.usuario}: ${Object.keys(cambios).filter((k) => k !== 'sv').join(', ')}`, origen });
    return json({ ok: true, usuario: U.publico(act) });
  }
  if (metodo === 'POST' && accion === 'clave') {
    const clave = texto(b.clave, 200);
    const problema = problemaClave(clave, u.usuario);
    if (problema) return error(problema, 422, { campo: 'clave' });
    const act = await U.actualizar(u.usuario, { hash: await hashClave(clave), debeCambiar: u.usuario !== yo, sv: U.nuevaVersionSesion(), intentos: 0, bloqueadoHasta: null });
    await A.registrar('usuario-clave', { usuario: yo, detalle: u.usuario, origen });
    return json({ ok: true, usuario: U.publico(act) });
  }
  if (metodo === 'POST' && accion === 'sesiones') {
    await U.actualizar(u.usuario, { sv: U.nuevaVersionSesion() });
    await A.registrar('usuario-sesiones', { usuario: yo, detalle: u.usuario, origen });
    return json({ ok: true });
  }
  if (metodo === 'DELETE' && !accion) {
    if (u.usuario === yo) return error('No podés eliminar tu propia cuenta.', 403);
    await U.eliminar(u.usuario);
    await A.registrar('usuario-eliminado', { usuario: yo, detalle: u.usuario, origen });
    await A.registrarActividad('usuario-eliminado', { usuario: yo, nombre: s.u.nombre, detalle: u.usuario });
    return json({ ok: true });
  }
  return error('No encontrado.', 404);
}

// ── Formulario, planilla y asistente ──

async function guardarRegistro(b, s) {
  const { datos, errores } = validarRegistro(b);
  if (errores) return error('Revisá los campos marcados.', 422, { errores });
  try {
    const { fecha, destino } = await agregar(datos, s.u.nombre || s.u.usuario);
    await A.registrarActividad('registro', {
      usuario: s.u.usuario, nombre: s.u.nombre, destino,
      detalle: `${datos.nombre} · socio ${datos.socio} · ${datos.producto} (${datos.codigo})${datos.flete === 'Sí' ? ' · con flete' : ''}${datos.adicional ? ' · con información adicional' : ''}`,
    });
    return json({ ok: true, registro: { ...datos, cargadoPor: s.u.nombre || s.u.usuario }, fecha });
  } catch (e) {
    if (e instanceof MS.ErrorPlanilla) return error(e.message, e.status, { conectar: e.reconectar });
    console.error('registro:', e);
    return error('No se pudo guardar. Probá de nuevo.', 500);
  }
}

async function planilla(request, metodo, s, origen) {
  if (modoPlanilla() !== 'prueba') return error('La planilla de prueba solo se usa mientras no esté conectada la de Excel.', 409);
  if (metodo === 'DELETE') {
    if (!puede(s.u.rol, 'configuracion')) return error('Solo un administrador puede vaciar la planilla.', 403);
    await vaciarPrueba();
    await A.registrar('planilla-vaciada', { usuario: s.u.usuario, origen });
    await A.registrarActividad('planilla-vaciada', { usuario: s.u.usuario, nombre: s.u.nombre, destino: 'Planilla de prueba' });
    return json({ ok: true });
  }
  const registros = await registrosPrueba();
  if (new URL(request.url).searchParams.get('formato') === 'xlsx') {
    const nombre = `Registros COPOL (prueba) ${fechaMontevideo().slice(0, 10)}.xlsx`;
    return new Response(xlsxPrueba(registros), {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="registros-copol-prueba.xlsx"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        'cache-control': 'no-store',
      },
    });
  }
  return json({ total: registros.length, registros: registros.slice(-200).reverse() });
}

async function asistente(request, b, s) {
  if (process.env.IA_APAGADA === '1') return error('El asistente está apagado. Completá el formulario a mano.', 503);
  const historial = limpiarHistorial(b.mensajes);
  if (!historial.length || historial.at(-1).texto.length < 2) return error('Escribí o dictá los datos del socio y del producto, o adjuntá una foto.');
  const { adjuntos, error: errorAdjuntos } = limpiarAdjuntos(b.adjuntos);
  if (errorAdjuntos) return error(errorAdjuntos, 413);
  if (historial.at(-1).texto.length >= MAX_TEXTO) return error(`El mensaje es demasiado largo (máximo ${MAX_TEXTO} caracteres).`);
  const limite = Number(process.env.IA_LIMITE_DIA) || 150;
  if ((await contar(`ia-${resumen(s.u.usuario)}-${fechaMontevideo().slice(0, 10)}`, 86_400)) > limite) return error('Llegaste al límite de consultas al asistente de hoy. Completá el formulario a mano.', 429);
  const token = tokenGateway(request.headers.get('x-vercel-oidc-token'));
  if (!token) return error('El asistente no está disponible en esta computadora (falta AI_GATEWAY_API_KEY).', 503);
  try {
    return json(await conversar({ historial, formulario: limpiarFormulario(b.formulario), adjuntos, token }));
  } catch (e) {
    if (e instanceof ErrorAsistente) return error(e.message, e.status);
    console.error('asistente:', e);
    return error('El asistente no respondió. Completá el formulario a mano.', 502);
  }
}

// ── Conexión con Microsoft (modo cuenta) ──

async function microsoft(request, paso, metodo, s, origen, BASE) {
  const volver = (parametros = {}) => {
    const q = new URLSearchParams(parametros).toString();
    return conCookies(new Response(null, { status: 302, headers: { location: `${BASE}/${q ? `?${q}` : ''}#/planilla`, 'cache-control': 'no-store' } }), [borrarCookie(request, A.COOKIES.ms)]);
  };
  if (paso === 'conectar' && metodo === 'GET') {
    if (MS.modoMicrosoft() !== 'cuenta') return volver({ microsoft: 'error', mensaje: 'La conexión con una cuenta solo se usa en el modo cuenta (MS_CUENTA).' });
    const falta = MS.faltaConfigurar();
    if (falta) return volver({ microsoft: 'error', mensaje: falta });
    const verificador = randomBytes(32).toString('base64url');
    const nonce = randomBytes(16).toString('base64url');
    const destino = MS.urlAutorizacion({ redireccion: MS.redireccion(request, BASE), estado: nonce, desafio: createHash('sha256').update(verificador).digest('base64url') });
    return conCookies(new Response(null, { status: 302, headers: { location: destino, 'cache-control': 'no-store' } }), [
      cookie(request, A.COOKIES.ms, sellar({ t: 'ms', n: nonce, v: verificador, exp: Date.now() + 600_000 }), 600_000),
    ]);
  }
  if (paso === 'conectar' && metodo === 'DELETE') {
    await MS.desconectar();
    await A.registrar('microsoft-desconectado', { usuario: s.u.usuario, origen });
    return json({ ok: true });
  }
  if (paso === 'vuelta' && metodo === 'GET') {
    const url = new URL(request.url);
    const guardado = abrir(leerCookie(request, A.COOKIES.ms), 'ms');
    if (url.searchParams.get('error')) return volver({ microsoft: 'error', mensaje: 'No se completó el inicio de sesión con Microsoft.' });
    if (!guardado || guardado.n !== url.searchParams.get('state') || !url.searchParams.get('code')) return volver({ microsoft: 'error', mensaje: 'El inicio de sesión con Microsoft venció. Probá conectar de nuevo.' });
    try {
      const cuenta = await MS.completarConexion({ codigo: url.searchParams.get('code'), redireccion: MS.redireccion(request, BASE), verificador: guardado.v });
      await A.registrar('microsoft-conectado', { usuario: s.u.usuario, detalle: cuenta, origen });
      return volver({ microsoft: 'conectado' });
    } catch (e) {
      console.error('microsoft/vuelta:', e.message);
      return volver({ microsoft: 'error', mensaje: e instanceof MS.ErrorPlanilla ? e.message : 'No se pudo conectar la cuenta de Microsoft.' });
    }
  }
  return error('No encontrado.', 404);
}

// ── Enrutador ──

async function api(request, metodo, partes, BASE) {
  const origen = A.origenDe(request);
  const cambia = metodo !== 'GET' && metodo !== 'HEAD';
  if (cambia && !mismoOrigen(request)) return error('Pedido rechazado: tiene que hacerse desde el panel.', 403);
  if (!secreto()) return error('Falta SESION_SECRETO (32 caracteres o más) en Vercel.', 503);
  if (!almacenConfigurado()) return error('Falta conectar el almacén del panel (Vercel → Storage → Blob privado).', 503);
  const [seccion, ...resto] = partes;
  const b = cambia ? await leerJson(request, seccion === 'asistente' ? 4_300_000 : undefined) : {};
  const ruta = `${metodo} ${seccion ?? ''}`;

  if (ruta === 'GET estado') return estado(request);
  if (ruta === 'POST configurar') return configurar(request, b, origen);
  if (ruta === 'POST pin') return ingresarPin(request, b, origen);
  if (ruta === 'POST ingresar') return ingresar(request, b, origen);
  if (ruta === 'POST verificar') return verificar(request, resto[0], b, origen);
  if (ruta === 'POST salir') {
    const s = await sesionDe(request);
    if (s) await A.registrar('salida', { usuario: s.u.usuario, origen });
    return conCookies(json({ ok: true, fase: 'ingreso' }), [borrarCookie(request, A.COOKIES.sesion)]);
  }

  // Desde acá, con sesión.
  const s = await sesionDe(request);
  if (!s) return error('La sesión venció. Volvé a ingresar.', 401, { fase: (await pinOk(request)) ? 'ingreso' : 'pin' });
  const responder = async (r) => conCookies(await r, [s.renovar]);
  if (seccion === 'perfil' && metodo === 'POST') return responder(perfil(request, resto[0], b, s, origen));
  if (s.u.debeCambiar) return error('Primero elegí una contraseña nueva.', 403, { fase: 'clave' });
  const permiso = (p) => (puede(s.u.rol, p) ? null : error('No tenés permiso para esto.', 403));

  if (ruta === 'POST registro') return responder(permiso('formulario') ?? guardarRegistro(b, s));
  if (ruta === 'POST asistente') return responder(permiso('formulario') ?? asistente(request, b, s));
  if (seccion === 'planilla' && ['GET', 'DELETE'].includes(metodo)) return responder(permiso('planilla') ?? planilla(request, metodo, s, origen));
  if (seccion === 'usuarios') {
    try {
      return await responder(permiso('usuarios') ?? usuarios(request, metodo, resto, b, s, origen));
    } catch (e) {
      if (e instanceof U.ErrorUsuario) return error(e.message, e.status, { campo: e.campo });
      throw e;
    }
  }
  if (ruta === 'GET actividad') return responder(permiso('accesos') ?? json({ eventos: (await A.actividad()).slice(0, 500), tipos: A.ACTIVIDAD }));
  if (ruta === 'GET accesos') return responder(permiso('accesos') ?? json({ eventos: (await A.eventos()).slice(0, 300), tipos: A.EVENTOS }));
  if (seccion === 'microsoft') return responder(permiso('configuracion') ?? microsoft(request, resto[0], metodo, s, origen, BASE));
  return error('No encontrado.', 404);
}

export async function manejar(request) {
  const BASE = base();
  const url = new URL(request.url);
  const camino = url.pathname;
  if (!BASE || (camino !== BASE && !camino.startsWith(`${BASE}/`))) return noEncontrado();
  const resto = camino.slice(BASE.length);
  const metodo = request.method.toUpperCase();
  try {
    if (resto === '') return new Response(null, { status: 308, headers: { location: `${BASE}/${url.search}` } });
    if (resto.startsWith('/api/')) return await api(request, metodo, resto.slice(5).split('/').filter(Boolean), BASE);
    if (metodo !== 'GET' && metodo !== 'HEAD') return noEncontrado();
    if (resto === '/') return archivo('index.html');
    if (resto.startsWith('/recursos/') && /^\/recursos\/[a-z0-9.-]+$/i.test(resto)) return archivo(resto.slice(1));
    return noEncontrado();
  } catch (e) {
    console.error('panel:', e);
    if (e?.name === 'ErrorAlmacen') return error(e.message, 503);
    return error('Algo salió mal. Probá de nuevo en un momento.', 500);
  }
}

