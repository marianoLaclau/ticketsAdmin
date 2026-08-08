import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, render, screen, within } from "@testing-library/react";
import { DashboardPerformancePanel } from "../src/features/dashboard/DashboardPerformancePanel.tsx";

const performance = {
  isLoading: false,
  resolutionRate: 75,
  completedCount: 9,
  activeCount: 3,
  resolvedCount: 7,
  totalCount: 12,
};

test("presenta la tasa y las métricas de rendimiento", (t) => {
  t.after(cleanup);
  const view = render(<DashboardPerformancePanel {...performance} />);

  assert.equal(
    screen.getByRole("heading", { name: "Rendimiento" }).tagName,
    "H3",
  );
  assert.ok(screen.getByText("75%"));
  for (const [label, value] of [
    ["Finalizados", "9"],
    ["Activos", "3"],
    ["Solo resueltos", "7"],
    ["Total general", "12"],
  ] as const) {
    const metric = screen.getByText(label).parentElement;
    assert.ok(metric);
    assert.ok(within(metric).getByText(value));
  }
  assert.match(view.container.textContent ?? "", /resueltos \+ cerrados/);
  assert.match(view.container.textContent ?? "", /listos p\/ cerrar/);
  assert.equal(view.container.querySelectorAll("svg circle").length, 2);
});

test("mantiene ocultos los valores mientras carga", (t) => {
  cleanup();
  t.after(cleanup);
  const view = render(
    <DashboardPerformancePanel {...performance} isLoading={true} />,
  );

  const text = view.container.textContent ?? "";
  assert.match(text, /Rendimiento/);
  assert.equal(text.includes("75%"), false);
  for (const value of ["9", "3", "7", "12"]) {
    assert.equal(text.includes(value), false);
  }
  assert.equal(
    view.container.getElementsByClassName("animate-pulse").length,
    5,
  );
  assert.equal(view.container.getElementsByTagName("circle").length, 0);
});
