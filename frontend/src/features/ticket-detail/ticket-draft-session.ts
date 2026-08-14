export interface TicketDraftSession {
  wasOpen: boolean;
  ticketId: number | null;
}

interface TicketDraftTransition {
  next: TicketDraftSession;
  shouldReset: boolean;
}

/**
 * Decide cuándo una nueva edición debe capturar otro baseline. Las revisiones
 * SSE del mismo ticket no reinician el draft abierto; abrir el diálogo o
 * navegar a otro ticket sí lo hace.
 */
export function transitionTicketDraftSession(
  current: Readonly<TicketDraftSession>,
  open: boolean,
  ticketId: number,
): TicketDraftTransition {
  const shouldReset =
    open && (!current.wasOpen || current.ticketId !== ticketId);

  return {
    shouldReset,
    next: {
      wasOpen: open,
      ticketId: shouldReset ? ticketId : current.ticketId,
    },
  };
}
