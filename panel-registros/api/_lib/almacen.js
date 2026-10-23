// Almacén chico: guarda la conexión con Microsoft (modo cuenta) y los contadores de intentos de ingreso y de
// uso del asistente. Usa, en este orden:
// - Redis de Upstash (Vercel → Storage → Upstash for Redis), por su API REST, si está conectado;
// - Vercel Blob privado (Vercel → Storage → Blob, acceso «Private»): cada dato es un JSON que solo se lee con
//   el token del proyecto. Es lo que usa el proyecto copol-registros.
// Sin ninguno, el modo cuenta no está disponible y los contadores quedan apagados.
import { createHash } from 'node:crypto';

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

// ── Vercel Blob privado ──
const hayBlob = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
let sdkBlob = null;
/** Solo para las pruebas: reemplaza @vercel/blob por un objeto con get, put y del. */
export const usarBlob = (falso) => { sdkBlob = falso; };
const blob = async () => (sdkBlob ??= await import('@vercel/blob'));
const ruta = (clave) => `registros/${clave.replace(/[^a-z0-9._-]/gi, '_')}.json`;

async function leerBlob(clave) {
  const r = await (await blob()).get(ruta(clave), { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return null;
  try {
    const { v, vence } = JSON.parse(await new Response(r.stream).text());
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

export const almacenConfigurado = () => hayRedis() || hayBlob();

export async function leer(clave) {
  if (hayRedis()) return redis('GET', PREFIJO + clave);
  if (hayBlob()) return leerBlob(clave);
  return null;
}

export async function guardar(clave, valor, segundos) {
  if (hayRedis()) {
    return segundos ? redis('SET', PREFIJO + clave, valor, 'EX', Math.max(1, Math.floor(segundos))) : redis('SET', PREFIJO + clave, valor);
  }
  if (hayBlob()) return guardarBlob(clave, valor, segundos && Math.max(1, Math.floor(segundos)));
  throw new Error('Falta un almacén (Vercel Blob privado o Upstash for Redis) conectado al proyecto.');
}

export async function borrar(clave) {
  if (hayRedis()) await redis('DEL', PREFIJO + clave);
  else if (hayBlob()) await (await blob()).del(ruta(clave)).catch(() => {});
}

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
