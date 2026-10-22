// Banner de Inicio: diapositivas a todo el ancho (imagen + texto que no la tapa), editables desde el panel
// en "Administración Página". Se guardan como JSON en la tabla `ajustes` (como "Información empleados");
// mientras nadie lo edite, se muestra el contenido inicial (el del carrusel anterior de Inicio).
// El mismo HTML (htmlBanner) se usa en la web pública y en la vista previa del panel, con los estilos de
// src/styles/banner-inicio.css y el comportamiento de src/scripts/banner-inicio.js (copiados al panel en el build).
import crypto from 'node:crypto';
import { ahora, ejecutar, una, type Db } from './db.ts';
import { hoyUruguay } from './fechas.ts';

const CLAVE = 'banner_inicio';

/** Dónde va el texto. Ninguna opción tapa la imagen de forma importante. */
export const DISENOS = {
  lateral: { nombre: 'Texto al costado', ayuda: 'La imagen queda libre, sin nada encima. Ideal para piezas gráficas.' },
  tarjeta: { nombre: 'Recuadro sobre la foto', ayuda: 'Un recuadro chico en la esquina inferior. Para fotos con espacio libre abajo a la izquierda.' },
  'solo-imagen': { nombre: 'Solo imagen', ayuda: 'Sin texto: para piezas que ya traen el texto. Toda la imagen es un enlace si cargás el botón principal.' },
} as const;
export type Diseno = keyof typeof DISENOS;
export const esDiseno = (v: unknown): v is Diseno => typeof v === 'string' && v in DISENOS;

/** Punto de interés de la foto: qué parte se conserva al recortarla para llenar el espacio. */
export const FOCOS = {
  'arriba-izquierda': '0% 0%', arriba: '50% 0%', 'arriba-derecha': '100% 0%',
  izquierda: '0% 50%', centro: '50% 50%', derecha: '100% 50%',
  'abajo-izquierda': '0% 100%', abajo: '50% 100%', 'abajo-derecha': '100% 100%',
} as const;
export type Foco = keyof typeof FOCOS;
export const esFoco = (v: unknown): v is Foco => typeof v === 'string' && v in FOCOS;

export interface Boton { texto: string; url: string }
export interface Diapositiva {
  id: string;
  antetitulo: string;
  titulo: string;
  /** Parte final del título, resaltada en amarillo (opcional). */
  resaltado: string;
  texto: string;
  /** Cartel chico sobre la imagen (opcional), p. ej. "Próximamente". */
  etiqueta: string;
  /** URL de la variante grande (…-1600.webp): Vercel Blob, carpeta local del panel o /banner/ del sitio. */
  imagen: string;
  /** Imagen para celulares (opcional), se muestra completa. */
  imagenMovil: string;
  alt: string;
  diseno: Diseno;
  /** true: la imagen se muestra entera (sin recorte), con un fondo difuminado de la misma imagen. */
  completa: boolean;
  foco: Foco;
  boton1: Boton | null;
  boton2: Boton | null;
  publicado: boolean;
  /** Fechas (AAAA-MM-DD, hora de Uruguay) entre las que se muestra; vacías = siempre. */
  desde: string;
  hasta: string;
  actualizado_en?: string;
  actualizado_por?: string;
}
export interface Banner {
  /** Segundos que se muestra cada diapositiva antes de pasar a la siguiente. */
  segundos: number;
  diapositivas: Diapositiva[];
}
export const SEGUNDOS = { min: 4, max: 12, defecto: 6 } as const;
export const MAX_DIAPOSITIVAS = 8;

const wa = (mensaje: string) => `https://wa.me/59898872727?text=${encodeURIComponent(mensaje)}`;
const base = (d: Partial<Diapositiva> & Pick<Diapositiva, 'id' | 'titulo' | 'imagen' | 'alt'>): Diapositiva => ({
  antetitulo: '', resaltado: '', texto: '', etiqueta: '', imagenMovil: '', diseno: 'lateral', completa: false, foco: 'centro',
  boton1: null, boton2: null, publicado: true, desde: '', hasta: '', ...d,
});

/** Contenido inicial: las cuatro diapositivas del carrusel de Inicio anterior, con imágenes de public/banner/. */
export const BANNER_INICIAL: Banner = {
  segundos: SEGUNDOS.defecto,
  diapositivas: [
    base({
      id: 'institucional',
      antetitulo: 'Cooperativa de consumo · Desde 1917',
      titulo: 'Bienes, servicios y soluciones para vos y',
      resaltado: 'tu familia',
      texto: 'Créditos, Tienda, Bazar, turismo y servicios sociales, con atención cercana en 19 locales de todo el país.',
      etiqueta: 'Parque Vacacional Pinecoop',
      imagen: '/banner/pinecoop-salinas-1600.webp',
      alt: 'Piscina con reposeras y sombrillas del Parque Vacacional Pinecoop, rodeada de cabañas y jardín.',
      foco: 'abajo',
      boton1: { texto: 'Hacete socio', url: '/hacete-socio/' },
      boton2: { texto: 'Conocé los beneficios', url: '/beneficios/' },
    }),
    base({
      id: 'pinecoop',
      antetitulo: 'Servicios sociales · Turismo',
      titulo: 'Parque Vacacional Pinecoop',
      texto: 'Tu espacio de descanso frente al mar en Salinas: cabañas equipadas, piscina climatizada y bajada directa a la playa.',
      etiqueta: 'Próximamente: Pinecoop Chuy',
      imagen: '/banner/pinecoop-chuy-1600.webp',
      alt: 'Cartel de madera “El rincón de mi viejo” entre eucaliptos en el predio de Pinecoop Chuy.',
      boton1: { texto: 'Conocé Pinecoop', url: '/beneficios/servicios-sociales/pinecoop/' },
      boton2: { texto: 'Consultá por WhatsApp', url: wa('Hola, quiero info sobre Pinecoop') },
    }),
    base({
      id: 'motos',
      antetitulo: 'Bazar · Nuevos ingresos',
      titulo: 'Llevate tu moto 0 km',
      texto: 'Zanella Pollerita y Sapucai, hasta en 15 cuotas sin recargo. Vení a verlas al local o consultá por WhatsApp.',
      imagen: '/banner/motos-1600.webp',
      alt: 'Pieza gráfica: “Subite a una Zanella” Due 110 ST, 15 cuotas sin recargo.',
      completa: true,
      boton1: { texto: 'Ver el Bazar', url: '/hipermercado/bazar/' },
      boton2: { texto: 'Consultar', url: wa('Hola! Quiero info sobre las motos nuevas en stock') },
    }),
    base({
      id: 'garantia',
      antetitulo: 'Nuevo convenio',
      titulo: 'Garantía de alquiler con Porto Seguro',
      texto: 'Garantía de alquiler en todo el país, hasta en 10 cuotas sin tarjeta.',
      imagen: '/banner/garantia-alquiler-1600.webp',
      alt: 'Pieza gráfica del nuevo convenio Porto Seguro y COPOL: garantía de alquiler.',
      completa: true,
      boton1: { texto: 'Ver convenios', url: '/beneficios/convenios/' },
      boton2: { texto: 'Consultar', url: wa('Hola, quiero info sobre la garantía de alquiler') },
    }),
  ],
};

/** Diapositiva nueva (formulario vacío). */
export const diapositivaVacia = (): Diapositiva => base({ id: '', titulo: '', imagen: '', alt: '' });

// ── Lectura y guardado ──
const cadena = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const boton = (v: unknown): Boton | null => {
  const b = v as Partial<Boton> | null;
  return b && typeof b.texto === 'string' && typeof b.url === 'string' && b.texto && b.url ? { texto: b.texto.slice(0, 40), url: b.url.slice(0, 500) } : null;
};
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
function limpiar(v: unknown): Diapositiva | null {
  const d = v as Record<string, unknown>;
  if (!d || typeof d.id !== 'string' || typeof d.titulo !== 'string' || typeof d.imagen !== 'string' || !d.imagen) return null;
  return {
    id: d.id.slice(0, 24), antetitulo: cadena(d.antetitulo, 60), titulo: d.titulo.slice(0, 100), resaltado: cadena(d.resaltado, 40),
    texto: cadena(d.texto, 240), etiqueta: cadena(d.etiqueta, 40), imagen: d.imagen, imagenMovil: cadena(d.imagenMovil, 500), alt: cadena(d.alt, 300),
    diseno: esDiseno(d.diseno) ? d.diseno : 'lateral', completa: d.completa === true, foco: esFoco(d.foco) ? d.foco : 'centro',
    boton1: boton(d.boton1), boton2: boton(d.boton2), publicado: d.publicado !== false,
    desde: typeof d.desde === 'string' && FECHA.test(d.desde) ? d.desde : '', hasta: typeof d.hasta === 'string' && FECHA.test(d.hasta) ? d.hasta : '',
    actualizado_en: cadena(d.actualizado_en, 40) || undefined, actualizado_por: cadena(d.actualizado_por, 120) || undefined,
  };
}

export async function obtenerBanner(db: Db): Promise<Banner> {
  const fila = await una<{ valor: string }>(db, 'SELECT valor FROM ajustes WHERE clave = ?', [CLAVE]);
  if (!fila) return structuredClone(BANNER_INICIAL);
  let d: Partial<Banner> = {};
  try { d = JSON.parse(fila.valor); } catch { /* valor dañado: se usa el inicial */ return structuredClone(BANNER_INICIAL); }
  const segundos = Number(d.segundos);
  return {
    segundos: Number.isInteger(segundos) && segundos >= SEGUNDOS.min && segundos <= SEGUNDOS.max ? segundos : SEGUNDOS.defecto,
    diapositivas: (Array.isArray(d.diapositivas) ? d.diapositivas : []).map(limpiar).filter((x): x is Diapositiva => x !== null).slice(0, MAX_DIAPOSITIVAS),
  };
}

export async function guardarBanner(db: Db, b: Banner) {
  await ejecutar(db, 'INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en', [CLAVE, JSON.stringify(b), ahora()]);
}

export const nuevoId = () => crypto.randomBytes(6).toString('base64url');

export { hoyUruguay };

/** Estado público de una diapositiva en una fecha. */
export function estadoDiapositiva(d: Diapositiva, hoy = hoyUruguay()): 'publicada' | 'borrador' | 'programada' | 'vencida' {
  if (!d.publicado) return 'borrador';
  if (d.desde && hoy < d.desde) return 'programada';
  if (d.hasta && hoy > d.hasta) return 'vencida';
  return 'publicada';
}
export const vigentes = (b: Banner, hoy = hoyUruguay()) => b.diapositivas.filter((d) => estadoDiapositiva(d, hoy) === 'publicada');

// ── HTML (web pública y vista previa del panel) ──
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** Variante de otro ancho (…-1600.webp → …-800.webp). */
const ancho = (url: string, a: number) => url.replace(/-\d+\.webp$/, `-${a}.webp`);
const srcset = (url: string) => (/-\d+\.webp$/.test(url) ? `${esc(ancho(url, 800))} 800w, ${esc(url)} 1600w` : '');
const externo = (url: string) => /^https?:/i.test(url);
const FLECHA = '<svg class="bi__icono" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>';
const CHEVRON = (d: string) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
const atrEnlace = (url: string) => `href="${esc(url)}"${externo(url) ? ' rel="noopener"' : ''}`;
/** Título completo (para etiquetas accesibles). */
export const tituloCompleto = (d: Pick<Diapositiva, 'titulo' | 'resaltado'>) => [d.titulo, d.resaltado].filter(Boolean).join(' ');

export interface OpcionesHtml {
  segundos: number;
  /** Vista previa del panel: incluye todos los elementos (vacíos ocultos) para editarlos en vivo y las dos imágenes. */
  editable?: boolean;
  /** La primera imagen es la más importante de la página (LCP). */
  prioridad?: boolean;
}

function htmlDiapositiva(d: Diapositiva, i: number, total: number, o: OpcionesHtml) {
  const ed = Boolean(o.editable);
  const oculto = (vacio: boolean) => (vacio ? ' hidden' : '');
  const campo = (n: string) => (ed ? ` data-bi-campo="${n}"` : '');
  const ancha = d.diseno !== 'lateral';
  const sizes = ancha ? '(min-width: 1280px) 1216px, 100vw' : '(min-width: 1280px) 760px, (min-width: 720px) 62vw, 100vw';
  const primera = i === 0;
  const carga = primera ? `loading="eager"${o.prioridad ? ' fetchpriority="high"' : ''}` : 'loading="lazy"';
  const sinImagen = ed && !d.imagen;
  const imgPrincipal = `<img class="bi__img" src="${esc(d.imagen ? ancho(d.imagen, 800) : '')}"${srcset(d.imagen) ? ` srcset="${srcset(d.imagen)}" sizes="${sizes}"` : ''} alt="${esc(d.alt)}" ${carga} decoding="async" draggable="false"${campo('imagen')}${oculto(sinImagen)}>`;
  // En la web, la imagen para celular se elige con <picture>; en la vista previa del panel van las dos
  // y los estilos muestran la que corresponde según el ancho del recuadro (vista Computadora / Celular).
  const media = ed
    ? `${imgPrincipal}<img class="bi__img-movil" src="${esc(d.imagenMovil ? ancho(d.imagenMovil, 800) : '')}" alt="" draggable="false" data-bi-campo="imagen-movil"${oculto(!d.imagenMovil)}>`
    : d.imagenMovil
      ? `<picture><source media="(max-width: 783px)" srcset="${srcset(d.imagenMovil) || esc(d.imagenMovil)}" sizes="100vw">${imgPrincipal}</picture>`
      : imgPrincipal;
  const fondo = `<img class="bi__fondo" src="${esc(d.imagen ? ancho(d.imagen, 800) : '')}" alt="" aria-hidden="true" loading="lazy" decoding="async" draggable="false"${campo('fondo')}>`;
  const b1 = d.boton1, b2 = d.boton2;
  const botones = `<div class="bi__acciones"${oculto(!b1 && !b2)}${campo('acciones')}>
        <a class="bi__boton bi__boton--principal" ${b1 ? atrEnlace(b1.url) : 'href="#"'}${oculto(!b1)}${campo('boton1')}><span${campo('boton1-texto')}>${esc(b1?.texto ?? '')}</span>${FLECHA}</a>
        <a class="bi__boton bi__boton--secundario" ${b2 ? atrEnlace(b2.url) : 'href="#"'}${oculto(!b2)}${campo('boton2')}><span${campo('boton2-texto')}>${esc(b2?.texto ?? '')}</span></a>
      </div>`;
  const soloImagen = d.diseno === 'solo-imagen';
  const enlaceTotal = soloImagen && b1 && !ed ? `<a class="bi__enlace-total" ${atrEnlace(b1.url)} aria-label="${esc(`${b1.texto}: ${tituloCompleto(d)}`)}"></a>` : '';
  const clases = ['bi__diapo', `bi__diapo--${d.diseno}`, `bi__foco--${d.foco}`, d.completa && 'bi__diapo--completa', d.imagenMovil && 'bi__diapo--con-movil', primera && 'activa'].filter(Boolean).join(' ');
  return `<article class="${clases}" data-bi-diapo aria-roledescription="diapositiva" aria-label="${esc(`${i + 1} de ${total}: ${tituloCompleto(d)}`)}">
    <div class="bi__media">
      ${fondo}
      ${media}
      ${ed ? `<span class="bi__vacio" data-bi-campo="vacio"${oculto(!sinImagen)}>Elegí una imagen para ver la vista previa</span>` : ''}
      <span class="bi__etiqueta"${oculto(!d.etiqueta)}${campo('etiqueta')}>${esc(d.etiqueta)}</span>
    </div>
    <div class="bi__texto">
      <span class="bi__antetitulo"${oculto(!d.antetitulo)}${campo('antetitulo')}>${esc(d.antetitulo)}</span>
      <h2 class="bi__titulo"><span class="bi__linea"><span${campo('titulo')}>${esc(d.titulo)}</span> <mark class="bi__resaltado"${oculto(!d.resaltado)}${campo('resaltado')}>${esc(d.resaltado)}</mark></span></h2>
      <p class="bi__bajada"${oculto(!d.texto)}${campo('texto')}>${esc(d.texto)}</p>
      ${botones}
    </div>
    ${enlaceTotal}
  </article>`;
}

/** HTML completo del banner (sin diapositivas, devuelve ''). */
export function htmlBanner(diapositivas: Diapositiva[], o: OpcionesHtml) {
  if (!diapositivas.length) return '';
  const n = diapositivas.length;
  const segundos = Math.min(SEGUNDOS.max, Math.max(SEGUNDOS.min, Math.round(o.segundos)));
  const controles = n > 1
    ? `<div class="bi__controles" data-bi-controles hidden>
    <button type="button" class="bi__flecha" data-bi-anterior aria-label="Diapositiva anterior">${CHEVRON('m15 18-6-6 6-6')}</button>
    <div class="bi__indicadores" role="group" aria-label="Elegir diapositiva">${diapositivas.map((d, i) => `<button type="button" class="bi__indicador" data-bi-indicador="${i}" aria-label="${esc(`Mostrar ${i + 1}: ${tituloCompleto(d)}`)}"${i === 0 ? ' aria-current="true"' : ''}><span class="bi__progreso"></span></button>`).join('')}</div>
    <button type="button" class="bi__flecha" data-bi-siguiente aria-label="Diapositiva siguiente">${CHEVRON('m9 18 6-6-6-6')}</button>
  </div>`
    : '';
  return `<copol-banner class="bi${o.editable ? ' bi--editable' : ''}" data-bi data-bi-segundos="${segundos}" role="region" aria-roledescription="carrusel" aria-label="Novedades destacadas">
  <div class="bi__pista" data-bi-pista>
    ${diapositivas.map((d, i) => htmlDiapositiva(d, i, n, o)).join('\n    ')}
  </div>
  ${controles}
</copol-banner>`;
}
