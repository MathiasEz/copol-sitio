// Contenido institucional para la app (servicios sociales, locales, convenios, contacto, horarios, historia).
// Se genera en el build con los mismos datos confirmados que usan las páginas: cambia al publicar el sitio.
import type { APIRoute } from 'astro';
import { getImage } from 'astro:assets';
import { CONVENIOS, LOCALES, TIPO_LOCAL } from '../../../../lib/datos';
import { foto, fotoLocal } from '../../../../lib/imagenes';
import { SERVICIOS } from '../../../../data/confirmado/servicios';
import { BENEFICIOS_SOCIO } from '../../../../data/confirmado/beneficios-socio';
import { PREGUNTAS_SOCIO } from '../../../../data/confirmado/hacete-socio';
import { HITOS_PUBLICADOS } from '../../../../data/confirmado/historia';
import { ACCESO, CONTACTO, HORARIOS, MANUAL, REDES, SITIO } from '../../../../data/confirmado/sitio';
import { VERSION_API_APP } from '../../../../lib/api-app';

export const prerender = true;

const webp = async (img: ImageMetadata | undefined, width: number) => (img ? (await getImage({ src: img, width, format: 'webp' })).src : null);

export const GET: APIRoute = async () => {
  const servicios = await Promise.all(SERVICIOS.map(async (s) => ({
    slug: s.slug, titulo: s.titulo, categoria: s.categoria, resumen: s.resumen, descripcion: s.descripcion, puntos: s.puntos,
    contactos: s.contactos.filter((c) => !c.href.startsWith('/')), cta: s.cta, icono: s.icono, aviso: s.aviso ?? null,
    imagen: s.imagen ? await webp(foto(s.imagen), 800) : null,
  })));
  const locales = await Promise.all(LOCALES.map(async (l) => ({
    id: l.id, tipo: l.tipo, nombre: l.tipo === 'casa-central' ? 'Casa Central' : `${TIPO_LOCAL[l.tipo]} ${l.ciudad}`,
    direccion: l.direccion, ciudad: l.ciudad, departamento: l.departamento, telefono: l.telefono, celular: l.celular, email: l.email,
    lat: l.lat, lng: l.lng, accesoAlternativo: l.accesoAlternativo ?? null, foto: await webp(fotoLocal(l.id), 800),
  })));
  const datos = {
    version: VERSION_API_APP,
    generado: new Date().toISOString(),
    enVivo: true,
    sitio: { nombre: SITIO.nombre, nombreCompleto: SITIO.nombreCompleto, lema: SITIO.lema, fundacion: SITIO.fundacion, origen: MANUAL.origen, mision: MANUAL.mision, vision: MANUAL.vision },
    contacto: {
      telefono: CONTACTO.telefono.texto, whatsappGeneral: CONTACTO.whatsappGeneral, whatsappSocios: CONTACTO.whatsappSocios, email: CONTACTO.email,
      casaCentral: { direccion: CONTACTO.casaCentral.direccion, ciudad: CONTACTO.casaCentral.ciudad, accesoAlternativo: CONTACTO.casaCentral.accesoAlternativo },
    },
    horarios: HORARIOS,
    acceso: { socios: ACCESO.socios, funcionarios: ACCESO.funcionarios },
    redes: REDES,
    beneficios: BENEFICIOS_SOCIO.map(({ icono, titulo, texto }) => ({ icono, titulo, texto })),
    preguntasSocio: PREGUNTAS_SOCIO,
    servicios,
    locales,
    convenios: CONVENIOS.map(({ id, nombre, rubro, departamento, localidad, direccion, telefono }) => ({ id, nombre, rubro, departamento, localidad, direccion, telefono })),
    historia: HITOS_PUBLICADOS.map(({ id, anio, titulo, texto }) => ({ id, anio, titulo, texto })),
  };
  return new Response(JSON.stringify(datos), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } });
};
