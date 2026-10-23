// Agenda de notificaciones para la app: los avisos programados de los próximos días (manuales y automáticos de
// crédito, ofertas y novedades), ya filtrados por la pausa general, el horario permitido y el máximo por día
// (panel/src/notificaciones.ts). Cada celular la baja y programa los avisos él mismo; `botones` trae el texto del
// botón de cada destino; incluye los de las últimas horas (y los "Enviar ahora") para el celular que se conecta
// tarde. Si la base no responde, `enVivo` = false: la app conserva la agenda que ya tenía.
import type { APIRoute } from 'astro';
import { obtenerDb } from '../../../../../panel/src/db.ts';
import { obtenerAperturas } from '../../../../../panel/src/creditos.ts';
import { agendaDe, agendaPublica, DESTINOS, enviadasRecientes } from '../../../../../panel/src/notificaciones.ts';
import { ETIQUETAS_WEB } from '../../../../lib/cache-publica';
import { respuestaApp } from '../../../../lib/api-app';

export const prerender = false;

const botones = Object.fromEntries(Object.entries(DESTINOS).map(([k, v]) => [k, v.boton]));

export const GET: APIRoute = async () => {
  try {
    const db = await obtenerDb();
    const { agenda, ajustes } = await agendaDe(db, await obtenerAperturas(db));
    const avisos = ajustes.activas ? [...(await enviadasRecientes(db)), ...agendaPublica(agenda)] : [];
    // `horario`: la app no muestra fuera de ese horario los avisos que le llegan tarde.
    return respuestaApp({ activas: ajustes.activas, botones, horario: { desde: ajustes.desde, hasta: ajustes.hasta }, avisos }, true, ETIQUETAS_WEB.notificaciones);
  } catch (e) {
    console.error('agenda de notificaciones: no se pudo leer la base de datos:', (e as Error).message);
    return respuestaApp({ activas: true, botones, avisos: [] }, false);
  }
};
