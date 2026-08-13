import { useEffect, useMemo, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
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
import { RendimientoRefreshStatus } from "./RendimientoRefreshStatus";
import { RendimientoReiteracionesPanel } from "./RendimientoReiteracionesPanel";

interface RendimientoReiteracionesViewProps {
  filters: RendimientoUrlState;
  onClearFilters: () => void;
}

const REITERACIONES_PAGE_SIZE = 10;

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
  const baseParams = useMemo(
    () => buildRendimientoParams(filters, referenceDate),
    [filters, referenceDate],
  );
  const filterSignature = useMemo(
    () => JSON.stringify(baseParams),
    [baseParams],
  );
  const [pagination, setPagination] = useState(() => ({
    filterSignature,
    page: 1,
  }));
  const page =
    pagination.filterSignature === filterSignature ? pagination.page : 1;
  const params = useMemo(
    () => ({
      ...baseParams,
      pagina: page,
      limite: REITERACIONES_PAGE_SIZE,
    }),
    [baseParams, page],
  );

  useEffect(() => {
    setPagination((current) =>
      current.filterSignature === filterSignature
        ? current
        : { filterSignature, page: 1 },
    );
  }, [filterSignature]);

  const query = useGetRendimientoReiteraciones(params, {
    query: {
      queryKey: getGetRendimientoReiteracionesQueryKey(params),
      refetchOnWindowFocus: true,
      placeholderData: keepPreviousData,
    },
  });
  const errorMessage = getUserErrorMessage(
    query.error,
    "No fue posible obtener las coincidencias. Reintentá en unos segundos.",
  );

  useEffect(() => {
    if (!query.data || query.isPlaceholderData) return;
    const lastAvailablePage = Math.max(1, query.data.total_paginas);
    if (page <= lastAvailablePage) return;
    setPagination({ filterSignature, page: lastAvailablePage });
  }, [filterSignature, page, query.data, query.isPlaceholderData]);

  const goToPage = (nextPage: number) => {
    setPagination({
      filterSignature,
      page: Math.max(1, nextPage),
    });
  };

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
      <RendimientoRefreshStatus
        visible={query.isFetching && !query.isRefetchError}
      />
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
        isPageLoading={query.isFetching}
        onPreviousPage={() => goToPage(page - 1)}
        onNextPage={() => goToPage(page + 1)}
      />
    </div>
  );
}
