# Decisiones del proyecto

## Respuestas de la cooperativa (12/10/2026)

| # | Tema | Decisión |
|---|---|---|
| Q1 | Stack | Astro + Node LTS (instalado Node 24.20 vía winget). |
| Q2 | Identidad | Seguir el **Manual de marca COPOL 2026**. Preguntar antes de inventar lo que no esté en el manual. |
| Q3 | Recursos | Permiso para descargar y reutilizar recursos oficiales del sitio. WebP, registro de procedencia, excluir imágenes de IA o de bancos de imágenes. |
| Q4 | Acceso web | Socios: `https://www.copol.com.uy/CopolSocios/servlet/gamcopollogin` · Funcionarios: `https://www.copol.com.uy/Copolrecibos/` · App: solo si se confirma vigente → **pendiente** (el APK responde pero no se modifica desde 20/09/2021). |
| Q5 | Créditos | 10/11 y 08/12 confirmadas, en archivo editable (`src/data/confirmado/creditos.json`). |
| Q6 | Nombres y tono | "Pinecoop", "Hacete socio", voseo. |
| Q7 | Menú Hipermercado | Tres opciones: Tienda, Bazar, Promociones. |
| Q8 | Catálogos | Bazar desde el catálogo oficial de Google Sites, verificando que no haya precios. Hipermercado: demostración rotulada. |
| Q9 | Locales | 19 locales. Casa Central: Av. Libertador 1856 esq. Nueva York, con otra entrada por Nueva York 1335 (mismo local). Teléfono de Artigas/Paysandú pendiente. |
| Q10 | Odoo | El sitio nuevo reemplazará al actual: documentar requisitos de producción y del formulario. |
| — | Continuar | "Prosigamos con lo que ya tenemos": se avanzó con la dirección visual A (recomendada) y los pendientes documentados. |

## Dirección visual

Se exploraron tres direcciones en Claude Design (lienzo "COPOL — Propuestas de diseño", artifact privado del usuario):

- **A · Institucional luminoso (elegida):** fondo Blanco verdozo, títulos en Verde oscuro, Amarillo Copol como resaltado, formas redondeadas (cápsulas) que retoman los trazos del logotipo, fotos reales en marcos con arco. Transmite seriedad y cercanía, como pide el tono del manual.
- B · Verde profundo con relieve: héroe oscuro con la trama de íconos del manual y tarjetas inclinadas en 3D. Más expresiva; se tomó de ella el relieve 3D moderado del carrusel (solo escritorio).
- C · Comunidad ilustrada: protagonismo de la ilustración del manual y grilla tipo "bento". Se tomó la ilustración para el bloque "Nuestra esencia".

Movimiento: transiciones cortas, aparición progresiva al hacer scroll (solo con JS y sin `prefers-reduced-motion`), inclinación 3D sutil de la imagen del carrusel con el puntero (solo escritorio con puntero fino). Sin WebGL: no aportaba claridad y penalizaba equipos de menor potencia.

## Ronda de correcciones (13/10/2026)

| Pedido | Resolución |
|---|---|
| Imágenes mal encuadradas o recortadas | Nuevo componente `Media` (patrón AspectRatio): por defecto usa la proporción real de cada imagen. Se quitaron los arcos que cortaban las fotos (que recortaban hasta un 43 %), y las piezas gráficas con texto se muestran enteras sobre su color de borde. `npm run qa` mide el recorte y la deformación de cada imagen en 16 páginas, en escritorio y móvil, y falla si alguna pierde más del 20 %. |
| Bazar: mensaje vacío al entrar | Causa: la regla `display: grid` del bloque vacío anulaba el atributo `hidden`. Se agregó `[hidden] { display: none !important }` global y el estado vacío ahora aparece solo cuando una búsqueda no tiene resultados. |
| Bazar: "Todos los productos" mostraba solo teléfonos | Causa: la paginación de 24 productos mostraba solo los primeros, todos celulares. Ahora "Todos los productos" muestra el catálogo completo (471) agrupado en sus 14 categorías; cada filtro muestra su categoría entera, con el contador correcto. |
| Carrusel sin botones | Se quitaron los botones de anterior, pausa y siguiente. Queda: deslizar (táctil o mouse), flechas del teclado, indicadores discretos con barra de progreso y movimiento reducido respetado. **Nota WCAG 2.2.2:** sin un botón de pausa visible, el avance automático se limita a pausarse con el puntero o el foco, detenerse al primer gesto y detenerse solo después de una vuelta completa (unos 28 s). Si la cooperativa prefiere cumplir el criterio de forma estricta, se puede quitar el avance automático o sumar una pausa dentro de los indicadores. |
| Componentes shadcn/ui | Anatomía, variantes y tokens de shadcn/ui portados a Astro (`src/components/ui/`); ver `docs/sistema-visual.md`. |
| Referencia prompt-motion.com | Lenguaje visual (anillos interiores, chips con contador, tarjetas de medios, abanico de fotos) y principios de movimiento de sus prompts; ver `docs/sistema-visual.md` § Movimiento. |
| Correcciones de contenido | Se quitó la frase "COPOL nunca te pedirá tu clave…", que no había sido confirmada por la cooperativa. |

## Ampliación: catálogo completo, stock y panel (13/10/2026)

| Pedido | Resolución |
|---|---|
| Importar todo el catálogo de Bazar | Recorrido completo de las 69 páginas de Google Sites (no solo el menú). Datos e imágenes guardados en el proyecto; el sitio no depende de Google para mostrarlos. Detalle, conteos y faltantes en [catalogo-bazar.md](catalogo-bazar.md). |
| Estado de stock en las tarjetas | Etiqueta sobre la imagen con ícono y texto: verde "Con stock" (✓), gris "Sin stock" (✕, y la foto pasa a gris). Los productos sin etiqueta en el origen muestran "Consultar disponibilidad". "Consultar stock" sigue en todas las tarjetas. |
| Filtros de stock | Todos / Con stock / Sin stock, combinables con categoría y búsqueda. Los contadores de cada grupo se recalculan con los demás filtros. Los filtros quedan en la URL (`?categoria=…&stock=…`). "No encontramos productos" aparece solo si se escribió una búsqueda sin resultados; una combinación de filtros vacía muestra otro aviso. |
| Panel de administración | Aplicación separada en `panel/` (Node 24 + Hono + SQLite de Node), sin enlace desde el sitio y con acceso por usuario y rol. Ver [panel-stock.md](panel-stock.md). |
| Autenticación | Consultado: no hay proveedor de identidad ni nube disponibles todavía, y el usuario pidió crear usuarios y roles desde el panel. Se implementaron cuentas propias (scrypt, bloqueo, sesiones seguras) con tres roles: Administrador, Editor de stock y Visualizador de stock. El administrador principal es una cuenta protegida que solo él puede modificar. Recomendado para producción: Cloudflare Access delante del panel. |
| Contraseña inicial del administrador | La contraseña indicada en el chat no se guardó en ningún archivo: solo existe como hash en la base local del panel (fuera del repositorio) y es temporal: el panel obliga a cambiarla en el primer ingreso (no cumple la política mínima). |
| Futuros rubros | Modelo de datos por rubro (Bazar hoy; Tienda, Perfumes, Joyería, Calzado más adelante). El panel lo avisa en pantalla. No se cargaron esos catálogos. |
| Inicio más comercial | Estructura de tienda online: carrusel, accesos rápidos, aperturas de crédito y bloques "banner entregado + contenido + llamado a la acción" (Bazar con estante de productos y accesos por categoría; Servicios sociales; Pinecoop; Novedades; Hacete socio). Se quitó de Inicio el bloque "Nuestra esencia": su ilustración ya aparece en dos de los banners entregados (sigue en Sobre nosotros e Historia). |
| Referencias | Tienda Inglesa mostró una verificación anti-bots y no se pudo inspeccionar en esta sesión (no se evadió): se tomó su estructura conocida (banners seguidos de estantes con "Ver todo"). De ui.live se tomaron el estante horizontal de productos en móvil, los chips de categoría con contador y las tarjetas de indicadores del panel; de prompt-motion.com, el movimiento ya documentado. |
| Imágenes livianas | Banners en AVIF + WebP de 480 a 2000 px (el navegador descarga solo el ancho necesario); productos en WebP de 240/400 px; carga diferida fuera de pantalla; `content-visibility` en las categorías del Bazar para no renderizar las 800 tarjetas de una vez. |

## Tercera ronda: stock en vivo, panel y Vercel (13–14/10/2026)

| Pedido | Resolución |
|---|---|
| El stock cambiado en el panel no se veía en la web | Diagnóstico con los datos reales: el panel sí guardaba (base y registro), pero la página de Bazar era estática y su lectura en vivo dependía de una variable sin configurar, con 30 s de caché. Ahora Bazar se genera en cada visita leyendo la misma base, sin caché; el estante de Inicio y de Hipermercado son *server islands*; el panel confirma solo tras releer la fila guardada. Verificado con un cambio real (ida y vuelta) en Edge. Ver [panel-stock.md](panel-stock.md). |
| Despliegue en Vercel | Una sola aplicación Astro con el adaptador de Vercel: páginas estáticas + funciones para Bazar, el panel e islas. Base **Turso** (libSQL, el mismo SQL que el SQLite local) e imágenes en **Vercel Blob**. Se reemplaza la decisión anterior de un servidor Node aparte (Vercel no tiene disco persistente). El código del panel sigue separado en `panel/`, protegido y sin enlaces públicos. |
| Panel más profesional | Rediseño con la anatomía y tokens de shadcn/ui (sidebar, tabs con contadores, tabla, badges, diálogos) portados a HTML/CSS sin React, como el resto del sitio. El inventario es la pantalla principal. Se quitaron del panel todos los textos sobre rubros futuros (esta versión es solo Bazar). |
| Código interno COPOL | Etiqueta renombrada en catálogo y panel. Escaneo con cámara (permiso solo al tocar el botón; lector nativo o ZXing) con ingreso manual siempre disponible. |
| Usuarios | Alta con tres campos (usuario o correo, rol, contraseña temporal). Cada persona cambia su contraseña desde "Mi perfil". |
| Novedades | Sección en el panel (crear, editar, publicar/despublicar, ordenar, plantillas, imagen validada en Blob, botón opcional). Inicio muestra solo las publicadas. Las tres novedades que había se cargaron como iniciales. |
| Identidad gestionada | Ya no se recomienda Cloudflare Access (el panel vive en el mismo dominio de Vercel). Si en el futuro se quiere una segunda barrera, Vercel ofrece protección por contraseña o SSO en planes pagos. |

## Cuarta ronda: locales, fondos, Bazar, Promociones e Historia (14/10/2026)

| Pedido | Resolución |
|---|---|
| Fotos en Locales | 19 de 20 fotos asociadas por el nombre del archivo y del cartel; San Carlos no corresponde a ningún local y no se publicó. Marca ✦ de Gemini retirada con autorización. Ver registro-de-activos.md. |
| Textura del manual | Mosaico al 10 % que cubre todo el margen vacío a cada lado (≥ 1360 px), a pedido de la cooperativa (14/10/2026); nunca detrás del contenido. En móvil no hay margen y no se muestra. |
| Comparar fondos | Switch "Fondo: Blanco / Verdoso / Amarillo" en la barra superior (no es modo oscuro). Ambas opciones son uniformes: se quitaron los bloques de color de encabezados de página, carrusel y secciones "suaves"; tarjetas y secciones se separan con espaciado, bordes y sombras sutiles. Predeterminado: verdoso (como estaba). La elección se recuerda en el navegador. |
| Bazar: barra fija | Se compacta al bajar (de ~313 a ~98 px en escritorio) y vuelve al subir; en móvil queda compacta mientras se recorre la lista (~152 px) porque completa ocuparía media pantalla. Sin transiciones con movimiento reducido. |
| Promociones del supermercado | Carrusel nuevo antes de "Campañas vigentes": avanza solo con desplazamiento y desenfoque leve; se detiene con puntero o foco; sin avance con movimiento reducido; controles discretos (indicadores y contador). **Excepción aprobada: estas piezas muestran precios.** "Campañas vigentes" queda solo con motos Zanella y el convenio con Porto Seguro (su vigencia sigue pendiente de confirmar). Se quitó el aviso "Ofertas semanales pendiente". |
| Historia | Línea de tiempo con barra de años, línea de progreso al recorrerla, hitos alternados con fotos y cita. Solo hitos confirmados (1917, 1957, 2014, 2026, Hoy); seis hitos sin año quedan pendientes y no se publican (`src/data/confirmado/historia.ts`). Preparada para fotos históricas (`src/assets/historia/`) sin mostrar espacios vacíos. |
| Recomendación de fondo | Para un sitio con catálogo y piezas comerciales coloridas, **blanco** da más contraste a las fotos de producto y a las ofertas, y deja el verde para la marca (botones, títulos, textura). El verdoso es más institucional y cálido, pero con muchas tarjetas blancas puede verse "a parches". Sugerencia: blanco para todo el sitio, con el verde reservado a acentos. |
| Fondo amarillo (14/10/2026) | Tercera opción del switch, explorada en Claude Design (https://claude.ai/artifact/HFKZSE8V2bGU7xtc4p8C4C) con tres mezclas del Amarillo del manual (#F8EA39) con blanco: 8 % (#FEFDEF), **14 % (#FEFCE3, elegida)** y 22 % (#FDFAD3). La de 14 % se nota cálida sin cansar y deja que el amarillo pleno siga funcionando como resaltado. Chips e íconos usan tintes del mismo amarillo (#FBF4C2, #F9EEA6). Contraste del Verde oscuro sobre el fondo: 6,9:1. |
| GitHub y Vercel | La conexión de Vercel disponible pertenece a otra cuenta (otro correo) y responde 403 al listar proyectos; la de GitHub (MathiasEz) no tiene repositorios accesibles y no hay herramienta para crear repositorios ni hacer push. No se subió ni desplegó nada. Pasos manuales en el README. |

## Arquitectura

- **Astro estático**: sin JS por defecto; solo hay scripts pequeños en línea para el menú, el carrusel, los filtros y el formulario. Toda la información es HTML, así que se puede leer sin JS.
- **Datos separados del diseño** en `src/data/` (`confirmado/`, `demo/`) y acceso tipado en `src/lib/datos.ts`.
- **Imágenes**: originales en `assets-source/`, maestros WebP en `src/assets/`, variantes responsive generadas por Astro en el build.
- **Rutas jerárquicas** que siguen el menú (`/sobre-nosotros/locales/`, `/beneficios/convenios/`, `/hipermercado/bazar/`…), con redirecciones desde las URLs del sitio anterior.
- **Sin dependencias pesadas**: astro, sharp, @astrojs/sitemap y la fuente; linkedom, @astrojs/check y typescript solo en desarrollo.

## Ajustes del 14/10/2026

| Tema | Decisión |
|---|---|
| Carrusel de Inicio | A pedido de la cooperativa: dos flechas discretas (ícono de 18 px en un círculo tenue, área táctil de 44 px) a los lados de los indicadores, y avance automático cada **2,5 s en bucle** (antes 7 s y se detenía tras una vuelta). Usar una flecha, un indicador o deslizar reinicia la cuenta sin apagar el avance. Se pausa con el puntero o el foco encima y con la pestaña oculta; con movimiento reducido no avanza. Sigue sin botón de pausa grande. |
| Locales | Dos bloques: "Casa Central y sucursales" (4 tarjetas grandes en 2 × 2 desde 760 px, 1 columna en teléfono; Casa Central resaltada con borde verde más grueso, sombra, sello amarillo "Sede principal" y título mayor) y debajo "Agencias" (15). Los filtros ocultan el bloque que queda vacío. Los correos se cortan después de la arroba. |
| Banners de Inicio en celular | Versiones 5:4 entregadas por la cooperativa, usadas por debajo de 640 px (ver registro de activos). |
| Fondo de página | Desde el 14/10/2026 el sitio usa **solo el fondo amarillo** (#FEFCE3, Amarillo del manual al 14 %). Se quitó el selector Blanco / Verdoso / Amarillo de la barra superior. |
| Banner de beneficios | Banner "Consultá acá por tus beneficios" entre el carrusel y "¿Qué necesitás hoy?", enlazado al WhatsApp general 098 872 727 (se abre en otra pestaña). Se muestra completo, sin recortes. |
| Bazar por modelos | Las tarjetas agrupan los colores de un mismo modelo (806 productos → 774 tarjetas; 22 modelos reúnen 54 colores). "Ver colores y stock" / "Ver detalle" abre una ficha con cada color (código interno COPOL, stock y consulta por WhatsApp con modelo, color y código) y la descripción del catálogo, que se carga al abrirla. El inventario, el panel y los 806 productos no cambian. Agrupación conservadora: ver docs/catalogo-bazar.md § Modelos y colores. |
| Claude con la suscripción | El panel es un conector personalizado (MCP + OAuth 2.1) para la app de Claude: no usa Vercel AI Gateway ni genera costo en Vercel. Solo consulta y cambia stock/cantidad; respeta el rol del usuario y deja todo en el Registro. El asistente dentro del panel (AI Gateway) queda como alternativa. Ver docs/panel-stock.md § Conector para Claude. |
| Asistente para todo el equipo | Se habilitó el asistente del panel para todos los roles (administrador y editor: consultan y preparan cambios con confirmación; visualizador: solo consulta). Funciona con Vercel AI Gateway (pago por uso) una vez registrada la tarjeta; se recomienda fijar un presupuesto mensual en Vercel. |
| Carrito COPOL | Carrito en el Bazar guardado en el navegador; envía la lista (categoría, nombre, color, código y cantidad) por WhatsApp al 098 872 727. Sin precios ni pagos. Ver docs/catalogo-bazar.md § Carrito COPOL. |
| Modelo del asistente | Gemini 2.5 Flash vía Vercel AI Gateway con el crédito gratuito (Claude no está incluido en el crédito gratis; Flash-Lite falló en pruebas con herramientas). Instructivo de reglas en panel/src/instructivo-asistente.ts, explicado en docs/asistente-instructivo.md; temperatura 0,2; reintento automático ante el límite de 5 pedidos por minuto. |
| Acceso al panel (14/10/2026) | Dirección no adivinable en lugar de /panel; PIN de 6 dígitos antes del ingreso; usuario y contraseña; correo de la cuenta + código de 6 dígitos por Resend; "recordar este equipo" 30 días (salta PIN y código). Sección Accesos para administradores (IP, lugar aproximado, equipo, sesiones y equipos). Límites de intentos en la base. Conector para Claude apagado (sus metadatos revelaban la dirección). |

## Panel único: Stock Bazar, Registros y Administración (27/10/2026)

| Tema | Decisión |
|---|---|
| Un solo panel | El panel de registros (proyecto `copol-registros`, JS propio con usuarios, PIN y almacén Blob aparte) se integró al panel principal: **un solo ingreso** (PIN, usuario, contraseña y código por correo), una sola base (Turso) y un solo despliegue. Se portó lo funcional: formulario, asistente de IA (texto, dictado, fotos y PDF), buscador de direcciones con enlace a Google Maps, hoja de Google (una pestaña por mes) y planilla de prueba descargable. Se dejó afuera la conexión con Excel de Microsoft (no se usaba). |
| Varios roles por persona | `usuarios.roles` guarda la lista y los permisos se suman. Roles: Administrador, Editor de stock, Visualizador de stock y el nuevo **Carga de registros**. El Administrador del panel de registros equivale al Administrador del panel único. Las cuentas existentes se migran solas. |
| Menú en tres secciones | **Stock Bazar** (Inventario, Agregar producto, Asistente), **Registros** (Nuevo registro, Planilla) y **Administración** (Administración Página, Información empleados, Estadísticas, Usuarios, Registro de cambios, Accesos). «Registro» pasó a llamarse «Registro de cambios» para no confundirse con Registros. |
| Datos personales | Con la hoja de Google conectada, la base guarda solo un resumen de cada registro; cédula, dirección, service e información adicional quedan únicamente en la hoja. La auditoría nunca los guarda. |

## Rediseño de Inicio y secciones (27/10/2026)

| Tema | Decisión |
|---|---|
| Ancho completo | Todo el sitio llega de borde a borde (margen interno de 16 a 44 px, `--gutter`) y no hay textura lateral. Los bloques de Inicio usan `.bloque` con la misma separación (`--seccion`) arriba de cada banner y entre banner y contenido. |
| Orden de Inicio | Banner principal, beneficios, accesos, créditos, **Servicios sociales** (arriba, para que se vean con poco scroll), Bazar, Pinecoop y Hacete socio. Cada banner reemplaza al título de su sección. |
| Bazar en Inicio | Sin botones de categorías: solo los productos, pegados al banner. |
| Novedades | Se quitó la sección del final de Inicio. Ahora están en la **campana del encabezado** (todas las páginas): el desplegable muestra las novedades del panel. La campana se configura en **Administración Página → Campana** (`/campana`): activarla o apagarla, el título y el número (por hora de Uruguay de 1 a 5, cantidad de novedades o fijo). Es el island `Campana.astro`; guarda en `ajustes` (clave `campana`) y se refresca con la etiqueta de novedades. |
| Locales y Convenios | Al elegir un punto: scroll propio, lento y con arranque y frenado suaves hasta el mapa; luego el mapa se aleja y hace un zoom suave (flyTo) con desenfoque que se va aclarando hasta el lugar. |
| Historia | Sin el hito «Nueva identidad de marca». «Presencia en todo el país» lista los departamentos y muestra un local por departamento (sale de los locales). Estatutos en un bloque destacado. |
| Promociones | Sin «Campañas vigentes» (motos Zanella y garantía de alquiler). |
| Bazar | Al tocar «Consultar» en un color, un modal ofrece consultar solo ese producto o agregar más al carrito para hacer una sola consulta. En «Mi carrito», «Enviar por WhatsApp» abre el mismo tipo de modal con hasta 4 recomendaciones con stock de las categorías ya elegidas. |
| Acceso web | Primero Mi cuenta de socio (degradé de marca, aro, llamado amarillo) y debajo el Portal de empleados; se quitó la tarjeta «App para Android – pendiente». |
| Hacete socio | «Dos caminos» pasó a ser un asistente interactivo de una pregunta con tres respuestas y sus pasos (con los textos existentes). |
| Tienda y Contacto | Paleta sobria: tarjetas blancas, icono amarillo y hover verde; en Contacto solo WhatsApp va en verde. |
| Hacete socio | En «No sé si tiene» queda solo la consulta por WhatsApp (sin botón «Ver convenios»). |
| Mapa en dos tiempos | Al elegir un local: si el mapa está lejos o muy acercado se aleja y se traslada con zoom abierto; espera a que dibuje esa zona y recién ahí hace un acercamiento lento (2,4 a 3,6 s) con desenfoque que se aclara. Un solo flyTo hacía el último tramo casi instantáneo. Además, `maxDuration` de flyTo pone la duración en 0 cuando el viaje es más largo (el mapa saltaba sin animar y el paso siguiente no arrancaba): no usarlo; se fija `duration`. |
| Hacete socio sin numeración | Sin círculos 1 y 2 en la pregunta y la respuesta; los pasos llevan un punto, no número. |
| Planilla y Google | Con la hoja conectada, «Planilla» lee la hoja en vivo (la constancia de la base ya no se muestra, por eso reaparecían filas borradas). |
| Mi perfil para todos los roles | Mi perfil (contraseña, correo, color) pide el permiso «empleados», que tienen todos los roles; antes un usuario solo con «Carga de registros» no podía abrirlo ni cambiar su contraseña temporal. |
| «Cargado por» | Lleva el usuario con el que se ingresó (por ejemplo `B. Pereira`), no el nombre de la cuenta: en el administrador principal ese nombre es genérico. Los registros ya cargados no se reescriben. |
| Fecha en la hoja | Google guarda la fecha como número; si una fila nueva no hereda el formato se vería 46322,64. En cada alta se vuelve a fijar el formato fecha y hora de la columna A, y al abrir la planilla cualquier número de serie se muestra como fecha y se repara el formato en la hoja. |

## Piezas tomadas del rediseño integral (28/10/2026)

El usuario descartó el rediseño completo (rama `rediseno-integral`, que queda como referencia) y pidió llevar solo estas piezas a la página actual:

| Pedido | Resolución |
|---|---|
| Marcar palabras como "tu familia" | En el banner de Inicio, las palabras resaltadas van en un recuadro recto color papel (#FEFCE3) con letra verde; en el diseño "tarjeta" (recuadro claro) se invierte. |
| Bazar arriba | La sección Bazar (banner y productos) va justo debajo del banner principal. Nuevo orden de Inicio: banner, Bazar, beneficios, accesos, créditos, Servicios sociales, Pinecoop y Hacete socio. |
| Cabecera de páginas con fondo | Las páginas internas (incluido el Catálogo del Bazar) tienen la cabecera en un bloque Verde oscuro de borde a borde, con el título en color papel. |
| Botones Hacete socio | Cápsula con borde verde que se rellena de verde al pasar el puntero (`variant="socio"`); sobre fondos verdes, borde claro que se rellena de color papel. Menú, pie, Beneficios, Inicio y banda Sumate a COPOL. |
| Logo del pie | Sin la cápsula blanca, solo el logo (a pedido del usuario, aunque el manual sugiere la cápsula blanca sobre verde). |
