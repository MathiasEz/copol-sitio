// Importa el catálogo completo del Bazar desde el sitio oficial en Google Sites
// (https://sites.google.com/view/catalogo-copol/inicio) y lo guarda localmente:
//   - Datos:    src/data/catalogo/bazar.json            (productos, categorías, origen)
//   - Imágenes: src/assets/catalogo/bazar/<id>.webp     (WebP, máx. 800 px, sin metadatos)
//   - Informe:  src/data/catalogo/bazar.informe.json    (conteos, faltantes y advertencias)
// No se extraen precios. Si un texto tiene apariencia de precio, el producto queda con
// `revisarPrecio: true` y no se publica hasta revisarlo.
// No se inventan datos: los campos que no están en el sitio de origen quedan en null.
//
// Uso:
//   node scripts/importar-catalogo.mjs                     importa y reemplaza los datos locales
//   node scripts/importar-catalogo.mjs --solo-informe      recorre y cuenta, sin escribir archivos
//   node scripts/importar-catalogo.mjs --forzar-imagenes   vuelve a descargar todas las imágenes
//
// Imágenes: se reutilizan las ya descargadas (mismo id de producto) salvo con --forzar-imagenes.
// Las URLs `sitesv-images-rt` de Google Sites caducan en uno o dos minutos: si una descarga
// devuelve 403, se vuelve a pedir la página para obtener URLs nuevas y se reintenta.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseHTML } from 'linkedom';
import sharp from 'sharp';

const ORIGIN = 'https://sites.google.com';
const ROOT = '/view/catalogo-copol/';
const INICIO = `${ROOT}inicio`;
const DATA_DIR = path.resolve('src/data/catalogo');
const OUT = path.join(DATA_DIR, 'bazar.json');
const INFORME = path.join(DATA_DIR, 'bazar.informe.json');
const IMG_DIR = path.resolve('src/assets/catalogo/bazar');
const TMP_DIR = path.resolve('.astro/importacion-bazar');
const PORTADA = path.resolve('scripts/catalogo-portada.json');
const PORTADA_IMG = path.resolve('assets-source/catalogo-portada');
const STAGE = path.resolve('.astro/importacion-bazar-final');
// Carpetas donde buscar imágenes ya descargadas (la actual y la de la importación de 13/10/2026).
const REUSO = [IMG_DIR, path.resolve('src/assets/catalogo'), TMP_DIR];
// Sin caché de archivos: en Windows mantiene abiertas las imágenes y bloquea su reemplazo.
sharp.cache(false);
const SOLO_INFORME = process.argv.includes('--solo-informe');
const FORZAR = process.argv.includes('--forzar-imagenes');

const PRICE_RE = /(\$|U\$S|USD|UYU)\s?\d|precio\s*[:$]|\d+[.,]\d{3}\s*(pesos|\$)/i;
const CODIGO_FIN = /^(.*?)[\s\-–]*\b(\d{5,7})\s*-?\s*$/;
const CODIGO_INICIO = /^(\d{5,7})\s+(.*)$/;
const clean = (s) => s.replace(/\s+/g, ' ').trim();
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const soloLetras = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
// Etiquetas de stock tal como aparecen en el origen, incluidas sus erratas
// ("Consultrar Stock", "Cosnultar Stock", "Consulta Stock", "Control Stock", "Consultar strock"…).
const esSinStock = (t) => soloLetras(t) === 'sinstock';
const esConsultar = (t) => /^c[a-z]{5,9}str?ock$/.test(soloLetras(t));
const estadoDe = (etiqueta) => (etiqueta ? (esSinStock(etiqueta) ? 'sin-stock' : 'con-stock') : 'sin-dato');

const MARCAS = ['Apple', 'Samsung', 'Xiaomi', 'Motorola', 'Honor', 'Cubot', 'Xion', 'Smartlife', 'Punktal', 'Philips', 'Sony', 'JBL', 'LG', 'TCL', 'Aiwa', 'Panasonic', 'Pioneer', 'HP', 'Lenovo', 'Asus', 'Acer', 'MSI', 'Dell', 'Epson', 'Canon', 'Logitech', 'Redragon', 'Marvo', 'Hisense', 'Midea', 'Electrolux', 'Whirlpool', 'Enxuta', 'James', 'Oster', 'Black & Decker', 'Tramontina', 'Gama', 'Remington', 'Braun', 'Wahl', 'TP-Link', 'Blink', 'Ezviz', 'Imou', 'Scott', 'S-Pro', 'Baccio', 'Alpha Pro', 'Forest & Garden', 'Nintendo', 'PlayStation', 'Bosch', 'Liliana', 'Atma', 'Daewoo', 'Telefunken', 'BGH', 'Zanella'];
/** Marca solo si aparece literalmente en el nombre publicado (no se deduce de otra fuente). */
const marcaDe = (nombre) => {
  const n = ` ${nombre.toUpperCase().replace('SMASUNG', 'SAMSUNG').replace('XIOAMI', 'XIAOMI').replace(/[^A-Z0-9&-]+/g, ' ')} `;
  return MARCAS.find((m) => n.includes(` ${m.toUpperCase()} `)) || null;
};

async function get(url, intentos = 4) {
  for (let i = 0; i < intentos; i++) {
    try {
      const res = await fetch(url, { headers: { 'Accept-Language': 'es-UY,es;q=0.9' }, signal: AbortSignal.timeout(60_000) });
      if (res.ok) return res.text();
      if (![429, 500, 502, 503].includes(res.status)) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (i === intentos - 1) throw e;
    }
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
  throw new Error(`Sin respuesta: ${url}`);
}

/** Destino real de los enlaces envueltos por Google (https://www.google.com/url?q=…). */
const desenvolver = (href) => {
  try {
    const u = new URL(href, ORIGIN);
    return u.hostname === 'www.google.com' && u.pathname === '/url' ? u.searchParams.get('q') : u.href;
  } catch {
    return href;
  }
};

/** Pide la imagen a 800 px (Google Sites acepta el sufijo =wNNN) y la guarda como WebP. */
async function descargarImagen(url, destino) {
  const u = url.replace(/=w\d+(-h\d+)?$/, '=w800');
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) return { error: `HTTP ${res.status}`, caducada: res.status === 403 };
    const buf = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(buf).metadata();
    await sharp(buf, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .webp({ quality: 80, effort: 5 })
      .toFile(destino);
    return { sha1: crypto.createHash('sha1').update(buf).digest('hex'), ancho: meta.width, alto: meta.height };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

async function enParalelo(items, n, fn) {
  const cola = [...items];
  await Promise.all(Array.from({ length: n }, async () => { while (cola.length) await fn(cola.shift()); }));
}
const existe = (f) => fs.access(f).then(() => true, () => false);

/**
 * Convierte el HTML de una página en la lista ordenada de bloques de producto.
 * Secuencia típica: IMG (a veces logo de marca + foto) → título con código → descripción → etiqueta de stock.
 */
function parsearPagina(html, estadisticas) {
  const doc = parseHTML(html).document;
  const TAGS = new Set(['IMG', 'H1', 'H2', 'H3', 'H4', 'P', 'LI', 'A']);
  // linkedom no garantiza orden de documento con selectores agrupados: se filtra '*'.
  const nodos = [...doc.body.querySelectorAll('*')].filter(
    (el) => TAGS.has(el.tagName) && !el.closest('header, nav, [role="navigation"], [role="banner"]'),
  );
  const frecuencia = new Map();
  for (const el of nodos) if (el.tagName === 'IMG') { const s = el.getAttribute('src') || ''; frecuencia.set(s, (frecuencia.get(s) || 0) + 1); }

  const bloques = [];
  let pendientes = [];
  let cur = null;
  let grupo = null;
  const cerrar = () => { if (cur) bloques.push(cur); cur = null; };
  const elegirImagen = () => {
    if (!pendientes.length) return null;
    // Con varias imágenes antes del título (logo de marca + foto) se elige la menos repetida en la página.
    estadisticas.imagenesDescartadas += pendientes.length - 1;
    return [...pendientes].reverse().sort((a, b) => frecuencia.get(a) - frecuencia.get(b))[0];
  };
  for (const el of nodos) {
    if (el.tagName === 'IMG') {
      const src = el.getAttribute('src') || '';
      if (!/googleusercontent|sitesv-images/.test(src)) continue;
      if (cur && (cur.stockEtiqueta || cur.lineas.length)) cerrar();
      pendientes.push(src);
      continue;
    }
    if (el.tagName === 'A') {
      const t = clean(el.textContent || '');
      if (cur && t && esConsultar(t)) { cur.stockEtiqueta ??= t; cur.consultaOrigen ??= desenvolver(el.getAttribute('href') || ''); }
      continue;
    }
    if (el.tagName === 'P' && el.closest('li')) continue; // el texto ya se toma del LI
    const t = clean(el.textContent || '');
    if (!t) continue;
    const esTitulo = /^H[1-4]$/.test(el.tagName);
    const tieneCodigo = CODIGO_FIN.test(t) || CODIGO_INICIO.test(t);
    if (esTitulo && (pendientes.length || (tieneCodigo && (!cur || cur.stockEtiqueta)))) {
      cerrar();
      let nombre = t, codigo = null;
      const m = t.match(CODIGO_INICIO) || t.match(CODIGO_FIN);
      if (m) {
        if (/^\d+$/.test(m[1])) { codigo = m[1]; nombre = m[2]; } else { nombre = m[1]; codigo = m[2]; }
      }
      nombre = clean(nombre).replace(/[\s\-–|]+$/, '');
      cur = { nombre, codigo, grupo, url: elegirImagen(), stockEtiqueta: null, consultaOrigen: null, lineas: [], posicion: bloques.length + 1 };
      pendientes = [];
      continue;
    }
    if (esTitulo && (!cur || cur.stockEtiqueta)) {
      // Encabezado de sección (p. ej., la marca "APPLE" o "PHILIPS" dentro de la página).
      cerrar();
      if (t.length <= 60) grupo = t;
      continue;
    }
    if (!cur) { estadisticas.textosHuerfanos++; continue; }
    if (esSinStock(t) || esConsultar(t)) { cur.stockEtiqueta ??= t; continue; }
    if (cur.stockEtiqueta) { estadisticas.textosHuerfanos++; continue; }
    const soloCodigo = t.match(/^[-–\s]*(\d{5,7})$/);
    if (soloCodigo) { cur.codigo ||= soloCodigo[1]; continue; }
    cur.lineas.push(t);
  }
  cerrar();
  if (pendientes.length) estadisticas.imagenesDescartadas += pendientes.length;
  return bloques;
}

// ── 1) Descubrir todas las páginas (recorrido completo de enlaces internos, no solo el menú) ──
const titulos = new Map(); // ruta → texto del enlace en el menú del sitio
const paginas = [];
{
  const vistas = new Set([INICIO]);
  const cola = [INICIO];
  while (cola.length) {
    const p = cola.shift();
    const doc = parseHTML(await get(ORIGIN + encodeURI(p))).document;
    paginas.push(p);
    for (const a of doc.querySelectorAll('a[href]')) {
      const h = decodeURIComponent(a.getAttribute('href').split(/[?#]/)[0]);
      if (!h.startsWith(ROOT)) continue;
      const texto = clean(a.textContent || '');
      if (texto && !titulos.has(h)) titulos.set(h, texto);
      if (!vistas.has(h)) { vistas.add(h); cola.push(h); }
    }
  }
}
console.log(`Páginas encontradas: ${paginas.length} (incluida la portada)`);

// ── 2) Productos de cada página de categoría ──
const productos = [];
const porClave = new Map();
const informe = { paginas: [], duplicados: [], sinImagen: [], erroresImagen: [], sinEtiquetaStock: [], sinCodigo: [], imagenesCompartidas: [], bloquesNoIdentificables: [], textosHuerfanos: 0, imagenesDescartadas: 0, imagenesReutilizadas: 0, imagenesDescargadas: 0, portada: [] };
const pendientesImagen = new Map(); // página → productos cuya imagen falta

for (const p of paginas.filter((x) => x !== INICIO)) {
  const rel = p.slice(ROOT.length);
  const [categoria, ...resto] = rel.split('/');
  const subcategoria = resto.length ? resto.map((_, i) => titulos.get(`${ROOT}${[categoria, ...resto.slice(0, i + 1)].join('/')}`) || resto[i]).join(' / ') : null;
  let bloques;
  try {
    bloques = parsearPagina(await get(ORIGIN + encodeURI(p)), informe);
  } catch (e) {
    informe.paginas.push({ pagina: rel, error: e.message });
    console.warn(`  ✗ ${rel}: ${e.message}`);
    continue;
  }
  const altas = [];
  for (const b of bloques) {
    // Imagen seguida de un encabezado de sección (p. ej. "XIAOMI") sin código, descripción ni etiqueta
    // de stock: no es un producto identificable. Se informa y no se importa (no se inventan datos).
    if (!b.codigo && !b.lineas.length && !b.stockEtiqueta) {
      informe.bloquesNoIdentificables.push({ pagina: rel, encabezado: b.nombre, grupoAnterior: b.grupo, posicion: b.posicion, conImagen: Boolean(b.url) });
      // Ese encabezado era en realidad la sección de los productos que siguen.
      for (const sig of bloques) if (sig.posicion > b.posicion && sig.grupo === b.grupo) sig.grupo = b.nombre;
      continue;
    }
    const clave = b.codigo || `${slug(b.nombre)}@${rel}`;
    if (porClave.has(clave)) {
      const original = porClave.get(clave);
      original.origen.tambienEn.push(ORIGIN + p);
      informe.duplicados.push({ codigo: b.codigo, nombre: b.nombre, pagina: rel, primeraAparicion: original.origen.pagina.replace(ORIGIN + ROOT, '') });
      continue;
    }
    const descripcion = b.lineas.join('\n').trim() || null;
    const prod = {
      id: slug(`${b.nombre}-${b.codigo || `${rel.replace(/\//g, '-')}-${b.posicion}`}`),
      rubro: 'bazar',
      codigo: b.codigo,
      nombre: b.nombre,
      categoria,
      subcategoria,
      grupo: b.grupo,
      marca: marcaDe(b.nombre),
      descripcion,
      stock: { estado: estadoDe(b.stockEtiqueta), etiquetaOrigen: b.stockEtiqueta, cantidad: null },
      imagen: null,
      imagenOrigen: null,
      consultaOrigen: b.consultaOrigen,
      revisarPrecio: PRICE_RE.test(`${b.nombre} ${descripcion ?? ''}`),
      origen: { pagina: ORIGIN + p, posicion: b.posicion, tambienEn: [] },
      _tieneImagen: Boolean(b.url),
    };
    porClave.set(clave, prod);
    productos.push(prod);
    altas.push(prod);
  }
  const faltan = altas.filter((x) => x._tieneImagen);
  if (faltan.length) pendientesImagen.set(p, faltan);
  const cuenta = (e) => altas.filter((x) => x.stock.estado === e).length;
  informe.paginas.push({ pagina: rel, titulo: titulos.get(p) ?? null, productos: altas.length, conStock: cuenta('con-stock'), sinStock: cuenta('sin-stock'), sinDato: cuenta('sin-dato') });
  console.log(`  ${rel.padEnd(62)} ${String(altas.length).padStart(3)} prod · ${String(cuenta('con-stock')).padStart(3)} con · ${String(cuenta('sin-stock')).padStart(3)} sin · ${cuenta('sin-dato')} s/d`);
}

// ── 3) Portada: destacados que no figuran en ninguna categoría (ver scripts/catalogo-portada.json) ──
const portada = JSON.parse(await fs.readFile(PORTADA, 'utf8'));
{
  const doc = parseHTML(await get(ORIGIN + INICIO)).document;
  for (const h of doc.querySelectorAll('h1, h2, h3')) {
    const t = clean(h.textContent || '');
    const m = t.match(CODIGO_INICIO) || t.match(CODIGO_FIN);
    if (!m) continue;
    const codigo = /^\d+$/.test(m[1]) ? m[1] : m[2];
    informe.portada.push({ codigo, nombre: clean(/^\d+$/.test(m[1]) ? m[2] : m[1]).replace(/[\s\-–|]+$/, ''), enCategorias: porClave.has(codigo) });
  }
  for (const x of portada.productos) {
    if (porClave.has(x.codigo)) continue;
    const enPortada = informe.portada.some((y) => y.codigo === x.codigo);
    const prod = {
      id: slug(`${x.nombre}-${x.codigo}`),
      rubro: 'bazar',
      codigo: x.codigo,
      nombre: x.nombre,
      categoria: portada.categoria.id,
      subcategoria: null,
      grupo: null,
      marca: marcaDe(x.nombre),
      descripcion: x.descripcion,
      stock: { estado: estadoDe(x.etiquetaStock), etiquetaOrigen: x.etiquetaStock, cantidad: null },
      imagen: null,
      imagenOrigen: null,
      imagenPublicable: x.imagenPublicable,
      observacion: x.observacion,
      consultaOrigen: x.consultaOrigen,
      revisarPrecio: PRICE_RE.test(`${x.nombre} ${x.descripcion ?? ''}`),
      origen: { pagina: portada.fuente, posicion: null, tambienEn: [], verificadoManualmente: portada.verificado, sigueEnElOrigen: enPortada },
      _portada: x.imagen,
    };
    porClave.set(x.codigo, prod);
    productos.push(prod);
  }
}

// ── 4) Imágenes: reutilizar las ya descargadas; descargar las que falten refrescando URLs caducadas ──
if (!SOLO_INFORME) {
  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.rm(STAGE, { recursive: true, force: true });
  await fs.mkdir(STAGE, { recursive: true });

  const registrar = async (prod, archivo, extra = {}) => {
    const meta = await sharp(archivo).metadata();
    const buf = await fs.readFile(archivo);
    await fs.writeFile(path.join(STAGE, `${prod.id}.webp`), buf);
    prod.imagen = `bazar/${prod.id}.webp`;
    prod.imagenOrigen = { sha1Local: crypto.createHash('sha1').update(buf).digest('hex'), ancho: meta.width, alto: meta.height, ...extra };
  };

  for (const prod of productos) {
    if (prod._portada) {
      const src = path.join(PORTADA_IMG, prod._portada);
      if (await existe(src)) {
        await sharp(src).resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80, effort: 5 }).toFile(path.join(TMP_DIR, `${prod.id}.webp`));
        await registrar(prod, path.join(TMP_DIR, `${prod.id}.webp`), { fuente: 'assets-source/catalogo-portada/' + prod._portada });
      }
      continue;
    }
    if (FORZAR || !prod._tieneImagen) continue;
    for (const dir of REUSO) {
      const f = path.join(dir, `${prod.id}.webp`);
      if (await existe(f)) { await registrar(prod, f, { reutilizada: true }); informe.imagenesReutilizadas++; break; }
    }
  }

  let ronda = 0;
  const faltantes = () => [...pendientesImagen.entries()].map(([p, lista]) => [p, lista.filter((x) => !x.imagen)]).filter(([, l]) => l.length);
  while (faltantes().length && ronda < 6) {
    ronda++;
    const total = faltantes().reduce((n, [, l]) => n + l.length, 0);
    console.log(`\nDescarga de imágenes · ronda ${ronda}: faltan ${total}`);
    for (const [p, lista] of faltantes()) {
      // URLs frescas: se vuelve a pedir la página y se ubica cada producto por posición y nombre.
      let bloques;
      try { bloques = parsearPagina(await get(ORIGIN + encodeURI(p)), { imagenesDescartadas: 0, textosHuerfanos: 0 }); } catch { continue; }
      const inicio = Date.now();
      await enParalelo(lista, 8, async (prod) => {
        if (Date.now() - inicio > 75_000) return; // las URLs ya habrán caducado: se reintenta en la próxima ronda
        const b = bloques.find((x) => x.posicion === prod.origen.posicion && x.nombre === prod.nombre);
        if (!b?.url) return;
        const tmp = path.join(TMP_DIR, `${prod.id}.webp`);
        const r = await descargarImagen(b.url, tmp);
        if (r.error) {
          prod._errores = [...(prod._errores ?? []), `ronda ${ronda}: ${r.error}`];
          return;
        }
        await registrar(prod, tmp, { sha1Origen: r.sha1, anchoOrigen: r.ancho, altoOrigen: r.alto });
        informe.imagenesDescargadas++;
      });
      process.stdout.write(`  ${p.slice(ROOT.length)}: ${lista.filter((x) => x.imagen).length}/${lista.length}\n`);
    }
  }
  // Solo se informan las imágenes que no se pudieron descargar al final (los fallos transitorios que
  // se resolvieron en una ronda posterior no son faltantes).
  for (const [, lista] of faltantes()) for (const prod of lista) informe.erroresImagen.push({ id: prod.id, codigo: prod.codigo, nombre: prod.nombre, intentos: prod._errores ?? [] });
  informe.descargasConReintento = productos.filter((x) => x.imagen && x._errores).length;

  // Actualización de la carpeta final solo al terminar: se copian las imágenes preparadas y luego se
  // quitan las que ya no corresponden a ningún producto (nunca se vacía la carpeta antes de copiar).
  await fs.mkdir(IMG_DIR, { recursive: true });
  const preparadas = new Set(await fs.readdir(STAGE));
  for (const f of preparadas) await fs.copyFile(path.join(STAGE, f), path.join(IMG_DIR, f));
  for (const f of await fs.readdir(IMG_DIR)) if (!preparadas.has(f)) await fs.rm(path.join(IMG_DIR, f), { maxRetries: 5, retryDelay: 300 });
  for (const f of await fs.readdir(path.resolve('src/assets/catalogo'))) if (f.endsWith('.webp')) await fs.rm(path.resolve('src/assets/catalogo', f), { maxRetries: 5, retryDelay: 300 });
}

// ── 5) Controles e informe ──
const relPagina = (prod) => prod.origen.pagina.replace(ORIGIN + ROOT, '');
for (const prod of productos) {
  if (!prod._tieneImagen && !prod._portada) informe.sinImagen.push({ id: prod.id, codigo: prod.codigo, nombre: prod.nombre, pagina: relPagina(prod) });
  if (prod.stock.estado === 'sin-dato') informe.sinEtiquetaStock.push({ codigo: prod.codigo, nombre: prod.nombre, pagina: relPagina(prod) });
  if (!prod.codigo) informe.sinCodigo.push({ id: prod.id, nombre: prod.nombre, pagina: relPagina(prod) });
  delete prod._tieneImagen;
  delete prod._portada;
  delete prod._errores;
}
const porHash = new Map();
for (const prod of productos) {
  const h = prod.imagenOrigen?.sha1Local;
  if (h) porHash.set(h, [...(porHash.get(h) || []), prod]);
}
for (const g of porHash.values()) if (g.length > 1) informe.imagenesCompartidas.push(g.map((x) => `${x.codigo ?? 's/c'} ${x.nombre}`));
informe.noImportados = portada.noImportados;

const categorias = [...new Set(productos.map((x) => x.categoria))].map((id) => ({
  id,
  // El menú del sitio antepone emojis ("📱 Celulares"): se conserva solo el texto.
  nombre: id === portada.categoria.id ? portada.categoria.nombre : (titulos.get(`${ROOT}${id}`) ?? id).replace(/^[^\p{L}\p{N}]+/u, '').trim(),
  subcategorias: [...new Set(productos.filter((x) => x.categoria === id && x.subcategoria).map((x) => x.subcategoria))],
}));
const totales = {
  paginas: paginas.length,
  apariciones: productos.length + informe.duplicados.length,
  productos: productos.length,
  conStock: productos.filter((x) => x.stock.estado === 'con-stock').length,
  sinStock: productos.filter((x) => x.stock.estado === 'sin-stock').length,
  sinDato: productos.filter((x) => x.stock.estado === 'sin-dato').length,
  conImagen: productos.filter((x) => x.imagen).length,
  duplicadosOmitidos: informe.duplicados.length,
  revisarPrecio: productos.filter((x) => x.revisarPrecio).length,
};
const hoy = new Date().toISOString().slice(0, 10);

if (!SOLO_INFORME) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    OUT,
    JSON.stringify({
      rubro: 'bazar',
      fuente: ORIGIN + INICIO,
      importado: hoy,
      nota: 'Catálogo sin precios importado del sitio oficial en Google Sites. stock.estado: "con-stock" = el origen decía "Consultar stock"; "sin-stock" = "SIN STOCK"; "sin-dato" = el origen no tenía etiqueta. Los campos ausentes en el origen quedan en null.',
      totales,
      categorias,
      productos,
    }, null, 2) + '\n',
  );
  await fs.writeFile(INFORME, JSON.stringify({ fuente: ORIGIN + INICIO, importado: hoy, totales, ...informe }, null, 2) + '\n');
}

console.log('\n── Resumen ──');
console.table(totales);
console.log(`Imágenes reutilizadas: ${informe.imagenesReutilizadas} · descargadas: ${informe.imagenesDescargadas} · errores: ${informe.erroresImagen.length}`);
console.log(`Duplicados omitidos (mismo código en otra página): ${informe.duplicados.length}`);
console.log(`Sin etiqueta de stock en el origen: ${informe.sinEtiquetaStock.length} · Sin código: ${informe.sinCodigo.length} · Sin imagen en el origen: ${informe.sinImagen.length}`);
console.log(`Imágenes idénticas usadas por más de un producto: ${informe.imagenesCompartidas.length} grupos`);
console.log(`Bloques no identificables (imagen sin título ni código, no importados): ${informe.bloquesNoIdentificables.length}`);
for (const b of informe.bloquesNoIdentificables) console.log(`  · ${b.pagina} — encabezado "${b.encabezado}" después de la sección "${b.grupoAnterior ?? '—'}"`);
console.log(`Destacados de portada: ${informe.portada.length} (${informe.portada.filter((x) => !x.enCategorias).length} no están en ninguna categoría)`);
