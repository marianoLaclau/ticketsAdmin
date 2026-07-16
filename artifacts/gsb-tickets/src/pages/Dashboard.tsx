import React, { useState } from 'react';
import { 
  useGetDashboardStats, 
  useGetActividadReciente, 
  useGetTicketsVencidos, 
  useGetMotivoStats 
} from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, Activity, Building2, Users } from 'lucide-react';
import { Link } from 'wouter';
import { formatShortId, formatDate, getEstadoColor, getPrioridadStyle, EstadoBadge, PrioridadBadge } from '@/lib/utils-tickets';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';

export default function Dashboard() {
  const [period, setPeriod] = useState<string>('Hoy');
  
  const { data: stats, isLoading: loadingStats } = useGetDashboardStats();
  const { data: actividades, isLoading: loadingActividad } = useGetActividadReciente({ limit: 10 });
  const { data: vencidos, isLoading: loadingVencidos } = useGetTicketsVencidos();
  const { data: motivos, isLoading: loadingMotivos } = useGetMotivoStats();

  const primaryColor = 'hsl(var(--primary))';
  
  const today = new Date();
  const dateString = today.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Calculate percentages for the stacked bar
  const totalEstados = stats?.por_estado?.reduce((acc: number, curr: any) => acc + curr.cantidad, 0) || 0;

  return (
    <div className="p-8 max-w-[1400px] mx-auto w-full space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Centro de Operaciones</h1>
          <p className="text-sm text-muted-foreground mt-1 capitalize">{dateString}</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex bg-slate-100 p-1 rounded-md text-sm font-medium">
            {['Hoy', '7 días', '30 días', 'Este mes'].map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-sm transition-colors ${period === p ? 'bg-white shadow-sm text-foreground' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {p}
              </button>
            ))}
          </div>
          <Link 
            href="/tickets/nuevo" 
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4"
          >
            Nuevo Llamado
          </Link>
        </div>
      </div>

      {/* Row 1 - Compact KPI Chips */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border rounded-lg px-4 py-3 flex items-center justify-between shadow-sm">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total</span>
            <span className="text-2xl font-bold text-foreground mt-0.5">{loadingStats ? <Skeleton className="h-7 w-12" /> : (stats?.total || 0)}</span>
          </div>
        </div>
        
        <div className="bg-card border rounded-lg px-4 py-3 flex items-center justify-between shadow-sm">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nuevos hoy</span>
            <span className="text-2xl font-bold text-foreground mt-0.5">{loadingStats ? <Skeleton className="h-7 w-12" /> : (stats?.nuevos_hoy || 0)}</span>
          </div>
        </div>

        <div className="bg-card border rounded-lg px-4 py-3 flex items-center justify-between shadow-sm">
          <div className="flex flex-col">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Resueltos hoy</span>
            <span className="text-2xl font-bold text-green-600 mt-0.5">{loadingStats ? <Skeleton className="h-7 w-12" /> : (stats?.resueltos_hoy || 0)}</span>
          </div>
        </div>

        <div className={`bg-card border rounded-lg px-4 py-3 flex items-center justify-between shadow-sm ${stats?.vencidos && stats.vencidos > 0 ? 'border-red-200' : ''}`}>
          <div className="flex flex-col">
            <span className={`text-xs font-medium uppercase tracking-wide ${stats?.vencidos && stats.vencidos > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>Vencidos</span>
            <span className={`text-2xl font-bold mt-0.5 ${stats?.vencidos && stats.vencidos > 0 ? 'text-red-600' : 'text-foreground'}`}>
              {loadingStats ? <Skeleton className="h-7 w-12" /> : (stats?.vencidos || 0)}
            </span>
          </div>
          {stats?.vencidos && stats.vencidos > 0 ? (
            <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
              <Clock className="h-4 w-4 text-red-600" />
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Distribucion Estados & Motivos */}
          <div className="bg-card border rounded-lg p-5 shadow-sm space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-4 uppercase tracking-wide">Distribución por Estado</h3>
              {loadingStats ? (
                <Skeleton className="h-4 w-full rounded-full" />
              ) : totalEstados > 0 ? (
                <>
                  <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
                    {stats?.por_estado?.map((e: any) => {
                      const pct = (e.cantidad / totalEstados) * 100;
                      let bg = 'bg-slate-400';
                      if (e.estado === 'nuevo') bg = 'bg-slate-400';
                      else if (e.estado === 'en_proceso') bg = 'bg-blue-500';
                      else if (e.estado === 'pendiente') bg = 'bg-amber-500';
                      else if (e.estado === 'resuelto') bg = 'bg-green-500';
                      else if (e.estado === 'cerrado') bg = 'bg-slate-800';
                      return (
                        <div key={e.estado} style={{ width: `${pct}%` }} className={`h-full ${bg} transition-all`} title={`${e.estado}: ${e.cantidad}`} />
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-4 mt-3">
                    {stats?.por_estado?.map((e: any) => (
                      <div key={e.estado} className="flex items-center gap-1.5">
                        <EstadoBadge estado={e.estado} />
                        <span className="text-sm font-bold text-foreground">{e.cantidad}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-500">Sin datos de estado</div>
              )}
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Motivos de Contacto</h3>
                <span className="text-xs text-muted-foreground bg-slate-100 px-2 py-0.5 rounded">Todos los periodos</span>
              </div>
              <div className="h-[240px] -ml-4">
                {loadingMotivos ? (
                  <Skeleton className="h-full w-full" />
                ) : (!motivos || motivos.length === 0) ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm">Sin datos</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={motivos} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis dataKey="motivo" type="category" width={140} tick={{fontSize: 11, fill: '#64748b'}} axisLine={false} tickLine={false} />
                      <Tooltip 
                        cursor={{fill: '#f8fafc'}} 
                        contentStyle={{ borderRadius: '6px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px -1px rgb(0 0 0 / 0.05)', fontSize: '12px' }}
                      />
                      <Bar dataKey="cantidad" radius={[0, 4, 4, 0]} barSize={20}>
                        {motivos.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={primaryColor} fillOpacity={0.85 - (index * 0.05)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Vencidos Table */}
          <div className="bg-card border border-red-100 rounded-lg shadow-sm overflow-hidden relative">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>
            <div className="bg-red-50/50 px-5 py-3 border-b border-red-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-red-800 flex items-center gap-2 uppercase tracking-wide">
                <Clock className="h-4 w-4" />
                Requieren Atención Inmediata
              </h3>
              {vencidos && vencidos.length > 0 && (
                <span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-0.5 rounded-sm">
                  {vencidos.length} VENCIDOS
                </span>
              )}
            </div>
            
            {loadingVencidos ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (!vencidos || vencidos.length === 0) ? (
              <div className="p-8 text-center text-slate-500 flex flex-col items-center">
                <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center mb-2">
                  <div className="h-2 w-2 rounded-full bg-slate-300"></div>
                </div>
                <p className="text-sm font-medium">SIN VENCIDOS</p>
                <p className="text-xs">Todos los tickets están al día.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50/50 text-slate-500 text-xs uppercase">
                    <tr>
                      <th className="px-5 py-2 font-medium">ID</th>
                      <th className="px-5 py-2 font-medium">Contacto</th>
                      <th className="px-5 py-2 font-medium">Motivo</th>
                      <th className="px-5 py-2 font-medium">Prioridad</th>
                      <th className="px-5 py-2 font-medium text-right">Venció hace</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {vencidos.map((ticket: any) => {
                      // simple diff calculation
                      const limitDate = new Date(ticket.fecha_limite);
                      const diffHours = Math.floor((today.getTime() - limitDate.getTime()) / (1000 * 60 * 60));
                      const vencioStr = diffHours > 24 ? `${Math.floor(diffHours/24)} d` : `${diffHours} h`;

                      return (
                        <tr key={ticket.id} className="hover:bg-slate-50 group cursor-pointer" onClick={() => window.location.href = `/tickets/${ticket.id}`}>
                          <td className="px-5 py-2.5 font-mono text-xs text-slate-500">{formatShortId(ticket.conversation_id)}</td>
                          <td className="px-5 py-2.5">
                            <div className="font-medium text-foreground">{ticket.nombre} {ticket.apellido}</div>
                            {ticket.empresa && <div className="text-[11px] text-slate-500 truncate max-w-[120px]">{ticket.empresa}</div>}
                          </td>
                          <td className="px-5 py-2.5 text-slate-600 truncate max-w-[200px]" title={ticket.motivo}>
                            {ticket.motivo}
                          </td>
                          <td className="px-5 py-2.5">
                            <PrioridadBadge prioridad={ticket.prioridad} />
                          </td>
                          <td className="px-5 py-2.5 text-right font-medium text-red-600 text-xs">
                            {vencioStr}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column 1/3 - Activity Feed */}
        <div className="lg:col-span-1">
          <div className="bg-card border rounded-lg shadow-sm h-full flex flex-col">
            <div className="px-5 py-4 border-b flex justify-between items-center">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Actividad Reciente</h3>
            </div>
            <div className="p-5 flex-1 overflow-y-auto">
              {loadingActividad ? (
                <div className="space-y-6">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex gap-3">
                      <Skeleton className="h-6 w-6 rounded-full" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-2 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (!actividades || actividades.length === 0) ? (
                <div className="text-center text-slate-500 py-8 text-sm">
                  No hay actividad reciente
                </div>
              ) : (
                <div className="space-y-5">
                  {actividades.map((actividad: any, idx: number) => {
                    const isCreation = actividad.tipo === 'ticket_creado';
                    const dotColor = isCreation ? 'bg-green-500' : 'bg-blue-500';
                    const ringColor = isCreation ? 'ring-green-100' : 'ring-blue-100';

                    return (
                      <div key={idx} className="relative pl-6">
                        {idx !== actividades.length - 1 && (
                          <div className="absolute left-[7px] top-5 bottom-[-20px] w-px bg-slate-200" />
                        )}
                        <div className={`absolute left-1 top-1 h-3 w-3 rounded-full ${dotColor} ring-4 ${ringColor} ring-offset-background`} />
                        
                        <div className="text-sm">
                          <Link href={`/tickets/${actividad.ticket_id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                            ID: {actividad.ticket_id}
                          </Link>
                          <p className="text-slate-600 text-[13px] mt-0.5 leading-snug">{actividad.descripcion}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[11px] font-medium text-slate-400 uppercase">{formatDate(actividad.fecha)}</span>
                            {actividad.nombre_contacto && (
                              <>
                                <span className="text-slate-300">•</span>
                                <span className="text-[11px] text-slate-500 truncate max-w-[140px]">{actividad.nombre_contacto}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
