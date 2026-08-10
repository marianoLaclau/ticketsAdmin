import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { ErrorPage } from "../src/components/ErrorPage.tsx";
import Login from "../src/pages/Login.tsx";
import { assertNoAxeViolations } from "./axe.ts";

test("la pantalla de ingreso conserva landmarks y nombres accesibles", async (t) => {
  t.after(cleanup);
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <Login />
    </QueryClientProvider>,
  );

  assert.ok(screen.getByRole("heading", { name: "Sistema de Tickets" }));
  assert.ok(screen.getByRole("textbox", { name: "Usuario" }));
  assert.ok(screen.getByLabelText("Contraseña"));
  await assertNoAxeViolations();
});

test("la pantalla de error anuncia su contenido al tomar foco", async (t) => {
  t.after(cleanup);

  render(<ErrorPage status={403} homeHref="/dashboard" />);

  const main = screen.getByRole("main");
  assert.equal(document.activeElement, main);
  assert.ok(screen.getByRole("heading", { name: "Acceso denegado" }));
  await assertNoAxeViolations();
});
