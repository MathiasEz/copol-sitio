// Pruebas de interacción y de imágenes en un navegador real (Microsoft Edge vía playwright-core).
// Requiere el sitio corriendo (npm run dev o npm run preview).
//   node scripts/qa-interacciones.mjs [urlBase] [--capturas carpeta]
// Comprueba: Bazar (estado inicial, "Todos los productos", cada categoría, búsqueda y estado vacío),
// banner de Inicio (sin botón de pausa, teclado, gesto, texto que no tapa la imagen, movimiento reducido),
// cinta de ofertas de Promociones y recorte de imágenes.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE = process.argv[2]?.startsWith('http') ? process.argv[2] : 'http://localhost:4321';
const iCap = process.argv.indexOf('--capturas');
const CAPTURAS = iCap > 0 ? path.resolve(process.argv[iCap + 1]) : null;
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));

const fallos = [];
const ok = [];
const verificar = (cond, msg) => (cond ? ok : fallos).push(msg);

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const VIEWPORTS = { movil: { width: 375, height: 812 }, escritorio: { width: 1366, height: 900 } };

// ── Bazar ──────────────────────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: VIEWPORTS.escritorio });
  await page.goto(`${BASE}/hipermercado/bazar/`, { waitUntil: 'networkidle' });
  const estado = () =>
    page.evaluate(() => {
      const visibles = [...document.querySelectorAll('.producto')].filter((p) => !p.hidden && !p.closest('[hidden]'));
      return {
        total: document.querySelectorAll('.producto').length,
        variantes: [...document.querySelectorAll('.producto')].reduce((a, p) => a + Number(p.dataset.variantes ?? 1), 0),
        visibles: visibles.length,
        categorias: new Set(visibles.map((p) => p.getAttribute('data-categoria'))).size,
        vacioVisible: getComputedStyle(document.querySelector('[data-vacio]')).display !== 'none',
        texto: document.querySelector('[data-resultado]').textContent.trim(),
      };
    });

  const catalogo = JSON.parse(fs.readFileSync(path.resolve('src/data/catalogo/bazar.json'), 'utf8'));
  const esperados = catalogo.productos.filter((p) => !p.revisarPrecio && !p.retirado).length;
  let e = await estado();
  verificar(!e.vacioVisible, `Bazar · estado inicial sin el mensaje "No encontramos productos" (${e.texto})`);
  verificar(e.visibles === e.total && e.variantes === esperados && e.total < esperados, `Bazar · estado inicial muestra todo el catálogo: ${e.total} tarjetas con ${e.variantes} productos (esperados ${esperados})`);
  verificar(e.categorias >= 10, `Bazar · estado inicial muestra todas las categorías (${e.categorias})`);

  // Estado de stock visible y no solo por color
  const etiquetas = await page.$$eval('.producto', (els) => els.map((el) => {
    const et = el.querySelector('.stock-etiqueta');
    return { estado: el.dataset.estado, texto: et?.textContent.trim(), icono: Boolean(et?.querySelector('svg')) || (et ? getComputedStyle(et, '::before').maskImage.startsWith('url(') : false), fondo: et ? getComputedStyle(et).backgroundColor : '' };
  }));
  const conTexto = etiquetas.filter((x) => x.texto && x.icono).length;
  verificar(conTexto === etiquetas.length, `Bazar · cada tarjeta muestra estado con ícono y texto (${conTexto}/${etiquetas.length})`);
  const verde = etiquetas.find((x) => x.estado === 'con-stock')?.fondo;
  const gris = etiquetas.find((x) => x.estado === 'sin-stock')?.fondo;
  verificar(verde && gris && verde !== gris, `Bazar · color distinto para con stock (${verde}) y sin stock (${gris})`);

  // Filtros de stock (solos y combinados con categoría y búsqueda)
  const n = async (name, value) => Number(await page.$eval(`input[name="${name}"][value="${value}"]`, (r) => r.closest('.toggle').querySelector('.toggle__contador').textContent));
  for (const st of ['con-stock', 'sin-stock']) {
    await page.click(`input[name="stock"][value="${st}"]`, { force: true });
    e = await estado();
    const malos = await page.$$eval('.producto', (els, st) => els.filter((p) => !p.hidden && !p.closest('[hidden]') && p.dataset.estado !== st).length, st);
    verificar(e.visibles > 0 && malos === 0 && e.visibles === (await n('stock', st)) && !e.vacioVisible, `Bazar · filtro "${st}" muestra solo esos productos (${e.visibles})`);
  }
  await page.click('input[name="categoria"][value="celulares"]', { force: true });
  e = await estado();
  const sinCel = etiquetas.length && (await page.$$eval('.producto', (els) => els.filter((p) => !p.hidden && !p.closest('[hidden]')).every((p) => p.dataset.categoria === 'celulares' && p.dataset.estado === 'sin-stock')));
  verificar(e.visibles > 0 && sinCel && e.visibles === (await n('categoria', 'celulares')), `Bazar · categoría + stock combinados: celulares sin stock (${e.visibles})`);
  await page.click('input[name="stock"][value=""]', { force: true });
  await page.click('input[name="categoria"][value=""]', { force: true });
  e = await estado();
  verificar(e.visibles === e.total, `Bazar · "Todos" + "Todos los productos" vuelve al total (${e.visibles})`);

  const radios = await page.$$eval('input[name="categoria"]', (els) => els.map((r) => ({ v: r.value, n: Number(r.closest('.toggle')?.querySelector('.toggle__contador')?.textContent) })));
  for (const r of radios.filter((x) => x.v)) {
    await page.click(`input[name="categoria"][value="${r.v}"]`, { force: true });
    e = await estado();
    verificar(e.visibles === r.n && e.categorias === 1 && !e.vacioVisible, `Bazar · categoría "${r.v}" muestra ${r.n} productos (vio ${e.visibles})`);
  }
  await page.click('input[name="categoria"][value=""]', { force: true });
  e = await estado();
  verificar(e.visibles === e.total && e.categorias >= 10, `Bazar · "Todos los productos" vuelve al catálogo completo (${e.visibles}/${e.total}, ${e.categorias} categorías)`);

  await page.fill('input[name="q"]', 'freidora');
  await page.waitForTimeout(300);
  e = await estado();
  verificar(e.visibles > 0 && e.visibles < e.total && !e.vacioVisible, `Bazar · búsqueda "freidora" filtra (${e.visibles})`);
  await page.fill('input[name="q"]', 'xyzqwerty');
  await page.waitForTimeout(300);
  e = await estado();
  verificar(e.visibles === 0 && e.vacioVisible, 'Bazar · búsqueda sin resultados muestra el estado vacío');
  await page.fill('input[name="q"]', '');
  await page.waitForTimeout(300);
  e = await estado();
  verificar(e.visibles === e.total && !e.vacioVisible, 'Bazar · al vaciar la búsqueda vuelve el catálogo completo sin estado vacío');
  await page.fill('input[name="q"]', 'iphone');
  await page.click('input[name="stock"][value="con-stock"]', { force: true });
  await page.waitForTimeout(300);
  const iphones = await page.$$eval('.producto', (els) => els.filter((p) => !p.hidden && !p.closest('[hidden]')).map((p) => [p.dataset.estado, p.dataset.texto.includes('iphone')]));
  verificar(iphones.every(([st, t]) => st === 'con-stock' && t), `Bazar · búsqueda + stock combinados ("iphone" con stock: ${iphones.length})`);

  // Ficha de un modelo con colores: cada color con su código, su stock y su consulta; descripción real.
  await page.fill('input[name="q"]', '');
  await page.click('input[name="stock"][value=""]', { force: true });
  await page.waitForTimeout(200);
  const conColores = page.locator('.producto:not([data-variantes="1"])').first();
  const ids = (await conColores.getAttribute('data-ids')).split(' ');
  await conColores.locator('[data-abrir]').click();
  await page.waitForSelector('[data-ficha][open]');
  await page.waitForFunction(() => !document.querySelector('[data-ficha-descripcion]').textContent.includes('Cargando'));
  const ficha = await page.evaluate(() => {
    const f = document.querySelector('[data-ficha]');
    return {
      filas: [...f.querySelectorAll('.variante')].map((v) => ({ id: v.dataset.id, codigo: v.querySelector('.variante__codigo')?.textContent ?? '', stock: v.querySelector('.variante__stock').textContent.trim(), wa: v.querySelector('a').href })),
      lineas: f.querySelectorAll('[data-ficha-descripcion] li').length,
    };
  });
  verificar(ficha.filas.length === ids.length && ficha.filas.every((f, i) => f.id === ids[i] && /Código interno COPOL \d+/.test(f.codigo) && f.stock && f.wa.includes('wa.me') && decodeURIComponent(f.wa).includes(f.codigo.replace('Código interno COPOL ', ''))), `Bazar · la ficha lista cada color con código, stock y consulta por WhatsApp (${ficha.filas.length})`);
  verificar(ficha.lineas > 0, `Bazar · la ficha carga la descripción del catálogo (${ficha.lineas} líneas)`);
  await page.keyboard.press('Escape');
  verificar(!(await page.evaluate(() => document.querySelector('[data-ficha]').open)), 'Bazar · la ficha se cierra con Escape');

  // Carrito COPOL: agregar desde la ficha, ver el contador y armar el mensaje de WhatsApp con nombre y código.
  page.on('dialog', (d) => d.accept());
  verificar(await page.locator('[data-carrito-abrir]').isHidden(), 'Carrito · el botón no aparece con el carrito vacío');
  await conColores.locator('[data-abrir]').click();
  await page.waitForSelector('[data-ficha][open]');
  await page.locator('[data-ficha] .variante [data-agregar]').nth(0).click();
  await page.locator('[data-ficha] .variante [data-agregar]').nth(1).click();
  await page.locator('[data-ficha] .variante [data-agregar]').nth(1).click();
  await page.keyboard.press('Escape');
  verificar((await page.locator('[data-carrito-cuenta]').textContent()) === '3', 'Carrito · el contador suma unidades (3)');
  await page.locator('[data-carrito-abrir]').click();
  await page.waitForSelector('[data-carrito][open]');
  const carrito = await page.evaluate(() => {
    const enlace = document.querySelector('[data-carrito-enviar]');
    return { items: document.querySelectorAll('[data-carrito] .carrito__item').length, url: enlace.href.split('?')[0], texto: new URL(enlace.href).searchParams.get('text') };
  });
  verificar(carrito.items === 2 && carrito.url === 'https://wa.me/59898872727', `Carrito · 2 productos y envío al WhatsApp 098 872 727 (${carrito.items}, ${carrito.url})`);
  verificar(ids.length >= 2 && /Código interno COPOL: \d+ — Cantidad: 2/.test(carrito.texto) && /Total: 2 productos \(3 unidades\)/.test(carrito.texto), 'Carrito · el mensaje lista cada producto con su código y cantidad');
  await page.reload({ waitUntil: 'networkidle' });
  verificar((await page.locator('[data-carrito-cuenta]').textContent()) === '3', 'Carrito · se conserva al recargar la página');
  await page.locator('[data-carrito-abrir]').click();
  await page.locator('[data-carrito-vaciar]').click();
  verificar(await page.locator('[data-carrito-abrir]').isHidden(), 'Carrito · "Vaciar carrito" lo deja vacío');
  await page.close();

  // Enlace directo con filtros en la URL (los usan los accesos de Inicio)
  const p2 = await browser.newPage({ viewport: VIEWPORTS.movil });
  await p2.goto(`${BASE}/hipermercado/bazar/?categoria=audio&stock=sin-stock`, { waitUntil: 'networkidle' });
  const audio = await p2.$$eval('.producto', (els) => els.filter((p) => !p.hidden && !p.closest('[hidden]')).map((p) => p.dataset.categoria + '|' + p.dataset.estado));
  verificar(audio.length > 0 && audio.every((x) => x === 'audio|sin-stock'), `Bazar · ?categoria=audio&stock=sin-stock aplica los filtros (${audio.length})`);
  const vacioP2 = await p2.$eval('[data-vacio]', (el) => getComputedStyle(el).display !== 'none');
  verificar(!vacioP2, 'Bazar · filtros por URL sin búsqueda no muestran "No encontramos productos"');
  await p2.close();
}

// ── Promociones: cinta continua de ofertas del supermercado ──
{
  const page = await browser.newPage({ viewport: VIEWPORTS.escritorio });
  await page.goto(`${BASE}/hipermercado/promociones/`, { waitUntil: 'networkidle' });
  // Posición de la cinta (desplazamiento horizontal aplicado con transform).
  const pos = () => page.$eval('[data-pista]', (p) => Math.round(-new DOMMatrix(getComputedStyle(p).transform).m41));
  const piezas = await page.$$eval('[data-ofertas] .oferta:not([aria-hidden]) img', (is) => is.map((i) => i.alt));
  verificar(piezas.length === 29 && piezas.every((a) => /^Oferta de octubre: .+, a .+ pesos\.$/.test(a)), `Promociones · 29 ofertas con texto alternativo de producto y precio (${piezas.length})`);
  const copias = await page.$$eval('[data-ofertas] .oferta[aria-hidden="true"] img', (is) => is.map((i) => i.alt));
  verificar(copias.length === 58 && copias.every((a) => a === ''), `Promociones · copias del bucle ocultas para lectores de pantalla (${copias.length})`);
  const orden = await page.$$eval('main h2', (hs) => hs.map((h) => h.textContent.trim()));
  verificar(orden.includes('Ofertas de octubre') && !orden.includes('Campañas vigentes') && (await page.$$('.campana')).length === 0, `Promociones · solo ofertas del supermercado, sin campañas de motos ni garantía de alquiler (${orden.join(' → ')})`);
  verificar((await page.$$('[data-ofertas] button')).length === 0, 'Promociones · sin botones de avanzar/pausar/volver');
  await page.locator('[data-ofertas]').scrollIntoViewIfNeeded();
  await page.mouse.move(5, 5);
  const p0 = await pos();
  await page.waitForTimeout(2500);
  const p1 = await pos();
  verificar(p1 > p0, `Promociones · la cinta avanza sola, de forma continua (${p0} → ${p1})`);
  const caja = await page.locator('[data-ventana]').boundingBox();
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await page.waitForTimeout(1500); // frena con suavidad
  const p2 = await pos();
  await page.waitForTimeout(2000);
  verificar(Math.abs((await pos()) - p2) <= 1, 'Promociones · se detiene con el puntero encima');
  await page.mouse.move(5, 5);
  await page.waitForTimeout(2500);
  verificar((await pos()) !== p2, 'Promociones · continúa al retirar el puntero');
  // Arrastrar con el mouse mueve la cinta.
  await page.mouse.move(caja.x + caja.width * 0.7, caja.y + caja.height / 2);
  await page.waitForTimeout(1500);
  const p3 = await pos();
  await page.mouse.down();
  await page.mouse.move(caja.x + caja.width * 0.3, caja.y + caja.height / 2, { steps: 8 });
  await page.mouse.up();
  const p4 = await pos();
  verificar(Math.abs(p4 - p3) > 150 || p4 < p3, `Promociones · se puede arrastrar (${p3} → ${p4})`);
  await page.mouse.move(5, 5);
  await page.keyboard.press('Tab'); // primer elemento enfocable de la página: deja el modo teclado activo
  await page.focus('[data-ventana]');
  await page.waitForTimeout(1500);
  const p5 = await pos();
  await page.waitForTimeout(2000);
  verificar(Math.abs((await pos()) - p5) <= 1, 'Promociones · se detiene con el foco del teclado');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(900);
  verificar((await pos()) !== p5, 'Promociones · flecha derecha avanza una pieza');
  await page.close();
  const ctxR = await browser.newContext({ reducedMotion: 'reduce', viewport: VIEWPORTS.escritorio });
  const pr = await ctxR.newPage();
  await pr.goto(`${BASE}/hipermercado/promociones/`, { waitUntil: 'networkidle' });
  const posR = () => pr.$eval('[data-pista]', (p) => Math.round(-new DOMMatrix(getComputedStyle(p).transform).m41));
  const r0 = await posR();
  await pr.waitForTimeout(3000);
  verificar((await posR()) === r0, 'Promociones · con movimiento reducido no avanza sola');
  await ctxR.close();
}

// ── Locales: foto de cada ciudad con texto alternativo ──
{
  const page = await browser.newPage({ viewport: VIEWPORTS.movil });
  await page.goto(`${BASE}/sobre-nosotros/locales/`, { waitUntil: 'networkidle' });
  const fotos = await page.$$eval('[data-locales] > li', (lis) => lis.map((li) => ({ nombre: li.querySelector('h4')?.textContent.trim(), alt: li.querySelector('.local__foto img')?.alt ?? '' })));
  verificar(fotos.length === 19 && fotos.every((f) => f.alt.length > 20), `Locales · 19 tarjetas con foto y texto alternativo (${fotos.filter((f) => f.alt).length})`);
  await page.close();
}

// ── Banners de Inicio: proporción original, sin recorte, en escritorio y móvil ──
for (const [nombre, vp] of Object.entries(VIEWPORTS)) {
  const page = await browser.newPage({ viewport: vp });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    document.querySelectorAll('[data-banner] img').forEach((i) => (i.loading = 'eager'));
    await Promise.all([...document.querySelectorAll('[data-banner] img')].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  });
  const banners = await page.$$eval('[data-banner]', (els) => els.map((a) => {
    const img = a.querySelector('img');
    const r = img.getBoundingClientRect();
    return { href: a.getAttribute('href'), natural: img.naturalWidth / img.naturalHeight, caja: r.width / r.height, ancho: Math.round(r.width), fit: getComputedStyle(img).objectFit, archivo: (img.currentSrc || '').split('/').pop().split('?')[0] };
  }));
  for (const b of banners) {
    const ok2 = Math.abs(b.natural - b.caja) / b.natural < 0.01 && b.fit !== 'cover';
    verificar(ok2, `Banner (${nombre}) ${b.href} · proporción ${b.caja.toFixed(3)} vs original ${b.natural.toFixed(3)}, ${b.ancho}px de ancho (${b.archivo})`);
  }
  verificar(banners.length === 5, `Banners (${nombre}) · 5 banners en Inicio (${banners.length})`);
  // El primero (entre el carrusel y "¿Qué necesitás hoy?") lleva al WhatsApp general 098 872 727.
  verificar(banners[0]?.href?.startsWith('https://wa.me/59898872727'), `Banners (${nombre}) · el banner de beneficios abre WhatsApp 098 872 727 (${banners[0]?.href?.slice(0, 40)})`);
  await page.close();
}

// ── Banner de Inicio (server island, editable desde el panel) ─────────────
// Con el contenido inicial: 4 diapositivas, 6 s cada una. Si se editó en el panel local, ajustar.
for (const [nombre, vp] of Object.entries(VIEWPORTS)) {
  const page = await browser.newPage({ viewport: vp, hasTouch: nombre === 'movil' });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('copol-banner.bi--js');
  const activa = () => page.evaluate(() => [...document.querySelectorAll('[data-bi-diapo]')].findIndex((p) => p.classList.contains('activa')));
  const n = await page.$$eval('[data-bi-diapo]', (ds) => ds.length);
  const botonesControl = await page.$$eval('copol-banner button', (bs) =>
    bs.filter((b) => !b.hasAttribute('data-bi-indicador')).map((b) => b.getAttribute('aria-label') || b.textContent.trim()),
  );
  verificar(botonesControl.join() === 'Diapositiva anterior,Diapositiva siguiente', `Banner (${nombre}) · solo dos flechas discretas, sin botón de pausa (${botonesControl.join(', ') || 'ninguna'})`);
  const flechas = await page.$$eval('[data-bi-anterior], [data-bi-siguiente]', (bs) => bs.map((b) => { const r = b.getBoundingClientRect(); const v = b.querySelector('svg').getBoundingClientRect(); return { area: Math.min(r.width, r.height), icono: Math.max(v.width, v.height) }; }));
  verificar(flechas.every((f) => f.area >= 44 && f.icono <= 20), `Banner (${nombre}) · flechas con ícono chico (≤ 20 px) y área táctil de 44 px`);
  const indicadores = await page.$$eval('[data-bi-indicador]', (bs) => bs.map((b) => b.getBoundingClientRect().height));
  verificar(n >= 2 && indicadores.length === n && indicadores.every((h) => h >= 24), `Banner (${nombre}) · ${n} indicadores accesibles (≥ 24 px de área)`);

  // El texto nunca tapa la imagen: al costado (computadora) o debajo (celular), salvo el recuadro chico.
  const solapes = await page.$$eval('[data-bi-diapo]', (ds) => ds.map((d) => {
    d.classList.add('activa');
    const m = d.querySelector('.bi__media').getBoundingClientRect();
    const t = d.querySelector('.bi__texto').getBoundingClientRect();
    const ancho = Math.max(0, Math.min(m.right, t.right) - Math.max(m.left, t.left));
    const alto = Math.max(0, Math.min(m.bottom, t.bottom) - Math.max(m.top, t.top));
    const tapa = (ancho * alto) / (m.width * m.height);
    const res = { diseno: [...d.classList].find((k) => k.startsWith('bi__diapo--') && k !== 'bi__diapo--completa' && k !== 'bi__diapo--con-movil'), tapa: Math.round(tapa * 100) };
    d.classList.remove('activa');
    return res;
  }));
  await page.evaluate(() => document.querySelectorAll('[data-bi-diapo]').forEach((d, i) => d.classList.toggle('activa', i === 0)));
  for (const s of solapes) {
    const max = s.diseno === 'bi__diapo--tarjeta' ? 30 : s.diseno === 'bi__diapo--solo-imagen' ? 100 : 0;
    verificar(s.tapa <= max, `Banner (${nombre}) · ${s.diseno}: el texto tapa ${s.tapa}% de la imagen (máx. ${max}%)`);
  }
  const completas = await page.$$eval('.bi__diapo--completa .bi__img', (is) => is.map((i) => getComputedStyle(i).objectFit));
  verificar(completas.every((f) => f === 'contain'), `Banner (${nombre}) · las piezas con texto se ven completas, sin recorte (${completas.join(', ')})`);

  await page.focus('copol-banner');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  verificar((await activa()) === 1, `Banner (${nombre}) · flecha derecha avanza`);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(100);
  verificar((await activa()) === 0, `Banner (${nombre}) · flecha izquierda retrocede`);

  const caja = await page.locator('[data-bi-diapo].activa .bi__media').boundingBox();
  const y = caja.y + caja.height / 2;
  await page.mouse.move(caja.x + caja.width * 0.8, y);
  await page.mouse.down();
  await page.mouse.move(caja.x + caja.width * 0.2, y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  verificar((await activa()) === 1, `Banner (${nombre}) · deslizar hacia la izquierda avanza`);
  await page.click(`[data-bi-indicador="${n - 1}"]`);
  verificar((await activa()) === n - 1, `Banner (${nombre}) · el último indicador lleva a la última diapositiva`);
  await page.click('[data-bi-siguiente]');
  verificar((await activa()) === 0, `Banner (${nombre}) · "siguiente" desde la última vuelve a la primera`);
  await page.click('[data-bi-anterior]');
  verificar((await activa()) === n - 1, `Banner (${nombre}) · "anterior" retrocede`);
  // Avance automático (6 s por diapositiva) con el puntero y el foco fuera del banner.
  await page.mouse.move(2, vp.height - 2);
  await page.evaluate(() => document.activeElement?.blur());
  const t0 = await activa();
  await page.waitForTimeout(4000);
  const t1 = await activa();
  await page.waitForTimeout(2600);
  const t2 = await activa();
  verificar(t1 === t0 && t2 === (t0 + 1) % n, `Banner (${nombre}) · avanza solo cada 6 s (${t0} → ${t1} → ${t2})`);
  // Con el puntero encima se detiene.
  await page.mouse.move(caja.x + caja.width / 2, y);
  const t3 = await activa();
  await page.waitForTimeout(6800);
  verificar((await activa()) === t3, `Banner (${nombre}) · se detiene con el puntero encima`);
  await page.close();
}
{
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: VIEWPORTS.escritorio });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('copol-banner.bi--js');
  const auto = await page.evaluate(() => document.querySelector('copol-banner').classList.contains('bi--auto'));
  verificar(!auto, 'Banner · con movimiento reducido no avanza solo');
  await ctx.close();
}

// ── Accesibilidad (axe-core desde cdnjs; se omite si no hay conexión) ───
let axe = null;
try {
  axe = await (await fetch('https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js')).text();
} catch {
  ok.push('Accesibilidad · omitida (sin conexión para descargar axe-core)');
}

// ── Imágenes: recorte y deformación ────────────────────────────────────
const PAGINAS = ['/', '/sobre-nosotros/', '/sobre-nosotros/locales/', '/sobre-nosotros/nuestra-historia/', '/beneficios/', '/beneficios/servicios-sociales/', '/beneficios/servicios-sociales/pinecoop/', '/beneficios/servicios-sociales/psicologo/', '/beneficios/convenios/', '/hipermercado/', '/hipermercado/tienda/', '/hipermercado/bazar/', '/hipermercado/promociones/', '/hacete-socio/', '/contacto/', '/acceso-web/'];
for (const [nombre, vp] of Object.entries(VIEWPORTS)) {
  const page = await browser.newPage({ viewport: vp });
  for (const ruta of PAGINAS) {
    await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      document.querySelectorAll('img').forEach((i) => (i.loading = 'eager'));
      // Las categorías del Bazar usan content-visibility: auto; fuera de pantalla no se pintan y axe
      // las da por "tapadas" (falso positivo de target-size). Se pintan todas para medirlas de verdad.
      document.querySelectorAll('.seccion-cat').forEach((s) => (s.style.contentVisibility = 'visible'));
      // Recorre la página para disparar la carga diferida (las <picture> de los banners no reaccionan
      // al cambio de `loading` una vez evaluadas).
      for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight) {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      scrollTo(0, 0);
      document.querySelectorAll('.aparecer, .mascara, [data-revelar]').forEach((e) => e.classList.add('visible'));
      await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    });
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    verificar(desborde <= 0, `Sin desplazamiento horizontal (${nombre}) ${ruta}${desborde > 0 ? ` (+${desborde}px)` : ''}`);
    const problemas = await page.evaluate(() =>
      [...document.querySelectorAll('main img')]
        .filter((img) => img.getBoundingClientRect().width > 40 && !img.closest('[aria-hidden="true"]') && img.getAttribute('aria-hidden') !== 'true')
        .map((img) => {
          const r = img.getBoundingClientRect();
          const s = getComputedStyle(img);
          const ib = img.naturalWidth / img.naturalHeight;
          const bb = r.width / r.height;
          const corte = s.objectFit === 'cover' ? (bb > ib ? 1 - ib / bb : 1 - bb / ib) : 0;
          const deforma = s.objectFit === 'fill' && Math.abs(ib - bb) / ib > 0.03;
          return { img: (img.currentSrc || img.src).split('/').pop().split(/[._?]/)[0], corte: Math.round(corte * 100), deforma };
        })
        .filter((x) => x.deforma || x.corte > 20),
    );
    for (const p of problemas) fallos.push(`Imagen (${nombre}) ${ruta} [${p.img}] ${p.deforma ? 'deformada' : `recorte ${p.corte}%`}`);
    if (axe) {
      await page.addScriptTag({ content: axe });
      // El banner de Inicio cambia solo: se pausa (como con el puntero encima) para medir un estado estable.
      await page.evaluate(() => document.querySelectorAll('copol-banner').forEach((c) => c.dispatchEvent(new Event('mouseenter'))));
      await page.waitForTimeout(900); // estado final de las transiciones (contraste real)
      const violaciones = await page.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
        return r.violations.map((v) => `${v.id} ×${v.nodes.length} (${v.nodes[0].target.join(' ')})`);
      });
      verificar(violaciones.length === 0, `Accesibilidad (${nombre}) ${ruta}${violaciones.length ? ': ' + violaciones.join('; ') : ''}`);
    }
    if (CAPTURAS) {
      await page.waitForTimeout(1600); // deja terminar las transiciones de aparición
      fs.mkdirSync(CAPTURAS, { recursive: true });
      const archivo = `${nombre}-${ruta.replace(/\//g, '_').replace(/^_|_$/g, '') || 'inicio'}.png`;
      await page.screenshot({ path: path.join(CAPTURAS, archivo), fullPage: true });
    }
  }
  ok.push(`Imágenes (${nombre}) · ${PAGINAS.length} páginas revisadas`);
  await page.close();
}

await browser.close();
console.log(ok.map((m) => `✓ ${m}`).join('\n'));
if (fallos.length) {
  console.log(`\n✗ ${fallos.length} problema(s):\n  ` + fallos.join('\n  '));
  process.exit(1);
}
console.log('\nTodo en orden.');
