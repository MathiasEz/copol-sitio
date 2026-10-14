# Sistema visual

Fuente: **Manual de marca COPOL 2026**. Los valores están definidos como variables CSS en `src/styles/global.css`.

## Color

| Token | Valor | Origen | Uso |
|---|---|---|---|
| `--verde-oscuro` | `#006633` | Manual | Títulos, botones primarios, fondos con texto blanco (contraste 7,1:1). |
| `--verde-copol` | `#008D36` | Manual | Acentos e íconos. Texto blanco encima **solo ≥ 24 px** o negrita ≥ 19 px (4,3:1). |
| `--amarillo-copol` | `#F8EA39` | Manual | Resaltados, chips, CTA secundarios. Siempre con texto verde oscuro o `--tinta`. **Nunca texto amarillo sobre blanco.** |
| `--blanco-verdozo` | `#EAF4EE` | Manual | Fondos de sección, tarjetas suaves. |
| `--tinta` | `#12261A` | Derivado | Texto de cuerpo. |
| `--tinta-suave` | `#3D5A49` | Derivado | Texto secundario (≥ 4,5:1 sobre blanco y sobre Blanco verdozo). |
| `--borde` / `--borde-fuerte` | `#D6E8DC` / `#9CC6AA` | Derivado | Bordes de tarjetas y campos. |
| `--verde-profundo` / `--verde-hover` | `#00331A` / `#004D26` | Derivado | Estados hover. |

Los derivados son tonos del Verde oscuro necesarios para texto y estados. No son colores nuevos de marca.

## Tipografía

- **Oficial: Articulat CF** (manual, pág. 11). Es una fuente comercial; no se cuenta con los archivos web ni con la licencia.
- **Provisoria: Figtree Variable** (licencia OFL, autoalojada vía `@fontsource-variable/figtree`), por su proporción geométrica similar.
- **Cómo reemplazarla:** colocar los `.woff2` licenciados en `public/fonts/`, declarar `@font-face` para Articulat CF en `global.css` y cambiar `--fuente`. Quitar el import de Figtree.
- Escala: H1 `clamp(2.25rem, 5vw, 3.75rem)` peso 800 · H2 `clamp(1.75rem, 3.2vw, 2.5rem)` 800 · cuerpo 17 px, interlineado 1,55.

## Logotipo

- Archivo: `src/assets/brand/logo-copol.svg` (el SVG publicado por el sitio oficial; coincide con el logotipo del manual, con el isotipo en la "P").
- **No se modifica** (manual, pág. 9). En fondos verdes se coloca sobre una cápsula blanca en lugar de recolorearlo.
- Isotipo (favicon e ícono táctil): recorte del manual, pág. 8.
- Área segura: el manual la indica como 85 px para la pieza de presentación; en web se respeta con márgenes proporcionales alrededor del logo.

## Elementos gráficos del manual

- **Ilustración "Cooperativismo"** (pág. 13): bloque "Nuestra esencia" en Inicio.
- **Trama de íconos** (pág. 12): disponible en `src/assets/brand/trama-iconos.webp`; se usó en la dirección B y queda disponible para usos futuros.

## Componentes

### Componentes de interfaz (anatomía shadcn/ui) — `src/components/ui/`

Se siguen la anatomía, las variantes y los tokens semánticos de [shadcn/ui](https://ui.shadcn.com) (`--background`, `--foreground`, `--muted`, `--muted-foreground`, `--border`, `--input`, `--ring`, `--primary`, `--secondary`, `--accent`, `--radius`), portados a componentes Astro **sin React ni Tailwind**. shadcn/ui es una colección de componentes React + Tailwind pensada para copiarse en el proyecto. Para un sitio estático sin JavaScript por defecto, conviene más reproducir su estructura y variantes en Astro que sumar React solo para la interfaz. Si en el futuro hace falta un componente muy interactivo (por ejemplo, un Combobox), se puede agregar React como "isla" de Astro y usar el componente original.

| Componente | Archivo | Variantes / notas |
|---|---|---|
| Button | `ui/Button.astro` | `default · secondary · outline · ghost · accent · inverse · link`; tamaños `sm · default · lg · icon`; con `href` renderiza `<a>` |
| Badge | `ui/Badge.astro` | `default · secondary · outline · accent` |
| Card | `ui/Card.astro` | `default · muted · primary · dashed`; con `href` la tarjeta entera es un enlace (anillo interior que se oscurece y leve elevación) |
| Alert | `ui/Alert.astro` | `default · demo · pendiente` (borde punteado: contenido no definitivo) |
| Field (Label + Input/Select/Textarea) | `ui/Campo.astro` | Ícono opcional, ayuda y error asociado con `aria-describedby` solo cuando el error está visible |
| ToggleGroupItem | `ui/Toggle.astro` | Radios nativos con apariencia de toggle y contador (filtros del Bazar y Locales) |
| Accordion | `ui/Accordion.astro` | Sobre `<details>`: funciona sin JS (preguntas frecuentes) |
| AspectRatio / Media | `ui/Media.astro` | Reserva la proporción de la imagen (nunca la deforma); por defecto usa la proporción propia, sin recorte; `contener` + `fondo` para piezas gráficas con texto |
| Sheet | `Encabezado.astro` | Menú móvil lateral con fondo atenuado, foco atrapado y Escape |
| NavigationMenu | `Encabezado.astro` | Submenús de escritorio con entrada en resorte y resalte deslizante entre ítems |

Radios: cápsula (999 px) para botones, toggles y badges; 14/20/28 px para tarjetas y medios. Las imágenes destacadas tienen una esquina superior amplia (96 px), que retoma las curvas del logotipo sin recortar la foto.

## Movimiento (ideas tomadas de prompt-motion.com, adaptadas)

Revisé la página y varios prompts de su catálogo: "Shape morphing through UI states", "Orange dot motion system", "Photo print app launch film" y "Motion techniques showreel". Adopté sus principios: resortes con un rebote mínimo, texto que sube desde una línea de máscara, formas que se transforman en lugar de fundidos genéricos, y nada de brillos ni partículas. Así se aplicaron:

| Patrón | Dónde |
|---|---|
| Mazo de imágenes en abanico que rota al cambiar de novedad | Carrusel de Inicio |
| Indicadores como barras de progreso | Carrusel de Inicio (sin botones de control visibles) |
| Texto que sube desde una máscara | Títulos del carrusel, cabeceras de página y títulos de sección |
| Fotos en abanico que se separan con el hover (`--spread`) | Tarjeta "Sumate a COPOL" |
| Resalte "líquido" que se desliza entre ítems | Menú principal de escritorio |
| Botón → indicador de carga → ✓ | Envío del formulario de contacto |
| Aparición escalonada con resorte | Grillas de tarjetas, fechas de crédito, línea de tiempo que se dibuja |
| Imágenes que aparecen nítidas desde un leve desenfoque | Todas las imágenes de `Media` |
| Anillo interior que se oscurece y zoom leve de la imagen al pasar el puntero | Tarjetas de producto, novedades y secciones |

Tokens: `--ease-out-quart` y `--resorte` (curva `linear()` con un rebote de alrededor del 3 %). Con `prefers-reduced-motion` todo queda estático.

## Accesibilidad (criterios aplicados)

- Contraste AA verificado con axe-core 4.10 en 16 páginas representativas, en escritorio y en móvil (`scripts/qa-interacciones.mjs`). El Verde Copol no se usa en texto chico (4,3:1).
- Foco visible: contorno de 3 px Verde oscuro (amarillo sobre fondos verdes).
- Enlace "Saltar al contenido", landmarks, un `<h1>` por página, migas con `aria-current`.
- Menú: botones con `aria-expanded`/`aria-controls`; Escape y clic fuera cierran. En móvil es un panel lateral con foco atrapado.
- Carrusel: sin botones visibles. Se maneja con gestos (deslizar), flechas ←/→ con el carrusel enfocado e indicadores, que son botones con nombre y área de 44 px. Se pausa con el puntero o el foco encima, se detiene definitivamente al primer gesto del usuario y después de una vuelta completa, y no avanza con `prefers-reduced-motion`. `aria-live` se activa solo en los cambios manuales.
- Objetivos táctiles ≥ 44 px en controles principales.
