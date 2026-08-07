import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "wouter";
import {
  ADMIN_TICKETS_TABS,
  parseAdminTicketsUrlState,
  serializeAdminTicketsUrlState,
  type AdminTicketsTabValue,
  type AdminTicketsUrlState,
} from "@/lib/admin-tickets-url";

export type AdminTicketsUrlUpdate = (
  current: AdminTicketsUrlState,
) => AdminTicketsUrlState;

export type AdminTicketsUrlNavigation = "replace" | "push";

interface AdminTicketsUrlController {
  urlState: AdminTicketsUrlState;
  updateUrlState: (
    update: AdminTicketsUrlUpdate,
    navigation?: AdminTicketsUrlNavigation,
  ) => void;
  selectTab: (value: string) => void;
}

function parseAdminTicketsTab(value: string): AdminTicketsTabValue | undefined {
  return ADMIN_TICKETS_TABS.find((tab) => tab === value);
}

export function useAdminTicketsUrl(): AdminTicketsUrlController {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlState = useMemo(
    () => parseAdminTicketsUrlState(searchParams),
    [searchParams],
  );
  const currentSearch = searchParams.toString();
  const canonicalSearch = useMemo(
    () => serializeAdminTicketsUrlState(urlState).toString(),
    [urlState],
  );

  useEffect(() => {
    if (currentSearch !== canonicalSearch) {
      setSearchParams(canonicalSearch, { replace: true });
    }
  }, [canonicalSearch, currentSearch, setSearchParams]);

  const updateUrlState = useCallback(
    (
      update: AdminTicketsUrlUpdate,
      navigation: AdminTicketsUrlNavigation = "replace",
    ) => {
      setSearchParams(
        (currentParams) =>
          serializeAdminTicketsUrlState(
            update(parseAdminTicketsUrlState(currentParams)),
          ),
        { replace: navigation === "replace" },
      );
    },
    [setSearchParams],
  );

  const selectTab = useCallback(
    (value: string) => {
      const tab = parseAdminTicketsTab(value);
      if (!tab) return;
      updateUrlState((current) => ({ ...current, tab }), "push");
    },
    [updateUrlState],
  );

  return { urlState, updateUrlState, selectTab };
}
