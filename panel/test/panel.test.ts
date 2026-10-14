// Pruebas de seguridad y funcionamiento del panel: `npm run panel:test` (node:test).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import sharp from 'sharp';
import { crearApp } from '../src/app.ts';
import { cargarConfig } from '../src/config.ts';
import { ahora, conectar, una, type Db } from '../src/db.ts';
import { almacenConfigurado } from '../src/imagenes.ts';
import { novedadesPublicadas } from '../src/novedades.ts';
import { crearUsuario } from '../src/usuarios.ts';

delete process.env.BLOB_READ_WRITE_TOKEN; // las pruebas guardan imágenes en una carpeta temporal
const BASE = 'http://localhost:4321';
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'copol-panel-'));
const config = { ...cargarConfig({}), dirImagenes: path.join(dir, 'imagenes'), confiarProxy: false };
let db: Db;
let app: ReturnType<typeof crearApp>;
// Contraseña generada para esta prueba (no es una credencial real).
const CLAVE = 'Prueba-Panel-2026!';
const fila = <T>(sql: string, args: (string | number)[] = []) => una<T>(db, sql, args);

/** Cliente mínimo que conserva cookies y extrae el token CSRF de los formularios. */
class Navegador {
  cookies = new Map<string, string>();
  csrf = '';
  async pedir(ruta: string, init: RequestInit & { origen?: string | null } = {}) {
    const headers = new Headers(init.headers);
    if (this.cookies.size) headers.set('cookie', [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '));
    if (init.method === 'POST' && init.origen !== null) headers.set('origin', init.origen ?? BASE);
    const res = await app.request(BASE + ruta, { ...init, headers, redirect: 'manual' });
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
    await this.pedir('/panel/ingresar');
    return this.post('/panel/ingresar', { usuario, clave });
  }
}
const json = { headers: { accept: 'application/json' } };
const png = async (w = 600, h = 400) => new File([new Uint8Array(await sharp({ create: { width: w, height: h, channels: 3, background: '#008d36' } }).png().toBuffer())], 'x.png', { type: 'image/png' });

before(async () => {
  db = await conectar(`file:${path.join(dir, 'prueba.db').replace(/\\/g, '/')}`);
  app = crearApp({ db, config, almacen: almacenConfigurado(config.dirImagenes, '/panel/media') });
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
});
after(async () => {
  db.close();
  await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe('autenticación', () => {
  it('sin sesión redirige al ingreso, también en rutas internas', async () => {
    const n = new Navegador();
    for (const ruta of ['/panel', '/panel/productos', '/panel/usuarios', '/panel/novedades', '/panel/registro', '/panel/nuevo', '/panel/perfil']) {
      const r = await n.pedir(ruta);
      assert.equal(r.status, 302, ruta);
      assert.match(r.headers.get('location')!, /^\/panel\/ingresar/);
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
    await n.pedir('/panel/ingresar');
    assert.equal((await n.post('/panel/ingresar', { usuario: 'editor', clave: CLAVE, _csrf: 'falso' })).status, 403);
    assert.equal((await n.post('/panel/ingresar', { usuario: 'editor', clave: CLAVE }, { origen: 'https://atacante.example' })).status, 403);
  });
  it('ingresa con cookie HttpOnly SameSite=Strict y cierra sesión', async () => {
    const n = new Navegador();
    await n.pedir('/panel/ingresar');
    const r = await n.post('/panel/ingresar', { usuario: 'editor', clave: CLAVE });
    assert.equal(r.status, 302);
    const cookie = r.headers.getSetCookie().find((c) => c.startsWith('copol_panel='))!;
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.equal((await n.pedir('/panel')).status, 200);
    await n.post('/panel/salir', {});
    assert.equal((await n.pedir('/panel')).status, 302);
  });
  it('obliga a cambiar la contraseña temporal antes de usar el panel', async () => {
    const n = new Navegador();
    assert.equal((await n.ingresar('nuevo')).headers.get('location'), '/panel/perfil/clave');
    assert.equal((await n.pedir('/panel/productos')).headers.get('location'), '/panel/perfil/clave');
    await n.pedir('/panel/perfil/clave');
    assert.equal((await n.post('/panel/perfil/clave', { actual: CLAVE, nueva: 'corta', repetir: 'corta' })).status, 400);
    assert.equal((await n.post('/panel/perfil/clave', { actual: CLAVE, nueva: 'Otra-Clave-Segura-9', repetir: 'Otra-Clave-Segura-9' })).status, 302);
    assert.equal((await n.pedir('/panel/productos')).status, 200);
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
    assert.equal((await n.pedir('/panel/productos?q=parlante')).status, 200);
    assert.equal((await n.post('/panel/productos/parlante-1/stock', { estado: 'sin-stock' })).status, 403);
    for (const ruta of ['/panel/nuevo', '/panel/usuarios', '/panel/novedades']) assert.equal((await n.pedir(ruta)).status, 403, ruta);
    assert.equal((await fila<{ stock_estado: string }>("SELECT stock_estado FROM productos WHERE id = 'parlante-1'"))!.stock_estado, 'con-stock');
  });
  it('el editor no administra usuarios, novedades ni registro', async () => {
    const n = new Navegador();
    await n.ingresar('editor');
    for (const ruta of ['/panel/usuarios', '/panel/registro', '/panel/novedades']) assert.equal((await n.pedir(ruta)).status, 403, ruta);
    await n.pedir('/panel/productos');
    assert.equal((await n.post('/panel/usuarios', { usuario: 'xx-1', rol: 'administrador', clave: 'Clave-Larga-123!' })).status, 403);
  });
  it('nadie más que el propio administrador principal puede modificarlo o eliminarlo', async () => {
    const n = new Navegador();
    await n.ingresar('admin2');
    const p = (await fila<{ id: number }>("SELECT id FROM usuarios WHERE usuario = 'principal'"))!;
    await n.pedir('/panel/usuarios');
    assert.equal((await n.post(`/panel/usuarios/${p.id}/eliminar`, {})).status, 403);
    assert.equal((await n.post(`/panel/usuarios/${p.id}`, { rol: 'visualizador' })).status, 403);
    assert.equal((await n.post(`/panel/usuarios/${p.id}/clave`, { clave: 'Clave-Nueva-12345!' })).status, 403);
  });
});

describe('stock: guardado verificado', () => {
  it('confirma solo después de releer la base y la web pública lee el mismo valor', async () => {
    const n = new Navegador();
    await n.ingresar('editor');
    await n.pedir('/panel/productos');
    const v = (await fila<{ version: number }>("SELECT version FROM productos WHERE id = 'parlante-1'"))!.version;
    const r = await n.post('/panel/productos/parlante-1/stock', { estado: 'sin-stock', cantidad: '', version: String(v) }, json);
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
    const r2 = await (await n.post('/panel/productos/parlante-1/stock', { estado: 'con-stock', version: String(d.version) }, json)).json();
    assert.deepEqual([r2.verificado, r2.estado], [true, 'con-stock']);
  });
  it('la cantidad define el estado (0 = sin stock) y detecta ediciones simultáneas', async () => {
    const n = new Navegador();
    await n.ingresar('editor');
    await n.pedir('/panel/productos');
    const v = (await fila<{ version: number }>("SELECT version FROM productos WHERE id = 'estufa-2'"))!.version;
    const a = await (await n.post('/panel/productos/estufa-2/stock', { estado: 'sin-stock', cantidad: '7', version: String(v) }, json)).json();
    assert.deepEqual([a.estado, a.cantidad], ['con-stock', 7]);
    const b = await (await n.post('/panel/productos/estufa-2/stock', { estado: 'con-stock', cantidad: '0', version: String(a.version) }, json)).json();
    assert.deepEqual([b.estado, b.cantidad], ['sin-stock', 0]);
    assert.equal((await n.post('/panel/productos/estufa-2/stock', { estado: 'con-stock', version: String(v) }, json)).status, 409);
    assert.equal((await n.post('/panel/productos/estufa-2/stock', { estado: 'con-stock', cantidad: '-3' }, json)).status, 400);
  });
  it('sin JavaScript también guarda y redirige con la confirmación', async () => {
    const n = new Navegador();
    await n.ingresar('editor');
    await n.pedir('/panel/productos');
    const v = (await fila<{ version: number }>("SELECT version FROM productos WHERE id = 'parlante-1'"))!.version;
    const r = await n.post('/panel/productos/parlante-1/stock', { estado: 'sin-stock', version: String(v), volver: '/panel/productos?q=parlante' });
    assert.equal(r.status, 302);
    assert.match(r.headers.get('location')!, /^\/panel\/productos\?q=parlante&aviso=stock-guardado/);
    assert.equal((await fila<{ stock_estado: string }>("SELECT stock_estado FROM productos WHERE id = 'parlante-1'"))!.stock_estado, 'sin-stock');
  });
});

describe('productos e imágenes', () => {
  it('muestra la etiqueta "Código interno COPOL" y el botón de escaneo', async () => {
    const n = new Navegador();
    await n.ingresar('editor');
    assert.match(await (await n.pedir('/panel/productos')).text(), /Código interno COPOL 100001/);
    const form = await (await n.pedir('/panel/nuevo')).text();
    assert.match(form, /Código interno COPOL/);
    assert.match(form, /data-escanear/);
  });
  it('valida categoría existente, código único y ausencia de precios', async () => {
    const n = new Navegador();
    await n.ingresar('editor');
    await n.pedir('/panel/nuevo');
    assert.match(await (await n.post('/panel/nuevo', { nombre: 'Producto X', categoria: 'inventada', estado: 'con-stock' })).text(), /categorías existentes/);
    assert.match(await (await n.post('/panel/nuevo', { nombre: 'Producto X', codigo: '100001', categoria: 'audio', estado: 'con-stock' })).text(), /Ya existe un producto con ese código interno COPOL/);
    assert.match(await (await n.post('/panel/nuevo', { nombre: 'Producto X', categoria: 'audio', estado: 'con-stock', descripcion: 'Oferta a $ 1.990' })).text(), /no publica precios/);
  });
  it('rechaza archivos que no son imágenes aunque digan serlo', async () => {
    const n = new Navegador();
    await n.ingresar('editor');
    await n.pedir('/panel/nuevo');
    const falso = new File([new TextEncoder().encode('<?php echo 1; ?>')], 'foto.jpg', { type: 'image/jpeg' });
    const r = await n.post('/panel/nuevo', { nombre: 'Con imagen falsa', categoria: 'audio', estado: 'con-stock', imagen: falso });
    assert.equal(r.status, 400);
    assert.match(await r.text(), /no es una imagen válida/);
  });
  it('agrega un producto con código escaneado o manual e imagen en dos tamaños WebP', async () => {
    const n = new Navegador();
    await n.ingresar('editor');
    await n.pedir('/panel/nuevo');
    const r = await n.post('/panel/nuevo', { codigo: '7791234567890', nombre: 'Producto de prueba', categoria: 'hogar', estado: '', cantidad: '3', imagen: await png() });
    assert.equal(r.status, 302);
    const p = (await fila<{ id: string; imagen: string; stock_estado: string; origen: string }>("SELECT * FROM productos WHERE codigo = '7791234567890'"))!;
    assert.deepEqual([p.stock_estado, p.origen], ['con-stock', 'panel']);
    assert.match(p.imagen, /^\/panel\/media\/productos\/producto-de-prueba-7791234567890-[0-9a-f]{10}-800\.webp$/);
    for (const a of [400, 800]) {
      const archivo = path.join(config.dirImagenes, p.imagen.replace('/panel/media/', '').replace('-800.webp', `-${a}.webp`));
      assert.equal((await sharp(archivo).metadata()).format, 'webp');
    }
    assert.equal((await app.request(BASE + p.imagen)).status, 200);
  });
  it('no sirve archivos fuera de la carpeta de imágenes', async () => {
    for (const ruta of ['/panel/media/..%2F..%2Fprueba.db', '/panel/media/productos/..%2F..%2Fprueba.db']) assert.equal((await app.request(BASE + ruta)).status, 404, ruta);
  });
});

describe('novedades', () => {
  it('crea, publica, ordena, despublica y valida imágenes', async () => {
    const n = new Navegador();
    await n.ingresar('principal');
    await n.pedir('/panel/novedades/nueva');
    // La plantilla con imagen exige imagen; enlaces solo https o rutas del sitio.
    assert.match(await (await n.post('/panel/novedades/nueva', { titulo: 'Sin imagen', plantilla: 'imagen-completa' })).text(), /necesita una imagen/);
    assert.match(await (await n.post('/panel/novedades/nueva', { titulo: 'Enlace malo', plantilla: 'texto', enlace_texto: 'Ir', enlace_url: 'javascript:alert(1)' })).text(), /https:\/\//);
    assert.equal((await n.post('/panel/novedades/nueva', { titulo: 'Primera', texto: 'Texto uno', plantilla: 'imagen-izquierda', imagen: await png(1200, 600), enlace_texto: 'Ver Bazar', enlace_url: '/hipermercado/bazar/', publicado: '1' })).status, 302);
    assert.equal((await n.post('/panel/novedades/nueva', { titulo: 'Segunda', texto: 'Solo texto', plantilla: 'texto' })).status, 302);
    let pub = await novedadesPublicadas(db);
    assert.deepEqual(pub.map((x) => x.titulo), ['Primera']);
    assert.match(pub[0].imagen!, /-1600\.webp$/);
    const segunda = (await fila<{ id: number }>("SELECT id FROM novedades WHERE titulo = 'Segunda'"))!;
    await n.pedir('/panel/novedades');
    assert.equal((await n.post(`/panel/novedades/${segunda.id}/publicar`, { publicado: '1' })).status, 302);
    assert.equal((await n.post(`/panel/novedades/${segunda.id}/mover`, { direccion: 'arriba' })).status, 302);
    pub = await novedadesPublicadas(db);
    assert.deepEqual(pub.map((x) => x.titulo), ['Segunda', 'Primera']);
    assert.equal((await n.post(`/panel/novedades/${segunda.id}/publicar`, { publicado: '0' })).status, 302);
    assert.deepEqual((await novedadesPublicadas(db)).map((x) => x.titulo), ['Primera']);
    assert.match(await (await n.pedir('/panel/novedades')).text(), /Borrador/);
  });
});

describe('usuarios', () => {
  it('alta simple con usuario o correo, rol y contraseña temporal; edición y baja', async () => {
    const n = new Navegador();
    await n.ingresar('principal');
    const form = await (await n.pedir('/panel/usuarios')).text();
    assert.match(form, /Usuario o correo/);
    assert.doesNotMatch(form, /name="nombre"/);
    assert.equal((await n.post('/panel/usuarios', { usuario: 'ana@copol.com.uy', rol: 'visualizador', clave: 'corta' })).status, 400);
    assert.equal((await n.post('/panel/usuarios', { usuario: 'Ana@Copol.com.uy', rol: 'visualizador', clave: 'Temporal-Segura-1' })).status, 302);
    const ana = (await fila<{ id: number; rol: string; debe_cambiar_clave: number; hash: string }>("SELECT * FROM usuarios WHERE usuario = 'ana@copol.com.uy'"))!;
    assert.equal(ana.rol, 'visualizador');
    assert.equal(ana.debe_cambiar_clave, 1);
    assert.match(ana.hash, /^scrypt\$/);
    assert.ok(!ana.hash.includes('Temporal-Segura-1'));
    const ingreso = await new Navegador().ingresar('ana@copol.com.uy', 'Temporal-Segura-1');
    assert.equal(ingreso.headers.get('location'), '/panel/perfil/clave');
    await n.pedir(`/panel/usuarios/${ana.id}`);
    assert.equal((await n.post(`/panel/usuarios/${ana.id}`, { rol: 'editor', activo: '1' })).status, 302);
    assert.equal((await fila<{ rol: string }>('SELECT rol FROM usuarios WHERE id = ?', [ana.id]))!.rol, 'editor');
    assert.equal((await n.post(`/panel/usuarios/${ana.id}/eliminar`, {})).status, 302);
    assert.equal(await fila('SELECT 1 FROM usuarios WHERE id = ?', [ana.id]), undefined);
  });
  it('cada usuario cambia su contraseña desde su perfil', async () => {
    const n = new Navegador();
    await n.ingresar('lector');
    await n.pedir('/panel/perfil');
    assert.equal((await n.post('/panel/perfil/clave', { actual: 'mal', nueva: 'Propia-Clave-2026!', repetir: 'Propia-Clave-2026!' })).status, 400);
    assert.equal((await n.post('/panel/perfil/clave', { actual: CLAVE, nueva: 'Propia-Clave-2026!', repetir: 'Propia-Clave-2026!' })).headers.get('location'), '/panel/perfil?aviso=clave-cambiada');
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
    const html = await (await n.pedir('/panel/productos')).text();
    assert.doesNotMatch(html, /Perfumes|Joyería|Calzado|ampliarse|rubros/i);
    const r = await app.request(BASE + '/panel/ingresar');
    assert.match(r.headers.get('content-security-policy')!, /script-src 'self'/);
    assert.equal(r.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.match(r.headers.get('permissions-policy')!, /camera=\(self\)/);
  });
});
