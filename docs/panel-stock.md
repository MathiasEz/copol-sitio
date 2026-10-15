# Panel de stock del Bazar

Panel para que el personal autorizado consulte y actualice el inventario del Bazar, agregue productos y publique novedades en la portada. El código vive en `panel/` y se publica en la ruta **`/panel`** del mismo despliegue de Vercel. No está enlazado desde el sitio, pero eso **no es una medida de seguridad**: todas sus páginas exigen usuario y contraseña, y cada acción se autoriza en el servidor según el rol.

> Ningún sistema conectado a Internet es "imposible de hackear". El panel aplica medidas razonables (abajo); su seguridad depende también de usar contraseñas fuertes y mantener las dependencias actualizadas.

## Cómo viaja el stock (y por qué ahora se ve al instante)

```
Panel          ──escribe──►  Base de datos (Turso / libSQL)  ◄──lee en cada visita──  Web pública
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
| **Asistente** | Chat con IA (Gemini 2.5 Flash) para preguntas sobre la web pública, el inventario y el uso del panel, y para **preparar cambios de productos** que se aplican solo al confirmarlos. Todos los roles: el visualizador solo consulta. |
| **Modo claro / oscuro** | Botón "Modo oscuro" / "Modo claro" en la barra lateral (y arriba a la derecha en la pantalla de ingreso). Sin elección, sigue el modo del sistema; la elección queda guardada en ese navegador (`public/panel-recursos/tema.js`). |

### Asistente

- **Modelo:** **Gemini 2.5 Flash** (Google), a través de **Vercel AI Gateway** (`panel/src/asistente.ts`), con el crédito gratuito mensual (los modelos de Claude no están incluidos en ese crédito). Reglas que sigue: [asistente-instructivo.md](asistente-instructivo.md) y `panel/src/instructivo-asistente.ts`. En Vercel se autentica con el token OIDC del propio despliegue: no hay claves en el código ni en el repositorio.
- **Qué puede consultar:** el texto visible de las páginas públicas (nunca el panel), el inventario (búsqueda y resumen por categoría), los últimos cambios del registro (sin IP) y las novedades.
- **Cambios de productos (con confirmación):** por ejemplo "poné sin stock el 436249 y 5 unidades al 460460". El asistente identifica cada producto por su código interno COPOL y arma una **propuesta** (`panel/src/propuestas.ts`): stock, cantidad, nombre, marca, descripción, categoría o código. La tarjeta muestra "antes → después" y lo que no se pudo incluir; **nada se guarda hasta tocar "Confirmar cambios"**. Se valida con las mismas reglas que el formulario (sin precios, categorías existentes, códigos únicos), se aplica con control de versión (si alguien cambió el producto mientras tanto, ese cambio no se aplica), cada propuesta sirve una sola vez, es solo del usuario que la pidió y vence a los 15 minutos. En el Registro, los cambios figuran como siempre, con `"via": "asistente"`. No puede tocar imágenes, novedades, usuarios ni textos de páginas.
- **Roles (desde el 14/10/2026):** administradores y editores de stock pueden preparar y confirmar cambios; el visualizador solo consulta (no recibe la herramienta de cambios). Quien no es administrador ve en "últimos cambios" solo movimientos de stock y productos.
- **Límites:** 80 consultas por usuario y por día (`PANEL_ASISTENTE_LIMITE_DIA`), historial de hasta 12 mensajes, hasta 50 productos por propuesta detallada (nombre, marca, stock…) y hasta 400 en un cambio de stock por grupo (`proponer_stock_grupo`: una categoría entera, una marca, un texto, el estado actual o una lista de códigos; el servidor arma la lista y lo aplica en lote al confirmar). Lo aplicado se puede **revertir** (`proponer_revertir`: "revertí", "deshacé"): cada producto vuelve a los valores que tenía, se omiten los que se modificaron después y se confirma en otra tarjeta; para las propuestas anteriores a esta función, el estado previo se toma del Registro. Respuestas de hasta ~4000 tokens. Cada consulta queda en el Registro (modelo, pregunta recortada, herramientas usadas y tokens).
- **Costo:** dentro del crédito gratuito mensual de Vercel (US$ 5; tarjeta registrada el 14/10/2026). El plan gratuito admite **5 pedidos por minuto** para todo el equipo: el asistente espera y reintenta solo; si sigue ocupado, pide esperar un minuto.
- La conversación se guarda solo en la pestaña del navegador (sessionStorage) y se borra con "Nueva conversación".

### Escaneo del código interno

- El permiso de cámara se pide **solo al tocar "Escanear código"**. El visor lee códigos de barras (Code 128, EAN-13/8, UPC, Code 39, ITF y QR) y completa el campo; luego se cierra y libera la cámara.
- Usa el lector nativo del navegador cuando existe (Chrome en Android) y, si no, la biblioteca ZXing incluida en el sitio (iPhone, computadoras).
- Si no hay cámara, no se concede el permiso o la conexión no es segura (HTTPS), avisa y el campo sigue disponible para escribir el código a mano.

## Acceso al panel

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

| Permiso | Administrador | Editor de stock | Visualizador de stock |
|---|:-:|:-:|:-:|
| Consultar el inventario | ✓ | ✓ | ✓ |
| Cambiar stock y cantidades | ✓ | ✓ | — |
| Agregar y editar productos e imágenes | ✓ | ✓ | — |
| Novedades | ✓ | — | — |
| Usuarios y registro de cambios | ✓ | — | — |
| Asistente (Claude) | ✓ | ✓ (prepara y confirma cambios) | ✓ (solo consulta) |

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

Sitio en http://localhost:4321 y panel en http://localhost:4321/<dirección del panel> (ver `BASE` en `panel/src/config.ts`). Sin variables de entorno se usan la base y la carpeta de imágenes locales.

## Verificación

- `npm run panel:test` — 22 pruebas: acceso sin sesión, contraseñas incorrectas, CSRF, cookie segura, contraseña temporal, bloqueo, permisos por rol, administrador protegido, guardado de stock verificado (con y sin JavaScript), cantidad ↔ estado, ediciones simultáneas, etiqueta "Código interno COPOL", validación de productos e imágenes, novedades (crear, publicar, ordenar, despublicar), alta de usuarios por correo, cambio de contraseña en el perfil, ausencia de contraseñas en texto plano, interfaz sin rubros futuros y cabeceras.
- `npm run qa:panel` (con `npm run dev` en marcha) — prueba de punta a punta en Edge: cambio real de stock en el panel → la tarjeta pública pasa a "Sin stock" gris y vuelve a "Con stock" verde; escaneo con cámara simulada que muestra un EAN-13 y caso sin permiso; alta y cambio de contraseña de un usuario; novedad creada, publicada (aparece en Inicio) y despublicada (desaparece). Usa un usuario temporal y deja los datos como estaban.
