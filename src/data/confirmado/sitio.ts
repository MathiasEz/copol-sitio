// Datos institucionales confirmados. Fuente: sitio anterior (cooperativapolicial.com.uy, revisado
// el 12/10/2026), Manual de marca COPOL 2026 y respuestas de la cooperativa. Ver docs/registro-de-activos.md.

export const SITIO = {
  nombre: 'COPOL',
  nombreCompleto: 'Cooperativa Policial',
  lema: 'Por un verdadero cooperativismo',
  fundacion: 1917,
  descripcion:
    'COPOL, la Cooperativa Policial: crédito de socio, Tienda, Bazar, servicios sociales y turismo para socios y sus familias, con 19 locales en todo el país.',
} as const;

/** Textos del Manual de marca COPOL 2026 (págs. 3–5). */
export const MANUAL = {
  origen:
    'Copol nace con el propósito de fortalecer el vínculo entre sus socios, brindando soluciones y beneficios pensados desde una mirada cooperativa. Desde sus comienzos, la institución trabaja para acompañar al equipo policial, promoviendo la solidaridad, el apoyo mutuo y el acceso a servicios que mejoren la calidad de vida de sus integrantes.',
  mision: [
    'Brindar a nuestros socios y sus familias bienes, servicios y soluciones que contribuyan a su bienestar y calidad de vida, procurando condiciones beneficiosas y una atención cercana, responsable y comprometida, reconociendo a nuestros empleados como parte fundamental para alcanzar estos propósitos.',
    'Trabajamos inspirados en los principios y valores del cooperativismo, promoviendo la solidaridad, la integración y el desarrollo de nuestra comunidad, fortaleciendo el vínculo y sentimiento de pertenencia entre nuestros socios y la Cooperativa.',
  ],
  vision: [
    'Ser una cooperativa sólida, cercana y referente para nuestros socios, sus familias y nuestros empleados, capaz de evolucionar y adaptarse a nuevas necesidades, ampliando y mejorando permanentemente nuestros servicios y nuestra forma de trabajar.',
    'Aspiramos a fortalecer el vínculo con cada generación de socios y a consolidar un entorno laboral comprometido y participativo para nuestros empleados, preservando nuestra identidad y trayectoria mientras construimos una Cooperativa moderna, eficiente y sostenible.',
  ],
} as const;

export const CONTACTO = {
  telefono: { texto: '0800 1804', href: 'tel:+59808001804' },
  whatsappGeneral: { texto: '098 872 727', numero: '59898872727' },
  whatsappSocios: { texto: '098 631 414', numero: '59898631414' },
  email: 'socios@copol.com.uy',
  casaCentral: {
    direccion: 'Av. Libertador 1856, esq. Nueva York',
    ciudad: 'Montevideo',
    accesoAlternativo: 'También podés ingresar por Nueva York 1335 (mismo edificio).',
    mapa: 'https://www.google.com/maps/dir/?api=1&destination=-34.8968033,-56.1897777',
  },
} as const;

export const HORARIOS = {
  casaCentral: [
    { dias: 'Lunes a sábado', horas: '8:00 a 21:00' },
    { dias: 'Domingos', horas: '9:00 a 16:00' },
  ],
  telefonica: [
    { dias: 'Lunes a jueves', horas: '9:00 a 17:00' },
    { dias: 'Viernes', horas: '10:00 a 17:00' },
  ],
  tecnicoOptico: [
    { dias: 'Lunes a viernes', horas: '10:00 a 17:00' },
    { dias: 'Sábados', horas: '10:00 a 14:00' },
  ],
} as const;

/** Enlaces externos verificados el 12/10/2026. `null` = pendiente de confirmación (no se publica). */
export const ACCESO = {
  socios: 'https://www.copol.com.uy/CopolSocios/servlet/gamcopollogin',
  funcionarios: 'https://www.copol.com.uy/Copolrecibos/',
  // El APK publicado (https://www.copol.com.uy/CopolSocios/Copol.apk) responde, pero no se modifica
  // desde 2021: queda pendiente hasta que la cooperativa confirme que es la versión vigente.
  appAndroid: null as string | null,
} as const;

export const REDES = {
  facebook: 'https://www.facebook.com/cooperativacopol',
  instagram: 'https://www.instagram.com/hipercopol/',
} as const;

export const CATALOGO_COMPLETO = 'https://sites.google.com/view/catalogo-copol/inicio';

/** Arma un enlace de WhatsApp con mensaje precargado. */
export function whatsapp(numero: string, mensaje?: string): string {
  return `https://wa.me/${numero}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''}`;
}
