// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

// `site` define URLs canónicas, Open Graph y sitemap. Cambiar si el dominio de producción es otro.
export default defineConfig({
  site: 'https://cooperativapolicial.com.uy',
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
  // Puerto asignado por el entorno (PORT) cuando 4321 está ocupado; 4321 por defecto.
  server: { port: Number(process.env.PORT) || 4321 },
  // Vercel: las páginas son estáticas salvo Bazar, el panel (/panel) y las "server islands" de Inicio,
  // que se ejecutan como funciones para leer el stock y las novedades vigentes de la base de datos.
  adapter: vercel({ maxDuration: 60 }), // 60 s: el asistente puede esperar y reintentar si el plan gratuito de IA limita los pedidos por minuto
  integrations: [sitemap({ filter: (pagina) => !pagina.includes('/panel') })],
  // Redirecciones desde las URLs del sitio anterior (Odoo). Con el adaptador de Vercel se publican
  // como redirecciones permanentes del servidor (308).
  redirects: {
    '/locales': '/sobre-nosotros/locales/',
    '/nuestra-historia': '/sobre-nosotros/nuestra-historia/',
    '/historia': '/sobre-nosotros/nuestra-historia/',
    '/beneficios/psicologo-cop': '/beneficios/servicios-sociales/psicologo/',
    '/beneficios/pinecoop': '/beneficios/servicios-sociales/pinecoop/',
    '/beneficios/abbate': '/beneficios/servicios-sociales/servicio-funebre/',
    '/beneficios/saludbucal': '/beneficios/servicios-sociales/salud-bucal/',
    '/beneficios/viaja-copol': '/beneficios/servicios-sociales/viajes/',
    '/beneficios/veterinaria': '/beneficios/servicios-sociales/veterinaria/',
    '/beneficios/estudio-notarial': '/beneficios/servicios-sociales/estudio-notarial/',
    '/convenios': '/beneficios/convenios/',
    '/tienda': '/hipermercado/tienda/',
    '/bazar': '/hipermercado/bazar/',
    '/promociones': '/hipermercado/promociones/',
    '/como-hacerte-socio': '/hacete-socio/',
    '/contactenos': '/contacto/',
    '/contactus': '/contacto/',
  },
  image: {
    // Las imágenes se sirven optimizadas (WebP) y con tamaños responsive en el build.
    responsiveStyles: true,
  },
});
