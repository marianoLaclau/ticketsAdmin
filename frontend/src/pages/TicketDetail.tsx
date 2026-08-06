import React, { useState } from 'react';
import { useLocation, useParams } from 'wouter';
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
} from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

import { 
  ArrowLeft, 
  User, 
  Clock, 
} from 'lucide-react';
import { formatDate, isVencido, EstadoBadge, PrioridadBadge } from '@/lib/utils-tickets';
import { getEstadoLabel } from '@/lib/estados';
import { dateTimeLocalValueToIso, toDateTimeLocalValue } from '@/lib/datetime-local';
import { puedeCerrarTickets } from '@/lib/roles';
import { ErrorPage, getErrorStatus } from '@/components/ErrorPage';
import {
  getUserErrorMessage,
  isTicketVersionConflict,
} from '@/lib/error-messages';
import { useAdminAccess, adminErrorMessage } from '@/hooks/use-admin-access';
import { TicketDataEditDialog } from '@/components/tickets/TicketDataEditDialog';
import { TicketVersionConflictAlert } from '@/components/tickets/TicketVersionConflictAlert';
import { TicketCallSummaryCard } from '@/features/ticket-detail/TicketCallSummaryCard';
import { TicketContactCard } from '@/features/ticket-detail/TicketContactCard';
import { TicketHistoryCard } from '@/features/ticket-detail/TicketHistoryCard';
import { TicketProgressCard } from '@/features/ticket-detail/TicketProgressCard';
import { TicketTimingCard } from '@/features/ticket-detail/TicketTimingCard';
import {
  applyTicketManagementState,
  buildTicketManagementUpdate,
  ticketToManagementForm,
  type TicketManagementForm,
} from '@/lib/ticket-edit';
import {
  buildVersionedTicketUpdate,
  createTicketEditBaseline,
  shouldApplyTicketRevision,
  type TicketEditBaseline,
} from '@/lib/ticket-version';
import { getAssignedDisplayName } from '@/lib/asignacion';

const EMPTY_MANAGEMENT_FORM: TicketManagementForm = {
  estado: TicketEstado.nuevo,
  prioridad: TicketPrioridad.media,
  progreso: 0,
  notas: '',
  fecha_limite: '',
};

interface TicketDetailProps {
  adminMode?: boolean;
}

export default function TicketDetail({ adminMode = false }: TicketDetailProps) {
  const { id } = useParams<{ id: string }>();
  const ticketId = parseInt(id || '0', 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { adminKey, adminRequest } = useAdminAccess();
  const includeEmptyParams = adminMode ? { incluir_vacios: true } : undefined;
  const requestOptions = adminMode ? adminRequest : undefined;
  const queryScope = adminMode ? 'admin' : 'operativo';
  const ticketQueryKey = ['/api/tickets', ticketId, queryScope] as const;

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
      queryKey: ['/api/tickets', ticketId, queryScope, 'seguimientos'],
    },
    request: requestOptions,
  });
  const { data: seguimientos, isLoading: loadingSeguimientos } = seguimientosQuery;

  const updateTicket = useUpdateTicket(adminMode ? { request: adminRequest } : undefined);
  const createSeguimiento = useCreateSeguimiento(adminMode ? { request: adminRequest } : undefined);

  // Cerrar tickets es exclusivo de Administrador/SysAdmin (el backend lo
  // valida igual; acá se grisa la opción para el resto de los roles)
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const puedeCerrar = puedeCerrarTickets(me?.rol);

  // Edit states
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingData, setIsEditingData] = useState(false);
  const [isReloadingConflict, setIsReloadingConflict] = useState(false);
  const [versionConflict, setVersionConflict] = useState<
    'management' | 'data' | null
  >(null);
  const [editData, setEditData] = useState<TicketManagementForm>(
    EMPTY_MANAGEMENT_FORM,
  );
  const [editBaseline, setEditBaseline] =
    useState<TicketEditBaseline<TicketManagementForm> | null>(null);
  
  // New seguimiento state
  const [newSeguimiento, setNewSeguimiento] = useState('');

  const handleEditDialogOpenChange = (open: boolean) => {
    if (open && ticket) {
      const form = ticketToManagementForm(
        ticket,
        adminMode ? toDateTimeLocalValue(ticket.fecha_limite) : '',
      );
      setEditData(form);
      setEditBaseline(createTicketEditBaseline(ticket, form));
      setVersionConflict(null);
    } else if (!open) {
      setEditBaseline(null);
      setVersionConflict((current) =>
        current === 'management' ? null : current,
      );
    }
    setIsEditing(open);
  };

  const handleDataEditOpenChange = (open: boolean) => {
    setIsEditingData(open);
    setVersionConflict((current) => {
      if (open) return null;
      return current === 'data' ? null : current;
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
    editor: 'management' | 'data',
  ) => {
    setVersionConflict(editor);
    toast({
      variant: 'warning',
      title: 'El ticket cambió en otra sesión',
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
        throw ticketResult.error ?? new Error('No se pudo recargar el ticket');
      }
      return ticketResult.data;
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'No se pudo cargar la versión actual',
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
        adminMode ? toDateTimeLocalValue(latestTicket.fecha_limite) : '',
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
        variant: 'warning',
        title: 'Fecha límite requerida',
        description: 'La API actual no permite eliminar la fecha límite.',
      });
      return;
    }

    const changes = buildTicketManagementUpdate(editBaseline.values, editData);
    // Si el usuario no modificó el control, se omite el campo para conservar
    // también los segundos y milisegundos que datetime-local no muestra.
    if (adminMode && editData.fecha_limite && editData.fecha_limite !== originalFechaLimite) {
      const fechaLimiteIso = dateTimeLocalValueToIso(editData.fecha_limite);
      if (!fechaLimiteIso) {
        toast({
          variant: 'warning',
          title: 'Fecha límite inválida',
          description: 'Revisa la fecha y hora antes de guardar.',
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
        variant: 'info',
        title: 'Sin cambios para guardar',
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
          void queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
          handleEditDialogOpenChange(false);
          const estadoLabel = changes.estado
            ? getEstadoLabel(changes.estado)
            : undefined;
          toast({
            variant: 'success',
            title: 'Ticket actualizado',
            description: `Ticket #${ticketId}${estadoLabel ? ` · Estado: ${estadoLabel}` : ''}`,
          });
        },
        onError: (error) => {
          if (isTicketVersionConflict(error)) {
            markVersionConflict(error, 'management');
            return;
          }
          toast({
            variant: 'destructive',
            title: `No se pudo actualizar el ticket #${ticketId}`,
            description: adminMode
              ? adminErrorMessage(error)
              : getUserErrorMessage(error, 'Reintentá la operación.'),
          });
        }
      }
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
          void queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
          toast({
            variant: 'success',
            title: 'Datos actualizados',
            description: `Los cambios del ticket #${ticketId} quedaron registrados en el historial.`,
          });
        },
        onError: (error) => {
          if (isTicketVersionConflict(error)) {
            markVersionConflict(error, 'data');
            return;
          }
          toast({
            variant: 'destructive',
            title: 'No se pudieron guardar los datos',
            description: adminMode
              ? adminErrorMessage(error)
              : getUserErrorMessage(error, 'Reintentá la operación.'),
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
          void queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
          setNewSeguimiento('');
          toast({
            variant: 'success',
            title: 'Seguimiento agregado',
            description: seguimiento.length > 90 ? `${seguimiento.slice(0, 90)}…` : seguimiento,
          });
        },
        onError: (error) => {
          toast({
            variant: 'destructive',
            title: 'No se pudo agregar el seguimiento',
            description: adminMode
              ? adminErrorMessage(error)
              : getUserErrorMessage(error, 'Reintentá la operación.'),
          });
        }
      }
    );
  };

  const detailError = ticketQuery.error ?? seguimientosQuery.error;
  const detailStatus = getErrorStatus(detailError);

  if (adminMode && !adminKey) {
    return (
      <ErrorPage
        status={401}
        title="Falta la llave de administración"
        message="Volvé a Administración e ingresá la llave para abrir este registro."
        homeHref="/admin"
      />
    );
  }

  if (ticketQuery.isError || seguimientosQuery.isError) {
    const notFound = detailStatus === 404;
    return (
      <ErrorPage
        status={detailStatus ?? 503}
        title={notFound ? 'Ticket no encontrado' : 'No pudimos cargar el ticket'}
        message={notFound
          ? 'El ticket solicitado no existe o ya fue eliminado.'
          : adminMode
            ? adminErrorMessage(detailError)
            : 'No fue posible obtener el ticket o su historial. Reintentá o volvé al inicio.'}
        homeHref={adminMode ? '/admin' : '/dashboard'}
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
    return <ErrorPage status={404} title="Ticket no encontrado" message="El ticket solicitado no existe o ya fue eliminado." />;
  }

  const vencido = isVencido(ticket.fecha_limite, ticket.estado);

  return (
    <div className="p-8 max-w-6xl mx-auto w-full space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => setLocation(adminMode ? '/admin' : '/tickets')}
            className="mt-1 shrink-0 bg-white"
            aria-label={adminMode ? 'Volver a Administración' : 'Volver a Tickets'}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                {ticket.motivo?.trim() || 'Sin motivo proporcionado'}
              </h1>
              {vencido && (
                <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1 border border-red-200">
                  <Clock className="h-3 w-3" /> Vencido
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Creado: {formatDate(ticket.fecha_creacion)}
              </span>
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                Asignado a: {getAssignedDisplayName(ticket.asignado_a)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <EstadoBadge estado={ticket.estado} className="text-sm px-3 py-1" />
          <PrioridadBadge prioridad={ticket.prioridad} className="text-sm px-3 py-1" />
          
          <Dialog open={isEditing} onOpenChange={handleEditDialogOpenChange}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="bg-white"
                disabled={isReloadingConflict}
              >
                Editar Estado
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Actualizar Ticket</DialogTitle>
                <DialogDescription>
                  Modifica el estado, prioridad o notas de gestión.
                </DialogDescription>
              </DialogHeader>
              {versionConflict === 'management' && (
                <TicketVersionConflictAlert
                  isReloading={isReloadingConflict}
                  onReload={() => void resolveManagementConflict()}
                />
              )}
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Estado</label>
                    <Select
                      value={editData.estado}
                      onValueChange={(estado) =>
                        setEditData((current) =>
                          applyTicketManagementState(
                            current,
                            estado as TicketManagementForm['estado'],
                            editBaseline?.values ?? current,
                          ),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(TicketEstado).map((e: string) => (
                          <SelectItem
                            key={e}
                            value={e}
                            disabled={e === TicketEstado.cerrado && !puedeCerrar}
                          >
                            {getEstadoLabel(e).toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!puedeCerrar && (
                      <p className="text-[11px] text-muted-foreground">
                        Solo puede ser cerrado por un administrador
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Prioridad</label>
                    <Select
                      value={editData.prioridad}
                      onValueChange={(prioridad) =>
                        setEditData((current) => ({
                          ...current,
                          prioridad:
                            prioridad as TicketManagementForm['prioridad'],
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(TicketPrioridad).map((p: string) => (
                          <SelectItem key={p} value={p}>{p.toUpperCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="flex justify-between">
                    <label className="text-sm font-medium">Progreso</label>
                    <span className="text-sm text-slate-500">{editData.progreso}%</span>
                  </div>
                  <Slider 
                    value={[editData.progreso]} 
                    onValueChange={(value) =>
                      setEditData((current) => ({
                        ...current,
                        progreso: value[0] ?? current.progreso,
                      }))
                    }
                    max={100}
                    step={5}
                  />
                </div>

                {adminMode && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Fecha Límite</label>
                    <Input
                      type="datetime-local"
                      value={editData.fecha_limite}
                      onChange={(event) =>
                        setEditData((current) => ({
                          ...current,
                          fecha_limite: event.target.value,
                        }))
                      }
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Campo técnico protegido por la llave de administración.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Notas Internas</label>
                  <Textarea 
                    value={editData.notas}
                    onChange={(event) =>
                      setEditData((current) => ({
                        ...current,
                        notas: event.target.value,
                      }))
                    }
                    placeholder="Notas visibles solo para agentes..."
                    className="h-24"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => handleEditDialogOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleUpdateTicket}
                  disabled={
                    updateTicket.isPending ||
                    versionConflict === 'management'
                  }
                >
                  {updateTicket.isPending ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <TicketDataEditDialog
        ticket={ticket}
        open={isEditingData}
        onOpenChange={handleDataEditOpenChange}
        isSaving={updateTicket.isPending}
        hasVersionConflict={versionConflict === 'data'}
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
