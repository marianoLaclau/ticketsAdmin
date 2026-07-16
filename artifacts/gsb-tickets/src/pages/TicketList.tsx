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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  Search, Filter, Plus, Clock, Users, Building, AlertCircle
} from 'lucide-react';
import { formatShortId, formatDate, isVencido, EstadoBadge, PrioridadBadge } from '@/lib/utils-tickets';
import { Skeleton } from '@/components/ui/skeleton';

export default function TicketList() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<string>('_all');
  const [prioridadFilter, setPrioridadFilter] = useState<string>('_all');
  const [vencidosFilter, setVencidosFilter] = useState(false);
  
  // Custom hook usage with active filters
  const params: any = {};
  if (search) params.search = search;
  if (estadoFilter !== '_all') params.estado = estadoFilter as ListTicketsEstado;
  if (prioridadFilter !== '_all') params.prioridad = prioridadFilter as ListTicketsPrioridad;
  if (vencidosFilter) params.vencidos = true;

  const { data: listResponse, isLoading } = useListTickets(params);
  const tickets = listResponse?.tickets || [];

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-6 flex flex-col h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Tickets</h1>
          <p className="text-slate-500 mt-1">Gestión y seguimiento de casos y llamadas.</p>
        </div>
        <Button onClick={() => setLocation('/tickets/nuevo')} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Ticket
        </Button>
      </div>

      <Card className="shrink-0 shadow-sm border-slate-200">
        <CardContent className="p-4 flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Buscar por motivo, nombre, empresa..." 
              className="pl-9 w-full bg-slate-50"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <Select value={estadoFilter} onValueChange={setEstadoFilter}>
              <SelectTrigger className="w-[160px] bg-slate-50">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos los estados</SelectItem>
                <SelectItem value={TicketEstado.nuevo}>Nuevo</SelectItem>
                <SelectItem value={TicketEstado.en_proceso}>En Proceso</SelectItem>
                <SelectItem value={TicketEstado.pendiente}>Pendiente</SelectItem>
                <SelectItem value={TicketEstado.resuelto}>Resuelto</SelectItem>
                <SelectItem value={TicketEstado.cerrado}>Cerrado</SelectItem>
              </SelectContent>
            </Select>

            <Select value={prioridadFilter} onValueChange={setPrioridadFilter}>
              <SelectTrigger className="w-[160px] bg-slate-50">
                <SelectValue placeholder="Prioridad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todas prioridades</SelectItem>
                <SelectItem value={TicketPrioridad.baja}>Baja</SelectItem>
                <SelectItem value={TicketPrioridad.media}>Media</SelectItem>
                <SelectItem value={TicketPrioridad.alta}>Alta</SelectItem>
                <SelectItem value={TicketPrioridad.urgente}>Urgente</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center space-x-2 border border-slate-200 rounded-md px-3 py-2 bg-slate-50">
              <Switch 
                id="vencidos-mode" 
                checked={vencidosFilter} 
                onCheckedChange={setVencidosFilter}
              />
              <Label htmlFor="vencidos-mode" className="text-sm font-medium cursor-pointer text-slate-700 whitespace-nowrap">
                Sólo Vencidos
              </Label>
            </div>
            
            {(search || estadoFilter !== '_all' || prioridadFilter !== '_all' || vencidosFilter) && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  setSearch('');
                  setEstadoFilter('_all');
                  setPrioridadFilter('_all');
                  setVencidosFilter(false);
                }}
                className="text-slate-500 hover:text-slate-900"
              >
                Limpiar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="flex-1 flex flex-col overflow-hidden border-slate-200 shadow-sm">
        <div className="overflow-x-auto overflow-y-auto flex-1 bg-white">
          <Table>
            <TableHeader className="bg-slate-50/80 sticky top-0 z-10 shadow-sm">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[80px] font-semibold text-slate-700">ID</TableHead>
                <TableHead className="w-[200px] font-semibold text-slate-700">Contacto</TableHead>
                <TableHead className="w-[250px] font-semibold text-slate-700">Motivo</TableHead>
                <TableHead className="w-[120px] font-semibold text-slate-700">Estado</TableHead>
                <TableHead className="w-[120px] font-semibold text-slate-700">Prioridad</TableHead>
                <TableHead className="w-[150px] font-semibold text-slate-700">Progreso</TableHead>
                <TableHead className="w-[140px] font-semibold text-slate-700 text-right">Límite</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-2 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : tickets.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-500 space-y-3">
                      <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center">
                        <Filter className="h-6 w-6 text-slate-400" />
                      </div>
                      <p className="text-base font-medium text-slate-900">No se encontraron tickets</p>
                      <p className="text-sm">Modifica los filtros o intenta con otra búsqueda.</p>
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
                      className={`cursor-pointer transition-colors hover:bg-slate-50 ${vencido ? 'bg-red-50/30' : ''}`}
                      data-testid={`row-ticket-${ticket.id}`}
                    >
                      <TableCell>
                        <span className="font-mono text-xs text-slate-500 bg-slate-100 px-1.5 py-1 rounded">
                          {formatShortId(ticket.conversation_id)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900 truncate">
                            {ticket.nombre} {ticket.apellido}
                          </span>
                          {ticket.empresa && (
                            <span className="text-xs text-slate-500 flex items-center mt-0.5 truncate">
                              <Building className="h-3 w-3 mr-1 shrink-0" />
                              {ticket.empresa}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-slate-800 line-clamp-1" title={ticket.motivo}>
                          {ticket.motivo}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 line-clamp-1" title={ticket.resumen || ''}>
                          {ticket.resumen || 'Sin resumen'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <EstadoBadge estado={ticket.estado} />
                      </TableCell>
                      <TableCell>
                        <PrioridadBadge prioridad={ticket.prioridad} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={ticket.progreso || 0} className="h-2 flex-1" />
                          <span className="text-xs font-medium text-slate-600 w-8 text-right">
                            {ticket.progreso || 0}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {ticket.fecha_limite ? (
                          <div className={`flex items-center justify-end gap-1.5 text-sm ${vencido ? 'text-red-600 font-medium' : 'text-slate-600'}`}>
                            {vencido && <AlertCircle className="h-3.5 w-3.5" />}
                            {formatDate(ticket.fecha_limite).split(' ')[0]}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-sm">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        
        {listResponse && listResponse.total > 0 && (
          <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 text-sm text-slate-600 flex justify-between items-center shrink-0">
            <div>
              Mostrando <span className="font-medium text-slate-900">{tickets.length}</span> de <span className="font-medium text-slate-900">{listResponse.total}</span> tickets
            </div>
            {/* Simple pagination would go here */}
          </div>
        )}
      </Card>
    </div>
  );
}