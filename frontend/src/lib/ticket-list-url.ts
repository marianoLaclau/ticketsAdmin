import { MOTIVO_CATEGORIA_CODIGOS } from "@workspace/ingesta";
import type {
  ListTicketsEstado,
  ListTicketsPrioridad,
  MotivoCategoria,
  TicketSortBy,
} from "@workspace/api-client-react";
import {
  createDefaultTicketSort,
  isDefaultTicketSort,
  serializeTicketSort,
  type TicketActiveFilters,
  type TicketSortRule,
  type TicketSortState,
} from "./ticket-list-controls.ts";
import { isValidCalendarDate } from "./calendar-date.ts";

export const DEFAULT_TICKET_LIST_PAGE = 1;
const DEFAULT_TICKET_LIST_LIMIT = 10;
export const TICKET_LIST_LIMITS = [10, 25, 50, 100] as const;

export type TicketListLimit = (typeof TICKET_LIST_LIMITS)[number];

export interface TicketListUrlState {
  filters: TicketActiveFilters;
  sort: TicketSortRule[];
  page: number;
  limit: TicketListLimit;
}

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;
const MAX_SORT_QUERY_LENGTH = 512;

export const TICKET_LIST_STATES = [
  "nuevo",
  "en_proceso",
  "pendiente",
  "resuelto",
  "cerrado",
] as const satisfies readonly ListTicketsEstado[];
export const TICKET_LIST_PRIORITIES = [
  "baja",
  "media",
  "alta",
  "urgente",
] as const satisfies readonly ListTicketsPrioridad[];
// Deriva del catálogo compartido: agregar una categoría la habilita en el
// filtro por URL sin tocar este archivo.
export const TICKET_LIST_MOTIVE_CATEGORIES =
  MOTIVO_CATEGORIA_CODIGOS satisfies readonly MotivoCategoria[];
export const TICKET_LIST_SORT_COLUMNS = [
  "id",
  "fecha_creacion",
  "conversation_id",
  "contacto",
  "empresa",
  "motivo_categoria",
  "motivo",
  "estado",
  "prioridad",
  "asignado_a",
  "progreso",
  "fecha_limite",
] as const satisfies readonly TicketSortBy[];
const TICKET_STATES = new Set<string>(TICKET_LIST_STATES);
const TICKET_PRIORITIES = new Set<string>(TICKET_LIST_PRIORITIES);
const MOTIVE_CATEGORIES = new Set<string>(TICKET_LIST_MOTIVE_CATEGORIES);
const TICKET_SORT_COLUMNS = new Set<string>(TICKET_LIST_SORT_COLUMNS);
const TICKET_LIST_LIMIT_SET = new Set<number>(TICKET_LIST_LIMITS);

function hasMeaningfulText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isValidLocalTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

function parsePositiveSafeInteger(
  value: string | null,
  fallback: number,
): number {
  if (!value || !POSITIVE_INTEGER_PATTERN.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function parseTicketListLimit(value: string | null): TicketListLimit {
  const parsed = parsePositiveSafeInteger(value, DEFAULT_TICKET_LIST_LIMIT);
  return TICKET_LIST_LIMIT_SET.has(parsed)
    ? (parsed as TicketListLimit)
    : DEFAULT_TICKET_LIST_LIMIT;
}

function isSafeTicketPage(page: number, limit: number): boolean {
  return (
    Number.isSafeInteger(page) &&
    page >= DEFAULT_TICKET_LIST_PAGE &&
    Number.isSafeInteger((page - 1) * limit)
  );
}

function parseTicketListPage(value: string | null, limit: number): number {
  const page = parsePositiveSafeInteger(value, DEFAULT_TICKET_LIST_PAGE);
  return isSafeTicketPage(page, limit) ? page : DEFAULT_TICKET_LIST_PAGE;
}

function normalizeTicketSort(sort: TicketSortState): TicketSortRule[] {
  if (sort.length === 0) return createDefaultTicketSort();

  const seen = new Set<string>();
  const normalized: TicketSortRule[] = [];
  for (const rule of sort) {
    if (
      !TICKET_SORT_COLUMNS.has(rule.sortBy) ||
      (rule.order !== "asc" && rule.order !== "desc") ||
      seen.has(rule.sortBy)
    ) {
      return createDefaultTicketSort();
    }
    seen.add(rule.sortBy);
    normalized.push({ sortBy: rule.sortBy, order: rule.order });
  }
  return normalized;
}

function parseTicketSort(value: string | null): TicketSortRule[] {
  if (!value || value.length > MAX_SORT_QUERY_LENGTH) {
    return createDefaultTicketSort();
  }

  const rules: TicketSortRule[] = [];
  for (const token of value.split(",")) {
    const parts = token.split(":");
    if (parts.length !== 2) return createDefaultTicketSort();

    const sortBy = parts[0]?.trim();
    const order = parts[1]?.trim();
    if (
      !sortBy ||
      !TICKET_SORT_COLUMNS.has(sortBy) ||
      (order !== "asc" && order !== "desc")
    ) {
      return createDefaultTicketSort();
    }
    rules.push({ sortBy: sortBy as TicketSortBy, order });
  }

  return normalizeTicketSort(rules);
}

function readValidatedFilter<T extends string>(
  params: URLSearchParams,
  name: string,
  allowedValues: ReadonlySet<string>,
): T | undefined {
  const value = params.get(name);
  return value && allowedValues.has(value) ? (value as T) : undefined;
}

function readDateFilter(
  params: URLSearchParams,
  name: string,
): string | undefined {
  const value = params.get(name);
  return value && isValidCalendarDate(value) ? value : undefined;
}

function readTimeFilter(
  params: URLSearchParams,
  name: string,
): string | undefined {
  const value = params.get(name);
  return value && isValidLocalTime(value) ? value : undefined;
}

export function createDefaultTicketListUrlState(): TicketListUrlState {
  return {
    filters: {},
    sort: createDefaultTicketSort(),
    page: DEFAULT_TICKET_LIST_PAGE,
    limit: DEFAULT_TICKET_LIST_LIMIT,
  };
}

export function parseTicketListUrlState(
  input: URLSearchParams | string,
): TicketListUrlState {
  const params = typeof input === "string" ? new URLSearchParams(input) : input;
  const filters: TicketActiveFilters = {};
  const limit = parseTicketListLimit(params.get("limit"));

  const search = params.get("search");
  const empresa = params.get("empresa");
  const estado = readValidatedFilter<ListTicketsEstado>(
    params,
    "estado",
    TICKET_STATES,
  );
  const prioridad = readValidatedFilter<ListTicketsPrioridad>(
    params,
    "prioridad",
    TICKET_PRIORITIES,
  );
  const motivoCategoria = readValidatedFilter<MotivoCategoria>(
    params,
    "motivo_categoria",
    MOTIVE_CATEGORIES,
  );
  const fechaDesde = readDateFilter(params, "fecha_desde");
  const fechaHasta = readDateFilter(params, "fecha_hasta");
  const horaDesde = readTimeFilter(params, "hora_desde");
  const horaHasta = readTimeFilter(params, "hora_hasta");

  if (hasMeaningfulText(search)) filters.search = search;
  if (estado) filters.estado = estado;
  if (prioridad) filters.prioridad = prioridad;
  if (motivoCategoria) filters.motivo_categoria = motivoCategoria;
  if (params.get("vencidos") === "1") filters.vencidos = true;
  if (fechaDesde) filters.fecha_desde = fechaDesde;
  if (fechaHasta) filters.fecha_hasta = fechaHasta;
  if (horaDesde) filters.hora_desde = horaDesde;
  if (horaHasta) filters.hora_hasta = horaHasta;
  if (hasMeaningfulText(empresa)) filters.empresa = empresa;

  return {
    filters,
    sort: parseTicketSort(params.get("sort")),
    page: parseTicketListPage(params.get("page"), limit),
    limit,
  };
}

function setTextParam(
  params: URLSearchParams,
  name: string,
  value: string | undefined,
): void {
  if (hasMeaningfulText(value)) params.set(name, value);
}

function setValidatedParam(
  params: URLSearchParams,
  name: string,
  value: string | undefined,
  allowedValues: ReadonlySet<string>,
): void {
  if (value && allowedValues.has(value)) params.set(name, value);
}

export function serializeTicketListUrlState(
  state: TicketListUrlState,
): URLSearchParams {
  const params = new URLSearchParams();
  const { filters } = state;

  setTextParam(params, "search", filters.search);
  setValidatedParam(params, "estado", filters.estado, TICKET_STATES);
  setValidatedParam(params, "prioridad", filters.prioridad, TICKET_PRIORITIES);
  setValidatedParam(
    params,
    "motivo_categoria",
    filters.motivo_categoria,
    MOTIVE_CATEGORIES,
  );
  if (filters.vencidos === true) params.set("vencidos", "1");
  if (filters.fecha_desde && isValidCalendarDate(filters.fecha_desde)) {
    params.set("fecha_desde", filters.fecha_desde);
  }
  if (filters.fecha_hasta && isValidCalendarDate(filters.fecha_hasta)) {
    params.set("fecha_hasta", filters.fecha_hasta);
  }
  if (filters.hora_desde && isValidLocalTime(filters.hora_desde)) {
    params.set("hora_desde", filters.hora_desde);
  }
  if (filters.hora_hasta && isValidLocalTime(filters.hora_hasta)) {
    params.set("hora_hasta", filters.hora_hasta);
  }
  setTextParam(params, "empresa", filters.empresa);

  const sort = normalizeTicketSort(state.sort);
  if (!isDefaultTicketSort(sort)) {
    params.set("sort", serializeTicketSort(sort));
  }
  if (
    state.page > DEFAULT_TICKET_LIST_PAGE &&
    isSafeTicketPage(state.page, state.limit)
  ) {
    params.set("page", String(state.page));
  }
  if (
    TICKET_LIST_LIMIT_SET.has(state.limit) &&
    state.limit !== DEFAULT_TICKET_LIST_LIMIT
  ) {
    params.set("limit", String(state.limit));
  }

  return params;
}
