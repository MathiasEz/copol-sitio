# Rediseño integral (28/10/2026)

Rama `rediseno-integral`, sobre `main` en `2208858`. Producción no se toca hasta que se elija el estilo.

## Decisiones del usuario (28/10/2026)

| Pregunta | Respuesta |
|---|---|
| Identidad | Dirección nueva: fondo, escala y estilo general pueden cambiar, siempre con los colores y el logo del Manual de marca COPOL 2026. |
| Alcance | Sitio público y panel. |
| Entrega | Rama + vista previa de Vercel. |
| Dirección | Construir las **tres** propuestas y dejarlas intercambiables con un selector (como claro/oscuro); el usuario elige después. |

## Arquitectura detectada

Astro 7 + adaptador de Vercel. 17 rutas públicas (Inicio, Sobre nosotros, Locales, Historia, Beneficios, Servicios sociales + 7 fichas, Convenios, Hipermercado, Tienda, Bazar, Promociones, Hacete socio, Contacto, Acceso web, Portal de empleados, 404), server islands (banner, créditos, estante del Bazar, campana), API de la app (`/api/app/v1`), panel Hono en `panel/` con 18 pantallas. Estilos: `src/styles/global.css` (tokens + componentes shadcn portados), CSS por componente, `public/panel-recursos/panel.css` para el panel.

## Auditoría (línea base en 1440 y 390 px)

Sin errores de JavaScript ni desborde horizontal en ninguna de las 18 rutas públicas ni las 17 pantallas del panel.

### Críticos
1. ~~Resalte del menú mal ubicado~~ **(falso positivo):** en las capturas automáticas la cápsula aparecía junto al logo, pero en un navegador real está bien ubicada; era la transición fotografiada a mitad de camino. Igual se agregó una nueva medición cuando cambia el tamaño del encabezado (llegada de la campana o de la fuente).
2. **Ancho completo sin medida de lectura:** con `--ancho: 100vw`, párrafos y bajadas superan los 120 caracteres por línea en 1440–1920 px.

### Inconsistencias importantes
3. Toda la estructura es la misma tarjeta blanca de 28 px con ícono en un cuadrito amarillo (accesos, beneficios, servicios, locales, convenios, horarios, canales): no hay jerarquía entre lo principal y lo secundario.
4. Antetítulos en mayúsculas sobre casi todos los títulos ("COOPERATIVA POLICIAL · DESDE 1917", "APERTURAS DE CRÉDITO"): ruido que compite con el título.
5. Grillas desequilibradas: 2 tarjetas estiradas a 1440 px (Beneficios), 3 + 2 en Tienda, 4 + 2 en Servicios.
6. Escala tipográfica corta: H1 de página de 40–60 px con bajada de 15 px y tarjetas de 13–14 px a 1440 px.
7. Bloques repetidos con el mismo peso en varias páginas ("Lo que queda de 2026", "Sumate a COPOL").
8. Panel: letra de 13–15 px, aviso de correo en pausa que ocupa un tercio de la pantalla del celular en cada página y lenguaje visual sin relación con el sitio.

### Oportunidades
9. Accesos rápidos con datos reales (locales, convenios, servicios, parques) en lugar de un ícono genérico.
10. Separar secciones con filetes y campos de color de la marca en vez de cajas.
11. Botones: tres alturas (40/48/54) y cápsulas en todo; el amarillo compite con el verde en varias vistas.

### Pendientes previos (no se inventan)
- Hipermercado muestra productos de demostración rotulados hasta que la cooperativa entregue el catálogo.
- Formulario de contacto en modo demostración sin `PUBLIC_FORM_ENDPOINT`.

## Sistema

Tres estilos sobre el mismo HTML, elegidos con `data-estilo` en `<html>` (clave `copol-estilo`, compartida por sitio y panel):

| Estilo | Mundo | Fondo | Títulos | Contenedores |
|---|---|---|---|---|
| **Afiche** (predeterminado) | Afiche cooperativo y grabado popular | Blanco verdozo (papel) | Archivo condensado, mayúsculas | Filetes de tinta, campos verdes, sin sombras |
| **Folleto** | Folleto del súper | Blanco con bandas Amarillo pleno | Archivo ancho y negro | Bordes verdes gruesos, sellos redondos |
| **Estándar** | Institucional de cooperativa | Blanco | Figtree 800 | Tarjetas de 16 px con sombra suave |

Compartido: escala de espaciado (4/8/12/16/24/32/48/64/96), medida de lectura de 68ch, botones de 48 px (44 px los chicos), foco de 3 px, cifras tabulares, `prefers-reduced-motion`.

## Orden de intervención

1. Tokens y selector de estilo (global + panel), corrección del resalte del menú.
2. Componentes globales: encabezado, cabecera de página, pie, botones, tarjetas, campos, badges.
3. Inicio, luego cada página interna, luego el panel.
4. Responsive (320, 390, 768, 1366, 1920) y estados (hover, foco, vacío, error).
5. Validación: `astro check`, build, `npm test`, pruebas del panel, capturas antes/después, detector de Impeccable.

## Criterios de aceptación

- Ninguna ruta con desborde horizontal ni errores de consola en 320–1920 px, en los tres estilos.
- Párrafos de cuerpo ≤ 75ch; un solo `<h1>` por página; sin antetítulos.
- Contraste AA en los tres estilos (texto ≥ 4,5:1).
- El selector cambia el estilo sin recargar, se recuerda y no produce destello al cargar.
- `npm run verificar` pasa igual que antes del rediseño.
- Rutas, formularios, filtros del Bazar, carrito, mapa, carruseles y panel funcionan igual.
