// Servidor para probar el panel en la computadora (npm run dev → http://localhost:4400/panel/), sin la CLI de
// Vercel: igual que en Vercel, todos los pedidos van a api/index.js (salvo los archivos de public/).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as entrada from './api/index.js';

const RAIZ = fileURLToPath(new URL('.', import.meta.url));
const PUERTO = Number(process.env.PUERTO) || 4400;

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const estatico = normalize(join(RAIZ, 'public', url.pathname));
    if (estatico.startsWith(join(RAIZ, 'public')) && url.pathname !== '/') {
      const contenido = await readFile(estatico).catch(() => null);
      if (contenido) {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end(contenido);
        return;
      }
    }
    const manejador = entrada[req.method];
    if (!manejador) {
      res.writeHead(405).end();
      return;
    }
    const partes = [];
    for await (const p of req) partes.push(p);
    const request = new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(partes) });
    const respuesta = await manejador(request);
    const cabeceras = Object.fromEntries(respuesta.headers);
    const cookies = respuesta.headers.getSetCookie();
    if (cookies.length) cabeceras['set-cookie'] = cookies;
    res.writeHead(respuesta.status, cabeceras).end(Buffer.from(await respuesta.arrayBuffer()));
  } catch (e) {
    console.error(e);
    res.writeHead(500).end('Error');
  }
}).listen(PUERTO, () => console.log(`Panel de registros en http://localhost:${PUERTO}${process.env.PANEL_RUTA || '/panel'}/`));
