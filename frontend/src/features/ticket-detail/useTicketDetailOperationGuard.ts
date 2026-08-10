import { useLayoutEffect, useMemo, useRef } from "react";

export interface TicketDetailOperationToken<Operation extends string> {
  kind: Operation;
  ticketId: number;
  generation: number;
  sequence: number;
}

interface PendingOperation<Operation extends string> {
  kind: Operation;
  sequence: number;
}

/**
 * Serializa operaciones de un detalle y las separa por generación de ticket.
 * Los tokens anteriores dejan de ser vigentes apenas cambia la ruta.
 */
export function useTicketDetailOperationGuard<Operation extends string>(
  initialTicketId: number,
) {
  const ticketIdRef = useRef(initialTicketId);
  const generationRef = useRef(0);
  const sequencesRef = useRef(new Map<Operation, number>());
  const pendingRef = useRef<PendingOperation<Operation> | null>(null);
  const mountedRef = useRef(false);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      pendingRef.current = null;
    };
  }, []);

  return useMemo(
    () => ({
      transitionTicket(nextTicketId: number): boolean {
        if (!mountedRef.current) return false;
        if (ticketIdRef.current === nextTicketId) return false;

        ticketIdRef.current = nextTicketId;
        generationRef.current += 1;
        pendingRef.current = null;
        return true;
      },

      isCurrentBoundary(expectedTicketId: number): boolean {
        return mountedRef.current && ticketIdRef.current === expectedTicketId;
      },

      hasPendingOperation(): boolean {
        return mountedRef.current && pendingRef.current !== null;
      },

      start(
        kind: Operation,
        expectedTicketId: number,
      ): TicketDetailOperationToken<Operation> | null {
        if (
          !mountedRef.current ||
          ticketIdRef.current !== expectedTicketId ||
          pendingRef.current !== null
        ) {
          return null;
        }

        const sequence = (sequencesRef.current.get(kind) ?? 0) + 1;
        sequencesRef.current.set(kind, sequence);
        pendingRef.current = { kind, sequence };
        return {
          kind,
          ticketId: expectedTicketId,
          generation: generationRef.current,
          sequence,
        };
      },

      isCurrent(token: TicketDetailOperationToken<Operation>): boolean {
        return (
          mountedRef.current &&
          ticketIdRef.current === token.ticketId &&
          generationRef.current === token.generation &&
          sequencesRef.current.get(token.kind) === token.sequence &&
          pendingRef.current?.kind === token.kind &&
          pendingRef.current.sequence === token.sequence
        );
      },

      finish(token: TicketDetailOperationToken<Operation>): void {
        if (
          !mountedRef.current ||
          ticketIdRef.current !== token.ticketId ||
          generationRef.current !== token.generation ||
          pendingRef.current?.kind !== token.kind ||
          pendingRef.current.sequence !== token.sequence
        ) {
          return;
        }
        pendingRef.current = null;
      },
    }),
    [],
  );
}
