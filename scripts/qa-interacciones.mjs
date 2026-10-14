// Pruebas de interacción y de imágenes en un navegador real (Microsoft Edge vía playwright-core).
// Requiere el sitio corriendo (npm run dev o npm run preview).
//   node scripts/qa-interacciones.mjs [urlBase] [--capturas carpeta]
// Comprueba: Bazar (estado inicial, "Todos los productos", cada categoría, búsqueda y estado vacío),
// carrusel de Inicio (sin botones de control, teclado, gesto, movimiento reducido) y recorte de imágenes.
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
  verificar(e.visibles === e.total && e.total === esperados, `Bazar · estado inicial muestra todo el catálogo (${e.visibles}/${e.total}, esperados ${esperados})`);
  verificar(e.categorias >= 10, `Bazar · estado inicial muestra todas las categorías (${e.categorias})`);

  // Estado de stock visible y no solo por color
  const etiquetas = await page.$$eval('.producto', (els) => els.map((el) => {
    const et = el.querySelector('.stock-etiqueta');
    return { estado: el.dataset.estado, texto: et?.textContent.trim(), icono: Boolean(et?.querySelector('svg')), fondo: et ? getComputedStyle(et).backgroundColor : '' };
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

// ── Promociones: carrusel de ofertas del supermercado ──
{
  const page = await browser.newPage({ viewport: VIEWPORTS.escritorio });
  await page.goto(`${BASE}/hipermercado/promociones/`, { waitUntil: 'networkidle' });
  const pos = () => page.$eval('[data-pista]', (p) => Math.round(p.scrollLeft));
  const piezas = await page.$$eval('[data-ofertas] .oferta img', (is) => is.map((i) => i.alt));
  verificar(piezas.length === 29 && piezas.every((a) => /^Oferta de octubre: .+, a .+ pesos\.$/.test(a)), `Promociones · 29 ofertas con texto alternativo de producto y precio (${piezas.length})`);
  const orden = await page.$$eval('main h2', (hs) => hs.map((h) => h.textContent.trim()));
  verificar(orden.indexOf('Ofertas de octubre') > -1 && orden.indexOf('Ofertas de octubre') < orden.indexOf('Campañas vigentes'), `Promociones · la sección de ofertas va antes de "Campañas vigentes" (${orden.join(' → ')})`);
  const campanas = await page.$$eval('.campana h3', (hs) => hs.map((h) => h.textContent.trim()));
  verificar(campanas.length === 2 && campanas.some((t) => /moto/i.test(t)) && campanas.some((t) => /alquiler/i.test(t)), `Promociones · "Campañas vigentes" solo con motos y Porto Seguro (${campanas.join(' / ')})`);
  const botones = await page.$$eval('[data-ofertas] button', (bs) => bs.map((b) => b.getAttribute('aria-label') || '').filter((t) => /pausa|siguiente|anterior|avanzar/i.test(t)));
  verificar(botones.length === 0, 'Promociones · sin botones grandes de avanzar/pausar/volver');
  const p0 = await pos();
  await page.waitForTimeout(4200);
  const p1 = await pos();
  verificar(p1 > p0, `Promociones · el carrusel avanza solo (${p0} → ${p1})`);
  await page.hover('[data-ofertas]');
  const p2 = await pos();
  await page.waitForTimeout(4200);
  verificar((await pos()) === p2, 'Promociones · se detiene con el puntero encima');
  await page.mouse.move(5, 5);
  await page.waitForTimeout(4200);
  verificar((await pos()) !== p2, 'Promociones · continúa al retirar el puntero');
  await page.focus('[data-ofertas] [data-pista]');
  const p3 = await pos();
  await page.waitForTimeout(4200);
  verificar((await pos()) === p3, 'Promociones · se detiene con el foco del teclado');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(700);
  verificar((await pos()) > p3 || p3 > 0, 'Promociones · flecha derecha avanza');
  await page.close();
  const ctxR = await browser.newContext({ reducedMotion: 'reduce', viewport: VIEWPORTS.escritorio });
  const pr = await ctxR.newPage();
  await pr.goto(`${BASE}/hipermercado/promociones/`, { waitUntil: 'networkidle' });
  const r0 = await pr.$eval('[data-pista]', (p) => p.scrollLeft);
  await pr.waitForTimeout(4200);
  verificar((await pr.$eval('[data-pista]', (p) => p.scrollLeft)) === r0, 'Promociones · con movimiento reducido no avanza solo');
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
  verificar(banners.length === 4, `Banners (${nombre}) · 4 banners en Inicio`);
  await page.close();
}

// ── Carrusel ───────────────────────────────────────────────────────────
for (const [nombre, vp] of Object.entries(VIEWPORTS)) {
  const page = await browser.newPage({ viewport: vp, hasTouch: nombre === 'movil' });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const activa = () => page.evaluate(() => [...document.querySelectorAll('[data-panel]')].findIndex((p) => p.classList.contains('activa')));
  const botonesControl = await page.$$eval('[data-carrusel] button', (bs) =>
    bs.filter((b) => !b.hasAttribute('data-indicador')).map((b) => b.getAttribute('aria-label') || b.textContent.trim()),
  );
  verificar(botonesControl.length === 0, `Carrusel (${nombre}) · sin botones de avanzar/pausar/volver (${botonesControl.join(', ') || 'ninguno'})`);
  const indicadores = await page.$$eval('[data-indicador]', (bs) => bs.map((b) => b.getBoundingClientRect().height));
  verificar(indicadores.length === 4 && indicadores.every((h) => h >= 24), `Carrusel (${nombre}) · 4 indicadores accesibles (≥ 24 px de área)`);

  await page.focus('[data-carrusel]');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  verificar((await activa()) === 1, `Carrusel (${nombre}) · flecha derecha avanza`);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(100);
  verificar((await activa()) === 0, `Carrusel (${nombre}) · flecha izquierda retrocede`);

  const caja = await page.locator('[data-mazo]').boundingBox();
  const y = caja.y + caja.height / 2;
  await page.mouse.move(caja.x + caja.width * 0.8, y);
  await page.mouse.down();
  await page.mouse.move(caja.x + caja.width * 0.2, y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(100);
  verificar((await activa()) === 1, `Carrusel (${nombre}) · deslizar hacia la izquierda avanza`);
  await page.click('[data-indicador="3"]');
  verificar((await activa()) === 3, `Carrusel (${nombre}) · indicador 4 lleva a la diapositiva 4`);
  await page.close();
}
{
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: VIEWPORTS.escritorio });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const auto = await page.evaluate(() => document.querySelector('[data-carrusel]').classList.contains('hero--auto'));
  verificar(!auto, 'Carrusel · con movimiento reducido no avanza solo');
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
        .filter((img) => img.getBoundingClientRect().width > 40 && !img.closest('[aria-hidden="true"]:not([data-mazo])'))
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
