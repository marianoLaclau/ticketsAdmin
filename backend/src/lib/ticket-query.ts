import {
  ticketsTable,
  type Estado,
  type MotivoCategoria,
  type Prioridad,
} from "@workspace/db/schema";
import { MOTIVO_CATEGORIA_LABELS } from "@workspace/ingesta";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  like,
  lt,
  lte,
  not,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";

export const TICKET_SORT_BY_VALUES = [
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
] as const;

export type TicketSortBy = (typeof TICKET_SORT_BY_VALUES)[number];

export const TICKET_SORT_ORDER_VALUES = ["asc", "desc"] as const;
export type TicketSortOrder = (typeof TICKET_SORT_ORDER_VALUES)[number];

export const DEFAULT_TICKET_SORT_BY: TicketSortBy = "fecha_creacion";
export const DEFAULT_TICKET_SORT_ORDER: TicketSortOrder = "desc";
export const MAX_TICKET_SORT_CRITERIA = TICKET_SORT_BY_VALUES.length;

export interface TicketSortCriterion {
  sortBy: TicketSortBy;
  order: TicketSortOrder;
}

export type TicketSortParseResult =
  | { ok: true; criteria: TicketSortCriterion[] }
  | { ok: false; reason: string };

/**
 * Subconjunto compartido por el listado operativo, Administracion y la
 * exportacion. Paginacion, visibilidad de registros vacios y autorizacion son
 * responsabilidades de cada endpoint y se agregan como condiciones base.
 */
export interface TicketQueryFilters {
  estado?: Estado;
  prioridad?: Prioridad;
  fecha_desde?: Date;
  fecha_hasta?: Date;
  hora_desde?: string;
  hora_hasta?: string;
  empresa?: string;
  motivo?: string;
  motivo_categoria?: MotivoCategoria;
  search?: string;
  vencidos?: boolean;
}

export interface TicketFilterOptions {
  /** Permite fijar el reloj en pruebas y garantiza un unico instante por consulta. */
  now?: Date;
}

export function isTicketSortBy(value: unknown): value is TicketSortBy {
  return (
    typeof value === "string" &&
    (TICKET_SORT_BY_VALUES as readonly string[]).includes(value)
  );
}

export function isTicketSortOrder(value: unknown): value is TicketSortOrder {
  return (
    typeof value === "string" &&
    (TICKET_SORT_ORDER_VALUES as readonly string[]).includes(value)
  );
}

export function normalizeTicketSort(
  sortBy: unknown,
  order: unknown,
): { sortBy: TicketSortBy; order: TicketSortOrder } {
  return {
    sortBy: isTicketSortBy(sortBy) ? sortBy : DEFAULT_TICKET_SORT_BY,
    order: isTicketSortOrder(order) ? order : DEFAULT_TICKET_SORT_ORDER,
  };
}

/**
 * Resuelve el orden compuesto enviado como
 * `sort=fecha_creacion:desc,contacto:asc`.
 *
 * Se rechazan columnas repetidas para evitar criterios ambiguos. Si `sort`
 * no fue enviado, conserva el contrato anterior `sort_by` + `order`.
 */
export function parseTicketSortQuery(
  sort: unknown,
  legacySortBy: unknown,
  legacyOrder: unknown,
): TicketSortParseResult {
  if (sort === undefined) {
    const legacy = normalizeTicketSort(legacySortBy, legacyOrder);
    return { ok: true, criteria: [legacy] };
  }

  if (typeof sort !== "string" || sort.trim() === "") {
    return { ok: false, reason: "El orden compuesto debe ser texto" };
  }

  const rawCriteria = sort.split(",");
  if (rawCriteria.length > MAX_TICKET_SORT_CRITERIA) {
    return {
      ok: false,
      reason: `Solo se permiten ${MAX_TICKET_SORT_CRITERIA} criterios`,
    };
  }

  const seenColumns = new Set<TicketSortBy>();
  const criteria: TicketSortCriterion[] = [];

  for (const rawCriterion of rawCriteria) {
    const parts = rawCriterion.split(":");
    if (parts.length !== 2) {
      return {
        ok: false,
        reason: "Cada criterio debe tener el formato columna:direccion",
      };
    }

    const sortBy = parts[0]?.trim();
    const order = parts[1]?.trim();
    if (!isTicketSortBy(sortBy) || !isTicketSortOrder(order)) {
      return { ok: false, reason: "El criterio de orden no es válido" };
    }
    if (seenColumns.has(sortBy)) {
      return {
        ok: false,
        reason: `La columna ${sortBy} está repetida`,
      };
    }

    seenColumns.add(sortBy);
    criteria.push({ sortBy, order });
  }

  return { ok: true, criteria };
}

function normalizedText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

/** Construye exclusivamente los filtros de negocio; no agrega paginacion. */
export function buildTicketFilterConditions(
  filters: TicketQueryFilters,
  options: TicketFilterOptions = {},
): SQL[] {
  const conditions: SQL[] = [];

  if (filters.estado) conditions.push(eq(ticketsTable.estado, filters.estado));
  if (filters.prioridad) {
    conditions.push(eq(ticketsTable.prioridad, filters.prioridad));
  }
  if (filters.fecha_desde) {
    conditions.push(gte(ticketsTable.fecha_creacion, filters.fecha_desde));
  }
  if (filters.fecha_hasta) {
    conditions.push(lte(ticketsTable.fecha_creacion, filters.fecha_hasta));
  }
  if (filters.hora_desde) {
    conditions.push(gte(ticketsTable.hora, filters.hora_desde));
  }
  if (filters.hora_hasta) {
    conditions.push(lte(ticketsTable.hora, filters.hora_hasta));
  }

  const empresa = normalizedText(filters.empresa);
  if (empresa) conditions.push(like(ticketsTable.empresa, `%${empresa}%`));

  const motivo = normalizedText(filters.motivo);
  if (motivo) conditions.push(like(ticketsTable.motivo, `%${motivo}%`));

  if (filters.motivo_categoria) {
    conditions.push(
      eq(ticketsTable.motivo_categoria, filters.motivo_categoria),
    );
  }

  const search = normalizedText(filters.search);
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      or(
        like(ticketsTable.nombre, pattern),
        like(ticketsTable.apellido, pattern),
        like(ticketsTable.telefono, pattern),
        like(ticketsTable.dni, pattern),
        like(ticketsTable.email, pattern),
        like(ticketsTable.empresa, pattern),
        like(ticketsTable.motivo, pattern),
        like(ticketsTable.conversation_id, pattern),
      )!,
    );
  }

  if (filters.vencidos) {
    conditions.push(
      and(
        lt(ticketsTable.fecha_limite, options.now ?? new Date()),
        not(inArray(ticketsTable.estado, ["resuelto", "cerrado"])),
      )!,
    );
  }

  return conditions;
}

/** Une alcance/visibilidad del endpoint y filtros en un unico WHERE. */
export function buildTicketWhere(
  filters: TicketQueryFilters,
  baseConditions: readonly SQL[] = [],
  options: TicketFilterOptions = {},
): SQL | undefined {
  const conditions = [
    ...baseConditions,
    ...buildTicketFilterConditions(filters, options),
  ];
  return conditions.length > 0 ? and(...conditions) : undefined;
}

const nullLast = (column: AnyColumn): SQL<number> =>
  sql<number>`case when ${column} is null then 1 else 0 end`;

const blankLast = (column: AnyColumn): SQL<number> =>
  sql<number>`case when trim(coalesce(${column}, '')) = '' then 1 else 0 end`;

const textOrder = (column: AnyColumn): SQL<string> =>
  sql<string>`lower(trim(coalesce(${column}, ''))) collate nocase`;

const contactOrder = sql<string>`lower(trim(coalesce(${ticketsTable.nombre}, '') || ' ' || coalesce(${ticketsTable.apellido}, ''))) collate nocase`;

const contactBlankLast = sql<number>`case when trim(coalesce(${ticketsTable.nombre}, '') || coalesce(${ticketsTable.apellido}, '')) = '' then 1 else 0 end`;

const estadoOrder = sql<number>`case ${ticketsTable.estado}
  when 'nuevo' then 0
  when 'en_proceso' then 1
  when 'pendiente' then 2
  when 'resuelto' then 3
  when 'cerrado' then 4
  else 99 end`;

const prioridadOrder = sql<number>`case ${ticketsTable.prioridad}
  when 'baja' then 0
  when 'media' then 1
  when 'alta' then 2
  when 'urgente' then 3
  else 99 end`;

const categoryCases = Object.entries(MOTIVO_CATEGORIA_LABELS).map(
  ([codigo, label]) => sql`when ${codigo} then ${label}`,
);

const categoriaOrder = sql<string>`case ${ticketsTable.motivo_categoria}
  ${sql.join(categoryCases, sql.raw(" "))}
  else ${ticketsTable.motivo_categoria}
end collate nocase`;

function buildTicketOrderExpressions(
  sortBy: TicketSortBy,
  order: TicketSortOrder,
): SQL[] {
  const direction = order === "asc" ? asc : desc;

  switch (sortBy) {
    case "id":
      return [direction(ticketsTable.id)];

    case "fecha_creacion": {
      // Compatibilidad con la regla existente: dia del registro y, dentro de
      // ese dia, hora informada por la llamada.
      const creationDay = sql<string>`date(${ticketsTable.fecha_creacion} / 1000, 'unixepoch', 'localtime')`;
      return [direction(creationDay), direction(ticketsTable.hora)];
    }

    case "conversation_id":
      return [direction(textOrder(ticketsTable.conversation_id))];

    case "contacto":
      return [asc(contactBlankLast), direction(contactOrder)];

    case "empresa":
      return [
        asc(blankLast(ticketsTable.empresa)),
        direction(textOrder(ticketsTable.empresa)),
      ];

    case "motivo_categoria":
      return [
        direction(categoriaOrder),
        direction(textOrder(ticketsTable.motivo)),
      ];

    case "motivo":
      return [direction(textOrder(ticketsTable.motivo))];

    case "estado":
      return [direction(estadoOrder)];

    case "prioridad":
      return [direction(prioridadOrder)];

    case "asignado_a":
      return [
        asc(blankLast(ticketsTable.asignado_a)),
        direction(textOrder(ticketsTable.asignado_a)),
      ];

    case "progreso":
      return [direction(ticketsTable.progreso)];

    case "fecha_limite":
      return [
        asc(nullLast(ticketsTable.fecha_limite)),
        direction(ticketsTable.fecha_limite),
      ];
  }
}

/**
 * Devuelve expresiones SQL cerradas: nunca interpola un nombre de columna
 * recibido del cliente. Los valores nulos/vacios quedan al final en ambos
 * sentidos y el id hace determinista cada empate.
 *
 * Acepta el par histórico o una lista priorizada. El desempate por id se
 * agrega una sola vez, después de todos los criterios seleccionados.
 */
export function buildTicketOrderBy(
  sort:
    | TicketSortBy
    | readonly TicketSortCriterion[] = DEFAULT_TICKET_SORT_BY,
  order: TicketSortOrder = DEFAULT_TICKET_SORT_ORDER,
): SQL[] {
  const criteria: readonly TicketSortCriterion[] =
    typeof sort === "string"
      ? [{ sortBy: sort, order }]
      : sort.length > 0
        ? sort
        : [
            {
              sortBy: DEFAULT_TICKET_SORT_BY,
              order: DEFAULT_TICKET_SORT_ORDER,
            },
          ];

  const expressions = criteria.flatMap(({ sortBy, order: criterionOrder }) =>
    buildTicketOrderExpressions(sortBy, criterionOrder),
  );

  if (!criteria.some(({ sortBy }) => sortBy === "id")) {
    const idDirection = criteria[0]!.order === "asc" ? asc : desc;
    expressions.push(idDirection(ticketsTable.id));
  }

  return expressions;
}
