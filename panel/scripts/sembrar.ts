// Carga el catálogo importado del Bazar (src/data/catalogo/bazar.json) en la base configurada
// (Turso en producción o el archivo local) y crea las novedades iniciales si todavía no hay ninguna.
// Es idempotente: agrega lo que falte y NO pisa el stock ni los datos editados en el panel.
//
//   npm run panel:sembrar
//   npm run panel:sembrar -- --actualizar-textos   (actualiza textos de importados que nadie editó)
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { registrar } from '../src/auditoria.ts';
import { RUTAS } from '../src/config.ts';
import { ahora, conectar, una, urlBase } from '../src/db.ts';

interface ProductoImportado {
  id: string; codigo: string | null; nombre: string; categoria: string; subcategoria: string | null; marca: string | null;
  descripcion: string | null; stock: { estado: 'con-stock' | 'sin-stock' | 'sin-dato'; cantidad: number | null };
  imagen: string | null; imagenPublicable?: boolean; consultaOrigen: string | null; revisarPrecio: boolean; origen: { pagina: string };
}
interface Catalogo { fuente: string; importado: string; categorias: { id: string; nombre: string }[]; productos: ProductoImportado[] }

const ACTUALIZAR = process.argv.includes('--actualizar-textos');
const catalogo = JSON.parse(await fs.readFile(path.join(RUTAS.raizSitio, 'src/data/catalogo/bazar.json'), 'utf8')) as Catalogo;
const destino = urlBase();
console.log(`Base: ${destino.startsWith('file:') ? 'archivo local' : destino.replace(/\/\/.*@/, '//')}`);
const db = await conectar();
const t = ahora();

const sentencias: { sql: string; args: (string | number | null)[] }[] = [
  { sql: "INSERT INTO rubros (id, nombre, activo, orden) VALUES ('bazar', 'Bazar', 1, 0) ON CONFLICT(id) DO NOTHING", args: [] },
  ...catalogo.categorias.map((cat, i) => ({ sql: 'INSERT INTO categorias (rubro_id, id, nombre, orden) VALUES (?, ?, ?, ?) ON CONFLICT(rubro_id, id) DO UPDATE SET orden = excluded.orden', args: ['bazar', cat.id, cat.nombre, i] })),
];
const existentes = new Map((await db.execute("SELECT id, version, origen FROM productos WHERE rubro_id = 'bazar'")).rows.map((f) => [String(f.id), { version: Number(f.version), origen: String(f.origen) }]));
let altas = 0, actualizados = 0, omitidos = 0;
const orden = new Map<string, number>();
for (const p of catalogo.productos) {
  if (p.revisarPrecio) { omitidos++; continue; }
  const n = (orden.get(p.categoria) ?? 0) + 1;
  orden.set(p.categoria, n);
  const previo = existentes.get(p.id);
  if (!previo) {
    sentencias.push({
      sql: `INSERT INTO productos (id, rubro_id, codigo, nombre, descripcion, categoria_id, subcategoria, marca, imagen, imagen_publicable, stock_estado, stock_cantidad, origen, origen_url, consulta_origen, orden, creado_en, actualizado_en, actualizado_por)
        VALUES (?, 'bazar', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'importado', ?, ?, ?, ?, ?, 'importación')`,
      args: [p.id, p.codigo, p.nombre, p.descripcion, p.categoria, p.subcategoria, p.marca, p.imagen, p.imagenPublicable === false ? 0 : 1, p.stock.estado, p.stock.cantidad, p.origen.pagina, p.consultaOrigen, n, t, t],
    });
    altas++;
  } else if (ACTUALIZAR && previo.origen === 'importado' && previo.version === 1) {
    sentencias.push({ sql: 'UPDATE productos SET nombre = ?, descripcion = ?, categoria_id = ?, subcategoria = ?, marca = ?, origen_url = ?, orden = ? WHERE id = ?', args: [p.nombre, p.descripcion, p.categoria, p.subcategoria, p.marca, p.origen.pagina, n, p.id] });
    actualizados++;
  }
}
// En tandas (las bases remotas limitan el tamaño de cada lote).
for (let i = 0; i < sentencias.length; i += 200) await db.batch(sentencias.slice(i, i + 200), 'write');
await registrar(db, { id: null, usuario: 'sistema', ip: null }, 'sistema.siembra', 'catalogo', 'bazar', { fuente: catalogo.fuente, importado: catalogo.importado, altas, actualizados, omitidos });

// Novedades iniciales: las que mostraba la portada, con imágenes del propio sitio (public/novedades/).
const hayNovedades = Number((await una<{ n: number }>(db, 'SELECT COUNT(*) n FROM novedades'))?.n ?? 0);
let novedades = 0;
if (!hayNovedades) {
  const iniciales = [
    { archivo: 'banner-garantia-alquiler', titulo: 'Garantía de alquiler con Porto Seguro', texto: 'Garantía de alquiler en todo el país, hasta en 10 cuotas sin tarjeta.', boton: 'Ver convenios', url: '/beneficios/convenios/', alt: 'Pieza del nuevo convenio de garantía de alquiler con Porto Seguro' },
    { archivo: 'motos-bazar', titulo: 'Nuevos ingresos: motos Zanella', texto: 'Zanella Pollerita y Sapucai, hasta en 15 cuotas sin recargo. Vení a verlas al local.', boton: 'Ver locales', url: '/sobre-nosotros/locales/', alt: 'Pieza de motos Zanella en el Bazar' },
    { archivo: 'fiestas-eventos', titulo: 'Fiestas y cumpleaños de 15', texto: 'Reservá tu fecha y viví una experiencia llena de emoción y recuerdos.', boton: 'Reservá por WhatsApp', url: 'https://wa.me/59898872727?text=Hola%2C%20quiero%20reservar%20una%20fecha%20para%20un%20evento', alt: 'Salón de eventos de COPOL' },
  ];
  const dir = path.join(RUTAS.raizSitio, 'public/novedades');
  await fs.mkdir(dir, { recursive: true });
  for (const [i, n] of iniciales.entries()) {
    for (const ancho of [800, 1600]) {
      await sharp(path.join(RUTAS.raizSitio, 'src/assets/img', `${n.archivo}.webp`)).resize({ width: ancho, withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(dir, `${n.archivo}-${ancho}.webp`));
    }
    await db.execute({
      sql: `INSERT INTO novedades (titulo, texto, imagen, imagen_alt, plantilla, enlace_texto, enlace_url, publicado, orden, creado_en, actualizado_en, actualizado_por) VALUES (?, ?, ?, ?, 'imagen-izquierda', ?, ?, 1, ?, ?, ?, 'importación')`,
      args: [n.titulo, n.texto, `/novedades/${n.archivo}-1600.webp`, n.alt, n.boton, n.url, i + 1, t, t],
    });
    novedades++;
  }
}

const total = Number((await una<{ n: number }>(db, "SELECT COUNT(*) n FROM productos WHERE rubro_id = 'bazar'"))?.n ?? 0);
console.log(`Catálogo del Bazar (${catalogo.importado}): ${altas} altas, ${actualizados} actualizados, ${omitidos} omitidos. Total en la base: ${total}. Novedades iniciales: ${novedades}.`);
db.close();
