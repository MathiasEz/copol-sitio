// Envío de notificaciones de la app: "Enviar ahora", avisos automáticos (ofertas y novedades al publicarse) y
// sincronización de la agenda en los celulares. Las reglas de cuándo puede salir un aviso están en notificaciones.ts.
import { waitUntil } from '@vercel/functions';
import { registrar, type Actor } from './auditoria.ts';
import { obtenerAperturas } from './creditos.ts';
import type { Db } from './db.ts';
import { hoyUruguay } from './fechas.ts';
import * as NT from './notificaciones.ts';
import { enviarAviso, sincronizarCelulares, type OpcionesPush } from './push.ts';

export interface OpcionesEnvio extends OpcionesPush {
  /** Pruebas: esperar a que termine el envío en lugar de dejarlo en segundo plano. */
  esperar?: boolean;
}

/** En Vercel, el envío sigue después de responder (el panel no espera a miles de celulares). */
export async function segundoPlano(tarea: Promise<unknown>, o: OpcionesEnvio) {
  const segura = tarea.catch((e) => console.error('notificaciones:', (e as Error).message));
  if (o.esperar || !process.env.VERCEL) return segura;
  waitUntil(segura);
}

/** Avisos que ya salieron o van a salir hoy (cuentan para el máximo del día). */
export async function usadosHoy(db: Db, hoy = hoyUruguay()) {
  const { agenda, enviadas, ajustes } = await NT.agendaDe(db, await obtenerAperturas(db), hoy);
  return { usados: enviadas + agenda.filter((x) => x.fecha === hoy && !x.omitida).length, ajustes };
}

/** Manda ya una notificación guardada y la marca como enviada. */
export async function enviarYa(db: Db, n: NT.Notificacion, o: OpcionesEnvio) {
  const alcance = (await NT.tokensPara(db, n.categoria)).length;
  await NT.marcarEnviada(db, n.id, alcance);
  await segundoPlano(enviarAviso(db, { id: `n${n.id}`, titulo: n.titulo, texto: n.texto, destino: n.destino, boton: Boolean(n.con_boton), categoria: n.categoria }, n.id, o), o);
  return alcance;
}

export const sincronizar = (db: Db, o: OpcionesEnvio) => segundoPlano(sincronizarCelulares(db, o), o);

/**
 * Aviso automático al publicar ofertas o una novedad: una sola vez por `origen`. Sale ya si está dentro del horario y
 * queda lugar hoy; si no, se programa para el próximo momento permitido (o para `desdeFecha`, si se publica más adelante).
 */
export async function avisoAutomatico(db: Db, actor: Actor, tipo: 'ofertas' | 'novedades', origen: string, base: Pick<NT.DatosNotificacion, 'titulo' | 'texto' | 'destino'>, o: OpcionesEnvio, desdeFecha?: string | null) {
  const { usados, ajustes } = await usadosHoy(db);
  if (!ajustes.activas || !ajustes[tipo].activo || (await NT.existeOrigen(db, origen))) return null;
  const hoy = hoyUruguay();
  let m = desdeFecha && desdeFecha > hoy ? { fecha: desdeFecha, hora: ajustes.desde, yaMismo: false } : NT.proximoMomento(ajustes);
  if (m.yaMismo && usados >= ajustes.maxPorDia) m = { fecha: NT.sumarDias(hoy, 1), hora: ajustes.desde, yaMismo: false };
  const datos: NT.DatosNotificacion = {
    titulo: base.titulo.slice(0, NT.LIMITES.titulo), texto: base.texto.slice(0, NT.LIMITES.texto), destino: base.destino, conBoton: true,
    categoria: tipo, repeticion: 'una-vez', fecha: m.fecha, hora: m.hora, dias: null, hasta: null,
  };
  let n: NT.Notificacion;
  try {
    n = await NT.crearNotificacion(db, datos, 'sistema', origen);
  } catch {
    return null; // otra instancia la creó al mismo tiempo (origen único)
  }
  const alcance = m.yaMismo ? await enviarYa(db, n, o) : null;
  if (!m.yaMismo) await sincronizar(db, o);
  await registrar(db, actor, 'notificacion.automatica', 'notificacion', String(n.id), { titulo: n.titulo, origen, enviada: m.yaMismo, alcance, programada: m.yaMismo ? null : `${m.fecha} ${m.hora}` });
  return n;
}
