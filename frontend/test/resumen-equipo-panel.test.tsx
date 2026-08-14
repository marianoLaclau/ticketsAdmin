import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ResumenEquipoPanelProps } from "../src/features/rendimiento/ResumenEquipoPanel.tsx";
import { ResumenEquipoPanel } from "../src/features/rendimiento/ResumenEquipoPanel.tsx";
import {
  ResumenEquipoErrorState,
  ResumenEquipoLoadingState,
} from "../src/features/rendimiento/ResumenEquipoView.tsx";
import { assertNoAxeViolations } from "./axe.ts";

const BASE_PROPS: ResumenEquipoPanelProps = {
  periodo: {
    fecha_desde: "2026-08-01",
    fecha_hasta: "2026-08-13",
    timezone: "America/Argentina/Buenos_Aires",
    generado_en: "2026-08-13T15:00:00.000Z",
  },
  periodFilterLabel: "Mes actual",
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
  cumplimiento_plazo: {
    muestra: 72,
    cumplidos: 58,
    porcentaje: 80.6,
    muestra_auditable: 72,
    cumplidos_auditables: 58,
    muestra_historica_reconstruida: 0,
    cumplidos_historicos_reconstruidos: 0,
  },
  backlog_vencido: {
    abiertos: 64,
    con_plazo: 60,
    vencidos: 12,
    porcentaje: 18.75,
  },
  antiguedad_backlog: {
    muestra: 64,
    mediana_horas_habiles: 13.5,
  },
  cobertura_asignacion: {
    abiertos: 64,
    asignados: 53,
    sin_asignar: 11,
    porcentaje: 82.8125,
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
  onClearFilters: () => {},
};

test("presenta volumen, indicadores operativos, distribuciones y tiempos con sus muestras", async (t) => {
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
    "Indicadores operativos",
    "Cumplimiento del plazo",
    "Backlog vencido",
    "Antigüedad del backlog",
    "Cobertura de asignación",
    "Flujo y estado actual",
    "Tiempo de resolución",
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
  assert.ok(
    within(timing).getByText(
      /Muestra: 75 tickets finalizados con fechas utilizables/,
    ),
  );
  assert.ok(
    within(timing).getByText(
      /la mitad de la muestra se resolvió en este tiempo o menos/i,
    ),
  );
  assert.ok(
    within(timing).getByText(
      /suma de todos los tiempos dividida por la muestra/i,
    ),
  );
  assert.ok(within(timing).getByText(/las horas son corridas/i));
  assert.ok(within(timing).getByText(/Cobertura parcial:/));

  const sla = screen
    .getByRole("heading", { name: "Cumplimiento del plazo" })
    .closest<HTMLElement>("article");
  assert.ok(sla);
  assert.ok(within(sla).getByText("80,6%"));
  assert.ok(within(sla).getByText("Período evaluado: Mes actual"));
  assert.ok(within(sla).getByText("58 de 72 finalizaciones dentro del plazo"));
  assert.ok(
    within(sla).getByText(
      "Con vencimiento preservado: 58 de 72 dentro del plazo.",
    ),
  );
  assert.ok(
    within(sla).getByRole("progressbar", {
      name: "Cumplimiento del plazo",
    }),
  );

  const overdueBacklog = screen
    .getByRole("heading", { name: "Backlog vencido" })
    .closest<HTMLElement>("article");
  assert.ok(overdueBacklog);
  assert.ok(within(overdueBacklog).getByText("18,8%"));
  assert.ok(
    within(overdueBacklog).getByText(
      "12 de 64 tickets abiertos del conjunto analizado",
    ),
  );
  assert.ok(
    within(overdueBacklog).getByText(
      "Cobertura parcial: 60 de 64 con plazo verificable.",
    ),
  );

  const backlogAge = screen
    .getByRole("heading", { name: "Antigüedad del backlog" })
    .closest<HTMLElement>("article");
  assert.ok(backlogAge);
  assert.ok(within(backlogAge).getByText("13 h 30 min hábiles"));
  assert.ok(within(backlogAge).getByText("Mediana de 64 tickets abiertos"));

  const assignment = screen
    .getByRole("heading", { name: "Cobertura de asignación" })
    .closest<HTMLElement>("article");
  assert.ok(assignment);
  assert.ok(within(assignment).getByText("82,8%"));
  assert.ok(
    within(assignment).getByText(
      "53 de 64 tickets abiertos con operador asignado",
    ),
  );
  assert.ok(
    screen.getByText(/no representan backlog creado fuera de ese período/i),
  );

  await assertNoAxeViolations();
});

test("mantiene muestras de cumplimiento mayores a los finalizados sin recortarlas", (t) => {
  t.after(cleanup);
  render(
    <ResumenEquipoPanel
      {...BASE_PROPS}
      estado_actual={{
        ...BASE_PROPS.estado_actual,
        finalizados: 8,
      }}
      cumplimiento_plazo={{
        muestra: 12,
        cumplidos: 9,
        porcentaje: 75,
        muestra_auditable: 8,
        cumplidos_auditables: 6,
        muestra_historica_reconstruida: 4,
        cumplidos_historicos_reconstruidos: 3,
      }}
    />,
  );

  assert.ok(screen.getByText("9 de 12 finalizaciones dentro del plazo"));
  assert.ok(screen.getByText("75%"));
});

test("expone el cumplimiento histórico completo y su fuente", (t) => {
  t.after(cleanup);
  render(
    <ResumenEquipoPanel
      {...BASE_PROPS}
      periodFilterLabel="Todo el historial"
      cumplimiento_plazo={{
        muestra: 115,
        cumplidos: 86,
        porcentaje: 74.8,
        muestra_auditable: 1,
        cumplidos_auditables: 1,
        muestra_historica_reconstruida: 114,
        cumplidos_historicos_reconstruidos: 85,
      }}
    />,
  );

  const compliance = screen
    .getByRole("heading", { name: "Cumplimiento del plazo" })
    .closest<HTMLElement>("article");
  assert.ok(compliance);
  assert.ok(within(compliance).getByText("74,8%"));
  assert.ok(
    within(compliance).getByText("86 de 115 finalizaciones dentro del plazo"),
  );
  assert.ok(
    within(compliance).getByText(
      "Con vencimiento preservado: 1 de 1 dentro del plazo · Históricas reconstruidas: 85 de 114 dentro del plazo.",
    ),
  );
  assert.ok(
    within(compliance).getByText("Período evaluado: Todo el historial"),
  );
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
      cumplimiento_plazo={{
        muestra: 0,
        cumplidos: 0,
        porcentaje: null,
        muestra_auditable: 0,
        cumplidos_auditables: 0,
        muestra_historica_reconstruida: 0,
        cumplidos_historicos_reconstruidos: 0,
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
    within(
      screen
        .getByRole("heading", { name: "Cumplimiento del plazo" })
        .closest<HTMLElement>("article")!,
    ).getByText("Sin muestra"),
  );
  assert.equal(
    within(
      screen
        .getByRole("heading", { name: "Cumplimiento del plazo" })
        .closest<HTMLElement>("article")!,
    ).queryByRole("progressbar"),
    null,
  );
  assert.equal(screen.getAllByText("Sin datos para distribuir.").length, 2);
  assert.equal(screen.queryByText("0%"), null);
});

test("distingue porcentajes en cero de indicadores sin backlog", async (t) => {
  t.after(cleanup);
  const result = render(
    <ResumenEquipoPanel
      {...BASE_PROPS}
      estado_actual={{
        total: 10,
        abiertos: 10,
        finalizados: 0,
        vencidos_abiertos: 0,
      }}
      backlog_vencido={{
        abiertos: 10,
        con_plazo: 10,
        vencidos: 0,
        porcentaje: 0,
      }}
      antiguedad_backlog={{
        muestra: 10,
        mediana_horas_habiles: 0,
      }}
      cobertura_asignacion={{
        abiertos: 10,
        asignados: 0,
        sin_asignar: 10,
        porcentaje: 0,
      }}
    />,
  );

  const overdueBacklog = screen
    .getByRole("heading", { name: "Backlog vencido" })
    .closest<HTMLElement>("article");
  const assignment = screen
    .getByRole("heading", { name: "Cobertura de asignación" })
    .closest<HTMLElement>("article");
  const backlogAge = screen
    .getByRole("heading", { name: "Antigüedad del backlog" })
    .closest<HTMLElement>("article");
  assert.ok(overdueBacklog);
  assert.ok(assignment);
  assert.ok(backlogAge);
  assert.ok(within(overdueBacklog).getByText("0%"));
  assert.ok(within(overdueBacklog).getByRole("progressbar"));
  assert.ok(within(assignment).getByText("0%"));
  assert.ok(within(assignment).getByRole("progressbar"));
  assert.ok(within(backlogAge).getByText("0 min hábiles"));

  result.rerender(
    <ResumenEquipoPanel
      {...BASE_PROPS}
      estado_actual={{
        total: 10,
        abiertos: 0,
        finalizados: 10,
        vencidos_abiertos: 0,
      }}
      backlog_vencido={{
        abiertos: 0,
        con_plazo: 0,
        vencidos: 0,
        porcentaje: null,
      }}
      antiguedad_backlog={{
        muestra: 0,
        mediana_horas_habiles: null,
      }}
      cobertura_asignacion={{
        abiertos: 0,
        asignados: 0,
        sin_asignar: 0,
        porcentaje: null,
      }}
    />,
  );

  assert.equal(screen.getAllByText("Sin backlog").length, 2);
  assert.ok(
    within(
      screen
        .getByRole("heading", { name: "Antigüedad del backlog" })
        .closest<HTMLElement>("article")!,
    ).getByText("Sin muestra"),
  );
  assert.equal(
    screen
      .getByRole("heading", { name: "Backlog vencido" })
      .closest<HTMLElement>("article")!
      .querySelector('[role="progressbar"]'),
    null,
  );
  assert.equal(
    screen
      .getByRole("heading", { name: "Cobertura de asignación" })
      .closest<HTMLElement>("article")!
      .querySelector('[role="progressbar"]'),
    null,
  );
  await assertNoAxeViolations();
});

test("presenta un estado vacío general y permite limpiar filtros", async (t) => {
  t.after(cleanup);
  const user = userEvent.setup();
  let cleared = 0;
  render(
    <ResumenEquipoPanel
      periodo={BASE_PROPS.periodo}
      periodFilterLabel="Mes actual"
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
      cumplimiento_plazo={{
        muestra: 0,
        cumplidos: 0,
        porcentaje: null,
        muestra_auditable: 0,
        cumplidos_auditables: 0,
        muestra_historica_reconstruida: 0,
        cumplidos_historicos_reconstruidos: 0,
      }}
      backlog_vencido={{
        abiertos: 0,
        con_plazo: 0,
        vencidos: 0,
        porcentaje: null,
      }}
      antiguedad_backlog={{
        muestra: 0,
        mediana_horas_habiles: null,
      }}
      cobertura_asignacion={{
        abiertos: 0,
        asignados: 0,
        sin_asignar: 0,
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
      onClearFilters={() => {
        cleared += 1;
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
  await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));
  assert.equal(cleared, 1);
});

test("anuncia carga y error del resumen y permite reintentar", async (t) => {
  t.after(cleanup);
  const user = userEvent.setup();
  const loading = render(<ResumenEquipoLoadingState />);

  assert.equal(
    screen
      .getByLabelText("Cargando resumen del equipo")
      .getAttribute("aria-busy"),
    "true",
  );
  assert.equal(
    loading.container.querySelectorAll('[aria-hidden="true"].animate-pulse')
      .length,
    13,
  );
  loading.unmount();

  let retries = 0;
  render(
    <ResumenEquipoErrorState
      message="No fue posible obtener las métricas."
      isRetrying={false}
      onRetry={() => {
        retries += 1;
      }}
    />,
  );

  assert.ok(screen.getByRole("alert"));
  await user.click(screen.getByRole("button", { name: "Reintentar" }));
  assert.equal(retries, 1);
});
