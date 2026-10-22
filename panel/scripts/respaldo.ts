// Respaldo del panel en panel/datos/respaldos/<fecha-hora>/ (o PANEL_RESPALDOS):
//   datos.json   todas las tablas (usuarios solo con el hash de contraseña; sin sesiones), con los
//                ajustes (banner de Inicio, ofertas, créditos, información para empleados y PIN)
//   imagenes/    copia de las imágenes subidas desde el panel (Vercel Blob o carpeta local)
// Funciona igual contra Turso (producción) o el archivo local. Turso además guarda historial propio
// (restauración a un punto en el tiempo desde su consola). Copiar la carpeta fuera del equipo.
//
//   npm run panel:respaldo
import fs from 'node:fs/promises';
import path from 'node:path';
import { BASE, cargarConfig } from '../src/config.ts';
import { conectar } from '../src/db.ts';
import { exportarDatos, TABLAS_RESPALDO as TABLAS } from '../src/respaldo.ts';
const config = cargarConfig();
const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const destino = path.join(config.dirRespaldos, sello);
await fs.mkdir(path.join(destino, 'imagenes'), { recursive: true });

const db = await conectar();
const respaldo = await exportarDatos(db);
const datos = respaldo.tablas;
await fs.writeFile(path.join(destino, 'datos.json'), JSON.stringify(respaldo, null, 1));

// Imágenes subidas desde el panel (las importadas ya están en el repositorio del sitio).
const urls = new Set<string>();
for (const f of [...(datos.productos as { imagen: string | null }[]), ...(datos.novedades as { imagen: string | null }[])]) {
  if (f.imagen && (/^https?:\/\//.test(f.imagen) || f.imagen.startsWith(`${BASE}/media/`))) for (const a of [400, 800, 1600]) urls.add(f.imagen.replace(/-\d+\.webp$/, `-${a}.webp`));
}
let copiadas = 0;
for (const url of urls) {
  const nombre = url.split('/').slice(-2).join('__');
  try {
    if (url.startsWith(`${BASE}/media/`)) {
      await fs.copyFile(path.join(config.dirImagenes, url.slice(`${BASE}/media/`.length)), path.join(destino, 'imagenes', nombre));
    } else {
      const r = await fetch(url);
      if (!r.ok) continue;
      await fs.writeFile(path.join(destino, 'imagenes', nombre), Buffer.from(await r.arrayBuffer()));
    }
    copiadas++;
  } catch { /* variante inexistente */ }
}
db.close();

const conservar = Number(process.env.PANEL_RESPALDOS_CONSERVAR ?? 30);
const previos = (await fs.readdir(config.dirRespaldos, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
for (const viejo of previos.slice(0, Math.max(0, previos.length - conservar))) await fs.rm(path.join(config.dirRespaldos, viejo), { recursive: true, force: true });
console.log(`Respaldo en ${destino}: ${TABLAS.map((t) => `${t} ${datos[t].length}`).join(' · ')} · ${copiadas} imágenes. Guardá una copia fuera de este equipo.`);
