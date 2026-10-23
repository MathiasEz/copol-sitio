// /api/microsoft/vuelta — Microsoft vuelve acá después de iniciar sesión (modo cuenta).
import { cookie, exigirSesion, leerCookie } from '../_lib/http.js';
import { completarConexion, COOKIE_MS, ErrorPlanilla, redireccion } from '../_lib/microsoft.js';
import { abrir } from '../_lib/sesion.js';

function volver(request, parametros) {
  const destino = new URL('/', request.url);
  for (const [k, v] of Object.entries(parametros)) destino.searchParams.set(k, v);
  return new Response(null, {
    status: 302,
    headers: { location: `${destino.pathname}${destino.search}`, 'cache-control': 'no-store', 'set-cookie': cookie(request, COOKIE_MS, '', 0) },
  });
}

export async function GET(request) {
  const { respuesta } = exigirSesion(request, { cambia: false });
  if (respuesta) return volver(request, {});
  const url = new URL(request.url);
  const guardado = abrir(leerCookie(request, COOKIE_MS));
  if (url.searchParams.get('error')) {
    return volver(request, { microsoft: 'error', mensaje: 'No se completó el inicio de sesión con Microsoft.' });
  }
  if (!guardado || guardado.n !== url.searchParams.get('state') || !url.searchParams.get('code')) {
    return volver(request, { microsoft: 'error', mensaje: 'El inicio de sesión con Microsoft venció. Probá conectar de nuevo.' });
  }
  try {
    await completarConexion({ codigo: url.searchParams.get('code'), redireccion: redireccion(request), verificador: guardado.v });
    return volver(request, { microsoft: 'conectado' });
  } catch (e) {
    console.error('microsoft/vuelta:', e.message);
    return volver(request, { microsoft: 'error', mensaje: e instanceof ErrorPlanilla ? e.message : 'No se pudo conectar la cuenta de Microsoft.' });
  }
}
