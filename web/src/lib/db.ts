import { Pool } from "pg";

// Un solo pool para toda la app -- Next.js reusa el módulo entre
// requests en el mismo proceso, así que esto no abre una conexión nueva
// por render. Neon acepta SSL; sslmode=require ya viene en su
// connection string por defecto.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export type DailyMetricRow = {
  localDate: string; // YYYY-MM-DD
  metric: string;
  source: string;
  value: number | null;
  unit: string;
};

export type RollupRow = {
  localDate: string;
  metric: string;
  source: string;
  smoothed: number | null;
  baselineMean: number | null;
  baselineStd: number | null;
  zScore: number | null;
  recentAvg: number | null;
  longAvg: number | null;
  deltaPct: number | null;
};

export type CheckinRow = {
  localDate: string;
  sleepQuality: number | null;
  stress: number | null;
  fatigue: number | null;
  soreness: number | null;
  waterMl: number | null;
  note: string | null;
};

/** (metric, source) que sincronizaron al menos una vez en la ventana --
 * la base para saber de qué vale la pena hablar en el brief de IA.
 * Ver fillMissingDays: esto da la LISTA de series a completar, no la
 * cobertura en sí (eso lo calcula fillMissingDays con el tamaño real de
 * la ventana como denominador). */
export async function getActiveMetricSources(sinceDays: number): Promise<{ metric: string; source: string }[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT metric, source FROM daily_metric WHERE local_date >= current_date - $1::int`,
    [sinceDays]
  );
  return rows.map((r) => ({ metric: r.metric, source: r.source }));
}

/** Días con datos crudos, para el detalle de la pestaña Tendencias y para
 * los puntos debajo de la línea EWMA en TypicalRange. */
export async function getDailyMetrics(metric: string, sinceDays: number): Promise<DailyMetricRow[]> {
  const { rows } = await pool.query(
    `SELECT local_date, metric, source, value, unit
       FROM daily_metric
      WHERE metric = $1 AND local_date >= current_date - $2::int
      ORDER BY local_date`,
    [metric, sinceDays]
  );
  return rows.map((r) => ({
    localDate: r.local_date.toISOString().slice(0, 10),
    metric: r.metric,
    source: r.source,
    value: r.value === null ? null : Number(r.value),
    unit: r.unit,
  }));
}

/** El motor determinista ya calculó esto (ver sync/compute_rollups.py) --
 * la web solo lo lee, nunca recalcula baseline/z-score acá. */
export async function getRollup(metric: string, sinceDays: number): Promise<RollupRow[]> {
  const { rows } = await pool.query(
    `SELECT local_date, metric, source, smoothed, baseline_mean, baseline_std,
            z_score, recent_avg, long_avg, delta_pct
       FROM metric_rollup
      WHERE metric = $1 AND local_date >= current_date - $2::int
      ORDER BY local_date`,
    [metric, sinceDays]
  );
  return rows.map((r) => ({
    localDate: r.local_date.toISOString().slice(0, 10),
    metric: r.metric,
    source: r.source,
    smoothed: r.smoothed === null ? null : Number(r.smoothed),
    baselineMean: r.baseline_mean === null ? null : Number(r.baseline_mean),
    baselineStd: r.baseline_std === null ? null : Number(r.baseline_std),
    zScore: r.z_score === null ? null : Number(r.z_score),
    recentAvg: r.recent_avg === null ? null : Number(r.recent_avg),
    longAvg: r.long_avg === null ? null : Number(r.long_avg),
    deltaPct: r.delta_pct === null ? null : Number(r.delta_pct),
  }));
}

/** El rollup más reciente por métrica -- lo que arma la pestaña Hoy. */
export async function getLatestRollups(): Promise<RollupRow[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (metric, source)
            local_date, metric, source, smoothed, baseline_mean, baseline_std,
            z_score, recent_avg, long_avg, delta_pct
       FROM metric_rollup
      ORDER BY metric, source, local_date DESC`
  );
  return rows.map((r) => ({
    localDate: r.local_date.toISOString().slice(0, 10),
    metric: r.metric,
    source: r.source,
    smoothed: r.smoothed === null ? null : Number(r.smoothed),
    baselineMean: r.baseline_mean === null ? null : Number(r.baseline_mean),
    baselineStd: r.baseline_std === null ? null : Number(r.baseline_std),
    zScore: r.z_score === null ? null : Number(r.z_score),
    recentAvg: r.recent_avg === null ? null : Number(r.recent_avg),
    longAvg: r.long_avg === null ? null : Number(r.long_avg),
    deltaPct: r.delta_pct === null ? null : Number(r.delta_pct),
  }));
}

export async function getCheckins(sinceDays: number): Promise<CheckinRow[]> {
  const { rows } = await pool.query(
    `SELECT local_date, sleep_quality, stress, fatigue, soreness, water_ml, note
       FROM checkin
      WHERE local_date >= current_date - $1::int
      ORDER BY local_date`,
    [sinceDays]
  );
  return rows.map((r) => ({
    localDate: r.local_date.toISOString().slice(0, 10),
    sleepQuality: r.sleep_quality,
    stress: r.stress,
    fatigue: r.fatigue,
    soreness: r.soreness,
    waterMl: r.water_ml,
    note: r.note,
  }));
}

export async function saveCheckin(row: {
  localDate: string;
  sleepQuality?: number;
  stress?: number;
  fatigue?: number;
  soreness?: number;
  waterMl?: number;
  note?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO checkin (local_date, sleep_quality, stress, fatigue, soreness, water_ml, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (local_date) DO UPDATE SET
       sleep_quality = COALESCE(EXCLUDED.sleep_quality, checkin.sleep_quality),
       stress = COALESCE(EXCLUDED.stress, checkin.stress),
       fatigue = COALESCE(EXCLUDED.fatigue, checkin.fatigue),
       soreness = COALESCE(EXCLUDED.soreness, checkin.soreness),
       water_ml = COALESCE(EXCLUDED.water_ml, checkin.water_ml),
       note = COALESCE(EXCLUDED.note, checkin.note)`,
    [
      row.localDate,
      row.sleepQuality ?? null,
      row.stress ?? null,
      row.fatigue ?? null,
      row.soreness ?? null,
      row.waterMl ?? null,
      row.note ?? null,
    ]
  );
}

export async function getCachedInsight(localDate: string, contextHash: string): Promise<unknown | null> {
  const { rows } = await pool.query(
    `SELECT body FROM insight WHERE local_date = $1 AND context_hash = $2`,
    [localDate, contextHash]
  );
  return rows[0]?.body ?? null;
}

export async function saveInsight(localDate: string, contextHash: string, body: unknown): Promise<void> {
  await pool.query(
    `INSERT INTO insight (local_date, context_hash, body)
     VALUES ($1, $2, $3)
     ON CONFLICT (local_date, context_hash) DO NOTHING`,
    [localDate, contextHash, JSON.stringify(body)]
  );
}

export async function getRecentInsights(limit: number): Promise<{ localDate: string; body: unknown }[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (local_date) local_date, body
       FROM insight
      ORDER BY local_date DESC, created_at DESC
      LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({ localDate: r.local_date.toISOString().slice(0, 10), body: r.body }));
}
