import React, { useEffect, useState } from 'react';
import {
  exportTicketsCsv,
  useListTickets,
  TicketSortBy,
  type ListTicketsEstado,
  type ListTicketsPrioridad,
  type MotivoCategoria,
} from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Filter,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorPage, getErrorStatus } from '@/components/ErrorPage';
import { SortableTableHead } from '@/components/SortableTableHead';
import { TicketListFiltersPanel } from '@/features/ticket-list/TicketListFiltersPanel';
import { TicketListTableRow } from '@/features/ticket-list/TicketListTableRow';
import { TicketSortToolbar } from '@/features/ticket-list/TicketSortToolbar';
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

      <TicketListFiltersPanel
        values={{
          search,
          estado: estadoFilter,
          prioridad: prioridadFilter,
          motivoCategoria: motivoCategoriaFilter,
          vencidos: vencidosFilter,
          fechaDesde,
          fechaHasta,
          horaDesde,
          horaHasta,
          empresa,
        }}
        onChange={{
          search: setSearch,
          estado: setEstadoFilter,
          prioridad: setPrioridadFilter,
          motivoCategoria: setMotivoCategoriaFilter,
          vencidos: setVencidosFilter,
          fechaDesde: setFechaDesde,
          fechaHasta: setFechaHasta,
          horaDesde: setHoraDesde,
          horaHasta: setHoraHasta,
          empresa: setEmpresa,
        }}
        isExporting={isExporting}
        onExport={handleExportCsv}
        onClear={clearFilters}
      />

      {/* Table Area */}
      <div className="flex-1 bg-card border border-border rounded-md shadow-sm overflow-hidden flex flex-col">
        <TicketSortToolbar
          isResetDisabled={isDefaultTicketSort(sorts)}
          onReset={resetSort}
        />
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
                tickets.map((ticket) => (
                  <TicketListTableRow
                    key={ticket.id}
                    ticket={ticket}
                    onOpen={(id) => setLocation(`/tickets/${id}`)}
                  />
                ))
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
