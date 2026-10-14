// Genera favicon, apple-touch-icon e imagen Open Graph en public/ a partir de recursos oficiales:
// - Isotipo: recorte del Manual de marca COPOL 2026, pág. 8 (assets-source/manual/isotipo-manual.png)
// - Logotipo: src/assets/brand/logo-copol.svg (sin modificar; se ubica sobre fondo blanco)
// Uso: node scripts/generate-icons.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const PUB = path.resolve('public');
await fs.mkdir(PUB, { recursive: true });

const isotipo = path.resolve('assets-source/manual/isotipo-manual.png');
// Recorte circular del isotipo para que el fondo del manual no aparezca en el ícono.
const meta = await sharp(isotipo).metadata();
const lado = Math.min(meta.width, meta.height);
const mascara = Buffer.from(`<svg width="${lado}" height="${lado}"><circle cx="${lado / 2}" cy="${lado / 2}" r="${lado / 2 - 2}" fill="#fff"/></svg>`);
const circular = await sharp(isotipo)
  .extract({ left: Math.round((meta.width - lado) / 2), top: Math.round((meta.height - lado) / 2), width: lado, height: lado })
  .composite([{ input: mascara, blend: 'dest-in' }])
  .png()
  .toBuffer();

await sharp(circular).resize(64, 64).png().toFile(path.join(PUB, 'favicon.png'));
await sharp({ create: { width: 180, height: 180, channels: 4, background: '#ffffff' } })
  .composite([{ input: await sharp(circular).resize(156, 156).png().toBuffer(), left: 12, top: 12 }])
  .png()
  .toFile(path.join(PUB, 'apple-touch-icon.png'));

// Open Graph 1200×630: fondo Blanco verdozo, logotipo centrado, franja Verde oscuro con el lema.
const logo = await sharp(path.resolve('src/assets/brand/logo-copol.svg'), { density: 600 }).resize({ width: 620 }).png().toBuffer();
const logoMeta = await sharp(logo).metadata();
const franja = Buffer.from(
  `<svg width="1200" height="120"><rect width="1200" height="120" fill="#006633"/><text x="600" y="76" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="40" font-weight="700" fill="#ffffff">Por un verdadero cooperativismo</text></svg>`,
);
await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#eaf4ee' } })
  .composite([
    { input: logo, left: Math.round((1200 - logoMeta.width) / 2), top: Math.round((510 - logoMeta.height) / 2) },
    { input: franja, left: 0, top: 510 },
  ])
  .jpeg({ quality: 86 })
  .toFile(path.join(PUB, 'og-copol.jpg'));

console.log('Íconos e imagen OG generados en public/');
