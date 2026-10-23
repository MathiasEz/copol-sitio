// Avisos instantáneos por el servicio de push de Expo (https://exp.host/--/api/v2/push/send): lotes de 100,
// hasta 4 a la vez. Los celulares que ya no existen (DeviceNotRegistered) se borran de la base.
// EXPO_ACCESS_TOKEN (opcional, en Vercel): si en Expo se activa "Enhanced push security", solo quien tenga ese
// token puede mandar avisos a la app.
import { ahora, ejecutar, todas, type Db } from './db.ts';
import { borrarDispositivos, DESTINOS, tokensPara, type Categoria, type Destino } from './notificaciones.ts';

const ENVIO = 'https://exp.host/--/api/v2/push/send';
const RECIBOS = 'https://exp.host/--/api/v2/push/getReceipts';
const LOTE = 100;
const SIMULTANEOS = 4;

export interface MensajePush {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  channelId?: string;
  categoryId?: string;
  priority?: 'default' | 'normal' | 'high';
  ttl?: number;
  _contentAvailable?: boolean;
}
export interface OpcionesPush { fetch?: typeof fetch; token?: string | null }
export interface ResultadoPush { enviados: number; fallidos: number; invalidos: string[]; tickets: { id: string; token: string }[] }

const cabeceras = (token: string | null | undefined) => ({
  'Content-Type': 'application/json',
  Accept: 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

export async function enviarMensajes(mensajes: MensajePush[], { fetch: f = fetch, token = process.env.EXPO_ACCESS_TOKEN }: OpcionesPush = {}): Promise<ResultadoPush> {
  const r: ResultadoPush = { enviados: 0, fallidos: 0, invalidos: [], tickets: [] };
  const lotes: MensajePush[][] = [];
  for (let i = 0; i < mensajes.length; i += LOTE) lotes.push(mensajes.slice(i, i + LOTE));
  const mandar = async (lote: MensajePush[]) => {
    try {
      const res = await f(ENVIO, { method: 'POST', headers: cabeceras(token), body: JSON.stringify(lote), signal: AbortSignal.timeout(20_000) });
      const cuerpo = (await res.json().catch(() => null)) as { data?: { status: string; id?: string; details?: { error?: string } }[] } | null;
      if (!res.ok || !Array.isArray(cuerpo?.data)) {
        r.fallidos += lote.length;
        console.error('push: el servicio de Expo respondió', res.status);
        return;
      }
      cuerpo.data.forEach((t, i) => {
        if (t.status === 'ok' && t.id) {
          r.enviados++;
          r.tickets.push({ id: t.id, token: lote[i].to });
        } else {
          r.fallidos++;
          if (t.details?.error === 'DeviceNotRegistered') r.invalidos.push(lote[i].to);
        }
      });
    } catch (e) {
      r.fallidos += lote.length;
      console.error('push: no se pudo contactar al servicio de Expo:', (e as Error).message);
    }
  };
  for (let i = 0; i < lotes.length; i += SIMULTANEOS) await Promise.all(lotes.slice(i, i + SIMULTANEOS).map(mandar));
  return r;
}

async function guardarResultado(db: Db, r: ResultadoPush, notificacionId: number | null) {
  await borrarDispositivos(db, r.invalidos);
  const t = ahora();
  for (let i = 0; i < r.tickets.length; i += 200) {
    await db.batch(r.tickets.slice(i, i + 200).map((x) => ({ sql: 'INSERT OR IGNORE INTO envios_push (ticket, token, notificacion_id, enviado_en) VALUES (?, ?, ?, ?)', args: [x.id, x.token, notificacionId, t] })), 'write');
  }
}

export interface Aviso { id: string; titulo: string; texto: string; destino: Destino; boton: boolean; categoria: Categoria }

/** Aviso visible a todos los celulares que reciben esa categoría. */
export async function enviarAviso(db: Db, a: Aviso, notificacionId: number | null, opciones: OpcionesPush = {}) {
  const tokens = await tokensPara(db, a.categoria);
  const r = await enviarMensajes(tokens.map((to) => ({
    to,
    title: a.titulo,
    body: a.texto,
    data: { tipo: 'aviso', id: a.id, destino: a.destino },
    channelId: 'avisos',
    ...(a.boton && a.destino in DESTINOS ? { categoryId: `boton-${a.destino}` } : {}),
    priority: 'high',
    // Si el celular está apagado más de un día, el aviso ya no tiene sentido: se descarta.
    ttl: 86_400,
  })), opciones);
  await guardarResultado(db, r, notificacionId);
  return { ...r, alcance: tokens.length };
}

/** Aviso silencioso: cada celular vuelve a bajar la agenda (después de programar, editar o cancelar). */
export async function sincronizarCelulares(db: Db, opciones: OpcionesPush = {}) {
  const tokens = await tokensPara(db);
  const r = await enviarMensajes(tokens.map((to) => ({ to, data: { tipo: 'sincronizar' }, priority: 'high', ttl: 3_600, _contentAvailable: true })), opciones);
  await guardarResultado(db, { ...r, tickets: [] }, null);
  return r;
}

/** Revisa los recibos de los envíos (Expo los guarda 24 h) y borra los celulares que ya no existen. */
export async function revisarRecibos(db: Db, { fetch: f = fetch, token = process.env.EXPO_ACCESS_TOKEN }: OpcionesPush = {}) {
  const limite = new Date(Date.now() - 15 * 60_000).toISOString();
  const pendientes = await todas<{ ticket: string; token: string }>(db, 'SELECT ticket, token FROM envios_push WHERE enviado_en < ? LIMIT 5000', [limite]);
  const invalidos: string[] = [];
  for (let i = 0; i < pendientes.length; i += 1000) {
    const parte = pendientes.slice(i, i + 1000);
    try {
      const res = await f(RECIBOS, { method: 'POST', headers: cabeceras(token), body: JSON.stringify({ ids: parte.map((p) => p.ticket) }), signal: AbortSignal.timeout(20_000) });
      const cuerpo = (await res.json().catch(() => null)) as { data?: Record<string, { status: string; details?: { error?: string } }> } | null;
      for (const p of parte) if (cuerpo?.data?.[p.ticket]?.details?.error === 'DeviceNotRegistered') invalidos.push(p.token);
    } catch (e) {
      console.error('push: no se pudieron revisar los recibos:', (e as Error).message);
    }
  }
  await borrarDispositivos(db, [...new Set(invalidos)]);
  await ejecutar(db, 'DELETE FROM envios_push WHERE enviado_en < ?', [limite]);
  return { revisados: pendientes.length, borrados: new Set(invalidos).size };
}
