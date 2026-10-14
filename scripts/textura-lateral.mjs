// Genera la textura decorativa de los márgenes laterales a partir de la trama de íconos del Manual de
// marca COPOL 2026 (assets-source/manual/trama-iconos.png): conserva solo los trazos (blancos en el
// original) como verde COPOL sobre fondo transparente. Se usa la trama completa como mosaico que
// cubre todo el espacio vacío a cada lado del contenido. La opacidad se aplica en CSS
// (src/styles/global.css § Textura lateral).
//   node scripts/textura-lateral.mjs
import sharp from 'sharp';

const ORIGEN = 'assets-source/manual/trama-iconos.png';
const DESTINO = 'public/textura-copol.webp';
const { data, info } = await sharp(ORIGEN)
  .resize({ width: 1040 }) // 2x para pantallas de alta densidad (se muestra a 520 px)
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true });
const rgba = Buffer.alloc(info.width * info.height * 4);
for (let i = 0; i < info.width * info.height; i++) {
  // Fondo verde ≈ gris 75; trazos ≈ 255. Se convierte la claridad en opacidad.
  const a = Math.max(0, Math.min(255, Math.round(((data[i] - 90) / (240 - 90)) * 255)));
  rgba.set([0, 102, 51, a], i * 4);
}
const out = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } }).webp({ quality: 80, alphaQuality: 70 }).toFile(DESTINO);
console.log(`${DESTINO}: ${out.width}×${out.height}, ${Math.round(out.size / 1024)} KB`);
