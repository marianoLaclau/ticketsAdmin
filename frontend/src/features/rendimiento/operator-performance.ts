const MINIMUM_DEADLINE_SAMPLE = 5;
const FAVORABLE_SCORE = 80;
const DEADLINE_WEIGHT = 0.7;
const CURRENT_LOAD_WEIGHT = 0.3;

export type OperatorPerformanceState =
  "favorable" | "atencion" | "muestra_inicial" | "sin_muestra";

export interface OperatorPerformanceInput {
  cumplimiento_plazo: {
    muestra: number;
    cumplidos: number;
    porcentaje: number | null;
  };
  carga_actual: {
    abiertos_asignados: number;
    vencidos_asignados: number;
  };
}

export interface OperatorPerformanceResult {
  score: number | null;
  state: OperatorPerformanceState;
  deadlineSample: number;
  deadlineMet: number;
  deadlineScore: number | null;
  openAssigned: number;
  openNotOverdue: number;
  currentLoadScore: number;
}

function normalizeCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function roundPercentage(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}

export function calculateOperatorPerformance(
  input: OperatorPerformanceInput,
): OperatorPerformanceResult {
  const deadlineSample = normalizeCount(input.cumplimiento_plazo.muestra);
  const deadlineMet = Math.min(
    normalizeCount(input.cumplimiento_plazo.cumplidos),
    deadlineSample,
  );
  const openAssigned = normalizeCount(input.carga_actual.abiertos_asignados);
  const overdue = Math.min(
    normalizeCount(input.carga_actual.vencidos_asignados),
    openAssigned,
  );
  const openNotOverdue = openAssigned - overdue;
  const currentLoadScore =
    openAssigned === 0
      ? 100
      : roundPercentage((openNotOverdue / openAssigned) * 100);
  const deadlineScore =
    deadlineSample === 0
      ? null
      : roundPercentage((deadlineMet / deadlineSample) * 100);

  if (deadlineScore === null) {
    return {
      score: null,
      state: "sin_muestra",
      deadlineSample,
      deadlineMet,
      deadlineScore,
      openAssigned,
      openNotOverdue,
      currentLoadScore,
    };
  }

  const score = roundPercentage(
    deadlineScore * DEADLINE_WEIGHT + currentLoadScore * CURRENT_LOAD_WEIGHT,
  );

  return {
    score,
    state:
      deadlineSample < MINIMUM_DEADLINE_SAMPLE
        ? "muestra_inicial"
        : score >= FAVORABLE_SCORE
          ? "favorable"
          : "atencion",
    deadlineSample,
    deadlineMet,
    deadlineScore,
    openAssigned,
    openNotOverdue,
    currentLoadScore,
  };
}

export const OPERATOR_PERFORMANCE_CONFIG = Object.freeze({
  minimumDeadlineSample: MINIMUM_DEADLINE_SAMPLE,
  favorableScore: FAVORABLE_SCORE,
  deadlineWeightPercentage: DEADLINE_WEIGHT * 100,
  currentLoadWeightPercentage: CURRENT_LOAD_WEIGHT * 100,
});
