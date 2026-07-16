import React, { useMemo } from 'react';
import { 
  useGetDashboardStats, 
  useGetActividadReciente, 
  useGetTicketsVencidos, 
  useGetMotivoStats 
} from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Ticket, Clock, CheckCircle2, AlertCircle, Activity, BarChart3, Users, Building } from 'lucide-react';
import { Link } from 'wouter';
import { formatShortId, formatDate, getEstadoColor, getPrioridadColor, EstadoBadge, PrioridadBadge } from '@/lib/utils-tickets';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';

export default function Dashboard() {
  const { data: stats, isLoading: loadingStats } = useGetDashboardStats();
  const { data: actividades, isLoading: loadingActividad } = useGetActividadReciente({ limit: 10 });
  const { data: vencidos, isLoading: loadingVencidos } = useGetTicketsVencidos();
  const { data: motivos, isLoading: loadingMotivos } = useGetMotivoStats();

  // Recharts styling
  const primaryColor = 'hsl(var(--primary))';
  const secondaryColor = 'hsl(var(--accent))';

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Centro de control de operaciones GSB.</p>
        </div>
        <Link 
          href="/tickets/nuevo" 
          className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-10 px-4 py-2"
          data-testid="btn-nuevo-ticket"
        >
          Nuevo Ticket
        </Link>
      </div>

      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Total Tickets" 
          value={stats?.total} 
          icon={Ticket} 
          loading={loadingStats} 
          description="En todo el sistema" 
        />
        <StatCard 
          title="Nuevos Hoy" 
          value={stats?.nuevos_hoy} 
          icon={Activity} 
          loading={loadingStats} 
          description="Tickets creados hoy" 
        />
        <StatCard 
          title="Resueltos Hoy" 
          value={stats?.resueltos_hoy} 
          icon={CheckCircle2} 
          loading={loadingStats} 
          description="Tickets completados" 
          valueClass="text-green-600"
        />
        <StatCard 
          title="Vencidos" 
          value={stats?.vencidos} 
          icon={AlertCircle} 
          loading={loadingStats} 
          description="Requieren atención" 
          valueClass={stats?.vencidos && stats.vencidos > 0 ? "text-red-600" : ""}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Main Charts & Data */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Charts Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {/* Estado Breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-slate-500" />
                  Por Estado
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingStats ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-8 w-full" />)}
                  </div>
                ) : (
                  <div className="space-y-3 mt-2">
                    {stats?.por_estado.map((item: any) => (
                      <div key={item.estado} className="flex items-center justify-between">
                        <EstadoBadge estado={item.estado} />
                        <span className="font-semibold">{item.cantidad}</span>
                      </div>
                    ))}
                    {(!stats?.por_estado || stats.por_estado.length === 0) && (
                      <div className="text-sm text-slate-500 text-center py-4">Sin datos</div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Prioridad Breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-slate-500" />
                  Por Prioridad
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingStats ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-8 w-full" />)}
                  </div>
                ) : (
                  <div className="space-y-3 mt-2">
                    {stats?.por_prioridad.map((item: any) => (
                      <div key={item.prioridad} className="flex items-center justify-between">
                        <PrioridadBadge prioridad={item.prioridad} />
                        <span className="font-semibold">{item.cantidad}</span>
                      </div>
                    ))}
                    {(!stats?.por_prioridad || stats.por_prioridad.length === 0) && (
                      <div className="text-sm text-slate-500 text-center py-4">Sin datos</div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Motivos Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Análisis de Motivos</CardTitle>
              <CardDescription>Distribución de tickets por motivo de contacto</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingMotivos ? (
                <Skeleton className="h-[300px] w-full" />
              ) : (!motivos || motivos.length === 0) ? (
                 <div className="h-[300px] flex items-center justify-center text-slate-500 border border-dashed rounded-md bg-slate-50">
                    No hay datos suficientes para el gráfico
                 </div>
              ) : (
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={motivos} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <XAxis type="number" hide />
                      <YAxis dataKey="motivo" type="category" width={150} tick={{fontSize: 12, fill: '#64748b'}} />
                      <Tooltip 
                        cursor={{fill: '#f1f5f9'}} 
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="cantidad" radius={[0, 4, 4, 0]}>
                        {motivos.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={index === 0 ? primaryColor : 'hsl(var(--primary) / 0.7)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Vencidos List */}
          <Card className="border-red-200">
            <CardHeader className="bg-red-50/50 pb-4 border-b border-red-100">
              <CardTitle className="text-base font-semibold text-red-700 flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Tickets Vencidos
                {vencidos && vencidos.length > 0 && (
                  <span className="ml-2 bg-red-100 text-red-700 text-xs py-0.5 px-2 rounded-full font-bold">
                    {vencidos.length}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingVencidos ? (
                <div className="p-4 space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (!vencidos || vencidos.length === 0) ? (
                <div className="p-8 text-center text-slate-500">
                  <CheckCircle2 className="h-8 w-8 mx-auto text-green-500 mb-2 opacity-50" />
                  <p>No hay tickets vencidos</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
                  {vencidos.map((ticket: any) => (
                    <Link 
                      key={ticket.id} 
                      href={`/tickets/${ticket.id}`}
                      className="block p-4 hover:bg-slate-50 transition-colors"
                      data-testid={`link-vencido-${ticket.id}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div className="font-medium text-slate-900 line-clamp-1">{ticket.motivo}</div>
                        <div className="text-xs font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                          {formatShortId(ticket.conversation_id)}
                        </div>
                      </div>
                      <div className="flex items-center text-sm text-slate-500 gap-3 mb-2">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3"/> {ticket.nombre} {ticket.apellido}</span>
                        {ticket.empresa && <span className="flex items-center gap-1"><Building className="h-3 w-3"/> {ticket.empresa}</span>}
                      </div>
                      <div className="flex justify-between items-center mt-3">
                        <div className="flex gap-2">
                          <EstadoBadge estado={ticket.estado} />
                          <PrioridadBadge prioridad={ticket.prioridad} />
                        </div>
                        <div className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded border border-red-100 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Venció: {formatDate(ticket.fecha_limite)}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Activity Feed */}
        <div className="lg:col-span-1">
          <Card className="h-full flex flex-col">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-slate-500" />
                Actividad Reciente
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto pr-2">
              {loadingActividad ? (
                <div className="space-y-6">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex gap-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (!actividades || actividades.length === 0) ? (
                <div className="text-center text-slate-500 py-8">
                  No hay actividad reciente
                </div>
              ) : (
                <div className="space-y-6">
                  {actividades.map((actividad: any, idx: number) => (
                    <div key={idx} className="relative pl-6">
                      {idx !== actividades.length - 1 && (
                        <div className="absolute left-[11px] top-6 bottom-[-24px] w-[2px] bg-slate-100" />
                      )}
                      <div className="absolute left-0 top-1 h-6 w-6 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center">
                        <div className="h-2 w-2 rounded-full bg-slate-400" />
                      </div>
                      
                      <div className="text-sm">
                        <Link href={`/tickets/${actividad.ticket_id}`} className="font-medium text-slate-900 hover:text-primary transition-colors">
                          Ticket #{actividad.ticket_id}
                        </Link>
                        <p className="text-slate-600 mt-0.5">{actividad.descripcion}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-slate-400">{formatDate(actividad.fecha)}</span>
                          {actividad.nombre_contacto && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="text-xs text-slate-500">{actividad.nombre_contacto}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ 
  title, 
  value, 
  icon: Icon, 
  loading, 
  description,
  valueClass = ""
}: { 
  title: string; 
  value?: number | string | null; 
  icon: React.ElementType; 
  loading: boolean;
  description?: string;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between space-y-0 pb-2">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <Icon className="h-4 w-4 text-slate-400" />
        </div>
        <div className="mt-2">
          {loading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <div className={`text-3xl font-bold ${valueClass}`}>
              {value ?? 0}
            </div>
          )}
          {description && (
            <p className="text-xs text-slate-500 mt-1">{description}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}