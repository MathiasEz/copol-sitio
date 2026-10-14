# Registro de activos y fuentes

Permiso: la cooperativa autorizó el 12/10/2026 descargar y reutilizar los recursos oficiales de cooperativapolicial.com.uy, con exclusión de imágenes generadas por IA o con apariencia de banco de imágenes. Manifiesto técnico con URL, tamaño y fecha: `assets-source/manifest.json`.

## Marca

| Recurso | Archivo | Origen | Uso | Notas |
|---|---|---|---|---|
| Logotipo | `src/assets/brand/logo-copol.svg` | `cooperativapolicial.com.uy/web/image/website/1/logo` | Encabezado, pie, imagen OG | Vectorial, sin modificar. Coincide con el manual. |
| Logotipo PNG | `assets-source/original/logo-copol-alt.png` | sitio, ID 1293 | Respaldo (no usado) | |
| Isotipo | `assets-source/manual/isotipo-manual.png` → `public/favicon.png`, `public/apple-touch-icon.png` | Manual de marca, pág. 8 (recorte) | Favicon | Conviene recibir el isotipo en SVG. |
| Ilustración "Cooperativismo" | `src/assets/brand/ilustracion-cooperativismo.webp` | Manual, pág. 13 (recorte; se cubrió la palabra "Ilustración" del margen) | Inicio, "Nuestra esencia" | Conviene recibir el archivo vectorial original. |
| Trama de íconos | `src/assets/brand/trama-iconos.webp` | Manual, pág. 12 | Disponible | |
| Imagen Open Graph | `public/og-copol.jpg` | Generada (logo + lema) | Redes sociales | `npm run assets:iconos` |

## Fotografías y piezas (sitio anterior)

| Recurso | Archivo WebP | ID origen | Uso | Notas |
|---|---|---|---|---|
| Pinecoop Salinas (aérea) | `src/assets/img/pinecoop-salinas.webp` | 764 | Carrusel, Inicio, Servicios sociales, Beneficios | Foto real; 3 MB → 233 KB. |
| Pinecoop Chuy | `pinecoop-chuy.webp` | 1404 | Carrusel, ficha Pinecoop | Se recortaron los bordes blancos. |
| Interior de la tienda | `tienda-interior.webp` | 702 | Hipermercado, Tienda | Foto real profesional. |
| Fachada Casa Central | `casa-central.webp` | 552 | Sobre nosotros, Historia | |
| Cantinas Policiales (histórica) | `cantinas-policiales.webp` | 673 | Historia, Sobre nosotros | Captura de pantalla de una foto antigua: pedir el original. |
| Salón de eventos | `fiestas-eventos.webp` | 693 | Novedades (Inicio) | Captura de pantalla. |
| Banner Garantía de alquiler (Porto Seguro) | `banner-garantia-alquiler.webp` | 1417 | Carrusel, Novedades, Promociones | Pieza con marca de tercero (Porto Seguro). |
| Banners motos Zanella | `banner-motos-1.webp`, `banner-motos-2.webp`, `motos-bazar.webp` | 1416, 1415, 1295 | Carrusel, Novedades, Promociones, Tienda | Campaña con marca Zanella; confirmar vigencia. |
| Piezas "Oferta COPOL" | `oferta-1-movil.webp`, `oferta-2-movil.webp` | 1482, 1483 | No usadas (desde la 4.ª ronda) | Reemplazadas por las ofertas de octubre (§ Ofertas del supermercado). |
| Flyer Psicólogo Copol + Claramente | `psicologo.webp` | 1287 | Ficha Psicólogo | Incluye la marca Claramente (tercero). |
| Captura fachada antigua | `historia-captura.webp` | 697 | No usada | Similar a Casa Central. |
| Piezas "Hacete socio" y "Servicios sociales" (sitio anterior) | `banner-hacete-socio.webp`, `banner-servicios-sociales.webp` | 1425, 1426 | No usadas | Reemplazadas por los banners nuevos entregados por la cooperativa (§ Banners de Inicio). |

## Excluidos

| Recurso | Motivo |
|---|---|
| IDs 1283, 1285 ("Gemini_Generated_Image…"), 1307 ("ChatGPT Image…") | Generadas por IA. |
| IDs 1140, 1141, 1151 (nombres tipo banco de imágenes) | Licencia desconocida. |
| 19 fotos de las tarjetas de Locales | Son carteles de ciudades, no fotos de los locales, y varias tienen marca de agua de Gemini. |
| 10 imágenes de Promociones (IDs 1440–1464) | Rotas en el sitio anterior (devuelven el placeholder de Odoo). |
| 37 miniaturas base64 de /bazar | Reemplazadas por las imágenes del catálogo de Google Sites. |

## Banners de Inicio (entregados por la cooperativa, 13/10/2026)

Piezas propias de ≈ 2000 × 521 px. Son los recursos principales de Inicio: no se reemplazan por banners recreados. Se muestran completos, con su proporción original y sin recorte (componente `BannerSeccion`), en AVIF y WebP de 480 a 2000 px de ancho.

| Banner | Archivo | Original | Sección y enlace | Contenido debajo |
|---|---|---|---|---|
| Bazar ("Todo para ti y tu hogar · Hasta 15 cuotas sin recargo") | `src/assets/banners/bazar.webp` | `assets-source/banners/bazar.webp` (81 KB) | Bazar → `/hipermercado/bazar/` | Accesos por categoría y estante de productos con stock |
| Servicios sociales | `src/assets/banners/servicios-sociales.webp` | `assets-source/banners/servicios-sociales.webp` (72 KB) | `/beneficios/servicios-sociales/` | Los 6 servicios restantes |
| Pinecoop | `src/assets/banners/pinecoop.webp` | `assets-source/banners/pinecoop.webp` (104 KB) | `/beneficios/servicios-sociales/pinecoop/` | Descripción, comodidades, Pinecoop Chuy (próximamente) |
| Hacete socio | `src/assets/banners/hacete-socio.webp` | `assets-source/banners/hacete-socio.webp` (70 KB) | `/hacete-socio/` | Beneficios de ser socio y contacto |

**Versiones para celular (entregadas el 14/10/2026):** `bazar-movil`, `servicios-sociales-movil`, `pinecoop-movil` y `hacete-socio-movil` (originales PNG de 5625 × 4500, proporción 5:4). En el sitio: `src/assets/banners/<nombre>-movil.webp` de 1600 × 1280 (76–155 KB), del que Astro genera AVIF y WebP de 480, 768 y 1080 px; copia maestra de 2400 × 1920 en `assets-source/banners/`. `BannerSeccion` las usa por debajo de 640 px de ancho (en un teléfono de 390 px el banner mide 390 × 312, a todo el ancho) y la versión ancha (2000 × 521) por encima. Con esto los textos chicos ("Todo para ti y tu hogar", "Cuotas sin recargo") se leen en el teléfono.

## Banner de beneficios (entregado el 14/10/2026)

"Consultá acá por tus beneficios" (PNG de 8000 × 2786). En el sitio: `src/assets/banners/beneficios.webp` (2000 × 697, 106 KB; Astro genera AVIF/WebP de 480 a 2000 px); copia maestra de 3000 px en `assets-source/banners/`. Va entre el carrusel y "¿Qué necesitás hoy?" y abre el WhatsApp general 098 872 727. En un teléfono mide 390 × 136: la franja de servicios de abajo queda chica; si se entrega una versión 1080 × 1080, se usa automáticamente en pantallas angostas.

## Fotos de ciudades para Locales (Imágenes Ciudades.zip, entregado el 14/10/2026)

20 imágenes con el nombre de la ciudad en el archivo y en el cartel. Se asociaron por ese nombre a los 19 locales confirmados (`src/data/confirmado/locales.json`); no se dedujo ninguna.

| Archivo entregado | Local | Web (`src/assets/locales/`) |
|---|---|---|
| Montevideo.png | Casa Central | `casa-central.webp` |
| Las Piedras.png · Pando.png · Salto.jpg | Sucursales | `las-piedras` · `pando` · `salto` |
| Artigas, Colonia, Durazno, Florida, Maldonado, Paysandú, Rivera, Rocha, Tacuarembó | Agencias homónimas | mismo nombre |
| Melo.png · Minas.jpg · Fraybentos (Rionegro).webp · Mercedes (Soriano).png · sanjosé.png · Trenta y Tres.jpg | Cerro Largo · Lavalleja · Río Negro · Soriano · San José · Treinta y Tres | `cerro-largo` · `lavalleja` · `rio-negro` · `soriano` · `san-jose` · `treinta-y-tres` |
| **san carlos (Maldonado).jpg** | **Sin local confirmado** | No publicada (pendiente) |

- **Marca de agua:** Artigas, Durazno, Florida, Las Piedras, Melo, Montevideo, Pando, Paysandú y Salto tenían el destello ✦ de Gemini en la esquina inferior derecha. Con autorización de la cooperativa (las fotos son propias, solo retocadas) se retiró clonando la textura vecina; en Salto, donde el destello tocaba el muro, se recortaron ambos costados por igual.
- **Formato web:** 1280 × 720 (16:9) en WebP, sin recorte ni deformación: los costados se completan con la misma foto desenfocada. Astro genera 400, 640 y 800 px. Copias limpias a tamaño original: `assets-source/locales/`.

## Ofertas del supermercado (ofertas oct.zip, entregado el 14/10/2026)

36 archivos: 6 eran copias exactas ("- copia") y otra repetía la oferta de Crivea Sec sobres 175 g con otro diseño → **29 piezas publicadas** en `src/assets/ofertas/octubre-NN.webp` (960 × 1200, ≈ 50 KB cada una; Astro genera 280–560 px). Originales: `assets-source/ofertas-octubre/`. Las piezas **muestran precios**: publicación aprobada por la cooperativa como excepción, solo en Promociones del supermercado. Textos alternativos con producto y precio en `src/data/confirmado/ofertas-supermercado.ts`. Retirar al terminar octubre de 2026.

## Textura lateral

`public/textura-copol.webp` (1040 × 395, 50 KB): trama de íconos completa del Manual de marca (`assets-source/manual/trama-iconos.png`) convertida a trazos verdes sobre transparente con `scripts/textura-lateral.mjs`. Se repite como mosaico (520 px de ancho, 10 % de opacidad) y cubre todo el margen vacío a cada lado del contenido, en pantallas de 1360 px o más; en móvil no hay margen y no aparece.

## Catálogo del Bazar

Ver [catalogo-bazar.md](catalogo-bazar.md): importación completa desde https://sites.google.com/view/catalogo-copol/inicio, conteos, faltantes, procedimiento para volver a importar y verificación de precios.

- Datos: `src/data/catalogo/bazar.json` · Informe: `src/data/catalogo/bazar.informe.json`.
- Imágenes: `src/assets/catalogo/bazar/<id>.webp` (máx. 800 px). Las 4 imágenes de productos que solo están en la portada del catálogo: `assets-source/catalogo-portada/`.
- **Verificación de precios:** el importador marca cualquier texto con apariencia de precio (0 marcados) y `npm test` falla si aparece un patrón de precio en Hipermercado. Las 471 imágenes de la importación anterior se revisaron visualmente en hojas de contacto (sin precios).

## Datos

| Dato | Archivo | Fuente |
|---|---|---|
| Locales (19) | `src/data/confirmado/locales.json` | Array `CPOL_LOCS` de /locales + correcciones confirmadas (Casa Central). |
| Convenios (160) | `src/data/confirmado/convenios.json` | Array `CONVS` de /convenios; rubros normalizados de 41 variantes a 12. |
| Servicios sociales (7) | `src/data/confirmado/servicios.ts` | Subpáginas /beneficios/* del sitio anterior. |
| Contacto, horarios, enlaces | `src/data/confirmado/sitio.ts` | Sitio anterior + respuestas de la cooperativa. |
| Misión, visión, origen, lema | `src/data/confirmado/sitio.ts` (`MANUAL`) | Manual de marca, págs. 3–5. |
| Aperturas de crédito | `src/data/confirmado/creditos.json` | Confirmadas por la cooperativa. |

## Terceros y licencias de software

- Figtree (SIL Open Font License), vía @fontsource-variable/figtree.
- Íconos dibujados a mano siguiendo el estilo de trazo de Lucide (ISC).
- Astro (MIT), sharp (Apache-2.0), linkedom (ISC).
- Panel de stock: Hono (MIT), @libsql/client (MIT), @vercel/blob (Apache-2.0), @astrojs/vercel (MIT), sharp (Apache-2.0).
- Lector de códigos de barras: @zxing/browser y @zxing/library (Apache-2.0), copiado a `public/panel-recursos/` en cada build.
