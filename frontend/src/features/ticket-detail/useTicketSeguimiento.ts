import { useLayoutEffect, useRef, useState } from "react";
import { useCreateSeguimiento } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  getAdminErrorMessage,
  getUserErrorMessage,
} from "@/lib/error-messages";
import { invalidateTicketDomainQueries } from "@/lib/query-invalidation";
import { useTicketDetailOperationGuard } from "./useTicketDetailOperationGuard";

interface UseTicketSeguimientoOptions {
  ticketId: number;
  adminMode: boolean;
  adminRequest: RequestInit;
}

export function useTicketSeguimiento({
  ticketId,
  adminMode,
  adminRequest,
}: UseTicketSeguimientoOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createSeguimiento = useCreateSeguimiento(
    adminMode ? { request: adminRequest } : undefined,
  );
  const { reset: resetCreateSeguimiento } = createSeguimiento;
  const includeEmptyParams = adminMode
    ? ({ incluir_vacios: true } as const)
    : undefined;
  const [draft, setDraft] = useState("");
  const draftRef = useRef("");
  const draftRevisionRef = useRef(0);
  const operationGuard = useTicketDetailOperationGuard<"submit">(ticketId);

  useLayoutEffect(() => {
    if (!operationGuard.transitionTicket(ticketId)) return;

    draftRevisionRef.current += 1;
    draftRef.current = "";
    setDraft("");
    resetCreateSeguimiento();
  }, [operationGuard, resetCreateSeguimiento, ticketId]);

  const changeDraft = (value: string) => {
    if (!operationGuard.isCurrentBoundary(ticketId)) return;
    draftRevisionRef.current += 1;
    draftRef.current = value;
    setDraft(value);
  };

  const submit = () => {
    const submittedDraft = draftRef.current;
    const seguimiento = submittedDraft.trim();
    if (!seguimiento) return;

    const submissionOperation = operationGuard.start("submit", ticketId);
    if (!submissionOperation) return;
    const submittedDraftRevision = draftRevisionRef.current;

    createSeguimiento.mutate(
      {
        id: ticketId,
        ...(includeEmptyParams ? { params: includeEmptyParams } : {}),
        data: { nota: seguimiento },
      },
      {
        onSuccess: () => {
          if (!operationGuard.isCurrent(submissionOperation)) return;
          void invalidateTicketDomainQueries(queryClient);
          if (draftRevisionRef.current === submittedDraftRevision) {
            draftRevisionRef.current += 1;
            draftRef.current = "";
            setDraft("");
          }
          toast({
            variant: "success",
            title: "Seguimiento agregado",
            description:
              seguimiento.length > 90
                ? `${seguimiento.slice(0, 90)}…`
                : seguimiento,
          });
        },
        onError: (error) => {
          if (!operationGuard.isCurrent(submissionOperation)) return;
          toast({
            variant: "destructive",
            title: "No se pudo agregar el seguimiento",
            description: adminMode
              ? getAdminErrorMessage(error)
              : getUserErrorMessage(error, "Reintentá la operación."),
          });
        },
        onSettled: () => {
          operationGuard.finish(submissionOperation);
        },
      },
    );
  };

  return {
    historyCard: {
      draft,
      isSubmitting: createSeguimiento.isPending,
      onDraftChange: changeDraft,
      onSubmit: submit,
    },
  };
}
