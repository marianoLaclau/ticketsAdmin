import React, { useState, useEffect } from 'react';
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
  type Seguimiento,
  type TicketUpdate,
} from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  Building, 
  Phone, 
  Mail, 
  Clock, 
  FileText, 
  CheckCircle2, 
  PlayCircle,
  MessageSquare,
  History,
  Headphones,
  Pencil,
} from 'lucide-react';
import { formatDate, isVencido, EstadoBadge, PrioridadBadge } from '@/lib/utils-tickets';
import { getEstadoLabel } from '@/lib/estados';
import { getContactDisplayEmail, getContactDisplayName, getContactDisplayPhone } from '@/lib/contacto';
import { dateTimeLocalValueToIso, toDateTimeLocalValue } from '@/lib/datetime-local';
import { getEstadoEmpleadoConfig } from '@/lib/estado-empleado';
import { puedeCerrarTickets } from '@/lib/roles';
import { ErrorPage, getErrorStatus } from '@/components/ErrorPage';
import { getUserErrorMessage } from '@/lib/error-messages';
import { useAdminAccess, adminErrorMessage } from '@/hooks/use-admin-access';
import { TicketDataEditDialog } from '@/components/tickets/TicketDataEditDialog';
import { getFunctionalFieldLabel } from '@/lib/ticket-edit';
import { getAssignedDisplayName } from '@/lib/asignacion';

const PROGRESS_STEPS = [
  { estado: TicketEstado.nuevo, value: 0, label: 'Nuevo' },
  { estado: TicketEstado.en_proceso, value: 25, label: 'En Proceso' },
  { estado: TicketEstado.pendiente, value: 50, label: getEstadoLabel(TicketEstado.pendiente) },
  { estado: TicketEstado.resuelto, value: 75, label: 'Resuelto' },
  { estado: TicketEstado.cerrado, value: 100, label: 'Cerrado' },
];

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

  const ticketQuery = useGetTicket(ticketId, includeEmptyParams, {
    query: {
      enabled: !!ticketId && (!adminMode || Boolean(adminKey)),
      queryKey: ['/api/tickets', ticketId, queryScope],
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
  const [editData, setEditData] = useState<any>({});
  
  // New seguimiento state
  const [newSeguimiento, setNewSeguimiento] = useState('');

  useEffect(() => {
    if (ticket && !isEditing) {
      setEditData({
        estado: ticket.estado,
        prioridad: ticket.prioridad,
        progreso: ticket.progreso || 0,
        notas: ticket.notas || '',
        ...(adminMode ? { fecha_limite: toDateTimeLocalValue(ticket.fecha_limite) } : {}),
      });
    }
  }, [adminMode, ticket, isEditing]);

  const handleUpdateTicket = () => {
    const originalFechaLimite = toDateTimeLocalValue(ticket?.fecha_limite);

    if (adminMode && originalFechaLimite && !editData.fecha_limite) {
      toast({
        variant: 'warning',
        title: 'Fecha límite requerida',
        description: 'La API actual no permite eliminar la fecha límite.',
      });
      return;
    }

    const estadoStep = PROGRESS_STEPS.find(s => s.estado === editData.estado);
    const updatedData: any = {
      estado: editData.estado,
      prioridad: editData.prioridad,
      notas: editData.notas,
      progreso: estadoStep && ticket?.estado !== editData.estado ? estadoStep.value : editData.progreso,
    };
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
      updatedData.fecha_limite = fechaLimiteIso;
    }

    updateTicket.mutate(
      { id: ticketId, params: includeEmptyParams, data: updatedData },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
          setIsEditing(false);
          const estadoLabel = PROGRESS_STEPS.find((step) => step.estado === editData.estado)?.label;
          toast({
            variant: 'success',
            title: 'Ticket actualizado',
            description: `Ticket #${ticketId}${estadoLabel ? ` · Estado: ${estadoLabel}` : ''}`,
          });
        },
        onError: (error) => {
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
      { id: ticketId, params: includeEmptyParams, data },
      {
        onSuccess: () => {
          setIsEditingData(false);
          queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
          toast({
            variant: 'success',
            title: 'Datos actualizados',
            description: `Los cambios del ticket #${ticketId} quedaron registrados en el historial.`,
          });
        },
        onError: (error) => {
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
        params: includeEmptyParams,
        data: { nota: seguimiento },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['/api/tickets'] });
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
        onRetry={notFound ? undefined : () => {
          void ticketQuery.refetch();
          void seguimientosQuery.refetch();
        }}
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
  const contactoLabel = getContactDisplayName(ticket);
  const telefonoLabel = getContactDisplayPhone(ticket.telefono);
  const emailLabel = getContactDisplayEmail(ticket.email);
  const empresaLabel = ticket.empresa?.trim();
  const estadoEmpleado = getEstadoEmpleadoConfig(
    empresaLabel,
    ticket.estado_empleado,
  );

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
          
          <Dialog open={isEditing} onOpenChange={setIsEditing}>
            <DialogTrigger asChild>
              <Button variant="outline" className="bg-white">Editar Estado</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Actualizar Ticket</DialogTitle>
                <DialogDescription>
                  Modifica el estado, prioridad o notas de gestión.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Estado</label>
                    <Select value={editData.estado} onValueChange={(v) => setEditData({...editData, estado: v})}>
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
                    <Select value={editData.prioridad} onValueChange={(v) => setEditData({...editData, prioridad: v})}>
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
                    onValueChange={(v) => setEditData({...editData, progreso: v[0]})}
                    max={100}
                    step={5}
                  />
                </div>

                {adminMode && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Fecha Límite</label>
                    <Input
                      type="datetime-local"
                      value={editData.fecha_limite || ''}
                      onChange={(e) => setEditData({...editData, fecha_limite: e.target.value})}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Campo técnico protegido por la llave de administración.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-sm font-medium">Notas Internas</label>
                  <Textarea 
                    value={editData.notas || ''}
                    onChange={(e) => setEditData({...editData, notas: e.target.value})}
                    placeholder="Notas visibles solo para agentes..."
                    className="h-24"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditing(false)}>Cancelar</Button>
                <Button onClick={handleUpdateTicket} disabled={updateTicket.isPending}>
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
        onOpenChange={setIsEditingData}
        isSaving={updateTicket.isPending}
        onSave={handleUpdateFunctionalData}
      />

      {/* Progress Tracker */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-semibold text-sm text-slate-700">Progreso del Caso</h3>
          <span className="font-bold text-primary">{ticket.progreso || 0}%</span>
        </div>
        <CardContent className="p-6">
          <div className="relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-500" 
                style={{ width: `${ticket.progreso || 0}%` }}
              />
            </div>
            
            <div className="relative flex justify-between">
              {PROGRESS_STEPS.map((step) => {
                const isCompleted = (ticket.progreso || 0) >= step.value;
                const isCurrent = ticket.estado === step.estado;
                
                return (
                  <div key={step.value} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <div 
                      className={`h-6 w-6 rounded-full flex items-center justify-center border-2 transition-colors z-10 bg-white
                        ${isCompleted ? 'border-primary text-primary' : 'border-slate-200 text-slate-300'}
                        ${isCurrent ? 'ring-4 ring-primary/20' : ''}
                      `}
                    >
                      {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : <div className="h-2 w-2 rounded-full bg-current" />}
                    </div>
                    <span className={`max-w-full px-1 text-center text-xs font-medium leading-tight ${isCurrent ? 'text-primary' : isCompleted ? 'text-slate-700' : 'text-slate-400'}`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Detalles Card */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Resumen del Llamado
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-6">
              <div>
                <h4 className="text-sm font-medium text-slate-500 mb-1">Descripción</h4>
                <p className="text-slate-900 whitespace-pre-wrap leading-relaxed">
                  {ticket.resumen || 'Sin descripción detallada.'}
                </p>
              </div>

              {/* Audio Player */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                <h4 className="text-sm font-medium text-slate-700 mb-3 flex items-center gap-2">
                  <Headphones className="h-4 w-4 text-slate-500" />
                  Grabación de la Llamada
                </h4>
                {ticket.audio_url ? (
                  <audio controls className="w-full h-10" src={ticket.audio_url}>
                    Tu navegador no soporta el elemento de audio.
                  </audio>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-slate-500 bg-white border border-slate-200 border-dashed rounded p-3">
                    <PlayCircle className="h-4 w-4 opacity-50" />
                    Sin grabación disponible para este caso.
                  </div>
                )}
              </div>

              {ticket.notas && (
                <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
                  <h4 className="text-sm font-medium text-amber-800 mb-1">Notas Internas</h4>
                  <p className="text-amber-900/80 text-sm whitespace-pre-wrap">{ticket.notas}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Seguimientos Timeline */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100 flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <History className="h-5 w-5 text-primary" />
                Historial y Seguimiento
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              
              {/* Add seguimiento form */}
              <div className="p-4 bg-slate-50 border-b border-slate-100">
                <div className="flex gap-3">
                  <Textarea 
                    placeholder="Agregar una nota de seguimiento o actualización..."
                    className="min-h-[80px] bg-white resize-y"
                    value={newSeguimiento}
                    onChange={(e) => setNewSeguimiento(e.target.value)}
                  />
                </div>
                <div className="flex justify-end mt-3">
                  <Button 
                    size="sm" 
                    onClick={handleAddSeguimiento}
                    disabled={!newSeguimiento.trim() || createSeguimiento.isPending}
                  >
                    {createSeguimiento.isPending ? 'Guardando...' : 'Agregar Nota'}
                  </Button>
                </div>
              </div>

              {/* Timeline list */}
              <div className="p-6">
                {loadingSeguimientos ? (
                  <div className="space-y-4">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : !seguimientos || seguimientos.length === 0 ? (
                  <div className="text-center text-slate-500 py-8 text-sm">
                    No hay seguimientos registrados para este ticket.
                  </div>
                ) : (
                  <div className="space-y-6">
                    {seguimientos.map((seg: Seguimiento, idx: number) => (
                      <div key={seg.id} className="relative pl-6">
                        {idx !== seguimientos.length - 1 && (
                          <div className="absolute left-[11px] top-6 bottom-[-24px] w-[2px] bg-slate-100" />
                        )}
                        <div className="absolute left-0 top-1 h-6 w-6 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center">
                          <MessageSquare className="h-3 w-3 text-slate-500" />
                        </div>
                        
                        <div className="bg-white border border-slate-100 rounded-lg p-4 shadow-sm">
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-medium text-sm text-slate-900">
                              {seg.autor || 'Sistema'}
                            </span>
                            <span className="text-xs text-slate-500">
                              {formatDate(seg.fecha_creacion)}
                            </span>
                          </div>
                          
                          <p className="text-sm text-slate-700 whitespace-pre-wrap">{seg.nota}</p>
                          
                          {(seg.estado_anterior || seg.estado_nuevo) && seg.estado_anterior !== seg.estado_nuevo && (
                            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs">
                              <span className="text-slate-500">Cambio de estado:</span>
                              {seg.estado_anterior && <EstadoBadge estado={seg.estado_anterior} className="text-[10px] py-0 px-1.5" />}
                              <span className="text-slate-400">→</span>
                              {seg.estado_nuevo && <EstadoBadge estado={seg.estado_nuevo} className="text-[10px] py-0 px-1.5" />}
                            </div>
                          )}

                          {(seg.prioridad_anterior || seg.prioridad_nueva) && seg.prioridad_anterior !== seg.prioridad_nueva && (
                            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs">
                              <span className="text-slate-500">Cambio de prioridad:</span>
                              {seg.prioridad_anterior && <PrioridadBadge prioridad={seg.prioridad_anterior} className="text-[10px] py-0 px-1.5" />}
                              <span className="text-slate-400">→</span>
                              {seg.prioridad_nueva && <PrioridadBadge prioridad={seg.prioridad_nueva} className="text-[10px] py-0 px-1.5" />}
                            </div>
                          )}

                          {(seg.asignado_anterior_usuario_id !== seg.asignado_nuevo_usuario_id || seg.asignado_anterior !== seg.asignado_nuevo) &&
                            (seg.asignado_anterior || seg.asignado_nuevo || seg.asignado_anterior_usuario_id || seg.asignado_nuevo_usuario_id) && (
                              <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
                                <span className="font-medium">Cambio de asignación:</span>{' '}
                                {getAssignedDisplayName(seg.asignado_anterior)}
                                <span className="px-1.5 text-slate-400">→</span>
                                {getAssignedDisplayName(seg.asignado_nuevo)}
                              </div>
                            )}

                          {seg.campos_editados && seg.campos_editados.length > 0 && (
                            <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
                              <span className="font-medium">Datos editados:</span>{' '}
                              {seg.campos_editados.map(getFunctionalFieldLabel).join(', ')}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-lg flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Datos del Contacto
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-1 h-7 w-7 shrink-0 text-slate-500"
                  onClick={() => setIsEditingData(true)}
                  aria-label="Editar datos del contacto"
                  title="Editar datos del contacto"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div>
                <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Nombre Completo</h4>
                <p className="font-medium text-slate-900">{contactoLabel}</p>
              </div>
              
              {empresaLabel && (
                <div>
                  <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Empresa</h4>
                  <p className="text-slate-900 flex items-center gap-2">
                    <Building className="h-4 w-4 text-slate-400" />
                    {empresaLabel}
                  </p>
                  {estadoEmpleado && (
                    <p className={`mt-1 flex items-center pl-6 text-sm font-medium ${estadoEmpleado.textClass}`}>
                      <span
                        className={`mr-2 h-2 w-2 rounded-full ${estadoEmpleado.dotClass}`}
                        aria-hidden="true"
                      />
                      {estadoEmpleado.label}
                    </p>
                  )}
                </div>
              )}

              {ticket.dni && (
                <div>
                  <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">DNI / CUIT</h4>
                  <p className="text-slate-900 font-mono text-sm">{ticket.dni}</p>
                </div>
              )}

              <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                <div className="flex min-h-10 items-center gap-3 py-1 text-sm">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-50">
                    <Phone className="h-4 w-4 text-slate-500" />
                  </div>
                  {telefonoLabel ? (
                    <span className="break-all text-slate-700">{telefonoLabel}</span>
                  ) : (
                    <span className="italic text-slate-500">Teléfono no proporcionado</span>
                  )}
                </div>

                <div className="flex min-h-10 items-center gap-3 py-1 text-sm">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-slate-50">
                    <Mail className="h-4 w-4 text-slate-500" />
                  </div>
                  {emailLabel ? (
                    <span className="break-all text-slate-700">{emailLabel}</span>
                  ) : (
                    <span className="italic text-slate-500">Email no proporcionado</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={`shadow-sm ${vencido ? 'border-red-200' : ''}`}>
            <CardHeader className={`pb-3 border-b ${vencido ? 'bg-red-50/50 border-red-100' : 'border-slate-100'}`}>
              <CardTitle className={`text-lg flex items-center gap-2 ${vencido ? 'text-red-700' : ''}`}>
                <Clock className="h-5 w-5" />
                Tiempos
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div>
                <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Fecha Límite</h4>
                <p className={`font-medium ${vencido ? 'text-red-600' : 'text-slate-900'}`}>
                  {ticket.fecha_limite ? formatDate(ticket.fecha_limite) : 'No definida'}
                </p>
              </div>
              
              {ticket.fecha_resolucion && (
                <div>
                  <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Resolución</h4>
                  <p className="text-slate-900">
                    {formatDate(ticket.fecha_resolucion)}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
