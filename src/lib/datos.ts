// Acceso tipado a los datos del sitio. Las páginas importan desde acá, no desde los JSON directamente.
import localesJson from '../data/confirmado/locales.json';
import conveniosJson from '../data/confirmado/convenios.json';

// ── Locales ──────────────────────────────────────────────────────────────
const DEPARTAMENTOS: Record<string, string> = {
  'casa-central': 'Montevideo', 'las-piedras': 'Canelones', pando: 'Canelones', salto: 'Salto', artigas: 'Artigas',
  'cerro-largo': 'Cerro Largo', colonia: 'Colonia', durazno: 'Durazno', maldonado: 'Maldonado', florida: 'Florida',
  paysandu: 'Paysandú', lavalleja: 'Lavalleja', rivera: 'Rivera', 'rio-negro': 'Río Negro', rocha: 'Rocha',
  soriano: 'Soriano', 'san-jose': 'San José', tacuarembo: 'Tacuarembó', 'treinta-y-tres': 'Treinta y Tres',
};
const CIUDADES: Record<string, string> = { Paysandu: 'Paysandú' };

export type TipoLocal = 'casa-central' | 'sucursal' | 'agencia';
export interface Local {
  id: string;
  tipo: TipoLocal;
  direccion: string;
  ciudad: string;
  departamento: string;
  telefono: string | null;
  celular: string | null;
  email: string | null;
  lat: number;
  lng: number;
  accesoAlternativo?: string;
  pendiente?: string;
  comoLlegar: string;
}

const ORDEN_TIPO: Record<TipoLocal, number> = { 'casa-central': 0, sucursal: 1, agencia: 2 };
export const LOCALES: Local[] = localesJson.locales
  .map((l) => ({
    ...l,
    tipo: l.tipo as TipoLocal,
    ciudad: CIUDADES[l.ciudad] ?? l.ciudad,
    departamento: DEPARTAMENTOS[l.id] ?? l.ciudad,
    comoLlegar: `https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}`,
  }))
  .sort((a, b) => ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] || a.ciudad.localeCompare(b.ciudad, 'es'));

export const TIPO_LOCAL: Record<TipoLocal, string> = {
  'casa-central': 'Casa Central',
  sucursal: 'Sucursal',
  agencia: 'Agencia',
};

/** Convierte "098 231 414" o "2364 9200" en un href tel: internacional. */
export function telHref(numero: string): string {
  const d = numero.replace(/\D/g, '');
  return d.startsWith('0800') ? `tel:${d}` : `tel:+598${d.replace(/^0/, '')}`;
}

// ── Convenios ────────────────────────────────────────────────────────────
export interface Convenio {
  id: string;
  nombre: string;
  rubro: string;
  departamento: string;
  localidad: string;
  direccion: string | null;
  telefono: string | null;
  lat: number | null;
  lng: number | null;
}
export const CONVENIOS: Convenio[] = conveniosJson.convenios
  .map((c) => ({ ...c, departamento: c.departamento.replace('Rio Negro', 'Río Negro') }))
  .sort((a, b) => a.departamento.localeCompare(b.departamento, 'es') || a.nombre.localeCompare(b.nombre, 'es'));

// ── Bazar ────────────────────────────────────────────────────────────────
// El catálogo y su stock vigente se leen en src/lib/inventario.ts (base de datos del panel).

// ── Créditos ─────────────────────────────────────────────────────────────
// Las fechas de apertura se cargan en el panel (Administración Página → Créditos): ver src/lib/contenido.ts.
