// Genera las variantes web de las imágenes del catálogo importado (240 y 400 px, WebP) en
// public/catalogo/bazar/<id>-<ancho>.webp a partir de los originales de src/assets/catalogo/bazar/.
// Se ejecuta antes de `astro dev` y `astro build` (predev/prebuild) y solo procesa lo que falta o cambió.
// Son archivos estáticos: la página de Bazar se genera en cada visita (para leer el stock vigente)
// sin tener que optimizar imágenes en el servidor.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

sharp.cache(false);
const ORIGEN = path.resolve('src/assets/catalogo/bazar');
const DESTINO = path.resolve('public/catalogo/bazar');
const ANCHOS = [240, 400];

await fs.mkdir(DESTINO, { recursive: true });
const archivos = (await fs.readdir(ORIGEN)).filter((f) => f.endsWith('.webp'));
let generadas = 0;
const cola = [...archivos];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (cola.length) {
    const f = cola.shift();
    const src = path.join(ORIGEN, f);
    const mtime = (await fs.stat(src)).mtimeMs;
    for (const ancho of ANCHOS) {
      const dst = path.join(DESTINO, f.replace(/\.webp$/, `-${ancho}.webp`));
      const st = await fs.stat(dst).catch(() => null);
      if (st && st.mtimeMs >= mtime) continue;
      await sharp(src).resize({ width: ancho, height: ancho, fit: 'inside', withoutEnlargement: true }).webp({ quality: 76, effort: 5 }).toFile(dst);
      generadas++;
    }
  }
}));
// Variantes de productos que ya no existen.
const validos = new Set(archivos.flatMap((f) => ANCHOS.map((a) => f.replace(/\.webp$/, `-${a}.webp`))));
for (const f of await fs.readdir(DESTINO)) if (!validos.has(f)) await fs.rm(path.join(DESTINO, f));
console.log(`Variantes del catálogo: ${archivos.length} productos · ${generadas} imágenes generadas.`);
