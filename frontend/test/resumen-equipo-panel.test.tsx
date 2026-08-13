import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ResumenEquipoPanelProps } from "../src/features/rendimiento/ResumenEquipoPanel.tsx";
import { ResumenEquipoPanel } from "../src/features/rendimiento/ResumenEquipoPanel.tsx";
import { assertNoAxeViolations } from "./axe.ts";

const BASE_PROPS: ResumenEquipoPanelProps = {
  periodo: {
    fecha_desde: "2026-08-01",
    fecha_hasta: "2026-08-13",
    timezone: "America/Argentina/Buenos_Aires",
    generado_en: "2026-08-13T15:00:00.000Z",
  },
  tickets_ingresados: 154,
  estado_actual: {
    total: 154,
    abiertos: 64,
    finalizados: 90,
    vencidos_abiertos: 12,
  },
  resolucion_con_fecha: {
    muestra: 75,
    promedio_horas: 25.5,
    mediana_horas: 18.25,
  },
  cumplimiento_plazo_auditable: {
    muestra: 72,
    cumplidos: 58,
    porcentaje: 80.6,
  },
  distribucion_estado: {
    nuevo: 20,
    en_proceso: 30,
    pendiente: 14,
    resuelto: 50,
    cerrado: 40,
  },
  distribucion_prioridad: {
    baja: 24,
    media: 72,
    alta: 40,
    urgente: 18,
  },
};

test("presenta KPIs, distribuciones, tiempos y SLA con sus muestras", async (t) => {
  t.after(cleanup);
  render(
    <main>
      <ResumenEquipoPanel {...BASE_PROPS} />
    </main>,
  );

  assert.ok(screen.getByRole("heading", { name: "Resumen del equipo" }));
  assert.ok(screen.getByText("01/08/2026 al 13/08/2026"));

  for (const heading of [
    "Tickets ingresados",
    "Abiertos",
    "Finalizados",
    "Vencidos abiertos",
    "Flujo y estado actual",
    "Tiempo de resolución",
    "Cumplimiento del plazo",
  ]) {
    assert.ok(screen.getByRole("heading", { name: heading }));
  }

  const states = screen.getByRole("heading", {
    name: "Distribución por estado",
  });
  assert.equal(states.id, "rendimiento-distribucion-estado");
  assert.ok(screen.getByRole("img", { name: "Nuevo: 20 de 154 tickets" }));
  assert.ok(screen.getByRole("img", { name: "Urgente: 18 de 154 tickets" }));

  const timing = screen
    .getByRole("heading", { name: "Tiempo de resolución" })
    .closest<HTMLElement>("div.rounded-xl");
  assert.ok(timing);
  assert.ok(within(timing).getByText("18 h 15 min"));
  assert.ok(within(timing).getByText("25 h 30 min"));
  assert.ok(within(timing).getByText("Muestra: 75 tickets"));
  assert.ok(within(timing).getByText(/Cobertura parcial:/));

  const sla = screen
    .getByRole("heading", { name: "Cumplimiento del plazo" })
    .closest<HTMLElement>("div.rounded-xl");
  assert.ok(sla);
  assert.ok(within(sla).getByText("80,6%"));
  assert.ok(within(sla).getByText("58 de 72 resoluciones"));
  assert.ok(within(sla).getByText(/Muestra auditable:/));
  assert.equal(within(sla).queryByText(/tickets finalizados/), null);
  assert.ok(
    within(sla).getByRole("progressbar", {
      name: "Cumplimiento del plazo",
    }),
  );

  await assertNoAxeViolations();
});

test("mantiene muestras de SLA mayores a los finalizados sin recortarlas", (t) => {
  t.after(cleanup);
  render(
    <ResumenEquipoPanel
      {...BASE_PROPS}
      estado_actual={{
        ...BASE_PROPS.estado_actual,
        finalizados: 8,
      }}
      cumplimiento_plazo_auditable={{
        muestra: 12,
        cumplidos: 9,
        porcentaje: 75,
      }}
    />,
  );

  assert.ok(screen.getByText("9 de 12 resoluciones"));
  assert.ok(screen.getByText("Muestra: 12"));
});

test("presenta estados analíticos vacíos sin inventar valores", (t) => {
  t.after(cleanup);
  render(
    <ResumenEquipoPanel
      {...BASE_PROPS}
      resolucion_con_fecha={{
        muestra: 0,
        promedio_horas: null,
        mediana_horas: null,
      }}
      cumplimiento_plazo_auditable={{
        muestra: 0,
        cumplidos: 0,
        porcentaje: null,
      }}
      distribucion_estado={{
        nuevo: 0,
        en_proceso: 0,
        pendiente: 0,
        resuelto: 0,
        cerrado: 0,
      }}
      distribucion_prioridad={{
        baja: 0,
        media: 0,
        alta: 0,
        urgente: 0,
      }}
    />,
  );

  assert.ok(
    screen.getByRole("heading", {
      name: "Sin tiempos de resolución disponibles",
    }),
  );
  assert.ok(
    screen.getByRole("heading", {
      name: "Sin muestra para medir cumplimiento",
    }),
  );
  assert.equal(screen.getAllByText("Sin datos para distribuir.").length, 2);
  assert.equal(screen.queryByText("0%"), null);
});

test("presenta un estado vacío general cuando la cohorte no tiene actividad", (t) => {
  t.after(cleanup);
  render(
    <ResumenEquipoPanel
      periodo={BASE_PROPS.periodo}
      tickets_ingresados={0}
      estado_actual={{
        total: 0,
        abiertos: 0,
        finalizados: 0,
        vencidos_abiertos: 0,
      }}
      resolucion_con_fecha={{
        muestra: 0,
        promedio_horas: null,
        mediana_horas: null,
      }}
      cumplimiento_plazo_auditable={{
        muestra: 0,
        cumplidos: 0,
        porcentaje: null,
      }}
      distribucion_estado={{
        nuevo: 0,
        en_proceso: 0,
        pendiente: 0,
        resuelto: 0,
        cerrado: 0,
      }}
      distribucion_prioridad={{
        baja: 0,
        media: 0,
        alta: 0,
        urgente: 0,
      }}
    />,
  );

  assert.ok(
    screen.getByRole("heading", { name: "No hay actividad en este período" }),
  );
  assert.equal(
    screen.queryByRole("heading", { name: "Tickets ingresados" }),
    null,
  );
});
