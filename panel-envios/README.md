# Panel de envíos (prueba)

Herramienta aparte del sitio y del panel de stock: no comparte código, base de datos ni despliegue con ellos.
Es una página estática (HTML + CSS + JS, sin compilación) que se publica en Vercel como **proyecto propio**.

## Qué hace

- Recrea la pantalla de facturación de **envíos** (datos de la factura, datos para el envío, productos y los tres botones).
- Al escribir el domicilio busca la dirección y muestra abajo los resultados para elegir la correcta
  (ej.: «Aparicio Saravia 3441» → «Bv. Aparicio Saravia 3441, Montevideo, Uruguay»). Al elegirla completa
  domicilio, localidad (barrio) y departamento.
- Entiende el número de puerta escrito de varias formas («Cañas 229bis», «Cañas 229 bis apto 2», «Bv. Artigas N° 1500»).
  Además del texto completo busca la calle sola: si el mapa no tiene ese número (o es un «bis»), igual aparece la
  calle con el número escrito, marcada «N° aproximado». Lo que va después del número (apto, piso…) queda en el domicilio.
- Muestra la ubicación en un mapa con un pin que se puede arrastrar para corregirla.
- Genera un **QR que abre Google Maps**:
  - con el punto exacto (coordenadas) cuando el número de puerta está verificado o el pin se ajustó a mano;
  - con la dirección escrita cuando el mapa solo encontró la calle (Google la ubica por número de puerta).
  Siempre se puede cambiar el destino y probar el enlace antes de imprimir.
- Imprime un **ticket de 80 mm** para la impresora de facturas o una **etiqueta A4**.
  Todo lo impreso dice **«NO ES UNA FACTURA FISCAL — documento de prueba, ficticio»**.
- Trae un **socio de prueba** precargado (Socio 123456 · C.I. 78910) y el botón «Cargar socio de prueba».

No guarda nada: los botones de confirmar solo muestran el aviso y permiten imprimir.

## Servicios externos (gratuitos, sin clave)

| Uso | Servicio |
|---|---|
| Sugerencias mientras se escribe | [Photon](https://photon.komoot.io) (datos de OpenStreetMap) |
| Búsqueda completa (Enter, lupa o «Buscar más resultados») | Photon + [Nominatim](https://nominatim.org) (OpenStreetMap) |
| Mapa | Teselas de OpenStreetMap con [Leaflet](https://leafletjs.com) 1.9.4 (incluido en `vendor/`) |
| QR | [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4 (incluido en `vendor/`) |

## Imprimir en la impresora de facturas

Confirmar el envío → «Imprimir en impresora de facturas (ticket 80 mm)». En el diálogo del navegador elegir esa
impresora, márgenes «Ninguno» y escala 100 %. El ticket mide 72 mm de ancho (área útil de un rollo de 80 mm).

## Probar en la computadora

```bash
npx serve panel-envios
```

## Publicar

Proyecto de Vercel `copol-envios` (sin framework, sin build). Desde esta carpeta: `vercel deploy --prod`.

## Integrar en el sistema original

`integracion/envios-direccion.js` es **un solo archivo, sin dependencias** (la librería de QR va adentro) con
la búsqueda de la dirección, el enlace a Google Maps y el QR, sin la interfaz de este panel. Se agrega con un
`<script>` y se engancha a los campos existentes con `EnviosDireccion.conectar({...})`; las instrucciones y
todas las funciones están explicadas al principio del archivo. `integracion/ejemplo.html` es una página mínima
de prueba (también publicada en `/integracion/ejemplo.html`).
