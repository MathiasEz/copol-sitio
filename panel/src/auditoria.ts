// Registro de cambios relevantes (quién, qué, cuándo y desde dónde). Nunca guarda contraseñas.
import { ahora, ejecutar, todas, type Db } from './db.ts';
import { renovarWebPublica } from './web-publica.ts';

export interface Actor {
  id: number | null;
  usuario: string | null;
  ip: string | null;
}

export async function registrar(db: Db, actor: Actor, accion: string, entidad: string | null = null, entidadId: string | null = null, detalle: unknown = null) {
  await ejecutar(db, 'INSERT INTO auditoria (fecha, usuario_id, usuario, accion, entidad, entidad_id, detalle, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
    ahora(), actor.id, actor.usuario, accion, entidad, entidadId, detalle == null ? null : JSON.stringify(detalle), actor.ip,
  ]);
  // Todo cambio visible en la web pasa por el registro: es el punto único para renovar la caché de la CDN.
  await renovarWebPublica(accion);
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

/** Historial de accesos: ingresos, intentos fallidos, PIN, códigos y equipos recordados. */
export function listarAccesos(db: Db, { usuario, limite = 50, desde = 0 }: { usuario?: string; limite?: number; desde?: number } = {}) {
  return todas<Evento>(
    db,
    `SELECT id, fecha, usuario, accion, entidad, entidad_id, detalle, ip FROM auditoria WHERE (accion LIKE 'sesion.%' OR accion LIKE 'acceso.%')${usuario ? ' AND usuario = ?' : ''} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...(usuario ? [usuario] : []), limite, desde],
  );
}

export const ACCIONES: Record<string, string> = {
  'sesion.ingreso': 'Ingresó al panel',
  'sesion.ingreso-fallido': 'Intento de ingreso fallido',
  'sesion.bloqueo': 'Cuenta bloqueada temporalmente',
  'sesion.salida': 'Cerró sesión',
  'acceso.pin': 'Ingresó el PIN correcto',
  'acceso.pin-fallido': 'PIN incorrecto',
  'acceso.pin-bloqueo': 'PIN bloqueado por intentos',
  'acceso.pin-creado': 'Creó el PIN de acceso',
  'acceso.pin-cambio': 'Cambió el PIN de acceso',
  'acceso.codigo-enviado': 'Se envió el código por correo',
  'acceso.codigo-fallido': 'Código por correo incorrecto',
  'acceso.correo-incorrecto': 'Escribió un correo que no es el de la cuenta',
  'acceso.sin-correo': 'Intentó ingresar sin correo asignado',
  'acceso.equipo-recordado': 'Recordó este equipo por 30 días',
  'acceso.equipo-olvidado': 'Un administrador olvidó un equipo recordado',
  'acceso.sesion-cerrada': 'Un administrador cerró una sesión',
  'usuario.correo': 'Cambió su correo de verificación',
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
  'banner.alta': 'Agregó una diapositiva al banner de Inicio',
  'banner.edicion': 'Editó una diapositiva del banner de Inicio',
  'banner.publicacion': 'Publicó una diapositiva del banner de Inicio',
  'banner.despublicacion': 'Despublicó una diapositiva del banner de Inicio',
  'banner.orden': 'Reordenó el banner de Inicio',
  'banner.baja': 'Eliminó una diapositiva del banner de Inicio',
  'banner.ajustes': 'Cambió el tiempo del banner de Inicio',
  'ofertas.piezas': 'Agregó piezas a las ofertas del supermercado',
  'ofertas.edicion': 'Editó las ofertas del supermercado',
  'ofertas.vaciado': 'Quitó todas las ofertas del supermercado',
  'creditos.alta': 'Agregó una fecha de apertura de créditos',
  'creditos.edicion': 'Cambió una fecha de apertura de créditos',
  'creditos.baja': 'Quitó una fecha de apertura de créditos',
  'empleados.edicion': 'Editó la información para empleados',
  'notificacion.alta': 'Programó una notificación de la app',
  'notificacion.edicion': 'Editó una notificación de la app',
  'notificacion.envio': 'Envió una notificación de la app al instante',
  'notificacion.cancelacion': 'Canceló una notificación de la app',
  'notificacion.baja': 'Eliminó una notificación de la app',
  'notificacion.ajustes': 'Cambió los ajustes de notificaciones',
  'notificacion.automatica': 'Se generó una notificación automática',
  'producto.retiro': 'Retiró un producto de la web (repetido)',
  'usuario.alta': 'Creó un usuario',
  'usuario.edicion': 'Editó un usuario',
  'usuario.clave': 'Restableció la contraseña de un usuario',
  'usuario.baja': 'Eliminó un usuario',
  'sistema.siembra': 'Importó el catálogo inicial',
  'sistema.respaldo': 'Respaldo diario automático (cifrado)',
  'sistema.restauracion': 'Restauró un respaldo',
  'asistente.consulta': 'Consultó al asistente',
  'registro.alta': 'Cargó un registro',
  'registro.vaciar': 'Vació la planilla de prueba de registros',
  'registro.asistente': 'Consultó al asistente de registros',
  'claude.conexion': 'Conectó Claude al panel',
  'claude.desconexion': 'Desconectó Claude del panel',
};
