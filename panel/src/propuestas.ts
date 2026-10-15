// Cambios de productos propuestos por el asistente. NUNCA se aplican solos: el administrador los revisa
// en una tarjeta ("antes → después") y los confirma. Se validan con las mismas reglas que los
// formularios del panel y se aplican con control de versión: si alguien modificó el producto después
// de la propuesta, ese cambio no se aplica. Cada cambio aplicado queda en el registro.
import { registrar, type Actor } from './auditoria.ts';
import { ahora, ejecutar, todas, una, type Db } from './db.ts';
import * as P from './productos.ts';
import { tokenAleatorio } from './seguridad.ts';
import { validarProducto, type Campos } from './validacion.ts';

export const MAX_ITEMS = 50;
/** Cambios de stock por grupo (una categoría entera, una marca, una lista de códigos). */
export const MAX_GRUPO = 400;
const VIGENCIA_MIN = 15;

export interface Cambio { campo: string; antes: string; despues: string }
export interface ItemPropuesta { id: string; codigo: string | null; nombre: string; version: number; datos: P.DatosProducto; soloStock: boolean; cambios: Cambio[] }
export interface Propuesta { id: string; items: ItemPropuesta[]; errores: string[]; expira: string }
export interface ResultadoItem { codigo: string | null; nombre: string; ok: boolean; error?: string }

const CAMPOS = ['stock_estado', 'stock_cantidad', 'nombre', 'marca', 'descripcion', 'categoria_id', 'codigo'] as const;
const ETIQUETAS: Record<(typeof CAMPOS)[number], string> = {
  stock_estado: 'Stock', stock_cantidad: 'Cantidad', nombre: 'Nombre', marca: 'Marca', descripcion: 'Descripción', categoria_id: 'Categoría', codigo: 'Código interno COPOL',
};

/** Valida los cambios pedidos y guarda la propuesta pendiente (una por usuario: la nueva reemplaza a la anterior). */
export async function preparar(db: Db, usuarioId: number, pedidos: unknown): Promise<Propuesta> {
  const errores: string[] = [];
  const items: ItemPropuesta[] = [];
  const lista = Array.isArray(pedidos) ? pedidos.slice(0, MAX_ITEMS) : [];
  if (Array.isArray(pedidos) && pedidos.length > MAX_ITEMS) errores.push(`Se pueden proponer hasta ${MAX_ITEMS} productos por vez.`);
  // Todo el inventario en una sola consulta (en Turso cada consulta es un viaje por la red).
  const [listaCategorias, inventario] = await Promise.all([P.listarCategorias(db), P.buscarProductos(db, { porPagina: 100_000 })]);
  const categorias = new Map(listaCategorias.map((c) => [c.id, c.nombre]));
  const porCodigo = new Map(inventario.items.filter((p) => p.codigo).map((p) => [p.codigo!, p]));
  const vistos = new Set<string>();

  for (const bruto of lista) {
    const ped = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
    const codigo = typeof ped.codigo === 'string' || typeof ped.codigo === 'number' ? String(ped.codigo).trim() : '';
    if (!codigo) { errores.push('Falta el código interno COPOL de un producto.'); continue; }
    const p = porCodigo.get(codigo);
    if (!p) { errores.push(`No existe un producto con el código interno COPOL ${codigo}.`); continue; }
    if (vistos.has(p.id)) { errores.push(`El código ${codigo} aparece más de una vez.`); continue; }
    vistos.add(p.id);

    // Igual que en el formulario: al elegir con/sin stock se descarta una cantidad que ya no coincide.
    const estado = P.esEstado(ped.estado) ? ped.estado : null;
    const actualCant = p.stock_cantidad == null ? null : Number(p.stock_cantidad);
    const cantidad = ped.cantidad === null ? ''
      : ped.cantidad !== undefined ? String(ped.cantidad)
      : estado ? (actualCant != null && ((estado === 'con-stock' && actualCant > 0) || (estado === 'sin-stock' && actualCant === 0)) ? String(actualCant) : '')
      : actualCant == null ? '' : String(actualCant);
    const valor = (v: unknown, actual: string | null) => (v === undefined ? (actual ?? '') : v === null ? '' : String(v));
    const campos: Campos = {
      codigo: valor(ped.nuevo_codigo, p.codigo),
      nombre: valor(ped.nombre, p.nombre),
      marca: valor(ped.marca, p.marca),
      descripcion: valor(ped.descripcion, p.descripcion),
      categoria: valor(ped.categoria, p.categoria_id),
      estado: estado ?? p.stock_estado,
      cantidad,
    };
    const { datos, errores: e } = await validarProducto(campos, async (id) => categorias.has(id));
    if (datos.codigo && datos.codigo !== p.codigo) {
      const otro = porCodigo.get(datos.codigo);
      if (otro && otro.id !== p.id) e.codigo = 'Ya existe otro producto con ese código interno COPOL.';
    }
    if (Object.keys(e).length) { errores.push(`${p.nombre} (${codigo}): ${Object.values(e).join(' ')}`); continue; }

    const s = P.normalizarStock(datos.stock_estado, datos.stock_cantidad);
    const despues: P.DatosProducto = { ...datos, stock_estado: s.estado, stock_cantidad: s.cantidad };
    const mostrar = (campo: (typeof CAMPOS)[number], v: unknown) => {
      if (v == null || v === '') return '—';
      if (campo === 'stock_estado') return P.ESTADOS[v as P.EstadoStock];
      if (campo === 'categoria_id') return categorias.get(String(v)) ?? String(v);
      const t = String(v);
      return t.length > 140 ? `${t.slice(0, 140)}…` : t;
    };
    const antesDe = (k: (typeof CAMPOS)[number]) => (k === 'stock_cantidad' ? actualCant : (p[k] ?? null));
    const cambios = CAMPOS.filter((k) => antesDe(k) !== (despues[k] ?? null)).map((k) => ({ campo: ETIQUETAS[k], antes: mostrar(k, antesDe(k)), despues: mostrar(k, despues[k]) }));
    if (!cambios.length) { errores.push(`${p.nombre} (${codigo}) ya tiene esos datos: no hay nada que cambiar.`); continue; }
    items.push({ id: p.id, codigo: p.codigo, nombre: p.nombre, version: Number(p.version), datos: despues, soloStock: cambios.every((c) => c.campo === 'Stock' || c.campo === 'Cantidad'), cambios });
  }

  return guardar(db, usuarioId, items, errores);
}

/** Guarda la propuesta pendiente; la nueva reemplaza a la anterior del mismo usuario. */
async function guardar(db: Db, usuarioId: number, items: ItemPropuesta[], errores: string[]): Promise<Propuesta> {
  const expira = new Date(Date.now() + VIGENCIA_MIN * 60_000).toISOString();
  if (!items.length) return { id: '', items, errores, expira };
  const id = tokenAleatorio(12);
  await db.batch([
    { sql: "UPDATE propuestas SET estado = 'cancelada' WHERE usuario_id = ? AND estado = 'pendiente'", args: [usuarioId] },
    { sql: "INSERT INTO propuestas (id, usuario_id, creada_en, expira_en, estado, items) VALUES (?, ?, ?, ?, 'pendiente', ?)", args: [id, usuarioId, ahora(), expira, JSON.stringify(items)] },
  ], 'write');
  return { id, items, errores, expira };
}

export interface PedidoGrupo { categoria?: unknown; texto?: unknown; estado_actual?: unknown; codigos?: unknown; estado?: unknown; cantidad?: unknown }
export type PropuestaGrupo = Propuesta & { seleccionados: number; sinCambios: number };

/**
 * Cambio de stock para un grupo de productos: el servidor arma la lista según el filtro (categoría, texto
 * del nombre/marca/código, estado actual o lista de códigos), así el modelo no tiene que enumerarlos.
 * Solo toca estado y cantidad de stock; los productos que ya tienen ese stock se omiten.
 */
export async function prepararGrupo(db: Db, usuarioId: number, ped: PedidoGrupo): Promise<PropuestaGrupo> {
  const vacia = (errores: string[], seleccionados = 0, sinCambios = 0): PropuestaGrupo => ({ id: '', items: [], errores, expira: '', seleccionados, sinCambios });
  const texto = typeof ped.texto === 'string' ? ped.texto.trim().slice(0, 80) : '';
  const categoria = typeof ped.categoria === 'string' ? ped.categoria.trim() : '';
  const estadoActual = P.esEstado(ped.estado_actual) ? ped.estado_actual : '';
  const codigos = Array.isArray(ped.codigos) ? [...new Set(ped.codigos.map((c) => String(c ?? '').trim()).filter(Boolean))] : [];
  if (!P.esEstado(ped.estado)) return vacia(['Falta el estado de stock nuevo (con-stock, sin-stock o sin-dato).']);
  if (!texto && !categoria && !estadoActual && !codigos.length) return vacia(['Indicá qué productos cambiar: una categoría, un texto, el estado actual o una lista de códigos.']);
  let cantidad: number | null = null;
  if (ped.cantidad != null && ped.cantidad !== '') {
    cantidad = Number(ped.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 0 || cantidad > 100_000) return vacia(['La cantidad tiene que ser un número entero de 0 en adelante.']);
  }

  const errores: string[] = [];
  const categorias = await P.listarCategorias(db);
  if (categoria && !categorias.some((c) => c.id === categoria)) return vacia([`No existe la categoría "${categoria}".`]);
  let lista = (await P.buscarProductos(db, { q: texto, categoria, estado: estadoActual, porPagina: 100_000 })).items;
  if (codigos.length) {
    const pedidos = new Set(codigos);
    const encontrados = new Set(lista.filter((p) => p.codigo && pedidos.has(p.codigo)).map((p) => p.codigo!));
    lista = lista.filter((p) => p.codigo && pedidos.has(p.codigo));
    const faltan = codigos.filter((c) => !encontrados.has(c));
    if (faltan.length) errores.push(`No se encontraron (o no cumplen el filtro) ${faltan.length} código(s): ${faltan.slice(0, 15).join(', ')}${faltan.length > 15 ? '…' : ''}.`);
  }
  if (!lista.length) return vacia([...errores, 'Ningún producto coincide con ese filtro.']);
  if (lista.length > MAX_GRUPO) return vacia([`El filtro abarca ${lista.length} productos y el máximo por vez es ${MAX_GRUPO}. Dividilo (por ejemplo, por categoría).`], lista.length);

  const s = P.normalizarStock(ped.estado, cantidad);
  const muestra = (estado: P.EstadoStock) => P.ESTADOS[estado];
  const items: ItemPropuesta[] = [];
  let sinCambios = 0;
  for (const p of lista) {
    const actualCant = p.stock_cantidad == null ? null : Number(p.stock_cantidad);
    if (p.stock_estado === s.estado && actualCant === s.cantidad) { sinCambios++; continue; }
    const cambios: Cambio[] = [];
    if (p.stock_estado !== s.estado) cambios.push({ campo: ETIQUETAS.stock_estado, antes: muestra(p.stock_estado), despues: muestra(s.estado) });
    if (actualCant !== s.cantidad) cambios.push({ campo: ETIQUETAS.stock_cantidad, antes: actualCant == null ? '—' : String(actualCant), despues: s.cantidad == null ? '—' : String(s.cantidad) });
    items.push({
      id: p.id, codigo: p.codigo, nombre: p.nombre, version: Number(p.version), soloStock: true, cambios,
      datos: { codigo: p.codigo, nombre: p.nombre, descripcion: p.descripcion, categoria_id: p.categoria_id, marca: p.marca, stock_estado: s.estado, stock_cantidad: s.cantidad },
    });
  }
  if (!items.length) return vacia([...errores, `Los ${lista.length} productos del filtro ya tienen ese stock: no hay nada que cambiar.`], lista.length, sinCambios);
  return { ...(await guardar(db, usuarioId, items, errores)), seleccionados: lista.length, sinCambios };
}

type Fila = { id: string; usuario_id: number; expira_en: string; estado: string; items: string };
export type Aplicacion = { estado: 'ok'; resultados: ResultadoItem[] } | { estado: 'no-existe' | 'vencida' | 'usada' | 'sin-permiso' };

/** Aplica una propuesta pendiente del propio usuario (una sola vez). */
export async function aplicar(db: Db, propuestaId: string, actor: Actor & { id: number; usuario: string }, puedeEditarDatos: boolean): Promise<Aplicacion> {
  const prop = await una<Fila>(db, 'SELECT id, usuario_id, expira_en, estado, items FROM propuestas WHERE id = ? AND usuario_id = ?', [propuestaId, actor.id]);
  if (!prop) return { estado: 'no-existe' };
  if (prop.estado !== 'pendiente') return { estado: 'usada' };
  if (Date.parse(prop.expira_en) < Date.now()) {
    await ejecutar(db, "UPDATE propuestas SET estado = 'cancelada' WHERE id = ?", [prop.id]);
    return { estado: 'vencida' };
  }
  const items = JSON.parse(prop.items) as ItemPropuesta[];
  if (!puedeEditarDatos && items.some((i) => !i.soloStock)) return { estado: 'sin-permiso' };
  // Se marca como usada antes de aplicar: un doble clic no puede aplicarla dos veces.
  const tomada = await ejecutar(db, "UPDATE propuestas SET estado = 'aplicada' WHERE id = ? AND estado = 'pendiente'", [prop.id]);
  if (!tomada.cambios) return { estado: 'usada' };

  const porItem = new Map<ItemPropuesta, ResultadoItem>();
  for (const [i, r] of await aplicarStockEnLote(db, items.filter((x) => x.soloStock), actor)) porItem.set(i, r);
  for (const i of items.filter((x) => !x.soloStock)) {
    const res = await P.editarProducto(db, i.id, i.datos, null, actor.usuario, i.version);
    if ('error' in res) {
      porItem.set(i, { codigo: i.codigo, nombre: i.nombre, ok: false, error: ERRORES[res.error] });
      continue;
    }
    const cambios = P.diferencias(res.antes, res.despues);
    const accion = Object.keys(cambios).every((k) => k === 'stock_estado' || k === 'stock_cantidad') ? 'stock.cambio' : 'producto.edicion';
    await registrar(db, actor, accion, 'producto', i.id, { nombre: res.despues.nombre, codigo: res.despues.codigo, cambios, via: 'asistente' });
    porItem.set(i, { codigo: res.despues.codigo, nombre: res.despues.nombre, ok: true });
  }
  const resultados = items.map((i) => porItem.get(i)!);
  await ejecutar(db, 'UPDATE propuestas SET resultado = ? WHERE id = ?', [JSON.stringify(resultados), prop.id]);
  return { estado: 'ok', resultados };
}

const ERRORES = {
  conflicto: 'Alguien lo modificó después de la propuesta: no se cambió. Revisalo y pedilo de nuevo.',
  'no-existe': 'El producto ya no existe.',
  'no-persistido': 'No se pudo confirmar el guardado: no se cambió.',
} as const;

/**
 * Cambios de stock en lote: una lectura, todas las actualizaciones en una sola transacción (cada una con
 * su control de versión), una relectura para verificar lo guardado y el registro de cambios en otro lote.
 * Con Turso son 4 viajes por la red en lugar de 4 por producto.
 */
async function aplicarStockEnLote(db: Db, items: ItemPropuesta[], actor: Actor & { usuario: string }): Promise<[ItemPropuesta, ResultadoItem][]> {
  if (!items.length) return [];
  const leer = async () => {
    const filas = await todas<P.Producto>(db, `SELECT * FROM productos WHERE id IN (${items.map(() => '?').join(', ')})`, items.map((i) => i.id));
    return new Map(filas.map((f) => [f.id, f]));
  };
  const antes = await leer();
  const t = ahora();
  const fallo = (i: ItemPropuesta, error: keyof typeof ERRORES): ResultadoItem => ({ codigo: i.codigo, nombre: i.nombre, ok: false, error: ERRORES[error] });
  const salida = new Map<ItemPropuesta, ResultadoItem>();
  const aActualizar: ItemPropuesta[] = [];
  for (const i of items) {
    const a = antes.get(i.id);
    if (!a) salida.set(i, fallo(i, 'no-existe'));
    else if (Number(a.version) !== i.version) salida.set(i, fallo(i, 'conflicto'));
    else aActualizar.push(i);
  }
  const stock = (i: ItemPropuesta) => P.normalizarStock(i.datos.stock_estado, i.datos.stock_cantidad);
  const r = aActualizar.length
    ? await db.batch(aActualizar.map((i) => ({
      sql: 'UPDATE productos SET stock_estado = ?, stock_cantidad = ?, actualizado_en = ?, actualizado_por = ?, version = version + 1 WHERE id = ? AND version = ?',
      args: [stock(i).estado, stock(i).cantidad, t, actor.usuario, i.id, i.version],
    })), 'write')
    : [];
  const despues = await leer();
  const registros: { sql: string; args: (string | number | null)[] }[] = [];
  aActualizar.forEach((i, n) => {
    const d = despues.get(i.id);
    const s = stock(i);
    if (!r[n]?.rowsAffected) { salida.set(i, fallo(i, d ? 'conflicto' : 'no-existe')); return; }
    if (!d || d.stock_estado !== s.estado || (d.stock_cantidad == null ? null : Number(d.stock_cantidad)) !== s.cantidad) { salida.set(i, fallo(i, 'no-persistido')); return; }
    const cambios = P.diferencias(antes.get(i.id)!, d);
    registros.push({
      sql: 'INSERT INTO auditoria (fecha, usuario_id, usuario, accion, entidad, entidad_id, detalle, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [t, actor.id, actor.usuario, 'stock.cambio', 'producto', i.id, JSON.stringify({ nombre: d.nombre, codigo: d.codigo, cambios, via: 'asistente' }), actor.ip],
    });
    salida.set(i, { codigo: d.codigo, nombre: d.nombre, ok: true });
  });
  if (registros.length) await db.batch(registros, 'write');
  return items.map((i) => [i, salida.get(i)!]);
}

export async function cancelar(db: Db, propuestaId: string, usuarioId: number) {
  return (await ejecutar(db, "UPDATE propuestas SET estado = 'cancelada' WHERE id = ? AND usuario_id = ? AND estado = 'pendiente'", [propuestaId, usuarioId])).cambios > 0;
}
