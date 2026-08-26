import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { buildBrief, buildSystemPrompt, type CoverageRow, type DailySeries, type RecentInsight } from "@/lib/brief";
import {
  getActiveMetricSources,
  getCachedInsight,
  getCheckins,
  getDailyMetrics,
  getLatestRollups,
  getRecentInsights,
} from "@/lib/db";
import { fillMissingDays } from "@/lib/fill-missing-days";

// Ver plan Fase 6: ~30 días de detalle diario alcanza para que el LLM
// narre sin acercarse al costo de datos intradiarios (eso son
// millones de tokens, esto son unos pocos K).
const DAILY_WINDOW_DAYS = 30;

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  const activePairs = await getActiveMetricSources(DAILY_WINDOW_DAYS);
  const metricsInvolved = [...new Set(activePairs.map((p) => p.metric))];

  const rowsByMetric = new Map(
    await Promise.all(metricsInvolved.map(async (metric) => [metric, await getDailyMetrics(metric, DAILY_WINDOW_DAYS)] as const))
  );

  const dailySeries: DailySeries[] = activePairs.map(({ metric, source }) => {
    const rawRows = (rowsByMetric.get(metric) ?? []).filter((r) => r.source === source);
    const filled = fillMissingDays(
      rawRows.map((r) => ({ date: r.localDate, value: r.value })),
      DAILY_WINDOW_DAYS,
      today
    );
    return { metric, source, rows: filled };
  });

  const coverage: CoverageRow[] = dailySeries.map((s) => ({
    metric: s.metric,
    source: s.source,
    daysWithData: s.rows.filter((r) => r.value != null).length,
    totalDays: s.rows.length,
  }));

  const [rollups, checkins, recentInsightRows] = await Promise.all([
    getLatestRollups(),
    getCheckins(DAILY_WINDOW_DAYS),
    getRecentInsights(3),
  ]);

  const recentInsights: RecentInsight[] = recentInsightRows
    .filter((r) => r.localDate !== todayIso)
    .map((r) => ({ localDate: r.localDate, summary: summarize(r.body) }));

  const brief = buildBrief({ coverage, rollups, dailySeries, checkins, recentInsights });
  const systemPrompt = buildSystemPrompt();
  const contextHash = createHash("sha256").update(systemPrompt).update(brief).digest("hex");
  const cachedInsight = await getCachedInsight(todayIso, contextHash);

  return NextResponse.json({ today: todayIso, systemPrompt, brief, contextHash, cachedInsight });
}

function summarize(body: unknown): string {
  if (typeof body === "string") return body.slice(0, 200);
  if (body && typeof body === "object" && "text" in body) {
    const text = (body as { text?: unknown }).text;
    if (typeof text === "string") return text.slice(0, 200);
  }
  return JSON.stringify(body).slice(0, 200);
}
