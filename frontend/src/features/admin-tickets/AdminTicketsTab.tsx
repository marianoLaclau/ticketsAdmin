import { useEffect, useRef, useState } from "react";
import {
  getTicket,
  getListTicketsQueryKey,
  useListTickets,
  useCreateAdminTicket,
  useUpdateTicket,
  useDeleteTicket,
  TicketSortBy,
  type Ticket,
  type TicketListResponse,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { adminErrorMessage } from "@/hooks/use-admin-access";
import { isTicketVersionConflict } from "@/lib/error-messages";
import { SortableTableHead } from "@/components/SortableTableHead";
import { AdminTicketsPagination } from "@/features/admin-tickets/AdminTicketsPagination";
import { AdminTicketDeleteDialog } from "@/features/admin-tickets/AdminTicketDeleteDialog";
import { AdminTicketFormDialog } from "@/features/admin-tickets/AdminTicketFormDialog";
import { AdminTicketTableRow } from "@/features/admin-tickets/AdminTicketTableRow";

import { TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, RotateCcw } from "lucide-react";
import { getContactDisplayName } from "@/lib/contacto";
import {
  createDefaultTicketSort,
  isDefaultTicketSort,
  nextTicketSort,
  serializeTicketSort,
  type TicketSortRule,
} from "@/lib/ticket-list-controls";
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
  hasAdminAccess: boolean;
  accessVersion: number;
}

export function AdminTicketsTab({
  request,
  hasAdminAccess,
  accessVersion,
}: AdminTicketsTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const refrescarTodo = () => queryClient.invalidateQueries();

  const errorToast = (title: string) => (err: unknown) => {
    toast({
      variant: "destructive",
      title,
      description: adminErrorMessage(err),
    });
  };

  // ---------- Registros (CRUD) ----------
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [sorts, setSorts] = useState<TicketSortRule[]>(createDefaultTicketSort);
  const listParams = {
    page,
    limit: pageSize,
    incluir_vacios: true,
    sort: serializeTicketSort(sorts),
    // Compatibilidad con el contrato anterior mientras conviven clientes.
    sort_by: sorts[0]?.sortBy ?? TicketSortBy.fecha_creacion,
    order: sorts[0]?.order ?? "desc",
    ...(search ? { search } : {}),
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
    request,
  });
  const { data: listResponse, isLoading } = listQuery;
  const tickets = listResponse?.tickets ?? [];
  const total = listResponse?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  useEffect(() => {
    if (listResponse && page > totalPages) setPage(totalPages);
  }, [listResponse, page, totalPages]);

  const ordenarRegistros = (column: TicketSortBy, additive: boolean) => {
    setSorts((current) => nextTicketSort(current, column, additive));
    setPage(1);
  };

  const restablecerOrdenRegistros = () => {
    setSorts(createDefaultTicketSort());
    setPage(1);
  };

  const createTicket = useCreateAdminTicket({ request });
  const updateTicket = useUpdateTicket({ request });
  const deleteTicket = useDeleteTicket({ request });

  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [isReloadingTicket, setIsReloadingTicket] = useState(false);
  const [hasVersionConflict, setHasVersionConflict] = useState(false);
  const reloadAttemptRef = useRef(0);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<AdminTicketForm>(createEmptyAdminTicketForm);
  const [editBaseline, setEditBaseline] =
    useState<TicketEditBaseline<AdminTicketForm> | null>(null);
  const [aEliminar, setAEliminar] = useState<Ticket | null>(null);

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
    reloadAttemptRef.current += 1;
    setIsReloadingTicket(false);
    setEditandoId(null);
    setEditBaseline(null);
    setHasVersionConflict(false);
    setForm(createEmptyAdminTicketForm());
    setDialogAbierto(true);
  };

  const abrirEditar = (t: Ticket) => {
    if (isReloadingTicket) return;
    reloadAttemptRef.current += 1;
    const snapshot = ticketToAdminTicketForm(t);
    setEditandoId(t.id);
    setEditBaseline(createTicketEditBaseline(t, snapshot));
    setHasVersionConflict(false);
    setForm({ ...snapshot });
    setDialogAbierto(true);
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
    const contacto = getContactDisplayName(form);
    const onOk =
      (titulo: string, dedupeCreated = false) =>
      (savedTicket: Ticket) => {
        cacheTicketInCurrentList(savedTicket);
        cambiarEstadoDialogo(false);
        void refrescarTodo();
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
          onError: errorToast("No se pudo crear el ticket"),
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
            if (!isTicketVersionConflict(error)) {
              errorToast("No se pudo actualizar el ticket")(error);
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
    if (editandoId === null) return;
    const reloadAttempt = reloadAttemptRef.current + 1;
    reloadAttemptRef.current = reloadAttempt;
    setIsReloadingTicket(true);
    try {
      const [latestTicket] = await Promise.all([
        getTicket(editandoId, { incluir_vacios: true }, request),
        listQuery.refetch(),
      ]);
      if (reloadAttemptRef.current !== reloadAttempt) return;
      const snapshot = ticketToAdminTicketForm(latestTicket);
      cacheTicketInCurrentList(latestTicket);
      setEditBaseline(createTicketEditBaseline(latestTicket, snapshot));
      setForm({ ...snapshot });
      setHasVersionConflict(false);
    } catch (error) {
      if (reloadAttemptRef.current !== reloadAttempt) return;
      toast({
        variant: "destructive",
        title: "No se pudo cargar la versión actual",
        description: adminErrorMessage(error),
      });
    } finally {
      if (reloadAttemptRef.current === reloadAttempt) {
        setIsReloadingTicket(false);
      }
    }
  };

  const confirmarEliminar = () => {
    if (!aEliminar) return;
    deleteTicket.mutate(
      { id: aEliminar.id },
      {
        onSuccess: () => {
          setAEliminar(null);
          void refrescarTodo();
          toast({
            variant: "success",
            title: "Ticket eliminado",
            description: getContactDisplayName(aEliminar),
          });
        },
        onError: errorToast("No se pudo eliminar el ticket"),
      },
    );
  };

  return (
    <>
      <TabsContent value="registros" className="space-y-3 mt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full flex-1 sm:max-w-lg">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar en todos los campos..."
              className="pl-8 h-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Button onClick={abrirCrear} className="h-9 w-full sm:w-auto">
            <Plus className="mr-1.5 h-4 w-4" /> Nuevo registro
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Esta vista incluye los registros en cuarentena sin datos útiles,
          ocultos en Tickets y Dashboard.
        </p>

        <div className="bg-card border border-border rounded-md shadow-sm overflow-hidden">
          <div className="flex flex-col items-start justify-between gap-1.5 border-b border-slate-200 bg-slate-50/60 px-3 py-1.5 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:gap-3">
            <span>
              Ordená con un clic. Usá{" "}
              <kbd className="rounded border bg-white px-1 font-sans">
                Shift
              </kbd>{" "}
              + clic para combinar varias columnas; los números indican su
              prioridad.
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={restablecerOrdenRegistros}
              disabled={isDefaultTicketSort(sorts)}
              className="h-7 shrink-0 gap-1.5 px-2 text-[11px] font-medium"
              title="Volver a Fecha de llegada, más recientes primero"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restablecer orden
            </Button>
          </div>
          <div className="max-w-full overflow-x-auto">
            <Table className="min-w-[1900px]">
              <TableHeader className="bg-slate-50/80">
                <TableRow>
                  <SortableTableHead
                    label="ID"
                    column={TicketSortBy.id}
                    sorts={sorts}
                    onSort={ordenarRegistros}
                    className="w-[70px]"
                  />
                  <SortableTableHead
                    label="Fecha y hora"
                    column={TicketSortBy.fecha_creacion}
                    sorts={sorts}
                    onSort={ordenarRegistros}
                    className="w-[145px]"
                  />
                  <SortableTableHead
                    label="Conversation ID"
                    column={TicketSortBy.conversation_id}
                    sorts={sorts}
                    onSort={ordenarRegistros}
                    className="w-[210px]"
                  />
                  <SortableTableHead
                    label="Contacto"
                    column={TicketSortBy.contacto}
                    sorts={sorts}
                    onSort={ordenarRegistros}
                    className="w-[250px]"
                  />
                  <SortableTableHead
                    label="Empresa"
                    column={TicketSortBy.empresa}
                    sorts={sorts}
                    onSort={ordenarRegistros}
                    className="w-[180px]"
                  />
                  <SortableTableHead
                    label="Categoría y motivo"
                    column={TicketSortBy.motivo_categoria}
                    sorts={sorts}
                    onSort={ordenarRegistros}
                    className="w-[280px]"
                  />
                  <SortableTableHead
                    label="Estado"
                    column={TicketSortBy.estado}
                    sorts={sorts}
                    onSort={ordenarRegistros}
                    className="w-[140px]"
                  />
                  <SortableTableHead
                    label="Prioridad"
                    column={TicketSortBy.prioridad}
                    sorts={sorts}
                    onSort={ordenarRegistros}
                    className="w-[110px]"
                  />
                  <SortableTableHead
                    label="Asignado"
                    column={TicketSortBy.asignado_a}
                    sorts={sorts}
                    onSort={ordenarRegistros}
                    className="w-[170px]"
                  />
                  <SortableTableHead
                    label="Vencimiento"
                    column={TicketSortBy.fecha_limite}
                    sorts={sorts}
                    onSort={ordenarRegistros}
                    className="w-[165px]"
                  />
                  <TableHead className="sticky right-0 z-10 w-[190px] bg-slate-50 text-right text-xs uppercase shadow-[-4px_0_6px_-6px_rgba(15,23,42,0.45)]">
                    Acciones
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!hasAdminAccess ? (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className="h-40 text-center text-sm text-muted-foreground"
                    >
                      Ingresá la llave de administración para ver todos los
                      registros.
                    </TableCell>
                  </TableRow>
                ) : isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 11 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : listQuery.isError ? (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className="h-40 text-center text-sm text-destructive"
                    >
                      {adminErrorMessage(listQuery.error)}
                    </TableCell>
                  </TableRow>
                ) : tickets.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className="h-40 text-center text-sm text-muted-foreground"
                    >
                      No hay registros
                      {search ? " que coincidan con la búsqueda" : ""}.
                    </TableCell>
                  </TableRow>
                ) : (
                  tickets.map((ticket) => (
                    <AdminTicketTableRow
                      key={ticket.id}
                      ticket={ticket}
                      isEditDisabled={isReloadingTicket}
                      onOpen={(id) => setLocation(`/admin/tickets/${id}`)}
                      onEdit={abrirEditar}
                      onDelete={setAEliminar}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <AdminTicketsPagination
            page={page}
            pageSize={pageSize}
            total={total}
            totalPages={totalPages}
            onPageSizeChange={setPageSize}
            onPreviousPage={() => setPage((current) => current - 1)}
            onNextPage={() => setPage((current) => current + 1)}
          />
        </div>
      </TabsContent>

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
