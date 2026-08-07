import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADMIN_TICKET_LIST_NAVIGATION_SOURCE,
  createAdminTicketDetailNavigationState,
  createTicketDetailNavigationState,
  getAdminTicketListReturnTo,
  getTicketListReturnTo,
  parseAdminTicketDetailNavigationState,
  parseTicketDetailNavigationState,
  TICKET_LIST_NAVIGATION_SOURCE,
} from "../src/lib/ticket-navigation.ts";

describe("navegación contextual entre listado y detalle", () => {
  it("crea un estado discriminado con el listado como retorno", () => {
    assert.deepEqual(createTicketDetailNavigationState(), {
      source: TICKET_LIST_NAVIGATION_SOURCE,
      returnTo: "/tickets",
    });
  });

  it("normaliza la query antes de guardarla en history.state", () => {
    const state = createTicketDetailNavigationState(
      "page=3&estado=pendiente&limit=25&desconocido=ignorado",
    );

    assert.deepEqual(state, {
      source: "ticket-list",
      returnTo: "/tickets?estado=pendiente&page=3&limit=25",
    });
  });

  it("omite valores predeterminados o inválidos del retorno", () => {
    assert.equal(
      createTicketDetailNavigationState("page=1&limit=10&estado=otro").returnTo,
      "/tickets",
    );
  });

  it("acepta un estado válido sin confiar en su tipo declarado", () => {
    const unknownState: unknown = {
      source: "ticket-list",
      returnTo:
        "/tickets?search=Ana+P%C3%A9rez&sort=prioridad%3Adesc%2Ccontacto%3Aasc",
      datoAjeno: true,
    };

    assert.deepEqual(parseTicketDetailNavigationState(unknownState), {
      source: "ticket-list",
      returnTo:
        "/tickets?search=Ana+P%C3%A9rez&sort=prioridad%3Adesc%2Ccontacto%3Aasc",
    });
    assert.equal(
      getTicketListReturnTo(unknownState),
      "/tickets?search=Ana+P%C3%A9rez&sort=prioridad%3Adesc%2Ccontacto%3Aasc",
    );
  });

  it("rechaza valores desconocidos, incompletos o con otro origen", () => {
    for (const state of [
      undefined,
      null,
      true,
      "ticket-list",
      [],
      {},
      { source: "admin-ticket-list", returnTo: "/tickets" },
      { source: "ticket-list" },
      { source: "ticket-list", returnTo: 123 },
    ]) {
      assert.equal(getTicketListReturnTo(state), undefined);
    }
  });

  it("rechaza rutas externas, esquemas, hashes y subrutas", () => {
    for (const returnTo of [
      "https://evil.example/tickets",
      "http://evil.example/tickets",
      "javascript:alert(1)",
      "//evil.example/tickets",
      "/dashboard",
      "/tickets/",
      "/tickets/42",
      "/tickets#resumen",
      "/tickets?estado=nuevo#resumen",
      "/tickets%2F42",
    ]) {
      assert.equal(
        getTicketListReturnTo({ source: "ticket-list", returnTo }),
        undefined,
      );
    }
  });

  it("rechaza queries vacías, desconocidas o no canónicas", () => {
    for (const returnTo of [
      "/tickets?",
      "/tickets?desconocido=1",
      "/tickets?page=1",
      "/tickets?limit=10",
      "/tickets?page=3&estado=pendiente&limit=25",
      "/tickets?estado=pendiente&estado=nuevo",
      "/tickets?estado=pendiente&",
    ]) {
      assert.equal(
        getTicketListReturnTo({ source: "ticket-list", returnTo }),
        undefined,
      );
    }
  });

  it("devuelve undefined si un estado hostil lanza al inspeccionarlo", () => {
    const hostileState = Object.defineProperty({}, "source", {
      get(): never {
        throw new Error("getter hostil");
      },
    });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();

    assert.equal(parseTicketDetailNavigationState(hostileState), undefined);
    assert.equal(parseTicketDetailNavigationState(revoked.proxy), undefined);
  });

  it("lee una sola vez cada propiedad validada del estado", () => {
    let returnToReads = 0;
    const changingState = {
      source: "ticket-list",
      get returnTo(): string {
        returnToReads += 1;
        return returnToReads === 1 ? "/tickets" : "https://evil.example";
      },
    };

    assert.deepEqual(parseTicketDetailNavigationState(changingState), {
      source: "ticket-list",
      returnTo: "/tickets",
    });
    assert.equal(returnToReads, 1);
  });

  it("no acepta propiedades heredadas como estado de history", () => {
    const inheritedState = Object.create({
      source: "ticket-list",
      returnTo: "/tickets",
    }) as unknown;

    assert.equal(parseTicketDetailNavigationState(inheritedState), undefined);
  });
});

describe("navegación contextual desde Administración", () => {
  it("crea un estado discriminado con Administración como retorno", () => {
    assert.deepEqual(createAdminTicketDetailNavigationState(), {
      source: ADMIN_TICKET_LIST_NAVIGATION_SOURCE,
      returnTo: "/admin",
    });
  });

  it("normaliza la query y fuerza el retorno a Registros", () => {
    const state = createAdminTicketDetailNavigationState(
      "tab=peligro&page=3&search=Ana&limit=25&desconocido=ignorado",
    );

    assert.deepEqual(state, {
      source: "admin-ticket-list",
      returnTo: "/admin?search=Ana&page=3&limit=25",
    });
  });

  it("acepta únicamente un retorno administrativo canónico", () => {
    const unknownState: unknown = {
      source: "admin-ticket-list",
      returnTo:
        "/admin?search=Ana&sort=prioridad%3Adesc%2Ccontacto%3Aasc&page=2",
      datoAjeno: true,
    };

    assert.deepEqual(parseAdminTicketDetailNavigationState(unknownState), {
      source: "admin-ticket-list",
      returnTo:
        "/admin?search=Ana&sort=prioridad%3Adesc%2Ccontacto%3Aasc&page=2",
    });
    assert.equal(
      getAdminTicketListReturnTo(unknownState),
      "/admin?search=Ana&sort=prioridad%3Adesc%2Ccontacto%3Aasc&page=2",
    );
  });

  it("rechaza valores desconocidos, incompletos o de Tickets", () => {
    for (const state of [
      undefined,
      null,
      [],
      {},
      { source: "ticket-list", returnTo: "/admin" },
      { source: "admin-ticket-list" },
      { source: "admin-ticket-list", returnTo: 123 },
    ]) {
      assert.equal(getAdminTicketListReturnTo(state), undefined);
    }
  });

  it("rechaza rutas externas, hashes, subrutas y otras pestañas", () => {
    for (const returnTo of [
      "https://evil.example/admin",
      "javascript:alert(1)",
      "//evil.example/admin",
      "/dashboard",
      "/admin/",
      "/admin/tickets/42",
      "/admin#registros",
      "/admin?tab=peligro",
      "/admin?tab=importar&page=2",
    ]) {
      assert.equal(
        getAdminTicketListReturnTo({
          source: "admin-ticket-list",
          returnTo,
        }),
        undefined,
      );
    }
  });

  it("rechaza queries vacías, desconocidas o no canónicas", () => {
    for (const returnTo of [
      "/admin?",
      "/admin?desconocido=1",
      "/admin?page=1",
      "/admin?limit=10",
      "/admin?page=3&search=Ana&limit=25",
      "/admin?search=Ana&search=Otra",
      "/admin?sort=progreso%3Aasc",
    ]) {
      assert.equal(
        getAdminTicketListReturnTo({
          source: "admin-ticket-list",
          returnTo,
        }),
        undefined,
      );
    }
  });

  it("rechaza objetos hostiles y propiedades heredadas", () => {
    const hostileState = Object.defineProperty({}, "source", {
      get(): never {
        throw new Error("getter hostil");
      },
    });
    const inheritedState = Object.create({
      source: "admin-ticket-list",
      returnTo: "/admin",
    }) as unknown;
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();

    assert.equal(
      parseAdminTicketDetailNavigationState(hostileState),
      undefined,
    );
    assert.equal(
      parseAdminTicketDetailNavigationState(inheritedState),
      undefined,
    );
    assert.equal(
      parseAdminTicketDetailNavigationState(revoked.proxy),
      undefined,
    );
  });

  it("lee una sola vez cada propiedad validada", () => {
    let returnToReads = 0;
    const changingState = {
      source: "admin-ticket-list",
      get returnTo(): string {
        returnToReads += 1;
        return returnToReads === 1 ? "/admin" : "https://evil.example";
      },
    };

    assert.deepEqual(parseAdminTicketDetailNavigationState(changingState), {
      source: "admin-ticket-list",
      returnTo: "/admin",
    });
    assert.equal(returnToReads, 1);
  });
});
