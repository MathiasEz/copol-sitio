// Portal de empleados para la app: la misma información que /portal-empleados/ y que "Información empleados"
// del panel (enlaces a recibos, reglamento, protocolo y encuesta, y las fotos de la cooperativa). La app la
// muestra en una pantalla propia en lugar de abrir la web. Se guarda en la CDN con la etiqueta "empleados":
// al guardar en el panel, la app ve el cambio en la visita siguiente.
import type { APIRoute } from 'astro';
import { imagenPortal, obtenerPortalPublico, type ImagenPortal } from '../../../../lib/portal';
import { ETIQUETAS_WEB } from '../../../../lib/cache-publica';
import { respuestaApp } from '../../../../lib/api-app';

export const prerender = false;

const imagen = (i: ImagenPortal) => ({ imagen: imagenPortal(i.src).src, alt: i.alt });

export const GET: APIRoute = async () => {
  const { portal: p, enVivo } = await obtenerPortalPublico();
  return respuestaApp({
    recibosUrl: p.recibosUrl || null,
    reglamentoUrl: p.reglamentoUrl || null,
    acosoUrl: p.acosoUrl || null,
    animoUrl: p.animoUrl || null,
    carrusel: p.carrusel.map(imagen),
    ciudadDelPlata: p.ciudadDelPlata.map(imagen),
    chuy: p.chuy.map(imagen),
  }, enVivo, ETIQUETAS_WEB.empleados);
};
