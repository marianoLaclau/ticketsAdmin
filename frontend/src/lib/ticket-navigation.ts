import {
  parseTicketListUrlState,
  serializeTicketListUrlState,
} from "./ticket-list-url.ts";
import {
  parseAdminTicketsUrlState,
  serializeAdminTicketsUrlState,
} from "./admin-tickets-url.ts";

export const TICKET_LIST_NAVIGATION_SOURCE = "ticket-list" as const;
export const ADMIN_TICKET_LIST_NAVIGATION_SOURCE = "admin-ticket-list" as const;

export interface TicketDetailNavigationState {
  readonly source: typeof TICKET_LIST_NAVIGATION_SOURCE;
  readonly returnTo: string;
}

export interface AdminTicketDetailNavigationState {
  readonly source: typeof ADMIN_TICKET_LIST_NAVIGATION_SOURCE;
  readonly returnTo: string;
}

const TICKET_LIST_PATH = "/tickets";
const TICKET_LIST_QUERY_PREFIX = `${TICKET_LIST_PATH}?`;
const ADMIN_TICKET_LIST_PATH = "/admin";
const ADMIN_TICKET_LIST_QUERY_PREFIX = `${ADMIN_TICKET_LIST_PATH}?`;

function createTicketListPath(input: URLSearchParams | string): string {
  const query = serializeTicketListUrlState(
    parseTicketListUrlState(input),
  ).toString();

  return query ? `${TICKET_LIST_QUERY_PREFIX}${query}` : TICKET_LIST_PATH;
}

function isCanonicalTicketListPath(path: string): boolean {
  if (path === TICKET_LIST_PATH) return true;
  if (!path.startsWith(TICKET_LIST_QUERY_PREFIX) || path.includes("#")) {
    return false;
  }

  const query = path.slice(TICKET_LIST_QUERY_PREFIX.length);
  return query.length > 0 && createTicketListPath(query) === path;
}

function createAdminTicketListPath(input: URLSearchParams | string): string {
  const state = parseAdminTicketsUrlState(input);
  const query = serializeAdminTicketsUrlState({
    ...state,
    tab: "registros",
  }).toString();

  return query
    ? `${ADMIN_TICKET_LIST_QUERY_PREFIX}${query}`
    : ADMIN_TICKET_LIST_PATH;
}

function isCanonicalAdminTicketListPath(path: string): boolean {
  if (path === ADMIN_TICKET_LIST_PATH) return true;
  if (!path.startsWith(ADMIN_TICKET_LIST_QUERY_PREFIX) || path.includes("#")) {
    return false;
  }

  const query = path.slice(ADMIN_TICKET_LIST_QUERY_PREFIX.length);
  return query.length > 0 && createAdminTicketListPath(query) === path;
}

function parseListNavigationState<Source extends string>(
  state: unknown,
  expectedSource: Source,
  isCanonicalReturnPath: (path: string) => boolean,
): { readonly source: Source; readonly returnTo: string } | undefined {
  try {
    if (typeof state !== "object" || state === null || Array.isArray(state)) {
      return undefined;
    }

    const candidate = state as Record<string, unknown>;
    if (
      !Object.hasOwn(candidate, "source") ||
      !Object.hasOwn(candidate, "returnTo")
    ) {
      return undefined;
    }

    const source = candidate.source;
    const returnTo = candidate.returnTo;
    if (
      source !== expectedSource ||
      typeof returnTo !== "string" ||
      !isCanonicalReturnPath(returnTo)
    ) {
      return undefined;
    }

    return { source: expectedSource, returnTo };
  } catch {
    return undefined;
  }
}

export function createTicketDetailNavigationState(
  input: URLSearchParams | string = "",
): TicketDetailNavigationState {
  return {
    source: TICKET_LIST_NAVIGATION_SOURCE,
    returnTo: createTicketListPath(input),
  };
}

export function parseTicketDetailNavigationState(
  state: unknown,
): TicketDetailNavigationState | undefined {
  return parseListNavigationState(
    state,
    TICKET_LIST_NAVIGATION_SOURCE,
    isCanonicalTicketListPath,
  );
}

export function getTicketListReturnTo(state: unknown): string | undefined {
  return parseTicketDetailNavigationState(state)?.returnTo;
}

export function createAdminTicketDetailNavigationState(
  input: URLSearchParams | string = "",
): AdminTicketDetailNavigationState {
  return {
    source: ADMIN_TICKET_LIST_NAVIGATION_SOURCE,
    returnTo: createAdminTicketListPath(input),
  };
}

export function parseAdminTicketDetailNavigationState(
  state: unknown,
): AdminTicketDetailNavigationState | undefined {
  return parseListNavigationState(
    state,
    ADMIN_TICKET_LIST_NAVIGATION_SOURCE,
    isCanonicalAdminTicketListPath,
  );
}

export function getAdminTicketListReturnTo(state: unknown): string | undefined {
  return parseAdminTicketDetailNavigationState(state)?.returnTo;
}
