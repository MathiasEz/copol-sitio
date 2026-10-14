// Descarga los recursos oficiales aprobados del sitio actual (cooperativapolicial.com.uy)
// a assets-source/original/ y registra su procedencia en assets-source/manifest.json.
// Uso: npm run assets:fetch
// Excluye a propósito imágenes generadas con IA o con apariencia de banco de imágenes
// (IDs 1283, 1285, 1307, 1140, 1141, 1151) — ver docs/registro-de-activos.md.
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://cooperativapolicial.com.uy';
const OUT = path.resolve('assets-source/original');

/** id: ruta en el sitio · file: nombre local · page: dónde aparece · use: uso previsto */
const ASSETS = [
  { file: 'logo-copol.svg', src: '/web/image/website/1/logo', page: 'Encabezado (todas)', use: 'Logotipo principal' },
  { file: 'logo-copol-alt.png', src: '/web/image/1293-378582dd', page: '/acceso-web', use: 'Logotipo raster de respaldo' },
  { file: 'favicon.ico', src: '/web/image/website/1/favicon', page: 'Todas', use: 'Favicon actual (referencia)' },
  { file: 'banner-garantia-alquiler.png', src: '/web/image/1417-0352dd92', page: '/ (hero)', use: 'Banner convenio Porto Seguro — Garantía de alquiler' },
  { file: 'banner-motos-1.png', src: '/web/image/1416-a92ede73', page: '/ (hero) y /bazar', use: 'Banner motos 0 km' },
  { file: 'banner-motos-2.png', src: '/web/image/1415-b062a373', page: '/', use: 'Banner motos 0 km (Sapucai)' },
  { file: 'motos-bazar.jpeg', src: '/web/image/1295-81de326c', page: '/bazar', use: 'Destacado motos en Bazar' },
  { file: 'pinecoop-salinas.png', src: '/web/image/764-77fecb4a', page: '/ y /beneficios', use: 'Parque Vacacional Pinecoop (Salinas)' },
  { file: 'pinecoop-chuy.jpeg', src: '/web/image/1404-797758e3', page: '/beneficios/pinecoop', use: 'Pinecoop Chuy — Próximamente' },
  { file: 'tienda-interior.jpg', src: '/web/image/702-d64ae6b2', page: '/tienda', use: 'Interior de la tienda' },
  { file: 'casa-central.png', src: '/web/image/552-8b639a4b', page: '/nuestra-historia', use: 'Casa central' },
  { file: 'historia-captura.png', src: '/web/image/697-af928d8d', page: '/ (Nuestra historia)', use: 'Historia (captura de pantalla)' },
  { file: 'cantinas-policiales.png', src: '/web/image/673-10903171', page: '/nuestra-historia', use: 'Cantinas Policiales — orígenes (captura)' },
  { file: 'fiestas-eventos.png', src: '/web/image/693-4e993643', page: '/ (hero)', use: 'Fiestas y cumpleaños de 15 (captura)' },
  { file: 'psicologo.jpeg', src: '/web/image/1287-907161ae', page: '/beneficios', use: 'Tarjeta Psicólogo Copol' },
  { file: 'oferta-1-ancho.png', src: '/web/image/1480-7406cb5d', page: '/', use: 'Pieza "Oferta COPOL 1" (escritorio)' },
  { file: 'oferta-1-movil.png', src: '/web/image/1482-bea2aec2', page: '/', use: 'Pieza "Oferta COPOL 1" (móvil)' },
  { file: 'oferta-2-ancho.png', src: '/web/image/1481-7855c0cb', page: '/', use: 'Pieza "Oferta COPOL 2" (escritorio)' },
  { file: 'oferta-2-movil.png', src: '/web/image/1483-a5cb4f21', page: '/', use: 'Pieza "Oferta COPOL 2" (móvil)' },
  { file: 'banner-hacete-socio.png', src: '/web/image/1425-eb065b31', page: '/', use: 'Pieza "Hacete socio"' },
  { file: 'banner-servicios-sociales.png', src: '/web/image/1426-e823450c', page: '/', use: 'Pieza "Servicios sociales"' },
];

await fs.mkdir(OUT, { recursive: true });
const manifest = [];
for (const a of ASSETS) {
  const url = BASE + a.src;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`✗ ${a.file} — HTTP ${res.status}`);
    manifest.push({ ...a, url, status: res.status, ok: false });
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(path.join(OUT, a.file), buf);
  manifest.push({
    ...a,
    url,
    contentType: res.headers.get('content-type'),
    bytes: buf.length,
    downloadedAt: new Date().toISOString(),
    ok: true,
  });
  console.log(`✓ ${a.file} (${Math.round(buf.length / 1024)} KB)`);
}
await fs.writeFile(path.resolve('assets-source/manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`\n${manifest.filter((m) => m.ok).length}/${ASSETS.length} descargados.`);
