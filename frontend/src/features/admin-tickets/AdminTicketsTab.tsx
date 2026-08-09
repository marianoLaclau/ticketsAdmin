import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  getTicket,
  getListTicketsQueryKey,
  useListTickets,
  useCreateAdminTicket,
  useUpdateTicket,
  useDeleteTicket,
  type Ticket,
  type TicketListResponse,
  type TicketSortBy,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAdminOperationGuard } from "@/hooks/use-admin-operation-guard";
import { adminErrorMessage } from "@/hooks/use-admin-access";
import { isTicketVersionConflict } from "@/lib/error-messages";
import { invalidateTicketDomainQueries } from "@/lib/query-invalidation";
import { AdminTicketDeleteDialog } from "@/features/admin-tickets/AdminTicketDeleteDialog";
import { AdminTicketFormDialog } from "@/features/admin-tickets/AdminTicketFormDialog";
import { AdminTicketsListPanel } from "@/features/admin-tickets/AdminTicketsListPanel";
import { AdminCredentialNotice } from "@/components/admin/AdminCredentialNotice";
import type {
  AdminTicketsUrlNavigation,
  AdminTicketsUrlUpdate,
} from "@/features/admin-tickets/useAdminTicketsUrl";

import { TabsContent } from "@/components/ui/tabs";
import { getContactDisplayName } from "@/lib/contacto";
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
import {
  buildAdminTicketInput,
  buildAdminTicketUpdate,
  createEmptyAdminTicketForm,
  ticketToAdminTicketForm,
  type AdminTicketForm,
} from "@/lib/admin-ticket-form";
import {
  buildVersionedTicketUpdate,
  createTicketEditBaseline,
  shouldApplyTicketRevision,
  type TicketEditBaseline,
} from "@/lib/ticket-version";

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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const hasAdminAccess = adminAccessState === "ready";
  const accessBoundary = `${adminAccessState}:${accessVersion}:${accessGeneration}`;
  const { isCurrentOperation, operationGeneration } = useAdminOperationGuard(
    adminAccessState,
    accessGeneration,
  );

  const refrescarTickets = () => invalidateTicketDomainQueries(queryClient);

  const errorToast =
    (title: string, operationAccessGeneration: number) => (err: unknown) => {
      if (!isCurrentOperation(operationAccessGeneration)) return;
      toast({
        variant: "destructive",
        title,
        description: adminErrorMessage(err),
      });
    };

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

  const createTicket = useCreateAdminTicket({ request });
  const updateTicket = useUpdateTicket({ request });
  const deleteTicket = useDeleteTicket({ request });
  const { reset: resetCreateTicket } = createTicket;
  const { reset: resetUpdateTicket } = updateTicket;
  const { reset: resetDeleteTicket } = deleteTicket;

  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [isReloadingTicket, setIsReloadingTicket] = useState(false);
  const [hasVersionConflict, setHasVersionConflict] = useState(false);
  const reloadAttemptRef = useRef(0);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<AdminTicketForm>(createEmptyAdminTicketForm);
  const [editBaseline, setEditBaseline] =
    useState<TicketEditBaseline<AdminTicketForm> | null>(null);
  const [aEliminar, setAEliminar] = useState<Ticket | null>(null);
  const resetAccessBoundaryRef = useRef(accessBoundary);

  useLayoutEffect(() => {
    if (resetAccessBoundaryRef.current === accessBoundary) return;
    resetAccessBoundaryRef.current = accessBoundary;
    reloadAttemptRef.current += 1;
    setDialogAbierto(false);
    setIsReloadingTicket(false);
    setHasVersionConflict(false);
    setEditandoId(null);
    setForm(createEmptyAdminTicketForm());
    setEditBaseline(null);
    setAEliminar(null);
    resetCreateTicket();
    resetUpdateTicket();
    resetDeleteTicket();
  }, [accessBoundary, resetCreateTicket, resetDeleteTicket, resetUpdateTicket]);

  const cambiarEstadoDialogo = (open: boolean) => {
    setDialogAbierto(open);
    if (!open) {
      reloadAttemptRef.current += 1;
      setIsReloadingTicket(false);
      setEditBaseline(null);
      setHasVersionConflict(false);
    }
  };

  const abrirCrear = () => {
    if (!isCurrentOperation(operationGeneration)) return;
    reloadAttemptRef.current += 1;
    setIsReloadingTicket(false);
    setEditandoId(null);
    setEditBaseline(null);
    setHasVersionConflict(false);
    setForm(createEmptyAdminTicketForm());
    setDialogAbierto(true);
  };

  const abrirEditar = (t: Ticket) => {
    if (!isCurrentOperation(operationGeneration) || isReloadingTicket) return;
    reloadAttemptRef.current += 1;
    const snapshot = ticketToAdminTicketForm(t);
    setEditandoId(t.id);
    setEditBaseline(createTicketEditBaseline(t, snapshot));
    setHasVersionConflict(false);
    setForm({ ...snapshot });
    setDialogAbierto(true);
  };

  const abrirEliminar = (ticket: Ticket) => {
    if (!isCurrentOperation(operationGeneration)) return;
    setAEliminar(ticket);
  };

  const cacheTicketInCurrentList = (savedTicket: Ticket) => {
    queryClient.setQueryData<TicketListResponse>(listQueryKey, (current) =>
      current
        ? {
            ...current,
            tickets: current.tickets.map((ticket) =>
              ticket.id === savedTicket.id &&
              shouldApplyTicketRevision(ticket, savedTicket)
                ? savedTicket
                : ticket,
            ),
          }
        : current,
    );
  };

  const guardarRegistro = () => {
    if (
      !isCurrentOperation(operationGeneration) ||
      createTicket.isPending ||
      updateTicket.isPending
    )
      return;
    const operationAccessGeneration = operationGeneration;
    const contacto = getContactDisplayName(form);
    const onOk =
      (titulo: string, dedupeCreated = false) =>
      (savedTicket: Ticket) => {
        if (!isCurrentOperation(operationAccessGeneration)) return;
        cacheTicketInCurrentList(savedTicket);
        cambiarEstadoDialogo(false);
        void refrescarTickets();
        toast({
          ...(dedupeCreated
            ? { dedupeKey: `ticket-created:${savedTicket.id}` }
            : {}),
          variant: "success",
          title: titulo,
          description: contacto,
        });
      };
    if (editandoId === null) {
      createTicket.mutate(
        { data: buildAdminTicketInput(form) },
        {
          onSuccess: onOk("Ticket creado", true),
          onError: errorToast(
            "No se pudo crear el ticket",
            operationAccessGeneration,
          ),
        },
      );
    } else {
      if (!editBaseline) return;
      const update = buildVersionedTicketUpdate(
        buildAdminTicketUpdate(editBaseline.values, form),
        editBaseline.expectedVersion,
      );
      if (!update) {
        cambiarEstadoDialogo(false);
        toast({
          variant: "info",
          title: "Sin cambios para guardar",
          description: `El registro #${editandoId} conserva sus datos actuales.`,
        });
        return;
      }
      updateTicket.mutate(
        {
          id: editandoId,
          data: update,
          params: { incluir_vacios: true },
        },
        {
          onSuccess: onOk("Ticket actualizado"),
          onError: (error) => {
            if (!isCurrentOperation(operationAccessGeneration)) return;
            if (!isTicketVersionConflict(error)) {
              errorToast(
                "No se pudo actualizar el ticket",
                operationAccessGeneration,
              )(error);
              return;
            }

            setHasVersionConflict(true);
            toast({
              variant: "warning",
              title: "El ticket cambió en otra sesión",
              description:
                "Conservamos lo que escribiste. Cargá la versión actual antes de volver a guardar.",
            });
          },
        },
      );
    }
  };

  const resolverConflictoDeVersion = async () => {
    if (
      !isCurrentOperation(operationGeneration) ||
      editandoId === null ||
      isReloadingTicket
    )
      return;
    const operationAccessGeneration = operationGeneration;
    const reloadAttempt = reloadAttemptRef.current + 1;
    reloadAttemptRef.current = reloadAttempt;
    setIsReloadingTicket(true);
    try {
      const [latestTicket] = await Promise.all([
        getTicket(editandoId, { incluir_vacios: true }, queryRequest),
        listQuery.refetch(),
      ]);
      if (
        reloadAttemptRef.current !== reloadAttempt ||
        !isCurrentOperation(operationAccessGeneration)
      )
        return;
      const snapshot = ticketToAdminTicketForm(latestTicket);
      cacheTicketInCurrentList(latestTicket);
      setEditBaseline(createTicketEditBaseline(latestTicket, snapshot));
      setForm({ ...snapshot });
      setHasVersionConflict(false);
    } catch (error) {
      if (
        reloadAttemptRef.current !== reloadAttempt ||
        !isCurrentOperation(operationAccessGeneration)
      )
        return;
      toast({
        variant: "destructive",
        title: "No se pudo cargar la versión actual",
        description: adminErrorMessage(error),
      });
    } finally {
      if (
        reloadAttemptRef.current === reloadAttempt &&
        isCurrentOperation(operationAccessGeneration)
      ) {
        setIsReloadingTicket(false);
      }
    }
  };

  const confirmarEliminar = () => {
    if (
      !isCurrentOperation(operationGeneration) ||
      !aEliminar ||
      deleteTicket.isPending
    )
      return;
    const operationAccessGeneration = operationGeneration;
    deleteTicket.mutate(
      { id: aEliminar.id },
      {
        onSuccess: () => {
          if (!isCurrentOperation(operationAccessGeneration)) return;
          setAEliminar(null);
          void refrescarTickets();
          toast({
            variant: "success",
            title: "Ticket eliminado",
            description: getContactDisplayName(aEliminar),
          });
        },
        onError: errorToast(
          "No se pudo eliminar el ticket",
          operationAccessGeneration,
        ),
      },
    );
  };

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
        isSaving={createTicket.isPending || updateTicket.isPending}
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
        isDeleting={deleteTicket.isPending}
        onDismiss={() => setAEliminar(null)}
        onConfirm={confirmarEliminar}
      />
    </>
  );
}
