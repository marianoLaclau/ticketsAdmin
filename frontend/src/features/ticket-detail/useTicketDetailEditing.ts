import { useState } from "react";
import {
  TicketEstado,
  TicketPrioridad,
  useUpdateTicket,
  type Ticket,
  type TicketDetail,
  type TicketUpdate,
} from "@workspace/api-client-react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { adminErrorMessage } from "@/hooks/use-admin-access";
import { useToast } from "@/hooks/use-toast";
import {
  dateTimeLocalValueToIso,
  toDateTimeLocalValue,
} from "@/lib/datetime-local";
import {
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
} from "@/lib/ticket-edit";
import {
  buildVersionedTicketUpdate,
  createTicketEditBaseline,
  shouldApplyTicketRevision,
  type TicketEditBaseline,
} from "@/lib/ticket-version";

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
  adminRequest: RequestInit;
  refetchTicket: () => Promise<TicketRefetchResult>;
  refetchSeguimientos: () => Promise<unknown>;
}

type VersionConflictEditor = "management" | "data";

export function useTicketDetailEditing({
  ticketId,
  ticket,
  ticketQueryKey,
  adminMode,
  adminRequest,
  refetchTicket,
  refetchSeguimientos,
}: UseTicketDetailEditingOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateTicket = useUpdateTicket(
    adminMode ? { request: adminRequest } : undefined,
  );
  const includeEmptyParams = adminMode
    ? ({ incluir_vacios: true } as const)
    : undefined;

  const [isEditing, setIsEditing] = useState(false);
  const [isEditingData, setIsEditingData] = useState(false);
  const [isReloadingConflict, setIsReloadingConflict] = useState(false);
  const [versionConflict, setVersionConflict] =
    useState<VersionConflictEditor | null>(null);
  const [editData, setEditData] = useState<TicketManagementForm>(
    EMPTY_MANAGEMENT_FORM,
  );
  const [editBaseline, setEditBaseline] =
    useState<TicketEditBaseline<TicketManagementForm> | null>(null);

  const handleEditDialogOpenChange = (open: boolean) => {
    if (open && ticket) {
      const form = ticketToManagementForm(
        ticket,
        adminMode ? toDateTimeLocalValue(ticket.fecha_limite) : "",
      );
      setEditData(form);
      setEditBaseline(createTicketEditBaseline(ticket, form));
      setVersionConflict(null);
    } else if (!open) {
      setEditBaseline(null);
      setVersionConflict((current) =>
        current === "management" ? null : current,
      );
    }
    setIsEditing(open);
  };

  const handleDataEditOpenChange = (open: boolean) => {
    setIsEditingData(open);
    setVersionConflict((current) => {
      if (open) return null;
      return current === "data" ? null : current;
    });
  };

  const cacheSavedTicket = (savedTicket: Ticket) => {
    queryClient.setQueryData<TicketDetail>(ticketQueryKey, (current) => {
      if (!current || !shouldApplyTicketRevision(current, savedTicket)) {
        return current;
      }
      return { ...current, ...savedTicket };
    });
  };

  const markVersionConflict = (
    error: unknown,
    editor: VersionConflictEditor,
  ) => {
    setVersionConflict(editor);
    toast({
      variant: "warning",
      title: "El ticket cambió en otra sesión",
      description: `${getUserErrorMessage(error)} Conservamos lo que escribiste.`,
    });
  };

  const loadLatestTicket = async (): Promise<Ticket> => {
    setIsReloadingConflict(true);
    try {
      const [ticketResult] = await Promise.all([
        refetchTicket(),
        refetchSeguimientos(),
      ]);
      if (ticketResult.isError || !ticketResult.data) {
        throw ticketResult.error ?? new Error("No se pudo recargar el ticket");
      }
      return ticketResult.data;
    } catch (error) {
      toast({
        variant: "destructive",
        title: "No se pudo cargar la versión actual",
        description: getUserErrorMessage(error),
      });
      throw error;
    } finally {
      setIsReloadingConflict(false);
    }
  };

  const resolveManagementConflict = async () => {
    try {
      const latestTicket = await loadLatestTicket();
      const latestForm = ticketToManagementForm(
        latestTicket,
        adminMode ? toDateTimeLocalValue(latestTicket.fecha_limite) : "",
      );
      setEditData(latestForm);
      setEditBaseline(createTicketEditBaseline(latestTicket, latestForm));
      setVersionConflict(null);
    } catch {
      // El error ya se informó y el draft permanece intacto.
    }
  };

  const saveManagement = () => {
    if (!editBaseline) return;
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

    updateTicket.mutate(
      {
        id: ticketId,
        ...(includeEmptyParams ? { params: includeEmptyParams } : {}),
        data: updatedData,
      },
      {
        onSuccess: (savedTicket) => {
          cacheSavedTicket(savedTicket);
          void invalidateTicketDomainQueries(queryClient);
          handleEditDialogOpenChange(false);
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
          if (isTicketVersionConflict(error)) {
            markVersionConflict(error, "management");
            return;
          }
          toast({
            variant: "destructive",
            title: `No se pudo actualizar el ticket #${ticketId}`,
            description: adminMode
              ? adminErrorMessage(error)
              : getUserErrorMessage(error, "Reintentá la operación."),
          });
        },
      },
    );
  };

  const saveFunctionalData = (data: TicketUpdate) => {
    updateTicket.mutate(
      {
        id: ticketId,
        ...(includeEmptyParams ? { params: includeEmptyParams } : {}),
        data,
      },
      {
        onSuccess: (savedTicket) => {
          cacheSavedTicket(savedTicket);
          setIsEditingData(false);
          void invalidateTicketDomainQueries(queryClient);
          toast({
            variant: "success",
            title: "Datos actualizados",
            description: `Los cambios del ticket #${ticketId} quedaron registrados en el historial.`,
          });
        },
        onError: (error) => {
          if (isTicketVersionConflict(error)) {
            markVersionConflict(error, "data");
            return;
          }
          toast({
            variant: "destructive",
            title: "No se pudieron guardar los datos",
            description: adminMode
              ? adminErrorMessage(error)
              : getUserErrorMessage(error, "Reintentá la operación."),
          });
        },
      },
    );
  };

  return {
    isReloadingConflict,
    openFunctionalEditor: () => handleDataEditOpenChange(true),
    managementDialog: {
      open: isEditing,
      form: editData,
      isReloadingConflict,
      hasVersionConflict: versionConflict === "management",
      isSaving: updateTicket.isPending,
      onOpenChange: handleEditDialogOpenChange,
      onReloadLatest: () => void resolveManagementConflict(),
      onStateChange: (estado: TicketManagementForm["estado"]) =>
        setEditData((current) =>
          applyTicketManagementState(
            current,
            estado,
            editBaseline?.values ?? current,
          ),
        ),
      onPriorityChange: (prioridad: TicketManagementForm["prioridad"]) =>
        setEditData((current) => ({ ...current, prioridad })),
      onProgressChange: (progreso: number | undefined) =>
        setEditData((current) => ({
          ...current,
          progreso: progreso ?? current.progreso,
        })),
      onDeadlineChange: (fecha_limite: string) =>
        setEditData((current) => ({ ...current, fecha_limite })),
      onNotesChange: (notas: string) =>
        setEditData((current) => ({ ...current, notas })),
      onSave: saveManagement,
    },
    functionalDialog: {
      open: isEditingData,
      onOpenChange: handleDataEditOpenChange,
      isSaving: updateTicket.isPending,
      hasVersionConflict: versionConflict === "data",
      isReloadingConflict,
      onReloadLatest: loadLatestTicket,
      onVersionConflictResolved: () => setVersionConflict(null),
      onSave: saveFunctionalData,
    },
  };
}
