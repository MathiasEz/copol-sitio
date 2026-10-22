// Copia al sitio público los archivos que usa el panel (se generan en cada build y no se guardan en el
// repositorio):
//   - Lector de códigos de barras ZXing (Apache-2.0) para el botón "Escanear código".
//   - Estilos y comportamiento del banner de Inicio, para la vista previa de "Administración Página"
//     (la web los toma de src/; el panel, con su política de seguridad, solo carga archivos propios).
import fs from 'node:fs/promises';
import path from 'node:path';

const destino = path.resolve('public/panel-recursos');
await fs.mkdir(destino, { recursive: true });
await fs.copyFile(path.resolve('node_modules/@zxing/browser/umd/zxing-browser.min.js'), path.join(destino, 'zxing-browser.min.js'));
await fs.copyFile(path.resolve('src/styles/banner-inicio.css'), path.join(destino, 'banner-inicio.css'));
await fs.copyFile(path.resolve('src/scripts/banner-inicio.js'), path.join(destino, 'banner-inicio.js'));
console.log('Recursos del panel copiados.');
