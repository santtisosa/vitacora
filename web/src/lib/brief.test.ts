import assert from "node:assert/strict";
import { test } from "node:test";

import { buildBrief } from "./brief.ts";

test("la cobertura aparece antes que las tendencias, con denominador explícito", () => {
  // Arrange
  const input = {
    coverage: [{ metric: "weight_kg", source: "google_health", daysWithData: 41, totalDays: 90 }],
    rollups: [
      { localDate: "2026-08-25", metric: "weight_kg", source: "google_health", smoothed: 70.1, baselineMean: 71, baselineStd: 1, zScore: -0.9, recentAvg: 70.5, longAvg: 71, deltaPct: -0.7 },
    ],
    dailySeries: [],
    checkins: [],
    recentInsights: [],
  };

  // Act
  const brief = buildBrief(input);

  // Assert
  const coverageIndex = brief.indexOf("Cobertura");
  const trendsIndex = brief.indexOf("Tendencias");
  assert.ok(coverageIndex >= 0 && trendsIndex > coverageIndex);
  assert.match(brief, /41\/90 días con dato/);
});

test("un valor faltante en la serie diaria se escribe como null explícito, no se omite", () => {
  // Arrange
  const input = {
    coverage: [],
    rollups: [],
    dailySeries: [
      {
        metric: "steps",
        source: "garmin",
        rows: [
          { date: "2026-08-23", value: 8000 },
          { date: "2026-08-24", value: null },
        ],
      },
    ],
    checkins: [],
    recentInsights: [],
  };

  // Act
  const brief = buildBrief(input);

  // Assert
  assert.match(brief, /2026-08-24=null/);
});

test("sin rollups ni check-ins, esas secciones no aparecen (nada que narrar)", () => {
  // Arrange
  const input = { coverage: [], rollups: [], dailySeries: [], checkins: [], recentInsights: [] };

  // Act
  const brief = buildBrief(input);

  // Assert
  assert.doesNotMatch(brief, /Check-ins subjetivos/);
  assert.doesNotMatch(brief, /Memoria/);
});
