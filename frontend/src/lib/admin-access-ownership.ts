const ADMIN_KEY_STORAGE_PREFIX = "admin-key:user:";
export const LEGACY_ADMIN_KEY_STORAGE = "admin-key";

export interface AdminCredentialSnapshot {
  readonly ownerUserId: number;
  readonly key: string;
}

export type AdminCredentialPersistence =
  | { readonly kind: "set"; readonly storageKey: string; readonly key: string }
  | { readonly kind: "remove"; readonly storageKey: string }
  | { readonly kind: "none" };

export interface AdminCredentialSavePlan {
  readonly snapshot: AdminCredentialSnapshot | null;
  readonly persistence: AdminCredentialPersistence;
}

export interface OwnedAdminAccess {
  readonly adminKey: string;
  readonly adminRequest: RequestInit;
}

export function isAuthenticatedUserId(
  userId: number | undefined,
): userId is number {
  return (
    typeof userId === "number" && Number.isSafeInteger(userId) && userId > 0
  );
}

export function getAdminKeyStorageKey(userId: number): string {
  return `${ADMIN_KEY_STORAGE_PREFIX}${userId}`;
}

export function createAdminCredentialSnapshot(
  userId: number | undefined,
  persistedKey: string | null,
): AdminCredentialSnapshot | null {
  if (!isAuthenticatedUserId(userId)) return null;
  return { ownerUserId: userId, key: persistedKey ?? "" };
}

export function discardLegacyAdminKey(
  storage: Pick<Storage, "removeItem">,
): void {
  storage.removeItem(LEGACY_ADMIN_KEY_STORAGE);
}

export function planAdminCredentialSave(
  userId: number | undefined,
  key: string,
): AdminCredentialSavePlan {
  if (!isAuthenticatedUserId(userId)) {
    return { snapshot: null, persistence: { kind: "none" } };
  }

  const snapshot = { ownerUserId: userId, key } as const;
  const storageKey = getAdminKeyStorageKey(userId);
  return {
    snapshot,
    persistence: key
      ? { kind: "set", storageKey, key }
      : { kind: "remove", storageKey },
  };
}

export function selectOwnedAdminKey(
  userId: number | undefined,
  snapshot: AdminCredentialSnapshot | null,
): string {
  if (!isAuthenticatedUserId(userId) || snapshot?.ownerUserId !== userId) {
    return "";
  }
  return snapshot.key;
}

export function getOwnedAdminAccess(
  userId: number | undefined,
  snapshot: AdminCredentialSnapshot | null,
): OwnedAdminAccess {
  const adminKey = selectOwnedAdminKey(userId, snapshot);
  return {
    adminKey,
    adminRequest: adminKey ? { headers: { "x-admin-key": adminKey } } : {},
  };
}
