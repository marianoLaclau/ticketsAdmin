import { useMemo, useState } from "react";
import {
  getGetRendimientoReiteracionesQueryKey,
  useGetRendimientoReiteraciones,
} from "@workspace/api-client-react";
import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingStatus } from "@/components/ui/loading-status";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserErrorMessage } from "@/lib/error-messages";
import type { RendimientoUrlState } from "@/lib/rendimiento-url";
import { buildRendimientoParams } from "./rendimiento-query";
import { RendimientoReiteracionesPanel } from "./RendimientoReiteracionesPanel";

interface RendimientoReiteracionesViewProps {
  filters: RendimientoUrlState;
  onClearFilters: () => void;
}

export function RendimientoReiteracionesLoadingState() {
  return (
    <section
      className="space-y-4"
      aria-label="Cargando contactos reiterados"
      aria-busy="true"
    >
      <LoadingStatus>Cargando contactos reiterados</LoadingStatus>
      <Skeleton className="h-52 w-full rounded-xl" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="space-y-4">
        {Array.from({ length: 2 }, (_, index) => (
          <Skeleton key={index} className="h-72 w-full rounded-xl" />
        ))}
      </div>
    </section>
  );
}

interface RendimientoReiteracionesErrorStateProps {
  message: string;
  isRetrying: boolean;
  onRetry: () => void;
}

export function RendimientoReiteracionesErrorState({
  message,
  isRetrying,
  onRetry,
}: RendimientoReiteracionesErrorStateProps) {
  return (
    <Alert variant="destructive">
      <TriangleAlert className="h-4 w-4" aria-hidden="true" />
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">
            No pudimos cargar los contactos reiterados
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

export function RendimientoReiteracionesView({
  filters,
  onClearFilters,
}: RendimientoReiteracionesViewProps) {
  const [referenceDate] = useState(() => new Date());
  const params = useMemo(
    () => buildRendimientoParams(filters, referenceDate),
    [filters, referenceDate],
  );
  const query = useGetRendimientoReiteraciones(params, {
    query: {
      queryKey: getGetRendimientoReiteracionesQueryKey(params),
      refetchOnWindowFocus: true,
    },
  });
  const errorMessage = getUserErrorMessage(
    query.error,
    "No fue posible obtener las coincidencias. Reintentá en unos segundos.",
  );

  if (query.isLoading) return <RendimientoReiteracionesLoadingState />;

  if (query.isError && !query.data) {
    return (
      <RendimientoReiteracionesErrorState
        message={errorMessage}
        isRetrying={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (!query.data) {
    return (
      <RendimientoReiteracionesErrorState
        message="La respuesta no contiene datos utilizables."
        isRetrying={query.isFetching}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <div className="space-y-4" aria-busy={query.isFetching}>
      {query.isRefetchError ? (
        <RendimientoReiteracionesErrorState
          message="Conservamos el último resultado mientras reintentás la actualización."
          isRetrying={query.isFetching}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      <RendimientoReiteracionesPanel
        data={query.data}
        onClearFilters={onClearFilters}
      />
    </div>
  );
}
