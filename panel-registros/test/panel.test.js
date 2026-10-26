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
  for (const k of ['BLOB_READ_WRITE_TOKEN', 'VERCEL', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_USUARIO', 'MS_CUENTA', 'MS_TENANT', 'AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN', 'IA_APAGADA', 'RESEND_API_KEY', 'CORREO_CONSOLA', 'EXCEL_ENLACE', 'EXCEL_RUTA', 'GOOGLE_CREDENCIALES', 'GOOGLE_HOJA', 'GOOGLE_PESTANA']) delete process.env[k];
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
const G = await import('../api/_lib/google.js');
import { generateKeyPairSync } from 'node:crypto';

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
const REGISTRO = { nombre: 'Juan Pérez', socio: '12345', cedula: '12345672', direccion: 'Av. Italia 3456 apto 2', producto: 'Heladera Samsung RT38', codigo: '457939', service: '', flete: 'Sí' };

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
  G.usarFetch((...a) => globalThis.fetch(...a));
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
    assert.equal(campos.formatoCedula('12345672'), '12345672');
    assert.equal(campos.formatoCedula('1.234.567-2'), '12345672', 'se aceptan puntos y guion al escribir, pero se guarda solo con números');
    assert.equal(campos.formatoCedula('55605392'), '55605392');
    assert.equal(campos.formatoCedula('55605393'), null, 'dígito verificador equivocado');
    assert.equal(campos.formatoCedula('5560539'), null, 'una cantidad de números que no corresponde');
    assert.equal(campos.formatoCedula('556053921'), null);
    assert.equal(campos.formatoCedula('1234567-3'), null);
    assert.equal(campos.formatoCedula('123'), null);
    assert.equal(campos.formatoCedula(`512345${campos.digitoCedula('512345')}`), `512345${campos.digitoCedula('512345')}`);
  });

  test('registro: obligatorios, socio numérico, flete Sí/No y service opcional', () => {
    assert.deepEqual(Object.keys(campos.validarRegistro({}).errores).sort(), ['cedula', 'codigo', 'direccion', 'flete', 'nombre', 'producto', 'socio']);
    assert.equal(campos.validarRegistro({ ...REGISTRO, flete: 'si' }).datos.flete, 'Sí');
    assert.equal(campos.validarRegistro({ ...REGISTRO, flete: false }).datos.flete, 'No');
    assert.ok(campos.validarRegistro({ ...REGISTRO, flete: 'tal vez' }).errores.flete);
    assert.ok(campos.validarRegistro({ ...REGISTRO, socio: '12a' }).errores.socio);
    const { datos } = campos.validarRegistro({ ...REGISTRO, socio: '12.345', cedula: '12345672' });
    assert.equal(datos.socio, '12345');
    assert.equal(datos.cedula, '12345672');
    assert.equal(datos.service, '');
    assert.equal(datos.adicional, '', 'la información adicional es opcional');
    assert.equal(campos.validarRegistro({ ...REGISTRO, adicional: '  Tel 099 123 456,\n entregar por la tarde ' }).datos.adicional, 'Tel 099 123 456, entregar por la tarde');
    assert.ok(campos.validarRegistro({ ...REGISTRO, adicional: 'x'.repeat(501) }).errores.adicional);
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
    assert.equal(fila[10], '');
    assert.equal(campos.filaPlanilla({ ...REGISTRO, adicional: '=cmd' }, 'Ana')[10], "'=cmd", 'tampoco como fórmula');
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

  test('sin correo configurado se puede recordar el equipo: después piden solo usuario y contraseña', async () => {
    await configurarPanel();
    delete process.env.RESEND_API_KEY;
    const n = new Navegador();
    const e0 = await n.json('estado');
    assert.equal(e0.fase, 'pin');
    await n.post('pin', { pin: PIN });
    assert.equal((await n.json('estado')).sinCorreo, true);
    assert.equal((await n.post('ingresar', { usuario: 'bpereira', clave: CLAVE_ADMIN, recordar: true })).fase, 'panel');
    await n.post('salir');
    for (const k of [...n.cookies.keys()]) if (k.includes('pin')) n.cookies.delete(k); // el PIN ya no se pide
    assert.equal((await n.json('estado')).fase, 'ingreso');
    assert.equal((await n.post('ingresar', { usuario: 'bpereira', clave: 'equivocada' })).status, 401, 'la contraseña se sigue pidiendo');
    assert.equal((await n.post('ingresar', { usuario: 'bpereira', clave: CLAVE_ADMIN })).fase, 'panel');
    // Sin marcar «recordar» el equipo no queda recordado.
    const otro = new Navegador();
    await otro.post('pin', { pin: PIN });
    await otro.post('ingresar', { usuario: 'bpereira', clave: CLAVE_ADMIN, recordar: false });
    await otro.post('salir');
    for (const k of [...otro.cookies.keys()]) if (k.includes('pin')) otro.cookies.delete(k);
    assert.equal((await otro.json('estado')).fase, 'pin');
  });

  test('equipo recordado: la sesión no se cierra por inactividad; sin recordar, sí', async () => {
    await configurarPanel();
    delete process.env.RESEND_API_KEY;
    const entrar = async (recordar) => {
      const n = new Navegador();
      await n.post('pin', { pin: PIN });
      assert.equal((await n.post('ingresar', { usuario: 'bpereira', clave: CLAVE_ADMIN, recordar })).fase, 'panel');
      return n;
    };
    const larga = await entrar(true);
    const corta = await entrar(false);
    const real = Date.now;
    try {
      Date.now = () => real() + 3 * 3_600_000; // 3 horas sin usar el panel
      assert.equal((await corta.json('estado')).fase !== 'panel', true, 'la sesión normal vence a los 30 minutos sin uso');
      assert.equal((await larga.json('estado')).fase, 'panel', 'la sesión larga sigue abierta');
      Date.now = () => real() + 3 * 3_600_000 + 20 * 86_400_000; // y a los 20 días
      assert.equal((await larga.json('estado')).fase, 'panel', 'mientras se use, sigue abierta');
      Date.now = () => real() + 3 * 3_600_000 + 20 * 86_400_000 + 40 * 86_400_000; // 40 días sin usarla
      assert.notEqual((await larga.json('estado')).fase, 'panel', 'a los 30 días sin uso se cierra');
    } finally {
      Date.now = real;
    }
    // Cambiar la contraseña cierra las demás sesiones aunque sean largas.
    const otra = await entrar(true);
    await larga.post('perfil/clave', { actual: CLAVE_ADMIN, nueva: 'Otra-Clave-Larga-77', repetir: 'Otra-Clave-Larga-77' }).catch(() => {});
    U.olvidarCache();
    assert.notEqual((await otra.json('estado')).fase, 'panel');
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
    assert.equal((await n.json('actividad')).status, 403, 'la actividad es solo para administradores');
    const act = await admin.json('actividad');
    const reg = act.eventos.find((e) => e.tipo === 'registro');
    assert.equal(reg.usuario, 'jperez');
    assert.equal(reg.nombre, 'Juan Pérez');
    assert.equal(reg.destino, 'Planilla de prueba');
    assert.match(reg.detalle, /Juan Pérez · socio 12345 · Heladera Samsung RT38 \(457939\) · con flete/);
    assert.ok(act.eventos.some((e) => e.tipo === 'usuario-creado' && e.usuario === 'bpereira' && /jperez/.test(e.detalle)));
    assert.equal(act.tipos.registro, 'Cargó un registro');
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
    assert.equal((await admin.post('registro', { ...REGISTRO, service: 'Instalación', mapa: MAPA, adicional: 'Tel 099 123 456' })).status, 200);
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
    assert.ok(hoja.includes('<t xml:space="preserve">Información adicional</t>') && hoja.includes('<t xml:space="preserve">Tel 099 123 456</t>'), 'información adicional');
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
      const ultimo = c.messages[2].content;
      assert.equal(ultimo.length, 1, 'sin adjuntos, solo el texto');
      assert.match(ultimo[0].text, /"nombre":"Juan Pérez"/);
      assert.match(ultimo[0].text, /el código es 457939/);
      return responder({ content: [{ type: 'tool_use', name: 'completar_formulario', input: { respuesta: 'Listo, agregué el código y marqué flete.', nombre: 'Juan Pérez', codigo: '457939', flete: 'si', cedula: '12345672', adicional: 'Tel 099 123 456', extra: 'x' } }], stop_reason: 'tool_use' });
    }]);
    const r = await admin.post('asistente', {
      mensajes: [{ rol: 'usuario', texto: 'Juan Pérez socio 12345' }, { rol: 'asistente', texto: 'Completé nombre y socio.' }, { rol: 'usuario', texto: 'el código es 457939, va con flete, ci 12345672' }],
      formulario: { nombre: 'Juan Pérez', socio: '12345' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.respuesta, 'Listo, agregué el código y marqué flete.');
    assert.deepEqual(r.campos, { cedula: '12345672', flete: 'Sí', codigo: '457939', adicional: 'Tel 099 123 456' }, 'el nombre no cambió: no se repite');
    assert.deepEqual(r.faltan, ['Dirección', 'Producto']);
  });

  test('fotos y PDF: se validan por su contenido y se mandan a la IA como imagen o documento, sin guardarse', async () => {
    const admin = await configurarPanel();
    process.env.AI_GATEWAY_API_KEY = 'clave-ia';
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40)]).toString('base64');
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n').toString('base64');
    let visto = null;
    rutas.push([/ai-gateway/, (_u, _o, c) => {
      visto = c.messages.at(-1).content;
      return responder({ content: [{ type: 'tool_use', name: 'completar_formulario', input: { respuesta: 'Leí la factura.', producto: 'Heladera', codigo: '457939' } }], stop_reason: 'tool_use' });
    }]);
    const pedido = (adjuntos) => admin.post('asistente', { mensajes: [{ rol: 'usuario', texto: 'Completá con lo que adjunté.' }], formulario: {}, adjuntos });
    const ok = await pedido([{ tipo: 'imagen', datos: jpg, nombre: 'factura.jpg' }, { tipo: 'pdf', datos: pdf, nombre: 'remito.pdf' }]);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.campos, { producto: 'Heladera', codigo: '457939' });
    assert.equal(visto[0].type, 'image');
    assert.equal(visto[0].source.media_type, 'image/jpeg');
    assert.equal(visto[1].type, 'document');
    assert.equal(visto[1].source.media_type, 'application/pdf');
    assert.match(visto[2].text, /con 2 archivos adjuntos/);
    // El nombre «foto.jpg» no engaña: se mira el contenido. Un ejecutable o un script no pasan.
    assert.equal((await pedido([{ tipo: 'imagen', datos: Buffer.from('MZ\x90\x00 programa').toString('base64'), nombre: 'foto.jpg' }])).status, 413);
    assert.equal((await pedido([{ tipo: 'imagen', datos: Buffer.from('<script>alert(1)</script>').toString('base64'), nombre: 'a.png' }])).status, 413);
    assert.equal((await pedido(Array(4).fill({ tipo: 'imagen', datos: jpg, nombre: 'a.jpg' }))).status, 413, 'máximo 3 archivos');
    assert.equal((await pedido([{ tipo: 'imagen', datos: 'no es base64 !!', nombre: 'a.jpg' }])).status, 413);
    assert.equal((await pedido([{ tipo: 'imagen', datos: `/9j/${'A'.repeat(4_100_000)}`, nombre: 'enorme.jpg' }])).status, 413, 'tamaño máximo');
    const guardado = JSON.stringify(await almacen.leerLista('actividad'));
    assert.ok(!guardado.includes(jpg), 'las fotos no se guardan en ningún lado');
  });

  test('si la IA contesta vacío, reintenta sin forzar la herramienta y, si sigue vacío, avisa del archivo', async () => {
    const admin = await configurarPanel();
    process.env.AI_GATEWAY_API_KEY = 'clave-ia';
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40)]).toString('base64');
    const modos = [];
    rutas.push([/ai-gateway/, (_u, _o, c) => {
      modos.push(c.tool_choice.type);
      if (modos.length < 3) return responder({ content: [], stop_reason: 'max_tokens' });
      return responder({ content: [{ type: 'tool_use', name: 'completar_formulario', input: { respuesta: 'Listo.', producto: 'Heladera' } }], stop_reason: 'tool_use' });
    }]);
    const pedido = () => admin.post('asistente', { mensajes: [{ rol: 'usuario', texto: 'Mirá la foto' }], formulario: {}, adjuntos: [{ tipo: 'imagen', datos: jpg, nombre: 'f.jpg' }] });
    const falla = await pedido();
    assert.equal(falla.status, 502);
    assert.match(falla.error, /no pudo leer ese archivo/);
    assert.deepEqual(modos, ['tool', 'auto']);
    const ok = await pedido();
    assert.equal(ok.status, 200, 'la tercera respuesta ya trae datos');
    assert.deepEqual(modos, ['tool', 'auto', 'tool']);
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
    if (camino.includes("range(address='A1:K1')") && metodo === 'PATCH') return responder({});
    if (camino.endsWith('/worksheets/Registros/tables/add')) { estado.tabla = true; return responder({ id: '{T1}', name: 'Tabla1' }); }
    if (camino.endsWith('/tables/{T1}') && metodo === 'PATCH') return responder({ name: cuerpo.name });
    if (camino.endsWith('/format/font')) return responder({});
    if (camino.endsWith('/tables/Registros/dataBodyRange')) return responder({ address: 'Registros!A2:K2', values: [Array(11).fill('')] });
    if (camino.includes("range(address='A2:K2')") && metodo === 'PATCH') { estado.filas.push(cuerpo.values[0]); return responder({}); }
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

  test('con EXCEL_ENLACE abre el archivo por el enlace de compartir y escribe en él', async () => {
    const admin = await configurarPanel();
    const enlace = 'https://1drv.ms/x/c/7a79ce3301c1d537/IQDSCTxwoIO9S6lF7W_ZuCNiART_3Cl_bp9f9cwUKbvGuxA?e=vthQe9';
    Object.assign(process.env, { MS_CLIENT_ID: 'id', MS_CLIENT_SECRET: 's', MS_USUARIO: 'registros@copol.test', MS_TENANT: 'inquilino', EXCEL_ENLACE: enlace });
    const [patron, manejador, estado] = graphFalso({ tabla: true });
    const esperado = `/shares/u!${Buffer.from(enlace).toString('base64url')}/driveItem`;
    rutas.push([/login\.microsoftonline\.com/, () => responder({ access_token: 'a', expires_in: 3600 })],
      [/graph\.microsoft\.com\/v1\.0\/shares\//, (u) => {
        assert.equal(new URL(u).pathname.replace('/v1.0', ''), esperado);
        return responder({ id: 'ITEM1', name: 'Registros copol.xlsx', webUrl: 'https://onedrive.test/x', parentReference: { driveId: 'DRIVE1' } });
      }], [patron, manejador]);
    assert.equal((await admin.json('estado')).planilla.nombre, 'Registros copol.xlsx');
    assert.equal((await admin.post('registro', REGISTRO)).status, 200);
    assert.equal(estado.filas.length, 1);
    assert.ok(llamadas.some((l) => l.url.includes('/drives/DRIVE1/items/ITEM1/workbook/tables/Registros/rows/add')));
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

describe('Google Sheets', () => {
  const ID = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
  const clave = () => generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } }).privateKey;

  test('nombre de la pestaña: mes y año en hora de Montevideo', () => {
    assert.equal(campos.nombreMes(new Date('2026-10-26T15:00:00Z')), 'Octubre 2026');
    assert.equal(campos.nombreMes(new Date('2026-11-01T02:59:00Z')), 'Octubre 2026', '31/10 23:59 en Montevideo todavía es octubre');
    assert.equal(campos.nombreMes(new Date('2026-11-01T03:00:00Z')), 'Noviembre 2026');
    assert.equal(campos.nombreMes(new Date('2027-01-01T03:00:00Z')), 'Enero 2027');
    assert.equal(campos.nombreMes(new Date('2026-09-15T12:00:00Z')), 'Setiembre 2026');
  });

  test('una pestaña por mes: crea la del mes con su cabecera y al cambiar de mes pasa sola a la siguiente', async () => {
    const admin = await configurarPanel();
    Object.assign(process.env, {
      GOOGLE_CREDENCIALES: JSON.stringify({ client_email: 'panel@proyecto.iam.gserviceaccount.com', private_key: clave() }),
      GOOGLE_HOJA: `https://docs.google.com/spreadsheets/d/${ID}/edit?gid=0#gid=0`,
    });
    const pestanas = new Map([['Hoja 1', { id: 0, cab: null, filas: [] }]]);
    const formatosFecha = [];
    let ids = 0;
    rutas.push([/oauth2\.googleapis\.com\/token/, (_u, _o, c) => {
      assert.equal(c.grant_type, 'urn:ietf:params:oauth:grant-type:jwt-bearer');
      assert.equal(JSON.parse(Buffer.from(c.assertion.split('.')[1], 'base64url')).iss, 'panel@proyecto.iam.gserviceaccount.com');
      return responder({ access_token: 'tok-google', expires_in: 3600 });
    }], [/sheets\.googleapis\.com/, (u, o, c) => {
      assert.equal(o.headers.authorization, 'Bearer tok-google');
      const url = new URL(u);
      const camino = decodeURIComponent(url.pathname);
      assert.ok(camino.includes(`/spreadsheets/${ID}`));
      if (camino.endsWith(`/${ID}`)) return responder({ properties: { title: 'Registros COPOL', locale: 'es_UY' }, sheets: [...pestanas].map(([title, p]) => ({ properties: { sheetId: p.id, title } })) });
      if (camino.endsWith(':batchUpdate')) {
        if (c.requests[0].repeatCell?.cell.userEnteredFormat.numberFormat) formatosFecha.push(c.requests[0].repeatCell.range);
        const nueva = c.requests[0].addSheet?.properties.title;
        if (nueva) { pestanas.set(nueva, { id: ++ids, cab: null, filas: [] }); return responder({ replies: [{ addSheet: { properties: { sheetId: ids, title: nueva } } }] }); }
        return responder({ replies: [] });
      }
      const m = camino.match(/\/values\/'([^']+)'!(.+?)(?::append)?$/);
      const p = m && pestanas.get(m[1]);
      if (!p) return responder({ error: { message: camino } }, 400);
      if (camino.includes(':append')) { assert.equal(url.searchParams.get('valueInputOption'), 'USER_ENTERED'); p.filas.push(c.values[0]); return responder({}); }
      if (o.method === 'PUT') { p.cab = c.values[0]; return responder({}); }
      return responder(p.cab ? { values: [p.cab] } : {});
    }]);
    const mesActual = campos.nombreMes();
    const panel = await admin.json('estado');
    assert.equal(panel.planilla.google, true);
    assert.equal(panel.planilla.listo, true);
    assert.equal(panel.planilla.nombre, 'Registros COPOL');
    assert.equal(panel.planilla.pestana, mesActual);
    assert.equal(panel.planilla.enlace, `https://docs.google.com/spreadsheets/d/${ID}/edit`);
    assert.deepEqual(pestanas.get(mesActual).cab, campos.COLUMNAS);
    assert.ok(formatosFecha.some((r) => r.startColumnIndex === 0 && r.endColumnIndex === 1 && r.startRowIndex === 1), 'la columna Fecha se muestra como fecha y hora');

    // Registro por el panel: va a la pestaña del mes actual, con la dirección clicable y «;» (hoja es_UY).
    assert.equal((await admin.post('registro', { ...REGISTRO, socio: '0123', mapa: MAPA })).status, 200);
    const fila = pestanas.get(mesActual).filas[0];
    assert.match(fila[4], /^=HYPERLINK\("https:\/\/www\.google\.com\/maps\/[^"]+";"Av\. Italia 3456 apto 2"\)$/);
    assert.equal(fila[2], "'0123");
    assert.equal(llamadas.filter((l) => l.url.includes('oauth2')).length, 1, 'el token se reutiliza');

    // Cambio de mes: con la misma hora de Montevideo, 31/10 23:30 → octubre; 1/11 00:05 → noviembre; 1/1 → enero del año siguiente.
    const { agregar } = await import('../api/_lib/planilla.js');
    await agregar(REGISTRO, 'Ana', new Date('2026-11-01T02:30:00Z'));
    await agregar(REGISTRO, 'Ana', new Date('2026-11-01T03:05:00Z'));
    await agregar(REGISTRO, 'Ana', new Date('2026-12-15T15:00:00Z'));
    await agregar(REGISTRO, 'Ana', new Date('2027-01-01T03:05:00Z'));
    assert.deepEqual([...pestanas.keys()], ['Hoja 1', mesActual, 'Octubre 2026', 'Noviembre 2026', 'Diciembre 2026', 'Enero 2027'].filter((x, i, a) => a.indexOf(x) === i));
    assert.equal(pestanas.get('Octubre 2026').filas.length, mesActual === 'Octubre 2026' ? 2 : 1);
    assert.equal(pestanas.get('Noviembre 2026').filas.length, 1);
    assert.deepEqual(pestanas.get('Enero 2027').cab, campos.COLUMNAS, 'cada pestaña nueva lleva su cabecera');
    assert.match(pestanas.get('Noviembre 2026').filas[0][0], /^2026-11-01 00:05$/, 'la fecha de la fila es del mismo momento');
    assert.equal((await admin.json('planilla')).status, 409, 'con Google conectado no hay planilla de prueba');

    // Una pestaña creada con la versión anterior (sin «Información adicional») se completa sola, sin perder filas.
    pestanas.set('Marzo 2027', { id: 99, cab: campos.COLUMNAS.slice(0, 10), filas: [['2027-03-01 10:00', 'Vieja']] });
    await agregar({ ...REGISTRO, adicional: 'Tel 099' }, 'Ana', new Date('2027-03-10T15:00:00Z'));
    assert.deepEqual(pestanas.get('Marzo 2027').cab, campos.COLUMNAS);
    assert.equal(pestanas.get('Marzo 2027').filas.length, 2);
    assert.equal(pestanas.get('Marzo 2027').filas[1][10], 'Tel 099');
    assert.equal(G.separadorDe('es_UY'), ';');
    assert.equal(G.separadorDe('es_MX'), ',');
  });

  test('si la hoja no está compartida avisa con qué correo hay que compartirla', async () => {
    const admin = await configurarPanel();
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
    Object.assign(process.env, { GOOGLE_CLIENT_EMAIL: 'panel@proyecto.iam.gserviceaccount.com', GOOGLE_PRIVATE_KEY: privateKey.replace(/\n/g, '\\n'), GOOGLE_HOJA: 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789' });
    rutas.push([/oauth2/, () => responder({ access_token: 't', expires_in: 3600 })], [/sheets\.googleapis/, () => responder({ error: { status: 'PERMISSION_DENIED', message: 'no' } }, 403)]);
    const panel = await admin.json('estado');
    assert.equal(panel.planilla.listo, false);
    assert.match(panel.planilla.aviso, /Compartila con panel@proyecto\.iam\.gserviceaccount\.com/);
    assert.equal((await admin.post('registro', REGISTRO)).status, 503);
  });
});
