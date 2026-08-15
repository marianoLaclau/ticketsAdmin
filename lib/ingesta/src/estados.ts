import { ESTADOS_VALIDOS, type EstadoTicket } from "./types";

/**
 * Máquina de estados del ticket.
 *
 * La regla es deliberadamente permisiva y hay datos detrás: sobre el histórico
 * de producción, la transición más frecuente es `nuevo -> resuelto` (58 de 76
 * cambios reales), porque muchas consultas se resuelven en la misma llamada.
 * Un flujo lineal obligatorio rechazaría el uso mayoritario del equipo, así
 * que solo prohibimos lo que destruye información.
 *
 * Lo único prohibido es volver a `nuevo`. Es el estado con el que nace un
 * ticket y no se regresa a él: retroceder borraría la evidencia de que alguien
 * ya lo trabajó y falsearía las lecturas de Rendimiento, que cuentan
 * transiciones de un estado no-final a uno final. Reabrir un caso cerrado es
 * legítimo, pero se hace hacia `en_proceso` o `pendiente`, no hacia `nuevo`.
 */
export const ESTADO_INICIAL: EstadoTicket = "nuevo";

/** Estados que cierran el ciclo de atención y cuentan como resolución. */
export const ESTADOS_FINALES: readonly EstadoTicket[] = ["resuelto", "cerrado"];

/**
 * Progreso que le corresponde a cada estado. El progreso no es un dato
 * independiente que el cliente elija: es la lectura porcentual del estado, y
 * derivarlo acá evita que queden contradictorios (un `resuelto` con 0%).
 */
export const PROGRESO_POR_ESTADO: Readonly<Record<EstadoTicket, number>> = {
  nuevo: 0,
  en_proceso: 25,
  pendiente: 50,
  resuelto: 75,
  cerrado: 100,
};

export function esEstadoTicket(valor: unknown): valor is EstadoTicket {
  return (
    typeof valor === "string" &&
    (ESTADOS_VALIDOS as readonly string[]).includes(valor)
  );
}

export function progresoDeEstado(estado: EstadoTicket): number {
  return PROGRESO_POR_ESTADO[estado];
}

export function esEstadoFinal(estado: EstadoTicket): boolean {
  return ESTADOS_FINALES.includes(estado);
}

/**
 * Un no-op (mismo estado) es válido: quien edita otros campos sin tocar el
 * estado no debería toparse con esta regla.
 */
export function esTransicionDeEstadoValida(
  desde: EstadoTicket,
  hasta: EstadoTicket,
): boolean {
  if (desde === hasta) return true;
  return hasta !== ESTADO_INICIAL;
}

/**
 * Mensaje para la persona que intentó el cambio, no para el log. Devuelve
 * `null` cuando la transición es válida, así el llamador usa un solo camino.
 */
export function describirTransicionInvalida(
  desde: EstadoTicket,
  hasta: EstadoTicket,
): string | null {
  if (esTransicionDeEstadoValida(desde, hasta)) return null;
  return `Un ticket no puede volver a "nuevo": ya fue trabajado. Para retomarlo, pasalo a "en proceso" o "pendiente".`;
}
