import { useMemo, useState } from "react";
import {
  getGetRendimientoResumenEquipoQueryKey,
  useGetRendimientoResumenEquipo,
} from "@workspace/api-client-react";
import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingStatus } from "@/components/ui/loading-status";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserErrorMessage } from "@/lib/error-messages";
import {
  RENDIMIENTO_PERIODO_LABELS,
  type RendimientoUrlState,
} from "@/features/rendimiento/rendimiento-url";
import { buildRendimientoParams } from "./rendimiento-query";
import { RendimientoRefreshStatus } from "./RendimientoRefreshStatus";
import { ResumenEquipoPanel } from "./ResumenEquipoPanel";

interface ResumenEquipoViewProps {
  filters: RendimientoUrlState;
  onClearFilters: () => void;
}

export function ResumenEquipoLoadingState() {
  return (
    <section
      className="space-y-4"
      aria-label="Cargando resumen del equipo"
      aria-busy="true"
    >
      <LoadingStatus>Cargando resumen del equipo</LoadingStatus>
      <Skeleton className="h-36 w-full rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-xl" />
        ))}
      </div>
      <div className="space-y-3 rounded-xl border p-5 sm:p-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <div className="grid gap-4 pt-2 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-80 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    </section>
  );
}

interface ResumenEquipoErrorStateProps {
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
}

export function ResumenEquipoErrorState({
  message,
  isRetrying,
  onRetry,
}: ResumenEquipoErrorStateProps) {
  return (
    <Alert variant="destructive">
      <TriangleAlert className="h-4 w-4" aria-hidden="true" />
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">
            No pudimos cargar el resumen del equipo
          </p>
          <p className="mt-1">{message}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isRetrying}
          onClick={onRetry}
        >
          {isRetrying ? "Reintentando..." : "Reintentar"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function ResumenEquipoView({
  filters,
  onClearFilters,
}: ResumenEquipoViewProps) {
  const [referenceDate] = useState(() => new Date());
  const params = useMemo(
    () => buildRendimientoParams(filters, referenceDate),
    [filters, referenceDate],
  );
  const query = useGetRendimientoResumenEquipo(params, {
    query: {
      queryKey: getGetRendimientoResumenEquipoQueryKey(params),
      refetchOnWindowFocus: true,
    },
  });
  const errorMessage = getUserErrorMessage(
    query.error,
    "No fue posible obtener las métricas del equipo. Reintentá en unos segundos.",
  );

  if (query.isLoading) return <ResumenEquipoLoadingState />;

  if (query.isError && !query.data) {
    return (
      <ResumenEquipoErrorState
        message={errorMessage}
        isRetrying={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (!query.data) {
    return (
      <ResumenEquipoErrorState
        message="La respuesta no contiene datos utilizables."
        isRetrying={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <div className="space-y-4" aria-busy={query.isFetching}>
      <RendimientoRefreshStatus
        visible={query.isFetching && !query.isRefetchError}
      />
      {query.isRefetchError ? (
        <ResumenEquipoErrorState
          message="Conservamos el último resultado mientras reintentás la actualización."
          isRetrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      <ResumenEquipoPanel
        {...query.data}
        periodFilterLabel={RENDIMIENTO_PERIODO_LABELS[filters.periodo]}
        onClearFilters={onClearFilters}
      />
    </div>
  );
}
