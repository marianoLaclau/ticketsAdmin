import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADMIN_TICKETS_TABS,
  createDefaultAdminTicketsUrlState,
  parseAdminTicketsUrlState,
  serializeAdminTicketsUrlState,
  type AdminTicketsUrlState,
} from "../src/lib/admin-tickets-url.ts";

describe("codec URL de tickets administrativos", () => {
  it("omite el estado predeterminado", () => {
    const state = createDefaultAdminTicketsUrlState();

    assert.deepEqual(parseAdminTicketsUrlState(""), state);
    assert.equal(serializeAdminTicketsUrlState(state).toString(), "");
  });

  it("declara y conserva todas las pestañas administrativas", () => {
    assert.deepEqual(ADMIN_TICKETS_TABS, ["registros", "importar", "peligro"]);
    assert.equal(Object.isFrozen(ADMIN_TICKETS_TABS), true);

    for (const tab of ADMIN_TICKETS_TABS) {
      const state = { ...createDefaultAdminTicketsUrlState(), tab };
      const serialized = serializeAdminTicketsUrlState(state);

      assert.deepEqual(parseAdminTicketsUrlState(serialized), state);
      assert.equal(serialized.get("tab"), tab === "registros" ? null : tab);
    }
  });

  it("conserva pestaña, búsqueda, orden compuesto y paginación", () => {
    const state: AdminTicketsUrlState = {
      tab: "importar",
      search: "  Ana Pérez  ",
      sort: [
        { sortBy: "prioridad", order: "desc" },
        { sortBy: "contacto", order: "asc" },
      ],
      page: 3,
      limit: 25,
    };

    const serialized = serializeAdminTicketsUrlState(state);

    assert.equal(
      serialized.toString(),
      "tab=importar&search=++Ana+P%C3%A9rez++&sort=prioridad%3Adesc%2Ccontacto%3Aasc&page=3&limit=25",
    );
    assert.deepEqual(parseAdminTicketsUrlState(serialized), state);
  });

  it("descarta parámetros ajenos y valores inválidos", () => {
    const parsed = parseAdminTicketsUrlState(
      "tab=auditoria&search=+++&sort=desconocida%3Aasc&page=-2&limit=20" +
        "&estado=pendiente&admin_api_key=no-debe-sobrevivir",
    );

    assert.deepEqual(parsed, createDefaultAdminTicketsUrlState());
    assert.equal(serializeAdminTicketsUrlState(parsed).toString(), "");
  });

  it("canoniza duplicados y conserva sólo el primer valor", () => {
    const parsed = parseAdminTicketsUrlState(
      "tab=peligro&tab=importar&search=primera&search=segunda" +
        "&sort=prioridad%3Aasc&sort=contacto%3Adesc&page=2&page=4" +
        "&limit=50&limit=100&utm_source=prueba",
    );

    assert.deepEqual(parsed, {
      tab: "peligro",
      search: "primera",
      sort: [{ sortBy: "prioridad", order: "asc" }],
      page: 2,
      limit: 50,
    });
    assert.equal(
      serializeAdminTicketsUrlState(parsed).toString(),
      "tab=peligro&search=primera&sort=prioridad%3Aasc&page=2&limit=50",
    );
  });

  it("reutiliza la validación estricta de páginas y límites", () => {
    const maxSafePageForDefaultLimit =
      Math.floor(Number.MAX_SAFE_INTEGER / 10) + 1;

    assert.equal(
      parseAdminTicketsUrlState(`page=${maxSafePageForDefaultLimit}`).page,
      maxSafePageForDefaultLimit,
    );
    assert.equal(
      parseAdminTicketsUrlState(`page=${maxSafePageForDefaultLimit + 1}`).page,
      1,
    );
    assert.equal(parseAdminTicketsUrlState("limit=100").limit, 100);
    assert.equal(parseAdminTicketsUrlState("limit=10.0").limit, 10);
  });

  it("sanea estados inválidos también al serializar", () => {
    for (const unsafeState of [
      null,
      [],
      { tab: "auditoria", sort: [], page: -1, limit: 20 },
    ]) {
      assert.equal(
        serializeAdminTicketsUrlState(
          unsafeState as unknown as AdminTicketsUrlState,
        ).toString(),
        "",
      );
    }

    assert.equal(
      serializeAdminTicketsUrlState({
        tab: "registros",
        search: "   ",
        sort: [{ sortBy: "prioridad", order: "arriba" }],
        page: Number.POSITIVE_INFINITY,
        limit: 25,
      } as unknown as AdminTicketsUrlState).toString(),
      "limit=25",
    );
  });

  it("rechaza propiedades heredadas, getters hostiles y proxies revocados", () => {
    const inheritedState = Object.create({
      tab: "importar",
      sort: [{ sortBy: "prioridad", order: "asc" }],
      page: 2,
      limit: 25,
    }) as unknown;
    const hostileState = Object.defineProperty({}, "tab", {
      get(): never {
        throw new Error("getter hostil");
      },
    });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();

    for (const unsafeState of [inheritedState, hostileState, revoked.proxy]) {
      assert.equal(
        serializeAdminTicketsUrlState(
          unsafeState as unknown as AdminTicketsUrlState,
        ).toString(),
        "",
      );
    }
  });

  it("lee una sola vez cada propiedad validada", () => {
    const reads = { tab: 0, search: 0, sort: 0, page: 0, limit: 0 };
    const changingState = {
      get tab(): string {
        reads.tab += 1;
        return reads.tab === 1 ? "importar" : "peligro";
      },
      get search(): string {
        reads.search += 1;
        return reads.search === 1 ? "Ana" : "otra";
      },
      get sort(): unknown {
        reads.sort += 1;
        return reads.sort === 1
          ? [{ sortBy: "prioridad", order: "asc" }]
          : [{ sortBy: "contacto", order: "desc" }];
      },
      get page(): number {
        reads.page += 1;
        return reads.page === 1 ? 2 : 9;
      },
      get limit(): number {
        reads.limit += 1;
        return reads.limit === 1 ? 25 : 100;
      },
    };

    assert.equal(
      serializeAdminTicketsUrlState(
        changingState as unknown as AdminTicketsUrlState,
      ).toString(),
      "tab=importar&search=Ana&sort=prioridad%3Aasc&page=2&limit=25",
    );
    assert.deepEqual(reads, {
      tab: 1,
      search: 1,
      sort: 1,
      page: 1,
      limit: 1,
    });
  });
});
