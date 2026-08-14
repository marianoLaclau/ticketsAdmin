import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useSearchParams } from "wouter";
import {
  currentMonthToToday,
  getDashboardPeriodParams,
  validateDashboardDateRange,
  type DashboardDateParams,
  type DashboardPeriod,
} from "@/features/dashboard/dashboard-period";
import {
  parseDashboardUrlState,
  serializeDashboardUrlState,
  type DashboardUrlState,
} from "@/features/dashboard/dashboard-url";

interface DashboardPeriodUrlController {
  periodo: DashboardPeriod;
  periodoPersonalizado: DashboardDateParams;
  setPeriodoPersonalizado: Dispatch<SetStateAction<DashboardDateParams>>;
  errorPeriodo: string | null;
  dashboardParams: DashboardDateParams | undefined;
  selectPeriodo: (periodo: DashboardPeriod) => void;
  applyPeriodoPersonalizado: () => void;
}

function getInitialCustomRange(
  state: DashboardUrlState,
  referenceDate: Date,
): DashboardDateParams {
  return state.periodo === "personalizado"
    ? {
        fecha_desde: state.fecha_desde,
        fecha_hasta: state.fecha_hasta,
      }
    : currentMonthToToday(referenceDate);
}

export function useDashboardPeriodUrl(
  referenceDate: Date,
): DashboardPeriodUrlController {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlState = useMemo(
    () => parseDashboardUrlState(searchParams),
    [searchParams],
  );
  const currentSearch = searchParams.toString();
  const canonicalSearch = useMemo(
    () => serializeDashboardUrlState(urlState).toString(),
    [urlState],
  );
  const [periodoPersonalizado, setPeriodoPersonalizado] = useState(() =>
    getInitialCustomRange(urlState, referenceDate),
  );

  useEffect(() => {
    if (currentSearch !== canonicalSearch) {
      setSearchParams(canonicalSearch, { replace: true });
    }
  }, [canonicalSearch, currentSearch, setSearchParams]);

  const appliedFrom =
    urlState.periodo === "personalizado" ? urlState.fecha_desde : undefined;
  const appliedTo =
    urlState.periodo === "personalizado" ? urlState.fecha_hasta : undefined;

  useEffect(() => {
    if (!appliedFrom || !appliedTo) return;

    setPeriodoPersonalizado((current) =>
      current.fecha_desde === appliedFrom && current.fecha_hasta === appliedTo
        ? current
        : { fecha_desde: appliedFrom, fecha_hasta: appliedTo },
    );
  }, [appliedFrom, appliedTo]);

  const writeUrlState = useCallback(
    (state: DashboardUrlState) => {
      setSearchParams(serializeDashboardUrlState(state), { replace: true });
    },
    [setSearchParams],
  );

  const errorPeriodo = validateDashboardDateRange(
    periodoPersonalizado.fecha_desde,
    periodoPersonalizado.fecha_hasta,
  );

  const selectPeriodo = useCallback(
    (periodo: DashboardPeriod) => {
      if (periodo !== "personalizado") {
        writeUrlState({ periodo });
        return;
      }

      const nextRange = errorPeriodo
        ? currentMonthToToday(referenceDate)
        : periodoPersonalizado;
      if (errorPeriodo) setPeriodoPersonalizado(nextRange);
      writeUrlState({ periodo, ...nextRange });
    },
    [errorPeriodo, periodoPersonalizado, referenceDate, writeUrlState],
  );

  const applyPeriodoPersonalizado = useCallback(() => {
    if (errorPeriodo) return;
    writeUrlState({
      periodo: "personalizado",
      ...periodoPersonalizado,
    });
  }, [errorPeriodo, periodoPersonalizado, writeUrlState]);

  const dashboardParams = useMemo(
    () =>
      urlState.periodo === "personalizado"
        ? {
            fecha_desde: urlState.fecha_desde,
            fecha_hasta: urlState.fecha_hasta,
          }
        : getDashboardPeriodParams(urlState.periodo, referenceDate),
    [referenceDate, urlState],
  );

  return {
    periodo: urlState.periodo,
    periodoPersonalizado,
    setPeriodoPersonalizado,
    errorPeriodo,
    dashboardParams,
    selectPeriodo,
    applyPeriodoPersonalizado,
  };
}
