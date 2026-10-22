// Ofertas del supermercado (Promociones): piezas gráficas 4:5 que se cargan cada mes desde el panel
// ("Administración Página → Ofertas"). EXCEPCIÓN APROBADA (14/10/2026): estas piezas muestran precios y
// se publican tal cual, solo en esta sección. Con "Válidas hasta", la sección se retira sola al vencer.
// Se guardan como JSON en la tabla `ajustes`; mientras nadie las edite, se muestran las de octubre de 2026
// (imágenes en public/ofertas/).
import crypto from 'node:crypto';
import { ahora, ejecutar, una, type Db } from './db.ts';
import { fechaValida, hoyUruguay } from './fechas.ts';

const CLAVE = 'ofertas_supermercado';
export const MAX_PIEZAS = 60;

export interface Pieza {
  id: string;
  /** URL de la variante grande (…-800.webp). */
  imagen: string;
  /** Producto y precio, tal como dice la pieza (lo leen los lectores de pantalla). */
  alt: string;
}
export interface Ofertas {
  titulo: string;
  /** Período, en texto: "octubre de 2026". */
  mes: string;
  /** Último día en que se muestran (AAAA-MM-DD); vacío = sin vencimiento. */
  hasta: string;
  piezas: Pieza[];
}

// Transcripción de cada pieza de "Ofertas Octubre" (ofertas oct.zip, 13/10/2026): producto y precio.
const OCTUBRE: [string, string][] = [
  ['Papel higiénico Regio 30 m, 24 rollos', '189 pesos'],
  ['Crema dental Colgate Calcio 180 g', '109 pesos'],
  ['Harina PAN mezcla de maíz amarilla precocida 1 kg', '142 pesos'],
  ['Harina PAN granos enteros 1 kg', '142 pesos'],
  ['Harina PAN mezcla de maíz blanco precocida 1 kg', '142 pesos'],
  ['Durazno Aída lata 830 g', '85 pesos'],
  ['Harina PAN mezcla de maíz dulce 500 g', '138 pesos'],
  ['Primocão Original bolsa negra 7 kg', '799 pesos'],
  ['Saché Primocão Júnior frango (pollo) 100 g, blíster de 12 unidades', '3 por 99 pesos'],
  ['Saché Primocão carne 100 g, blíster de 12 unidades', '3 por 99 pesos'],
  ['Saché Primogato filhote pollo 85 g, blíster de 12 unidades', '3 por 99 pesos'],
  ['Saché Primocão carne y vegetales 100 g, blíster de 12 unidades', '3 por 99 pesos'],
  ['Saché Primogato carne 85 g, blíster de 12 unidades', '3 por 99 pesos'],
  ['Salsa de tomate condimentada Del Gaucho 710 g', '149 pesos'],
  ['Saché Primogato frutos del mar 85 g, blíster de 12 unidades', '3 por 99 pesos'],
  ['Crivea Sec involcable 236 g', '213 pesos'],
  ['Crivea Sec sobres 175 g', '170 pesos'],
  ['Crivea Sec percha lavanda 248 g', '259 pesos'],
  ['Crivea Sec pote 175 g', '152 pesos'],
  ['Jabón líquido para manos Vita Care, varios', '179 pesos'],
  ['Crivea Sec repuesto pote 175 g', '91 pesos'],
  ['Trapero con cabo Virutex', '270 pesos'],
  ['Salsa de tomate condimentada Del Gaucho 510 g', '99 pesos'],
  ['Mopa de chenille microfibra 40 × 12 cm', '255 pesos'],
  ['Salsa ketchup Del Gaucho pack de 500 g', '112 pesos'],
  ['Pulpa concentrada Pontevedra 1030 g', '63 pesos'],
  ['Galletas Chocolinas', '69 pesos'],
  ['Polvo para hornear Hornex 200 g + 40 g', '69 pesos'],
  ['Mostaza Del Gaucho pack de 500 g', '85 pesos'],
];

export const OFERTAS_INICIALES: Ofertas = {
  titulo: 'Ofertas de octubre',
  mes: 'octubre de 2026',
  hasta: '2026-10-31',
  piezas: [],
};

export const nuevoIdPieza = () => crypto.randomBytes(6).toString('base64url');

const limpiarPieza = (v: unknown): Pieza | null => {
  const p = v as Partial<Pieza>;
  return p && typeof p.id === 'string' && typeof p.imagen === 'string' && p.imagen
    ? { id: p.id.slice(0, 24), imagen: p.imagen.slice(0, 500), alt: typeof p.alt === 'string' ? p.alt.slice(0, 200) : '' }
    : null;
};

export async function obtenerOfertas(db: Db, iniciales: Ofertas = OFERTAS_INICIALES): Promise<Ofertas> {
  const fila = await una<{ valor: string }>(db, 'SELECT valor FROM ajustes WHERE clave = ?', [CLAVE]);
  if (!fila) return structuredClone(iniciales);
  let d: Partial<Ofertas> = {};
  try { d = JSON.parse(fila.valor); } catch { return structuredClone(iniciales); }
  const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
  return {
    titulo: texto(d.titulo, 80) || 'Ofertas del mes',
    mes: texto(d.mes, 60),
    hasta: fechaValida(d.hasta),
    piezas: (Array.isArray(d.piezas) ? d.piezas : []).map(limpiarPieza).filter((p): p is Pieza => p !== null).slice(0, MAX_PIEZAS),
  };
}

export async function guardarOfertas(db: Db, o: Ofertas) {
  await ejecutar(db, 'INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en', [CLAVE, JSON.stringify(o), ahora()]);
}

export const vencidas = (o: Ofertas, hoy = hoyUruguay()) => Boolean(o.hasta && hoy > o.hasta);
/** Piezas que se muestran hoy (ninguna si vencieron). */
export const piezasVigentes = (o: Ofertas, hoy = hoyUruguay()) => (vencidas(o, hoy) ? [] : o.piezas);

// Las piezas de octubre se completan aquí (fuera del literal) para que el orden y los textos sigan la lista.
OFERTAS_INICIALES.piezas = OCTUBRE.map(([producto, precio], i) => {
  const n = String(i + 1).padStart(2, '0');
  return { id: `octubre-${n}`, imagen: `/ofertas/octubre-${n}-800.webp`, alt: `Oferta de octubre: ${producto}, a ${precio}.` };
});
