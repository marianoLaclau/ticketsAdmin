import assert from "node:assert/strict";
import test from "node:test";
import type { ComponentProps } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardPeriodFilter } from "../src/features/dashboard/DashboardPeriodFilter.tsx";
import { installDomEventRealm } from "./dom-event-realm.ts";

installDomEventRealm();

for (const [method, implementation] of [
  ["hasPointerCapture", () => false],
  ["setPointerCapture", () => undefined],
  ["releasePointerCapture", () => undefined],
  ["scrollIntoView", () => undefined],
] as const) {
  if (!(method in window.HTMLElement.prototype)) {
    Object.defineProperty(window.HTMLElement.prototype, method, {
      configurable: true,
      value: implementation,
    });
  }
}

const defaultProps: ComponentProps<typeof DashboardPeriodFilter> = {
  period: "todo",
  customRange: {
    fecha_desde: "2026-08-01",
    fecha_hasta: "2026-08-07",
  },
  error: null,
  appliedPeriodLabel: "Todo el historial",
  onPeriodChange: () => undefined,
  onFromChange: () => undefined,
  onToChange: () => undefined,
  onApply: () => undefined,
};

test("delega el período predefinido sin presentar fechas", async (t) => {
  cleanup();
  t.after(cleanup);
  const onPeriodChange = t.mock.fn();
  const onApply = t.mock.fn();
  render(
    <DashboardPeriodFilter
      {...defaultProps}
      onPeriodChange={onPeriodChange}
      onApply={onApply}
    />,
  );

  const fieldset = screen.getByRole("group", {
    name: "Filtrar los datos del dashboard por período",
  });
  assert.ok(fieldset);
  assert.equal(screen.queryByLabelText("Desde") === null, true);
  assert.equal(screen.queryByLabelText("Hasta") === null, true);
  assert.equal(
    screen.queryByRole("button", { name: "Aplicar" }) === null,
    true,
  );
  assert.equal(
    screen.getByRole("status").textContent,
    "Período aplicado: Todo el historial",
  );

  const browser = userEvent.setup();
  await browser.click(
    screen.getByRole("combobox", { name: "Datos a visualizar" }),
  );
  await browser.click(screen.getByRole("option", { name: "Semana actual" }));
  assert.equal(onPeriodChange.mock.callCount(), 1);
  assert.equal(onPeriodChange.mock.calls[0]?.arguments[0], "semana");

  fireEvent.submit(fieldset.closest("form")!);
  assert.equal(onApply.mock.callCount(), 0);
});

test("delega el borrador válido y aplica solamente al enviar", (t) => {
  cleanup();
  t.after(cleanup);
  const onFromChange = t.mock.fn();
  const onToChange = t.mock.fn();
  const onApply = t.mock.fn();
  render(
    <DashboardPeriodFilter
      {...defaultProps}
      period="personalizado"
      appliedPeriodLabel="1 al 7 de agosto"
      onFromChange={onFromChange}
      onToChange={onToChange}
      onApply={onApply}
    />,
  );

  const from = screen.getByLabelText("Desde") as HTMLInputElement;
  const to = screen.getByLabelText("Hasta") as HTMLInputElement;
  assert.equal(from.value, "2026-08-01");
  assert.equal(to.value, "2026-08-07");

  fireEvent.change(from, { target: { value: "2026-08-02" } });
  fireEvent.change(to, { target: { value: "2026-08-06" } });
  assert.equal(onFromChange.mock.callCount(), 1);
  assert.equal(onFromChange.mock.calls[0]?.arguments[0], "2026-08-02");
  assert.equal(onToChange.mock.callCount(), 1);
  assert.equal(onToChange.mock.calls[0]?.arguments[0], "2026-08-06");
  assert.equal(
    screen.getByRole("status").textContent,
    "Período aplicado: 1 al 7 de agosto",
  );

  const applyButton = screen.getByRole("button", { name: "Aplicar" });
  fireEvent.submit(applyButton.closest("form")!);
  assert.equal(onApply.mock.callCount(), 1);
});

test("expone el error y bloquea incluso un submit directo", (t) => {
  cleanup();
  t.after(cleanup);
  const onApply = t.mock.fn();
  render(
    <DashboardPeriodFilter
      {...defaultProps}
      period="personalizado"
      error="La fecha desde no puede ser posterior a la fecha hasta"
      onApply={onApply}
    />,
  );

  const alert = screen.getByRole("alert");
  assert.match(alert.textContent ?? "", /no puede ser posterior/);
  for (const label of ["Desde", "Hasta"]) {
    const input = screen.getByLabelText(label);
    assert.equal(input.getAttribute("aria-invalid"), "true");
    assert.equal(input.getAttribute("aria-describedby"), alert.id);
  }

  const applyButton = screen.getByRole("button", { name: "Aplicar" });
  assert.equal((applyButton as HTMLButtonElement).disabled, true);
  fireEvent.submit(applyButton.closest("form")!);
  assert.equal(onApply.mock.callCount(), 0);
});
