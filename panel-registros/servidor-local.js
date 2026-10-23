// Servidor para probar el panel en la computadora (npm run dev → http://localhost:4400), sin la CLI de Vercel.
// Sirve public/ y llama a las funciones de api/ igual que Vercel (GET/POST/DELETE con Request y Response).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = fileURLToPath(new URL('.', import.meta.url));
const PUERTO = Number(process.env.PUERTO) || 4400;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon' };

async function funcion(ruta) {
  if (!/^\/api\/[a-z0-9/-]+$/.test(ruta) || ruta.includes('/_')) return null;
  try {
    return await import(pathToFileURL(join(RAIZ, `${ruta}.js`)).href);
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw e;
  }
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      const modulo = await funcion(url.pathname);
      const manejador = modulo?.[req.method];
      if (!manejador) {
        res.writeHead(modulo ? 405 : 404).end();
        return;
      }
      const partes = [];
      for await (const p of req) partes.push(p);
      const cuerpo = Buffer.concat(partes);
      const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : cuerpo });
      const respuesta = await manejador(request);
      const cabeceras = Object.fromEntries(respuesta.headers);
      const cookies = respuesta.headers.getSetCookie();
      if (cookies.length) cabeceras['set-cookie'] = cookies;
      res.writeHead(respuesta.status, cabeceras).end(Buffer.from(await respuesta.arrayBuffer()));
      return;
    }
    const camino = normalize(join(RAIZ, 'public', url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname));
    if (!camino.startsWith(join(RAIZ, 'public'))) {
      res.writeHead(403).end();
      return;
    }
    const contenido = await readFile(camino).catch(() => null);
    if (!contenido) {
      res.writeHead(404).end('No encontrado');
      return;
    }
    res.writeHead(200, { 'content-type': TIPOS[extname(camino)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(contenido);
  } catch (e) {
    console.error(e);
    res.writeHead(500).end('Error');
  }
}).listen(PUERTO, () => console.log(`Panel de registros en http://localhost:${PUERTO}`));
