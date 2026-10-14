// Servidor MCP del panel (Streamable HTTP, respuestas JSON) para usar el panel desde la app de Claude
// con la suscripción de la persona: Claude → conector → estas herramientas → la misma base del panel.
//
// Alcance deliberadamente chico: buscar y ver productos, resumen de stock, últimos cambios y CAMBIAR
// STOCK / CANTIDAD (uno o varios productos). No hay herramientas para precios, nombres, imágenes,
// novedades, usuarios ni código. Cada llamada usa el rol actual del usuario que autorizó la conexión
// (visualizador: solo consulta) y cada cambio queda en el Registro con "via": "claude".
import { ACCIONES, listarEventos, registrar, type Actor } from './auditoria.ts';
import { todas, type Db } from './db.ts';
import * as P from './productos.ts';
import { puede } from './seguridad.ts';
import type { UsuarioPublico } from './usuarios.ts';

export const VERSIONES = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_CAMBIOS = 50;
const TZ = 'America/Montevideo';
const fechaLocal = (iso: string) => new Date(iso).toLocaleString('es-UY', { dateStyle: 'short', timeStyle: 'short', timeZone: TZ });

const INSTRUCCIONES = `Panel de stock del Bazar de COPOL (Cooperativa Policial, Uruguay). Cada producto se identifica por su "código interno COPOL".
- Antes de cambiar stock, buscá los productos con buscar_productos y confirmá con la persona cuando un nombre coincida con varios.
- cambiar_stock acepta varios productos a la vez (hasta ${MAX_CAMBIOS}): estado "con-stock" o "sin-stock" y, si se conoce, la cantidad (0 = sin stock).
- No hay precios en el catálogo y este conector no puede cambiar nada más que el stock.
- Respondé en español rioplatense (voseo).`;

const HERRAMIENTAS = [
  {
    name: 'buscar_productos',
    title: 'Buscar productos',
    description: 'Busca productos del Bazar por código interno COPOL, nombre o marca, con filtros opcionales de categoría y estado de stock. Devuelve hasta 50 resultados.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Palabras del nombre, marca o código interno COPOL.' },
        categoria: { type: 'string', description: 'Id de categoría (ver listar_categorias).' },
        estado: { type: 'string', enum: ['con-stock', 'sin-stock', 'sin-dato'] },
        limite: { type: 'integer', minimum: 1, maximum: 50 },
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'ver_producto',
    title: 'Ver producto',
    description: 'Muestra un producto por su código interno COPOL: nombre, categoría, marca, estado de stock, cantidad y última actualización.',
    inputSchema: { type: 'object', properties: { codigo: { type: 'string' } }, required: ['codigo'] },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'listar_categorias',
    title: 'Categorías y resumen de stock',
    description: 'Categorías del Bazar con su id y la cantidad de productos con stock, sin stock y sin dato.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'ultimos_cambios',
    title: 'Últimos cambios',
    description: 'Últimos cambios registrados en el panel (stock, productos, novedades y usuarios), con fecha y usuario.',
    inputSchema: { type: 'object', properties: { limite: { type: 'integer', minimum: 1, maximum: 50 } } },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'cambiar_stock',
    title: 'Cambiar stock',
    description: `Cambia el stock de uno o varios productos (hasta ${MAX_CAMBIOS}) identificados por su código interno COPOL exacto. En cada uno indicá "estado" ("con-stock" o "sin-stock") y/o "cantidad" (unidades; 0 = sin stock; null = borrar la cantidad). Se guarda al instante y se ve en la web pública. Solo cambia stock y cantidad.`,
    inputSchema: {
      type: 'object',
      properties: {
        cambios: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_CAMBIOS,
          items: {
            type: 'object',
            properties: {
              codigo: { type: 'string', description: 'Código interno COPOL exacto.' },
              estado: { type: 'string', enum: ['con-stock', 'sin-stock'] },
              cantidad: { type: ['integer', 'null'], minimum: 0, maximum: 100000 },
            },
            required: ['codigo'],
          },
        },
      },
      required: ['cambios'],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

export interface ContextoMcp { db: Db; usuario: UsuarioPublico; actor: Actor }
type Resultado = { content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
const texto = (t: string, datos?: Record<string, unknown>, error = false): Resultado => ({ content: [{ type: 'text', text: t }], ...(datos ? { structuredContent: datos } : {}), ...(error ? { isError: true } : {}) });
const resumenProducto = (p: P.Producto) => ({
  codigo: p.codigo, nombre: p.nombre, categoria: p.categoria_nombre ?? p.categoria_id, marca: p.marca,
  estado: P.ESTADOS[p.stock_estado], cantidad: p.stock_cantidad, publicado: Boolean(Number(p.publicado)),
  actualizado: `${fechaLocal(p.actualizado_en)}${p.actualizado_por ? ` por ${p.actualizado_por}` : ''}`,
});
const linea = (p: ReturnType<typeof resumenProducto>) => `- ${p.codigo ?? 's/c'} · ${p.nombre} · ${p.estado}${p.cantidad != null ? ` (${p.cantidad} u.)` : ''}`;

async function llamar(nombre: string, a: Record<string, unknown>, x: ContextoMcp): Promise<Resultado> {
  const { db } = x;
  switch (nombre) {
    case 'buscar_productos': {
      const estado = P.esEstado(a.estado) ? a.estado : '';
      const limite = Math.min(50, Math.max(1, Number(a.limite) || 20));
      const r = await P.buscarProductos(db, { q: typeof a.texto === 'string' ? a.texto.slice(0, 80) : '', categoria: typeof a.categoria === 'string' ? a.categoria : '', estado, porPagina: limite });
      const productos = r.items.map(resumenProducto);
      return texto(`${r.total} producto(s) encontrados${r.total > productos.length ? `; se muestran ${productos.length}` : ''}.\n${productos.map(linea).join('\n')}`, { total: r.total, productos });
    }
    case 'ver_producto': {
      const codigo = typeof a.codigo === 'string' ? a.codigo.trim() : '';
      const ref = codigo ? await P.productoPorCodigo(db, codigo) : undefined;
      const p = ref ? await P.obtenerProducto(db, ref.id) : undefined;
      if (!p) return texto(`No existe un producto con el código interno COPOL ${codigo || '(vacío)'}.`, undefined, true);
      const r = resumenProducto(p);
      return texto(linea(r), { producto: r });
    }
    case 'listar_categorias': {
      const filas = await todas<{ id: string; nombre: string; total: number; con: number; sin: number; sd: number }>(db, `SELECT c.id, c.nombre, COUNT(p.id) total,
        SUM(p.stock_estado = 'con-stock') con, SUM(p.stock_estado = 'sin-stock') sin, SUM(p.stock_estado = 'sin-dato') sd
        FROM categorias c LEFT JOIN productos p ON p.rubro_id = c.rubro_id AND p.categoria_id = c.id WHERE c.rubro_id = ? GROUP BY c.id ORDER BY c.orden`, [P.RUBRO]);
      const categorias = filas.map((f) => ({ id: f.id, nombre: f.nombre, total: Number(f.total), conStock: Number(f.con) || 0, sinStock: Number(f.sin) || 0, sinDato: Number(f.sd) || 0 }));
      return texto(categorias.map((c) => `- ${c.nombre} (id ${c.id}): ${c.total} productos · ${c.conStock} con stock · ${c.sinStock} sin stock${c.sinDato ? ` · ${c.sinDato} sin dato` : ''}`).join('\n'), { categorias });
    }
    case 'ultimos_cambios': {
      const limite = Math.min(50, Math.max(1, Number(a.limite) || 20));
      const eventos = (await listarEventos(db, { limite, sinSesiones: true })).map((e) => ({ fecha: fechaLocal(e.fecha), usuario: e.usuario, accion: ACCIONES[e.accion] ?? e.accion, detalle: e.detalle?.slice(0, 400) ?? null }));
      return texto(eventos.map((e) => `- ${e.fecha} · ${e.usuario ?? 'sistema'} · ${e.accion}${e.detalle ? ` · ${e.detalle}` : ''}`).join('\n') || 'Sin cambios registrados.', { eventos });
    }
    case 'cambiar_stock': {
      if (!puede(x.usuario.rol, 'stock')) return texto('Tu usuario del panel solo puede consultar: no tiene permiso para cambiar stock.', undefined, true);
      const pedidos = Array.isArray(a.cambios) ? a.cambios : [];
      if (!pedidos.length || pedidos.length > MAX_CAMBIOS) return texto(`Indicá entre 1 y ${MAX_CAMBIOS} cambios.`, undefined, true);
      const resultados: { codigo: string; ok: boolean; nombre?: string; antes?: string; despues?: string; error?: string }[] = [];
      for (const bruto of pedidos) {
        const c = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>;
        const codigo = typeof c.codigo === 'string' || typeof c.codigo === 'number' ? String(c.codigo).trim() : '';
        const ref = codigo ? await P.productoPorCodigo(db, codigo) : undefined;
        const p = ref ? await P.obtenerProducto(db, ref.id) : undefined;
        if (!p) { resultados.push({ codigo, ok: false, error: 'No existe ese código interno COPOL.' }); continue; }
        const estadoPedido = c.estado === 'con-stock' || c.estado === 'sin-stock' ? c.estado : null;
        const hayCantidad = 'cantidad' in c;
        const cantidad = c.cantidad === null ? null : Number.isInteger(c.cantidad) && Number(c.cantidad) >= 0 && Number(c.cantidad) <= 100000 ? Number(c.cantidad) : undefined;
        if ((hayCantidad && cantidad === undefined) || (!estadoPedido && !hayCantidad)) {
          resultados.push({ codigo, ok: false, nombre: p.nombre, error: 'Indicá "estado" (con-stock / sin-stock) o una "cantidad" entera de 0 en adelante.' });
          continue;
        }
        // Igual que en el panel: al elegir con/sin stock se descarta una cantidad que ya no coincide.
        const actualCant = p.stock_cantidad == null ? null : Number(p.stock_cantidad);
        const nuevaCant = hayCantidad ? (cantidad as number | null)
          : estadoPedido && actualCant != null && ((estadoPedido === 'con-stock' && actualCant > 0) || (estadoPedido === 'sin-stock' && actualCant === 0)) ? actualCant : null;
        const res = await P.cambiarStock(db, p.id, estadoPedido ?? p.stock_estado, nuevaCant, x.usuario.usuario);
        if ('error' in res) { resultados.push({ codigo, ok: false, nombre: p.nombre, error: 'No se pudo confirmar el guardado; no se cambió.' }); continue; }
        const cambios = P.diferencias(res.antes, res.despues);
        if (Object.keys(cambios).length) await registrar(db, x.actor, 'stock.cambio', 'producto', p.id, { nombre: res.despues.nombre, codigo: res.despues.codigo, cambios, via: 'claude' });
        const desc = (q: P.Producto) => `${P.ESTADOS[q.stock_estado]}${q.stock_cantidad != null ? ` (${q.stock_cantidad} u.)` : ''}`;
        resultados.push({ codigo, ok: true, nombre: res.despues.nombre, antes: desc(res.antes), despues: desc(res.despues) });
      }
      const bien = resultados.filter((r) => r.ok).length;
      return texto(
        [`${bien} de ${resultados.length} cambios guardados y verificados (ya se ven en la web).`, ...resultados.map((r) => r.ok ? `✓ ${r.codigo} · ${r.nombre}: ${r.antes} → ${r.despues}` : `✗ ${r.codigo || '(sin código)'}${r.nombre ? ` · ${r.nombre}` : ''}: ${r.error}`)].join('\n'),
        { resultados },
        bien === 0,
      );
    }
    default:
      return texto(`Herramienta desconocida: ${nombre}`, undefined, true);
  }
}

type Mensaje = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const error = (id: Mensaje['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

async function atenderUno(m: Mensaje, x: ContextoMcp) {
  if (!m || typeof m !== 'object' || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return error(m?.id, -32600, 'Pedido JSON-RPC inválido.');
  const esNotificacion = !('id' in m) || m.id === undefined;
  if (esNotificacion) return null; // notifications/initialized, cancelled…
  switch (m.method) {
    case 'initialize': {
      const pedida = typeof m.params?.protocolVersion === 'string' ? m.params.protocolVersion : VERSIONES[0];
      return { jsonrpc: '2.0', id: m.id, result: { protocolVersion: VERSIONES.includes(pedida) ? pedida : VERSIONES[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'copol-panel-stock', title: 'Panel de stock COPOL', version: '1.0.0' }, instructions: INSTRUCCIONES } };
    }
    case 'ping':
      return { jsonrpc: '2.0', id: m.id, result: {} };
    case 'tools/list':
      return { jsonrpc: '2.0', id: m.id, result: { tools: HERRAMIENTAS } };
    case 'tools/call': {
      const nombre = typeof m.params?.name === 'string' ? m.params.name : '';
      if (!HERRAMIENTAS.some((h) => h.name === nombre)) return error(m.id, -32602, `Herramienta desconocida: ${nombre}`);
      const args = m.params?.arguments && typeof m.params.arguments === 'object' ? (m.params.arguments as Record<string, unknown>) : {};
      try {
        return { jsonrpc: '2.0', id: m.id, result: await llamar(nombre, args, x) };
      } catch (e) {
        console.error('mcp: error en herramienta', nombre, e);
        return { jsonrpc: '2.0', id: m.id, result: texto('Error interno al ejecutar la herramienta. No se aplicó ningún cambio pendiente.', undefined, true) };
      }
    }
    default:
      return error(m.id, -32601, `Método no soportado: ${m.method}`);
  }
}

/** Atiende un POST al endpoint MCP. Devuelve null cuando solo hubo notificaciones (HTTP 202). */
export async function atenderMcp(cuerpo: unknown, x: ContextoMcp) {
  if (Array.isArray(cuerpo)) {
    const r = (await Promise.all(cuerpo.slice(0, 20).map((m) => atenderUno(m as Mensaje, x)))).filter(Boolean);
    return r.length ? r : null;
  }
  return atenderUno(cuerpo as Mensaje, x);
}
