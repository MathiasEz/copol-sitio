// Destino de los registros: la planilla de Excel en la nube o, solo en la computadora de desarrollo y sin
// Microsoft configurado, un archivo CSV local (datos/registros.csv) para probar el panel.
import { appendFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLUMNAS } from './campos.js';
import * as ms from './microsoft.js';

const csv = () => process.env.REGISTROS_CSV || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'datos', 'registros.csv');

/** 'aplicacion' | 'cuenta' | 'local' | null (sin configurar). */
export function modo() {
  const m = ms.modoMicrosoft();
  if (m) return m;
  return process.env.VERCEL ? null : 'local';
}

/** Estado para la pantalla: si se puede guardar, con qué cuenta y el enlace para abrir la planilla. */
export async function estado() {
  const m = modo();
  if (!m) return { modo: null, listo: false, aviso: 'La planilla de Excel todavía no está configurada (variables MS_… en Vercel). Ver el README del panel.' };
  if (m === 'local') return { modo: m, listo: true, nombre: 'datos/registros.csv', aviso: 'Modo de prueba local: los registros se guardan en datos/registros.csv, no en Excel.' };
  const falta = ms.faltaConfigurar();
  if (falta) return { modo: m, listo: false, aviso: falta };
  const cuenta = m === 'cuenta' ? await ms.cuentaConectada() : process.env.MS_USUARIO;
  if (m === 'cuenta' && !cuenta) return { modo: m, listo: false, conectar: true, aviso: `Falta conectar la cuenta de Microsoft dueña de la planilla (${process.env.MS_CUENTA}).` };
  try {
    const info = await ms.infoArchivo();
    return { modo: m, listo: true, cuenta, nombre: info.nombre, enlace: info.enlace };
  } catch (e) {
    return { modo: m, listo: false, cuenta, conectar: m === 'cuenta' && e.reconectar, aviso: e.message };
  }
}

function lineaCsv(valores) {
  return `${valores.map((v) => (/[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(';')}\n`;
}

export async function agregar(fila) {
  const m = modo();
  if (!m) throw new ms.ErrorPlanilla('La planilla de Excel todavía no está configurada.', { status: 503 });
  if (m !== 'local') return ms.agregarFila(fila);
  const archivo = csv();
  await mkdir(dirname(archivo), { recursive: true });
  const existe = await stat(archivo).then(() => true, () => false);
  await appendFile(archivo, (existe ? '' : `﻿${lineaCsv(COLUMNAS)}`) + lineaCsv(fila));
}
