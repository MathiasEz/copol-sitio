// Verificaciones del sitio compilado para Vercel (.vercel/output/static). Ejecutar después de `npm run build`.
// Las páginas que se generan en cada visita (Bazar y el panel) se prueban en ejecución con `npm run qa`.
//   node scripts/check-site.mjs            → comprobaciones internas
//   node scripts/check-site.mjs --externos → además consulta (HEAD/GET) los enlaces externos únicos
// Sale con código 1 si encuentra errores.
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { BASE } from '../panel/src/config.ts';

const DIST = path.resolve('.vercel/output/static');
// Rutas que no son archivos estáticos: se generan en el servidor en cada visita.
const DINAMICAS = ['/hipermercado/bazar', BASE];
const EXTERNOS = process.argv.includes('--externos');
// Patrones con apariencia de precio (la cooperativa pidió no publicar precios del Hipermercado ni del Bazar).
const PRECIO = /(\$|U\$S|USD|UYU)\s?\d[\d.,]*/;
const SIN_PRECIOS = ['/hipermercado/'];

const errores = [];
const avisos = [];
const externos = new Map();

async function archivos(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await archivos(p)));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

async function existe(ruta) {
  const limpia = decodeURIComponent(ruta.split('#')[0].split('?')[0]);
  if (DINAMICAS.some((d) => limpia === d || limpia.startsWith(d + '/'))) return true;
  if (['/locales', '/nuestra-historia', '/historia', '/convenios', '/tienda', '/bazar', '/promociones', '/como-hacerte-socio', '/contactenos', '/contactus'].includes(limpia.replace(/\/$/, '')) || limpia.startsWith('/beneficios/') && !limpia.includes('servicios-sociales') && !limpia.includes('convenios')) return true; // redirecciones 301 del servidor
  const candidatos = [path.join(DIST, limpia), path.join(DIST, limpia, 'index.html'), path.join(DIST, `${limpia.replace(/\/$/, '')}.html`)];
  for (const c of candidatos) {
    try {
      const st = await fs.stat(c);
      if (st.isFile()) return true;
    } catch {}
  }
  return false;
}

const paginas = await archivos(DIST);
let revisadas = 0;
for (const archivo of paginas) {
  const html = await fs.readFile(archivo, 'utf8');
  const url = '/' + path.relative(DIST, archivo).replace(/\\/g, '/').replace(/index\.html$/, '');
  const { document } = parseHTML(html);
  // Páginas de redirección generadas por Astro: solo se valida su destino.
  const refresh = document.querySelector('meta[http-equiv="refresh"]');
  if (refresh) {
    const destino = refresh.getAttribute('content').split('url=')[1];
    if (!(await existe(destino))) errores.push(`${url}: redirige a una página inexistente (${destino})`);
    continue;
  }
  revisadas++;
  const err = (m) => errores.push(`${url}: ${m}`);

  if (document.documentElement.getAttribute('lang') !== 'es-UY') err('falta lang="es-UY"');
  if (!document.querySelector('title')?.textContent.trim()) err('sin <title>');
  if (!document.querySelector('meta[name="description"]')?.getAttribute('content')) err('sin meta description');
  if (!url.startsWith('/404') && !document.querySelector('link[rel="canonical"]')) err('sin canonical');
  const h1 = document.querySelectorAll('h1').length;
  if (h1 !== 1) err(`tiene ${h1} <h1> (debe tener 1)`);

  // Saltos de nivel de encabezado (p. ej., h2 → h4)
  let previo = 1;
  for (const h of document.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const nivel = Number(h.tagName[1]);
    if (nivel > previo + 1) avisos.push(`${url}: salto de encabezado h${previo} → h${nivel} ("${h.textContent.trim().slice(0, 40)}")`);
    previo = nivel;
  }

  for (const img of document.querySelectorAll('img')) {
    if (!img.hasAttribute('alt')) err(`imagen sin atributo alt (${img.getAttribute('src')?.slice(0, 60)})`);
  }

  const ids = new Map();
  for (const el of document.querySelectorAll('[id]')) ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) err(`id duplicado "${id}" (${n} veces)`);

  for (const a of document.querySelectorAll('a')) {
    const href = a.getAttribute('href');
    const nombre = (a.textContent + (a.getAttribute('aria-label') ?? '')).trim();
    if (!nombre && !a.querySelector('img[alt]:not([alt=""])')) err(`enlace sin texto accesible (${href})`);
    if (href === null || href === '' || href === '#') {
      err(`enlace vacío o "#" ("${nombre.slice(0, 40)}")`);
      continue;
    }
    if (href.startsWith('#')) {
      if (!document.getElementById(href.slice(1))) err(`ancla inexistente ${href}`);
    } else if (href.startsWith('/')) {
      if (!(await existe(href))) err(`enlace interno roto ${href}`);
    } else if (/^https?:/.test(href)) {
      if (!externos.has(href)) externos.set(href, url);
    }
  }

  for (const b of document.querySelectorAll('button')) {
    if (!(b.textContent.trim() || b.getAttribute('aria-label'))) err('botón sin nombre accesible');
  }

  if (SIN_PRECIOS.some((p) => url.startsWith(p))) {
    const texto = document.querySelector('main')?.textContent ?? '';
    const m = texto.match(PRECIO);
    if (m) err(`posible precio publicado: "${m[0]}"`);
  }
}

if (EXTERNOS) {
  console.log(`Consultando ${externos.size} enlaces externos…`);
  for (const [href, origen] of externos) {
    if (/wa\.me|instagram\.com|facebook\.com/.test(href)) continue; // bloquean bots; se verificaron manualmente
    try {
      let res = await fetch(href, { method: 'HEAD', redirect: 'follow' });
      if (res.status === 405 || res.status === 403) res = await fetch(href, { redirect: 'follow' });
      if (res.status >= 400) avisos.push(`externo ${res.status}: ${href} (en ${origen})`);
    } catch (e) {
      avisos.push(`externo sin respuesta: ${href} (en ${origen}) — ${e.message}`);
    }
  }
}

// ── Catálogo: imágenes locales disponibles para todos los productos con imagen ──
{
  const catalogo = JSON.parse(await fs.readFile(path.resolve('src/data/catalogo/bazar.json'), 'utf8'));
  const conImagen = catalogo.productos.filter((p) => p.imagen && !p.revisarPrecio);
  let faltan = 0;
  for (const p of conImagen) for (const a of [240, 400]) {
    try { await fs.access(path.join(DIST, 'catalogo', p.imagen.replace(/\.webp$/, `-${a}.webp`))); } catch { faltan++; if (faltan < 6) errores.push(`variante faltante: /catalogo/${p.imagen} (${a})`); }
  }
  console.log(`Catálogo: ${conImagen.length} productos con imagen local · ${conImagen.length * 2 - faltan} variantes web publicadas`);
}

// ── Inicio: los banners entregados enlazan a su sección y conservan su proporción ──
{
  const { document } = parseHTML(await fs.readFile(path.join(DIST, 'index.html'), 'utf8'));
  const esperados = { '/hipermercado/bazar/': 'Bazar', '/beneficios/servicios-sociales/': 'Servicios sociales', '/beneficios/servicios-sociales/pinecoop/': 'Pinecoop', '/hacete-socio/': 'Hacete socio' };
  const banners = [...document.querySelectorAll('a[data-banner]')];
  for (const [href, nombre] of Object.entries(esperados)) {
    const b = banners.find((x) => x.getAttribute('href') === href);
    if (!b) { errores.push(`/: falta el banner de ${nombre}`); continue; }
    const img = b.querySelector('img');
    if (!img?.getAttribute('alt')) errores.push(`/: banner de ${nombre} sin texto alternativo`);
    if (!b.querySelector('source[type="image/avif"]') || !b.querySelector('source[type="image/webp"]')) errores.push(`/: banner de ${nombre} sin AVIF/WebP responsive`);
    if (!/--ratio:\s*2000\s*\/\s*521/.test(b.getAttribute('style') ?? '')) errores.push(`/: banner de ${nombre} no conserva la proporción 2000/521`);
  }
}

console.log(`Páginas revisadas: ${revisadas} · enlaces externos únicos: ${externos.size}`);
if (avisos.length) console.log(`\nAvisos (${avisos.length}):\n  ` + avisos.join('\n  '));
if (errores.length) {
  console.log(`\nErrores (${errores.length}):\n  ` + errores.join('\n  '));
  process.exit(1);
}
console.log('\n✓ Sin errores.');
