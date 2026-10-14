// Validación, optimización y almacenamiento de imágenes subidas desde el panel.
// - Se inspecciona el contenido real (no la extensión ni el tipo declarado por el navegador).
// - Toda imagen se vuelve a codificar como WebP: se descartan metadatos (EXIF/GPS) y cualquier contenido
//   incrustado, y se generan dos tamaños para que la web descargue solo el necesario.
// - Almacenamiento: Vercel Blob si está configurado (BLOB_READ_WRITE_TOKEN); si no, carpeta local
//   panel/datos/imagenes/ servida por el panel en <BASE>/media/ (solo desarrollo).
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp, { type Metadata } from 'sharp';

// Sin caché de archivos: en Windows mantiene abiertas las imágenes e impide reemplazarlas.
sharp.cache(false);

const FORMATOS = new Set(['jpeg', 'png', 'webp', 'avif', 'heif']);
const MAX_PIXELES = 40_000_000;
const MIN_LADO = 200;
/** Anchos generados por tipo de imagen; el último es el que se guarda en la base. */
export const VARIANTES = { producto: [400, 800], novedad: [800, 1600] } as const;
export type TipoImagen = keyof typeof VARIANTES;

export class ErrorImagen extends Error {}

export interface Almacen {
  guardar(ruta: string, datos: Buffer): Promise<string>;
}

export function almacenConfigurado(dirLocal: string, urlLocal: string): Almacen {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    return {
      async guardar(ruta, datos) {
        const { put } = await import('@vercel/blob');
        const r = await put(`panel/${ruta}`, datos, { access: 'public', contentType: 'image/webp', addRandomSuffix: false, cacheControlMaxAge: 31_536_000, token });
        return r.url;
      },
    };
  }
  return {
    async guardar(ruta, datos) {
      if (process.env.VERCEL) throw new Error('Falta conectar un Vercel Blob Store (BLOB_READ_WRITE_TOKEN): en Vercel no se pueden guardar imágenes en disco.');
      const destino = path.join(dirLocal, ruta);
      if (!destino.startsWith(path.resolve(dirLocal) + path.sep)) throw new ErrorImagen('Ruta de imagen inválida.');
      await fs.mkdir(path.dirname(destino), { recursive: true });
      await fs.writeFile(destino, datos);
      return `${urlLocal}/${ruta}`;
    },
  };
}

/** Variante de otro ancho a partir de la URL guardada (…-1600.webp → …-800.webp). */
export const variante = (url: string, ancho: number) => url.replace(/-\d+\.webp$/, `-${ancho}.webp`);

export async function procesarImagen(archivo: File, opciones: { maxMB: number; tipo: TipoImagen; carpeta: string; nombre: string; almacen: Almacen }) {
  if (!(archivo instanceof File) || archivo.size === 0) throw new ErrorImagen('Elegí un archivo de imagen.');
  if (archivo.size > opciones.maxMB * 1024 * 1024) throw new ErrorImagen(`La imagen supera ${opciones.maxMB} MB.`);
  const buf = Buffer.from(await archivo.arrayBuffer());
  let meta: Metadata;
  try {
    meta = await sharp(buf, { limitInputPixels: MAX_PIXELES }).metadata();
  } catch {
    throw new ErrorImagen('El archivo no es una imagen válida.');
  }
  if (!meta.format || !FORMATOS.has(meta.format)) throw new ErrorImagen('Formato no admitido. Usá JPG, PNG, WebP o AVIF.');
  if (!meta.width || !meta.height || meta.width < MIN_LADO || meta.height < MIN_LADO) throw new ErrorImagen(`La imagen es muy chica: mínimo ${MIN_LADO} × ${MIN_LADO} px.`);
  if (meta.width * meta.height > MAX_PIXELES) throw new ErrorImagen('La imagen tiene demasiados píxeles.');

  const base = `${opciones.carpeta}/${opciones.nombre.slice(0, 60)}-${crypto.randomBytes(5).toString('hex')}`;
  let url = '';
  try {
    for (const ancho of VARIANTES[opciones.tipo]) {
      const datos = await sharp(buf, { limitInputPixels: MAX_PIXELES })
        .rotate()
        .resize({ width: ancho, height: opciones.tipo === 'producto' ? ancho : undefined, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .webp({ quality: 78, effort: 5 })
        .toBuffer();
      url = await opciones.almacen.guardar(`${base}-${ancho}.webp`, datos);
    }
  } catch (e) {
    if (e instanceof ErrorImagen) throw e;
    console.error('imagen:', e);
    throw new ErrorImagen('No se pudo procesar o guardar la imagen. Probá con otro archivo.');
  }
  return url;
}
