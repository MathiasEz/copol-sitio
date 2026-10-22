// Convierte un respaldo diario cifrado (Vercel Blob, carpeta respaldos/) en una carpeta lista para
// `npm run panel:restaurar`. La clave se lee de RESPALDO_CLAVE (en .env o en la terminal; nunca en el código).
// Para obtenerla: `vercel env pull .env` (variables de Producción) o desde el panel de Vercel.
//
//   npm run panel:descifrar -- --archivo <ruta o URL del .copol> --salida panel/datos/respaldos/restaurar
//   npm run panel:restaurar -- --desde panel/datos/respaldos/restaurar --confirmar
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { descifrar } from '../src/respaldo.ts';

const { values } = parseArgs({ options: { archivo: { type: 'string' }, salida: { type: 'string' } } });
const clave = process.env.RESPALDO_CLAVE;
if (!values.archivo || !values.salida || !clave) {
  console.error('Uso: RESPALDO_CLAVE=… npm run panel:descifrar -- --archivo <ruta o URL> --salida <carpeta>');
  process.exit(1);
}
const bruto = /^https:\/\//.test(values.archivo)
  ? Buffer.from(await (await fetch(values.archivo)).arrayBuffer())
  : await fs.readFile(path.resolve(values.archivo));
const texto = descifrar(bruto, clave);
const datos = JSON.parse(texto) as { exportado: string; tablas: Record<string, unknown[]> };
await fs.mkdir(path.resolve(values.salida), { recursive: true });
await fs.writeFile(path.join(path.resolve(values.salida), 'datos.json'), texto);
console.log(`Respaldo del ${datos.exportado} descifrado en ${values.salida}: ${Object.entries(datos.tablas).map(([t, f]) => `${t} ${f.length}`).join(' · ')}`);
