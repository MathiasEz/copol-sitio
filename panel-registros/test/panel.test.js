// Pruebas del panel de registros (node --test). Microsoft, Upstash y AI Gateway se simulan: no salen pedidos.
import { after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'registros-'));
const BASE_ENV = { ...process.env };
const ORIGEN = 'http://localhost:4400';

function configurar(extra = {}) {
  for (const k of Object.keys(process.env)) if (!(k in BASE_ENV)) delete process.env[k];
  for (const k of ['BLOB_READ_WRITE_TOKEN', 'VERCEL', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_USUARIO', 'MS_CUENTA', 'MS_TENANT', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN', 'IA_APAGADA']) delete process.env[k];
  Object.assign(process.env, { PANEL_CLAVE: 'clave-de-prueba-123', REGISTROS_CSV: join(dir, `r-${Math.random()}.csv`) }, extra);
}

const campos = await import('../api/_lib/campos.js');
const sesionApi = await import('../api/sesion.js');
const registroApi = await import('../api/registro.js');
const asistenteApi = await import('../api/asistente.js');
const conectarApi = await import('../api/microsoft/conectar.js');
const vueltaApi = await import('../api/microsoft/vuelta.js');
const ms = await import('../api/_lib/microsoft.js');
const almacen = await import('../api/_lib/almacen.js');

const pedido = (ruta, { metodo = 'GET', datos, cookie, origen = ORIGEN } = {}) => new Request(`${ORIGEN}${ruta}`, {
  method: metodo,
  headers: { host: 'localhost:4400', ...(origen ? { origin: origen } : {}), ...(cookie ? { cookie } : {}), ...(datos ? { 'content-type': 'application/json' } : {}) },
  body: datos ? JSON.stringify(datos) : undefined,
});

async function ingresar() {
  const r = await sesionApi.POST(pedido('/api/sesion', { metodo: 'POST', datos: { nombre: 'Ana', clave: 'clave-de-prueba-123' } }));
  assert.equal(r.status, 200);
  return r.headers.get('set-cookie').split(';')[0];
}

const REGISTRO = { nombre: 'Juan Pérez', socio: '12345', cedula: '1.234.567-2', direccion: 'Av. Italia 3456 apto 2', producto: 'Heladera Samsung RT38', codigo: '457939', service: '' };

// ── fetch simulado ──
let llamadas = [];
let rutas = [];
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (url, opciones = {}) => {
  const u = String(url);
  const cuerpo = opciones.body instanceof URLSearchParams ? Object.fromEntries(opciones.body) : opciones.body ? JSON.parse(opciones.body) : undefined;
  llamadas.push({ url: u, metodo: opciones.method ?? 'GET', cuerpo });
  for (const [patron, manejador] of rutas) {
    if (patron.test(u)) return manejador(u, opciones, cuerpo);
  }
  throw new Error(`fetch no simulado: ${u}`);
};
after(async () => {
  globalThis.fetch = fetchOriginal;
  await rm(dir, { recursive: true, force: true });
});
const responder = (datos, status = 200) => new Response(JSON.stringify(datos), { status, headers: { 'content-type': 'application/json' } });

/** Upstash simulado en memoria. */
function redisFalso() {
  const datos = new Map();
  return [/upstash\.test/, (_u, _o, [cmd, clave, valor]) => {
    if (cmd === 'GET') return responder({ result: datos.get(clave) ?? null });
    if (cmd === 'SET') { datos.set(clave, valor); return responder({ result: 'OK' }); }
    if (cmd === 'DEL') { datos.delete(clave); return responder({ result: 1 }); }
    if (cmd === 'INCR') { const n = Number(datos.get(clave) ?? 0) + 1; datos.set(clave, n); return responder({ result: n }); }
    return responder({ result: 1 });
  }, datos];
}

beforeEach(() => {
  configurar();
  llamadas = [];
  rutas = [];
  ms.usarFetch((...a) => globalThis.fetch(...a));
});

describe('campos', () => {
  test('cédula: acepta con y sin puntos, rechaza el dígito verificador equivocado', () => {
    assert.equal(campos.formatoCedula('12345672'), '1.234.567-2');
    assert.equal(campos.formatoCedula('1.234.567-2'), '1.234.567-2');
    assert.equal(campos.formatoCedula('1234567-3'), null);
    assert.equal(campos.formatoCedula('123'), null);
    assert.equal(campos.formatoCedula('512345-1'.replace(/\D/g, '').slice(0, 6) + campos.digitoCedula('512345')), `512.345-${campos.digitoCedula('512345')}`);
  });

  test('registro: obligatorios, socio numérico y service opcional', () => {
    assert.deepEqual(Object.keys(campos.validarRegistro({}).errores).sort(), ['cedula', 'codigo', 'direccion', 'nombre', 'producto', 'socio']);
    assert.ok(campos.validarRegistro({ ...REGISTRO, socio: '12a' }).errores.socio);
    const { datos } = campos.validarRegistro({ ...REGISTRO, socio: '12.345', cedula: '12345672' });
    assert.equal(datos.socio, '12345');
    assert.equal(datos.cedula, '1.234.567-2');
    assert.equal(datos.service, '');
  });

  test('fila: no deja pasar fórmulas a Excel y conserva ceros del socio', () => {
    const fila = campos.filaPlanilla({ ...REGISTRO, socio: '0123', service: '=HYPERLINK("http://x")', producto: '+54', codigo: '@a' }, 'Ana', new Date('2026-10-23T15:05:00Z'));
    assert.equal(fila.length, campos.COLUMNAS.length);
    assert.equal(fila[0], '2026-10-23 12:05');
    assert.equal(fila[2], "'0123");
    assert.equal(fila[5], `'=HYPERLINK("http://x")`);
    assert.equal(fila[6], "'+54");
    assert.equal(fila[7], "'@a");
    assert.equal(fila[8], 'Ana');
  });
});

describe('acceso', () => {
  test('sin sesión no se puede guardar ni usar el asistente', async () => {
    assert.equal((await registroApi.POST(pedido('/api/registro', { metodo: 'POST', datos: REGISTRO }))).status, 401);
    assert.equal((await asistenteApi.POST(pedido('/api/asistente', { metodo: 'POST', datos: { texto: 'hola mundo' } }))).status, 401);
    const estado = await (await sesionApi.GET(pedido('/api/sesion'))).json();
    assert.equal(estado.sesion, null);
    assert.equal(estado.planilla, undefined);
  });

  test('clave incorrecta, nombre vacío y otro origen se rechazan', async () => {
    assert.equal((await sesionApi.POST(pedido('/api/sesion', { metodo: 'POST', datos: { nombre: 'Ana', clave: 'otra-clave-123' } }))).status, 401);
    assert.equal((await sesionApi.POST(pedido('/api/sesion', { metodo: 'POST', datos: { nombre: '', clave: 'clave-de-prueba-123' } }))).status, 400);
    assert.equal((await sesionApi.POST(pedido('/api/sesion', { metodo: 'POST', origen: 'https://malo.example', datos: { nombre: 'Ana', clave: 'clave-de-prueba-123' } }))).status, 403);
  });

  test('sin PANEL_CLAVE (o muy corta) no se puede ingresar', async () => {
    configurar({ PANEL_CLAVE: 'corta' });
    assert.equal((await sesionApi.POST(pedido('/api/sesion', { metodo: 'POST', datos: { nombre: 'Ana', clave: 'corta' } }))).status, 503);
  });

  test('la cookie firmada no se puede alterar y cambiar la clave cierra la sesión', async () => {
    const cookie = await ingresar();
    const [nombre, valor] = cookie.split('=');
    const [cuerpo, firma] = decodeURIComponent(valor).split('.');
    const falso = Buffer.from(JSON.stringify({ nombre: 'Intruso', exp: Date.now() + 1e7 })).toString('base64url');
    assert.equal((await registroApi.POST(pedido('/api/registro', { metodo: 'POST', datos: REGISTRO, cookie: `${nombre}=${falso}.${firma}` }))).status, 401);
    assert.ok(cuerpo);
    process.env.PANEL_CLAVE = 'clave-nueva-456789';
    assert.equal((await registroApi.POST(pedido('/api/registro', { metodo: 'POST', datos: REGISTRO, cookie }))).status, 401);
  });

  test('con Upstash, más de 10 intentos por IP se bloquean', async () => {
    configurar({ KV_REST_API_URL: 'https://upstash.test', KV_REST_API_TOKEN: 't' });
    rutas.push(redisFalso());
    for (let i = 0; i < 10; i++) await sesionApi.POST(pedido('/api/sesion', { metodo: 'POST', datos: { nombre: 'Ana', clave: 'mal' } }));
    assert.equal((await sesionApi.POST(pedido('/api/sesion', { metodo: 'POST', datos: { nombre: 'Ana', clave: 'clave-de-prueba-123' } }))).status, 429);
  });
});

describe('guardar (modo local)', () => {
  test('valida en el servidor y escribe la fila en el CSV con quien cargó', async () => {
    const cookie = await ingresar();
    const malo = await registroApi.POST(pedido('/api/registro', { metodo: 'POST', datos: { ...REGISTRO, cedula: '1234567-3' }, cookie }));
    assert.equal(malo.status, 422);
    assert.ok((await malo.json()).errores.cedula);
    const r = await registroApi.POST(pedido('/api/registro', { metodo: 'POST', datos: { ...REGISTRO, service: 'Instalación' }, cookie }));
    assert.equal(r.status, 200);
    const csv = await readFile(process.env.REGISTROS_CSV, 'utf8');
    const [cabecera, fila] = csv.replace(/^﻿/, '').trim().split('\n');
    assert.equal(cabecera, campos.COLUMNAS.join(';'));
    assert.match(fila, /;Juan Pérez;12345;1\.234\.567-2;Av\. Italia 3456 apto 2;Instalación;Heladera Samsung RT38;457939;Ana$/);
  });

  test('en Vercel sin Microsoft configurado avisa en lugar de guardar', async () => {
    configurar({ VERCEL: '1' });
    const cookie = await ingresar();
    const r = await registroApi.POST(pedido('/api/registro', { metodo: 'POST', datos: REGISTRO, cookie }));
    assert.equal(r.status, 503);
    const estado = await (await sesionApi.GET(pedido('/api/sesion', { cookie }))).json();
    assert.equal(estado.planilla.listo, false);
  });
});

/** Graph simulado: archivo existente, tabla opcional. */
function graphFalso({ tabla = false } = {}) {
  const estado = { tabla, filas: [], hojas: ['Hoja1'], vacia: null };
  return [/graph\.microsoft\.com/, (u, o, cuerpo) => {
    const camino = decodeURIComponent(new URL(u).pathname);
    const metodo = o.method ?? 'GET';
    if (camino.endsWith('Registros COPOL.xlsx:') && metodo === 'GET') return responder({ name: 'Registros COPOL.xlsx', webUrl: 'https://onedrive.test/abrir' });
    if (camino.endsWith('/tables/Registros/headerRowRange')) return estado.tabla ? responder({ values: [campos.COLUMNAS] }) : responder({ error: { code: 'ItemNotFound' } }, 404);
    if (camino.endsWith('/worksheets/add')) { estado.hojas.push(cuerpo.name); return responder({ name: cuerpo.name }); }
    if (camino.includes("range(address='A1:I1')") && metodo === 'PATCH') return responder({});
    if (camino.endsWith('/worksheets/Registros/tables/add')) { estado.tabla = true; estado.vacia = 'A2:I2'; return responder({ id: '{T1}', name: 'Tabla1' }); }
    if (camino.endsWith('/tables/{T1}') && metodo === 'PATCH') return responder({ name: cuerpo.name });
    if (camino.endsWith('/format/font')) return responder({});
    if (camino.endsWith('/tables/Registros/dataBodyRange')) return responder({ address: 'Registros!A2:I2', values: [Array(9).fill('')] });
    if (camino.includes("range(address='A2:I2')") && metodo === 'PATCH') { estado.filas.push(cuerpo.values[0]); estado.vacia = null; return responder({}); }
    if (camino.endsWith('/tables/Registros/rows/add') && metodo === 'POST') { estado.filas.push(cuerpo.values[0]); return responder({ index: estado.filas.length - 1 }); }
    return responder({ error: { code: 'Desconocido', message: camino } }, 400);
  }, estado];
}

describe('Excel (modo aplicación)', () => {
  test('crea la tabla en una hoja nueva la primera vez y después agrega filas', async () => {
    configurar({ MS_CLIENT_ID: 'id', MS_CLIENT_SECRET: 's', MS_USUARIO: 'registros@copol.test', MS_TENANT: 'inquilino', EXCEL_RUTA: '/Registros COPOL.xlsx' });
    const [patron, manejador, estado] = graphFalso();
    rutas.push([/login\.microsoftonline\.com/, (_u, _o, c) => {
      assert.equal(c.grant_type, 'client_credentials');
      return responder({ access_token: 'acceso-app', expires_in: 3600 });
    }], [patron, manejador]);
    const cookie = await ingresar();
    const estadoPanel = await (await sesionApi.GET(pedido('/api/sesion', { cookie }))).json();
    assert.equal(estadoPanel.planilla.listo, true);
    assert.equal(estadoPanel.planilla.enlace, 'https://onedrive.test/abrir');

    assert.equal((await registroApi.POST(pedido('/api/registro', { metodo: 'POST', datos: REGISTRO, cookie }))).status, 200);
    assert.equal((await registroApi.POST(pedido('/api/registro', { metodo: 'POST', datos: { ...REGISTRO, nombre: 'María Gómez' }, cookie }))).status, 200);
    assert.deepEqual(estado.hojas, ['Hoja1', 'Registros']);
    assert.equal(estado.filas.length, 2);
    assert.equal(estado.filas[0][1], 'Juan Pérez');
    assert.equal(estado.filas[1][1], 'María Gómez');
    assert.ok(llamadas.filter((l) => l.url.includes('graph')).every((l) => l.url.includes('/users/registros%40copol.test/drive/root:/Registros%20COPOL.xlsx:')));
    assert.equal(llamadas.filter((l) => l.url.includes('login.microsoftonline')).length, 1, 'el token se reutiliza');
  });

  test('una tabla con otras columnas se informa sin escribir', async () => {
    configurar({ MS_CLIENT_ID: 'id', MS_CLIENT_SECRET: 's', MS_USUARIO: 'u@copol.test', MS_TENANT: 'inquilino', EXCEL_RUTA: 'Registros COPOL.xlsx' });
    rutas.push([/login/, () => responder({ access_token: 'a', expires_in: 3600 })], [/headerRowRange/, () => responder({ values: [['A', 'B']] })], graphFalso().slice(0, 2));
    const cookie = await ingresar();
    const r = await registroApi.POST(pedido('/api/registro', { metodo: 'POST', datos: REGISTRO, cookie }));
    assert.equal(r.status, 409);
    assert.match((await r.json()).error, /tiene 2 columnas/);
  });
});

describe('Excel (modo cuenta)', () => {
  const ENV_CUENTA = { MS_CLIENT_ID: 'id', MS_CLIENT_SECRET: 's', MS_CUENTA: 'Planillas@outlook.com', KV_REST_API_URL: 'https://upstash.test', KV_REST_API_TOKEN: 't', EXCEL_RUTA: 'Registros COPOL.xlsx' };

  test('pide conectar, solo acepta la cuenta indicada y después guarda renovando el permiso', async () => {
    configurar(ENV_CUENTA);
    const [pRedis, mRedis, redis] = redisFalso();
    const [pGraph, mGraph, estado] = graphFalso({ tabla: true });
    let cuentaQueEntra = 'otra@outlook.com';
    rutas.push([pRedis, mRedis], [/graph\.microsoft\.com\/v1\.0\/me\?/, () => responder({ userPrincipalName: cuentaQueEntra })], [pGraph, mGraph], [/login\.microsoftonline\.com\/common\/oauth2\/v2\.0\/token/, (_u, _o, c) => {
      if (c.grant_type === 'authorization_code') {
        assert.equal(c.code, 'codigo-ms');
        assert.ok(c.code_verifier);
        return responder({ access_token: 'acceso-1', refresh_token: 'renovar-1', expires_in: 3600 });
      }
      assert.equal(c.refresh_token, 'renovar-1');
      return responder({ access_token: 'acceso-2', refresh_token: 'renovar-2', expires_in: 3600 });
    }]);
    const cookie = await ingresar();
    let panel = await (await sesionApi.GET(pedido('/api/sesion', { cookie }))).json();
    assert.equal(panel.planilla.conectar, true);
    assert.equal((await registroApi.POST(pedido('/api/registro', { metodo: 'POST', datos: REGISTRO, cookie }))).status, 503);

    // Inicio de sesión con Microsoft
    const ida = await conectarApi.GET(pedido('/api/microsoft/conectar', { cookie, origen: null }));
    assert.equal(ida.status, 302);
    const destino = new URL(ida.headers.get('location'));
    assert.equal(destino.host, 'login.microsoftonline.com');
    assert.equal(destino.searchParams.get('redirect_uri'), 'http://localhost:4400/api/microsoft/vuelta');
    assert.equal(destino.searchParams.get('code_challenge_method'), 'S256');
    const cookieMs = ida.headers.get('set-cookie').split(';')[0];
    const estadoMs = destino.searchParams.get('state');
    const volver = (state) => vueltaApi.GET(pedido(`/api/microsoft/vuelta?code=codigo-ms&state=${state}`, { cookie: `${cookie}; ${cookieMs}`, origen: null }));

    assert.match((await volver('otro-estado')).headers.get('location'), /microsoft=error/);
    const conOtra = await volver(estadoMs);
    assert.match(new URL(conOtra.headers.get('location'), ORIGEN).searchParams.get('mensaje'), /la planilla es de Planillas@outlook\.com/);
    assert.equal(redis.get('copol-registros:ms:renovacion'), undefined);

    cuentaQueEntra = 'planillas@outlook.com';
    ms.usarFetch((...a) => globalThis.fetch(...a)); // olvida el token en memoria
    assert.match((await volver(estadoMs)).headers.get('location'), /microsoft=conectado/);
    assert.equal(redis.get('copol-registros:ms:renovacion'), 'renovar-1');
    panel = await (await sesionApi.GET(pedido('/api/sesion', { cookie }))).json();
    assert.equal(panel.planilla.listo, true);
    assert.equal(panel.planilla.cuenta, 'planillas@outlook.com');

    // El token guardado vence: se renueva y se guarda el nuevo permiso de renovación.
    redis.delete('copol-registros:ms:acceso');
    ms.usarFetch((...a) => globalThis.fetch(...a));
    assert.equal((await registroApi.POST(pedido('/api/registro', { metodo: 'POST', datos: REGISTRO, cookie }))).status, 200);
    assert.equal(redis.get('copol-registros:ms:renovacion'), 'renovar-2');
    assert.equal(estado.filas.length, 1);
    assert.ok(llamadas.filter((l) => l.url.includes('graph.microsoft.com/v1.0/me/drive')).length > 0);
  });

  test('si Microsoft revoca el permiso, pide volver a conectar', async () => {
    configurar(ENV_CUENTA);
    const [pRedis, mRedis, redis] = redisFalso();
    redis.set('copol-registros:ms:renovacion', 'vencido');
    redis.set('copol-registros:ms:cuenta', 'planillas@outlook.com');
    rutas.push([pRedis, mRedis], [/login\.microsoftonline/, () => responder({ error: 'invalid_grant' }, 400)]);
    const cookie = await ingresar();
    const r = await registroApi.POST(pedido('/api/registro', { metodo: 'POST', datos: REGISTRO, cookie }));
    assert.equal(r.status, 502);
    assert.equal((await r.json()).conectar, true);
    assert.equal(redis.get('copol-registros:ms:renovacion'), undefined);
  });
});

describe('asistente', () => {
  test('completa los campos con lo que devuelve la herramienta y normaliza la cédula', async () => {
    configurar({ AI_GATEWAY_API_KEY: 'clave-ia' });
    rutas.push([/ai-gateway\.vercel\.sh/, (_u, o, c) => {
      assert.equal(o.headers.authorization, 'Bearer clave-ia');
      assert.equal(c.tool_choice.name, 'completar_formulario');
      assert.match(c.messages[0].content, /Juan/);
      return responder({ content: [{ type: 'tool_use', name: 'completar_formulario', input: { nombre: 'Juan Pérez', socio: '12.345', cedula: '12345672', direccion: 'Av. Italia 3456', service: '', producto: 'Heladera', codigo: '', faltan: ['codigo'], notas: '', extra: 'x' } }], stop_reason: 'tool_use' });
    }]);
    const cookie = await ingresar();
    const r = await asistenteApi.POST(pedido('/api/asistente', { metodo: 'POST', datos: { texto: 'Juan Pérez socio 12.345 ci 12345672 Av. Italia 3456 heladera' }, cookie }));
    assert.equal(r.status, 200);
    const datos = await r.json();
    assert.deepEqual(datos.campos, { nombre: 'Juan Pérez', socio: '12345', cedula: '1.234.567-2', direccion: 'Av. Italia 3456', producto: 'Heladera' });
    assert.deepEqual(datos.faltan, ['Código interno']);
  });

  test('si la IA no está disponible lo dice y el formulario sigue funcionando', async () => {
    const cookie = await ingresar();
    assert.equal((await asistenteApi.POST(pedido('/api/asistente', { metodo: 'POST', datos: { texto: 'Juan Pérez socio 1' }, cookie }))).status, 503);
    configurar({ AI_GATEWAY_API_KEY: 'clave-ia' });
    rutas.push([/ai-gateway/, () => responder({ error: 'insufficient funds' }, 402)]);
    const r = await asistenteApi.POST(pedido('/api/asistente', { metodo: 'POST', datos: { texto: 'Juan Pérez socio 1' }, cookie: await ingresar() }));
    assert.equal(r.status, 502);
    assert.match((await r.json()).error, /crédito/);
  });
});

describe('almacén en Vercel Blob privado', () => {
  function blobFalso() {
    const datos = new Map();
    const opciones = [];
    return {
      datos, opciones,
      get: async (ruta, o) => { opciones.push(o); return datos.has(ruta) ? { statusCode: 200, stream: new Blob([datos.get(ruta)]).stream() } : null; },
      put: async (ruta, cuerpo, o) => { opciones.push(o); datos.set(ruta, cuerpo); return { pathname: ruta }; },
      del: async (ruta) => { datos.delete(ruta); },
    };
  }

  test('guarda privado, respeta el vencimiento y cuenta', async () => {
    configurar({ BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_prueba' });
    const falso = blobFalso();
    almacen.usarBlob(falso);
    assert.equal(almacen.almacenConfigurado(), true);
    await almacen.guardar('ms:renovacion', 'renovar-1');
    assert.equal(await almacen.leer('ms:renovacion'), 'renovar-1');
    assert.ok(falso.opciones.every((o) => o.access === 'private'));
    assert.ok([...falso.datos.keys()].every((k) => /^registros\/[a-z0-9._-]+\.json$/i.test(k)));
    await almacen.guardar('temporal', 'x', 1);
    falso.datos.set('registros/temporal.json', JSON.stringify({ v: 'x', vence: Date.now() - 1 }));
    assert.equal(await almacen.leer('temporal'), null);
    assert.equal(await almacen.contar('prueba', 60), 1);
    assert.equal(await almacen.contar('prueba', 60), 2);
    assert.equal(await almacen.contador('prueba'), 2);
    await almacen.borrar('ms:renovacion');
    assert.equal(await almacen.leer('ms:renovacion'), null);
  });

  test('bloquea la IP tras 10 claves equivocadas y con la cuenta de Microsoft usa el token guardado', async () => {
    configurar({ BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_prueba', MS_CLIENT_ID: 'id', MS_CLIENT_SECRET: 's', MS_CUENTA: 'planillas@outlook.com', EXCEL_RUTA: 'Registros COPOL.xlsx' });
    const falso = blobFalso();
    almacen.usarBlob(falso);
    await almacen.guardar('ms:cuenta', 'planillas@outlook.com');
    await almacen.guardar('ms:acceso', JSON.stringify({ valor: 'acceso-guardado', vence: Date.now() + 3_600_000 }));
    const [pGraph, mGraph, estado] = graphFalso({ tabla: true });
    rutas.push([pGraph, (u, o, c) => {
      assert.equal(o.headers.authorization, 'Bearer acceso-guardado');
      return mGraph(u, o, c);
    }]);
    const cookie = await ingresar();
    assert.equal((await registroApi.POST(pedido('/api/registro', { metodo: 'POST', datos: REGISTRO, cookie }))).status, 200);
    assert.equal(estado.filas.length, 1);
    for (let i = 0; i < 10; i++) await sesionApi.POST(pedido('/api/sesion', { metodo: 'POST', datos: { nombre: 'Ana', clave: 'mal' } }));
    assert.equal((await sesionApi.POST(pedido('/api/sesion', { metodo: 'POST', datos: { nombre: 'Ana', clave: 'clave-de-prueba-123' } }))).status, 429);
  });
});
