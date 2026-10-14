// Línea de tiempo de COPOL. Solo hitos con fecha y fuente confirmadas; nada se completa por deducción.
// Fuentes: página "Nuestra historia" del sitio anterior (revisada el 12/10/2026) y Manual de marca COPOL 2026.
//
// Fotos: cada hito acepta `imagen` (nombre en src/assets/img/ o src/assets/historia/). Para sumar las
// fotografías históricas que entregue la cooperativa: copiar el archivo a src/assets/historia/<nombre>.webp
// y completar `imagen`, `alt` y `credito` del hito. Sin imagen, el hito se muestra sin espacio vacío.
//
// Hitos `pendiente`: existen en el sitio o en el material, pero falta el año o el dato. NO se publican
// hasta que la cooperativa lo confirme (ver docs/pendientes.md § Historia).

export interface Hito {
  id: string;
  /** Año (o "Hoy"). */
  anio: string;
  fecha?: string;
  titulo: string;
  texto: string;
  imagen?: string;
  alt?: string;
  credito?: string;
  cita?: { texto: string; autor: string };
  fuente: string;
  pendiente?: string;
}

export const HITOS: Hito[] = [
  {
    id: 'cantinas',
    anio: '1917',
    titulo: 'Nacimos como Cantinas Policiales',
    texto: 'Con el propósito de brindar apoyo y beneficios a la familia policial.',
    imagen: 'cantinas-policiales',
    alt: 'Fotografía histórica en blanco y negro de las Cantinas Policiales, con socios recorriendo el local',
    credito: 'Cantinas Policiales (foto histórica, sin fecha)',
    fuente: 'Sitio anterior, Nuestra historia',
  },
  {
    id: 'cooperativa',
    anio: '1957',
    titulo: 'Se inaugura la Cooperativa Policial',
    texto: 'Inició sus actividades en la calle Cuareim como oficina distribuidora de víveres de la Jefatura de Policía de Montevideo, con un rincón en el sótano de Jefatura que con el tiempo fue creciendo.',
    cita: { texto: 'Inauguré la Cooperativa con un lema, hacer justicia a todo el mundo, resistiendo la injusticia contra el mundo…', autor: 'Cnel. Alberto E. Mussio' },
    fuente: 'Sitio anterior, Nuestra historia',
  },
  {
    id: 'ampliacion',
    anio: '2014',
    fecha: '14 de julio de 2014',
    titulo: 'Comienza la ampliación de la Casa Central',
    texto: 'El Consejo Directivo aprobó el comienzo de las obras de ampliación del edificio, hoy renovado y moderno.',
    imagen: 'casa-central',
    alt: 'Fachada actual de la Casa Central de COPOL',
    credito: 'Casa Central, Av. Libertador 1856',
    fuente: 'Sitio anterior, Nuestra historia',
  },
  {
    id: 'identidad',
    anio: '2026',
    titulo: 'Nueva identidad de marca',
    texto: 'El Manual de marca COPOL 2026 reúne la identidad visual de la cooperativa: colores, tipografía, ilustraciones y la trama de íconos.',
    imagen: 'ilustracion',
    alt: 'Ilustración institucional: personas reunidas alrededor de dos árboles, símbolo del cooperativismo',
    fuente: 'Manual de marca COPOL 2026',
  },
  {
    id: 'hoy',
    anio: 'Hoy',
    titulo: 'Presencia en todo el país',
    texto: 'Casa Central en Montevideo, sucursales y agencias para llegar a cada rincón donde estén nuestros socios.',
    fuente: 'Locales confirmados por la cooperativa',
  },
  // ── Pendientes de confirmación (no se publican) ──
  { id: 'publico', anio: '', titulo: 'Apertura a todo público', texto: 'COPOL es hoy una cooperativa de consumo abierta a todo público.', fuente: 'Pie del sitio anterior', pendiente: 'Falta el año en que se abrió a todo público.' },
  { id: 'cuareim-libertador', anio: '', titulo: 'De la calle Cuareim a la Casa Central de Av. Libertador', texto: 'Traslado a la sede actual.', fuente: 'Deducible del relato, sin fecha', pendiente: 'Falta el año del traslado (y confirmar que ocurrió así).' },
  { id: 'interior', anio: '', titulo: 'Primeras sucursales y agencias del interior', texto: 'Apertura de locales fuera de Montevideo.', fuente: 'Locales actuales', pendiente: 'Faltan los años de apertura de las sucursales y agencias.' },
  { id: 'ampliacion-fin', anio: '', titulo: 'Inauguración de la Casa Central ampliada', texto: 'Fin de las obras aprobadas en 2014.', fuente: 'Sitio anterior ("hoy renovado y moderno")', pendiente: 'Falta el año de finalización.' },
  { id: 'pinecoop', anio: '', titulo: 'Parque Vacacional Pinecoop en Salinas', texto: 'Cabañas, piscina climatizada y bajada directa a la playa para los socios.', fuente: 'Sitio anterior, Pinecoop', pendiente: 'Falta el año de inauguración.' },
  { id: 'pinecoop-chuy', anio: '', titulo: 'Pinecoop Chuy', texto: 'Una nueva experiencia de descanso junto al mar.', fuente: 'Sitio anterior ("Próximamente")', pendiente: 'Falta la fecha de apertura.' },
];

export const HITOS_PUBLICADOS = HITOS.filter((h) => !h.pendiente);
export const HITOS_PENDIENTES = HITOS.filter((h) => h.pendiente);
