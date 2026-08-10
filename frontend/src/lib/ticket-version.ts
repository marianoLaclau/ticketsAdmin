import type { Ticket, TicketUpdate } from "@workspace/api-client-react";

export type TicketChanges = Omit<TicketUpdate, "expected_version">;

export interface TicketEditBaseline<T extends object> {
  expectedVersion: number;
  values: T;
}

export function shouldApplyTicketRevision(
  current: Pick<Ticket, "version"> | undefined,
  incoming: Pick<Ticket, "version">,
): boolean {
  return current === undefined || incoming.version >= current.version;
}

/** Congela datos y versión como una sola lectura lógica al abrir un editor. */
export function createTicketEditBaseline<T extends object>(
  ticket: Pick<Ticket, "version">,
  values: T,
): TicketEditBaseline<T> {
  return {
    expectedVersion: ticket.version,
    values: { ...values },
  };
}

/** Agrega la precondición recién después de descartar un change-set vacío. */
export function buildVersionedTicketUpdate(
  changes: TicketChanges,
  expectedVersion: number,
): TicketUpdate | null {
  if (Object.keys(changes).length === 0) return null;
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new RangeError("La versión esperada del ticket no es válida");
  }

  return { ...changes, expected_version: expectedVersion };
}
