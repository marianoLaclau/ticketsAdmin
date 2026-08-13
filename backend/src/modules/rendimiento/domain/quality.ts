export const INDIVIDUAL_COMPARISON_MIN_RESOLUTIONS = 10;
export const INDIVIDUAL_COMPARISON_PARTIAL_COVERAGE = 80;
export const INDIVIDUAL_COMPARISON_READY_COVERAGE = 95;

export type QualityProportion = {
  numerador: number;
  denominador: number;
  porcentaje: number | null;
};

export type IndividualComparisonStatus =
  "insuficiente" | "parcial" | "disponible";

export function buildQualityProportion(
  numerator: number,
  denominator: number,
): QualityProportion {
  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    numerator < 0 ||
    denominator < 0 ||
    numerator > denominator
  ) {
    throw new RangeError("La proporcion de calidad no es valida");
  }

  return {
    numerador: numerator,
    denominador: denominator,
    porcentaje:
      denominator === 0
        ? null
        : Math.round((numerator / denominator) * 1_000) / 10,
  };
}

export function getIndividualComparisonStatus(
  attributedResolutions: QualityProportion,
): IndividualComparisonStatus {
  if (
    attributedResolutions.denominador < INDIVIDUAL_COMPARISON_MIN_RESOLUTIONS ||
    attributedResolutions.porcentaje === null ||
    attributedResolutions.porcentaje < INDIVIDUAL_COMPARISON_PARTIAL_COVERAGE
  ) {
    return "insuficiente";
  }

  return attributedResolutions.porcentaje >=
    INDIVIDUAL_COMPARISON_READY_COVERAGE
    ? "disponible"
    : "parcial";
}
