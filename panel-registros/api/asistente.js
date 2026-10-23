// /api/asistente — POST { texto }: la IA propone los campos del formulario. No guarda nada.
import { contar } from './_lib/almacen.js';
import { ErrorAsistente, extraer, MAX_TEXTO, tokenGateway } from './_lib/asistente.js';
import { fechaMontevideo } from './_lib/campos.js';
import { error, exigirSesion, json, leerJson } from './_lib/http.js';

export async function POST(request) {
  const { respuesta } = exigirSesion(request);
  if (respuesta) return respuesta;
  if (process.env.IA_APAGADA === '1') return error('El asistente está apagado. Completá el formulario a mano.', 503);
  const cuerpo = await leerJson(request);
  const texto = typeof cuerpo?.texto === 'string' ? cuerpo.texto.trim() : '';
  if (texto.length < 5) return error('Escribí o pegá los datos del socio y del producto.');
  if (texto.length > MAX_TEXTO) return error(`El texto es demasiado largo (máximo ${MAX_TEXTO} caracteres).`);
  const limite = Number(process.env.IA_LIMITE_DIA) || 300;
  if ((await contar(`ia-${fechaMontevideo().slice(0, 10)}`, 86_400)) > limite) return error('Se llegó al límite de consultas al asistente de hoy. Completá el formulario a mano.', 429);
  const token = tokenGateway(request.headers.get('x-vercel-oidc-token'));
  if (!token) return error('El asistente no está disponible en esta computadora (falta AI_GATEWAY_API_KEY).', 503);
  try {
    return json(await extraer(texto, { token }));
  } catch (e) {
    if (e instanceof ErrorAsistente) return error(e.message, e.status);
    console.error('asistente:', e);
    return error('El asistente no respondió. Completá el formulario a mano.', 502);
  }
}
