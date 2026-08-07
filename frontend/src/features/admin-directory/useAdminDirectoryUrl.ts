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
  selectTab: (value: string) => void;
}

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

  const selectTab = useCallback(
    (value: string) => {
      const tab = parseAdminDirectoryTab(value);
      if (!tab) return;
      setSearchParams(serializeAdminDirectoryUrlState({ tab }), {
        replace: false,
      });
    },
    [setSearchParams],
  );

  return { urlState, selectTab };
}
