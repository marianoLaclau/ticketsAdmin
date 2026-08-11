import { useEffect } from "react";
import {
  getListTicketsQueryKey,
  useListTickets,
  type TicketSortBy,
} from "@workspace/api-client-react";
import { AdminTicketDeleteDialog } from "@/features/admin-tickets/AdminTicketDeleteDialog";
import { AdminTicketFormDialog } from "@/features/admin-tickets/AdminTicketFormDialog";
import { AdminTicketsListPanel } from "@/features/admin-tickets/AdminTicketsListPanel";
import { useAdminTicketsCrud } from "@/features/admin-tickets/useAdminTicketsCrud";
import type {
  AdminTicketsUrlNavigation,
  AdminTicketsUrlUpdate,
} from "@/features/admin-tickets/useAdminTicketsUrl";

import { getAdminErrorMessage } from "@/lib/error-messages";
import {
  buildTicketListParams,
  createDefaultTicketSort,
  isDefaultTicketSort,
  nextTicketSort,
} from "@/lib/ticket-list-controls";
import { DEFAULT_TICKET_LIST_PAGE } from "@/lib/ticket-list-url";
import type { AdminTicketsUrlState } from "@/lib/admin-tickets-url";
import type { AdminTicketDetailNavigationState } from "@/lib/ticket-navigation";

interface AdminTicketsTabProps {
  urlState: AdminTicketsUrlState;
  updateUrlState: (
    update: AdminTicketsUrlUpdate,
    navigation?: AdminTicketsUrlNavigation,
  ) => void;
  detailNavigationState: AdminTicketDetailNavigationState;
}

export function AdminTicketsTab({
  urlState,
  updateUrlState,
  detailNavigationState,
}: AdminTicketsTabProps) {
  // ---------- Registros (CRUD) ----------
  const { page, limit: pageSize, sort: sorts } = urlState;
  const search = urlState.search ?? "";
  const listParams = {
    ...buildTicketListParams({ search }, sorts, page, pageSize),
    incluir_vacios: true,
  };
  const listQueryKey = [...getListTicketsQueryKey(listParams)] as const;
  const listQuery = useListTickets(listParams, {
    query: {
      queryKey: listQueryKey,
      retry: false,
    },
  });
  const { data: listResponse, isLoading } = listQuery;
  const tickets = listResponse?.tickets ?? [];
  const total = listResponse?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (listResponse && page > totalPages) {
      updateUrlState((current) => ({ ...current, page: totalPages }));
    }
  }, [listResponse, page, totalPages, updateUrlState]);

  const ordenarRegistros = (column: TicketSortBy, additive: boolean) => {
    updateUrlState((current) => ({
      ...current,
      sort: nextTicketSort(current.sort, column, additive),
      page: DEFAULT_TICKET_LIST_PAGE,
    }));
  };

  const restablecerOrdenRegistros = () => {
    updateUrlState((current) => ({
      ...current,
      sort: createDefaultTicketSort(),
      page: DEFAULT_TICKET_LIST_PAGE,
    }));
  };

  const actualizarBusqueda = (value: string) => {
    updateUrlState((current) => {
      const next = { ...current, page: DEFAULT_TICKET_LIST_PAGE };
      if (value.trim()) next.search = value;
      else delete next.search;
      return next;
    });
  };

  const {
    dialogAbierto,
    editandoId,
    form,
    setForm,
    isSaving,
    areCrudActionsDisabled,
    isReloadingTicket,
    hasVersionConflict,
    aEliminar,
    isDeleting,
    cambiarEstadoDialogo,
    abrirCrear,
    abrirEditar,
    abrirEliminar,
    guardarRegistro,
    resolverConflictoDeVersion,
    descartarEliminacion,
    confirmarEliminar,
  } = useAdminTicketsCrud({
    currentListQueryKey: listQueryKey,
    refetchCurrentList: () => listQuery.refetch(),
  });

  return (
    <>
      <AdminTicketsListPanel
        search={search}
        sorts={sorts}
        isDefaultSort={isDefaultTicketSort(sorts)}
        tickets={tickets}
        isLoading={isLoading}
        errorMessage={
          listQuery.isError ? getAdminErrorMessage(listQuery.error) : null
        }
        areCrudActionsDisabled={areCrudActionsDisabled}
        detailNavigationState={detailNavigationState}
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
        onSearchChange={actualizarBusqueda}
        onCreate={abrirCrear}
        onSort={ordenarRegistros}
        onResetSort={restablecerOrdenRegistros}
        onEdit={abrirEditar}
        onDelete={abrirEliminar}
        onPageSizeChange={(limit) =>
          updateUrlState((current) => ({
            ...current,
            limit,
            page: DEFAULT_TICKET_LIST_PAGE,
          }))
        }
        onPreviousPage={() =>
          updateUrlState(
            (current) => ({ ...current, page: current.page - 1 }),
            "push",
          )
        }
        onNextPage={() =>
          updateUrlState(
            (current) => ({ ...current, page: current.page + 1 }),
            "push",
          )
        }
      />

      <AdminTicketFormDialog
        open={dialogAbierto}
        editingId={editandoId}
        form={form}
        isSaving={isSaving}
        isReloading={isReloadingTicket}
        hasVersionConflict={hasVersionConflict}
        onOpenChange={cambiarEstadoDialogo}
        onFormChange={setForm}
        onReloadLatest={() => void resolverConflictoDeVersion()}
        onSave={guardarRegistro}
      />

      {/* ------------------- CONFIRMAR ELIMINAR ------------------- */}
      <AdminTicketDeleteDialog
        ticket={aEliminar}
        isDeleting={isDeleting}
        isConfirmDisabled={areCrudActionsDisabled}
        onDismiss={descartarEliminacion}
        onConfirm={confirmarEliminar}
      />
    </>
  );
}
