// Portada de la app: banner, novedades, próximas aperturas de crédito y ofertas del supermercado vigentes,
// tal como se cargan en "Administración Página". Las ofertas muestran precios: es la excepción aprobada
// para esas piezas (ver panel/src/ofertas.ts) y la app las presenta solo en Promociones.
import type { APIRoute } from 'astro';
import { obtenerBannerPublico, vigentes } from '../../../../lib/banner';
import { obtenerNovedades } from '../../../../lib/inventario';
import { hoyUruguay, leerAperturas, leerOfertas, piezasVigentes, proximas } from '../../../../lib/contenido';
import { ETIQUETAS_WEB } from '../../../../lib/cache-publica';
import { respuestaApp } from '../../../../lib/api-app';

export const prerender = false;

const chica = (url: string) => url.replace(/-(800|1600)\.webp$/, '-400.webp');

export const GET: APIRoute = async () => {
  const hoy = hoyUruguay();
  const [banner, novedades, aperturas, ofertas] = await Promise.all([obtenerBannerPublico(), obtenerNovedades(), leerAperturas(), leerOfertas()]);
  const piezas = piezasVigentes(ofertas.valor, hoy);
  return respuestaApp({
    banner: vigentes(banner.banner, hoy).map((d) => ({
      id: d.id,
      antetitulo: d.antetitulo,
      titulo: d.titulo,
      resaltado: d.resaltado,
      texto: d.texto,
      etiqueta: d.etiqueta,
      imagen: d.imagenMovil || d.imagen,
      alt: d.alt,
      botones: [d.boton1, d.boton2].filter((b) => b && b.texto && b.url),
    })),
    novedades: (novedades ?? []).map((n) => ({
      id: n.id,
      titulo: n.titulo,
      texto: n.texto,
      imagen: n.imagen,
      alt: n.imagen_alt,
      enlaceTexto: n.enlace_texto,
      enlaceUrl: n.enlace_url,
    })),
    aperturas: proximas(aperturas.valor, hoy),
    ofertas: piezas.length
      ? { titulo: ofertas.valor.titulo, mes: ofertas.valor.mes, hasta: ofertas.valor.hasta, piezas: piezas.map((p) => ({ id: p.id, imagen: chica(p.imagen), imagenGrande: p.imagen, alt: p.alt })) }
      : null,
  }, banner.enVivo && novedades !== null && aperturas.enVivo && ofertas.enVivo,
  ETIQUETAS_WEB.banner, ETIQUETAS_WEB.novedades, ETIQUETAS_WEB.creditos, ETIQUETAS_WEB.ofertas);
};
