# Portal de empleados COPOL ("Información empleados")

Página interna para el personal de COPOL. Reúne, en este orden: el protocolo de **acoso laboral**, la encuesta **¿Cómo te sentís hoy?**, fotos de **Tu cooperativa**, **Próximamente Ciudad del Plata**, **Pinecoop Chuy** (en obras) y el acceso a **Tus recibos**.

Hay dos versiones con el mismo contenido y el mismo orden:

| Versión | Dónde está | Para qué |
|---|---|---|
| `portal-empleados.html` (este paquete) | Archivo único para cargar en **Odoo** | Página para el personal, con los colores del sitio web (fondo amarillo claro, verdes COPOL). |
| Panel de stock → "Información empleados" | Panel de administración del sitio | La misma sección dentro del panel. Ahí los administradores cambian enlaces y fotos desde "Editar". |

> Si se cambia un enlace o una foto, hay que actualizarlo **en las dos** versiones.

---

## 1. El archivo

- **Un solo archivo**: `portal-empleados.html` (≈ 480 KB). Tiene adentro el HTML, el CSS, el JavaScript, la tipografía, el logo y las fotos actuales. No usa frameworks, librerías ni archivos externos.
- **Los códigos QR se generan solos** en el navegador a partir de cada enlace. No hay que fabricar ni subir imágenes de QR: se cambia el enlace y el QR cambia con él.
- **Todos los estilos están encerrados** en `#copol-portal`, así que no alteran el resto de la página donde se pegue. La única excepción es el fondo y el margen de `body`, que solo aplican si se abre como página propia.
- **Funciona en celular, tablet y computadora.** En pantallas angostas todo va en una columna.

### Cómo cargarlo en Odoo (sitio web)

1. Abrí `portal-empleados.html` con un editor de texto (Bloc de notas, VS Code).
2. Editá el bloque **CONFIGURACIÓN** (ver punto 4), si hace falta.
3. En Odoo: **Sitio web → + Nuevo → Página**. Ponele un nombre, por ejemplo "Información empleados".
4. En el editor, arrastrá el bloque **"Incrustar código"** ("Embed Code"), que está en los bloques de contenido, y abrilo con **"Editar"**.
5. Borrá el contenido de ejemplo, pegá **todo** el contenido de `portal-empleados.html` y guardá.
6. Publicá la página. Si es solo para el personal, no la agregues al menú público; si hace falta, restringí su visibilidad desde las propiedades de la página.
7. Revisá la página publicada desde el celular. Escaneá los QR con la cámara y tocá cada botón.

> **Requisito:** el bloque "Incrustar código" tiene que conservar los `<script>`, que es lo que hace normalmente. Si se perdieran, la página muestra el aviso "activá JavaScript" y no aparecen los QR, las fotos ni los botones.
>
> **Si Odoo rechaza el bloque por tamaño** (≈ 480 KB, por las fotos incluidas), subí esas fotos a la biblioteca de medios de Odoo y cambiá cada `incluida:…` por la dirección de la imagen. Después hay que borrar su línea en el bloque `copol-portal-imagenes`, al final del archivo. Si preferís, lo hago yo.

---

## 2. Distribución (de arriba hacia abajo)

```
┌──────────────────────────────────────────────────────────┐
│ Logo COPOL                                                │
│ [PORTAL DE EMPLEADOS]                                     │
│ Información empleados   ← título; "empleados" resaltado   │
│ Protocolos, bienestar, novedades… en un solo lugar.       │
├────────────────────────────┬─────────────────────────────┤
│ RR.HH.                     │ BIENESTAR                   │
│ Acoso laboral              │ ¿Cómo te sentís hoy?        │
│ texto del protocolo        │ texto de la encuesta        │
│ [ QR ]                     │ [ QR ]                      │
│ (Abrir el protocolo ↗)     │ (Responder ↗)               │
├────────────────────────────┴─────────────────────────────┤
│ Tu cooperativa                                            │
│ [ foto ][ foto ][ fo…  ]  ← carrusel que se desliza       │
│ pie de foto                                               │
│ 1 / 4                                          (‹) (›)    │
├──────────────────────────────────────────────────────────┤
│ PRÓXIMAMENTE                                              │
│ Ciudad del Plata                                          │
│ [ foto 16:9 ]                                             │
├──────────────────────────────────────────────────────────┤
│ Pinecoop Chuy                                             │
│ En obras para que puedas disfrutarlo.                     │
│ [ foto 4:3 ][ foto 4:3 ]   (con 1 foto: una sola, 16:9)   │
├──────────────────────────────────────────────────────────┤
│ FUNCIONARIOS                                              │
│ Tus recibos                                 ( Aquí ↗ )    │
├──────────────────────────────────────────────────────────┤
│        COPOL · Cooperativa Policial · Uso interno         │
└──────────────────────────────────────────────────────────┘
```

- **Celular:** las dos tarjetas de QR se apilan y los botones ocupan todo el ancho.
- **Desde 760 px de ancho:** las dos tarjetas de QR van lado a lado.
- **Ancho máximo del contenido:** 960 px, centrado.
- **Cada bloque es una tarjeta blanca** con esquinas redondeadas de 28 px, sobre el fondo amarillo claro.
- **Si falta un enlace,** su tarjeta muestra **"Disponible pronto."** en lugar del QR o del botón.
- **Si faltan fotos,** se muestra "Imágenes próximamente." o "Fotos próximamente.".

### Estilo (igual al sitio web)

| Elemento | Valor |
|---|---|
| Fondo de la página | `#FEFCE3` (amarillo claro del sitio) |
| Tarjetas | Blancas, borde muy suave, sombra leve, radio **28 px** |
| Títulos | Verde COPOL oscuro `#006633`, Figtree (tipografía del sitio) en peso extra-negrita |
| Antetítulos (RR.HH., BIENESTAR…) | Verde `#008D36`, mayúsculas |
| Resaltado del título | Amarillo COPOL `#F8EA39` |
| Botones | Forma de píldora, verde `#006633` con texto blanco; flechas del carrusel con borde verde |
| Avisos de "pendiente" | Fondo amarillo suave `#FBF4C2` |
| Códigos QR | Negro sobre blanco, dentro de un recuadro blanco (así los lee cualquier cámara) |

---

## 3. Qué falta

| # | Qué | Estado | Qué hay que hacer |
|---|---|---|---|
| 1 | **Enlace del QR "Acoso laboral"** (protocolo de RR.HH.) | **Falta.** El QR impreso lleva a un archivo de Google Drive que **ya no existe** (verificado el 15/10/2026). | Subir el protocolo, por ejemplo en PDF a Google Drive, compartido como **"Cualquier persona con el enlace"**. Pegar el enlace en `acosoLaboral`. |
| 2 | **Enlace del QR "¿Cómo te sentís hoy?"** | **Falta.** El QR impreso (`https://qrco.de/bgfywa`) está **desactivado** por el servicio que lo generó. | Pegar el enlace **directo** de la encuesta (por ejemplo, de Google Forms) en `comoTeSentis`. Conviene no usar acortadores de servicios de QR, que dejan de funcionar cuando vence la prueba gratuita. |
| 3 | **Foto de "Próximamente Ciudad del Plata"** | **Falta** (hoy dice "Imágenes próximamente."). | Cargar **1 foto** en `ciudadDelPlata` (formato en el punto 5). |
| 4 | **2.ª foto de "Pinecoop Chuy"** | Hay **1 de 2** (la del cartel "El rincón de mi viejo"). | Agregar la 2.ª foto en `pinecoopChuy`. Con dos fotos se muestran lado a lado. |
| 5 | Enlace de **"Tus recibos"** | **Listo:** `https://www.copol.com.uy/Copolrecibos/`. Es el mismo enlace de "Mis recibos" en Acceso web; responde y muestra "Mi Recibo" (verificado el 15/10/2026). | Nada, salvo que cambie la dirección. |
| 6 | Fotos de **"Tu cooperativa"** | **Listo, con 4 fotos** propias del sitio: Casa Central, Tienda, Pinecoop Salinas y salón de eventos. | Opcional: cambiarlas o agregar más (hasta 8). |

> **Carteles impresos:** los QR de los carteles actuales tienen el mismo problema que los puntos 1 y 2. Cuando estén los enlaces nuevos, conviene reimprimirlos. Se puede escanear el QR que muestra esta página para comprobar que lleva al lugar correcto antes de imprimir.

---

## 4. Configuración (lo único que se edita)

Está al principio del `<body>`, entre `CONFIGURACIÓN` y `FIN DE LA CONFIGURACIÓN`:

```js
window.COPOL_PORTAL = {
  enlaces: {
    acosoLaboral: '',                                        // ← PENDIENTE: enlace del protocolo
    comoTeSentis: '',                                        // ← PENDIENTE: enlace de la encuesta
    recibos: 'https://www.copol.com.uy/Copolrecibos/'
  },
  imagenes: {
    tuCooperativa: [
      { src: 'incluida:casa-central', texto: 'Fachada de la Casa Central de COPOL' },
      // …
    ],
    ciudadDelPlata: [],                                      // ← PENDIENTE: 1 foto
    pinecoopChuy: [
      { src: 'incluida:pinecoop-chuy', texto: 'Pinecoop Chuy en obras' }
      // ← PENDIENTE: 2.ª foto
    ]
  }
};
```

Reglas:

- **Enlaces:** la dirección completa, empezando con `https://`, entre comillas simples. Con `''` (vacío), la tarjeta muestra "Disponible pronto.".
- **Imágenes:** cada foto es `{ src: '…', texto: '…' }`, separadas por coma.
  - `src` es la dirección de la imagen (`https://…`) o `incluida:<nombre>` para las que ya vienen dentro del archivo: `casa-central`, `tienda-interior`, `pinecoop-salinas`, `fiestas-eventos`, `pinecoop-chuy`.
  - `texto` describe la foto. Lo leen los lectores de pantalla y en el carrusel aparece debajo de la foto.

Ejemplo, con las fotos ya subidas a Odoo:

```js
ciudadDelPlata: [
  { src: 'https://…/ciudad-del-plata-obra.jpg', texto: 'Obra del nuevo local de Ciudad del Plata' }
],
pinecoopChuy: [
  { src: 'incluida:pinecoop-chuy', texto: 'Pinecoop Chuy en obras' },
  { src: 'https://…/pinecoop-chuy-2.jpg', texto: 'Avance de las cabañas de Pinecoop Chuy' }
]
```

---

## 5. Formato de las imágenes

| Sección | Cantidad | Proporción | Tamaño recomendado | Cómo se muestra |
|---|---|---|---|---|
| Tu cooperativa (carrusel) | 1 a 8 | Horizontal **16:10** | **1600 × 1000 px** | Recortada para llenar el recuadro. Pie de foto debajo. |
| Próximamente Ciudad del Plata | 1 | Horizontal **16:9** | **1600 × 900 px** | Ocupa todo el ancho de la tarjeta. |
| Pinecoop Chuy | 1 o 2 | **4:3** cada una (con 1 sola: 16:9) | **1200 × 900 px** cada una | Con 2 fotos van lado a lado; en celular, una debajo de la otra. |

Para todas:

- **Formato:** JPG o WebP. PNG solo si es un gráfico.
- **Peso:** idealmente menos de **400 KB** por foto, para que la página cargue rápido en el celular.
- **Siempre horizontales.** Las fotos se recortan para llenar el recuadro, así que conviene dejar el motivo principal en el centro, lejos de los bordes.
- **Solo fotos reales y propias de COPOL:** sin imágenes generadas con IA ni de bancos de imágenes. No usar fotos con datos personales de socios o funcionarios.
- **Dónde subirlas:** a la biblioteca de medios de Odoo (Sitio web → editor → insertar imagen, o Configuración → Técnico → Adjuntos). Después se copia la dirección de la imagen en `src`.

---

## 6. Comprobado (15/10/2026)

- **Lectura de los QR:**
  - Los QR que genera el archivo se leen con el lector zxing con el texto exacto, en las 40 versiones del estándar, incluidos textos con acentos.
  - Un QR leído desde una captura de pantalla de la página devolvió el enlace correcto.
- **Carrusel:** avanza y retrocede con las flechas (contador "2 / 4"), se desliza con el dedo y también con las flechas del teclado.
- **Celular:** sin desplazamiento horizontal a 375 px de ancho.
- **Recibos:** el botón "Aquí" abre `https://www.copol.com.uy/Copolrecibos/` en otra pestaña.
- **Sin JavaScript:** se ve el aviso para activarlo.
