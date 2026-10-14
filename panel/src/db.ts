// Base de datos libSQL: el mismo SQL de SQLite, con dos destinos.
// - Producción (Vercel): Turso (TURSO_DATABASE_URL = libsql://…, TURSO_AUTH_TOKEN).
// - Desarrollo y pruebas: un archivo local (file:panel/datos/copol.db por defecto).
// El panel escribe y el sitio público lee la MISMA base: así el stock publicado es siempre el vigente.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Client, InArgs } from '@libsql/client';

export type Db = Client;

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const URL_LOCAL = `file:${path.join(RAIZ, 'panel', 'datos', 'copol.db').replace(/\\/g, '/')}`;

/** URL de la base configurada (o la local de desarrollo). */
export function urlBase(env: NodeJS.ProcessEnv = process.env) {
  const url = env.TURSO_DATABASE_URL || env.DATABASE_URL;
  // En Vercel no hay disco persistente: sin base configurada no se puede guardar nada.
  if (!url && env.VERCEL) throw new Error('Falta configurar TURSO_DATABASE_URL y TURSO_AUTH_TOKEN en Vercel (ver README § Publicar).');
  return url || URL_LOCAL;
}

export async function conectar(url?: string, authToken = process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN): Promise<Db> {
  url ??= urlBase();
  const local = url.startsWith('file:') || url === ':memory:';
  if (local && url.startsWith('file:')) fs.mkdirSync(path.dirname(url.slice(5)), { recursive: true });
  // Remoto: cliente HTTP puro (sin binarios nativos en la función de Vercel).
  const { createClient } = local ? await import('@libsql/client') : await import('@libsql/client/web');
  const db = createClient({ url, authToken: local ? undefined : authToken });
  if (local) await db.execute('PRAGMA journal_mode = WAL').catch(() => {});
  await migrar(db);
  return db;
}

// Conexión reutilizada entre peticiones (en Vercel, mientras la función siga activa).
let compartida: Promise<Db> | null = null;
export function obtenerDb(): Promise<Db> {
  compartida ??= conectar().catch((e) => {
    compartida = null;
    throw e;
  });
  return compartida;
}

const MIGRACIONES: string[] = [
  /* 1 · inventario, usuarios, sesiones y registro */ `
  CREATE TABLE rubros (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, activo INTEGER NOT NULL DEFAULT 1, orden INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE categorias (rubro_id TEXT NOT NULL REFERENCES rubros(id), id TEXT NOT NULL, nombre TEXT NOT NULL, orden INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (rubro_id, id));
  CREATE TABLE productos (
    id TEXT PRIMARY KEY, rubro_id TEXT NOT NULL REFERENCES rubros(id), codigo TEXT, nombre TEXT NOT NULL, descripcion TEXT,
    categoria_id TEXT NOT NULL, subcategoria TEXT, marca TEXT, imagen TEXT, imagen_publicable INTEGER NOT NULL DEFAULT 1,
    stock_estado TEXT NOT NULL CHECK (stock_estado IN ('con-stock', 'sin-stock', 'sin-dato')),
    stock_cantidad INTEGER CHECK (stock_cantidad IS NULL OR stock_cantidad >= 0),
    publicado INTEGER NOT NULL DEFAULT 1, origen TEXT NOT NULL CHECK (origen IN ('importado', 'panel')), origen_url TEXT, consulta_origen TEXT,
    orden INTEGER NOT NULL DEFAULT 0, creado_en TEXT NOT NULL, actualizado_en TEXT NOT NULL, actualizado_por TEXT, version INTEGER NOT NULL DEFAULT 1
  );
  CREATE UNIQUE INDEX productos_codigo ON productos(rubro_id, codigo) WHERE codigo IS NOT NULL;
  CREATE INDEX productos_categoria ON productos(rubro_id, categoria_id);
  CREATE INDEX productos_estado ON productos(rubro_id, stock_estado);
  CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY, usuario TEXT NOT NULL UNIQUE COLLATE NOCASE, nombre TEXT NOT NULL,
    rol TEXT NOT NULL CHECK (rol IN ('administrador', 'editor', 'visualizador')), hash TEXT NOT NULL,
    debe_cambiar_clave INTEGER NOT NULL DEFAULT 1, activo INTEGER NOT NULL DEFAULT 1, protegido INTEGER NOT NULL DEFAULT 0,
    intentos_fallidos INTEGER NOT NULL DEFAULT 0, bloqueado_hasta TEXT, creado_en TEXT NOT NULL, creado_por TEXT, ultimo_acceso TEXT
  );
  CREATE TABLE sesiones (
    id_hash TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, csrf TEXT NOT NULL,
    creada_en TEXT NOT NULL, expira_en TEXT NOT NULL, ultima_actividad TEXT NOT NULL, ip TEXT, agente TEXT
  );
  CREATE INDEX sesiones_usuario ON sesiones(usuario_id);
  CREATE TABLE auditoria (id INTEGER PRIMARY KEY, fecha TEXT NOT NULL, usuario_id INTEGER, usuario TEXT, accion TEXT NOT NULL, entidad TEXT, entidad_id TEXT, detalle TEXT, ip TEXT);
  CREATE INDEX auditoria_fecha ON auditoria(fecha);
  CREATE INDEX auditoria_entidad ON auditoria(entidad, entidad_id)
  `,
  /* 2 · novedades de la portada */ `
  CREATE TABLE novedades (
    id INTEGER PRIMARY KEY, titulo TEXT NOT NULL, texto TEXT, imagen TEXT, imagen_alt TEXT,
    plantilla TEXT NOT NULL CHECK (plantilla IN ('imagen-izquierda', 'imagen-completa', 'texto')),
    enlace_texto TEXT, enlace_url TEXT, publicado INTEGER NOT NULL DEFAULT 0, orden INTEGER NOT NULL DEFAULT 0,
    creado_en TEXT NOT NULL, actualizado_en TEXT NOT NULL, actualizado_por TEXT
  );
  CREATE INDEX novedades_orden ON novedades(publicado, orden)
  `,
  /* 3 · cambios propuestos por el asistente (se aplican solo al confirmarlos) */ `
  CREATE TABLE propuestas (
    id TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, creada_en TEXT NOT NULL, expira_en TEXT NOT NULL,
    estado TEXT NOT NULL CHECK (estado IN ('pendiente', 'aplicada', 'cancelada')), items TEXT NOT NULL, resultado TEXT
  );
  CREATE INDEX propuestas_usuario ON propuestas(usuario_id, estado)
  `,
  /* 4 · conector para Claude (OAuth 2.1 con PKCE): clientes, pedidos de autorización, códigos y tokens.
     Los códigos y tokens se guardan solo como hash SHA-256. */ `
  CREATE TABLE oauth_clientes (id TEXT PRIMARY KEY, nombre TEXT, redirect_uris TEXT NOT NULL, creado_en TEXT NOT NULL);
  CREATE TABLE oauth_pedidos (
    id TEXT PRIMARY KEY, cliente_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, estado_cliente TEXT, desafio TEXT NOT NULL,
    alcance TEXT, recurso TEXT, expira_en TEXT NOT NULL
  );
  CREATE TABLE oauth_codigos (
    codigo_hash TEXT PRIMARY KEY, cliente_id TEXT NOT NULL, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    redirect_uri TEXT NOT NULL, desafio TEXT NOT NULL, alcance TEXT, recurso TEXT, expira_en TEXT NOT NULL
  );
  CREATE TABLE oauth_tokens (
    token_hash TEXT PRIMARY KEY, tipo TEXT NOT NULL CHECK (tipo IN ('acceso', 'renovacion')), cliente_id TEXT NOT NULL,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, alcance TEXT, recurso TEXT,
    creado_en TEXT NOT NULL, expira_en TEXT NOT NULL, ultimo_uso TEXT
  );
  CREATE INDEX oauth_tokens_usuario ON oauth_tokens(usuario_id, cliente_id)
  `,
  /* 5 · acceso: correo de verificación por usuario, PIN de entrada (hash), equipos recordados, verificaciones
     pendientes (código por correo, solo hash) e intentos para los límites (compartidos entre instancias). */ `
  ALTER TABLE usuarios ADD COLUMN correo TEXT;
  UPDATE usuarios SET correo = lower(usuario) WHERE usuario LIKE '%_@_%._%';
  ALTER TABLE sesiones ADD COLUMN lugar TEXT;
  CREATE TABLE ajustes (clave TEXT PRIMARY KEY, valor TEXT NOT NULL, actualizado_en TEXT NOT NULL);
  CREATE TABLE pases (
    token_hash TEXT PRIMARY KEY, tipo TEXT NOT NULL CHECK (tipo IN ('pin', 'equipo')), usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    creado_en TEXT NOT NULL, expira_en TEXT NOT NULL, ultimo_uso TEXT, ip TEXT, agente TEXT, lugar TEXT
  );
  CREATE INDEX pases_tipo ON pases(tipo, expira_en);
  CREATE TABLE verificaciones (
    id_hash TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, correo_ok INTEGER NOT NULL DEFAULT 0,
    codigo_hash TEXT, intentos INTEGER NOT NULL DEFAULT 0, envios INTEGER NOT NULL DEFAULT 0, enviado_en TEXT, expira_en TEXT NOT NULL, volver TEXT
  );
  CREATE TABLE intentos (clave TEXT NOT NULL, fecha TEXT NOT NULL);
  CREATE INDEX intentos_clave ON intentos(clave, fecha)
  `,
];

/** Versión del esquema en una tabla propia (PRAGMA user_version no se conserva igual en todos los destinos). */
async function migrar(db: Db) {
  await db.execute('CREATE TABLE IF NOT EXISTS esquema (version INTEGER NOT NULL)');
  let fila = (await db.execute('SELECT version FROM esquema')).rows[0];
  if (!fila) {
    // Bases creadas antes de esta tabla (versión 1 con PRAGMA user_version).
    const previa = (await db.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'productos'")).rows.length ? 1 : 0;
    await db.execute({ sql: 'INSERT INTO esquema (version) VALUES (?)', args: [previa] });
    fila = { version: previa } as never;
  }
  for (let v = Number(fila.version); v < MIGRACIONES.length; v++) {
    const sentencias = MIGRACIONES[v].split(';').map((s) => s.trim()).filter(Boolean);
    await db.batch([...sentencias, { sql: 'UPDATE esquema SET version = ?', args: [v + 1] }], 'write');
  }
}

export const ahora = () => new Date().toISOString();

type Fila = Record<string, unknown>;
/** Filas como objetos planos. */
export async function todas<T = Fila>(db: Db, sql: string, args: InArgs = []): Promise<T[]> {
  const r = await db.execute({ sql, args });
  return r.rows.map((row) => Object.fromEntries(r.columns.map((c, i) => [c, row[i]]))) as T[];
}
export async function una<T = Fila>(db: Db, sql: string, args: InArgs = []): Promise<T | undefined> {
  return (await todas<T>(db, sql, args))[0];
}
export async function ejecutar(db: Db, sql: string, args: InArgs = []) {
  const r = await db.execute({ sql, args });
  return { cambios: r.rowsAffected, id: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : null };
}
