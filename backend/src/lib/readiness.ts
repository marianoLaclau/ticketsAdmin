export type ReadinessPhase = "starting" | "ready" | "draining";

export interface ReadinessControl {
  markReady(): void;
  beginDrain(): void;
  isReady(): boolean;
  currentPhase(): ReadinessPhase;
}

/**
 * Estado monotónico del proceso: solo puede iniciar, quedar listo y drenar.
 * La sonda se evalúa en cada request para detectar una dependencia caída sin
 * convertir un fallo transitorio en un estado permanente.
 */
export function createReadinessControl(
  probe: () => boolean,
  onProbeError: (error: unknown) => void = () => undefined,
): ReadinessControl {
  let phase: ReadinessPhase = "starting";

  return {
    markReady() {
      if (phase === "starting") phase = "ready";
    },
    beginDrain() {
      phase = "draining";
    },
    isReady() {
      if (phase !== "ready") return false;
      try {
        return probe();
      } catch (error) {
        onProbeError(error);
        return false;
      }
    },
    currentPhase() {
      return phase;
    },
  };
}
