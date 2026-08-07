import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, render, screen } from "@testing-library/react";
import { useAdminAccessGeneration } from "../src/hooks/use-admin-access-generation.ts";

function GenerationProbe({ adminKey }: { adminKey: string }) {
  const generation = useAdminAccessGeneration(adminKey);
  return <output aria-label="Generación administrativa">{generation}</output>;
}

test("incrementa la generación únicamente cuando cambia la llave", (t) => {
  t.after(cleanup);
  const view = render(<GenerationProbe adminKey="primera" />);
  const generation = screen.getByLabelText("Generación administrativa");

  assert.equal(generation.textContent, "0");
  view.rerender(<GenerationProbe adminKey="segunda" />);
  assert.equal(generation.textContent, "1");
  view.rerender(<GenerationProbe adminKey="segunda" />);
  assert.equal(generation.textContent, "1");
  view.rerender(<GenerationProbe adminKey="" />);
  assert.equal(generation.textContent, "2");
});
