// Configuración del panel desde variables de entorno (ver .env.example).
// Ningún secreto vive en el código: las contraseñas solo existen como hash en la base de datos.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE = '/panel';
const RAIZ_PANEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface Config {
  /** Carpeta para imágenes cuando no hay Vercel Blob (desarrollo). */
  dirImagenes: string;
  dirRespaldos: string;
  /** En Vercel (o detrás de un proxy de confianza) la IP real llega en X-Forwarded-For. */
  confiarProxy: boolean;
  sesionInactividadMin: number;
  sesionMaxHoras: number;
  maxImagenMB: number;
}

export function cargarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dirDatos = path.resolve(RAIZ_PANEL, env.PANEL_DATOS ?? 'datos');
  return {
    dirImagenes: path.join(dirDatos, 'imagenes'),
    dirRespaldos: path.resolve(RAIZ_PANEL, env.PANEL_RESPALDOS ?? path.join(dirDatos, 'respaldos')),
    confiarProxy: Boolean(env.VERCEL) || env.PANEL_CONFIAR_PROXY === '1',
    sesionInactividadMin: Number(env.PANEL_SESION_INACTIVIDAD_MIN ?? 30),
    sesionMaxHoras: Number(env.PANEL_SESION_MAX_HORAS ?? 8),
    maxImagenMB: Number(env.PANEL_MAX_IMAGEN_MB ?? 5),
  };
}

export const RUTAS = { raizPanel: RAIZ_PANEL, raizSitio: path.resolve(RAIZ_PANEL, '..') };
