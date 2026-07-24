import React, { useEffect, useMemo, useState } from 'react';
import {
  getListTicketsQueryKey,
  useListTickets,
  useCreateAdminTicket,
  useUpdateTicket,
  useDeleteTicket,
  useImportCsv,
  useTruncateTickets,
  TicketEstado,
  TicketPrioridad,
  TicketSortBy,
  type Ticket,
  type AdminImportResult,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { adminErrorMessage, useAdminAccess } from '@/hooks/use-admin-access';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { SortableTableHead } from '@/components/SortableTableHead';

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  FileText,
  CheckCircle2,
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

const CAMPOS_TEXTO: Array<{ campo: string; label: string; requerido?: boolean }> = [
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

function formVacio() {
  const now = new Date();
  return {
    conversation_id: `manual_${Date.now()}`,
    hora: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    nombre: '',
    apellido: '',
    telefono: '',
    dni: '',
    empresa: '',
    email: '',
    motivo: '',
    resumen: '',
    notas: '',
    audio_url: '',
    estado: 'nuevo',
    prioridad: 'media',
  } as Record<string, string>;
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
  const listQuery = useListTickets(listParams, {
    query: {
      enabled: Boolean(adminKey),
      queryKey: [...getListTicketsQueryKey(listParams), 'admin-access', adminAccessVersion],
      retry: false,
    },
    request: adminRequest,
  });
  const totalBaseParams = { page: 1, limit: 1, incluir_vacios: true };
  const totalBaseQuery = useListTickets(totalBaseParams, {
    query: {
      enabled: Boolean(adminKey),
      queryKey: [...getListTicketsQueryKey(totalBaseParams), 'admin-access', adminAccessVersion],
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
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<string, string>>(formVacio());
  const [aEliminar, setAEliminar] = useState<Ticket | null>(null);

  const abrirCrear = () => {
    setEditandoId(null);
    setForm(formVacio());
    setDialogAbierto(true);
  };

  const abrirEditar = (t: Ticket) => {
    setEditandoId(t.id);
    setForm({
      conversation_id: t.conversation_id,
      hora: t.hora,
      nombre: t.nombre,
      apellido: t.apellido,
      telefono: t.telefono ?? '',
      dni: t.dni ?? '',
      empresa: t.empresa ?? '',
      email: t.email ?? '',
      motivo: t.motivo,
      resumen: t.resumen ?? '',
      notas: t.notas ?? '',
      audio_url: t.audio_url ?? '',
      estado: t.estado,
      prioridad: t.prioridad,
    });
    setDialogAbierto(true);
  };

  const guardarRegistro = () => {
    const comunes = {
      hora: form.hora,
      nombre: form.nombre,
      apellido: form.apellido,
      telefono: form.telefono || undefined,
      dni: form.dni || undefined,
      empresa: form.empresa || undefined,
      email: form.email || undefined,
      motivo: form.motivo,
      resumen: form.resumen || undefined,
      notas: form.notas || undefined,
      audio_url: form.audio_url || undefined,
      estado: form.estado as TicketEstado,
      prioridad: form.prioridad as TicketPrioridad,
    };
    const contacto = getContactDisplayName(form);
    const onOk =
      (titulo: string, dedupeCreated = false) =>
      (savedTicket: Ticket) => {
        setDialogAbierto(false);
        refrescarTodo();
        toast({
          dedupeKey: dedupeCreated ? `ticket-created:${savedTicket.id}` : undefined,
          variant: 'success',
          title: titulo,
          description: contacto,
        });
      };
    if (editandoId === null) {
      createTicket.mutate(
        { data: { ...comunes, conversation_id: form.conversation_id } as any },
        { onSuccess: onOk('Ticket creado', true), onError: errorToast('No se pudo crear el ticket') },
      );
    } else {
      updateTicket.mutate(
        { id: editandoId, data: comunes as any, params: { incluir_vacios: true } },
        { onSuccess: onOk('Ticket actualizado'), onError: errorToast('No se pudo actualizar el ticket') },
      );
    }
  };

  const confirmarEliminar = () => {
    if (!aEliminar) return;
    deleteTicket.mutate(
      { id: aEliminar.id },
      {
        onSuccess: () => {
          setAEliminar(null);
          refrescarTodo();
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

  // ---------- Importador CSV ----------
  const importCsv = useImportCsv({ request: adminRequest });
  const [csvNombre, setCsvNombre] = useState('');
  const [csvTexto, setCsvTexto] = useState('');
  const [resultadoImport, setResultadoImport] = useState<AdminImportResult | null>(null);

  const onArchivoSeleccionado = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const texto = await file.text();
    setCsvNombre(file.name);
    setCsvTexto(texto);
    setResultadoImport(null);
    // Simulación automática al elegir el archivo
    importCsv.mutate(
      { data: { csv: texto, dry_run: true } },
      { onSuccess: setResultadoImport, onError: errorToast('No se pudo analizar el archivo') },
    );
    e.target.value = '';
  };

  const importarDefinitivo = () => {
    importCsv.mutate(
      { data: { csv: csvTexto, dry_run: false } },
      {
        onSuccess: (r) => {
          setResultadoImport(r);
          refrescarTodo();
          toast({
            dedupeKey: `tickets-imported:${r.insertados}`,
            variant: 'success',
            title: 'Importación completada',
            description: `${r.insertados} nuevos · ${r.ya_existentes} ya existentes · ${r.invalidos} inválidos`,
          });
        },
        onError: errorToast('No se pudo importar el archivo'),
      },
    );
  };

  // ---------- Zona peligrosa ----------
  const truncate = useTruncateTickets({ request: adminRequest });
  const [confirmTexto, setConfirmTexto] = useState('');

  const ejecutarTruncate = () => {
    truncate.mutate(
      { data: { confirmar: true } },
      {
        onSuccess: (r) => {
          setConfirmTexto('');
          refrescarTodo();
          toast({
            variant: 'warning',
            title: 'Base de tickets vaciada',
            description: `${r.tickets_eliminados} tickets y ${r.seguimientos_eliminados} seguimientos eliminados.`,
          });
        },
        onError: errorToast('No se pudo vaciar la base'),
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
        <TabsContent value="importar" className="mt-4 space-y-4 max-w-3xl">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Importar registros desde CSV
              </CardTitle>
              <CardDescription>
                Mismo formato que el export de n8n (separado por «;» o «,»). Se detectan las columnas automáticamente y
                las filas cuyo conversation_id ya existe se saltean — se puede importar el mismo archivo varias veces
                sin duplicar. Al elegir el archivo se muestra una
                <strong> simulación</strong>; nada se escribe hasta confirmar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={onArchivoSeleccionado}
                  className="max-w-sm cursor-pointer"
                />
                {csvNombre && <span className="text-sm text-muted-foreground">{csvNombre}</span>}
              </div>

              {importCsv.isPending && <Skeleton className="h-24 w-full" />}

              {resultadoImport && (
                <div
                  className={`rounded-lg border p-4 space-y-3 ${resultadoImport.dry_run ? 'bg-blue-50/50 border-blue-200' : 'bg-emerald-50/50 border-emerald-200'}`}
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      {resultadoImport.dry_run ? (
                        <>Simulación — así quedaría la importación</>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Importación aplicada
                        </>
                      )}
                    </h4>
                    <span className="text-xs text-muted-foreground">{resultadoImport.filas} filas leídas</span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-white rounded-md border p-2">
                      <p className="text-2xl font-bold text-emerald-700">{resultadoImport.insertados}</p>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {resultadoImport.dry_run ? 'a insertar' : 'insertados'}
                      </p>
                    </div>
                    <div className="bg-white rounded-md border p-2">
                      <p className="text-2xl font-bold text-slate-500">{resultadoImport.ya_existentes}</p>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">ya existentes</p>
                    </div>
                    <div className="bg-white rounded-md border p-2">
                      <p className="text-2xl font-bold text-amber-600">{resultadoImport.invalidos}</p>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">inválidos</p>
                    </div>
                  </div>

                  <div className="text-xs space-y-1">
                    <p className="font-medium text-slate-700">Columnas detectadas:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {resultadoImport.columnas.map((c) => (
                        <span key={c.campo} className="bg-white border rounded px-1.5 py-0.5 font-mono text-[11px]">
                          {c.columna} → <span className="text-primary font-semibold">{c.campo}</span>
                        </span>
                      ))}
                    </div>
                    {resultadoImport.sin_mapear.length > 0 && (
                      <p className="text-amber-700 mt-1">Ignoradas: {resultadoImport.sin_mapear.join(', ')}</p>
                    )}
                    {resultadoImport.advertencias.map((a, i) => (
                      <p key={i} className="text-amber-700">
                        ⚠ {a}
                      </p>
                    ))}
                  </div>

                  {resultadoImport.dry_run && (
                    <Button
                      onClick={importarDefinitivo}
                      disabled={resultadoImport.insertados === 0 || importCsv.isPending}
                      className="w-full"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      {resultadoImport.insertados === 0
                        ? 'Nada nuevo para importar'
                        : `Importar ${resultadoImport.insertados} registros`}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------- ZONA PELIGROSA ------------------- */}
        <TabsContent value="peligro" className="mt-4 max-w-3xl">
          <Card className="border-red-200">
            <CardHeader className="pb-3 bg-red-50/50 border-b border-red-100 rounded-t-xl">
              <CardTitle className="text-base flex items-center gap-2 text-red-700">
                <AlertTriangle className="h-4 w-4" />
                Vaciar la base de datos
              </CardTitle>
              <CardDescription>
                Elimina <strong>todos</strong> los tickets y sus seguimientos, y reinicia los contadores de ID. La
                estructura de la base queda intacta. Esta acción <strong>no se puede deshacer</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <p className="text-sm text-slate-600">
                Actualmente hay <strong>{totalBaseQuery.data?.total ?? '…'}</strong> tickets en la base.
              </p>
              <div className="space-y-2 max-w-sm">
                <Label htmlFor="confirm-borrar" className="text-sm">
                  Para confirmar, escribí <span className="font-mono font-bold">BORRAR</span>:
                </Label>
                <Input
                  id="confirm-borrar"
                  value={confirmTexto}
                  onChange={(e) => setConfirmTexto(e.target.value)}
                  placeholder="BORRAR"
                  autoComplete="off"
                />
              </div>
              <Button
                variant="destructive"
                disabled={confirmTexto !== 'BORRAR' || truncate.isPending}
                onClick={ejecutarTruncate}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {truncate.isPending ? 'Borrando...' : 'Borrar todos los registros'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ------------------- DIALOG CREAR/EDITAR ------------------- */}
      <Dialog open={dialogAbierto} onOpenChange={setDialogAbierto}>
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editandoId === null ? 'Nuevo registro' : `Editar registro #${editandoId}`}</DialogTitle>
            <DialogDescription>
              {editandoId === null
                ? 'Alta manual directa en la base (el flujo normal es la ingesta automática por llamada).'
                : 'Edición directa de todos los campos del registro.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {CAMPOS_TEXTO.map(({ campo, label, requerido }) => (
              <div key={campo} className="space-y-1">
                <Label className="text-xs">
                  {label}
                  {requerido && <span className="text-red-500"> *</span>}
                </Label>
                <Input
                  value={form[campo] ?? ''}
                  onChange={(e) => setForm({ ...form, [campo]: e.target.value })}
                  disabled={campo === 'conversation_id' && editandoId !== null}
                  className="h-8 text-sm"
                />
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-xs">Estado</Label>
              <Select value={form.estado} onValueChange={(v) => setForm({ ...form, estado: v })}>
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
              <Select value={form.prioridad} onValueChange={(v) => setForm({ ...form, prioridad: v })}>
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
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Resumen</Label>
              <Textarea
                value={form.resumen}
                onChange={(e) => setForm({ ...form, resumen: e.target.value })}
                className="h-20 text-sm"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Notas internas</Label>
              <Textarea
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                className="h-16 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAbierto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={guardarRegistro}
              disabled={
                createTicket.isPending ||
                updateTicket.isPending ||
                !form.conversation_id ||
                !form.hora ||
                !form.nombre ||
                !form.motivo
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
