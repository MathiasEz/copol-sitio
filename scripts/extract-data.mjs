// Extrae los datos estructurados publicados en el sitio actual y los guarda en src/data/.
// - Locales: array JSON `CPOL_LOCS` de /locales (+ fotos de cada local).
// - Convenios: array `CONVS` de /convenios (literal JS; se evalúa en un contexto vm aislado sin globales).
// Uso: node scripts/extract-data.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

const BASE = 'https://cooperativapolicial.com.uy';
const DATA = path.resolve('src/data');

/** Extrae el literal de array que sigue a `marker` balanceando corchetes (respeta strings). */
function sliceArray(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error(`No se encontró ${marker}`);
  const start = src.indexOf('[', at);
  let depth = 0, quote = null;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`Array sin cerrar en ${marker}`);
}

const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Rubros normalizados (los datos originales tienen 41 variantes con mayúsculas/tildes distintas).
const RUBROS = [
  ['Supermercado', /^(super(mercado)?|autoservice|almacen|bazar, supermercado)$/i],
  ['Farmacia', /^farmacia$/i],
  ['Óptica', /^optica/i],
  ['Carnicería', /^carnicer/i],
  ['Zapatería', /^zapater/i],
  ['Tienda y ropa', /^(tienda|tienda de ropa|tienda y jugueteria|tienda y zapateria|pañalera|joyería)$/i],
  ['Mueblería y hogar', /^(muebleria|art\. para el hogar|electrodomes\.)$/i],
  ['Ferretería y barraca', /^(ferreteria|barraca|barraca y ferreteria|super gas|repuestos)$/i],
  ['Turismo', /^(agencia viaje|apart-hotel|cabañas)$/i],
  ['Alimentos', /^(panaderia|panad\., fca de pastas|fca\. pastas|verduleria|frutería)$/i],
  ['Salud y servicios', /^(odontologo|abogada|art\. de rehabilitacion|academia de choferes)$/i],
  ['Papelería', /^papeleria/i],
];
const rubroDe = (t) => (RUBROS.find(([, re]) => re.test(t.trim())) || ['Otros'])[0];

// ── Locales ────────────────────────────────────────────────────────────
const locHtml = await (await fetch(`${BASE}/locales`)).text();
const locs = JSON.parse(sliceArray(locHtml, 'CPOL_LOCS'));
// Las fotos de las tarjetas del sitio anterior son carteles de ciudades (varias con marca de agua
// de Gemini), no fotos de los locales: se excluyen. `foto` queda en null hasta tener fotos reales.
const locales = [];
for (const l of locs) {
  const foto = null;
  const [direccion, ciudad] = l.dir.split(/,\s*(?=[^,]+$)/);
  locales.push({
    id: l.id,
    tipo: l.tag, // casa-central | sucursal | agencia
    direccion: direccion.trim(),
    ciudad: (ciudad || '').trim(),
    telefono: l.tel || null,
    celular: l.cel || null,
    email: l.email || null,
    lat: l.lat,
    lng: l.lng,
    foto,
  });
}

// Correcciones y notas confirmadas por la cooperativa (12/10/2026).
const cc = locales.find((l) => l.id === 'casa-central');
if (cc) {
  cc.direccion = 'Av. Libertador 1856, esq. Nueva York';
  cc.accesoAlternativo = 'Nueva York 1335 (otra entrada del mismo edificio)';
}
for (const id of ['artigas', 'paysandu']) {
  const l = locales.find((x) => x.id === id);
  if (l) l.pendiente = 'Teléfono fijo 4772 5070 repetido en Artigas y Paysandú — pendiente de confirmación.';
}

await fs.mkdir(path.join(DATA, 'confirmado'), { recursive: true });
await fs.writeFile(
  path.join(DATA, 'confirmado', 'locales.json'),
  JSON.stringify({ fuente: `${BASE}/locales`, extraido: new Date().toISOString().slice(0, 10), locales }, null, 2),
);
console.log(`Locales: ${locales.length} (fotos: ${locales.filter((l) => l.foto).length})`);

// ── Convenios ──────────────────────────────────────────────────────────
const convHtml = await (await fetch(`${BASE}/convenios`)).text();
const literal = sliceArray(convHtml, 'var CONVS=');
const raw = vm.runInNewContext(`(${literal})`, Object.create(null), { timeout: 1000 });
// Comercios que COPOL pidió sacar del listado: si se vuelve a extraer del sitio anterior, no se agregan.
const QUITADOS = new Set(['Super Paseo Colon']);
const convenios = raw.map((c, i) => {
  const [departamento, localidad] = c.d.split(/\s+-\s+/);
  return {
    id: `${slug(c.n)}-${i + 1}`,
    nombre: c.n.trim(),
    rubro: rubroDe(c.t),
    rubroOriginal: c.t.trim(),
    departamento: departamento.trim(),
    localidad: (localidad || departamento).trim(),
    direccion: c.dir?.trim() || null,
    telefono: c.tel?.trim() || null,
    lat: c.lat ?? null,
    lng: c.lng ?? null,
  };
}).filter((c) => !QUITADOS.has(c.nombre));
await fs.writeFile(
  path.join(DATA, 'confirmado', 'convenios.json'),
  JSON.stringify(
    {
      fuente: `${BASE}/convenios`,
      extraido: new Date().toISOString().slice(0, 10),
      nota: 'El sitio anterior anunciaba 152 convenios; los datos publicados contienen estos registros. Cifra a confirmar.',
      convenios,
    },
    null,
    2,
  ),
);
const porRubro = convenios.reduce((a, c) => ((a[c.rubro] = (a[c.rubro] || 0) + 1), a), {});
console.log(`Convenios: ${convenios.length}`, porRubro);
