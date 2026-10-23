// /api/planilla — planilla de prueba (mientras no se conecte Microsoft).
// GET: registros en JSON (los más nuevos primero) · GET ?formato=xlsx: descarga en Excel · DELETE: vaciarla.
import { error, exigirSesion, json } from './_lib/http.js';
import { fechaMontevideo } from './_lib/campos.js';
import { modo, registrosPrueba, vaciarPrueba, xlsxPrueba } from './_lib/planilla.js';

const MAX_MOSTRAR = 200;

export async function GET(request) {
  const { respuesta } = exigirSesion(request, { cambia: false });
  if (respuesta) return respuesta;
  if (modo() !== 'prueba') return error('La planilla de prueba solo se usa mientras no esté conectada la de Excel.', 409);
  const registros = await registrosPrueba();
  if (new URL(request.url).searchParams.get('formato') === 'xlsx') {
    const nombre = `Registros COPOL (prueba) ${fechaMontevideo().slice(0, 10)}.xlsx`;
    return new Response(xlsxPrueba(registros), {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="registros-copol-prueba.xlsx"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        'cache-control': 'no-store',
      },
    });
  }
  return json({ total: registros.length, registros: registros.slice(-MAX_MOSTRAR).reverse() });
}

export async function DELETE(request) {
  const { respuesta } = exigirSesion(request);
  if (respuesta) return respuesta;
  if (modo() !== 'prueba') return error('La planilla de prueba solo se usa mientras no esté conectada la de Excel.', 409);
  await vaciarPrueba();
  return json({ ok: true });
}
