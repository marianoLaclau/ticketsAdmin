import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getTicket,
  getListTicketsQueryKey,
  useListTickets,
  useCreateAdminTicket,
  useUpdateTicket,
  useDeleteTicket,
  TicketEstado,
  TicketPrioridad,
  TicketSortBy,
  type Ticket,
  type TicketListResponse,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { adminErrorMessage, useAdminAccess } from '@/hooks/use-admin-access';
import { isTicketVersionConflict } from '@/lib/error-messages';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { AdminCsvImportTab } from '@/features/admin-tickets/AdminCsvImportTab';
import { AdminDangerZoneTab } from '@/features/admin-tickets/AdminDangerZoneTab';
import { SortableTableHead } from '@/components/SortableTableHead';
import { TicketVersionConflictAlert } from '@/components/tickets/TicketVersionConflictAlert';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Database,
  Upload,
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  Phone,
  Mail,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { EstadoBadge, PrioridadBadge, formatDate, isVencido } from '@/lib/utils-tickets';
import { getEstadoLabel } from '@/lib/estados';
import { getContactDisplayEmail, getContactDisplayName, getContactDisplayPhone } from '@/lib/contacto';
import { getAssignedDisplayName, hasAssignedDisplayName } from '@/lib/asignacion';
import { getMotivoCategoriaConfig } from '@/lib/motivos';
import {
  createDefaultTicketSort,
  isDefaultTicketSort,
  nextTicketSort,
  serializeTicketSort,
  type TicketSortRule,
} from '@/lib/ticket-list-controls';
import {
  buildAdminTicketInput,
  buildAdminTicketUpdate,
  createEmptyAdminTicketForm,
  ticketToAdminTicketForm,
  type AdminTicketForm,
  type AdminTicketTextField,
} from '@/lib/admin-ticket-form';
import {
  buildVersionedTicketUpdate,
  createTicketEditBaseline,
  shouldApplyTicketRevision,
  type TicketEditBaseline,
} from '@/lib/ticket-version';

const CAMPOS_TEXTO: Array<{
  campo: AdminTicketTextField;
  label: string;
  requerido?: boolean;
}> = [
  { campo: 'conversation_id', label: 'Conversation ID', requerido: true },
  { campo: 'hora', label: 'Hora (HH:MM)', requerido: true },
  { campo: 'nombre', label: 'Nombre', requerido: true },
  { campo: 'apellido', label: 'Apellido' },
  { campo: 'telefono', label: 'Teléfono' },
  { campo: 'dni', label: 'DNI' },
  { campo: 'empresa', label: 'Empresa' },
  { campo: 'email', label: 'Email' },
  { campo: 'audio_url', label: 'URL del audio' },
];

let adminTicketsQueryVersion = 0;

function nextAdminTicketsQueryVersion(): number {
  adminTicketsQueryVersion += 1;
  return adminTicketsQueryVersion;
}

export default function Admin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // Segunda credencial obligatoria para las operaciones del panel SysAdmin.
  const { adminKey, saveAdminKey, adminRequest } = useAdminAccess();

  const refrescarTodo = () => queryClient.invalidateQueries();

  const errorToast = (title: string) => (err: unknown) => {
    toast({
      variant: 'destructive',
      title,
      description: adminErrorMessage(err),
    });
  };

  // ---------- Registros (CRUD) ----------
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [sorts, setSorts] = useState<TicketSortRule[]>(createDefaultTicketSort);
  // La versión fuerza una consulta nueva cuando cambia la llave, sin incluir
  // el secreto en el query key ni dejarlo expuesto en la caché del navegador.
  const adminAccessVersion = useMemo(nextAdminTicketsQueryVersion, [adminKey]);
  const listParams = {
    page,
    limit: pageSize,
    incluir_vacios: true,
    sort: serializeTicketSort(sorts),
    // Compatibilidad con el contrato anterior mientras conviven clientes.
    sort_by: sorts[0]?.sortBy ?? TicketSortBy.fecha_creacion,
    order: sorts[0]?.order ?? 'desc',
    ...(search ? { search } : {}),
  };
  const listQueryKey = [
    ...getListTicketsQueryKey(listParams),
    'admin-access',
    adminAccessVersion,
  ] as const;
  const listQuery = useListTickets(listParams, {
    query: {
      enabled: Boolean(adminKey),
      queryKey: listQueryKey,
      retry: false,
    },
    request: adminRequest,
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

  const createTicket = useCreateAdminTicket({ request: adminRequest });
  const updateTicket = useUpdateTicket({ request: adminRequest });
  const deleteTicket = useDeleteTicket({ request: adminRequest });

  const [dialogAbierto, setDialogAbierto] = useState(false);
  const [isReloadingTicket, setIsReloadingTicket] = useState(false);
  const [hasVersionConflict, setHasVersionConflict] = useState(false);
  const reloadAttemptRef = useRef(0);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<AdminTicketForm>(
    createEmptyAdminTicketForm,
  );
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
    queryClient.setQueryData<TicketListResponse>(
      listQueryKey,
      (current) => current
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
          variant: 'success',
          title: titulo,
          description: contacto,
        });
      };
    if (editandoId === null) {
      createTicket.mutate(
        { data: buildAdminTicketInput(form) },
        { onSuccess: onOk('Ticket creado', true), onError: errorToast('No se pudo crear el ticket') },
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
          variant: 'info',
          title: 'Sin cambios para guardar',
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
          onSuccess: onOk('Ticket actualizado'),
          onError: (error) => {
            if (!isTicketVersionConflict(error)) {
              errorToast('No se pudo actualizar el ticket')(error);
              return;
            }

            setHasVersionConflict(true);
            toast({
              variant: 'warning',
              title: 'El ticket cambió en otra sesión',
              description:
                'Conservamos lo que escribiste. Cargá la versión actual antes de volver a guardar.',
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
        getTicket(
          editandoId,
          { incluir_vacios: true },
          adminRequest,
        ),
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
        variant: 'destructive',
        title: 'No se pudo cargar la versión actual',
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
            variant: 'success',
            title: 'Ticket eliminado',
            description: getContactDisplayName(aEliminar),
          });
        },
        onError: errorToast('No se pudo eliminar el ticket'),
      },
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 p-4 md:p-8">
      <AdminHeader
        title="Administración"
        description="Gestión directa de la base de datos: registros, importación masiva y mantenimiento."
        adminKey={adminKey}
        onAdminKeyChange={saveAdminKey}
      />

      <Tabs defaultValue="registros">
        <TabsList>
          <TabsTrigger value="registros" className="gap-1.5">
            <Database className="h-3.5 w-3.5" /> Registros
          </TabsTrigger>
          <TabsTrigger value="importar" className="gap-1.5">
            <Upload className="h-3.5 w-3.5" /> Importar CSV
          </TabsTrigger>
          <TabsTrigger value="peligro" className="gap-1.5 data-[state=active]:text-red-600">
            <AlertTriangle className="h-3.5 w-3.5" /> Zona peligrosa
          </TabsTrigger>
        </TabsList>

        {/* ------------------- REGISTROS ------------------- */}
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
            Esta vista incluye los registros en cuarentena sin datos útiles, ocultos en Tickets y Dashboard.
          </p>

          <div className="bg-card border border-border rounded-md shadow-sm overflow-hidden">
            <div className="flex flex-col items-start justify-between gap-1.5 border-b border-slate-200 bg-slate-50/60 px-3 py-1.5 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:gap-3">
              <span>
                Ordená con un clic. Usá <kbd className="rounded border bg-white px-1 font-sans">Shift</kbd> + clic para
                combinar varias columnas; los números indican su prioridad.
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
                  {!adminKey ? (
                    <TableRow>
                      <TableCell colSpan={11} className="h-40 text-center text-sm text-muted-foreground">
                        Ingresá la llave de administración para ver todos los registros.
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
                      <TableCell colSpan={11} className="h-40 text-center text-sm text-destructive">
                        {adminErrorMessage(listQuery.error)}
                      </TableCell>
                    </TableRow>
                  ) : tickets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="h-40 text-center text-sm text-muted-foreground">
                        No hay registros{search ? ' que coincidan con la búsqueda' : ''}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    tickets.map((t) => {
                      const conversationId = t.conversation_id?.trim() || 'Sin ID de conversación';
                      const phone = getContactDisplayPhone(t.telefono);
                      const email = getContactDisplayEmail(t.email);
                      const company = t.empresa?.trim() || 'Sin empresa asociada';
                      const category = getMotivoCategoriaConfig(t.motivo_categoria);
                      const reason = t.motivo?.trim() || 'Sin motivo proporcionado';
                      const assigned = getAssignedDisplayName(t.asignado_a);
                      const hasAssigned = hasAssignedDisplayName(t.asignado_a);
                      const overdue = isVencido(t.fecha_limite, t.estado);

                      return (
                        <TableRow key={t.id} className="group text-sm">
                          <TableCell className="font-medium tabular-nums text-muted-foreground">#{t.id}</TableCell>
                          <TableCell>
                            <div className="flex flex-col whitespace-nowrap">
                              <span className="font-medium text-foreground">
                                {formatDate(t.fecha_creacion).split(',')[0]}
                              </span>
                              <span className="text-[11px] tabular-nums text-muted-foreground">
                                {t.hora?.trim() ? `${t.hora} hs` : 'Sin hora proporcionada'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span
                              className="inline-block max-w-[190px] truncate rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]"
                              title={conversationId}
                            >
                              {conversationId}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="min-w-0 space-y-0.5">
                              <span
                                className="block truncate font-semibold text-foreground"
                                title={getContactDisplayName(t)}
                              >
                                {getContactDisplayName(t)}
                              </span>
                              <span
                                className="flex min-w-0 items-center text-[11px] text-muted-foreground"
                                title={phone ?? 'Sin teléfono proporcionado'}
                              >
                                <Phone className="mr-1 h-3 w-3 shrink-0" aria-hidden="true" />
                                <span className="truncate">{phone ?? 'Sin teléfono proporcionado'}</span>
                              </span>
                              <span
                                className="flex min-w-0 items-center text-[11px] text-muted-foreground"
                                title={email ?? 'Sin email proporcionado'}
                              >
                                <Mail className="mr-1 h-3 w-3 shrink-0" aria-hidden="true" />
                                <span className="truncate">{email ?? 'Sin email proporcionado'}</span>
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <span className="block truncate" title={company}>
                              {company}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="min-w-0 space-y-1">
                              <span
                                className={`inline-flex max-w-full rounded border px-1.5 py-0.5 text-[10px] font-semibold ${category.badgeClass}`}
                              >
                                <span className="truncate">{category.label}</span>
                              </span>
                              <span className="block line-clamp-2 text-xs leading-snug text-slate-700" title={reason}>
                                {reason}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <EstadoBadge estado={t.estado} />
                          </TableCell>
                          <TableCell>
                            <PrioridadBadge prioridad={t.prioridad} />
                          </TableCell>
                          <TableCell>
                            <span
                              className={`block truncate ${hasAssigned ? 'font-medium text-slate-700' : 'text-muted-foreground'}`}
                              title={assigned}
                            >
                              {assigned}
                            </span>
                          </TableCell>
                          <TableCell>
                            {t.fecha_limite ? (
                              <div
                                className={`flex items-center gap-1.5 whitespace-nowrap text-xs ${overdue ? 'font-semibold text-red-600' : 'text-muted-foreground'}`}
                              >
                                {overdue && <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                                <span>{formatDate(t.fecha_limite)}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">Sin vencimiento</span>
                            )}
                          </TableCell>
                          <TableCell className="sticky right-0 z-[1] bg-white text-right shadow-[-4px_0_6px_-6px_rgba(15,23,42,0.45)] group-hover:bg-slate-50/80">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1 px-2 text-xs"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setLocation(`/admin/tickets/${t.id}`);
                                }}
                                title={`Abrir ticket #${t.id}`}
                                aria-label={`Abrir ticket #${t.id}`}
                              >
                                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                                Abrir
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  abrirEditar(t);
                                }}
                                disabled={isReloadingTicket}
                                title={`Editar ticket #${t.id}`}
                                aria-label={`Editar ticket #${t.id}`}
                              >
                                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-600 hover:text-red-700"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setAEliminar(t);
                                }}
                                title={`Eliminar ticket #${t.id}`}
                                aria-label={`Eliminar ticket #${t.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            {/* Paginación */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-2.5 border-t bg-slate-50/50 text-sm">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Mostrar</span>
                <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
                  <SelectTrigger className="h-7 w-[70px] text-xs bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100].map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>por página</span>
              </div>
              <span className="text-muted-foreground text-xs">
                {total} registros — página {page} de {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs bg-white"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs bg-white"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ------------------- IMPORTAR CSV ------------------- */}
        <AdminCsvImportTab request={adminRequest} />

        {/* ------------------- ZONA PELIGROSA ------------------- */}
        <AdminDangerZoneTab
          request={adminRequest}
          hasAdminAccess={Boolean(adminKey)}
          accessVersion={adminAccessVersion}
        />
      </Tabs>

      {/* ------------------- DIALOG CREAR/EDITAR ------------------- */}
      <Dialog open={dialogAbierto} onOpenChange={cambiarEstadoDialogo}>
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editandoId === null ? 'Nuevo registro' : `Editar registro #${editandoId}`}</DialogTitle>
            <DialogDescription>
              {editandoId === null
                ? 'Alta manual directa en la base (el flujo normal es la ingesta automática por llamada).'
                : 'Edición directa de los campos habilitados del registro.'}
            </DialogDescription>
          </DialogHeader>
          {hasVersionConflict && (
            <TicketVersionConflictAlert
              isReloading={isReloadingTicket}
              onReload={() => void resolverConflictoDeVersion()}
            />
          )}
          <div className="grid grid-cols-2 gap-3 py-2">
            {CAMPOS_TEXTO.map(({ campo, label, requerido }) => (
              <div key={campo} className="space-y-1">
                <Label className="text-xs">
                  {label}
                  {requerido && <span className="text-red-500"> *</span>}
                </Label>
                <Input
                  value={form[campo] ?? ''}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      [campo]: event.target.value,
                    }))
                  }
                  disabled={campo === 'conversation_id' && editandoId !== null}
                  className="h-8 text-sm"
                />
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-xs">Estado</Label>
              <Select
                value={form.estado}
                onValueChange={(estado) =>
                  setForm((current) => ({
                    ...current,
                    estado: estado as AdminTicketForm['estado'],
                  }))
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(TicketEstado).map((e) => (
                    <SelectItem key={e} value={e}>
                      {getEstadoLabel(e).toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Prioridad</Label>
              <Select
                value={form.prioridad}
                onValueChange={(prioridad) =>
                  setForm((current) => ({
                    ...current,
                    prioridad: prioridad as AdminTicketForm['prioridad'],
                  }))
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(TicketPrioridad).map((p) => (
                    <SelectItem key={p} value={p}>
                      {p.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">
                Motivo<span className="text-red-500"> *</span>
              </Label>
              <Input
                value={form.motivo}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    motivo: event.target.value,
                  }))
                }
                className="h-8 text-sm"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Resumen</Label>
              <Textarea
                value={form.resumen}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    resumen: event.target.value,
                  }))
                }
                className="h-20 text-sm"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Notas internas</Label>
              <Textarea
                value={form.notas}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notas: event.target.value,
                  }))
                }
                className="h-16 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => cambiarEstadoDialogo(false)}>
              Cancelar
            </Button>
            <Button
              onClick={guardarRegistro}
              disabled={
                createTicket.isPending ||
                updateTicket.isPending ||
                isReloadingTicket ||
                hasVersionConflict ||
                !form.conversation_id.trim() ||
                !form.hora.trim() ||
                !form.nombre.trim() ||
                !form.motivo.trim()
              }
            >
              {createTicket.isPending || updateTicket.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------- CONFIRMAR ELIMINAR ------------------- */}
      <AlertDialog open={aEliminar !== null} onOpenChange={(open) => !open && setAEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Se va a eliminar el registro de <strong>{getContactDisplayName(aEliminar)}</strong> ({aEliminar?.motivo})
              junto con todos sus seguimientos. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarEliminar} className="bg-red-600 hover:bg-red-700">
              {deleteTicket.isPending ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
