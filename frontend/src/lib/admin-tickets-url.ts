import {
  createDefaultTicketListUrlState,
  parseTicketListUrlState,
  serializeTicketListUrlState,
  type TicketListLimit,
  type TicketListUrlState,
} from "./ticket-list-url.ts";
import {
  createDefaultTicketSort,
  type TicketSortRule,
} from "./ticket-list-controls.ts";

export type AdminTicketsTabValue = "registros" | "importar" | "peligro";

export interface AdminTicketsUrlState {
  tab: AdminTicketsTabValue;
  search?: string;
  sort: TicketSortRule[];
  page: number;
  limit: TicketListLimit;
}

const ADMIN_TICKETS_TAB_MAP = {
  registros: true,
  importar: true,
  peligro: true,
} as const satisfies Record<AdminTicketsTabValue, true>;

export const ADMIN_TICKETS_TABS: readonly AdminTicketsTabValue[] =
  Object.freeze(Object.keys(ADMIN_TICKETS_TAB_MAP) as AdminTicketsTabValue[]);

export const ADMIN_TICKETS_SORT_COLUMNS = Object.freeze([
  "id",
  "fecha_creacion",
  "conversation_id",
  "contacto",
  "empresa",
  "motivo_categoria",
  "estado",
  "prioridad",
  "asignado_a",
  "fecha_limite",
] as const satisfies readonly TicketSortRule["sortBy"][]);

const ADMIN_TICKETS_TAB_SET = new Set<string>(ADMIN_TICKETS_TABS);
const ADMIN_TICKETS_SORT_COLUMN_SET = new Set<string>(
  ADMIN_TICKETS_SORT_COLUMNS,
);
const DEFAULT_ADMIN_TICKETS_TAB: AdminTicketsTabValue = "registros";

export function createDefaultAdminTicketsUrlState(): AdminTicketsUrlState {
  const ticketListState = createDefaultTicketListUrlState();
  return {
    tab: DEFAULT_ADMIN_TICKETS_TAB,
    sort: ticketListState.sort,
    page: ticketListState.page,
    limit: ticketListState.limit,
  };
}

function readAdminTicketsTab(value: unknown): AdminTicketsTabValue {
  return typeof value === "string" && ADMIN_TICKETS_TAB_SET.has(value)
    ? (value as AdminTicketsTabValue)
    : DEFAULT_ADMIN_TICKETS_TAB;
}

function restrictAdminTicketsSort(
  state: TicketListUrlState,
): TicketListUrlState {
  const hasOnlyVisibleColumns = state.sort.every((rule) =>
    ADMIN_TICKETS_SORT_COLUMN_SET.has(rule.sortBy),
  );
  return hasOnlyVisibleColumns
    ? state
    : { ...state, sort: createDefaultTicketSort() };
}

function normalizeTicketListState(
  searchValue: unknown,
  sortValue: unknown,
  pageValue: unknown,
  limitValue: unknown,
): TicketListUrlState {
  const defaultState = createDefaultTicketListUrlState();
  const unsafeState = {
    filters: typeof searchValue === "string" ? { search: searchValue } : {},
    sort: Array.isArray(sortValue) ? sortValue : createDefaultTicketSort(),
    page: typeof pageValue === "number" ? pageValue : defaultState.page,
    limit: typeof limitValue === "number" ? limitValue : defaultState.limit,
  } as TicketListUrlState;

  return restrictAdminTicketsSort(
    parseTicketListUrlState(serializeTicketListUrlState(unsafeState)),
  );
}

function normalizeAdminTicketsUrlState(state: unknown): AdminTicketsUrlState {
  try {
    if (typeof state !== "object" || state === null || Array.isArray(state)) {
      return createDefaultAdminTicketsUrlState();
    }

    const candidate = state as Record<string, unknown>;
    const tabValue = Object.hasOwn(candidate, "tab")
      ? candidate.tab
      : undefined;
    const searchValue = Object.hasOwn(candidate, "search")
      ? candidate.search
      : undefined;
    const sortValue = Object.hasOwn(candidate, "sort")
      ? candidate.sort
      : undefined;
    const pageValue = Object.hasOwn(candidate, "page")
      ? candidate.page
      : undefined;
    const limitValue = Object.hasOwn(candidate, "limit")
      ? candidate.limit
      : undefined;
    const ticketListState = normalizeTicketListState(
      searchValue,
      sortValue,
      pageValue,
      limitValue,
    );
    const search = ticketListState.filters.search;

    return {
      tab: readAdminTicketsTab(tabValue),
      ...(search ? { search } : {}),
      sort: ticketListState.sort,
      page: ticketListState.page,
      limit: ticketListState.limit,
    };
  } catch {
    return createDefaultAdminTicketsUrlState();
  }
}

export function parseAdminTicketsUrlState(
  input: URLSearchParams | string,
): AdminTicketsUrlState {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;
  const ticketListState = restrictAdminTicketsSort(
    parseTicketListUrlState(params),
  );
  const search = ticketListState.filters.search;

  return {
    tab: readAdminTicketsTab(params.get("tab")),
    ...(search ? { search } : {}),
    sort: ticketListState.sort,
    page: ticketListState.page,
    limit: ticketListState.limit,
  };
}

export function serializeAdminTicketsUrlState(
  state: AdminTicketsUrlState,
): URLSearchParams {
  const normalized = normalizeAdminTicketsUrlState(state);
  const params = new URLSearchParams();

  if (normalized.tab !== DEFAULT_ADMIN_TICKETS_TAB) {
    params.set("tab", normalized.tab);
  }

  const ticketParams = serializeTicketListUrlState({
    filters: normalized.search ? { search: normalized.search } : {},
    sort: normalized.sort,
    page: normalized.page,
    limit: normalized.limit,
  });
  ticketParams.forEach((value, name) => params.append(name, value));

  return params;
}
