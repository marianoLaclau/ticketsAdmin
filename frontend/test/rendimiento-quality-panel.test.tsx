import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RendimientoCalidadDatos } from "@workspace/api-client-react";
import {
  RendimientoQualityErrorState,
  RendimientoQualityLoadingState,
} from "../src/features/rendimiento/RendimientoQualityView.tsx";
import { RendimientoQualityPanel } from "../src/features/rendimiento/RendimientoQualityPanel.tsx";
import { assertNoAxeViolations } from "./axe.ts";

function qualityData(
  comparison: RendimientoCalidadDatos["comparacion_individual_estado"] = "parcial",
): RendimientoCalidadDatos {
  return {
    periodo: {
      fecha_desde: "2026-08-01",
      fecha_hasta: "2026-08-31",
      timezone: "America/Argentina/Buenos_Aires",
      generado_en: "2026-08-13T15:00:00.000Z",
    },
    tickets_evaluados: 154,
    resoluciones_evaluadas: 20,
    atribucion_desde: "2026-08-02T14:30:00.000Z",
    comparacion_individual_estado: comparison,
    coberturas: {
      actor_resolucion: {
        numerador: 17,
        denominador: 20,
        porcentaje: 85,
      },
      fecha_resolucion: {
        numerador: 38,
        denominador: 40,
        porcentaje: 95,
      },
      plazo_resolucion: {
        numerador: 14,
        denominador: 20,
        porcentaje: 70,
      },
      asignacion_estructurada: {
        numerador: 62,
        denominador: 71,
        porcentaje: 87.3,
      },
      identidad_contacto: {
        numerador: 120,
        denominador: 154,
        porcentaje: 77.9,
      },
      fecha_limite: {
        numerador: 154,
        denominador: 154,
        porcentaje: 100,
      },
    },
  };
}

test("muestra las seis coberturas con porcentaje y muestra", async (t) => {
  t.after(cleanup);
  render(
    <main>
      <RendimientoQualityPanel data={qualityData()} onClearFilters={() => {}} />
    </main>,
  );

  assert.ok(screen.getByRole("heading", { name: "Calidad y cobertura" }));
  assert.ok(screen.getAllByText("154").length >= 1);
  assert.ok(screen.getAllByText("20").length >= 1);

  for (const name of [
    "Autor de resolución",
    "Fecha de resolución",
    "Plazo al resolver",
    "Asignación estructurada",
    "Identidad del contacto",
    "Fecha límite",
  ]) {
    assert.ok(screen.getByRole("heading", { name }));
    assert.ok(
      screen.getByRole("progressbar", { name: `Cobertura de ${name}` }),
    );
  }

  assert.ok(
    screen.getByText(
      (_content, element) =>
        element?.tagName === "P" &&
        element.textContent?.replace(/\s+/g, " ").trim() ===
          "17 de 20 casos con el dato disponible",
    ),
  );
  assert.ok(screen.getByText("85%"));
  assert.ok(
    screen.getByRole("heading", {
      name: "Datos parciales",
    }),
  );
  await assertNoAxeViolations();
});

test("presenta avisos distintos para cada estado de comparación", (t) => {
  t.after(cleanup);
  const expected = {
    insuficiente: "Datos insuficientes",
    parcial: "Datos parciales",
    disponible: "Datos suficientes",
  } as const;

  for (const [status, heading] of Object.entries(expected)) {
    const view = render(
      <RendimientoQualityPanel
        data={qualityData(
          status as RendimientoCalidadDatos["comparacion_individual_estado"],
        )}
        onClearFilters={() => {}}
      />,
    );
    assert.ok(screen.getByRole("heading", { name: heading }));
    view.unmount();
  }
});

test("el estado vacío explica el conjunto analizado y permite limpiar filtros", async (t) => {
  t.after(cleanup);
  const user = userEvent.setup();
  let clears = 0;
  const data = qualityData("insuficiente");
  data.tickets_evaluados = 0;
  data.resoluciones_evaluadas = 0;

  render(
    <RendimientoQualityPanel
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
    screen.queryByRole("heading", {
      name: "Coberturas del conjunto analizado",
    }),
    null,
  );
  await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));
  assert.equal(clears, 1);
});

test("los estados loading y error son anunciados y permiten reintentar", async (t) => {
  t.after(cleanup);
  const user = userEvent.setup();
  const loading = render(<RendimientoQualityLoadingState />);
  assert.equal(
    screen
      .getByLabelText("Cargando calidad de datos")
      .getAttribute("aria-busy"),
    "true",
  );
  loading.unmount();

  let retries = 0;
  render(
    <RendimientoQualityErrorState
      message="No fue posible obtener las coberturas."
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
