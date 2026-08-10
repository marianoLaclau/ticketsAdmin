const LEGACY_ADMIN_KEY = "admin-key";
const LEGACY_ADMIN_KEY_PREFIX = "admin-key:user:";

type LegacyAdminCredentialStorage = Pick<
  Storage,
  "key" | "length" | "removeItem"
>;

interface BrowserStorageHost {
  readonly localStorage: LegacyAdminCredentialStorage;
  readonly sessionStorage: LegacyAdminCredentialStorage;
}

function isLegacyAdminCredentialKey(key: string): boolean {
  return key === LEGACY_ADMIN_KEY || key.startsWith(LEGACY_ADMIN_KEY_PREFIX);
}

export function purgeLegacyAdminCredentials(
  storage: LegacyAdminCredentialStorage,
): void {
  const keysToRemove = new Set<string>([LEGACY_ADMIN_KEY]);

  let keyCount = 0;
  try {
    keyCount = storage.length;
  } catch {
    // The exact legacy key can still be removed without enumerating storage.
  }

  for (let index = 0; index < keyCount; index += 1) {
    try {
      const key = storage.key(index);
      if (key !== null && isLegacyAdminCredentialKey(key)) {
        keysToRemove.add(key);
      }
    } catch {
      // One inaccessible entry must not prevent processing the remaining keys.
    }
  }

  for (const key of keysToRemove) {
    try {
      storage.removeItem(key);
    } catch {
      // Storage may be unavailable or reject individual removals.
    }
  }
}

export function purgeLegacyAdminCredentialsFromBrowser(
  storageHost: BrowserStorageHost,
): void {
  const storageNames = ["localStorage", "sessionStorage"] as const;

  for (const storageName of storageNames) {
    try {
      purgeLegacyAdminCredentials(storageHost[storageName]);
    } catch {
      // A blocked storage getter must not block the other storage or app startup.
    }
  }
}
