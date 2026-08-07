import React, { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useHistoryState } from "wouter/use-browser-location";
import {
  useGetTicket,
  useUpdateTicket,
  useListSeguimientos,
  useCreateSeguimiento,
  useGetMe,
  getGetMeQueryKey,
  TicketEstado,
  TicketPrioridad,
  type Ticket,
  type TicketDetail as TicketDetailResponse,
  type TicketUpdate,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

import { Skeleton } from "@/components/ui/skeleton";
import { LoadingStatus } from "@/components/ui/loading-status";

import { isVencido, EstadoBadge, PrioridadBadge } from "@/lib/utils-tickets";
import { getEstadoLabel } from "@/lib/estados";
import {
  dateTimeLocalValueToIso,
  toDateTimeLocalValue,
} from "@/lib/datetime-local";
import { puedeCerrarTickets } from "@/lib/roles";
import { ErrorPage, getErrorStatus } from "@/components/ErrorPage";
import {
  getUserErrorMessage,
  isTicketVersionConflict,
} from "@/lib/error-messages";
import { invalidateTicketDomainQueries } from "@/lib/query-invalidation";
import { getAppHref } from "@/lib/base-path";
import { useAdminAccess, adminErrorMessage } from "@/hooks/use-admin-access";
import { TicketDataEditDialog } from "@/components/tickets/TicketDataEditDialog";
import { TicketCallSummaryCard } from "@/features/ticket-detail/TicketCallSummaryCard";
import { TicketContactCard } from "@/features/ticket-detail/TicketContactCard";
import { TicketHeaderSummary } from "@/features/ticket-detail/TicketHeaderSummary";
import { TicketHistoryCard } from "@/features/ticket-detail/TicketHistoryCard";
import { TicketManagementDialog } from "@/features/ticket-detail/TicketManagementDialog";
import { TicketProgressCard } from "@/features/ticket-detail/TicketProgressCard";
import { TicketTimingCard } from "@/features/ticket-detail/TicketTimingCard";
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
import {
  getAdminTicketListReturnTo,
  getTicketListReturnTo,
} from "@/lib/ticket-navigation";

const EMPTY_MANAGEMENT_FORM: TicketManagementForm = {
  estado: TicketEstado.nuevo,
  prioridad: TicketPrioridad.media,
  progreso: 0,
  notas: "",
  fecha_limite: "",
};

interface TicketDetailProps {
  adminMode?: boolean;
}

export default function TicketDetail({ adminMode = false }: TicketDetailProps) {
  const { id } = useParams<{ id: string }>();
  const ticketId = parseInt(id || "0", 10);
  const [, setLocation] = useLocation();
  const historyState = useHistoryState<unknown>();
  const ticketListReturnTo = getTicketListReturnTo(historyState);
  const adminTicketListReturnTo = getAdminTicketListReturnTo(historyState);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { adminKey, adminRequest } = useAdminAccess();
  const includeEmptyParams = adminMode ? { incluir_vacios: true } : undefined;
  const requestOptions = adminMode ? adminRequest : undefined;
  const queryScope = adminMode ? "admin" : "operativo";
  const ticketQueryKey = ["/api/tickets", ticketId, queryScope] as const;

  const ticketQuery = useGetTicket(ticketId, includeEmptyParams, {
    query: {
      enabled: !!ticketId && (!adminMode || Boolean(adminKey)),
      queryKey: ticketQueryKey,
    },
    request: requestOptions,
  });
  const { data: ticket, isLoading: loadingTicket } = ticketQuery;

  const seguimientosQuery = useListSeguimientos(ticketId, includeEmptyParams, {
    query: {
      enabled: !!ticketId && (!adminMode || Boolean(adminKey)),
      queryKey: ["/api/tickets", ticketId, queryScope, "seguimientos"],
    },
    request: requestOptions,
  });
  const { data: seguimientos, isLoading: loadingSeguimientos } =
    seguimientosQuery;

  const updateTicket = useUpdateTicket(
    adminMode ? { request: adminRequest } : undefined,
  );
  const createSeguimiento = useCreateSeguimiento(
    adminMode ? { request: adminRequest } : undefined,
  );

  // Cerrar tickets es exclusivo de Administrador/SysAdmin (el backend lo
  // valida igual; acá se grisa la opción para el resto de los roles)
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const puedeCerrar = puedeCerrarTickets(me?.rol);

  // Edit states
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingData, setIsEditingData] = useState(false);
  const [isReloadingConflict, setIsReloadingConflict] = useState(false);
  const [versionConflict, setVersionConflict] = useState<
    "management" | "data" | null
  >(null);
  const [editData, setEditData] = useState<TicketManagementForm>(
    EMPTY_MANAGEMENT_FORM,
  );
  const [editBaseline, setEditBaseline] =
    useState<TicketEditBaseline<TicketManagementForm> | null>(null);

  // New seguimiento state
  const [newSeguimiento, setNewSeguimiento] = useState("");

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
    queryClient.setQueryData<TicketDetailResponse>(
      ticketQueryKey,
      (current) => {
        if (!current || !shouldApplyTicketRevision(current, savedTicket)) {
          return current;
        }
        return { ...current, ...savedTicket };
      },
    );
  };

  const markVersionConflict = (
    error: unknown,
    editor: "management" | "data",
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
        ticketQuery.refetch({ throwOnError: true }),
        seguimientosQuery.refetch({ throwOnError: true }),
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

  const handleUpdateTicket = () => {
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

  const handleUpdateFunctionalData = (data: TicketUpdate) => {
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

  const handleAddSeguimiento = () => {
    const seguimiento = newSeguimiento.trim();
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
          setNewSeguimiento("");
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

  const handleBack = () => {
    if (adminMode) {
      if (adminTicketListReturnTo && window.history.length > 1) {
        window.history.back();
        return;
      }

      setLocation(adminTicketListReturnTo ?? "/admin", { replace: true });
      return;
    }

    if (ticketListReturnTo && window.history.length > 1) {
      window.history.back();
      return;
    }

    setLocation(ticketListReturnTo ?? "/tickets", { replace: true });
  };

  const detailError = ticketQuery.error ?? seguimientosQuery.error;
  const detailStatus = getErrorStatus(detailError);

  if (adminMode && !adminKey) {
    return (
      <ErrorPage
        embedded
        status={401}
        title="Falta la llave de administración"
        message="Volvé a Administración e ingresá la llave para abrir este registro."
        homeHref={getAppHref(adminTicketListReturnTo ?? "admin")}
      />
    );
  }

  if (ticketQuery.isError || seguimientosQuery.isError) {
    const notFound = detailStatus === 404;
    return (
      <ErrorPage
        embedded
        status={detailStatus ?? 503}
        title={
          notFound ? "Ticket no encontrado" : "No pudimos cargar el ticket"
        }
        message={
          notFound
            ? "El ticket solicitado no existe o ya fue eliminado."
            : adminMode
              ? adminErrorMessage(detailError)
              : "No fue posible obtener el ticket o su historial. Reintentá o volvé al inicio."
        }
        homeHref={getAppHref(
          adminMode ? (adminTicketListReturnTo ?? "admin") : "dashboard",
        )}
        {...(notFound
          ? {}
          : {
              onRetry: () => {
                void ticketQuery.refetch();
                void seguimientosQuery.refetch();
              },
            })}
        isRetrying={ticketQuery.isFetching || seguimientosQuery.isFetching}
      />
    );
  }

  if (loadingTicket) {
    return (
      <div className="p-8 max-w-6xl mx-auto w-full space-y-6">
        <LoadingStatus>Cargando detalle del ticket</LoadingStatus>
        <Skeleton className="h-8 w-64 mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-[400px] w-full" />
            <Skeleton className="h-[300px] w-full" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-[300px] w-full" />
            <Skeleton className="h-[200px] w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <ErrorPage
        embedded
        status={404}
        title="Ticket no encontrado"
        message="El ticket solicitado no existe o ya fue eliminado."
      />
    );
  }

  const vencido = isVencido(ticket.fecha_limite, ticket.estado);

  return (
    <div className="p-8 max-w-6xl mx-auto w-full space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <TicketHeaderSummary
          reason={ticket.motivo}
          createdAt={ticket.fecha_creacion}
          assignedTo={ticket.asignado_a}
          overdue={vencido}
          backLabel={adminMode ? "Volver a Administración" : "Volver a Tickets"}
          onBack={handleBack}
        />

        <div className="flex items-center gap-3 shrink-0">
          <EstadoBadge estado={ticket.estado} className="text-sm px-3 py-1" />
          <PrioridadBadge
            prioridad={ticket.prioridad}
            className="text-sm px-3 py-1"
          />

          <TicketManagementDialog
            open={isEditing}
            form={editData}
            canCloseTickets={puedeCerrar}
            showTechnicalDeadline={adminMode}
            isReloadingConflict={isReloadingConflict}
            hasVersionConflict={versionConflict === "management"}
            isSaving={updateTicket.isPending}
            onOpenChange={handleEditDialogOpenChange}
            onReloadLatest={() => void resolveManagementConflict()}
            onStateChange={(estado) =>
              setEditData((current) =>
                applyTicketManagementState(
                  current,
                  estado,
                  editBaseline?.values ?? current,
                ),
              )
            }
            onPriorityChange={(prioridad) =>
              setEditData((current) => ({ ...current, prioridad }))
            }
            onProgressChange={(progreso) =>
              setEditData((current) => ({
                ...current,
                progreso: progreso ?? current.progreso,
              }))
            }
            onDeadlineChange={(fecha_limite) =>
              setEditData((current) => ({ ...current, fecha_limite }))
            }
            onNotesChange={(notas) =>
              setEditData((current) => ({ ...current, notas }))
            }
            onSave={handleUpdateTicket}
          />
        </div>
      </div>

      <TicketDataEditDialog
        ticket={ticket}
        open={isEditingData}
        onOpenChange={handleDataEditOpenChange}
        isSaving={updateTicket.isPending}
        hasVersionConflict={versionConflict === "data"}
        isReloadingConflict={isReloadingConflict}
        onReloadLatest={loadLatestTicket}
        onVersionConflictResolved={() => setVersionConflict(null)}
        onSave={handleUpdateFunctionalData}
      />

      <TicketProgressCard estado={ticket.estado} progreso={ticket.progreso} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          <TicketCallSummaryCard
            summary={ticket.resumen}
            audioUrl={ticket.audio_url}
            notes={ticket.notas}
          />

          <TicketHistoryCard
            seguimientos={seguimientos}
            isLoading={loadingSeguimientos}
            draft={newSeguimiento}
            isSubmitting={createSeguimiento.isPending}
            onDraftChange={setNewSeguimiento}
            onSubmit={handleAddSeguimiento}
          />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <TicketContactCard
            ticket={ticket}
            onEdit={() => handleDataEditOpenChange(true)}
            isEditDisabled={isReloadingConflict}
          />

          <TicketTimingCard
            deadline={ticket.fecha_limite}
            resolvedAt={ticket.fecha_resolucion}
            overdue={vencido}
          />
        </div>
      </div>
    </div>
  );
}
