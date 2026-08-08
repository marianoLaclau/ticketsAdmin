import React, { useEffect, useRef, useState } from "react";
import {
  getGetDashboardStatsQueryKey,
  getGetTicketsVencidosQueryKey,
  useGetDashboardStats,
  useGetActividadReciente,
  useGetTicketsVencidos,
  useGetMotivoStats,
} from "@workspace/api-client-react";
import { LoadingStatus } from "@/components/ui/loading-status";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarRange, TriangleAlert } from "lucide-react";
import { DashboardKpiGrid } from "@/features/dashboard/DashboardKpiGrid";
import { DashboardMotivesPriorityPanel } from "@/features/dashboard/DashboardMotivesPriorityPanel";
import { DashboardOverdueTicketsPanel } from "@/features/dashboard/DashboardOverdueTicketsPanel";
import { DashboardPerformancePanel } from "@/features/dashboard/DashboardPerformancePanel";
import { DashboardRecentActivityPanel } from "@/features/dashboard/DashboardRecentActivityPanel";
import { DashboardStatusDistribution } from "@/features/dashboard/DashboardStatusDistribution";
import { useDashboardPeriodUrl } from "@/features/dashboard/useDashboardPeriodUrl";
import { ErrorPage, getErrorStatus } from "@/components/ErrorPage";
import {
  DASHBOARD_TIME_ZONE,
  getDashboardBusinessDateKey,
  getDashboardPeriodLabel,
  getDashboardRangeKey,
  getDashboardRangeLabel,
  shouldRefreshDashboardAtBusinessDateChange,
  type DashboardPeriod,
} from "@/lib/dashboard-period";

const DASHBOARD_TEMPORAL_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const DASHBOARD_TEMPORAL_QUERY_POLICY = {
  refetchInterval: DASHBOARD_TEMPORAL_REFRESH_INTERVAL_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
} as const;

export default function Dashboard() {
  const [fechaReferencia, setFechaReferencia] = useState(() => new Date());
  const {
    periodo,
    periodoPersonalizado,
    setPeriodoPersonalizado,
    errorPeriodo,
    dashboardParams,
    selectPeriodo,
    applyPeriodoPersonalizado,
  } = useDashboardPeriodUrl(fechaReferencia);
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = new Date();
      setFechaReferencia((actual) =>
        getDashboardBusinessDateKey(actual) === getDashboardBusinessDateKey(now)
          ? actual
          : now,
      );
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);
  const businessDateKey = getDashboardBusinessDateKey(fechaReferencia);
  const dashboardRangeKey = getDashboardRangeKey(dashboardParams);

  const statsQuery = useGetDashboardStats(dashboardParams, {
    query: {
      queryKey: getGetDashboardStatsQueryKey(dashboardParams),
      ...DASHBOARD_TEMPORAL_QUERY_POLICY,
    },
  });
  const actividadQuery = useGetActividadReciente({
    limit: 12,
    ...dashboardParams,
  });
  const vencidosQuery = useGetTicketsVencidos(dashboardParams, {
    query: {
      queryKey: getGetTicketsVencidosQueryKey(dashboardParams),
      ...DASHBOARD_TEMPORAL_QUERY_POLICY,
    },
  });
  const motivosQuery = useGetMotivoStats(dashboardParams);
  const refetchStats = statsQuery.refetch;
  const refetchVencidos = vencidosQuery.refetch;
  const refreshSnapshot = useRef({
    businessDateKey,
    rangeKey: dashboardRangeKey,
  });

  useEffect(() => {
    const currentSnapshot = {
      businessDateKey,
      rangeKey: dashboardRangeKey,
    };
    const shouldRefresh = shouldRefreshDashboardAtBusinessDateChange(
      refreshSnapshot.current,
      currentSnapshot,
    );
    refreshSnapshot.current = currentSnapshot;

    if (shouldRefresh) {
      void Promise.all([refetchStats(), refetchVencidos()]);
    }
  }, [businessDateKey, dashboardRangeKey, refetchStats, refetchVencidos]);

  const { data: stats, isLoading: loadingStats } = statsQuery;
  const { data: actividades, isLoading: loadingActividad } = actividadQuery;
  const { data: vencidos, isLoading: loadingVencidos } = vencidosQuery;
  const { data: motivos, isLoading: loadingMotivos } = motivosQuery;

  const dashboardInitialError =
    (statsQuery.isLoadingError ? statsQuery.error : undefined) ??
    (actividadQuery.isLoadingError ? actividadQuery.error : undefined) ??
    (vencidosQuery.isLoadingError ? vencidosQuery.error : undefined) ??
    (motivosQuery.isLoadingError ? motivosQuery.error : undefined);
  const dashboardHasRefreshError =
    statsQuery.isRefetchError ||
    actividadQuery.isRefetchError ||
    vencidosQuery.isRefetchError ||
    motivosQuery.isRefetchError;
  const dashboardIsFetching =
    statsQuery.isFetching ||
    actividadQuery.isFetching ||
    vencidosQuery.isFetching ||
    motivosQuery.isFetching;
  const dashboardIsLoading =
    loadingStats || loadingActividad || loadingVencidos || loadingMotivos;

  const refetchDashboard = () => {
    void Promise.all([
      statsQuery.refetch(),
      actividadQuery.refetch(),
      vencidosQuery.refetch(),
      motivosQuery.refetch(),
    ]);
  };

  if (dashboardInitialError) {
    return (
      <ErrorPage
        embedded
        status={getErrorStatus(dashboardInitialError) ?? 503}
        title="No pudimos cargar el dashboard"
        message="Una o más secciones no pudieron obtener sus datos. Reintentá para volver a cargar el panel."
        onRetry={refetchDashboard}
        isRetrying={dashboardIsFetching}
      />
    );
  }

  const today = new Date();
  const dateString = today.toLocaleDateString("es-AR", {
    timeZone: DASHBOARD_TIME_ZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const periodoLabel = getDashboardPeriodLabel(periodo);
  const appliedPeriodLabel = dashboardParams
    ? getDashboardRangeLabel(dashboardParams)
    : "Todo el historial";
  const handlePeriodSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (periodo === "personalizado" && !errorPeriodo) {
      applyPeriodoPersonalizado();
    }
  };
  const resueltosDelPeriodo =
    periodo === "todo" ? stats?.resueltos_hoy : stats?.resueltos_periodo;

  // Estado derived values
  const nuevosSinRevisar =
    stats?.por_estado?.find((e) => e.estado === "nuevo")?.cantidad || 0;
  const enProceso =
    stats?.por_estado?.find((e) => e.estado === "en_proceso")?.cantidad || 0;
  const resueltos =
    stats?.por_estado?.find((e) => e.estado === "resuelto")?.cantidad || 0;
  const cerrados =
    stats?.por_estado?.find((e) => e.estado === "cerrado")?.cantidad || 0;
  const pendientes =
    stats?.por_estado?.find((e) => e.estado === "pendiente")?.cantidad || 0;
  const total = stats?.total || 0;

  // Rendimiento metrics
  const finalizados = resueltos + cerrados;
  const tasaResolucion =
    total > 0 ? Math.round((finalizados / total) * 100) : 0;
  const activos = enProceso + pendientes + nuevosSinRevisar;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 p-4 sm:p-6">
      {dashboardIsLoading ? (
        <LoadingStatus>Cargando dashboard</LoadingStatus>
      ) : null}
      {dashboardHasRefreshError ? (
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" />
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              No pudimos actualizar todos los datos. Conservamos la última
              información disponible.
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={dashboardIsFetching}
              onClick={refetchDashboard}
            >
              {dashboardIsFetching ? "Actualizando..." : "Reintentar"}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {/* Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Sistema de Tickets
          </h1>
          <p className="text-sm text-muted-foreground capitalize">
            {dateString}
          </p>
        </div>

        <form
          className="w-full rounded-xl border bg-card p-3 shadow-sm xl:w-auto"
          onSubmit={handlePeriodSubmit}
        >
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="sr-only">
              Filtrar los datos del dashboard por período
            </legend>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-[220px] space-y-1.5">
                <Label
                  htmlFor="dashboard-periodo"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <CalendarRange className="h-3.5 w-3.5" />
                  Datos a visualizar
                </Label>
                <Select
                  value={periodo}
                  onValueChange={(value) =>
                    selectPeriodo(value as DashboardPeriod)
                  }
                >
                  <SelectTrigger id="dashboard-periodo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">Todo</SelectItem>
                    <SelectItem value="semana">Semana actual</SelectItem>
                    <SelectItem value="mes">Mes actual</SelectItem>
                    <SelectItem value="personalizado">
                      Período personalizado
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {periodo === "personalizado" && (
                <>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="dashboard-desde"
                      className="text-xs text-muted-foreground"
                    >
                      Desde
                    </Label>
                    <Input
                      id="dashboard-desde"
                      type="date"
                      aria-invalid={errorPeriodo ? true : undefined}
                      aria-describedby={
                        errorPeriodo ? "dashboard-periodo-error" : undefined
                      }
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
                    <Label
                      htmlFor="dashboard-hasta"
                      className="text-xs text-muted-foreground"
                    >
                      Hasta
                    </Label>
                    <Input
                      id="dashboard-hasta"
                      type="date"
                      aria-invalid={errorPeriodo ? true : undefined}
                      aria-describedby={
                        errorPeriodo ? "dashboard-periodo-error" : undefined
                      }
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
                    type="submit"
                    size="sm"
                    disabled={Boolean(errorPeriodo)}
                  >
                    Aplicar
                  </Button>
                </>
              )}
            </div>
            {periodo === "personalizado" && errorPeriodo && (
              <p
                id="dashboard-periodo-error"
                className="mt-2 text-xs text-red-600"
                role="alert"
              >
                {errorPeriodo}
              </p>
            )}
            <p
              className="mt-2 text-[11px] text-muted-foreground"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              Período aplicado: {appliedPeriodLabel}
            </p>
          </fieldset>
        </form>
      </div>

      <DashboardKpiGrid
        isLoading={loadingStats}
        unreviewedCount={nuevosSinRevisar}
        inProgressCount={enProceso}
        overdueCount={stats?.vencidos || 0}
        resolvedCount={resueltosDelPeriodo || 0}
        resolvedPeriodLabel={periodoLabel}
      />

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2/3 */}
        <div className="lg:col-span-2 space-y-5">
          {/* Distribución + Rendimiento */}
          <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
            <DashboardStatusDistribution
              statuses={stats?.por_estado}
              isLoading={loadingStats}
            />

            <DashboardPerformancePanel
              isLoading={loadingStats}
              resolutionRate={tasaResolucion}
              completedCount={finalizados}
              activeCount={activos}
              resolvedCount={resueltos}
              totalCount={total}
            />
          </div>

          <DashboardMotivesPriorityPanel
            motives={motivos}
            priorities={stats?.por_prioridad}
            isMotivesLoading={loadingMotivos}
            isPrioritiesLoading={loadingStats}
          />

          <DashboardOverdueTicketsPanel
            tickets={vencidos}
            overdueCount={stats?.vencidos ?? 0}
            isLoading={loadingVencidos}
            referenceTimeMs={today.getTime()}
          />
        </div>

        <DashboardRecentActivityPanel
          activities={actividades}
          isLoading={loadingActividad}
          title={
            periodo === "todo"
              ? "Actividad Reciente"
              : `Actividad ${periodoLabel}`
          }
        />
      </div>
    </div>
  );
}
