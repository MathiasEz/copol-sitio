// Fechas en hora de Uruguay (las publicaciones programadas y las aperturas de crédito se cuentan por día).

/** Fecha de hoy en Uruguay (AAAA-MM-DD). */
export const hoyUruguay = (fecha = new Date()) => fecha.toLocaleDateString('en-CA', { timeZone: 'America/Montevideo' });

/** Fecha AAAA-MM-DD válida, o '' si no lo es. */
export function fechaValida(v: unknown): string {
  const t = typeof v === 'string' ? v.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return '';
  const d = new Date(`${t}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t ? t : '';
}
