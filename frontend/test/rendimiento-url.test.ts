import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOTIVO_CATEGORIA_CODIGOS,
  PRIORIDADES_VALIDAS,
} from "@workspace/ingesta";
import {
  createDefaultRendimientoUrlState,
  parseRendimientoUrlState,
  serializeRendimientoUrlState,
  type RendimientoUrlState,
} from "../src/lib/rendimiento-url.ts";

describe("codec URL de Rendimiento", () => {
  it("usa mes como período predeterminado y lo omite de la URL", () => {
    const defaultState = createDefaultRendimientoUrlState();

    assert.deepEqual(defaultState, { periodo: "mes", vista: "equipo" });
    assert.deepEqual(parseRendimientoUrlState(""), defaultState);
    assert.deepEqual(parseRendimientoUrlState("periodo=mes"), defaultState);
    assert.equal(serializeRendimientoUrlState(defaultState).toString(), "");
  });

  it("valida la vista, omite equipo y conserva las vistas compartibles", () => {
    assert.deepEqual(parseRendimientoUrlState("vista=equipo"), {
      periodo: "mes",
      vista: "equipo",
    });
    assert.equal(
      serializeRendimientoUrlState({
        periodo: "mes",
        vista: "equipo",
      }).toString(),
      "",
    );

    for (const vista of ["personas", "reiteraciones", "calidad"] as const) {
      const state: RendimientoUrlState = { periodo: "mes", vista };
      assert.equal(
        serializeRendimientoUrlState(state).toString(),
        `vista=${vista}`,
      );
      assert.deepEqual(parseRendimientoUrlState(`vista=${vista}`), state);
    }

    assert.deepEqual(parseRendimientoUrlState("vista=desconocida"), {
      periodo: "mes",
      vista: "equipo",
    });
    assert.deepEqual(parseRendimientoUrlState("vista=calidad&vista=personas"), {
      periodo: "mes",
      vista: "calidad",
    });
  });

  it("mantiene todos los períodos predefinidos en un roundtrip", () => {
    for (const periodo of ["semana", "ultimos_30", "ultimos_90"] as const) {
      const state: RendimientoUrlState = { periodo, vista: "equipo" };
      const serialized = serializeRendimientoUrlState(state);

      assert.equal(serialized.toString(), `periodo=${periodo}`);
      assert.deepEqual(parseRendimientoUrlState(serialized), state);
    }
  });

  it("mantiene un período personalizado completo y lo serializa en orden estable", () => {
    const state: RendimientoUrlState = {
      periodo: "personalizado",
      desde: "2026-08-01",
      hasta: "2026-08-31",
      empresa: "GSB IT",
      categoria: "legales",
      prioridad: "urgente",
      vista: "equipo",
    };

    const serialized = serializeRendimientoUrlState(state);

    assert.equal(
      serialized.toString(),
      "periodo=personalizado&desde=2026-08-01&hasta=2026-08-31" +
        "&empresa=GSB+IT&categoria=legales&prioridad=urgente",
    );
    assert.deepEqual(parseRendimientoUrlState(serialized), state);
  });

  it("acepta rangos de un solo día y el 29 de febrero solo en años bisiestos", () => {
    assert.deepEqual(
      parseRendimientoUrlState(
        "periodo=personalizado&desde=2026-08-13&hasta=2026-08-13",
      ),
      {
        periodo: "personalizado",
        desde: "2026-08-13",
        hasta: "2026-08-13",
        vista: "equipo",
      },
    );
    assert.deepEqual(
      parseRendimientoUrlState(
        "periodo=personalizado&desde=2024-02-29&hasta=2024-03-01",
      ),
      {
        periodo: "personalizado",
        desde: "2024-02-29",
        hasta: "2024-03-01",
        vista: "equipo",
      },
    );
    assert.deepEqual(
      parseRendimientoUrlState(
        "periodo=personalizado&desde=2026-02-29&hasta=2026-03-01",
      ),
      { periodo: "mes", vista: "equipo" },
    );
  });

  it("descarta rangos personalizados incompletos, imposibles o invertidos", () => {
    for (const query of [
      "periodo=personalizado",
      "periodo=personalizado&desde=2026-08-01",
      "periodo=personalizado&hasta=2026-08-31",
      "periodo=personalizado&desde=2026-04-31&hasta=2026-05-01",
      "periodo=personalizado&desde=2026-08-32&hasta=2026-09-01",
      "periodo=personalizado&desde=0000-01-01&hasta=2026-01-01",
      "periodo=personalizado&desde=2026-08-31&hasta=2026-08-01",
    ]) {
      assert.deepEqual(parseRendimientoUrlState(query), {
        periodo: "mes",
        vista: "equipo",
      });
    }
  });

  it("conserva filtros válidos aunque deba sanear el período", () => {
    const expected: RendimientoUrlState = {
      periodo: "mes",
      empresa: "Empresa Uno",
      categoria: "embargos",
      prioridad: "alta",
      vista: "equipo",
    };

    for (const query of [
      "periodo=trimestre&desde=2026-08-01&hasta=2026-08-31",
      "periodo=personalizado&desde=2026-08-31&hasta=2026-08-01",
    ]) {
      const parsed = parseRendimientoUrlState(
        `${query}&empresa=Empresa+Uno&categoria=embargos&prioridad=alta`,
      );

      assert.deepEqual(parsed, expected);
      assert.equal(
        serializeRendimientoUrlState(parsed).toString(),
        "empresa=Empresa+Uno&categoria=embargos&prioridad=alta",
      );
    }
  });

  it("ignora desde y hasta para períodos no personalizados", () => {
    const parsed = parseRendimientoUrlState(
      "periodo=ultimos_30&desde=2026-08-01&hasta=2026-08-31",
    );

    assert.deepEqual(parsed, { periodo: "ultimos_30", vista: "equipo" });
    assert.equal(
      serializeRendimientoUrlState(parsed).toString(),
      "periodo=ultimos_30",
    );
  });

  it("normaliza empresa y omite texto vacío", () => {
    assert.deepEqual(
      parseRendimientoUrlState("empresa=%20%20Grupo%20Maipu%20%20"),
      { periodo: "mes", empresa: "Grupo Maipu", vista: "equipo" },
    );
    assert.equal(
      serializeRendimientoUrlState({
        periodo: "mes",
        empresa: "  Grupo Maipu  ",
        vista: "equipo",
      }).toString(),
      "empresa=Grupo+Maipu",
    );

    for (const query of [
      "empresa=",
      "empresa=+++",
      "empresa=%09%0A",
    ] as const) {
      assert.deepEqual(parseRendimientoUrlState(query), {
        periodo: "mes",
        vista: "equipo",
      });
    }
  });

  it("acepta todo el catálogo compartido de categorías y prioridades", () => {
    for (const categoria of MOTIVO_CATEGORIA_CODIGOS) {
      const state = parseRendimientoUrlState(`categoria=${categoria}`);
      assert.equal(state.categoria, categoria);
      assert.equal(
        serializeRendimientoUrlState(state).toString(),
        `categoria=${categoria}`,
      );
    }

    for (const prioridad of PRIORIDADES_VALIDAS) {
      const state = parseRendimientoUrlState(`prioridad=${prioridad}`);
      assert.equal(state.prioridad, prioridad);
      assert.equal(
        serializeRendimientoUrlState(state).toString(),
        `prioridad=${prioridad}`,
      );
    }
  });

  it("descarta categorías y prioridades desconocidas de forma independiente", () => {
    assert.deepEqual(
      parseRendimientoUrlState(
        "empresa=GSB&categoria=desconocida&prioridad=critica",
      ),
      { periodo: "mes", empresa: "GSB", vista: "equipo" },
    );
  });

  it("descarta parámetros ajenos y canoniza duplicados con el primer valor", () => {
    const parsed = parseRendimientoUrlState(
      "utm_source=prueba&periodo=ultimos_90&periodo=semana" +
        "&desde=2026-08-01&hasta=2026-08-31" +
        "&empresa=Primera&empresa=Segunda&categoria=legales" +
        "&prioridad=urgente&vista=personas&fecha_desde=2020-01-01",
    );

    assert.deepEqual(parsed, {
      periodo: "ultimos_90",
      empresa: "Primera",
      categoria: "legales",
      prioridad: "urgente",
      vista: "personas",
    });
    assert.equal(
      serializeRendimientoUrlState(parsed).toString(),
      "periodo=ultimos_90&empresa=Primera&categoria=legales&prioridad=urgente" +
        "&vista=personas",
    );
  });

  it("produce la misma URL sin importar el orden de propiedades del estado", () => {
    const first = {
      prioridad: "media",
      empresa: "GSB",
      periodo: "semana",
      categoria: "reclamos",
      vista: "personas",
    } as const satisfies RendimientoUrlState;
    const second = {
      categoria: "reclamos",
      periodo: "semana",
      empresa: "GSB",
      prioridad: "media",
      vista: "personas",
    } as const satisfies RendimientoUrlState;

    assert.equal(
      serializeRendimientoUrlState(first).toString(),
      serializeRendimientoUrlState(second).toString(),
    );
  });

  it("es idempotente al canonizar una URL arbitraria", () => {
    const canonical = serializeRendimientoUrlState(
      parseRendimientoUrlState(
        "foo=1&prioridad=alta&empresa=%20GSB%20&periodo=mes&categoria=legales",
      ),
    ).toString();
    const canonicalAgain = serializeRendimientoUrlState(
      parseRendimientoUrlState(canonical),
    ).toString();

    assert.equal(canonical, "empresa=GSB&categoria=legales&prioridad=alta");
    assert.equal(canonicalAgain, canonical);
  });

  it("sanea estados inválidos también al serializar", () => {
    for (const unsafeState of [
      null,
      [],
      { periodo: "trimestre" },
      { periodo: "personalizado" },
      {
        periodo: "personalizado",
        desde: "2026-08-31",
        hasta: "2026-08-01",
      },
      {
        periodo: "personalizado",
        desde: "2026-02-30",
        hasta: "2026-03-01",
      },
    ]) {
      assert.equal(
        serializeRendimientoUrlState(
          unsafeState as unknown as RendimientoUrlState,
        ).toString(),
        "",
      );
    }

    assert.equal(
      serializeRendimientoUrlState({
        periodo: "semana",
        desde: "fecha-ajena",
        hasta: "fecha-ajena",
        empresa: "  GSB  ",
        categoria: "desconocida",
        prioridad: "critica",
      } as unknown as RendimientoUrlState).toString(),
      "periodo=semana&empresa=GSB",
    );
  });

  it("rechaza propiedades heredadas y estados hostiles", () => {
    const inheritedState = Object.create({
      periodo: "semana",
      empresa: "Heredada",
    }) as unknown;
    const hostileState = Object.defineProperty({}, "periodo", {
      get(): never {
        throw new Error("getter hostil");
      },
    });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();

    for (const unsafeState of [inheritedState, hostileState, revoked.proxy]) {
      assert.equal(
        serializeRendimientoUrlState(
          unsafeState as unknown as RendimientoUrlState,
        ).toString(),
        "",
      );
    }
  });

  it("lee una sola vez cada propiedad validada", () => {
    const reads = new Map<string, number>();
    const values: Record<string, unknown> = {
      periodo: "personalizado",
      desde: "2026-08-01",
      hasta: "2026-08-31",
      empresa: "GSB",
      categoria: "legales",
      prioridad: "alta",
      vista: "calidad",
    };
    const state = Object.fromEntries(
      Object.entries(values).map(([property, value]) => [
        property,
        {
          enumerable: true,
          get(): unknown {
            reads.set(property, (reads.get(property) ?? 0) + 1);
            return value;
          },
        },
      ]),
    );
    const withGetters = Object.defineProperties({}, state);

    assert.equal(
      serializeRendimientoUrlState(
        withGetters as unknown as RendimientoUrlState,
      ).toString(),
      "periodo=personalizado&desde=2026-08-01&hasta=2026-08-31" +
        "&empresa=GSB&categoria=legales&prioridad=alta&vista=calidad",
    );
    assert.deepEqual(Object.fromEntries(reads), {
      periodo: 1,
      desde: 1,
      hasta: 1,
      empresa: 1,
      categoria: 1,
      prioridad: 1,
      vista: 1,
    });
  });
});
