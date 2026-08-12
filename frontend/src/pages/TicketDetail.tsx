import { useLocation, useParams } from "wouter";
import { useHistoryState } from "wouter/use-browser-location";
import { useGetTicket, useListSeguimientos } from "@workspace/api-client-react";

import { Skeleton } from "@/components/ui/skeleton";
import { LoadingStatus } from "@/components/ui/loading-status";

import { isVencido, EstadoBadge, PrioridadBadge } from "@/lib/utils-tickets";
import { puedeCerrarTickets } from "@/lib/roles";
import { ErrorPage, getErrorStatus } from "@/components/ErrorPage";
import { getAppHref } from "@/lib/base-path";
import { getAdminErrorMessage } from "@/lib/error-messages";
import { TicketDataEditDialog } from "@/components/tickets/TicketDataEditDialog";
import { TicketCallSummaryCard } from "@/features/ticket-detail/TicketCallSummaryCard";
import { TicketContactCard } from "@/features/ticket-detail/TicketContactCard";
import { TicketHeaderSummary } from "@/features/ticket-detail/TicketHeaderSummary";
import { TicketHistoryCard } from "@/features/ticket-detail/TicketHistoryCard";
import { TicketManagementDialog } from "@/features/ticket-detail/TicketManagementDialog";
import { TicketProgressCard } from "@/features/ticket-detail/TicketProgressCard";
import { TicketTimingCard } from "@/features/ticket-detail/TicketTimingCard";
import { useTicketDetailEditing } from "@/features/ticket-detail/useTicketDetailEditing";
import { useTicketSeguimiento } from "@/features/ticket-detail/useTicketSeguimiento";
import { useProtectedSessionUser } from "@/features/auth/useProtectedSessionUser";
import {
  getAdminTicketListReturnTo,
  getTicketListReturnTo,
} from "@/lib/ticket-navigation";

interface TicketDetailProps {
  adminMode?: boolean;
}

interface TicketDetailContentProps {
  adminMode: boolean;
  historyState: unknown;
  canCloseTickets: boolean;
}

export default function TicketDetail({ adminMode = false }: TicketDetailProps) {
  const historyState = useHistoryState<unknown>();
  const me = useProtectedSessionUser();
  const canCloseTickets = puedeCerrarTickets(me?.rol);

  if (!adminMode) {
    return (
      <TicketDetailContent
        adminMode={false}
        historyState={historyState}
        canCloseTickets={canCloseTickets}
      />
    );
  }

  return (
    <TicketDetailContent
      adminMode
      historyState={historyState}
      canCloseTickets={canCloseTickets}
    />
  );
}

function TicketDetailContent({
  adminMode,
  historyState,
  canCloseTickets,
}: TicketDetailContentProps) {
  const { id } = useParams<{ id: string }>();
  const ticketId = parseInt(id || "0", 10);
  const [, setLocation] = useLocation();
  const ticketListReturnTo = getTicketListReturnTo(historyState);
  const adminTicketListReturnTo = getAdminTicketListReturnTo(historyState);
  const includeEmptyParams = adminMode ? { incluir_vacios: true } : undefined;
  const queryScope = adminMode
    ? (["admin"] as const)
    : (["operativo"] as const);
  const ticketQueryKey = ["/api/tickets", ticketId, ...queryScope] as const;

  const ticketQuery = useGetTicket(ticketId, includeEmptyParams, {
    query: {
      enabled: !!ticketId,
      queryKey: ticketQueryKey,
    },
  });
  const { data: ticket, isLoading: loadingTicket } = ticketQuery;

  const seguimientosQuery = useListSeguimientos(ticketId, includeEmptyParams, {
    query: {
      enabled: !!ticketId,
      queryKey: ["/api/tickets", ticketId, ...queryScope, "seguimientos"],
    },
  });
  const { data: seguimientos, isLoading: loadingSeguimientos } =
    seguimientosQuery;

  const editing = useTicketDetailEditing({
    ticketId,
    ticket,
    ticketQueryKey,
    adminMode,
    refetchTicket: () => ticketQuery.refetch({ throwOnError: true }),
    refetchSeguimientos: () =>
      seguimientosQuery.refetch({ throwOnError: true }),
  });
  const seguimiento = useTicketSeguimiento({
    ticketId,
    adminMode,
  });

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
              ? getAdminErrorMessage(detailError)
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
      <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        <LoadingStatus>Cargando detalle del ticket</LoadingStatus>
        <Skeleton className="h-8 w-64 mb-8" />
        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
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
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 lg:pb-24">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <TicketHeaderSummary
          reason={ticket.motivo}
          createdAt={ticket.fecha_creacion}
          assignedTo={ticket.asignado_a}
          overdue={vencido}
          backLabel={adminMode ? "Volver a Administración" : "Volver a Tickets"}
          onBack={handleBack}
        />

        <div className="flex w-full flex-wrap items-center gap-2 sm:gap-3 md:w-auto md:shrink-0 md:justify-end">
          <EstadoBadge estado={ticket.estado} className="text-sm px-3 py-1" />
          <PrioridadBadge
            prioridad={ticket.prioridad}
            className="text-sm px-3 py-1"
          />

          <TicketManagementDialog
            {...editing.managementDialog}
            canCloseTickets={canCloseTickets}
            showTechnicalDeadline={adminMode}
          />
        </div>
      </div>

      <TicketDataEditDialog ticket={ticket} {...editing.functionalDialog} />

      <TicketProgressCard estado={ticket.estado} progreso={ticket.progreso} />

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
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
            {...seguimiento.historyCard}
          />
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <TicketContactCard
            ticket={ticket}
            onEdit={editing.openFunctionalEditor}
            isEditDisabled={editing.areEditorActionsDisabled}
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
