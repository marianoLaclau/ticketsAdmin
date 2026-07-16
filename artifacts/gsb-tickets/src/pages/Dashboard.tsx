import React from 'react';
import { 
  useGetDashboardStats, 
  useGetActividadReciente, 
  useGetTicketsVencidos, 
  useGetMotivoStats 
} from '@workspace/api-client-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, PhoneIncoming, AlertCircle, CheckCircle2, Inbox } from 'lucide-react';
import { Link } from 'wouter';
import { formatDate, EstadoBadge, PrioridadBadge } from '@/lib/utils-tickets';

// Pastel palette for estado bars
const ESTADO_PASTEL: Record<string, { bar: string; label: string }> = {
  nuevo:     { bar: '#bfdbfe', label: 'Nuevo' },
  en_proceso:{ bar: '#93c5fd', label: 'En proceso' },
  pendiente: { bar: '#fde68a', label: 'Pendiente' },
  resuelto:  { bar: '#86efac', label: 'Resuelto' },
  cerrado:   { bar: '#cbd5e1', label: 'Cerrado' },
};

// Pastel palette for motivos ranking
const MOTIVO_PASTEL = ['#a5b4fc','#86efac','#fde68a','#fca5a5','#c4b5fd','#67e8f9','#6ee7b7','#f9a8d4'];

export default function Dashboard() {
  const { data: stats, isLoading: loadingStats } = useGetDashboardStats();
  const { data: actividades, isLoading: loadingActividad } = useGetActividadReciente({ limit: 12 });
  const { data: vencidos, isLoading: loadingVencidos } = useGetTicketsVencidos();
  const { data: motivos, isLoading: loadingMotivos } = useGetMotivoStats();

  const today = new Date();
  const dateString = today.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const totalEstados = stats?.por_estado?.reduce((acc: number, curr: any) => acc + curr.cantidad, 0) || 0;
  const nuevosSinRevisar = stats?.por_estado?.find((e: any) => e.estado === 'nuevo')?.cantidad || 0;
  const enProceso = stats?.por_estado?.find((e: any) => e.estado === 'en_proceso')?.cantidad || 0;

  // Motivos sorted and max for relative bars
  const motivosSorted = motivos ? [...motivos].sort((a: any, b: any) => b.cantidad - a.cantidad) : [];
  const maxMotivo = motivosSorted[0]?.cantidad || 1;

  return (
    <div className="p-6 max-w-[1400px] mx-auto w-full space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Centro de Operaciones</h1>
        <p className="text-sm text-muted-foreground capitalize">{dateString}</p>
      </div>

      {/* KPI Row — foco en tiempo real */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Sin revisar — hero card */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-center gap-4 shadow-sm">
          <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Inbox className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Sin revisar</p>
            {loadingStats
              ? <Skeleton className="h-8 w-10 mt-1" />
              : <p className="text-3xl font-bold text-amber-800 leading-none mt-1">{nuevosSinRevisar}</p>
            }
            <p className="text-[11px] text-amber-600 mt-0.5">tickets nuevos</p>
          </div>
        </div>

        {/* En proceso */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 flex items-center gap-4 shadow-sm">
          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <PhoneIncoming className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">En proceso</p>
            {loadingStats
              ? <Skeleton className="h-8 w-10 mt-1" />
              : <p className="text-3xl font-bold text-blue-800 leading-none mt-1">{enProceso}</p>
            }
            <p className="text-[11px] text-blue-600 mt-0.5">en atención</p>
          </div>
        </div>

        {/* Vencidos */}
        <div className={`rounded-xl px-5 py-4 flex items-center gap-4 shadow-sm border ${
          stats?.vencidos && stats.vencidos > 0
            ? 'bg-red-50 border-red-200'
            : 'bg-card border-border'
        }`}>
          <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${
            stats?.vencidos && stats.vencidos > 0 ? 'bg-red-100' : 'bg-slate-100'
          }`}>
            <AlertCircle className={`h-5 w-5 ${stats?.vencidos && stats.vencidos > 0 ? 'text-red-600' : 'text-slate-400'}`} />
          </div>
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-wider ${stats?.vencidos && stats.vencidos > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>Vencidos</p>
            {loadingStats
              ? <Skeleton className="h-8 w-10 mt-1" />
              : <p className={`text-3xl font-bold leading-none mt-1 ${stats?.vencidos && stats.vencidos > 0 ? 'text-red-800' : 'text-foreground'}`}>{stats?.vencidos || 0}</p>
            }
            <p className={`text-[11px] mt-0.5 ${stats?.vencidos && stats.vencidos > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>fuera de plazo</p>
          </div>
        </div>

        {/* Resueltos hoy */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex items-center gap-4 shadow-sm">
          <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Resueltos hoy</p>
            {loadingStats
              ? <Skeleton className="h-8 w-10 mt-1" />
              : <p className="text-3xl font-bold text-emerald-800 leading-none mt-1">{stats?.resueltos_hoy || 0}</p>
            }
            <p className="text-[11px] text-emerald-600 mt-0.5">cerrados</p>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2/3 */}
        <div className="lg:col-span-2 space-y-5">

          {/* Distribución + Motivos */}
          <div className="bg-card border rounded-xl p-5 shadow-sm space-y-6">
            
            {/* Distribución por estado — pastel stacked bar */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Distribución por Estado</h3>
              {loadingStats ? (
                <Skeleton className="h-5 w-full rounded-full" />
              ) : totalEstados > 0 ? (
                <>
                  <div className="h-5 w-full bg-slate-100 rounded-full overflow-hidden flex gap-0.5">
                    {stats?.por_estado?.map((e: any) => {
                      const pct = (e.cantidad / totalEstados) * 100;
                      const color = ESTADO_PASTEL[e.estado]?.bar ?? '#e2e8f0';
                      return (
                        <div
                          key={e.estado}
                          style={{ width: `${pct}%`, backgroundColor: color }}
                          className="h-full first:rounded-l-full last:rounded-r-full transition-all"
                          title={`${ESTADO_PASTEL[e.estado]?.label ?? e.estado}: ${e.cantidad}`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-3 mt-3">
                    {stats?.por_estado?.map((e: any) => {
                      const color = ESTADO_PASTEL[e.estado]?.bar ?? '#e2e8f0';
                      const label = ESTADO_PASTEL[e.estado]?.label ?? e.estado;
                      return (
                        <div key={e.estado} className="flex items-center gap-1.5">
                          <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-xs text-muted-foreground">{label}</span>
                          <span className="text-xs font-bold text-foreground">{e.cantidad}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-400">Sin datos</p>
              )}
            </div>

            {/* Motivos de contacto — ranking list con mini barras pastel */}
            <div className="pt-4 border-t">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Motivos de Contacto</h3>
              {loadingMotivos ? (
                <div className="space-y-3">
                  {[1,2,3,4].map(i => <Skeleton key={i} className="h-7 w-full" />)}
                </div>
              ) : motivosSorted.length === 0 ? (
                <p className="text-sm text-slate-400">Sin datos</p>
              ) : (
                <div className="space-y-2.5">
                  {motivosSorted.map((m: any, idx: number) => {
                    const pct = (m.cantidad / maxMotivo) * 100;
                    const color = MOTIVO_PASTEL[idx % MOTIVO_PASTEL.length];
                    return (
                      <div key={m.motivo} className="flex items-center gap-3">
                        <span className="text-[11px] font-bold text-muted-foreground w-4 text-right flex-shrink-0">{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-foreground font-medium truncate pr-2">{m.motivo}</span>
                            <span className="text-xs font-bold text-foreground flex-shrink-0">{m.cantidad}</span>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${pct}%`, backgroundColor: color }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Tickets vencidos */}
          <div className="bg-card border border-red-100 rounded-xl shadow-sm overflow-hidden">
            <div className="bg-red-50 px-5 py-3 border-b border-red-100 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-red-800 flex items-center gap-2 uppercase tracking-wider">
                <Clock className="h-3.5 w-3.5" />
                Requieren Atención Inmediata
              </h3>
              {vencidos && vencidos.length > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  {vencidos.length} vencidos
                </span>
              )}
            </div>
            {loadingVencidos ? (
              <div className="p-4 space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : (!vencidos || vencidos.length === 0) ? (
              <div className="p-8 text-center flex flex-col items-center gap-2">
                <CheckCircle2 className="h-7 w-7 text-emerald-300" />
                <p className="text-sm text-slate-400">Todos los tickets están al día</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-[11px] uppercase text-muted-foreground bg-slate-50/60">
                    <tr>
                      <th className="px-5 py-2 font-medium">Contacto</th>
                      <th className="px-5 py-2 font-medium">Motivo</th>
                      <th className="px-5 py-2 font-medium">Prioridad</th>
                      <th className="px-5 py-2 font-medium text-right">Venció hace</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {vencidos.map((ticket: any) => {
                      const limitDate = new Date(ticket.fecha_limite);
                      const diffHours = Math.floor((today.getTime() - limitDate.getTime()) / (1000 * 60 * 60));
                      const vencioStr = diffHours > 24 ? `${Math.floor(diffHours / 24)}d` : `${diffHours}h`;
                      return (
                        <tr key={ticket.id} className="hover:bg-red-50/30 cursor-pointer transition-colors" onClick={() => window.location.href = `/tickets/${ticket.id}`}>
                          <td className="px-5 py-2.5">
                            <p className="font-medium text-foreground text-sm">{ticket.nombre} {ticket.apellido}</p>
                            {ticket.empresa && <p className="text-[11px] text-slate-400">{ticket.empresa}</p>}
                          </td>
                          <td className="px-5 py-2.5 text-slate-600 text-sm truncate max-w-[180px]" title={ticket.motivo}>{ticket.motivo}</td>
                          <td className="px-5 py-2.5"><PrioridadBadge prioridad={ticket.prioridad} /></td>
                          <td className="px-5 py-2.5 text-right font-bold text-red-600 text-xs">{vencioStr}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right 1/3 — actividad reciente */}
        <div className="lg:col-span-1">
          <div className="bg-card border rounded-xl shadow-sm flex flex-col h-full">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actividad Reciente</h3>
              <span className="text-[10px] text-muted-foreground bg-slate-100 px-2 py-0.5 rounded-full">en vivo</span>
            </div>
            <div className="p-5 flex-1 overflow-y-auto">
              {loadingActividad ? (
                <div className="space-y-5">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="flex gap-3">
                      <Skeleton className="h-5 w-5 rounded-full flex-shrink-0" />
                      <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-2 w-20" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (!actividades || actividades.length === 0) ? (
                <p className="text-sm text-slate-400 text-center py-8">Sin actividad reciente</p>
              ) : (
                <div className="space-y-4">
                  {actividades.map((a: any, idx: number) => {
                    const isNew = a.tipo === 'ticket_creado';
                    return (
                      <div key={idx} className="relative pl-5">
                        {idx !== actividades.length - 1 && (
                          <div className="absolute left-[7px] top-4 bottom-[-16px] w-px bg-slate-100" />
                        )}
                        <div className={`absolute left-0.5 top-1 h-3 w-3 rounded-full border-2 border-white shadow-sm ${isNew ? 'bg-amber-400' : 'bg-blue-400'}`} />
                        <div>
                          <Link href={`/tickets/${a.ticket_id}`} className="text-xs font-semibold text-foreground hover:text-primary transition-colors">
                            Ticket #{a.ticket_id}
                          </Link>
                          <p className="text-[12px] text-slate-500 mt-0.5 leading-snug">{a.descripcion}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] text-slate-400">{formatDate(a.fecha)}</span>
                            {a.nombre_contacto && (
                              <>
                                <span className="text-slate-300">·</span>
                                <span className="text-[10px] text-slate-400 truncate max-w-[120px]">{a.nombre_contacto}</span>
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
