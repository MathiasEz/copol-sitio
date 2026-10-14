// Asistente del panel: responde preguntas sobre el sitio público, el inventario del Bazar y el uso del
// panel con Gemini 2.5 Flash (Google), a través de Vercel AI Gateway (https://ai-gateway.vercel.sh, API
// compatible con Anthropic Messages). Se eligió Gemini porque el crédito gratuito mensual de AI Gateway no
// habilita modelos de Claude (probado el 14/10/2026). En Vercel se autentica con el token OIDC del propio
// despliegue: no hay claves en el código ni en el repositorio. Las reglas que sigue el modelo están en
// instructivo-asistente.ts. Sus herramientas consultan; para modificar productos solo puede PROPONER
// cambios (propuestas.ts), que se aplican únicamente cuando la persona los confirma.
import { BASE } from './config.ts';
import { ACCIONES, listarEventos } from './auditoria.ts';
import { todas, type Db } from './db.ts';
import { listarNovedades, PLANTILLAS } from './novedades.ts';
import { buscarProductos, esEstado, ESTADOS, listarCategorias, RUBRO, type EstadoStock } from './productos.ts';
import { MAX_ITEMS, preparar, type Propuesta } from './propuestas.ts';
import { armarInstructivo } from './instructivo-asistente.ts';
import { puede, type Rol } from './seguridad.ts';

// Un solo modelo: Gemini 2.5 Flash (Flash-Lite respondió con errores en las pruebas con herramientas).
export const MODELOS = {
  rapido: { id: 'google/gemini-2.5-flash', nombre: 'Gemini 2.5 Flash' },
} as const;
export type Modelo = keyof typeof MODELOS;
export const esModelo = (m: unknown): m is Modelo => typeof m === 'string' && m in MODELOS;

export interface Mensaje { rol: 'usuario' | 'asistente'; texto: string }
export interface Resultado { texto: string; herramientas: string[]; tokens: { entrada: number; salida: number }; propuesta: Propuesta | null }

const GATEWAY = 'https://ai-gateway.vercel.sh/v1/messages';
const MAX_VUELTAS = 6;
const MAX_HISTORIAL = 12;
const MAX_TEXTO_PAGINA = 12_000;
const TZ = 'America/Montevideo';

/** Token para AI Gateway: clave explícita (opcional) o el token OIDC del despliegue de Vercel. */
export function tokenGateway(cabeceraOidc: string | undefined, env: NodeJS.ProcessEnv = process.env): string | null {
  return env.AI_GATEWAY_API_KEY || cabeceraOidc || env.VERCEL_OIDC_TOKEN || null;
}

export class ErrorAsistente extends Error {}

/** Limpia el historial recibido del navegador: roles válidos, textos acotados, termina en una pregunta. */
export function limpiarHistorial(entrada: unknown): Mensaje[] {
  if (!Array.isArray(entrada)) return [];
  const lista = entrada
    .filter((m): m is Mensaje => !!m && typeof m === 'object' && (m.rol === 'usuario' || m.rol === 'asistente') && typeof m.texto === 'string' && m.texto.trim() !== '')
    .map((m) => ({ rol: m.rol, texto: m.texto.trim().slice(0, m.rol === 'usuario' ? 1000 : 4000) }))
    .slice(-MAX_HISTORIAL);
  while (lista.length && lista[0].rol !== 'usuario') lista.shift();
  return lista.at(-1)?.rol === 'usuario' ? lista : [];
}

// ── Lectura de páginas del sitio público ──
// Nunca lee el panel (ni su dirección actual ni la anterior /panel).
const RUTA_VALIDA = { test: (p: string) => /^\/[a-z0-9\-/]*$/.test(p) && p !== BASE && !p.startsWith(`${BASE}/`) && !/^\/panel(\/|$)/.test(p) };
const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };
const decodificar = (s: string) => s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
  if (e.startsWith('#x')) return String.fromCodePoint(parseInt(e.slice(2), 16));
  if (e.startsWith('#') && e !== '#39') return String.fromCodePoint(Number(e.slice(1)));
  return ENTIDADES[e.toLowerCase()] ?? m;
});

/** Texto visible de una página (con los textos alternativos de las imágenes), sin encabezado ni pie. */
export function textoDePagina(html: string): string {
  const titulo = decodificar(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '').trim();
  let cuerpo = html.match(/<main[\s>][\s\S]*<\/main>/i)?.[0] ?? html;
  cuerpo = cuerpo
    .replace(/<(script|style|svg|noscript|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<img\b[^>]*?\balt="([^"]+)"[^>]*>/gi, ' [imagen: $1] ')
    .replace(/<a\b[^>]*?\bhref="([^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, t: string) => `${t} (${href})`)
    .replace(/<(br|\/p|\/li|\/h[1-6]|\/tr|\/div|\/section|\/article|\/figcaption|\/dt|\/dd)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const texto = decodificar(cuerpo).replace(/[ \t\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{2,}/g, '\n').trim();
  return `${titulo ? `Título: ${titulo}\n` : ''}${texto}`.slice(0, MAX_TEXTO_PAGINA);
}

const PAGINAS_RESPALDO = [
  '/', '/sobre-nosotros/', '/sobre-nosotros/nuestra-historia/', '/sobre-nosotros/locales/', '/beneficios/', '/beneficios/convenios/',
  '/beneficios/servicios-sociales/', '/hipermercado/', '/hipermercado/bazar/', '/hipermercado/promociones/', '/hipermercado/tienda/',
  '/hacete-socio/', '/acceso-web/', '/contacto/',
];
let cachePaginas: { hasta: number; rutas: string[] } | null = null;

async function rutasDelSitio(origen: string, pedir: typeof fetch): Promise<string[]> {
  if (cachePaginas && cachePaginas.hasta > Date.now()) return cachePaginas.rutas;
  let rutas = PAGINAS_RESPALDO;
  try {
    const res = await pedir(`${origen}/sitemap-0.xml`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const xml = await res.text();
      const encontradas = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname).filter((p) => RUTA_VALIDA.test(p));
      if (encontradas.length) rutas = encontradas;
    }
  } catch { /* se usa la lista de respaldo */ }
  cachePaginas = { hasta: Date.now() + 10 * 60_000, rutas };
  return rutas;
}

// ── Herramientas (solo lectura) ──
const HERRAMIENTAS = [
  {
    name: 'leer_pagina',
    description: 'Lee el texto visible de una página del sitio público de COPOL (títulos, textos, enlaces y textos alternativos de imágenes). Usala para preguntas sobre el contenido de la web. Para el stock del Bazar usá buscar_productos o resumen_stock, no esta herramienta.',
    input_schema: { type: 'object', properties: { ruta: { type: 'string', description: 'Ruta de la página, por ejemplo /sobre-nosotros/locales/' } }, required: ['ruta'] },
  },
  {
    name: 'buscar_productos',
    description: 'Busca productos del Bazar en el inventario vigente (el mismo que muestra la web). Devuelve el total y hasta 30 productos con código interno COPOL, nombre, marca, categoría, estado de stock y cantidad.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Palabras del nombre, marca o código interno COPOL. Vacío para no filtrar por texto.' },
        categoria: { type: 'string', description: 'Id de la categoría (ver la lista de categorías).' },
        estado: { type: 'string', enum: ['con-stock', 'sin-stock', 'sin-dato'] },
        limite: { type: 'integer', minimum: 1, maximum: 30 },
      },
    },
  },
  {
    name: 'resumen_stock',
    description: 'Totales del inventario del Bazar por categoría: productos con stock, sin stock y sin dato.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'ultimos_cambios',
    description: 'Últimos cambios hechos en el panel (stock, productos, novedades, usuarios), con fecha, usuario y detalle. No incluye ingresos al panel.',
    input_schema: { type: 'object', properties: { limite: { type: 'integer', minimum: 1, maximum: 50 } } },
  },
  {
    name: 'listar_novedades',
    description: 'Novedades de la portada del sitio: título, si está publicada, orden, plantilla y enlace.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'proponer_cambios',
    description: `Prepara cambios de productos del Bazar para que el administrador los revise y confirme en una tarjeta. NO aplica nada: los cambios se guardan recién cuando el administrador toca "Confirmar". Usá el código interno COPOL exacto de cada producto (buscalo antes con buscar_productos). Incluí solo los campos que cambian. Hasta ${MAX_ITEMS} productos por vez; cada llamada reemplaza la propuesta anterior, así que incluí todos los cambios juntos.`,
    input_schema: {
      type: 'object',
      properties: {
        cambios: {
          type: 'array',
          maxItems: MAX_ITEMS,
          items: {
            type: 'object',
            properties: {
              codigo: { type: 'string', description: 'Código interno COPOL actual del producto (exacto).' },
              estado: { type: 'string', enum: ['con-stock', 'sin-stock', 'sin-dato'], description: 'Estado de stock.' },
              cantidad: { type: ['integer', 'null'], minimum: 0, description: 'Unidades disponibles (0 = sin stock; null = borrar la cantidad).' },
              nombre: { type: 'string' },
              marca: { type: ['string', 'null'] },
              descripcion: { type: ['string', 'null'] },
              categoria: { type: 'string', description: 'Id de una categoría existente.' },
              nuevo_codigo: { type: 'string', description: 'Solo si hay que corregir el código interno COPOL.' },
            },
            required: ['codigo'],
          },
        },
      },
      required: ['cambios'],
    },
  },
] as const;

type Entrada = Record<string, unknown>;
const fechaLocal = (iso: string) => new Date(iso).toLocaleString('es-UY', { dateStyle: 'short', timeStyle: 'short', timeZone: TZ });

interface Contexto { db: Db; origen: string; pedir: typeof fetch; usuarioId: number; rol: Rol; propuesta: Propuesta | null }

/** Herramientas disponibles para el rol: sin permiso de stock no hay propuestas de cambios. */
const herramientasPara = (rol: Rol) => HERRAMIENTAS.filter((h) => h.name !== 'proponer_cambios' || puede(rol, 'stock'));

async function ejecutarHerramienta(nombre: string, entrada: Entrada, x: Contexto): Promise<unknown> {
  const { db, origen, pedir } = x;
  switch (nombre) {
    case 'proponer_cambios': {
      if (!puede(x.rol, 'stock')) return { error: 'Tu rol solo permite consultar: no podés proponer cambios.' };
      const p = await preparar(db, x.usuarioId, entrada.cambios);
      if (p.items.length) x.propuesta = p;
      return {
        estado: p.items.length ? 'PENDIENTE DE CONFIRMACIÓN: todavía no se aplicó nada. La persona tiene que revisar la tarjeta y tocar "Confirmar cambios".' : 'No hay cambios válidos para proponer.',
        propuestos: p.items.map((i) => ({ codigo: i.codigo, nombre: i.nombre, cambios: i.cambios.map((c) => `${c.campo}: ${c.antes} → ${c.despues}`) })),
        errores: p.errores,
      };
    }
    case 'leer_pagina': {
      const ruta = typeof entrada.ruta === 'string' ? entrada.ruta.trim() : '';
      if (!RUTA_VALIDA.test(ruta)) return { error: 'Ruta inválida. Usá una ruta del sitio público, por ejemplo /contacto/.' };
      const res = await pedir(`${origen}${ruta}`, { signal: AbortSignal.timeout(8000), headers: { accept: 'text/html' } });
      if (!res.ok) return { error: `La página respondió ${res.status}.` };
      return { ruta, texto: textoDePagina(await res.text()) };
    }
    case 'buscar_productos': {
      const estado = esEstado(entrada.estado) ? (entrada.estado as EstadoStock) : '';
      const limite = Math.min(30, Math.max(1, Number(entrada.limite) || 20));
      const r = await buscarProductos(db, { q: typeof entrada.texto === 'string' ? entrada.texto.slice(0, 80) : '', categoria: typeof entrada.categoria === 'string' ? entrada.categoria : '', estado, porPagina: limite });
      return {
        total: r.total,
        mostrados: r.items.length,
        productos: r.items.map((p) => ({ codigo: p.codigo, nombre: p.nombre, marca: p.marca, categoria: p.categoria_nombre, estado: ESTADOS[p.stock_estado], cantidad: p.stock_cantidad, publicado: Boolean(Number(p.publicado)), actualizado: `${fechaLocal(p.actualizado_en)}${p.actualizado_por ? ` por ${p.actualizado_por}` : ''}` })),
      };
    }
    case 'resumen_stock': {
      const filas = await todas<{ categoria: string; total: number; con: number; sin: number; sin_dato: number }>(db, `SELECT c.nombre categoria, COUNT(p.id) total,
        SUM(p.stock_estado = 'con-stock') con, SUM(p.stock_estado = 'sin-stock') sin, SUM(p.stock_estado = 'sin-dato') sin_dato
        FROM categorias c LEFT JOIN productos p ON p.rubro_id = c.rubro_id AND p.categoria_id = c.id WHERE c.rubro_id = ? GROUP BY c.id ORDER BY c.orden`, [RUBRO]);
      const n = (x: unknown) => Number(x) || 0;
      const porCategoria = filas.map((f) => ({ categoria: f.categoria, total: n(f.total), conStock: n(f.con), sinStock: n(f.sin), sinDato: n(f.sin_dato) }));
      const suma = (k: 'total' | 'conStock' | 'sinStock' | 'sinDato') => porCategoria.reduce((a, f) => a + f[k], 0);
      return { totales: { total: suma('total'), conStock: suma('conStock'), sinStock: suma('sinStock'), sinDato: suma('sinDato') }, porCategoria };
    }
    case 'ultimos_cambios': {
      const limite = Math.min(50, Math.max(1, Number(entrada.limite) || 20));
      // Sin permiso de registro (no administradores): solo cambios de stock y de productos.
      const visible = (accion: string) => !accion.startsWith('asistente.') && (puede(x.rol, 'auditoria') || accion.startsWith('stock.') || accion.startsWith('producto.'));
      const eventos = (await listarEventos(db, { limite: limite + 60, sinSesiones: true })).filter((e) => visible(e.accion)).slice(0, limite);
      return eventos.map((e) => ({ fecha: fechaLocal(e.fecha), usuario: e.usuario, accion: ACCIONES[e.accion] ?? e.accion, detalle: e.detalle ? e.detalle.slice(0, 600) : null }));
    }
    case 'listar_novedades':
      return (await listarNovedades(db)).map((n) => ({ titulo: n.titulo, publicada: Boolean(Number(n.publicado)), orden: n.orden, plantilla: PLANTILLAS[n.plantilla]?.nombre ?? n.plantilla, enlace: n.enlace_url }));
    default:
      return { error: `Herramienta desconocida: ${nombre}` };
  }
}

async function instrucciones(db: Db, origen: string, pedir: typeof fetch, rol: Rol): Promise<string> {
  const [paginas, categorias] = await Promise.all([rutasDelSitio(origen, pedir), listarCategorias(db)]);
  const hoy = new Date().toLocaleDateString('es-UY', { dateStyle: 'full', timeZone: TZ });
  return armarInstructivo({ rol, hoy, paginas, categorias });
}

/** Ejecuta una consulta: arma el contexto, deja que el modelo use las herramientas y devuelve la respuesta. */
export async function consultar(opciones: { historial: Mensaje[]; modelo: Modelo; db: Db; origen: string; token: string; usuarioId: number; rol: Rol; fetch?: typeof fetch }): Promise<Resultado> {
  const pedir = opciones.fetch ?? fetch;
  const x: Contexto = { db: opciones.db, origen: opciones.origen, pedir, usuarioId: opciones.usuarioId, rol: opciones.rol, propuesta: null };
  const system = await instrucciones(opciones.db, opciones.origen, pedir, opciones.rol);
  const mensajes: { role: 'user' | 'assistant'; content: unknown }[] = opciones.historial.map((m) => ({ role: m.rol === 'usuario' ? 'user' : 'assistant', content: m.texto }));
  const usadas: string[] = [];
  const tokens = { entrada: 0, salida: 0 };

  const inicio = Date.now();
  // El crédito gratuito de AI Gateway admite pocos pedidos por minuto: ante un 429 se espera lo que indica
  // el servicio y se reintenta, mientras quede tiempo dentro del límite de la función (60 s).
  const pedirModelo = async () => {
    for (let intento = 0; ; intento++) {
      const res = await pedir(GATEWAY, {
        method: 'POST',
        headers: { authorization: `Bearer ${opciones.token}`, 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: MODELOS[opciones.modelo].id, max_tokens: 4000, temperature: 0.2, system, messages: mensajes, tools: herramientasPara(opciones.rol) }),
        signal: AbortSignal.timeout(25_000),
      });
      if (res.status !== 429 || intento >= 3) return res;
      const detalle = await res.clone().text().catch(() => '');
      const segundos = Number(res.headers.get('retry-after')) || Number(detalle.match(/retry after (\d+)\s*s/i)?.[1]) || 12;
      const espera = Math.min(Math.max(segundos, 2), 25) * 1000;
      if (Date.now() - inicio + espera > 45_000) return res;
      await new Promise((ok) => setTimeout(ok, espera));
    }
  };

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const res = await pedirModelo();
    if (!res.ok) {
      const detalle = (await res.text().catch(() => '')).slice(0, 300);
      console.error(`asistente: AI Gateway respondió ${res.status}: ${detalle}`);
      throw new ErrorAsistente(
        detalle.includes('customer_verification_required') ? 'Vercel AI Gateway todavía no está habilitado: hay que registrar una tarjeta en la cuenta de Vercel (Vercel → AI Gateway) para activar el crédito gratuito mensual.'
        : res.status === 401 || res.status === 403 ? 'El asistente no tiene acceso a Vercel AI Gateway. Revisá que AI Gateway esté habilitado en el proyecto de Vercel.'
        : res.status === 402 || detalle.includes('insufficient') ? 'Se agotó el crédito de Vercel AI Gateway de este mes. Se renueva el mes próximo (o se puede recargar en Vercel → AI Gateway).'
        : res.status === 429 ? 'El plan gratuito de IA admite pocas consultas por minuto y ahora está ocupado. Esperá un minuto y probá de nuevo.'
        : 'El servicio de IA no respondió. Probá de nuevo en un momento.',
      );
    }
    const datos = (await res.json()) as { content: { type: string; text?: string; id?: string; name?: string; input?: Entrada }[]; stop_reason: string; usage?: { input_tokens?: number; output_tokens?: number } };
    tokens.entrada += datos.usage?.input_tokens ?? 0;
    tokens.salida += datos.usage?.output_tokens ?? 0;
    const pedidos = datos.content.filter((b) => b.type === 'tool_use');
    if (datos.stop_reason !== 'tool_use' || !pedidos.length) {
      const texto = datos.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\n').trim();
      return { texto: texto || 'No encontré una respuesta. Probá reformular la pregunta.', herramientas: usadas, tokens, propuesta: x.propuesta };
    }
    mensajes.push({ role: 'assistant', content: datos.content });
    const resultados = [];
    for (const p of pedidos) {
      usadas.push(p.name ?? '?');
      let salida: unknown;
      try {
        salida = await ejecutarHerramienta(p.name ?? '', p.input ?? {}, x);
      } catch (e) {
        salida = { error: `No se pudo consultar: ${(e as Error).message}` };
      }
      resultados.push({ type: 'tool_result', tool_use_id: p.id, content: JSON.stringify(salida) });
    }
    mensajes.push({ role: 'user', content: resultados });
  }
  return { texto: 'La consulta necesitó demasiados pasos. Probá con una pregunta más concreta.', herramientas: usadas, tokens, propuesta: x.propuesta };
}
