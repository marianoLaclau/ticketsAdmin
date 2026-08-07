import {
  parseTicketListUrlState,
  serializeTicketListUrlState,
} from "./ticket-list-url.ts";

export const TICKET_LIST_NAVIGATION_SOURCE = "ticket-list" as const;

export interface TicketDetailNavigationState {
  readonly source: typeof TICKET_LIST_NAVIGATION_SOURCE;
  readonly returnTo: string;
}

const TICKET_LIST_PATH = "/tickets";
const TICKET_LIST_QUERY_PREFIX = `${TICKET_LIST_PATH}?`;

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
  if (typeof state !== "object" || state === null || Array.isArray(state)) {
    return undefined;
  }

  try {
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
      source !== TICKET_LIST_NAVIGATION_SOURCE ||
      typeof returnTo !== "string" ||
      !isCanonicalTicketListPath(returnTo)
    ) {
      return undefined;
    }

    return {
      source: TICKET_LIST_NAVIGATION_SOURCE,
      returnTo,
    };
  } catch {
    return undefined;
  }
}

export function getTicketListReturnTo(state: unknown): string | undefined {
  return parseTicketDetailNavigationState(state)?.returnTo;
}
