// Restaura un respaldo creado con `npm run panel:respaldo` en la base configurada.
// Reemplaza el contenido de las tablas por el del respaldo (las sesiones abiertas se cierran).
// Las imágenes del respaldo quedan como copia: si se perdió el almacenamiento, volver a subirlas.
//
//   npm run panel:restaurar -- --desde panel/datos/respaldos/2026-10-13T20-00-00 --confirmar
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { registrar } from '../src/auditoria.ts';
import { conectar } from '../src/db.ts';

const { values } = parseArgs({ options: { desde: { type: 'string' }, confirmar: { type: 'boolean' } } });
if (!values.desde) {
  console.error('Indicá la carpeta: npm run panel:restaurar -- --desde <carpeta> --confirmar');
  process.exit(1);
}
const respaldo = JSON.parse(await fs.readFile(path.join(path.resolve(values.desde), 'datos.json'), 'utf8')) as { exportado: string; tablas: Record<string, Record<string, unknown>[]> };
const ORDEN = ['rubros', 'categorias', 'productos', 'novedades', 'usuarios', 'auditoria'];
for (const t of ORDEN) if (!Array.isArray(respaldo.tablas[t])) throw new Error(`El respaldo no tiene la tabla ${t}`);
console.log(`Respaldo del ${respaldo.exportado}: ${ORDEN.map((t) => `${t} ${respaldo.tablas[t].length}`).join(' · ')}`);
if (!values.confirmar) {
  console.log('Revisión sin cambios. Para restaurar de verdad, repetí el comando con --confirmar.');
  process.exit(0);
}
const db = await conectar();
// Los respaldos anteriores al correo de verificación no lo traen: se conserva el que ya tiene cada usuario.
const correos = (await db.execute('SELECT usuario, correo FROM usuarios WHERE correo IS NOT NULL')).rows.map((f) => [String(f.correo), String(f.usuario)]);
// Sesiones, propuestas, conversaciones del asistente y conexiones de Claude no viajan en el respaldo: se cierran (hay que reconectar).
const lote: { sql: string; args: (string | number | null)[] }[] = ['sesiones', 'pases', 'verificaciones', 'propuestas', 'conversaciones', 'oauth_tokens', 'oauth_codigos', 'oauth_pedidos']
  .map((t) => ({ sql: `DELETE FROM ${t}`, args: [] }));
for (const t of [...ORDEN].reverse()) lote.push({ sql: `DELETE FROM ${t}`, args: [] });
for (const t of ORDEN) {
  for (const fila of respaldo.tablas[t]) {
    const cols = Object.keys(fila);
    lote.push({ sql: `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, args: cols.map((c) => fila[c] as string | number | null) });
  }
}
for (const [correo, usuario] of correos) lote.push({ sql: 'UPDATE usuarios SET correo = ? WHERE usuario = ? AND correo IS NULL', args: [correo, usuario] });
// Un solo lote: si algo falla, no se aplica nada.
await db.batch(lote, 'write');
await registrar(db, { id: null, usuario: 'sistema', ip: null }, 'sistema.restauracion', 'respaldo', respaldo.exportado);
console.log('Restauración completa.');
db.close();
