import type {
  ExportTicketsCsvParams,
  ListTicketsEstado,
  ListTicketsParams,
  ListTicketsPrioridad,
  MotivoCategoria,
  TicketSortBy,
} from '@workspace/api-client-react';

export type TicketSortOrder = 'asc' | 'desc';

export interface TicketSortRule {
  sortBy: TicketSortBy;
  order: TicketSortOrder;
}

export type TicketSortState = readonly TicketSortRule[];

export const DEFAULT_TICKET_SORT: TicketSortRule = {
  sortBy: 'fecha_creacion',
  order: 'desc',
};

export function createDefaultTicketSort(): TicketSortRule[] {
  return [{ ...DEFAULT_TICKET_SORT }];
}

export function isDefaultTicketSort(sort: TicketSortState): boolean {
  return (
    sort.length === 1 &&
    sort[0]?.sortBy === DEFAULT_TICKET_SORT.sortBy &&
    sort[0].order === DEFAULT_TICKET_SORT.order
  );
}

export interface TicketActiveFilters {
  search?: string;
  estado?: ListTicketsEstado;
  prioridad?: ListTicketsPrioridad;
  motivo_categoria?: MotivoCategoria;
  vencidos?: boolean;
  fecha_desde?: string;
  fecha_hasta?: string;
  hora_desde?: string;
  hora_hasta?: string;
  empresa?: string;
}

function oppositeTicketSortOrder(order: TicketSortOrder): TicketSortOrder {
  return order === 'asc' ? 'desc' : 'asc';
}

/**
 * Un clic simple deja una sola columna activa. Shift+clic conserva las
 * anteriores, agrega una columna nueva al final o invierte una ya activa sin
 * cambiar su prioridad.
 */
export function nextTicketSort(
  current: TicketSortState,
  column: TicketSortBy,
  additive = false,
): TicketSortRule[] {
  const currentIndex = current.findIndex((rule) => rule.sortBy === column);

  if (!additive) {
    const currentRule = currentIndex >= 0 ? current[currentIndex] : undefined;
    return [
      {
        sortBy: column,
        order: currentRule ? oppositeTicketSortOrder(currentRule.order) : 'asc',
      },
    ];
  }

  if (currentIndex < 0) {
    return [...current, { sortBy: column, order: 'asc' }];
  }

  return current.map((rule, index) =>
    index === currentIndex ? { ...rule, order: oppositeTicketSortOrder(rule.order) } : rule,
  );
}

export function serializeTicketSort(sort: TicketSortState): string {
  const effectiveSort = sort.length > 0 ? sort : [DEFAULT_TICKET_SORT];
  return effectiveSort.map(({ sortBy, order }) => `${sortBy}:${order}`).join(',');
}

function normalizedOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function compactTicketFilters(filters: TicketActiveFilters): TicketActiveFilters {
  const compact: TicketActiveFilters = {};
  const search = normalizedOptionalText(filters.search);
  const empresa = normalizedOptionalText(filters.empresa);

  if (search) compact.search = search;
  if (filters.estado) compact.estado = filters.estado;
  if (filters.prioridad) compact.prioridad = filters.prioridad;
  if (filters.motivo_categoria) {
    compact.motivo_categoria = filters.motivo_categoria;
  }
  if (filters.vencidos) compact.vencidos = true;
  if (filters.fecha_desde) compact.fecha_desde = filters.fecha_desde;
  if (filters.fecha_hasta) compact.fecha_hasta = filters.fecha_hasta;
  if (filters.hora_desde) compact.hora_desde = filters.hora_desde;
  if (filters.hora_hasta) compact.hora_hasta = filters.hora_hasta;
  if (empresa) compact.empresa = empresa;

  return compact;
}

export function buildTicketListParams(
  filters: TicketActiveFilters,
  sort: TicketSortState,
  page: number,
  limit: number,
): ListTicketsParams & { sort: string } {
  const primarySort = sort[0] ?? DEFAULT_TICKET_SORT;
  return {
    ...compactTicketFilters(filters),
    sort: serializeTicketSort(sort),
    // Compatibilidad con servidores/clientes anteriores al orden compuesto.
    sort_by: primarySort.sortBy,
    order: primarySort.order,
    page,
    limit,
  };
}

/** Exporta el mismo conjunto y orden, deliberadamente sin paginacion ni vacios. */
export function buildTicketExportParams(
  filters: TicketActiveFilters,
  sort: TicketSortState,
): ExportTicketsCsvParams & { sort: string } {
  const primarySort = sort[0] ?? DEFAULT_TICKET_SORT;
  return {
    ...compactTicketFilters(filters),
    sort: serializeTicketSort(sort),
    // Compatibilidad con servidores/clientes anteriores al orden compuesto.
    sort_by: primarySort.sortBy,
    order: primarySort.order,
  };
}

export function createTicketCsvFilename(now = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, value]),
  );
  return `tickets-${parts.year}-${parts.month}-${parts.day}.csv`;
}

export interface TicketCsvDownloadAdapter {
  createObjectUrl: (blob: Blob) => string;
  triggerDownload: (url: string, filename: string) => void;
  revokeObjectUrl: (url: string) => void;
}

const browserDownloadAdapter: TicketCsvDownloadAdapter = {
  createObjectUrl: (blob) => URL.createObjectURL(blob),
  triggerDownload: (url, filename) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  },
  revokeObjectUrl: (url) => URL.revokeObjectURL(url),
};

export function downloadTicketCsv(
  csv: string,
  filename = createTicketCsvFilename(),
  adapter: TicketCsvDownloadAdapter = browserDownloadAdapter,
): void {
  // Response.text() puede consumir el BOM enviado por el backend. Reponerlo
  // aca garantiza que Excel detecte UTF-8 sin duplicarlo si todavia existe.
  const utf8Csv = csv.startsWith('\uFEFF') ? csv : `\uFEFF${csv}`;
  const blob = new Blob([utf8Csv], { type: 'text/csv;charset=utf-8' });
  const objectUrl = adapter.createObjectUrl(blob);
  try {
    adapter.triggerDownload(objectUrl, filename);
  } finally {
    adapter.revokeObjectUrl(objectUrl);
  }
}
