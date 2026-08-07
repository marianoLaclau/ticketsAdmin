import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ListTicketsEstado,
  ListTicketsPrioridad,
  MotivoCategoria,
  TicketSortBy,
} from "../../lib/api-client-react/src/generated/api.schemas.ts";
import { isValidCalendarDate } from "../src/lib/calendar-date.ts";
import {
  createDefaultTicketListUrlState,
  isValidLocalTime,
  parseTicketListUrlState,
  serializeTicketListUrlState,
  TICKET_LIST_MOTIVE_CATEGORIES,
  TICKET_LIST_PRIORITIES,
  TICKET_LIST_SORT_COLUMNS,
  TICKET_LIST_STATES,
  type TicketListUrlState,
} from "../src/lib/ticket-list-url.ts";

describe("codec URL del listado de tickets", () => {
  it("omite los valores predeterminados", () => {
    const state = createDefaultTicketListUrlState();

    assert.deepEqual(parseTicketListUrlState(""), state);
    assert.equal(serializeTicketListUrlState(state).toString(), "");
  });

  it("mantiene sus allowlists alineadas con el contrato generado", () => {
    assert.deepEqual(
      [...TICKET_LIST_STATES].sort(),
      Object.values(ListTicketsEstado).sort(),
    );
    assert.deepEqual(
      [...TICKET_LIST_PRIORITIES].sort(),
      Object.values(ListTicketsPrioridad).sort(),
    );
    assert.deepEqual(
      [...TICKET_LIST_MOTIVE_CATEGORIES].sort(),
      Object.values(MotivoCategoria).sort(),
    );
    assert.deepEqual(
      [...TICKET_LIST_SORT_COLUMNS].sort(),
      Object.values(TicketSortBy).sort(),
    );
  });

  it("conserva filtros, orden compuesto y paginación en un roundtrip", () => {
    const params = new URLSearchParams();
    params.set("search", "  Ana Pérez  ");
    params.set("estado", "pendiente");
    params.set("prioridad", "urgente");
    params.set("motivo_categoria", "embargos");
    params.set("vencidos", "1");
    params.set("fecha_desde", "2026-08-01");
    params.set("fecha_hasta", "2026-08-07");
    params.set("hora_desde", "08:05");
    params.set("hora_hasta", "18:30");
    params.set("empresa", "GSB & Asociados");
    params.set("sort", "prioridad:desc,contacto:asc");
    params.set("page", "3");
    params.set("limit", "25");

    const parsed = parseTicketListUrlState(params);
    assert.deepEqual(parsed, {
      filters: {
        search: "  Ana Pérez  ",
        estado: "pendiente",
        prioridad: "urgente",
        motivo_categoria: "embargos",
        vencidos: true,
        fecha_desde: "2026-08-01",
        fecha_hasta: "2026-08-07",
        hora_desde: "08:05",
        hora_hasta: "18:30",
        empresa: "GSB & Asociados",
      },
      sort: [
        { sortBy: "prioridad", order: "desc" },
        { sortBy: "contacto", order: "asc" },
      ],
      page: 3,
      limit: 25,
    });

    const serialized = serializeTicketListUrlState(parsed);
    assert.deepEqual(parseTicketListUrlState(serialized), parsed);
    assert.equal(serialized.get("search"), "  Ana Pérez  ");
    assert.equal(serialized.get("empresa"), "GSB & Asociados");
  });

  it("descarta filtros y paginación inválidos sin enviarlos a la API", () => {
    const parsed = parseTicketListUrlState(
      "search=+++&empresa=%20&estado=desconocido&prioridad=critica" +
        "&motivo_categoria=otra&vencidos=true&fecha_desde=2026-02-30" +
        "&fecha_hasta=2026-13-01&hora_desde=24:00&hora_hasta=9:30" +
        "&page=0&limit=11",
    );

    assert.deepEqual(parsed, createDefaultTicketListUrlState());
  });

  it("valida fechas reales y horas locales con ceros iniciales", () => {
    assert.equal(isValidCalendarDate("2024-02-29"), true);
    assert.equal(isValidCalendarDate("2026-02-29"), false);
    assert.equal(isValidCalendarDate("0000-01-01"), false);
    assert.equal(isValidCalendarDate("2026-04-31"), false);
    assert.equal(isValidCalendarDate("2026-04-30"), true);

    assert.equal(isValidLocalTime("00:00"), true);
    assert.equal(isValidLocalTime("23:59"), true);
    assert.equal(isValidLocalTime("24:00"), false);
    assert.equal(isValidLocalTime("9:05"), false);
  });

  it("rechaza todo el orden compuesto si una regla es inválida o duplicada", () => {
    for (const sort of [
      "desconocida:asc",
      "prioridad:up",
      "prioridad:asc,prioridad:desc",
      "prioridad:asc,",
      "prioridad",
      "prioridad:asc:extra",
    ]) {
      assert.deepEqual(parseTicketListUrlState(`sort=${sort}`).sort, [
        { sortBy: "fecha_creacion", order: "desc" },
      ]);
    }
  });

  it("acepta el espaciado admitido por el backend y lo canoniza", () => {
    const parsed = parseTicketListUrlState(
      "sort=prioridad%3A%20desc%2C%20contacto%3Aasc",
    );

    assert.deepEqual(parsed.sort, [
      { sortBy: "prioridad", order: "desc" },
      { sortBy: "contacto", order: "asc" },
    ]);
    assert.equal(
      serializeTicketListUrlState(parsed).get("sort"),
      "prioridad:desc,contacto:asc",
    );
  });

  it("solo admite enteros seguros positivos y límites permitidos", () => {
    const maxSafePageForDefaultLimit =
      Math.floor(Number.MAX_SAFE_INTEGER / 10) + 1;
    assert.equal(
      parseTicketListUrlState(`page=${maxSafePageForDefaultLimit}`).page,
      maxSafePageForDefaultLimit,
    );
    for (const page of [
      "-1",
      "1.5",
      "01",
      "2x",
      String(maxSafePageForDefaultLimit + 1),
      "9007199254740992",
    ]) {
      assert.equal(parseTicketListUrlState(`page=${page}`).page, 1);
    }
    for (const limit of [10, 25, 50, 100] as const) {
      assert.equal(parseTicketListUrlState(`limit=${limit}`).limit, limit);
    }
    for (const limit of ["0", "20", "101", "10.0"]) {
      assert.equal(parseTicketListUrlState(`limit=${limit}`).limit, 10);
    }
  });

  it("sanea valores inválidos también al serializar", () => {
    const unsafeState = {
      filters: {
        estado: "desconocido",
        prioridad: "critica",
        motivo_categoria: "otra",
        fecha_desde: "2026-02-30",
        hora_desde: "25:00",
        vencidos: false,
      },
      sort: [
        { sortBy: "prioridad", order: "asc" },
        { sortBy: "prioridad", order: "desc" },
      ],
      page: -2,
      limit: 20,
    } as unknown as TicketListUrlState;

    assert.equal(serializeTicketListUrlState(unsafeState).toString(), "");
  });
});
