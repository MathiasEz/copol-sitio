// Prueba de punta a punta en un navegador real (Microsoft Edge vía playwright-core) contra el servidor
// de desarrollo (`npm run dev`), usando la base configurada (local por defecto):
//   1. Stock: cambio real en el panel → la tarjeta pública muestra "Sin stock" en gris; y de vuelta a
//      "Con stock" en verde. Se verifica el valor en la base y en la página.
//   2. Escaneo: cámara simulada que muestra un código EAN-13 → el campo "Código interno COPOL" se completa.
//      Con el permiso de cámara denegado, el ingreso manual sigue funcionando.
//   3. Usuarios: alta con usuario/correo, rol y contraseña temporal; cambio de contraseña en el perfil.
//   4. Novedades: crear con imagen, publicar → aparece en Inicio; despublicar → desaparece.
// Crea un usuario administrador temporal con contraseña aleatoria y lo elimina al terminar; restaura
// el stock del producto usado y elimina la novedad y el usuario de prueba.
//   node scripts/qa-panel-sitio.mjs [urlBase]
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright-core';
import { conectar, una, ejecutar } from '../panel/src/db.ts';
import { crearUsuario } from '../panel/src/usuarios.ts';

const BASE = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:4321';
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'copol-qa-'));
const ok = [];
const fallos = [];
const verificar = (c, m) => (c ? ok : fallos).push(m);

// ── Código EAN-13 dibujado a mano (sin dependencias) y convertido en video y4m para la cámara simulada ──
function ean13(doce) {
  const d = doce.split('').map(Number);
  const control = (10 - (d.reduce((s, x, i) => s + x * (i % 2 ? 3 : 1), 0) % 10)) % 10;
  const codigo = doce + control;
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const G = L.map((p) => p.split('').map((b) => (b === '1' ? '0' : '1')).reverse().join(''));
  const R = L.map((p) => p.split('').map((b) => (b === '1' ? '0' : '1')).join(''));
  const PARIDAD = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (PARIDAD[+codigo[0]][i - 1] === 'L' ? L : G)[+codigo[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[+codigo[i]];
  return { codigo, bits: bits + '101' };
}
function videoY4m(bits, archivo) {
  const W = 640, H = 480, modulo = 4, alto = 260;
  const x0 = Math.floor((W - bits.length * modulo) / 2), y0 = Math.floor((H - alto) / 2);
  const Y = Buffer.alloc(W * H, 235);
  for (let y = y0; y < y0 + alto; y++) for (let i = 0; i < bits.length; i++) if (bits[i] === '1') Y.fill(16, y * W + x0 + i * modulo, y * W + x0 + (i + 1) * modulo);
  const UV = Buffer.alloc((W / 2) * (H / 2), 128);
  const cuadro = Buffer.concat([Buffer.from('FRAME\n'), Y, UV, UV]);
  fs.writeFileSync(archivo, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), ...Array(20).fill(cuadro)]));
}
const { codigo: EAN, bits } = ean13('779123456789');
const video = path.join(tmp, 'codigo.y4m');
videoY4m(bits, video);
const imagenNovedad = path.join(tmp, 'novedad.png');
await sharp({ create: { width: 1200, height: 600, channels: 3, background: '#008d36' } }).png().toFile(imagenNovedad);

// ── Usuario temporal ──
const db = await conectar();
const usuario = `qa-${crypto.randomBytes(3).toString('hex')}`;
const clave = `Qa-${crypto.randomBytes(12).toString('base64url')}-9`;
const idQa = await crearUsuario(db, { usuario, rol: 'administrador', clave, debeCambiar: false, creadoPor: 'qa' });
const limpiar = { productoId: null, estadoOriginal: null, novedad: null, usuarioNuevo: null, codigoNuevo: null };

const browser = await chromium.launch({ executablePath: EDGE, headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`] });
const ingresar = async (page, u = usuario, c = clave) => {
  await page.goto(`${BASE}/panel/ingresar`);
  await page.fill('input[name="usuario"]', u);
  await page.fill('input[name="clave"]', c);
  await Promise.all([page.waitForURL((url) => !url.pathname.endsWith('/ingresar')), page.click('button[type="submit"]')]);
};
try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, permissions: ['camera'] });
  const panel = await ctx.newPage();
  const sitio = await ctx.newPage();
  await ingresar(panel);
  verificar(await panel.isVisible('h1:has-text("Inventario")'), 'Panel · ingreso y pantalla de inventario');

  // ── 1. Stock de punta a punta ──
  await sitio.goto(`${BASE}/hipermercado/bazar/`);
  // Una tarjeta de un solo color: su etiqueta refleja directamente el stock de ese producto.
  const elegido = await sitio.$$eval('.producto[data-estado="con-stock"][data-variantes="1"]', (els) => {
    const el = els.find((e) => /Código interno COPOL \d+/.test(e.textContent));
    return { id: el.dataset.id, codigo: el.textContent.match(/Código interno COPOL (\d+)/)[1] };
  });
  limpiar.productoId = elegido.id;
  limpiar.estadoOriginal = 'con-stock';
  const tarjeta = () => sitio.$eval(`.producto[data-id="${elegido.id}"]`, (el) => {
    const et = el.querySelector('.stock-etiqueta');
    const img = el.querySelector('.producto__media img');
    return { estado: el.dataset.estado, texto: et.textContent.trim(), fondo: getComputedStyle(et).backgroundColor, icono: Boolean(et.querySelector('svg')), gris: img ? getComputedStyle(img).filter : '' };
  });
  verificar((await tarjeta()).estado === 'con-stock', `Sitio · ${elegido.id} figura "Con stock" antes del cambio`);

  await panel.goto(`${BASE}/panel/productos?q=${elegido.codigo}`);
  const fila = panel.locator(`#p-${elegido.id}`);
  await fila.locator('.segmento__op--gris').click();
  await fila.locator('button[type="submit"]').click();
  await fila.locator('.stock__nota--ok').waitFor({ timeout: 10_000 });
  verificar((await fila.locator('.stock__nota').textContent()).includes('Guardado: Sin stock'), 'Panel · confirmación "Guardado: Sin stock" (después de verificar en la base)');
  const enBase = await una(db, 'SELECT stock_estado FROM productos WHERE id = ?', [elegido.id]);
  verificar(enBase.stock_estado === 'sin-stock', `Base · el producto quedó "sin-stock" (${enBase.stock_estado})`);

  await sitio.goto(`${BASE}/hipermercado/bazar/`);
  let t = await tarjeta();
  verificar(t.estado === 'sin-stock' && t.texto === 'Sin stock' && t.icono && t.fondo === 'rgb(236, 238, 237)' && t.gris.includes('grayscale'), `Sitio · tras recargar, la tarjeta dice "Sin stock" en gris con ícono (${t.texto}, ${t.fondo}, ${t.gris})`);
  await sitio.goto(`${BASE}/hipermercado/bazar/?stock=sin-stock`);
  verificar(await sitio.$eval(`.producto[data-id="${elegido.id}"]`, (el) => !el.hidden && !el.closest('[hidden]')), 'Sitio · aparece en el filtro "Sin stock"');

  await panel.goto(`${BASE}/panel/productos?q=${elegido.codigo}`);
  await fila.locator('.segmento__op--ok').click();
  await fila.locator('button[type="submit"]').click();
  await fila.locator('.stock__nota--ok').waitFor({ timeout: 10_000 });
  await sitio.goto(`${BASE}/hipermercado/bazar/`);
  t = await tarjeta();
  verificar(t.estado === 'con-stock' && t.texto === 'Con stock' && t.fondo === 'rgb(227, 244, 233)' && !t.gris.includes('grayscale'), `Sitio · de vuelta a "Con stock" en verde (${t.texto}, ${t.fondo})`);
  limpiar.productoId = null;

  // ── 2. Escaneo con cámara simulada ──
  await panel.goto(`${BASE}/panel/nuevo`);
  verificar((await panel.inputValue('[data-campo-codigo]')) === '', 'Escaneo · el campo empieza vacío y no se pidió la cámara al cargar');
  await panel.click('[data-escanear]');
  await panel.waitForFunction(() => document.querySelector('[data-campo-codigo]').value !== '', null, { timeout: 20_000 }).catch(() => {});
  const leido = await panel.inputValue('[data-campo-codigo]');
  verificar(leido === EAN, `Escaneo · la cámara leyó el código y completó el campo (${leido || 'vacío'} / esperado ${EAN})`);
  verificar(!(await panel.$eval('#escaner', (d) => d.open)), 'Escaneo · el visor se cierra solo y libera la cámara');
  // Alta con el código escaneado.
  limpiar.codigoNuevo = EAN;
  await panel.fill('input[name="nombre"]', `Producto QA escaneado ${EAN}`);
  await panel.selectOption('select[name="categoria"]', 'audio');
  await Promise.all([panel.waitForURL(/aviso=producto-creado/), panel.click('.acciones-form button[type="submit"]')]);
  verificar(Boolean(await una(db, 'SELECT id FROM productos WHERE codigo = ?', [EAN])), 'Escaneo · el producto se guardó con el código escaneado');

  const ctxSin = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: [] });
  const sinCamara = await ctxSin.newPage();
  await ctxSin.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permiso denegado', 'NotAllowedError'));
  });
  await ingresar(sinCamara);
  await sinCamara.goto(`${BASE}/panel/nuevo`);
  await sinCamara.click('[data-escanear]');
  await sinCamara.waitForSelector('[data-escaner-estado]:has-text("No se dio permiso")', { timeout: 5_000 }).catch(() => {});
  const aviso = await sinCamara.textContent('[data-escaner-estado]');
  await sinCamara.fill('[data-campo-codigo]', '123456');
  verificar(/No se dio permiso/.test(aviso) && (await sinCamara.inputValue('[data-campo-codigo]')) === '123456', `Escaneo · sin permiso de cámara avisa y el ingreso manual funciona ("${aviso.trim()}")`);
  await ctxSin.close();

  // ── 3. Usuarios ──
  const correo = `qa.${crypto.randomBytes(2).toString('hex')}@ejemplo.uy`;
  const temporal = `Temp-${crypto.randomBytes(8).toString('base64url')}-1`;
  limpiar.usuarioNuevo = correo;
  await panel.goto(`${BASE}/panel/usuarios`);
  verificar((await panel.$$('form[action="/panel/usuarios"] input:not([type=hidden]), form[action="/panel/usuarios"] select')).length === 3, 'Usuarios · el alta tiene solo 3 campos (usuario o correo, rol, contraseña temporal)');
  await panel.fill('form[action="/panel/usuarios"] input[name="usuario"]', correo);
  await panel.selectOption('form[action="/panel/usuarios"] select[name="rol"]', 'editor');
  await panel.fill('form[action="/panel/usuarios"] input[name="clave"]', temporal);
  await Promise.all([panel.waitForURL(/aviso=usuario-creado/), panel.click('form[action="/panel/usuarios"] button[type="submit"]')]);
  verificar(await panel.isVisible(`td:has-text("${correo}")`), 'Usuarios · el nuevo usuario aparece en la lista');
  const ctxU = await browser.newContext();
  const pu = await ctxU.newPage();
  await ingresar(pu, correo, temporal);
  verificar(pu.url().endsWith('/panel/perfil/clave'), 'Usuarios · con contraseña temporal pide elegir una nueva');
  const propia = `Propia-${crypto.randomBytes(8).toString('base64url')}-2`;
  await pu.fill('input[name="actual"]', temporal);
  await pu.fill('input[name="nueva"]', propia);
  await pu.fill('input[name="repetir"]', propia);
  await Promise.all([pu.waitForURL(/aviso=clave-cambiada/), pu.click('form button[type="submit"]')]);
  verificar(await pu.isVisible('text=Contraseña actualizada'), 'Usuarios · la persona cambió su contraseña desde su perfil');
  await ctxU.close();
  const hash = await una(db, 'SELECT hash FROM usuarios WHERE usuario = ?', [correo]);
  verificar(hash.hash.startsWith('scrypt$') && !hash.hash.includes(propia), 'Usuarios · en la base solo queda el hash');

  // ── 4. Novedades ──
  const titulo = `Novedad QA ${crypto.randomBytes(2).toString('hex')}`;
  await panel.goto(`${BASE}/panel/novedades/nueva`);
  await panel.fill('input[name="titulo"]', titulo);
  await panel.fill('textarea[name="texto"]', 'Texto de prueba de la novedad.');
  await panel.check('input[name="plantilla"][value="imagen-izquierda"]', { force: true });
  await panel.setInputFiles('input[name="imagen"]', imagenNovedad);
  await panel.fill('input[name="enlace_texto"]', 'Ver Bazar');
  await panel.fill('input[name="enlace_url"]', '/hipermercado/bazar/');
  await Promise.all([panel.waitForURL(/aviso=novedad-guardada/), panel.click('.acciones-form button[type="submit"]')]);
  const nov = await una(db, 'SELECT id, publicado, imagen FROM novedades WHERE titulo = ?', [titulo]);
  limpiar.novedad = nov.id;
  verificar(nov && !nov.publicado && /-1600\.webp$/.test(nov.imagen), 'Novedades · creada como borrador con imagen validada y guardada');
  const enInicio = async () => {
    await sitio.goto(`${BASE}/`);
    await sitio.waitForSelector('.novedades-lista, footer', { timeout: 15_000 });
    await sitio.waitForTimeout(800);
    return sitio.$$eval('.nov h3', (hs) => hs.map((h) => h.textContent.trim()));
  };
  verificar(!(await enInicio()).includes(titulo), 'Novedades · el borrador no aparece en Inicio');
  await panel.goto(`${BASE}/panel/novedades`);
  await panel.locator('li.novedad', { hasText: titulo }).locator('button:has-text("Publicar")').click();
  await panel.waitForURL(/aviso=novedad-publicada/);
  const titulos = await enInicio();
  verificar(titulos.includes(titulo), `Novedades · publicada, aparece en Inicio (${titulos.length} publicadas)`);
  const src = await sitio.$eval(`.nov:has(h3:text-is("${titulo}")) img`, (i) => i.currentSrc || i.src).catch(() => null);
  const resImg = src ? await sitio.request.get(new URL(src, BASE).href) : null;
  const imgOk = resImg?.ok() && resImg.headers()['content-type'] === 'image/webp';
  verificar(imgOk, 'Novedades · su imagen se sirve desde el almacenamiento configurado');
  await panel.goto(`${BASE}/panel/novedades`);
  await panel.locator('li.novedad', { hasText: titulo }).locator('button:has-text("Despublicar")').click();
  await panel.waitForURL(/aviso=novedad-despublicada/);
  verificar(!(await enInicio()).includes(titulo), 'Novedades · despublicada, desaparece de Inicio');
  await ctx.close();
} finally {
  await browser.close();
  if (limpiar.productoId) await ejecutar(db, 'UPDATE productos SET stock_estado = ? WHERE id = ?', [limpiar.estadoOriginal, limpiar.productoId]);
  if (limpiar.codigoNuevo) await ejecutar(db, 'DELETE FROM productos WHERE codigo = ?', [limpiar.codigoNuevo]);
  if (limpiar.novedad) await ejecutar(db, 'DELETE FROM novedades WHERE id = ?', [limpiar.novedad]);
  if (limpiar.usuarioNuevo) await ejecutar(db, 'DELETE FROM usuarios WHERE usuario = ?', [limpiar.usuarioNuevo]);
  await ejecutar(db, 'DELETE FROM sesiones WHERE usuario_id = ?', [idQa]);
  await ejecutar(db, 'DELETE FROM usuarios WHERE id = ?', [idQa]);
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(ok.map((m) => `✓ ${m}`).join('\n'));
if (fallos.length) {
  console.log(`\n✗ ${fallos.length} problema(s):\n  ` + fallos.join('\n  '));
  process.exit(1);
}
console.log('\nPanel y web pública: todo en orden.');
