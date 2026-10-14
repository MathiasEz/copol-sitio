// Estructura del menú principal (definida en el brief del proyecto).
export interface ItemNav {
  texto: string;
  href: string;
  descripcion?: string;
  hijos?: ItemNav[];
}

export const NAVEGACION: ItemNav[] = [
  { texto: 'Inicio', href: '/' },
  {
    texto: 'Sobre nosotros',
    href: '/sobre-nosotros/',
    hijos: [
      { texto: 'Locales', href: '/sobre-nosotros/locales/', descripcion: 'Casa Central, sucursales y agencias' },
      { texto: 'Nuestra historia', href: '/sobre-nosotros/nuestra-historia/', descripcion: 'Desde 1917, misión y visión' },
    ],
  },
  {
    texto: 'Beneficios',
    href: '/beneficios/',
    hijos: [
      { texto: 'Servicios sociales', href: '/beneficios/servicios-sociales/', descripcion: 'Salud, turismo, Pinecoop y más' },
      { texto: 'Convenios', href: '/beneficios/convenios/', descripcion: 'Comercios adheridos en todo el país' },
    ],
  },
  {
    texto: 'Hipermercado',
    href: '/hipermercado/',
    hijos: [
      { texto: 'Tienda', href: '/hipermercado/tienda/', descripcion: 'Rubros, horarios y local' },
      { texto: 'Bazar', href: '/hipermercado/bazar/', descripcion: 'Catálogo sin precios · consultá stock' },
      { texto: 'Promociones', href: '/hipermercado/promociones/', descripcion: 'Campañas y ofertas vigentes' },
    ],
  },
  { texto: 'Hacete socio', href: '/hacete-socio/' },
  { texto: 'Contacto', href: '/contacto/' },
];
