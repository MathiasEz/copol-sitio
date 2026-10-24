// Contraseñas, PIN, firmas de cookies y roles. Mismos criterios que el panel de stock (panel/src/seguridad.ts).
import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

// scrypt (N=2^15, r=8, p=1): resistente a fuerza bruta con GPU y disponible en Node sin dependencias.
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const LARGO = 64;

export async function hashClave(clave) {
  const sal = randomBytes(16);
  const dk = await scrypt(clave.normalize('NFKC'), sal, LARGO, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${sal.toString('base64')}$${dk.toString('base64')}`;
}

export async function verificarClave(clave, almacenado) {
  if (typeof clave !== 'string' || typeof almacenado !== 'string') return false;
  const [alg, n, r, p, sal, hash] = almacenado.split('$');
  if (alg !== 'scrypt' || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64');
  const dk = await scrypt(clave.normalize('NFKC'), Buffer.from(sal, 'base64'), esperado.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem });
  return timingSafeEqual(dk, esperado);
}

/** Hash de relleno para comparar en tiempo constante cuando el usuario no existe. */
let hashRelleno = null;
export const hashFicticio = () => (hashRelleno ??= hashClave(randomBytes(24).toString('base64')));

export const tokenAleatorio = (bytes = 18) => randomBytes(bytes).toString('base64url');
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** Comparación de textos en tiempo constante. */
export function iguales(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

/** Política de contraseñas para cuentas nuevas y cambios de clave. */
export function problemaClave(clave, usuario) {
  if (typeof clave !== 'string' || clave.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (clave.length > 200) return 'La contraseña es demasiado larga.';
  if (usuario && clave.toLowerCase().includes(usuario.toLowerCase())) return 'La contraseña no puede contener el nombre de usuario.';
  if (/^(.)\1+$/.test(clave) || /^(?:0123456789|1234567890|qwertyuiop|contraseña|password)/i.test(clave)) return 'La contraseña es demasiado fácil de adivinar.';
  const clases = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(clave)).length;
  if (clave.length < 14 && clases < 3) return 'Usá al menos 3 de estos tipos: minúsculas, mayúsculas, números y símbolos (o una frase de 14 caracteres o más).';
  return null;
}

export function problemaPin(pin) {
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) return 'El PIN tiene que tener exactamente 6 números.';
  if (/^(\d)\1{5}$/.test(pin) || '01234567890'.includes(pin) || '09876543210'.includes(pin)) return 'Ese PIN es demasiado fácil de adivinar: evitá números repetidos o seguidos.';
  return null;
}

// ── Firma de cookies (sesión, PIN, equipo recordado, verificación) con SESION_SECRETO ──

const LARGO_MINIMO_SECRETO = 32;
let secretoLocal = null;
/** Secreto de firma. En Vercel es obligatorio; en la computadora, si falta, se inventa uno por proceso. */
export function secreto() {
  const s = process.env.SESION_SECRETO ?? '';
  if (s.length >= LARGO_MINIMO_SECRETO) return s;
  if (process.env.VERCEL) return null;
  return (secretoLocal ??= randomBytes(32).toString('hex'));
}

const b64 = (b) => Buffer.from(b).toString('base64url');
const firma = (texto) => b64(createHmac('sha256', `registros\0${secreto()}`).update(texto).digest());

/** Texto firmado (datos.firma); `datos.exp` (ms) es obligatorio. */
export function sellar(datos) {
  const cuerpo = b64(JSON.stringify(datos));
  return `${cuerpo}.${firma(cuerpo)}`;
}

/** Datos de un texto firmado vigente, o null. `tipo` evita usar una cookie en lugar de otra. */
export function abrir(sellado, tipo) {
  if (!secreto() || typeof sellado !== 'string' || sellado.length > 4000) return null;
  const [cuerpo, f] = sellado.split('.');
  if (!cuerpo || !f) return null;
  const esperada = Buffer.from(firma(cuerpo));
  const recibida = Buffer.from(f);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
    return datos?.t === tipo && typeof datos.exp === 'number' && datos.exp > Date.now() ? datos : null;
  } catch {
    return null;
  }
}

/** HMAC de un código de verificación (se guarda en la cookie en lugar del código). */
export const hashCodigo = (nonce, codigo) => firma(`codigo\0${nonce}\0${codigo}`);

// ── Roles (la autorización se controla en el servidor) ──

export const ROLES = {
  administrador: {
    nombre: 'Administrador',
    descripcion: 'Todo: formularios, planilla, usuarios, PIN del panel, registro de accesos y conexión con Excel.',
    permisos: ['formulario', 'planilla', 'usuarios', 'accesos', 'configuracion'],
  },
  carga: {
    nombre: 'Carga de formularios',
    descripcion: 'Completa y guarda formularios (también con el asistente) y consulta o descarga la planilla.',
    permisos: ['formulario', 'planilla'],
  },
};
export const esRol = (r) => typeof r === 'string' && Object.hasOwn(ROLES, r);
export const puede = (rol, permiso) => Boolean(ROLES[rol]?.permisos.includes(permiso));
