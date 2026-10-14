// Servicios sociales. Fuente: subpáginas de cooperativapolicial.com.uy/beneficios/* (revisadas el 12/10/2026).
// No se agregan prestaciones, tarifas ni condiciones que no estén publicadas por la cooperativa.
import { whatsapp } from './sitio';

export type IconoServicio = 'mente' | 'playa' | 'apoyo' | 'diente' | 'avion' | 'mascota' | 'documento';

export interface Contacto {
  etiqueta: string;
  texto: string;
  href: string;
}

export interface Servicio {
  slug: string;
  titulo: string;
  categoria: string;
  resumen: string;
  descripcion: string;
  puntos: string[];
  contactos: Contacto[];
  cta: { texto: string; href: string };
  icono: IconoServicio;
  imagen?: 'pinecoop-salinas' | 'psicologo';
  destacado?: boolean;
  aviso?: string;
}

const tel = (n: string) => `tel:+598${n.replace(/\D/g, '').replace(/^0/, '')}`;

export const SERVICIOS: Servicio[] = [
  {
    slug: 'pinecoop',
    titulo: 'Parque Vacacional Pinecoop',
    categoria: 'Turismo',
    resumen: 'Cabañas, piscina y playa en Salinas.',
    descripcion:
      'Tu espacio de descanso frente al mar, en familia, para vivir momentos únicos todo el año. Un lugar pensado para que disfrutes de Salinas con todas las comodidades.',
    puntos: [
      'Cabañas equipadas con todas las comodidades',
      'Piscina climatizada',
      'Bajada directa a la playa',
      'Parrilleros disponibles para uso de los socios',
      'Salón social disponible para eventos',
    ],
    contactos: [
      { etiqueta: 'WhatsApp', texto: '098 872 727', href: whatsapp('59898872727', 'Hola, quiero info sobre Pinecoop') },
      { etiqueta: 'Atención presencial', texto: 'Lunes a viernes de 9:00 a 17:00 · Sede central, piso 2', href: '/sobre-nosotros/locales/' },
    ],
    cta: { texto: 'Consultá por WhatsApp', href: whatsapp('59898872727', 'Hola, quiero info sobre Pinecoop') },
    icono: 'playa',
    imagen: 'pinecoop-salinas',
    destacado: true,
    aviso: 'Próximamente: Pinecoop Chuy, una nueva experiencia de descanso junto al mar.',
  },
  {
    slug: 'psicologo',
    titulo: 'Psicólogo Copol',
    categoria: 'Salud mental',
    resumen: 'Acompañamiento emocional para vos y tu familia.',
    descripcion:
      'Cuidar tu mente es cuidar tu vida. Un espacio de acompañamiento psicológico profesional junto a Claramente, disponible para socios de todo el país. Luego de la primera instancia, se deriva según corresponda.',
    puntos: [
      'Primera consulta gratuita por videollamada (todo el país)',
      'Atención en salud mental, adicciones y prevención del suicidio',
      'Disponible para socios de todo el país',
      'Recursos y capacitaciones para el bienestar emocional',
    ],
    contactos: [
      { etiqueta: 'WhatsApp (solo mensajes)', texto: '099 411 050', href: whatsapp('59899411050', 'Hola, quiero info') },
      { etiqueta: 'Prevención del suicidio', texto: '0800 0767', href: 'tel:08000767' },
      { etiqueta: 'Adicciones', texto: '2309 1020', href: tel('23091020') },
      { etiqueta: 'Apoyo emocional', texto: '0800 1920', href: 'tel:08001920' },
      { etiqueta: 'App Claramente (iOS)', texto: 'App Store', href: 'https://apps.apple.com/uy/app/claramente-salud-mental/id6739811122' },
      { etiqueta: 'App Claramente (Android)', texto: 'Google Play', href: 'https://play.google.com/store/apps/details?id=claramente.androidproject' },
    ],
    cta: { texto: 'Escribile al psicólogo', href: whatsapp('59899411050', 'Hola, quiero info') },
    icono: 'mente',
    imagen: 'psicologo',
  },
  {
    slug: 'servicio-funebre',
    titulo: 'Servicio fúnebre',
    categoria: 'Asistencia',
    resumen: 'Abbate y Cía. Líneas 24 horas.',
    descripcion:
      'Porque estar acompañado marca la diferencia en los momentos difíciles. Servicio con asistencia inmediata: contactá directamente y recibí el acompañamiento que necesitás.',
    puntos: [
      'Asistencia fúnebre integral para socios y su grupo familiar',
      'Acompañamiento y asesoramiento integral en cada momento',
      'Disponible para todo el país',
    ],
    contactos: [
      { etiqueta: 'Línea 24 horas', texto: '0800 8508', href: 'tel:08008508' },
      { etiqueta: 'WhatsApp 24 horas', texto: '097 352 367', href: whatsapp('59897352367') },
      { etiqueta: 'Teléfono', texto: '2622 2032', href: tel('26222032') },
    ],
    cta: { texto: 'Llamar al 0800 8508', href: 'tel:08008508' },
    icono: 'apoyo',
  },
  {
    slug: 'salud-bucal',
    titulo: 'Copol Salud Bucal',
    categoria: 'Salud',
    resumen: 'Odontología integral para socios y familia.',
    descripcion:
      'Servicio integral de odontología para socios y sus familias. Contamos con dos opciones de odontólogos y te derivamos al profesional correspondiente según tu departamento de residencia.',
    puntos: [
      'Odontología general y operatoria dental',
      'Tratamiento de conducto y endodoncia',
      'Cirugía, prótesis e implantes',
      'Ortopedia y ortodoncia',
    ],
    contactos: [
      { etiqueta: 'WhatsApp', texto: '097 742 303', href: whatsapp('59897742303', 'Hola, quiero info sobre salud bucal') },
      { etiqueta: 'WhatsApp', texto: '091 437 950', href: whatsapp('59891437950', 'Hola, quiero info sobre salud bucal') },
    ],
    cta: { texto: 'Consultá por WhatsApp', href: whatsapp('59897742303', 'Hola, quiero info sobre salud bucal') },
    icono: 'diente',
  },
  {
    slug: 'viajes',
    titulo: 'Viajá con Copol',
    categoria: 'Turismo',
    resumen: 'Tu viaje, financiado en cuotas.',
    descripcion:
      'Descubrí nuevos destinos con Viajá con Copol: un convenio que te permite pagar poco a poco y disfrutar más de cada viaje.',
    puntos: ['Cotizá tu viaje sin compromiso', 'Financiá el total en cuotas a través de Copol'],
    contactos: [
      { etiqueta: 'WhatsApp', texto: '098 492 925', href: whatsapp('59898492925', 'Hola, quiero info sobre viajes') },
      { etiqueta: 'WhatsApp', texto: '091 213 956', href: whatsapp('59891213956', 'Hola, quiero info sobre viajes') },
    ],
    cta: { texto: 'Cotizá tu viaje', href: whatsapp('59898492925', 'Hola, quiero info sobre viajes') },
    icono: 'avion',
  },
  {
    slug: 'veterinaria',
    titulo: 'Servicio veterinario',
    categoria: 'Mascotas',
    resumen: 'Emergencias las 24 horas, los 7 días.',
    descripcion:
      'Porque tus mascotas también son familia: servicio de veterinaria integral, con emergencias disponibles los 7 días de la semana.',
    puntos: [
      'Atención integral: consultas, vacunación y cirugía',
      'Emergencia 24 horas, los 7 días',
      'Cotizá la atención y financiala en cuotas a través de Copol',
    ],
    contactos: [
      { etiqueta: 'Días hábiles, 9:00 a 18:00', texto: '092 785 874', href: whatsapp('59892785874', 'Hola, quiero info sobre veterinaria') },
      { etiqueta: 'Sábados, domingos y nocturno (18:00 a 9:00)', texto: '098 503 975', href: whatsapp('59898503975') },
    ],
    cta: { texto: 'Consultá por WhatsApp', href: whatsapp('59892785874', 'Hola, quiero info sobre veterinaria') },
    icono: 'mascota',
    aviso: 'Actualmente disponible solo en Montevideo.',
  },
  {
    slug: 'estudio-notarial',
    titulo: 'Estudio jurídico notarial',
    categoria: 'Legal',
    resumen: 'Arretche Coelho & Asociados.',
    descripcion:
      'Accedé a servicios notariales y legales con Arretche Coelho & Asociados, con atención personalizada para socios.',
    puntos: [
      'Solicitás la cotización del servicio notarial',
      'Copol habilita la financiación en cuotas',
      'Gestionás tu trámite con Arretche Coelho & Asociados',
    ],
    contactos: [
      { etiqueta: 'WhatsApp (Arretche Coelho & Asociados)', texto: '092 014 553', href: whatsapp('59892014553', 'Hola, quiero info sobre servicio notarial') },
    ],
    cta: { texto: 'Consultá por WhatsApp', href: whatsapp('59892014553', 'Hola, quiero info sobre servicio notarial') },
    icono: 'documento',
  },
];
