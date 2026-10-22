# Plan de mejoras — sitio y panel COPOL (22/10/2026)

**Hecho el 22/10/2026:** S10 (encabezados de seguridad del sitio, `vercel.json`), F1 (ofertas editables desde el panel, con vencimiento), F2 (fechas de créditos editables; las pasadas se ocultan solas), F3 (novedades programadas), S4 (respaldo diario cifrado en Vercel Blob a las 04:00, últimos 30; `npm run panel:descifrar` + `npm run panel:restaurar`) S7 en parte (GitHub Actions corre `npm run verificar` en cada push; falta proteger la rama `main` en GitHub).

**Hecho el 22/10/2026 (2.ª tanda):** V3 (transiciones suaves entre páginas, solo CSS), V4 (visor ampliado en las ofertas de Promociones y en la ficha del Bazar: `src/components/Visor.astro`), V5 (botón flotante de WhatsApp en celulares, salvo en el Bazar) y F5 con estadísticas propias sin cookies (`panel/src/estadisticas.ts`, `/api/e`) y la página **Estadísticas** del panel (solo administradores).

Propuestas ordenadas por prioridad. **Esfuerzo:** S (horas) · M (1–3 días) · L (una semana o más).
Lo que ya existe no se repite acá: contraseñas con scrypt, PIN de entrada, código por correo, CSRF, política de
seguridad estricta (CSP) en el panel, roles verificados en el servidor, registro de cambios y de accesos, dirección
del panel no adivinable, imágenes re-codificadas (sin metadatos ni contenido oculto) y caché en la CDN.

## 1. Seguridad

### Panel
| # | Mejora | Por qué | Esfuerzo | Prioridad |
|---|---|---|---|---|
| S1 | **Configurar el envío de correos (RESEND_API_KEY)** y un dominio remitente propio (p. ej. `panel@cooperativapolicial.com.uy`) | Hoy la verificación por correo está en pausa: se entra solo con PIN + usuario + contraseña. | S | Alta |
| S2 | **Llaves de acceso (passkeys / WebAuthn)** o app autenticadora (TOTP) para administradores | Un segundo factor que no depende del correo y resiste el phishing. | M | Alta |
| S3 | **Reglas del firewall de Vercel**: límite de pedidos a la dirección del panel, desafío ante tráfico sospechoso y, si corresponde, permitir el panel solo desde Uruguay | Frena ataques de fuerza bruta antes de que lleguen a la función. | S | Alta |
| S4 | **Respaldo automático diario** de la base (Turso) a Vercel Blob con un Cron de Vercel, conservando 30 días | Hoy el respaldo es manual (`npm run panel:respaldo`). | M | Alta |
| S5 | **Aviso por correo** al administrador cuando alguien entra desde un equipo nuevo o hay muchos intentos fallidos | Detección temprana de accesos indebidos. | S | Media |
| S6 | **Confirmar la contraseña de nuevo** antes de acciones delicadas (borrar usuarios, cambiar roles, cambiar el PIN) | Una sesión olvidada abierta no alcanza para hacer daño grave. | S | Media |
| S7 | **Proteger la rama `main`**: cambios por pull request, pruebas automáticas (GitHub Actions: `npm run verificar`) y despliegue de vista previa antes de producción | Hoy un push a `main` publica directo. | S | Media |
| S8 | **Dependabot + `npm audit`** semanal y escaneo de secretos en GitHub | Dependencias al día y ninguna clave filtrada en el código. | S | Media |
| S9 | **Limpieza de imágenes huérfanas** en Vercel Blob (banners, novedades y productos reemplazados) | Menos costo y menos archivos públicos olvidados. | S | Baja |

### Sitio público
| # | Mejora | Por qué | Esfuerzo | Prioridad |
|---|---|---|---|---|
| S10 | **Encabezados de seguridad en todo el sitio** (`vercel.json`): HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors` y una CSP para la web | Hoy solo el panel los tiene. Evita que el sitio se incruste en páginas falsas (clickjacking). | S | Alta |
| S11 | **Correo del dominio con SPF, DKIM y DMARC** (y DNSSEC si el proveedor lo permite) | Impide que alguien mande correos falsos "de COPOL" a los socios. | S | Alta (al pasar el dominio) |
| S12 | **Cloudflare Turnstile** (verificación sin captcha molesto) en cualquier formulario que se agregue | Evita spam y robots. | S | Cuando haya formularios |

## 2. Mejoras visuales
| # | Mejora | Esfuerzo | Prioridad |
|---|---|---|---|
| V1 | **Tipografía oficial Articulat CF** (licencia web) en lugar de Figtree, como pide el Manual de marca | S (con los archivos) | Alta |
| V2 | **Fotos propias faltantes**: Ciudad del Plata, segunda de Pinecoop Chuy, interiores de locales y del Bazar | — (cooperativa) | Alta |
| V3 | **Transiciones suaves entre páginas** (View Transitions del navegador): el encabezado queda fijo y el contenido cambia con un fundido | S | Media |
| V4 | **Visor ampliado** en Promociones y en el Bazar: tocar una pieza o producto la abre grande, con deslizamiento entre fotos | M | Media |
| V5 | **Botón flotante de WhatsApp** discreto en celulares (aparece al bajar) | S | Media |
| V6 | **Galería de Pinecoop** con fotos de cabañas, piscina y playa | M | Media |
| V7 | **Íconos e ilustraciones del Manual** (trama de íconos) en encabezados de sección, con moderación | S | Baja |

## 3. Funcionalidades nuevas
| # | Mejora | Por qué | Esfuerzo | Prioridad |
|---|---|---|---|---|
| F1 | **Ofertas del supermercado editables desde el panel** (subir las piezas del mes, orden y fecha de vencimiento) | Hoy cambiarlas requiere tocar el código cada mes; las de octubre vencen el 31/10/2026. Se reutiliza lo hecho para el banner. | M | **Alta** |
| F2 | **Fechas de apertura de créditos editables** desde el panel | Hoy están en el código. | S | Alta |
| F3 | **Publicación programada de novedades** (desde/hasta, como el banner) | Promociones que se retiran solas. | S | Media |
| F4 | **Puente con el sistema de stock de la cooperativa** (lectura automática del stock por local) | Evita cargar el stock dos veces. Ver preguntas para la reunión. | L | Alta (tras la reunión) |
| F5 | **Medición de visitas** (Vercel Web Analytics + Speed Insights) y conteo de clics a WhatsApp por producto | Saber qué productos y campañas interesan. | S | Media |
| F6 | **Pre-registro "Hacete socio"** con formulario que llega al panel (y aviso por correo/WhatsApp al equipo) | Menos fricción para asociarse; con Turnstile (S12). | M | Media |
| F7 | **Buscador general del sitio** (servicios, convenios, locales y productos) | Encontrar todo desde un solo lugar. | M | Media |
| F8 | **Bazar: compartir producto por WhatsApp, filtro por marca y "avisame cuando haya stock"** | Más consultas y ventas. | M | Media |
| F9 | **Locales: "abierto ahora" y botón "Cómo llegar"** | Útil en el celular. | S | Baja |
| F10 | **Panel instalable (PWA)** con uso sin señal para el inventario | Para depósito y locales con mala conexión. | M | Baja |
| F11 | **Datos estructurados por local** (Google: horarios, teléfono, mapa) y perfil de Google Business | Mejor presencia en búsquedas y Google Maps. | S | Media |

## Orden sugerido
1. **Esta semana:** S1, S3, S10, F1 (antes de fin de mes, por las ofertas de octubre).
2. **Próximas dos semanas:** S2, S4, S7, F2, V1 (si llega la licencia), F5.
3. **Después:** el resto, según lo que surja de la reunión de stock (F4).
