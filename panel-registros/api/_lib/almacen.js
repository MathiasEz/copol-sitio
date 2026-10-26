// Almacén del panel: usuarios, ajustes (PIN), conexión con Microsoft, contadores de intentos, registro de
// accesos y planilla de prueba. En Vercel es un Blob privado (Vercel → Storage → Blob, acceso «Private»):
// cada dato es un JSON que solo se lee con el token del proyecto. En la computadora (npm run dev, pruebas),
// archivos en datos/. Las escrituras que no se pueden pisar (usuarios, listas) son condicionales: solo se
// guardan si nadie cambió el documento en el medio (ETag); si no, se vuelve a leer y se reintenta.
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hayBlobReal = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const hayArchivos = () => !process.env.VERCEL && !hayBlobReal();
let sdkBlob = null;
/** Solo para las pruebas: reemplaza @vercel/blob por un objeto con get, put y del (null vuelve al real). */
export const usarBlob = (falso) => { sdkBlob = falso; };
const ruta = (clave) => `registros/${clave.replace(/[^a-z0-9._-]/gi, '_')}.json`;

// ── Archivos locales con la misma forma que @vercel/blob (get, put con ifMatch, del) ──
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
let sdkReal = null;
const blob = async () => sdkBlob ?? (hayBlobReal() ? (sdkReal ??= await import('@vercel/blob')) : archivos);

export const almacenConfigurado = () => hayBlobReal() || hayArchivos() || Boolean(sdkBlob);

export class ErrorAlmacen extends Error {
  name = 'ErrorAlmacen';
}
const exigir = () => {
  if (!almacenConfigurado()) throw new ErrorAlmacen('Falta conectar el almacén del panel (Vercel → Storage → Blob privado).');
};

const esPrecondicion = (e) => e?.name === 'BlobPreconditionFailedError' || /precondition|already exists/i.test(e?.message ?? '');
const pausa = () => new Promise((ok) => setTimeout(ok, 150 + Math.random() * 450));

async function leerCrudo(clave) {
  const r = await (await blob()).get(ruta(clave), { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return null;
  return { texto: await new Response(r.stream).text(), etag: r.blob.etag };
}

async function escribir(clave, texto, { etag, pisar = false } = {}) {
  await (await blob()).put(ruta(clave), texto, {
    access: 'private', addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 60,
    ...(etag ? { ifMatch: etag } : pisar ? { allowOverwrite: true } : {}),
  });
}

// ── Valores sueltos con vencimiento opcional (permiso de Microsoft, contadores) ──

export async function leer(clave) {
  if (!almacenConfigurado()) return null;
  try {
    const c = await leerCrudo(clave);
    if (!c) return null;
    const { v, vence } = JSON.parse(c.texto);
    return vence && vence < Date.now() ? null : v;
  } catch {
    return null;
  }
}

export async function guardar(clave, valor, segundos) {
  exigir();
  await escribir(clave, JSON.stringify({ v: valor, vence: segundos ? Date.now() + Math.max(1, Math.floor(segundos)) * 1000 : null }), { pisar: true });
}

export async function borrar(clave) {
  if (almacenConfigurado()) await (await blob()).del(ruta(clave)).catch(() => {});
}

// ── Documentos que se modifican sin pisarse (usuarios, ajustes) ──

/** Documento JSON (o `inicial` si no existe). */
export async function leerDoc(clave, inicial) {
  exigir();
  const c = await leerCrudo(`doc-${clave}`);
  return c ? JSON.parse(c.texto) : structuredClone(inicial);
}

/**
 * Lee el documento, aplica `cambiar(datos)` (que lo modifica o devuelve uno nuevo, y puede lanzar un error
 * para no guardar) y lo guarda solo si nadie lo cambió mientras tanto. Devuelve el documento guardado.
 */
export async function modificarDoc(clave, inicial, cambiar) {
  exigir();
  for (let intento = 0; intento < 10; intento++) {
    const c = await leerCrudo(`doc-${clave}`);
    const datos = c ? JSON.parse(c.texto) : structuredClone(inicial);
    const nuevo = (await cambiar(datos)) ?? datos;
    try {
      await escribir(`doc-${clave}`, JSON.stringify(nuevo), { etag: c?.etag });
      return nuevo;
    } catch (e) {
      if (!esPrecondicion(e)) throw e;
      await pausa();
    }
  }
  throw new ErrorAlmacen('El almacén está ocupado. Probá de nuevo en un momento.');
}

// ── Listas (planilla de prueba y registro de accesos) ──

export class ErrorLista extends Error {}

/**
 * Agrega un elemento al final de la lista y devuelve el total. Con `maximo` y `rotar`, al llegar al máximo se
 * descartan los más viejos; sin `rotar`, se rechaza el nuevo.
 */
export async function agregarALista(clave, valor, maximo = Infinity, { rotar = false } = {}) {
  exigir();
  for (let intento = 0; intento < 10; intento++) {
    const c = await leerCrudo(`lista-${clave}`);
    let lista = c ? JSON.parse(c.texto) : [];
    if (lista.length >= maximo && !rotar) throw new ErrorLista(`La planilla de prueba llegó a ${maximo} filas.`);
    lista.push(valor);
    if (lista.length > maximo) lista = lista.slice(-maximo);
    try {
      await escribir(`lista-${clave}`, JSON.stringify(lista), { etag: c?.etag });
      return lista.length;
    } catch (e) {
      if (!esPrecondicion(e)) throw e;
      await pausa();
    }
  }
  throw new ErrorLista('El almacén está ocupado. Probá guardar de nuevo.');
}

export async function leerLista(clave) {
  if (!almacenConfigurado()) return [];
  const c = await leerCrudo(`lista-${clave}`);
  return c ? JSON.parse(c.texto) : [];
}

export const vaciarLista = (clave) => borrar(`lista-${clave}`);

// ── Contadores (límites de intentos; aproximados: alcanza para frenar fuerza bruta) ──

/** Clave corta y sin datos personales (por ejemplo para una IP). */
export const resumen = (texto) => createHash('sha256').update(texto).digest('base64url').slice(0, 16);

/** Valor actual del contador (0 si no existe, venció o no hay almacén). */
export async function contador(clave) {
  return Number(await leer(`n-${clave}`)) || 0;
}

/** Suma 1 al contador y devuelve el total; el contador se borra solo a los `segundos`. Sin almacén: 0. */
export async function contar(clave, segundos) {
  if (!almacenConfigurado()) return 0;
  try {
    const total = (await contador(clave)) + 1;
    await guardar(`n-${clave}`, total, segundos);
    return total;
  } catch (e) {
    console.error('contador:', e.message);
    return 0;
  }
}

export const reiniciar = (clave) => borrar(`n-${clave}`);
