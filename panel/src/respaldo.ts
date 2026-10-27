// Respaldos de la base del panel: exportación de las tablas y cifrado.
// - `npm run panel:respaldo` guarda una copia local (sin cifrar) con imágenes.
// - Cada día, un Cron de Vercel (src/pages/api/cron/respaldo.ts) guarda una copia CIFRADA en Vercel Blob
//   y conserva las últimas 30. Se cifra porque Vercel Blob sirve los archivos por URL pública y el respaldo
//   incluye los hash de contraseñas, correos y el registro de accesos.
// - `npm run panel:descifrar` convierte una copia cifrada en una carpeta para `npm run panel:restaurar`.
// Cifrado: AES-256-GCM (autenticado: un archivo alterado no se descifra), clave derivada con scrypt de
// RESPALDO_CLAVE (variable de entorno; nunca en el código).
import crypto from 'node:crypto';
import { todas, type Db } from './db.ts';

/** Tablas que viajan en el respaldo (sin sesiones, pases, códigos, propuestas ni conversaciones). */
// `dispositivos` no se respalda: son identificadores de celulares que se vuelven a registrar solos.
export const TABLAS_RESPALDO = ['rubros', 'categorias', 'productos', 'novedades', 'usuarios', 'auditoria', 'ajustes', 'notificaciones', 'registros'] as const;

export interface DatosRespaldo { exportado: string; tablas: Record<string, Record<string, unknown>[]> }

export async function exportarDatos(db: Db): Promise<DatosRespaldo> {
  const tablas: DatosRespaldo['tablas'] = {};
  for (const t of TABLAS_RESPALDO) tablas[t] = await todas(db, `SELECT * FROM ${t}`);
  return { exportado: new Date().toISOString(), tablas };
}

const MARCA = Buffer.from('COPOL-R1');
const derivar = (clave: string, sal: Buffer) => crypto.scryptSync(clave.normalize('NFKC'), sal, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

/** MARCA (8) | sal (16) | iv (12) | etiqueta (16) | datos cifrados. */
export function cifrar(texto: string, clave: string): Buffer {
  if (clave.length < 24) throw new Error('RESPALDO_CLAVE debe tener al menos 24 caracteres.');
  const sal = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', derivar(clave, sal), iv);
  const datos = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return Buffer.concat([MARCA, sal, iv, c.getAuthTag(), datos]);
}

export function descifrar(archivo: Buffer, clave: string): string {
  if (!archivo.subarray(0, MARCA.length).equals(MARCA)) throw new Error('El archivo no es un respaldo cifrado de COPOL.');
  let i = MARCA.length;
  const sal = archivo.subarray(i, (i += 16));
  const iv = archivo.subarray(i, (i += 12));
  const etiqueta = archivo.subarray(i, (i += 16));
  const d = crypto.createDecipheriv('aes-256-gcm', derivar(clave, sal), iv);
  d.setAuthTag(etiqueta);
  try {
    return Buffer.concat([d.update(archivo.subarray(i)), d.final()]).toString('utf8');
  } catch {
    throw new Error('No se pudo descifrar: la clave no coincide o el archivo está dañado.');
  }
}

/** Comparación en tiempo constante del secreto del Cron. */
export function secretoValido(recibido: string | null, esperado: string | undefined) {
  if (!esperado || !recibido) return false;
  const a = Buffer.from(recibido), b = Buffer.from(`Bearer ${esperado}`);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
