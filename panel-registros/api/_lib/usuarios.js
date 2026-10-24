// Usuarios del panel y ajustes (PIN), guardados como documentos en el almacén. Las contraseñas y el PIN
// solo existen como hash scrypt. `sv` (versión de sesión) cambia al cambiar la contraseña, desactivar la
// cuenta o «cerrar sus sesiones»: las cookies firmadas con la versión anterior dejan de valer.
import { leerDoc, modificarDoc } from './almacen.js';
import { esRol, hashClave, sha256, tokenAleatorio } from './seguridad.js';

const DOC = 'usuarios';
const VACIO = { lista: [] };
const CACHE_MS = 10_000;
let cache = null; // { hasta, lista }

export class ErrorUsuario extends Error {
  constructor(mensaje, campo = null, status = 400) {
    super(mensaje);
    this.campo = campo;
    this.status = status;
  }
}

export const limpiarUsuario = (v) => (typeof v === 'string' ? v.trim().toLowerCase().slice(0, 80) : '');
export const usuarioValido = (u) => /^[a-z0-9][a-z0-9._-]{2,39}$/.test(u) || /^[^\s@]{1,64}@[^\s@]+\.[a-z]{2,}$/.test(u);
export const limpiarCorreo = (v) => (typeof v === 'string' ? v.trim().toLowerCase().slice(0, 160) : '');
export const correoValido = (c) => /^[^\s@<>"]{1,64}@[^\s@<>"]+\.[a-z]{2,}$/i.test(c);
export const limpiarNombre = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) : '');

export async function listar({ fresco = false } = {}) {
  if (!fresco && cache && cache.hasta > Date.now()) return cache.lista;
  const { lista } = await leerDoc(DOC, VACIO);
  cache = { hasta: Date.now() + CACHE_MS, lista };
  return lista;
}
/** Olvida lo leído (para las pruebas, que cambian de almacén entre una y otra). */
export const olvidarCache = () => { cache = null; cacheAjustes = null; };

export async function buscar(usuario, opciones) {
  const u = limpiarUsuario(usuario);
  return (await listar(opciones)).find((x) => x.usuario === u) ?? null;
}

/** Sin hash ni datos internos, para mandar al navegador. */
export const publico = (u) => u && {
  usuario: u.usuario, nombre: u.nombre, rol: u.rol, correo: u.correo ?? null, activo: u.activo, protegido: Boolean(u.protegido),
  debeCambiar: Boolean(u.debeCambiar), creadoEn: u.creadoEn, creadoPor: u.creadoPor ?? null, ultimoAcceso: u.ultimoAcceso ?? null,
  bloqueado: Boolean(u.bloqueadoHasta && Date.parse(u.bloqueadoHasta) > Date.now()),
};

/** Cambia un usuario (o la lista) sin pisar cambios hechos al mismo tiempo desde otra computadora. */
export async function modificar(cambiar) {
  const r = await modificarDoc(DOC, VACIO, async (doc) => {
    await cambiar(doc.lista);
    return doc;
  });
  cache = { hasta: Date.now() + CACHE_MS, lista: r.lista };
  return r.lista;
}

export async function actualizar(usuario, cambios) {
  let actualizado = null;
  await modificar((lista) => {
    const u = lista.find((x) => x.usuario === usuario);
    if (!u) throw new ErrorUsuario('El usuario no existe.', null, 404);
    Object.assign(u, typeof cambios === 'function' ? cambios(u) ?? {} : cambios);
    actualizado = u;
  });
  return actualizado;
}

export async function crear({ usuario, nombre, rol, correo, clave, debeCambiar = true, protegido = false, creadoPor = null }) {
  const u = limpiarUsuario(usuario);
  if (!usuarioValido(u)) throw new ErrorUsuario('El usuario lleva de 3 a 40 letras minúsculas, números, puntos o guiones (o un correo).', 'usuario');
  if (!esRol(rol)) throw new ErrorUsuario('Elegí un rol.', 'rol');
  const c = limpiarCorreo(correo);
  if (c && !correoValido(c)) throw new ErrorUsuario('El correo no es válido.', 'correo');
  const hash = await hashClave(clave);
  let creado = null;
  await modificar((lista) => {
    if (lista.some((x) => x.usuario === u)) throw new ErrorUsuario('Ya existe un usuario con ese nombre.', 'usuario', 409);
    creado = {
      usuario: u, nombre: limpiarNombre(nombre) || u, rol, correo: c || (u.includes('@') ? u : null), hash,
      activo: true, protegido: Boolean(protegido), debeCambiar: Boolean(debeCambiar), intentos: 0, bloqueadoHasta: null,
      sv: tokenAleatorio(6), creadoEn: new Date().toISOString(), creadoPor, ultimoAcceso: null,
    };
    lista.push(creado);
  });
  return creado;
}

export async function eliminar(usuario) {
  await modificar((lista) => {
    const i = lista.findIndex((x) => x.usuario === usuario);
    if (i === -1) throw new ErrorUsuario('El usuario no existe.', null, 404);
    if (lista[i].protegido) throw new ErrorUsuario('Este administrador está protegido y no se puede eliminar.', null, 403);
    lista.splice(i, 1);
  });
}

export const nuevaVersionSesion = () => tokenAleatorio(6);
export const contarAdminsActivos = (lista) => lista.filter((u) => u.rol === 'administrador' && u.activo).length;

// ── Ajustes del panel: PIN de entrada ──

const AJUSTES = 'ajustes';
let cacheAjustes = null;

export async function ajustes() {
  if (cacheAjustes && cacheAjustes.hasta > Date.now()) return cacheAjustes.datos;
  const datos = await leerDoc(AJUSTES, {});
  cacheAjustes = { hasta: Date.now() + CACHE_MS, datos };
  return datos;
}

/** Guarda el PIN (solo su hash). `pv` cambia y anula los pases de PIN vigentes. */
export async function guardarPin(pin) {
  const pinHash = await hashClave(pin);
  const datos = await modificarDoc(AJUSTES, {}, (a) => ({ ...a, pinHash, pv: sha256(pinHash).slice(0, 12) }));
  cacheAjustes = { hasta: Date.now() + CACHE_MS, datos };
}
