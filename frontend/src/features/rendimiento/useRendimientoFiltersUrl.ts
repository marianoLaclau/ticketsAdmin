import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "wouter";
import {
  parseRendimientoUrlState,
  serializeRendimientoUrlState,
  type RendimientoUrlState,
} from "@/lib/rendimiento-url";

export type RendimientoUrlNavigation = "replace" | "push";
export type RendimientoUrlUpdate = (
  current: RendimientoUrlState,
) => RendimientoUrlState;

interface RendimientoFiltersUrlController {
  urlState: RendimientoUrlState;
  updateUrlState: (
    update: RendimientoUrlUpdate,
    navigation?: RendimientoUrlNavigation,
  ) => void;
}

export function useRendimientoFiltersUrl(): RendimientoFiltersUrlController {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlState = useMemo(
    () => parseRendimientoUrlState(searchParams),
    [searchParams],
  );
  const currentSearch = searchParams.toString();
  const canonicalSearch = useMemo(
    () => serializeRendimientoUrlState(urlState).toString(),
    [urlState],
  );

  useEffect(() => {
    if (currentSearch !== canonicalSearch) {
      setSearchParams(canonicalSearch, { replace: true });
    }
  }, [canonicalSearch, currentSearch, setSearchParams]);

  const updateUrlState = useCallback(
    (
      update: RendimientoUrlUpdate,
      navigation: RendimientoUrlNavigation = "replace",
    ) => {
      setSearchParams(
        (currentParams) =>
          serializeRendimientoUrlState(
            update(parseRendimientoUrlState(currentParams)),
          ),
        { replace: navigation === "replace" },
      );
    },
    [setSearchParams],
  );

  return { urlState, updateUrlState };
}
