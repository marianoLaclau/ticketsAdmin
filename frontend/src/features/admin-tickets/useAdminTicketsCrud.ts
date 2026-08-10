import { useLayoutEffect, useRef, useState } from "react";
import {
  getTicket,
  useCreateAdminTicket,
  useDeleteTicket,
  useUpdateTicket,
  type Ticket,
  type TicketListResponse,
} from "@workspace/api-client-react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useAdminOperationGuard } from "@/hooks/use-admin-operation-guard";
import { useToast } from "@/hooks/use-toast";
import type { AdminCredentialState } from "@/lib/admin-credential-state";
import { getAdminErrorMessage, isTicketVersionConflict } from "@/lib/error-messages";
import {
  buildAdminTicketInput,
  buildAdminTicketUpdate,
  createEmptyAdminTicketForm,
  ticketToAdminTicketForm,
  type AdminTicketForm,
} from "@/lib/admin-ticket-form";
import { getContactDisplayName } from "@/lib/contacto";
import { invalidateTicketDomainQueries } from "@/lib/query-invalidation";
import {
  buildVersionedTicketUpdate,
  createTicketEditBaseline,
  shouldApplyTicketRevision,
  type TicketEditBaseline,
} from "@/lib/ticket-version";

interface UseAdminTicketsCrudOptions {
  request: RequestInit;
  queryRequest: RequestInit;
  adminAccessState: AdminCredentialState;
  accessVersion: number;
  accessGeneration: number;
  currentListQueryKey: QueryKey;
  refetchCurrentList: () => Promise<unknown>;
}

export function useAdminTicketsCrud({
  request,
  queryRequest,
  adminAccessState,
  accessVersion,
  accessGeneration,
  currentListQueryKey,
  refetchCurrentList,
}: UseAdminTicketsCrudOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const accessBoundary = `${adminAccessState}:${accessVersion}:${accessGeneration}`;
  const { isCurrentOperation, operationGeneration } = useAdminOperationGuard(
    adminAccessState,
    accessGeneration,
  );

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
  const reloadOperationRef = useRef(0);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<AdminTicketForm>(createEmptyAdminTicketForm);
  const [editBaseline, setEditBaseline] =
    useState<TicketEditBaseline<AdminTicketForm> | null>(null);
  const [aEliminar, setAEliminar] = useState<Ticket | null>(null);
  const resetAccessBoundaryRef = useRef(accessBoundary);
  const isCrudPending =
    createTicket.isPending || updateTicket.isPending || deleteTicket.isPending;
  const areCrudActionsDisabled = isCrudPending || isReloadingTicket;

  const refrescarTickets = () => invalidateTicketDomainQueries(queryClient);

  const errorToast =
    (title: string, expectedGeneration: number) => (error: unknown) => {
      if (!isCurrentOperation(expectedGeneration)) return;
      toast({
        variant: "destructive",
        title,
        description: getAdminErrorMessage(error),
      });
    };

  const cacheTicketInCurrentList = (savedTicket: Ticket) => {
    queryClient.setQueryData<TicketListResponse>(
      currentListQueryKey,
      (current) =>
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

  useLayoutEffect(() => {
    if (resetAccessBoundaryRef.current === accessBoundary) return;
    resetAccessBoundaryRef.current = accessBoundary;
    reloadAttemptRef.current += 1;
    reloadOperationRef.current += 1;
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
    if (open && areCrudActionsDisabled) return;
    setDialogAbierto(open);
    if (!open) {
      reloadAttemptRef.current += 1;
      setEditBaseline(null);
      setHasVersionConflict(false);
    }
  };

  const abrirCrear = () => {
    if (!isCurrentOperation(operationGeneration) || areCrudActionsDisabled) {
      return;
    }
    reloadAttemptRef.current += 1;
    setIsReloadingTicket(false);
    setEditandoId(null);
    setEditBaseline(null);
    setHasVersionConflict(false);
    setForm(createEmptyAdminTicketForm());
    setDialogAbierto(true);
  };

  const abrirEditar = (ticket: Ticket) => {
    if (!isCurrentOperation(operationGeneration) || areCrudActionsDisabled) {
      return;
    }
    reloadAttemptRef.current += 1;
    const snapshot = ticketToAdminTicketForm(ticket);
    setEditandoId(ticket.id);
    setEditBaseline(createTicketEditBaseline(ticket, snapshot));
    setHasVersionConflict(false);
    setForm({ ...snapshot });
    setDialogAbierto(true);
  };

  const abrirEliminar = (ticket: Ticket) => {
    if (!isCurrentOperation(operationGeneration) || areCrudActionsDisabled) {
      return;
    }
    setAEliminar(ticket);
  };

  const guardarRegistro = () => {
    if (!isCurrentOperation(operationGeneration) || areCrudActionsDisabled) {
      return;
    }
    const operationAccessGeneration = operationGeneration;
    const contacto = getContactDisplayName(form);
    const onOk =
      (title: string, dedupeCreated = false) =>
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
          title,
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
      return;
    }

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
  };

  const resolverConflictoDeVersion = async () => {
    if (
      !isCurrentOperation(operationGeneration) ||
      editandoId === null ||
      areCrudActionsDisabled
    ) {
      return;
    }
    const operationAccessGeneration = operationGeneration;
    const reloadAttempt = reloadAttemptRef.current + 1;
    reloadAttemptRef.current = reloadAttempt;
    const reloadOperation = reloadOperationRef.current + 1;
    reloadOperationRef.current = reloadOperation;
    setIsReloadingTicket(true);
    try {
      const [latestTicket] = await Promise.all([
        getTicket(editandoId, { incluir_vacios: true }, queryRequest),
        refetchCurrentList(),
      ]);
      if (
        reloadAttemptRef.current !== reloadAttempt ||
        !isCurrentOperation(operationAccessGeneration)
      ) {
        return;
      }
      const snapshot = ticketToAdminTicketForm(latestTicket);
      cacheTicketInCurrentList(latestTicket);
      setEditBaseline(createTicketEditBaseline(latestTicket, snapshot));
      setForm({ ...snapshot });
      setHasVersionConflict(false);
    } catch (error) {
      if (
        reloadAttemptRef.current !== reloadAttempt ||
        !isCurrentOperation(operationAccessGeneration)
      ) {
        return;
      }
      toast({
        variant: "destructive",
        title: "No se pudo cargar la versión actual",
        description: getAdminErrorMessage(error),
      });
    } finally {
      if (
        reloadOperationRef.current === reloadOperation &&
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
      areCrudActionsDisabled
    ) {
      return;
    }
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

  return {
    dialogAbierto,
    editandoId,
    form,
    setForm,
    isSaving: createTicket.isPending || updateTicket.isPending,
    areCrudActionsDisabled,
    isReloadingTicket,
    hasVersionConflict,
    aEliminar,
    isDeleting: deleteTicket.isPending,
    cambiarEstadoDialogo,
    abrirCrear,
    abrirEditar,
    abrirEliminar,
    guardarRegistro,
    resolverConflictoDeVersion,
    descartarEliminacion: () => setAEliminar(null),
    confirmarEliminar,
  };
}
