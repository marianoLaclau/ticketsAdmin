import { useCallback, useEffect, useMemo, useState } from "react";
import { getGetMeQueryKey, useGetMe } from "@workspace/api-client-react";
import { getAdminErrorMessage } from "@/lib/error-messages";
import {
  createAdminCredentialSnapshot,
  discardLegacyAdminKey,
  getAdminKeyStorageKey,
  getOwnedAdminAccess,
  isAuthenticatedUserId,
  planAdminCredentialSave,
  type AdminCredentialSnapshot,
} from "@/lib/admin-access-ownership";
import { hasConfirmedPublicSession } from "@/lib/session-state";

function readInitialCredential(
  userId: number | undefined,
): AdminCredentialSnapshot | null {
  if (!isAuthenticatedUserId(userId)) return null;
  return createAdminCredentialSnapshot(
    userId,
    localStorage.getItem(getAdminKeyStorageKey(userId)),
  );
}

export function useAdminAccess() {
  const {
    data: me,
    isError,
    isFetching,
  } = useGetMe({
    query: { queryKey: getGetMeQueryKey() },
  });
  const userId = hasConfirmedPublicSession(me, isError, isFetching)
    ? me.id
    : undefined;
  const [credential, setCredential] = useState<AdminCredentialSnapshot | null>(
    () => readInitialCredential(userId),
  );
  const { adminKey, adminRequest } = useMemo(
    () => getOwnedAdminAccess(userId, credential),
    [credential, userId],
  );

  useEffect(() => {
    discardLegacyAdminKey(sessionStorage);

    if (!isAuthenticatedUserId(userId)) {
      setCredential(null);
      return;
    }

    const persistedKey = localStorage.getItem(getAdminKeyStorageKey(userId));
    setCredential(createAdminCredentialSnapshot(userId, persistedKey));
  }, [userId]);

  const saveAdminKey = useCallback(
    (value: string) => {
      const plan = planAdminCredentialSave(userId, value);
      setCredential(plan.snapshot);

      if (plan.persistence.kind === "set") {
        localStorage.setItem(plan.persistence.storageKey, plan.persistence.key);
      } else if (plan.persistence.kind === "remove") {
        localStorage.removeItem(plan.persistence.storageKey);
      }
    },
    [userId],
  );

  return { adminKey, saveAdminKey, adminRequest };
}

export function adminErrorMessage(error: unknown): string {
  return getAdminErrorMessage(error);
}
