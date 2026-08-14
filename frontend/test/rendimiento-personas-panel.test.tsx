import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RendimientoPersonas } from "@workspace/api-client-react";
import {
  RendimientoPersonasErrorState,
  RendimientoPersonasLoadingState,
} from "../src/features/rendimiento/RendimientoPersonasView.tsx";
import { RendimientoPersonasPanel } from "../src/features/rendimiento/RendimientoPersonasPanel.tsx";
import { assertNoAxeViolations } from "./axe.ts";

function personasData(): RendimientoPersonas {
  return {
    periodo: {
      fecha_desde: "2026-08-01",
      fecha_hasta: "2026-08-13",
      timezone: "America/Argentina/Buenos_Aires",
      generado_en: "2026-08-13T15:00:00.000Z",
    },
    tickets_evaluados: 40,
    cobertura: {
      resoluciones_evaluadas: 8,
      resoluciones_atribuidas: 6,
      finalizaciones_historicas_detectadas: 2,
      finalizaciones_historicas_atribuidas: 2,
      porcentaje_atribucion: 75,
      atribucion_desde: "2026-08-03T15:00:00.000Z",
      comparacion_individual_estado: "insuficiente",
      minimo_resoluciones_comparables: 10,
      umbral_cobertura_parcial_porcentaje: 80,
      umbral_cobertura_disponible_porcentaje: 95,
    },
    personas: [
      {
        usuario: {
          id: 1,
          nombre: "Ana Pérez",
          rol: "Operador",
          activo: true,
        },
        tickets_resueltos: 4,
        resoluciones_atribuidas: 5,
        finalizaciones_historicas_atribuidas: 2,
        tiempo_resolucion_atribuible: {
          muestra: 4,
          promedio_horas: 25.5,
          mediana_horas: 18.25,
        },
        cumplimiento_plazo_auditable: {
          muestra: 3,
          cumplidos: 2,
          porcentaje: 66.7,
        },
        carga_actual: {
          abiertos_asignados: 3,
          vencidos_asignados: 1,
        },
        resoluciones_reabiertas: 1,
      },
      {
        usuario: {
          id: 2,
          nombre: "Bruno Soto",
          rol: "Operador",
          activo: false,
        },
        tickets_resueltos: 1,
        resoluciones_atribuidas: 1,
        finalizaciones_historicas_atribuidas: 0,
        tiempo_resolucion_atribuible: {
          muestra: 0,
          promedio_horas: null,
          mediana_horas: null,
        },
        cumplimiento_plazo_auditable: {
          muestra: 0,
          cumplidos: 0,
          porcentaje: null,
        },
        carga_actual: {
          abiertos_asignados: 0,
          vencidos_asignados: 0,
        },
        resoluciones_reabiertas: 0,
      },
    ],
  };
}

test("muestra hechos y muestras aun con cobertura insuficiente, sin ranking", async (t) => {
  t.after(cleanup);
  render(
    <main>
      <RendimientoPersonasPanel
        data={personasData()}
        onClearFilters={() => {}}
      />
    </main>,
  );

  assert.ok(screen.getByRole("heading", { name: "Rendimiento individual" }));
  assert.ok(
    screen.getByRole("heading", {
      name: "Cobertura insuficiente para comparar",
    }),
  );
  assert.ok(screen.getByText("Orden alfabético A–Z"));
  assert.ok(!screen.queryByText(/mejor operador/i));
  assert.ok(!screen.queryByRole("columnheader", { name: /posición|puntaje/i }));
  assert.ok(!screen.queryByRole("button", { name: /ordenar/i }));

  const ana = screen
    .getByRole("heading", { name: "Ana Pérez" })
    .closest<HTMLElement>("article");
  assert.ok(ana);
  assert.ok(within(ana).getByText("4"));
  assert.ok(within(ana).getByText("5 finalizaciones atribuibles"));
  assert.ok(within(ana).getByText("2 recuperadas del historial"));
  assert.ok(within(ana).getByText("18 h 15 min"));
  assert.ok(within(ana).getByText("Muestra: 4 finalizaciones"));
  assert.ok(within(ana).getByText("2 fechas históricas incluidas"));
  assert.ok(within(ana).getByText("66,7%"));
  assert.ok(within(ana).getByText("2 de 3 resoluciones"));
  assert.ok(within(ana).getByText("3 abiertos"));
  assert.ok(within(ana).getByText("1 vencido"));
  assert.ok(within(ana).getByText("1", { selector: "dd" }));

  const anaHeading = screen.getByRole("heading", { name: "Ana Pérez" });
  const brunoHeading = screen.getByRole("heading", { name: "Bruno Soto" });
  assert.ok(
    Boolean(
      anaHeading.compareDocumentPosition(brunoHeading) &
      Node.DOCUMENT_POSITION_FOLLOWING,
    ),
  );
  assert.ok(within(brunoHeading.closest("article")!).getByText("Inactivo"));

  await assertNoAxeViolations();
});

test("presenta datos no medibles como Sin muestra y conserva los ceros reales", (t) => {
  t.after(cleanup);
  const data = personasData();
  data.cobertura.comparacion_individual_estado = "parcial";
  render(<RendimientoPersonasPanel data={data} onClearFilters={() => {}} />);

  assert.ok(screen.getByRole("heading", { name: "Cobertura global parcial" }));
  const bruno = screen
    .getByRole("heading", { name: "Bruno Soto" })
    .closest<HTMLElement>("article");
  assert.ok(bruno);
  assert.equal(within(bruno).getAllByText("Sin muestra").length, 2);
  assert.ok(within(bruno).getByText("0 abiertos"));
  assert.ok(within(bruno).getByText("Sin vencidos"));
  assert.equal(within(bruno).queryByText("0%"), null);
  assert.equal(within(bruno).queryByText("0 h"), null);
});

test("habilita la comparación con el historial atribuible completo", (t) => {
  t.after(cleanup);
  const data = personasData();
  data.cobertura = {
    ...data.cobertura,
    resoluciones_evaluadas: 12,
    resoluciones_atribuidas: 12,
    finalizaciones_historicas_detectadas: 10,
    finalizaciones_historicas_atribuidas: 10,
    porcentaje_atribucion: 100,
    comparacion_individual_estado: "disponible",
  };

  render(<RendimientoPersonasPanel data={data} onClearFilters={() => {}} />);

  assert.ok(
    screen.getByRole("heading", {
      name: "Cobertura suficiente para comparar",
    }),
  );
  assert.ok(
    screen.getByText(
      /12 finalizaciones analizadas: 2 con evento y 10 históricas/,
    ),
  );
});

test("muestra tres operadores y permite desplegar o contraer el resto", async (t) => {
  t.after(cleanup);
  const user = userEvent.setup();
  const data = personasData();
  const template = data.personas[0]!;
  data.personas = [
    ...data.personas,
    ...["Carla Díaz", "Diego López", "Elena Ruiz"].map((nombre, index) => ({
      ...template,
      usuario: {
        ...template.usuario,
        id: index + 3,
        nombre,
      },
    })),
  ];

  render(<RendimientoPersonasPanel data={data} onClearFilters={() => {}} />);

  assert.ok(screen.getByRole("heading", { name: "Carla Díaz" }));
  assert.equal(screen.queryByRole("heading", { name: "Diego López" }), null);
  assert.equal(screen.queryByRole("heading", { name: "Elena Ruiz" }), null);

  const expand = screen.getByRole("button", { name: "Ver 2 operadores más" });
  assert.equal(expand.getAttribute("aria-expanded"), "false");
  const controlledListId = expand.getAttribute("aria-controls");
  assert.ok(controlledListId);
  assert.ok(document.getElementById(controlledListId));

  await user.click(expand);

  assert.ok(screen.getByRole("heading", { name: "Diego López" }));
  assert.ok(screen.getByRole("heading", { name: "Elena Ruiz" }));
  const collapse = screen.getByRole("button", {
    name: "Mostrar solo 3 operadores",
  });
  assert.equal(collapse.getAttribute("aria-expanded"), "true");

  await user.click(collapse);

  assert.equal(screen.queryByRole("heading", { name: "Diego López" }), null);
  assert.equal(screen.queryByRole("heading", { name: "Elena Ruiz" }), null);
  assert.equal(
    screen
      .getByRole("button", { name: "Ver 2 operadores más" })
      .getAttribute("aria-expanded"),
    "false",
  );

  await assertNoAxeViolations();
});

test("el estado vacío explica el conjunto analizado y permite limpiar filtros", async (t) => {
  t.after(cleanup);
  const user = userEvent.setup();
  const data = personasData();
  data.tickets_evaluados = 0;
  data.cobertura = {
    ...data.cobertura,
    resoluciones_evaluadas: 0,
    resoluciones_atribuidas: 0,
    finalizaciones_historicas_detectadas: 0,
    finalizaciones_historicas_atribuidas: 0,
    porcentaje_atribucion: null,
    atribucion_desde: null,
  };
  data.personas = [];
  let clears = 0;

  render(
    <RendimientoPersonasPanel
      data={data}
      onClearFilters={() => {
        clears += 1;
      }}
    />,
  );

  assert.ok(
    screen.getByRole("heading", { name: "No hay datos para estos filtros" }),
  );
  assert.equal(
    screen.queryByRole("heading", { name: "Actividad por operador" }),
    null,
  );
  await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));
  assert.equal(clears, 1);
});

test("los estados loading y error son anunciados y permiten reintentar", async (t) => {
  t.after(cleanup);
  const user = userEvent.setup();
  const loading = render(<RendimientoPersonasLoadingState />);
  assert.equal(
    screen
      .getByLabelText("Cargando rendimiento individual")
      .getAttribute("aria-busy"),
    "true",
  );
  loading.unmount();

  let retries = 0;
  render(
    <RendimientoPersonasErrorState
      message="No fue posible obtener la actividad."
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
