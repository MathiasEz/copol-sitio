// Registro de cambios relevantes (quién, qué, cuándo y desde dónde). Nunca guarda contraseñas.
import { ahora, ejecutar, todas, type Db } from './db.ts';

export interface Actor {
  id: number | null;
  usuario: string | null;
  ip: string | null;
}

export async function registrar(db: Db, actor: Actor, accion: string, entidad: string | null = null, entidadId: string | null = null, detalle: unknown = null) {
  await ejecutar(db, 'INSERT INTO auditoria (fecha, usuario_id, usuario, accion, entidad, entidad_id, detalle, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
    ahora(), actor.id, actor.usuario, accion, entidad, entidadId, detalle == null ? null : JSON.stringify(detalle), actor.ip,
  ]);
}

export interface Evento {
  id: number;
  fecha: string;
  usuario: string | null;
  accion: string;
  entidad: string | null;
  entidad_id: string | null;
  detalle: string | null;
  ip: string | null;
}

export function listarEventos(db: Db, { entidadId, limite = 100, desde = 0, sinSesiones = false }: { entidadId?: string; limite?: number; desde?: number; sinSesiones?: boolean } = {}) {
  const filtros = [entidadId ? 'entidad_id = ?' : null, sinSesiones ? "accion NOT LIKE 'sesion.%'" : null].filter(Boolean);
  return todas<Evento>(
    db,
    `SELECT id, fecha, usuario, accion, entidad, entidad_id, detalle, ip FROM auditoria ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...(entidadId ? [entidadId] : []), limite, desde],
  );
}

export const ACCIONES: Record<string, string> = {
  'sesion.ingreso': 'Ingresó al panel',
  'sesion.ingreso-fallido': 'Intento de ingreso fallido',
  'sesion.bloqueo': 'Cuenta bloqueada temporalmente',
  'sesion.salida': 'Cerró sesión',
  'clave.cambio': 'Cambió su contraseña',
  'stock.cambio': 'Cambió el stock',
  'producto.alta': 'Agregó un producto',
  'producto.edicion': 'Editó un producto',
  'producto.imagen': 'Cambió la imagen de un producto',
  'novedad.alta': 'Creó una novedad',
  'novedad.edicion': 'Editó una novedad',
  'novedad.publicacion': 'Publicó una novedad',
  'novedad.despublicacion': 'Despublicó una novedad',
  'novedad.orden': 'Reordenó las novedades',
  'novedad.baja': 'Eliminó una novedad',
  'usuario.alta': 'Creó un usuario',
  'usuario.edicion': 'Editó un usuario',
  'usuario.clave': 'Restableció la contraseña de un usuario',
  'usuario.baja': 'Eliminó un usuario',
  'sistema.siembra': 'Importó el catálogo inicial',
  'sistema.restauracion': 'Restauró un respaldo',
  'asistente.consulta': 'Consultó al asistente',
  'claude.conexion': 'Conectó Claude al panel',
  'claude.desconexion': 'Desconectó Claude del panel',
};
