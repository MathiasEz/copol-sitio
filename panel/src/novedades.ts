// Novedades de la portada: se crean y ordenan en el panel; el sitio muestra solo las publicadas.
import { ahora, ejecutar, todas, una, type Db } from './db.ts';
import { hoyUruguay } from './fechas.ts';

export type Plantilla = 'imagen-izquierda' | 'imagen-completa' | 'texto';
export const PLANTILLAS: Record<Plantilla, { nombre: string; requiereImagen: boolean }> = {
  'imagen-izquierda': { nombre: 'Imagen a la izquierda y texto a la derecha', requiereImagen: true },
  'imagen-completa': { nombre: 'Imagen completa', requiereImagen: true },
  texto: { nombre: 'Título y texto', requiereImagen: false },
};
export const esPlantilla = (p: unknown): p is Plantilla => typeof p === 'string' && p in PLANTILLAS;

export interface Novedad {
  id: number;
  titulo: string;
  texto: string | null;
  /** URL absoluta (Vercel Blob o almacenamiento local del panel) o ruta del sitio (/novedades/…). Variante grande (-1600). */
  imagen: string | null;
  imagen_alt: string | null;
  plantilla: Plantilla;
  enlace_texto: string | null;
  enlace_url: string | null;
  publicado: number;
  /** Se muestra solo desde / hasta estas fechas (AAAA-MM-DD, hora de Uruguay); null = sin límite. */
  desde: string | null;
  hasta: string | null;
  orden: number;
  creado_en: string;
  actualizado_en: string;
  actualizado_por: string | null;
}

export interface DatosNovedad {
  titulo: string;
  texto: string | null;
  imagen_alt: string | null;
  plantilla: Plantilla;
  enlace_texto: string | null;
  enlace_url: string | null;
  publicado: boolean;
  desde: string | null;
  hasta: string | null;
}

export const listarNovedades = (db: Db) => todas<Novedad>(db, 'SELECT * FROM novedades ORDER BY orden, id');
/** Las que se ven hoy en la portada: publicadas y dentro de sus fechas. */
export const novedadesPublicadas = (db: Db, hoy = hoyUruguay()) =>
  todas<Novedad>(db, "SELECT * FROM novedades WHERE publicado = 1 AND (desde IS NULL OR desde = '' OR desde <= ?) AND (hasta IS NULL OR hasta = '' OR hasta >= ?) ORDER BY orden, id", [hoy, hoy]);

export function estadoNovedad(n: Pick<Novedad, 'publicado' | 'desde' | 'hasta'>, hoy = hoyUruguay()): 'publicada' | 'borrador' | 'programada' | 'vencida' {
  if (!Number(n.publicado)) return 'borrador';
  if (n.desde && hoy < n.desde) return 'programada';
  if (n.hasta && hoy > n.hasta) return 'vencida';
  return 'publicada';
}
export const obtenerNovedad = (db: Db, id: number) => una<Novedad>(db, 'SELECT * FROM novedades WHERE id = ?', [id]);

export async function crearNovedad(db: Db, d: DatosNovedad, imagen: string | null, por: string) {
  const t = ahora();
  const orden = Number((await una<{ o: number }>(db, 'SELECT COALESCE(MAX(orden), 0) + 1 o FROM novedades'))?.o ?? 1);
  const r = await ejecutar(db, `INSERT INTO novedades (titulo, texto, imagen, imagen_alt, plantilla, enlace_texto, enlace_url, publicado, desde, hasta, orden, creado_en, actualizado_en, actualizado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [d.titulo, d.texto, imagen, d.imagen_alt, d.plantilla, d.enlace_texto, d.enlace_url, d.publicado ? 1 : 0, d.desde, d.hasta, orden, t, t, por]);
  return (await obtenerNovedad(db, r.id!))!;
}

export async function editarNovedad(db: Db, id: number, d: DatosNovedad, imagen: string | null | undefined, por: string) {
  await ejecutar(db, `UPDATE novedades SET titulo = ?, texto = ?, imagen_alt = ?, plantilla = ?, enlace_texto = ?, enlace_url = ?, publicado = ?, desde = ?, hasta = ?, actualizado_en = ?, actualizado_por = ?${imagen !== undefined ? ', imagen = ?' : ''} WHERE id = ?`, [
    d.titulo, d.texto, d.imagen_alt, d.plantilla, d.enlace_texto, d.enlace_url, d.publicado ? 1 : 0, d.desde, d.hasta, ahora(), por, ...(imagen !== undefined ? [imagen] : []), id,
  ]);
  return obtenerNovedad(db, id);
}

export async function publicar(db: Db, id: number, publicado: boolean, por: string) {
  await ejecutar(db, 'UPDATE novedades SET publicado = ?, actualizado_en = ?, actualizado_por = ? WHERE id = ?', [publicado ? 1 : 0, ahora(), por, id]);
  return obtenerNovedad(db, id);
}

/** Mueve una novedad un lugar hacia arriba o hacia abajo y renumera el orden. */
export async function mover(db: Db, id: number, direccion: 'arriba' | 'abajo') {
  const lista = await listarNovedades(db);
  const i = lista.findIndex((n) => n.id === id);
  const j = direccion === 'arriba' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= lista.length) return false;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  await db.batch(lista.map((n, k) => ({ sql: 'UPDATE novedades SET orden = ? WHERE id = ?', args: [k + 1, n.id] })), 'write');
  return true;
}

export const eliminarNovedad = (db: Db, id: number) => ejecutar(db, 'DELETE FROM novedades WHERE id = ?', [id]);
