import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, render, screen } from "@testing-library/react";
import { AdminCredentialNotice } from "../src/components/admin/AdminCredentialNotice.tsx";

test("presenta de forma diferenciada la ausencia y la transición del acceso", (t) => {
  t.after(cleanup);

  const view = render(
    <AdminCredentialNotice
      state="missing"
      pendingDescription="Esperá mientras se valida."
      missingDescription="Completá la llave para continuar."
    />,
  );

  const alert = screen.getByRole("alert");
  assert.match(alert.textContent ?? "", /Habilitá el acceso administrativo/);
  assert.match(alert.textContent ?? "", /Completá la llave para continuar/);
  assert.equal(alert.getAttribute("aria-live"), "assertive");
  assert.equal(alert.getAttribute("aria-atomic"), "true");
  assert.equal(alert.querySelector("svg")?.getAttribute("aria-hidden"), "true");

  view.rerender(
    <AdminCredentialNotice
      state="pending"
      pendingDescription="Esperá mientras se valida."
      missingDescription="Completá la llave para continuar."
    />,
  );

  assert.equal(screen.queryByRole("alert"), null);
  const status = screen.getByRole("status");
  assert.match(
    status.textContent ?? "",
    /Verificando el acceso administrativo/,
  );
  assert.match(status.textContent ?? "", /Esperá mientras se valida/);
  assert.equal(status.getAttribute("aria-live"), "polite");
  assert.equal(status.getAttribute("aria-atomic"), "true");
  assert.equal(screen.queryByText("Completá la llave para continuar."), null);
  assert.equal(
    status.querySelector("svg")?.classList.contains("animate-spin"),
    true,
  );
});
