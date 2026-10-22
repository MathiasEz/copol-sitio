# Publicación en producción y reemplazo de Odoo

El sitio está listo para publicarse en **Vercel** (pasos en el [README](../README.md#publicar-github-privado--vercel)), pero **todavía no es un reemplazo terminado** del sitio actual. Esta es la lista de lo que falta, quién lo tiene que resolver y cómo.

## 1. Requisitos bloqueantes

| # | Requisito | Estado | Responsable | Detalle |
|---|---|---|---|---|
| P1 | **Backend del formulario de contacto** | Falta | Cooperativa + TI | El formulario necesita un endpoint que reciba los datos y los entregue (correo o sistema). Hoy funciona en modo demostración y lo avisa en pantalla. Ver §2. |
| P2 | **Hosting (Vercel), base Turso y Vercel Blob** | Preparado; falta crear las cuentas | Cooperativa | Repositorio privado en GitHub conectado a Vercel; base Turso y Blob Store conectados desde Vercel (crean las variables solas). Ver README § Publicar. |
| P3 | **Dominio y DNS** | Falta acceso y aprobación | Cooperativa / proveedor actual (mvdsimple / mvdgestiona) | Agregar el dominio en Vercel y crear los registros DNS que indique, en la ventana de cambio acordada con el proveedor de Odoo. No se tocó el DNS. |
| P4 | **Redirecciones 301** | Listas | — | Las de `astro.config.mjs` (`/locales`, `/bazar`, `/como-hacerte-socio`, etc.) se publican en Vercel como redirecciones permanentes del servidor. |
| P5 | **Licencia web de Articulat CF** | Falta | Cooperativa | Sin ella se mantiene la fuente provisoria Figtree. |
| P6 | **Política de privacidad** | Falta | Cooperativa (asesoría legal) | El formulario recoge datos personales (Ley 18.331 de Protección de Datos Personales). Se necesita el texto y una página para enlazarlo desde el formulario. |
| P8 | **Panel de stock en producción** | Listo; se publica con el sitio en una dirección no adivinable (ver `BASE` en `panel/src/config.ts`) | Cooperativa | Cargar los datos en Turso, crear el administrador principal y programar respaldos (`npm run panel:respaldo`) guardados fuera del equipo. Ver [panel-stock.md](panel-stock.md). |
| P7 | **Confirmar la app Android** | Pendiente | Cooperativa | Confirmar si el APK `copol.com.uy/CopolSocios/Copol.apk` (sin cambios desde 2021) es el vigente o si hay un enlace a Google Play. Se configura en `ACCESO.appAndroid` (`src/data/confirmado/sitio.ts`). |

## 2. Opciones para el formulario (P1)

El formulario envía `POST multipart/form-data` a `PUBLIC_FORM_ENDPOINT` con los campos `nombre`, `telefono`, `email`, `asunto`, `consulta` y el campo trampa `sitio_web`. Si recibe una respuesta 2xx, muestra el mensaje de éxito; si no, un mensaje de error con alternativas. Probé los dos casos con un servidor local de prueba.

| Opción | Costo/esfuerzo | Notas |
|---|---|---|
| **A. Función serverless propia** (Cloudflare Worker / Netlify Function) que envía un correo a `socios@copol.com.uy` vía un servicio SMTP/API (p. ej., Resend, Mailgun, SMTP de la cooperativa) | Bajo costo; requiere TI | Recomendada: los datos quedan bajo control de la cooperativa. Agregar verificación anti-spam (Turnstile/hCaptcha) y límite de envíos. |
| B. Servicio de formularios (Formspree, Basin, Getform) | Plan pago según volumen | Lo más rápido: se crea el formulario y se pega la URL en `PUBLIC_FORM_ENDPOINT`. Los datos pasan por un tercero. |
| C. Endpoint de Odoo (`/website/form/`) | Depende del proveedor | Solo si Odoo sigue activo como backend (CRM). Requiere token CSRF y CORS: hay que coordinarlo con el proveedor. |

Pasos: (1) elegir opción; (2) crear `.env` con `PUBLIC_FORM_ENDPOINT=…` o definir la variable en el hosting; (3) `npm run build`; (4) enviar una consulta real de prueba y confirmar que llega.

## 3. Recomendados antes del lanzamiento

- **Analítica**: el sitio anterior usa Google Analytics `G-SFNS07RFKE` y GTM `GTM-5D4C94CJ`. No se incluyeron. Si se quieren conservar, agregar el script en `src/layouts/Base.astro`, más un aviso de cookies si corresponde.
- **Google Search Console**: verificar el dominio y enviar `https://cooperativapolicial.com.uy/sitemap-index.xml`.
- **Contenido**: resolver los ítems de [pendientes.md](pendientes.md).
- **Proceso de actualización**: el stock, los productos nuevos y las novedades se cambian desde el panel y se ven al instante. Los demás contenidos (textos, locales, convenios) siguen en archivos del proyecto: cada cambio se publica solo al hacer un commit en el repositorio conectado a Vercel.
- **Catálogo y stock del Bazar**: el catálogo está guardado en el proyecto (no depende de Google Sites); el stock vigente se lee de la base del panel; la CDN de Vercel guarda la página y el panel la renueva al guardar un cambio (docs/panel-stock.md).

## 4. Lista de verificación de lanzamiento

- [ ] `npm run verificar` sin errores.
- [ ] `node scripts/check-site.mjs --externos` sin avisos relevantes.
- [ ] Formulario configurado y probado de punta a punta.
- [ ] Política de privacidad publicada y enlazada.
- [ ] Redirecciones 301 activas y probadas.
- [ ] DNS apuntando al nuevo hosting, con HTTPS válido.
- [ ] Sitemap enviado a Search Console.
- [ ] Odoo: decidir si se da de baja o queda como backend.
- [ ] Variables `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` y `BLOB_READ_WRITE_TOKEN` cargadas en Vercel (Production y Preview).
- [ ] Datos cargados en Turso y administrador principal creado, con contraseña definitiva.
- [ ] Prueba en la URL de Vercel: cambio de stock en el panel visible en el Bazar, escaneo con cámara y una novedad publicada.
- [x] Respaldo programado: diario y cifrado (Cron de Vercel → Vercel Blob, carpeta respaldos/, 30 días; CRON_SECRET y RESPALDO_CLAVE en Vercel desde el 22/10/2026). Guardar una copia de RESPALDO_CLAVE fuera de Vercel.
- [ ] Restauración de prueba hecha (npm run panel:descifrar + npm run panel:restaurar en una base local).
