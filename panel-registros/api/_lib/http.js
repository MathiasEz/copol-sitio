// Respuestas, cookies y controles comunes.

const SEGURIDAD = {
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
};

export const json = (datos, status = 200, cabeceras = {}) => new Response(JSON.stringify(datos), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...SEGURIDAD, ...cabeceras },
});

export const error = (mensaje, status = 400, extra = {}) => json({ error: mensaje, ...extra }, status);

/** Respuesta genérica para todo lo que está fuera de la dirección secreta: no revela que existe un panel. */
export const noEncontrado = () => new Response('404: NOT_FOUND', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', ...SEGURIDAD } });

export const esLocal = (request) => /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(request.headers.get('host') ?? new URL(request.url).host);

/** En HTTPS las cookies llevan el prefijo __Host- (solo este dominio, Secure, Path=/). */
export const nombreCookie = (request, nombre) => (esLocal(request) ? nombre : `__Host-${nombre}`);

export function leerCookie(request, nombre) {
  const buscado = nombreCookie(request, nombre);
  for (const parte of (request.headers.get('cookie') ?? '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === buscado) {
      try {
        return decodeURIComponent(parte.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Cookie HttpOnly; `ms` = duración en milisegundos (0 la borra). SameSite=Lax: vuelve con el enlace de Microsoft. */
export function cookie(request, nombre, valor, ms) {
  const partes = [`${nombreCookie(request, nombre)}=${encodeURIComponent(valor)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.max(0, Math.floor(ms / 1000))}`];
  if (!esLocal(request)) partes.push('Secure');
  return partes.join('; ');
}
export const borrarCookie = (request, nombre) => cookie(request, nombre, '', 0);

/** Agrega cookies a una respuesta. */
export function conCookies(respuesta, cookies) {
  for (const c of cookies.filter(Boolean)) respuesta.headers.append('set-cookie', c);
  return respuesta;
}

/**
 * Los pedidos que cambian algo tienen que venir de esta misma página: así otro sitio no puede usar la
 * sesión abierta de un empleado (además las cookies son SameSite y el cuerpo tiene que ser JSON).
 */
export function mismoOrigen(request) {
  const origen = request.headers.get('origin');
  if (!origen) return false;
  try {
    return new URL(origen).host === (request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host);
  } catch {
    return false;
  }
}

/** Cuerpo JSON acotado; {} si no hay cuerpo o no es JSON. */
export async function leerJson(request, maximo = 60_000) {
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) return {};
  const texto = await request.text();
  if (texto.length > maximo) return {};
  try {
    const d = JSON.parse(texto);
    return d && typeof d === 'object' ? d : {};
  } catch {
    return {};
  }
}

export const texto = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
export const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
