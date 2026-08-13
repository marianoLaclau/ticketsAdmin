import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { useRendimientoFiltersUrl } from "../src/features/rendimiento/useRendimientoFiltersUrl.ts";

function HookProbe({ onRender }: { onRender: () => void }) {
  const { urlState, updateUrlState } = useRendimientoFiltersUrl();
  onRender();

  return (
    <>
      <output aria-label="Estado URL de Rendimiento">
        {JSON.stringify(urlState)}
      </output>
      <button
        type="button"
        onClick={() =>
          updateUrlState(
            (current) => ({ ...current, vista: "calidad" }),
            "push",
          )
        }
      >
        Ver calidad
      </button>
    </>
  );
}

test("canoniza una URL no canónica una vez y se estabiliza sin loop", async (t) => {
  t.after(cleanup);
  const location = memoryLocation({
    path: "/rendimiento",
    searchPath:
      "utm_source=prueba&periodo=mes&empresa=%20GSB%20&categoria=legales&vista=invalida",
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

test("usa push al cambiar de vista y responde a back-forward preservando filtros", async (t) => {
  t.after(cleanup);
  const location = memoryLocation({
    path: "/rendimiento",
    searchPath: "periodo=semana&empresa=GSB&vista=personas",
    record: true,
  });

  render(
    <Router hook={location.hook} searchHook={location.searchHook}>
      <HookProbe onRender={() => {}} />
    </Router>,
  );

  assert.match(
    screen.getByLabelText("Estado URL de Rendimiento").textContent ?? "",
    /"vista":"personas"/,
  );
  fireEvent.click(screen.getByRole("button", { name: "Ver calidad" }));

  await waitFor(() => {
    assert.equal(
      location.history.at(-1),
      "/rendimiento?periodo=semana&empresa=GSB&vista=calidad",
    );
  });
  assert.equal(location.history.length, 2);

  location.navigate("/rendimiento?periodo=semana&empresa=GSB&vista=personas", {
    replace: true,
  });
  await waitFor(() => {
    assert.match(
      screen.getByLabelText("Estado URL de Rendimiento").textContent ?? "",
      /"vista":"personas"/,
    );
  });

  location.navigate("/rendimiento?periodo=semana&empresa=GSB&vista=calidad", {
    replace: true,
  });
  await waitFor(() => {
    assert.match(
      screen.getByLabelText("Estado URL de Rendimiento").textContent ?? "",
      /"vista":"calidad"/,
    );
  });
});
