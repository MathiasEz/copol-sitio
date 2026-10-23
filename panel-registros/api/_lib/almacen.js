// Almacén chico y opcional: Redis de Upstash (Vercel → Storage → Upstash for Redis) por su API REST, sin
// librerías. Guarda la conexión con Microsoft (modo cuenta) y los contadores de intentos de ingreso y de uso
// del asistente. Sin él, el modo cuenta no está disponible y los contadores quedan apagados.

const url = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const token = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
export const almacenConfigurado = () => Boolean(url() && token());

let pedir = (...a) => fetch(...a);
/** Solo para las pruebas. */
export const usarFetch = (f) => { pedir = f; };

async function comando(...args) {
  const res = await pedir(url(), {
    method: 'POST',
    headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(5000),
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok || datos.error) throw new Error(`Upstash: ${datos.error ?? res.status}`);
  return datos.result;
}

const PREFIJO = 'copol-registros:';

export async function leer(clave) {
  if (!almacenConfigurado()) return null;
  return comando('GET', PREFIJO + clave);
}

export async function guardar(clave, valor, segundos) {
  if (!almacenConfigurado()) throw new Error('Falta conectar Upstash for Redis al proyecto.');
  return segundos ? comando('SET', PREFIJO + clave, valor, 'EX', Math.max(1, Math.floor(segundos))) : comando('SET', PREFIJO + clave, valor);
}

export async function borrar(clave) {
  if (almacenConfigurado()) await comando('DEL', PREFIJO + clave);
}

/** Suma 1 al contador y devuelve el total; el contador se borra solo a los `segundos`. Sin almacén: 0. */
export async function contar(clave, segundos) {
  if (!almacenConfigurado()) return 0;
  try {
    const total = await comando('INCR', PREFIJO + clave);
    if (total === 1) await comando('EXPIRE', PREFIJO + clave, segundos);
    return total;
  } catch (e) {
    console.error(e.message);
    return 0;
  }
}
