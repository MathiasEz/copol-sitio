---
name: COPOL · Cooperativa Policial
description: Sitio y panel de la Cooperativa Policial con los colores del Manual de marca 2026, en tres estilos intercambiables (Afiche, Folleto, Estándar) hasta que se elija uno.
colors:
  # Paleta oficial del Manual de marca COPOL 2026 (no se cambia en ningún estilo)
  verde-oscuro: "#006633"
  verde-copol: "#008d36"
  amarillo-copol: "#f8ea39"
  blanco-verdozo: "#eaf4ee"
  # Derivados funcionales (tonos del Verde oscuro, compartidos por los tres estilos)
  tinta: "#12261a"
  tinta-suave: "#3d5a49"
  borde: "#dce9e1"
  borde-fuerte: "#9cc6aa"
  verde-profundo: "#00331a"
  verde-hover: "#004d26"
  sobre-verde: "#d9ecdf"
  blanco: "#ffffff"
  amarillo-hover: "#ece032"
  rojo-error: "#b3261e"
  aviso-papel: "#fffbd6"
  aviso-trazo: "#8a7f00"
  # Estándar (valores base de :root)
  estandar-muted: "#edf5f0"
  estandar-secondary: "#e2efe7"
  # Afiche (:root[data-estilo='afiche'])
  afiche-muted: "#d6e9dd"
  afiche-border: "#b9d5c3"
  afiche-input: "#6f9a80"
  # Folleto (:root[data-estilo='folleto'])
  folleto-muted: "#fdf7c4"
  folleto-secondary: "#fbf19a"
  folleto-border: "#e6e0a4"
typography:
  display-afiche:
    fontFamily: "Archivo Variable, Figtree Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(2.875rem, 7.2vw, 6rem)"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 70"
  headline-afiche:
    fontFamily: "Archivo Variable, Figtree Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(2.125rem, 4.4vw, 3.75rem)"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "-0.005em"
    fontVariation: "'wdth' 70"
  title-afiche:
    fontFamily: "Archivo Variable, Figtree Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 750
    lineHeight: 1.12
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 70"
  numeral-afiche:
    fontFamily: "Archivo Variable, Figtree Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 4.6vw, 4rem)"
    fontWeight: 800
    lineHeight: 0.86
    letterSpacing: "-0.01em"
    fontFeature: "'tnum' 1"
    fontVariation: "'wdth' 66"
  display-folleto:
    fontFamily: "Archivo Variable, Figtree Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(2.375rem, 5.4vw, 4.5rem)"
    fontWeight: 900
    lineHeight: 0.96
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 112"
  headline-folleto:
    fontFamily: "Archivo Variable, Figtree Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 3.4vw, 2.875rem)"
    fontWeight: 900
    lineHeight: 0.96
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 112"
  display-estandar:
    fontFamily: "Figtree Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 4.6vw, 3.75rem)"
    fontWeight: 800
    lineHeight: 1.06
    letterSpacing: "-0.025em"
  headline-estandar:
    fontFamily: "Figtree Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 3vw, 2.5rem)"
    fontWeight: 800
    lineHeight: 1.06
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Figtree Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 750
    lineHeight: 1.12
    letterSpacing: "-0.01em"
  lead:
    fontFamily: "Figtree Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "clamp(1.0625rem, 1.6vw, 1.25rem)"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Figtree Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Figtree Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 700
    lineHeight: 1.3
  button:
    fontFamily: "Figtree Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.2
  caption:
    fontFamily: "Figtree Variable, Segoe UI, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 700
    lineHeight: 1.3
rounded:
  pill: "999px"
  foco: "6px"
  estandar-md: "12px"
  estandar-lg: "16px"
  estandar-xl: "20px"
  folleto-md: "14px"
  folleto-lg: "22px"
  folleto-xl: "28px"
  afiche-recto: "0px"
  afiche-boton: "4px"
spacing:
  e-1: "4px"
  e-2: "8px"
  e-3: "12px"
  e-4: "16px"
  e-5: "24px"
  e-6: "32px"
  e-7: "48px"
  e-8: "64px"
  e-9: "96px"
  gutter: "clamp(16px, 2.6vw, 44px)"
  seccion: "clamp(56px, 7vw, 104px)"
  card-relleno: "clamp(20px, 2.2vw, 28px)"
  medida: "68ch"
components:
  button-primary:
    backgroundColor: "{colors.verde-oscuro}"
    textColor: "{colors.blanco}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "12px 24px"
    height: "48px"
  button-primary-hover:
    backgroundColor: "{colors.verde-hover}"
    textColor: "{colors.blanco}"
  button-accent:
    backgroundColor: "{colors.amarillo-copol}"
    textColor: "{colors.tinta}"
    typography: "{typography.button}"
    rounded: "{rounded.pill}"
    padding: "12px 24px"
    height: "48px"
  button-accent-hover:
    backgroundColor: "{colors.amarillo-hover}"
    textColor: "{colors.tinta}"
  button-outline:
    backgroundColor: "{colors.blanco}"
    textColor: "{colors.verde-oscuro}"
    rounded: "{rounded.pill}"
    padding: "12px 24px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.estandar-secondary}"
    textColor: "{colors.verde-oscuro}"
    rounded: "{rounded.pill}"
    padding: "12px 24px"
    height: "48px"
  button-sm:
    padding: "8px 18px"
    height: "44px"
  button-lg:
    padding: "14px 30px"
    height: "54px"
  button-primary-afiche:
    backgroundColor: "{colors.verde-oscuro}"
    textColor: "{colors.blanco}"
    rounded: "{rounded.afiche-boton}"
    padding: "12px 24px"
    height: "48px"
  card-estandar:
    backgroundColor: "{colors.blanco}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.estandar-lg}"
    padding: "{spacing.card-relleno}"
  card-folleto:
    backgroundColor: "{colors.blanco}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.folleto-lg}"
    padding: "{spacing.card-relleno}"
  card-afiche:
    textColor: "{colors.tinta}"
    rounded: "{rounded.afiche-recto}"
    padding: "clamp(18px, 2vw, 26px) 0"
  campo-entintado:
    backgroundColor: "{colors.verde-oscuro}"
    textColor: "{colors.sobre-verde}"
    padding: "clamp(28px, 4vw, 44px)"
  input:
    backgroundColor: "{colors.blanco}"
    textColor: "{colors.tinta}"
    typography: "{typography.body}"
    rounded: "{rounded.estandar-md}"
    padding: "10px 16px"
    height: "48px"
  badge:
    backgroundColor: "{colors.estandar-secondary}"
    textColor: "{colors.verde-oscuro}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "4px 11px"
  toggle-selected:
    backgroundColor: "{colors.verde-oscuro}"
    textColor: "{colors.blanco}"
    rounded: "{rounded.pill}"
    padding: "6px 8px 6px 16px"
    height: "42px"
  barra-superior:
    backgroundColor: "{colors.verde-oscuro}"
    textColor: "{colors.blanco}"
    height: "44px"
---

# Design System: COPOL · Cooperativa Policial

## Overview

**Creative North Star: "El afiche cooperativo en dos tintas"**

COPOL habla como lo que es: una cooperativa de consumo de la familia policial con más de un siglo, que imprime sus avisos para que se lean de lejos. El sistema toma los cuatro colores del Manual de marca COPOL 2026 y el logotipo sin tocar, y los usa como tinta y papel: campos enteros de Verde oscuro, filetes en lugar de cajas, titulares que se leen como carteles y el Amarillo Copol guardado para lo que hay que tocar. Todo termina en una persona (WhatsApp, teléfono, local), así que la acción siempre está a mano y nunca compite con otra del mismo peso.

La densidad es de tienda y de servicio, no de revista: el socio llega desde el celular, a veces con un equipo modesto, y tiene que encontrar crédito, producto, servicio o local en uno o dos toques. Por eso la estructura se repite (encabezado, banner, índice de accesos, bloques "banner + contenido", pie) y lo que cambia entre estilos es la voz de los títulos, el papel, la forma de los contenedores y cómo se separan las secciones. Los datos reales (19 locales, 159 convenios, 15 cuotas, fechas de apertura) son la decoración: se muestran grandes y con cifras tabulares, nunca se inventan.

Rechazos confirmados: la grilla de tarjetas blancas idénticas con un ícono en un cuadrito amarillo (la línea base del rediseño, ver `docs/rediseno-integral.md`), los antetítulos en mayúsculas encima de cada título y los párrafos que cruzan toda la pantalla.

**Key Characteristics:**
- Un solo HTML, tres estilos: `data-estilo="afiche | folleto | estandar"` en `<html>`; Afiche es el predeterminado.
- Colores siempre del manual; los derivados son tonos del Verde oscuro, no colores nuevos.
- Logotipo intacto; sobre verde va en una cápsula blanca.
- Figtree (provisoria de Articulat CF) para todo el texto; Archivo con eje de ancho para los titulares de Afiche y Folleto.
- Separación por filetes y campos de color antes que por cajas con sombra (Afiche y Folleto).
- Objetivos táctiles de 44 px, foco de 3 px, `prefers-reduced-motion` respetado, un `<h1>` por página.

### Elección pendiente

El usuario pidió construir las tres direcciones y elegir después. Hasta entonces conviven:

| Estilo | Mundo | Papel | Titulares | Contenedores | Separación |
|---|---|---|---|---|---|
| **Afiche** (predeterminado, dirección asignada) | Afiche cooperativo y grabado popular | Amarillo al 14 % (#FEFCE3, el de la página oficial) | Archivo condensado (70 %), 800, mayúsculas | Sin caja: bloques entre filetes, campos verdes | Filete de tinta de 2 px; 4 px arriba de cada cabecera de sección |
| **Folleto** | Folleto semanal del súper | Blanco con bandas de Amarillo pleno | Archivo ancho (112 %), 900, mayúsculas | Borde verde de 3 px, esquinas de 22 px, sellos redondos | Filete verde de 3 px; banda amarilla de 10 px |
| **Estándar** | Institucional de cooperativa | Blanco | Figtree 800, caja normal | Tarjetas de 16 px con sombra suave | Espacio + línea fina de 1 px |

El estilo se elige con el selector de la barra superior (`SelectorEstilo.astro`) o con `?estilo=folleto` en la dirección, y se recuerda con la clave `copol-estilo` (compartida con el panel por `public/panel-recursos/tema.js`). El script en línea de `src/layouts/Base.astro` lo aplica antes de pintar.

**Cuando se elija uno, se quita:**
1. En `src/styles/global.css`: pasar los valores del estilo elegido al bloque `:root` y borrar los bloques `:root[data-estilo='…']` de los otros dos, junto con cada regla `:root[data-estilo='…']` de componentes (cabeceras de sección, tarjetas, banner).
2. Las reglas `:global(:root[data-estilo='…'])` de los estilos descartados en `Encabezado.astro`, `EncabezadoPagina.astro`, `Pie.astro`, `AperturasCredito.astro`, `BandaSocio.astro` y `src/pages/index.astro` (las del elegido pasan a ser las reglas base, sin el prefijo).
3. `SelectorEstilo.astro` y su uso en `Encabezado.astro`; el script de estilo y el atributo `data-estilo` de `Base.astro`.
4. En el panel: el bloque "Estilos visuales del rediseño" al final de `public/panel-recursos/panel.css` (menos las mejoras comunes: letra de 16 px, controles de 44 px táctiles y el aviso plegable), el selector `.estilo-panel` y la parte de estilo de `tema.js`.
5. Si se elige Estándar: el `@import` de Archivo en `global.css` y el `@font-face` de `archivo.woff2` del panel.
6. En este archivo: las claves `afiche-*`, `folleto-*` o `estandar-*` que ya no existan, la tabla de arriba y esta lista; actualizar `docs/sistema-visual.md`.

## Colors

Dos tintas del manual sobre papel claro: Verde oscuro para todo lo que se lee y se toca, Amarillo Copol para lo que hay que tocar primero.

### Primary
- **Verde oscuro** (`verde-oscuro`): títulos, enlaces, botón principal, barra superior, pie y los campos entintados (aperturas de crédito, cabecera de página en Afiche). Texto blanco encima: 7,1:1.
- **Verde hover** (`verde-hover`) y **Verde profundo** (`verde-profundo`): estados de hover del verde y fondos de imagen detrás del banner.

### Secondary
- **Amarillo Copol** (`amarillo-copol`): la acción principal (Hacete socio, Acceso web, Consultá tu crédito), la selección de texto, el contador del filtro activo. Siempre con texto `tinta` o Verde oscuro. En Folleto además es papel: cabezal, cabecera de página, banda del pie y relleno de hover de las tarjetas.
- **Amarillo de hover** (`amarillo-hover`): el mismo amarillo un punto más oscuro para el hover de los botones amarillos.

### Tertiary
- **Verde Copol** (`verde-copol`): íconos de listas de verificación y de beneficios, borde de campo en hover. No va en texto chico (4,3:1 sobre blanco).

### Neutral
- **Blanco verdozo** (`blanco-verdozo`): color del manual disponible para superficies suaves. Desde el 28/10/2026 el papel de los tres estilos es el fondo de la página oficial, `blanco-amarillo` (#FEFCE3, token `--papel`), también sobre los campos verdes.
- **Blanco** (`blanco`): papel de Folleto y Estándar, interior de tarjetas, cápsula del logo sobre verde.
- **Tinta** (`tinta`) y **Tinta suave** (`tinta-suave`): texto de cuerpo y texto secundario (≥ 4,5:1 sobre blanco y Blanco verdozo). En Afiche, la tinta también dibuja los filetes.
- **Sobre verde** (`sobre-verde`): texto secundario sobre campos de Verde oscuro.
- **Borde** / **Borde fuerte** (`borde`, `borde-fuerte`): líneas finas y bordes de campos en Estándar.
- **Fondos suaves por estilo**: `estandar-muted`/`estandar-secondary` (#FBF4C2 y #F9EEA6, los mismos de la página oficial), `afiche-muted`/`afiche-border`/`afiche-input` (verdes de papel entintado), `folleto-muted`/`folleto-secondary`/`folleto-border` (amarillos de folleto). Son los `--muted`, `--secondary`, `--border` e `--input` de cada estilo.
- **Rojo de error** (`rojo-error`): errores de formulario. **Aviso** (`aviso-papel` + `aviso-trazo`): contenido de demostración o pendiente, con borde punteado.

### Named Rules
**La Regla de las Dos Tintas.** Ningún color que no salga del manual. Si hace falta un tono para texto, estado o borde, es un tono del Verde oscuro (o del Amarillo, en Folleto); nunca un azul, un gris neutro de sistema ni un acento nuevo.

**La Regla del Amarillo que se Toca.** En Afiche el Amarillo pleno es solo para la acción principal de cada campo; íconos, sellos, badges y resaltados van en tinta o papel. En ningún estilo hay texto amarillo sobre blanco.

**La Regla del Verde que No Habla Chico.** El Verde Copol nunca lleva texto de cuerpo ni texto blanco por debajo de 24 px (o 19 px en negrita).

## Typography

**Display Font (Afiche y Folleto):** Archivo Variable, eje de ancho 62–125 %, autoalojada con `@fontsource-variable/archivo/wdth.css` (con Figtree de respaldo)
**Body Font:** Articulat CF oficial; mientras no haya licencia web, Figtree Variable provisoria (con Segoe UI, system-ui)
**Display Font (Estándar):** la misma Figtree, en 800

**Character:** Figtree pone la voz cercana y legible de todos los días; Archivo pone el cartel. En Afiche se comprime hasta parecer tipografía de afiche impreso; en Folleto se ensancha y se pone negra, como el precio de oferta. El cambio de una a otra lo hacen los tokens `--fuente-titulo`, `--titulo-ancho`, `--titulo-peso`, `--titulo-caja`, `--titulo-tracking` y `--titulo-interlineado`; los componentes nunca nombran la fuente directamente.

### Hierarchy
- **Display** (`display-afiche` / `display-folleto` / `display-estandar`): el `<h1>` de cada página y el título del banner. Mayúsculas en Afiche y Folleto, caja normal en Estándar.
- **Headline** (`headline-*`): títulos de sección (`<h2>`). En las cabeceras de bloque de Inicio se reduce a `clamp(1.625rem, 3vw, 2.25rem)`.
- **Title** (`title`, `title-afiche`): `<h3>`, títulos de tarjeta. En Afiche sube a 1,5 rem, condensado y en mayúsculas.
- **Numeral** (`numeral-afiche`): cifras protagonistas del índice de accesos y de las fechas de crédito (hasta 4,25 rem en las fechas). Siempre tabulares.
- **Lead** (`lead`): bajadas de cabecera y de sección, máximo 56–62ch.
- **Body** (`body`): 17 px, interlineado 1,55. Los párrafos dentro de `<main>` nunca pasan de la medida (68ch).
- **Label / Button / Caption**: etiquetas de campo (0,9375 rem, 700), botones (1 rem, 700) y badges o datos chicos (0,8125 rem, 700). En Afiche los botones toman Archivo al 84 %, en mayúsculas, con 0,03 em de tracking; en Folleto, Archivo al 104 % en caja normal.

### Named Rules
**La Regla del Dato en Letra de Texto.** Los nombres de producto, códigos y datos de catálogo van siempre en Figtree, en caja normal, sin la voz del estilo. El titular es del estilo; el dato es del socio.

**La Regla de la Medida.** Ningún párrafo de lectura supera 68ch, aunque el contenedor ocupe toda la pantalla.

**La Regla de la Cifra Quieta.** Toda cifra que cambia o que se compara (contadores, cantidades, fechas) usa cifras tabulares.

## Layout

Todo el sitio va a todo el ancho: `--ancho` es `100vw` y el mismo margen interno (`gutter`, de 16 a 44 px) alinea encabezado, contenido y pie. El ritmo vertical sale de una escala de 4/8 px (`e-1` a `e-9`); entre secciones va `seccion` (56–104 px). El encabezado es pegajoso: barra superior verde de 44 px y cabezal de 76 px con el logo a 50 px de alto.

Inicio sigue un orden fijo: banner editable del panel a todo el ancho (desde 784 px, sin esquinas y con el texto alineado al contenido), banner de beneficios, índice "¿Qué necesitás hoy?", aperturas de crédito, y bloques "banner de sección + contenido" (Servicios sociales, Bazar, Pinecoop, Hacete socio). Las páginas internas abren con la cabecera de página (migas, `<h1>`, bajada, dato propio, acciones, imagen opcional en dos columnas desde 900 px).

Las grillas nunca dejan huérfanos: índice de accesos 6 → 3 → 2 columnas (cortes en 1180 y 720 px); servicios 3 → 2 → 1 (1000 y 640 px); beneficios de socio 4 → 2 (900 px); productos del Bazar en columnas automáticas de 220 px como mínimo y 2 fijas por debajo de 560 px. En celular, los grupos de botones de un bloque pasan a ocupar todo el ancho y se apilan (por debajo de 600 px).

Cortes de pantalla en uso: 380, 480, 560, 600, 640, 700, 720, 784, 900, 1000, 1100 (menú de escritorio), 1180 y 1280 px. El banner usa consultas de contenedor (720 px) porque también se muestra dentro de la vista "Celular" del panel.

## Elevation & Depth

Cada estilo resuelve la profundidad de una forma distinta, y esa diferencia es parte de la elección. **Afiche** es plano: nada flota; la jerarquía la dan los campos entintados, los filetes de tinta y el entintado al pasar el puntero (el bloque se pinta de Verde oscuro). **Folleto** también es plano: separa con bordes verdes gruesos y bandas amarillas, y el hover pinta de Amarillo. **Estándar** usa sombras suaves con tinte verde, que aparecen sobre todo como respuesta al hover.

### Shadow Vocabulary
- **Sombra de tarjeta en reposo** (`box-shadow: 0 1px 2px rgb(0 51 26 / 0.04)`): solo Estándar.
- **Sombra suave** (`box-shadow: 0 10px 28px -12px rgb(0 51 26 / 0.18)`): hover de tarjetas e ítems del índice en Estándar.
- **Sombra amplia** (`box-shadow: 0 24px 48px -12px rgb(0 51 26 / 0.18)`): submenú de escritorio y tarjeta primaria en hover.
- **Anillo interior** (`box-shadow: inset 0 0 0 1px rgb(0 51 26 / 0.1)`, `0.22` en hover): borde de las imágenes de `Media`, en todos los estilos.
- **Filete del cabezal** (`box-shadow: 0 3px 0 var(--tinta)` en Afiche, `0 3px 0 var(--verde-oscuro)` en Folleto): no es una sombra sino la línea impresa bajo el encabezado.

### Named Rules
**La Regla del Plano Impreso.** En Afiche y Folleto `--card-sombra` y `--card-sombra-hover` valen `none`: la profundidad se marca con tinta, nunca con sombra.

**La Regla de la Sombra que Responde.** En Estándar la sombra marcada aparece por estado (hover, menú abierto); en reposo la tarjeta apenas se separa del papel.

## Shapes

- **Afiche:** esquinas rectas (0 px) en tarjetas, medios, banner y fechas; 4 px en botones, campos e íconos. Los contenedores no son cajas: son franjas entre filetes de tinta de 2 px, con un filete de 4 px sobre cada cabecera de sección y sobre el pie.
- **Folleto:** esquinas amplias (14 / 22 / 28 px), bordes verdes de 3 px y sellos redondos y levemente girados (−4° y 3°) para fechas y datos destacados; el título de sección lleva debajo una franja amarilla tipo resaltador.
- **Estándar:** esquinas medias (12 / 16 / 20 px) y cápsula (999 px) en botones, badges, toggles y el resalte del menú.

En los tres, badges y toggles son cápsulas, y el logo sobre verde va en una cápsula blanca (recta en Afiche).

## Components

### Buttons
Rótulos firmes, de una sola acción cada uno.
- **Shape:** cápsula en Estándar y Folleto (`rounded.pill`); rectángulo con esquinas de 4 px en Afiche (`button-primary-afiche`).
- **Primary:** Verde oscuro con texto blanco, 48 px de alto, 12 × 24 px de relleno. Tamaños: chico de 44 px y grande de 54 px; en celular un botón largo puede partir en dos líneas antes que desbordar.
- **Accent:** Amarillo Copol con texto `tinta`, para la acción principal.
- **Outline / Secondary / Ghost / Inverse / Link:** contorno verde sobre papel; verde claro con texto verde; transparente; contorno blanco sobre campos verdes; subrayado.
- **Hover / Focus / Active:** el verde se oscurece (`verde-hover`) con un halo verde difuso en Estándar; al presionar, escala a 0,97 con el resorte; foco de 3 px Verde oscuro a 3 px de distancia (Amarillo sobre fondos verdes).

### Chips (badges y toggles)
- **Badge:** cápsula de 0,8125 rem en 700; variantes verde, verde claro, contorno y amarillo. En Afiche el badge amarillo pasa a Verde oscuro.
- **Toggle (filtros del Bazar y Locales):** radios nativos con forma de cápsula de 42 px; seleccionado en Verde oscuro con el contador en Amarillo.

### Cards / Containers
- **Estándar:** tarjeta blanca sobre el fondo #FEFCE3, borde de 1 px `borde`, esquinas de 16 px, sombra mínima; en hover sombra suave y sube 3 px.
- **Folleto:** tarjeta blanca sobre el fondo #FEFCE3, borde de 3 px Verde oscuro, esquinas de 22 px, sin sombra; en hover se pinta de Amarillo.
- **Afiche:** sin fondo ni borde lateral; un filete de tinta arriba y sin relleno horizontal. En hover el bloque se entinta de Verde oscuro, el texto pasa a blanco y gana relleno (160 ms de color, 260 ms de relleno).
- **Campo entintado (`campo-entintado`):** bloque de Verde oscuro a todo el ancho del contenedor para lo importante (aperturas de crédito, tarjeta primaria, cabecera de página en Afiche). En Folleto lleva un borde interior amarillo de 6 px.
- **Relleno interno:** `card-relleno` (20–28 px; 18–26 px en Afiche).

### Inputs / Fields
- **Style:** 48 px de alto, borde de 1,5 px (`--input` del estilo), esquinas medias del estilo, fondo de papel.
- **Focus:** el borde pasa a Verde oscuro con un halo de 4 px `rgb(0 102 51 / 0.18)`.
- **Error:** borde y halo en rojo de error; el mensaje se asocia con `aria-describedby` solo cuando está visible.

### Navigation
- **Barra superior:** Verde oscuro, 44 px, con lema, selector de estilo, WhatsApp y Acceso web (Amarillo en Estándar; contorno blanco en Afiche; blanco en Folleto).
- **Cabezal:** papel con desenfoque detrás (Amarillo pleno en Folleto). En escritorio (≥ 1100 px) el menú queda al centro con un resalte que se desliza entre ítems: cápsula verde claro en Estándar, cápsula blanca con borde verde en Folleto, barra de tinta de 4 px bajo el ítem en Afiche (donde el menú va en Archivo al 78 % y en mayúsculas). "Hacete socio" es la única acción del menú (verde; Amarillo en Afiche).
- **Celular:** panel lateral (Sheet) de hasta 400 px con fondo atenuado, foco atrapado y Escape; ítems de 56 px.

### Índice de accesos (signature)
Seis entradas con un dato real cada una (cuotas, horario, cantidades). En Afiche es una fila impresa entre filetes, separada por líneas de tinta de 2 px, donde la cifra condensada (`numeral-afiche`) reemplaza al ícono y debajo va un dato que la complementa. En Folleto son etiquetas de góndola con borde verde y el ícono en un círculo amarillo. En Estándar, tarjetas blancas con el ícono en un cuadrado verde claro y la flecha que aparece en hover.

### Aperturas de crédito (signature)
Campo entintado con las fechas cargadas en el panel (las pasadas desaparecen solas). Fechas como fichas blancas (Estándar), tiras de papel con numerales de 4,25 rem (Afiche) o sellos redondos amarillos girados (Folleto). Entran una tras otra con el resorte.

### Cabecera de página y pie (signature)
La cabecera es blanca con filete en Estándar, campo de Verde oscuro con título en papel en Afiche, y tapa de Amarillo pleno con el dato como sello verde en Folleto. El pie es Verde oscuro en los tres; Afiche lo remata con el lema en Archivo al 62 % a todo el ancho (hasta 11 rem) y Folleto con una banda amarilla.

### Tarjeta de producto del Bazar
Foto entera sobre blanco (`contain`, sin recorte), etiqueta de stock debajo de la foto (nunca encima), nombre en Figtree 650 y código interno. Sin stock, la foto pasa a gris y el texto mantiene el contraste completo.

### Movimiento
Curvas `ease-out-quart` y un resorte `linear()` con ~3 % de rebote; transición base de 180 ms. Títulos que suben desde una máscara, aparición escalonada (60 ms por ítem), imágenes que aparecen nítidas desde un leve desenfoque, transición de página con View Transitions y gestos de ícono al pasar el puntero (apagados en Inicio). Con `prefers-reduced-motion` todo queda quieto.

## Do's and Don'ts

### Do:
- **Do** usar solo los tokens: `--primary`, `--accent`, `--muted`, `--border`, `--radio-*`, `--filete`, `--card-*` y `--fuente-titulo`, para que el mismo componente se imprima bien en los tres estilos.
- **Do** separar secciones con `--filete` / `--filete-fuerte` y campos de Verde oscuro antes que con cajas, en Afiche y Folleto.
- **Do** mostrar el dato real como protagonista (cantidades, horarios, fechas) en cifras tabulares, y el ícono solo donde no hay cifra.
- **Do** mantener 44 px de área táctil mínima, foco de 3 px y contraste AA (≥ 4,5:1) en los tres estilos.
- **Do** mostrar completos los banners entregados por la cooperativa, con su versión 5:4 por debajo de 640 px.
- **Do** probar cada componente nuevo con `?estilo=afiche`, `?estilo=folleto` y `?estilo=estandar` mientras la elección siga pendiente.

### Don't:
- **Don't** modificar, recolorear ni recortar el logotipo; sobre verde va en una cápsula blanca.
- **Don't** usar colores fuera del manual ni texto amarillo sobre blanco; el Verde Copol no va en texto chico.
- **Don't** volver a la grilla de tarjetas blancas idénticas con un ícono en un cuadrito amarillo como única estructura.
- **Don't** poner antetítulos en mayúsculas encima de los títulos ni numerar las secciones.
- **Don't** usar sombras de elevación en Afiche ni en Folleto (las sombras interiores sin desenfoque que dibujan filetes y bordes sí valen); ni Amarillo pleno en íconos, sellos o badges de Afiche.
- **Don't** aplicar la voz del titular (Archivo, mayúsculas) a nombres de producto, códigos o párrafos.
- **Don't** dejar párrafos de más de 68ch ni grillas con una tarjeta huérfana.
- **Don't** inventar datos, precios, testimonios ni imágenes (nada de IA ni de bancos de imágenes).
