import React, { useEffect, useState } from 'react';
import { 
  useListTickets, 
  TicketEstado, 
  TicketPrioridad,
  ListTicketsEstado,
  ListTicketsPrioridad
} from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Search, Filter, Building, AlertCircle,
  ArrowUp, ArrowDown, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { formatDate, isVencido, EstadoBadge, PrioridadBadge } from '@/lib/utils-tickets';
import { getMotivoCategoriaConfig, MOTIVO_CATEGORIA_OPTIONS } from '@/lib/motivos';
import { getContactDisplayName } from '@/lib/contacto';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorPage, getErrorStatus } from '@/components/ErrorPage';

export default function TicketList() {
  const [, setLocation] = useLocation();
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

  // Orden por fecha/hora del llamado + paginación
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Al cambiar cualquier filtro u orden, volver a la primera página
  useEffect(() => {
    setPage(1);
  }, [search, estadoFilter, prioridadFilter, motivoCategoriaFilter, vencidosFilter, fechaDesde, fechaHasta, horaDesde, horaHasta, empresa, order, pageSize]);

  // Custom hook usage with active filters
  const params: any = { order, page, limit: pageSize };
  if (search) params.search = search;
  if (estadoFilter !== '_all') params.estado = estadoFilter as ListTicketsEstado;
  if (prioridadFilter !== '_all') params.prioridad = prioridadFilter as ListTicketsPrioridad;
  if (motivoCategoriaFilter !== '_all') params.motivo_categoria = motivoCategoriaFilter;
  if (vencidosFilter) params.vencidos = true;
  if (fechaDesde) params.fecha_desde = fechaDesde;
  if (fechaHasta) params.fecha_hasta = fechaHasta;
  if (horaDesde) params.hora_desde = horaDesde;
  if (horaHasta) params.hora_hasta = horaHasta;
  if (empresa) params.empresa = empresa;

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

  const hasFilters = search || estadoFilter !== '_all' || prioridadFilter !== '_all' || motivoCategoriaFilter !== '_all' || vencidosFilter || fechaDesde || fechaHasta || horaDesde || horaHasta || empresa;

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
    <div className="p-8 max-w-[1600px] mx-auto w-full space-y-4 flex flex-col h-full">
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

      {/* Filters Bar - Compact Single Row */}
      <div className="shrink-0 bg-card border border-border rounded-md shadow-sm p-1.5 flex flex-col xl:flex-row gap-2">
        <div className="flex-1 relative min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input 
            placeholder="Buscar..." 
            className="pl-8 h-8 text-sm bg-transparent border-none shadow-none focus-visible:ring-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        <div className="flex flex-wrap lg:flex-nowrap items-center gap-2">
          <Select value={estadoFilter} onValueChange={setEstadoFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs bg-slate-50 border-slate-200">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todos</SelectItem>
              <SelectItem value={TicketEstado.nuevo}>Nuevo</SelectItem>
              <SelectItem value={TicketEstado.en_proceso}>En Proceso</SelectItem>
              <SelectItem value={TicketEstado.pendiente}>Pendiente</SelectItem>
              <SelectItem value={TicketEstado.resuelto}>Resuelto</SelectItem>
              <SelectItem value={TicketEstado.cerrado}>Cerrado</SelectItem>
            </SelectContent>
          </Select>

          <Select value={prioridadFilter} onValueChange={setPrioridadFilter}>
            <SelectTrigger className="w-[120px] h-8 text-xs bg-slate-50 border-slate-200">
              <SelectValue placeholder="Prioridad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todas</SelectItem>
              <SelectItem value={TicketPrioridad.baja}>Baja</SelectItem>
              <SelectItem value={TicketPrioridad.media}>Media</SelectItem>
              <SelectItem value={TicketPrioridad.alta}>Alta</SelectItem>
              <SelectItem value={TicketPrioridad.urgente}>Urgente</SelectItem>
            </SelectContent>
          </Select>

          <Select value={motivoCategoriaFilter} onValueChange={setMotivoCategoriaFilter}>
            <SelectTrigger className="w-[190px] h-8 text-xs bg-slate-50 border-slate-200">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todas las categorías</SelectItem>
              {MOTIVO_CATEGORIA_OPTIONS.map((categoria) => (
                <SelectItem key={categoria.value} value={categoria.value}>
                  {categoria.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Dates */}
          <div className="flex items-center border border-slate-200 bg-slate-50 rounded-md overflow-hidden h-8">
            <input 
              type="date" 
              className="text-xs bg-transparent border-none outline-none px-2 h-full text-slate-700 w-[115px]" 
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              title="Fecha Desde"
            />
            <span className="text-slate-300">-</span>
            <input 
              type="date" 
              className="text-xs bg-transparent border-none outline-none px-2 h-full text-slate-700 w-[115px]" 
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              title="Fecha Hasta"
            />
          </div>

          {/* Times */}
          <div className="flex items-center border border-slate-200 bg-slate-50 rounded-md overflow-hidden h-8">
            <input 
              type="time" 
              className="text-xs bg-transparent border-none outline-none px-2 h-full text-slate-700 w-[85px]" 
              value={horaDesde}
              onChange={(e) => setHoraDesde(e.target.value)}
              title="Hora Desde"
            />
            <span className="text-slate-300">-</span>
            <input 
              type="time" 
              className="text-xs bg-transparent border-none outline-none px-2 h-full text-slate-700 w-[85px]" 
              value={horaHasta}
              onChange={(e) => setHoraHasta(e.target.value)}
              title="Hora Hasta"
            />
          </div>

          <Input 
            placeholder="Empresa..." 
            className="w-[140px] h-8 text-xs bg-slate-50 border-slate-200"
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
          />

          <div className="flex items-center space-x-2 border border-slate-200 rounded-md px-2.5 h-8 bg-slate-50">
            <Switch 
              id="vencidos-mode" 
              checked={vencidosFilter} 
              onCheckedChange={setVencidosFilter}
              className="scale-75 origin-left"
            />
            <Label htmlFor="vencidos-mode" className="text-xs font-medium cursor-pointer text-slate-700 whitespace-nowrap">
              Vencidos
            </Label>
          </div>
          
          {hasFilters && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearFilters}
              className="h-8 text-xs px-2 text-slate-500 hover:text-slate-900"
            >
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* Table Area */}
      <div className="flex-1 bg-card border border-border rounded-md shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto overflow-y-auto flex-1 bg-white">
          <Table>
            <TableHeader className="bg-slate-50/80 sticky top-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <TableRow className="hover:bg-transparent border-b border-border">
                <TableHead className="w-[140px] font-semibold text-xs text-slate-500 uppercase tracking-wider py-3">
                  <button
                    className="flex items-center gap-1 uppercase tracking-wider font-semibold hover:text-slate-900 transition-colors"
                    onClick={() => setOrder(order === 'desc' ? 'asc' : 'desc')}
                    title={order === 'desc' ? 'Más recientes primero (click para invertir)' : 'Más antiguos primero (click para invertir)'}
                  >
                    Fecha y Hora
                    {order === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
                  </button>
                </TableHead>
                <TableHead className="w-[220px] font-semibold text-xs text-slate-500 uppercase tracking-wider py-3">Contacto</TableHead>
                <TableHead className="w-[190px] font-semibold text-xs text-slate-500 uppercase tracking-wider py-3">Categoría</TableHead>
                <TableHead className="w-[250px] font-semibold text-xs text-slate-500 uppercase tracking-wider py-3">Motivo</TableHead>
                <TableHead className="w-[120px] font-semibold text-xs text-slate-500 uppercase tracking-wider py-3">Estado</TableHead>
                <TableHead className="w-[100px] font-semibold text-xs text-slate-500 uppercase tracking-wider py-3">Prioridad</TableHead>
                <TableHead className="w-[150px] font-semibold text-xs text-slate-500 uppercase tracking-wider py-3">Progreso</TableHead>
                <TableHead className="w-[140px] font-semibold text-xs text-slate-500 uppercase tracking-wider py-3 text-right">Límite</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="py-2.5"><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell className="py-2.5 space-y-1"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-24" /></TableCell>
                    <TableCell className="py-2.5"><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell className="py-2.5"><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell className="py-2.5"><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell className="py-2.5"><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell className="py-2.5"><Skeleton className="h-2 w-full" /></TableCell>
                    <TableCell className="py-2.5"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : tickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-64 text-center border-b-0">
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
                        <span className={`inline-flex max-w-full items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${motivoCategoria.badgeClass}`}>
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
                        <div className="flex items-center gap-2">
                          <Progress value={ticket.progreso || 0} className="h-1.5 flex-1 bg-slate-100" />
                          <span className="text-[10px] font-bold text-slate-500 w-8 text-right">
                            {ticket.progreso || 0}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-2.5 text-right">
                        {ticket.fecha_limite ? (
                          <div className={`flex items-center justify-end gap-1 text-[13px] ${vencido ? 'text-red-600 font-bold' : 'text-slate-600 font-medium'}`}>
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
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
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
