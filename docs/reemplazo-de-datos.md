# Cómo actualizar datos y reemplazar el contenido de demostración

Todos los datos viven en `src/data/`. Después de cualquier cambio: `npm run verificar` y publicar `dist/`.

## Aperturas de crédito
`src/data/confirmado/creditos.json`: agregar o quitar objetos `{ "fecha": "AAAA-MM-DD", "confirmada": true }`. Las fechas pasadas se ocultan solas al compilar. Con `"confirmada": false` se muestra la etiqueta "Fecha a confirmar". Si no hay fechas futuras, aparece "Fecha a confirmar" en lugar de las fechas.

> Las fechas se filtran según el día de la **compilación**: hay que recompilar después de cada apertura para que la fecha pasada desaparezca. Una compilación programada (por ejemplo, diaria en el hosting) lo resuelve.

## Contacto, horarios y enlaces de acceso
`src/data/confirmado/sitio.ts` (`CONTACTO`, `HORARIOS`, `ACCESO`, `REDES`). Para publicar la app, completar `ACCESO.appAndroid` con la URL confirmada: la página Acceso web cambia sola de "Pendiente" a "Descargar".

## Servicios sociales
`src/data/confirmado/servicios.ts`: cada servicio tiene título, resumen, descripción, puntos, contactos y llamada a la acción. Cada objeto nuevo genera su propia página en `/beneficios/servicios-sociales/<slug>/`.

## Locales
`src/data/confirmado/locales.json`. Para regenerarlo desde el sitio anterior: `npm run datos:extraer` (aplica las correcciones confirmadas de Casa Central y las notas de pendientes). Para cargar datos propios, editar el JSON respetando los campos `id`, `tipo` (`casa-central | sucursal | agencia`), `direccion`, `ciudad`, `telefono`, `celular`, `email`, `lat`, `lng`. Si un `id` es nuevo, agregar su departamento en `DEPARTAMENTOS` (`src/lib/datos.ts`).

## Convenios
`src/data/confirmado/convenios.json` (generado por `npm run datos:extraer`). Campos: `nombre`, `rubro` (normalizado), `departamento`, `localidad`, `direccion`, `telefono`, `lat`, `lng`. Los rubros se normalizan en `RUBROS` (`scripts/extract-data.mjs`).

## Catálogo y stock del Bazar
- **Día a día**: el stock, los productos nuevos y sus imágenes se cargan en el **panel de stock** ([panel-stock.md](panel-stock.md)). El sitio los toma del panel al compilar y al abrir la página de Bazar.
- **Reimportar desde Google Sites** (solo si la cooperativa vuelve a usarlo como origen): ver [catalogo-bazar.md](catalogo-bazar.md). Después, `npm --prefix panel run sembrar` agrega al panel los productos nuevos sin pisar el stock cargado allí.
- Se publican todos los productos de `src/data/catalogo/bazar.json` salvo los marcados `revisarPrecio: true` (texto con apariencia de precio) o `retirado: true` (ya no figuran en el panel).

## Hipermercado (contenido de demostración)
Hoy `src/data/demo/hipermercado.json` contiene marcadores genéricos, rotulados en pantalla como "Contenido de demostración — reemplazar por catálogo oficial".

Para reemplazarlo hace falta, por cada producto o rubro: nombre, rubro, imagen (mínimo 800 × 800 px, fondo claro, **sin precios**) y, si aplica, código interno. Pasos:
1. Copiar las imágenes en WebP a `src/assets/catalogo/<rubro>/`.
2. Crear `src/data/catalogo/<rubro>.json` con la misma forma que `bazar.json`.
3. En `src/pages/hipermercado/index.astro`, cambiar la sección de demostración por una grilla de `TarjetaProducto` y quitar la marca `.marca-demo`.
4. Borrar `src/data/demo/hipermercado.json`.

## Promociones
En `src/pages/hipermercado/promociones.astro`, el arreglo `campanas` lista las piezas vigentes. Para agregar una: copiar la imagen a `assets-source/original/`, ejecutar `npm run assets:optimize` y sumar un objeto con `imagen`, `alt` (descripción del contenido de la pieza), `titulo`, `texto` y `accion`. Las piezas no deben mostrar precios del Hipermercado. Cuando lleguen las ofertas semanales, reemplazar el bloque "Pendiente".

## Fotos
Para sustituir una foto, poner el original en `assets-source/original/` con el mismo nombre, ejecutar `npm run assets:optimize` y compilar. Registrar la procedencia en `docs/registro-de-activos.md`.
