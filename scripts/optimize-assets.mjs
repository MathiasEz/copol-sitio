// Convierte los originales de assets-source/original/ en WebP optimizados (máx. 2000 px de ancho)
// dentro de src/assets/img/. Astro genera luego las variantes responsive en el build.
// Los SVG se copian a src/assets/brand/ sin modificar (el manual prohíbe alterar el logotipo).
// Uso: npm run assets:optimize
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SRC = path.resolve('assets-source/original');
const IMG_OUT = path.resolve('src/assets/img');
const BRAND_OUT = path.resolve('src/assets/brand');
const MAX_W = 2000;
// Originales con bordes blancos agregados al exportarlos (se recortan sin tocar la foto).
const RECORTAR_BORDES = new Set(['pinecoop-chuy']);

await fs.mkdir(IMG_OUT, { recursive: true });
await fs.mkdir(BRAND_OUT, { recursive: true });

const report = [];
for (const file of await fs.readdir(SRC)) {
  const input = path.join(SRC, file);
  const ext = path.extname(file).toLowerCase();
  const base = path.basename(file, ext);
  if (ext === '.svg') {
    await fs.copyFile(input, path.join(BRAND_OUT, file));
    report.push(`copiado  ${file}`);
    continue;
  }
  if (!['.png', '.jpg', '.jpeg'].includes(ext)) continue;
  const out = path.join(IMG_OUT, `${base}.webp`);
  const before = (await fs.stat(input)).size;
  let pipeline = sharp(input).rotate();
  if (RECORTAR_BORDES.has(base)) pipeline = sharp(await pipeline.trim({ threshold: 30 }).toBuffer());
  const info = await pipeline
    .resize({ width: MAX_W, withoutEnlargement: true })
    .webp({ quality: 80, effort: 6 })
    .toFile(out);
  report.push(`${file.padEnd(32)} ${String(Math.round(before / 1024)).padStart(5)} KB → ${String(Math.round(info.size / 1024)).padStart(4)} KB  (${info.width}×${info.height})`);
}
console.log(report.join('\n'));
