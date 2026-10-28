# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Socios de COPOL** (más de 36.000): funcionarios policiales y sus familias en todo Uruguay. Entran desde el celular, muchas veces con equipos de gama baja, para consultar créditos, el catálogo del Bazar, servicios sociales, convenios y locales, y para escribir por WhatsApp.
- **Futuros socios:** personal policial o empresas con convenio que evalúan asociarse ("Hacete socio").
- **Público general:** el Hipermercado (Tienda, Bazar, Promociones) está abierto a todo público.
- **Funcionarios de la cooperativa:** usan el Portal de empleados y el **panel de gestión** (stock del Bazar, registros, administración de la portada, usuarios, estadísticas) en la oficina y desde el celular.

## Product Purpose

Sitio institucional y comercial de la Cooperativa Policial (COPOL, desde 1917), que reemplaza al sitio anterior. Reúne en un lugar los beneficios para el socio y el catálogo del Bazar con stock en vivo, y lleva la consulta a WhatsApp o a los locales. Éxito: el socio encuentra en segundos lo que necesita (crédito, producto, servicio, local) y consulta; el funcionario actualiza stock y portada sin ayuda técnica.

## Positioning

Una cooperativa de consumo de la familia policial con más de un siglo, 19 locales en todo el país, dos parques vacacionales (Pinecoop) y compra en cuotas aun estando en clearing. No es una tienda online: no hay precios (salvo las ofertas del supermercado) ni pagos; todo termina en una consulta humana.

## Operating Context

- Consultas por WhatsApp (general 098 872 727; socios 098 631 414) y teléfono 0800 1804.
- Acceso web de socios y recibos de funcionarios viven en sistemas externos (copol.com.uy).
- Contenido de portada, ofertas y aperturas de crédito se editan desde el panel.
- Una app para celular (Expo) consume la API `/api/app/v1`.

## Capabilities and Constraints

- Astro 7 con adaptador de Vercel; páginas institucionales estáticas, Bazar y partes de Inicio en el servidor (server islands), base Turso/libSQL, imágenes en Vercel Blob.
- Sin React ni Tailwind: componentes Astro con anatomía de shadcn/ui en `src/components/ui/`.
- Panel en `panel/` (Hono), en una dirección no publicada; varios roles por persona.
- No romper rutas, redirecciones, formularios, API de la app ni el panel.

## Brand Commitments

- **Manual de marca COPOL 2026:** Verde oscuro #006633, Verde Copol #008D36, Amarillo Copol #F8EA39, Blanco verdozo #EAF4EE. El logotipo no se modifica (sobre verde va en cápsula blanca). Tipografía oficial Articulat CF (sin licencia web todavía; sustituta provisoria Figtree).
- Desde el 28/10/2026 el usuario autorizó una **dirección visual nueva** (fondo, escala y estilo general) siempre con los colores y el logo del manual.
- Voz: voseo, cercana. Nombres: "Pinecoop", "Hacete socio", "Código interno COPOL".
- Banners entregados por la cooperativa se muestran completos, sin recorte.
- Sin numeración visible en las secciones. Las promociones son una cinta continua sin botones.
- Lo visual no se sacrifica al optimizar rendimiento (sombras y carruseles se quedan).

## Evidence on Hand

- Fotos reales de locales, Pinecoop, Casa Central e históricas (`src/assets/`), banners de la cooperativa (`src/assets/banners/`), catálogo del Bazar con 806 productos y fotos (`public/catalogo/`), ilustración y trama de íconos del manual (`src/assets/brand/`).
- Datos confirmados en `src/data/confirmado/` (locales, servicios, convenios, historia, beneficios).
- No existen: testimonios, cifras de satisfacción, precios del Bazar, fotos de Ciudad del Plata. No se inventan. Sin imágenes de IA ni de bancos.

## Product Principles

1. Primero la tarea del socio: crédito, producto, servicio o local en uno o dos toques.
2. Todo termina en una persona: WhatsApp, teléfono o local siempre a mano.
3. Verdad antes que relleno: solo datos confirmados; lo pendiente no se muestra.
4. Liviano en celulares modestos, sin perder lo que lo hace lindo.

## Accessibility & Inclusion

WCAG 2.2 AA: contraste verificado (el Verde Copol no va en texto chico), foco visible, objetivos táctiles de 44 px, `prefers-reduced-motion` respetado, un `<h1>` por página.
