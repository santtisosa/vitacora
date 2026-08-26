/**
 * Arma el contexto que se le manda al LLM (ver plan, Fase 6). Pura
 * lógica de formato, sin I/O -- toda la matemática ya vino calculada de
 * `metric_rollup` (ver sync/compute_rollups.py). Esta función solo la
 * traduce a texto; el LLM nunca ve una serie cruda sin agregar y nunca
 * calcula nada, solo narra lo que ya está acá.
 *
 * v1 no incluye PROFILE (edad/altura/objetivos) ni WORKOUTS (actividades
 * de Garmin) -- ver plan: las actividades entran por el export GDPR/FIT,
 * no por el sync en vivo, y todavía no hay tabla de perfil. `ponytail:
 * agregar cuando el usuario cargue un perfil o haya actividades en DB`.
 */
import type { CheckinRow, RollupRow } from "./db";

export interface CoverageRow {
  metric: string;
  source: string;
  daysWithData: number;
  totalDays: number;
}

export interface DailySeries {
  metric: string;
  source: string;
  rows: { date: string; value: number | null }[];
}

export interface RecentInsight {
  localDate: string;
  summary: string;
}

export interface BriefInput {
  coverage: CoverageRow[];
  rollups: RollupRow[];
  dailySeries: DailySeries[];
  checkins: CheckinRow[];
  recentInsights: RecentInsight[];
}

export function buildSystemPrompt(): string {
  return [
    "Sos el motor de narración de Vitácora, un dashboard personal de salud que cruza datos de un reloj Garmin y una báscula Fitbit Aria Air (vía Google Health).",
    "",
    "REGLA NO NEGOCIABLE: no calculás nada. Todo número en el contexto ya viene precomputado -- tu trabajo es traducirlo a lenguaje claro, nunca inventar una cifra que no esté en el contexto. Cada número que menciones tiene que aparecer TEXTUAL en el contexto. Si no tenés el dato, decilo, no lo estimes.",
    "Los denominadores de cobertura van antes que cualquier promedio: si un promedio se apoya en pocos días, decilo explícitamente.",
    "No sos un dispositivo médico. Esto es de bienestar general, no diagnóstico. Si hay una señal de alarma real (FC en reposo muy elevada sostenida, pérdida de peso rápida no intencional, varias métricas fuera de rango a la vez), decí explícitamente que conviene consultar a un profesional de la salud.",
    "Nunca persigas paridad entre Garmin y Fitbit: son algoritmos distintos sobre inputs distintos. Compará patrones (¿la HRV viene bajando?), nunca los puntajes entre sí.",
    "Formato de salida: 3 observaciones breves + 1 acción concreta para hoy + 1 cosa a vigilar. Sin rodeos.",
  ].join("\n");
}

function fmt(n: number | null | undefined): string {
  return n == null ? "n/d" : n.toFixed(1);
}

function coverageSection(coverage: CoverageRow[]): string[] {
  return [
    "# Cobertura (leer antes que los promedios)",
    ...coverage.map((c) => `- ${c.metric} (${c.source}): ${c.daysWithData}/${c.totalDays} días con dato`),
  ];
}

function trendsSection(rollups: RollupRow[]): string[] {
  return [
    "",
    "# Tendencias (ya calculadas, no recalcular)",
    ...rollups.map((r) => {
      const delta = r.deltaPct != null ? `${r.deltaPct > 0 ? "+" : ""}${r.deltaPct.toFixed(1)}%` : "sin baseline";
      return `- ${r.metric} (${r.source}): reciente(14d)=${fmt(r.recentAvg)} vs baseline(60d)=${fmt(r.longAvg)} → ${delta} · z=${r.zScore?.toFixed(2) ?? "n/d"}`;
    }),
  ];
}

function dailySection(dailySeries: DailySeries[]): string[] {
  return [
    "",
    "# Serie diaria (más reciente primero)",
    ...dailySeries.map((series) => {
      const csv = [...series.rows]
        .reverse()
        .map((row) => `${row.date}=${row.value ?? "null"}`)
        .join(", ");
      return `- ${series.metric} (${series.source}): ${csv}`;
    }),
  ];
}

function checkinSection(checkins: CheckinRow[]): string[] {
  if (checkins.length === 0) return [];
  return [
    "",
    "# Check-ins subjetivos (escala Hooper-Mackinnon 1-7, más alto = peor)",
    ...checkins.map(
      (c) =>
        `- ${c.localDate}: sueño=${c.sleepQuality ?? "n/d"} estrés=${c.stress ?? "n/d"} fatiga=${c.fatigue ?? "n/d"} dolor=${c.soreness ?? "n/d"} agua=${c.waterMl ?? "n/d"}ml`
    ),
  ];
}

function memorySection(recentInsights: RecentInsight[]): string[] {
  if (recentInsights.length === 0) return [];
  return [
    "",
    "# Memoria (insights previos)",
    ...recentInsights.map((i) => `- ${i.localDate}: ${i.summary}`),
  ];
}

export function buildBrief(input: BriefInput): string {
  return [
    ...coverageSection(input.coverage),
    ...trendsSection(input.rollups),
    ...dailySection(input.dailySeries),
    ...checkinSection(input.checkins),
    ...memorySection(input.recentInsights),
  ].join("\n");
}
