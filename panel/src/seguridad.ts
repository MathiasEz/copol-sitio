// Contraseñas, tokens, roles y límites de intentos.
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt) as (clave: crypto.BinaryLike, sal: crypto.BinaryLike, largo: number, opciones: crypto.ScryptOptions) => Promise<Buffer>;

// scrypt (N=2^15, r=8, p=1): resistente a fuerza bruta con GPU y disponible en Node sin dependencias.
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const LARGO = 64;

export async function hashClave(clave: string): Promise<string> {
  const sal = crypto.randomBytes(16);
  const dk = await scrypt(clave.normalize('NFKC'), sal, LARGO, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${sal.toString('base64')}$${dk.toString('base64')}`;
}

export async function verificarClave(clave: string, almacenado: string): Promise<boolean> {
  const [alg, n, r, p, sal, hash] = almacenado.split('$');
  if (alg !== 'scrypt' || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64');
  const dk = await scrypt(clave.normalize('NFKC'), Buffer.from(sal, 'base64'), esperado.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem });
  return crypto.timingSafeEqual(dk, esperado);
}

/** Hash de relleno para comparar en tiempo constante cuando el usuario no existe. */
let hashRelleno: Promise<string> | null = null;
export const hashFicticio = () => (hashRelleno ??= hashClave(crypto.randomBytes(24).toString('base64')));

export const tokenAleatorio = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/** Política de contraseñas para cuentas nuevas y cambios de clave. */
export function problemaClave(clave: string, usuario: string): string | null {
  if (clave.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (clave.length > 200) return 'La contraseña es demasiado larga.';
  if (clave.toLowerCase().includes(usuario.toLowerCase())) return 'La contraseña no puede contener el nombre de usuario.';
  if (/^(.)\1+$/.test(clave) || /^(?:0123456789|1234567890|qwertyuiop|contraseña|password)/i.test(clave)) return 'La contraseña es demasiado fácil de adivinar.';
  const clases = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(clave)).length;
  if (clave.length < 14 && clases < 3) return 'Usá al menos 3 de estos tipos: minúsculas, mayúsculas, números y símbolos (o una frase de 14 caracteres o más).';
  return null;
}

// ── Roles y permisos (autorización del lado del servidor) ──
export type Rol = 'administrador' | 'editor' | 'visualizador';
export type Permiso = 'ver' | 'stock' | 'productos' | 'novedades' | 'usuarios' | 'auditoria';

export const ROLES: Record<Rol, { nombre: string; descripcion: string; permisos: Permiso[] }> = {
  administrador: {
    nombre: 'Administrador',
    descripcion: 'Acceso total: stock, productos, novedades, usuarios y registro de cambios.',
    permisos: ['ver', 'stock', 'productos', 'novedades', 'usuarios', 'auditoria'],
  },
  editor: {
    nombre: 'Editor de stock',
    descripcion: 'Consulta el inventario, cambia el stock y agrega o edita productos e imágenes.',
    permisos: ['ver', 'stock', 'productos'],
  },
  visualizador: {
    nombre: 'Visualizador de stock',
    descripcion: 'Solo consulta el inventario. No puede modificar nada.',
    permisos: ['ver'],
  },
};
export const esRol = (r: unknown): r is Rol => typeof r === 'string' && r in ROLES;
export const puede = (rol: Rol, permiso: Permiso) => ROLES[rol].permisos.includes(permiso);

// ── Límite de intentos en memoria (por IP). El bloqueo por usuario se guarda en la base. ──
export class Limitador {
  private intentos = new Map<string, number[]>();
  private maximo: number;
  private ventanaMs: number;
  constructor(maximo: number, ventanaMs: number) {
    this.maximo = maximo;
    this.ventanaMs = ventanaMs;
  }
  excedido(clave: string): boolean {
    const t = Date.now();
    const lista = (this.intentos.get(clave) ?? []).filter((x) => t - x < this.ventanaMs);
    this.intentos.set(clave, lista);
    return lista.length >= this.maximo;
  }
  registrar(clave: string) {
    const lista = this.intentos.get(clave) ?? [];
    lista.push(Date.now());
    this.intentos.set(clave, lista);
    if (this.intentos.size > 10_000) this.intentos.clear(); // evita crecimiento ilimitado
  }
  limpiar(clave: string) {
    this.intentos.delete(clave);
  }
}
