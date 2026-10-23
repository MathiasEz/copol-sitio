// Destino de los registros: la planilla de Excel en la nube (Microsoft) o, mientras Microsoft no esté
// configurado, la planilla de prueba: una lista guardada en el almacén del panel (Blob privado en Vercel,
// archivos en datos/ en la computadora), compartida entre computadoras y descargable como .xlsx.
import { COLUMNAS, filaPlanilla } from './campos.js';
import * as almacen from './almacen.js';
import * as ms from './microsoft.js';
import { libroXlsx } from './xlsx.js';

const LISTA = 'planilla-prueba';
export const MAX_FILAS_PRUEBA = 2000;

/** 'aplicacion' | 'cuenta' | 'prueba' | null (sin configurar). */
export function modo() {
  const m = ms.modoMicrosoft();
  if (m) return m;
  return almacen.almacenConfigurado() ? 'prueba' : null;
}

/** Estado para la pantalla: si se puede guardar, con qué cuenta y el enlace para abrir la planilla. */
export async function estado() {
  const m = modo();
  if (!m) return { modo: null, listo: false, aviso: 'La planilla de Excel todavía no está configurada (variables MS_… en Vercel). Ver el README del panel.' };
  if (m === 'prueba') {
    return {
      modo: m, listo: true, prueba: true,
      aviso: 'Modo de prueba: los registros se guardan en una planilla de prueba del panel (abajo), que se puede descargar como Excel. Cuando se conecte la cuenta de Microsoft, se guardarán en Excel en la nube.',
    };
  }
  const falta = ms.faltaConfigurar();
  if (falta) return { modo: m, listo: false, aviso: falta };
  const cuenta = m === 'cuenta' ? await ms.cuentaConectada() : process.env.MS_USUARIO;
  if (m === 'cuenta' && !cuenta) return { modo: m, listo: false, conectar: true, aviso: `Falta conectar la cuenta de Microsoft dueña de la planilla (${process.env.MS_CUENTA}).` };
  try {
    const info = await ms.infoArchivo();
    return { modo: m, listo: true, cuenta, nombre: info.nombre, enlace: info.enlace };
  } catch (e) {
    return { modo: m, listo: false, cuenta, conectar: m === 'cuenta' && e.reconectar, aviso: e.message };
  }
}

/** Guarda el registro y devuelve la fecha con que quedó. */
export async function agregar(datos, cargadoPor, ahora = new Date()) {
  const m = modo();
  if (!m) throw new ms.ErrorPlanilla('La planilla de Excel todavía no está configurada.', { status: 503 });
  const fila = filaPlanilla(datos, cargadoPor, ahora);
  if (m !== 'prueba') {
    await ms.agregarFila(fila);
    return fila[0];
  }
  try {
    await almacen.agregarALista(LISTA, { fecha: fila[0], ...datos, cargadoPor }, MAX_FILAS_PRUEBA);
  } catch (e) {
    if (e instanceof almacen.ErrorLista) throw new ms.ErrorPlanilla(e.message, { status: 409 });
    throw e;
  }
  return fila[0];
}

/** Registros de la planilla de prueba, en el orden en que se cargaron. */
export const registrosPrueba = () => almacen.leerLista(LISTA);
export const vaciarPrueba = () => almacen.vaciarLista(LISTA);

/** La planilla de prueba como .xlsx, con las mismas columnas que la de Excel en la nube. */
export function xlsxPrueba(registros) {
  const filas = registros.map((r) => [
    r.fecha, r.nombre, /^[1-9]\d{0,14}$/.test(r.socio ?? '') ? Number(r.socio) : r.socio, r.cedula, r.direccion,
    r.service, r.producto, r.codigo, r.cargadoPor,
  ]);
  return libroXlsx({ hoja: 'Registros', columnas: COLUMNAS, filas, anchos: [17, 28, 12, 13, 36, 26, 34, 15, 18] });
}
