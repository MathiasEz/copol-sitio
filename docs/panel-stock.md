# Panel de stock del Bazar

Panel para que el personal autorizado consulte y actualice el inventario del Bazar, agregue productos y publique novedades en la portada. El código vive en `panel/` y se publica en la ruta **`/panel`** del mismo despliegue de Vercel. No está enlazado desde el sitio, pero eso **no es una medida de seguridad**: todas sus páginas exigen usuario y contraseña, y cada acción se autoriza en el servidor según el rol.

> Ningún sistema conectado a Internet es "imposible de hackear". El panel aplica medidas razonables (abajo); su seguridad depende también de usar contraseñas fuertes y mantener las dependencias actualizadas.

## Cómo viaja el stock (y por qué ahora se ve al instante)

```
Panel (/panel)  ──escribe──►  Base de datos (Turso / libSQL)  ◄──lee en cada visita──  Web pública
   └─ confirma "Guardado" solo después de releer la fila y comprobar el valor
```

- **Antes** (problema reportado el 13/10/2026): la página de Bazar era estática; el stock salía del archivo `bazar.json` generado al compilar, y la lectura en vivo dependía de una variable (`PUBLIC_PANEL_URL`) que no estaba configurada, más 30 s de caché en la API. El panel sí guardaba el cambio (quedó en la base y en el registro), pero la web seguía mostrando el valor viejo.
- **Ahora**:
  - `/hipermercado/bazar/` se genera **en cada visita** leyendo la misma base que escribe el panel, con `Cache-Control: no-store` (ni el navegador ni la CDN de Vercel guardan una copia vieja).
  - En Inicio y en Hipermercado, el estante de productos y las novedades son *server islands*: el resto de la página es estático y rápido, y esas partes se generan en cada visita.
  - El panel guarda con control de versión y **relee la fila**: el mensaje "Guardado: Sin stock" aparece solo si la base devolvió exactamente ese valor. Si no, muestra un error y no confirma.
  - Si la base no respondiera, la web no muestra un stock viejo: todas las tarjetas pasan a "Consultar disponibilidad" con un aviso.
- Los textos e imágenes del catálogo importado siguen guardados en el proyecto (`src/data/catalogo/`, `src/assets/catalogo/`); en cada build se generan sus variantes web de 240 y 400 px en `public/catalogo/`.

## Funciones

| Sección | Qué permite |
|---|---|
| **Inventario** | Buscar por código interno COPOL, nombre o marca; filtrar por categoría y por estado (pestañas Todos / Con stock / Sin stock / Sin dato con contadores); marcar con o sin stock o cargar una cantidad (0 = sin stock) directamente en la tabla. |
| **Agregar / editar producto** | Código interno COPOL (a mano o **escaneado con la cámara**), nombre, categoría existente, marca, descripción, stock e imagen. Historial de cambios del producto. |
| **Novedades** | Crear, editar, publicar, despublicar, eliminar y ordenar (subir/bajar). Imagen, título, texto, plantilla (imagen a la izquierda y texto a la derecha · imagen completa · título y texto) y botón opcional. Inicio muestra solo las publicadas, en ese orden. |
| **Usuarios** | Alta con usuario o correo, rol y contraseña temporal; cambio de rol, desactivación, restablecimiento de contraseña y baja. |
| **Mi perfil** | Cada persona cambia su propia contraseña. |
| **Registro** | Ingresos, cambios de stock (antes → después), productos, imágenes, novedades y usuarios, con fecha, usuario e IP. |
| **Asistente** | Chat con Claude para preguntas sobre la web pública, el inventario y el uso del panel. Solo administradores y **solo lectura**. |

### Asistente

- **Modelo:** Claude Haiku por defecto ("Rápido") o Claude Sonnet ("Detallado"), a través de **Vercel AI Gateway** (`panel/src/asistente.ts`). En Vercel se autentica con el token OIDC del propio despliegue: no hay claves en el código ni en el repositorio.
- **Qué puede consultar:** el texto visible de las páginas públicas (nunca `/panel`), el inventario (búsqueda y resumen por categoría), los últimos cambios del registro (sin IP) y las novedades. No tiene ninguna herramienta que modifique datos.
- **Límites:** 80 consultas por administrador y por día (`PANEL_ASISTENTE_LIMITE_DIA`), historial de hasta 12 mensajes y respuestas de hasta ~1500 tokens. Cada consulta queda en el Registro (modelo, pregunta recortada, herramientas usadas y tokens).
- **Costo:** con Haiku, una consulta cuesta alrededor de US$ 0,001–0,003; Vercel AI Gateway incluye un crédito gratuito mensual. **Requisito:** AI Gateway se habilita registrando una tarjeta en la cuenta de Vercel (Vercel → AI Gateway); hasta entonces el asistente muestra ese aviso.
- La conversación se guarda solo en la pestaña del navegador (sessionStorage) y se borra con "Nueva conversación".

### Escaneo del código interno

- El permiso de cámara se pide **solo al tocar "Escanear código"**. El visor lee códigos de barras (Code 128, EAN-13/8, UPC, Code 39, ITF y QR) y completa el campo; luego se cierra y libera la cámara.
- Usa el lector nativo del navegador cuando existe (Chrome en Android) y, si no, la biblioteca ZXing incluida en el sitio (iPhone, computadoras).
- Si no hay cámara, no se concede el permiso o la conexión no es segura (HTTPS), avisa y el campo sigue disponible para escribir el código a mano.

## Roles

| Permiso | Administrador | Editor de stock | Visualizador de stock |
|---|:-:|:-:|:-:|
| Consultar el inventario | ✓ | ✓ | ✓ |
| Cambiar stock y cantidades | ✓ | ✓ | — |
| Agregar y editar productos e imágenes | ✓ | ✓ | — |
| Novedades | ✓ | — | — |
| Usuarios y registro de cambios | ✓ | — | — |
| Asistente (Claude) | ✓ | — | — |

El **administrador principal** (creado con `npm run panel:admin`) es una cuenta protegida: nadie más puede cambiarla ni eliminarla, y siempre queda al menos un administrador activo. Los permisos se definen en `panel/src/seguridad.ts`.

## Medidas de seguridad

| Área | Medida |
|---|---|
| Contraseñas | Hash **scrypt** con sal por usuario. Nunca se guardan, muestran ni registran en texto plano (ni en la base, ni en el registro de cambios, ni en archivos del proyecto). Mínimo 10 caracteres; las temporales obligan a cambiarse al ingresar. |
| Fuerza bruta | Bloqueo de la cuenta 15 min tras 5 intentos fallidos y límite por IP. Mismo mensaje y mismo tiempo de respuesta exista o no el usuario. |
| Sesiones | Token aleatorio en cookie `HttpOnly`, `SameSite=Strict`, `Secure` y prefijo `__Host-` con HTTPS; la base guarda solo su SHA-256. Vencen tras 30 min sin uso u 8 h y se cierran al cambiar contraseña o rol. |
| Autorización | Cada ruta verifica el rol en el servidor. |
| CSRF | Verificación de origen + token por sesión en todos los formularios. |
| Validación | Todos los campos se validan en el servidor; se rechazan textos con apariencia de precio y enlaces que no sean `https://` o rutas del sitio. |
| Imágenes | Se inspecciona el contenido real: solo JPEG, PNG, WebP o AVIF, máx. 5 MB, mín. 200 px. Se vuelven a codificar a WebP (sin metadatos) en dos tamaños y se guardan en **Vercel Blob** con nombre aleatorio. |
| Cabeceras | CSP sin scripts en línea, `X-Frame-Options: DENY`, `nosniff`, HSTS, `noindex`, cámara permitida solo para el propio sitio. |
| Errores | Al usuario se le muestra un código de referencia; el detalle queda en los registros de Vercel. |

## Dónde se guarda cada cosa

| Qué | Dónde |
|---|---|
| Stock, productos agregados, novedades, usuarios (hash), sesiones, registro | Base **Turso** (producción) · `panel/datos/copol.db` (desarrollo) |
| Imágenes subidas en el panel | **Vercel Blob** (producción) · `panel/datos/imagenes/` (desarrollo) |
| Catálogo importado (textos e imágenes originales) | Repositorio: `src/data/catalogo/` y `src/assets/catalogo/bazar/` |
| Imágenes de las novedades iniciales | Repositorio: `public/novedades/` |

## Respaldo y recuperación

- `npm run panel:respaldo` exporta todas las tablas a `datos.json` (usuarios solo con hash, sin sesiones) y copia las imágenes subidas. Funciona contra Turso o la base local según `.env`. **Guardá la carpeta fuera del equipo** y tratala como privada (incluye los hashes).
- `npm run panel:restaurar -- --desde <carpeta>` muestra qué se restauraría; con `--confirmar` reemplaza el contenido de la base en un único lote (si algo falla, no se aplica nada).
- Turso además conserva historial propio y permite restaurar a un punto en el tiempo desde su consola.
- Si se perdiera la base: `npm run panel:sembrar` recrea el catálogo importado; luego restaurar el último respaldo.

## Puesta en marcha local

```bash
npm install
```
```bash
npm run panel:sembrar
```
```bash
npm run panel:admin -- --usuario <usuario o correo>
```
```bash
npm run dev
```

Sitio en http://localhost:4321 y panel en http://localhost:4321/panel. Sin variables de entorno se usan la base y la carpeta de imágenes locales.

## Verificación

- `npm run panel:test` — 22 pruebas: acceso sin sesión, contraseñas incorrectas, CSRF, cookie segura, contraseña temporal, bloqueo, permisos por rol, administrador protegido, guardado de stock verificado (con y sin JavaScript), cantidad ↔ estado, ediciones simultáneas, etiqueta "Código interno COPOL", validación de productos e imágenes, novedades (crear, publicar, ordenar, despublicar), alta de usuarios por correo, cambio de contraseña en el perfil, ausencia de contraseñas en texto plano, interfaz sin rubros futuros y cabeceras.
- `npm run qa:panel` (con `npm run dev` en marcha) — prueba de punta a punta en Edge: cambio real de stock en el panel → la tarjeta pública pasa a "Sin stock" gris y vuelve a "Con stock" verde; escaneo con cámara simulada que muestra un EAN-13 y caso sin permiso; alta y cambio de contraseña de un usuario; novedad creada, publicada (aparece en Inicio) y despublicada (desaparece). Usa un usuario temporal y deja los datos como estaban.
