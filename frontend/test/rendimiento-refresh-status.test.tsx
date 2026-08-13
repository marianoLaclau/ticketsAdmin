import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, render, screen } from "@testing-library/react";
import { RendimientoRefreshStatus } from "../src/features/rendimiento/RendimientoRefreshStatus.tsx";
import { assertNoAxeViolations } from "./axe.ts";

test("anuncia un refetch sin reemplazar el último snapshot visible", async (t) => {
  t.after(cleanup);
  const view = render(<RendimientoRefreshStatus visible={false} />);

  assert.equal(screen.queryByRole("status"), null);

  view.rerender(<RendimientoRefreshStatus visible />);
  const status = screen.getByRole("status");
  assert.match(status.textContent ?? "", /Actualizando indicadores/);
  assert.equal(status.getAttribute("aria-live"), "polite");
  await assertNoAxeViolations();
});
