// Campana de novedades del encabezado de la web: se configura en el panel ("Administración Página → Campana").
// El contenido del desplegable son las Novedades publicadas (sección Novedades); acá se elige si la campana se
// muestra, qué número lleva el globito y cómo se titula el desplegable. Se guarda como JSON en `ajustes`.
import { ahora, ejecutar, una, type Db } from './db.ts';

const CLAVE = 'campana';

/** hora: 1 a 5 según la hora del día (Uruguay) · cantidad: novedades publicadas (máx. 99) · fijo: el número elegido. */
export const MODOS = { hora: 'Cambia según la hora (de 1 a 5)', cantidad: 'Cantidad de novedades publicadas', fijo: 'Un número fijo' } as const;
export type Modo = keyof typeof MODOS;

export interface Campana {
  activa: boolean;
  modo: Modo;
  /** Solo para el modo "fijo" (1 a 99). */
  numero: number;
  titulo: string;
}

export const CAMPANA_INICIAL: Campana = { activa: true, modo: 'hora', numero: 3, titulo: 'Novedades COPOL' };
export const esModo = (m: unknown): m is Modo => typeof m === 'string' && Object.hasOwn(MODOS, m);

/** Deja solo valores válidos (lo que viene de la base o del formulario no es confiable). */
export function limpiarCampana(d: unknown): Campana {
  const x = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
  const numero = Math.round(Number(x.numero));
  const titulo = typeof x.titulo === 'string' ? x.titulo.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  return {
    activa: x.activa !== false,
    modo: esModo(x.modo) ? x.modo : CAMPANA_INICIAL.modo,
    numero: Number.isFinite(numero) && numero >= 1 && numero <= 99 ? numero : CAMPANA_INICIAL.numero,
    titulo: titulo || CAMPANA_INICIAL.titulo,
  };
}

export async function obtenerCampana(db: Db): Promise<Campana> {
  const fila = await una<{ valor: string }>(db, 'SELECT valor FROM ajustes WHERE clave = ?', [CLAVE]);
  if (!fila) return { ...CAMPANA_INICIAL };
  try { return limpiarCampana(JSON.parse(fila.valor)); } catch { return { ...CAMPANA_INICIAL }; }
}

export async function guardarCampana(db: Db, c: Campana) {
  await ejecutar(db, 'INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en', [CLAVE, JSON.stringify(limpiarCampana(c)), ahora()]);
}
