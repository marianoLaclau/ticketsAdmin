import {
  ticketsTable,
  usuariosTable,
  type Estado,
  type MotivoCategoria,
  type Prioridad,
} from "@workspace/db/schema";
import { and, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import {
  buildQualityProportion,
  type QualityProportion,
} from "../domain/quality";
import {
  buildPerformanceCohortConditions,
  type PerformanceFilters,
} from "./cohort";
import {
  normalizedContactDigits,
  normalizedContactText,
  usableDniContactIdentity,
  usableEmailContactIdentity,
  usablePhoneContactIdentity,
} from "./contact-identity";

type PerformanceDatabase<TSchema extends Record<string, unknown>> =
  BetterSQLite3Database<TSchema>;

export type PerformanceRepetitionFilters = PerformanceFilters & {
  pagina?: number;
  limite?: number;
};

type ContactKeyType = "dni" | "telefono" | "email";

export type PerformanceRepetitionResult = {
  pagina: number;
  limite: number;
  total_paginas: number;
  tickets_evaluados: number;
  cobertura: {
    identidad_utilizable: QualityProportion;
    ambiguos_detectados: number;
    criterio: "clave_canonica_no_transitiva";
  };
  resumen: {
    contactos_reiterados: number;
    tickets_involucrados: number;
    abiertos: number;
    vencidos_abiertos: number;
  };
  contactos: Array<{
    grupo_id: string;
    nombre_referencia: string;
    coincidencia: {
      tipo: ContactKeyType;
      valor_enmascarado: string;
    };
    cantidad_llamados: number;
    abiertos: number;
    vencidos_abiertos: number;
    primer_contacto: Date;
    ultimo_contacto: Date;
    antiguedad_abierto_horas: number | null;
    prioridad_maxima: Prioridad;
    responsables: Array<{
      usuario_id: number | null;
      nombre: string;
      cantidad_abiertos: number;
    }>;
    tickets: Array<{
      id: number;
      fecha_creacion: Date;
      estado: Estado;
      prioridad: Prioridad;
      fecha_limite: Date | null;
      vencido: boolean;
      motivo_categoria: MotivoCategoria;
      asignado_usuario_id: number | null;
      asignado_a: string | null;
    }>;
  }>;
};

type RawCoverage = {
  tickets_evaluados: number;
  identidad_utilizable: number;
  ambiguos_detectados: number;
  contactos_reiterados: number;
  tickets_involucrados: number;
  abiertos: number;
  vencidos_abiertos: number;
};

type RawRepeatedTicket = {
  group_position: number;
  canonical_type: ContactKeyType;
  canonical_value: string;
  ticket_id: number;
  nombre: string;
  apellido: string;
  estado: Estado;
  prioridad: Prioridad;
  motivo_categoria: MotivoCategoria;
  asignado_usuario_id: number | null;
  asignado_a: string | null;
  asignado_nombre_actual: string | null;
  fecha_creacion: number;
  fecha_limite: number | null;
};

const FINAL_STATES = new Set<Estado>(["resuelto", "cerrado"]);
const PRIORITY_WEIGHT: Record<Prioridad, number> = {
  baja: 0,
  media: 1,
  alta: 2,
  urgente: 3,
};
const HOURS_IN_MILLISECONDS = 3_600_000;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function buildIdentityCtes(filters: PerformanceRepetitionFilters) {
  const cohortCondition = and(...buildPerformanceCohortConditions(filters))!;
  const normalizedDni = normalizedContactDigits(ticketsTable.dni);
  const normalizedPhone = normalizedContactDigits(ticketsTable.telefono);
  const normalizedEmail = normalizedContactText(ticketsTable.email);

  return sql`
    cohort as (
      select
        ${ticketsTable.id} as ticket_id,
        ${ticketsTable.nombre} as nombre,
        ${ticketsTable.apellido} as apellido,
        ${ticketsTable.estado} as estado,
        ${ticketsTable.prioridad} as prioridad,
        ${ticketsTable.motivo_categoria} as motivo_categoria,
        ${ticketsTable.asignado_usuario_id} as asignado_usuario_id,
        ${ticketsTable.asignado_a} as asignado_a,
        ${ticketsTable.fecha_creacion} as fecha_creacion,
        ${ticketsTable.fecha_limite} as fecha_limite,
        case
          when ${usableDniContactIdentity(ticketsTable.dni)}
            then ${normalizedDni}
          else null
        end as dni_normalizado,
        case
          when ${usablePhoneContactIdentity(ticketsTable.telefono)}
            then ${normalizedPhone}
          else null
        end as telefono_normalizado,
        case
          when ${usableEmailContactIdentity(ticketsTable.email)}
            then ${normalizedEmail}
          else null
        end as email_normalizado
      from ${ticketsTable}
      where ${cohortCondition}
    ),
    phone_dni_stats as (
      select
        telefono_normalizado,
        count(distinct dni_normalizado) as cantidad_dni,
        min(dni_normalizado) as unico_dni
      from cohort
      where telefono_normalizado is not null
        and dni_normalizado is not null
      group by telefono_normalizado
    ),
    email_dni_stats as (
      select
        email_normalizado,
        count(distinct dni_normalizado) as cantidad_dni,
        min(dni_normalizado) as unico_dni
      from cohort
      where email_normalizado is not null
        and dni_normalizado is not null
      group by email_normalizado
    ),
    canonical as (
      select
        cohort.*,
        case
          when cohort.telefono_normalizado is not null
            then coalesce(phone_dni_stats.cantidad_dni, 0)
          else coalesce(email_dni_stats.cantidad_dni, 0)
        end as cantidad_dni_directos,
        case
          when cohort.dni_normalizado is not null then 'dni'
          when cohort.telefono_normalizado is not null
            and phone_dni_stats.cantidad_dni = 1 then 'dni'
          when cohort.telefono_normalizado is not null then 'telefono'
          when email_dni_stats.cantidad_dni = 1 then 'dni'
          when cohort.email_normalizado is not null then 'email'
          else null
        end as canonical_type,
        case
          when cohort.dni_normalizado is not null then cohort.dni_normalizado
          when cohort.telefono_normalizado is not null
            and phone_dni_stats.cantidad_dni = 1 then phone_dni_stats.unico_dni
          when cohort.telefono_normalizado is not null then cohort.telefono_normalizado
          when email_dni_stats.cantidad_dni = 1 then email_dni_stats.unico_dni
          when cohort.email_normalizado is not null then cohort.email_normalizado
          else null
        end as canonical_value
      from cohort
      left join phone_dni_stats
        on phone_dni_stats.telefono_normalizado = cohort.telefono_normalizado
      left join email_dni_stats
        on email_dni_stats.email_normalizado = cohort.email_normalizado
    )
  `;
}

function buildRepeatedGroupsCtes(
  filters: PerformanceRepetitionFilters,
  now: Date,
) {
  return sql`
    ${buildIdentityCtes(filters)},
    repeated_groups as (
      select
        canonical_type,
        canonical_value,
        count(*) as cantidad_llamados,
        sum(
          case when estado not in ('resuelto', 'cerrado') then 1 else 0 end
        ) as abiertos,
        sum(
          case
            when estado not in ('resuelto', 'cerrado')
              and fecha_limite is not null
              and fecha_limite < ${now.getTime()}
              then 1
            else 0
          end
        ) as vencidos_abiertos,
        min(fecha_creacion) as primer_contacto,
        max(fecha_creacion) as ultimo_contacto,
        min(
          case
            when estado not in ('resuelto', 'cerrado') then fecha_creacion
            else null
          end
        ) as primer_abierto,
        max(
          case
            when estado in ('resuelto', 'cerrado') then 0
            when prioridad = 'urgente' then 3
            when prioridad = 'alta' then 2
            when prioridad = 'media' then 1
            else 0
          end
        ) as prioridad_peso
      from canonical
      where canonical_type is not null
      group by canonical_type, canonical_value
      having count(*) >= 2
        and sum(
          case when estado not in ('resuelto', 'cerrado') then 1 else 0 end
        ) >= 1
    )
  `;
}

function resolvePagination(filters: PerformanceRepetitionFilters): {
  page: number;
  pageSize: number;
} {
  const page = filters.pagina ?? DEFAULT_PAGE;
  const pageSize = filters.limite ?? DEFAULT_PAGE_SIZE;

  if (!Number.isInteger(page) || page < 1) {
    throw new RangeError(
      "La pagina de reiteraciones debe ser un entero positivo",
    );
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new RangeError(
      `El limite de reiteraciones debe ser un entero entre 1 y ${MAX_PAGE_SIZE}`,
    );
  }

  return { page, pageSize };
}

function maskedContactValue(type: ContactKeyType, value: string): string {
  if (type === "dni") return `DNI ••••${value.slice(-4)}`;
  if (type === "telefono") return `Tel. ••••${value.slice(-4)}`;

  const separator = value.lastIndexOf("@");
  const local = value.slice(0, separator);
  const domain = value.slice(separator + 1);
  return `${local.slice(0, 1)}***@${domain}`;
}

function displayContactName(name: string, surname: string): string {
  const value = `${name} ${surname}`.trim();
  return value || "Sin nombre proporcionado";
}

function displayAssignee(row: RawRepeatedTicket): string {
  const currentName = row.asignado_nombre_actual?.trim();
  if (currentName) return currentName;
  const snapshot = row.asignado_a?.trim();
  if (snapshot) return snapshot;
  return row.asignado_usuario_id === null
    ? "Sin asignar"
    : `Usuario ${row.asignado_usuario_id}`;
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "es", { sensitivity: "base" });
}

/**
 * Detecta coincidencias operativas sin construir componentes conexas. Cada
 * ticket pertenece a una sola clave; una identidad secundaria solo puede
 * heredar un DNI que aparezca directamente y de forma univoca en la cohorte.
 * La consulta ejecuta dos lecturas fijas dentro de un snapshot, nunca N+1.
 */
export function runRendimientoRepetitionQuery<
  TSchema extends Record<string, unknown>,
>(
  database: PerformanceDatabase<TSchema>,
  filters: PerformanceRepetitionFilters,
  now: Date,
): PerformanceRepetitionResult {
  if (Number.isNaN(now.getTime())) {
    throw new RangeError("El instante de reiteraciones no es valido");
  }
  const { page, pageSize } = resolvePagination(filters);
  const pageOffset = (page - 1) * pageSize;

  return database.transaction((tx): PerformanceRepetitionResult => {
    const coverage = tx.get<RawCoverage>(sql`
      with ${buildRepeatedGroupsCtes(filters, now)}
      select
        (select count(*) from canonical) as tickets_evaluados,
        coalesce((
          select sum(case when canonical_type is not null then 1 else 0 end)
          from canonical
        ), 0) as identidad_utilizable,
        coalesce((
          select sum(
            case
              when dni_normalizado is null and cantidad_dni_directos > 1 then 1
              else 0
            end
          )
          from canonical
        ), 0) as ambiguos_detectados,
        (select count(*) from repeated_groups) as contactos_reiterados,
        coalesce((
          select sum(cantidad_llamados) from repeated_groups
        ), 0) as tickets_involucrados,
        coalesce((select sum(abiertos) from repeated_groups), 0) as abiertos,
        coalesce((
          select sum(vencidos_abiertos) from repeated_groups
        ), 0) as vencidos_abiertos
    `);

    if (!coverage) {
      throw new Error("SQLite no devolvio la cobertura de reiteraciones");
    }

    const rows = tx.all<RawRepeatedTicket>(sql`
      with ${buildRepeatedGroupsCtes(filters, now)},
      ordered_groups as (
        select
          repeated_groups.*,
          row_number() over (
            order by
              case when vencidos_abiertos > 0 then 1 else 0 end desc,
              prioridad_peso desc,
              primer_abierto asc,
              ultimo_contacto desc,
              canonical_type asc,
              canonical_value asc
          ) as group_position
        from repeated_groups
      ),
      page_keys as (
        select *
        from ordered_groups
        where group_position > ${pageOffset}
          and group_position <= ${pageOffset + pageSize}
      )
      select
        page_keys.group_position as group_position,
        canonical.canonical_type as canonical_type,
        canonical.canonical_value as canonical_value,
        canonical.ticket_id as ticket_id,
        canonical.nombre as nombre,
        canonical.apellido as apellido,
        canonical.estado as estado,
        canonical.prioridad as prioridad,
        canonical.motivo_categoria as motivo_categoria,
        canonical.asignado_usuario_id as asignado_usuario_id,
        canonical.asignado_a as asignado_a,
        nullif(trim(
          ${usuariosTable.nombre} || ' ' || coalesce(${usuariosTable.apellido}, '')
        ), '') as asignado_nombre_actual,
        canonical.fecha_creacion as fecha_creacion,
        canonical.fecha_limite as fecha_limite
      from canonical
      inner join page_keys
        on page_keys.canonical_type = canonical.canonical_type
        and page_keys.canonical_value = canonical.canonical_value
      left join ${usuariosTable}
        on ${usuariosTable.id} = canonical.asignado_usuario_id
      order by
        page_keys.group_position,
        canonical.fecha_creacion desc,
        canonical.ticket_id desc
    `);

    const groups = new Map<string, RawRepeatedTicket[]>();
    for (const row of rows) {
      const key = `${row.canonical_type}\u0000${row.canonical_value}`;
      const tickets = groups.get(key);
      if (tickets) tickets.push(row);
      else groups.set(key, [row]);
    }

    const contacts = [...groups.values()].map((tickets) => {
      const newest = tickets[0]!;
      const openTickets = tickets.filter(
        (ticket) => !FINAL_STATES.has(ticket.estado),
      );
      const overdueOpenTickets = openTickets.filter(
        (ticket) =>
          ticket.fecha_limite !== null && ticket.fecha_limite < now.getTime(),
      );
      const oldestOpen = Math.min(
        ...openTickets.map((ticket) => Number(ticket.fecha_creacion)),
      );
      const priority = openTickets.reduce<Prioridad>(
        (highest, ticket) =>
          PRIORITY_WEIGHT[ticket.prioridad] > PRIORITY_WEIGHT[highest]
            ? ticket.prioridad
            : highest,
        "baja",
      );

      const responsibilities = new Map<
        string,
        { usuario_id: number | null; nombre: string; cantidad_abiertos: number }
      >();
      for (const ticket of openTickets) {
        const name = displayAssignee(ticket);
        const responsibilityKey =
          ticket.asignado_usuario_id === null
            ? `nombre:${name.toLocaleLowerCase("es")}`
            : `usuario:${ticket.asignado_usuario_id}`;
        const current = responsibilities.get(responsibilityKey);
        if (current) current.cantidad_abiertos += 1;
        else {
          responsibilities.set(responsibilityKey, {
            usuario_id: ticket.asignado_usuario_id,
            nombre: name,
            cantidad_abiertos: 1,
          });
        }
      }

      return {
        _group_position: Number(newest.group_position),
        _canonical_type: newest.canonical_type,
        _canonical_value: newest.canonical_value,
        grupo_id: "",
        nombre_referencia: displayContactName(newest.nombre, newest.apellido),
        coincidencia: {
          tipo: newest.canonical_type,
          valor_enmascarado: maskedContactValue(
            newest.canonical_type,
            newest.canonical_value,
          ),
        },
        cantidad_llamados: tickets.length,
        abiertos: openTickets.length,
        vencidos_abiertos: overdueOpenTickets.length,
        primer_contacto: new Date(
          Math.min(...tickets.map((ticket) => Number(ticket.fecha_creacion))),
        ),
        ultimo_contacto: new Date(Number(newest.fecha_creacion)),
        antiguedad_abierto_horas:
          Math.round(
            (Math.max(0, now.getTime() - oldestOpen) / HOURS_IN_MILLISECONDS) *
              100,
          ) / 100,
        prioridad_maxima: priority,
        responsables: [...responsibilities.values()].sort(
          (left, right) =>
            right.cantidad_abiertos - left.cantidad_abiertos ||
            compareText(left.nombre, right.nombre) ||
            (left.usuario_id ?? Number.MAX_SAFE_INTEGER) -
              (right.usuario_id ?? Number.MAX_SAFE_INTEGER),
        ),
        tickets: tickets.map((ticket) => {
          const isOpen = !FINAL_STATES.has(ticket.estado);
          return {
            id: Number(ticket.ticket_id),
            fecha_creacion: new Date(Number(ticket.fecha_creacion)),
            estado: ticket.estado,
            prioridad: ticket.prioridad,
            fecha_limite:
              ticket.fecha_limite === null
                ? null
                : new Date(Number(ticket.fecha_limite)),
            vencido:
              isOpen &&
              ticket.fecha_limite !== null &&
              ticket.fecha_limite < now.getTime(),
            motivo_categoria: ticket.motivo_categoria,
            asignado_usuario_id:
              ticket.asignado_usuario_id === null
                ? null
                : Number(ticket.asignado_usuario_id),
            asignado_a:
              ticket.asignado_usuario_id !== null
                ? displayAssignee(ticket)
                : ticket.asignado_a?.trim() || null,
          };
        }),
      };
    });

    contacts.sort(
      (left, right) => left._group_position - right._group_position,
    );

    const publicContacts = contacts.map(
      ({
        _group_position: groupPosition,
        _canonical_type: _type,
        _canonical_value: _value,
        ...contact
      }) => ({
        ...contact,
        grupo_id: `grupo-${groupPosition}`,
      }),
    );
    const evaluatedTickets = Number(coverage.tickets_evaluados);
    const usableIdentities = Number(coverage.identidad_utilizable);
    const totalRepeatedContacts = Number(coverage.contactos_reiterados);

    return {
      pagina: page,
      limite: pageSize,
      total_paginas:
        totalRepeatedContacts === 0
          ? 0
          : Math.ceil(totalRepeatedContacts / pageSize),
      tickets_evaluados: evaluatedTickets,
      cobertura: {
        identidad_utilizable: buildQualityProportion(
          usableIdentities,
          evaluatedTickets,
        ),
        ambiguos_detectados: Number(coverage.ambiguos_detectados),
        criterio: "clave_canonica_no_transitiva",
      },
      resumen: {
        contactos_reiterados: totalRepeatedContacts,
        tickets_involucrados: Number(coverage.tickets_involucrados),
        abiertos: Number(coverage.abiertos),
        vencidos_abiertos: Number(coverage.vencidos_abiertos),
      },
      contactos: publicContacts,
    };
  });
}
