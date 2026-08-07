import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "wouter";
import {
  ADMIN_DIRECTORY_TABS,
  parseAdminDirectoryUrlState,
  serializeAdminDirectoryUrlState,
  type AdminDirectoryTabValue,
  type AdminDirectoryUrlState,
} from "@/lib/admin-directory-url";

interface AdminDirectoryUrlController {
  urlState: AdminDirectoryUrlState;
  updateUrlState: (
    update: AdminDirectoryUrlUpdate,
    navigation?: AdminDirectoryUrlNavigation,
  ) => void;
  selectTab: (value: string) => void;
}

export type AdminDirectoryUrlUpdate = (
  current: AdminDirectoryUrlState,
) => AdminDirectoryUrlState;

export type AdminDirectoryUrlNavigation = "replace" | "push";

function parseAdminDirectoryTab(
  value: string,
): AdminDirectoryTabValue | undefined {
  return ADMIN_DIRECTORY_TABS.find((tab) => tab === value);
}

export function useAdminDirectoryUrl(): AdminDirectoryUrlController {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlState = useMemo(
    () => parseAdminDirectoryUrlState(searchParams),
    [searchParams],
  );
  const currentSearch = searchParams.toString();
  const canonicalSearch = useMemo(
    () => serializeAdminDirectoryUrlState(urlState).toString(),
    [urlState],
  );

  useEffect(() => {
    if (currentSearch !== canonicalSearch) {
      setSearchParams(canonicalSearch, { replace: true });
    }
  }, [canonicalSearch, currentSearch, setSearchParams]);

  const updateUrlState = useCallback(
    (
      update: AdminDirectoryUrlUpdate,
      navigation: AdminDirectoryUrlNavigation = "replace",
    ) => {
      setSearchParams(
        (currentParams) =>
          serializeAdminDirectoryUrlState(
            update(parseAdminDirectoryUrlState(currentParams)),
          ),
        { replace: navigation === "replace" },
      );
    },
    [setSearchParams],
  );

  const selectTab = useCallback(
    (value: string) => {
      const tab = parseAdminDirectoryTab(value);
      if (!tab) return;
      updateUrlState((current) => ({ ...current, tab }), "push");
    },
    [updateUrlState],
  );

  return { urlState, updateUrlState, selectTab };
}
