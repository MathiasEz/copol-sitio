// Catálogo del Bazar para la web pública, leído en cada petición de la MISMA base de datos que
// actualiza el panel de stock. Las imágenes y los textos importados siguen guardados en el proyecto;
// el stock (y los productos agregados o editados en el panel) salen siempre de la base.
// Si la base no responde, no se muestra un stock viejo: cada producto pasa a "Consultar disponibilidad".
import bazarJson from '../data/catalogo/bazar.json';
import { obtenerDb, todas } from '../../panel/src/db.ts';
import { novedadesPublicadas, type Novedad } from '../../panel/src/novedades.ts';
import { CONTACTO, whatsapp } from '../data/confirmado/sitio';
import { agruparVariantes } from './variantes';

export type EstadoStock = 'con-stock' | 'sin-stock' | 'sin-dato';
export const ESTADO_STOCK: Record<EstadoStock, string> = { 'con-stock': 'Con stock', 'sin-stock': 'Sin stock', 'sin-dato': 'Consultar disponibilidad' };

export interface ImagenProducto { src: string; srcset: string; ancho: number }
export interface Producto {
  id: string;
  nombre: string;
  codigo: string | null;
  marca: string | null;
  categoria: string;
  categoriaId: string;
  subcategoria: string | null;
  imagen: ImagenProducto | null;
  estado: EstadoStock;
  consulta: string;
  /** Largo de la descripción guardada (0 = sin descripción). */
  largoDescripcion: number;
}
export interface CategoriaCatalogo { id: string; nombre: string; total: number; conStock: number; sinStock: number }
export interface Catalogo {
  productos: Producto[];
  categorias: CategoriaCatalogo[];
  totales: { total: number; conStock: number; sinStock: number };
  /** false si la base no respondió: no hay estado de stock confiable. */
  enVivo: boolean;
}

const capitalizar = (s: string) =>
  s.toLowerCase().replace(/(^|\s|\/|\()([a-záéíóúñ])/g, (_m, p, c) => p + c.toUpperCase())
    .replace(/\b(\d+)(gb|tb|w|l|lt|lts|kg|mp|hz|cc|btu)\b/gi, (_m, n, u) => n + u.toUpperCase())
    .replace(/\b(Usb|Led|Uhd|Hd|Fhd|Qled|Tv|Wifi|Bt|Rgb|Ssd|Ram|Pc|Ps5|Ps4|Hdmi|Ip\d+|Jbl|Msi|Hp|Lg|Tcl)\b/g, (m) => m.toUpperCase())
    .replace(/\b(\d)g\b/gi, '$1G')
    .replace(/\bIphone\b/g, 'iPhone').replace(/\bIpad\b/g, 'iPad').replace(/\bPlaystation\b/g, 'PlayStation')
    .replace(/\bXioami\b/g, 'Xiaomi').replace(/\bSmasung\b/g, 'Samsung').replace(/\bTp-link\b/g, 'TP-Link');

export const consultaProducto = (nombre: string, codigo: string | null) =>
  whatsapp(CONTACTO.whatsappGeneral.numero, `Hola! Quiero consultar por el producto: ${nombre}${codigo ? ` (código interno COPOL ${codigo})` : ''}`);

/**
 * Imágenes importadas: variantes estáticas generadas en el build (scripts/variantes-catalogo.mjs).
 * Imágenes subidas en el panel: variantes de 400 y 800 px guardadas en Vercel Blob (o en local).
 */
export function imagenDe(imagen: string | null | undefined): ImagenProducto | null {
  if (!imagen) return null;
  if (/^https?:\/\//.test(imagen) || imagen.startsWith('/')) {
    const chica = imagen.replace(/-800\.webp$/, '-400.webp');
    return { src: chica, srcset: `${chica} 400w, ${imagen} 800w`, ancho: 400 };
  }
  const base = `/catalogo/${imagen.replace(/\.webp$/, '')}`;
  return { src: `${base}-400.webp`, srcset: `${base}-240.webp 240w, ${base}-400.webp 400w`, ancho: 400 };
}

interface Fila {
  id: string; codigo: string | null; nombre: string; marca: string | null; categoria_id: string; categoria_nombre: string;
  subcategoria: string | null; imagen: string | null; imagen_publicable: number; stock_estado: EstadoStock; orden_cat: number;
  largo_desc: number | null;
}

const desdeJson = () => bazarJson.productos
  .filter((p) => !p.revisarPrecio)
  .map<Fila>((p) => ({
    id: p.id, codigo: p.codigo, nombre: p.nombre, marca: p.marca, categoria_id: p.categoria,
    categoria_nombre: bazarJson.categorias.find((c) => c.id === p.categoria)?.nombre ?? p.categoria, subcategoria: p.subcategoria,
    imagen: p.imagen, imagen_publicable: (p as { imagenPublicable?: boolean }).imagenPublicable === false ? 0 : 1,
    stock_estado: 'sin-dato', orden_cat: bazarJson.categorias.findIndex((c) => c.id === p.categoria),
    largo_desc: p.descripcion?.length ?? 0,
  }));

async function filas(): Promise<{ filas: Fila[]; enVivo: boolean }> {
  try {
    const db = await obtenerDb();
    const r = await todas<Fila>(db, `SELECT p.id, p.codigo, p.nombre, p.marca, p.categoria_id, c.nombre categoria_nombre, p.subcategoria, p.imagen,
      p.imagen_publicable, p.stock_estado, c.orden orden_cat, LENGTH(p.descripcion) largo_desc
      FROM productos p JOIN categorias c ON c.rubro_id = p.rubro_id AND c.id = p.categoria_id
      WHERE p.rubro_id = 'bazar' AND p.publicado = 1 ORDER BY c.orden, p.orden, p.nombre`);
    if (r.length) return { filas: r, enVivo: true };
    console.error('inventario: la base no tiene productos; se muestra el catálogo sin estado de stock');
  } catch (e) {
    console.error('inventario: no se pudo leer la base de datos:', (e as Error).message);
  }
  return { filas: desdeJson(), enVivo: false };
}

const contar = (lista: Producto[], e: EstadoStock) => lista.filter((p) => p.estado === e).length;

export async function obtenerCatalogo(): Promise<Catalogo> {
  const { filas: rows, enVivo } = await filas();
  const productos = rows.map<Producto>((f) => ({
    id: f.id,
    nombre: capitalizar(f.nombre),
    codigo: f.codigo,
    marca: f.marca,
    categoria: f.categoria_nombre,
    categoriaId: f.categoria_id,
    subcategoria: f.subcategoria,
    imagen: Number(f.imagen_publicable) ? imagenDe(f.imagen) : null,
    estado: enVivo ? f.stock_estado : 'sin-dato',
    consulta: consultaProducto(f.nombre, f.codigo),
    largoDescripcion: Number(f.largo_desc) || 0,
  }));
  const ids = [...new Set(rows.map((f) => f.categoria_id))];
  const categorias = ids.map((id) => {
    const lista = productos.filter((p) => p.categoriaId === id);
    return { id, nombre: lista[0].categoria, total: lista.length, conStock: contar(lista, 'con-stock'), sinStock: contar(lista, 'sin-stock') };
  });
  return { productos, categorias, totales: { total: productos.length, conStock: contar(productos, 'con-stock'), sinStock: contar(productos, 'sin-stock') }, enVivo };
}

/** Selección para estantes: productos con stock e imagen, rotando por categorías en orden fijo. */
export function destacados(catalogo: Catalogo, cantidad = 10, categorias = ['celulares', 'televisores', 'pequeños-electrodomésticos', 'bicicletas', 'gaming', 'audio', 'hogar', 'informática', 'cuidado-personal', 'heladeras', 'lavado', 'fitness']): Producto[] {
  const elegidos: Producto[] = [];
  const disponibles = catalogo.productos.filter((x) => x.estado === 'con-stock' && x.imagen);
  for (let vuelta = 0; elegidos.length < cantidad && vuelta < cantidad; vuelta++) {
    for (const cat of categorias) {
      const p = disponibles.filter((x) => x.categoriaId === cat)[vuelta];
      if (p) elegidos.push(p);
      if (elegidos.length >= cantidad) break;
    }
  }
  return elegidos;
}

export type { Novedad };
/** Novedades publicadas en el orden definido en el panel ([] si la base no responde). */
export async function obtenerNovedades(): Promise<Novedad[]> {
  try {
    return await novedadesPublicadas(await obtenerDb());
  } catch (e) {
    console.error('novedades: no se pudo leer la base de datos:', (e as Error).message);
    return [];
  }
}

// ── Catálogo agrupado por modelo (solo para mostrar en la web; el inventario no cambia) ──
export interface VarianteWeb { id: string; color: string | null; codigo: string | null; estado: EstadoStock; consulta: string }
export interface ModeloWeb {
  /** Id del primer producto del modelo (ancla estable de la tarjeta). */
  id: string;
  nombre: string;
  marca: string | null;
  categoria: string;
  categoriaId: string;
  subcategoria: string | null;
  imagen: ImagenProducto | null;
  /** Con stock si alguna variante tiene; sin stock si ninguna; si no, consultar. */
  estado: EstadoStock;
  variantes: VarianteWeb[];
  /** Producto cuya descripción se muestra en la ficha (la más completa del modelo), o null si no hay. */
  descripcionId: string | null;
  texto: string;
}
export interface CatalogoModelos {
  modelos: ModeloWeb[];
  categorias: CategoriaCatalogo[];
  totales: { total: number; conStock: number; sinStock: number };
  /** Cantidad de productos (variantes) detrás de los modelos. */
  productos: number;
  enVivo: boolean;
}

const estadoModelo = (estados: EstadoStock[]): EstadoStock =>
  estados.includes('con-stock') ? 'con-stock' : estados.every((e) => e === 'sin-stock') ? 'sin-stock' : 'sin-dato';

export async function obtenerCatalogoModelos(): Promise<CatalogoModelos> {
  const catalogo = await obtenerCatalogo();
  const modelos = agruparVariantes(catalogo.productos).map<ModeloWeb>(({ base, variantes }) => {
    // "CEL" es una abreviatura del sistema: en el nombre del modelo se muestra completo.
    const nombre = variantes.length > 1 ? capitalizar(base.replace(/^CEL\b/, 'CELULAR')) : variantes[0].nombre;
    const conImagen = variantes.find((v) => v.imagen && v.estado === 'con-stock') ?? variantes.find((v) => v.imagen);
    const conDesc = [...variantes].sort((a, b) => b.largoDescripcion - a.largoDescripcion)[0];
    const p0 = variantes[0];
    return {
      id: p0.id,
      nombre,
      marca: p0.marca,
      categoria: p0.categoria,
      categoriaId: p0.categoriaId,
      subcategoria: p0.subcategoria,
      imagen: conImagen?.imagen ?? null,
      estado: estadoModelo(variantes.map((v) => v.estado)),
      variantes: variantes.map((v) => ({
        id: v.id,
        color: v.color,
        codigo: v.codigo,
        estado: v.estado,
        consulta: consultaProducto(v.color ? `${nombre}, color ${v.color.toLowerCase()}` : nombre, v.codigo),
      })),
      descripcionId: conDesc.largoDescripcion > 0 ? conDesc.id : null,
      texto: [nombre, ...variantes.map((v) => `${v.nombre} ${v.color ?? ''} ${v.codigo ?? ''}`), p0.marca ?? '', p0.categoria, p0.subcategoria ?? ''].join(' ').toLowerCase(),
    };
  });
  const contar = (lista: ModeloWeb[], e: EstadoStock) => lista.filter((m) => m.estado === e).length;
  const categorias = catalogo.categorias.map((c) => {
    const lista = modelos.filter((m) => m.categoriaId === c.id);
    return { ...c, total: lista.length, conStock: contar(lista, 'con-stock'), sinStock: contar(lista, 'sin-stock') };
  });
  return {
    modelos,
    categorias,
    totales: { total: modelos.length, conStock: contar(modelos, 'con-stock'), sinStock: contar(modelos, 'sin-stock') },
    productos: catalogo.productos.length,
    enVivo: catalogo.enVivo,
  };
}

/** Descripción de un producto publicado del Bazar (para la ficha que se abre en la web). */
export async function descripcionProducto(id: string): Promise<string | null> {
  try {
    const db = await obtenerDb();
    const [fila] = await todas<{ descripcion: string | null }>(db, "SELECT descripcion FROM productos WHERE id = ? AND rubro_id = 'bazar' AND publicado = 1", [id]);
    if (fila) return fila.descripcion?.trim() || null;
  } catch (e) {
    console.error('descripción: no se pudo leer la base de datos:', (e as Error).message);
  }
  const p = bazarJson.productos.find((x) => x.id === id && !x.revisarPrecio);
  return p?.descripcion?.trim() || null;
}
