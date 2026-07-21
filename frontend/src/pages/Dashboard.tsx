import React, { useEffect, useMemo, useState } from 'react';
import { 
  useGetDashboardStats, 
  useGetActividadReciente, 
  useGetTicketsVencidos, 
  useGetMotivoStats 
} from '@workspace/api-client-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Clock, PhoneIncoming, AlertCircle, CheckCircle2, Inbox, TrendingUp, CalendarRange } from 'lucide-react';
import { Link } from 'wouter';
import { formatDate, PrioridadBadge } from '@/lib/utils-tickets';
import { getEstadoLabel } from '@/lib/estados';
import { getContactDisplayName, SIN_NOMBRE_PROPORCIONADO } from '@/lib/contacto';
import { getMotivoCategoriaConfig } from '@/lib/motivos';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ErrorPage, getErrorStatus } from '@/components/ErrorPage';
import {
  currentMonthToToday,
  getDashboardPeriodLabel,
  getDashboardPeriodParams,
  getDashboardRangeLabel,
  validateDashboardDateRange,
  type DashboardPeriod,
} from '@/lib/dashboard-period';

// Estado colors — coherent with badge system
const ESTADO_COLOR: Record<string, { bar: string; label: string; text: string }> = {
  nuevo:      { bar: '#64748b', label: 'Nuevo',      text: 'text-slate-600' },
  en_proceso: { bar: '#3b82f6', label: 'En proceso', text: 'text-blue-600' },
  pendiente:  { bar: '#f59e0b', label: getEstadoLabel('pendiente'), text: 'text-amber-600' },
  resuelto:   { bar: '#3d7532', label: 'Resuelto',   text: 'text-green-700' },
  cerrado:    { bar: '#1e293b', label: 'Cerrado',    text: 'text-slate-800' },
};

// Prioridad bar colors
const PRIORIDAD_COLOR: Record<string, string> = {
  urgente: '#ef4444',
  alta:    '#f97316',
  media:   '#3b82f6',
  baja:    '#22c55e',
};
const PRIORIDAD_LABEL: Record<string, string> = {
  urgente: 'Urgente',
  alta:    'Alta',
  media:   'Media',
  baja:    'Baja',
};

// Circular progress SVG component
function GaugeRing({ pct, size = 120, stroke = 10, color = '#3d7532' }: {
  pct: number; size?: number; stroke?: number; color?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const filled = circ * Math.min(pct / 100, 1);
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
    </svg>
  );
}

export default function Dashboard() {
  const [periodo, setPeriodo] = useState<DashboardPeriod>('todo');
  const [fechaReferencia, setFechaReferencia] = useState(() => new Date());
  const [periodoPersonalizado, setPeriodoPersonalizado] = useState(() => currentMonthToToday());
  const [periodoAplicado, setPeriodoAplicado] = useState(() => currentMonthToToday());
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = new Date();
      setFechaReferencia((actual) =>
        actual.getFullYear() === now.getFullYear() &&
        actual.getMonth() === now.getMonth() &&
        actual.getDate() === now.getDate()
          ? actual
          : now,
      );
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);
  const errorPeriodo = validateDashboardDateRange(
    periodoPersonalizado.fecha_desde,
    periodoPersonalizado.fecha_hasta,
  );
  const dashboardParams = useMemo(
    () =>
      periodo === 'personalizado'
        ? periodoAplicado
        : getDashboardPeriodParams(periodo, fechaReferencia),
    [periodo, periodoAplicado, fechaReferencia],
  );

  const statsQuery = useGetDashboardStats(dashboardParams);
  const actividadQuery = useGetActividadReciente({ limit: 12, ...dashboardParams });
  const vencidosQuery = useGetTicketsVencidos(dashboardParams);
  const motivosQuery = useGetMotivoStats(dashboardParams);

  const { data: stats, isLoading: loadingStats } = statsQuery;
  const { data: actividades, isLoading: loadingActividad } = actividadQuery;
  const { data: vencidos, isLoading: loadingVencidos } = vencidosQuery;
  const { data: motivos, isLoading: loadingMotivos } = motivosQuery;

  const dashboardError =
    statsQuery.error ?? actividadQuery.error ?? vencidosQuery.error ?? motivosQuery.error;
  const dashboardIsError =
    statsQuery.isError || actividadQuery.isError || vencidosQuery.isError || motivosQuery.isError;
  const dashboardIsFetching =
    statsQuery.isFetching || actividadQuery.isFetching || vencidosQuery.isFetching || motivosQuery.isFetching;

  if (dashboardIsError) {
    return (
      <ErrorPage
        status={getErrorStatus(dashboardError) ?? 503}
        title="No pudimos cargar el dashboard"
        message="Una o más secciones no pudieron obtener sus datos. Reintentá para volver a cargar el panel."
        onRetry={() => {
          void statsQuery.refetch();
          void actividadQuery.refetch();
          void vencidosQuery.refetch();
          void motivosQuery.refetch();
        }}
        isRetrying={dashboardIsFetching}
      />
    );
  }

  const today = new Date();
  const dateString = today.toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const periodoLabel = getDashboardPeriodLabel(periodo);
  const resueltosDelPeriodo =
    periodo === 'todo' ? stats?.resueltos_hoy : stats?.resueltos_periodo;

  // Estado derived values
  const totalEstados = stats?.por_estado?.reduce((acc: number, curr: any) => acc + curr.cantidad, 0) || 0;
  const nuevosSinRevisar = stats?.por_estado?.find((e: any) => e.estado === 'nuevo')?.cantidad || 0;
  const enProceso       = stats?.por_estado?.find((e: any) => e.estado === 'en_proceso')?.cantidad || 0;
  const resueltos       = stats?.por_estado?.find((e: any) => e.estado === 'resuelto')?.cantidad || 0;
  const cerrados        = stats?.por_estado?.find((e: any) => e.estado === 'cerrado')?.cantidad || 0;
  const pendientes      = stats?.por_estado?.find((e: any) => e.estado === 'pendiente')?.cantidad || 0;
  const total           = stats?.total || 0;

  // Rendimiento metrics
  const finalizados   = resueltos + cerrados;
  const tasaResolucion = total > 0 ? Math.round((finalizados / total) * 100) : 0;
  const activos        = enProceso + pendientes + nuevosSinRevisar;

  // Motivos
  const motivosSorted = (motivos ?? [])
    .map((item) => {
      // Compatibilidad temporal con respuestas anteriores que agrupaban por
      // `motivo`. El contrato nuevo expone el código estable en `categoria`.
      const stat = item as typeof item & {
        categoria?: string;
        motivo_categoria?: string;
        motivo?: string;
      };
      const categoria = stat.categoria ?? stat.motivo_categoria ?? stat.motivo ?? 'sin_clasificar';
      return {
        categoria,
        cantidad: stat.cantidad,
        config: getMotivoCategoriaConfig(categoria),
      };
    })
    .sort((a, b) => b.cantidad - a.cantidad);
  const maxMotivo = motivosSorted[0]?.cantidad || 1;

  // Prioridad — reshape for recharts
  const prioridadData = (stats?.por_prioridad ?? []).map((p: any) => ({
    name: PRIORIDAD_LABEL[p.prioridad] ?? p.prioridad,
    cantidad: p.cantidad,
    color: PRIORIDAD_COLOR[p.prioridad] ?? '#94a3b8',
  }));

  return (
    <div className="p-6 max-w-[1400px] mx-auto w-full space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Sistema de Tickets</h1>
          <p className="text-sm text-muted-foreground capitalize">{dateString}</p>
        </div>

        <div className="w-full rounded-xl border bg-card p-3 shadow-sm xl:w-auto">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-[220px] space-y-1.5">
              <Label htmlFor="dashboard-periodo" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarRange className="h-3.5 w-3.5" />
                Datos a visualizar
              </Label>
              <Select
                value={periodo}
                onValueChange={(value) => setPeriodo(value as DashboardPeriod)}
              >
                <SelectTrigger id="dashboard-periodo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">Todo</SelectItem>
                  <SelectItem value="semana">Semana actual</SelectItem>
                  <SelectItem value="mes">Mes actual</SelectItem>
                  <SelectItem value="personalizado">Período personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {periodo === 'personalizado' && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="dashboard-desde" className="text-xs text-muted-foreground">Desde</Label>
                  <Input
                    id="dashboard-desde"
                    type="date"
                    value={periodoPersonalizado.fecha_desde}
                    onChange={(event) =>
                      setPeriodoPersonalizado((actual) => ({
                        ...actual,
                        fecha_desde: event.target.value,
                      }))
                    }
                    className="w-full sm:w-[155px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dashboard-hasta" className="text-xs text-muted-foreground">Hasta</Label>
                  <Input
                    id="dashboard-hasta"
                    type="date"
                    value={periodoPersonalizado.fecha_hasta}
                    onChange={(event) =>
                      setPeriodoPersonalizado((actual) => ({
                        ...actual,
                        fecha_hasta: event.target.value,
                      }))
                    }
                    className="w-full sm:w-[155px]"
                  />
                </div>
                <Button
                  type="button"
                  size="sm"
                  disabled={Boolean(errorPeriodo)}
                  onClick={() => setPeriodoAplicado({ ...periodoPersonalizado })}
                >
                  Aplicar
                </Button>
              </>
            )}
          </div>
          {periodo === 'personalizado' && errorPeriodo && (
            <p className="mt-2 text-xs text-red-600" role="alert">{errorPeriodo}</p>
          )}
          {dashboardParams && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Período aplicado: {getDashboardRangeLabel(dashboardParams)}
            </p>
          )}
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-center gap-4 shadow-sm">
          <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Inbox className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Sin revisar</p>
            {loadingStats ? <Skeleton className="h-8 w-10 mt-1" /> : <p className="text-3xl font-bold text-amber-800 leading-none mt-1">{nuevosSinRevisar}</p>}
            <p className="text-[11px] text-amber-600 mt-0.5">tickets nuevos</p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 flex items-center gap-4 shadow-sm">
          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <PhoneIncoming className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">En proceso</p>
            {loadingStats ? <Skeleton className="h-8 w-10 mt-1" /> : <p className="text-3xl font-bold text-blue-800 leading-none mt-1">{enProceso}</p>}
            <p className="text-[11px] text-blue-600 mt-0.5">en atención</p>
          </div>
        </div>

        <div className={`rounded-xl px-5 py-4 flex items-center gap-4 shadow-sm border ${stats?.vencidos && stats.vencidos > 0 ? 'bg-red-50 border-red-200' : 'bg-card border-border'}`}>
          <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 ${stats?.vencidos && stats.vencidos > 0 ? 'bg-red-100' : 'bg-slate-100'}`}>
            <AlertCircle className={`h-5 w-5 ${stats?.vencidos && stats.vencidos > 0 ? 'text-red-600' : 'text-slate-400'}`} />
          </div>
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-wider ${stats?.vencidos && stats.vencidos > 0 ? 'text-red-700' : 'text-muted-foreground'}`}>Vencidos</p>
            {loadingStats ? <Skeleton className="h-8 w-10 mt-1" /> : <p className={`text-3xl font-bold leading-none mt-1 ${stats?.vencidos && stats.vencidos > 0 ? 'text-red-800' : 'text-foreground'}`}>{stats?.vencidos || 0}</p>}
            <p className={`text-[11px] mt-0.5 ${stats?.vencidos && stats.vencidos > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>fuera de plazo</p>
          </div>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 flex items-center gap-4 shadow-sm">
          <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Resueltos {periodoLabel}</p>
            {loadingStats ? <Skeleton className="h-8 w-10 mt-1" /> : <p className="text-3xl font-bold text-emerald-800 leading-none mt-1">{resueltosDelPeriodo || 0}</p>}
            <p className="text-[11px] text-emerald-600 mt-0.5">cerrados</p>
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2/3 */}
        <div className="lg:col-span-2 space-y-5">

          {/* Distribución + Rendimiento */}
          <div className="bg-card border rounded-xl shadow-sm overflow-hidden">

            {/* Distribución por estado */}
            <div className="p-5 border-b">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Distribución por Estado</h3>
              {loadingStats ? (
                <Skeleton className="h-5 w-full rounded-full" />
              ) : totalEstados > 0 ? (
                <>
                  {/* Segmented bar */}
                  <div className="h-5 w-full bg-slate-100 rounded-full overflow-hidden flex">
                    {stats?.por_estado?.map((e: any, i: number) => {
                      const pct = (e.cantidad / totalEstados) * 100;
                      const color = ESTADO_COLOR[e.estado]?.bar ?? '#94a3b8';
                      return (
                        <div
                          key={e.estado}
                          style={{ width: `${pct}%`, backgroundColor: color }}
                          className={`h-full transition-all ${i === 0 ? '' : 'ml-[2px]'}`}
                          title={`${ESTADO_COLOR[e.estado]?.label ?? e.estado}: ${e.cantidad}`}
                        />
                      );
                    })}
                  </div>
                  {/* Legend */}
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
                    {stats?.por_estado?.map((e: any) => {
                      const cfg = ESTADO_COLOR[e.estado];
                      return (
                        <div key={e.estado} className="flex items-center gap-1.5">
                          <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: cfg?.bar ?? '#94a3b8' }} />
                          <span className="text-xs text-muted-foreground">{cfg?.label ?? e.estado}</span>
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

            {/* Rendimiento */}
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rendimiento</h3>
              </div>

              <div className="flex items-center gap-8">
                {/* Gauge ring */}
                <div className="relative flex-shrink-0">
                  {loadingStats ? (
                    <Skeleton className="h-[120px] w-[120px] rounded-full" />
                  ) : (
                    <>
                      <GaugeRing pct={tasaResolucion} size={120} stroke={11} color="#3d7532" />
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-bold text-foreground">{tasaResolucion}%</span>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">resueltos</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Stats grid */}
                <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Finalizados</p>
                    {loadingStats ? <Skeleton className="h-6 w-12 mt-1" /> : (
                      <p className="text-xl font-bold text-foreground mt-0.5">{finalizados}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">resueltos + cerrados</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Activos</p>
                    {loadingStats ? <Skeleton className="h-6 w-12 mt-1" /> : (
                      <p className="text-xl font-bold text-blue-600 mt-0.5">{activos}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">en curso</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Solo resueltos</p>
                    {loadingStats ? <Skeleton className="h-6 w-12 mt-1" /> : (
                      <p className="text-xl font-bold text-green-700 mt-0.5">{resueltos}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">listos p/ cerrar</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total general</p>
                    {loadingStats ? <Skeleton className="h-6 w-12 mt-1" /> : (
                      <p className="text-xl font-bold text-foreground mt-0.5">{total}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">tickets</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Motivos + Prioridad — split 50/50 */}
          <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
            <div className="grid grid-cols-2 divide-x">

              {/* Left — Motivos ranking */}
              <div className="p-5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Motivos de Contacto</h3>
                {loadingMotivos ? (
                  <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-7 w-full" />)}</div>
                ) : motivosSorted.length === 0 ? (
                  <p className="text-sm text-slate-400">Sin datos</p>
                ) : (
                  <div className="space-y-3">
                    {motivosSorted.map((m, idx) => {
                      const pct = (m.cantidad / maxMotivo) * 100;
                      const color = m.config.color;
                      return (
                        <div key={m.categoria} className="flex items-center gap-3">
                          <span className="text-[11px] font-bold text-muted-foreground w-4 text-right flex-shrink-0 tabular-nums">{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-foreground font-medium truncate pr-2" title={m.config.label}>{m.config.label}</span>
                              <span className="text-xs font-bold tabular-nums" style={{ color }}>{m.cantidad}</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right — Prioridad bar chart */}
              <div className="p-5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Tickets por Prioridad</h3>
                {loadingStats ? (
                  <Skeleton className="h-[180px] w-full" />
                ) : prioridadData.length === 0 ? (
                  <p className="text-sm text-slate-400">Sin datos</p>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={prioridadData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }} barSize={32}>
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: '#f1f5f9' }}
                        contentStyle={{ borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
                        formatter={(v: any) => [v, 'tickets']}
                      />
                      <Bar dataKey="cantidad" radius={[4, 4, 0, 0]}>
                        {prioridadData.map((entry: any, i: number) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}

                {/* Mini legend */}
                {!loadingStats && prioridadData.length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                    {prioridadData.map((p: any) => (
                      <div key={p.name} className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: p.color }} />
                        <span className="text-[11px] text-muted-foreground">{p.name}</span>
                        <span className="text-[11px] font-bold text-foreground">{p.cantidad}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* Tickets vencidos */}
          <div className="bg-card border border-red-100 rounded-xl shadow-sm overflow-hidden">
            <div className="bg-red-50 px-5 py-3 border-b border-red-100 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-red-800 flex items-center gap-2 uppercase tracking-wider">
                <Clock className="h-3.5 w-3.5" />
                Requieren Atención Inmediata
              </h3>
              {stats?.vencidos ? (
                <span className="bg-red-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                  {stats.vencidos} vencidos
                </span>
              ) : null}
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
                            <p className="font-medium text-foreground text-sm">{getContactDisplayName(ticket)}</p>
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
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {periodo === 'todo' ? 'Actividad Reciente' : `Actividad ${periodoLabel}`}
              </h3>
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
                            {a.nombre_contacto?.trim() || SIN_NOMBRE_PROPORCIONADO}
                          </Link>
                          <p className="text-[12px] text-slate-500 mt-0.5 leading-snug">{a.descripcion}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] text-slate-400">{formatDate(a.fecha)}</span>
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
