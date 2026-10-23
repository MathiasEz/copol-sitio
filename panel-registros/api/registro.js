// /api/registro — POST: valida el formulario y agrega la fila a la planilla de Excel.
import { filaPlanilla, validarRegistro } from './_lib/campos.js';
import { error, exigirSesion, json, leerJson } from './_lib/http.js';
import { ErrorPlanilla } from './_lib/microsoft.js';
import { agregar } from './_lib/planilla.js';

export async function POST(request) {
  const { sesion, respuesta } = exigirSesion(request);
  if (respuesta) return respuesta;
  const cuerpo = await leerJson(request);
  if (!cuerpo) return error('Pedido inválido.');
  const { datos, errores } = validarRegistro(cuerpo);
  if (errores) return error('Revisá los campos marcados.', 422, { errores });
  const fila = filaPlanilla(datos, sesion.nombre);
  try {
    await agregar(fila);
  } catch (e) {
    if (e instanceof ErrorPlanilla) return error(e.message, e.status, { conectar: e.reconectar });
    console.error('registro:', e);
    return error('No se pudo guardar. Probá de nuevo.', 500);
  }
  return json({ ok: true, registro: datos, fecha: fila[0] });
}
