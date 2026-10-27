# Pendientes y placeholders

## Placeholders visibles en el sitio

| Dónde | Qué se ve | Qué hace falta |
|---|---|---|
| Hipermercado → "Productos del Hipermercado" | Marca "Contenido de demostración — reemplazar por catálogo oficial" | Catálogo oficial sin precios (ver reemplazo-de-datos.md). |
| Promociones → "Ofertas de octubre" | 29 piezas con precio (excepción aprobada) | **Retirarlas al terminar octubre de 2026** o reemplazarlas por las del mes siguiente (src/data/confirmado/ofertas-supermercado.ts). |
| Acceso web → App Android | "Pendiente de confirmación" | Confirmar el enlace vigente (APK o Google Play). |
| Contacto → formulario | "Formulario en modo demostración" | Backend del formulario (produccion.md, P1). |
| Locales → Artigas y Paysandú | "Teléfono pendiente de confirmación" | Confirmar el fijo de cada agencia (ambas figuran con 4772 5070). |
| Locales → imagen "san carlos (Maldonado).jpg" | No publicada | No hay un local confirmado en San Carlos: indicar si corresponde a algún local o descartarla. |
| Inicio → banner de Bazar en móvil | Banner completo; sus textos chicos ("Todo para ti y tu hogar", "Cuotas sin recargo") no se leen en teléfonos | Versión móvil del banner (sugerido 1080 × 1080 o 1080 × 1350). Opcional para los otros tres. |
| Bazar → Moto 49cc niño | "Imagen no disponible" | Confirmar la imagen o enviar foto real (ver catalogo-bazar.md). |
| Bazar → 6 productos | "Consultar disponibilidad" | Marcar su stock en el panel. |

## Historia: hitos sin año (no publicados)

Cargados en `src/data/confirmado/historia.ts` con `pendiente`; se publican cuando la cooperativa confirme el dato:

| Hito | Falta |
|---|---|
| Apertura de la cooperativa a todo público | Año |
| Traslado de la calle Cuareim a la Casa Central de Av. Libertador | Año (y confirmar que ocurrió así) |
| Primeras sucursales y agencias del interior | Años de apertura |
| Inauguración de la Casa Central ampliada (obras aprobadas el 14/07/2014) | Año de finalización |
| Parque Vacacional Pinecoop en Salinas | Año de inauguración |
| Pinecoop Chuy | Fecha de apertura |
| Fotografías históricas | Archivos (se agregan en `src/assets/historia/`) |

## Panel de stock y despliegue

| Pendiente | Detalle |
|---|---|
| Publicación en Vercel | Crear el repositorio privado, el proyecto de Vercel, la base Turso y el Blob Store, y cargar los datos (README § Publicar). Estado al 14/10/2026: repositorio privado https://github.com/MathiasEz/copol-sitio (rama `main`) y proyecto de Vercel `copol` (cuenta brandonpevz-6978), creado con la CLI. Dirección pública: https://copol-ruddy.vercel.app (primer despliegue; las vistas previas siguientes piden iniciar sesión en Vercel). Todo `*.vercel.app` responde con `X-Robots-Tag: noindex` (vercel.json). Turso (`copol-panel`) y Blob (`copol-fotos`) conectados el 14/10/2026; datos copiados desde la base local (respaldo 2026-10-14T03-43-50). El repositorio está vinculado: cada `git push` a `main` publica en copol-ruddy.vercel.app. **Falta:** el dominio (solo con aprobación). |
| Administrador en producción | Crear el administrador principal en la base de producción (o migrar la base local con respaldo/restauración). |
| Registros en producción | (1) Copiar `GOOGLE_CREDENCIALES` y `GOOGLE_HOJA` del proyecto `copol-registros` al proyecto `copol` en Vercel y redesplegar (docs/panel-stock.md § Registros). (2) Crear en Usuarios las cuentas de quienes cargan registros (rol *Carga de registros*): las del panel viejo no se migran. (3) Con todo probado, dar de baja el proyecto `copol-registros` y su Blob `copol-registros-almacen`. |
| Dominio | Vincular cooperativapolicial.com.uy cuando la cooperativa lo apruebe (no se tocó el DNS). |

## Datos a confirmar (cifras contradictorias o sin confirmar)

| Dato | Publicado en el sitio | Fuentes | Decisión en el MVP |
|---|---|---|---|
| Cantidad de locales | 19 | Lista de /locales: 19 · Inicio, Historia, Acceso web y Contacto: "+20" | **19** (confirmado por la cooperativa). |
| Sucursales / agencias | 3 sucursales + 15 agencias (según tipos de la lista) | Historia: "4 Sucursales y 14 Agencias" | Se calcula desde la lista de locales. **A confirmar** (p. ej., Pando figura como sucursal con correo `agepando@`). |
| Convenios | 159 (cantidad de registros) | Texto de /convenios: "152 convenios" | Se muestra la cantidad de registros publicados. **A confirmar.** |
| Socios activos | "+36.000" (actualizado a pedido de la cooperativa el 22/10/2026) | Coincide en todo el sitio anterior | Publicado en Sobre nosotros y Hacete socio. **A confirmar** si está vigente. |
| Empleados | "+150" (no publicado en el MVP) | Sitio anterior | No se usa. |
| "+150 beneficios" | No publicado | Hacete socio (sitio anterior) | No se usa: posible confusión con empleados. |
| Años de historia | Se usa "Desde 1917" y "más de un siglo" | Historia: "108 años" (desactualizado) | No se publica un número fijo. |
| Parques vacacionales | Salinas + Chuy "próximamente" | Sitio anterior: "2 parques" | Se describe Chuy como "Próximamente". |
| Campaña "cáncer de mama" | Promociones | Pieza de octubre | Retirar al terminar octubre. |
| Fiestas y cumpleaños de 15 | Novedad en Inicio | Hero del sitio anterior | Confirmar vigencia y canal de reserva (hoy, WhatsApp general). |
| Atención presencial de Pinecoop | "Lunes a viernes 9:00 a 17:00, sede central piso 2" | Ficha Pinecoop del sitio anterior | Publicado tal cual. |

## Recursos solicitados a la cooperativa

1. Archivos web licenciados de **Articulat CF** (woff2) o autorización para seguir con la sustituta.
2. Logotipo e **isotipo en SVG** y sus versiones aprobadas (negativo y monocromo), además de los vectores de la ilustración y la trama.
3. **Fotos reales**: fachada de cada local, Pinecoop (cabañas, interior), Casa Central y su interior, Cantinas Policiales (originales sin captura).
4. Catálogo del **Hipermercado** y piezas de **promociones** vigentes, sin precios.
5. Texto de la **política de privacidad**.
6. Confirmaciones de la tabla anterior.
7. Acceso a **dominio/DNS** y elección de **hosting** y **backend del formulario**.
