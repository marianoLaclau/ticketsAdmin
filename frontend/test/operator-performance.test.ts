import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateOperatorPerformance,
  OPERATOR_PERFORMANCE_CONFIG,
} from "../src/features/rendimiento/operator-performance.ts";

test("pondera 70% el plazo y 30% la carga abierta sin vencer", () => {
  const result = calculateOperatorPerformance({
    cumplimiento_plazo: { muestra: 10, cumplidos: 8, porcentaje: 80 },
    carga_actual: { abiertos_asignados: 4, vencidos_asignados: 1 },
  });

  assert.deepEqual(result, {
    score: 78.5,
    state: "atencion",
    deadlineSample: 10,
    deadlineMet: 8,
    deadlineScore: 80,
    openAssigned: 4,
    openNotOverdue: 3,
    currentLoadScore: 75,
  });
  assert.deepEqual(OPERATOR_PERFORMANCE_CONFIG, {
    minimumDeadlineSample: 5,
    favorableScore: 80,
    deadlineWeightPercentage: 70,
    currentLoadWeightPercentage: 30,
  });
});

test("marca favorable desde ochenta puntos y trata una carga vacía como al día", () => {
  assert.deepEqual(
    calculateOperatorPerformance({
      cumplimiento_plazo: { muestra: 5, cumplidos: 4, porcentaje: 80 },
      carga_actual: { abiertos_asignados: 0, vencidos_asignados: 0 },
    }),
    {
      score: 86,
      state: "favorable",
      deadlineSample: 5,
      deadlineMet: 4,
      deadlineScore: 80,
      openAssigned: 0,
      openNotOverdue: 0,
      currentLoadScore: 100,
    },
  );
});

test("no clasifica muestras menores a cinco finalizaciones", () => {
  const result = calculateOperatorPerformance({
    cumplimiento_plazo: { muestra: 1, cumplidos: 1, porcentaje: 100 },
    carga_actual: { abiertos_asignados: 2, vencidos_asignados: 0 },
  });

  assert.equal(result.score, 100);
  assert.equal(result.state, "muestra_inicial");
});

test("devuelve sin muestra cuando no puede medir el cumplimiento", () => {
  const result = calculateOperatorPerformance({
    cumplimiento_plazo: { muestra: 0, cumplidos: 0, porcentaje: null },
    carga_actual: { abiertos_asignados: 3, vencidos_asignados: 2 },
  });

  assert.equal(result.score, null);
  assert.equal(result.state, "sin_muestra");
  assert.equal(result.currentLoadScore, 33.3);
});

test("normaliza cantidades inválidas antes de calcular", () => {
  const result = calculateOperatorPerformance({
    cumplimiento_plazo: {
      muestra: 6.9,
      cumplidos: 99,
      porcentaje: Number.NaN,
    },
    carga_actual: {
      abiertos_asignados: 2.8,
      vencidos_asignados: 9,
    },
  });

  assert.equal(result.deadlineSample, 6);
  assert.equal(result.deadlineMet, 6);
  assert.equal(result.openAssigned, 2);
  assert.equal(result.openNotOverdue, 0);
  assert.equal(result.score, 70);
  assert.equal(result.state, "atencion");
});
