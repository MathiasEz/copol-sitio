// /api/microsoft/conectar — GET: lleva a iniciar sesión con la cuenta de Microsoft dueña de la planilla
// (modo cuenta) · DELETE: desconecta esa cuenta.
import { createHash, randomBytes } from 'node:crypto';
import { cookie, error, exigirSesion, json } from '../_lib/http.js';
import { COOKIE_MS, desconectar, faltaConfigurar, modoMicrosoft, redireccion, urlAutorizacion } from '../_lib/microsoft.js';
import { sellar } from '../_lib/sesion.js';

export async function GET(request) {
  const { respuesta } = exigirSesion(request, { cambia: false });
  if (respuesta) return Response.redirect(new URL('/', request.url), 302);
  if (modoMicrosoft() !== 'cuenta') return error('La conexión con una cuenta solo se usa en el modo cuenta (MS_CUENTA).', 400);
  const falta = faltaConfigurar();
  if (falta) return error(falta, 503);
  const verificador = randomBytes(32).toString('base64url');
  const nonce = randomBytes(16).toString('base64url');
  const destino = urlAutorizacion({
    redireccion: redireccion(request),
    estado: nonce,
    desafio: createHash('sha256').update(verificador).digest('base64url'),
  });
  return new Response(null, {
    status: 302,
    headers: {
      location: destino,
      'cache-control': 'no-store',
      'set-cookie': cookie(request, COOKIE_MS, sellar({ n: nonce, v: verificador, exp: Date.now() + 600_000 }), 600),
    },
  });
}

export async function DELETE(request) {
  const { respuesta } = exigirSesion(request);
  if (respuesta) return respuesta;
  await desconectar();
  return json({ ok: true });
}
