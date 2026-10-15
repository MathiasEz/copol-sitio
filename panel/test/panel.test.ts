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
import { crearUsuario } from '../src/usuarios.ts';
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
  async post(ruta: string, campos: Record<string, string | Blob>, extra: RequestInit & { origen?: string | null } = {}) {
    const fd = new FormData();
    if (!('_csrf' in campos)) fd.set('_csrf', this.csrf);
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return this.pedir(ruta, { method: 'POST', body: fd, ...extra });
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
  await crearUsuario(db, { usuario: 'principal', rol: 'administrador', clave: CLAVE, debeCambiar: false, protegido: true, creadoPor: null });
  await crearUsuario(db, { usuario: 'admin2', rol: 'administrador', clave: CLAVE, debeCambiar: false, creadoPor: null });
  await crearUsuario(db, { usuario: 'editor', rol: 'editor', clave: CLAVE, debeCambiar: false, creadoPor: null });
  await crearUsuario(db, { usuario: 'lector', rol: 'visualizador', clave: CLAVE, debeCambiar: false, creadoPor: null });
  await crearUsuario(db, { usuario: 'nuevo', rol: 'editor', clave: CLAVE, debeCambiar: true, creadoPor: null });
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
    for (const ruta of [`${RUTA}`, `${RUTA}/productos`, `${RUTA}/usuarios`, `${RUTA}/novedades`, `${RUTA}/registro`, `${RUTA}/nuevo`, `${RUTA}/perfil`]) {
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
    await crearUsuario(db, { usuario: 'victima', rol: 'visualizador', clave: CLAVE, debeCambiar: false, creadoPor: null });
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
    for (const ruta of [`${RUTA}/nuevo`, `${RUTA}/usuarios`, `${RUTA}/novedades`]) assert.equal((await n.pedir(ruta)).status, 403, ruta);
    assert.equal((await fila<{ stock_estado: string }>("SELECT stock_estado FROM productos WHERE id = 'parlante-1'"))!.stock_estado, 'con-stock');
  });
  it('el editor no administra usuarios, novedades ni registro', async () => {
    const n = new Navegador();
    await n.ingresar('editor');
    for (const ruta of [`${RUTA}/usuarios`, `${RUTA}/registro`, `${RUTA}/novedades`]) assert.equal((await n.pedir(ruta)).status, 403, ruta);
    await n.pedir(`${RUTA}/productos`);
    assert.equal((await n.post(`${RUTA}/usuarios`, { usuario: 'xx-1', rol: 'administrador', clave: 'Clave-Larga-123!' })).status, 403);
  });
  it('nadie más que el propio administrador principal puede modificarlo o eliminarlo', async () => {
    const n = new Navegador();
    await n.ingresar('admin2');
    const p = (await fila<{ id: number }>("SELECT id FROM usuarios WHERE usuario = 'principal'"))!;
    await n.pedir(`${RUTA}/usuarios`);
    assert.equal((await n.post(`${RUTA}/usuarios/${p.id}/eliminar`, {})).status, 403);
    assert.equal((await n.post(`${RUTA}/usuarios/${p.id}`, { rol: 'visualizador' })).status, 403);
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

describe('usuarios', () => {
  it('alta simple con usuario o correo, rol y contraseña temporal; edición y baja', async () => {
    const n = new Navegador();
    await n.ingresar('principal');
    const form = await (await n.pedir(`${RUTA}/usuarios`)).text();
    assert.match(form, /Usuario o correo/);
    assert.doesNotMatch(form, /name="nombre"/);
    assert.equal((await n.post(`${RUTA}/usuarios`, { usuario: 'ana@copol.com.uy', rol: 'visualizador', clave: 'corta' })).status, 400);
    assert.equal((await n.post(`${RUTA}/usuarios`, { usuario: 'Ana@Copol.com.uy', rol: 'visualizador', clave: 'Temporal-Segura-1' })).status, 302);
    const ana = (await fila<{ id: number; rol: string; debe_cambiar_clave: number; hash: string }>("SELECT * FROM usuarios WHERE usuario = 'ana@copol.com.uy'"))!;
    assert.equal(ana.rol, 'visualizador');
    assert.equal(ana.debe_cambiar_clave, 1);
    assert.match(ana.hash, /^scrypt\$/);
    assert.ok(!ana.hash.includes('Temporal-Segura-1'));
    const ingreso = await new Navegador().ingresar('ana@copol.com.uy', 'Temporal-Segura-1');
    assert.equal(ingreso.headers.get('location'), `${RUTA}/perfil/clave`);
    await n.pedir(`${RUTA}/usuarios/${ana.id}`);
    assert.equal((await n.post(`${RUTA}/usuarios/${ana.id}`, { rol: 'editor', activo: '1' })).status, 302);
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
    assert.deepEqual(herramientas.sort(), ['buscar_productos', 'leer_pagina', 'listar_novedades', 'proponer_cambios', 'proponer_stock_grupo', 'resumen_stock', 'ultimos_cambios']);
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
    await crearUsuario(db, { usuario: 'sincorreo', rol: 'visualizador', clave: CLAVE, debeCambiar: false, creadoPor: null });
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
      await crearUsuario(otra, { usuario: 'jefe', rol: 'administrador', clave: CLAVE, debeCambiar: false, creadoPor: null });
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
