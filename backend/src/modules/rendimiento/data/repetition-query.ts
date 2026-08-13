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
  usableEmailContactIdentity,
  usableNumericContactIdentity,
} from "./contact-identity";

type PerformanceDatabase<TSchema extends Record<string, unknown>> =
  BetterSQLite3Database<TSchema>;

export type PerformanceRepetitionFilters = PerformanceFilters;

type ContactKeyType = "dni" | "telefono" | "email";

export type PerformanceRepetitionResult = {
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
};

type RawRepeatedTicket = {
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
          when ${usableNumericContactIdentity(ticketsTable.dni, 7, 11)}
            then ${normalizedDni}
          else null
        end as dni_normalizado,
        case
          when ${usableNumericContactIdentity(ticketsTable.telefono, 7, 15)}
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
 * La consulta ejecuta dos agregaciones fijas dentro de un snapshot, nunca N+1.
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

  return database.transaction((tx): PerformanceRepetitionResult => {
    const coverage = tx.get<RawCoverage>(sql`
      with ${buildIdentityCtes(filters)}
      select
        count(*) as tickets_evaluados,
        coalesce(sum(
          case when canonical_type is not null then 1 else 0 end
        ), 0) as identidad_utilizable,
        coalesce(sum(
          case
            when dni_normalizado is null and cantidad_dni_directos > 1 then 1
            else 0
          end
        ), 0) as ambiguos_detectados
      from canonical
    `);

    if (!coverage) {
      throw new Error("SQLite no devolvio la cobertura de reiteraciones");
    }

    const rows = tx.all<RawRepeatedTicket>(sql`
      with ${buildIdentityCtes(filters)},
      repeated_keys as (
        select canonical_type, canonical_value
        from canonical
        where canonical_type is not null
        group by canonical_type, canonical_value
        having count(*) >= 2
          and sum(
            case when estado not in ('resuelto', 'cerrado') then 1 else 0 end
          ) >= 1
      )
      select
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
      inner join repeated_keys
        on repeated_keys.canonical_type = canonical.canonical_type
        and repeated_keys.canonical_value = canonical.canonical_value
      left join ${usuariosTable}
        on ${usuariosTable.id} = canonical.asignado_usuario_id
      order by
        canonical.canonical_type,
        canonical.canonical_value,
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
      (left, right) =>
        Number(right.vencidos_abiertos > 0) -
          Number(left.vencidos_abiertos > 0) ||
        PRIORITY_WEIGHT[right.prioridad_maxima] -
          PRIORITY_WEIGHT[left.prioridad_maxima] ||
        (right.antiguedad_abierto_horas ?? 0) -
          (left.antiguedad_abierto_horas ?? 0) ||
        right.ultimo_contacto.getTime() - left.ultimo_contacto.getTime() ||
        compareText(left._canonical_type, right._canonical_type) ||
        compareText(left._canonical_value, right._canonical_value),
    );

    const publicContacts = contacts.map(
      (
        { _canonical_type: _type, _canonical_value: _value, ...contact },
        index,
      ) => ({
        ...contact,
        grupo_id: `grupo-${index + 1}`,
      }),
    );
    const evaluatedTickets = Number(coverage.tickets_evaluados);
    const usableIdentities = Number(coverage.identidad_utilizable);

    return {
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
        contactos_reiterados: publicContacts.length,
        tickets_involucrados: publicContacts.reduce(
          (total, contact) => total + contact.cantidad_llamados,
          0,
        ),
        abiertos: publicContacts.reduce(
          (total, contact) => total + contact.abiertos,
          0,
        ),
        vencidos_abiertos: publicContacts.reduce(
          (total, contact) => total + contact.vencidos_abiertos,
          0,
        ),
      },
      contactos: publicContacts,
    };
  });
}
