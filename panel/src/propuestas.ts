// Cambios de productos propuestos por el asistente. NUNCA se aplican solos: el administrador los revisa
// en una tarjeta ("antes → después") y los confirma. Se validan con las mismas reglas que los
// formularios del panel y se aplican con control de versión: si alguien modificó el producto después
// de la propuesta, ese cambio no se aplica. Cada cambio aplicado queda en el registro.
import { registrar, type Actor } from './auditoria.ts';
import { ahora, ejecutar, una, type Db } from './db.ts';
import * as P from './productos.ts';
import { tokenAleatorio } from './seguridad.ts';
import { validarProducto, type Campos } from './validacion.ts';

export const MAX_ITEMS = 50;
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
  const categorias = new Map((await P.listarCategorias(db)).map((c) => [c.id, c.nombre]));
  const vistos = new Set<string>();

  for (const bruto of lista) {
    const ped = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
    const codigo = typeof ped.codigo === 'string' || typeof ped.codigo === 'number' ? String(ped.codigo).trim() : '';
    if (!codigo) { errores.push('Falta el código interno COPOL de un producto.'); continue; }
    const ref = await P.productoPorCodigo(db, codigo);
    const p = ref ? await P.obtenerProducto(db, ref.id) : undefined;
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
      const otro = await P.productoPorCodigo(db, datos.codigo);
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

  const expira = new Date(Date.now() + VIGENCIA_MIN * 60_000).toISOString();
  if (!items.length) return { id: '', items, errores, expira };
  const id = tokenAleatorio(12);
  await ejecutar(db, "UPDATE propuestas SET estado = 'cancelada' WHERE usuario_id = ? AND estado = 'pendiente'", [usuarioId]);
  await ejecutar(db, "INSERT INTO propuestas (id, usuario_id, creada_en, expira_en, estado, items) VALUES (?, ?, ?, ?, 'pendiente', ?)", [id, usuarioId, ahora(), expira, JSON.stringify(items)]);
  return { id, items, errores, expira };
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

  const resultados: ResultadoItem[] = [];
  for (const i of items) {
    const res = i.soloStock
      ? await P.cambiarStock(db, i.id, i.datos.stock_estado, i.datos.stock_cantidad, actor.usuario, i.version)
      : await P.editarProducto(db, i.id, i.datos, null, actor.usuario, i.version);
    if ('error' in res) {
      resultados.push({
        codigo: i.codigo, nombre: i.nombre, ok: false,
        error: res.error === 'conflicto' ? 'Alguien lo modificó después de la propuesta: no se cambió. Revisalo y pedilo de nuevo.'
          : res.error === 'no-existe' ? 'El producto ya no existe.'
          : 'No se pudo confirmar el guardado: no se cambió.',
      });
      continue;
    }
    const cambios = P.diferencias(res.antes, res.despues);
    const accion = Object.keys(cambios).every((k) => k === 'stock_estado' || k === 'stock_cantidad') ? 'stock.cambio' : 'producto.edicion';
    await registrar(db, actor, accion, 'producto', i.id, { nombre: res.despues.nombre, codigo: res.despues.codigo, cambios, via: 'asistente' });
    resultados.push({ codigo: res.despues.codigo, nombre: res.despues.nombre, ok: true });
  }
  await ejecutar(db, 'UPDATE propuestas SET resultado = ? WHERE id = ?', [JSON.stringify(resultados), prop.id]);
  return { estado: 'ok', resultados };
}

export async function cancelar(db: Db, propuestaId: string, usuarioId: number) {
  return (await ejecutar(db, "UPDATE propuestas SET estado = 'cancelada' WHERE id = ? AND usuario_id = ? AND estado = 'pendiente'", [propuestaId, usuarioId])).cambios > 0;
}
