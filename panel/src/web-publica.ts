// Renovación de la web pública tras un cambio en el panel. Las páginas con datos de la base se guardan
// en la CDN de Vercel con una etiqueta (src/lib/cache-publica.ts); al registrar un cambio que se ve en la
// web, se borran las copias de esa etiqueta y la visita siguiente se genera con los datos nuevos.
// Fuera de Vercel (desarrollo y pruebas) no hay CDN: no hace nada.
import { dangerouslyDeleteByTag } from '@vercel/functions';

export const ETIQUETAS_WEB = { bazar: 'bazar', novedades: 'novedades', empleados: 'empleados', banner: 'banner', ofertas: 'ofertas', creditos: 'creditos', notificaciones: 'notificaciones' } as const;
export type EtiquetaWeb = (typeof ETIQUETAS_WEB)[keyof typeof ETIQUETAS_WEB];

/** Etiquetas afectadas por una acción del registro (auditoria.ts), o [] si no cambia nada público. */
export function etiquetasDe(accion: string): EtiquetaWeb[] {
  if (/^(stock|producto)\./.test(accion)) return [ETIQUETAS_WEB.bazar];
  if (accion.startsWith('campana.')) return [ETIQUETAS_WEB.novedades];
  if (accion.startsWith('novedad.')) return [ETIQUETAS_WEB.novedades, ETIQUETAS_WEB.notificaciones];
  if (accion.startsWith('empleados.')) return [ETIQUETAS_WEB.empleados];
  if (accion.startsWith('banner.')) return [ETIQUETAS_WEB.banner];
  if (accion.startsWith('ofertas.')) return [ETIQUETAS_WEB.ofertas, ETIQUETAS_WEB.notificaciones];
  // Las aperturas de crédito generan avisos automáticos: también cambia la agenda de la app.
  if (accion.startsWith('creditos.')) return [ETIQUETAS_WEB.creditos, ETIQUETAS_WEB.notificaciones];
  if (accion.startsWith('notificacion.')) return [ETIQUETAS_WEB.notificaciones];
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
