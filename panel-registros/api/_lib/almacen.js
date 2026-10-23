// Almacén chico: guarda la conexión con Microsoft (modo cuenta), los contadores de intentos de ingreso y de
// uso del asistente, y la planilla de prueba (mientras no se conecte Microsoft). Usa, en este orden:
// - Redis de Upstash (Vercel → Storage → Upstash for Redis), por su API REST, si está conectado;
// - Vercel Blob privado (Vercel → Storage → Blob, acceso «Private»): cada dato es un JSON que solo se lee con
//   el token del proyecto. Es lo que usa el proyecto copol-registros;
// - fuera de Vercel y sin ninguno de los dos, archivos en datos/ (para probar en la computadora).
// Sin almacén, el modo cuenta y la planilla de prueba no están disponibles y los contadores quedan apagados.
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PREFIJO = 'copol-registros:';

// ── Upstash ──
const urlRedis = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const tokenRedis = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const hayRedis = () => Boolean(urlRedis() && tokenRedis());

async function redis(...args) {
  const res = await fetch(urlRedis(), {
    method: 'POST',
    headers: { authorization: `Bearer ${tokenRedis()}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(5000),
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok || datos.error) throw new Error(`Upstash: ${datos.error ?? res.status}`);
  return datos.result;
}

// ── Vercel Blob privado (o archivos locales con la misma forma: get, put y del) ──
const hayBlobReal = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const hayArchivos = () => !process.env.VERCEL && !hayRedis() && !hayBlobReal();
let sdkBlob = null;
/** Solo para las pruebas: reemplaza @vercel/blob por un objeto con get, put y del. */
export const usarBlob = (falso) => { sdkBlob = falso; };
const ruta = (clave) => `registros/${clave.replace(/[^a-z0-9._-]/gi, '_')}.json`;

const etiqueta = (texto) => createHash('sha1').update(texto).digest('hex');
const carpeta = () => process.env.ALMACEN_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'datos');
class ErrorPrecondicion extends Error {
  name = 'BlobPreconditionFailedError';
}
const archivos = {
  async get(r) {
    const texto = await readFile(join(carpeta(), r), 'utf8').catch(() => null);
    return texto === null ? null : { statusCode: 200, stream: new Blob([texto]).stream(), blob: { etag: etiqueta(texto) } };
  },
  async put(r, cuerpo, o) {
    const camino = join(carpeta(), r);
    const actual = await readFile(camino, 'utf8').catch(() => null);
    if (o.ifMatch ? actual === null || etiqueta(actual) !== o.ifMatch : actual !== null && !o.allowOverwrite) throw new ErrorPrecondicion('precondition failed');
    await mkdir(dirname(camino), { recursive: true });
    await writeFile(camino, cuerpo);
  },
  async del(r) {
    await rm(join(carpeta(), r), { force: true });
  },
};
const blob = async () => sdkBlob ?? (hayBlobReal() ? (sdkBlob = await import('@vercel/blob')) : archivos);

const textoDe = async (r) => (r && r.statusCode === 200 ? new Response(r.stream).text() : null);

async function leerBlob(clave) {
  try {
    const { v, vence } = JSON.parse(await textoDe(await (await blob()).get(ruta(clave), { access: 'private', useCache: false })));
    return vence && vence < Date.now() ? null : v;
  } catch {
    return null;
  }
}

async function guardarBlob(clave, v, segundos) {
  const cuerpo = JSON.stringify({ v, vence: segundos ? Date.now() + segundos * 1000 : null });
  await (await blob()).put(ruta(clave), cuerpo, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60 });
}

// ── Interfaz común ──

export const almacenConfigurado = () => hayRedis() || hayBlobReal() || hayArchivos();

export async function leer(clave) {
  if (hayRedis()) return redis('GET', PREFIJO + clave);
  if (almacenConfigurado()) return leerBlob(clave);
  return null;
}

export async function guardar(clave, valor, segundos) {
  if (hayRedis()) {
    return segundos ? redis('SET', PREFIJO + clave, valor, 'EX', Math.max(1, Math.floor(segundos))) : redis('SET', PREFIJO + clave, valor);
  }
  if (almacenConfigurado()) return guardarBlob(clave, valor, segundos && Math.max(1, Math.floor(segundos)));
  throw new Error('Falta un almacén (Vercel Blob privado o Upstash for Redis) conectado al proyecto.');
}

export async function borrar(clave) {
  if (hayRedis()) await redis('DEL', PREFIJO + clave);
  else if (almacenConfigurado()) await (await blob()).del(ruta(clave)).catch(() => {});
}

// ── Listas (la planilla de prueba) ──

export class ErrorLista extends Error {}

/** Agrega un elemento al final de la lista y devuelve el total. `maximo` limita el largo. */
export async function agregarALista(clave, valor, maximo = Infinity) {
  if (hayRedis()) {
    if ((await redis('LLEN', `${PREFIJO}lista:${clave}`)) >= maximo) throw new ErrorLista(`La planilla de prueba llegó a ${maximo} filas.`);
    return redis('RPUSH', `${PREFIJO}lista:${clave}`, JSON.stringify(valor));
  }
  if (!almacenConfigurado()) throw new ErrorLista('Falta un almacén conectado al proyecto.');
  // Blob no tiene listas: un solo JSON que se reescribe solo si nadie lo cambió en el medio (ETag); si otra
  // computadora guardó al mismo tiempo, se vuelve a leer y se reintenta.
  const sdk = await blob();
  const r = ruta(`lista-${clave}`);
  for (let intento = 0; intento < 6; intento++) {
    const actual = await sdk.get(r, { access: 'private', useCache: false });
    const lista = actual?.statusCode === 200 ? JSON.parse(await textoDe(actual)) : [];
    if (lista.length >= maximo) throw new ErrorLista(`La planilla de prueba llegó a ${maximo} filas.`);
    lista.push(valor);
    try {
      await sdk.put(r, JSON.stringify(lista), {
        access: 'private', addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 60,
        ...(actual ? { ifMatch: actual.blob.etag } : {}),
      });
      return lista.length;
    } catch (e) {
      if (e.name !== 'BlobPreconditionFailedError' && !/precondition|already exists/i.test(e.message)) throw e;
      await new Promise((ok) => setTimeout(ok, 150 + Math.random() * 350));
    }
  }
  throw new ErrorLista('La planilla de prueba está ocupada. Probá guardar de nuevo.');
}

export async function leerLista(clave) {
  if (hayRedis()) return ((await redis('LRANGE', `${PREFIJO}lista:${clave}`, 0, -1)) ?? []).map((v) => JSON.parse(v));
  if (!almacenConfigurado()) return [];
  const texto = await textoDe(await (await blob()).get(ruta(`lista-${clave}`), { access: 'private', useCache: false }));
  return texto ? JSON.parse(texto) : [];
}

export async function vaciarLista(clave) {
  if (hayRedis()) await redis('DEL', `${PREFIJO}lista:${clave}`);
  else if (almacenConfigurado()) await (await blob()).del(ruta(`lista-${clave}`)).catch(() => {});
}

// ── Contadores ──

/** Clave corta y sin datos personales (por ejemplo para una IP). */
export const resumen = (texto) => createHash('sha256').update(texto).digest('base64url').slice(0, 16);

/** Valor actual del contador (0 si no existe, venció o no hay almacén). */
export async function contador(clave) {
  try {
    return Number(await leer(`n:${clave}`)) || 0;
  } catch (e) {
    console.error(e.message);
    return 0;
  }
}

/** Suma 1 al contador y devuelve el total; el contador se borra solo a los `segundos`. Sin almacén: 0. */
export async function contar(clave, segundos) {
  if (!almacenConfigurado()) return 0;
  try {
    if (hayRedis()) {
      const total = await redis('INCR', `${PREFIJO}n:${clave}`);
      if (total === 1) await redis('EXPIRE', `${PREFIJO}n:${clave}`, segundos);
      return total;
    }
    // En Blob no hay suma atómica: alcanza para un límite aproximado.
    const total = (await contador(clave)) + 1;
    await guardar(`n:${clave}`, total, segundos);
    return total;
  } catch (e) {
    console.error(e.message);
    return 0;
  }
}
