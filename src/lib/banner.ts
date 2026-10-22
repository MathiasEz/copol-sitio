// Banner de Inicio en la web pública: las diapositivas que se editan en el panel ("Administración Página"),
// leídas de la base de datos. Si la base no responde, se muestra el contenido inicial, sin guardarlo en
// la caché de la CDN.
import { obtenerDb } from '../../panel/src/db.ts';
import { BANNER_INICIAL, htmlBanner, obtenerBanner, vigentes, type Banner } from '../../panel/src/banner.ts';

export { htmlBanner, vigentes };

export async function obtenerBannerPublico(): Promise<{ banner: Banner; enVivo: boolean }> {
  try {
    return { banner: await obtenerBanner(await obtenerDb()), enVivo: true };
  } catch (e) {
    console.error('banner de inicio: no se pudo leer la base de datos:', (e as Error).message);
    return { banner: structuredClone(BANNER_INICIAL), enVivo: false };
  }
}
