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
// Cada persona puede tener VARIOS roles (p. ej. Editor de stock + Carga de registros): sus permisos son la unión.
export type Rol = 'administrador' | 'editor' | 'visualizador' | 'registros';
export type Permiso = 'ver' | 'stock' | 'productos' | 'novedades' | 'usuarios' | 'auditoria' | 'asistente' | 'registros' | 'empleados';

/** Sección del panel a la que pertenece un rol (para agruparlos al elegirlos). */
export type GrupoRol = 'stock' | 'registros' | 'administracion';

export const ROLES: Record<Rol, { nombre: string; descripcion: string; permisos: Permiso[]; grupo: GrupoRol }> = {
  administrador: {
    nombre: 'Administrador',
    descripcion: 'Acceso total: Stock Bazar, Registros y Administración (página, usuarios, estadísticas, accesos y registro de cambios).',
    permisos: ['ver', 'stock', 'productos', 'novedades', 'usuarios', 'auditoria', 'asistente', 'registros', 'empleados'],
    grupo: 'administracion',
  },
  editor: {
    nombre: 'Editor de stock',
    descripcion: 'Stock Bazar: consulta el inventario, cambia el stock, agrega o edita productos e imágenes y usa el asistente.',
    permisos: ['ver', 'stock', 'productos', 'asistente', 'empleados'],
    grupo: 'stock',
  },
  visualizador: {
    nombre: 'Visualizador de stock',
    descripcion: 'Stock Bazar: solo consulta el inventario (también con el asistente). No puede modificar nada.',
    permisos: ['ver', 'asistente', 'empleados'],
    grupo: 'stock',
  },
  registros: {
    nombre: 'Carga de registros',
    descripcion: 'Registros: carga el formulario (con el asistente de IA) y ve o descarga la planilla de registros. No accede al stock. Todos los roles ven Información empleados.',
    permisos: ['registros', 'empleados'],
    grupo: 'registros',
  },
};
export const GRUPOS_ROL: Record<GrupoRol, string> = { stock: 'Stock Bazar', registros: 'Registros', administracion: 'Administración' };
export const esRol = (r: unknown): r is Rol => typeof r === 'string' && Object.hasOwn(ROLES, r);

/** Quien tiene roles: una persona o la lista de sus roles. */
export type ConRoles = { roles: readonly Rol[] } | readonly Rol[];
const rolesDe = (x: ConRoles): readonly Rol[] => (Array.isArray(x) ? x : (x as { roles: readonly Rol[] }).roles);
export const puede = (x: ConRoles, permiso: Permiso) => rolesDe(x).some((rol) => ROLES[rol]?.permisos.includes(permiso));
export const esAdministrador = (x: ConRoles) => rolesDe(x).includes('administrador');
/** Nombres de los roles de una persona, para mostrar. */
export const nombresRoles = (x: ConRoles) => rolesDe(x).map((rol) => ROLES[rol]?.nombre ?? rol).join(' · ');

/** Lee la lista guardada en la base ("editor,registros"): solo roles conocidos, sin repetir, en el orden de ROLES. */
export function leerRoles(guardado: unknown, respaldo?: unknown): Rol[] {
  const lista = String(guardado ?? respaldo ?? '').split(',').map((x) => x.trim());
  return (Object.keys(ROLES) as Rol[]).filter((rol) => lista.includes(rol));
}
/** Valor para la columna `roles`. */
export const guardarRoles = (roles: readonly Rol[]) => (Object.keys(ROLES) as Rol[]).filter((rol) => roles.includes(rol)).join(',');
/** Valor de la columna heredada `rol` (solo admite los tres roles de stock): el más fuerte que tenga. */
export const rolHeredado = (roles: readonly Rol[]): 'administrador' | 'editor' | 'visualizador' =>
  roles.includes('administrador') ? 'administrador' : roles.includes('editor') ? 'editor' : 'visualizador';

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
