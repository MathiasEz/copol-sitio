// Contenido de la web que se edita en el panel ("Administración Página"): ofertas del supermercado y
// aperturas de crédito, leídos de la base de datos. Si la base no responde, se usa el contenido inicial
// (sin guardarlo en la caché de la CDN: `enVivo` = false).
import { obtenerDb, type Db } from '../../panel/src/db.ts';
import { OFERTAS_INICIALES, obtenerOfertas, piezasVigentes, type Ofertas, type Pieza } from '../../panel/src/ofertas.ts';
import { APERTURAS_INICIALES, obtenerAperturas, proximas, type Apertura } from '../../panel/src/creditos.ts';
import { hoyUruguay } from '../../panel/src/fechas.ts';

export type { Apertura, Ofertas, Pieza };
export { hoyUruguay, piezasVigentes, proximas };

async function leer<T>(que: string, lector: (db: Db) => Promise<T>, inicial: T): Promise<{ valor: T; enVivo: boolean }> {
  try {
    return { valor: await lector(await obtenerDb()), enVivo: true };
  } catch (e) {
    console.error(`${que}: no se pudo leer la base de datos:`, (e as Error).message);
    return { valor: structuredClone(inicial), enVivo: false };
  }
}

export const leerOfertas = () => leer('ofertas del supermercado', (db) => obtenerOfertas(db), OFERTAS_INICIALES);
export const leerAperturas = () => leer('aperturas de crédito', (db) => obtenerAperturas(db), APERTURAS_INICIALES);

/** Imagen de una pieza: variantes de 400 y 800 px (las iniciales y las subidas desde el panel). */
export function imagenPieza(url: string) {
  const v = (a: number) => url.replace(/-\d+\.webp$/, `-${a}.webp`);
  return /-\d+\.webp$/.test(url) ? { src: v(400), srcset: `${v(400)} 400w, ${v(800)} 800w` } : { src: url, srcset: undefined };
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** Datos para mostrar una apertura: "10" / "noviembre" / "NOV". */
export function partesFecha(iso: string) {
  const [, m, d] = iso.split('-').map(Number);
  return { dia: String(d).padStart(2, '0'), mes: MESES[m - 1], mesCorto: MESES[m - 1].slice(0, 3).toUpperCase() };
}
