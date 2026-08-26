"use client";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { METRICS, type MetricKey } from "@/lib/metrics-config";

/** El gráfico de la casa (ver plan, Fase 4): banda del rango típico +
 * línea cruda + punto de hoy destacado. Es la mejor respuesta visual a
 * "contra tu baseline, no en absoluto" -- la misma idea que Apple Health
 * Vitals. Cada instancia lleva su frase de lectura debajo, nunca solo
 * un título: un gráfico sin una frase que lo traduzca es la mitad del
 * trabajo. */

export interface TypicalRangePoint {
  date: string; // YYYY-MM-DD
  value: number | null;
  baselineMean: number | null;
  baselineStd: number | null;
}

interface TypicalRangeChartProps {
  metric: MetricKey;
  points: TypicalRangePoint[];
}

const chartConfig = {
  range: { label: "Rango típico", color: "var(--muted-foreground)" },
  value: { label: "Valor", color: "var(--chart-1)" },
} satisfies ChartConfig;

function formatDayMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

function readingSentence(metric: MetricKey, last: TypicalRangePoint | undefined): string {
  const config = METRICS[metric];
  if (!last || last.value == null) return `${config.label}: sin dato hoy.`;

  const unitSuffix = config.unit ? ` ${config.unit}` : "";
  const valueText = `${last.value}${unitSuffix}`;

  if (last.baselineMean == null || last.baselineStd == null) {
    return `${config.label} hoy: ${valueText}. Todavía no hay suficiente historial para un rango típico.`;
  }

  const low = last.baselineMean - last.baselineStd;
  const high = last.baselineMean + last.baselineStd;
  if (last.value < low) {
    return `${config.label} hoy: ${valueText} — por debajo de tu rango típico (${low.toFixed(1)}–${high.toFixed(1)}).`;
  }
  if (last.value > high) {
    return `${config.label} hoy: ${valueText} — por encima de tu rango típico (${low.toFixed(1)}–${high.toFixed(1)}).`;
  }
  return `${config.label} hoy: ${valueText} — dentro de tu rango típico (${low.toFixed(1)}–${high.toFixed(1)}).`;
}

export function TypicalRangeChart({ metric, points }: TypicalRangeChartProps) {
  const data = points.map((p) => ({
    date: p.date,
    value: p.value,
    range:
      p.baselineMean != null && p.baselineStd != null
        ? [p.baselineMean - p.baselineStd, p.baselineMean + p.baselineStd]
        : undefined,
  }));
  const last = points.at(-1);

  return (
    <div className="space-y-1">
      <ChartContainer config={chartConfig} className="aspect-auto h-40 w-full">
        <ComposedChart data={data} margin={{ left: 4, right: 4, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={formatDayMonth} minTickGap={32} />
          <YAxis hide domain={["dataMin - 2", "dataMax + 2"]} />
          <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => formatDayMonth(String(v))} />} />
          <Area dataKey="range" fill="var(--color-range)" fillOpacity={0.15} stroke="none" isAnimationActive={false} />
          <Line
            dataKey="value"
            stroke="var(--color-value)"
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          {last?.value != null && (
            <ReferenceDot x={last.date} y={last.value} r={5} fill="var(--color-value)" stroke="none" />
          )}
        </ComposedChart>
      </ChartContainer>
      <p className="text-muted-foreground text-xs">{readingSentence(metric, last)}</p>
    </div>
  );
}
