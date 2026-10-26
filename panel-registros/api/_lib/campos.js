// Campos del formulario: nombre en la planilla, límites y validación. Lo usan el servidor (antes de escribir
// en Excel) y el asistente (para limpiar lo que propone el modelo). El navegador repite estas reglas en
// public/app.js solo para avisar antes de enviar; la que vale es esta.

/** Columnas de la tabla de Excel, en orden. Fecha y Cargado por las completa el servidor. */
export const COLUMNAS = ['Fecha', 'Nombre', 'N° de socio', 'Cédula', 'Dirección', 'Service', 'Flete', 'Producto', 'Código interno', 'Cargado por', 'Información adicional'];

export const CAMPOS = {
  nombre: { etiqueta: 'Nombre', min: 3, max: 120, obligatorio: true },
  socio: { etiqueta: 'N° de socio', min: 1, max: 12, obligatorio: true },
  cedula: { etiqueta: 'Cédula', min: 7, max: 11, obligatorio: true },
  direccion: { etiqueta: 'Dirección', min: 5, max: 200, obligatorio: true },
  service: { etiqueta: 'Service', min: 0, max: 300, obligatorio: false },
  flete: { etiqueta: 'Flete', min: 2, max: 2, obligatorio: true }, // «Sí» o «No»
  producto: { etiqueta: 'Producto', min: 2, max: 200, obligatorio: true },
  codigo: { etiqueta: 'Código interno', min: 1, max: 40, obligatorio: true },
  adicional: { etiqueta: 'Información adicional', min: 0, max: 500, obligatorio: false },
};

/** Espacios simples, sin caracteres de control. */
export const limpiarTexto = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** Dígito verificador de la cédula uruguaya para los 6 o 7 dígitos sin verificador. */
export function digitoCedula(base) {
  const d = base.padStart(7, '0');
  const pesos = [2, 9, 8, 7, 6, 3, 4];
  const suma = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0);
  return (10 - (suma % 10)) % 10;
}

/** Cédula solo con números (55605392) o null si no es válida: 7 u 8 dígitos y el último es el verificador. Se aceptan puntos y guion al escribirla, pero se guarda sin ellos. */
export function formatoCedula(valor) {
  const digitos = limpiarTexto(valor).replace(/[\s.\-_/]/g, '');
  if (!/^\d{7,8}$/.test(digitos)) return null;
  const base = digitos.slice(0, -1);
  if (digitoCedula(base) !== Number(digitos.at(-1))) return null;
  return digitos;
}

/** «Sí», «No» o '' para lo que no se entiende (acepta si/sí/no, true/false). */
export function siNo(v) {
  if (v === true) return 'Sí';
  if (v === false) return 'No';
  const t = limpiarTexto(v).toLowerCase();
  if (['sí', 'si', 's'].includes(t)) return 'Sí';
  if (['no', 'n'].includes(t)) return 'No';
  return '';
}

const RE_MAPA = /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=[A-Za-z0-9%._~!*'()-]+$/;
export const enlaceMapaValido = (u) => typeof u === 'string' && u.length <= 600 && RE_MAPA.test(u);

/** Valida y normaliza un registro. Devuelve { datos } o { errores: { campo: mensaje } }. */
export function validarRegistro(entrada) {
  const e = entrada && typeof entrada === 'object' ? entrada : {};
  const datos = {};
  const errores = {};
  for (const [campo, regla] of Object.entries(CAMPOS)) {
    if (campo === 'flete') {
      datos.flete = siNo(e.flete);
      if (!datos.flete) errores.flete = 'Elegí si lleva flete: Sí o No.';
      continue;
    }
    let v = limpiarTexto(e[campo]);
    if (!v) {
      if (regla.obligatorio) errores[campo] = `Falta ${regla.etiqueta.toLowerCase()}.`;
      datos[campo] = '';
      continue;
    }
    if (campo === 'socio') {
      v = v.replace(/[\s.]/g, '');
      if (!/^\d{1,12}$/.test(v)) { errores[campo] = 'El número de socio lleva solo números.'; continue; }
    } else if (campo === 'cedula') {
      const c = formatoCedula(v);
      if (!c) { errores[campo] = 'La cédula no es válida: tiene que tener 7 u 8 números, el último es el verificador. Revisá que estén bien.'; continue; }
      v = c;
    } else if (campo === 'codigo') {
      if (!/^[\p{L}\p{N}][\p{L}\p{N} ._/-]*$/u.test(v)) { errores[campo] = 'El código interno lleva letras, números, guiones o puntos.'; continue; }
    } else if (campo === 'nombre') {
      if (!/^[\p{L}][\p{L}\p{M} .'-]*$/u.test(v)) { errores[campo] = 'El nombre lleva solo letras.'; continue; }
    }
    if (v.length < regla.min) errores[campo] = `${regla.etiqueta} es demasiado corto.`;
    else if (v.length > regla.max) errores[campo] = `${regla.etiqueta} admite hasta ${regla.max} caracteres.`;
    datos[campo] = v;
  }
  // Enlace de la ubicación elegida (solo se aceptan enlaces de búsqueda de Google Maps, no otros destinos).
  const mapa = limpiarTexto(e.mapa);
  datos.mapa = mapa;
  if (mapa && !enlaceMapaValido(mapa)) errores.direccion = 'La ubicación elegida no es válida: elegí la dirección de la lista otra vez.';
  return Object.keys(errores).length ? { errores } : { datos };
}

/**
 * Texto seguro para una celda de Excel: lo que empieza con = + - @ se escribiría como fórmula; con el
 * apóstrofo delante Excel lo guarda como texto (el apóstrofo no se ve en la celda).
 */
export const celda = (v) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

/** Fecha y hora de Montevideo como 2026-10-23 14:05 (Excel la reconoce como fecha en cualquier idioma). */
export function fechaMontevideo(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Montevideo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/**
 * Celda de dirección clicable: =HYPERLINK("enlace";"texto"). Excel no admite textos de más de 255 caracteres
 * dentro de una fórmula: si el enlace o la dirección no entran, se guarda solo el texto.
 */
export function formulaEnlace(url, texto, separador = ',') {
  const t = String(texto ?? '').replace(/"/g, '""');
  return url && enlaceMapaValido(url) && url.length <= 255 && t.length <= 255 ? `=HYPERLINK("${url}"${separador}"${t}")` : null;
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Nombre de la pestaña del mes de esa fecha, en hora de Montevideo: «Octubre 2026». Cambia solo al cambiar el mes. */
export function nombreMes(d = new Date()) {
  const [anio, mes] = fechaMontevideo(d).split('-');
  return `${MESES[Number(mes) - 1]} ${anio}`;
}

/** Fila para la planilla, en el orden de COLUMNAS. Un N° de socio con ceros adelante va como texto para no perderlos. */
export const filaPlanilla = (datos, cargadoPor, fecha = new Date(), separador = ',') => [
  fechaMontevideo(fecha), datos.nombre, /^0\d/.test(datos.socio) ? `'${datos.socio}` : datos.socio, datos.cedula, datos.direccion,
  datos.service, datos.flete, datos.producto, datos.codigo, cargadoPor, datos.adicional ?? '',
].map((v, i) => (i === 2 ? String(v) : i === 4 ? (formulaEnlace(datos.mapa, v, separador) ?? celda(String(v ?? ''))) : celda(String(v ?? ''))));
