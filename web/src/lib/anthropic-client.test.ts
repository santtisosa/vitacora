// Test con el runner nativo de Node (--test), sin Jest/RTL: es una sola
// función pura y Node 26 ya sabe correr TypeScript sin transpilar --
// instalar un framework entero para esto sería lo contrario de lazy.
// findUnverifiedNumbers es la única lógica no trivial y no-de-red de
// anthropic-client.ts; el resto son fetch() wrappers que necesitan una
// key real para probarse.
import assert from "node:assert/strict";
import { test } from "node:test";

import { findUnverifiedNumbers } from "./anthropic-client.ts";

test("no reporta nada cuando todos los números del insight están en el brief", () => {
  // Arrange
  const brief = "FC en reposo: 58 bpm. HRV: 42 ms.";
  const insight = "Tu FC en reposo de 58 está en línea con tu HRV de 42.";

  // Act
  const unverified = findUnverifiedNumbers(insight, brief);

  // Assert
  assert.deepEqual(unverified, []);
});

test("reporta un número confabulado que no aparece en el brief", () => {
  // Arrange: caso real documentado -- el modelo inventa una cifra
  const brief = "FC en reposo: 58 bpm.";
  const insight = "Dormiste 7.5 horas anoche.";

  // Act
  const unverified = findUnverifiedNumbers(insight, brief);

  // Assert
  assert.deepEqual(unverified, ["7.5"]);
});

test("no duplica el mismo número confabulado si aparece dos veces", () => {
  // Arrange
  const brief = "FC en reposo: 58 bpm.";
  const insight = "Perdiste 2kg esta semana, 2kg en total.";

  // Act
  const unverified = findUnverifiedNumbers(insight, brief);

  // Assert
  assert.deepEqual(unverified, ["2"]);
});
