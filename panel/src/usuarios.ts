// Acceso a usuarios y sesiones.
import { ahora, ejecutar, todas, una, type Db } from './db.ts';
import { hashClave, sha256, tokenAleatorio, type Rol } from './seguridad.ts';

export interface Usuario {
  id: number;
  usuario: string;
  nombre: string;
  rol: Rol;
  hash: string;
  debe_cambiar_clave: number;
  activo: number;
  protegido: number;
  intentos_fallidos: number;
  bloqueado_hasta: string | null;
  creado_en: string;
  creado_por: string | null;
  ultimo_acceso: string | null;
  /** Correo al que llega el código de verificación del ingreso. */
  correo: string | null;
}
export type UsuarioPublico = Omit<Usuario, 'hash'>;

const COLUMNAS_PUBLICAS = 'id, usuario, nombre, rol, debe_cambiar_clave, activo, protegido, intentos_fallidos, bloqueado_hasta, creado_en, creado_por, ultimo_acceso, correo';

export const buscarPorUsuario = (db: Db, usuario: string) => una<Usuario>(db, 'SELECT * FROM usuarios WHERE usuario = ?', [usuario]);
export const buscarPorId = (db: Db, id: number) => una<UsuarioPublico>(db, `SELECT ${COLUMNAS_PUBLICAS} FROM usuarios WHERE id = ?`, [id]);
export const listarUsuarios = (db: Db) => todas<UsuarioPublico>(db, `SELECT ${COLUMNAS_PUBLICAS} FROM usuarios ORDER BY protegido DESC, rol, usuario`);
export const contarAdminsActivos = async (db: Db) => Number((await una<{ n: number }>(db, "SELECT COUNT(*) n FROM usuarios WHERE rol = 'administrador' AND activo = 1"))?.n ?? 0);

export async function crearUsuario(db: Db, datos: { usuario: string; nombre?: string; rol: Rol; clave: string; debeCambiar: boolean; protegido?: boolean; creadoPor: string | null; correo?: string | null }) {
  const hash = await hashClave(datos.clave);
  const correo = datos.correo ?? (datos.usuario.includes('@') ? datos.usuario.toLowerCase() : null);
  const r = await ejecutar(db, 'INSERT INTO usuarios (usuario, nombre, rol, hash, debe_cambiar_clave, protegido, creado_en, creado_por, correo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    datos.usuario, datos.nombre || datos.usuario, datos.rol, hash, datos.debeCambiar ? 1 : 0, datos.protegido ? 1 : 0, ahora(), datos.creadoPor, correo,
  ]);
  return r.id!;
}

export const cambiarCorreo = (db: Db, id: number, correo: string | null) => ejecutar(db, 'UPDATE usuarios SET correo = ? WHERE id = ?', [correo, id]);

export async function cambiarClave(db: Db, id: number, clave: string, debeCambiar: boolean) {
  await ejecutar(db, 'UPDATE usuarios SET hash = ?, debe_cambiar_clave = ?, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?', [await hashClave(clave), debeCambiar ? 1 : 0, id]);
}

// ── Sesiones: el navegador guarda un token aleatorio; la base guarda solo su SHA-256. ──
export interface Sesion {
  id_hash: string;
  usuario_id: number;
  csrf: string;
  creada_en: string;
  expira_en: string;
  ultima_actividad: string;
}

export async function crearSesion(db: Db, usuarioId: number, horas: number, ip: string | null, agente: string | null, lugar: string | null = null) {
  const token = tokenAleatorio();
  const t = ahora();
  await ejecutar(db, 'INSERT INTO sesiones (id_hash, usuario_id, csrf, creada_en, expira_en, ultima_actividad, ip, agente, lugar) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
    sha256(token), usuarioId, tokenAleatorio(24), t, new Date(Date.now() + horas * 3600_000).toISOString(), t, ip, agente?.slice(0, 200) ?? null, lugar,
  ]);
  return token;
}

export async function leerSesion(db: Db, token: string, inactividadMin: number): Promise<{ sesion: Sesion; usuario: UsuarioPublico } | null> {
  const sesion = await una<Sesion>(db, 'SELECT * FROM sesiones WHERE id_hash = ?', [sha256(token)]);
  if (!sesion) return null;
  const t = Date.now();
  if (Date.parse(sesion.expira_en) < t || Date.parse(sesion.ultima_actividad) + inactividadMin * 60_000 < t) {
    await ejecutar(db, 'DELETE FROM sesiones WHERE id_hash = ?', [sesion.id_hash]);
    return null;
  }
  const usuario = await buscarPorId(db, Number(sesion.usuario_id));
  if (!usuario || !usuario.activo) return null;
  // La actividad se actualiza como máximo una vez por minuto.
  if (t - Date.parse(sesion.ultima_actividad) > 60_000) await ejecutar(db, 'UPDATE sesiones SET ultima_actividad = ? WHERE id_hash = ?', [ahora(), sesion.id_hash]);
  return { sesion, usuario };
}

export const cerrarSesion = (db: Db, token: string) => ejecutar(db, 'DELETE FROM sesiones WHERE id_hash = ?', [sha256(token)]);
export const cerrarSesionesDe = (db: Db, usuarioId: number, exceptoHash?: string) =>
  ejecutar(db, 'DELETE FROM sesiones WHERE usuario_id = ? AND id_hash != ?', [usuarioId, exceptoHash ?? '']);
export const purgarSesionesVencidas = (db: Db) => ejecutar(db, 'DELETE FROM sesiones WHERE expira_en < ?', [ahora()]);
