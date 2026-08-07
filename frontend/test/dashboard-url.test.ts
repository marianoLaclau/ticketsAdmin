import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultDashboardUrlState,
  parseDashboardUrlState,
  serializeDashboardUrlState,
  type DashboardUrlState,
} from "../src/lib/dashboard-url.ts";

describe("codec URL del dashboard", () => {
  it("omite el período predeterminado", () => {
    const state = createDefaultDashboardUrlState();

    assert.deepEqual(parseDashboardUrlState(""), state);
    assert.deepEqual(parseDashboardUrlState("periodo=todo"), state);
    assert.equal(serializeDashboardUrlState(state).toString(), "");
  });

  it("mantiene los períodos predefinidos en un roundtrip", () => {
    for (const periodo of ["semana", "mes"] as const) {
      const state: DashboardUrlState = { periodo };
      const serialized = serializeDashboardUrlState(state);

      assert.equal(serialized.toString(), `periodo=${periodo}`);
      assert.deepEqual(parseDashboardUrlState(serialized), state);
    }
  });

  it("mantiene un período personalizado válido y lo serializa en orden estable", () => {
    const state: DashboardUrlState = {
      periodo: "personalizado",
      fecha_desde: "2026-08-01",
      fecha_hasta: "2026-08-07",
    };

    const serialized = serializeDashboardUrlState(state);

    assert.equal(
      serialized.toString(),
      "periodo=personalizado&fecha_desde=2026-08-01&fecha_hasta=2026-08-07",
    );
    assert.deepEqual(parseDashboardUrlState(serialized), state);
  });

  it("acepta el 29 de febrero solamente en años bisiestos", () => {
    assert.deepEqual(
      parseDashboardUrlState(
        "periodo=personalizado&fecha_desde=2024-02-29&fecha_hasta=2024-03-01",
      ),
      {
        periodo: "personalizado",
        fecha_desde: "2024-02-29",
        fecha_hasta: "2024-03-01",
      },
    );
    assert.deepEqual(
      parseDashboardUrlState(
        "periodo=personalizado&fecha_desde=2026-02-29&fecha_hasta=2026-03-01",
      ),
      createDefaultDashboardUrlState(),
    );
  });

  it("descarta completamente un rango con fechas imposibles", () => {
    for (const query of [
      "periodo=personalizado&fecha_desde=2026-04-31&fecha_hasta=2026-05-01",
      "periodo=personalizado&fecha_desde=2026-04-01&fecha_hasta=2026-13-01",
      "periodo=personalizado&fecha_desde=0000-01-01&fecha_hasta=2026-01-01",
    ]) {
      assert.deepEqual(
        parseDashboardUrlState(query),
        createDefaultDashboardUrlState(),
      );
    }
  });

  it("descarta completamente un rango invertido", () => {
    assert.deepEqual(
      parseDashboardUrlState(
        "periodo=personalizado&fecha_desde=2026-08-08&fecha_hasta=2026-08-07",
      ),
      createDefaultDashboardUrlState(),
    );
  });

  it("descarta completamente un rango incompleto", () => {
    for (const query of [
      "periodo=personalizado",
      "periodo=personalizado&fecha_desde=2026-08-01",
      "periodo=personalizado&fecha_hasta=2026-08-07",
    ]) {
      assert.deepEqual(
        parseDashboardUrlState(query),
        createDefaultDashboardUrlState(),
      );
    }
  });

  it("descarta un período desconocido junto con sus fechas", () => {
    assert.deepEqual(
      parseDashboardUrlState(
        "periodo=trimestre&fecha_desde=2026-08-01&fecha_hasta=2026-08-07",
      ),
      createDefaultDashboardUrlState(),
    );
  });

  it("ignora las fechas cuando el período no es personalizado", () => {
    const parsed = parseDashboardUrlState(
      "periodo=mes&fecha_desde=2026-08-01&fecha_hasta=2026-08-07",
    );

    assert.deepEqual(parsed, { periodo: "mes" });
    assert.equal(serializeDashboardUrlState(parsed).toString(), "periodo=mes");
  });

  it("canoniza duplicados y elimina parámetros ajenos", () => {
    const parsed = parseDashboardUrlState(
      "utm_source=prueba&periodo=mes&periodo=semana&fecha_desde=2026-08-01" +
        "&fecha_hasta=2026-08-07&vista=compacta",
    );

    assert.deepEqual(parsed, { periodo: "mes" });
    assert.equal(serializeDashboardUrlState(parsed).toString(), "periodo=mes");
  });

  it("sanea estados inválidos también al serializar", () => {
    for (const unsafeState of [
      null,
      [],
      { periodo: "trimestre" },
      { periodo: "personalizado" },
      {
        periodo: "personalizado",
        fecha_desde: "2026-08-08",
        fecha_hasta: "2026-08-07",
      },
      {
        periodo: "personalizado",
        fecha_desde: "2026-02-30",
        fecha_hasta: "2026-03-01",
      },
    ]) {
      assert.equal(
        serializeDashboardUrlState(
          unsafeState as unknown as DashboardUrlState,
        ).toString(),
        "",
      );
    }

    assert.equal(
      serializeDashboardUrlState({
        periodo: "semana",
        fecha_desde: "fecha-ajena",
        fecha_hasta: "fecha-ajena",
      } as unknown as DashboardUrlState).toString(),
      "periodo=semana",
    );
  });

  it("rechaza propiedades heredadas y estados hostiles", () => {
    const inheritedState = Object.create({ periodo: "semana" }) as unknown;
    const hostileState = Object.defineProperty({}, "periodo", {
      get(): never {
        throw new Error("getter hostil");
      },
    });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();

    for (const unsafeState of [inheritedState, hostileState, revoked.proxy]) {
      assert.equal(
        serializeDashboardUrlState(
          unsafeState as unknown as DashboardUrlState,
        ).toString(),
        "",
      );
    }
  });

  it("lee una sola vez cada propiedad validada", () => {
    let periodReads = 0;
    const changingState = {
      get periodo(): string {
        periodReads += 1;
        return periodReads === 1 ? "semana" : "personalizado";
      },
    };

    assert.equal(
      serializeDashboardUrlState(
        changingState as unknown as DashboardUrlState,
      ).toString(),
      "periodo=semana",
    );
    assert.equal(periodReads, 1);
  });
});
