import React, { useEffect, useState } from 'react';
import {
  exportTicketsCsv,
  useListTickets,
  TicketEstado,
  TicketPrioridad,
  TicketSortBy,
  type ListTicketsEstado,
  type ListTicketsPrioridad,
  type MotivoCategoria,
} from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Search,
  Filter,
  Building,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { formatDate, isVencido, EstadoBadge, PrioridadBadge } from '@/lib/utils-tickets';
import { getEstadoLabel } from '@/lib/estados';
import { getMotivoCategoriaConfig, MOTIVO_CATEGORIA_OPTIONS } from '@/lib/motivos';
import { getContactDisplayName } from '@/lib/contacto';
import { getAssignedDisplayName, hasAssignedDisplayName } from '@/lib/asignacion';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorPage, getErrorStatus } from '@/components/ErrorPage';
import { SortableTableHead } from '@/components/SortableTableHead';
import { useToast } from '@/hooks/use-toast';
import { getUserErrorMessage } from '@/lib/error-messages';
import {
  buildTicketExportParams,
  buildTicketListParams,
  createDefaultTicketSort,
  createTicketCsvFilename,
  downloadTicketCsv,
  isDefaultTicketSort,
  nextTicketSort,
  type TicketActiveFilters,
  type TicketSortRule,
} from '@/lib/ticket-list-controls';

export default function TicketList() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<string>('_all');
  const [prioridadFilter, setPrioridadFilter] = useState<string>('_all');
  const [motivoCategoriaFilter, setMotivoCategoriaFilter] = useState<string>('_all');
  const [vencidosFilter, setVencidosFilter] = useState(false);

  // Date and Time filters
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [horaDesde, setHoraDesde] = useState('');
  const [horaHasta, setHoraHasta] = useState('');
  const [empresa, setEmpresa] = useState('');

  // Orden server-side sobre el conjunto completo + paginación.
  const [sorts, setSorts] = useState<TicketSortRule[]>(createDefaultTicketSort);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isExporting, setIsExporting] = useState(false);

  // Al cambiar cualquier filtro u orden, volver a la primera página
  useEffect(() => {
    setPage(1);
  }, [
    search,
    estadoFilter,
    prioridadFilter,
    motivoCategoriaFilter,
    vencidosFilter,
    fechaDesde,
    fechaHasta,
    horaDesde,
    horaHasta,
    empresa,
    sorts,
    pageSize,
  ]);

  const activeFilters: TicketActiveFilters = {
    ...(search ? { search } : {}),
    ...(estadoFilter !== '_all' ? { estado: estadoFilter as ListTicketsEstado } : {}),
    ...(prioridadFilter !== '_all' ? { prioridad: prioridadFilter as ListTicketsPrioridad } : {}),
    ...(motivoCategoriaFilter !== '_all' ? { motivo_categoria: motivoCategoriaFilter as MotivoCategoria } : {}),
    ...(vencidosFilter ? { vencidos: true } : {}),
    ...(fechaDesde ? { fecha_desde: fechaDesde } : {}),
    ...(fechaHasta ? { fecha_hasta: fechaHasta } : {}),
    ...(horaDesde ? { hora_desde: horaDesde } : {}),
    ...(horaHasta ? { hora_hasta: horaHasta } : {}),
    ...(empresa ? { empresa } : {}),
  };
  const params = buildTicketListParams(activeFilters, sorts, page, pageSize);
  const exportParams = buildTicketExportParams(activeFilters, sorts);

  const {
    data: listResponse,
    error: listError,
    isError: listIsError,
    isFetching: listIsFetching,
    isLoading,
    refetch: refetchTickets,
  } = useListTickets(params);
  const tickets = listResponse?.tickets || [];
  const total = listResponse?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const hasFilters =
    search ||
    estadoFilter !== '_all' ||
    prioridadFilter !== '_all' ||
    motivoCategoriaFilter !== '_all' ||
    vencidosFilter ||
    fechaDesde ||
    fechaHasta ||
    horaDesde ||
    horaHasta ||
    empresa;

  const clearFilters = () => {
    setSearch('');
    setEstadoFilter('_all');
    setPrioridadFilter('_all');
    setMotivoCategoriaFilter('_all');
    setVencidosFilter(false);
    setFechaDesde('');
    setFechaHasta('');
    setHoraDesde('');
    setHoraHasta('');
    setEmpresa('');
  };

  const handleSort = (column: TicketSortBy, additive: boolean) => {
    setSorts((current) => nextTicketSort(current, column, additive));
    setPage(1);
  };

  const resetSort = () => {
    setSorts(createDefaultTicketSort());
    setPage(1);
  };

  const handleExportCsv = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      const csv = await exportTicketsCsv(exportParams);
      downloadTicketCsv(csv, createTicketCsvFilename());
      toast({
        variant: 'success',
        title: 'CSV exportado',
        description: 'Se descargaron todos los tickets que coinciden con los filtros actuales.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'No se pudo exportar el CSV',
        description: getUserErrorMessage(error, 'No pudimos generar el archivo. Reintentá en unos segundos.'),
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (listIsError) {
    return (
      <ErrorPage
        status={getErrorStatus(listError) ?? 503}
        title="No pudimos cargar los llamados"
        message="No fue posible obtener el listado de tickets. Reintentá o volvé al inicio."
        onRetry={() => void refetchTickets()}
        isRetrying={listIsFetching}
      />
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto w-full space-y-4 flex flex-col h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Llamados</h1>
          {listResponse && (
            <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">
              {listResponse.total}
            </span>
          )}
        </div>
      </div>

      {/* Filters Bar - Structured Rows */}
      <div className="shrink-0 space-y-2 rounded-md border border-border bg-card p-2 shadow-sm">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_185px_165px]">
          <div className="flex h-8 min-w-0 items-center lg:col-span-2 xl:col-span-1">
            <Search className="ml-2.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Input
              aria-label="Buscar tickets"
              placeholder="Buscar contacto, empresa o motivo..."
              className="h-full min-w-0 flex-1 border-none bg-transparent px-2 text-sm shadow-none focus-visible:ring-0"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <Label htmlFor="tickets-estado" className="sr-only">
            Filtrar por estado
          </Label>
          <Select value={estadoFilter} onValueChange={setEstadoFilter}>
            <SelectTrigger
              id="tickets-estado"
              className="h-8 w-full min-w-0 justify-start gap-1.5 border-slate-200 bg-slate-50 text-xs [&>svg]:ml-auto"
            >
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Estado:</span>
              <SelectValue className="min-w-0 truncate" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todos</SelectItem>
              <SelectItem value={TicketEstado.nuevo}>Nuevo</SelectItem>
              <SelectItem value={TicketEstado.en_proceso}>En Proceso</SelectItem>
              <SelectItem value={TicketEstado.pendiente}>{getEstadoLabel(TicketEstado.pendiente)}</SelectItem>
              <SelectItem value={TicketEstado.resuelto}>Resuelto</SelectItem>
              <SelectItem value={TicketEstado.cerrado}>Cerrado</SelectItem>
            </SelectContent>
          </Select>

          <Label htmlFor="tickets-prioridad" className="sr-only">
            Filtrar por prioridad
          </Label>
          <Select value={prioridadFilter} onValueChange={setPrioridadFilter}>
            <SelectTrigger
              id="tickets-prioridad"
              className="h-8 w-full min-w-0 justify-start gap-1.5 border-slate-200 bg-slate-50 text-xs [&>svg]:ml-auto"
            >
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Prioridad:
              </span>
              <SelectValue className="min-w-0 truncate" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todas</SelectItem>
              <SelectItem value={TicketPrioridad.baja}>Baja</SelectItem>
              <SelectItem value={TicketPrioridad.media}>Media</SelectItem>
              <SelectItem value={TicketPrioridad.alta}>Alta</SelectItem>
              <SelectItem value={TicketPrioridad.urgente}>Urgente</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 xl:grid-cols-[220px_minmax(0,1.3fr)_minmax(0,1fr)]">
          <Label htmlFor="tickets-categoria" className="sr-only">
            Filtrar por categoría
          </Label>
          <Select value={motivoCategoriaFilter} onValueChange={setMotivoCategoriaFilter}>
            <SelectTrigger
              id="tickets-categoria"
              className="h-8 w-full min-w-0 justify-start gap-1.5 border-slate-200 bg-slate-50 text-xs lg:col-span-2 xl:col-span-1 [&>svg]:ml-auto"
            >
              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Categoría:
              </span>
              <SelectValue className="min-w-0 truncate" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todas</SelectItem>
              {MOTIVO_CATEGORIA_OPTIONS.map((categoria) => (
                <SelectItem key={categoria.value} value={categoria.value}>
                  {categoria.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Dates */}
          <div className="flex h-8 min-w-0 items-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
            <span className="pl-2 pr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Fecha:</span>
            <input
              type="date"
              aria-label="Fecha desde"
              className="h-full min-w-0 flex-1 border-none bg-transparent px-1.5 text-xs text-slate-700 outline-none"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              title="Fecha Desde"
            />
            <span className="text-slate-300">-</span>
            <input
              type="date"
              aria-label="Fecha hasta"
              className="h-full min-w-0 flex-1 border-none bg-transparent px-1.5 text-xs text-slate-700 outline-none"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              title="Fecha Hasta"
            />
          </div>

          {/* Times */}
          <div className="flex h-8 min-w-0 items-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
            <span className="pl-2 pr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Hora:</span>
            <input
              type="time"
              aria-label="Hora desde"
              className="h-full min-w-0 flex-1 border-none bg-transparent px-2 text-xs text-slate-700 outline-none"
              value={horaDesde}
              onChange={(e) => setHoraDesde(e.target.value)}
              title="Hora Desde"
            />
            <span className="text-slate-300">-</span>
            <input
              type="time"
              aria-label="Hora hasta"
              className="h-full min-w-0 flex-1 border-none bg-transparent px-2 text-xs text-slate-700 outline-none"
              value={horaHasta}
              onChange={(e) => setHoraHasta(e.target.value)}
              title="Hora Hasta"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(220px,1fr)_auto]">
          <div className="relative min-w-0">
            <span className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Empresa:
            </span>
            <Input
              aria-label="Filtrar por empresa"
              placeholder="Todas"
              className="h-8 w-full bg-slate-50 pl-[68px] text-xs border-slate-200"
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
            />
          </div>

          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap lg:flex-nowrap">
            <div className="flex h-8 w-full min-w-0 items-center space-x-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 sm:w-auto">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Plazo:</span>
              <Switch
                id="vencidos-mode"
                checked={vencidosFilter}
                onCheckedChange={setVencidosFilter}
                className="scale-75 origin-left"
              />
              <Label
                htmlFor="vencidos-mode"
                className="cursor-pointer whitespace-nowrap text-xs font-medium text-slate-700"
              >
                Solo vencidos
              </Label>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleExportCsv()}
              disabled={isExporting}
              aria-label="Exportar todos los tickets filtrados a CSV"
              className="h-8 w-full whitespace-nowrap bg-white px-2.5 text-xs sm:w-auto"
            >
              {isExporting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              )}
              {isExporting ? 'Exportando…' : 'Exportar CSV'}
            </Button>

            {hasFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-8 w-full px-2 text-xs text-slate-500 hover:text-slate-900 sm:w-auto"
              >
                Limpiar filtros
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Table Area */}
      <div className="flex-1 bg-card border border-border rounded-md shadow-sm overflow-hidden flex flex-col">
        <div className="flex shrink-0 flex-col items-start justify-between gap-1.5 border-b border-slate-200 bg-slate-50/60 px-3 py-1.5 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:gap-3">
          <span>
            Ordená con un clic. Usá <kbd className="rounded border bg-white px-1 font-sans">Shift</kbd> + clic para
            combinar varias columnas; los números indican su prioridad.
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetSort}
            disabled={isDefaultTicketSort(sorts)}
            className="h-7 shrink-0 gap-1.5 px-2 text-[11px] font-medium"
            title="Volver a Fecha de llegada, más recientes primero"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restablecer orden
          </Button>
        </div>
        <div className="overflow-x-auto overflow-y-auto flex-1 bg-white">
          <Table>
            <TableHeader className="bg-slate-50/80 sticky top-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <TableRow className="hover:bg-transparent border-b border-border">
                <SortableTableHead
                  label="Fecha y Hora"
                  column={TicketSortBy.fecha_creacion}
                  sorts={sorts}
                  onSort={handleSort}
                  className="w-[140px]"
                />
                <SortableTableHead
                  label="Contacto"
                  column={TicketSortBy.contacto}
                  sorts={sorts}
                  onSort={handleSort}
                  className="w-[220px]"
                />
                <SortableTableHead
                  label="Categoría"
                  column={TicketSortBy.motivo_categoria}
                  sorts={sorts}
                  onSort={handleSort}
                  className="w-[190px]"
                />
                <SortableTableHead
                  label="Motivo"
                  column={TicketSortBy.motivo}
                  sorts={sorts}
                  onSort={handleSort}
                  className="w-[250px]"
                />
                <SortableTableHead
                  label="Estado"
                  column={TicketSortBy.estado}
                  sorts={sorts}
                  onSort={handleSort}
                  className="w-[120px]"
                />
                <SortableTableHead
                  label="Prioridad"
                  column={TicketSortBy.prioridad}
                  sorts={sorts}
                  onSort={handleSort}
                  className="w-[100px]"
                />
                <SortableTableHead
                  label="Asignado"
                  column={TicketSortBy.asignado_a}
                  sorts={sorts}
                  onSort={handleSort}
                  className="w-[170px]"
                />
                <SortableTableHead
                  label="Progreso"
                  column={TicketSortBy.progreso}
                  sorts={sorts}
                  onSort={handleSort}
                  className="w-[150px]"
                />
                <SortableTableHead
                  label="Límite"
                  column={TicketSortBy.fecha_limite}
                  sorts={sorts}
                  onSort={handleSort}
                  className="w-[140px]"
                  align="right"
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="py-2.5">
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell className="py-2.5 space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </TableCell>
                    <TableCell className="py-2.5">
                      <Skeleton className="h-5 w-32" />
                    </TableCell>
                    <TableCell className="py-2.5">
                      <Skeleton className="h-4 w-48" />
                    </TableCell>
                    <TableCell className="py-2.5">
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell className="py-2.5">
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell className="py-2.5">
                      <Skeleton className="h-4 w-28" />
                    </TableCell>
                    <TableCell className="py-2.5">
                      <Skeleton className="h-2 w-full" />
                    </TableCell>
                    <TableCell className="py-2.5">
                      <Skeleton className="h-4 w-24 ml-auto" />
                    </TableCell>
                  </TableRow>
                ))
              ) : tickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-64 text-center border-b-0">
                    <div className="flex flex-col items-center justify-center text-slate-500 space-y-3">
                      <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100">
                        <Filter className="h-5 w-5 text-slate-400" />
                      </div>
                      <p className="text-sm font-medium text-slate-900">No se encontraron llamados</p>
                      <p className="text-xs">Modifica los filtros o intenta con otra búsqueda.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                tickets.map((ticket: any) => {
                  const vencido = isVencido(ticket.fecha_limite, ticket.estado);
                  const motivoCategoria = getMotivoCategoriaConfig(ticket.motivo_categoria);
                  const contactoLabel = getContactDisplayName(ticket);
                  const empresaLabel = ticket.empresa?.trim() || 'Sin empresa asociada';
                  const asignadoLabel = getAssignedDisplayName(ticket.asignado_a);
                  const tieneAsignado = hasAssignedDisplayName(ticket.asignado_a);

                  return (
                    <TableRow
                      key={ticket.id}
                      onClick={() => setLocation(`/tickets/${ticket.id}`)}
                      className="cursor-pointer transition-all hover:bg-slate-50/80 group border-b border-slate-100 last:border-0 relative"
                      data-testid={`row-ticket-${ticket.id}`}
                    >
                      <TableCell className="py-2.5">
                        {/* Hover Left Border Accent */}
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="flex flex-col">
                          <span className="text-sm text-foreground font-medium">
                            {new Date(ticket.fecha_creacion).toLocaleDateString('es-AR')}
                          </span>
                          <span className="text-[11px] text-muted-foreground tabular-nums">{ticket.hora} hs</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-foreground" title={contactoLabel}>
                            {contactoLabel}
                          </span>
                          <span
                            className="mt-0.5 flex min-w-0 items-center text-[11px] text-slate-500"
                            title={empresaLabel}
                          >
                            <Building className="mr-1 h-3 w-3 shrink-0 text-slate-400" />
                            <span className="truncate">{empresaLabel}</span>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span
                          className={`inline-flex max-w-full items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${motivoCategoria.badgeClass}`}
                        >
                          <span className="truncate">{motivoCategoria.label}</span>
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="text-sm text-foreground line-clamp-2 leading-snug" title={ticket.motivo}>
                          {ticket.motivo}
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <EstadoBadge estado={ticket.estado} />
                      </TableCell>
                      <TableCell className="py-2.5">
                        <PrioridadBadge prioridad={ticket.prioridad} />
                      </TableCell>
                      <TableCell className="py-2.5">
                        <span
                          className={`block truncate text-sm ${tieneAsignado ? 'font-medium text-slate-700' : 'text-slate-400'}`}
                          title={asignadoLabel}
                        >
                          {asignadoLabel}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-2">
                          <Progress value={ticket.progreso || 0} className="h-1.5 flex-1 bg-slate-100" />
                          <span className="text-[10px] font-bold text-slate-500 w-8 text-right">
                            {ticket.progreso || 0}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        {ticket.fecha_limite ? (
                          <div
                            className={`flex items-center justify-end gap-1 text-[13px] ${vencido ? 'text-red-600 font-bold' : 'text-slate-600 font-medium'}`}
                          >
                            {vencido && <AlertCircle className="h-3.5 w-3.5" />}
                            {formatDate(ticket.fecha_limite).split(' ')[0]}
                          </div>
                        ) : (
                          <span className="text-slate-300 text-sm">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Paginación */}
        <div className="shrink-0 flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-2.5 border-t border-border bg-slate-50/60">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Mostrar</span>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="h-7 w-[70px] text-xs bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>por página</span>
          </div>
          <span className="text-xs text-muted-foreground">
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
    </div>
  );
}
