/** Catálogo de métricas mostrables. Un solo lugar para agregar una
 * métrica nueva -- evita que el nombre/unidad/label queden hardcodeados
 * y desincronizados entre componentes (ver ECC: no hardcoded values). */
export type MetricKey =
  | "steps"
  | "resting_hr"
  | "hrv"
  | "spo2"
  | "body_battery"
  | "sleep_score"
  | "weight_kg"
  | "body_fat_pct";

export type MetricConfig = {
  label: string;
  unit: string;
  /** Si true, un valor por encima del baseline es una buena señal (ej.
   * HRV). Si false, es al revés (ej. FC en reposo, estrés). Se usa para
   * elegir el color semántico, nunca decorativo -- ver plan Fase 4. */
  higherIsBetter: boolean;
};

export const METRICS: Record<MetricKey, MetricConfig> = {
  steps: { label: "Pasos", unit: "pasos", higherIsBetter: true },
  resting_hr: { label: "FC en reposo", unit: "bpm", higherIsBetter: false },
  hrv: { label: "HRV", unit: "ms", higherIsBetter: true },
  spo2: { label: "SpO2", unit: "%", higherIsBetter: true },
  body_battery: { label: "Body Battery", unit: "", higherIsBetter: true },
  sleep_score: { label: "Sueño", unit: "", higherIsBetter: true },
  weight_kg: { label: "Peso", unit: "kg", higherIsBetter: false },
  body_fat_pct: { label: "% grasa corporal", unit: "%", higherIsBetter: false },
};

export const SOURCE_LABEL: Record<string, string> = {
  garmin: "Garmin",
  google_health: "Fitbit (Google Health)",
};

/** Espeja `MIN_MEANINGFUL_Z` de sync/vitacora_sync/metrics.py (Python es
 * la fuente de verdad del cálculo, esto solo replica el umbral de
 * display). No todo movimiento es una señal -- ver plan. */
export const MIN_MEANINGFUL_Z = 0.5;
