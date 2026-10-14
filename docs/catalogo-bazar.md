# Catálogo del Bazar: importación y mantenimiento

## Origen

- Sitio oficial: https://sites.google.com/view/catalogo-copol/inicio (Google Sites, sin planilla de Google Sheets embebida: los productos están escritos en las páginas).
- Importado el **13/10/2026** con `scripts/importar-catalogo.mjs`.
- Cada producto guarda su procedencia: página de origen (`origen.pagina`), posición en la página, otras páginas donde aparece repetido (`origen.tambienEn`), la etiqueta de stock original (`stock.etiquetaOrigen`) y el enlace de consulta original (`consultaOrigen`).

## Qué se recorrió

El importador no se limita al menú: sigue **todos los enlaces internos** desde la portada. Encontró 69 páginas: la portada, 14 categorías y sus subcategorías (algunas categorías, como Informática, Hogar o Jardín, solo agrupan subpáginas).

## Resultado

| Dato | Cantidad |
|---|---|
| Páginas recorridas | 69 (portada + 68 de categorías y subcategorías) |
| Apariciones de productos en las páginas | 818 |
| Duplicados (mismo código repetido en la misma u otra página) | 12 → se guarda uno y se anota dónde más aparece |
| **Productos únicos importados** | **806** (802 de categorías + 4 que solo están en la portada) |
| Con stock ("Consultar Stock", incluidas sus erratas) | 501 |
| Sin stock ("SIN STOCK") | 299 |
| Sin etiqueta de stock en el origen | 6 |
| Con imagen guardada en el proyecto | 806 (15,1 MB en WebP de máx. 800 px); en el sitio cada tarjeta descarga una variante de 240 o 400 px |
| Con texto con apariencia de precio | 0 |
| Categorías | 14 del sitio + "Destacados" (los 4 de portada), con 49 subcategorías |

**Sobre la cantidad:** el sitio mostraba 471 productos porque solo publicaba los que tenían "Consultar stock" e imagen. El catálogo original tiene **806 productos únicos** (818 apariciones contando repetidos); no se encontraron más de 818. Ahora se publican todos, con su estado de stock.

Detalle por página: `src/data/catalogo/bazar.informe.json`.

## Datos que no se pudieron recuperar o que requieren revisión

| Caso | Qué pasó | Qué hace falta |
|---|---|---|
| **Bloque sin título** en Informática → Auriculares (foto de auriculares marca Xion seguida del encabezado de sección "XIAOMI") | Sin nombre, código ni etiqueta: **no se importó** | Que la cooperativa indique qué producto es (o cargarlo desde el panel) |
| **Bloque sin título** en la portada (dos imágenes y botón "Consultar Stock", enlace walink.co/089a64) | No se importó | Ídem |
| **6 productos sin etiqueta de stock**: TV Box Xiaomi S 4K (454165), TV Box Xion 4K (445500), Monitor Gamer Asus 27" (457853), Parlante Aiwa 8"x2 (460626), Refrigerador Smartlife 342 L (434542), Afeitadora inalámbrica Philips (444314) | Se publican como "Consultar disponibilidad" (`sin-dato`) | Marcar con o sin stock desde el panel |
| **2 productos sin código**: Tostadora Punktal PK-858 y Tostadora Philips 2 | Se publican sin código | Cargar el código desde el panel |
| **Moto 49cc niño (473503)**, solo en portada | Imagen guardada pero **no publicada**: parece un fotomontaje o imagen generada y dice "Rodado 14"" mientras la descripción dice "Rodado: 10 pulgadas" | Confirmar la imagen o enviar una foto real; luego subirla desde el panel |
| Monopatines Xiaomi 120 kg (470257) y 100 kg (470258), solo en portada | Comparten bloque, descripción, foto y enlace en el origen; se importaron como dos productos con la misma foto | — |
| Bicicleta Patagonia 29" talles S (470089) y M (470090) | Usan la misma foto en el origen | — |
| Imágenes | Ninguna quedó sin descargar. 17 descargas fallaron en el primer intento (lentitud de Google) y se completaron en reintentos | — |
| Precios | Ninguno detectado | — |

Los productos que solo están en la portada (moto y monopatines) no pertenecen a ninguna categoría del origen; se agruparon en "Destacados", el nombre de esa sección en Google Sites.

## Qué se guarda de cada producto

| Campo | Origen | Si falta en el origen |
|---|---|---|
| `codigo` | Número de 5 a 7 dígitos del título | `null` (no se inventa) |
| `nombre` | Título del producto | — |
| `categoria` / `subcategoria` | Ruta de la página y nombres del menú del sitio | — |
| `grupo` | Encabezado de sección dentro de la página (p. ej., la marca "APPLE") | `null` |
| `marca` | Solo si una marca conocida aparece literalmente en el nombre | `null` |
| `descripcion` | Textos debajo del título, línea por línea | `null` |
| `stock.estado` | "Consultar Stock" (y sus erratas) → `con-stock`; "SIN STOCK" → `sin-stock`; sin etiqueta → `sin-dato` | `sin-dato` |
| `imagen` | Foto del producto, descargada y convertida a WebP (máx. 800 px) | `null` → la tarjeta muestra "Imagen no disponible" |
| Precio | **No se importa.** Cualquier texto con apariencia de precio marca `revisarPrecio: true` y el producto no se publica | — |

## Cómo volver a importar o actualizar

> Desde que existe el [panel de stock](panel-stock.md), el stock se mantiene allí. Reimportar solo tiene sentido si la cooperativa vuelve a cargar productos en Google Sites.

```bash
node scripts/importar-catalogo.mjs --solo-informe
```
Recorre y cuenta sin escribir nada (sirve para ver cuántos productos hay hoy).

```bash
npm run catalogo:importar
```
Reemplaza `src/data/catalogo/bazar.json`, `bazar.informe.json` y la carpeta de imágenes. Reutiliza las imágenes ya descargadas del mismo producto; con `--forzar-imagenes` las vuelve a bajar todas. Las URLs de imágenes de Google Sites caducan en uno o dos minutos y el servidor puede ser lento: el importador vuelve a pedir cada página para renovar las URLs y reintenta hasta 6 rondas.

Después de importar:
1. Revisar `src/data/catalogo/bazar.informe.json` (faltantes, duplicados, productos sin etiqueta de stock).
2. Revisar visualmente las imágenes **nuevas** (que no muestren precios).
3. `npm --prefix panel run sembrar` para agregar al panel los productos nuevos (no pisa el stock cargado en el panel).
4. `npm run verificar` y publicar.

Los productos que solo aparecen en la portada de Google Sites (maquetación distinta, con imágenes de fondo) se cargan desde `scripts/catalogo-portada.json`, verificado a mano; si cambian en el origen, actualizar ese archivo.

## Modelos y colores en la web (14/10/2026)

La página del Bazar muestra una tarjeta por **modelo**; cada **color** sigue siendo un producto con su propio código interno COPOL y su propio stock (el inventario y el panel no cambian). Código: `src/lib/variantes.ts` y `obtenerCatalogoModelos()` en `src/lib/inventario.ts`.

- Dos productos se agrupan solo si, en la misma categoría, el nombre es **idéntico sin el color del final**. Los colores salen de una lista cerrada que incluye las abreviaturas y cortes del sistema ("NEG", "VDE", "BLANC", "PLATE", "GRIS OSCUR", "NEGRO/AZUL", "MIX NEGRO Y AZUL").
- Hacen falta al menos dos colores reconocidos; un único producto del mismo nombre sin color se suma como "Color no indicado". Nombres de menos de 3 palabras ("AURICULAR SONY") nunca se agrupan.
- Resultado con el catálogo actual: 806 productos → 774 tarjetas (22 modelos con 54 colores, p. ej. iPhone 15 128GB: negro 436249, rosado 439133, azul claro 437058).
- Estado del modelo: "Con stock" si algún color tiene; "Sin stock" si ninguno; si no, "Consultar disponibilidad". Los filtros usan ese estado.
- Descripción: la más completa entre los colores del modelo, pedida a `/api/bazar/descripcion/<id>` al abrir la ficha (lee la base; si no responde, el catálogo importado). 797 de 806 productos tienen descripción importada; los demás muestran "Consultanos por WhatsApp".
- Nombres con errores de tipeo en el sistema (p. ej. "REMDI" por "REDMI") no se corrigen ni se fuerzan: conviene corregirlos en el panel para que se agrupen.
