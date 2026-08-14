import { useLayoutEffect, useRef, useState } from "react";
import {
  TicketEstado,
  TicketPrioridad,
  useUpdateTicket,
  type Ticket,
  type TicketDetail,
  type TicketUpdate,
} from "@workspace/api-client-react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  dateTimeLocalValueToIso,
  toDateTimeLocalValue,
} from "@/features/ticket-detail/datetime-local";
import {
  getAdminErrorMessage,
  getUserErrorMessage,
  isTicketVersionConflict,
} from "@/lib/error-messages";
import { getEstadoLabel } from "@/lib/estados";
import { invalidateTicketDomainQueries } from "@/lib/query-invalidation";
import {
  applyTicketManagementState,
  buildTicketManagementUpdate,
  ticketToManagementForm,
  type TicketManagementForm,
} from "@/features/ticket-detail/ticket-edit";
import {
  buildVersionedTicketUpdate,
  createTicketEditBaseline,
  shouldApplyTicketRevision,
  type TicketEditBaseline,
} from "@/lib/ticket-version";
import { useTicketDetailOperationGuard } from "./useTicketDetailOperationGuard";

const EMPTY_MANAGEMENT_FORM: TicketManagementForm = {
  estado: TicketEstado.nuevo,
  prioridad: TicketPrioridad.media,
  progreso: 0,
  notas: "",
  fecha_limite: "",
};

interface TicketRefetchResult {
  data: Ticket | undefined;
  error: unknown;
  isError: boolean;
}

interface UseTicketDetailEditingOptions {
  ticketId: number;
  ticket: Ticket | undefined;
  ticketQueryKey: QueryKey;
  adminMode: boolean;
  refetchTicket: () => Promise<TicketRefetchResult>;
  refetchSeguimientos: () => Promise<unknown>;
}

const IGNORED_TICKET_OPERATION = new Error(
  "La operación pertenece a una sesión de edición anterior",
);

export function useTicketDetailEditing({
  ticketId,
  ticket,
  ticketQueryKey,
  adminMode,
  refetchTicket,
  refetchSeguimientos,
}: UseTicketDetailEditingOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateTicket = useUpdateTicket(undefined);
  const { reset: resetUpdateTicket } = updateTicket;
  const includeEmptyParams = adminMode
    ? ({ incluir_vacios: true } as const)
    : undefined;

  const [isEditing, setIsEditing] = useState(false);
  const [isEditingData, setIsEditingData] = useState(false);
  const [isReloadingConflict, setIsReloadingConflict] = useState(false);
  const [hasVersionConflict, setHasVersionConflict] = useState(false);
  const [editData, setEditData] = useState<TicketManagementForm>(
    EMPTY_MANAGEMENT_FORM,
  );
  const [editBaseline, setEditBaseline] =
    useState<TicketEditBaseline<TicketManagementForm> | null>(null);
  const editorSessionRef = useRef(0);
  const operationGuard = useTicketDetailOperationGuard<"update" | "reload">(
    ticketId,
  );
  const areEditorActionsDisabled =
    updateTicket.isPending || isReloadingConflict;

  useLayoutEffect(() => {
    if (!operationGuard.transitionTicket(ticketId)) return;

    editorSessionRef.current += 1;
    setIsEditing(false);
    setIsEditingData(false);
    setIsReloadingConflict(false);
    setHasVersionConflict(false);
    setEditData({ ...EMPTY_MANAGEMENT_FORM });
    setEditBaseline(null);
    resetUpdateTicket();
  }, [operationGuard, resetUpdateTicket, ticketId]);

  const hasPendingEditorOperation = () => operationGuard.hasPendingOperation();

  const isCurrentRenderBoundary = () =>
    operationGuard.isCurrentBoundary(ticketId);

  const handleEditDialogOpenChange = (open: boolean) => {
    if (!isCurrentRenderBoundary()) return;
    if (open) {
      if (!ticket || hasPendingEditorOperation()) return;
      editorSessionRef.current += 1;
      const form = ticketToManagementForm(
        ticket,
        adminMode ? toDateTimeLocalValue(ticket.fecha_limite) : "",
      );
      setEditData(form);
      setEditBaseline(createTicketEditBaseline(ticket, form));
    } else {
      editorSessionRef.current += 1;
      setEditBaseline(null);
    }
    setIsEditing(open);
  };

  const handleDataEditOpenChange = (open: boolean) => {
    if (!isCurrentRenderBoundary()) return;
    if (open && (!ticket || hasPendingEditorOperation())) return;
    editorSessionRef.current += 1;
    setIsEditingData(open);
  };

  const cacheSavedTicket = (savedTicket: Ticket) => {
    queryClient.setQueryData<TicketDetail>(ticketQueryKey, (current) => {
      if (!current || !shouldApplyTicketRevision(current, savedTicket)) {
        return current;
      }
      return { ...current, ...savedTicket };
    });
  };

  const reportVersionConflict = (
    error: unknown,
    editorSessionIsCurrent: boolean,
  ) => {
    setHasVersionConflict(true);
    toast({
      variant: "warning",
      title: "El ticket cambió en otra sesión",
      description: editorSessionIsCurrent
        ? `${getUserErrorMessage(error)} Conservamos lo que escribiste.`
        : `${getUserErrorMessage(error)} Volvé a abrir el editor para cargar la versión actual.`,
    });
  };

  const loadLatestTicket = async (): Promise<Ticket> => {
    const reloadOperation = operationGuard.start("reload", ticketId);
    if (!reloadOperation) {
      throw IGNORED_TICKET_OPERATION;
    }

    const editorSession = editorSessionRef.current;
    setIsReloadingConflict(true);
    try {
      const [ticketResult] = await Promise.all([
        refetchTicket(),
        refetchSeguimientos(),
      ]);
      if (
        !operationGuard.isCurrent(reloadOperation) ||
        editorSessionRef.current !== editorSession
      ) {
        throw IGNORED_TICKET_OPERATION;
      }
      if (ticketResult.isError || !ticketResult.data) {
        throw ticketResult.error ?? new Error("No se pudo recargar el ticket");
      }
      return ticketResult.data;
    } catch (error) {
      if (
        error === IGNORED_TICKET_OPERATION ||
        !operationGuard.isCurrent(reloadOperation) ||
        editorSessionRef.current !== editorSession
      ) {
        throw IGNORED_TICKET_OPERATION;
      }
      toast({
        variant: "destructive",
        title: "No se pudo cargar la versión actual",
        description: getUserErrorMessage(error),
      });
      throw error;
    } finally {
      if (operationGuard.isCurrent(reloadOperation)) {
        operationGuard.finish(reloadOperation);
        setIsReloadingConflict(false);
      }
    }
  };

  const resolveManagementConflict = async () => {
    const operationTicketId = ticketId;
    const editorSession = editorSessionRef.current;
    try {
      const latestTicket = await loadLatestTicket();
      if (
        !operationGuard.isCurrentBoundary(operationTicketId) ||
        editorSessionRef.current !== editorSession
      ) {
        return;
      }
      const latestForm = ticketToManagementForm(
        latestTicket,
        adminMode ? toDateTimeLocalValue(latestTicket.fecha_limite) : "",
      );
      setEditData(latestForm);
      setEditBaseline(createTicketEditBaseline(latestTicket, latestForm));
      setHasVersionConflict(false);
    } catch {
      // El error ya se informó y el draft permanece intacto.
    }
  };

  const saveManagement = () => {
    if (
      !isCurrentRenderBoundary() ||
      !editBaseline ||
      hasVersionConflict ||
      hasPendingEditorOperation()
    ) {
      return;
    }
    const originalFechaLimite = editBaseline.values.fecha_limite;

    if (adminMode && originalFechaLimite && !editData.fecha_limite) {
      toast({
        variant: "warning",
        title: "Fecha límite requerida",
        description: "La API actual no permite eliminar la fecha límite.",
      });
      return;
    }

    const changes = buildTicketManagementUpdate(editBaseline.values, editData);
    // Si el usuario no modificó el control, se omite el campo para conservar
    // también los segundos y milisegundos que datetime-local no muestra.
    if (
      adminMode &&
      editData.fecha_limite &&
      editData.fecha_limite !== originalFechaLimite
    ) {
      const fechaLimiteIso = dateTimeLocalValueToIso(editData.fecha_limite);
      if (!fechaLimiteIso) {
        toast({
          variant: "warning",
          title: "Fecha límite inválida",
          description: "Revisa la fecha y hora antes de guardar.",
        });
        return;
      }
      changes.fecha_limite = fechaLimiteIso;
    }

    const updatedData = buildVersionedTicketUpdate(
      changes,
      editBaseline.expectedVersion,
    );
    if (!updatedData) {
      handleEditDialogOpenChange(false);
      toast({
        variant: "info",
        title: "Sin cambios para guardar",
        description: `El ticket #${ticketId} conserva sus datos actuales.`,
      });
      return;
    }

    const editorSession = editorSessionRef.current;
    const updateOperation = operationGuard.start("update", ticketId);
    if (!updateOperation) return;

    updateTicket.mutate(
      {
        id: ticketId,
        ...(includeEmptyParams ? { params: includeEmptyParams } : {}),
        data: updatedData,
      },
      {
        onSuccess: (savedTicket) => {
          if (!operationGuard.isCurrent(updateOperation)) return;
          cacheSavedTicket(savedTicket);
          void invalidateTicketDomainQueries(queryClient);
          if (editorSessionRef.current === editorSession) {
            handleEditDialogOpenChange(false);
          }
          const estadoLabel = changes.estado
            ? getEstadoLabel(changes.estado)
            : undefined;
          toast({
            variant: "success",
            title: "Ticket actualizado",
            description: `Ticket #${ticketId}${estadoLabel ? ` · Estado: ${estadoLabel}` : ""}`,
          });
        },
        onError: (error) => {
          if (!operationGuard.isCurrent(updateOperation)) return;
          if (isTicketVersionConflict(error)) {
            reportVersionConflict(
              error,
              editorSessionRef.current === editorSession,
            );
            return;
          }
          toast({
            variant: "destructive",
            title: `No se pudo actualizar el ticket #${ticketId}`,
            description: adminMode
              ? getAdminErrorMessage(error)
              : getUserErrorMessage(error, "Reintentá la operación."),
          });
        },
        onSettled: () => {
          operationGuard.finish(updateOperation);
        },
      },
    );
  };

  const saveFunctionalData = (data: TicketUpdate) => {
    if (
      !isCurrentRenderBoundary() ||
      hasVersionConflict ||
      hasPendingEditorOperation()
    ) {
      return;
    }

    const editorSession = editorSessionRef.current;
    const updateOperation = operationGuard.start("update", ticketId);
    if (!updateOperation) return;

    updateTicket.mutate(
      {
        id: ticketId,
        ...(includeEmptyParams ? { params: includeEmptyParams } : {}),
        data,
      },
      {
        onSuccess: (savedTicket) => {
          if (!operationGuard.isCurrent(updateOperation)) return;
          cacheSavedTicket(savedTicket);
          if (editorSessionRef.current === editorSession) {
            handleDataEditOpenChange(false);
          }
          void invalidateTicketDomainQueries(queryClient);
          toast({
            variant: "success",
            title: "Datos actualizados",
            description: `Los cambios del ticket #${ticketId} quedaron registrados en el historial.`,
          });
        },
        onError: (error) => {
          if (!operationGuard.isCurrent(updateOperation)) return;
          if (isTicketVersionConflict(error)) {
            reportVersionConflict(
              error,
              editorSessionRef.current === editorSession,
            );
            return;
          }
          toast({
            variant: "destructive",
            title: "No se pudieron guardar los datos",
            description: adminMode
              ? getAdminErrorMessage(error)
              : getUserErrorMessage(error, "Reintentá la operación."),
          });
        },
        onSettled: () => {
          operationGuard.finish(updateOperation);
        },
      },
    );
  };

  const updateManagementDraft = (
    update: (current: TicketManagementForm) => TicketManagementForm,
  ) => {
    if (!isCurrentRenderBoundary() || hasPendingEditorOperation()) return;
    setEditData(update);
  };

  return {
    isReloadingConflict,
    areEditorActionsDisabled,
    openFunctionalEditor: () => handleDataEditOpenChange(true),
    managementDialog: {
      open: isEditing,
      form: editData,
      isReloadingConflict,
      hasVersionConflict,
      isSaving: updateTicket.isPending,
      onOpenChange: handleEditDialogOpenChange,
      onReloadLatest: () => void resolveManagementConflict(),
      onStateChange: (estado: TicketManagementForm["estado"]) =>
        updateManagementDraft((current) =>
          applyTicketManagementState(
            current,
            estado,
            editBaseline?.values ?? current,
          ),
        ),
      onPriorityChange: (prioridad: TicketManagementForm["prioridad"]) =>
        updateManagementDraft((current) => ({ ...current, prioridad })),
      onProgressChange: (progreso: number | undefined) =>
        updateManagementDraft((current) => ({
          ...current,
          progreso: progreso ?? current.progreso,
        })),
      onDeadlineChange: (fecha_limite: string) =>
        updateManagementDraft((current) => ({ ...current, fecha_limite })),
      onNotesChange: (notas: string) =>
        updateManagementDraft((current) => ({ ...current, notas })),
      onSave: saveManagement,
    },
    functionalDialog: {
      open: isEditingData,
      onOpenChange: handleDataEditOpenChange,
      isSaving: updateTicket.isPending,
      hasVersionConflict,
      isReloadingConflict,
      onReloadLatest: loadLatestTicket,
      onVersionConflictResolved: () => setHasVersionConflict(false),
      onSave: saveFunctionalData,
    },
  };
}
