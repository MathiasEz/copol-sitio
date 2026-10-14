// Resuelve imágenes locales por nombre para usarlas con <Image /> / <Picture /> de Astro.
import type { ImageMetadata } from 'astro';

const fotos = import.meta.glob<{ default: ImageMetadata }>('../assets/img/*.webp', { eager: true });

const porNombre = (mapa: Record<string, { default: ImageMetadata }>) =>
  Object.fromEntries(Object.entries(mapa).map(([ruta, mod]) => [ruta.split('/').pop()!.replace(/\.webp$/, ''), mod.default]));

const FOTOS = porNombre(fotos);
// Fotos de las ciudades de cada local (src/assets/locales/<id del local>.webp, 16:9, ver docs/registro-de-activos.md).
const LOCALES_FOTOS = porNombre(import.meta.glob<{ default: ImageMetadata }>('../assets/locales/*.webp', { eager: true }));
export const fotoLocal = (id: string): ImageMetadata | undefined => LOCALES_FOTOS[id];

// Fotos de la línea de tiempo: primero las históricas que entregue la cooperativa (src/assets/historia/),
// después las fotos generales (src/assets/img/) y la ilustración del manual.
const HISTORIA = porNombre(import.meta.glob<{ default: ImageMetadata }>('../assets/historia/*.webp', { eager: true }));
const MARCA = porNombre(import.meta.glob<{ default: ImageMetadata }>('../assets/brand/*.webp', { eager: true }));
export const fotoHito = (nombre: string): ImageMetadata | undefined =>
  HISTORIA[nombre] ?? FOTOS[nombre] ?? (nombre === 'ilustracion' ? MARCA['ilustracion-cooperativismo'] : undefined);

export function foto(nombre: string): ImageMetadata {
  const img = FOTOS[nombre];
  if (!img) throw new Error(`Imagen no encontrada en src/assets/img: ${nombre}`);
  return img;
}
