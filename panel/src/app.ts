// Panel de stock del Bazar: rutas, autenticación, autorización, productos, novedades y usuarios.
// Se monta en BASE (config.ts) del sitio (src/pages/<BASE>/[...ruta].ts) y funciona igual en desarrollo y en Vercel.
import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import * as AC from './acceso.ts';
import * as A from './asistente.ts';
import { atenderMcp } from './mcp.ts';
import * as O from './oauth.ts';
import { listarAccesos, listarEventos, registrar, type Actor } from './auditoria.ts';
import { BASE, type Config } from './config.ts';
import { ahora, ejecutar, una, type Db } from './db.ts';
import { almacenConfigurado, ErrorImagen, procesarImagen, variante, type Almacen } from './imagenes.ts';
import * as N from './novedades.ts';
import * as P from './productos.ts';
import * as PR from './propuestas.ts';
import { hashFicticio, Limitador, problemaClave, puede, tokenAleatorio, verificarClave, type Permiso } from './seguridad.ts';
import * as U from './usuarios.ts';
import { correoValido, leerCantidad, rutaInterna, texto, validarNovedad, validarProducto, validarUsuarioNuevo, type Campos } from './validacion.ts';
import * as V from './vistas.ts';

type Vars = { usuario: U.UsuarioPublico | null; sesion: U.Sesion | null; csrf: string; ip: string | null; origen: AC.Origen; db: Db };
type Env = { Bindings: { ip?: string | null }; Variables: Vars };
type C = Context<Env>;
const r = V.r;

const AVISOS: Record<string, V.Contexto['aviso']> = {
  'stock-guardado': { tipo: 'ok', texto: 'Stock guardado y verificado. La web pública ya muestra el cambio.' },
  'producto-creado': { tipo: 'ok', texto: 'Producto agregado y verificado en el catálogo.' },
  'producto-guardado': { tipo: 'ok', texto: 'Cambios guardados y verificados.' },
  'novedad-guardada': { tipo: 'ok', texto: 'Novedad guardada.' },
  'novedad-publicada': { tipo: 'ok', texto: 'Novedad publicada en la portada.' },
  'novedad-despublicada': { tipo: 'ok', texto: 'Novedad retirada de la portada.' },
  'novedad-eliminada': { tipo: 'ok', texto: 'Novedad eliminada.' },
  'usuario-creado': { tipo: 'ok', texto: 'Usuario agregado.' },
  'usuario-guardado': { tipo: 'ok', texto: 'Usuario actualizado.' },
  'usuario-eliminado': { tipo: 'ok', texto: 'Usuario eliminado.' },
  'clave-restablecida': { tipo: 'ok', texto: 'Contraseña restablecida. Deberá cambiarla al ingresar.' },
  'clave-cambiada': { tipo: 'ok', texto: 'Contraseña actualizada.' },
  conflicto: { tipo: 'error', texto: 'Otra persona modificó este producto mientras lo editabas. Revisá los datos actuales y volvé a intentar.' },
  'no-persistido': { tipo: 'error', texto: 'No se pudo confirmar el guardado en la base de datos. El cambio no se aplicó: intentá de nuevo.' },
  'sesion-vencida': { tipo: 'error', texto: 'Tu sesión venció. Ingresá de nuevo.' },
  'claude-desconectado': { tipo: 'ok', texto: 'Claude quedó desconectado: ya no puede consultar ni cambiar el stock.' },
  'pin-guardado': { tipo: 'ok', texto: 'PIN de acceso guardado. Desde ahora se pide antes de la pantalla de ingreso (salvo en equipos recordados).' },
  'correo-guardado': { tipo: 'ok', texto: 'Correo de verificación actualizado.' },
  'verificacion-vencida': { tipo: 'error', texto: 'La verificación venció o ya no es válida. Ingresá de nuevo.' },
  'verificacion-fallida': { tipo: 'error', texto: 'Demasiados intentos con el correo o el código. Ingresá de nuevo.' },
  'sesion-cerrada': { tipo: 'ok', texto: 'Sesión cerrada: esa persona tendrá que volver a ingresar.' },
  'equipo-olvidado': { tipo: 'ok', texto: 'Equipo olvidado: la próxima vez se le pedirán el PIN y el código por correo.' },
};

export interface OpcionesApp {
  /** Base de datos (o función que la obtiene en el primer uso). */
  db: Db | (() => Promise<Db>);
  config: Config;
  /** Almacenamiento de imágenes; por defecto Vercel Blob si está configurado, si no, carpeta local. */
  almacen?: Almacen;
  /** Solo para pruebas: `fetch` y token del asistente en lugar de Vercel AI Gateway. */
  asistente?: { fetch?: typeof fetch; token?: string | null };
  /** Envío del código por correo; por defecto Resend si RESEND_API_KEY está configurada (null = sin envío). */
  correo?: AC.EnviarCorreo | null;
}

export function crearApp({ db: fuenteDb, config, almacen, asistente, correo }: OpcionesApp) {
  const app = new Hono<Env>({ strict: false }).basePath(BASE);
  const obtenerDb = typeof fuenteDb === 'function' ? fuenteDb : async () => fuenteDb;
  const guardarEn = almacen ?? almacenConfigurado(config.dirImagenes, r('/media'));
  // Sin servicio de correo configurado, el paso del código queda en pausa (y el panel lo avisa a los administradores).
  const enviarCorreo: AC.EnviarCorreo | null = correo !== undefined ? correo : config.correo.clave ? AC.correoResend(config.correo.clave, config.correo.remitente) : null;
  const esApiClaude = (c: C) => config.conectorClaude && [r('/mcp'), r('/oauth/token'), r('/oauth/registro')].includes(c.req.path.replace(/\/$/, ''));
  const segura = (c: C) => new URL(c.req.url).protocol === 'https:';
  const nombreCookie = (c: C, base: string) => (segura(c) ? `__Host-${base}` : base);
  const opcionesCookie = (c: C) => ({ httpOnly: true, secure: segura(c), sameSite: 'Strict' as const, path: '/' });

  // ── Encabezados de seguridad, IP y errores ──
  app.use('*', async (c, next) => {
    let ip = c.env?.ip ?? null;
    if (config.confiarProxy) ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() || ip;
    c.set('ip', ip);
    c.set('origen', { ip, agente: c.req.header('user-agent') ?? null, lugar: config.confiarProxy ? AC.lugarDe((n) => c.req.header(n)) : null });
    c.set('db', await obtenerDb());
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'same-origin'); // con "no-referrer" los POST llevarían Origin: null
    c.header('X-Frame-Options', 'DENY');
    c.header('Cross-Origin-Opener-Policy', 'same-origin');
    c.header('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
    c.header('X-Robots-Tag', 'noindex, nofollow');
    if (!c.req.path.startsWith(r('/media/'))) {
      // La pantalla de permiso para Claude redirige, al enviarse, a claude.ai / claude.com (o localhost en pruebas).
      const formAction = c.req.path.startsWith(r('/oauth/autorizar/')) ? "'self' https://claude.ai https://claude.com http://localhost:* http://127.0.0.1:*" : "'self'";
      c.header('Content-Security-Policy', `default-src 'self'; img-src 'self' data: blob: https://*.public.blob.vercel-storage.com; media-src 'self' blob:; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; form-action ${formAction}; frame-ancestors 'none'; base-uri 'none'; object-src 'none'`);
      c.header('Cache-Control', 'no-store');
    }
    if (segura(c)) c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  });

  app.onError((err, c) => {
    const id = tokenAleatorio(6);
    console.error(`[${ahora()}] error ${id} ${c.req.method} ${c.req.path}:`, err);
    return c.html(V.vistaError(ctx(c), 500, 'Algo salió mal', `No se pudo completar la operación. Si se repite, avisá al administrador indicando el código ${id}.`), 500);
  });
  app.notFound((c) => c.html(V.vistaError(ctx(c), 404, 'Página no encontrada', 'La dirección no existe o fue movida.'), 404));

  const ctx = (c: C, extra: Partial<V.Contexto> = {}): V.Contexto => ({
    usuario: c.get('usuario') ?? null,
    csrf: c.get('csrf') ?? '',
    ruta: c.req.path + (new URL(c.req.url).search || ''),
    aviso: AVISOS[c.req.query('aviso') ?? ''] ?? null,
    sistema: c.get('usuario')?.rol === 'administrador' && !enviarCorreo ? 'La verificación por correo está en pausa: falta configurar el envío de correos (RESEND_API_KEY en Vercel). Mientras tanto se ingresa con PIN, usuario y contraseña.' : null,
    ...extra,
  });
  const actor = (c: C): Actor => ({ id: c.get('usuario')?.id ?? null, usuario: c.get('usuario')?.usuario ?? null, ip: c.get('ip') });
  /** Equipo y ubicación aproximada, para el historial de accesos. */
  const desde = (c: C) => ({ equipo: AC.describirEquipo(c.get('origen').agente), lugar: c.get('origen').lugar });
  const cuerpo = (c: C) => c.req.parseBody({ all: true }) as Promise<Campos>;

  // ── Imágenes locales (solo sin Vercel Blob, en desarrollo) ──
  app.get('/media/:carpeta/:archivo', async (c) => {
    const rel = `${c.req.param('carpeta')}/${c.req.param('archivo')}`;
    if (!/^[a-z0-9-]+\/[a-z0-9][a-z0-9._-]*\.webp$/i.test(rel)) return c.notFound();
    const raiz = path.resolve(config.dirImagenes);
    const archivo = path.join(raiz, rel);
    if (!archivo.startsWith(raiz + path.sep)) return c.notFound();
    try {
      return c.body(new Uint8Array(await fs.readFile(archivo)), 200, { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable', 'Cross-Origin-Resource-Policy': 'same-origin' });
    } catch {
      return c.notFound();
    }
  });

  // ── Sesión ──
  app.use('*', async (c, next) => {
    c.set('usuario', null);
    if (esApiClaude(c)) return next();
    c.set('sesion', null);
    const token = getCookie(c, nombreCookie(c, 'copol_panel'));
    if (token) {
      const s = await U.leerSesion(c.get('db'), token, config.sesionInactividadMin);
      if (s) {
        c.set('usuario', s.usuario);
        c.set('sesion', s.sesion);
        c.set('csrf', s.sesion.csrf);
      } else {
        deleteCookie(c, nombreCookie(c, 'copol_panel'), opcionesCookie(c));
      }
    }
    if (!c.get('sesion')) {
      // Antes de ingresar: token CSRF de doble envío (cookie + campo oculto).
      let pre = getCookie(c, nombreCookie(c, 'copol_pre'));
      if (!pre || !/^[A-Za-z0-9_-]{20,64}$/.test(pre)) {
        pre = tokenAleatorio(24);
        setCookie(c, nombreCookie(c, 'copol_pre'), pre, { ...opcionesCookie(c), maxAge: 3600 });
      }
      c.set('csrf', pre);
    }
    await next();
  });

  // ── CSRF: todo POST debe venir del mismo origen y traer el token de la sesión ──
  app.use('*', bodyLimit({ maxSize: (config.maxImagenMB + 1) * 1024 * 1024, onError: (c) => c.html(V.vistaError(ctx(c as C), 413, 'Archivo demasiado grande', `El máximo es ${config.maxImagenMB} MB por imagen.`), 413) }));
  app.use('*', async (c, next) => {
    if (c.req.method !== 'POST' || esApiClaude(c)) return next();
    const propio = new URL(c.req.url).origin;
    const origen = c.req.header('origin');
    const referer = c.req.header('referer');
    if (origen ? origen !== propio : !referer?.startsWith(propio + '/')) return c.text('Origen no permitido', 403);
    const b = await cuerpo(c);
    const token = c.req.header('x-csrf-token') ?? (typeof b._csrf === 'string' ? b._csrf : '');
    if (!token || token !== c.get('csrf')) return c.html(V.vistaError(ctx(c), 403, 'Formulario vencido', 'Recargá la página e intentá de nuevo.'), 403);
    await next();
  });

  // ── PIN de entrada: sin sesión, sin equipo recordado y sin PIN ingresado, todo lleva a la pantalla del PIN ──
  const cookieDe = (c: C, base: string) => getCookie(c, nombreCookie(c, base));
  app.use('*', async (c, next) => {
    if (c.get('sesion') || esApiClaude(c) || c.req.path.startsWith(r('/media/')) || c.req.path === r('/pin')) return next();
    const db = c.get('db');
    if (!(await AC.pinConfigurado(db))) return next();
    if ((await AC.leerPase(db, cookieDe(c, 'copol_equipo'), 'equipo')) || (await AC.leerPase(db, cookieDe(c, 'copol_pin'), 'pin'))) return next();
    const volver = c.req.method === 'GET' ? rutaInterna(c.req.path + (new URL(c.req.url).search || ''), '') : '';
    return c.redirect(volver ? `${r('/pin')}?volver=${encodeURIComponent(volver)}` : r('/pin'));
  });

  const requiere = (permiso: Permiso): MiddlewareHandler<Env> => async (c, next) => {
    const u = c.get('usuario');
    if (!u) return c.req.method === 'GET' ? c.redirect(`${r('/ingresar')}?volver=${encodeURIComponent(c.req.path)}`) : c.redirect(`${r('/ingresar')}?aviso=sesion-vencida`);
    if (u.debe_cambiar_clave && !c.req.path.startsWith(r('/perfil/clave'))) return c.redirect(r('/perfil/clave'));
    // Mientras no exista el PIN de entrada, el primer administrador que ingresa tiene que crearlo.
    if (u.rol === 'administrador' && c.req.path !== r('/pin/crear') && !(await AC.pinConfigurado(c.get('db')))) return c.redirect(r('/pin/crear'));
    if (!puede(u.rol, permiso)) return c.html(V.vistaError(ctx(c), 403, 'Sin permiso', 'Tu rol no permite esta acción. Pedile acceso a un administrador.'), 403);
    await next();
  };

  // ── Ingreso y salida ──
  // Pantalla del PIN (antes del ingreso). Límite: 5 intentos por conexión cada 15 min y 30 en total por hora.
  app.get('/pin', async (c) => {
    if (c.get('sesion') || !(await AC.pinConfigurado(c.get('db')))) return c.redirect(r('/ingresar'));
    return c.html(V.vistaPin(ctx(c), null, rutaInterna(c.req.query('volver'), '')));
  });
  app.post('/pin', async (c) => {
    const db = c.get('db');
    if (!(await AC.pinConfigurado(db))) return c.redirect(r('/ingresar'));
    const volver = rutaInterna(c.req.query('volver'), '');
    const ip = c.get('ip') ?? 'desconocida';
    const quien = { id: null, usuario: null, ip: c.get('ip') };
    if ((await AC.excedido(db, `pin:${ip}`, 5, 15 * 60_000)) || (await AC.excedido(db, 'pin:*', 30, 60 * 60_000))) {
      await registrar(db, quien, 'acceso.pin-bloqueo', null, null, desde(c));
      return c.html(V.vistaPin(ctx(c), 'Demasiados intentos. Esperá 15 minutos y probá de nuevo.', volver), 429);
    }
    const pin = texto((await cuerpo(c)).pin, 12).replace(/\s/g, '');
    if (!(await AC.verificarPin(db, pin))) {
      await AC.anotarIntento(db, `pin:${ip}`);
      await AC.anotarIntento(db, 'pin:*');
      await registrar(db, quien, 'acceso.pin-fallido', null, null, desde(c));
      return c.html(V.vistaPin(ctx(c), 'PIN incorrecto.', volver), 401);
    }
    await AC.limpiarIntentos(db, `pin:${ip}`);
    setCookie(c, nombreCookie(c, 'copol_pin'), await AC.crearPase(db, 'pin', null, c.get('origen')), { ...opcionesCookie(c), maxAge: AC.DURACION.pin / 1000 });
    await registrar(db, quien, 'acceso.pin', null, null, desde(c));
    return c.redirect(volver || r('/ingresar'));
  });

  /** Crea la sesión (último paso del ingreso) y la deja en el historial de accesos. */
  const iniciarSesion = async (c: C, u: { id: number; usuario: string; debe_cambiar_clave: number }, volver: string, verificacion: string) => {
    const db = c.get('db');
    const o = c.get('origen');
    await ejecutar(db, 'UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?', [ahora(), u.id]);
    await U.purgarSesionesVencidas(db);
    await AC.purgarVencidos(db);
    const token = await U.crearSesion(db, Number(u.id), config.sesionMaxHoras, o.ip, o.agente, o.lugar);
    setCookie(c, nombreCookie(c, 'copol_panel'), token, { ...opcionesCookie(c), maxAge: config.sesionMaxHoras * 3600 });
    for (const k of ['copol_pre', 'copol_verif', 'copol_pin']) deleteCookie(c, nombreCookie(c, k), opcionesCookie(c));
    await registrar(db, { id: Number(u.id), usuario: u.usuario, ip: o.ip }, 'sesion.ingreso', 'usuario', String(u.id), { verificacion, ...desde(c) });
    return c.redirect(u.debe_cambiar_clave ? r('/perfil/clave') : volver);
  };

  app.get('/ingresar', (c) => (c.get('usuario') ? c.redirect(r()) : c.html(V.vistaIngreso(ctx(c), null))));
  app.post('/ingresar', async (c) => {
    const db = c.get('db');
    const b = await cuerpo(c);
    const usuario = texto(b.usuario, 120).toLowerCase();
    const clave = typeof b.clave === 'string' ? b.clave.slice(0, 200) : '';
    const ip = c.get('ip') ?? 'desconocida';
    const fallo = (msg = 'Usuario o contraseña incorrectos.', estado: 401 | 403 = 401) => c.html(V.vistaIngreso(ctx(c), msg, usuario), estado);
    if (await AC.excedido(db, `ingreso:${ip}`, 20, 15 * 60_000)) {
      await registrar(db, { id: null, usuario, ip }, 'sesion.ingreso-fallido', 'usuario', usuario, { motivo: 'límite por IP', ...desde(c) });
      return c.html(V.vistaIngreso(ctx(c), 'Demasiados intentos desde esta conexión. Esperá 15 minutos.', usuario), 429);
    }
    const u = usuario ? await U.buscarPorUsuario(db, usuario) : undefined;
    // Siempre se calcula un hash, exista o no el usuario, para no revelar cuáles existen.
    const ok = await verificarClave(clave, u?.hash ?? (await hashFicticio()));
    if (u?.bloqueado_hasta && Date.parse(u.bloqueado_hasta) > Date.now()) {
      await AC.anotarIntento(db, `ingreso:${ip}`);
      return fallo('La cuenta está bloqueada temporalmente por intentos fallidos. Probá en 15 minutos.');
    }
    if (!u || !ok || !u.activo) {
      await AC.anotarIntento(db, `ingreso:${ip}`);
      if (u) {
        const intentos = Number(u.intentos_fallidos) + 1;
        const bloquear = intentos >= 5;
        await ejecutar(db, 'UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id = ?', [bloquear ? 0 : intentos, bloquear ? new Date(Date.now() + 15 * 60_000).toISOString() : null, u.id]);
        await registrar(db, { id: u.id, usuario: u.usuario, ip }, bloquear ? 'sesion.bloqueo' : 'sesion.ingreso-fallido', 'usuario', String(u.id), { motivo: 'contraseña incorrecta', ...desde(c) });
      } else {
        await registrar(db, { id: null, usuario: usuario || null, ip }, 'sesion.ingreso-fallido', 'usuario', null, { motivo: 'usuario inexistente', ...desde(c) });
      }
      return fallo();
    }
    await ejecutar(db, 'UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?', [u.id]);
    await AC.limpiarIntentos(db, `ingreso:${ip}`);
    const volver = rutaInterna(c.req.query('volver'), r());
    // Equipo recordado (30 días) para esta misma cuenta: no se pide el código.
    const equipo = await AC.leerPase(db, cookieDe(c, 'copol_equipo'), 'equipo');
    if (equipo && Number(equipo.usuario_id) === Number(u.id)) return iniciarSesion(c, u, volver, 'equipo recordado');
    if (!enviarCorreo) return iniciarSesion(c, u, volver, 'sin código: envío de correos sin configurar');
    if (!u.correo) {
      await registrar(db, { id: u.id, usuario: u.usuario, ip }, 'acceso.sin-correo', 'usuario', String(u.id), desde(c));
      return fallo('Tu cuenta no tiene un correo para enviarte el código de verificación. Pedile a un administrador que lo cargue.', 403);
    }
    setCookie(c, nombreCookie(c, 'copol_verif'), await AC.crearVerificacion(db, Number(u.id), volver), { ...opcionesCookie(c), maxAge: AC.DURACION.verificacion / 1000 });
    return c.redirect(r('/verificar'));
  });

  // ── Verificación por correo: 1) escribir el correo de la cuenta, 2) ingresar el código que llega ──
  const verificacionDe = async (c: C) => {
    const v = await AC.leerVerificacion(c.get('db'), cookieDe(c, 'copol_verif'));
    const u = v ? await U.buscarPorId(c.get('db'), Number(v.usuario_id)) : undefined;
    return v && u?.activo && u.correo && enviarCorreo ? { v, u: u as U.UsuarioPublico & { correo: string } } : null;
  };
  type Pendiente = NonNullable<Awaited<ReturnType<typeof verificacionDe>>>;
  const volverAlIngreso = (c: C, aviso: 'verificacion-vencida' | 'verificacion-fallida' = 'verificacion-vencida') => {
    deleteCookie(c, nombreCookie(c, 'copol_verif'), opcionesCookie(c));
    return c.redirect(`${r('/ingresar')}?aviso=${aviso}`);
  };
  const pantallaVerificar = (c: C, d: Pendiente, error: string | null, estado: 200 | 401 | 429 | 502 = 200) => c.html(V.vistaVerificar(ctx(c), {
    paso: d.v.correo_ok ? 'codigo' : 'correo', correo: d.v.correo_ok ? AC.ocultarCorreo(d.u.correo) : null,
    espera: AC.segundosParaReenviar(d.v), puedeReenviar: d.v.envios < AC.MAX_ENVIOS,
  }, error), estado);
  const quienVerifica = (c: C, d: Pendiente): Actor => ({ id: d.u.id, usuario: d.u.usuario, ip: c.get('ip') });
  /** Un intento fallido más; al llegar al máximo se anula la verificación y hay que volver a ingresar. */
  const fallarVerificacion = async (c: C, d: Pendiente, accion: string, error: string) => {
    const db = c.get('db');
    await AC.sumarIntento(db, d.v.id_hash);
    await registrar(db, quienVerifica(c, d), accion, 'usuario', String(d.u.id), desde(c));
    if (d.v.intentos + 1 >= AC.MAX_INTENTOS_CODIGO) {
      await AC.borrarVerificacion(db, d.v.id_hash);
      return volverAlIngreso(c, 'verificacion-fallida');
    }
    return pantallaVerificar(c, { ...d, v: { ...d.v, intentos: d.v.intentos + 1 } }, error, 401);
  };
  const enviarCodigo = async (c: C, d: Pendiente) => {
    const db = c.get('db');
    const codigo = await AC.nuevoCodigo(db, d.v);
    try {
      await enviarCorreo!({ para: d.u.correo, ...AC.correoCodigo(codigo, d.u.usuario, c.get('origen')) });
    } catch (e) {
      console.error(`[${ahora()}] envío del código a ${d.u.usuario}:`, e);
      const v = (await AC.leerVerificacion(db, cookieDe(c, 'copol_verif'))) ?? d.v;
      return pantallaVerificar(c, { ...d, v }, 'No se pudo enviar el correo. Probá de nuevo en un minuto.', 502);
    }
    await registrar(db, quienVerifica(c, d), 'acceso.codigo-enviado', 'usuario', String(d.u.id), { correo: AC.ocultarCorreo(d.u.correo), ...desde(c) });
    return c.redirect(r('/verificar'));
  };
  app.get('/verificar', async (c) => {
    const d = await verificacionDe(c);
    return d ? pantallaVerificar(c, d, null) : volverAlIngreso(c);
  });
  app.post('/verificar/correo', async (c) => {
    const d = await verificacionDe(c);
    if (!d) return volverAlIngreso(c);
    if (d.v.correo_ok) return c.redirect(r('/verificar'));
    const escrito = texto((await cuerpo(c)).correo, 160).toLowerCase();
    if (escrito !== d.u.correo.toLowerCase()) return fallarVerificacion(c, d, 'acceso.correo-incorrecto', 'Ese correo no coincide con el de tu cuenta.');
    return enviarCodigo(c, d);
  });
  app.post('/verificar/reenviar', async (c) => {
    const d = await verificacionDe(c);
    if (!d) return volverAlIngreso(c);
    if (!d.v.correo_ok) return c.redirect(r('/verificar'));
    if (d.v.envios >= AC.MAX_ENVIOS) return pantallaVerificar(c, d, 'Ya se enviaron varios códigos. Revisá también la carpeta de spam o volvé a ingresar más tarde.', 429);
    const espera = AC.segundosParaReenviar(d.v);
    if (espera > 0) return pantallaVerificar(c, d, `Esperá ${espera} segundos para pedir otro código.`, 429);
    return enviarCodigo(c, d);
  });
  app.post('/verificar/codigo', async (c) => {
    const db = c.get('db');
    const d = await verificacionDe(c);
    if (!d) return volverAlIngreso(c);
    if (!d.v.correo_ok) return c.redirect(r('/verificar'));
    const b = await cuerpo(c);
    const codigo = texto(b.codigo, 20).replace(/\D/g, '');
    if (!AC.codigoValido(d.v, codigo)) {
      const vencido = d.v.enviado_en && Date.parse(d.v.enviado_en) + AC.DURACION.codigo < Date.now();
      return fallarVerificacion(c, d, 'acceso.codigo-fallido', vencido ? 'El código venció. Pedí uno nuevo.' : 'Código incorrecto.');
    }
    await AC.borrarVerificacion(db, d.v.id_hash);
    if (b.recordar === '1') {
      // Lax: el equipo se reconoce también al abrir el panel desde un enlace o un marcador.
      setCookie(c, nombreCookie(c, 'copol_equipo'), await AC.crearPase(db, 'equipo', d.u.id, c.get('origen')), { ...opcionesCookie(c), sameSite: 'Lax', maxAge: AC.DURACION.equipo / 1000 });
      await registrar(db, quienVerifica(c, d), 'acceso.equipo-recordado', 'usuario', String(d.u.id), desde(c));
    }
    return iniciarSesion(c, d.u, rutaInterna(d.v.volver, r()), 'código por correo');
  });
  app.post('/salir', async (c) => {
    const token = getCookie(c, nombreCookie(c, 'copol_panel'));
    if (token) await U.cerrarSesion(c.get('db'), token);
    if (c.get('usuario')) await registrar(c.get('db'), actor(c), 'sesion.salida', 'usuario', String(c.get('usuario')!.id));
    deleteCookie(c, nombreCookie(c, 'copol_panel'), opcionesCookie(c));
    return c.redirect(r('/ingresar'));
  });

  // ── Perfil: cada usuario cambia su propia contraseña ──
  const perfil = async (c: C, errores: V.ErroresPerfil = {}, estado: 200 | 400 = 200) => c.html(V.vistaPerfil(ctx(c), errores, {
    conector: config.conectorClaude ? { url: `${new URL(c.req.url).origin}${r('/mcp')}`, conexiones: await O.conexionesDe(c.get('db'), c.get('usuario')!.id) } : null,
    correoActivo: Boolean(enviarCorreo),
  }), estado);
  app.get('/perfil', requiere('ver'), (c) => perfil(c));
  app.get('/perfil/clave', requiere('ver'), (c) => (c.get('usuario')!.debe_cambiar_clave ? c.html(V.vistaCambioObligatorio(ctx(c), null)) : c.redirect(r('/perfil'))));
  app.post('/perfil/clave', requiere('ver'), async (c) => {
    const db = c.get('db');
    const u = c.get('usuario')!;
    const b = await cuerpo(c);
    const actual = typeof b.actual === 'string' ? b.actual : '';
    const nueva = typeof b.nueva === 'string' ? b.nueva : '';
    const repetir = typeof b.repetir === 'string' ? b.repetir : '';
    const completo = (await U.buscarPorUsuario(db, u.usuario))!;
    const error = !(await verificarClave(actual, completo.hash))
      ? 'La contraseña actual no es correcta.'
      : nueva !== repetir ? 'Las contraseñas nuevas no coinciden.'
      : nueva === actual ? 'La contraseña nueva tiene que ser distinta de la actual.'
      : problemaClave(nueva, u.usuario);
    if (error) return u.debe_cambiar_clave ? c.html(V.vistaCambioObligatorio(ctx(c), error), 400) : perfil(c, { clave: error }, 400);
    await U.cambiarClave(db, u.id, nueva, false);
    await U.cerrarSesionesDe(db, u.id, c.get('sesion')!.id_hash);
    await registrar(db, actor(c), 'clave.cambio', 'usuario', String(u.id));
    return c.redirect(`${r('/perfil')}?aviso=clave-cambiada`);
  });

  // Correo de verificación propio (pide la contraseña actual).
  app.post('/perfil/correo', requiere('ver'), async (c) => {
    const db = c.get('db');
    const u = c.get('usuario')!;
    const b = await cuerpo(c);
    const correo = texto(b.correo, 160).toLowerCase();
    const completo = (await U.buscarPorUsuario(db, u.usuario))!;
    const error = !(await verificarClave(typeof b.clave === 'string' ? b.clave : '', completo.hash)) ? 'La contraseña no es correcta.' : !correoValido(correo) ? 'Escribí un correo válido.' : null;
    if (error) return perfil(c, { correo: error }, 400);
    await U.cambiarCorreo(db, u.id, correo);
    await registrar(db, actor(c), 'usuario.correo', 'usuario', String(u.id), { usuario: u.usuario, correo: AC.ocultarCorreo(correo) });
    return c.redirect(`${r('/perfil')}?aviso=correo-guardado`);
  });

  // ── PIN de entrada (solo administradores; se confirma con la contraseña) ──
  const guardarPin = async (c: C, modo: 'crear' | 'cambiar') => {
    const db = c.get('db');
    const u = c.get('usuario')!;
    if (modo === 'crear' && (await AC.pinConfigurado(db))) return c.redirect(r('/perfil'));
    const b = await cuerpo(c);
    const pin = texto(b.pin, 12).replace(/\s/g, '');
    const completo = (await U.buscarPorUsuario(db, u.usuario))!;
    const error = !(await verificarClave(typeof b.clave === 'string' ? b.clave : '', completo.hash)) ? 'La contraseña no es correcta.'
      : pin !== texto(b.repetir, 12).replace(/\s/g, '') ? 'Los dos PIN no coinciden.' : AC.problemaPin(pin);
    if (error) return modo === 'crear' ? c.html(V.vistaCrearPin(ctx(c), error), 400) : perfil(c, { pin: error }, 400);
    await AC.guardarPin(db, pin);
    await registrar(db, actor(c), modo === 'crear' ? 'acceso.pin-creado' : 'acceso.pin-cambio', null, null, desde(c));
    return c.redirect(`${r(modo === 'crear' ? '' : '/perfil')}?aviso=pin-guardado`);
  };
  app.get('/pin/crear', requiere('usuarios'), async (c) => ((await AC.pinConfigurado(c.get('db'))) ? c.redirect(r('/perfil')) : c.html(V.vistaCrearPin(ctx(c), null))));
  app.post('/pin/crear', requiere('usuarios'), (c) => guardarPin(c, 'crear'));
  app.post('/perfil/pin', requiere('usuarios'), (c) => guardarPin(c, 'cambiar'));

  // ── Inventario ──
  const inventario = async (c: C) => {
    const db = c.get('db');
    const f = { q: texto(c.req.query('q'), 80), categoria: texto(c.req.query('categoria'), 80), estado: texto(c.req.query('estado'), 20) };
    const estado = P.esEstado(f.estado) ? f.estado : '';
    const [datos, categorias, resumen] = await Promise.all([
      P.buscarProductos(db, { q: f.q, categoria: f.categoria, estado, pagina: Number(c.req.query('pagina')) || 1 }),
      P.listarCategorias(db),
      P.resumenStock(db),
    ]);
    return c.html(V.vistaProductos(ctx(c), datos, categorias, resumen, { ...f, estado }));
  };
  app.get('/', requiere('ver'), inventario);
  app.get('/productos', requiere('ver'), inventario);

  app.post('/productos/:id/stock', requiere('stock'), async (c) => {
    const db = c.get('db');
    const id = c.req.param('id');
    const b = await cuerpo(c);
    const quiereJson = c.req.header('accept')?.includes('application/json');
    const estado = texto(b.estado, 20);
    const cant = leerCantidad(b.cantidad);
    const version = Number(texto(b.version, 10)) || undefined;
    const volver = rutaInterna(b.volver, r('/productos')).replace(/([?&])aviso=[^&#]*&?/g, '$1').replace(/[?&]$/, '');
    if (cant.error || (cant.valor == null && !P.esEstado(estado))) {
      const msg = cant.error ?? 'Elegí con stock o sin stock.';
      return quiereJson ? c.json({ ok: false, error: msg }, 400) : c.html(V.vistaError(ctx(c), 400, 'Dato inválido', msg), 400);
    }
    const res = await P.cambiarStock(db, id, P.esEstado(estado) ? estado : 'sin-dato', cant.valor, c.get('usuario')!.usuario, version);
    if ('error' in res) {
      if (res.error === 'no-existe') return quiereJson ? c.json({ ok: false, error: 'El producto no existe.' }, 404) : c.notFound();
      if (res.error === 'no-persistido') return quiereJson ? c.json({ ok: false, error: AVISOS['no-persistido']!.texto }, 500) : c.redirect(`${volver}${volver.includes('?') ? '&' : '?'}aviso=no-persistido`);
      const actual = res.actual;
      return quiereJson ? c.json({ ok: false, error: AVISOS.conflicto!.texto, version: actual.version, estado: actual.stock_estado, cantidad: actual.stock_cantidad }, 409) : c.redirect(`${r(`/productos/${encodeURIComponent(id)}`)}?aviso=conflicto`);
    }
    const cambios = P.diferencias(res.antes, res.despues);
    if (Object.keys(cambios).length) await registrar(db, actor(c), 'stock.cambio', 'producto', id, { nombre: res.despues.nombre, codigo: res.despues.codigo, cambios });
    // Respuesta con el valor RELEÍDO de la base: la confirmación solo se muestra si se persistió.
    if (quiereJson) return c.json({ ok: true, verificado: true, estado: res.despues.stock_estado, cantidad: res.despues.stock_cantidad, version: res.despues.version, etiqueta: P.ESTADOS[res.despues.stock_estado] });
    return c.redirect(`${volver}${volver.includes('?') ? '&' : '?'}aviso=stock-guardado#p-${encodeURIComponent(id)}`);
  });

  const imagenProducto = async (c: C, b: Campos, nombre: string): Promise<{ url: string | null; error?: string }> => {
    const archivo = b.imagen instanceof File && b.imagen.size > 0 ? b.imagen : null;
    if (!archivo) return { url: null };
    try {
      return { url: await procesarImagen(archivo, { maxMB: config.maxImagenMB, tipo: 'producto', carpeta: 'productos', nombre, almacen: guardarEn }) };
    } catch (e) {
      if (!(e instanceof ErrorImagen)) throw e;
      return { url: null, error: e.message };
    }
  };

  app.get('/productos/:id', requiere('ver'), async (c) => {
    const db = c.get('db');
    const p = await P.obtenerProducto(db, c.req.param('id'));
    if (!p) return c.notFound();
    return c.html(V.vistaFormProducto(ctx(c), 'editar', p, await P.listarCategorias(db), {}, await listarEventos(db, { entidadId: p.id, limite: 8 })));
  });

  app.post('/productos/:id', requiere('stock'), async (c) => {
    const db = c.get('db');
    const id = c.req.param('id');
    const actual = await P.obtenerProducto(db, id);
    if (!actual) return c.notFound();
    const b = await cuerpo(c);
    const soloStock = !puede(c.get('usuario')!.rol, 'productos');
    // Quien solo puede cambiar stock no puede alterar los demás campos aunque los envíe.
    const entrada = soloStock ? { ...b, codigo: actual.codigo ?? '', nombre: actual.nombre, marca: actual.marca ?? '', descripcion: actual.descripcion ?? '', categoria: actual.categoria_id, imagen: '' } : b;
    const { datos, errores } = await validarProducto(entrada, (cat) => P.existeCategoria(db, cat));
    if (datos.codigo) {
      const otro = await P.productoPorCodigo(db, datos.codigo);
      if (otro && otro.id !== id) errores.codigo = 'Ya existe otro producto con ese código interno COPOL.';
    }
    let imagen: string | null = null;
    if (!Object.keys(errores).length && !soloStock) {
      const img = await imagenProducto(c, b, id);
      if (img.error) errores.imagen = img.error;
      imagen = img.url;
    }
    if (Object.keys(errores).length) return c.html(V.vistaFormProducto(ctx(c), 'editar', { ...actual, ...datos }, await P.listarCategorias(db), errores), 400);
    const res = await P.editarProducto(db, id, datos, imagen, c.get('usuario')!.usuario, Number(texto(b.version, 10)) || undefined);
    if ('error' in res) return res.error === 'no-existe' ? c.notFound() : c.redirect(`${r(`/productos/${encodeURIComponent(id)}`)}?aviso=${res.error === 'conflicto' ? 'conflicto' : 'no-persistido'}`);
    const cambios = P.diferencias(res.antes, res.despues);
    if (Object.keys(cambios).length) {
      const accion = cambios.imagen ? 'producto.imagen' : cambios.stock_estado || cambios.stock_cantidad ? 'stock.cambio' : 'producto.edicion';
      await registrar(db, actor(c), accion, 'producto', id, { nombre: res.despues.nombre, codigo: res.despues.codigo, cambios });
    }
    return c.redirect(`${r(`/productos/${encodeURIComponent(id)}`)}?aviso=producto-guardado`);
  });

  app.get('/nuevo', requiere('productos'), async (c) =>
    c.html(V.vistaFormProducto(ctx(c), 'nuevo', { stock_estado: 'con-stock', categoria_id: texto(c.req.query('categoria'), 80) }, await P.listarCategorias(c.get('db')), {})),
  );
  app.post('/nuevo', requiere('productos'), async (c) => {
    const db = c.get('db');
    const b = await cuerpo(c);
    const { datos, errores } = await validarProducto(b, (cat) => P.existeCategoria(db, cat));
    if (datos.codigo && (await P.productoPorCodigo(db, datos.codigo))) errores.codigo = 'Ya existe un producto con ese código interno COPOL.';
    let id = slug(`${datos.nombre}-${datos.codigo ?? tokenAleatorio(4)}`) || tokenAleatorio(8);
    for (let n = 2; await P.obtenerProducto(db, id); n++) id = `${id.replace(/-\d+$/, '')}-${n}`;
    let imagen: string | null = null;
    if (!Object.keys(errores).length) {
      const img = await imagenProducto(c, b, id);
      if (img.error) errores.imagen = img.error;
      imagen = img.url;
    }
    if (Object.keys(errores).length) return c.html(V.vistaFormProducto(ctx(c), 'nuevo', { ...datos }, await P.listarCategorias(db), errores), 400);
    const p = await P.crearProducto(db, id, datos, imagen, c.get('usuario')!.usuario);
    await registrar(db, actor(c), 'producto.alta', 'producto', id, { nombre: p.nombre, codigo: p.codigo, categoria: p.categoria_id, estado: p.stock_estado, cantidad: p.stock_cantidad });
    return c.redirect(`${r(`/productos/${encodeURIComponent(id)}`)}?aviso=producto-creado`);
  });

  // ── Novedades ──
  const imgNovedad = (n: Pick<N.Novedad, 'imagen'>) => (n.imagen ? (n.imagen.startsWith('/') && !n.imagen.startsWith(BASE) ? n.imagen : variante(n.imagen, 800)) : null);
  app.get('/novedades', requiere('novedades'), async (c) => c.html(V.vistaNovedades(ctx(c), await N.listarNovedades(c.get('db')), imgNovedad)));
  app.get('/novedades/nueva', requiere('novedades'), (c) => c.html(V.vistaFormNovedad(ctx(c), { plantilla: 'imagen-izquierda' }, {}, null)));

  const guardarNovedad = async (c: C, existente: N.Novedad | null) => {
    const db = c.get('db');
    const b = await cuerpo(c);
    const archivo = b.imagen instanceof File && b.imagen.size > 0 ? b.imagen : null;
    const { datos, errores } = validarNovedad(b, Boolean(archivo || existente?.imagen));
    let imagen: string | undefined;
    if (!Object.keys(errores).length && archivo) {
      try {
        imagen = await procesarImagen(archivo, { maxMB: config.maxImagenMB, tipo: 'novedad', carpeta: 'novedades', nombre: slug(datos.titulo).slice(0, 40) || 'novedad', almacen: guardarEn });
      } catch (e) {
        if (!(e instanceof ErrorImagen)) throw e;
        errores.imagen = e.message;
      }
    }
    if (Object.keys(errores).length) {
      return c.html(V.vistaFormNovedad(ctx(c), { ...existente, ...datos, publicado: datos.publicado ? 1 : 0 }, errores, existente ? imgNovedad(existente) : null), 400);
    }
    const n = existente ? await N.editarNovedad(db, existente.id, datos, imagen, c.get('usuario')!.usuario) : await N.crearNovedad(db, datos, imagen ?? null, c.get('usuario')!.usuario);
    await registrar(db, actor(c), existente ? 'novedad.edicion' : 'novedad.alta', 'novedad', String(n!.id), { titulo: n!.titulo, publicado: n!.publicado, plantilla: n!.plantilla });
    return c.redirect(`${r('/novedades')}?aviso=novedad-guardada`);
  };
  app.post('/novedades/nueva', requiere('novedades'), (c) => guardarNovedad(c, null));
  const novedadDe = (c: C) => N.obtenerNovedad(c.get('db'), Number(c.req.param('id')) || 0);
  app.get('/novedades/:id', requiere('novedades'), async (c) => {
    const n = await novedadDe(c);
    return n ? c.html(V.vistaFormNovedad(ctx(c), n, {}, imgNovedad(n))) : c.notFound();
  });
  app.post('/novedades/:id', requiere('novedades'), async (c) => {
    const n = await novedadDe(c);
    return n ? guardarNovedad(c, n) : c.notFound();
  });
  app.post('/novedades/:id/publicar', requiere('novedades'), async (c) => {
    const n = await novedadDe(c);
    if (!n) return c.notFound();
    const publicado = (await cuerpo(c)).publicado === '1';
    if (publicado && N.PLANTILLAS[n.plantilla].requiereImagen && !n.imagen) return c.html(V.vistaError(ctx(c), 400, 'Falta la imagen', 'Esta novedad usa una plantilla con imagen: subí una antes de publicarla.'), 400);
    const act = await N.publicar(c.get('db'), n.id, publicado, c.get('usuario')!.usuario);
    await registrar(c.get('db'), actor(c), publicado ? 'novedad.publicacion' : 'novedad.despublicacion', 'novedad', String(n.id), { titulo: n.titulo });
    return c.redirect(`${r('/novedades')}?aviso=${act?.publicado ? 'novedad-publicada' : 'novedad-despublicada'}`);
  });
  app.post('/novedades/:id/mover', requiere('novedades'), async (c) => {
    const n = await novedadDe(c);
    if (!n) return c.notFound();
    const dir = (await cuerpo(c)).direccion === 'arriba' ? 'arriba' : 'abajo';
    if (await N.mover(c.get('db'), n.id, dir)) await registrar(c.get('db'), actor(c), 'novedad.orden', 'novedad', String(n.id), { titulo: n.titulo, direccion: dir });
    return c.redirect(r('/novedades'));
  });
  app.post('/novedades/:id/eliminar', requiere('novedades'), async (c) => {
    const n = await novedadDe(c);
    if (!n) return c.notFound();
    await N.eliminarNovedad(c.get('db'), n.id);
    await registrar(c.get('db'), actor(c), 'novedad.baja', 'novedad', String(n.id), { titulo: n.titulo });
    return c.redirect(`${r('/novedades')}?aviso=novedad-eliminada`);
  });

  // ── Usuarios (solo administradores) ──
  app.get('/usuarios', requiere('usuarios'), async (c) => c.html(V.vistaUsuarios(ctx(c), await U.listarUsuarios(c.get('db')))));
  app.post('/usuarios', requiere('usuarios'), async (c) => {
    const db = c.get('db');
    const b = await cuerpo(c);
    const v = validarUsuarioNuevo(b, Boolean(enviarCorreo));
    const clave = typeof b.clave === 'string' ? b.clave : '';
    const errClave = problemaClave(clave, v.usuario.split('@')[0] || 'x');
    if (errClave) v.errores.clave = errClave;
    if (!v.errores.usuario && (await U.buscarPorUsuario(db, v.usuario))) v.errores.usuario = 'Ese usuario ya existe.';
    if (Object.keys(v.errores).length) return c.html(V.vistaUsuarios(ctx(c), await U.listarUsuarios(db), v.errores, { usuario: v.usuario, rol: v.rol, correo: v.correo ?? '' }), 400);
    const id = await U.crearUsuario(db, { usuario: v.usuario, rol: v.rol, clave, debeCambiar: true, creadoPor: c.get('usuario')!.usuario, correo: v.correo });
    await registrar(db, actor(c), 'usuario.alta', 'usuario', String(id), { usuario: v.usuario, rol: v.rol, correo: v.correo ? AC.ocultarCorreo(v.correo) : null });
    return c.redirect(`${r('/usuarios')}?aviso=usuario-creado`);
  });
  const objetivo = async (c: C) => {
    const u = await U.buscarPorId(c.get('db'), Number(c.req.param('id')) || 0);
    if (!u) return { ok: false as const, res: c.notFound() };
    // El administrador principal y la propia cuenta no se gestionan desde aquí (la propia, desde el perfil).
    if (u.protegido || u.id === c.get('usuario')!.id) return { ok: false as const, res: c.html(V.vistaError(ctx(c), 403, 'No permitido', u.protegido ? 'El administrador principal no puede ser modificado por otros usuarios.' : 'Tu propia cuenta se gestiona desde tu perfil.'), 403) };
    return { ok: true as const, u };
  };
  app.get('/usuarios/:id', requiere('usuarios'), async (c) => {
    const o = await objetivo(c);
    return o.ok ? c.html(V.vistaEditarUsuario(ctx(c), o.u)) : o.res;
  });
  app.post('/usuarios/:id', requiere('usuarios'), async (c) => {
    const db = c.get('db');
    const o = await objetivo(c);
    if (!o.ok) return o.res;
    const u = o.u;
    const b = await cuerpo(c);
    const rol = texto(b.rol, 20);
    const activo = b.activo === '1' ? 1 : 0;
    const correo = texto(b.correo, 160).toLowerCase() || null;
    const errores: Record<string, string> = {};
    if (!['administrador', 'editor', 'visualizador'].includes(rol)) errores.rol = 'Rol inválido.';
    if (correo ? !correoValido(correo) : enviarCorreo) errores.correo = 'Escribí un correo válido: ahí le llega el código para ingresar.';
    if (u.rol === 'administrador' && (rol !== 'administrador' || !activo) && (await U.contarAdminsActivos(db)) <= 1) errores.rol = 'Tiene que quedar al menos un administrador activo.';
    if (Object.keys(errores).length) return c.html(V.vistaEditarUsuario(ctx(c), u, errores), 400);
    await ejecutar(db, 'UPDATE usuarios SET rol = ?, activo = ?, correo = ? WHERE id = ?', [rol, activo, correo, u.id]);
    if (!activo || rol !== u.rol) await U.cerrarSesionesDe(db, u.id);
    // Otro correo u otra situación de la cuenta: los equipos recordados vuelven a verificarse.
    if (!activo || correo !== u.correo) await AC.borrarPasesDe(db, u.id);
    await registrar(db, actor(c), 'usuario.edicion', 'usuario', String(u.id), { usuario: u.usuario, cambios: { rol: [u.rol, rol], activo: [u.activo, activo], ...(correo !== u.correo ? { correo: [u.correo ? AC.ocultarCorreo(u.correo) : null, correo ? AC.ocultarCorreo(correo) : null] } : {}) } });
    return c.redirect(`${r('/usuarios')}?aviso=usuario-guardado`);
  });
  app.post('/usuarios/:id/clave', requiere('usuarios'), async (c) => {
    const db = c.get('db');
    const o = await objetivo(c);
    if (!o.ok) return o.res;
    const b = await cuerpo(c);
    const clave = typeof b.clave === 'string' ? b.clave : '';
    const err = problemaClave(clave, o.u.usuario.split('@')[0]);
    if (err) return c.html(V.vistaEditarUsuario(ctx(c), o.u, { clave: err }), 400);
    await U.cambiarClave(db, o.u.id, clave, true);
    await U.cerrarSesionesDe(db, o.u.id);
    await AC.borrarPasesDe(db, o.u.id);
    await registrar(db, actor(c), 'usuario.clave', 'usuario', String(o.u.id), { usuario: o.u.usuario });
    return c.redirect(`${r('/usuarios')}?aviso=clave-restablecida`);
  });
  app.post('/usuarios/:id/eliminar', requiere('usuarios'), async (c) => {
    const db = c.get('db');
    const o = await objetivo(c);
    if (!o.ok) return o.res;
    if (o.u.rol === 'administrador' && o.u.activo && (await U.contarAdminsActivos(db)) <= 1) return c.html(V.vistaError(ctx(c), 400, 'No permitido', 'Tiene que quedar al menos un administrador activo.'), 400);
    await db.batch(['sesiones', 'pases', 'verificaciones', 'propuestas'].map((t) => ({ sql: `DELETE FROM ${t} WHERE usuario_id = ?`, args: [o.u.id] })), 'write');
    await ejecutar(db, 'DELETE FROM usuarios WHERE id = ?', [o.u.id]);
    await registrar(db, actor(c), 'usuario.baja', 'usuario', String(o.u.id), { usuario: o.u.usuario, rol: o.u.rol });
    return c.redirect(`${r('/usuarios')}?aviso=usuario-eliminado`);
  });

  // ── Asistente (solo administradores; solo lectura) ──
  const tokenIA = (c: C) => (asistente && 'token' in asistente ? asistente.token ?? null : A.tokenGateway(c.req.header('x-vercel-oidc-token')));
  const consultasHoy = async (c: C) => {
    // Uruguay: UTC−3 todo el año.
    const inicio = new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' })}T00:00:00-03:00`).toISOString();
    const f = await una<{ n: number }>(c.get('db'), "SELECT COUNT(*) n FROM auditoria WHERE usuario_id = ? AND accion = 'asistente.consulta' AND fecha >= ?", [c.get('usuario')!.id, inicio]);
    return Number(f?.n ?? 0);
  };
  const datosAsistente = async (c: C, extra: Partial<V.DatosAsistente> = {}): Promise<V.DatosAsistente> => ({
    disponible: Boolean(tokenIA(c)),
    puedeCambiar: puede(c.get('usuario')!.rol, 'stock'),
    restantes: Math.max(0, config.asistenteLimiteDia - (await consultasHoy(c))),
    modelos: (Object.keys(A.MODELOS) as A.Modelo[]).map((m) => ({ valor: m, nombre: A.MODELOS[m].nombre })),
    modelo: 'rapido',
    conversacion: [],
    ...extra,
  });
  app.get('/asistente', requiere('asistente'), async (c) => c.html(V.vistaAsistente(ctx(c), await datosAsistente(c))));
  app.post('/asistente', requiere('asistente'), async (c) => {
    const b = await cuerpo(c);
    const quiereJson = c.req.header('accept')?.includes('application/json');
    const modelo: A.Modelo = A.esModelo(b.modelo) ? b.modelo : 'rapido';
    let previo: unknown = [];
    try { previo = typeof b.historial === 'string' ? JSON.parse(b.historial.slice(0, 60_000)) : []; } catch { /* historial inválido: se ignora */ }
    const pregunta = texto(b.pregunta, 1000);
    const historial = pregunta ? A.limpiarHistorial([...(Array.isArray(previo) ? previo : []), { rol: 'usuario', texto: pregunta }]) : [];
    const fallar = async (estado: 400 | 429 | 502 | 503, error: string) =>
      quiereJson ? c.json({ ok: false, error }, estado) : c.html(V.vistaAsistente(ctx(c), await datosAsistente(c, { modelo, error, conversacion: historial.slice(0, -1) })), estado);
    if (!historial.length) return fallar(400, 'Escribí una pregunta.');
    const token = tokenIA(c);
    if (!token) return fallar(503, 'El asistente no está configurado en este entorno: funciona en la web publicada en Vercel.');
    if ((await consultasHoy(c)) >= config.asistenteLimiteDia) return fallar(429, `Llegaste al límite de ${config.asistenteLimiteDia} consultas por día. Mañana podés seguir.`);
    let res: A.Resultado;
    try {
      res = await A.consultar({ historial, modelo, db: c.get('db'), origen: new URL(c.req.url).origin, token, usuarioId: c.get('usuario')!.id, rol: c.get('usuario')!.rol, fetch: asistente?.fetch });
    } catch (e) {
      if (e instanceof A.ErrorAsistente) return fallar(502, e.message);
      if ((e as Error).name === 'TimeoutError') return fallar(502, 'El asistente tardó demasiado en responder. Probá con una pregunta más concreta.');
      throw e;
    }
    await registrar(c.get('db'), actor(c), 'asistente.consulta', 'asistente', null, { modelo: A.MODELOS[modelo].id, pregunta: historial.at(-1)!.texto.slice(0, 300), herramientas: res.herramientas, tokens: res.tokens, propuesta: res.propuesta?.items.length ?? 0 });
    const restantes = Math.max(0, config.asistenteLimiteDia - (await consultasHoy(c)));
    const propuesta = propuestaVisible(res.propuesta);
    if (quiereJson) return c.json({ ok: true, respuesta: res.texto, restantes, propuesta });
    return c.html(V.vistaAsistente(ctx(c), await datosAsistente(c, { modelo, propuesta, conversacion: [...historial, { rol: 'asistente', texto: res.texto }] })));
  });

  // Cambios propuestos por el asistente: se aplican solo cuando el administrador los confirma.
  const propuestaVisible = (p: PR.Propuesta | null): V.PropuestaVisible | null =>
    p?.items.length ? { id: p.id, expira: p.expira, errores: p.errores, items: p.items.map((i) => ({ codigo: i.codigo, nombre: i.nombre, cambios: i.cambios })) } : null;
  const MOTIVOS: Record<'no-existe' | 'vencida' | 'usada' | 'sin-permiso', [404 | 409 | 403, string]> = {
    'no-existe': [404, 'La propuesta no existe.'],
    vencida: [409, 'La propuesta venció (duran 15 minutos). Pedile los cambios de nuevo al asistente.'],
    usada: [409, 'Esta propuesta ya se aplicó o se canceló.'],
    'sin-permiso': [403, 'Tu rol solo permite cambiar el stock.'],
  };
  app.post('/asistente/propuestas/:id', requiere('asistente'), async (c) => {
    const db = c.get('db');
    const u = c.get('usuario')!;
    const b = await cuerpo(c);
    const quiereJson = c.req.header('accept')?.includes('application/json');
    const id = texto(c.req.param('id'), 40);
    const responder = async (estado: 200 | 403 | 404 | 409, ok: boolean, mensaje: string, extra: Record<string, unknown> = {}) =>
      quiereJson ? c.json({ ok, mensaje, ...extra }, estado)
        : c.html(V.vistaAsistente(ctx(c), await datosAsistente(c, ok ? { conversacion: [{ rol: 'asistente', texto: mensaje }] } : { error: mensaje })), estado);
    if (b.accion === 'cancelar') {
      await PR.cancelar(db, id, u.id);
      return responder(200, true, 'Cambios cancelados: no se modificó nada.');
    }
    if (!puede(u.rol, 'stock')) return responder(403, false, MOTIVOS['sin-permiso'][1]);
    const r = await PR.aplicar(db, id, { ...actor(c), id: u.id, usuario: u.usuario }, puede(u.rol, 'productos'));
    if (r.estado !== 'ok') return responder(MOTIVOS[r.estado][0], false, MOTIVOS[r.estado][1]);
    const bien = r.resultados.filter((x) => x.ok);
    const mal = r.resultados.filter((x) => !x.ok);
    const mensaje = [
      `${bien.length} de ${r.resultados.length} ${r.resultados.length === 1 ? 'cambio aplicado' : 'cambios aplicados'} y verificados. La web pública ya los muestra.`,
      ...mal.map((x) => `- No se aplicó ${x.nombre} (${x.codigo ?? 'sin código'}): ${x.error}`),
    ].join('\n');
    return responder(200, true, mensaje, { resultados: r.resultados });
  });

  // ── Conector para Claude (MCP + OAuth 2.1). Ver panel/src/oauth.ts y panel/src/mcp.ts ──
  // Solo con PANEL_CONECTOR_CLAUDE=1: sus metadatos públicos (/.well-known/…) anuncian la dirección del panel.
  if (config.conectorClaude) {
  const origenDe = (c: C) => new URL(c.req.url).origin;
  const recursoMcp = (c: C) => `${origenDe(c)}${r('/mcp')}`;
  const limiteRegistro = new Limitador(20, 60 * 60_000);
  const limiteToken = new Limitador(60, 15 * 60_000);
  const limiteMcp = new Limitador(240, 60_000);
  const jsonOauth = (c: C, cuerpo: unknown, estado: 200 | 201 | 400 | 401 | 429 = 200) => {
    c.header('Cache-Control', 'no-store');
    c.header('Pragma', 'no-cache');
    return c.json(cuerpo, estado);
  };
  const leerFormulario = async (c: C): Promise<Record<string, unknown>> => {
    const tipo = c.req.header('content-type') ?? '';
    if (tipo.includes('application/json')) return (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(new URLSearchParams(await c.req.text()));
  };

  app.post('/oauth/registro', async (c) => {
    const ip = c.get('ip') ?? 'desconocida';
    if (limiteRegistro.excedido(ip)) return jsonOauth(c, { error: 'slow_down', error_description: 'Demasiados registros desde esta conexión.' }, 429);
    limiteRegistro.registrar(ip);
    const r = await O.registrarCliente(c.get('db'), await c.req.json().catch(() => null));
    return r.ok ? jsonOauth(c, r.cliente, 201) : jsonOauth(c, { error: r.error, error_description: r.descripcion }, 400);
  });

  // 1) Claude abre esta dirección: se valida el pedido y se guarda (10 min) para pedir el ingreso y el permiso.
  app.get('/oauth/autorizar', async (c) => {
    const q = c.req.query();
    const cliente = q.client_id ? await O.obtenerCliente(c.get('db'), q.client_id) : undefined;
    // Sin cliente o redirect_uri válidos no se redirige a ningún lado (evita redirecciones abiertas).
    if (!cliente || !q.redirect_uri || !O.urisDe(cliente).includes(q.redirect_uri)) {
      return c.html(V.vistaError(ctx(c), 400, 'Pedido de conexión inválido', 'La aplicación que intenta conectarse no está registrada o su dirección de regreso no coincide. Volvé a intentar la conexión desde Claude.'), 400);
    }
    const fallar = (error: string, descripcion: string) => c.redirect(O.volverA(q.redirect_uri!, { error, error_description: descripcion, state: q.state, iss: origenDe(c) }));
    if (q.response_type !== 'code') return fallar('unsupported_response_type', 'Solo response_type=code.');
    if (q.code_challenge_method !== 'S256' || !O.desafioValido(q.code_challenge)) return fallar('invalid_request', 'PKCE S256 obligatorio.');
    if (q.resource && q.resource !== recursoMcp(c)) return fallar('invalid_target', 'Recurso desconocido.');
    if (q.scope && !q.scope.split(' ').every((s) => s === O.ALCANCE)) return fallar('invalid_scope', `El único alcance es "${O.ALCANCE}".`);
    const id = await O.crearPedido(c.get('db'), {
      cliente_id: cliente.id, redirect_uri: q.redirect_uri, estado_cliente: q.state?.slice(0, 500) ?? null, desafio: q.code_challenge!,
      alcance: O.ALCANCE, recurso: q.resource || recursoMcp(c),
    });
    return c.redirect(r(`/oauth/autorizar/${id}`));
  });

  // 2) Pantalla de permiso: requiere haber ingresado al panel (si no, pasa por el ingreso y vuelve).
  const pedidoDe = async (c: C) => {
    const id = c.req.param('id') ?? '';
    return /^[A-Za-z0-9_-]{20,40}$/.test(id) ? O.leerPedido(c.get('db'), id) : null;
  };
  app.get('/oauth/autorizar/:id', requiere('ver'), async (c) => {
    const pedido = await pedidoDe(c);
    if (!pedido) return c.html(V.vistaError(ctx(c), 404, 'Pedido vencido', 'El pedido de conexión venció o ya se usó. Volvé a conectar desde Claude.'), 404);
    const cliente = await O.obtenerCliente(c.get('db'), pedido.cliente_id);
    return c.html(V.vistaAutorizarClaude(ctx(c), { id: pedido.id, cliente: cliente?.nombre ?? 'Claude', destino: new URL(pedido.redirect_uri).host, puedeCambiar: puede(c.get('usuario')!.rol, 'stock') }));
  });
  app.post('/oauth/autorizar/:id', requiere('ver'), async (c) => {
    const db = c.get('db');
    const pedido = await pedidoDe(c);
    if (!pedido) return c.html(V.vistaError(ctx(c), 404, 'Pedido vencido', 'El pedido de conexión venció o ya se usó. Volvé a conectar desde Claude.'), 404);
    const b = await cuerpo(c);
    if (b.accion !== 'permitir') {
      await O.borrarPedido(db, pedido.id);
      return c.redirect(O.volverA(pedido.redirect_uri, { error: 'access_denied', error_description: 'La persona no autorizó la conexión.', state: pedido.estado_cliente, iss: origenDe(c) }));
    }
    const codigo = await O.emitirCodigo(db, pedido, c.get('usuario')!.id);
    const cliente = await O.obtenerCliente(db, pedido.cliente_id);
    await registrar(db, actor(c), 'claude.conexion', 'usuario', String(c.get('usuario')!.id), { cliente: cliente?.nombre ?? pedido.cliente_id, destino: new URL(pedido.redirect_uri).host });
    return c.redirect(O.volverA(pedido.redirect_uri, { code: codigo, state: pedido.estado_cliente, iss: origenDe(c) }));
  });

  // 3) Claude canjea el código (o renueva) por tokens.
  app.post('/oauth/token', async (c) => {
    const ip = c.get('ip') ?? 'desconocida';
    if (limiteToken.excedido(ip)) return jsonOauth(c, { error: 'slow_down', error_description: 'Demasiados pedidos desde esta conexión.' }, 429);
    limiteToken.registrar(ip);
    const p = await leerFormulario(c);
    const r = p.grant_type === 'authorization_code' ? await O.canjearCodigo(c.get('db'), p)
      : p.grant_type === 'refresh_token' ? await O.renovarToken(c.get('db'), p)
      : { error: 'unsupported_grant_type' as const, error_description: 'Solo authorization_code y refresh_token.' };
    return 'error' in r ? jsonOauth(c, r, 400) : jsonOauth(c, r);
  });

  // 4) Endpoint MCP (Streamable HTTP, respuestas JSON). Sin token válido: 401 con la dirección de los metadatos.
  const ORIGENES_MCP = /^(https:\/\/(claude\.ai|claude\.com)|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
  app.post('/mcp', async (c) => {
    const origen = c.req.header('origin');
    if (origen && !ORIGENES_MCP.test(origen)) return c.json({ error: 'Origen no permitido' }, 403);
    const sinPermiso = () => {
      c.header('WWW-Authenticate', `Bearer resource_metadata="${origenDe(c)}/.well-known/oauth-protected-resource${r('/mcp')}", scope="${O.ALCANCE}"`);
      return c.json({ error: 'invalid_token', error_description: 'Falta un token de acceso válido.' }, 401);
    };
    const token = c.req.header('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) return sinPermiso();
    const db = c.get('db');
    const acceso = await O.validarAcceso(db, token, recursoMcp(c));
    const usuario = acceso ? await U.buscarPorId(db, acceso.usuarioId) : undefined;
    // El usuario tiene que seguir activo; el rol se lee en cada pedido (un cambio de rol aplica al instante).
    if (!acceso || !usuario || !usuario.activo) return sinPermiso();
    if (limiteMcp.excedido(`u${usuario.id}`)) return c.json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Demasiados pedidos: esperá un minuto.' } }, 429);
    limiteMcp.registrar(`u${usuario.id}`);
    const cuerpoMcp = await c.req.json().catch(() => undefined);
    if (cuerpoMcp === undefined) return c.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido.' } }, 400);
    const respuesta = await atenderMcp(cuerpoMcp, { db, usuario, actor: { id: usuario.id, usuario: usuario.usuario, ip: c.get('ip') } });
    return respuesta === null ? c.body(null, 202) : c.json(respuesta);
  });
  app.on(['GET', 'DELETE'], '/mcp', (c) => {
    c.header('Allow', 'POST');
    return c.body(null, 405);
  });

  // Desconectar a Claude desde "Mi perfil": borra sus tokens (deja de poder usar el panel al instante).
  app.post('/perfil/claude/:cliente/desconectar', requiere('ver'), async (c) => {
    const u = c.get('usuario')!;
    const cliente = c.req.param('cliente');
    await O.desconectar(c.get('db'), u.id, cliente);
    await registrar(c.get('db'), actor(c), 'claude.desconexion', 'usuario', String(u.id), { cliente });
    return c.redirect(`${r('/perfil')}?aviso=claude-desconectado`);
  });
  }

  // ── Accesos (solo administradores): quién ingresa, con qué usuario, desde qué IP y equipo ──
  app.get('/accesos', requiere('auditoria'), async (c) => {
    const db = c.get('db');
    const pagina = Math.max(1, Number(c.req.query('pagina')) || 1);
    const usuario = texto(c.req.query('usuario'), 120);
    const [sesiones, equipos, eventos, usuarios] = await Promise.all([
      AC.sesionesAbiertas(db, config.sesionInactividadMin), AC.equiposRecordados(db),
      listarAccesos(db, { usuario: usuario || undefined, limite: 51, desde: (pagina - 1) * 50 }), U.listarUsuarios(db),
    ]);
    return c.html(V.vistaAccesos(ctx(c), { sesiones, equipos, eventos: eventos.slice(0, 50), hayMas: eventos.length > 50, pagina, usuario, usuarios: usuarios.map((x) => x.usuario), sesionActual: c.get('sesion')!.id_hash }));
  });
  app.post('/accesos/sesiones/:id/cerrar', requiere('auditoria'), async (c) => {
    const db = c.get('db');
    const id = c.req.param('id');
    if (!/^[a-f0-9]{64}$/.test(id) || id === c.get('sesion')!.id_hash) return c.redirect(r('/accesos'));
    const s = await una<{ usuario_id: number; usuario: string }>(db, 'SELECT s.usuario_id, u.usuario FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.id_hash = ?', [id]);
    if (s) {
      await ejecutar(db, 'DELETE FROM sesiones WHERE id_hash = ?', [id]);
      await registrar(db, actor(c), 'acceso.sesion-cerrada', 'usuario', String(s.usuario_id), { usuario: s.usuario });
    }
    return c.redirect(`${r('/accesos')}?aviso=sesion-cerrada`);
  });
  app.post('/accesos/equipos/:id/olvidar', requiere('auditoria'), async (c) => {
    const db = c.get('db');
    const id = c.req.param('id');
    if (!/^[a-f0-9]{64}$/.test(id)) return c.redirect(r('/accesos'));
    const p = await una<{ usuario_id: number; usuario: string }>(db, "SELECT p.usuario_id, u.usuario FROM pases p JOIN usuarios u ON u.id = p.usuario_id WHERE p.token_hash = ? AND p.tipo = 'equipo'", [id]);
    if (p) {
      await AC.borrarPase(db, id);
      await registrar(db, actor(c), 'acceso.equipo-olvidado', 'usuario', String(p.usuario_id), { usuario: p.usuario });
    }
    return c.redirect(`${r('/accesos')}?aviso=equipo-olvidado`);
  });

  // ── Registro de cambios ──
  app.get('/registro', requiere('auditoria'), async (c) => {
    const pagina = Math.max(1, Number(c.req.query('pagina')) || 1);
    const eventos = await listarEventos(c.get('db'), { limite: 101, desde: (pagina - 1) * 100 });
    return c.html(V.vistaRegistro(ctx(c), eventos.slice(0, 100), pagina, eventos.length > 100));
  });

  return app;
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 90);
