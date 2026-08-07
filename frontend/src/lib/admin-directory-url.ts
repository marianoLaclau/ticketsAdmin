export type AdminDirectoryTabValue = "users" | "roles";

const ADMIN_DIRECTORY_TAB_MAP = {
  users: true,
  roles: true,
} as const satisfies Record<AdminDirectoryTabValue, true>;

export const ADMIN_DIRECTORY_TABS: readonly AdminDirectoryTabValue[] =
  Object.freeze(
    Object.keys(ADMIN_DIRECTORY_TAB_MAP) as AdminDirectoryTabValue[],
  );

export const ADMIN_DIRECTORY_USER_STATUSES = Object.freeze([
  "active",
  "inactive",
] as const);
export const ADMIN_DIRECTORY_USER_LIMITS = Object.freeze([
  10, 25, 50, 100,
] as const);

export type AdminDirectoryUserStatus =
  (typeof ADMIN_DIRECTORY_USER_STATUSES)[number];
export type AdminDirectoryUserLimit =
  (typeof ADMIN_DIRECTORY_USER_LIMITS)[number];

export const DEFAULT_ADMIN_DIRECTORY_USER_PAGE = 1;
export const DEFAULT_ADMIN_DIRECTORY_USER_LIMIT: AdminDirectoryUserLimit = 10;

export interface AdminDirectoryUsersUrlState {
  search?: string;
  roleId?: number;
  status?: AdminDirectoryUserStatus;
  page: number;
  limit: AdminDirectoryUserLimit;
}

export interface AdminDirectoryUrlState {
  tab: AdminDirectoryTabValue;
  users: AdminDirectoryUsersUrlState;
}

const ADMIN_DIRECTORY_TAB_SET = new Set<string>(ADMIN_DIRECTORY_TABS);
const ADMIN_DIRECTORY_USER_STATUS_SET = new Set<string>(
  ADMIN_DIRECTORY_USER_STATUSES,
);
const ADMIN_DIRECTORY_USER_LIMIT_SET = new Set<number>(
  ADMIN_DIRECTORY_USER_LIMITS,
);
const DEFAULT_ADMIN_DIRECTORY_TAB: AdminDirectoryTabValue = "users";
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

function createDefaultAdminDirectoryUsersUrlState(): AdminDirectoryUsersUrlState {
  return {
    page: DEFAULT_ADMIN_DIRECTORY_USER_PAGE,
    limit: DEFAULT_ADMIN_DIRECTORY_USER_LIMIT,
  };
}

export function createDefaultAdminDirectoryUrlState(): AdminDirectoryUrlState {
  return {
    tab: DEFAULT_ADMIN_DIRECTORY_TAB,
    users: createDefaultAdminDirectoryUsersUrlState(),
  };
}

function hasMeaningfulText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readAdminDirectoryTab(value: unknown): AdminDirectoryTabValue {
  return typeof value === "string" && ADMIN_DIRECTORY_TAB_SET.has(value)
    ? (value as AdminDirectoryTabValue)
    : DEFAULT_ADMIN_DIRECTORY_TAB;
}

function readAdminDirectoryUserStatus(
  value: unknown,
): AdminDirectoryUserStatus | undefined {
  return typeof value === "string" && ADMIN_DIRECTORY_USER_STATUS_SET.has(value)
    ? (value as AdminDirectoryUserStatus)
    : undefined;
}

function readPositiveSafeInteger(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 1 ? value : undefined;
  }
  if (typeof value !== "string" || !POSITIVE_INTEGER_PATTERN.test(value)) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function readAdminDirectoryUserLimit(value: unknown): AdminDirectoryUserLimit {
  const parsed =
    typeof value === "number" ? value : readPositiveSafeInteger(value);
  return typeof parsed === "number" &&
    ADMIN_DIRECTORY_USER_LIMIT_SET.has(parsed)
    ? (parsed as AdminDirectoryUserLimit)
    : DEFAULT_ADMIN_DIRECTORY_USER_LIMIT;
}

function isSafeUserPage(page: number, limit: number): boolean {
  return (
    Number.isSafeInteger(page) &&
    page >= DEFAULT_ADMIN_DIRECTORY_USER_PAGE &&
    Number.isSafeInteger((page - 1) * limit)
  );
}

function readAdminDirectoryUserPage(value: unknown, limit: number): number {
  const parsed = readPositiveSafeInteger(value);
  return parsed && isSafeUserPage(parsed, limit)
    ? parsed
    : DEFAULT_ADMIN_DIRECTORY_USER_PAGE;
}

function normalizeAdminDirectoryUsersUrlState(
  usersValue: unknown,
): AdminDirectoryUsersUrlState {
  if (
    typeof usersValue !== "object" ||
    usersValue === null ||
    Array.isArray(usersValue)
  ) {
    return createDefaultAdminDirectoryUsersUrlState();
  }

  const candidate = usersValue as Record<string, unknown>;
  const searchValue = Object.hasOwn(candidate, "search")
    ? candidate.search
    : undefined;
  const roleIdValue = Object.hasOwn(candidate, "roleId")
    ? candidate.roleId
    : undefined;
  const statusValue = Object.hasOwn(candidate, "status")
    ? candidate.status
    : undefined;
  const pageValue = Object.hasOwn(candidate, "page")
    ? candidate.page
    : undefined;
  const limitValue = Object.hasOwn(candidate, "limit")
    ? candidate.limit
    : undefined;

  const roleId = readPositiveSafeInteger(roleIdValue);
  const status = readAdminDirectoryUserStatus(statusValue);
  const limit = readAdminDirectoryUserLimit(limitValue);

  return {
    ...(hasMeaningfulText(searchValue) ? { search: searchValue } : {}),
    ...(roleId ? { roleId } : {}),
    ...(status ? { status } : {}),
    page: readAdminDirectoryUserPage(pageValue, limit),
    limit,
  };
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
    const usersValue = Object.hasOwn(candidate, "users")
      ? candidate.users
      : undefined;

    return {
      tab: readAdminDirectoryTab(tabValue),
      users: normalizeAdminDirectoryUsersUrlState(usersValue),
    };
  } catch {
    return createDefaultAdminDirectoryUrlState();
  }
}

export function parseAdminDirectoryUrlState(
  input: URLSearchParams | string,
): AdminDirectoryUrlState {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;
  const limit = readAdminDirectoryUserLimit(params.get("user_limit"));
  const search = params.get("user_search");
  const roleId = readPositiveSafeInteger(params.get("user_role"));
  const status = readAdminDirectoryUserStatus(params.get("user_status"));

  return {
    tab: readAdminDirectoryTab(params.get("tab")),
    users: {
      ...(hasMeaningfulText(search) ? { search } : {}),
      ...(roleId ? { roleId } : {}),
      ...(status ? { status } : {}),
      page: readAdminDirectoryUserPage(params.get("user_page"), limit),
      limit,
    },
  };
}

export function serializeAdminDirectoryUrlState(
  state: AdminDirectoryUrlState,
): URLSearchParams {
  const normalized = normalizeAdminDirectoryUrlState(state);
  const params = new URLSearchParams();

  if (normalized.tab !== DEFAULT_ADMIN_DIRECTORY_TAB) {
    params.set("tab", normalized.tab);
  }
  if (normalized.users.search) {
    params.set("user_search", normalized.users.search);
  }
  if (normalized.users.roleId) {
    params.set("user_role", String(normalized.users.roleId));
  }
  if (normalized.users.status) {
    params.set("user_status", normalized.users.status);
  }
  if (normalized.users.page > DEFAULT_ADMIN_DIRECTORY_USER_PAGE) {
    params.set("user_page", String(normalized.users.page));
  }
  if (normalized.users.limit !== DEFAULT_ADMIN_DIRECTORY_USER_LIMIT) {
    params.set("user_limit", String(normalized.users.limit));
  }

  return params;
}
