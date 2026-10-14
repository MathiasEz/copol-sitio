# Hito 1 — Auditoría del sitio y del proyecto

**Fecha:** 12/10/2026 · **Sitio auditado:** https://cooperativapolicial.com.uy
**Método:** navegador integrado (vista ~800 px y emulación móvil 375×812), extracción del DOM con JavaScript, `fetch` del HTML servido para subpáginas y peticiones HTTP `HEAD`/`GET` desde PowerShell para comprobar enlaces externos.

Leyenda: **[V]** verificado directamente · **[I]** inferencia que hay que confirmar.

---

## 0. Estado del repositorio local

| Elemento | Estado |
|---|---|
| Código del sitio | **No existe.** La carpeta solo contiene `.agents/skills` y `.claude/skills` (`landing-page-design`, `scroll-world`, `grill-me` → `grilling`). [V] |
| `package.json`, framework, tests | Ninguno. [V] |
| Git | La carpeta **no es un repositorio git** y `git` no está instalado. [V] |
| Node / npm / Python | **No instalados** (`python` es solo el alias de Microsoft Store). [V] |
| Recursos de marca locales | Ninguno (sin logos, fotos ni manual). [V] |

**Consecuencia:** no hay trabajo previo que preservar ni convenciones que seguir. La elección de stack depende de si se puede instalar Node (ver §5 y preguntas).

---

## 1. Registro de navegación

El sitio actual corre sobre **Odoo** (CMS) con bloques HTML/CSS/JS personalizados (prefijos `cpol-*`).

| Sección | URL real | ¿Visitada? | Qué se comprobó | Qué NO se pudo verificar |
|---|---|---|---|---|
| Inicio | `/` | Sí, en navegador (escritorio ~800 px y móvil 375 px) | Textos, enlaces, 14 imágenes, carrusel hero (5 slides), cuenta regresiva de créditos, contadores, horarios, pie. Peso y número de peticiones. | Vista en escritorio ancho (≥1280 px): el panel mide ~800 px. Varias capturas de pantalla fallaron por tiempo de renderizado; el contenido se verificó por DOM. |
| Sobre nosotros | — | Sí | **No es una página**: es un desplegable con `href="#"` que agrupa Locales y Nuestra historia. | — |
| Locales | `/locales` | Sí, en navegador | 19 locales con dirección, teléfonos, email y coordenadas (extraídas de los enlaces "Cómo llegar"). Mapa Leaflet + OpenStreetMap, filtros. | No se probó la interacción del mapa con clic. |
| Nuestra historia | `/nuestra-historia` | Sí, en navegador | Texto completo, línea de tiempo 1917/1957, cita del Cnel. Alberto E. Mussio, cifras, enlace a Estatutos (anyflip, responde 200). | No se abrió el documento de Estatutos por dentro. |
| Beneficios | — | Sí | **No es una página**: desplegable `href="#"`. Servicios sociales vive en `/beneficios`. | — |
| Servicios sociales | `/beneficios` + 7 subpáginas | `/beneficios` en navegador; subpáginas por HTML servido (`fetch`) | Psicólogo Copol, Pinecoop (+ Pinecoop Chuy "Próximamente"), Servicio fúnebre Abbate y Cía, Salud bucal, Viajá Copol, Veterinaria, Estudio notarial: textos, teléfonos y enlaces. | Subpáginas no vistas renderizadas (solo HTML); no se verificó la apariencia visual. |
| Convenios | `/convenios` | Sí, en navegador | Listado con filtros y mapa. Datos embebidos en JS: **160 registros** (nombre, rubro, departamento, dirección, teléfono, coordenadas). | No se verificó la exactitud de cada comercio. |
| Hipermercado | — (desplegable) · `/tienda` · `/hipermercado` (antigua) | Sí | El desplegable contiene Tienda, Bazar y Promociones. `/tienda` describe secciones (joyería, calzado, indumentaria, perfumería, óptica), horarios, embed de Instagram. **No hay catálogo de productos del Hipermercado.** | Contenido del video de Instagram. |
| Tienda Bazar | `/bazar` | Sí, en navegador | **37 productos** en un array JS (`categoría, nombre, marca, miniatura base64, enlace a categoría`), 13 categorías, **sin precios** en la página. Enlace al catálogo completo en Google Sites (+600 productos, 15 categorías). | El catálogo de Google Sites solo se revisó por estructura (HTML): **no se confirmó si muestra precios** (se detectó 1 patrón tipo precio). |
| Promociones | `/promociones` | Sí, en navegador | Carrusel con 10 ofertas. **Las 10 imágenes devuelven el placeholder de Odoo (256×256, 6 KB)**: la página no muestra ninguna promoción. | Contenido real de las ofertas (no disponible). |
| Hacerse socio | `/como-hacerte-socio` | Por HTML servido | Dos caminos (con convenio / crear convenio con 6+ personas), FAQ, WhatsApp 098 631 414. | Apariencia visual. |
| Contacto | `/contactenos` | Por HTML servido | Canales, horarios, formulario Odoo (nombre, teléfono, email, asunto, consulta). | Formulario **no enviado** (no corresponde). Apariencia visual. |
| Acceso web | `/acceso-web` | Sí, en navegador | Enlaces a cuenta de socio, recibos y descarga de la app (ver §1.1). | No se ingresó a ninguna cuenta (no corresponde). |

### 1.1 Enlaces externos de acceso (verificados)

| Destino | URL publicada en el sitio actual | Resultado |
|---|---|---|
| Cuenta de socio ("Mi Cuenta Socio") | `https://www.copol.com.uy/CopolSocios/servlet/consulta` | [V] Redirige a `https://www.copol.com.uy/CopolSocios/servlet/gamcopollogin` (título "GAM Copol Login"). Es el "copol-login" mencionado. |
| Recibos ("Mis Recibos") | `https://www.copol.com.uy/Copolrecibos/` | [V] 200, página "Mi Recibo". **Atención:** el sitio lo presenta como **"Para funcionarios"** (recibos de sueldo), no como recibos de socios. |
| App | `https://www.copol.com.uy/CopolSocios/Copol.apk` | [V] 200, `application/vnd.android.package-archive`, 3,2 MB. Descarga directa de APK (no Google Play). Solo Android. **No se descargó.** |
| Facebook | `/website/social/facebook` → `https://www.facebook.com/cooperativacopol` | [V] redirección 303 |
| Instagram | `/website/social/instagram` → `https://www.instagram.com/hipercopol/` | [V] redirección 303 |
| WhatsApp general | `https://wa.me/59898872727` | Enlace presente (no se envió mensaje) |
| WhatsApp socios | `https://wa.me/59898631414` | Enlace presente |
| Catálogo Bazar completo | `https://sites.google.com/view/catalogo-copol/inicio` | [V] 200 |
| Claramente (psicólogo) | claramente.com.uy, App Store, Google Play | Enlaces presentes, no abiertos |

---

## 2. Hallazgos

### 2.1 Contenido — inconsistencias verificadas [V]

| Tema | Dónde | Detalle |
|---|---|---|
| Cantidad de locales | Locales vs. Inicio/Historia/Acceso/Contacto | 19 locales listados vs. "+20 locales". |
| Sucursales/agencias | Historia vs. Locales | "4 Sucursales y 14 Agencias" vs. 3 sucursales + 15 agencias (+ Casa Central). |
| Departamentos | Locales | Dice "19 departamentos", pero los locales cubren 18 (no hay local en Flores). |
| Dirección de Casa Central | Locales/Contacto vs. Historia | "Av. Libertador 1856 esq. Nueva York" vs. "Nueva York 1335 esquina Av. Libertador". |
| Años de historia | Historia | "108 años" (1917→2026 son 109) [I: puede no estar actualizado]. |
| Convenios | Convenios | Texto: 152 convenios; datos: 160 registros. Conteos por departamento no coinciden (p. ej., Canelones 16 vs. 19). "8 rubros" vs. 10 filtros vs. 41 rubros distintos en los datos (con duplicados por mayúsculas/tildes). 76 de 160 sin teléfono. |
| Teléfono repetido | Locales | Artigas y Paysandú comparten 4772 5070 [I: probable error]. |
| Pando | Locales | Rotulado "Sucursal" pero email `agepando@` (prefijo de agencia). |
| Créditos | Inicio | Cuenta regresiva a la apertura del **13/10** (siguientes: 10/11, 08/12) y, en otro bloque, "CRÉDITOS 08/09 Apertura" (desactualizado). |
| Cifras | Hacerse socio | "+150 Beneficios" vs. "+150 empleados" en el resto del sitio [I: posible confusión]. |
| Cuotas | Bazar / Inicio | "10 cuotas sin recargo" (Bazar general) y "15 cuotas sin recargo" (motos) [I: pueden ser ofertas distintas]. |
| Contadores de Inicio | Inicio | Arrancan en "0" hasta que se hace scroll; el año se muestra como "1.917" (separador de miles). |
| Promociones | Promociones | Las 10 imágenes están rotas (placeholder). |
| Nombre del parque | Todo el sitio | Se escribe **"Pinecoop"** (con doble "o"); el brief dice "Pinecop". |
| Hipermercado | /tienda | No hay catálogo ni productos destacados del Hipermercado; solo rubros. |

### 2.2 Navegación [V]
- Los padres de los desplegables (Sobre nosotros, Beneficios, Hipermercado) son `href="#"`: sin página propia, sin destino si se hace clic.
- Etiquetas actuales: "Hacete Socio", "Contacto", y en Hipermercado tres ítems (Tienda, Bazar, Promociones). El brief pide "Hacerse socio" y "Tienda Bazar + Promociones".
- Páginas antiguas aún públicas y en el sitemap: `/hipermercado`, `/historia`, `/noticias`, `/1`, `/contactus` (contenido duplicado o vacío).
- Breadcrumbs: no existen. Las subpáginas de servicios sí tienen "Volver a Servicios Sociales".

### 2.3 SEO y metadatos [V]
- `<title>` de casi todas las páginas termina en "**| My Website**"; algunos son incorrectos: `/nuestra-historia` → "transparencia", `/convenios` → "beneficios", `/promociones` → "HIPERMERCADO".
- `og:site_name` = "My Website"; `og:url`/`og:image` apuntan a `sitio152885.p18.mvdsimple.uy`; `canonical` y `sitemap.xml` apuntan a `cpolicial.mvdgestiona.uy` (otro dominio).
- Sin `meta description` en Inicio. Inicio **no tiene `<h1>`**.
- Google Analytics (`G-SFNS07RFKE`) cargado varias veces; `google-site-verification` repetido 5 veces.

### 2.4 Accesibilidad
- [V] Carrusel hero con autoplay, **sin botón de pausa ni flechas** (solo puntos "Slide 1–5"). Otro bloque rota cada 3 s. (Promociones sí tiene "Pausar".)
- [V] El botón "Descargar para Android" es un `<div>` con evento JS: no es enfocable con teclado ni es un enlace.
- [V] 20 objetivos táctiles menores a 32 px en móvil.
- [V] Existe `prefers-reduced-motion` en el CSS (positivo). Las imágenes tienen `alt` (positivo), aunque algunos genéricos ("Oferta 1 — Limpieza") y el logo aparece con alt "My Website" en metadatos/variantes.
- [V] Contenido con animación de aparición: en móvil se observaron grandes áreas en blanco hasta hacer scroll. [I] Si el JS falla, ese contenido podría quedar invisible.
- [I] El amarillo `#FFCB03` funciona sobre verde oscuro, pero no tendría contraste suficiente como texto sobre blanco.

### 2.5 Responsive [V]
- A 375 px no hay desbordamiento horizontal; menú off-canvas correcto.
- En móvil el hero muestra solo título + botón (se pierde el subtítulo).

### 2.6 Rendimiento [V]
- Inicio en móvil: **~9,2 MB transferidos**, 25 peticiones; **7,7 MB son imágenes**.
- PNG sin optimizar: Pinecoop 3,0 MB, "Fiestas" 1,8 MB (es una captura de pantalla), "Nuestra historia" 1,4 MB (captura), "Casa central" 1,1 MB.
- `/bazar` pesa ~770 KB de HTML por las miniaturas en base64.
- Odoo carga ~490 KB de JS y ~480 KB de CSS. Todas las imágenes tienen `loading="lazy"` (positivo).

### 2.7 Conversión
- [V] WhatsApp es el canal principal (coherente con el público) pero hay **dos números** (098 872 727 general / 098 631 414 socios) mezclados en botones de "hacerse socio".
- [V] No hay formulario de pre-alta de socio; el costo de la cuota no se informa ("consultá por WhatsApp").
- [V] Acceso web está visible en la barra superior (positivo).
- [I] Faltan pruebas sociales concretas (testimonios) y una propuesta de valor clara arriba de todo en Inicio (el hero abre con un convenio puntual).

---

## 3. Inventario de recursos

Todos los recursos están alojados en `cooperativapolicial.com.uy/web/image/...`. **Ninguno está en el repositorio local.** "Oficial" = publicado por el sitio de la cooperativa; no implica permiso de reutilización.

| Recurso | ID / origen | Formato y tamaño | Calidad / utilidad | ¿Reutilizable? |
|---|---|---|---|---|
| **Logo COPOL** | `/web/image/website/1/logo` | **SVG vectorial**, viewBox 235×108, verdes `#5DA74D`→`#216438` + "O" multicolor | Excelente; sin texto rasterizado | Sí, si se aprueba (requiere permiso de descarga y confirmación de que es la versión vigente) |
| Logo PNG variante | `1293` "Recurso 5@300x-8.png" | PNG 479×220, 8 KB | Buena | Sí, como respaldo |
| Banner Porto Seguro / Garantía de alquiler | `1417` | PNG 1920×1047, 146 KB | Buena | Sí, con confirmación de vigencia |
| Banners motos (Pollerita, Sapucai) | `1416`, `1415`, `1295` | PNG/JPEG 1920×1085 | Buena | Sí, con confirmación de vigencia/stock |
| Pinecoop (Salinas) | `764`/`597` "image00001 (4).png" | PNG 1536×1024, **3 MB** | Buena, hay que comprimir | Sí, confirmar si es foto real |
| Pinecoop Chuy | `1404` (WhatsApp) | JPEG 1920×1119 | Aceptable | Sí, "Próximamente" |
| Interior de la tienda | `702` "DSC09205-HDR.jpg" | JPEG 1920×1280 | **Foto real profesional**, muy útil | Sí |
| Casa central | `552` "foto inicio.png" | PNG 1440×708, 1,1 MB | Buena | Sí, comprimir |
| Historia / Cantinas | `697`, `673` | **Capturas de pantalla** PNG ~1240×930 | Media (capturas) | Con reservas; pedir originales |
| Fiestas y cumpleaños | `693` | Captura PNG 1806×821 | Media | Con reservas |
| Imágenes de servicios sociales | `1285`, `1283` ("Gemini_Generated_Image"), `1307` ("ChatGPT Image") | PNG | **Generadas por IA** | No recomendable como imagen institucional sin aprobación |
| Imágenes de servicios (probable stock) | `1151`, `1141` "14490.jpg", `1140` "2148377787.jpg" | JPEG ~1000×667 | Media; nombres típicos de bancos de imágenes | [I] Licencia desconocida → preguntar |
| Psicólogo (WhatsApp) | `1287` | JPEG 762×1600 | Media | Confirmar |
| Banners "Oferta COPOL", "Hacete socio", "Servicios sociales" | `1480`–`1483`, `1425`, `1426` | PNG | Piezas gráficas con texto incrustado | Mejor recrear en HTML |
| Logo Claramente | `1257` | SVG | Marca de tercero | Solo con permiso del tercero |
| Miniaturas Bazar (37) | Base64 en `/bazar` | JPEG ~3–6 KB | **Baja resolución** | Sí para demo/MVP; pedir imágenes en alta |
| Promociones (10) | `1440`–`1464` | Placeholder roto | Inútil | No |
| **Tipografía** | CSS del sitio | **ArticulatCF** (Normal/Bold) + Segoe UI en bloques personalizados | ArticulatCF es comercial | Solo con licencia web → preguntar |
| **Colores usados** | CSS de bloques `cpol-*` | Verde oscuro `#2D5016`, dorado `#D4A017`, amarillo `#FFCB03`, crema `#FFECB3` | Coherentes con el logo | Base para propuesta provisional |
| Datos de locales | `/locales` | 19 registros con coordenadas | Muy útil | Sí, previa confirmación de errores |
| Datos de convenios | `/convenios` | 160 registros | Útil, requiere limpieza | Sí, previa confirmación |
| Catálogo Bazar | `/bazar` + Google Sites | 37 destacados / +600 completo | Útil | Sí (sin precios) |
| Íconos | SVG inline en el sitio | — | Genéricos | Se recomienda un set libre (p. ej., Lucide) |

---

## 4. Brechas, dependencias y preguntas

| Tema | ¿Se resuelve con datos existentes? | Si no → |
|---|---|---|
| Logo | Sí (SVG publicado) | Confirmar que es la versión vigente y si hay variantes (negativo, monocromo) |
| Manual de marca, colores y tipografía oficiales | Parcial (colores observados) | **Propuesta provisional** documentada hasta recibir manual |
| Enlaces de acceso (socios, recibos, app) | Sí, verificados | Confirmar que "Mis Recibos" es para funcionarios y si hay recibos para socios |
| Fechas de apertura de créditos | Parcial: 13/10, 10/11, 08/12 aparecen en el sitio oficial | Confirmar oficialmente; si no, "Fecha a confirmar" |
| Catálogo Hipermercado | **No existe** en el sitio | Placeholder "Contenido de demostración" o datos oficiales |
| Catálogo Bazar | Sí (37 productos, sin precios) | Imágenes en alta resolución |
| Promociones | **No** (imágenes rotas) | Piezas vigentes; sin precios |
| Pinecoop | Sí (prestaciones publicadas) | Fotos reales, tarifas no se publicarán |
| Locales y contacto | Sí, con inconsistencias | Confirmar dirección de Casa Central, teléfono Artigas/Paysandú, cifras |
| Misión / frase institucional | Parcial: "Somos COPOL, cooperativa de consumo abierta para todo público. Más de 100 años comprometidos con el verdadero cooperativismo…" (pie del sitio) y cita del Cnel. Mussio | Confirmar si hay misión/visión oficial |
| Fotografías | Pocas reales (tienda, casa central) | Pedir banco de fotos real |
| Hosting / despliegue | Desconocido | Preguntar (Odoo actual vs. hosting estático) |
| Entorno local | Sin Node ni git | Decidir stack (ver plan) |

---

## 5. Plan propuesto (sujeto a aprobación)

### 5.1 Mapa de páginas
```
/                         Inicio
/sobre-nosotros/          (índice: resumen + enlaces a Locales e Historia)
  /locales/               Locales (mapa + filtros + tarjetas)
  /nuestra-historia/      Historia (línea de tiempo, cifras, estatutos)
/beneficios/              (índice: resumen de servicios sociales y convenios)
  /servicios-sociales/    Grid de servicios + ficha por servicio
    /pinecoop/  /psicologo/  /servicio-funebre/  /salud-bucal/  /viajes/  /veterinaria/  /notarial/
  /convenios/             Buscador + filtros por departamento y rubro + mapa
/hipermercado/            (índice: tienda, secciones, horarios)
  /tienda-bazar/          Catálogo destacado sin precios + enlace al catálogo completo
  /promociones/           Grilla/carrusel accesible (placeholders hasta tener piezas)
/hacerse-socio/           Propuesta de valor, 2 caminos, FAQ, CTA WhatsApp
/contacto/                Canales, horarios, formulario (envío a definir)
/acceso-web/              Socio, recibos, app
/404                      Página de error útil
```

### 5.2 Enfoque visual (provisional)
- Verde institucional profundo + acentos amarillo/dorado del sitio actual; fondos cálidos claros; logo multicolor como único elemento de color variado.
- Tipografía: alternativa libre a ArticulatCF (p. ej., *Plus Jakarta Sans* o *Manrope* para títulos, *Inter* para texto) **hasta confirmar licencia**.
- Movimiento moderado: transiciones cortas, un hero con profundidad sutil (parallax/capas o 3D liviano solo en escritorio y con `prefers-reduced-motion` desactivado), carrusel con pausa y flechas.
- Se explorarán 2–3 direcciones en el Hito 3 antes de implementar.

### 5.3 Arquitectura (dos opciones según el entorno)
- **A (recomendada si se puede instalar Node 20+):** **Astro** — páginas estáticas, componentes reutilizables, contenido en JSON/Markdown separado en `confirmado/`, `demo/` y `placeholder/`, imágenes optimizadas automáticamente, cero JS por defecto, SEO y sitemap fáciles. Despliegue en cualquier hosting estático.
- **B (sin instalar nada):** HTML + CSS + JS vanilla multipágina, con datos en JSON y componentes compartidos (header/footer) inyectados por JS o duplicados por plantilla; script PowerShell para servir localmente. Más simple, pero menos escalable y sin optimización automática de imágenes.

### 5.4 Etapas
1. Sistema visual y layout base (tokens, header con lema y desplegables, footer, acceso web).
2. Inicio completa.
3. Páginas de Sobre nosotros y Beneficios (incl. Pinecoop y convenios con datos).
4. Hipermercado, Tienda Bazar y Promociones.
5. Hacerse socio, Contacto, Acceso web, 404.
6. SEO, accesibilidad, rendimiento, README, registro de activos y pruebas.

### 5.5 Riesgos
- Datos inconsistentes en el sitio actual (cifras, direcciones) → se marcarán como "a confirmar".
- Derechos de imágenes (stock, IA) y licencia de ArticulatCF.
- Falta de catálogo del Hipermercado y de piezas de promociones.
- Sin Node/git: limita herramientas de build y pruebas automáticas.
- El destino final (¿se reemplaza Odoo?) condiciona el formulario de contacto y el despliegue.

### 5.6 Criterios de aceptación
- Las 6 entradas de navegación y sus subpáginas existen, con contenido propio y CTA; ningún enlace a `#` vacío.
- Lema "Por un verdadero cooperativismo" visible en el encabezado.
- Acceso web con los 3 destinos verificados (o marcados "pendiente").
- Ningún precio del Hipermercado ni del Bazar.
- Todo dato no confirmado aparece rotulado ("Fecha a confirmar", "Contenido de demostración — reemplazar por catálogo oficial").
- Responsive 360–1440 px sin scroll horizontal; navegación por teclado completa con foco visible; carrusel pausable; `prefers-reduced-motion` respetado; contraste AA.
- Inicio < 1,5 MB en la primera carga móvil (vs. ~9,2 MB actual).
- README, registro de activos y guía de reemplazo de datos demo.
