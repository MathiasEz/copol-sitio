// Configuración del panel desde variables de entorno (ver .env.example).
// Ningún secreto vive en el código: las contraseñas solo existen como hash en la base de datos.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Dirección del panel: no se enlaza desde el sitio y no es adivinable (antes era /panel).
 *  Si se cambia, renombrar también la carpeta src/pages/<dirección>/. */
export const BASE = '/gestion-27wn7gsmvn';
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
  /** Consultas al asistente por usuario y por día (hora de Uruguay). */
  asistenteLimiteDia: number;
  /** Conector para Claude (MCP + OAuth). Apagado por defecto: sus metadatos públicos revelarían la dirección del panel. */
  conectorClaude: boolean;
  /** Envío del código de verificación por correo (Resend). Sin clave, la verificación por correo queda en pausa. */
  correo: { clave: string | null; remitente: string };
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
    asistenteLimiteDia: Number(env.PANEL_ASISTENTE_LIMITE_DIA ?? 80),
    conectorClaude: env.PANEL_CONECTOR_CLAUDE === '1',
    correo: { clave: env.RESEND_API_KEY || null, remitente: env.PANEL_CORREO_REMITENTE || 'Panel COPOL <onboarding@resend.dev>' },
  };
}

export const RUTAS = { raizPanel: RAIZ_PANEL, raizSitio: path.resolve(RAIZ_PANEL, '..') };
