export type AdminDirectoryTabValue = "users" | "roles";

export interface AdminDirectoryUrlState {
  tab: AdminDirectoryTabValue;
}

const ADMIN_DIRECTORY_TAB_MAP = {
  users: true,
  roles: true,
} as const satisfies Record<AdminDirectoryTabValue, true>;

export const ADMIN_DIRECTORY_TABS: readonly AdminDirectoryTabValue[] =
  Object.freeze(
    Object.keys(ADMIN_DIRECTORY_TAB_MAP) as AdminDirectoryTabValue[],
  );

const ADMIN_DIRECTORY_TAB_SET = new Set<string>(ADMIN_DIRECTORY_TABS);
const DEFAULT_ADMIN_DIRECTORY_TAB: AdminDirectoryTabValue = "users";

export function createDefaultAdminDirectoryUrlState(): AdminDirectoryUrlState {
  return { tab: DEFAULT_ADMIN_DIRECTORY_TAB };
}

function readAdminDirectoryTab(value: unknown): AdminDirectoryTabValue {
  return typeof value === "string" && ADMIN_DIRECTORY_TAB_SET.has(value)
    ? (value as AdminDirectoryTabValue)
    : DEFAULT_ADMIN_DIRECTORY_TAB;
}

function normalizeAdminDirectoryUrlState(
  state: unknown,
): AdminDirectoryUrlState {
  try {
    if (typeof state !== "object" || state === null || Array.isArray(state)) {
      return createDefaultAdminDirectoryUrlState();
    }

    const candidate = state as Record<string, unknown>;
    const tabValue = Object.hasOwn(candidate, "tab")
      ? candidate.tab
      : undefined;

    return { tab: readAdminDirectoryTab(tabValue) };
  } catch {
    return createDefaultAdminDirectoryUrlState();
  }
}

export function parseAdminDirectoryUrlState(
  input: URLSearchParams | string,
): AdminDirectoryUrlState {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;
  return { tab: readAdminDirectoryTab(params.get("tab")) };
}

export function serializeAdminDirectoryUrlState(
  state: AdminDirectoryUrlState,
): URLSearchParams {
  const normalized = normalizeAdminDirectoryUrlState(state);
  const params = new URLSearchParams();

  if (normalized.tab !== DEFAULT_ADMIN_DIRECTORY_TAB) {
    params.set("tab", normalized.tab);
  }

  return params;
}
