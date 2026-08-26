import { CheckinForm } from "@/components/vitacora/checkin-form";
import { InsightCard } from "@/components/vitacora/insight-card";
import { TypicalRangeChart, type TypicalRangePoint } from "@/components/vitacora/typical-range-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getLatestRollups, getRollup, type RollupRow } from "@/lib/db";
import { METRICS, MIN_MEANINGFUL_Z, SOURCE_LABEL, type MetricKey } from "@/lib/metrics-config";

// Lee la DB en cada request -- nunca prerenderizar esta página en build
// time (no hay DATABASE_URL disponible ahí, y los datos cambian todos
// los días con el sync).
export const dynamic = "force-dynamic";

// Ver plan Fase 4: tres pestañas, IA de Oura/Whoop -- Hoy (qué hago con
// esto) → Vitales (contra tu rango típico) → Tendencias (el detalle).
const VITALES_WINDOW_DAYS = 30;
const TENDENCIAS_WINDOW_DAYS = 90;

function groupBySource(rows: RollupRow[]): Map<string, RollupRow[]> {
  const bySource = new Map<string, RollupRow[]>();
  for (const row of rows) {
    const list = bySource.get(row.source) ?? [];
    list.push(row);
    bySource.set(row.source, list);
  }
  return bySource;
}

function toPoints(rows: RollupRow[]): TypicalRangePoint[] {
  return rows.map((r) => ({
    date: r.localDate,
    value: r.metric === "weight_kg" && r.smoothed != null ? r.smoothed : (r.recentAvg ?? null),
    baselineMean: r.baselineMean,
    baselineStd: r.baselineStd,
  }));
}

async function MetricCharts({ sinceDays }: { sinceDays: number }) {
  const metricKeys = Object.keys(METRICS) as MetricKey[];
  const charts = await Promise.all(
    metricKeys.map(async (metric) => {
      const rows = await getRollup(metric, sinceDays);
      const bySource = groupBySource(rows);
      return { metric, bySource };
    })
  );

  const withData = charts.filter((c) => c.bySource.size > 0);
  if (withData.length === 0) {
    return <p className="text-muted-foreground text-sm">Todavía no hay datos sincronizados.</p>;
  }

  return (
    <div className="space-y-4">
      {withData.map(({ metric, bySource }) =>
        [...bySource.entries()].map(([source, rows]) => (
          <Card key={`${metric}-${source}`}>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                {METRICS[metric].label} · {SOURCE_LABEL[source] ?? source}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TypicalRangeChart metric={metric} points={toPoints(rows)} />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function TodayHighlights({ rollups }: { rollups: RollupRow[] }) {
  // Solo lo que se mueve de verdad -- ver plan: no todo movimiento es
  // una señal, mostrar ruido como insight vuelve genérico al dashboard.
  const notable = rollups.filter((r) => r.zScore != null && Math.abs(r.zScore) >= MIN_MEANINGFUL_Z);

  if (notable.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nada se mueve fuera de lo normal hoy -- todo dentro de tu rango típico.
      </p>
    );
  }

  return (
    <ul className="space-y-1 text-sm">
      {notable.map((r) => {
        const config = METRICS[r.metric as MetricKey];
        const direction = (r.zScore ?? 0) > 0 ? "por encima de" : "por debajo de";
        return (
          <li key={`${r.metric}-${r.source}`}>
            <span className="font-medium">{config?.label ?? r.metric}</span> ({SOURCE_LABEL[r.source] ?? r.source}):{" "}
            {direction} tu rango típico.
          </li>
        );
      })}
    </ul>
  );
}

export default async function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10);
  const latestRollups = await getLatestRollups();

  return (
    <Tabs defaultValue="hoy">
      <TabsList className="mb-4">
        <TabsTrigger value="hoy">Hoy</TabsTrigger>
        <TabsTrigger value="vitales">Vitales</TabsTrigger>
        <TabsTrigger value="tendencias">Tendencias</TabsTrigger>
      </TabsList>

      <TabsContent value="hoy" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Qué cambió</CardTitle>
          </CardHeader>
          <CardContent>
            <TodayHighlights rollups={latestRollups} />
          </CardContent>
        </Card>
        <InsightCard />
        <CheckinForm localDate={today} />
      </TabsContent>

      <TabsContent value="vitales">
        <MetricCharts sinceDays={VITALES_WINDOW_DAYS} />
      </TabsContent>

      <TabsContent value="tendencias">
        <MetricCharts sinceDays={TENDENCIAS_WINDOW_DAYS} />
      </TabsContent>
    </Tabs>
  );
}
