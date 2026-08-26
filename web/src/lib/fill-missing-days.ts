export interface DatedValue {
  date: string; // YYYY-MM-DD
  value: number | null;
}

/**
 * Genera los últimos `days` días de calendario y rellena los que no
 * tienen fila con `value: null` explícito (ver plan: un día sin dato NO
 * se omite, se escribe null -- si no, el denominador de cualquier
 * promedio queda mentido). El día de hoy queda afuera a propósito: es
 * el día parcial, y `metrics.is_complete_day` (Python) ya lo excluye de
 * las estadísticas -- acá se aplica la misma regla del lado de lectura.
 */
export function fillMissingDays(rows: DatedValue[], days: number, today: Date = new Date()): DatedValue[] {
  const byDate = new Map(rows.map((r) => [r.date, r.value]));
  const filled: DatedValue[] = [];
  for (let offset = days; offset >= 1; offset--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - offset);
    const iso = d.toISOString().slice(0, 10);
    filled.push({ date: iso, value: byDate.get(iso) ?? null });
  }
  return filled;
}
