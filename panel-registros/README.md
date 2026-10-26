# Panel de registros (COPOL)

Herramienta aparte del sitio, del panel de stock y del panel de envíos: no comparte código, base de datos ni
despliegue con ellos. Se publica en Vercel como **proyecto propio** (`copol-registros`, carpeta raíz
`panel-registros`).

## Qué hace

- **Formulario**: Nombre, N° de socio, Cédula, Dirección, Producto, Código interno, Flete (Sí/No, por defecto No)
  Service e Información adicional (los dos opcionales). Valida la cédula con su dígito verificador (la guarda como `1.234.567-8`) y el N° de
  socio. Lo que empieza con `=`, `+`, `-` o `@` se guarda como texto para que Excel no lo tome como fórmula.
- **Dirección con ubicación**: al escribir calle y número aparecen las direcciones encontradas (el mismo buscador
  del panel de envíos: OpenStreetMap, con validación del número de puerta). Al elegir una se genera el link a
  Google Maps; en la planilla la dirección queda **clicable** (`=HYPERLINK(...)`, en azul) y abre ese link. Si el
  asistente completa la dirección, se buscan solas las opciones para elegir. Sin elegir, se guarda solo el texto.
- **Asistente (chat)**: se escribe, se pega o **se dicta con el micrófono** el mensaje como llegó; la IA completa
  el formulario y responde qué hizo y qué falta. Entiende correcciones («el código es 4521», «no lleva flete»).
  Cada respuesta que cambió campos tiene la flecha **Deshacer** (como en el panel de stock), que devuelve esos
  campos a como estaban. La IA nunca guarda: la persona revisa y guarda. Al guardar empieza otra conversación.
  El micrófono usa el reconocimiento de voz del navegador (Chrome y Edge; en Firefox no aparece).
- **Fotos y archivos**: en el chat, **Foto** (abre la cámara en el celular) y **Adjuntar** (clip) mandan una foto, un
  PDF o un `.txt` a la IA, que lee los datos impresos o escritos (factura, comprobante, etiqueta, cédula, captura de
  WhatsApp) y completa el formulario. También se puede pegar una captura (Ctrl+V) o arrastrarla. Hasta 3 archivos
  por mensaje; las fotos se reducen en el navegador (1600 px) y los PDF pueden pesar hasta 2,5 MB. Se validan por su
  contenido real y **no se guardan**: solo se mandan a la IA para leerlos. Un `.txt` se pega en la caja de texto.
- **Planilla**: cada registro es una fila de una planilla de Excel en la nube (OneDrive/SharePoint). Mientras no
  se conecte Microsoft, va a una **planilla de prueba** compartida que se ve en el panel y se descarga como
  `.xlsx`.
- **Usuarios** con dos roles: **Administrador** (todo: usuarios, PIN, accesos, vaciar la planilla, conectar
  Excel) y **Carga de formularios** (formulario, asistente y ver o descargar la planilla).
- **Actividad**: quién cargó cada registro (usuario, cuándo, socio, producto, código y en qué pestaña o planilla
  quedó) y qué cambios hicieron los administradores (usuarios, vaciar la planilla). Los últimos 3000, solo para
  administradores.
- **Accesos**: registro de ingresos, intentos fallidos y cambios de usuarios (los últimos 400).
- **Modo oscuro** (botón en la barra lateral; sin elegir, sigue al sistema).

## Seguridad (la misma que el panel de stock)

1. **Dirección secreta** (`PANEL_RUTA`): fuera de ella toda dirección responde `404: NOT_FOUND`, también la
   raíz. No se enlaza desde ningún lado, no se indexa (`noindex`, `robots.txt`) y no hay recursos públicos que
   delaten el panel.
2. **PIN de 6 números**, uno para todo el panel, antes del usuario y la contraseña.
3. **Usuario y contraseña** (scrypt; mínimo 10 caracteres con 3 tipos). 5 intentos fallidos bloquean la cuenta
   15 minutos; 20 por conexión, también.
4. **Código de 6 números por correo**: la persona escribe el correo de su cuenta y le llega un código (vence en
   10 min; 5 intentos; 3 envíos). Se envía con Resend (`RESEND_API_KEY`, la misma cuenta que el panel de stock).
   Sin esa clave, la verificación por correo queda en pausa y se avisa a los administradores.
5. **Equipo recordado** 30 días (opcional al ingresar): en ese equipo no se piden el PIN ni el código.
6. Sesión en cookie firmada (`HttpOnly`, `Secure`, `__Host-`). Si la persona marca «Recordar este equipo», la
   sesión **no se cierra mientras la use** (30 días sin actividad, 90 como máximo); si no, 30 minutos de inactividad y 8
   horas como máximo.
   Cambiar la contraseña, desactivar la cuenta o «Cerrar sus sesiones» la invalida en todos los equipos.
7. Todo pedido que cambia algo tiene que venir de la propia página (origen y JSON). Cabeceras CSP,
   HSTS, `X-Frame-Options: DENY` y permisos (solo micrófono, de la propia página).
8. Los usuarios recién creados (o con contraseña restablecida) tienen que elegir una contraseña nueva al entrar.

## Primera vez

Con el panel vacío, la dirección secreta muestra **Configuración inicial**: con el código `PANEL_CODIGO_INICIAL`
se crea el administrador principal `bpereira` (protegido: no se puede borrar ni bajar de rol), su correo y
contraseña, y el PIN del panel. Esa pantalla desaparece para siempre. Después, desde **Usuarios** se crean los
demás (con contraseña temporal).

## Publicar en Vercel

1. Proyecto `copol-registros`, *Root Directory* `panel-registros`, *Framework Preset* **Other**, sin compilación.
2. *Storage → Create → Blob* con acceso **Private** → conectarlo al proyecto (crea `BLOB_READ_WRITE_TOKEN`).
3. Variables (abajo). Como mínimo: `PANEL_RUTA`, `SESION_SECRETO`, `PANEL_CODIGO_INICIAL` y `RESEND_API_KEY`.
4. AI Gateway: el mismo de la cuenta de Vercel que usa el panel de stock (no lleva clave).

## Variables

| Variable | Para qué |
|---|---|
| `PANEL_RUTA` | Dirección secreta, p. ej. `/cr-x7k2m9q4vw` (8+ letras o números). Cambiarla cambia el enlace. |
| `SESION_SECRETO` | Firma de las cookies (32+ caracteres al azar). Cambiarlo cierra todas las sesiones. |
| `PANEL_CODIGO_INICIAL` | Código para la configuración inicial (se usa una vez). |
| `PANEL_ADMIN_INICIAL` | Usuario del administrador principal (por defecto `bpereira`). |
| `RESEND_API_KEY`, `PANEL_CORREO_REMITENTE` | Envío del código por correo (Resend). |
| `BLOB_READ_WRITE_TOKEN` | Almacén privado: usuarios, PIN, accesos, planilla de prueba (se crea solo). |
| `PANEL_SESION_INACTIVIDAD_MIN`, `PANEL_SESION_MAX_HORAS` | Duración de la sesión (30 min / 8 h). |
| `IA_MODELO`, `IA_LIMITE_DIA`, `IA_APAGADA` | Asistente: modelo de AI Gateway (`google/gemini-2.5-flash`), consultas por persona y día (150), apagarlo. |
| `GOOGLE_CREDENCIALES`, `GOOGLE_HOJA` | Google Sheets (arriba). |
| `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_CUENTA` o `MS_USUARIO`+`MS_TENANT`, `EXCEL_ENLACE`, `EXCEL_RUTA`, `EXCEL_TABLA`, `MS_REDIRECT_URI` | Excel en la nube (abajo). |

## Conectar con Google Sheets (gratis, sin tarjeta)

1. https://console.cloud.google.com → proyecto nuevo → *APIs y servicios → Biblioteca* → activar **Google Sheets API**.
2. *IAM y administración → Cuentas de servicio → Crear* (nombre `registros`, sin roles) → pestaña *Claves → Agregar
   clave → JSON*: baja un archivo. Su contenido completo va en `GOOGLE_CREDENCIALES`.
3. En Google Sheets, crear la hoja y **compartirla con el correo de la cuenta de servicio** (`…@…iam.gserviceaccount.com`)
   como *Editor*. El enlace de la hoja va en `GOOGLE_HOJA`.
4. Listo: el panel usa **una pestaña por mes** («Octubre 2026», «Noviembre 2026»…), con la hora de Montevideo del
   momento de guardar. La crea sola, con su cabecera, cuando llega el primer registro del mes; al cambiar el mes
   los registros pasan solos a la siguiente. Las pestañas anteriores no se tocan. La
   dirección queda clicable (`=HYPERLINK`). La cuenta de servicio solo ve esa hoja. Si además hay variables de
   Microsoft, estas tienen prioridad.

## Conectar con Excel (Microsoft)

1. El archivo: o bien su enlace de **Compartir** con permiso de edición en `EXCEL_ENLACE` (recomendado: sirve aunque
   la cuenta conectada no sea la dueña, si tiene acceso), o bien un libro en el OneDrive de la cuenta conectada con
   su ruta en `EXCEL_RUTA` (p. ej. `COPOL/Registros COPOL.xlsx`).
2. https://entra.microsoft.com → *App registrations* → *New registration*: cuentas «any organizational directory
   and personal Microsoft accounts»; *Redirect URI* (Web) `https://<dominio><PANEL_RUTA>/api/microsoft/vuelta`.
   *Certificates & secrets* → secreto nuevo. Variables `MS_CLIENT_ID` y `MS_CLIENT_SECRET`.
3. **Modo cuenta** (recomendado): `MS_CUENTA` = correo dueño del archivo; permisos delegados `Files.ReadWrite`,
   `User.Read`, `offline_access`. Un administrador entra a **Planilla → Conectar cuenta de Microsoft**.
4. **Modo aplicación** (solo Microsoft 365 empresa): `MS_USUARIO` y `MS_TENANT`; permiso de aplicación
   `Files.ReadWrite.All` con consentimiento de un administrador de Microsoft 365.

La primera vez el panel crea en el archivo una hoja y una tabla **Registros** con las columnas
Fecha · Nombre · N° de socio · Cédula · Dirección · Service · Flete · Producto · Código interno · Cargado por · Información adicional.
Lo cargado en la planilla de prueba no se copia: descargarla antes.

## Probar en la computadora

```bash
cd panel-registros
npm install
PANEL_CODIGO_INICIAL=prueba-12345 CORREO_CONSOLA=1 npm run dev   # http://localhost:4400/panel/
npm test
```

Sin `PANEL_RUTA` la dirección es `/panel`; `CORREO_CONSOLA=1` muestra el código en la consola en lugar de
mandarlo; el almacén son archivos en `datos/`. Para el asistente hace falta `AI_GATEWAY_API_KEY`.

## Estructura

```
api/index.js        Único punto de entrada (vercel.json manda todo acá)
api/_lib/app.js     Rutas: dirección secreta, acceso, usuarios, formulario, planilla, asistente, Microsoft
api/_lib/           acceso (PIN, código, cookies, correo, registro de accesos), seguridad, usuarios, almacen,
                    campos, asistente, planilla, xlsx, microsoft, http
app/                Página: index.html y recursos/ (app.js, panel.css del panel de stock, registros.css, tema.js)
public/robots.txt   Lo único público
servidor-local.js   Servidor para `npm run dev`
test/               Pruebas
```
