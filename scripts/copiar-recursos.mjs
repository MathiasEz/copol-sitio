// Copia al sitio público los archivos de terceros que usa el panel (se generan en cada build y no
// se guardan en el repositorio):
//   - Lector de códigos de barras ZXing (Apache-2.0) para el botón "Escanear código".
import fs from 'node:fs/promises';
import path from 'node:path';

const destino = path.resolve('public/panel-recursos');
await fs.mkdir(destino, { recursive: true });
await fs.copyFile(path.resolve('node_modules/@zxing/browser/umd/zxing-browser.min.js'), path.join(destino, 'zxing-browser.min.js'));
console.log('Recursos del panel copiados.');
