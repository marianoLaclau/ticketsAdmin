import {
  ticketsTable,
  type Estado,
  type MotivoCategoria,
  type Prioridad,
} from "@workspace/db/schema";
import {
  and,
  eq,
  gte,
  inArray,
  like,
  lt,
  lte,
  not,
  or,
  type SQL,
} from "drizzle-orm";

/**
 * Subconjunto compartido por el listado operativo, Administracion y su
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
