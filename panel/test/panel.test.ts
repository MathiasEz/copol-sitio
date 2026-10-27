// Pruebas de seguridad y funcionamiento del panel: `npm run panel:test` (node:test).
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import sharp from 'sharp';
import { crearApp } from '../src/app.ts';
import { limpiarHistorial, textoDePagina } from '../src/asistente.ts';
import { cargarConfig } from '../src/config.ts';
import { ahora, conectar, una, type Db } from '../src/db.ts';
import { almacenConfigurado } from '../src/imagenes.ts';
import { novedadesPublicadas } from '../src/novedades.ts';
import { htmlBanner, obtenerBanner, vigentes } from '../src/banner.ts';
import { obtenerOfertas, piezasVigentes } from '../src/ofertas.ts';
import { obtenerAperturas, proximas } from '../src/creditos.ts';
import { cifrar, descifrar, exportarDatos, secretoValido } from '../src/respaldo.ts';
import * as ES from '../src/estadisticas.ts';
import { crearUsuario } from '../src/usuarios.ts';
import * as NT from '../src/notificaciones.ts';
import { guardarPin } from '../src/acceso.ts';
import { BASE as RUTA } from '../src/config.ts';

delete process.env.BLOB_READ_WRITE_TOKEN; // las pruebas guardan imágenes en una carpeta temporal
const BASE = 'http://localhost:4321';
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'copol-panel-'));
const config = { ...cargarConfig({}), dirImagenes: path.join(dir, 'imagenes'), confiarProxy: false, conectorClaude: true };
// PIN de entrada de las pruebas (no es un dato real).
const PIN = '480317';
let db: Db;
let app: ReturnType<typeof crearApp>;
// Contraseña generada para esta prueba (no es una credencial real).
const CLAVE = 'Prueba-Panel-2026!';
const fila = <T>(sql: string, args: (string | number)[] = []) => una<T>(db, sql, args);

/** Cliente mínimo que conserva cookies y extrae el token CSRF de los formularios. */
class Navegador {
  usuario = '';
  cookies = new Map<string, string>();
  csrf = '';
  /** `pinAutomatico`: si el panel pide el PIN, lo ingresa y repite el pedido (como haría la persona). */
  propia: ReturnType<typeof crearApp> | null;
  pinAutomatico: boolean;
  constructor(propia: ReturnType<typeof crearApp> | null = null, pinAutomatico = true) {
    this.propia = propia;
    this.pinAutomatico = pinAutomatico;
  }
  get app() { return this.propia ?? app; }
  async pedir(ruta: string, init: RequestInit & { origen?: string | null } = {}): Promise<Response> {
    const res = await this.pedirUnaVez(ruta, init);
    if (this.pinAutomatico && res.status === 302 && res.headers.get('location')?.startsWith(`${RUTA}/pin`) && ruta !== `${RUTA}/pin`) {
      await this.pedirUnaVez(`${RUTA}/pin`);
      const fd = new FormData();
      fd.set('_csrf', this.csrf);
      fd.set('pin', PIN);
      const r = await this.pedirUnaVez(`${RUTA}/pin`, { method: 'POST', body: fd });
      assert.equal(r.status, 302, 'PIN de prueba aceptado');
      return this.pedirUnaVez(ruta, init);
    }
    return res;
  }
  async pedirUnaVez(ruta: string, init: RequestInit & { origen?: string | null } = {}) {
    const headers = new Headers(init.headers);
    if (this.cookies.size) headers.set('cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '));
    if (init.method === 'POST' && init.origen !== null) headers.set('origin', init.origen ?? BASE);
    const res = await this.app.request(BASE + ruta, { ...init, headers, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [par] = c.split(';');
      const [k, v] = par.split('=');
      if (/Max-Age=0/i.test(c) || v === '') this.cookies.delete(k); else this.cookies.set(k, v);
    }
    if (res.headers.get('content-type')?.includes('text/html')) {
      const m = (await res.clone().text()).match(/name="_csrf" value="([^"]+)"/);
      if (m) this.csrf = m[1];
    }
    return res;
  }
  async post(ruta: string, campos: Record<string, string | string[] | Blob>, extra: RequestInit & { origen?: string | null } = {}) {
    const fd = new FormData();
    if (!('_csrf' in campos)) fd.set('_csrf', this.csrf);
    for (const [k, v] of Object.entries(campos)) {
      if (Array.isArray(v)) for (const x of v) fd.append(k, x); else fd.set(k, v);
    }
    return this.pedir(ruta, { method: 'POST', body: fd, ...extra });
  }
  /** POST en JSON con el token CSRF en el encabezado (así habla registros.js con el servidor). */
  async postJson(ruta: string, datos: unknown, extra: RequestInit = {}) {
    return this.pedir(ruta, { method: 'POST', body: JSON.stringify(datos), headers: { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': this.csrf }, ...extra });
  }
  async ingresar(usuario: string, clave = CLAVE) {
    await this.pedir(`${RUTA}/ingresar`);
    return this.post(`${RUTA}/ingresar`, { usuario, clave });
  }
}
const json = { headers: { accept: 'application/json' } };
const png = async (w = 600, h = 400) => new File([new Uint8Array(await sharp({ create: { width: w, height: h, channels: 3, background: '#008d36' } }).png().toBuffer())], 'x.png', { type: 'image/png' });

before(async () => {
  db = await conectar(`file:${path.join(dir, 'prueba.db').replace(/\\/g, '/')}`);
  app = crearApp({ db, config, almacen: almacenConfigurado(config.dirImagenes, `${RUTA}/media`), correo: null });
  const t = ahora();
  await db.batch([
    "INSERT INTO rubros (id, nombre) VALUES ('bazar', 'Bazar')",
    "INSERT INTO categorias (rubro_id, id, nombre, orden) VALUES ('bazar', 'audio', 'Audio', 0), ('bazar', 'hogar', 'Hogar', 1)",
    { sql: "INSERT INTO productos (id, rubro_id, codigo, nombre, categoria_id, imagen, stock_estado, origen, creado_en, actualizado_en) VALUES ('parlante-1', 'bazar', '100001', 'PARLANTE PRUEBA', 'audio', 'bazar/parlante-1.webp', 'con-stock', 'importado', ?, ?)", args: [t, t] },
    { sql: "INSERT INTO productos (id, rubro_id, codigo, nombre, categoria_id, imagen, stock_estado, origen, creado_en, actualizado_en) VALUES ('estufa-2', 'bazar', '100002', 'ESTUFA PRUEBA', 'hogar', NULL, 'sin-stock', 'importado', ?, ?)", args: [t, t] },
  ], 'write');
  await crearUsuario(db, { usuario: 'principal', roles: ['administrador'], clave: CLAVE, debeCambiar: false, protegido: true, creadoPor: null });
  await crearUsuario(db, { usuario: 'admin2', roles: ['administrador'], clave: CLAVE, debeCambiar: false, creadoPor: null });
  await crearUsuario(db, { usuario: 'editor', roles: ['editor'], clave: CLAVE, debeCambiar: false, creadoPor: null });
  await crearUsuario(db, { usuario: 'lector', roles: ['visualizador'], clave: CLAVE, debeCambiar: false, creadoPor: null });
  await crearUsuario(db, { usuario: 'nuevo', roles: ['editor'], clave: CLAVE, debeCambiar: true, creadoPor: null });
  await db.execute("UPDATE usuarios SET correo = usuario || '@copol.test'");
  await guardarPin(db, PIN);
});
after(async () => {
  db.close();
  await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe('autenticación', () => {
  it('sin sesión redirige al ingreso, también en rutas internas', async () => {
    const n = new Navegador();
    for (const ruta of [`${RUTA}`, `${RUTA}/productos`, `${RUTA}/usuarios`, `${RUTA}/novedades`, `${RUTA}/banner`, `${RUTA}/registro`, `${RUTA}/nuevo`, `${RUTA}/perfil`]) {
      const r = await n.pedir(ruta);
      assert.equal(r.status, 302, ruta);
      assert.match(r.headers.get('location')!, new RegExp(`^${RUTA}/ingresar`));
    }
  });
  it('rechaza contraseña incorrecta y usuario inexistente con el mismo mensaje', async () => {
    const a = await new Navegador().ingresar('editor', 'incorrecta-123');
    const b = await new Navegador().ingresar('no-existe', 'incorrecta-123');
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.match(await a.text(), /Usuario o contraseña incorrectos/);
    assert.match(await b.text(), /Usuario o contraseña incorrectos/);
  });
  it('rechaza el ingreso sin token CSRF o desde otro origen', async () => {
    const n = new Navegador();
    await n.pedir(`${RUTA}/ingresar`);
    assert.equal((await n.post(`${RUTA}/ingresar`, { usuario: 'editor', clave: CLAVE, _csrf: 'falso' })).status, 403);
    assert.equal((await n.post(`${RUTA}/ingresar`, { usuario: 'editor', clave: CLAVE }, { origen: 'https://atacante.example' })).status, 403);
  });
  it('ingresa con cookie HttpOnly SameSite=Strict y cierra sesión', async () => {
    const n = new Navegador();
    await n.pedir(`${RUTA}/ingresar`);
    const r = await n.post(`${RUTA}/ingresar`, { usuario: 'editor', clave: CLAVE });
    assert.equal(r.status, 302);
    const cookie = r.headers.getSetCookie().find((c) => c.startsWith('copol_panel='))!;
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.equal((await n.pedir(`${RUTA}`)).status, 200);
    await n.post(`${RUTA}/salir`, {});
    assert.equal((await n.pedir(`${RUTA}`)).status, 302);
  });
  it('obliga a cambiar la contraseña temporal antes de usar el panel', async () => {
    const n = new Navegador();
    assert.equal((await n.ingresar('nuevo')).headers.get('location'), `${RUTA}/perfil/clave`);
    assert.equal((await n.pedir(`${RUTA}/productos`)).headers.get('location'), `${RUTA}/perfil/clave`);
    await n.pedir(`${RUTA}/perfil/clave`);
    assert.equal((await n.post(`${RUTA}/perfil/clave`, { actual: CLAVE, nueva: 'corta', repetir: 'corta' })).status, 400);
    assert.equal((await n.post(`${RUTA}/perfil/clave`, { actual: CLAVE, nueva: 'Otra-Clave-Segura-9', repetir: 'Otra-Clave-Segura-9' })).status, 302);
    assert.equal((await n.pedir(`${RUTA}/productos`)).status, 200);
  });
  it('bloquea la cuenta tras 5 intentos fallidos', async () => {
    await crearUsuario(db, { usuario: 'victima', roles: ['visualizador'], clave: CLAVE, debeCambiar: false, creadoPor: null });
    for (let i = 0; i < 5; i++) await new Navegador().ingresar('victima', 'mal-' + i);
    const r = await new Navegador().ingresar('victima', CLAVE);
    assert.equal(r.status, 401);
    assert.match(await r.text(), /bloqueada temporalmente/);
  });
});

describe('autorización por rol (del lado del servidor)', () => {
  it('el visualizador puede consultar pero no modificar', async () => {
    const n = new Navegador();
    await n.ingresar('lector');
    assert.equal((await n.pedir(`${RUTA}/productos?q=parlante`)).status, 200);
    assert.equal((await n.post(`${RUTA}/productos/parlante-1/stock`, { estado: 'sin-stock' })).status, 403);
    for (const ruta of [`${RUTA}/nuevo`, `${RUTA}/usuarios`, `${RUTA}/novedades`, `${RUTA}/banner`]) assert.equal((await n.pedir(ruta)).status, 403, ruta);
    assert.equal((await fila<{ stock_estado: string }>("SELECT stock_estado FROM productos WHERE id = 'parlante-1'"))!.stock_estado, 'con-stock');
  });
  it('el editor no administra usuarios, novedades ni registro', async () => {
    const n = new Navegador();
    await n.ingresar('editor');
    for (const ruta of [`${RUTA}/usuarios`, `${RUTA}/registro`, `${RUTA}/novedades`, `${RUTA}/banner`, `${RUTA}/banner/nueva`, `${RUTA}/ofertas`, `${RUTA}/creditos`]) assert.equal((await n.pedir(ruta)).status, 403, ruta);
    await n.pedir(`${RUTA}/productos`);
    assert.equal((await n.post(`${RUTA}/usuarios`, { usuario: 'xx-1', roles: ['administrador'], clave: 'Clave-Larga-123!' })).status, 403);
  });
  it('nadie más que el propio administrador principal puede modificarlo o eliminarlo', async () => {
    const n = new Navegador();
    await n.ingresar('admin2');
    const p = (await fila<{ id: number }>("SELECT id FROM usuarios WHERE usuario = 'principal'"))!;
    await n.pedir(`${RUTA}/usuarios`);
    assert.equal((await n.post(`${RUTA}/usuarios/${p.id}/eliminar`, {})).status, 403);
    assert.equal((await n.post(`${RUTA}/usuarios/${p.id}`, { roles: ['visualizador'] })).status, 403);
    assert.equal((await n.post(`${RUTA}/usuarios/${p.id}/clave`, { clave: 'Clave-Nueva-12345!' })).status, 403);
  });
});

describe('stock: guardado verificado', () => {
  it('confirma solo después de releer la base y la web pública lee el mismo valor', async () => {
    const n = new Navegador();
    await n.ingresar('editor');
    await n.pedir(`${RUTA}/productos`);
    const v = (await fila<{ version: number }>("SELECT version FROM productos WHERE id = 'parlante-1'"))!.version;
    const r = await n.post(`${RUTA}/productos/parlante-1/stock`, { estado: 'sin-stock', cantidad: '', version: String(v) }, json);
    const d = await r.json();
    assert.equal(r.status, 200);
    assert.equal(d.ok, true);
    assert.equal(d.verificado, true);
    assert.equal(d.estado, 'sin-stock');
    // La misma consulta que usa src/lib/inventario.ts para la web pública.
    const publica = await fila<{ stock_estado: string }>("SELECT p.stock_estado FROM productos p JOIN categorias c ON c.rubro_id = p.rubro_id AND c.id = p.categoria_id WHERE p.id = 'parlante-1' AND p.publicado = 1");
    assert.equal(publica!.stock_estado, 'sin-stock');
    const ev = await fila<{ accion: string; usuario: string }>("SELECT accion, usuario FROM auditoria WHERE entidad_id = 'parlante-1' ORDER BY id DESC");
    assert.deepEqual({ ...ev }, { accion: 'stock.cambio', usuario: 'editor' });
    // Y vuelta a "Con stock".
    const r2 = await (await n.post(`${RUTA}/productos/parlante-1/stock`, { estado: 'con-stock', version: String(d.version) }, json)).json();
    assert.deepEqual([r2.verificado, r2.estado], [true, 'con-stock']);
  });
  it('la cantidad define el estado (0 = sin stock) y detecta ediciones simultáneas', async () => {
    const n = new Navegador();
    await n.ingresar('editor');
    await n.pedir(`${RUTA}/productos`);
    const v = (await fila<{ version: number }>("SELECT version FROM productos WHERE id = 'estufa-2'"))!.version;
    const a = await (await n.post(`${RUTA}/productos/estufa-2/stock`, { estado: 'sin-stock', cantidad: '7', version: String(v) }, json)).json();
    assert.deepEqual([a.estado, a.cantidad], ['con-stock', 7]);
    const b = await (await n.post(`${RUTA}/productos/estufa-2/stock`, { estado: 'con-stock', cantidad: '0', version: String(a.version) }, json)).json();
    assert.deepEqual([b.estado, b.cantidad], ['sin-stock', 0]);
    assert.equal((await n.post(`${RUTA}/productos/estufa-2/stock`, { estado: 'con-stock', version: String(v) }, json)).status, 409);
    assert.equal((await n.post(`${RUTA}/productos/estufa-2/stock`, { estado: 'con-stock', cantidad: '-3' }, json)).status, 400);
  });
  it('al guardar renueva la copia de la web pública en la CDN (solo lo que cambió)', async () => {
    // Contexto de una función de Vercel simulado: registra los borrados por etiqueta que pide el panel.
    const borradas: string[][] = [];
    const contexto = Symbol.for('@vercel/request-context');
    const g = globalThis as unknown as Record<symbol, unknown>;
    g[contexto] = { get: () => ({ purge: { dangerouslyDeleteByTag: async (t: string | string[]) => { borradas.push([t].flat()); } } }) };
    process.env.VERCEL = '1';
    try {
      const n = new Navegador();
      await n.ingresar('editor');
      assert.deepEqual(borradas, [], 'ingresar no toca la web pública');
      await n.pedir(`${RUTA}/productos`);
      const v = (await fila<{ version: number }>("SELECT version FROM productos WHERE id = 'parlante-1'"))!.version;
      const d = await (await n.post(`${RUTA}/productos/parlante-1/stock`, { estado: 'sin-stock', cantidad: '', version: String(v) }, json)).json();
      assert.equal(d.verificado, true);
      assert.deepEqual(borradas, [['bazar']]);
      // Guardar sin cambios no renueva nada.
      const igual = await (await n.post(`${RUTA}/productos/parlante-1/stock`, { estado: 'sin-stock', cantidad: '', version: String(d.version) }, json)).json();
      assert.deepEqual(borradas, [['bazar']]);
      await n.post(`${RUTA}/productos/parlante-1/stock`, { estado: 'con-stock', version: String(igual.version) }, json);
      assert.deepEqual(borradas, [['bazar'], ['bazar']]);
    } finally {
      delete g[contexto];
      delete process.env.VERCEL;
    }
  });
  it('sin JavaScript también guarda y redirige con la confirmación', async () => {
    const n = new Navegador();
    await n.ingresar('editor');
    await n.pedir(`${RUTA}/productos`);
    const v = (await fila<{ version: number }>("SELECT version FROM productos WHERE id = 'parlante-1'"))!.version;
    const r = await n.post(`${RUTA}/productos/parlante-1/stock`, { estado: 'sin-stock', version: String(v), volver: `${RUTA}/productos?q=parlante` });
    assert.equal(r.status, 302);
    assert.match(r.headers.get('location')!, new RegExp(`^${RUTA}/productos\\?q=parlante&aviso=stock-guardado`));
    assert.equal((await fila<{ stock_estado: string }>("SELECT stock_estado FROM productos WHERE id = 'parlante-1'"))!.stock_estado, 'sin-stock');
  });
});

describe('productos e imágenes', () => {
  it('muestra la etiqueta "Código interno COPOL" y el botón de escaneo', async () => {
    const n = new Navegador();
    await n.ingresar('editor');
    assert.match(await (await n.pedir(`${RUTA}/productos`)).text(), /Código interno COPOL 100001/);
    const form = await (await n.pedir(`${RUTA}/nuevo`)).text();
    assert.match(form, /Código interno COPOL/);
    assert.match(form, /data-escanear/);
  });
  it('valida categoría existente, código único y ausencia de precios', async () => {
    const n = new Navegador();
    await n.ingresar('editor');
    await n.pedir(`${RUTA}/nuevo`);
    assert.match(await (await n.post(`${RUTA}/nuevo`, { nombre: 'Producto X', categoria: 'inventada', estado: 'con-stock' })).text(), /categorías existentes/);
    assert.match(await (await n.post(`${RUTA}/nuevo`, { nombre: 'Producto X', codigo: '100001', categoria: 'audio', estado: 'con-stock' })).text(), /Ya existe un producto con ese código interno COPOL/);
    assert.match(await (await n.post(`${RUTA}/nuevo`, { nombre: 'Producto X', categoria: 'audio', estado: 'con-stock', descripcion: 'Oferta a $ 1.990' })).text(), /no publica precios/);
  });
  it('rechaza archivos que no son imágenes aunque digan serlo', async () => {
    const n = new Navegador();
    await n.ingresar('editor');
    await n.pedir(`${RUTA}/nuevo`);
    const falso = new File([new TextEncoder().encode('<?php echo 1; ?>')], 'foto.jpg', { type: 'image/jpeg' });
    const r = await n.post(`${RUTA}/nuevo`, { nombre: 'Con imagen falsa', categoria: 'audio', estado: 'con-stock', imagen: falso });
    assert.equal(r.status, 400);
    assert.match(await r.text(), /no es una imagen válida/);
  });
  it('agrega un producto con código escaneado o manual e imagen en dos tamaños WebP', async () => {
    const n = new Navegador();
    await n.ingresar('editor');
    await n.pedir(`${RUTA}/nuevo`);
    const r = await n.post(`${RUTA}/nuevo`, { codigo: '7791234567890', nombre: 'Producto de prueba', categoria: 'hogar', estado: '', cantidad: '3', imagen: await png() });
    assert.equal(r.status, 302);
    const p = (await fila<{ id: string; imagen: string; stock_estado: string; origen: string }>("SELECT * FROM productos WHERE codigo = '7791234567890'"))!;
    assert.deepEqual([p.stock_estado, p.origen], ['con-stock', 'panel']);
    assert.match(p.imagen, new RegExp(`^${RUTA}/media/productos/producto-de-prueba-7791234567890-[0-9a-f]{10}-800\\.webp$`));
    for (const a of [400, 800]) {
      const archivo = path.join(config.dirImagenes, p.imagen.replace(`${RUTA}/media/`, '').replace('-800.webp', `-${a}.webp`));
      assert.equal((await sharp(archivo).metadata()).format, 'webp');
    }
    assert.equal((await app.request(BASE + p.imagen)).status, 200);
  });
  it('no sirve archivos fuera de la carpeta de imágenes', async () => {
    for (const ruta of [`${RUTA}/media/..%2F..%2Fprueba.db`, `${RUTA}/media/productos/..%2F..%2Fprueba.db`]) assert.equal((await app.request(BASE + ruta)).status, 404, ruta);
  });
});

describe('administración página: banner de inicio', () => {
  it('muestra el contenido inicial con vista previa y lo edita, ordena, programa y elimina', async () => {
    const n = new Navegador();
    await n.ingresar('principal');
    // Sin guardar nada, el banner es el inicial (las cuatro diapositivas del carrusel anterior).
    const inicial = await obtenerBanner(db);
    assert.equal(inicial.diapositivas.length, 4);
    const lista = await (await n.pedir(`${RUTA}/banner`)).text();
    assert.match(lista, /Administración Página/);
    assert.match(lista, /<copol-banner class="bi"/);
    assert.match(lista, /\/panel-recursos\/banner-inicio\.css/);
    assert.doesNotMatch(lista, /style="/, 'sin estilos en línea: la política de seguridad del panel los bloquea');

    await n.pedir(`${RUTA}/banner/nueva`);
    // Validaciones: imagen obligatoria, enlaces seguros, sin precios y descripción para "Solo imagen".
    assert.match(await (await n.post(`${RUTA}/banner/nueva`, { titulo: 'Sin imagen', diseno: 'lateral' })).text(), /Subí la imagen/);
    assert.match(await (await n.post(`${RUTA}/banner/nueva`, { titulo: 'Enlace malo', diseno: 'lateral', imagen: await png(1600, 900), boton1_texto: 'Ir', boton1_url: 'javascript:alert(1)' })).text(), /https:\/\//);
    assert.match(await (await n.post(`${RUTA}/banner/nueva`, { titulo: 'Oferta', texto: 'Ahora a $ 990', diseno: 'lateral', imagen: await png(1600, 900) })).text(), /no publica precios/);
    assert.match(await (await n.post(`${RUTA}/banner/nueva`, { titulo: 'Pieza', diseno: 'solo-imagen', imagen: await png(1600, 900) })).text(), /descripción es obligatoria/);
    assert.match(await (await n.post(`${RUTA}/banner/nueva`, { titulo: 'Fechas', diseno: 'lateral', imagen: await png(1600, 900), desde: '2026-12-10', hasta: '2026-12-01' })).text(), /anterior a la de inicio/);

    const r = await n.post(`${RUTA}/banner/nueva`, {
      antetitulo: 'Verano', titulo: 'Nueva temporada', resaltado: 'en Pinecoop', texto: 'Reservá tu cabaña <b>ya</b>.', diseno: 'tarjeta', foco: 'abajo', completa: '1',
      boton1_texto: 'Reservar', boton1_url: '/beneficios/servicios-sociales/pinecoop/', imagen: await png(1600, 900), imagen_movil: await png(900, 900), alt: 'Cabañas de Pinecoop', publicado: '1',
    });
    assert.equal(r.status, 302);
    let banner = await obtenerBanner(db);
    assert.equal(banner.diapositivas.length, 5);
    const nueva = banner.diapositivas.at(-1)!;
    assert.deepEqual([nueva.diseno, nueva.foco, nueva.completa, nueva.boton1?.texto, nueva.boton2], ['tarjeta', 'abajo', true, 'Reservar', null]);
    assert.match(nueva.imagen, /\/media\/banner\/nueva-temporada-[0-9a-f]{10}-1600\.webp$/);
    assert.match(nueva.imagenMovil, /nueva-temporada-celular-[0-9a-f]{10}-1600\.webp$/);
    // El HTML escapa el texto cargado.
    const html = htmlBanner(vigentes(banner), { segundos: banner.segundos });
    assert.match(html, /Reservá tu cabaña &lt;b&gt;ya&lt;\/b&gt;\./);
    assert.match(html, /<source media="\(max-width: 783px\)"/);

    // Orden, despublicación y fechas.
    assert.equal((await n.post(`${RUTA}/banner/${nueva.id}/mover`, { direccion: 'arriba' })).status, 302);
    banner = await obtenerBanner(db);
    assert.equal(banner.diapositivas.at(-2)!.id, nueva.id);
    assert.equal((await n.post(`${RUTA}/banner/${nueva.id}/publicar`, { publicado: '0' })).status, 302);
    assert.ok(!vigentes(await obtenerBanner(db)).some((d) => d.id === nueva.id));
    await n.pedir(`${RUTA}/banner/${nueva.id}`);
    assert.equal((await n.post(`${RUTA}/banner/${nueva.id}`, { titulo: 'Nueva temporada', diseno: 'lateral', publicado: '1', desde: '2099-01-01', quitar_movil: '1' })).status, 302);
    banner = await obtenerBanner(db);
    const editada = banner.diapositivas.find((d) => d.id === nueva.id)!;
    assert.deepEqual([editada.diseno, editada.imagenMovil, editada.imagen], ['lateral', '', nueva.imagen], 'conserva la imagen y quita la del celular');
    assert.ok(!vigentes(banner).some((d) => d.id === nueva.id), 'programada para más adelante');
    assert.match(await (await n.pedir(`${RUTA}/banner`)).text(), /Desde el/);

    // Tiempo entre diapositivas (4 a 12 s).
    assert.equal((await n.post(`${RUTA}/banner/ajustes`, { segundos: '30' })).headers.get('location'), `${RUTA}/banner?aviso=banner-segundos`);
    await n.post(`${RUTA}/banner/ajustes`, { segundos: '8' });
    assert.equal((await obtenerBanner(db)).segundos, 8);

    await n.pedir(`${RUTA}/banner/${nueva.id}`);
    assert.equal((await n.post(`${RUTA}/banner/${nueva.id}/eliminar`, {})).status, 302);
    assert.equal((await obtenerBanner(db)).diapositivas.length, 4);
    const acciones = (await db.execute("SELECT accion FROM auditoria WHERE accion LIKE 'banner.%'")).rows.map((x) => x.accion);
    for (const a of ['banner.alta', 'banner.orden', 'banner.despublicacion', 'banner.edicion', 'banner.ajustes', 'banner.baja']) assert.ok(acciones.includes(a), a);
  });
});

describe('administración página: ofertas, créditos y novedades programadas', () => {
  it('ofertas: muestra las iniciales, sube piezas, describe, ordena, quita, vence y vacía', async () => {
    const n = new Navegador();
    await n.ingresar('principal');
    const inicial = await obtenerOfertas(db);
    assert.equal(inicial.piezas.length, 29);
    assert.match(await (await n.pedir(`${RUTA}/ofertas`)).text(), /Ofertas de octubre/);
    // Subida (como la hace el navegador: de a una, pidiendo JSON) y subida múltiple sin JavaScript.
    const r1 = await n.post(`${RUTA}/ofertas/piezas`, { piezas: await png(1080, 1350) }, json);
    assert.deepEqual(await r1.json(), { ok: true, agregadas: 1, error: null });
    const falso = new File([new TextEncoder().encode('no soy imagen')], 'x.jpg', { type: 'image/jpeg' });
    assert.equal((await n.post(`${RUTA}/ofertas/piezas`, { piezas: falso })).headers.get('location'), `${RUTA}/ofertas?aviso=ofertas-error-subida`);
    let o = await obtenerOfertas(db);
    assert.equal(o.piezas.length, 30);
    const nueva = o.piezas.at(-1)!;
    assert.match(nueva.imagen, /\/media\/ofertas\/x-[0-9a-f]{10}-800\.webp$/);
    // Guardar: título, vencimiento, descripción (con precio: excepción aprobada), orden y quitar.
    await n.pedir(`${RUTA}/ofertas`);
    assert.match(await (await n.post(`${RUTA}/ofertas`, { titulo: 'X', mes: 'noviembre de 2026', hasta: '2026-11-30', accion: 'guardar' })).text(), /título de 3 a 80/);
    const campos: Record<string, string> = { titulo: 'Ofertas de noviembre', mes: 'noviembre de 2026', hasta: '2026-11-30', accion: `arriba:${nueva.id}`, [`alt_${nueva.id}`]: 'Oferta: Yerba 1 kg, a $ 199.', [`quitar_${o.piezas[0].id}`]: '1' };
    assert.equal((await n.post(`${RUTA}/ofertas`, campos)).status, 302);
    o = await obtenerOfertas(db);
    assert.deepEqual([o.titulo, o.hasta, o.piezas.length, o.piezas.at(-2)!.id, o.piezas.at(-2)!.alt], ['Ofertas de noviembre', '2026-11-30', 29, nueva.id, 'Oferta: Yerba 1 kg, a $ 199.']);
    assert.equal(piezasVigentes(o, '2026-11-30').length, 29);
    assert.equal(piezasVigentes(o, '2026-12-01').length, 0, 'vencidas: la sección se retira sola');
    await n.pedir(`${RUTA}/ofertas`);
    assert.equal((await n.post(`${RUTA}/ofertas/vaciar`, {})).status, 302);
    assert.equal((await obtenerOfertas(db)).piezas.length, 0);
  });

  it('créditos: agrega, confirma, quita y oculta las fechas pasadas', async () => {
    const n = new Navegador();
    await n.ingresar('principal');
    assert.deepEqual((await obtenerAperturas(db)).map((a) => a.fecha), ['2026-11-10', '2026-12-08']);
    await n.pedir(`${RUTA}/creditos`);
    assert.match(await (await n.post(`${RUTA}/creditos`, { fecha: '2020-01-01' })).text(), /ya pasó/);
    assert.match(await (await n.post(`${RUTA}/creditos`, { fecha: '2099-02-30' })).text(), /fecha válida/);
    assert.equal((await n.post(`${RUTA}/creditos`, { fecha: '2099-01-12' })).status, 302);
    assert.match(await (await n.post(`${RUTA}/creditos`, { fecha: '2099-01-12', confirmada: '1' })).text(), /ya está cargada/);
    assert.equal((await n.post(`${RUTA}/creditos/confirmar`, { fecha: '2099-01-12', confirmada: '1' })).status, 302);
    let lista = await obtenerAperturas(db);
    assert.deepEqual(lista.at(-1), { fecha: '2099-01-12', confirmada: true });
    assert.deepEqual(proximas(lista, '2026-12-01').map((a) => a.fecha), ['2026-12-08', '2099-01-12']);
    await n.pedir(`${RUTA}/creditos`);
    assert.equal((await n.post(`${RUTA}/creditos/quitar`, { fecha: '2099-01-12' })).status, 302);
    lista = await obtenerAperturas(db);
    assert.equal(lista.length, 2);
  });

  it('novedades programadas: solo se muestran entre sus fechas', async () => {
    const n = new Navegador();
    await n.ingresar('principal');
    await n.pedir(`${RUTA}/novedades/nueva`);
    assert.match(await (await n.post(`${RUTA}/novedades/nueva`, { titulo: 'Fechas mal', plantilla: 'texto', desde: '2026-12-10', hasta: '2026-12-01' })).text(), /anterior a la de inicio/);
    assert.equal((await n.post(`${RUTA}/novedades/nueva`, { titulo: 'De diciembre', texto: 'Solo en diciembre', plantilla: 'texto', publicado: '1', desde: '2099-12-01', hasta: '2099-12-31' })).status, 302);
    const titulos = async (hoy: string) => (await novedadesPublicadas(db, hoy)).map((x) => x.titulo);
    assert.ok(!(await titulos('2099-11-30')).includes('De diciembre'));
    assert.ok((await titulos('2099-12-15')).includes('De diciembre'));
    assert.ok(!(await titulos('2100-01-01')).includes('De diciembre'));
  });
});

describe('estadísticas de la web', () => {
  it('valida los eventos, cuenta sin datos personales y resume en el panel', async () => {
    const host = 'copol.test';
    // Validación: rutas conocidas, panel excluido, origen externo, producto deducido del mensaje de WhatsApp.
    assert.equal(ES.leerEvento({ t: 'vista', r: `${RUTA}/productos` }, host), null);
    assert.equal(ES.leerEvento({ t: 'hackeo', r: '/' }, host), null);
    assert.equal(ES.leerEvento({ t: 'vista', r: '/inventado/<script>' }, host)?.ruta, '/otras/');
    assert.deepEqual(ES.leerEvento({ t: 'vista', r: '/hipermercado/bazar', ref: 'https://www.google.com/search?q=copol', m: true }, host), { tipo: 'vista', ruta: '/hipermercado/bazar/', origen: 'google.com', celular: true, detalle: undefined });
    assert.equal(ES.leerEvento({ t: 'vista', r: '/', ref: `https://${host}/contacto/` }, host)?.origen, undefined, 'navegación interna: sin origen');
    const wa = `https://wa.me/59898872727?text=${encodeURIComponent('Hola! Quiero consultar por el producto: Parlante JBL Go 3 (código interno COPOL 465123)')}`;
    assert.equal(ES.leerEvento({ t: 'whatsapp', r: '/hipermercado/bazar/', u: wa }, host)?.detalle, 'Parlante JBL Go 3 · 465123');
    assert.equal(ES.leerEvento({ t: 'whatsapp', r: '/', u: 'https://malicioso.test/?text=x' }, host)?.detalle, undefined);
    assert.ok(ES.esBot('Mozilla/5.0 HeadlessChrome/120') && ES.esBot(null) && !ES.esBot('Mozilla/5.0 (iPhone) Safari/604.1'));

    const hoy = '2099-03-10';
    const ana = { ip: '203.0.113.5', agente: 'Mozilla/5.0 (iPhone)' };
    await ES.registrarEvento(db, ES.leerEvento({ t: 'vista', r: '/', ref: '', m: true }, host)!, ana, hoy);
    await ES.registrarEvento(db, ES.leerEvento({ t: 'vista', r: '/hipermercado/bazar/', ref: `https://${host}/` }, host)!, ana, hoy);
    await ES.registrarEvento(db, ES.leerEvento({ t: 'vista', r: '/', ref: 'https://facebook.com/' }, host)!, { ip: '198.51.100.7', agente: 'Mozilla/5.0 (Windows)' }, hoy);
    await ES.registrarEvento(db, ES.leerEvento({ t: 'whatsapp', r: '/hipermercado/bazar/', u: wa }, host)!, ana, hoy);
    await ES.registrarEvento(db, ES.leerEvento({ t: 'banner', r: '/', d: 'Llevate tu moto 0 km' }, host)!, ana, hoy);
    const r = await ES.resumen(db, 7, hoy);
    assert.deepEqual(r.totales, { vistas: 3, visitantes: 2, whatsapp: 1, celular: 1, computadora: 2 });
    assert.deepEqual(r.ranking.pagina.map((x) => [x.clave, x.valor]), [['/', 2], ['/hipermercado/bazar/', 1]]);
    assert.deepEqual(r.ranking.origen.map((x) => x.clave).sort(), ['Directo', 'facebook.com']);
    assert.deepEqual(r.ranking.producto, [{ clave: 'Parlante JBL Go 3 · 465123', valor: 1 }]);
    assert.equal(r.dias.length, 7);
    // No se guarda la IP: solo hash anónimos del día.
    const hashes = (await db.execute('SELECT hash FROM visitantes_dia')).rows.map((f) => String(f.hash));
    assert.ok(hashes.length === 2 && hashes.every((h) => !h.includes('203.0.113') && h.length === 32));

    const n = new Navegador();
    await n.ingresar('principal');
    const pagina = await (await n.pedir(`${RUTA}/estadisticas?dias=7`)).text();
    assert.match(pagina, /Vistas de páginas/);
    assert.doesNotMatch(pagina, /style="/);
    const e = new Navegador();
    await e.ingresar('editor');
    assert.equal((await e.pedir(`${RUTA}/estadisticas`)).status, 403);
  });
});

describe('respaldo diario cifrado', () => {
  it('exporta los ajustes, cifra con autenticación y valida el secreto del Cron', async () => {
    const datos = await exportarDatos(db);
    assert.ok(Array.isArray(datos.tablas.ajustes) && datos.tablas.ajustes.length > 0, 'incluye ajustes');
    assert.ok(!('sesiones' in datos.tablas), 'sin sesiones');
    const clave = crypto.randomBytes(24).toString('base64url');
    const archivo = cifrar(JSON.stringify(datos), clave);
    assert.ok(!archivo.includes(Buffer.from('scrypt$')), 'los hash no quedan legibles');
    assert.deepEqual(JSON.parse(descifrar(archivo, clave)), datos);
    assert.throws(() => descifrar(archivo, `${clave}x`), /no coincide/);
    const alterado = Buffer.from(archivo);
    alterado[alterado.length - 1] ^= 1;
    assert.throws(() => descifrar(alterado, clave), /dañado/);
    assert.throws(() => cifrar('x', 'corta'), /24 caracteres/);
    assert.ok(secretoValido('Bearer abc123', 'abc123'));
    assert.ok(!secretoValido('Bearer abc124', 'abc123'));
    assert.ok(!secretoValido(null, 'abc123'));
    assert.ok(!secretoValido('Bearer ', undefined));
  });
});

describe('novedades', () => {
  it('crea, publica, ordena, despublica y valida imágenes', async () => {
    const n = new Navegador();
    await n.ingresar('principal');
    await n.pedir(`${RUTA}/novedades/nueva`);
    // La plantilla con imagen exige imagen; enlaces solo https o rutas del sitio.
    assert.match(await (await n.post(`${RUTA}/novedades/nueva`, { titulo: 'Sin imagen', plantilla: 'imagen-completa' })).text(), /necesita una imagen/);
    assert.match(await (await n.post(`${RUTA}/novedades/nueva`, { titulo: 'Enlace malo', plantilla: 'texto', enlace_texto: 'Ir', enlace_url: 'javascript:alert(1)' })).text(), /https:\/\//);
    assert.equal((await n.post(`${RUTA}/novedades/nueva`, { titulo: 'Primera', texto: 'Texto uno', plantilla: 'imagen-izquierda', imagen: await png(1200, 600), enlace_texto: 'Ver Bazar', enlace_url: '/hipermercado/bazar/', publicado: '1' })).status, 302);
    assert.equal((await n.post(`${RUTA}/novedades/nueva`, { titulo: 'Segunda', texto: 'Solo texto', plantilla: 'texto' })).status, 302);
    let pub = await novedadesPublicadas(db);
    assert.deepEqual(pub.map((x) => x.titulo), ['Primera']);
    assert.match(pub[0].imagen!, /-1600\.webp$/);
    const segunda = (await fila<{ id: number }>("SELECT id FROM novedades WHERE titulo = 'Segunda'"))!;
    await n.pedir(`${RUTA}/novedades`);
    assert.equal((await n.post(`${RUTA}/novedades/${segunda.id}/publicar`, { publicado: '1' })).status, 302);
    assert.equal((await n.post(`${RUTA}/novedades/${segunda.id}/mover`, { direccion: 'arriba' })).status, 302);
    pub = await novedadesPublicadas(db);
    assert.deepEqual(pub.map((x) => x.titulo), ['Segunda', 'Primera']);
    assert.equal((await n.post(`${RUTA}/novedades/${segunda.id}/publicar`, { publicado: '0' })).status, 302);
    assert.deepEqual((await novedadesPublicadas(db)).map((x) => x.titulo), ['Primera']);
    assert.match(await (await n.pedir(`${RUTA}/novedades`)).text(), /Borrador/);
  });
});

describe('información empleados', () => {
  it('la ve todo el personal, con los QR generados; solo el administrador la edita', async () => {
    for (const usuario of ['lector', 'editor']) {
      const n = new Navegador();
      await n.ingresar(usuario);
      const html = await (await n.pedir(`${RUTA}/empleados`)).text();
      assert.match(html, new RegExp(`href="${RUTA}/empleados"[^>]*>.*Información empleados`), `${usuario}: opción en el menú`);
      assert.match(html, /<svg class="qr"[^>]*aria-label="Código QR: Acoso laboral"/);
      assert.match(html, /aria-label="Código QR: ¿Cómo te sentís hoy\?"/);
      assert.match(html, /Tu cooperativa/);
      assert.match(html, /Pinecoop Chuy/);
      // Contenido inicial: enlaces de los QR entregados y las 7 piezas del carrusel, en orden.
      assert.match(html, /href="https:\/\/docs\.google\.com\/forms\/d\/e\/1FAIpQLSeDHOygPj5L5LANRDR1ZcVKAYNSGGDfv0rl9x3R1j1AK3bMmw\/viewform"/);
      assert.match(html, /href="https:\/\/149508\.asset\.memtas\.com\/[^"]+\.pdf/);
      assert.match(html, /href="https:\/\/www\.copol\.com\.uy\/Copolrecibos\/"/);
      assert.match(html, /aria-label="Código QR: Reglamento Interno del Personal"/);
      assert.match(html, /href="https:\/\/docs\.google\.com\/document\/d\/1Og20fKBJAvWLXgwGErY8JNF49a0IKNjk\/edit/);
      assert.match(html, /Ciudad del Plata abre pronto/);
      assert.match(html, /En obras · cooperativapolicial\.com\.uy/);
      const piezas = [...html.matchAll(/\/panel-recursos\/empleados\/([a-z-]+)\.webp/g)].map((m) => m[1]);
      assert.deepEqual(piezas.slice(0, 7), ['hacete-socio', 'parques-y-locales', 'servicios-salud-mental', 'servicios-salud-bucal', 'locales-del-interior', 'garantia-alquiler', 'claro-socios-nuevos']);
      assert.doesNotMatch(html, /empleados\/editar/, `${usuario}: sin botón Editar`);
      assert.equal((await n.pedir(`${RUTA}/empleados/editar`)).status, 403);
      assert.equal((await n.post(`${RUTA}/empleados`, { recibos_url: 'https://ejemplo.com' })).status, 403);
    }
  });
  it('el administrador cambia enlaces y fotos, con validación y registro', async () => {
    const n = new Navegador();
    await n.ingresar('principal');
    assert.match(await (await n.pedir(`${RUTA}/empleados`)).text(), new RegExp(`${RUTA}/empleados/editar`));
    await n.pedir(`${RUTA}/empleados/editar`);
    const malo = await n.post(`${RUTA}/empleados`, { acoso_url: 'javascript:alert(1)', animo_url: '', recibos_url: '' });
    assert.equal(malo.status, 400);
    assert.match(await malo.text(), /https:\/\//);
    assert.equal(await fila("SELECT 1 FROM ajustes WHERE clave = 'portal_empleados'"), undefined, 'con errores no se guarda nada');

    const ok = await n.post(`${RUTA}/empleados`, {
      acoso_url: 'https://intranet.copol.test/protocolo.pdf', animo_url: 'https://forms.copol.test/animo', recibos_url: 'https://recibos.copol.test/',
      quitar_carrusel_0: '1', alt_carrusel_1: 'Parques y locales (descripción editada)',
      nuevas_ciudadDelPlata: await png(1600, 900), alt_nueva_ciudadDelPlata: 'Obra en Ciudad del Plata',
    });
    assert.equal(ok.status, 302);
    assert.equal(ok.headers.get('location'), `${RUTA}/empleados?aviso=empleados-guardado`);
    const html = await (await n.pedir(`${RUTA}/empleados?aviso=empleados-guardado`)).text();
    assert.match(html, /href="https:\/\/recibos\.copol\.test\/"/);
    assert.match(html, /href="https:\/\/intranet\.copol\.test\/protocolo\.pdf"/);
    assert.match(html, /alt="Obra en Ciudad del Plata"/);
    assert.match(html, /src="[^"]*\/empleados\/ciudaddelplata-[0-9a-f]+-800\.webp"/i);
    assert.match(html, /Parques y locales \(descripción editada\)/);
    assert.doesNotMatch(html, /hacete-socio\.webp/, 'la pieza quitada ya no aparece');

    // Ciudad del Plata admite una sola imagen
    await n.pedir(`${RUTA}/empleados/editar`);
    const demas = await n.post(`${RUTA}/empleados`, { acoso_url: 'https://intranet.copol.test/protocolo.pdf', nuevas_ciudadDelPlata: await png(800, 600) });
    assert.equal(demas.status, 400);
    assert.match(await demas.text(), /admite una sola imagen/);
    const ev = await fila<{ detalle: string; usuario: string }>("SELECT detalle, usuario FROM auditoria WHERE accion = 'empleados.edicion' ORDER BY id DESC LIMIT 1");
    assert.equal(ev!.usuario, 'principal');
    assert.match(ev!.detalle, /recibos\.copol\.test/);
  });
});

describe('usuarios', () => {
  it('alta simple con usuario o correo, rol y contraseña temporal; edición y baja', async () => {
    const n = new Navegador();
    await n.ingresar('principal');
    const form = await (await n.pedir(`${RUTA}/usuarios`)).text();
    assert.match(form, /Usuario o correo/);
    assert.doesNotMatch(form, /name="nombre"/);
    assert.equal((await n.post(`${RUTA}/usuarios`, { usuario: 'ana@copol.com.uy', roles: ['visualizador'], clave: 'corta' })).status, 400);
    assert.equal((await n.post(`${RUTA}/usuarios`, { usuario: 'Ana@Copol.com.uy', roles: ['visualizador'], clave: 'Temporal-Segura-1' })).status, 302);
    const ana = (await fila<{ id: number; rol: string; debe_cambiar_clave: number; hash: string }>("SELECT * FROM usuarios WHERE usuario = 'ana@copol.com.uy'"))!;
    assert.equal(ana.rol, 'visualizador');
    assert.equal((await fila<{ roles: string }>("SELECT roles FROM usuarios WHERE id = ?", [ana.id]))!.roles, 'visualizador');
    assert.equal(ana.debe_cambiar_clave, 1);
    assert.match(ana.hash, /^scrypt\$/);
    assert.ok(!ana.hash.includes('Temporal-Segura-1'));
    const ingreso = await new Navegador().ingresar('ana@copol.com.uy', 'Temporal-Segura-1');
    assert.equal(ingreso.headers.get('location'), `${RUTA}/perfil/clave`);
    await n.pedir(`${RUTA}/usuarios/${ana.id}`);
    assert.equal((await n.post(`${RUTA}/usuarios/${ana.id}`, { roles: ['editor'], activo: '1' })).status, 302);
    assert.equal((await fila<{ rol: string }>('SELECT rol FROM usuarios WHERE id = ?', [ana.id]))!.rol, 'editor');
    assert.equal((await n.post(`${RUTA}/usuarios/${ana.id}/eliminar`, {})).status, 302);
    assert.equal(await fila('SELECT 1 FROM usuarios WHERE id = ?', [ana.id]), undefined);
  });
  it('cada usuario cambia su contraseña desde su perfil', async () => {
    const n = new Navegador();
    await n.ingresar('lector');
    await n.pedir(`${RUTA}/perfil`);
    assert.equal((await n.post(`${RUTA}/perfil/clave`, { actual: 'mal', nueva: 'Propia-Clave-2026!', repetir: 'Propia-Clave-2026!' })).status, 400);
    assert.equal((await n.post(`${RUTA}/perfil/clave`, { actual: CLAVE, nueva: 'Propia-Clave-2026!', repetir: 'Propia-Clave-2026!' })).headers.get('location'), `${RUTA}/perfil?aviso=clave-cambiada`);
    assert.equal((await new Navegador().ingresar('lector', 'Propia-Clave-2026!')).status, 302);
  });
  it('ninguna contraseña queda en texto plano en la base ni en el registro', async () => {
    const r = await db.execute('SELECT detalle FROM auditoria');
    for (const f of r.rows) for (const clave of [CLAVE, 'Temporal-Segura-1', 'Propia-Clave-2026!', 'Otra-Clave-Segura-9']) assert.ok(!String(f.detalle ?? '').includes(clave));
    const u = await db.execute('SELECT hash FROM usuarios');
    for (const f of u.rows) assert.match(String(f.hash), /^scrypt\$/);
  });
});

describe('interfaz y cabeceras', () => {
  it('no menciona rubros futuros y aplica cabeceras de seguridad', async () => {
    const n = new Navegador();
    await n.ingresar('principal');
    const html = await (await n.pedir(`${RUTA}/productos`)).text();
    assert.doesNotMatch(html, /Perfumes|Joyería|Calzado|ampliarse|rubros/i);
    const r = await app.request(BASE + `${RUTA}/ingresar`);
    assert.match(r.headers.get('content-security-policy')!, /script-src 'self'/);
    assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.match(r.headers.get('permissions-policy')!, /camera=\(self\)/);
  });
});

describe('asistente', () => {
  // Claude simulado: pide una herramienta por vuelta según la pregunta y después responde con lo que recibió.
  const pedidos: { url: string; cuerpo: Record<string, unknown> | null }[] = [];
  const respuesta = (cuerpo: unknown, estado = 200) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'content-type': 'application/json' } });
  const falsoFetch: typeof fetch = async (entrada, init) => {
    const url = String(entrada);
    const cuerpo = init?.body ? JSON.parse(String(init.body)) : null;
    pedidos.push({ url, cuerpo });
    if (url.endsWith('/sitemap-0.xml')) return new Response('', { status: 404 });
    if (url === `${BASE}/contacto/`) return new Response('<html><head><title>Contacto</title><script>alert(1)</script></head><body><header>menú</header><main><h1>Contacto</h1><p>Llamanos al 0800 1804</p><img src="x.webp" alt="Fachada de la Casa Central"></main></body></html>', { headers: { 'content-type': 'text/html' } });
    if (!url.startsWith('https://ai-gateway.vercel.sh/')) return new Response('no', { status: 404 });
    const mensajes = cuerpo.messages as { role: string; content: unknown }[];
    const ultimo = mensajes.at(-1)!;
    if (typeof ultimo.content !== 'string') {
      return respuesta({ content: [{ type: 'text', text: `Resultado: ${JSON.stringify(ultimo.content)}` }], stop_reason: 'end_turn', usage: { input_tokens: 50, output_tokens: 20 } });
    }
    const q = ultimo.content;
    const herramienta = q.startsWith('proponer:') ? { name: 'proponer_cambios', input: { cambios: JSON.parse(q.slice('proponer:'.length)) } }
      : q.startsWith('grupo:') ? { name: 'proponer_stock_grupo', input: JSON.parse(q.slice('grupo:'.length)) }
      : q.startsWith('revertir:') ? { name: 'proponer_revertir', input: JSON.parse(q.slice('revertir:'.length)) }
      : /stock/.test(q) ? { name: 'buscar_productos', input: { texto: 'parlante' } }
      : /panel/.test(q) ? { name: 'leer_pagina', input: { ruta: `${RUTA}/usuarios` } }
      : /contacto/.test(q) ? { name: 'leer_pagina', input: { ruta: '/contacto/' } }
      : null;
    if (!herramienta) return respuesta({ content: [{ type: 'text', text: 'Hola, ¿en qué te ayudo?' }], stop_reason: 'end_turn' });
    return respuesta({ content: [{ type: 'tool_use', id: 't1', ...herramienta }], stop_reason: 'tool_use', usage: { input_tokens: 100, output_tokens: 10 } });
  };
  let original: typeof app;
  const preguntar = (n: Navegador, pregunta: string, extra: Record<string, string> = {}) => n.post(`${RUTA}/asistente`, { pregunta, modelo: 'rapido', historial: '[]', ...extra }, json);
  before(() => {
    original = app;
    app = crearApp({ db, config: { ...config, asistenteLimiteDia: 5 }, almacen: almacenConfigurado(config.dirImagenes, `${RUTA}/media`), asistente: { fetch: falsoFetch, token: 'token-de-prueba' } });
  });
  after(() => { app = original; });

  it('lo usan todos los roles, cada uno con sus herramientas', async () => {
    const herramientasDe = async (n: Navegador) => {
      const antes = pedidos.length;
      assert.equal((await preguntar(n, 'hola')).status, 200);
      const llamada = pedidos.slice(antes).find((x) => x.url.startsWith('https://ai-gateway.vercel.sh/'))!;
      return { nombres: (llamada.cuerpo!.tools as { name: string }[]).map((h) => h.name), sistema: String(llamada.cuerpo!.system) };
    };
    await db.execute("DELETE FROM auditoria WHERE accion = 'asistente.consulta'");
    // "lector" cambió su contraseña en una prueba anterior.
    const lector = new Navegador();
    await lector.ingresar('lector', 'Propia-Clave-2026!');
    assert.match(await (await lector.pedir(`${RUTA}/productos`)).text(), new RegExp(`href="${RUTA}/asistente"`));
    const pantallaLector = await (await lector.pedir(`${RUTA}/asistente`)).text();
    assert.match(pantallaLector, /Tu rol es de solo consulta/);
    assert.doesNotMatch(pantallaLector, /Poné sin stock/);
    const hl = await herramientasDe(lector);
    assert.ok(!hl.nombres.some((h) => h.startsWith('proponer_')), 'el visualizador no recibe herramientas de cambios');
    assert.ok(hl.sistema.includes('rol de **solo consulta**'), 'el instructivo indica que el rol es de solo consulta');
    assert.doesNotMatch(hl.sistema, /proponer_cambios con todos/);
    const propuestaLector = await (await preguntar(lector, `proponer:${JSON.stringify([{ codigo: '100001', estado: 'sin-dato' }])}`)).json();
    assert.equal(propuestaLector.propuesta, null, 'aunque lo intente, no se crea una propuesta');

    const editor = new Navegador();
    await editor.ingresar('editor');
    assert.match(await (await editor.pedir(`${RUTA}/asistente`)).text(), /nada se aplica hasta que lo confirmes/);
    assert.ok((await herramientasDe(editor)).nombres.includes('proponer_cambios'));

    const admin = new Navegador();
    await admin.ingresar('principal');
    const html = await (await admin.pedir(`${RUTA}/asistente`)).text();
    assert.match(html, /name="pregunta"/);
    assert.match(html, /nada se aplica hasta que lo confirmes/);
  });
  it('consulta el inventario con herramientas de solo lectura y deja registro', async () => {
    const n = new Navegador();
    await n.ingresar('principal');
    await n.pedir(`${RUTA}/asistente`);
    const r = await preguntar(n, '¿Qué stock hay de parlantes?');
    assert.equal(r.status, 200);
    const datos = await r.json();
    assert.equal(datos.ok, true);
    assert.match(datos.respuesta, /PARLANTE PRUEBA/);
    const actual = await fila<{ stock_estado: string }>("SELECT stock_estado FROM productos WHERE id = 'parlante-1'");
    assert.ok(datos.respuesta.includes(actual!.stock_estado === 'con-stock' ? 'Con stock' : actual!.stock_estado === 'sin-stock' ? 'Sin stock' : 'Sin dato'));
    const gateway = pedidos.filter((p) => p.url.startsWith('https://ai-gateway.vercel.sh/'));
    assert.equal(gateway.at(-1)!.cuerpo!.model, 'google/gemini-2.5-flash');
    assert.equal(gateway.at(-1)!.cuerpo!.temperature, 0.2);
    const herramientas = (gateway.at(-1)!.cuerpo!.tools as { name: string }[]).map((t) => t.name);
    assert.deepEqual(herramientas.sort(), ['buscar_productos', 'leer_pagina', 'listar_novedades', 'proponer_cambios', 'proponer_revertir', 'proponer_stock_grupo', 'resumen_stock', 'ultimos_cambios']);
    assert.equal(datos.propuesta, null);
    const ev = await fila<{ detalle: string; usuario: string }>("SELECT detalle, usuario FROM auditoria WHERE accion = 'asistente.consulta' ORDER BY id DESC LIMIT 1");
    assert.equal(ev?.usuario, 'principal');
    assert.match(ev!.detalle, /buscar_productos/);
    assert.doesNotMatch(ev!.detalle, /token-de-prueba/);
  });
  it('lee páginas públicas pero nunca el panel', async () => {
    const n = new Navegador();
    await n.ingresar('principal');
    await n.pedir(`${RUTA}/asistente`);
    const pagina = await (await preguntar(n, 'datos de contacto')).json();
    assert.match(pagina.respuesta, /0800 1804/);
    assert.match(pagina.respuesta, /Fachada de la Casa Central/);
    assert.doesNotMatch(pagina.respuesta, /alert\(1\)|menú/);
    const panel = await (await preguntar(n, 'mostrame el panel de usuarios')).json();
    assert.match(panel.respuesta, /Ruta inválida/);
    assert.ok(!pedidos.some((p) => p.url.includes(`${RUTA}/usuarios`) || p.url.includes(`${RUTA}/`)));
  });
  it('rechaza pedidos sin CSRF, sin pregunta o por encima del límite diario', async () => {
    const n = new Navegador();
    await n.ingresar('admin2');
    await n.pedir(`${RUTA}/asistente`);
    assert.equal((await n.post(`${RUTA}/asistente`, { pregunta: 'hola', _csrf: 'falso' }, json)).status, 403);
    assert.equal((await preguntar(n, '   ')).status, 400);
    for (let i = 0; i < 5; i++) assert.equal((await preguntar(n, 'hola')).status, 200);
    const r = await preguntar(n, 'hola');
    assert.equal(r.status, 429);
    assert.match((await r.json()).error, /límite/);
  });
  describe('cambios propuestos', () => {
    const estufa = () => fila<{ stock_estado: string; stock_cantidad: number | null; nombre: string; version: number }>("SELECT stock_estado, stock_cantidad, nombre, version FROM productos WHERE id = 'estufa-2'");
    const proponer = async (n: Navegador, cambios: unknown[]) => (await preguntar(n, `proponer:${JSON.stringify(cambios)}`)).json();
    const decidir = (n: Navegador, id: string, accion: 'confirmar' | 'cancelar') => n.post(`${RUTA}/asistente/propuestas/${id}`, { accion }, json);
    const admin = async (usuario = 'principal') => {
      await db.execute("DELETE FROM auditoria WHERE accion = 'asistente.consulta'"); // límite diario de la prueba (5)
      const n = new Navegador();
      await n.ingresar(usuario);
      await n.pedir(`${RUTA}/asistente`);
      return n;
    };

    it('propone sin aplicar y aplica solo al confirmar, una sola vez', async () => {
      const n = await admin();
      const antes = await estufa();
      const r = await proponer(n, [{ codigo: '100002', estado: 'con-stock', cantidad: 3 }]);
      assert.equal(r.ok, true);
      assert.equal(r.propuesta.items.length, 1);
      assert.deepEqual(r.propuesta.items[0].cambios.map((c: { campo: string }) => c.campo).sort(), ['Cantidad', 'Stock']);
      assert.match(r.respuesta, /PENDIENTE DE CONFIRMACIÓN/);
      assert.deepEqual(await estufa(), antes, 'proponer no modifica nada');
      const ok = await decidir(n, r.propuesta.id, 'confirmar');
      assert.equal(ok.status, 200);
      assert.match((await ok.json()).mensaje, /1 de 1 cambio aplicado/);
      const despues = await estufa();
      assert.equal(despues!.stock_estado, 'con-stock');
      assert.equal(despues!.stock_cantidad, 3);
      const ev = await fila<{ accion: string; detalle: string; usuario: string }>("SELECT accion, detalle, usuario FROM auditoria WHERE entidad_id = 'estufa-2' ORDER BY id DESC LIMIT 1");
      assert.equal(ev!.accion, 'stock.cambio');
      assert.equal(ev!.usuario, 'principal');
      assert.match(ev!.detalle, /"via":"asistente"/);
      assert.equal((await decidir(n, r.propuesta.id, 'confirmar')).status, 409, 'no se aplica dos veces');
    });
    it('edita datos del producto y rechaza lo inválido', async () => {
      const n = await admin();
      const r = await proponer(n, [
        { codigo: '100002', nombre: 'ESTUFA PRUEBA 2000W', marca: 'Marca X' },
        { codigo: '999999', estado: 'sin-stock' },
        { codigo: '100001', descripcion: 'Oferta a $ 1990' },
        { codigo: '100001', categoria: 'no-existe' },
      ]);
      assert.equal(r.propuesta.items.length, 1);
      assert.equal(r.propuesta.errores.length, 3);
      assert.ok(r.propuesta.errores.some((e: string) => /999999/.test(e)));
      assert.ok(r.propuesta.errores.some((e: string) => /precio/.test(e)));
      assert.equal((await decidir(n, r.propuesta.id, 'confirmar')).status, 200);
      assert.equal((await estufa())!.nombre, 'ESTUFA PRUEBA 2000W');
      const ev = await fila<{ accion: string }>("SELECT accion FROM auditoria WHERE entidad_id = 'estufa-2' ORDER BY id DESC LIMIT 1");
      assert.equal(ev!.accion, 'producto.edicion');
      const nada = await proponer(n, [{ codigo: '999999', estado: 'sin-stock' }]);
      assert.equal(nada.propuesta, null);
    });
    it('cancelar, vencer, conflicto y propuestas ajenas no cambian nada', async () => {
      const n = await admin();
      const otro = await admin('admin2');
      // Cancelada
      const a = await proponer(n, [{ codigo: '100002', estado: 'sin-stock' }]);
      assert.equal((await decidir(n, a.propuesta.id, 'cancelar')).status, 200);
      assert.equal((await decidir(n, a.propuesta.id, 'confirmar')).status, 409);
      assert.equal((await estufa())!.stock_estado, 'con-stock');
      // Ajena: otro administrador no puede confirmarla
      const b = await proponer(n, [{ codigo: '100002', estado: 'sin-stock' }]);
      assert.equal((await decidir(otro, b.propuesta.id, 'confirmar')).status, 404);
      // Vencida
      await db.execute({ sql: 'UPDATE propuestas SET expira_en = ? WHERE id = ?', args: [new Date(Date.now() - 1000).toISOString(), b.propuesta.id] });
      assert.equal((await decidir(n, b.propuesta.id, 'confirmar')).status, 409);
      // Conflicto: el producto cambió después de la propuesta
      const c = await proponer(n, [{ codigo: '100002', estado: 'sin-stock' }]);
      await db.execute("UPDATE productos SET version = version + 1 WHERE id = 'estufa-2'");
      const res = await (await decidir(n, c.propuesta.id, 'confirmar')).json();
      assert.equal(res.resultados[0].ok, false);
      assert.match(res.mensaje, /0 de 1/);
      assert.equal((await estufa())!.stock_estado, 'con-stock');
      // Una propuesta nueva reemplaza a la anterior pendiente
      const d1 = await proponer(n, [{ codigo: '100002', estado: 'sin-stock' }]);
      const d2 = await proponer(n, [{ codigo: '100002', cantidad: 7 }]);
      assert.equal((await decidir(n, d1.propuesta.id, 'confirmar')).status, 409);
      assert.equal((await decidir(n, d2.propuesta.id, 'confirmar')).status, 200);
      assert.equal((await estufa())!.stock_cantidad, 7);
    });
    it('cambia el stock de una categoría entera (más de 50 productos) en un solo paso', async () => {
      const t = new Date().toISOString();
      await db.batch([
        "INSERT INTO categorias (rubro_id, id, nombre, orden) VALUES ('bazar', 'celulares-prueba', 'Celulares prueba', 9)",
        ...Array.from({ length: 70 }, (_, k) => ({
          sql: "INSERT INTO productos (id, rubro_id, codigo, nombre, marca, categoria_id, stock_estado, stock_cantidad, origen, creado_en, actualizado_en) VALUES (?, 'bazar', ?, ?, ?, 'celulares-prueba', ?, ?, 'importado', ?, ?)",
          args: [`cel-${k}`, String(200000 + k), `CELULAR PRUEBA ${k}`, k % 2 ? 'Samsung' : 'Motorola', k < 5 ? 'sin-stock' : 'con-stock', k === 6 ? 4 : null, t, t],
        })),
      ], 'write');
      try {
        const n = await admin();
        const lector = new Navegador();
        await lector.ingresar('lector', 'Propia-Clave-2026!');
        await lector.pedir(`${RUTA}/asistente`);
        assert.equal((await (await preguntar(lector, `grupo:${JSON.stringify({ categoria: 'celulares-prueba', estado: 'sin-stock' })}`)).json()).propuesta, null, 'el visualizador no puede');

        // Sin filtro o con una categoría inexistente no se propone nada
        assert.equal((await (await preguntar(n, `grupo:${JSON.stringify({ estado: 'sin-stock' })}`)).json()).propuesta, null);
        assert.equal((await (await preguntar(n, `grupo:${JSON.stringify({ categoria: 'no-existe', estado: 'sin-stock' })}`)).json()).propuesta, null);

        // Filtros combinados: solo los Samsung que hoy tienen stock
        const s = await (await preguntar(n, `grupo:${JSON.stringify({ categoria: 'celulares-prueba', texto: 'samsung', estado_actual: 'con-stock', estado: 'sin-stock' })}`)).json();
        assert.equal(s.propuesta.items.length, 33);

        const r = await (await preguntar(n, `grupo:${JSON.stringify({ categoria: 'celulares-prueba', estado: 'sin-stock' })}`)).json();
        assert.equal(r.propuesta.items.length, 65, 'los 5 que ya estaban sin stock se omiten');
        assert.match(r.respuesta, /ya_tenian_ese_stock\W+5\b/);
        const conStock = async () => Number((await fila<{ n: number }>("SELECT COUNT(*) n FROM productos WHERE categoria_id = 'celulares-prueba' AND stock_estado = 'con-stock'"))!.n);
        assert.equal(await conStock(), 65, 'proponer no modifica nada');
        assert.equal((await decidir(n, s.propuesta.id, 'confirmar')).status, 409, 'la propuesta anterior quedó reemplazada');

        // Un producto cambiado después de la propuesta no se pisa
        await db.execute("UPDATE productos SET version = version + 1 WHERE id = 'cel-10'");
        const ok = await (await decidir(n, r.propuesta.id, 'confirmar')).json();
        assert.match(ok.mensaje, /64 de 65 cambios aplicados/);
        assert.equal(await conStock(), 1);
        const cel6 = await fila<{ stock_estado: string; stock_cantidad: number | null; actualizado_por: string }>("SELECT stock_estado, stock_cantidad, actualizado_por FROM productos WHERE id = 'cel-6'");
        assert.deepEqual({ ...cel6 }, { stock_estado: 'sin-stock', stock_cantidad: null, actualizado_por: 'principal' });
        const reg = await fila<{ n: number }>("SELECT COUNT(*) n FROM auditoria WHERE accion = 'stock.cambio' AND entidad_id LIKE 'cel-%' AND detalle LIKE '%\"via\":\"asistente\"%'");
        assert.equal(Number(reg!.n), 64);

        // ── Revertir: vuelve cada producto a como estaba ──
        await db.execute("DELETE FROM auditoria WHERE accion = 'asistente.consulta'"); // límite diario de la prueba
        // Propuesta aplicada antes de que se guardaran las diferencias: se reconstruyen desde el Registro.
        const fila_ = await fila<{ resultado: string }>('SELECT resultado FROM propuestas WHERE id = ?', [r.propuesta.id]);
        const viejo = (JSON.parse(fila_!.resultado) as Record<string, unknown>[]).map(({ codigo, nombre, ok, error }) => ({ codigo, nombre, ok, error }));
        await db.execute({ sql: 'UPDATE propuestas SET resultado = ? WHERE id = ?', args: [JSON.stringify(viejo), r.propuesta.id] });
        // Un producto modificado después de la propuesta no se revierte
        await db.execute("UPDATE productos SET stock_estado = 'sin-dato', version = version + 1 WHERE id = 'cel-20'");
        const v = await (await preguntar(n, `revertir:${JSON.stringify({})}`)).json();
        assert.equal(v.propuesta.items.length, 63);
        assert.ok(v.propuesta.errores.some((e: string) => /1 producto\(s\) se modificaron después/.test(e) && /CELULAR PRUEBA 20/.test(e)));
        const item6 = v.propuesta.items.find((i: { codigo: string }) => i.codigo === '200006');
        assert.deepEqual(item6.cambios, [{ campo: 'Stock', antes: 'Sin stock', despues: 'Con stock' }, { campo: 'Cantidad', antes: '—', despues: '4' }]);
        assert.equal(await conStock(), 1, 'proponer la reversión no modifica nada');
        assert.match((await (await decidir(n, v.propuesta.id, 'confirmar')).json()).mensaje, /63 de 63 cambios aplicados/);
        assert.equal(await conStock(), 64, 'vuelven los que tenían stock (63 + el que no se había cambiado)');
        const sinStock = (await db.execute("SELECT id FROM productos WHERE categoria_id = 'celulares-prueba' AND stock_estado = 'sin-stock' ORDER BY id")).rows;
        assert.deepEqual(sinStock.map((f) => f.id),['cel-0', 'cel-1', 'cel-2', 'cel-3', 'cel-4'], 'los que ya estaban sin stock siguen igual');
        assert.equal(Number((await fila<{ stock_cantidad: number }>("SELECT stock_cantidad FROM productos WHERE id = 'cel-6'"))!.stock_cantidad), 4);
        assert.equal((await fila<{ stock_estado: string }>("SELECT stock_estado FROM productos WHERE id = 'cel-20'"))!.stock_estado, 'sin-dato');

        // Deshacer la reversión (usa las diferencias guardadas) y no repetir lo ya revertido
        const w = await (await preguntar(n, `revertir:${JSON.stringify({ atras: 1 })}`)).json();
        assert.equal(w.propuesta.items.length, 63);
        assert.ok(w.propuesta.items.every((i: { cambios: { campo: string; despues: string }[] }) => i.cambios[0].despues === 'Sin stock'));
        const otraVez = await (await preguntar(n, `revertir:${JSON.stringify({ atras: 2 })}`)).json();
        assert.equal(otraVez.propuesta, null, 'la propuesta original ya fue revertida: no queda nada');
        assert.match(otraVez.respuesta, /No queda nada para revertir/);
      } finally {
        await db.batch(["DELETE FROM productos WHERE categoria_id = 'celulares-prueba'", "DELETE FROM categorias WHERE id = 'celulares-prueba'"], 'write');
      }
    });
    it('sin JavaScript muestra la tarjeta con Confirmar y Cancelar', async () => {
      const n = await admin();
      const r = await n.post(`${RUTA}/asistente`, { pregunta: `proponer:${JSON.stringify([{ codigo: '100001', estado: 'sin-dato' }])}`, modelo: 'rapido', historial: '[]' });
      const html = await r.text();
      assert.match(html, /Cambios para confirmar \(1\)/);
      assert.match(html, /name="accion" value="confirmar"/);
      assert.match(html, /name="accion" value="cancelar"/);
    });
    it('guarda el historial y la flecha de cada respuesta deshace esos cambios', async () => {
      const n = await admin();
      const otro = await admin('admin2');
      const antes = await estufa();
      const r = await proponer(n, [{ codigo: '100002', estado: 'sin-stock' }]);
      const conv = r.conversacion.id as string;
      assert.match(r.conversacion.titulo, /^proponer:/);
      // La conversación sigue: el contexto sale de lo guardado y queda en el historial
      const seguida = await (await preguntar(n, 'hola', { conversacion: conv, historial: '' })).json();
      assert.equal(seguida.conversacion.id, conv);
      const ok = await (await n.post(`${RUTA}/asistente/propuestas/${r.propuesta.id}`, { accion: 'confirmar', conversacion: conv }, json)).json();
      assert.equal(ok.deshacer, r.propuesta.id, 'la respuesta de cambios aplicados trae la flecha');
      assert.equal(ok.conversacion.cambios, 1);
      assert.equal((await estufa())!.stock_estado, 'sin-stock');

      const pagina = await (await n.pedir(`${RUTA}/asistente?c=${conv}`)).text();
      assert.ok(pagina.includes(`/asistente/propuestas/${r.propuesta.id}/deshacer`), 'la flecha está en la respuesta');
      assert.match(pagina, /Aplicados<\/span>/, 'la tarjeta resuelta muestra su estado');
      assert.match(pagina, /data-conversacion="[^"]+" aria-current="page"/);
      assert.equal(pagina.split(`/asistente/conversaciones/${conv}/eliminar`).length - 1, 2, 'se elimina desde la cabecera y desde la lista del historial');
      assert.equal((await otro.pedir(`${RUTA}/asistente?c=${conv}`)).status, 302, 'cada usuario ve solo sus conversaciones');

      // Deshacer: prepara la vuelta atrás (no aplica nada) y se confirma como cualquier propuesta
      const d = await (await n.post(`${RUTA}/asistente/propuestas/${r.propuesta.id}/deshacer`, { conversacion: conv }, json)).json();
      assert.equal(d.propuesta.items.length, 1);
      assert.equal((await estufa())!.stock_estado, 'sin-stock', 'deshacer primero muestra la tarjeta');
      const v = await (await n.post(`${RUTA}/asistente/propuestas/${d.propuesta.id}`, { accion: 'confirmar', conversacion: conv }, json)).json();
      assert.equal(v.deshecho, r.propuesta.id, 'la respuesta original queda marcada como deshecha');
      assert.equal((await estufa())!.stock_estado, antes!.stock_estado);
      const final = await (await n.pedir(`${RUTA}/asistente?c=${conv}`)).text();
      assert.match(final, /Cambios deshechos/);
      // Otra persona no puede deshacer cambios ajenos
      const ajeno = await (await otro.post(`${RUTA}/asistente/propuestas/${r.propuesta.id}/deshacer`, {}, json)).json();
      assert.equal(ajeno.propuesta, null);

      assert.equal((await n.post(`${RUTA}/asistente/conversaciones/${conv}/eliminar`, {}, json)).status, 200);
      assert.equal((await n.pedir(`${RUTA}/asistente?c=${conv}`)).status, 302);
    });
    it('los scripts arman las direcciones con la dirección real del panel (no /panel)', async () => {
      const n = await admin();
      const html = await (await n.pedir(`${RUTA}/asistente`)).text();
      assert.ok(html.includes(`data-base="${RUTA}"`), 'la página informa la dirección del panel');
      for (const archivo of ['asistente.js', 'panel.js']) {
        const js = await fs.readFile(path.join(import.meta.dirname, '../../public/panel-recursos', archivo), 'utf8');
        assert.doesNotMatch(js, /['"`]\/panel\//, `${archivo} no usa /panel fijo`);
      }
    });
  });

  it('limpia el historial y el HTML de las páginas', () => {
    assert.deepEqual(limpiarHistorial([{ rol: 'asistente', texto: 'x' }, { rol: 'sistema', texto: 'y' }, { rol: 'usuario', texto: ' hola ' }]), [{ rol: 'usuario', texto: 'hola' }]);
    assert.deepEqual(limpiarHistorial('nada'), []);
    assert.deepEqual(limpiarHistorial([{ rol: 'usuario', texto: 'a' }, { rol: 'asistente', texto: 'b' }]), []);
    const t = textoDePagina('<title>T &amp; C</title><main><p>Uno</p><style>.x{}</style><a href="/locales/">Locales</a></main>');
    assert.match(t, /Título: T & C/);
    assert.match(t, /Locales \(\/locales\/\)/);
    assert.doesNotMatch(t, /\.x\{\}/);
  });
  it('sin token de AI Gateway avisa que no está configurado', async () => {
    const conToken = app;
    app = crearApp({ db, config, almacen: almacenConfigurado(config.dirImagenes, `${RUTA}/media`), asistente: { fetch: falsoFetch, token: null } });
    try {
      const n = new Navegador();
      await n.ingresar('principal');
      assert.match(await (await n.pedir(`${RUTA}/asistente`)).text(), /no está configurado/);
      assert.equal((await preguntar(n, 'hola')).status, 503);
    } finally {
      app = conToken;
    }
  });
});

describe('conector para Claude (OAuth 2.1 + MCP)', () => {
  const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
  const RECURSO = `${BASE}${RUTA}/mcp`;
  const pkce = () => {
    const verificador = crypto.randomBytes(32).toString('base64url');
    return { verificador, desafio: crypto.createHash('sha256').update(verificador).digest('base64url') };
  };
  const postJson = (ruta: string, cuerpo: unknown, headers: Record<string, string> = {}) =>
    app.request(BASE + ruta, { method: 'POST', body: JSON.stringify(cuerpo), headers: { 'content-type': 'application/json', ...headers } });
  const postForm = (ruta: string, datos: Record<string, string>) =>
    app.request(BASE + ruta, { method: 'POST', body: new URLSearchParams(datos), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  const registrar = async () => (await (await postJson(`${RUTA}/oauth/registro`, { client_name: 'Claude', redirect_uris: [REDIRECT], token_endpoint_auth_method: 'none' })).json()).client_id as string;
  const urlAutorizar = (clientId: string, desafio: string, extra: Record<string, string> = {}) =>
    `${RUTA}/oauth/autorizar?${new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: desafio, code_challenge_method: 'S256', state: 'estado-123', scope: 'stock', resource: RECURSO, ...extra })}`;
  /** Ingresa al panel, autoriza y devuelve el código (o la redirección final). */
  const autorizar = async (usuario: string, clave: string, clientId: string, desafio: string, accion: 'permitir' | 'cancelar' = 'permitir') => {
    const n = new Navegador();
    await n.ingresar(usuario, clave);
    const r1 = await n.pedir(urlAutorizar(clientId, desafio));
    assert.equal(r1.status, 302);
    const consentimiento = r1.headers.get('location')!;
    assert.match(consentimiento, new RegExp(`^${RUTA}/oauth/autorizar/[A-Za-z0-9_-]+$`));
    const pagina = await n.pedir(consentimiento);
    assert.equal(pagina.status, 200);
    const final = await n.post(consentimiento, { accion });
    assert.equal(final.status, 302);
    return { n, destino: new URL(final.headers.get('location')!) };
  };
  const conectarComo = async (usuario: string, clave = CLAVE) => {
    const clientId = await registrar();
    const { verificador, desafio } = pkce();
    const { n, destino } = await autorizar(usuario, clave, clientId, desafio);
    const tokens = await (await postForm(`${RUTA}/oauth/token`, { grant_type: 'authorization_code', code: destino.searchParams.get('code')!, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verificador, resource: RECURSO })).json();
    assert.ok(tokens.access_token && tokens.refresh_token, JSON.stringify(tokens));
    return { n, clientId, tokens };
  };
  const mcp = (token: string, metodo: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
    postJson(`${RUTA}/mcp`, { jsonrpc: '2.0', id: 1, method: metodo, params }, { authorization: `Bearer ${token}`, ...headers });
  const llamar = async (token: string, nombre: string, args: Record<string, unknown>) => (await (await mcp(token, 'tools/call', { name: nombre, arguments: args })).json()).result;
  const estado = (id: string) => fila<{ stock_estado: string; stock_cantidad: number | null }>('SELECT stock_estado, stock_cantidad FROM productos WHERE id = ?', [id]);

  it('publica los metadatos y pide token con WWW-Authenticate', async () => {
    const r = await postJson(`${RUTA}/mcp`, { jsonrpc: '2.0', id: 1, method: 'initialize' });
    assert.equal(r.status, 401);
    assert.ok(r.headers.get('www-authenticate')!.includes(`resource_metadata="http://localhost:4321/.well-known/oauth-protected-resource${RUTA}/mcp"`));
    assert.equal((await app.request(BASE + `${RUTA}/mcp`)).status, 405);
    assert.equal((await mcp('token-falso-0123456789abcdef', 'initialize')).status, 401);
  });
  it('solo registra clientes con regreso a Claude o localhost', async () => {
    assert.equal((await postJson(`${RUTA}/oauth/registro`, { redirect_uris: ['https://atacante.example/cb'] })).status, 400);
    assert.equal((await postJson(`${RUTA}/oauth/registro`, { redirect_uris: ['https://claude.ai.atacante.example/cb'] })).status, 400);
    assert.equal((await postJson(`${RUTA}/oauth/registro`, { redirect_uris: [REDIRECT], token_endpoint_auth_method: 'client_secret_basic' })).status, 400);
    assert.equal((await postJson(`${RUTA}/oauth/registro`, { redirect_uris: [REDIRECT] })).status, 201);
  });
  it('no redirige a direcciones no registradas y exige PKCE S256', async () => {
    const clientId = await registrar();
    const n = new Navegador();
    await n.ingresar('principal');
    const otra = await n.pedir(urlAutorizar(clientId, pkce().desafio, { redirect_uri: 'https://claude.ai/otra' }));
    assert.equal(otra.status, 400);
    const sinPkce = await n.pedir(urlAutorizar(clientId, 'corto', {}));
    assert.match(sinPkce.headers.get('location')!, /^https:\/\/claude\.ai\/api\/mcp\/auth_callback\?error=invalid_request/);
  });
  it('flujo completo: el administrador conecta Claude y cambia el stock de varios productos', async () => {
    const { tokens } = await conectarComo('principal');
    const ini = await (await mcp(tokens.access_token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'prueba', version: '1' } })).json();
    assert.equal(ini.result.protocolVersion, '2025-06-18');
    assert.equal((await mcp(tokens.access_token, 'notifications/initialized')).status, 200); // tiene id en este helper
    const lista = await (await mcp(tokens.access_token, 'tools/list')).json();
    assert.deepEqual(lista.result.tools.map((t: { name: string }) => t.name).sort(), ['buscar_productos', 'cambiar_stock', 'listar_categorias', 'ultimos_cambios', 'ver_producto']);
    const busqueda = await llamar(tokens.access_token, 'buscar_productos', { texto: 'estufa' });
    assert.match(busqueda.content[0].text, /100002/);
    const r = await llamar(tokens.access_token, 'cambiar_stock', { cambios: [{ codigo: '100001', cantidad: 4 }, { codigo: '100002', estado: 'sin-stock' }, { codigo: '999999', estado: 'con-stock' }] });
    assert.match(r.content[0].text, /2 de 3 cambios guardados/);
    assert.deepEqual(await estado('parlante-1'), { stock_estado: 'con-stock', stock_cantidad: 4 });
    assert.equal((await estado('estufa-2'))!.stock_estado, 'sin-stock');
    const ev = await fila<{ accion: string; usuario: string; detalle: string }>("SELECT accion, usuario, detalle FROM auditoria WHERE entidad_id = 'parlante-1' ORDER BY id DESC LIMIT 1");
    assert.equal(ev!.accion, 'stock.cambio');
    assert.equal(ev!.usuario, 'principal');
    assert.match(ev!.detalle, /"via":"claude"/);
    const sinCantidad = await llamar(tokens.access_token, 'cambiar_stock', { cambios: [{ codigo: '100001' }] });
    assert.equal(sinCantidad.isError, true);
  });
  it('el código es de un solo uso y el PKCE tiene que coincidir', async () => {
    const clientId = await registrar();
    const { verificador, desafio } = pkce();
    const { destino } = await autorizar('principal', CLAVE, clientId, desafio);
    const code = destino.searchParams.get('code')!;
    assert.equal(destino.searchParams.get('state'), 'estado-123');
    const malo = await (await postForm(`${RUTA}/oauth/token`, { grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: pkce().verificador })).json();
    assert.equal(malo.error, 'invalid_grant');
    // El intento fallido consumió el código: ni con el verificador correcto se puede reutilizar.
    const otraVez = await (await postForm(`${RUTA}/oauth/token`, { grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: clientId, code_verifier: verificador })).json();
    assert.equal(otraVez.error, 'invalid_grant');
  });
  it('cancelar devuelve access_denied a Claude', async () => {
    const { destino } = await autorizar('principal', CLAVE, await registrar(), pkce().desafio, 'cancelar');
    assert.equal(destino.searchParams.get('error'), 'access_denied');
    assert.equal(destino.searchParams.get('code'), null);
  });
  it('con un usuario visualizador solo consulta', async () => {
    const antes = await estado('estufa-2');
    const { tokens } = await conectarComo('lector', 'Propia-Clave-2026!');
    const r = await llamar(tokens.access_token, 'cambiar_stock', { cambios: [{ codigo: '100002', estado: 'con-stock' }] });
    assert.equal(r.isError, true);
    assert.match(r.content[0].text, /solo puede consultar/);
    assert.deepEqual(await estado('estufa-2'), antes);
    assert.match((await llamar(tokens.access_token, 'ver_producto', { codigo: '100002' })).content[0].text, /100002/);
  });
  it('la renovación rota el token y desconectar desde el perfil corta el acceso', async () => {
    const { n, clientId, tokens } = await conectarComo('principal');
    const nuevos = await (await postForm(`${RUTA}/oauth/token`, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId })).json();
    assert.ok(nuevos.access_token && nuevos.refresh_token !== tokens.refresh_token);
    const repetido = await (await postForm(`${RUTA}/oauth/token`, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId })).json();
    assert.equal(repetido.error, 'invalid_grant');
    assert.equal((await mcp(nuevos.access_token, 'ping')).status, 200);
    const perfil = await (await n.pedir(`${RUTA}/perfil`)).text();
    assert.match(perfil, /Conexión con Claude/);
    assert.ok(perfil.includes(`http://localhost:4321${RUTA}/mcp`));
    assert.equal((await n.post(`${RUTA}/perfil/claude/${clientId}/desconectar`, {})).status, 302);
    assert.equal((await mcp(nuevos.access_token, 'ping')).status, 401);
    const tokensEnBase = await db.execute({ sql: 'SELECT token_hash FROM oauth_tokens', args: [] });
    assert.ok(tokensEnBase.rows.every((f) => /^[0-9a-f]{64}$/.test(String(f.token_hash))), 'los tokens se guardan solo como hash');
  });
  it('rechaza orígenes de navegador ajenos', async () => {
    const { tokens } = await conectarComo('principal');
    assert.equal((await mcp(tokens.access_token, 'ping', {}, { origin: 'https://atacante.example' })).status, 403);
  });
});

describe('acceso: PIN, código por correo, equipos recordados y Accesos', () => {
  const enviados: { para: string; asunto: string; texto: string }[] = [];
  let conCorreo: ReturnType<typeof crearApp>;
  before(() => {
    conCorreo = crearApp({ db, config: { ...config, conectorClaude: false }, correo: async (m) => { enviados.push(m); } });
  });
  const ultimoCodigo = () => enviados.at(-1)!.texto.match(/\b(\d{6})\b/)![1];
  const limpiarLimites = () => db.execute('DELETE FROM intentos');
  /** Ingresa con usuario y contraseña (el PIN lo pone el navegador) y devuelve la respuesta. */
  const conClave = async (n: Navegador, usuario: string) => {
    await n.pedir(`${RUTA}/ingresar`);
    return n.post(`${RUTA}/ingresar`, { usuario, clave: CLAVE });
  };

  it('pide el PIN antes del ingreso y lo limita por intentos', async () => {
    await limpiarLimites();
    const n = new Navegador(conCorreo, false);
    const r = await n.pedir(`${RUTA}/productos`);
    assert.equal(r.status, 302);
    assert.match(r.headers.get('location')!, new RegExp(`^${RUTA}/pin\\?volver=`));
    assert.equal((await n.pedir(`${RUTA}/ingresar`)).headers.get('location'), `${RUTA}/pin?volver=${encodeURIComponent(`${RUTA}/ingresar`)}`);
    await n.pedir(`${RUTA}/pin`);
    for (let i = 0; i < 5; i++) assert.equal((await n.post(`${RUTA}/pin`, { pin: '000001' })).status, 401);
    const bloqueado = await n.post(`${RUTA}/pin`, { pin: PIN });
    assert.equal(bloqueado.status, 429, 'tras 5 intentos ni el PIN correcto entra');
    assert.ok(await fila("SELECT 1 FROM auditoria WHERE accion = 'acceso.pin-bloqueo'"));
    await limpiarLimites();
    const ok = await n.post(`${RUTA}/pin?volver=${encodeURIComponent(`${RUTA}/ingresar`)}`, { pin: PIN });
    assert.equal(ok.headers.get('location'), `${RUTA}/ingresar`);
    assert.equal((await n.pedir(`${RUTA}/ingresar`)).status, 200);
    const pin = await fila<{ valor: string }>("SELECT valor FROM ajustes WHERE clave = 'pin_hash'");
    assert.ok(pin && !pin.valor.includes(PIN), 'el PIN se guarda solo como hash');
  });
  it('después de la contraseña pide el correo de la cuenta y un código', async () => {
    await limpiarLimites();
    const n = new Navegador(conCorreo);
    const r = await conClave(n, 'editor');
    assert.equal(r.headers.get('location'), `${RUTA}/verificar`);
    assert.equal((await n.pedir(`${RUTA}/productos`)).status, 302, 'todavía no hay sesión');
    assert.match(await (await n.pedir(`${RUTA}/verificar`)).text(), /Escribí el correo de tu cuenta/);
    const malo = await n.post(`${RUTA}/verificar/correo`, { correo: 'otro@copol.test' });
    assert.equal(malo.status, 401);
    assert.equal(enviados.length, 0, 'con un correo equivocado no se envía nada');
    assert.equal((await n.post(`${RUTA}/verificar/correo`, { correo: 'EDITOR@copol.test' })).status, 302);
    assert.equal(enviados.at(-1)!.para, 'editor@copol.test');
    const pantalla = await (await n.pedir(`${RUTA}/verificar`)).text();
    assert.match(pantalla, /e•+r@copol\.test/);
    assert.equal((await n.post(`${RUTA}/verificar/codigo`, { codigo: ultimoCodigo() === '111111' ? '222222' : '111111' })).status, 401);
    const fin = await n.post(`${RUTA}/verificar/codigo`, { codigo: ultimoCodigo(), recordar: '1' });
    assert.equal(fin.status, 302);
    const equipo = fin.headers.getSetCookie().find((c) => c.startsWith('copol_equipo='))!;
    assert.match(equipo, /HttpOnly/i);
    assert.match(equipo, /Max-Age=2592000/);
    assert.equal((await n.pedir(`${RUTA}/productos`)).status, 200);
    const ingreso = await fila<{ detalle: string }>("SELECT detalle FROM auditoria WHERE accion = 'sesion.ingreso' AND usuario = 'editor' ORDER BY id DESC LIMIT 1");
    assert.match(ingreso!.detalle, /código por correo/);
    assert.equal(await fila('SELECT 1 FROM verificaciones'), undefined, 'la verificación usada se borra');

    // Mismo equipo, 30 días: ni PIN ni código.
    await n.post(`${RUTA}/salir`, {});
    const n2 = new Navegador(conCorreo, false);
    n2.cookies.set('copol_equipo', n.cookies.get('copol_equipo')!);
    assert.equal((await n2.pedir(`${RUTA}/ingresar`)).status, 200, 'el equipo recordado no pide PIN');
    const directo = await n2.post(`${RUTA}/ingresar`, { usuario: 'editor', clave: CLAVE });
    assert.equal(directo.headers.get('location'), RUTA);
    // Otro usuario en ese equipo: el PIN no se pide, pero el código sí.
    await n2.post(`${RUTA}/salir`, {});
    await n2.pedir(`${RUTA}/ingresar`);
    assert.equal((await n2.post(`${RUTA}/ingresar`, { usuario: 'admin2', clave: CLAVE })).headers.get('location'), `${RUTA}/verificar`);
  });
  it('anula la verificación tras 5 códigos incorrectos y limita los reenvíos', async () => {
    await limpiarLimites();
    const n = new Navegador(conCorreo);
    await conClave(n, 'admin2');
    await n.post(`${RUTA}/verificar/correo`, { correo: 'admin2@copol.test' });
    assert.equal((await n.post(`${RUTA}/verificar/reenviar`, {})).status, 429, 'hay que esperar un minuto para pedir otro código');
    const codigo = ultimoCodigo();
    const malo = codigo === '000000' ? '999999' : '000000';
    for (let i = 0; i < 4; i++) assert.equal((await n.post(`${RUTA}/verificar/codigo`, { codigo: malo })).status, 401);
    const ultimo = await n.post(`${RUTA}/verificar/codigo`, { codigo: malo });
    assert.equal(ultimo.headers.get('location'), `${RUTA}/ingresar?aviso=verificacion-fallida`);
    assert.equal((await n.post(`${RUTA}/verificar/codigo`, { codigo })).headers.get('location'), `${RUTA}/ingresar?aviso=verificacion-vencida`, 'el código anterior ya no sirve');
  });
  it('sin correo asignado no deja ingresar si la verificación está activa', async () => {
    await limpiarLimites();
    await crearUsuario(db, { usuario: 'sincorreo', roles: ['visualizador'], clave: CLAVE, debeCambiar: false, creadoPor: null });
    const r = await conClave(new Navegador(conCorreo), 'sincorreo');
    assert.equal(r.status, 403);
    assert.match(await r.text(), /no tiene un correo/);
  });
  it('Accesos: solo administradores ven quién ingresó, desde qué IP y equipo, y pueden cerrar sesiones', async () => {
    await limpiarLimites();
    const editor = new Navegador();
    await editor.ingresar('editor');
    assert.equal((await editor.pedir(`${RUTA}/accesos`)).status, 403);
    const admin = new Navegador();
    await admin.ingresar('principal');
    const pagina = await (await admin.pedir(`${RUTA}/accesos`)).text();
    assert.match(pagina, /Sesiones abiertas/);
    assert.match(pagina, /Equipos recordados/);
    assert.match(pagina, /Esta sesión/);
    assert.match(pagina, /Ingresó al panel/);
    assert.match(pagina, /PIN incorrecto/);
    const sesionEditor = await fila<{ id_hash: string }>("SELECT s.id_hash FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE u.usuario = 'editor' ORDER BY s.creada_en DESC LIMIT 1");
    assert.equal((await admin.post(`${RUTA}/accesos/sesiones/${sesionEditor!.id_hash}/cerrar`, {})).status, 302);
    assert.equal((await editor.pedir(`${RUTA}/productos`)).status, 302, 'la sesión cerrada por el administrador deja de valer');
    const equipo = await fila<{ token_hash: string }>("SELECT token_hash FROM pases WHERE tipo = 'equipo' LIMIT 1");
    assert.equal((await admin.post(`${RUTA}/accesos/equipos/${equipo!.token_hash}/olvidar`, {})).status, 302);
    assert.equal(await fila('SELECT 1 FROM pases WHERE token_hash = ?', [equipo!.token_hash]), undefined);
  });
  it('el PIN se cambia desde el perfil con la contraseña y rechaza PIN fáciles', async () => {
    const admin = new Navegador();
    await admin.ingresar('principal');
    await admin.pedir(`${RUTA}/perfil`);
    assert.equal((await admin.post(`${RUTA}/perfil/pin`, { pin: '123456', repetir: '123456', clave: CLAVE })).status, 400);
    assert.equal((await admin.post(`${RUTA}/perfil/pin`, { pin: '592013', repetir: '592013', clave: 'incorrecta' })).status, 400);
    const editor = new Navegador();
    await editor.ingresar('editor');
    await editor.pedir(`${RUTA}/perfil`);
    assert.equal((await editor.post(`${RUTA}/perfil/pin`, { pin: '592013', repetir: '592013', clave: CLAVE })).status, 403, 'solo administradores');
  });
  it('sin PIN creado, el primer administrador tiene que crearlo', async () => {
    const otra = await conectar(`file:${path.join(dir, 'sin-pin.db').replace(/\\/g, '/')}`);
    try {
      await crearUsuario(otra, { usuario: 'jefe', roles: ['administrador'], clave: CLAVE, debeCambiar: false, creadoPor: null });
      const app3 = crearApp({ db: otra, config, correo: null });
      const n = new Navegador(app3, false);
      assert.equal((await n.pedir(`${RUTA}/ingresar`)).status, 200, 'sin PIN no hay pantalla de PIN');
      assert.equal((await n.post(`${RUTA}/ingresar`, { usuario: 'jefe', clave: CLAVE })).status, 302);
      assert.equal((await n.pedir(`${RUTA}/productos`)).headers.get('location'), `${RUTA}/pin/crear`);
      await n.pedir(`${RUTA}/pin/crear`);
      assert.equal((await n.post(`${RUTA}/pin/crear`, { pin: '111111', repetir: '111111', clave: CLAVE })).status, 400);
      assert.equal((await n.post(`${RUTA}/pin/crear`, { pin: '734091', repetir: '734091', clave: CLAVE })).status, 302);
      assert.equal((await n.pedir(`${RUTA}/productos`)).status, 200);
      const nuevo = new Navegador(app3, false);
      assert.match((await nuevo.pedir(`${RUTA}/ingresar`)).headers.get('location')!, new RegExp(`^${RUTA}/pin`));
    } finally {
      otra.close();
    }
  });
  it('con el conector apagado no existen las rutas de Claude', async () => {
    const mcp = await conCorreo.request(`${BASE}${RUTA}/mcp`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
    assert.notEqual(mcp.status, 401, 'no responde como servidor MCP');
    assert.ok(!mcp.headers.get('www-authenticate'));
  });
});

describe('notificaciones de la app', () => {
  // Servicio de push falso: registra lo que se mandaría y marca un token como dado de baja.
  const enviados: { to: string; title?: string; data?: Record<string, unknown> }[][] = [];
  const pushFalso: typeof fetch = async (url, init) => {
    if (String(url).endsWith('/getReceipts')) return Response.json({ data: {} });
    const lote = JSON.parse(String(init?.body)) as { to: string }[];
    enviados.push(lote);
    return Response.json({ data: lote.map((m, i) => (m.to.includes('Vencido') ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: `ticket-${enviados.length}-${i}` })) });
  };
  let appPush: ReturnType<typeof crearApp>;
  before(async () => {
    appPush = crearApp({ db, config, correo: null, push: { fetch: pushFalso, esperar: true, token: null } });
    await NT.registrarDispositivo(db, 'ExponentPushToken[celularDePrueba01]', 'android', ['avisos', 'creditos', 'ofertas', 'novedades']);
    await NT.registrarDispositivo(db, 'ExponentPushToken[soloCreditos0002]', 'android', ['creditos']);
    await NT.registrarDispositivo(db, 'ExponentPushToken[celularVencido003]', 'ios', ['avisos']);
  });

  it('agenda: créditos automáticos, repetición, horario y máximo por día', () => {
    const ajustes = { ...NT.AJUSTES_INICIALES, maxPorDia: 2 };
    const base = { estado: 'programada', con_boton: 1, origen: 'manual', destino: 'inicio', categoria: 'avisos', dias: null, hasta: null } as const;
    const notificaciones = [
      { ...base, id: 1, titulo: 'Una vez', texto: 't', repeticion: 'una-vez', fecha: '2099-03-02', hora: '12:00' },
      { ...base, id: 2, titulo: 'Lunes', texto: 't', repeticion: 'diaria', fecha: '2099-03-01', hora: '09:30', dias: '1', hasta: '2099-03-14' },
      { ...base, id: 3, titulo: 'De noche', texto: 't', repeticion: 'una-vez', fecha: '2099-03-03', hora: '23:00' },
    ] as unknown as NT.Notificacion[];
    const agenda = NT.armarAgenda({ hoy: '2099-03-01', aperturas: [{ fecha: '2099-03-02', confirmada: true }, { fecha: '2099-03-05', confirmada: false }], ajustes, notificaciones, enviadasHoy: 0 });
    const del2 = agenda.filter((x) => x.fecha === '2099-03-02');
    // 2 de marzo (lunes): crédito del día (prioridad), lunes 09:30 y la de una vez → la tercera queda afuera.
    assert.deepEqual(del2.map((x) => [x.id, x.omitida]), [['n2-2099-03-02', false], ['credito-2099-03-02-dia', false], ['n1', true]]);
    assert.ok(agenda.some((x) => x.id === 'credito-2099-03-02-antes' && x.fecha === '2099-03-01' && /Mañana/.test(x.titulo)));
    assert.ok(!agenda.some((x) => x.id.startsWith('credito-2099-03-05')), 'fecha a confirmar: sin aviso');
    assert.equal(agenda.find((x) => x.id === 'n3')!.motivo, 'Fuera del horario permitido');
    assert.deepEqual(agenda.filter((x) => x.notificacionId === 2).map((x) => x.fecha), ['2099-03-02', '2099-03-09'], 'solo lunes, hasta el 14');
    const publica = NT.agendaPublica(agenda, new Date('2099-03-01T00:00:00-03:00'));
    assert.ok(publica.every((x) => !('omitida' in x)) && !publica.some((x) => x.id === 'n1' || x.id === 'n3'));
    assert.equal(NT.armarAgenda({ hoy: '2099-03-01', aperturas: [], ajustes: { ...ajustes, activas: false }, notificaciones, enviadasHoy: 0 }).filter((x) => !x.omitida).length, 0, 'pausa general');
  });

  it('panel: programa, valida horario y máximo, edita y cancela; el editor no tiene acceso', async () => {
    const editor = new Navegador(appPush);
    await editor.ingresar('editor');
    assert.equal((await editor.pedir(`${RUTA}/notificaciones`)).status, 403);
    const n = new Navegador(appPush);
    await n.ingresar('principal');
    assert.equal((await n.pedir(`${RUTA}/notificaciones`)).status, 200);
    await n.pedir(`${RUTA}/notificaciones/nueva`);
    const campos = { titulo: 'Asamblea de socios', texto: 'Te esperamos el sábado en Casa Central.', categoria: 'avisos', destino: 'contacto', con_boton: '1', cuando: 'programar', fecha: '2099-05-05', hora: '10:00' };
    assert.match(await (await n.post(`${RUTA}/notificaciones/nueva`, { ...campos, hora: '23:30' })).text(), /horario permitido/);
    assert.match(await (await n.post(`${RUTA}/notificaciones/nueva`, { ...campos, fecha: '2020-01-01' })).text(), /ya pasó/);
    const antes = enviados.length;
    assert.equal((await n.post(`${RUTA}/notificaciones/nueva`, campos)).status, 302);
    assert.equal(enviados.length, antes + 1, 'aviso silencioso de sincronización');
    assert.ok(enviados.at(-1)!.every((m) => m.data?.tipo === 'sincronizar' && !m.title));
    const fila = (await NT.listarNotificaciones(db)).find((x) => x.titulo === 'Asamblea de socios')!;
    assert.equal(fila.estado, 'programada');
    // Máximo por día (2): una segunda entra, la tercera no.
    await n.pedir(`${RUTA}/notificaciones/nueva`);
    assert.equal((await n.post(`${RUTA}/notificaciones/nueva`, { ...campos, titulo: 'Segunda del día', hora: '11:00' })).status, 302);
    await n.pedir(`${RUTA}/notificaciones/nueva`);
    assert.match(await (await n.post(`${RUTA}/notificaciones/nueva`, { ...campos, titulo: 'Tercera del día', hora: '12:00' })).text(), /ya tienen el máximo/);
    await n.pedir(`${RUTA}/notificaciones/${fila.id}`);
    assert.equal((await n.post(`${RUTA}/notificaciones/${fila.id}`, { ...campos, fecha: '2099-05-06' })).status, 302);
    assert.equal((await NT.obtenerNotificacion(db, fila.id))!.fecha, '2099-05-06');
    await n.pedir(`${RUTA}/notificaciones`);
    assert.equal((await n.post(`${RUTA}/notificaciones/${fila.id}/cancelar`, {})).status, 302);
    assert.equal((await NT.obtenerNotificacion(db, fila.id))!.estado, 'cancelada');
  });

  it('enviar ahora: solo a quienes eligieron esa categoría, y borra los celulares dados de baja', async () => {
    const n = new Navegador(appPush);
    await n.ingresar('principal');
    await n.pedir(`${RUTA}/notificaciones`);
    // Horario amplio para que la prueba no dependa de la hora del día.
    assert.equal((await n.post(`${RUTA}/notificaciones/ajustes`, { activas: '1', max_por_dia: '6', desde: '00:00', hasta: '23:59', credito_activo: '1', credito_anterior: '1', credito_dia: '1', credito_hora: '10:00', ofertas_activo: '1', novedades_activo: '1' })).status, 302);
    await NT.registrarDispositivo(db, 'ExponentPushToken[celularVencido003]', 'ios', ['avisos']);
    await n.pedir(`${RUTA}/notificaciones/nueva`);
    const r = await n.post(`${RUTA}/notificaciones/nueva`, { titulo: 'Aviso urgente', texto: 'Hoy Casa Central cierra a las 15 h.', categoria: 'avisos', destino: 'locales', con_boton: '1', cuando: 'ahora' });
    assert.equal(r.status, 302);
    const lote = enviados.at(-1)!;
    assert.deepEqual(lote.map((m) => m.to).sort(), ['ExponentPushToken[celularDePrueba01]', 'ExponentPushToken[celularVencido003]']);
    assert.ok(lote.every((m) => m.title === 'Aviso urgente' && m.data?.destino === 'locales'));
    const fila = (await NT.listarNotificaciones(db)).find((x) => x.titulo === 'Aviso urgente')!;
    assert.deepEqual([fila.estado, fila.alcance], ['enviada', 2]);
    assert.deepEqual(await NT.tokensPara(db, 'avisos'), ['ExponentPushToken[celularDePrueba01]'], 'el vencido se borró');
  });

  it('agenda pública: incluye lo de las últimas horas y los "Enviar ahora" recientes, para el celular que se conecta tarde', async () => {
    const ajustes = { ...NT.AJUSTES_INICIALES, maxPorDia: 3 };
    const base = { estado: 'programada', con_boton: 0, origen: 'manual', destino: 'inicio', categoria: 'avisos', dias: null, hasta: null, repeticion: 'una-vez', texto: 't' } as const;
    const agenda = NT.armarAgenda({ hoy: '2099-03-01', aperturas: [], ajustes, enviadasHoy: 0, notificaciones: [
      { ...base, id: 1, titulo: 'Temprano', fecha: '2099-03-01', hora: '09:00' },
      { ...base, id: 2, titulo: 'Tarde', fecha: '2099-03-01', hora: '20:00' },
    ] as unknown as NT.Notificacion[] });
    const ids = (hora: string) => NT.agendaPublica(agenda, new Date(`2099-03-01T${hora}:00-03:00`)).map((x) => x.id);
    assert.deepEqual(ids('12:00'), ['n1', 'n2'], 'la de las 9 sigue (3 h antes)');
    assert.deepEqual(ids('22:00'), ['n2'], 'pasadas 12 h ya no');
    const recientes = await NT.enviadasRecientes(db);
    assert.ok(recientes.some((x) => x.titulo === 'Aviso urgente'), 'el envío inmediato de la prueba anterior');
  });

  it('avisos automáticos: una sola vez al publicar una novedad', async () => {
    const n = new Navegador(appPush);
    await n.ingresar('principal');
    await n.pedir(`${RUTA}/novedades/nueva`);
    assert.equal((await n.post(`${RUTA}/novedades/nueva`, { titulo: 'Nueva sucursal en Rivera', texto: 'Abrimos en el centro.', plantilla: 'texto', publicado: '1' })).status, 302);
    const nov = (await novedadesPublicadas(db)).find((x) => x.titulo === 'Nueva sucursal en Rivera')!;
    const autos = (await NT.listarNotificaciones(db)).filter((x) => x.origen === `auto:novedad:${nov.id}`);
    assert.equal(autos.length, 1);
    assert.equal(autos[0].categoria, 'novedades');
    await n.pedir(`${RUTA}/novedades/${nov.id}`);
    await n.post(`${RUTA}/novedades/${nov.id}`, { titulo: 'Nueva sucursal en Rivera', texto: 'Abrimos en el centro (editada).', plantilla: 'texto', publicado: '1' });
    assert.equal((await NT.listarNotificaciones(db)).filter((x) => x.origen === `auto:novedad:${nov.id}`).length, 1, 'editar no vuelve a avisar');
  });
});

describe('varios roles por persona y menú por secciones', () => {
  const menu = async (n: Navegador, ruta = `${RUTA}/empleados`) => {
    const html = await (await n.pedir(ruta)).text();
    return { html, tiene: (texto: string) => new RegExp(`class="nav__item"[^>]*>(?:<svg[\\s\\S]*?</svg>)?<span>${texto}</span>`).test(html) || html.includes(`<span>${texto}</span>`), grupos: [...html.matchAll(/<p class="nav__titulo">([^<]+)<\/p>/g)].map((m) => m[1]) };
  };
  before(async () => {
    await crearUsuario(db, { usuario: 'lector-2', roles: ['visualizador'], clave: CLAVE, debeCambiar: false, creadoPor: null });
    await crearUsuario(db, { usuario: 'cargador', roles: ['registros'], clave: CLAVE, debeCambiar: false, creadoPor: null });
    await crearUsuario(db, { usuario: 'mixto', roles: ['editor', 'registros'], clave: CLAVE, debeCambiar: false, creadoPor: null });
    await db.execute("UPDATE usuarios SET correo = usuario || '@copol.test' WHERE correo IS NULL");
  });

  it('cada rol conserva sus permisos y el menú se arma en tres secciones', async () => {
    const admin = new Navegador();
    await admin.ingresar('principal');
    const a = await menu(admin, `${RUTA}/productos`);
    assert.deepEqual(a.grupos, ['Stock Bazar', 'Registros', 'Administración']);
    for (const t of ['Inventario', 'Agregar producto', 'Asistente', 'Nuevo registro', 'Planilla', 'Administración Página', 'Información empleados', 'Estadísticas', 'Usuarios', 'Registro de cambios', 'Accesos']) assert.ok(a.tiene(t), t);
    const lector = new Navegador();
    await lector.ingresar('lector-2');
    const l = await menu(lector, `${RUTA}/productos`);
    assert.deepEqual(l.grupos, ['Stock Bazar', 'Administración']);
    assert.ok(l.tiene('Inventario') && !l.tiene('Nuevo registro') && !l.tiene('Usuarios'));
    assert.equal((await lector.pedir(`${RUTA}/registros`)).status, 403);
    assert.equal((await lector.pedir(`${RUTA}/registros/planilla`)).status, 403);
  });

  it('Carga de registros entra directo a Registros y no ve el stock', async () => {
    const n = new Navegador();
    await n.ingresar('cargador');
    const inicio = await n.pedir(`${RUTA}/`);
    assert.equal(inicio.status, 302);
    assert.equal(inicio.headers.get('location'), `${RUTA}/registros`);
    const m = await menu(n, `${RUTA}/registros`);
    assert.deepEqual(m.grupos, ['Registros', 'Administración']);
    assert.ok(m.tiene('Nuevo registro') && m.tiene('Planilla') && m.tiene('Información empleados') && !m.tiene('Inventario'));
    for (const ruta of [`${RUTA}/productos`, `${RUTA}/nuevo`, `${RUTA}/asistente`, `${RUTA}/usuarios`, `${RUTA}/registro`, `${RUTA}/banner`]) assert.equal((await n.pedir(ruta)).status, 403, ruta);
    assert.equal((await n.pedir(`${RUTA}/empleados`)).status, 200);
    assert.equal((await n.post(`${RUTA}/productos/parlante-1/stock`, { estado: 'sin-stock' })).status, 403);
  });

  it('los permisos de varios roles se suman (Editor de stock + Carga de registros)', async () => {
    const n = new Navegador();
    await n.ingresar('mixto');
    assert.equal((await n.pedir(`${RUTA}/`)).status, 200);
    assert.equal((await n.pedir(`${RUTA}/nuevo`)).status, 200);
    assert.equal((await n.pedir(`${RUTA}/registros`)).status, 200);
    assert.equal((await n.pedir(`${RUTA}/usuarios`)).status, 403);
    assert.match(await (await n.pedir(`${RUTA}/perfil`)).text(), /Editor de stock · Carga de registros/);
  });

  it('un administrador asigna varios roles, se exige al menos uno y siempre queda un administrador', async () => {
    const n = new Navegador();
    await n.ingresar('principal');
    const form = await (await n.pedir(`${RUTA}/usuarios`)).text();
    assert.match(form, /name="roles" value="registros"/);
    assert.match(form, /<p class="roles__titulo">Registros<\/p>/);
    assert.equal((await n.post(`${RUTA}/usuarios`, { usuario: 'sin-rol-1', clave: 'Temporal-Segura-1' })).status, 400);
    assert.equal((await n.post(`${RUTA}/usuarios`, { usuario: 'doble-1', roles: ['visualizador', 'registros'], clave: 'Temporal-Segura-1' })).status, 302);
    const u = (await fila<{ id: number; rol: string; roles: string }>("SELECT id, rol, roles FROM usuarios WHERE usuario = 'doble-1'"))!;
    assert.equal(u.roles, 'visualizador,registros');
    assert.equal(u.rol, 'visualizador');
    assert.equal((await n.post(`${RUTA}/usuarios/${u.id}`, { activo: '1' })).status, 400, 'sin roles no se guarda');
    assert.equal((await n.post(`${RUTA}/usuarios/${u.id}`, { roles: ['editor', 'registros', 'inventado'], activo: '1' })).status, 302);
    assert.equal((await fila<{ roles: string }>('SELECT roles FROM usuarios WHERE id = ?', [u.id]))!.roles, 'editor,registros');
    // Un administrador con otros roles también cuenta como administrador: el último no se puede bajar.
    await crearUsuario(db, { usuario: 'solo-admin', roles: ['administrador', 'registros'], clave: CLAVE, debeCambiar: false, creadoPor: null });
    await db.execute("UPDATE usuarios SET activo = 0 WHERE usuario IN ('admin2', 'jefe-x')");
    const ultimo = (await fila<{ id: number }>("SELECT id FROM usuarios WHERE usuario = 'solo-admin'"))!;
    const vistoPorPrincipal = await n.post(`${RUTA}/usuarios/${ultimo.id}`, { roles: ['registros'], activo: '1' });
    assert.equal(vistoPorPrincipal.status, 302, 'principal sigue siendo administrador: se puede');
    await db.execute("UPDATE usuarios SET activo = 1 WHERE usuario = 'admin2'");
  });

  it('las cuentas anteriores (solo la columna rol) siguen funcionando con su rol', async () => {
    await db.execute("INSERT INTO usuarios (usuario, nombre, rol, hash, debe_cambiar_clave, creado_en, correo) SELECT 'vieja', 'vieja', 'editor', hash, 0, creado_en, 'vieja@copol.test' FROM usuarios WHERE usuario = 'editor'");
    assert.equal((await fila<{ roles: string | null }>("SELECT roles FROM usuarios WHERE usuario = 'vieja'"))!.roles, null);
    const n = new Navegador();
    assert.equal((await n.ingresar('vieja')).status, 302);
    assert.equal((await n.pedir(`${RUTA}/nuevo`)).status, 200);
    assert.equal((await n.pedir(`${RUTA}/usuarios`)).status, 403);
  });
});

describe('registros: formulario, asistente y planilla', () => {
  const VALIDO = { nombre: 'María Rodríguez', socio: '48213', cedula: '55605392', direccion: 'Bv. Artigas 1520 apto 503, Montevideo', producto: 'Lavarropas Samsung 8 kg', codigo: '467972', flete: 'Sí', service: '', adicional: 'Llamar antes', mapa: 'https://www.google.com/maps/search/?api=1&query=-34.900000%2C-56.180000' };
  const entrar = async (usuario: string) => {
    const n = new Navegador();
    await n.ingresar(usuario);
    await n.pedir(`${RUTA}/registros`);
    return n;
  };
  const cantidad = async () => Number((await fila<{ n: number }>('SELECT COUNT(*) n FROM registros'))!.n);
  // Gateway de IA simulado: devuelve campos fijos y deja los pedidos para revisarlos.
  const pedidosIA: { cuerpo: { messages: { content: unknown }[] } }[] = [];
  const falsoGateway: typeof fetch = async (entrada, init) => {
    assert.ok(String(entrada).startsWith('https://ai-gateway.vercel.sh/'));
    pedidosIA.push({ cuerpo: JSON.parse(String(init!.body)) });
    return new Response(JSON.stringify({ content: [{ type: 'tool_use', id: 'x', name: 'completar_formulario', input: { respuesta: 'Listo.', nombre: 'maría rodríguez', cedula: '5.560.539-2', socio: '48.213', flete: 'si' } }], stop_reason: 'tool_use' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  let original: typeof app;
  before(() => {
    original = app;
    app = crearApp({ db, config, almacen: almacenConfigurado(config.dirImagenes, `${RUTA}/media`), correo: null, asistente: { fetch: falsoGateway, token: 'token-de-prueba' } });
  });
  after(() => { app = original; });

  it('valida en el servidor (cédula, socio, dirección y enlace del mapa) y no guarda si hay errores', async () => {
    const n = await entrar('cargador');
    const antes = await cantidad();
    const mal = await n.postJson(`${RUTA}/registros/guardar`, { ...VALIDO, cedula: '12345678', socio: 'abc', mapa: 'https://malo.example/x' });
    assert.equal(mal.status, 422);
    const cuerpo = await mal.json() as { errores: Record<string, string> };
    assert.deepEqual(Object.keys(cuerpo.errores).sort(), ['cedula', 'direccion', 'socio']);
    assert.equal((await n.postJson(`${RUTA}/registros/guardar`, { ...VALIDO, nombre: '', flete: 'quizás' })).status, 422);
    assert.equal(await cantidad(), antes);
  });

  it('exige sesión, permiso, mismo origen y token CSRF', async () => {
    assert.equal((await new Navegador().postJson(`${RUTA}/registros/guardar`, VALIDO)).status, 403, 'sin sesión no hay token CSRF válido');
    const l = new Navegador();
    await l.ingresar('lector-2');
    await l.pedir(`${RUTA}/productos`);
    assert.equal((await l.postJson(`${RUTA}/registros/guardar`, VALIDO)).status, 403);
    assert.equal((await l.postJson(`${RUTA}/registros/asistente`, { mensajes: [{ rol: 'usuario', texto: 'hola' }] })).status, 403);
    const n = await entrar('cargador');
    assert.equal((await n.pedir(`${RUTA}/registros/guardar`, { method: 'POST', body: JSON.stringify(VALIDO), headers: { 'content-type': 'application/json', accept: 'application/json' } })).status, 403, 'sin token CSRF');
    assert.equal((await n.postJson(`${RUTA}/registros/guardar`, VALIDO, { origen: 'https://otro.example' } as RequestInit)).status, 403, 'otro origen');
  });

  it('sin hoja de Google la planilla de prueba vive en la base: guarda, lista y descarga el Excel', async () => {
    await db.execute('DELETE FROM registros');
    const n = await entrar('cargador');
    const pagina = await (await n.pedir(`${RUTA}/registros`)).text();
    assert.match(pagina, /Modo de prueba/);
    assert.match(pagina, /data-ia="1"/);
    assert.match(pagina, /name="cedula"/);
    const ok = await n.postJson(`${RUTA}/registros/guardar`, VALIDO);
    assert.equal(ok.status, 200);
    assert.match(((await ok.json()) as { destino: string }).destino, /Planilla de prueba/);
    const fila1 = (await fila<Record<string, string | number | null>>('SELECT * FROM registros'))!;
    assert.equal(fila1.cedula, '55605392');
    assert.equal(fila1.cargado_por, 'cargador');
    assert.equal(fila1.mapa, VALIDO.mapa);
    assert.match(String(fila1.fecha), /^\d{4}-\d\d-\d\d \d\d:\d\d$/);
    const aud = (await fila<{ detalle: string; usuario: string }>("SELECT detalle, usuario FROM auditoria WHERE accion = 'registro.alta' ORDER BY id DESC"))!;
    assert.equal(aud.usuario, 'cargador');
    assert.ok(!aud.detalle.includes('55605392') && !aud.detalle.includes('Artigas'), 'la auditoría no lleva cédula ni dirección');
    const lista = await (await n.pedir(`${RUTA}/registros/planilla`)).text();
    assert.match(lista, /María Rodríguez/);
    assert.match(lista, /href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=/);
    const xlsx = await n.pedir(`${RUTA}/registros/planilla.xlsx`);
    assert.equal(xlsx.status, 200);
    assert.match(xlsx.headers.get('content-disposition') ?? '', /attachment; filename="registros-copol-prueba\.xlsx"/);
    const bytes = new Uint8Array(await xlsx.arrayBuffer());
    assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK');
  });

  it('solo un administrador vacía la planilla de prueba y queda en el registro de cambios', async () => {
    const n = await entrar('cargador');
    assert.equal((await n.post(`${RUTA}/registros/planilla/vaciar`, {})).status, 403);
    assert.ok(await cantidad() > 0);
    const admin = new Navegador();
    await admin.ingresar('principal');
    await admin.pedir(`${RUTA}/registros/planilla`);
    assert.equal((await admin.post(`${RUTA}/registros/planilla/vaciar`, {})).status, 302);
    assert.equal(await cantidad(), 0);
    assert.ok(await fila("SELECT 1 FROM auditoria WHERE accion = 'registro.vaciar'"));
  });

  it('el asistente completa el formulario con campos limpios, recibe fotos y nunca guarda', async () => {
    const n = await entrar('mixto');
    const antes = await cantidad();
    const foto = Buffer.from(await (await png(40, 30)).arrayBuffer()).toString('base64');
    const r = await n.postJson(`${RUTA}/registros/asistente`, { mensajes: [{ rol: 'usuario', texto: 'María Rodríguez socia 48213 cédula 5.560.539-2' }], formulario: { flete: 'No' }, adjuntos: [{ tipo: 'imagen', datos: foto, nombre: 'cedula.png' }] });
    assert.equal(r.status, 200);
    const cuerpo = await r.json() as { ok: boolean; campos: Record<string, string>; faltan: string[] };
    assert.deepEqual(cuerpo.campos, { nombre: 'maría rodríguez', socio: '48213', cedula: '55605392', flete: 'Sí' });
    assert.ok(cuerpo.faltan.includes('Producto'));
    const enviado = pedidosIA.at(-1)!.cuerpo.messages.at(-1)!.content as { type: string }[];
    assert.equal(enviado[0].type, 'image');
    assert.equal(await cantidad(), antes);
    // Solo fotos y PDF reales: un archivo que dice ser imagen no pasa.
    const falso = await n.postJson(`${RUTA}/registros/asistente`, { mensajes: [{ rol: 'usuario', texto: 'hola' }], adjuntos: [{ tipo: 'imagen', datos: Buffer.from('<?php echo 1;').toString('base64'), nombre: 'x.png' }] });
    assert.equal(falso.status, 413);
    assert.equal((await n.postJson(`${RUTA}/registros/asistente`, { mensajes: [] })).status, 400);
    assert.ok(await fila("SELECT 1 FROM auditoria WHERE accion = 'registro.asistente'"));
  });

  it('el asistente tiene límite por día y se puede apagar', async () => {
    const n = await entrar('mixto');
    process.env.IA_LIMITE_DIA = '1';
    try {
      assert.equal((await n.postJson(`${RUTA}/registros/asistente`, { mensajes: [{ rol: 'usuario', texto: 'otro mensaje' }] })).status, 429);
    } finally {
      delete process.env.IA_LIMITE_DIA;
    }
    process.env.IA_APAGADA = '1';
    try {
      assert.equal((await n.postJson(`${RUTA}/registros/asistente`, { mensajes: [{ rol: 'usuario', texto: 'hola' }] })).status, 503);
      assert.match(await (await n.pedir(`${RUTA}/registros`)).text(), /data-ia="0"/);
    } finally {
      delete process.env.IA_APAGADA;
    }
  });

  it('con la hoja de Google conectada escribe en la pestaña del mes y la base guarda solo un resumen', async () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.GOOGLE_CREDENCIALES = JSON.stringify({ client_email: 'registros@prueba.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
    process.env.GOOGLE_HOJA = 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit';
    const google = await import('../src/registros-google.ts');
    const { nombreMes, COLUMNAS } = await import('../src/registros-campos.ts');
    const llamadas: { url: string; metodo: string; cuerpo: any }[] = [];
    google.usarFetch(async (entrada, init) => {
      const url = String(entrada);
      const cuerpo = init?.body && typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : null;
      llamadas.push({ url, metodo: init?.method ?? 'GET', cuerpo });
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.startsWith('https://oauth2.googleapis.com/token')) return json({ access_token: 'tk', expires_in: 3600 });
      if (url.includes('fields=properties')) return json({ properties: { title: 'Registros COPOL', locale: 'es_UY' }, sheets: [{ properties: { sheetId: 7, title: nombreMes() } }] });
      if (url.includes('/values/') && !url.includes(':append')) return json({ values: [COLUMNAS] });
      return json({});
    });
    try {
      const n = await entrar('cargador');
      assert.doesNotMatch(await (await n.pedir(`${RUTA}/registros`)).text(), /Modo de prueba/);
      const ok = await n.postJson(`${RUTA}/registros/guardar`, VALIDO);
      assert.equal(ok.status, 200, await ok.clone().text());
      assert.match(((await ok.json()) as { destino: string }).destino, new RegExp(`Google Sheets · ${nombreMes()}`));
      const append = llamadas.find((x) => x.url.includes(':append'))!;
      assert.ok(decodeURIComponent(append.url).includes(`'${nombreMes()}'!A:K`));
      const valores = append.cuerpo.values[0] as string[];
      assert.equal(valores[1], 'María Rodríguez');
      assert.equal(valores[3], '55605392');
      assert.match(valores[4], /^=HYPERLINK\("https:\/\/www\.google\.com\/maps\/search\//);
      assert.equal(valores[9], 'cargador');
      const r = (await fila<Record<string, string | null>>('SELECT * FROM registros ORDER BY id DESC'))!;
      assert.equal(r.nombre, 'María Rodríguez');
      assert.equal(r.cedula, null);
      assert.equal(r.direccion, null);
      assert.equal(r.adicional, null);
      assert.match(r.destino!, /Google Sheets/);
      const pagina = await (await n.pedir(`${RUTA}/registros/planilla`)).text();
      assert.match(pagina, /Abrir hoja de Google/);
      assert.doesNotMatch(pagina, /55605392|Artigas/);
      assert.equal((await n.pedir(`${RUTA}/registros/planilla.xlsx`)).status, 302);
      // Si Google falla, no queda ninguna constancia: la persona ve el error y puede reintentar.
      const antes = await cantidad();
      google.usarFetch(async (entrada) => (String(entrada).startsWith('https://oauth2.googleapis.com/') ? new Response(JSON.stringify({ access_token: 'tk', expires_in: 3600 }), { status: 200 }) : new Response('{"error":{"status":"PERMISSION_DENIED"}}', { status: 403 })));
      const falla = await n.postJson(`${RUTA}/registros/guardar`, VALIDO);
      assert.equal(falla.status, 503);
      assert.match(((await falla.json()) as { error: string }).error, /Compartila con registros@prueba\.iam\.gserviceaccount\.com/);
      assert.equal(await cantidad(), antes);
    } finally {
      delete process.env.GOOGLE_CREDENCIALES;
      delete process.env.GOOGLE_HOJA;
      google.usarFetch(fetch);
    }
  });

  const VALIDO_COLOR = { nombre: 'Lucía Pérez', socio: '1001', cedula: '55605392', direccion: 'Calle 1', producto: 'Heladera', codigo: '111', flete: 'No', service: '', adicional: '', mapa: '' };
  it('cada persona elige su color: se guarda, se ve en la planilla y pinta su celda en la hoja de Google', async () => {
    const n = await entrar('cargador');
    assert.match(await (await n.pedir(`${RUTA}/perfil`)).text(), /Tu color en la planilla/);
    assert.equal((await n.post(`${RUTA}/perfil/color`, { color: 'rojo-que-no-existe' })).status, 400);
    assert.equal((await n.post(`${RUTA}/perfil/color`, { color: 'azul' })).status, 302);
    assert.equal((await fila<{ color: string }>("SELECT color FROM usuarios WHERE usuario = 'cargador'"))!.color, 'azul');
    await n.postJson(`${RUTA}/registros/guardar`, VALIDO_COLOR);
    assert.match(await (await n.pedir(`${RUTA}/registros/planilla`)).text(), /pers pers--azul">cargador</);
  });

  it('con la hoja conectada la planilla muestra lo que hay en la hoja (no lo borrado) y colorea la celda «Cargado por»', async () => {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.GOOGLE_CREDENCIALES = JSON.stringify({ client_email: 'registros@prueba.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
    process.env.GOOGLE_HOJA = 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit';
    const google = await import('../src/registros-google.ts');
    const { nombreMes, COLUMNAS } = await import('../src/registros-campos.ts');
    const n = await entrar('cargador');
    await n.post(`${RUTA}/perfil/color`, { color: 'azul' });
    const lleva = await fila<{ n: number }>("SELECT COUNT(*) n FROM registros WHERE nombre = 'Lucía Pérez'");
    assert.ok(Number(lleva!.n) >= 1, 'hay una constancia vieja en la base');
    const llamadas: { url: string; cuerpo: any }[] = [];
    google.usarFetch(async (entrada, init) => {
      const url = String(entrada);
      const cuerpo = init?.body && typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : null;
      llamadas.push({ url, cuerpo });
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
      if (url.startsWith('https://oauth2.googleapis.com/token')) return json({ access_token: 'tk', expires_in: 3600 });
      if (url.includes('fields=properties')) return json({ properties: { title: 'Registros COPOL', locale: 'es_UY' }, sheets: [{ properties: { sheetId: 7, title: nombreMes() } }] });
      if (url.includes(':append')) return json({ updates: { updatedRange: `'${nombreMes()}'!A9:K9` } });
      if (url.includes('A2%3AK') || url.includes('A2:K')) return json({ values: [['27/10/2026 16:30', 'Ana Gómez', '77', '', '', '', 'Sí', 'Cocina', 'C-9', 'cargador', '']] });
      if (url.includes('/values/')) return json({ values: [COLUMNAS] });
      return json({});
    });
    try {
      const pagina = await (await n.pedir(`${RUTA}/registros/planilla`)).text();
      assert.match(pagina, /Ana Gómez/);
      assert.match(pagina, /pers pers--azul">cargador</);
      assert.doesNotMatch(pagina, /Lucía Pérez/, 'lo que ya no está en la hoja no se muestra');
      const ok = await n.postJson(`${RUTA}/registros/guardar`, VALIDO_COLOR);
      assert.equal(ok.status, 200, await ok.clone().text());
      const pintar = llamadas.find((x) => x.cuerpo?.requests?.[0]?.repeatCell?.range?.startRowIndex === 8);
      assert.ok(pintar, 'pinta la fila 9 (índice 8)');
      const rc = pintar!.cuerpo.requests[0].repeatCell;
      assert.equal(rc.range.startColumnIndex, COLUMNAS.indexOf('Cargado por'));
      assert.ok(rc.cell.userEnteredFormat.backgroundColor.blue > 0.8);
    } finally {
      delete process.env.GOOGLE_CREDENCIALES;
      delete process.env.GOOGLE_HOJA;
      google.usarFetch(fetch);
    }
  });
});

describe('mantener la sesión iniciada', () => {
  const sesion = async (n: Navegador) => (await fila<{ larga: number; expira_en: string; creada_en: string; ultima_actividad: string; id_hash: string }>('SELECT s.* FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE u.usuario = ? ORDER BY s.creada_en DESC', [n.usuario]))!;
  it('el ingreso ofrece la casilla y, marcada, la sesión dura semanas; sin marcar, queda la sesión corta', async () => {
    const a = new Navegador();
    const pagina = await (await a.pedir(`${RUTA}/ingresar`)).text();
    assert.match(pagina, /name="mantener"/);
    a.usuario = 'editor';
    assert.equal((await a.post(`${RUTA}/ingresar`, { usuario: 'editor', clave: CLAVE, mantener: '1' })).status, 302);
    const larga = await sesion(a);
    assert.equal(larga.larga, 1);
    const dias = (Date.parse(larga.expira_en) - Date.parse(larga.creada_en)) / 86_400_000;
    assert.ok(dias > 89 && dias <= 90.001, `tope de 90 días (${dias})`);
    // Pasadas 2 horas sin usarla sigue abierta (la común se cierra a los 30 minutos).
    await db.execute('UPDATE sesiones SET ultima_actividad = ? WHERE id_hash = ?', [new Date(Date.now() - 2 * 3600_000).toISOString(), larga.id_hash]);
    assert.equal((await a.pedir(`${RUTA}/productos`)).status, 200);
    // Y se cierra tras 30 días sin usarla.
    await db.execute('UPDATE sesiones SET ultima_actividad = ? WHERE id_hash = ?', [new Date(Date.now() - 31 * 86_400_000).toISOString(), larga.id_hash]);
    assert.equal((await a.pedir(`${RUTA}/productos`)).status, 302);

    const b = new Navegador();
    b.usuario = 'editor';
    await b.pedir(`${RUTA}/ingresar`);
    assert.equal((await b.post(`${RUTA}/ingresar`, { usuario: 'editor', clave: CLAVE })).status, 302);
    const corta = await sesion(b);
    assert.equal(corta.larga, 0);
    await db.execute('UPDATE sesiones SET ultima_actividad = ? WHERE id_hash = ?', [new Date(Date.now() - 2 * 3600_000).toISOString(), corta.id_hash]);
    assert.equal((await b.pedir(`${RUTA}/productos`)).status, 302, 'la común vence por inactividad');
  });
});

describe('estadísticas: archivo mes a mes', () => {
  it('guarda cada mes terminado sin pisarlo, lo muestra mes a mes y lo descarga en CSV', async () => {
    const dia = (f: string, tipo: string, clave: string, valor: number) => db.execute({ sql: 'INSERT INTO estadisticas_dia (fecha, tipo, clave, valor) VALUES (?, ?, ?, ?)', args: [f, tipo, clave, valor] });
    for (const [f, v, vis, w] of [['2026-08-10', 5, 3, 1], ['2026-09-03', 40, 20, 4], ['2026-09-20', 60, 30, 6]] as const) {
      await dia(f, 'vistas', '', v); await dia(f, 'visitantes', '', vis); await dia(f, 'whatsapp', '', w); await dia(f, 'pagina', '/hipermercado/bazar/', v); await dia(f, 'dispositivo', 'celular', v);
    }
    const nuevos = await ES.archivarMeses(db, '2026-10-05');
    assert.deepEqual(nuevos.sort(), ['2026-08', '2026-09']);
    assert.deepEqual(await ES.archivarMeses(db, '2026-10-05'), [], 'repetirlo no vuelve a guardar');
    const sep = (await ES.mesArchivado(db, '2026-09'))!;
    assert.equal(sep.resumen.totales.vistas, 100);
    assert.equal(sep.resumen.dias.length, 30);
    assert.equal(sep.resumen.anteriores.vistas, 5, 'se compara con el mes anterior');
    // Lo guardado no cambia aunque después se limpien los contadores del día.
    await db.execute("DELETE FROM estadisticas_dia WHERE fecha LIKE '2026-09-%'");
    assert.equal((await ES.mesArchivado(db, '2026-09'))!.resumen.totales.vistas, 100);

    const n = new Navegador();
    await n.ingresar('principal');
    const lista = await (await n.pedir(`${RUTA}/estadisticas/meses`)).text();
    assert.match(lista, /Septiembre|Setiembre de 2026/);
    assert.match(lista, /Agosto de 2026/);
    assert.match(lista, /En curso/);
    const detalle = await n.pedir(`${RUTA}/estadisticas/meses/2026-09`);
    assert.equal(detalle.status, 200);
    const html = await detalle.text();
    assert.match(html, /Registro de Setiembre de 2026/);
    assert.match(html, /no cambia más/);
    const csv = await n.pedir(`${RUTA}/estadisticas/meses/2026-09.csv`);
    assert.match(csv.headers.get('content-type') ?? '', /text\/csv/);
    const texto = await csv.text();
    assert.match(texto, /2026-09-03,40,20,4/);
    assert.match(texto, /Bazar,100/);
    assert.equal((await n.pedir(`${RUTA}/estadisticas/meses/2026-05`)).status, 404);
    assert.equal((await n.pedir(`${RUTA}/estadisticas/meses/9999-99`)).status, 404);
    assert.match(await (await n.pedir(`${RUTA}/estadisticas`)).text(), /Mes a mes/);
    const editor = new Navegador();
    await editor.ingresar('editor');
    assert.equal((await editor.pedir(`${RUTA}/estadisticas/meses`)).status, 403);
  });
});

describe('campana de novedades del encabezado', () => {
  it('se configura desde Administración Página y valida lo que llega', async () => {
    const { obtenerCampana, CAMPANA_INICIAL } = await import('../src/campana.ts');
    assert.deepEqual(await obtenerCampana(db), CAMPANA_INICIAL);
    const n = new Navegador();
    await n.ingresar('principal');
    const pagina = await (await n.pedir(`${RUTA}/campana`)).text();
    assert.match(pagina, /Ajustes de la campana/);
    assert.match(pagina, /Cambia según la hora/);
    assert.match(await (await n.pedir(`${RUTA}/banner`)).text(), />Campana</);
    assert.equal((await n.post(`${RUTA}/campana`, { modo: 'fijo', numero: '500', titulo: 'Avisos', activa: '1' })).status, 400);
    assert.equal((await n.post(`${RUTA}/campana`, { modo: 'otro', titulo: 'Avisos', activa: '1' })).status, 400);
    assert.equal((await n.post(`${RUTA}/campana`, { modo: 'fijo', numero: '4', titulo: 'ab', activa: '1' })).status, 400);
    assert.equal((await n.post(`${RUTA}/campana`, { modo: 'fijo', numero: '4', titulo: 'Avisos de COPOL', activa: '1' })).status, 302);
    assert.deepEqual(await obtenerCampana(db), { activa: true, modo: 'fijo', numero: 4, titulo: 'Avisos de COPOL' });
    assert.equal((await n.post(`${RUTA}/campana`, { modo: 'cantidad', numero: '', titulo: 'Novedades COPOL' })).status, 302);
    assert.equal((await obtenerCampana(db)).activa, false, 'sin la casilla, la campana se oculta');
    assert.ok(await fila("SELECT 1 FROM auditoria WHERE accion = 'campana.ajustes'"));
    const editor = new Navegador();
    await editor.ingresar('editor');
    assert.equal((await editor.pedir(`${RUTA}/campana`)).status, 403);
  });
});
