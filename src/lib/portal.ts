// Portal de empleados en la web pública: la misma información que "Información empleados" del panel
// (enlaces, QR, carrusel y fotos), leída de la base de datos. Si la base no responde, se muestra el
// contenido inicial entregado por la cooperativa, sin guardarlo en la caché de la CDN.
import { obtenerDb } from '../../panel/src/db.ts';
import { obtenerPortal, PORTAL_INICIAL, qrSvg, type ImagenPortal, type Portal } from '../../panel/src/empleados.ts';

export type { ImagenPortal, Portal };
export { qrSvg };

export async function obtenerPortalPublico(): Promise<{ portal: Portal; enVivo: boolean }> {
  try {
    return { portal: await obtenerPortal(await obtenerDb()), enVivo: true };
  } catch (e) {
    console.error('portal de empleados: no se pudo leer la base de datos:', (e as Error).message);
    return { portal: structuredClone(PORTAL_INICIAL), enVivo: false };
  }
}

/** Las imágenes iniciales son archivos fijos; las subidas desde el panel tienen variantes de 800 y 1600 px. */
export function imagenPortal(src: string) {
  if (src.startsWith('/panel-recursos/')) return { src, srcset: undefined };
  const v = (ancho: number) => src.replace(/-\d+\.webp$/, `-${ancho}.webp`);
  return { src: v(800), srcset: `${v(800)} 800w, ${v(1600)} 1600w` };
}
