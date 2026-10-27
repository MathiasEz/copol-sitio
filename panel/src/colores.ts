// Color de cada persona en la planilla de registros: quien carga un registro aparece con el color que eligió.
// Es una paleta fija (el panel no permite estilos en línea): cada color tiene una clase `.pers--clave` en panel.css.
export interface ColorPersona { clave: string; nombre: string; fondo: string; texto: string }

export const PALETA: ColorPersona[] = [
  { clave: 'verde', nombre: 'Verde', fondo: '#bbf7d0', texto: '#14532d' },
  { clave: 'amarillo', nombre: 'Amarillo', fondo: '#fef08a', texto: '#713f12' },
  { clave: 'naranja', nombre: 'Naranja', fondo: '#fed7aa', texto: '#7c2d12' },
  { clave: 'rojo', nombre: 'Rojo', fondo: '#fecaca', texto: '#7f1d1d' },
  { clave: 'rosa', nombre: 'Rosa', fondo: '#fbcfe8', texto: '#831843' },
  { clave: 'violeta', nombre: 'Violeta', fondo: '#ddd6fe', texto: '#4c1d95' },
  { clave: 'azul', nombre: 'Azul', fondo: '#bfdbfe', texto: '#1e3a8a' },
  { clave: 'celeste', nombre: 'Celeste', fondo: '#a5f3fc', texto: '#164e63' },
  { clave: 'turquesa', nombre: 'Turquesa', fondo: '#99f6e4', texto: '#134e4a' },
  { clave: 'lima', nombre: 'Lima', fondo: '#d9f99d', texto: '#365314' },
  { clave: 'marron', nombre: 'Marrón', fondo: '#e7d3c0', texto: '#451a03' },
  { clave: 'gris', nombre: 'Gris', fondo: '#e2e8f0', texto: '#1e293b' },
];

export const colorValido = (v: unknown): v is string => typeof v === 'string' && PALETA.some((c) => c.clave === v);
export const colorDe = (clave: string | null | undefined) => PALETA.find((c) => c.clave === clave) ?? null;

/** #rrggbb → componentes 0 a 1 que pide la API de Google Sheets. */
export function rgbSheets(hex: string) {
  const n = (i: number) => Number((parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(4));
  return { red: n(1), green: n(3), blue: n(5) };
}
