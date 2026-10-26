// Pruebas del panel de registros (node --test). Microsoft, Blob, el correo y AI Gateway se simulan: no salen
// pedidos. El almacén son archivos en una carpeta temporal distinta para cada prueba.
import { after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';

const dir = await mkdtemp(join(tmpdir(), 'registros-'));
const BASE_ENV = { ...process.env };
const ORIGEN = 'http://localhost:4400';
const BASE = '/cr-prueba12345';
const CODIGO_INICIAL = 'codigo-inicial-de-prueba';
const CLAVE_ADMIN = 'Clave-Admin-2026';
const PIN = '480317';

function configurar(extra = {}) {
  for (const k of Object.keys(process.env)) if (!(k in BASE_ENV)) delete process.env[k];
  for (const k of ['BLOB_READ_WRITE_TOKEN', 'VERCEL', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_USUARIO', 'MS_CUENTA', 'MS_TENANT', 'AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN', 'IA_APAGADA', 'RESEND_API_KEY', 'CORREO_CONSOLA']) delete process.env[k];
  Object.assign(process.env, {
    ALMACEN_DIR: join(dir, `a-${Math.random()}`), PANEL_RUTA: BASE, PANEL_CODIGO_INICIAL: CODIGO_INICIAL,
    SESION_SECRETO: 'secreto-de-prueba-con-mas-de-treinta-y-dos-caracteres', RESEND_API_KEY: 're_prueba',
  }, extra);
}

const campos = await import('../api/_lib/campos.js');
const { manejar } = await import('../api/_lib/app.js');
const ms = await import('../api/_lib/microsoft.js');
const almacen = await import('../api/_lib/almacen.js');
const U = await import('../api/_lib/usuarios.js');
const A = await import('../api/_lib/acceso.js');

// Correos enviados (el código se lee de acá)
let correos = [];
A.usarEnvio(async (m) => { correos.push(m); });
const ultimoCodigo = () => correos.at(-1)?.asunto.match(/^(\d{6})/)?.[1];

/** Navegador simulado: guarda las cookies como lo haría el navegador. */
class Navegador {
  cookies = new Map();
  async pedir(ruta, { metodo = 'GET', datos, origen = ORIGEN } = {}) {
    const cabeceras = { host: 'localhost:4400', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/130', 'x-forwarded-for': '203.0.113.7' };
    if (origen && metodo !== 'GET') cabeceras.origin = origen;
    if (this.cookies.size) cabeceras.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (datos !== undefined) cabeceras['content-type'] = 'application/json';
    const res = await manejar(new Request(`${ORIGEN}${ruta}`, { method: metodo, headers: cabeceras, body: datos !== undefined ? JSON.stringify(datos) : undefined }));
    for (const c of res.headers.getSetCookie()) {
      const [par, ...attrs] = c.split(';');
      const i = par.indexOf('=');
      const borrar = attrs.some((a) => a.trim() === 'Max-Age=0');
      if (borrar) this.cookies.delete(par.slice(0, i)); else this.cookies.set(par.slice(0, i), par.slice(i + 1));
    }
    return res;
  }
  api(ruta, opciones) { return this.pedir(`${BASE}/api/${ruta}`, opciones); }
  async json(ruta, opciones) {
    const r = await this.api(ruta, opciones);
    return { status: r.status, ...(await r.json()) };
  }
  post(ruta, datos = {}) { return this.json(ruta, { metodo: 'POST', datos }); }
}

const MAPA = 'https://www.google.com/maps/search/?api=1&query=-34.870000%2C-56.100000';
const REGISTRO = { nombre: 'Juan Pérez', socio: '12345', cedula: '1.234.567-2', direccion: 'Av. Italia 3456 apto 2', producto: 'Heladera Samsung RT38', codigo: '457939', service: '', flete: 'Sí' };

/** Configuración inicial: crea bpereira (administrador) y el PIN; devuelve su navegador con sesión. */
async function configurarPanel() {
  const n = new Navegador();
  const r = await n.post('configurar', { codigo: CODIGO_INICIAL, nombre: 'Brandon Pereira', correo: 'bpereira@example.com', clave: CLAVE_ADMIN, repetir: CLAVE_ADMIN, pin: PIN, repetirPin: PIN });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.fase, 'panel');
  return n;
}

/** Ingreso completo en un navegador nuevo: PIN, usuario y contraseña, correo y código. */
async function ingresar(usuario, clave, correo, { recordar = false, navegador = new Navegador() } = {}) {
  const n = navegador;
  if ((await n.json('estado')).fase === 'pin') assert.equal((await n.post('pin', { pin: PIN })).status, 200);
  const r = await n.post('ingresar', { usuario, clave });
  if (r.fase !== 'correo') return { n, r };
  assert.equal((await n.post('verificar/correo', { correo })).fase, 'codigo');
  return { n, r: await n.post('verificar/codigo', { codigo: ultimoCodigo(), recordar }) };
}

// ── fetch simulado (Microsoft y AI Gateway) ──
let llamadas = [];
let rutas = [];
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (url, opciones = {}) => {
  const u = String(url);
  const cuerpo = opciones.body instanceof URLSearchParams ? Object.fromEntries(opciones.body) : opciones.body ? JSON.parse(opciones.body) : undefined;
  llamadas.push({ url: u, metodo: opciones.method ?? 'GET', cuerpo });
  for (const [patron, manejador] of rutas) if (patron.test(u)) return manejador(u, opciones, cuerpo);
  throw new Error(`fetch no simulado: ${u}`);
};
after(async () => {
  globalThis.fetch = fetchOriginal;
  await rm(dir, { recursive: true, force: true });
});
const responder = (datos, status = 200) => new Response(JSON.stringify(datos), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  configurar();
  llamadas = [];
  rutas = [];
  correos = [];
  ms.usarFetch((...a) => globalThis.fetch(...a));
  almacen.usarBlob(null);
  U.olvidarCache();
});

/** Contenido de un archivo dentro de un .zip (para revisar el .xlsx). */
function delZip(buf, nombre) {
  for (let i = 0; i < buf.length - 30;) {
    if (buf.readUInt32LE(i) !== 0x04034b50) break;
    const tam = buf.readUInt32LE(i + 18);
    const largoNombre = buf.readUInt16LE(i + 26);
    const n = buf.subarray(i + 30, i + 30 + largoNombre).toString();
    const datos = buf.subarray(i + 30 + largoNombre, i + 30 + largoNombre + tam);
    if (n === nombre) return inflateRawSync(datos).toString();
    i += 30 + largoNombre + tam;
  }
  return null;
}

describe('campos', () => {
  test('cédula: acepta con y sin puntos, rechaza el dígito verificador equivocado', () => {
    assert.equal(campos.formatoCedula('12345672'), '1.234.567-2');
    assert.equal(campos.formatoCedula('1.234.567-2'), '1.234.567-2');
    assert.equal(campos.formatoCedula('1234567-3'), null);
    assert.equal(campos.formatoCedula('123'), null);
    assert.equal(campos.formatoCedula(`512345${campos.digitoCedula('512345')}`), `512.345-${campos.digitoCedula('512345')}`);
  });

  test('registro: obligatorios, socio numérico, flete Sí/No y service opcional', () => {
    assert.deepEqual(Object.keys(campos.validarRegistro({}).errores).sort(), ['cedula', 'codigo', 'direccion', 'flete', 'nombre', 'producto', 'socio']);
    assert.equal(campos.validarRegistro({ ...REGISTRO, flete: 'si' }).datos.flete, 'Sí');
    assert.equal(campos.validarRegistro({ ...REGISTRO, flete: false }).datos.flete, 'No');
    assert.ok(campos.validarRegistro({ ...REGISTRO, flete: 'tal vez' }).errores.flete);
    assert.ok(campos.validarRegistro({ ...REGISTRO, socio: '12a' }).errores.socio);
    const { datos } = campos.validarRegistro({ ...REGISTRO, socio: '12.345', cedula: '12345672' });
    assert.equal(datos.socio, '12345');
    assert.equal(datos.cedula, '1.234.567-2');
    assert.equal(datos.service, '');
  });

  test('ubicación: solo enlaces de búsqueda de Google Maps; en la fila va como enlace clicable', () => {
    assert.equal(campos.validarRegistro({ ...REGISTRO, mapa: MAPA }).datos.mapa, MAPA);
    for (const malo of ['https://malo.example/x', 'http://www.google.com/maps/search/?api=1&query=a', `${MAPA}"&x`, 'javascript:alert(1)', `${MAPA}%22,"x")`]) {
      assert.ok(campos.validarRegistro({ ...REGISTRO, mapa: malo }).errores?.direccion, malo);
    }
    const fila = campos.filaPlanilla({ ...REGISTRO, direccion: 'Av. "Italia" 3456', mapa: MAPA }, 'Ana');
    assert.equal(fila[4], `=HYPERLINK("${MAPA}","Av. ""Italia"" 3456")`);
    assert.equal(campos.filaPlanilla({ ...REGISTRO, mapa: '' }, 'Ana')[4], REGISTRO.direccion, 'sin ubicación, solo texto');
    assert.equal(campos.filaPlanilla({ ...REGISTRO, mapa: `${MAPA}${'a'.repeat(260)}` }, 'Ana')[4], REGISTRO.direccion, 'si no entra en una fórmula, solo texto');
  });

  test('fila: no deja pasar fórmulas a Excel y conserva ceros del socio', () => {
    const fila = campos.filaPlanilla({ ...REGISTRO, socio: '0123', service: '=HYPERLINK("http://x")', producto: '+54', codigo: '@a' }, 'Ana', new Date('2026-10-23T15:05:00Z'));
    assert.equal(fila.length, campos.COLUMNAS.length);
    assert.equal(fila[0], '2026-10-23 12:05');
    assert.equal(fila[2], "'0123");
    assert.equal(fila[5], `'=HYPERLINK("http://x")`);
    assert.equal(fila[6], 'Sí');
    assert.equal(fila[7], "'+54");
    assert.equal(fila[8], "'@a");
    assert.equal(fila[9], 'Ana');
  });
});

describe('dirección secreta', () => {
  test('fuera de PANEL_RUTA todo da un 404 genérico; adentro, la página y los recursos', async () => {
    const n = new Navegador();
    for (const ruta of ['/', '/api/index', '/panel/', '/cr-prueba1234', `${BASE}x/`, `${BASE}/../app/index.html`, `${BASE}/recursos/../index.html`, `${BASE}/otra`]) {
      const r = await n.pedir(ruta);
      assert.equal(r.status, 404, ruta);
      assert.equal(await r.text(), '404: NOT_FOUND', ruta);
    }
    assert.equal((await n.pedir(BASE)).status, 308);
    const pagina = await n.pedir(`${BASE}/`);
    assert.equal(pagina.status, 200);
    assert.match(pagina.headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(await pagina.text(), /recursos\/app\.js/);
    assert.equal((await n.pedir(`${BASE}/recursos/app.js`)).headers.get('content-type'), 'text/javascript; charset=utf-8');
  });

  test('en Vercel sin PANEL_RUTA o sin SESION_SECRETO no responde nada útil', async () => {
    configurar({ VERCEL: '1', PANEL_RUTA: '', BLOB_READ_WRITE_TOKEN: 'x' });
    assert.equal((await new Navegador().pedir('/panel/')).status, 404);
    configurar({ VERCEL: '1', SESION_SECRETO: 'corto', BLOB_READ_WRITE_TOKEN: 'x' });
    assert.equal((await new Navegador().api('estado')).status, 503);
  });
});

describe('configuración inicial', () => {
  test('sin usuarios pide configurar; con código correcto crea bpereira (administrador protegido) y el PIN', async () => {
    const n = new Navegador();
    assert.deepEqual(await n.json('estado'), { status: 200, fase: 'configurar', admin: 'bpereira', codigoConfigurado: true });
    assert.equal((await n.post('configurar', { codigo: 'otro', correo: 'b@example.com', clave: CLAVE_ADMIN, repetir: CLAVE_ADMIN, pin: PIN, repetirPin: PIN })).status, 401);
    const debil = await n.post('configurar', { codigo: CODIGO_INICIAL, correo: 'mal', clave: 'corta', repetir: 'corta', pin: '123456', repetirPin: '123456' });
    assert.equal(debil.status, 422);
    assert.deepEqual(Object.keys(debil.errores).sort(), ['clave', 'correo', 'pin']);
    const admin = await configurarPanel();
    const yo = await admin.json('estado');
    assert.equal(yo.usuario.usuario, 'bpereira');
    assert.equal(yo.usuario.rol, 'administrador');
    assert.equal(yo.usuario.protegido, true);
    assert.equal((await new Navegador().post('configurar', { codigo: CODIGO_INICIAL })).status, 409);
    const lista = await U.listar({ fresco: true });
    assert.ok(lista[0].hash.startsWith('scrypt$') && !JSON.stringify(lista).includes(CLAVE_ADMIN), 'la contraseña solo se guarda como hash');
  });

  test('el código de configuración se bloquea tras 5 intentos', async () => {
    const n = new Navegador();
    for (let i = 0; i < 5; i++) await n.post('configurar', { codigo: `mal-${i}` });
    assert.equal((await n.post('configurar', { codigo: CODIGO_INICIAL })).status, 429);
  });
});

describe('acceso: PIN, contraseña y código por correo', () => {
  test('recorrido completo y equipo recordado', async () => {
    await configurarPanel();
    const n = new Navegador();
    assert.equal((await n.json('estado')).fase, 'pin');
    assert.equal((await n.post('ingresar', { usuario: 'bpereira', clave: CLAVE_ADMIN })).status, 403, 'sin PIN no se puede ni probar la contraseña');
    assert.equal((await n.post('pin', { pin: '111222' })).status, 401);
    assert.equal((await n.post('pin', { pin: PIN })).fase, 'ingreso');
    assert.equal((await n.post('ingresar', { usuario: 'bpereira', clave: 'equivocada' })).status, 401);
    assert.equal((await n.post('ingresar', { usuario: 'nadie', clave: 'equivocada' })).error, 'Usuario o contraseña incorrectos.');
    assert.equal((await n.post('ingresar', { usuario: 'BPereira', clave: CLAVE_ADMIN })).fase, 'correo');
    const malo = await n.post('verificar/correo', { correo: 'otro@example.com' });
    assert.equal(malo.status, 401);
    assert.equal(correos.length, 0);
    const codigo = await n.post('verificar/correo', { correo: 'bpereira@example.com' });
    assert.equal(codigo.fase, 'codigo');
    assert.equal(codigo.correo, 'b••••••a@example.com');
    assert.equal(correos[0].para, 'bpereira@example.com');
    assert.equal((await n.post('verificar/reenviar')).status, 429, 'hay que esperar para reenviar');
    assert.equal((await n.post('verificar/codigo', { codigo: '000000' })).status, 401);
    const dentro = await n.post('verificar/codigo', { codigo: ultimoCodigo(), recordar: true });
    assert.equal(dentro.fase, 'panel');
    assert.equal((await n.json('estado')).fase, 'panel');
    // Salir y volver: el equipo recordado no pide PIN ni código, pero sí la contraseña.
    await n.post('salir');
    assert.equal((await n.json('estado')).fase, 'ingreso');
    for (const k of [...n.cookies.keys()]) if (k.includes('pin')) n.cookies.delete(k);
    assert.equal((await n.json('estado')).fase, 'ingreso', 'el equipo recordado reemplaza al PIN');
    const enviados = correos.length;
    assert.equal((await n.post('ingresar', { usuario: 'bpereira', clave: CLAVE_ADMIN })).fase, 'panel');
    assert.equal(correos.length, enviados, 'no se mandó otro código');
  });

  test('5 códigos equivocados anulan la verificación; 5 contraseñas equivocadas bloquean la cuenta', async () => {
    await configurarPanel();
    const n = new Navegador();
    await n.post('pin', { pin: PIN });
    await n.post('ingresar', { usuario: 'bpereira', clave: CLAVE_ADMIN });
    await n.post('verificar/correo', { correo: 'bpereira@example.com' });
    let r;
    for (let i = 0; i < 5; i++) r = await n.post('verificar/codigo', { codigo: '000000' });
    assert.equal(r.fase, 'ingreso');
    assert.equal((await n.post('verificar/codigo', { codigo: ultimoCodigo() })).fase, 'ingreso', 'el código correcto ya no sirve');
    for (let i = 0; i < 5; i++) await n.post('ingresar', { usuario: 'bpereira', clave: 'equivocada' });
    const bloqueado = await n.post('ingresar', { usuario: 'bpereira', clave: CLAVE_ADMIN });
    assert.match(bloqueado.error, /bloqueada/);
    const eventos = (await A.eventos()).map((e) => e.tipo);
    assert.ok(eventos.includes('bloqueo') && eventos.includes('codigo-fallido') && eventos.includes('configuracion-inicial'));
  });

  test('sin RESEND_API_KEY se entra con PIN, usuario y contraseña', async () => {
    await configurarPanel();
    delete process.env.RESEND_API_KEY;
    const n = new Navegador();
    await n.post('pin', { pin: PIN });
    const r = await n.post('ingresar', { usuario: 'bpereira', clave: CLAVE_ADMIN });
    assert.equal(r.fase, 'panel');
    assert.match(r.aviso, /en pausa/);
  });

  test('cookies alteradas, otro origen y sesiones cerradas no sirven', async () => {
    const admin = await configurarPanel();
    const [nombre, valor] = [...admin.cookies].find(([k]) => k.includes('sesion'));
    const [cuerpo, firma] = valor.split('.');
    const falso = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(cuerpo, 'base64url')), u: 'otro' })).toString('base64url');
    const intruso = new Navegador();
    intruso.cookies.set(nombre, `${falso}.${firma}`);
    assert.notEqual((await intruso.json('estado')).fase, 'panel');
    assert.equal((await admin.json('registro', { metodo: 'POST', datos: REGISTRO, origen: 'https://malo.example' })).status, 403);
    assert.equal((await admin.json('registro', { metodo: 'POST', datos: REGISTRO, origen: null })).status, 403);
    await U.actualizar('bpereira', { sv: U.nuevaVersionSesion() });
    U.olvidarCache();
    assert.equal((await admin.json('planilla')).status, 401);
  });
});

describe('usuarios y roles', () => {
  test('el administrador crea un usuario de carga, que debe cambiar la contraseña y no ve usuarios ni accesos', async () => {
    const admin = await configurarPanel();
    const creado = await admin.post('usuarios', { usuario: 'JPerez', nombre: 'Juan Pérez', correo: 'jperez@example.com', rol: 'carga', clave: 'Temporal-2026!' });
    assert.equal(creado.status, 201);
    assert.equal(creado.usuario.usuario, 'jperez');
    assert.equal((await admin.post('usuarios', { usuario: 'jperez', correo: 'x@example.com', rol: 'carga', clave: 'Temporal-2026!' })).status, 409);
    assert.equal((await admin.post('usuarios', { usuario: 'ana', correo: 'a@example.com', rol: 'carga', clave: 'corta' })).status, 422);

    const { n, r } = await ingresar('jperez', 'Temporal-2026!', 'jperez@example.com');
    assert.equal(r.fase, 'clave');
    assert.equal((await n.post('registro', REGISTRO)).status, 403, 'primero tiene que cambiar la contraseña');
    assert.equal((await n.post('perfil/clave', { actual: 'Temporal-2026!', nueva: 'Mi-Clave-Nueva-77', repetir: 'Mi-Clave-Nueva-77' })).fase, 'panel');
    assert.equal((await n.post('registro', REGISTRO)).status, 200);
    assert.equal((await n.json('usuarios')).status, 403);
    assert.equal((await n.json('accesos')).status, 403);
    assert.equal((await n.json('planilla', { metodo: 'DELETE', datos: {} })).status, 403);
    assert.equal((await n.post('perfil/pin', { pin: '583920', repetir: '583920', clave: 'Mi-Clave-Nueva-77' })).status, 403);
    const lista = await n.json('planilla');
    assert.equal(lista.registros[0].cargadoPor, 'Juan Pérez');
  });

  test('reglas: el protegido no se baja ni se borra, siempre queda un administrador, restablecer cierra sesiones', async () => {
    const admin = await configurarPanel();
    assert.equal((await admin.json('usuarios/bpereira', { metodo: 'PATCH', datos: { rol: 'carga' } })).status, 403);
    assert.equal((await admin.json('usuarios/bpereira', { metodo: 'DELETE', datos: {} })).status, 403);
    await admin.post('usuarios', { usuario: 'ana', nombre: 'Ana', correo: 'ana@example.com', rol: 'carga', clave: 'Temporal-2026!' });
    const { n: ana } = await ingresar('ana', 'Temporal-2026!', 'ana@example.com');
    assert.equal((await ana.json('estado')).fase, 'clave');
    assert.equal((await admin.post('usuarios/ana/clave', { clave: 'Otra-Temporal-99' })).status, 200);
    U.olvidarCache();
    assert.notEqual((await ana.json('estado')).fase, 'clave', 'su sesión se cerró');
    assert.equal((await admin.json('usuarios/ana', { metodo: 'PATCH', datos: { activo: false } })).status, 200);
    const n = new Navegador();
    await n.post('pin', { pin: PIN });
    assert.equal((await n.post('ingresar', { usuario: 'ana', clave: 'Otra-Temporal-99' })).status, 401, 'la cuenta inactiva no entra');
    assert.equal((await admin.json('usuarios/ana', { metodo: 'DELETE', datos: {} })).status, 200);
    assert.equal((await admin.json('usuarios')).usuarios.length, 1);
    const accesos = await admin.json('accesos');
    assert.ok(accesos.eventos.some((e) => e.tipo === 'usuario-eliminado' && e.detalle === 'ana'));
  });

  test('cambiar el PIN anula los pases de PIN anteriores', async () => {
    const admin = await configurarPanel();
    const otro = new Navegador();
    await otro.post('pin', { pin: PIN });
    assert.equal((await otro.json('estado')).fase, 'ingreso');
    assert.equal((await admin.post('perfil/pin', { pin: '583920', repetir: '583920', clave: CLAVE_ADMIN })).status, 200);
    U.olvidarCache();
    assert.equal((await otro.json('estado')).fase, 'pin');
    assert.equal((await otro.post('pin', { pin: '583920' })).fase, 'ingreso');
  });
});

describe('planilla de prueba (sin Microsoft)', () => {
  test('guarda con quien cargó, la muestra, la descarga como .xlsx y el administrador la vacía', async () => {
    const admin = await configurarPanel();
    const malo = await admin.post('registro', { ...REGISTRO, cedula: '1234567-3' });
    assert.equal(malo.status, 422);
    assert.ok(malo.errores.cedula);
    assert.equal((await admin.post('registro', { ...REGISTRO, service: 'Instalación', mapa: MAPA })).status, 200);
    assert.equal((await admin.post('registro', { ...REGISTRO, mapa: 'https://malo.example/' })).status, 422);
    assert.equal((await admin.post('registro', { ...REGISTRO, nombre: 'María Gómez', service: '=1+1' })).status, 200);
    const lista = await admin.json('planilla');
    assert.equal(lista.total, 2);
    assert.equal(lista.registros[0].nombre, 'María Gómez', 'la más nueva primero');
    assert.equal(lista.registros[1].cargadoPor, 'Brandon Pereira');
    const xlsx = await admin.api('planilla?formato=xlsx');
    assert.equal(xlsx.headers.get('content-type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const hoja = delZip(Buffer.from(await xlsx.arrayBuffer()), 'xl/worksheets/sheet1.xml');
    for (const c of campos.COLUMNAS) assert.ok(hoja.includes(`<t xml:space="preserve">${c}</t>`), c);
    assert.ok(hoja.includes(`<f>HYPERLINK(&quot;${MAPA.replace(/&/g, '&amp;')}&quot;,&quot;Av. Italia 3456 apto 2&quot;)</f><v>Av. Italia 3456 apto 2</v>`), 'dirección clicable');
    assert.ok(hoja.includes('<v>12345</v>') && hoja.includes('<t xml:space="preserve">=1+1</t>') && hoja.split('<f>').length === 2, 'la única fórmula es el enlace');
    assert.equal((await new Navegador().api('planilla')).status, 401);
    assert.equal((await admin.json('planilla', { metodo: 'DELETE', datos: {} })).status, 200);
    assert.equal((await admin.json('planilla')).total, 0);
  });

  test('en Blob, dos guardados al mismo tiempo no se pisan', async () => {
    const datos = new Map();
    let version = 0;
    almacen.usarBlob({
      get: async (r) => {
        await new Promise((ok) => setTimeout(ok, 5));
        return datos.has(r) ? { statusCode: 200, stream: new Blob([datos.get(r).cuerpo]).stream(), blob: { etag: datos.get(r).etag } } : null;
      },
      put: async (r, cuerpo, o) => {
        const actual = datos.get(r);
        if (o.ifMatch ? actual?.etag !== o.ifMatch : actual && !o.allowOverwrite) throw Object.assign(new Error('precondition failed'), { name: 'BlobPreconditionFailedError' });
        datos.set(r, { cuerpo, etag: String(++version) });
      },
      del: async (r) => { datos.delete(r); },
    });
    const guardados = await Promise.all([1, 2, 3, 4].map((n) => almacen.agregarALista('planilla-prueba', { codigo: `C${n}` })));
    assert.equal(Math.max(...guardados), 4);
    assert.deepEqual((await almacen.leerLista('planilla-prueba')).map((r) => r.codigo).sort(), ['C1', 'C2', 'C3', 'C4']);
  });
});

describe('asistente (chat)', () => {
  test('manda la conversación y el formulario; devuelve la respuesta y solo los campos que cambian', async () => {
    const admin = await configurarPanel();
    process.env.AI_GATEWAY_API_KEY = 'clave-ia';
    rutas.push([/ai-gateway\.vercel\.sh/, (_u, o, c) => {
      assert.equal(o.headers.authorization, 'Bearer clave-ia');
      assert.equal(c.tool_choice.name, 'completar_formulario');
      assert.equal(c.messages.length, 3);
      assert.equal(c.messages[1].role, 'assistant');
      assert.match(c.messages[2].content, /"nombre":"Juan Pérez"/);
      assert.match(c.messages[2].content, /el código es 457939/);
      return responder({ content: [{ type: 'tool_use', name: 'completar_formulario', input: { respuesta: 'Listo, agregué el código y marqué flete.', nombre: 'Juan Pérez', codigo: '457939', flete: 'si', cedula: '12345672', extra: 'x' } }], stop_reason: 'tool_use' });
    }]);
    const r = await admin.post('asistente', {
      mensajes: [{ rol: 'usuario', texto: 'Juan Pérez socio 12345' }, { rol: 'asistente', texto: 'Completé nombre y socio.' }, { rol: 'usuario', texto: 'el código es 457939, va con flete, ci 12345672' }],
      formulario: { nombre: 'Juan Pérez', socio: '12345' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.respuesta, 'Listo, agregué el código y marqué flete.');
    assert.deepEqual(r.campos, { cedula: '1.234.567-2', flete: 'Sí', codigo: '457939' }, 'el nombre no cambió: no se repite');
    assert.deepEqual(r.faltan, ['Dirección', 'Producto']);
  });

  test('sin mensaje, sin IA o sin crédito avisa (el formulario sigue funcionando)', async () => {
    const admin = await configurarPanel();
    assert.equal((await admin.post('asistente', { mensajes: [] })).status, 400);
    assert.equal((await admin.post('asistente', { mensajes: [{ rol: 'usuario', texto: 'hola' }] })).status, 503);
    process.env.AI_GATEWAY_API_KEY = 'clave-ia';
    rutas.push([/ai-gateway/, () => responder({ error: 'insufficient funds' }, 402)]);
    const r = await admin.post('asistente', { mensajes: [{ rol: 'usuario', texto: 'hola' }] });
    assert.equal(r.status, 502);
    assert.match(r.error, /crédito/);
  });
});

/** Graph simulado: archivo existente, tabla opcional. */
function graphFalso({ tabla = false } = {}) {
  const estado = { tabla, filas: [], hojas: ['Hoja1'] };
  return [/graph\.microsoft\.com/, (u, o, cuerpo) => {
    const camino = decodeURIComponent(new URL(u).pathname);
    const metodo = o.method ?? 'GET';
    if (camino.endsWith('Registros COPOL.xlsx:') && metodo === 'GET') return responder({ name: 'Registros COPOL.xlsx', webUrl: 'https://onedrive.test/abrir' });
    if (camino.endsWith('/tables/Registros/headerRowRange')) return estado.tabla ? responder({ values: [campos.COLUMNAS] }) : responder({ error: { code: 'ItemNotFound' } }, 404);
    if (camino.endsWith('/worksheets/add')) { estado.hojas.push(cuerpo.name); return responder({ name: cuerpo.name }); }
    if (camino.includes("range(address='A1:J1')") && metodo === 'PATCH') return responder({});
    if (camino.endsWith('/worksheets/Registros/tables/add')) { estado.tabla = true; return responder({ id: '{T1}', name: 'Tabla1' }); }
    if (camino.endsWith('/tables/{T1}') && metodo === 'PATCH') return responder({ name: cuerpo.name });
    if (camino.endsWith('/format/font')) return responder({});
    if (camino.endsWith('/tables/Registros/dataBodyRange')) return responder({ address: 'Registros!A2:J2', values: [Array(10).fill('')] });
    if (camino.includes("range(address='A2:J2')") && metodo === 'PATCH') { estado.filas.push(cuerpo.values[0]); return responder({}); }
    if (camino.endsWith('/tables/Registros/rows/add') && metodo === 'POST') { estado.filas.push(cuerpo.values[0]); return responder({ index: estado.filas.length - 1 }); }
    return responder({ error: { code: 'Desconocido', message: camino } }, 400);
  }, estado];
}

describe('Excel en la nube', () => {
  test('modo aplicación: crea la tabla en una hoja nueva la primera vez y después agrega filas', async () => {
    const admin = await configurarPanel();
    Object.assign(process.env, { MS_CLIENT_ID: 'id', MS_CLIENT_SECRET: 's', MS_USUARIO: 'registros@copol.test', MS_TENANT: 'inquilino', EXCEL_RUTA: '/Registros COPOL.xlsx' });
    const [patron, manejador, estado] = graphFalso();
    rutas.push([/login\.microsoftonline\.com/, () => responder({ access_token: 'acceso-app', expires_in: 3600 })], [patron, manejador]);
    const panel = await admin.json('estado');
    assert.equal(panel.planilla.listo, true);
    assert.equal(panel.planilla.enlace, 'https://onedrive.test/abrir');
    assert.equal((await admin.post('registro', REGISTRO)).status, 200);
    assert.equal((await admin.post('registro', { ...REGISTRO, nombre: 'María Gómez' })).status, 200);
    assert.deepEqual(estado.hojas, ['Hoja1', 'Registros']);
    assert.deepEqual(estado.filas.map((f) => f[1]), ['Juan Pérez', 'María Gómez']);
    assert.equal(estado.filas[0][9], 'Brandon Pereira');
    assert.equal((await admin.post('registro', { ...REGISTRO, mapa: MAPA })).status, 200);
    assert.match(estado.filas[2][4], /^=HYPERLINK\("https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
    assert.equal((await admin.json('planilla')).status, 409, 'con Excel conectado no hay planilla de prueba');
  });

  test('modo cuenta: el administrador conecta solo la cuenta indicada y el permiso se renueva', async () => {
    const admin = await configurarPanel();
    Object.assign(process.env, { MS_CLIENT_ID: 'id', MS_CLIENT_SECRET: 's', MS_CUENTA: 'Planillas@outlook.com', EXCEL_RUTA: 'Registros COPOL.xlsx' });
    const [pGraph, mGraph, estado] = graphFalso({ tabla: true });
    let cuentaQueEntra = 'otra@outlook.com';
    rutas.push([/graph\.microsoft\.com\/v1\.0\/me\?/, () => responder({ userPrincipalName: cuentaQueEntra })], [pGraph, mGraph], [/login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/token/, (_u, _o, c) => (c.grant_type === 'authorization_code'
      ? responder({ access_token: 'acceso-1', refresh_token: 'renovar-1', expires_in: 3600 })
      : responder({ access_token: 'acceso-2', refresh_token: 'renovar-2', expires_in: 3600 }))]);
    assert.equal((await admin.json('estado')).planilla.conectar, true);
    const ida = await admin.api('microsoft/conectar');
    assert.equal(ida.status, 302);
    const destino = new URL(ida.headers.get('location'));
    assert.equal(destino.searchParams.get('redirect_uri'), `${ORIGEN}${BASE}/api/microsoft/vuelta`);
    const volver = () => admin.api(`microsoft/vuelta?code=c&state=${destino.searchParams.get('state')}`);
    const conOtra = await volver();
    assert.match(new URL(conOtra.headers.get('location'), ORIGEN).searchParams.get('mensaje'), /la planilla es de Planillas@outlook\.com/);
    // La cookie del inicio con Microsoft se borró: hay que volver a empezar.
    const ida2 = await admin.api('microsoft/conectar');
    cuentaQueEntra = 'planillas@outlook.com';
    const ok = await admin.api(`microsoft/vuelta?code=c&state=${new URL(ida2.headers.get('location')).searchParams.get('state')}`);
    assert.match(ok.headers.get('location'), /microsoft=conectado/);
    assert.equal(await almacen.leer('ms:renovacion'), 'renovar-1');
    await almacen.borrar('ms:acceso');
    ms.usarFetch((...a) => globalThis.fetch(...a));
    assert.equal((await admin.post('registro', REGISTRO)).status, 200);
    assert.equal(await almacen.leer('ms:renovacion'), 'renovar-2');
    assert.equal(estado.filas.length, 1);
    // Un usuario de carga no puede conectar ni desconectar.
    await admin.post('usuarios', { usuario: 'ana', correo: 'ana@example.com', rol: 'carga', clave: 'Temporal-2026!' });
    const { n } = await ingresar('ana', 'Temporal-2026!', 'ana@example.com');
    await n.post('perfil/clave', { actual: 'Temporal-2026!', nueva: 'Mi-Clave-Nueva-77', repetir: 'Mi-Clave-Nueva-77' });
    assert.equal((await n.json('microsoft/conectar', { metodo: 'DELETE', datos: {} })).status, 403);
  });
});
