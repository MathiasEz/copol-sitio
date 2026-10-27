// Validación de datos recibidos en formularios. Todo dato del navegador se trata como no confiable.
import type { DatosProducto } from './productos.ts';
import { esEstado } from './productos.ts';
import { esPlantilla, PLANTILLAS, type DatosNovedad } from './novedades.ts';
import { esDiseno, esFoco, type Boton, type Diapositiva } from './banner.ts';
import { ROLES, type Rol } from './seguridad.ts';
import { BASE } from './config.ts';
import { fechaValida } from './fechas.ts';

const PRECIO = /(\$|U\$S|USD|UYU)\s?\d|precio\s*[:$]|\d+[.,]\d{3}\s*(pesos|\$)/i;
export type Campos = Record<string, string | File | (string | File)[]>;

export const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max + 1) : '');

export function leerCantidad(v: unknown): { valor: number | null; error?: string } {
  const t = texto(v, 10);
  if (t === '') return { valor: null };
  if (!/^\d{1,6}$/.test(t)) return { valor: null, error: 'La cantidad debe ser un número entero de 0 en adelante.' };
  const n = Number(t);
  if (n > 100_000) return { valor: null, error: 'La cantidad es demasiado grande.' };
  return { valor: n };
}

export async function validarProducto(b: Campos, categoriaValida: (id: string) => Promise<boolean>) {
  const errores: Record<string, string> = {};
  const codigo = texto(b.codigo, 20).replace(/\s+/g, '');
  const nombre = texto(b.nombre, 160).replace(/\s+/g, ' ');
  const marca = texto(b.marca, 60).replace(/\s+/g, ' ');
  const descripcion = texto(b.descripcion, 4000);
  const categoria = texto(b.categoria, 80);
  const estado = texto(b.estado, 20);
  const cant = leerCantidad(b.cantidad);

  if (codigo && !/^[A-Za-z0-9-]{1,20}$/.test(codigo)) errores.codigo = 'El código interno COPOL admite letras, números o guiones (máx. 20).';
  if (nombre.length < 3) errores.nombre = 'Escribí el nombre del producto (mínimo 3 caracteres).';
  if (nombre.length > 160) errores.nombre = 'El nombre es demasiado largo (máx. 160).';
  if (descripcion.length > 4000) errores.descripcion = 'La descripción es demasiado larga (máx. 4000).';
  if (PRECIO.test(`${nombre} ${descripcion}`)) errores.descripcion = 'El catálogo no publica precios: quitá el precio del texto.';
  if (!categoria || !(await categoriaValida(categoria))) errores.categoria = 'Elegí una de las categorías existentes.';
  if (cant.error) errores.cantidad = cant.error;
  if (cant.valor == null && !esEstado(estado)) errores.estado = 'Indicá si hay stock o no (o cargá una cantidad).';

  const datos: DatosProducto = {
    codigo: codigo || null,
    nombre,
    marca: marca || null,
    descripcion: descripcion || null,
    categoria_id: categoria,
    stock_estado: esEstado(estado) ? estado : 'sin-dato',
    stock_cantidad: cant.valor,
  };
  return { datos, errores };
}

const CORREO = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;
const USUARIO = /^[a-z0-9._-]{3,40}$/;
/** Usuario o correo electrónico (en minúsculas). */
export const correoValido = (correo: string) => CORREO.test(correo) && correo.length <= 160;

/** `correoObligatorio`: con la verificación por correo activa, toda cuenta necesita un correo (si el usuario ya es un correo, se usa ese). */
/** Roles marcados en un formulario (casillas con el mismo nombre): solo los conocidos. */
export function leerRolesForm(v: unknown): Rol[] {
  const lista = (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string');
  return (Object.keys(ROLES) as Rol[]).filter((rol) => lista.includes(rol));
}

export function validarUsuarioNuevo(b: Campos, correoObligatorio = false) {
  const errores: Record<string, string> = {};
  const usuario = texto(b.usuario, 120).toLowerCase();
  const roles = leerRolesForm(b.roles);
  const correo = texto(b.correo, 160).toLowerCase() || (CORREO.test(usuario) ? usuario : null);
  if (!USUARIO.test(usuario) && !CORREO.test(usuario)) errores.usuario = 'Usuario de 3 a 40 caracteres (letras, números, . _ -) o un correo válido.';
  if (!roles.length) errores.roles = 'Elegí al menos un rol.';
  if (correo ? !correoValido(correo) : correoObligatorio) errores.correo = 'Escribí un correo válido: ahí le llega el código para ingresar.';
  return { usuario, roles, correo, errores };
}

/** Enlaces permitidos en novedades: rutas del sitio, https:// o WhatsApp. */
export function enlaceValido(url: string) {
  if (/^\/(?!\/)[\w\-./?=&%#]*$/.test(url)) return true;
  try {
    const u = new URL(url);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validarNovedad(b: Campos, tieneImagen: boolean) {
  const errores: Record<string, string> = {};
  const plantilla = texto(b.plantilla, 30);
  const d: DatosNovedad = {
    titulo: texto(b.titulo, 120).replace(/\s+/g, ' '),
    texto: texto(b.texto, 600) || null,
    imagen_alt: texto(b.imagen_alt, 160) || null,
    plantilla: esPlantilla(plantilla) ? plantilla : 'imagen-izquierda',
    enlace_texto: texto(b.enlace_texto, 40) || null,
    enlace_url: texto(b.enlace_url, 500) || null,
    publicado: b.publicado === '1',
    desde: fechaValida(b.desde) || null,
    hasta: fechaValida(b.hasta) || null,
  };
  if (texto(b.desde, 10) && !d.desde) errores.desde = 'Fecha inválida.';
  if (texto(b.hasta, 10) && !d.hasta) errores.hasta = 'Fecha inválida.';
  if (d.desde && d.hasta && d.hasta < d.desde) errores.hasta = 'La fecha de fin es anterior a la de inicio.';
  if (d.titulo.length < 3) errores.titulo = 'Escribí un título (mínimo 3 caracteres).';
  if (d.titulo.length > 120) errores.titulo = 'El título es demasiado largo (máx. 120).';
  if ((d.texto?.length ?? 0) > 600) errores.texto = 'El texto es demasiado largo (máx. 600).';
  if (!esPlantilla(plantilla)) errores.plantilla = 'Elegí una plantilla.';
  if (PLANTILLAS[d.plantilla].requiereImagen && !tieneImagen) errores.imagen = 'Esta plantilla necesita una imagen.';
  if (d.enlace_url && !enlaceValido(d.enlace_url)) errores.enlace_url = 'Usá una dirección https:// o una ruta del sitio (por ejemplo /hipermercado/bazar/).';
  if (d.enlace_url && !d.enlace_texto) errores.enlace_texto = 'Escribí el texto del botón.';
  if (d.enlace_texto && !d.enlace_url) errores.enlace_url = 'Falta la dirección del botón.';
  return { datos: d, errores };
}

export type DatosDiapositiva = Omit<Diapositiva, 'id' | 'imagen' | 'imagenMovil' | 'actualizado_en' | 'actualizado_por'>;

/** Diapositiva del banner de Inicio (Administración Página). */
export function validarDiapositiva(b: Campos, tieneImagen: boolean) {
  const errores: Record<string, string> = {};
  const linea = (v: unknown, max: number) => texto(v, max).replace(/\s+/g, ' ');
  const diseno = texto(b.diseno, 20);
  const foco = texto(b.foco, 20);
  const botonDe = (n: 1 | 2): Boton | null => {
    const t = linea(b[`boton${n}_texto`], 30);
    const url = texto(b[`boton${n}_url`], 500);
    if (t.length > 30) errores[`boton${n}_texto`] = 'El texto del botón es demasiado largo (máx. 30).';
    if (url && !enlaceValido(url)) errores[`boton${n}_url`] = 'Usá una dirección https:// o una ruta del sitio (por ejemplo /hipermercado/bazar/).';
    if (url && !t) errores[`boton${n}_texto`] = 'Escribí el texto del botón.';
    if (t && !url) errores[`boton${n}_url`] = 'Falta la dirección del botón.';
    return t && url ? { texto: t, url } : null;
  };
  const d: DatosDiapositiva = {
    antetitulo: linea(b.antetitulo, 50),
    titulo: linea(b.titulo, 90),
    resaltado: linea(b.resaltado, 40),
    texto: linea(b.texto, 220),
    etiqueta: linea(b.etiqueta, 40),
    alt: linea(b.alt, 250),
    diseno: esDiseno(diseno) ? diseno : 'lateral',
    completa: b.completa === '1',
    foco: esFoco(foco) ? foco : 'centro',
    boton1: botonDe(1),
    boton2: botonDe(2),
    publicado: b.publicado === '1',
    desde: fechaValida(b.desde),
    hasta: fechaValida(b.hasta),
  };
  if (d.titulo.length < 3) errores.titulo = 'Escribí un título (mínimo 3 caracteres).';
  if (d.titulo.length > 90) errores.titulo = 'El título es demasiado largo (máx. 90).';
  if (d.antetitulo.length > 50) errores.antetitulo = 'El antetítulo es demasiado largo (máx. 50).';
  if (d.resaltado.length > 40) errores.resaltado = 'La parte resaltada es demasiado larga (máx. 40).';
  if (d.texto.length > 220) errores.texto = 'El texto es demasiado largo (máx. 220): en el banner se lee de un vistazo.';
  if (d.etiqueta.length > 40) errores.etiqueta = 'La etiqueta es demasiado larga (máx. 40).';
  if (d.alt.length > 250) errores.alt = 'La descripción es demasiado larga (máx. 250).';
  if (PRECIO.test(`${d.antetitulo} ${d.titulo} ${d.resaltado} ${d.texto} ${d.etiqueta}`)) errores.texto = 'La web no publica precios: quitá el precio del texto.';
  if (!esDiseno(diseno)) errores.diseno = 'Elegí dónde va el texto.';
  if (!tieneImagen) errores.imagen = 'Subí la imagen del banner.';
  if (d.diseno === 'solo-imagen' && d.alt.length < 10) errores.alt = 'Con "Solo imagen" la descripción es obligatoria: escribí lo que dice la pieza (la leen los lectores de pantalla y Google).';
  if (texto(b.desde, 10) && !d.desde) errores.desde = 'Fecha inválida.';
  if (texto(b.hasta, 10) && !d.hasta) errores.hasta = 'Fecha inválida.';
  if (d.desde && d.hasta && d.hasta < d.desde) errores.hasta = 'La fecha de fin es anterior a la de inicio.';
  return { datos: d, errores };
}

/** Solo se aceptan redirecciones internas del panel (evita redirecciones abiertas). */
export const rutaInterna = (v: unknown, defecto: string) => {
  const t = texto(v, 300);
  return t === BASE || (t.startsWith(`${BASE}/`) && /^\/[a-z0-9/_\-?=&%.]*$/i.test(t)) ? t : defecto;
};
