import { useEffect } from "react";
import {
  getListTicketsQueryKey,
  useListTickets,
  type TicketSortBy,
} from "@workspace/api-client-react";
import { adminErrorMessage } from "@/hooks/use-admin-access";
import { AdminTicketDeleteDialog } from "@/features/admin-tickets/AdminTicketDeleteDialog";
import { AdminTicketFormDialog } from "@/features/admin-tickets/AdminTicketFormDialog";
import { AdminTicketsListPanel } from "@/features/admin-tickets/AdminTicketsListPanel";
import { useAdminTicketsCrud } from "@/features/admin-tickets/useAdminTicketsCrud";
import { AdminCredentialNotice } from "@/components/admin/AdminCredentialNotice";
import type {
  AdminTicketsUrlNavigation,
  AdminTicketsUrlUpdate,
} from "@/features/admin-tickets/useAdminTicketsUrl";

import { TabsContent } from "@/components/ui/tabs";
import type { AdminCredentialState } from "@/lib/admin-credential-state";
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
  request: RequestInit;
  queryRequest: RequestInit;
  adminAccessState: AdminCredentialState;
  accessVersion: number;
  accessGeneration: number;
  urlState: AdminTicketsUrlState;
  updateUrlState: (
    update: AdminTicketsUrlUpdate,
    navigation?: AdminTicketsUrlNavigation,
  ) => void;
  detailNavigationState: AdminTicketDetailNavigationState;
}

export function AdminTicketsTab({
  request,
  queryRequest,
  adminAccessState,
  accessVersion,
  accessGeneration,
  urlState,
  updateUrlState,
  detailNavigationState,
}: AdminTicketsTabProps) {
  const hasAdminAccess = adminAccessState === "ready";

  // ---------- Registros (CRUD) ----------
  const { page, limit: pageSize, sort: sorts } = urlState;
  const search = urlState.search ?? "";
  const listParams = {
    ...buildTicketListParams({ search }, sorts, page, pageSize),
    incluir_vacios: true,
  };
  const listQueryKey = [
    ...getListTicketsQueryKey(listParams),
    "admin-access",
    accessVersion,
  ] as const;
  const listQuery = useListTickets(listParams, {
    query: {
      enabled: hasAdminAccess,
      queryKey: listQueryKey,
      retry: false,
    },
    request: queryRequest,
  });
  const { data: listResponse, isLoading } = listQuery;
  const tickets = listResponse?.tickets ?? [];
  const total = listResponse?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (hasAdminAccess && listResponse && page > totalPages) {
      updateUrlState((current) => ({ ...current, page: totalPages }));
    }
  }, [hasAdminAccess, listResponse, page, totalPages, updateUrlState]);

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
    request,
    queryRequest,
    adminAccessState,
    accessVersion,
    accessGeneration,
    currentListQueryKey: listQueryKey,
    refetchCurrentList: () => listQuery.refetch(),
  });

  if (adminAccessState !== "ready") {
    return (
      <TabsContent value="registros" className="mt-4">
        <AdminCredentialNotice
          state={adminAccessState}
          pendingDescription="Esperá un instante antes de consultar o gestionar registros."
          missingDescription="Los registros administrativos permanecen protegidos. Completá la llave en la cabecera para consultarlos y gestionarlos."
        />
      </TabsContent>
    );
  }

  return (
    <>
      <AdminTicketsListPanel
        search={search}
        sorts={sorts}
        isDefaultSort={isDefaultTicketSort(sorts)}
        tickets={tickets}
        isLoading={isLoading}
        errorMessage={
          listQuery.isError ? adminErrorMessage(listQuery.error) : null
        }
        isEditDisabled={isReloadingTicket}
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
        onDismiss={descartarEliminacion}
        onConfirm={confirmarEliminar}
      />
    </>
  );
}
