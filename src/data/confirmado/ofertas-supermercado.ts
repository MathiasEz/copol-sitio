// Ofertas del supermercado: piezas oficiales "Ofertas Octubre" entregadas por la cooperativa (ofertas oct.zip,
// 13/10/2026). Imágenes en src/assets/ofertas/octubre-NN.webp; originales en assets-source/ofertas-octubre/.
// EXCEPCIÓN APROBADA (14/10/2026): estas piezas muestran precios y se publican tal cual, solo en esta sección.
// El texto de cada oferta es la transcripción de la pieza (producto y precio); no se agregan condiciones.
// Se omitió una pieza repetida (Crivea Sec sobres 175 g aparecía dos veces con distinto diseño).
// Retirar o reemplazar al terminar octubre de 2026.

export interface Oferta {
  imagen: string;
  producto: string;
  precio: string;
}

export const OFERTAS_SUPERMERCADO = {
  titulo: 'Ofertas de octubre',
  mes: 'octubre de 2026',
  ofertas: [
    { imagen: 'octubre-01', producto: 'Papel higiénico Regio 30 m, 24 rollos', precio: '189 pesos' },
    { imagen: 'octubre-02', producto: 'Crema dental Colgate Calcio 180 g', precio: '109 pesos' },
    { imagen: 'octubre-03', producto: 'Harina PAN mezcla de maíz amarilla precocida 1 kg', precio: '142 pesos' },
    { imagen: 'octubre-04', producto: 'Harina PAN granos enteros 1 kg', precio: '142 pesos' },
    { imagen: 'octubre-05', producto: 'Harina PAN mezcla de maíz blanco precocida 1 kg', precio: '142 pesos' },
    { imagen: 'octubre-06', producto: 'Durazno Aída lata 830 g', precio: '85 pesos' },
    { imagen: 'octubre-07', producto: 'Harina PAN mezcla de maíz dulce 500 g', precio: '138 pesos' },
    { imagen: 'octubre-08', producto: 'Primocão Original bolsa negra 7 kg', precio: '799 pesos' },
    { imagen: 'octubre-09', producto: 'Saché Primocão Júnior frango (pollo) 100 g, blíster de 12 unidades', precio: '3 por 99 pesos' },
    { imagen: 'octubre-10', producto: 'Saché Primocão carne 100 g, blíster de 12 unidades', precio: '3 por 99 pesos' },
    { imagen: 'octubre-11', producto: 'Saché Primogato filhote pollo 85 g, blíster de 12 unidades', precio: '3 por 99 pesos' },
    { imagen: 'octubre-12', producto: 'Saché Primocão carne y vegetales 100 g, blíster de 12 unidades', precio: '3 por 99 pesos' },
    { imagen: 'octubre-13', producto: 'Saché Primogato carne 85 g, blíster de 12 unidades', precio: '3 por 99 pesos' },
    { imagen: 'octubre-14', producto: 'Salsa de tomate condimentada Del Gaucho 710 g', precio: '149 pesos' },
    { imagen: 'octubre-15', producto: 'Saché Primogato frutos del mar 85 g, blíster de 12 unidades', precio: '3 por 99 pesos' },
    { imagen: 'octubre-16', producto: 'Crivea Sec involcable 236 g', precio: '213 pesos' },
    { imagen: 'octubre-17', producto: 'Crivea Sec sobres 175 g', precio: '170 pesos' },
    { imagen: 'octubre-18', producto: 'Crivea Sec percha lavanda 248 g', precio: '259 pesos' },
    { imagen: 'octubre-19', producto: 'Crivea Sec pote 175 g', precio: '152 pesos' },
    { imagen: 'octubre-20', producto: 'Jabón líquido para manos Vita Care, varios', precio: '179 pesos' },
    { imagen: 'octubre-21', producto: 'Crivea Sec repuesto pote 175 g', precio: '91 pesos' },
    { imagen: 'octubre-22', producto: 'Trapero con cabo Virutex', precio: '270 pesos' },
    { imagen: 'octubre-23', producto: 'Salsa de tomate condimentada Del Gaucho 510 g', precio: '99 pesos' },
    { imagen: 'octubre-24', producto: 'Mopa de chenille microfibra 40 × 12 cm', precio: '255 pesos' },
    { imagen: 'octubre-25', producto: 'Salsa ketchup Del Gaucho pack de 500 g', precio: '112 pesos' },
    { imagen: 'octubre-26', producto: 'Pulpa concentrada Pontevedra 1030 g', precio: '63 pesos' },
    { imagen: 'octubre-27', producto: 'Galletas Chocolinas', precio: '69 pesos' },
    { imagen: 'octubre-28', producto: 'Polvo para hornear Hornex 200 g + 40 g', precio: '69 pesos' },
    { imagen: 'octubre-29', producto: 'Mostaza Del Gaucho pack de 500 g', precio: '85 pesos' },
  ] satisfies Oferta[],
};
