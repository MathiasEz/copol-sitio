// Acceso a productos y categorías del Bazar.
import { ahora, ejecutar, todas, una, type Db } from './db.ts';

export const RUBRO = 'bazar';
export type EstadoStock = 'con-stock' | 'sin-stock' | 'sin-dato';
export const ESTADOS: Record<EstadoStock, string> = { 'con-stock': 'Con stock', 'sin-stock': 'Sin stock', 'sin-dato': 'Sin dato' };
export const esEstado = (e: unknown): e is EstadoStock => typeof e === 'string' && e in ESTADOS;

export interface Producto {
  id: string;
  rubro_id: string;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  categoria_id: string;
  categoria_nombre?: string;
  subcategoria: string | null;
  marca: string | null;
  /** "bazar/<id>.webp" (imagen importada, servida por el sitio) o URL absoluta de la imagen subida (variante de 800 px). */
  imagen: string | null;
  imagen_publicable: number;
  stock_estado: EstadoStock;
  stock_cantidad: number | null;
  publicado: number;
  origen: 'importado' | 'panel';
  origen_url: string | null;
  consulta_origen: string | null;
  orden: number;
  creado_en: string;
  actualizado_en: string;
  actualizado_por: string | null;
  version: number;
}

export interface Categoria { rubro_id: string; id: string; nombre: string; orden: number; total?: number }

/** Miniatura (≈ 240–400 px) de un producto para el panel y el sitio. */
export function miniatura(imagen: string | null): string | null {
  if (!imagen) return null;
  if (/^https?:\/\//.test(imagen) || imagen.startsWith('/')) return imagen.replace(/-800\.webp$/, '-400.webp');
  return `/catalogo/${imagen.replace(/\.webp$/, '')}-240.webp`;
}

export const listarCategorias = (db: Db) =>
  todas<Categoria>(db, 'SELECT c.*, (SELECT COUNT(*) FROM productos p WHERE p.rubro_id = c.rubro_id AND p.categoria_id = c.id) total FROM categorias c WHERE c.rubro_id = ? ORDER BY c.orden, c.nombre', [RUBRO]);
export const existeCategoria = async (db: Db, id: string) => Boolean(await una(db, 'SELECT 1 FROM categorias WHERE rubro_id = ? AND id = ?', [RUBRO, id]));

export interface Filtro { q?: string; categoria?: string; estado?: EstadoStock | ''; pagina?: number; porPagina?: number }
const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Búsqueda por código interno, nombre, marca o categoría (sin distinguir tildes ni mayúsculas). */
export async function buscarProductos(db: Db, f: Filtro) {
  const donde = ['p.rubro_id = ?'];
  const args: (string | number)[] = [RUBRO];
  if (f.categoria) { donde.push('p.categoria_id = ?'); args.push(f.categoria); }
  if (f.estado) { donde.push('p.stock_estado = ?'); args.push(f.estado); }
  let items = await todas<Producto>(db, `SELECT p.*, c.nombre categoria_nombre FROM productos p JOIN categorias c ON c.rubro_id = p.rubro_id AND c.id = p.categoria_id WHERE ${donde.join(' AND ')} ORDER BY c.orden, p.orden, p.nombre`, args);
  const terminos = normalizar(f.q ?? '').split(/\s+/).filter(Boolean);
  if (terminos.length) {
    items = items.filter((p) => {
      const texto = normalizar(`${p.codigo ?? ''} ${p.nombre} ${p.marca ?? ''} ${p.categoria_nombre ?? ''} ${p.subcategoria ?? ''}`);
      return terminos.every((t) => texto.includes(t));
    });
  }
  const porPagina = f.porPagina ?? 50;
  const paginas = Math.max(1, Math.ceil(items.length / porPagina));
  const pagina = Math.min(Math.max(1, f.pagina ?? 1), paginas);
  return { items: items.slice((pagina - 1) * porPagina, pagina * porPagina), total: items.length, pagina, paginas };
}

export const obtenerProducto = (db: Db, id: string) =>
  una<Producto>(db, 'SELECT p.*, c.nombre categoria_nombre FROM productos p JOIN categorias c ON c.rubro_id = p.rubro_id AND c.id = p.categoria_id WHERE p.id = ?', [id]);
export const productoPorCodigo = (db: Db, codigo: string) => una<{ id: string }>(db, 'SELECT id FROM productos WHERE rubro_id = ? AND codigo = ?', [RUBRO, codigo]);

export async function resumenStock(db: Db) {
  const filas = await todas<{ e: EstadoStock; n: number }>(db, 'SELECT stock_estado e, COUNT(*) n FROM productos WHERE rubro_id = ? GROUP BY stock_estado', [RUBRO]);
  const r = { total: 0, 'con-stock': 0, 'sin-stock': 0, 'sin-dato': 0 };
  for (const f of filas) { r[f.e] = Number(f.n); r.total += Number(f.n); }
  return r;
}

/**
 * Regla de stock: si se informa una cantidad, el estado se deriva de ella (0 → sin stock).
 * Si la cantidad se desconoce (null), vale el estado sí/no elegido.
 */
export function normalizarStock(estado: EstadoStock, cantidad: number | null): { estado: EstadoStock; cantidad: number | null } {
  if (cantidad != null) return { estado: cantidad > 0 ? 'con-stock' : 'sin-stock', cantidad };
  return { estado, cantidad: null };
}

type Resultado = { error: 'no-existe' } | { error: 'conflicto'; actual: Producto } | { error: 'no-persistido' } | { antes: Producto; despues: Producto };

/**
 * Actualización con control de versión en una sola sentencia (sin transacciones interactivas, que no
 * todas las conexiones remotas admiten) y verificación posterior: se vuelve a leer la fila y solo se
 * informa éxito si la base devuelve exactamente lo guardado.
 */
async function actualizarVerificado(db: Db, id: string, sets: string, args: unknown[], esperado: Partial<Producto>, por: string, versionEsperada?: number): Promise<Resultado> {
  const antes = await obtenerProducto(db, id);
  if (!antes) return { error: 'no-existe' };
  if (versionEsperada != null && Number(antes.version) !== versionEsperada) return { error: 'conflicto', actual: antes };
  const r = await ejecutar(db, `UPDATE productos SET ${sets}, actualizado_en = ?, actualizado_por = ?, version = version + 1 WHERE id = ? AND version = ?`, [
    ...(args as (string | number | null)[]), ahora(), por, id, Number(antes.version),
  ]);
  const despues = await obtenerProducto(db, id);
  if (!r.cambios) return despues ? { error: 'conflicto', actual: despues } : { error: 'no-existe' };
  if (!despues || Object.entries(esperado).some(([k, v]) => despues[k as keyof Producto] !== v)) return { error: 'no-persistido' };
  return { antes, despues };
}

export function cambiarStock(db: Db, id: string, estado: EstadoStock, cantidad: number | null, por: string, versionEsperada?: number) {
  const s = normalizarStock(estado, cantidad);
  return actualizarVerificado(db, id, 'stock_estado = ?, stock_cantidad = ?', [s.estado, s.cantidad], { stock_estado: s.estado, stock_cantidad: s.cantidad }, por, versionEsperada);
}

export interface DatosProducto {
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  categoria_id: string;
  marca: string | null;
  stock_estado: EstadoStock;
  stock_cantidad: number | null;
}

export async function crearProducto(db: Db, id: string, d: DatosProducto, imagen: string | null, por: string) {
  const s = normalizarStock(d.stock_estado, d.stock_cantidad);
  const t = ahora();
  const orden = Number((await una<{ o: number }>(db, 'SELECT COALESCE(MAX(orden), 0) + 1 o FROM productos WHERE rubro_id = ? AND categoria_id = ?', [RUBRO, d.categoria_id]))?.o ?? 1);
  await ejecutar(db, `INSERT INTO productos (id, rubro_id, codigo, nombre, descripcion, categoria_id, marca, imagen, stock_estado, stock_cantidad, origen, orden, creado_en, actualizado_en, actualizado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'panel', ?, ?, ?, ?)`, [id, RUBRO, d.codigo, d.nombre, d.descripcion, d.categoria_id, d.marca, imagen, s.estado, s.cantidad, orden, t, t, por]);
  return (await obtenerProducto(db, id))!;
}

export function editarProducto(db: Db, id: string, d: DatosProducto, imagen: string | null, por: string, versionEsperada?: number) {
  const s = normalizarStock(d.stock_estado, d.stock_cantidad);
  const conImagen = imagen ? ', imagen = ?, imagen_publicable = 1' : '';
  const esperado: Partial<Producto> = { nombre: d.nombre, codigo: d.codigo, categoria_id: d.categoria_id, stock_estado: s.estado, stock_cantidad: s.cantidad, ...(imagen ? { imagen } : {}) };
  return actualizarVerificado(
    db, id,
    `codigo = ?, nombre = ?, descripcion = ?, categoria_id = ?, marca = ?, stock_estado = ?, stock_cantidad = ?${conImagen}`,
    [d.codigo, d.nombre, d.descripcion, d.categoria_id, d.marca, s.estado, s.cantidad, ...(imagen ? [imagen] : [])],
    esperado, por, versionEsperada,
  );
}

/** Diferencias legibles entre dos versiones de un producto (para el registro de cambios). */
export function diferencias(antes: Producto, despues: Producto) {
  const campos = ['codigo', 'nombre', 'descripcion', 'categoria_id', 'marca', 'stock_estado', 'stock_cantidad', 'imagen'] as const;
  const d: Record<string, [unknown, unknown]> = {};
  for (const c of campos) if (antes[c] !== despues[c]) d[c] = [antes[c], despues[c]];
  return d;
}
