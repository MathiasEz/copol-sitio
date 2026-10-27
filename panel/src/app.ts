// Panel de Administración de COPOL (Stock Bazar, Registros y Administración): rutas, autenticación, autorización, productos, novedades, registros y usuarios.
// Se monta en BASE (config.ts) del sitio (src/pages/<BASE>/[...ruta].ts) y funciona igual en desarrollo y en Vercel.
import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import * as AC from './acceso.ts';
import * as CV from './conversaciones.ts';
import * as A from './asistente.ts';
import { atenderMcp } from './mcp.ts';
import * as O from './oauth.ts';
import { listarAccesos, listarEventos, registrar, type Actor } from './auditoria.ts';
import { BASE, type Config } from './config.ts';
import { ahora, ejecutar, una, type Db } from './db.ts';
import { almacenConfigurado, ErrorImagen, procesarImagen, variante, type Almacen } from './imagenes.ts';
import * as N from './novedades.ts';
import * as B from './banner.ts';
import * as OF from './ofertas.ts';
import * as CR from './creditos.ts';
import * as CA from './campana.ts';
import * as NT from './notificaciones.ts';
import * as EN from './envio-notificaciones.ts';
import * as ES from './estadisticas.ts';
import { fechaValida, hoyUruguay } from './fechas.ts';
import * as E from './empleados.ts';
import * as RG from './registros.ts';
import * as RA from './registros-asistente.ts';
import { validarRegistro } from './registros-campos.ts';
import * as P from './productos.ts';
import * as PR from './propuestas.ts';
import { esAdministrador, hashFicticio, Limitador, problemaClave, puede, tokenAleatorio, verificarClave, type Permiso } from './seguridad.ts';
import { colorValido } from './colores.ts';
import * as U from './usuarios.ts';
import { correoValido, leerCantidad, leerRolesForm, rutaInterna, texto, validarDiapositiva, validarNovedad, validarProducto, validarUsuarioNuevo, type Campos } from './validacion.ts';
import * as V from './vistas.ts';

type Vars = { usuario: U.UsuarioPublico | null; sesion: U.Sesion | null; csrf: string; ip: string | null; origen: AC.Origen; db: Db; mantener?: boolean };
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
  'banner-guardado': { tipo: 'ok', texto: 'Diapositiva guardada. La portada ya muestra el cambio.' },
  'banner-publicada': { tipo: 'ok', texto: 'Diapositiva publicada en el banner de Inicio.' },
  'banner-despublicada': { tipo: 'ok', texto: 'Diapositiva retirada del banner de Inicio.' },
  'banner-eliminada': { tipo: 'ok', texto: 'Diapositiva eliminada.' },
  'banner-ajustes': { tipo: 'ok', texto: 'Tiempo de cada diapositiva guardado.' },
  'banner-segundos': { tipo: 'error', texto: 'Elegí un tiempo entre 4 y 12 segundos.' },
  'ofertas-guardadas': { tipo: 'ok', texto: 'Ofertas guardadas. Promociones ya muestra los cambios.' },
  'ofertas-agregadas': { tipo: 'ok', texto: 'Piezas agregadas al final. Describí cada una con el producto y el precio, y guardá.' },
  'ofertas-error-subida': { tipo: 'error', texto: 'Alguna imagen no se pudo agregar (formato no admitido, muy chica o demasiado grande). Las demás se agregaron.' },
  'ofertas-vaciadas': { tipo: 'ok', texto: 'Se quitaron todas las piezas: la sección de ofertas no se muestra hasta que cargues otras.' },
  'campana-guardada': { tipo: 'ok', texto: 'Ajustes de la campana guardados. La web ya muestra el cambio.' },
  'creditos-guardado': { tipo: 'ok', texto: 'Fechas de crédito guardadas. La web ya muestra el cambio.' },
  'banner-maximo':{ tipo: 'error', texto: 'El banner ya tiene el máximo de diapositivas: eliminá una para agregar otra.' },
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
  'empleados-guardado': { tipo: 'ok', texto: 'Información para empleados actualizada.' },
  'notificacion-programada': { tipo: 'ok', texto: 'Notificación programada. Los celulares ya están recibiendo la agenda nueva.' },
  'notificacion-enviada': { tipo: 'ok', texto: 'Notificación enviada. Le llega a cada celular la próxima vez que la app se actualiza (en general, en menos de una hora).' },
  'notificacion-cancelada': { tipo: 'ok', texto: 'Notificación cancelada: no va a salir.' },
  'notificacion-eliminada': { tipo: 'ok', texto: 'Notificación eliminada del historial.' },
  'color-guardado': { tipo: 'ok', texto: 'Listo: tu color quedó guardado. Se usa en los registros nuevos.' },
  'planilla-vaciada': { tipo: 'ok', texto: 'Planilla de prueba vaciada.' },
  'planilla-en-google': { tipo: 'error', texto: 'Los registros se guardan en la hoja de Google: abrila con el botón «Abrir hoja de Google». La descarga solo existe para la planilla de prueba.' },
  'notificaciones-ajustes': { tipo: 'ok', texto: 'Ajustes de notificaciones guardados.' },
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
  /** Solo para pruebas: `fetch` del servicio de push y esperar los envíos. */
  push?: EN.OpcionesEnvio;
}

export function crearApp({ db: fuenteDb, config, almacen, asistente, correo, push = {} }: OpcionesApp) {
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
    c.header('Permissions-Policy', `camera=(self), microphone=${c.req.path === r('/registros') ? '(self)' : '()'}, geolocation=(), payment=()`); // el micrófono es para dictar en Registros
    c.header('X-Robots-Tag', 'noindex, nofollow');
    if (!c.req.path.startsWith(r('/media/'))) {
      // La pantalla de permiso para Claude redirige, al enviarse, a claude.ai / claude.com (o localhost en pruebas).
      // El formulario de Registros busca direcciones en los mapas abiertos (OpenStreetMap): solo en esa página.
      const conectar = c.req.path === r('/registros') || c.req.path === r('/registros/') ? "'self' https://photon.komoot.io https://nominatim.openstreetmap.org" : "'self'";
      const formAction = c.req.path.startsWith(r('/oauth/autorizar/')) ? "'self' https://claude.ai https://claude.com http://localhost:* http://127.0.0.1:*" : "'self'";
      c.header('Content-Security-Policy', `default-src 'self'; img-src 'self' data: blob: https://*.public.blob.vercel-storage.com; media-src 'self' blob:; script-src 'self'; style-src 'self'; font-src 'self'; connect-src ${conectar}; form-action ${formAction}; frame-ancestors 'none'; base-uri 'none'; object-src 'none'`);
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
    sistema: (c.get('usuario') ? esAdministrador(c.get('usuario')!) : false) && !enviarCorreo ? 'La verificación por correo está en pausa: falta configurar el envío de correos (RESEND_API_KEY en Vercel). Mientras tanto se ingresa con PIN, usuario y contraseña.' : null,
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
      const s = await U.leerSesion(c.get('db'), token, config.sesionInactividadMin, config.sesionLargaInactividadDias * 1440);
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
    if (esAdministrador(u) && c.req.path !== r('/pin/crear') && !(await AC.pinConfigurado(c.get('db')))) return c.redirect(r('/pin/crear'));
    if (!puede(u, permiso)) return c.html(V.vistaError(ctx(c), 403, 'Sin permiso', 'Tus roles no permiten esta acción. Pedile acceso a un administrador.'), 403);
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
    // «Mantener la sesión iniciada» (casilla del ingreso): no se cierra mientras se use; vence tras días sin usarla o al tope.
    const larga = c.get('mantener') === true || cookieDe(c, 'copol_mantener') === '1';
    const horas = larga ? config.sesionLargaMaxDias * 24 : config.sesionMaxHoras;
    const token = await U.crearSesion(db, Number(u.id), horas, o.ip, o.agente, o.lugar, larga);
    setCookie(c, nombreCookie(c, 'copol_panel'), token, { ...opcionesCookie(c), maxAge: horas * 3600 });
    for (const k of ['copol_pre', 'copol_verif', 'copol_pin', 'copol_mantener']) deleteCookie(c, nombreCookie(c, k), opcionesCookie(c));
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
    // La elección viaja en una cookie corta hasta terminar el ingreso (puede pasar por el código del correo).
    c.set('mantener', b.mantener === '1');
    if (b.mantener === '1') setCookie(c, nombreCookie(c, 'copol_mantener'), '1', { ...opcionesCookie(c), maxAge: 3600 });
    else deleteCookie(c, nombreCookie(c, 'copol_mantener'), opcionesCookie(c));
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
  app.get('/perfil', requiere('empleados'), (c) => perfil(c));
  app.get('/perfil/clave', requiere('empleados'), (c) => (c.get('usuario')!.debe_cambiar_clave ? c.html(V.vistaCambioObligatorio(ctx(c), null)) : c.redirect(r('/perfil'))));
  app.post('/perfil/clave', requiere('empleados'), async (c) => {
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
  app.post('/perfil/correo', requiere('empleados'), async (c) => {
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

  // Color propio en la planilla de registros.
  app.post('/perfil/color', requiere('empleados'), async (c) => {
    const db = c.get('db');
    const u = c.get('usuario')!;
    const b = await cuerpo(c);
    if (!colorValido(b.color)) return perfil(c, { color: 'Elegí uno de los colores de la lista.' }, 400);
    await U.cambiarColor(db, u.id, b.color);
    await registrar(db, actor(c), 'usuario.color', 'usuario', String(u.id), { usuario: u.usuario, color: b.color });
    return c.redirect(`${r('/perfil')}?aviso=color-guardado`);
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
  // Quien no tiene acceso al stock (p. ej. solo Registros) entra directo a su sección.
  const inicioDe = (u: U.UsuarioPublico) => (puede(u, 'ver') ? r() : puede(u, 'registros') ? r('/registros') : r('/empleados'));
  app.get('/', async (c, next) => (c.get('usuario') && !puede(c.get('usuario')!, 'ver') ? c.redirect(inicioDe(c.get('usuario')!)) : next()), requiere('ver'), inventario);
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
    const soloStock = !puede(c.get('usuario')!, 'productos');
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

  // ── Administración Página: banner de Inicio ──
  const bannerDe = async (c: C) => {
    const banner = await B.obtenerBanner(c.get('db'));
    return { banner, diapo: banner.diapositivas.find((d) => d.id === c.req.param('id')) ?? null };
  };
  app.get('/banner', requiere('novedades'), async (c) => c.html(V.vistaBanner(ctx(c), await B.obtenerBanner(c.get('db')))));
  app.get('/banner/nueva', requiere('novedades'), async (c) => {
    const banner = await B.obtenerBanner(c.get('db'));
    if (banner.diapositivas.length >= B.MAX_DIAPOSITIVAS) return c.redirect(`${r('/banner')}?aviso=banner-maximo`);
    return c.html(V.vistaFormBanner(ctx(c), B.diapositivaVacia(), {}, false, banner.segundos));
  });
  app.post('/banner/ajustes', requiere('novedades'), async (c) => {
    const db = c.get('db');
    const segundos = Number(texto((await cuerpo(c)).segundos, 3));
    if (!Number.isInteger(segundos) || segundos < B.SEGUNDOS.min || segundos > B.SEGUNDOS.max) return c.redirect(`${r('/banner')}?aviso=banner-segundos`);
    const banner = await B.obtenerBanner(db);
    if (banner.segundos !== segundos) {
      const antes = banner.segundos;
      banner.segundos = segundos;
      await B.guardarBanner(db, banner);
      await registrar(db, actor(c), 'banner.ajustes', 'banner', null, { antes, despues: segundos });
    }
    return c.redirect(`${r('/banner')}?aviso=banner-ajustes`);
  });

  const guardarDiapositiva = async (c: C, existente: B.Diapositiva | null) => {
    const db = c.get('db');
    const b = await cuerpo(c);
    const archivo = b.imagen instanceof File && b.imagen.size > 0 ? b.imagen : null;
    const archivoMovil = b.imagen_movil instanceof File && b.imagen_movil.size > 0 ? b.imagen_movil : null;
    const { datos, errores } = validarDiapositiva(b, Boolean(archivo || existente?.imagen));
    let imagen = existente?.imagen ?? '';
    let imagenMovil = b.quitar_movil === '1' ? '' : existente?.imagenMovil ?? '';
    const nombre = slug(datos.titulo).slice(0, 40) || 'banner';
    if (!Object.keys(errores).length) {
      for (const [campo, f] of [['imagen', archivo], ['imagen_movil', archivoMovil]] as const) {
        if (!f) continue;
        try {
          const url = await procesarImagen(f, { maxMB: config.maxImagenMB, tipo: 'novedad', carpeta: 'banner', nombre: campo === 'imagen' ? nombre : `${nombre}-celular`, almacen: guardarEn });
          if (campo === 'imagen') imagen = url;
          else imagenMovil = url;
        } catch (e) {
          if (!(e instanceof ErrorImagen)) throw e;
          errores[campo] = e.message;
        }
      }
    }
    const diapo: B.Diapositiva = { ...datos, id: existente?.id ?? B.nuevoId(), imagen, imagenMovil, actualizado_en: ahora(), actualizado_por: c.get('usuario')!.usuario };
    const banner = await B.obtenerBanner(db);
    if (!existente && banner.diapositivas.length >= B.MAX_DIAPOSITIVAS) errores.titulo = `El banner admite hasta ${B.MAX_DIAPOSITIVAS} diapositivas: eliminá una para agregar otra.`;
    if (Object.keys(errores).length) {
      // La vista previa vuelve a mostrar las imágenes ya guardadas (un archivo elegido hay que volver a elegirlo).
      return c.html(V.vistaFormBanner(ctx(c), { ...diapo, imagen: existente?.imagen ?? '', imagenMovil: existente?.imagenMovil ?? '' }, errores, Boolean(existente), banner.segundos), 400);
    }
    banner.diapositivas = existente ? banner.diapositivas.map((d) => (d.id === existente.id ? diapo : d)) : [...banner.diapositivas, diapo];
    await B.guardarBanner(db, banner);
    await registrar(db, actor(c), existente ? 'banner.edicion' : 'banner.alta', 'banner', diapo.id, { titulo: B.tituloCompleto(diapo), publicado: diapo.publicado, diseno: diapo.diseno });
    return c.redirect(`${r('/banner')}?aviso=banner-guardado`);
  };
  app.post('/banner/nueva', requiere('novedades'), (c) => guardarDiapositiva(c, null));
  app.get('/banner/:id', requiere('novedades'), async (c) => {
    const { banner, diapo } = await bannerDe(c);
    return diapo ? c.html(V.vistaFormBanner(ctx(c), diapo, {}, true, banner.segundos)) : c.notFound();
  });
  app.post('/banner/:id', requiere('novedades'), async (c) => {
    const { diapo } = await bannerDe(c);
    return diapo ? guardarDiapositiva(c, diapo) : c.notFound();
  });
  app.post('/banner/:id/publicar', requiere('novedades'), async (c) => {
    const { banner, diapo } = await bannerDe(c);
    if (!diapo) return c.notFound();
    diapo.publicado = (await cuerpo(c)).publicado === '1';
    await B.guardarBanner(c.get('db'), banner);
    await registrar(c.get('db'), actor(c), diapo.publicado ? 'banner.publicacion' : 'banner.despublicacion', 'banner', diapo.id, { titulo: B.tituloCompleto(diapo) });
    return c.redirect(`${r('/banner')}?aviso=${diapo.publicado ? 'banner-publicada' : 'banner-despublicada'}`);
  });
  app.post('/banner/:id/mover', requiere('novedades'), async (c) => {
    const { banner, diapo } = await bannerDe(c);
    if (!diapo) return c.notFound();
    const dir = (await cuerpo(c)).direccion === 'arriba' ? 'arriba' : 'abajo';
    const i = banner.diapositivas.indexOf(diapo);
    const j = dir === 'arriba' ? i - 1 : i + 1;
    if (j >= 0 && j < banner.diapositivas.length) {
      [banner.diapositivas[i], banner.diapositivas[j]] = [banner.diapositivas[j], banner.diapositivas[i]];
      await B.guardarBanner(c.get('db'), banner);
      await registrar(c.get('db'), actor(c), 'banner.orden', 'banner', diapo.id, { titulo: B.tituloCompleto(diapo), direccion: dir });
    }
    return c.redirect(r('/banner'));
  });
  app.post('/banner/:id/eliminar', requiere('novedades'), async (c) => {
    const { banner, diapo } = await bannerDe(c);
    if (!diapo) return c.notFound();
    banner.diapositivas = banner.diapositivas.filter((d) => d.id !== diapo.id);
    await B.guardarBanner(c.get('db'), banner);
    await registrar(c.get('db'), actor(c), 'banner.baja', 'banner', diapo.id, { titulo: B.tituloCompleto(diapo) });
    return c.redirect(`${r('/banner')}?aviso=banner-eliminada`);
  });

  // ── Estadísticas de la web (sin cookies ni datos personales; ver estadisticas.ts) ──
  app.get('/estadisticas', requiere('auditoria'), async (c) => {
    const dias = [7, 30, 90].includes(Number(c.req.query('dias'))) ? Number(c.req.query('dias')) : 30;
    await ES.archivarMeses(c.get('db')); // por si el Cron del día 1 no corrió
    return c.html(V.vistaEstadisticas(ctx(c), await ES.resumen(c.get('db'), dias), dias));
  });
  // Archivo mes a mes: el mes en curso se calcula al momento; los terminados salen de lo guardado.
  app.get('/estadisticas/meses', requiere('auditoria'), async (c) => {
    const db = c.get('db');
    await ES.archivarMeses(db);
    const mes = hoyUruguay().slice(0, 7);
    return c.html(V.vistaEstadisticasMeses(ctx(c), { enCurso: { mes, resumen: await ES.resumenMes(db, mes) }, meses: await ES.listarMeses(db) }));
  });
  const datosMes = async (c: C, mes: string) => {
    const db = c.get('db');
    if (!ES.mesValido(mes)) return null;
    if (mes === hoyUruguay().slice(0, 7)) return { resumen: await ES.resumenMes(db, mes), archivado: null };
    await ES.archivarMeses(db);
    const guardado = await ES.mesArchivado(db, mes);
    return guardado ? { resumen: guardado.resumen, archivado: guardado.archivadoEn } : null;
  };
  // /estadisticas/meses/2026-09 (pantalla) y /estadisticas/meses/2026-09.csv (descarga)
  app.get('/estadisticas/meses/:archivo', requiere('auditoria'), async (c) => {
    const [, mes, csv] = c.req.param('archivo').match(/^(\d{4}-\d{2})(\.csv)?$/) ?? [];
    const d = mes ? await datosMes(c, mes) : null;
    if (!mes || !d) return c.notFound();
    if (csv) return c.body(ES.csvMes(mes, d.resumen), 200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="estadisticas-${mes}.csv"` });
    return c.html(V.vistaEstadisticas(ctx(c), d.resumen, d.resumen.dias.length, { id: mes, archivado: d.archivado }));
  });

  // ── Administración Página: ofertas del supermercado (Promociones) ──
  app.get('/ofertas', requiere('novedades'), async (c) => c.html(V.vistaOfertas(ctx(c), await OF.obtenerOfertas(c.get('db')))));
  app.post('/ofertas', requiere('novedades'), async (c) => {
    const db = c.get('db');
    const b = await cuerpo(c);
    const o = await OF.obtenerOfertas(db);
    const errores: Record<string, string> = {};
    const titulo = texto(b.titulo, 80).replace(/\s+/g, ' ');
    const mes = texto(b.mes, 60).replace(/\s+/g, ' ');
    const hastaTexto = texto(b.hasta, 10);
    const hasta = fechaValida(hastaTexto);
    if (titulo.length < 3 || titulo.length > 80) errores.titulo = 'Escribí un título de 3 a 80 caracteres (por ejemplo "Ofertas de noviembre").';
    if (mes.length > 60) errores.mes = 'El período es demasiado largo (máx. 60).';
    if (hastaTexto && !hasta) errores.hasta = 'Fecha inválida.';
    const piezas = o.piezas.map((p) => {
      const alt = typeof b[`alt_${p.id}`] === 'string' ? texto(b[`alt_${p.id}`], 200).replace(/\s+/g, ' ') : p.alt;
      if (alt.length > 200) errores[`alt_${p.id}`] = 'Máximo 200 caracteres.';
      return { ...p, alt };
    });
    if (Object.keys(errores).length) return c.html(V.vistaOfertas(ctx(c), { titulo, mes, hasta: hastaTexto, piezas }, errores), 400);
    const quedan = piezas.filter((p) => b[`quitar_${p.id}`] !== '1');
    const [accion, id] = texto(b.accion, 40).split(':');
    const i = quedan.findIndex((p) => p.id === id);
    const j = accion === 'arriba' ? i - 1 : i + 1;
    if (i >= 0 && (accion === 'arriba' || accion === 'abajo') && j >= 0 && j < quedan.length) [quedan[i], quedan[j]] = [quedan[j], quedan[i]];
    await OF.guardarOfertas(db, { titulo, mes, hasta, piezas: quedan });
    await registrar(db, actor(c), 'ofertas.edicion', 'ofertas', null, { titulo, hasta: hasta || null, piezas: quedan.length, quitadas: piezas.length - quedan.length, ...(i >= 0 && accion !== 'guardar' ? { orden: accion } : {}) });
    // Ofertas nuevas = cambió el título (otro mes) y hay piezas vigentes: aviso automático (una vez por título).
    if (titulo !== o.titulo) await avisarOfertas(c);
    return c.redirect(`${r('/ofertas')}?aviso=ofertas-guardadas`);
  });
  app.post('/ofertas/piezas', requiere('novedades'), async (c) => {
    const db = c.get('db');
    const b = await cuerpo(c);
    const quiereJson = c.req.header('accept')?.includes('application/json');
    const archivos = (Array.isArray(b.piezas) ? b.piezas : [b.piezas]).filter((f): f is File => f instanceof File && f.size > 0).sort((x, y) => x.name.localeCompare(y.name, 'es', { numeric: true }));
    const o = await OF.obtenerOfertas(db);
    let error: string | null = archivos.length ? null : 'Elegí al menos una imagen.';
    let agregadas = 0;
    for (const f of archivos) {
      if (o.piezas.length >= OF.MAX_PIEZAS) { error = `Se llegó al máximo de ${OF.MAX_PIEZAS} piezas.`; break; }
      try {
        const imagen = await procesarImagen(f, { maxMB: config.maxImagenMB, tipo: 'oferta', carpeta: 'ofertas', nombre: slug(f.name.replace(/\.\w+$/, '')).slice(0, 40) || 'oferta', almacen: guardarEn });
        o.piezas.push({ id: OF.nuevoIdPieza(), imagen, alt: '' });
        agregadas++;
      } catch (e) {
        if (!(e instanceof ErrorImagen)) throw e;
        error = `${f.name}: ${e.message}`;
      }
    }
    if (agregadas) {
      const estabaVacia = o.piezas.length === agregadas;
      await OF.guardarOfertas(db, o);
      await registrar(db, actor(c), 'ofertas.piezas', 'ofertas', null, { agregadas, total: o.piezas.length });
      // Primeras piezas después de vaciar las del mes anterior: ofertas nuevas.
      if (estabaVacia) await avisarOfertas(c);
    }
    if (quiereJson) return c.json({ ok: !error, agregadas, error }, error && !agregadas ? 400 : 200);
    return c.redirect(`${r('/ofertas')}?aviso=${error ? 'ofertas-error-subida' : 'ofertas-agregadas'}`);
  });
  app.post('/ofertas/vaciar', requiere('novedades'), async (c) => {
    const db = c.get('db');
    const o = await OF.obtenerOfertas(db);
    await OF.guardarOfertas(db, { ...o, piezas: [] });
    await registrar(db, actor(c), 'ofertas.vaciado', 'ofertas', null, { quitadas: o.piezas.length });
    return c.redirect(`${r('/ofertas')}?aviso=ofertas-vaciadas`);
  });

  // ── Administración Página: aperturas de crédito ──
  app.get('/creditos', requiere('novedades'), async (c) => c.html(V.vistaCreditos(ctx(c), await CR.obtenerAperturas(c.get('db')))));
  app.post('/creditos', requiere('novedades'), async (c) => {
    const db = c.get('db');
    const b = await cuerpo(c);
    const lista = await CR.obtenerAperturas(db);
    const fecha = fechaValida(b.fecha);
    const error = !fecha ? 'Elegí una fecha válida.'
      : fecha < hoyUruguay() ? 'La fecha ya pasó.'
      : lista.some((a) => a.fecha === fecha) ? 'Esa fecha ya está cargada.'
      : lista.length >= CR.MAX_APERTURAS ? `Se admiten hasta ${CR.MAX_APERTURAS} fechas: quitá alguna pasada.` : null;
    if (error) return c.html(V.vistaCreditos(ctx(c), lista, error), 400);
    const confirmada = b.confirmada === '1';
    await CR.guardarAperturas(db, [...lista, { fecha, confirmada }]);
    await registrar(db, actor(c), 'creditos.alta', 'creditos', fecha, { fecha, confirmada });
    await EN.sincronizar(db, push);
    return c.redirect(`${r('/creditos')}?aviso=creditos-guardado`);
  });
  app.post('/creditos/confirmar', requiere('novedades'), async (c) => {
    const db = c.get('db');
    const b = await cuerpo(c);
    const lista = await CR.obtenerAperturas(db);
    const a = lista.find((x) => x.fecha === fechaValida(b.fecha));
    if (!a) return c.notFound();
    a.confirmada = b.confirmada === '1';
    await CR.guardarAperturas(db, lista);
    await registrar(db, actor(c), 'creditos.edicion', 'creditos', a.fecha, { fecha: a.fecha, confirmada: a.confirmada });
    await EN.sincronizar(db, push);
    return c.redirect(`${r('/creditos')}?aviso=creditos-guardado`);
  });
  app.post('/creditos/quitar', requiere('novedades'), async (c) => {
    const db = c.get('db');
    const fecha = fechaValida((await cuerpo(c)).fecha);
    const lista = await CR.obtenerAperturas(db);
    if (!lista.some((a) => a.fecha === fecha)) return c.notFound();
    await CR.guardarAperturas(db, lista.filter((a) => a.fecha !== fecha));
    await registrar(db, actor(c), 'creditos.baja', 'creditos', fecha, { fecha });
    await EN.sincronizar(db, push);
    return c.redirect(`${r('/creditos')}?aviso=creditos-guardado`);
  });

  // ── Campana de novedades del encabezado ──
  app.get('/campana', requiere('novedades'), async (c) => c.html(V.vistaCampana(ctx(c), { campana: await CA.obtenerCampana(c.get('db')), novedades: (await N.novedadesPublicadas(c.get('db'))).length })));
  app.post('/campana', requiere('novedades'), async (c) => {
    const db = c.get('db');
    const b = await cuerpo(c);
    const errores: Record<string, string> = {};
    const modo = texto(b.modo, 10);
    if (!CA.esModo(modo)) errores.modo = 'Elegí una opción.';
    const numero = Number(texto(b.numero, 4));
    if (modo === 'fijo' && !(Number.isInteger(numero) && numero >= 1 && numero <= 99)) errores.numero = 'Elegí un número entero de 1 a 99.';
    const titulo = texto(b.titulo, 60).replace(/\s+/g, ' ').trim();
    if (titulo.length < 3 || titulo.length > 60) errores.titulo = 'El título lleva de 3 a 60 caracteres.';
    if (Object.keys(errores).length) {
      const previo = CA.limpiarCampana({ activa: b.activa === '1', modo, numero, titulo });
      return c.html(V.vistaCampana(ctx(c), { campana: previo, novedades: (await N.novedadesPublicadas(db)).length }, errores), 400);
    }
    const nueva = CA.limpiarCampana({ activa: b.activa === '1', modo, numero: Number.isFinite(numero) ? numero : undefined, titulo });
    await CA.guardarCampana(db, nueva);
    await registrar(db, actor(c), 'campana.ajustes', 'campana', null, nueva);
    return c.redirect(`${r('/campana')}?aviso=campana-guardada`);
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
    if (n!.publicado) await avisarNovedad(c, n!);
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
    if (act?.publicado) await avisarNovedad(c, act);
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

  // ── Administración Página: notificaciones de la app ──
  async function avisarOfertas(c: C) {
    const o = await OF.obtenerOfertas(c.get('db'));
    if (!OF.piezasVigentes(o).length || !o.titulo) return;
    await EN.avisoAutomatico(c.get('db'), actor(c), 'ofertas', `auto:ofertas:${slug(o.titulo)}`, {
      titulo: 'Nuevas ofertas del supermercado',
      texto: `${o.titulo}${o.mes ? `, vigentes en ${o.mes}` : ''}. Miralas en la app.`,
      destino: 'promociones',
    }, push);
  }
  async function avisarNovedad(c: C, n: N.Novedad) {
    const estado = N.estadoNovedad(n);
    if (estado !== 'publicada' && estado !== 'programada') return;
    await EN.avisoAutomatico(c.get('db'), actor(c), 'novedades', `auto:novedad:${n.id}`, {
      titulo: n.titulo,
      texto: n.texto?.trim() || 'Nueva novedad de COPOL. Mirala en la app.',
      destino: 'inicio',
    }, push, estado === 'programada' ? n.desde : null);
  }
  const datosNotificaciones = async (c: C) => {
    const db = c.get('db');
    const [{ agenda, ajustes, enviadas }, lista, dispositivos] = await Promise.all([NT.agendaDe(db, await CR.obtenerAperturas(db)), NT.listarNotificaciones(db), NT.contarDispositivos(db)]);
    return { agenda, ajustes, enviadasHoy: enviadas, lista, dispositivos };
  };
  app.get('/notificaciones', requiere('novedades'), async (c) => c.html(V.vistaNotificaciones(ctx(c), await datosNotificaciones(c))));
  /** Propuesta para una nueva: mañana a las 10 (o al inicio del horario permitido). */
  const sugerencia = (a: NT.Ajustes) => ({ fecha: NT.sumarDias(hoyUruguay(), 1), hora: NT.dentroDelHorario('10:00', a) ? '10:00' : a.desde });
  app.get('/notificaciones/nueva', requiere('novedades'), async (c) => {
    const db = c.get('db');
    const a = await NT.obtenerAjustes(db);
    return c.html(V.vistaFormNotificacion(ctx(c), { cuando: 'programar', destino: 'inicio', categoria: 'avisos', con_boton: 1, ...sugerencia(a) }, {}, a, await NT.contarDispositivos(db)));
  });
  const guardarNotificacion = async (c: C, existente: NT.Notificacion | null) => {
    const db = c.get('db');
    const b = await cuerpo(c);
    const ajustes = await NT.obtenerAjustes(db);
    const { datos, errores, cuando } = NT.validarNotificacion(b, ajustes);
    if (!Object.keys(errores).length) {
      if (cuando === 'ahora') {
        const { usados } = await EN.usadosHoy(db);
        if (usados >= ajustes.maxPorDia) errores.cuando = `Hoy ya salieron o van a salir ${usados} avisos (máximo ${ajustes.maxPorDia}). Programala para otro día o subí el máximo en Ajustes.`;
      } else if (!ajustes.activas) {
        errores.cuando = 'Las notificaciones están en pausa: activalas en Ajustes para programar.';
      } else {
        // Se arma la agenda con esta notificación para ver si algún día se pasa del máximo.
        const id = existente?.id ?? -1;
        const otras = (await NT.listarNotificaciones(db)).filter((n) => n.id !== id);
        const candidata = {
          ...(existente ?? {}), id, titulo: datos.titulo, texto: datos.texto, destino: datos.destino, con_boton: datos.conBoton ? 1 : 0, categoria: datos.categoria,
          origen: existente?.origen ?? 'manual', repeticion: datos.repeticion, fecha: datos.fecha, hora: datos.hora, dias: datos.dias?.join(',') ?? null, hasta: datos.hasta, estado: 'programada',
        } as NT.Notificacion;
        // Se revisan los días de esta notificación (aunque estén más allá de los 14 de la agenda).
        const hoy = hoyUruguay();
        const agenda = NT.armarAgenda({ hoy: datos.fecha, dias: datos.repeticion === 'diaria' ? 120 : 1, aperturas: await CR.obtenerAperturas(db), ajustes, notificaciones: [...otras, candidata], enviadasHoy: datos.fecha === hoy ? await NT.enviadasHoy(db) : 0 });
        const llenos = NT.diasExcedidos(agenda, id);
        if (llenos.length) errores.cuando = `Estos días ya tienen el máximo de ${ajustes.maxPorDia} avisos: ${llenos.slice(0, 5).map(NT.fechaLarga).join(', ')}${llenos.length > 5 ? '…' : ''}. Elegí otro día o subí el máximo en Ajustes.`;
      }
    }
    if (Object.keys(errores).length) {
      const previo = { ...existente, ...b, cuando, con_boton: datos.conBoton ? 1 : 0, dias: datos.dias?.join(',') ?? null } as V.NotificacionForm;
      return c.html(V.vistaFormNotificacion(ctx(c), previo, errores, ajustes, await NT.contarDispositivos(db)), 400);
    }
    const usuario = c.get('usuario')!.usuario;
    const n = existente ? (await NT.editarNotificacion(db, existente.id, datos, usuario))! : await NT.crearNotificacion(db, datos, usuario);
    if (cuando === 'ahora') {
      const alcance = await EN.enviarYa(db, n, push);
      await registrar(db, actor(c), 'notificacion.envio', 'notificacion', String(n.id), { titulo: n.titulo, categoria: n.categoria, alcance });
      if (existente) await EN.sincronizar(db, push); // estaba en la agenda: se retira de los celulares
      return c.redirect(`${r('/notificaciones')}?aviso=notificacion-enviada`);
    }
    await registrar(db, actor(c), existente ? 'notificacion.edicion' : 'notificacion.alta', 'notificacion', String(n.id), { titulo: n.titulo, repeticion: n.repeticion, fecha: n.fecha, hora: n.hora });
    await EN.sincronizar(db, push);
    return c.redirect(`${r('/notificaciones')}?aviso=notificacion-programada`);
  };
  app.post('/notificaciones/nueva', requiere('novedades'), (c) => guardarNotificacion(c, null));
  app.post('/notificaciones/ajustes', requiere('novedades'), async (c) => {
    const db = c.get('db');
    const b = await cuerpo(c);
    const desde = NT.horaValida(b.desde);
    const hasta = NT.horaValida(b.hasta);
    const horaCredito = NT.horaValida(b.credito_hora);
    const max = Number(b.max_por_dia);
    const errores: Record<string, string> = {};
    if (!desde || !hasta || hasta <= desde) errores.horario = 'Elegí un horario válido: la hora de fin tiene que ser posterior a la de inicio.';
    if (!Number.isInteger(max) || max < 1 || max > NT.LIMITES.maxPorDia) errores.max_por_dia = `Elegí entre 1 y ${NT.LIMITES.maxPorDia} avisos por día.`;
    if (!horaCredito) errores.credito_hora = 'Elegí la hora de los avisos de crédito.';
    else if (desde && hasta && !NT.dentroDelHorario(horaCredito, { desde, hasta })) errores.credito_hora = 'La hora de los avisos de crédito tiene que estar dentro del horario permitido.';
    const ajustes: NT.Ajustes = {
      activas: b.activas === '1', maxPorDia: max, desde, hasta,
      credito: { activo: b.credito_activo === '1', diaAnterior: b.credito_anterior === '1', mismoDia: b.credito_dia === '1', hora: horaCredito },
      ofertas: { activo: b.ofertas_activo === '1' },
      novedades: { activo: b.novedades_activo === '1' },
    };
    if (Object.keys(errores).length) return c.html(V.vistaNotificaciones(ctx(c), { ...(await datosNotificaciones(c)), ajustes }, errores), 400);
    await NT.guardarAjustes(db, ajustes);
    await registrar(db, actor(c), 'notificacion.ajustes', 'notificaciones', null, ajustes);
    await EN.sincronizar(db, push);
    return c.redirect(`${r('/notificaciones')}?aviso=notificaciones-ajustes`);
  });
  const notificacionDe = (c: C) => NT.obtenerNotificacion(c.get('db'), Number(c.req.param('id')) || 0);
  app.get('/notificaciones/:id', requiere('novedades'), async (c) => {
    const n = await notificacionDe(c);
    if (!n) return c.notFound();
    if (n.estado !== 'programada') return c.redirect(r('/notificaciones'));
    const db = c.get('db');
    return c.html(V.vistaFormNotificacion(ctx(c), { ...n, cuando: n.repeticion === 'diaria' ? 'repetir' : 'programar' }, {}, await NT.obtenerAjustes(db), await NT.contarDispositivos(db)));
  });
  app.post('/notificaciones/:id', requiere('novedades'), async (c) => {
    const n = await notificacionDe(c);
    return n && n.estado === 'programada' ? guardarNotificacion(c, n) : c.notFound();
  });
  app.post('/notificaciones/:id/cancelar', requiere('novedades'), async (c) => {
    const n = await notificacionDe(c);
    if (!n) return c.notFound();
    const db = c.get('db');
    await NT.cancelarNotificacion(db, n.id, c.get('usuario')!.usuario);
    await registrar(db, actor(c), 'notificacion.cancelacion', 'notificacion', String(n.id), { titulo: n.titulo });
    await EN.sincronizar(db, push);
    return c.redirect(`${r('/notificaciones')}?aviso=notificacion-cancelada`);
  });
  app.post('/notificaciones/:id/eliminar', requiere('novedades'), async (c) => {
    const n = await notificacionDe(c);
    if (!n) return c.notFound();
    const db = c.get('db');
    await NT.eliminarNotificacion(db, n.id);
    await registrar(db, actor(c), 'notificacion.baja', 'notificacion', String(n.id), { titulo: n.titulo });
    if (n.estado === 'programada') await EN.sincronizar(db, push);
    return c.redirect(`${r('/notificaciones')}?aviso=notificacion-eliminada`);
  });

  // ── Información empleados: la ve todo el personal; la editan los administradores ──
  app.get('/empleados', requiere('empleados'), async (c) => c.html(V.vistaEmpleados(ctx(c), await E.obtenerPortal(c.get('db')), puede(c.get('usuario')!, 'novedades'))));
  app.get('/empleados/editar', requiere('novedades'), async (c) => c.html(V.vistaFormEmpleados(ctx(c), await E.obtenerPortal(c.get('db')))));
  app.post('/empleados', requiere('novedades'), async (c) => {
    const db = c.get('db');
    const b = await cuerpo(c);
    const actual = await E.obtenerPortal(db);
    const errores: Record<string, string> = {};
    const enlaces = { acosoUrl: E.validarEnlace(b.acoso_url), animoUrl: E.validarEnlace(b.animo_url), recibosUrl: E.validarEnlace(b.recibos_url), reglamentoUrl: E.validarEnlace(b.reglamento_url) };
    for (const [k, campo] of [['acosoUrl', 'acoso_url'], ['animoUrl', 'animo_url'], ['recibosUrl', 'recibos_url'], ['reglamentoUrl', 'reglamento_url']] as const) if (enlaces[k].error) errores[campo] = enlaces[k].error!;
    const nuevo: E.Portal = { acosoUrl: enlaces.acosoUrl.url, animoUrl: enlaces.animoUrl.url, recibosUrl: enlaces.recibosUrl.url, reglamentoUrl: enlaces.reglamentoUrl.url, carrusel: [], ciudadDelPlata: [], chuy: [] };
    const archivos: Partial<Record<E.Grupo, File[]>> = {};
    for (const g of Object.keys(E.GRUPOS) as E.Grupo[]) {
      nuevo[g] = actual[g]
        .map((img, k) => ({ src: img.src, alt: texto(b[`alt_${g}_${k}`], 400).slice(0, 400) || img.alt, quitar: b[`quitar_${g}_${k}`] === '1' }))
        .filter((x) => !x.quitar)
        .map(({ src, alt }) => ({ src, alt }));
      const subidos = [b[`nuevas_${g}`]].flat().filter((f): f is File => f instanceof File && f.size > 0);
      const max = E.GRUPOS[g].max;
      if (nuevo[g].length + subidos.length > max) errores[`nuevas_${g}`] = max === 1 ? 'Esta sección admite una sola imagen: quitá la actual para cambiarla.' : `Esta sección admite hasta ${max} imágenes.`;
      archivos[g] = subidos;
    }
    // Las imágenes se suben solo si el resto es válido (así no quedan archivos huérfanos).
    if (!Object.keys(errores).length) {
      for (const g of Object.keys(archivos) as E.Grupo[]) {
        const alt = texto(b[`alt_nueva_${g}`], 400).slice(0, 400) || E.GRUPOS[g].titulo.replace(/ \(carrusel\)$/, '');
        for (const archivo of archivos[g]!) {
          try {
            nuevo[g].push({ src: await procesarImagen(archivo, { maxMB: config.maxImagenMB, tipo: 'novedad', carpeta: 'empleados', nombre: slug(g), almacen: guardarEn }), alt });
          } catch (e) {
            if (!(e instanceof ErrorImagen)) throw e;
            errores[`nuevas_${g}`] = `${archivo.name}: ${e.message}`;
          }
        }
      }
    }
    if (Object.keys(errores).length) return c.html(V.vistaFormEmpleados(ctx(c), { ...actual, acosoUrl: nuevo.acosoUrl, animoUrl: nuevo.animoUrl, recibosUrl: nuevo.recibosUrl, reglamentoUrl: nuevo.reglamentoUrl }, errores), 400);
    await E.guardarPortal(db, nuevo);
    const resumen = (p: E.Portal) => ({ protocolo: p.acosoUrl, encuesta: p.animoUrl, recibos: p.recibosUrl, reglamento: p.reglamentoUrl, fotos: { carrusel: p.carrusel.length, ciudadDelPlata: p.ciudadDelPlata.length, chuy: p.chuy.length } });
    await registrar(db, actor(c), 'empleados.edicion', 'empleados', null, { antes: resumen(actual), despues: resumen(nuevo) });
    return c.redirect(`${r('/empleados')}?aviso=empleados-guardado`);
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
    if (Object.keys(v.errores).length) return c.html(V.vistaUsuarios(ctx(c), await U.listarUsuarios(db), v.errores, { usuario: v.usuario, roles: v.roles.join(','), correo: v.correo ?? '' }), 400);
    const id = await U.crearUsuario(db, { usuario: v.usuario, roles: v.roles, clave, debeCambiar: true, creadoPor: c.get('usuario')!.usuario, correo: v.correo });
    await registrar(db, actor(c), 'usuario.alta', 'usuario', String(id), { usuario: v.usuario, roles: v.roles, correo: v.correo ? AC.ocultarCorreo(v.correo) : null });
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
    const roles = leerRolesForm(b.roles);
    const activo = b.activo === '1' ? 1 : 0;
    const correo = texto(b.correo, 160).toLowerCase() || null;
    const errores: Record<string, string> = {};
    if (!roles.length) errores.roles = 'Elegí al menos un rol.';
    if (correo ? !correoValido(correo) : enviarCorreo) errores.correo = 'Escribí un correo válido: ahí le llega el código para ingresar.';
    if (esAdministrador(u) && (!roles.includes('administrador') || !activo) && (await U.contarAdminsActivos(db)) <= 1) errores.roles = 'Tiene que quedar al menos un administrador activo.';
    if (Object.keys(errores).length) return c.html(V.vistaEditarUsuario(ctx(c), u, errores), 400);
    await ejecutar(db, 'UPDATE usuarios SET activo = ?, correo = ? WHERE id = ?', [activo, correo, u.id]);
    await U.cambiarRoles(db, u.id, roles);
    if (!activo || roles.join() !== u.roles.join()) await U.cerrarSesionesDe(db, u.id);
    // Otro correo u otra situación de la cuenta: los equipos recordados vuelven a verificarse.
    if (!activo || correo !== u.correo) await AC.borrarPasesDe(db, u.id);
    await registrar(db, actor(c), 'usuario.edicion', 'usuario', String(u.id), { usuario: u.usuario, cambios: { roles: [u.roles, roles], activo: [u.activo, activo], ...(correo !== u.correo ? { correo: [u.correo ? AC.ocultarCorreo(u.correo) : null, correo ? AC.ocultarCorreo(correo) : null] } : {}) } });
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
    if (esAdministrador(o.u) && o.u.activo && (await U.contarAdminsActivos(db)) <= 1) return c.html(V.vistaError(ctx(c), 400, 'No permitido', 'Tiene que quedar al menos un administrador activo.'), 400);
    await db.batch(['sesiones', 'pases', 'verificaciones', 'propuestas', 'conversaciones'].map((t) => ({ sql: `DELETE FROM ${t} WHERE usuario_id = ?`, args: [o.u.id] })), 'write');
    await ejecutar(db, 'DELETE FROM usuarios WHERE id = ?', [o.u.id]);
    await registrar(db, actor(c), 'usuario.baja', 'usuario', String(o.u.id), { usuario: o.u.usuario, roles: o.u.roles });
    return c.redirect(`${r('/usuarios')}?aviso=usuario-eliminado`);
  });

  // ── Registros: formulario con asistente de IA, planilla y descarga ──
  // El navegador manda y recibe JSON (public/panel-recursos/registros.js); el token CSRF viaja en el encabezado.
  const iaRegistros = (c: C) => process.env.IA_APAGADA !== '1' && Boolean(tokenIA(c));
  app.get('/registros', requiere('registros'), async (c) => c.html(V.vistaRegistros(ctx(c), { planilla: await RG.estado(), ia: iaRegistros(c) })));
  app.post('/registros/guardar', requiere('registros'), async (c) => {
    const { datos, errores } = validarRegistro(await c.req.json().catch(() => ({})));
    if (errores) return c.json({ ok: false, error: 'Revisá los campos marcados.', errores }, 422);
    const u = c.get('usuario')!;
    try {
      const guardado = await RG.agregar(c.get('db'), datos, { id: u.id, nombre: u.nombre || u.usuario, color: u.color });
      await registrar(c.get('db'), actor(c), 'registro.alta', 'registro', String(guardado.id), { socio: datos.socio, producto: datos.producto, codigo: datos.codigo, flete: datos.flete, destino: guardado.destino });
      return c.json({ ok: true, registro: { nombre: datos.nombre, producto: datos.producto }, fecha: guardado.fecha, destino: guardado.destino });
    } catch (e) {
      if (e instanceof RG.ErrorPlanilla) return c.json({ ok: false, error: e.message }, e.status as 409 | 502 | 503 | 504);
      console.error('registros: no se pudo guardar:', e);
      return c.json({ ok: false, error: 'No se pudo guardar. Probá de nuevo.' }, 500);
    }
  });
  const consultasRegistrosHoy = async (c: C) => {
    const inicio = new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' })}T00:00:00-03:00`).toISOString();
    return Number((await una<{ n: number }>(c.get('db'), "SELECT COUNT(*) n FROM auditoria WHERE usuario_id = ? AND accion = 'registro.asistente' AND fecha >= ?", [c.get('usuario')!.id, inicio]))?.n ?? 0);
  };
  app.post('/registros/asistente', requiere('registros'), async (c) => {
    if (!iaRegistros(c)) return c.json({ ok: false, error: process.env.IA_APAGADA === '1' ? 'El asistente está apagado. Completá el formulario a mano.' : 'El asistente funciona en la web publicada en Vercel (usa Vercel AI Gateway). En este equipo no está configurado.' }, 503);
    const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const historial = RA.limpiarHistorial(b.mensajes);
    if (!historial.length || historial.at(-1)!.texto.length < 2) return c.json({ ok: false, error: 'Escribí o dictá los datos del socio y del producto, o adjuntá una foto.' }, 400);
    const { adjuntos = [], error: errorAdjuntos } = RA.limpiarAdjuntos(b.adjuntos);
    if (errorAdjuntos) return c.json({ ok: false, error: errorAdjuntos }, 413);
    if (historial.at(-1)!.texto.length >= RA.MAX_TEXTO) return c.json({ ok: false, error: `El mensaje es demasiado largo (máximo ${RA.MAX_TEXTO} caracteres).` }, 400);
    const limite = Number(process.env.IA_LIMITE_DIA) || 150;
    if ((await consultasRegistrosHoy(c)) >= limite) return c.json({ ok: false, error: 'Llegaste al límite de consultas al asistente de hoy. Completá el formulario a mano.' }, 429);
    try {
      const res = await RA.conversar({ historial, formulario: RA.limpiarFormulario(b.formulario), adjuntos, token: tokenIA(c)!, pedir: asistente?.fetch });
      await registrar(c.get('db'), actor(c), 'registro.asistente', 'registro', null, { adjuntos: adjuntos.length, campos: Object.keys(res.campos) });
      return c.json({ ok: true, ...res });
    } catch (e) {
      if (e instanceof RA.ErrorAsistente) return c.json({ ok: false, error: e.message }, e.status as 502 | 503);
      console.error('registros: el asistente falló:', e);
      return c.json({ ok: false, error: 'El asistente no respondió. Completá el formulario a mano.' }, 502);
    }
  });
  app.get('/registros/planilla', requiere('registros'), async (c) => {
    const db = c.get('db');
    const colores: Record<string, string> = {};
    for (const x of await U.listarUsuarios(db)) if (x.color) colores[x.nombre || x.usuario] = x.color;
    const planilla = await RG.estado();
    if (planilla.modo === 'google' && planilla.listo) {
      // Con la hoja conectada se muestra lo que hay en la hoja ahora, no la constancia guardada en la base.
      try {
        const h = await RG.listarHoja(c.req.query('pestana'));
        return c.html(V.vistaPlanilla(ctx(c), { planilla, registros: h.registros, total: h.total, colores, pestana: h.pestana, pestanas: h.pestanas }));
      } catch (e) {
        if (!(e instanceof RG.ErrorPlanilla)) throw e;
        return c.html(V.vistaPlanilla(ctx(c), { planilla: { ...planilla, listo: false, aviso: e.message }, registros: [], total: 0, colores }));
      }
    }
    return c.html(V.vistaPlanilla(ctx(c), { planilla, registros: await RG.listar(db), total: await RG.contar(db), colores }));
  });
  app.get('/registros/planilla.xlsx', requiere('registros'), async (c) => {
    if (RG.modo() !== 'prueba') return c.redirect(`${r('/registros/planilla')}?aviso=planilla-en-google`);
    const nombre = `Registros COPOL (prueba) ${hoyUruguay()}.xlsx`;
    return c.body(new Uint8Array(RG.xlsxPrueba((await RG.listar(c.get('db'), RG.MAX_FILAS_PRUEBA)).reverse())), 200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="registros-copol-prueba.xlsx"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
    });
  });
  app.post('/registros/planilla/vaciar', requiere('usuarios'), async (c) => {
    if (RG.modo() !== 'prueba') return c.redirect(r('/registros/planilla'));
    await RG.vaciar(c.get('db'));
    await registrar(c.get('db'), actor(c), 'registro.vaciar', 'registro', null, { destino: 'Planilla de prueba' });
    return c.redirect(`${r('/registros/planilla')}?aviso=planilla-vaciada`);
  });

  // ── Asistente (solo administradores; los cambios se aplican solo al confirmarlos) ──
  // Cada conversación queda en el historial del usuario (panel/src/conversaciones.ts).
  const tokenIA = (c: C) => (asistente && 'token' in asistente ? asistente.token ?? null : A.tokenGateway(c.req.header('x-vercel-oidc-token')));
  const consultasHoy = async (c: C) => {
    // Uruguay: UTC−3 todo el año.
    const inicio = new Date(`${new Date().toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' })}T00:00:00-03:00`).toISOString();
    const f = await una<{ n: number }>(c.get('db'), "SELECT COUNT(*) n FROM auditoria WHERE usuario_id = ? AND accion = 'asistente.consulta' AND fecha >= ?", [c.get('usuario')!.id, inicio]);
    return Number(f?.n ?? 0);
  };
  const datosAsistente = async (c: C, extra: Partial<V.DatosAsistente> = {}): Promise<V.DatosAsistente> => {
    const db = c.get('db');
    const uid = c.get('usuario')!.id;
    const [historial, pendiente] = await Promise.all([
      CV.listar(db, uid),
      una<{ id: string }>(db, "SELECT id FROM propuestas WHERE usuario_id = ? AND estado = 'pendiente' AND expira_en > ?", [uid, ahora()]),
    ]);
    return {
      disponible: Boolean(tokenIA(c)),
      puedeCambiar: puede(c.get('usuario')!, 'stock'),
      restantes: Math.max(0, config.asistenteLimiteDia - (await consultasHoy(c))),
      modelos: (Object.keys(A.MODELOS) as A.Modelo[]).map((m) => ({ valor: m, nombre: A.MODELOS[m].nombre })),
      modelo: 'rapido',
      historial,
      conversacionId: '',
      mensajes: [],
      pendienteId: pendiente?.id ?? null,
      ...extra,
    };
  };
  const resumen = (cv: CV.Conversacion) => ({ id: cv.id, titulo: cv.titulo, actualizada_en: cv.actualizada_en, cambios: cv.cambios });
  const conversacionDe = (c: C, id: unknown) => CV.obtener(c.get('db'), c.get('usuario')!.id, texto(id, 40));
  const verConversacion = (c: C, cv: CV.Conversacion | null, extra: Partial<V.DatosAsistente> = {}, estado: 200 | 400 | 403 | 404 | 409 | 429 | 502 | 503 = 200) =>
    datosAsistente(c, { conversacionId: cv?.id ?? '', mensajes: cv?.mensajes ?? [], ...extra }).then((d) => c.html(V.vistaAsistente(ctx(c), d), estado));

  app.get('/asistente', requiere('asistente'), async (c) => {
    const pedida = c.req.query('c');
    const cv = pedida ? await conversacionDe(c, pedida) : null;
    if (pedida && !cv) return c.redirect(r('/asistente'));
    return verConversacion(c, cv);
  });
  app.post('/asistente', requiere('asistente'), async (c) => {
    const b = await cuerpo(c);
    const db = c.get('db');
    const uid = c.get('usuario')!.id;
    const quiereJson = c.req.header('accept')?.includes('application/json');
    const modelo: A.Modelo = A.esModelo(b.modelo) ? b.modelo : 'rapido';
    const cv = await conversacionDe(c, b.conversacion);
    // La conversación guardada es la fuente del contexto; sin ella (pruebas, clientes viejos) se usa la que manda el navegador.
    let previo: unknown = [];
    if (cv) previo = cv.mensajes.map(({ rol, texto: t }) => ({ rol, texto: t }));
    else try { previo = typeof b.historial === 'string' ? JSON.parse(b.historial.slice(0, 60_000)) : []; } catch { /* historial inválido: se ignora */ }
    const pregunta = texto(b.pregunta, 1000);
    const historial = pregunta ? A.limpiarHistorial([...(Array.isArray(previo) ? previo : []), { rol: 'usuario', texto: pregunta }]) : [];
    const fallar = async (estado: 400 | 429 | 502 | 503, error: string) =>
      quiereJson ? c.json({ ok: false, error }, estado) : verConversacion(c, cv, { modelo, error }, estado);
    if (!historial.length) return fallar(400, 'Escribí una pregunta.');
    const token = tokenIA(c);
    if (!token) return fallar(503, 'El asistente no está configurado en este entorno: funciona en la web publicada en Vercel.');
    if ((await consultasHoy(c)) >= config.asistenteLimiteDia) return fallar(429, `Llegaste al límite de ${config.asistenteLimiteDia} consultas por día. Mañana podés seguir.`);
    let res: A.Resultado;
    try {
      res = await A.consultar({ historial, modelo, db, origen: new URL(c.req.url).origin, token, usuarioId: uid, roles: c.get('usuario')!.roles, fetch: asistente?.fetch });
    } catch (e) {
      if (e instanceof A.ErrorAsistente) return fallar(502, e.message);
      if ((e as Error).name === 'TimeoutError') return fallar(502, 'El asistente tardó demasiado en responder. Probá con una pregunta más concreta.');
      throw e;
    }
    await registrar(db, actor(c), 'asistente.consulta', 'asistente', null, { modelo: A.MODELOS[modelo].id, pregunta: historial.at(-1)!.texto.slice(0, 300), herramientas: res.herramientas, tokens: res.tokens, propuesta: res.propuesta?.items.length ?? 0 });
    const restantes = Math.max(0, config.asistenteLimiteDia - (await consultasHoy(c)));
    const propuesta = propuestaVisible(res.propuesta);
    const revierte = res.propuesta && 'revertida' in res.propuesta ? (res.propuesta as PR.PropuestaReversion).revertida?.id : undefined;
    const t = ahora();
    const guardada = await CV.guardar(db, uid, cv, [
      { rol: 'usuario', texto: pregunta, fecha: t },
      { rol: 'asistente', texto: res.texto, fecha: t, ...(propuesta ? { propuesta: { ...propuesta, estado: 'pendiente' as const, ...(revierte ? { revierte } : {}) } } : {}) },
    ], propuesta ? CV.reemplazarPendientes : undefined);
    if (quiereJson) return c.json({ ok: true, respuesta: res.texto, restantes, propuesta, conversacion: resumen(guardada) });
    return verConversacion(c, guardada, { modelo });
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
    const cv = await conversacionDe(c, b.conversacion);
    type Extra = { deshacer?: string; estadoTarjeta?: CV.TarjetaGuardada['estado']; resultados?: unknown };
    const responder = async (estado: 200 | 403 | 404 | 409, ok: boolean, mensaje: string, { deshacer, estadoTarjeta, ...resto }: Extra = {}) => {
      let guardada = cv;
      if (cv && (ok || estadoTarjeta)) {
        // La tarjeta cambia de estado y la respuesta queda en la conversación (con la flecha para deshacer, si aplicó algo).
        guardada = await CV.guardar(db, u.id, cv, ok ? [{ rol: 'asistente', texto: mensaje, fecha: ahora(), ...(deshacer ? { deshacer } : {}) }] : [],
          (m) => { if (estadoTarjeta) CV.marcarPropuesta(m, id, estadoTarjeta); });
      }
      const deshecho = estadoTarjeta === 'aplicada' ? guardada?.mensajes.find((m) => m.propuesta?.id === id)?.propuesta?.revierte : undefined;
      if (quiereJson) return c.json({ ok, mensaje, ...(deshacer ? { deshacer } : {}), ...(deshecho ? { deshecho } : {}), ...(guardada ? { conversacion: resumen(guardada) } : {}), ...resto }, estado);
      if (!ok) return verConversacion(c, cv, { error: mensaje }, estado);
      // Sin conversación guardada (enlace viejo): solo se muestra el resultado.
      return guardada ? verConversacion(c, guardada) : datosAsistente(c, { mensajes: [{ rol: 'asistente', texto: mensaje, fecha: ahora() }] }).then((d) => c.html(V.vistaAsistente(ctx(c), d)));
    };
    if (b.accion === 'cancelar') {
      await PR.cancelar(db, id, u.id);
      return responder(200, true, 'Cambios cancelados: no se modificó nada.', { estadoTarjeta: 'cancelada' });
    }
    if (!puede(u, 'stock')) return responder(403, false, MOTIVOS['sin-permiso'][1]);
    const r = await PR.aplicar(db, id, { ...actor(c), id: u.id, usuario: u.usuario }, puede(u, 'productos'));
    if (r.estado !== 'ok') return responder(MOTIVOS[r.estado][0], false, MOTIVOS[r.estado][1], r.estado === 'vencida' ? { estadoTarjeta: 'cancelada' } : {});
    const bien = r.resultados.filter((x) => x.ok);
    const mal = r.resultados.filter((x) => !x.ok);
    const mensaje = [
      `${bien.length} de ${r.resultados.length} ${r.resultados.length === 1 ? 'cambio aplicado' : 'cambios aplicados'} y verificados. La web pública ya los muestra.`,
      ...mal.map((x) => `- No se aplicó ${x.nombre} (${x.codigo ?? 'sin código'}): ${x.error}`),
    ].join('\n');
    return responder(200, true, mensaje, { resultados: r.resultados, estadoTarjeta: 'aplicada', ...(bien.length ? { deshacer: id } : {}) });
  });

  // Flecha "Deshacer" de una respuesta: prepara la vuelta atrás de esos cambios (se confirma como cualquier propuesta).
  app.post('/asistente/propuestas/:id/deshacer', requiere('asistente'), async (c) => {
    const db = c.get('db');
    const u = c.get('usuario')!;
    const b = await cuerpo(c);
    const quiereJson = c.req.header('accept')?.includes('application/json');
    const cv = await conversacionDe(c, b.conversacion);
    if (!puede(u, 'stock')) {
      const error = MOTIVOS['sin-permiso'][1];
      return quiereJson ? c.json({ ok: false, mensaje: error }, 403) : verConversacion(c, cv, { error }, 403);
    }
    const id = texto(c.req.param('id'), 40);
    const p = await PR.prepararReversion(db, u.id, { propuesta: id });
    const propuesta = propuestaVisible(p);
    const n = propuesta?.items.length ?? 0;
    const mensaje = n
      ? `Preparé la vuelta atrás de ${n === 1 ? 'ese cambio' : `esos ${n} cambios`}: cada producto vuelve a como estaba. Revisalo y tocá "Confirmar cambios" para deshacerlo.${p.errores.length ? '\n' + p.errores.map((e) => `- ${e}`).join('\n') : ''}`
      : `No hay nada para deshacer: ${p.errores.join(' ')}`;
    const t = ahora();
    const guardada = await CV.guardar(db, u.id, cv, [
      { rol: 'usuario', texto: 'Deshacer estos cambios', fecha: t },
      { rol: 'asistente', texto: mensaje, fecha: t, ...(propuesta ? { propuesta: { ...propuesta, estado: 'pendiente' as const, revierte: id } } : {}) },
    ], propuesta ? CV.reemplazarPendientes : undefined);
    if (quiereJson) return c.json({ ok: true, mensaje, propuesta, conversacion: resumen(guardada) });
    return verConversacion(c, guardada);
  });

  app.post('/asistente/conversaciones/:id/eliminar', requiere('asistente'), async (c) => {
    await CV.eliminar(c.get('db'), c.get('usuario')!.id, texto(c.req.param('id'), 40));
    return c.req.header('accept')?.includes('application/json') ? c.json({ ok: true }) : c.redirect(r('/asistente'));
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
    return c.html(V.vistaAutorizarClaude(ctx(c), { id: pedido.id, cliente: cliente?.nombre ?? 'Claude', destino: new URL(pedido.redirect_uri).host, puedeCambiar: puede(c.get('usuario')!, 'stock') }));
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
      AC.sesionesAbiertas(db, config.sesionInactividadMin, config.sesionLargaInactividadDias * 1440), AC.equiposRecordados(db),
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
