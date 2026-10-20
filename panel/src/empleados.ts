// "Información empleados": página interna del panel para todo el personal (cualquier rol).
// Estructura según el boceto del 15/10/2026: Acoso laboral (QR), ¿Cómo te sentís hoy? (QR), Reglamento interno
// (QR, 20/10/2026), Tu cooperativa (carrusel), Ciudad del Plata (abre pronto), Pinecoop Chuy (en obras) y Tus recibos.
// La misma información se publica en la web en /portal-empleados/ (Acceso web → Portal de empleados).
// Los enlaces y las imágenes los cargan los administradores desde el panel; se guardan como JSON en la
// tabla `ajustes`. Los QR se generan en el servidor a partir de cada enlace (siempre nítidos).
import * as ZX from '@zxing/library';
import { ahora, ejecutar, una, type Db } from './db.ts';

const Z = ((ZX as unknown as { default?: typeof ZX }).default ?? ZX);
const CLAVE = 'portal_empleados';

export interface ImagenPortal { src: string; alt: string }
export interface Portal {
  /** Protocolo de prevención y erradicación del acoso, violencia laboral y discriminación (RR.HH.). */
  acosoUrl: string;
  /** Encuesta "¿Cómo te sentís hoy?". */
  animoUrl: string;
  /** Recibos de sueldo. */
  recibosUrl: string;
  /** Reglamento interno del personal (documento de Google). */
  reglamentoUrl: string;
  carrusel: ImagenPortal[];
  ciudadDelPlata: ImagenPortal[];
  chuy: ImagenPortal[];
}
export type Grupo = 'carrusel' | 'ciudadDelPlata' | 'chuy';
export const GRUPOS: Record<Grupo, { titulo: string; max: number }> = {
  carrusel: { titulo: 'Tu cooperativa (carrusel)', max: 8 },
  ciudadDelPlata: { titulo: 'Próximamente Ciudad del Plata', max: 1 },
  chuy: { titulo: 'Pinecoop Chuy', max: 2 },
};

const FOTO = (n: string, alt: string): ImagenPortal => ({ src: `/panel-recursos/empleados/${n}.webp`, alt });
/**
 * Contenido inicial. Enlaces: los de los QR entregados por la cooperativa el 16/10/2026 (verificados: el
 * protocolo es un PDF y la encuesta un formulario de Google) y el portal oficial de recibos de funcionarios.
 * Carrusel: piezas gráficas de la cooperativa (4:5), en el orden entregado; se muestran completas, sin recorte.
 */
export const PORTAL_INICIAL: Portal = {
  acosoUrl: 'https://149508.asset.memtas.com/storage/picture/608c53b1ff5b4a9801b35f37/6acf93c65d1e8d0323743295.pdf?utm_source=email_marketing&utm_admin=149508&utm_medium=email&utm_campaign=Protocolo_de_Acoso_y_Violencia_Laboral',
  animoUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSeDHOygPj5L5LANRDR1ZcVKAYNSGGDfv0rl9x3R1j1AK3bMmw/viewform',
  recibosUrl: 'https://www.copol.com.uy/Copolrecibos/',
  reglamentoUrl: 'https://docs.google.com/document/d/1Og20fKBJAvWLXgwGErY8JNF49a0IKNjk/edit?usp=sharing&ouid=106387702374856035616&rtpof=true&sd=true',
  carrusel: [
    FOTO('hacete-socio', 'Hacete socio. Conocé tus beneficios. Escribinos por WhatsApp al 098 631 414.'),
    FOTO('parques-y-locales', '2 parques vacacionales y más de 20 locales en todo el país. Próximamente: Parque vacacional Pinecoop Chuy. Parque vacacional Pinecoop Salinas, Canelones.'),
    FOTO('servicios-salud-mental', 'COPOL Salud Mental: primera consulta gratuita por videollamada, para socios de todo el país, WhatsApp 099 411 050. Servicio fúnebre Abbate: línea 24 h 0800 8508, 097 352 367, 2622 2032. Estudio Jurídico Notarial Arretche Coelho & Asociados: 092 014 553.'),
    FOTO('servicios-salud-bucal', 'COPOL Salud Bucal: odontología general, operatoria, endodoncia, cirugía, prótesis, ortodoncia e implantes, 097 742 303 y 091 437 950. Clínica veterinaria: emergencia 24 horas, 092 785 874. Viajá con COPOL: 098 492 925 y 091 213 956. Convenios: Bookshop, barracas y ferretería, gomería y gimnasio para socios.'),
    FOTO('locales-del-interior', 'En nuestros locales del interior tenés todo a tu alcance: supermercado, óptica, farmacia, recargas de gas, mueblería, barracas, tienda y zapatería. Nuevo convenio: Stadium.'),
    FOTO('garantia-alquiler', 'Garantía de alquiler COPOL + Porto Seguro. Financiás sin tarjeta.'),
    FOTO('claro-socios-nuevos', 'Contrato especial Claro para socios nuevos en COPOL, $396: 100 GB de internet, WhatsApp gratis, 3000 minutos, 500 SMS, saldo incluido de $200, 1 mes de Prime Video y roaming en Europa y América.'),
  ],
  ciudadDelPlata: [],
  chuy: [FOTO('pinecoop-chuy', 'Cartel de madera “El rincón de mi viejo” entre eucaliptos en el predio de Pinecoop Chuy, en obras')],
};

const lista = (v: unknown, max: number): ImagenPortal[] =>
  (Array.isArray(v) ? v : [])
    .filter((i): i is ImagenPortal => !!i && typeof i.src === 'string' && typeof i.alt === 'string')
    .map((i) => ({ src: i.src, alt: i.alt.slice(0, 400) }))
    .slice(0, max);

export async function obtenerPortal(db: Db): Promise<Portal> {
  const fila = await una<{ valor: string }>(db, 'SELECT valor FROM ajustes WHERE clave = ?', [CLAVE]);
  if (!fila) return structuredClone(PORTAL_INICIAL);
  let d: Partial<Portal> = {};
  try { d = JSON.parse(fila.valor); } catch { /* valor dañado: se usa el inicial */ }
  const texto = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    acosoUrl: texto(d.acosoUrl), animoUrl: texto(d.animoUrl), recibosUrl: texto(d.recibosUrl),
    // Guardados antes de existir el reglamento: se usa el enlace entregado por la cooperativa.
    reglamentoUrl: typeof d.reglamentoUrl === 'string' ? d.reglamentoUrl : PORTAL_INICIAL.reglamentoUrl,
    carrusel: lista(d.carrusel, GRUPOS.carrusel.max), ciudadDelPlata: lista(d.ciudadDelPlata, GRUPOS.ciudadDelPlata.max), chuy: lista(d.chuy, GRUPOS.chuy.max),
  };
}

export async function guardarPortal(db: Db, p: Portal) {
  await ejecutar(db, 'INSERT INTO ajustes (clave, valor, actualizado_en) VALUES (?, ?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor, actualizado_en = excluded.actualizado_en', [CLAVE, JSON.stringify(p), ahora()]);
}

/** Enlace válido para un QR o un botón: https (o http) y sin espacios. Vacío = sin enlace. */
export function validarEnlace(v: unknown): { url: string; error?: string } {
  const url = typeof v === 'string' ? v.trim() : '';
  if (!url) return { url: '' };
  if (url.length > 500) return { url, error: 'El enlace es demasiado largo (máximo 500 caracteres).' };
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error();
  } catch {
    return { url, error: 'Pegá un enlace completo que empiece con https://' };
  }
  return { url };
}

const cacheQr = new Map<string, string>();
/** QR en SVG (sin estilos en línea: la política de seguridad del panel los bloquea). */
export function qrSvg(texto: string, etiqueta: string): string {
  const clave = `${texto}\n${etiqueta}`;
  const guardado = cacheQr.get(clave);
  if (guardado) return guardado;
  const pistas = new Map<ZX.EncodeHintType, unknown>([[Z.EncodeHintType.ERROR_CORRECTION, Z.QRCodeDecoderErrorCorrectionLevel.M], [Z.EncodeHintType.MARGIN, 0]]);
  const m = new Z.QRCodeWriter().encode(texto, Z.BarcodeFormat.QR_CODE, 0, 0, pistas);
  const n = m.getWidth();
  const margen = 4;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m.get(x, y)) d += `M${x + margen} ${y + margen}h1v1h-1z`;
  const escapar = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
  const svg = `<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + margen * 2} ${n + margen * 2}" role="img" aria-label="${escapar(etiqueta)}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  if (cacheQr.size > 50) cacheQr.clear();
  cacheQr.set(clave, svg);
  return svg;
}
