import { useState } from "react";
import { useCreateSeguimiento } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { adminErrorMessage } from "@/hooks/use-admin-access";
import { useToast } from "@/hooks/use-toast";
import { getUserErrorMessage } from "@/lib/error-messages";
import { invalidateTicketDomainQueries } from "@/lib/query-invalidation";

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
  const includeEmptyParams = adminMode
    ? ({ incluir_vacios: true } as const)
    : undefined;
  const [draft, setDraft] = useState("");

  const submit = () => {
    const seguimiento = draft.trim();
    if (!seguimiento) return;

    createSeguimiento.mutate(
      {
        id: ticketId,
        ...(includeEmptyParams ? { params: includeEmptyParams } : {}),
        data: { nota: seguimiento },
      },
      {
        onSuccess: () => {
          void invalidateTicketDomainQueries(queryClient);
          setDraft("");
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
          toast({
            variant: "destructive",
            title: "No se pudo agregar el seguimiento",
            description: adminMode
              ? adminErrorMessage(error)
              : getUserErrorMessage(error, "Reintentá la operación."),
          });
        },
      },
    );
  };

  return {
    historyCard: {
      draft,
      isSubmitting: createSeguimiento.isPending,
      onDraftChange: setDraft,
      onSubmit: submit,
    },
  };
}
