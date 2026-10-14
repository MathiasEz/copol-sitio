// Agrupa los productos del Bazar en MODELOS con VARIANTES de color, solo para mostrarlos en la web.
// No cambia el inventario: cada variante sigue siendo un producto con su propio código interno COPOL y
// su propio stock (los 806 del catálogo y los que se agreguen en el panel).
//
// Reglas conservadoras (no se adivina):
// - Dos productos son variantes del mismo modelo solo si, en la misma categoría, su nombre es IDÉNTICO
//   después de quitar el color del final (lista cerrada de colores, con las abreviaturas y cortes del
//   sistema: "NEG", "VDE", "BLANC", "PLATE", "GRIS OSCUR", "NEGRO/AZUL"…).
// - Hacen falta al menos dos variantes con color reconocido. Un único producto del mismo nombre sin
//   color se suma como "Color no indicado"; si hay varios sin color, quedan separados.
// - Nombres demasiado genéricos (menos de 3 palabras, p. ej. "AURICULAR SONY") nunca se agrupan.

const COLOR: Record<string, string> = {
  NEGRO: 'negro', NEGRA: 'negro', NEG: 'negro', BLACK: 'negro',
  BLANCO: 'blanco', BLANCA: 'blanco', BCO: 'blanco', WHITE: 'blanco',
  AZUL: 'azul', BLUE: 'azul', CELESTE: 'celeste',
  VERDE: 'verde', VDE: 'verde', GREEN: 'verde',
  ROJO: 'rojo', ROJA: 'rojo', RED: 'rojo',
  ROSADO: 'rosado', ROSADA: 'rosado', ROSA: 'rosado', PINK: 'rosado',
  GRIS: 'gris', GRAY: 'gris', GREY: 'gris', GRAFITO: 'grafito',
  PLATEADO: 'plateado', PLATEADA: 'plateado', PLATA: 'plateado', SILVER: 'plateado',
  DORADO: 'dorado', DORADA: 'dorado', GOLD: 'dorado',
  VIOLETA: 'violeta', LILA: 'lila', MORADO: 'morado', PURPURA: 'púrpura', LAVANDA: 'lavanda',
  AMARILLO: 'amarillo', AMARILLA: 'amarillo', NARANJA: 'naranja', BEIGE: 'beige', CREMA: 'crema',
  MARRON: 'marrón', TURQUESA: 'turquesa', CORAL: 'coral', BORDO: 'bordó',
};
// Colores que el sistema corta al final del nombre ("PLATE", "BLANC"): se aceptan prefijos de 4+ letras.
const CORTABLES = ['NEGRO', 'BLANCO', 'VERDE', 'ROSADO', 'PLATEADO', 'DORADO', 'VIOLETA', 'AMARILLO', 'CELESTE'];
const MODIFICADOR: Record<string, string> = { CLARO: 'claro', OSCURO: 'oscuro', MARINO: 'marino', TI: 'titanio', TITANIO: 'titanio' };

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
// Errores de tipeo evidentes del sistema (confirmados por la cooperativa): se corrigen antes de comparar,
// para que el nombre del modelo y la agrupación usen la forma correcta.
const TIPEOS: [RegExp, string][] = [[/\bREMDI\b/g, 'REDMI'], [/\bMOTORLA\b/g, 'MOTOROLA'], [/\bBICILETA\b/g, 'BICICLETA'], [/\bESPESSO\b/g, 'ESPRESSO'], [/\bXIOAMI\b/g, 'XIAOMI'], [/\bSMASUNG\b/g, 'SAMSUNG']];
const limpiarNombre = (n: string) => TIPEOS.reduce((s, [re, ok]) => s.replace(re, ok), n.toUpperCase().replace(/\s+/g, ' ').trim());

function colorDe(palabra: string): string | null {
  const w = sinTildes(palabra);
  if (COLOR[w]) return COLOR[w];
  if (w.length >= 4) {
    const c = CORTABLES.find((k) => k.startsWith(w));
    if (c) return COLOR[c];
  }
  return null;
}
function modificadorDe(palabra: string): string | null {
  const w = sinTildes(palabra);
  if (MODIFICADOR[w]) return MODIFICADOR[w];
  if (w.length >= 3) {
    const k = ['CLARO', 'OSCURO', 'MARINO'].find((m) => m.startsWith(w));
    if (k) return MODIFICADOR[k];
  }
  return null;
}
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Separa el color del final del nombre ("… COLOR AZUL CLARO" → base "…", color "Azul claro"). */
export function separarColor(nombre: string): { base: string; color: string | null } {
  const n = limpiarNombre(nombre);
  const p = n.split(' ');
  const quitar = (cuantas: number, color: string) => {
    let base = p.slice(0, -cuantas);
    if (base.at(-1) === 'COLOR') base = base.slice(0, -1);
    return base.length >= 2 ? { base: base.join(' '), color: mayuscula(color) } : null;
  };
  const [a, b, c] = [p.at(-3), p.at(-2), p.at(-1)];
  // "NEGRO Y AZUL"
  if (a && b === 'Y' && c && colorDe(a) && colorDe(c)) {
    const r = quitar(3, `${colorDe(a)} y ${colorDe(c)}`);
    if (r) return r;
  }
  // "AZUL CLARO", "GRIS OSCUR", "NEGRO TI"
  if (b && c && colorDe(b) && modificadorDe(c)) {
    const r = quitar(2, `${colorDe(b)} ${modificadorDe(c)}`);
    if (r) return r;
  }
  // "NEGRO/AZUL"
  if (c && c.includes('/')) {
    const partes = c.split('/');
    if (partes.length === 2 && partes.every((x) => colorDe(x))) {
      const r = quitar(1, `${colorDe(partes[0])} y ${colorDe(partes[1])}`);
      if (r) return r;
    }
  }
  if (c && colorDe(c)) {
    const r = quitar(1, colorDe(c)!);
    if (r) return r;
  }
  return { base: n, color: null };
}

/** Clave de agrupación: misma categoría y mismo nombre sin color (ignora "CEL" / "CELULAR" y signos). */
const claveBase = (categoria: string, base: string) =>
  `${categoria}|${sinTildes(base).replace(/^CEL\b/, 'CELULAR').replace(/[^A-Z0-9Ñ/+.]+/g, ' ').trim()}`;

export interface ConVariante { id: string; nombre: string; categoriaId: string }
export type Variante<T> = T & { color: string | null };
export interface Modelo<T> { base: string; variantes: Variante<T>[] }

/**
 * Agrupa los productos en modelos, conservando el orden del catálogo (cada modelo aparece donde
 * aparecía su primera variante). Un modelo de una sola variante conserva el nombre completo.
 */
export function agruparVariantes<T extends ConVariante>(productos: T[]): Modelo<T>[] {
  const candidatos = new Map<string, { base: string; items: Variante<T>[] }>();
  for (const p of productos) {
    const { base, color } = separarColor(p.nombre);
    const clave = claveBase(p.categoriaId, base);
    const g = candidatos.get(clave);
    if (g) g.items.push({ ...p, color });
    else candidatos.set(clave, { base, items: [{ ...p, color }] });
  }
  const modeloDe = new Map<string, Modelo<T>>();
  for (const { base, items } of candidatos.values()) {
    const conColor = items.filter((v) => v.color);
    const sinColor = items.filter((v) => !v.color);
    const agrupable = base.split(' ').length >= 3 && conColor.length >= 2;
    const juntos = agrupable ? [...conColor, ...(sinColor.length === 1 ? sinColor : [])] : [];
    if (juntos.length) {
      const m: Modelo<T> = { base, variantes: juntos };
      for (const v of juntos) modeloDe.set(v.id, m);
    }
  }
  const salida: Modelo<T>[] = [];
  const vistos = new Set<Modelo<T>>();
  for (const p of productos) {
    const m = modeloDe.get(p.id);
    if (m) {
      if (!vistos.has(m)) { vistos.add(m); salida.push(m); }
    } else {
      salida.push({ base: limpiarNombre(p.nombre), variantes: [{ ...p, color: null }] });
    }
  }
  return salida;
}
