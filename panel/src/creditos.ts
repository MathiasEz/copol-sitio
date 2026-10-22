// Fechas de apertura de créditos: se cargan en el panel ("Administración Página → Créditos") y se muestran
// en Inicio, Beneficios, Hacete socio y Acceso web. Las fechas pasadas se ocultan solas (cada día, sin
// volver a publicar el sitio). Se guardan como JSON en la tabla `ajustes`; mientras nadie las edite, se
// usan las confirmadas por la cooperativa el 12/10/2026.
import { ahora, ejecutar, una, type Db } from './db.ts';
import { fechaValida, hoyUruguay } from './fechas.ts';

const CLAVE = 'aperturas_credito';
export const MAX_APERTURAS = 24;

export interface Apertura {
  /** AAAA-MM-DD */
  fecha: string;
  /** false: se muestra con la etiqueta "Fecha a confirmar". */
  confirmada: boolean;
}

export const APERTURAS_INICIALES: Apertura[] = [
  { fecha: '2026-11-10', confirmada: true },
  { fecha: '2026-12-08', confirmada: true },
];

const ordenar = (l: Apertura[]) => [...l].sort((a, b) => a.fecha.localeCompare(b.fecha));

export async function obtenerAperturas(db: Db): Promise<Apertura[]> {
  const fila = await una<{ valor: string }>(db, 'SELECT valor FROM ajustes WHERE clave = ?', [CLAVE]);
  if (!fila) return structuredClone(APERTURAS_INICIALES);
  let d: unknown;
  try { d = JSON.parse(fila.valor); } catch { return structuredClone(APERTURAS_INICIALES); }
  const lista = (Array.isArray(d) ? d : [])
    .map((a) => ({ fecha: fechaValida((a as Apertura)?.fecha), confirmada: (a as Apertura)?.confirmada !== false }))
    .filter((a) => a.fecha);
  return ordenar(lista).slice(0, MAX_APERTURAS);
}

export async function guardarAperturas(db: Db, lista: Apertura[]) {
  await ejecutar(db, 'INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en', [CLAVE, JSON.stringify(ordenar(lista)), ahora()]);
}

/** Aperturas de hoy en adelante (hora de Uruguay). */
export const proximas = (lista: Apertura[], hoy = hoyUruguay()) => ordenar(lista).filter((a) => a.fecha >= hoy);
