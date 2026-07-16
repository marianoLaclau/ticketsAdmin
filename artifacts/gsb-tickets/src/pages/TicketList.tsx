import React, { useState } from 'react';
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
  Search, Filter, Plus, Building, AlertCircle
} from 'lucide-react';
import { formatShortId, formatDate, isVencido, EstadoBadge, PrioridadBadge } from '@/lib/utils-tickets';
import { Skeleton } from '@/components/ui/skeleton';

export default function TicketList() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<string>('_all');
  const [prioridadFilter, setPrioridadFilter] = useState<string>('_all');
  const [vencidosFilter, setVencidosFilter] = useState(false);
  
  // Date and Time filters
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [horaDesde, setHoraDesde] = useState('');
  const [horaHasta, setHoraHasta] = useState('');
  const [empresa, setEmpresa] = useState('');

  // Custom hook usage with active filters
  const params: any = {};
  if (search) params.search = search;
  if (estadoFilter !== '_all') params.estado = estadoFilter as ListTicketsEstado;
  if (prioridadFilter !== '_all') params.prioridad = prioridadFilter as ListTicketsPrioridad;
  if (vencidosFilter) params.vencidos = true;
  if (fechaDesde) params.fecha_desde = fechaDesde;
  if (fechaHasta) params.fecha_hasta = fechaHasta;
  if (horaDesde) params.hora_desde = horaDesde;
  if (horaHasta) params.hora_hasta = horaHasta;
  if (empresa) params.empresa = empresa;

  const { data: listResponse, isLoading } = useListTickets(params);
  const tickets = listResponse?.tickets || [];

  const hasFilters = search || estadoFilter !== '_all' || prioridadFilter !== '_all' || vencidosFilter || fechaDesde || fechaHasta || horaDesde || horaHasta || empresa;

  const clearFilters = () => {
    setSearch('');
    setEstadoFilter('_all');
    setPrioridadFilter('_all');
    setVencidosFilter(false);
    setFechaDesde('');
    setFechaHasta('');
    setHoraDesde('');
    setHoraHasta('');
    setEmpresa('');
  };

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
        <Button onClick={() => setLocation('/tickets/nuevo')} className="shrink-0 h-9">
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Llamado
        </Button>
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
                <TableHead className="w-[80px] font-semibold text-xs text-slate-500 uppercase tracking-wider py-3">ID</TableHead>
                <TableHead className="w-[200px] font-semibold text-xs text-slate-500 uppercase tracking-wider py-3">Contacto</TableHead>
                <TableHead className="w-[250px] font-semibold text-xs text-slate-500 uppercase tracking-wider py-3">Motivo</TableHead>
                <TableHead className="w-[120px] font-semibold text-xs text-slate-500 uppercase tracking-wider py-3">Estado</TableHead>
                <TableHead className="w-[100px] font-semibold text-xs text-slate-500 uppercase tracking-wider py-3">Prioridad</TableHead>
                <TableHead className="w-[150px] font-semibold text-xs text-slate-500 uppercase tracking-wider py-3">Progreso</TableHead>
                <TableHead className="w-[140px] font-semibold text-xs text-slate-500 uppercase tracking-wider py-3 text-right">Límite</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 12 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="py-2.5"><Skeleton className="h-4 w-12" /></TableCell>
                    <TableCell className="py-2.5"><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell className="py-2.5"><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell className="py-2.5"><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell className="py-2.5"><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell className="py-2.5"><Skeleton className="h-2 w-full" /></TableCell>
                    <TableCell className="py-2.5"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : tickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center border-b-0">
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
                        <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {formatShortId(ticket.conversation_id)}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5">
                        <div className="flex flex-col">
                          <span className="font-semibold text-sm text-foreground truncate">
                            {ticket.nombre} {ticket.apellido}
                          </span>
                          {ticket.empresa && (
                            <span className="text-[11px] text-muted-foreground flex items-center mt-0.5 truncate">
                              <Building className="h-3 w-3 mr-1 shrink-0" />
                              {ticket.empresa}
                            </span>
                          )}
                        </div>
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
      </div>
    </div>
  );
}
