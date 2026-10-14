// Panel de stock del Bazar: rutas, autenticación, autorización, productos, novedades y usuarios.
// Se monta en /panel del sitio (src/pages/panel/[...ruta].ts) y funciona igual en desarrollo y en Vercel.
import fs from 'node:fs/promises';
import path from 'node:path';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import * as A from './asistente.ts';
import { atenderMcp } from './mcp.ts';
import * as O from './oauth.ts';
import { listarEventos, registrar, type Actor } from './auditoria.ts';
import { BASE, type Config } from './config.ts';
import { ahora, ejecutar, una, type Db } from './db.ts';
import { almacenConfigurado, ErrorImagen, procesarImagen, variante, type Almacen } from './imagenes.ts';
import * as N from './novedades.ts';
import * as P from './productos.ts';
import * as PR from './propuestas.ts';
import { hashFicticio, Limitador, problemaClave, puede, tokenAleatorio, verificarClave, type Permiso } from './seguridad.ts';
import * as U from './usuarios.ts';
import { leerCantidad, rutaInterna, texto, validarNovedad, validarProducto, validarUsuarioNuevo, type Campos } from './validacion.ts';
import * as V from './vistas.ts';

type Vars = { usuario: U.UsuarioPublico | null; sesion: U.Sesion | null; csrf: string; ip: string | null; db: Db };
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
};

export interface OpcionesApp {
  /** Base de datos (o función que la obtiene en el primer uso). */
  db: Db | (() => Promise<Db>);
  config: Config;
  /** Almacenamiento de imágenes; por defecto Vercel Blob si está configurado, si no, carpeta local. */
  almacen?: Almacen;
  /** Solo para pruebas: `fetch` y token del asistente en lugar de Vercel AI Gateway. */
  asistente?: { fetch?: typeof fetch; token?: string | null };
}

export function crearApp({ db: fuenteDb, config, almacen, asistente }: OpcionesApp) {
  const app = new Hono<Env>({ strict: false }).basePath(BASE);
  const obtenerDb = typeof fuenteDb === 'function' ? fuenteDb : async () => fuenteDb;
  const guardarEn = almacen ?? almacenConfigurado(config.dirImagenes, r('/media'));
  const limiteIp = new Limitador(20, 15 * 60_000);
  const esApiClaude = (c: C) => [r('/mcp'), r('/oauth/token'), r('/oauth/registro')].includes(c.req.path.replace(/\/$/, ''));
  const segura = (c: C) => new URL(c.req.url).protocol === 'https:';
  const nombreCookie = (c: C, base: string) => (segura(c) ? `__Host-${base}` : base);
  const opcionesCookie = (c: C) => ({ httpOnly: true, secure: segura(c), sameSite: 'Strict' as const, path: '/' });

  // ── Encabezados de seguridad, IP y errores ──
  app.use('*', async (c, next) => {
    let ip = c.env?.ip ?? null;
    if (config.confiarProxy) ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() || ip;
    c.set('ip', ip);
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
    ...extra,
  });
  const actor = (c: C): Actor => ({ id: c.get('usuario')?.id ?? null, usuario: c.get('usuario')?.usuario ?? null, ip: c.get('ip') });
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

  const requiere = (permiso: Permiso): MiddlewareHandler<Env> => async (c, next) => {
    const u = c.get('usuario');
    if (!u) return c.req.method === 'GET' ? c.redirect(`${r('/ingresar')}?volver=${encodeURIComponent(c.req.path)}`) : c.redirect(`${r('/ingresar')}?aviso=sesion-vencida`);
    if (u.debe_cambiar_clave && !c.req.path.startsWith(r('/perfil/clave'))) return c.redirect(r('/perfil/clave'));
    if (!puede(u.rol, permiso)) return c.html(V.vistaError(ctx(c), 403, 'Sin permiso', 'Tu rol no permite esta acción. Pedile acceso a un administrador.'), 403);
    await next();
  };

  // ── Ingreso y salida ──
  app.get('/ingresar', (c) => (c.get('usuario') ? c.redirect(r()) : c.html(V.vistaIngreso(ctx(c), null))));
  app.post('/ingresar', async (c) => {
    const db = c.get('db');
    const b = await cuerpo(c);
    const usuario = texto(b.usuario, 120).toLowerCase();
    const clave = typeof b.clave === 'string' ? b.clave.slice(0, 200) : '';
    const ip = c.get('ip') ?? 'desconocida';
    const fallo = (msg = 'Usuario o contraseña incorrectos.') => c.html(V.vistaIngreso(ctx(c), msg, usuario), 401);
    if (limiteIp.excedido(ip)) {
      await registrar(db, { id: null, usuario, ip }, 'sesion.ingreso-fallido', 'usuario', usuario, { motivo: 'límite por IP' });
      return c.html(V.vistaIngreso(ctx(c), 'Demasiados intentos desde esta conexión. Esperá 15 minutos.', usuario), 429);
    }
    const u = usuario ? await U.buscarPorUsuario(db, usuario) : undefined;
    // Siempre se calcula un hash, exista o no el usuario, para no revelar cuáles existen.
    const ok = await verificarClave(clave, u?.hash ?? (await hashFicticio()));
    if (u?.bloqueado_hasta && Date.parse(u.bloqueado_hasta) > Date.now()) {
      limiteIp.registrar(ip);
      return fallo('La cuenta está bloqueada temporalmente por intentos fallidos. Probá en 15 minutos.');
    }
    if (!u || !ok || !u.activo) {
      limiteIp.registrar(ip);
      if (u) {
        const intentos = Number(u.intentos_fallidos) + 1;
        const bloquear = intentos >= 5;
        await ejecutar(db, 'UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id = ?', [bloquear ? 0 : intentos, bloquear ? new Date(Date.now() + 15 * 60_000).toISOString() : null, u.id]);
        await registrar(db, { id: u.id, usuario: u.usuario, ip }, bloquear ? 'sesion.bloqueo' : 'sesion.ingreso-fallido', 'usuario', String(u.id));
      } else {
        await registrar(db, { id: null, usuario: usuario || null, ip }, 'sesion.ingreso-fallido', 'usuario', null, { motivo: 'usuario inexistente' });
      }
      return fallo();
    }
    await ejecutar(db, 'UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = ? WHERE id = ?', [ahora(), u.id]);
    limiteIp.limpiar(ip);
    await U.purgarSesionesVencidas(db);
    const token = await U.crearSesion(db, Number(u.id), config.sesionMaxHoras, ip, c.req.header('user-agent') ?? null);
    setCookie(c, nombreCookie(c, 'copol_panel'), token, { ...opcionesCookie(c), maxAge: config.sesionMaxHoras * 3600 });
    deleteCookie(c, nombreCookie(c, 'copol_pre'), opcionesCookie(c));
    await registrar(db, { id: Number(u.id), usuario: u.usuario, ip }, 'sesion.ingreso', 'usuario', String(u.id));
    return c.redirect(u.debe_cambiar_clave ? r('/perfil/clave') : rutaInterna(c.req.query('volver'), r()));
  });
  app.post('/salir', async (c) => {
    const token = getCookie(c, nombreCookie(c, 'copol_panel'));
    if (token) await U.cerrarSesion(c.get('db'), token);
    if (c.get('usuario')) await registrar(c.get('db'), actor(c), 'sesion.salida', 'usuario', String(c.get('usuario')!.id));
    deleteCookie(c, nombreCookie(c, 'copol_panel'), opcionesCookie(c));
    return c.redirect(r('/ingresar'));
  });

  // ── Perfil: cada usuario cambia su propia contraseña ──
  app.get('/perfil', requiere('ver'), async (c) => c.html(V.vistaPerfil(ctx(c), null, await O.conexionesDe(c.get('db'), c.get('usuario')!.id), `${new URL(c.req.url).origin}/panel/mcp`)));
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
    if (error) return c.html(u.debe_cambiar_clave ? V.vistaCambioObligatorio(ctx(c), error) : V.vistaPerfil(ctx(c), error, await O.conexionesDe(db, u.id), `${new URL(c.req.url).origin}/panel/mcp`), 400);
    await U.cambiarClave(db, u.id, nueva, false);
    await U.cerrarSesionesDe(db, u.id, c.get('sesion')!.id_hash);
    await registrar(db, actor(c), 'clave.cambio', 'usuario', String(u.id));
    return c.redirect(`${r('/perfil')}?aviso=clave-cambiada`);
  });

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
    const v = validarUsuarioNuevo(b);
    const clave = typeof b.clave === 'string' ? b.clave : '';
    const errClave = problemaClave(clave, v.usuario.split('@')[0] || 'x');
    if (errClave) v.errores.clave = errClave;
    if (!v.errores.usuario && (await U.buscarPorUsuario(db, v.usuario))) v.errores.usuario = 'Ese usuario ya existe.';
    if (Object.keys(v.errores).length) return c.html(V.vistaUsuarios(ctx(c), await U.listarUsuarios(db), v.errores, { usuario: v.usuario, rol: v.rol }), 400);
    const id = await U.crearUsuario(db, { usuario: v.usuario, rol: v.rol, clave, debeCambiar: true, creadoPor: c.get('usuario')!.usuario });
    await registrar(db, actor(c), 'usuario.alta', 'usuario', String(id), { usuario: v.usuario, rol: v.rol });
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
    const errores: Record<string, string> = {};
    if (!['administrador', 'editor', 'visualizador'].includes(rol)) errores.rol = 'Rol inválido.';
    if (u.rol === 'administrador' && (rol !== 'administrador' || !activo) && (await U.contarAdminsActivos(db)) <= 1) errores.rol = 'Tiene que quedar al menos un administrador activo.';
    if (Object.keys(errores).length) return c.html(V.vistaEditarUsuario(ctx(c), u, errores), 400);
    await ejecutar(db, 'UPDATE usuarios SET rol = ?, activo = ? WHERE id = ?', [rol, activo, u.id]);
    if (!activo || rol !== u.rol) await U.cerrarSesionesDe(db, u.id);
    await registrar(db, actor(c), 'usuario.edicion', 'usuario', String(u.id), { usuario: u.usuario, cambios: { rol: [u.rol, rol], activo: [u.activo, activo] } });
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
    await registrar(db, actor(c), 'usuario.clave', 'usuario', String(o.u.id), { usuario: o.u.usuario });
    return c.redirect(`${r('/usuarios')}?aviso=clave-restablecida`);
  });
  app.post('/usuarios/:id/eliminar', requiere('usuarios'), async (c) => {
    const db = c.get('db');
    const o = await objetivo(c);
    if (!o.ok) return o.res;
    if (o.u.rol === 'administrador' && o.u.activo && (await U.contarAdminsActivos(db)) <= 1) return c.html(V.vistaError(ctx(c), 400, 'No permitido', 'Tiene que quedar al menos un administrador activo.'), 400);
    await ejecutar(db, 'DELETE FROM sesiones WHERE usuario_id = ?', [o.u.id]);
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
      res = await A.consultar({ historial, modelo, db: c.get('db'), origen: new URL(c.req.url).origin, token, usuarioId: c.get('usuario')!.id, fetch: asistente?.fetch });
    } catch (e) {
      if (e instanceof A.ErrorAsistente) return fallar(502, e.message);
      if ((e as Error).name === 'TimeoutError') return fallar(502, 'Claude tardó demasiado en responder. Probá con una pregunta más concreta.');
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
  const origenDe = (c: C) => new URL(c.req.url).origin;
  const recursoMcp = (c: C) => `${origenDe(c)}/panel/mcp`;
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
      c.header('WWW-Authenticate', `Bearer resource_metadata="${origenDe(c)}/.well-known/oauth-protected-resource/panel/mcp", scope="${O.ALCANCE}"`);
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

  // ── Registro de cambios ──
  app.get('/registro', requiere('auditoria'), async (c) => {
    const pagina = Math.max(1, Number(c.req.query('pagina')) || 1);
    const eventos = await listarEventos(c.get('db'), { limite: 101, desde: (pagina - 1) * 100 });
    return c.html(V.vistaRegistro(ctx(c), eventos.slice(0, 100), pagina, eventos.length > 100));
  });

  return app;
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 90);
