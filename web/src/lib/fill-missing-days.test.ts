import assert from "node:assert/strict";
import { test } from "node:test";

import { fillMissingDays } from "./fill-missing-days.ts";

test("devuelve exactamente `days` fechas aunque no haya ninguna fila", () => {
  // Arrange
  const today = new Date("2026-08-25T12:00:00Z");

  // Act
  const filled = fillMissingDays([], 5, today);

  // Assert
  assert.equal(filled.length, 5);
  assert.deepEqual(
    filled.map((f) => f.date),
    ["2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23", "2026-08-24"]
  );
  assert.ok(filled.every((f) => f.value === null));
});

test("un día sin fila en la fuente se rellena con null, no se omite", () => {
  // Arrange: la báscula solo tiene lecturas dos de los tres días
  const today = new Date("2026-08-25T12:00:00Z");
  const rows = [
    { date: "2026-08-22", value: 70.1 },
    { date: "2026-08-24", value: 70.4 },
  ];

  // Act
  const filled = fillMissingDays(rows, 3, today);

  // Assert: los tres días están presentes, el del medio es null explícito
  assert.deepEqual(filled, [
    { date: "2026-08-22", value: 70.1 },
    { date: "2026-08-23", value: null },
    { date: "2026-08-24", value: 70.4 },
  ]);
});

test("hoy queda afuera de la ventana -- es el día parcial", () => {
  // Arrange
  const today = new Date("2026-08-25T12:00:00Z");

  // Act
  const filled = fillMissingDays([{ date: "2026-08-25", value: 999 }], 3, today);

  // Assert
  assert.ok(!filled.some((f) => f.date === "2026-08-25"));
});
