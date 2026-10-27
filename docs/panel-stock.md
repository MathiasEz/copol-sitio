# Panel COPOL: Stock Bazar, Registros y Administración

> El panel se llamaba «panel de stock»: desde que se le sumó **Registros** (antes un panel aparte, `copol-registros`) tiene tres secciones en el menú. Este documento conserva el nombre de archivo por los enlaces existentes.

Panel para que el personal autorizado consulte y actualice el inventario del Bazar, agregue productos, cargue registros de socios y publique novedades en la portada. El código vive en `panel/` y se publica en la ruta **`/panel`** del mismo despliegue de Vercel. No está enlazado desde el sitio, pero eso **no es una medida de seguridad**: todas sus páginas exigen usuario y contraseña, y cada acción se autoriza en el servidor según el rol.

> Ningún sistema conectado a Internet es "imposible de hackear". El panel aplica medidas razonables (abajo); su seguridad depende también de usar contraseñas fuertes y mantener las dependencias actualizadas.

## Cómo viaja el stock (y por qué ahora se ve al instante)

```
Panel          ──escribe──►  Base de datos (Turso / libSQL)  ◄──lee──  Web pública (copia en la CDN de Vercel)
   ├─ confirma "Guardado" solo después de releer la fila y comprobar el valor
   └─ borra la copia de la CDN (etiqueta "bazar", "novedades" o "banner"): la visita siguiente ya lee el valor nuevo
```

- **Antes** (problema reportado el 13/10/2026): la página de Bazar era estática; el stock salía del archivo `bazar.json` generado al compilar, y la lectura en vivo dependía de una variable (`PUBLIC_PANEL_URL`) que no estaba configurada, más 30 s de caché en la API. El panel sí guardaba el cambio (quedó en la base y en el registro), pero la web seguía mostrando el valor viejo.
- **Ahora**:
  - `/hipermercado/bazar/` se genera en el servidor leyendo la misma base que escribe el panel. La CDN de Vercel guarda la página (`Vercel-CDN-Cache-Control: max-age=60, stale-while-revalidate=86400`, etiqueta `Vercel-Cache-Tag: bazar`) y la entrega sin ejecutar la función, así un pico de visitas no hace cola en el servidor ni en la base. El navegador no guarda copia propia (`Cache-Control: public, max-age=0, must-revalidate`). Ver `src/lib/cache-publica.ts`.
  - Al registrar un cambio visible en la web (stock, productos o novedades), el panel borra las copias de esa etiqueta (`panel/src/web-publica.ts`, desde `registrar()` en `auditoria.ts`): la visita siguiente se genera con el valor nuevo. Si el borrado fallara, la copia se renueva sola a los 60 s.
  - Si la base no responde, esa versión de la página no se guarda en la CDN (`no-store`).
  - En Inicio y en Hipermercado, el banner, el estante de productos y las novedades son *server islands* con la misma caché (etiquetas `banner`, `bazar` y `novedades`): el resto de la página es estático.
  - Los scripts de consola (`panel:sembrar`, `panel:restaurar`) no borran la caché: la web los muestra al renovarse la copia (60 s como máximo).
  - El panel guarda con control de versión y **relee la fila**: el mensaje "Guardado: Sin stock" aparece solo si la base devolvió exactamente ese valor. Si no, muestra un error y no confirma.
  - Si la base no respondiera, la web no muestra un stock viejo: todas las tarjetas pasan a "Consultar disponibilidad" con un aviso.
- Los textos e imágenes del catálogo importado siguen guardados en el proyecto (`src/data/catalogo/`, `src/assets/catalogo/`); en cada build se generan sus variantes web de 240 y 400 px en `public/catalogo/`.

## Menú: tres secciones

| Sección | Páginas |
|---|---|
| **Stock Bazar** | Inventario · Agregar producto · Asistente (el del stock) |
| **Registros** | Nuevo registro (formulario con asistente de IA) · Planilla |
| **Administración** | Administración Página · Información empleados · Estadísticas · Usuarios · Registro de cambios · Accesos |

Cada sección aparece solo si la persona tiene algo para hacer en ella; quien solo tiene Registros entra directo a **Nuevo registro** y no ve el stock. Sumar una sección nueva en el futuro es agregar un grupo en `layout()` de `panel/src/vistas.ts` y los permisos correspondientes en `panel/src/seguridad.ts`.

## Funciones

| Sección | Qué permite |
|---|---|
| **Inventario** | Buscar por código interno COPOL, nombre o marca; filtrar por categoría y por estado (pestañas Todos / Con stock / Sin stock / Sin dato con contadores); marcar con o sin stock o cargar una cantidad (0 = sin stock) directamente en la tabla. |
| **Agregar / editar producto** | Código interno COPOL (a mano o **escaneado con la cámara**), nombre, categoría existente, marca, descripción, stock e imagen. Historial de cambios del producto. |
| **Administración Página → Banner de inicio** | (Antes "Novedades" en el menú.) Diapositivas del banner de Inicio: crear, editar, publicar, despublicar, ordenar y eliminar (máx. 8). Antetítulo, título con final resaltado, texto, etiqueta sobre la imagen, dos botones, imagen + imagen opcional para celular, punto de interés de la foto, "mostrar la imagen completa" (piezas con texto) y fechas desde/hasta. Diseños: texto al costado, recuadro chico sobre la foto o solo imagen; en celular el texto va siempre debajo. **Vista previa en vivo** (Computadora / Celular) al editar y del banner completo en la lista. Tiempo por diapositiva: 4 a 12 s. Se guarda como JSON en `ajustes` (clave `banner_inicio`); sin guardar, se muestra el contenido inicial (`panel/src/banner.ts`). Estilos y comportamiento compartidos con la web: `src/styles/banner-inicio.css` y `src/scripts/banner-inicio.js` (copiados al panel en cada build). |
| **Estadísticas** (solo administradores) | Vistas, visitantes, clics a WhatsApp y porcentaje desde celular (7, 30 o 90 días, comparado con el período anterior), gráfico de vistas por día (con tabla), páginas más vistas, de dónde llegan, productos más consultados por WhatsApp, páginas desde donde escriben, clics en el banner e imágenes ampliadas. Sin cookies ni datos personales: contadores por día y un hash anónimo diario para contar visitantes (`panel/src/estadisticas.ts`, recepción en `src/pages/api/e.ts`). |
| **Estadísticas → Mes a mes** (solo administradores) | Archivo mensual: al terminar cada mes se guarda su resumen completo (por día, totales, rankings y comparación con el mes anterior) en la tabla `estadisticas_mes`. La pestaña **Mes a mes** lista todos los meses (el en curso se calcula al momento) y cada uno se abre con el mismo detalle que Estadísticas o se descarga como **CSV** para Excel. Lo guardado no cambia más. Lo guarda el Cron del día 1 (`/api/cron/estadisticas`, 03:30 de Uruguay) y, si fallara, lo hace solo la pantalla de Estadísticas al abrirse (`panel/src/estadisticas.ts`). Entra en el respaldo diario. |
| **Administración Página → Ofertas** | Piezas del supermercado de Promociones (única sección con precios, excepción aprobada): subir varias a la vez (el navegador las envía de a una), describir cada una (producto y precio), ordenar, quitar, título, período y "válidas hasta" (al vencer, la sección se retira sola). JSON en `ajustes` (clave `ofertas_supermercado`); sin guardar, se muestran las de octubre de 2026 (`public/ofertas/`). |
| **Administración Página → Créditos** | Fechas de apertura de créditos (Inicio, Beneficios, Hacete socio y Acceso web): agregar, marcar confirmada / a confirmar, quitar. Las pasadas se ocultan solas cada día. JSON en `ajustes` (clave `aperturas_credito`). |
| **Administración Página → Novedades** | Con fechas opcionales desde/hasta (se publican y retiran solas). Crear, editar, publicar, despublicar, eliminar y ordenar (subir/bajar). Imagen, título, texto, plantilla (imagen a la izquierda y texto a la derecha · imagen completa · título y texto) y botón opcional. Inicio muestra solo las publicadas, en ese orden. |
| **Administración Página → Campana** | La campanita de notificaciones del encabezado de toda la web: activarla o apagarla, el título del desplegable y el número que muestra (**por hora** de Uruguay de 1 a 5, **cantidad** de novedades publicadas o **fijo**). El contenido del desplegable son las Novedades. Requiere el permiso de novedades. JSON en `ajustes` (clave `campana`; `panel/src/campana.ts`); se actualiza en la web al guardar. |
| **Registros → Nuevo registro** | Formulario del socio y el producto (nombre, N° de socio, cédula con dígito verificador, dirección con ubicación en Google Maps, producto, código interno, flete, service e información adicional) con un **asistente de IA**: se escribe, pega o **dicta** el mensaje, o se adjunta una **foto, PDF o captura** (se leen y no se guardan) y la IA completa el formulario; cada respuesta se puede **deshacer**. La IA nunca guarda: la persona revisa y guarda. Código en `panel/src/registros*.ts` y `public/panel-recursos/registros*.js`. |
| **Registros → Planilla** | Con la hoja conectada, la planilla del panel **lee la hoja en el momento** (lo que se borre o cambie en Google se refleja al abrirla; se puede elegir la pestaña/mes). Cada persona elige **su color** en Mi perfil → «Tu color en la planilla» (paleta fija, `panel/src/colores.ts`): su nombre en «Cargado por» sale de ese color en el panel y, en los registros nuevos, también en la celda de la hoja de Google. Cada registro va a la **hoja de Google Sheets** (una pestaña por mes: «Octubre 2026»…) y deja constancia en la base (quién, cuándo, dónde quedó). Sin hoja conectada, la base hace de **planilla de prueba** (se ve en el panel y se descarga como `.xlsx`; un administrador puede vaciarla). Con la hoja conectada, la base guarda solo un resumen: **la cédula, la dirección, el service y la información adicional viven únicamente en la hoja**. |
| **Usuarios** | Alta con usuario o correo, uno o **varios roles** y contraseña temporal; cambio de roles, desactivación, restablecimiento de contraseña y baja. |
| **Mi perfil** | Cada persona cambia su propia contraseña. |
| **Registro de cambios** | Ingresos, cambios de stock (antes → después), productos, imágenes, novedades y usuarios, con fecha, usuario e IP. |
| **Asistente** | Chat con IA (Gemini 2.5 Flash) para preguntas sobre la web pública, el inventario y el uso del panel, y para **preparar cambios de productos** que se aplican solo al confirmarlos. Todos los roles: el visualizador solo consulta. |
| **Información empleados** | Página interna para todo el personal (cualquier rol): Acoso laboral (QR al protocolo de RR.HH.), ¿Cómo te sentís hoy? (QR a la encuesta), Reglamento Interno del Personal (QR al documento), Tu cooperativa (carrusel de fotos), Ciudad del Plata abre pronto, Pinecoop Chuy (en obras) y Tus recibos. **Se publica también en la web** en `/portal-empleados/` (Acceso web → Portal de empleados), con caché en la CDN que se renueva al guardar. Los **administradores** cambian los enlaces y las fotos en "Editar"; los QR se generan solos a partir de cada enlace (`panel/src/empleados.ts`, guardado en la tabla `ajustes`). Las fotos se achican en el navegador antes de subirlas (Vercel no acepta envíos de más de ~4,5 MB). |
| **Modo claro / oscuro** | Botón "Modo oscuro" / "Modo claro" en la barra lateral (y arriba a la derecha en la pantalla de ingreso). Sin elección, sigue el modo del sistema; la elección queda guardada en ese navegador (`public/panel-recursos/tema.js`). |

### Asistente

- **Modelo:** **Gemini 2.5 Flash** (Google), a través de **Vercel AI Gateway** (`panel/src/asistente.ts`), con el crédito gratuito mensual (los modelos de Claude no están incluidos en ese crédito). Reglas que sigue: [asistente-instructivo.md](asistente-instructivo.md) y `panel/src/instructivo-asistente.ts`. En Vercel se autentica con el token OIDC del propio despliegue: no hay claves en el código ni en el repositorio.
- **Qué puede consultar:** el texto visible de las páginas públicas (nunca el panel), el inventario (búsqueda y resumen por categoría), los últimos cambios del registro (sin IP) y las novedades.
- **Cambios de productos (con confirmación):** por ejemplo "poné sin stock el 436249 y 5 unidades al 460460". El asistente identifica cada producto por su código interno COPOL y arma una **propuesta** (`panel/src/propuestas.ts`): stock, cantidad, nombre, marca, descripción, categoría o código. La tarjeta muestra "antes → después" y lo que no se pudo incluir; **nada se guarda hasta tocar "Confirmar cambios"**. Se valida con las mismas reglas que el formulario (sin precios, categorías existentes, códigos únicos), se aplica con control de versión (si alguien cambió el producto mientras tanto, ese cambio no se aplica), cada propuesta sirve una sola vez, es solo del usuario que la pidió y vence a los 15 minutos. En el Registro, los cambios figuran como siempre, con `"via": "asistente"`. No puede tocar imágenes, novedades, usuarios ni textos de páginas.
- **Roles (desde el 14/10/2026):** administradores y editores de stock pueden preparar y confirmar cambios; el visualizador solo consulta (no recibe la herramienta de cambios). Quien no es administrador ve en "últimos cambios" solo movimientos de stock y productos.
- **Límites:** 80 consultas por usuario y por día (`PANEL_ASISTENTE_LIMITE_DIA`), historial de hasta 12 mensajes, hasta 50 productos por propuesta detallada (nombre, marca, stock…) y hasta 400 en un cambio de stock por grupo (`proponer_stock_grupo`: una categoría entera, una marca, un texto, el estado actual o una lista de códigos; el servidor arma la lista y lo aplica en lote al confirmar). Lo aplicado se puede **revertir** (`proponer_revertir`: "revertí", "deshacé"): cada producto vuelve a los valores que tenía, se omiten los que se modificaron después y se confirma en otra tarjeta; para las propuestas anteriores a esta función, el estado previo se toma del Registro. Respuestas de hasta ~4000 tokens.
- **Historial de conversaciones:** cada conversación queda guardada (tabla `conversaciones`, solo la ve su autor; se conservan las últimas 60 por usuario y hasta 120 mensajes cada una). En la columna **Historial** se retoma cualquiera (`/asistente?c=…`), con la fecha y cuántos cambios se aplicaron; el contexto que recibe el modelo sale de lo guardado. Las tarjetas resueltas muestran su estado (Aplicados, Cancelados, Sin efecto) y se puede eliminar una conversación (los cambios aplicados no se deshacen).
- **Flecha Deshacer:** cada respuesta "cambios aplicados" tiene una flecha que prepara la vuelta atrás de **esos** cambios (`POST /asistente/propuestas/:id/deshacer`) en una tarjeta para confirmar; al confirmarla, la respuesta original queda marcada "Cambios deshechos". Funciona también sin JavaScript. Cada consulta queda en el Registro (modelo, pregunta recortada, herramientas usadas y tokens).
- **Costo:** dentro del crédito gratuito mensual de Vercel (US$ 5; tarjeta registrada el 14/10/2026). El plan gratuito admite **5 pedidos por minuto** para todo el equipo: el asistente espera y reintenta solo; si sigue ocupado, pide esperar un minuto.
- La conversación se guarda solo en la pestaña del navegador (sessionStorage) y se borra con "Nueva conversación".

### Escaneo del código interno

- El permiso de cámara se pide **solo al tocar "Escanear código"**. El visor lee códigos de barras (Code 128, EAN-13/8, UPC, Code 39, ITF y QR) y completa el campo; luego se cierra y libera la cámara.
- Usa el lector nativo del navegador cuando existe (Chrome en Android) y, si no, la biblioteca ZXing incluida en el sitio (iPhone, computadoras).
- Si no hay cámara, no se concede el permiso o la conexión no es segura (HTTPS), avisa y el campo sigue disponible para escribir el código a mano.

## Acceso al panel

**Mantener la sesión iniciada:** el ingreso trae una casilla (marcada por defecto) para no tener que ingresar a cada rato: la sesión no se cierra mientras se use, vence tras 30 días sin entrar y, como tope, a los 90 días (`PANEL_SESION_LARGA_INACTIVIDAD_DIAS`, `PANEL_SESION_LARGA_MAX_DIAS`). Sin marcarla, la sesión es la común (30 minutos sin actividad, 8 horas como máximo). Cambiar la contraseña, desactivar la cuenta o «cerrar sesión» en Accesos la invalida. Aparte, «Recordar este equipo» (en el código por correo) evita pedir el PIN y el código durante 30 días.

| Paso | Qué se pide | Detalle |
|---|---|---|
| Dirección | Una dirección no adivinable | Ya no es `/panel` (da 404). Está en `BASE` de `panel/src/config.ts` y en el nombre de la carpeta `src/pages/<dirección>/`; no se enlaza desde el sitio, no está en el mapa del sitio y pide no indexarse. Compartila solo con el equipo. |
| 1. PIN | 6 números, uno para todo el panel | Se guarda solo su hash. Límite: 5 intentos por conexión cada 15 min y 30 en total por hora. Mientras no exista, el primer administrador que ingresa tiene que crearlo; después se cambia en **Mi perfil** (pide la contraseña). |
| 2. Usuario y contraseña | Como antes | Bloqueo de la cuenta tras 5 fallos; límite por conexión guardado en la base (vale para todas las instancias de Vercel). |
| 3. Correo y código | Escribir el correo de la cuenta y el código de 6 números que llega | Código válido 10 min, 5 intentos, hasta 3 envíos (uno por minuto). Se envía con **Resend** (`RESEND_API_KEY`). Sin esa clave el paso queda en pausa y el panel avisa a los administradores. |
| Equipo recordado | Opción "Recordar este equipo por 30 días" | En ese equipo y para esa cuenta no se piden el PIN ni el código durante 30 días (cookie `HttpOnly`; la base guarda solo su hash). Un administrador puede olvidarlo desde **Accesos**. Cambiar el correo, restablecer la contraseña o desactivar la cuenta olvida sus equipos. |

**Accesos** (solo administradores): sesiones abiertas (usuario, IP, lugar aproximado, equipo, inicio y última actividad, con botón para cerrarlas), equipos recordados (con botón para olvidarlos) e historial de accesos: ingresos, contraseñas o PIN incorrectos, códigos enviados o fallidos y bloqueos, filtrable por usuario. La ubicación sale de las cabeceras de Vercel (ciudad y país según la IP).

## Conector para Claude (usa la suscripción de Claude, sin costo en Vercel)

> **Apagado desde el 14/10/2026.** Sus metadatos públicos (`/.well-known/…`) anunciaban la dirección del panel. Para volver a usarlo: variable `PANEL_CONECTOR_CLAUDE=1` en Vercel (la dirección del conector pasa a ser `https://<dominio>/<dirección del panel>/mcp`).

El panel funciona como **conector personalizado (MCP)** de la app de Claude: se conversa en Claude (web, escritorio o celular) y Claude consulta o cambia el stock a través del panel. Requiere un plan de Claude que permita conectores personalizados (Pro, Max, Team o Enterprise). Código: `panel/src/mcp.ts` (herramientas) y `panel/src/oauth.ts` (autorización).

**Cómo conectarlo (una vez):**
1. En Claude: Configuración → Conectores → **Agregar conector personalizado**.
2. Nombre: "Stock COPOL". URL: `https://<dominio>/<dirección del panel>/mcp` ( también figura en *Mi perfil*).
3. Tocar **Conectar**: se abre el panel; ingresar con el usuario del panel y tocar **Permitir**. Claude no ve la contraseña.
4. En un chat, activar el conector y pedir, por ejemplo: "poné sin stock el 436249 y 5 unidades al 460460".

**Qué puede hacer Claude:** `buscar_productos`, `ver_producto`, `listar_categorias`, `ultimos_cambios` (consulta) y `cambiar_stock` (estado y cantidad de hasta 50 productos por vez). Nada más: no hay herramientas para precios, nombres, descripciones, imágenes, novedades, usuarios ni código. Claude pide confirmación antes de usar una herramienta que modifica, según la configuración del conector en Claude.

**Seguridad:**
- OAuth 2.1 con PKCE S256 obligatorio; registro dinámico de clientes solo con regreso a `claude.ai` / `claude.com` (o `localhost` para pruebas). Código de un solo uso (5 min), token de acceso de 1 h y de renovación de 30 días con rotación. Todo se guarda solo como hash SHA-256.
- Cada pedido usa el **rol actual** del usuario que autorizó (un visualizador solo consulta) y exige que la cuenta siga activa.
- Cada cambio queda en el **Registro** como "Cambió el stock" con `"via": "claude"`; la conexión y la desconexión también.
- **Desconectar:** *Mi perfil* → Conexión con Claude → Desconectar (corta el acceso al instante). Cambiar la contraseña no corta la conexión: para eso, desconectar.
- Límites: 240 pedidos por minuto por usuario, 60 canjes de token cada 15 min y 20 registros por hora por conexión.

## Roles

Cada persona puede tener **uno o varios roles**; sus permisos se **suman** (por ejemplo, *Editor de stock* + *Carga de registros* ve y edita el stock y además carga registros). Se eligen con casillas en Usuarios.

| Permiso | Administrador | Editor de stock | Visualizador de stock | Carga de registros |
|---|:-:|:-:|:-:|:-:|
| Consultar el inventario | ✓ | ✓ | ✓ | — |
| Cambiar stock y cantidades | ✓ | ✓ | — | — |
| Agregar y editar productos e imágenes | ✓ | ✓ | — | — |
| Asistente del stock (Claude) | ✓ | ✓ (prepara y confirma cambios) | ✓ (solo consulta) | — |
| Registros: formulario, asistente y planilla | ✓ | — | — | ✓ |
| Información empleados | ✓ | ✓ | ✓ | ✓ |
| Administración Página (banner y novedades) | ✓ | — | — | — |
| Usuarios, estadísticas, accesos y registro de cambios | ✓ | — | — | — |
| Vaciar la planilla de prueba | ✓ | — | — | — |

Los usuarios que ya existían conservan su rol (se migran solos). En la base, `usuarios.roles` guarda la lista («editor,registros») y `usuarios.rol` queda solo por compatibilidad. El **administrador principal** (creado con `npm run panel:admin`) es una cuenta protegida: nadie más puede cambiarla ni eliminarla, y siempre queda al menos un administrador activo. Los permisos se definen en `panel/src/seguridad.ts`.

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
| Registros cargados | Hoja de **Google Sheets** (datos completos) + tabla `registros` en Turso (resumen; completo solo en modo de prueba) |
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

Sitio en http://localhost:4321 y panel en http://localhost:4321/<dirección del panel> (ver `BASE` en `panel/src/config.ts`). Sin variables de entorno se usan la base y la carpeta de imágenes locales.

## Verificación

- `npm run panel:test` — 22 pruebas: acceso sin sesión, contraseñas incorrectas, CSRF, cookie segura, contraseña temporal, bloqueo, permisos por rol, administrador protegido, guardado de stock verificado (con y sin JavaScript), cantidad ↔ estado, ediciones simultáneas, etiqueta "Código interno COPOL", validación de productos e imágenes, novedades (crear, publicar, ordenar, despublicar), alta de usuarios por correo, cambio de contraseña en el perfil, ausencia de contraseñas en texto plano, interfaz sin rubros futuros y cabeceras.
- `npm run qa:panel` (con `npm run dev` en marcha) — prueba de punta a punta en Edge: cambio real de stock en el panel → la tarjeta pública pasa a "Sin stock" gris y vuelve a "Con stock" verde; escaneo con cámara simulada que muestra un EAN-13 y caso sin permiso; alta y cambio de contraseña de un usuario; novedad creada, publicada (aparece en Inicio) y despublicada (desaparece). Usa un usuario temporal y deja los datos como estaban.

## Registros: conectar la hoja de Google (una sola vez)

Se hace con las mismas variables que usaba el panel de registros aparte (`copol-registros`), cargadas en el proyecto de Vercel `copol`:

1. Copiar `GOOGLE_CREDENCIALES` (el JSON de la cuenta de servicio, en una línea) y `GOOGLE_HOJA` (el enlace de la hoja) desde *Project Settings → Environment Variables* de `copol-registros` a las del proyecto `copol` (Production).
2. La hoja ya está compartida con la cuenta de servicio como *Editor*; no hay que tocarla. El panel crea solo la pestaña del mes con su cabecera.
3. Redeploy. En **Registros → Planilla** aparece «Abrir hoja de Google» y el aviso de «modo de prueba» desaparece.

Opcionales: `IA_MODELO` (por defecto `google/gemini-2.5-flash`), `IA_LIMITE_DIA` (150 consultas por persona y día) e `IA_APAGADA=1`. El asistente usa el mismo AI Gateway que el del stock (sin clave en Vercel).

No se portó la conexión con Excel de Microsoft del panel anterior (nunca se usó: los registros van a Google Sheets). Los usuarios, el PIN y los accesos del panel de registros viejo **no se migran**: en el panel único se usan los usuarios, el PIN y los códigos por correo del panel de stock.
