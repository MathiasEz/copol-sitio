// Historial de conversaciones con el asistente: cada usuario ve solo las suyas. Se guardan los mensajes,
// las tarjetas de cambios propuestos (con su estado) y qué cambios se aplicaron, para poder deshacerlos
// desde la respuesta correspondiente. Se conservan las últimas MAX_CONVERSACIONES de cada usuario.
import { ahora, ejecutar, todas, una, type Db } from './db.ts';
import { tokenAleatorio } from './seguridad.ts';

export const MAX_CONVERSACIONES = 60;
const MAX_MENSAJES = 120;

export interface TarjetaGuardada {
  id: string;
  expira: string;
  errores: string[];
  items: { codigo: string | null; nombre: string; cambios: { campo: string; antes: string; despues: string }[] }[];
  estado: 'pendiente' | 'aplicada' | 'cancelada' | 'reemplazada';
  /** Si es la vuelta atrás de otra propuesta aplicada: su id. */
  revierte?: string;
}
export interface MensajeGuardado {
  rol: 'usuario' | 'asistente';
  texto: string;
  fecha: string;
  propuesta?: TarjetaGuardada;
  /** Respuesta de "cambios aplicados": id de la propuesta que se puede deshacer con la flecha. */
  deshacer?: string;
  /** Esos cambios ya se deshicieron (se aplicó su vuelta atrás). */
  deshecho?: boolean;
}
export interface Conversacion { id: string; titulo: string; creada_en: string; actualizada_en: string; cambios: number; mensajes: MensajeGuardado[] }
export type ResumenConversacion = Omit<Conversacion, 'mensajes'>;

const titulo = (texto: string) => {
  const t = texto.replace(/\s+/g, ' ').trim();
  return t.length > 70 ? `${t.slice(0, 69)}…` : t;
};

export async function listar(db: Db, usuarioId: number, limite = MAX_CONVERSACIONES): Promise<ResumenConversacion[]> {
  return (await todas<ResumenConversacion>(db,
    'SELECT id, titulo, creada_en, actualizada_en, cambios FROM conversaciones WHERE usuario_id = ? ORDER BY actualizada_en DESC LIMIT ?', [usuarioId, limite]))
    .map((c) => ({ ...c, cambios: Number(c.cambios) }));
}

export async function obtener(db: Db, usuarioId: number, id: string): Promise<Conversacion | null> {
  if (!id) return null;
  const f = await una<ResumenConversacion & { mensajes: string }>(db,
    'SELECT id, titulo, creada_en, actualizada_en, cambios, mensajes FROM conversaciones WHERE id = ? AND usuario_id = ?', [id, usuarioId]);
  if (!f) return null;
  let mensajes: MensajeGuardado[] = [];
  try { mensajes = JSON.parse(f.mensajes); } catch { /* mensajes ilegibles: conversación vacía */ }
  return { ...f, cambios: Number(f.cambios), mensajes };
}

/**
 * Guarda la conversación (la crea si es nueva) y poda las más viejas del usuario. `cambiar` ajusta los
 * mensajes que ya estaban (estado de tarjetas) antes de agregar los nuevos.
 */
export async function guardar(db: Db, usuarioId: number, conv: Conversacion | null, nuevos: MensajeGuardado[], cambiar?: (m: MensajeGuardado[]) => void): Promise<Conversacion> {
  const t = ahora();
  const base: Conversacion = conv ?? {
    id: tokenAleatorio(12),
    titulo: titulo(nuevos.find((m) => m.rol === 'usuario')?.texto ?? 'Conversación'),
    creada_en: t, actualizada_en: t, cambios: 0, mensajes: [],
  };
  const previos = structuredClone(base.mensajes);
  cambiar?.(previos);
  const mensajes = [...previos, ...nuevos];
  const recortados = mensajes.slice(-MAX_MENSAJES);
  const cambios = recortados.filter((m) => m.deshacer).length;
  const final = { ...base, mensajes: recortados, actualizada_en: t, cambios };
  if (conv) {
    await ejecutar(db, 'UPDATE conversaciones SET mensajes = ?, actualizada_en = ?, cambios = ? WHERE id = ? AND usuario_id = ?',
      [JSON.stringify(recortados), t, cambios, conv.id, usuarioId]);
  } else {
    await db.batch([
      { sql: 'INSERT INTO conversaciones (id, usuario_id, titulo, creada_en, actualizada_en, cambios, mensajes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [final.id, usuarioId, final.titulo, t, t, cambios, JSON.stringify(recortados)] },
      { sql: `DELETE FROM conversaciones WHERE usuario_id = ? AND id NOT IN (SELECT id FROM conversaciones WHERE usuario_id = ? ORDER BY actualizada_en DESC LIMIT ${MAX_CONVERSACIONES})`,
        args: [usuarioId, usuarioId] },
    ], 'write');
  }
  return final;
}

export async function eliminar(db: Db, usuarioId: number, id: string) {
  return (await ejecutar(db, 'DELETE FROM conversaciones WHERE id = ? AND usuario_id = ?', [id, usuarioId])).cambios > 0;
}

/** Marca la tarjeta de una propuesta (y, si era una vuelta atrás aplicada, la respuesta original como deshecha). */
export function marcarPropuesta(mensajes: MensajeGuardado[], propuestaId: string, estado: TarjetaGuardada['estado']) {
  for (const m of mensajes) {
    if (m.propuesta?.id !== propuestaId) continue;
    m.propuesta.estado = estado;
    if (estado === 'aplicada' && m.propuesta.revierte) {
      for (const o of mensajes) if (o.deshacer === m.propuesta.revierte) o.deshecho = true;
    }
  }
}

/** Una tarjeta nueva deja sin efecto las pendientes anteriores (en el servidor, la nueva propuesta reemplaza a la anterior). */
export function reemplazarPendientes(mensajes: MensajeGuardado[]) {
  for (const m of mensajes) if (m.propuesta?.estado === 'pendiente') m.propuesta.estado = 'reemplazada';
}
