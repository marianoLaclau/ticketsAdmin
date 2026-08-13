import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { useRendimientoFiltersUrl } from "../src/features/rendimiento/useRendimientoFiltersUrl.ts";

function HookProbe({ onRender }: { onRender: () => void }) {
  onRender();
  const { urlState } = useRendimientoFiltersUrl();

  return (
    <output aria-label="Estado URL de Rendimiento">
      {JSON.stringify(urlState)}
    </output>
  );
}

test("canoniza una URL no canónica una vez y se estabiliza sin loop", async (t) => {
  t.after(cleanup);
  const location = memoryLocation({
    path: "/rendimiento",
    searchPath:
      "utm_source=prueba&periodo=mes&empresa=%20GSB%20&categoria=legales",
    record: true,
  });
  let renders = 0;

  render(
    <Router hook={location.hook} searchHook={location.searchHook}>
      <HookProbe
        onRender={() => {
          renders += 1;
        }}
      />
    </Router>,
  );

  await waitFor(() => {
    assert.equal(
      location.history.at(-1),
      "/rendimiento?empresa=GSB&categoria=legales",
    );
  });
  assert.equal(location.history.length, 1);
  assert.ok(
    screen
      .getByLabelText("Estado URL de Rendimiento")
      .textContent?.includes('"empresa":"GSB"'),
  );

  const rendersAfterCanonicalization = renders;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(renders, rendersAfterCanonicalization);
  assert.ok(renders <= 3, `se observaron ${renders} renders`);
});
