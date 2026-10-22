// Renovación de la web pública tras un cambio en el panel. Las páginas con datos de la base se guardan
// en la CDN de Vercel con una etiqueta (src/lib/cache-publica.ts); al registrar un cambio que se ve en la
// web, se borran las copias de esa etiqueta y la visita siguiente se genera con los datos nuevos.
// Fuera de Vercel (desarrollo y pruebas) no hay CDN: no hace nada.
import { dangerouslyDeleteByTag } from '@vercel/functions';

export const ETIQUETAS_WEB = { bazar: 'bazar', novedades: 'novedades', empleados: 'empleados', banner: 'banner' } as const;
export type EtiquetaWeb = (typeof ETIQUETAS_WEB)[keyof typeof ETIQUETAS_WEB];

/** Etiquetas afectadas por una acción del registro (auditoria.ts), o [] si no cambia nada público. */
export function etiquetasDe(accion: string): EtiquetaWeb[] {
  if (/^(stock|producto)\./.test(accion)) return [ETIQUETAS_WEB.bazar];
  if (accion.startsWith('novedad.')) return [ETIQUETAS_WEB.novedades];
  if (accion.startsWith('empleados.')) return [ETIQUETAS_WEB.empleados];
  if (accion.startsWith('banner.')) return [ETIQUETAS_WEB.banner];
  return [];
}

export async function renovarWebPublica(accion: string) {
  const etiquetas = etiquetasDe(accion);
  if (!etiquetas.length || !process.env.VERCEL) return;
  try {
    await dangerouslyDeleteByTag(etiquetas);
  } catch (e) {
    // El cambio ya está guardado: en el peor caso la web lo muestra al renovarse la copia (60 s).
    console.error('web pública: no se pudo renovar la caché de la CDN:', (e as Error).message);
  }
}
