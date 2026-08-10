import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { AdminHeader } from "../src/components/admin/AdminHeader.tsx";

type AdminHeaderProps = ComponentProps<typeof AdminHeader>;

const defaultProps: AdminHeaderProps = {
  title: "Administración",
  description: "Gestioná tickets, roles y usuarios.",
  state: "missing",
  expiresAt: null,
  error: null,
  action: "idle",
  onElevate: async () => true,
  onRevoke: async () => true,
};

function renderAdminHeader(
  overrides: Partial<AdminHeaderProps> = {},
  path = "/admin",
) {
  const location = memoryLocation({ path });
  render(
    <Router hook={location.hook}>
      <AdminHeader {...defaultProps} {...overrides} />
    </Router>,
  );
}

test("muestra el formulario bloqueado hasta ingresar una clave y permite ocultarla", async (t) => {
  t.after(cleanup);
  let elevateCalls = 0;
  renderAdminHeader({
    onElevate: async () => {
      elevateCalls += 1;
      return true;
    },
  });

  const input = screen.getByLabelText("Clave de administración");
  const submit = screen.getByRole("button", { name: "Habilitar" });
  assert.equal(input.getAttribute("type"), "password");
  assert.equal(input.getAttribute("aria-describedby"), "admin-elevation-help");
  assert.equal(input.hasAttribute("aria-invalid"), false);
  assert.equal(submit.hasAttribute("disabled"), true);

  const form = input.closest("form");
  assert.ok(form);
  fireEvent.submit(form);
  assert.equal(elevateCalls, 0);

  const user = userEvent.setup();
  await user.type(input, "clave-de-prueba");
  await user.click(
    screen.getByRole("button", {
      name: "Mostrar clave de administración",
    }),
  );
  assert.equal(input.getAttribute("type"), "text");
  assert.equal(
    screen
      .getByRole("button", { name: "Ocultar clave de administración" })
      .getAttribute("aria-pressed"),
    "true",
  );

  await user.click(
    screen.getByRole("button", {
      name: "Ocultar clave de administración",
    }),
  );
  assert.equal(input.getAttribute("type"), "password");
});

test("retira el secreto del DOM antes del callback y bloquea envíos simultáneos", async (t) => {
  t.after(cleanup);
  const secret = "secreto-que-no-debe-persistir";
  let elevateCalls = 0;
  let receivedSecret: string | null = null;
  let inputValueWhenCalled: string | null = null;
  let inputTypeWhenCalled: string | null = null;
  let finishElevation: ((value: boolean) => void) | undefined;
  const elevationResult = new Promise<boolean>((resolve) => {
    finishElevation = resolve;
  });

  renderAdminHeader({
    onElevate: async (submittedSecret) => {
      elevateCalls += 1;
      receivedSecret = submittedSecret;
      const input = screen.getByLabelText("Clave de administración");
      inputValueWhenCalled = (input as HTMLInputElement).value;
      inputTypeWhenCalled = input.getAttribute("type");
      return elevationResult;
    },
  });

  const user = userEvent.setup();
  const input = screen.getByLabelText("Clave de administración");
  await user.type(input, secret);
  await user.click(
    screen.getByRole("button", {
      name: "Mostrar clave de administración",
    }),
  );
  const form = input.closest("form");
  assert.ok(form);
  fireEvent.submit(form);
  fireEvent.submit(form);

  await waitFor(() => assert.equal(elevateCalls, 1));
  assert.equal(receivedSecret, secret);
  assert.equal(inputValueWhenCalled, "");
  assert.equal(inputTypeWhenCalled, "password");
  assert.equal((input as HTMLInputElement).value, "");
  assert.equal(input.getAttribute("type"), "password");
  assert.ok(
    screen.getByRole("button", {
      name: "Mostrar clave de administración",
    }),
  );

  const submit = screen.getByRole("button", { name: "Habilitar" });
  assert.equal(submit.hasAttribute("disabled"), true);
  fireEvent.submit(form);
  assert.equal(elevateCalls, 1);

  assert.ok(finishElevation);
  finishElevation(true);
  await waitFor(() => assert.equal(submit.hasAttribute("disabled"), true));
});

test("informa el estado pendiente sin volver a solicitar la clave", (t) => {
  t.after(cleanup);
  renderAdminHeader({ state: "pending", action: "elevating" });

  assert.match(
    screen.getByRole("status").textContent ?? "",
    /Validando acceso administrativo/,
  );
  assert.equal(screen.queryByLabelText("Clave de administración"), null);
  assert.equal(screen.queryByRole("button", { name: "Habilitar" }), null);
});

test("muestra la elevación activa, su vencimiento y permite revocarla", async (t) => {
  t.after(cleanup);
  let revokeCalls = 0;
  let finishRevocation: ((value: boolean) => void) | undefined;
  const revocationResult = new Promise<boolean>((resolve) => {
    finishRevocation = resolve;
  });
  renderAdminHeader({
    state: "ready",
    expiresAt: "2026-08-09T18:30:00.000Z",
    onRevoke: async () => {
      revokeCalls += 1;
      return revocationResult;
    },
  });

  assert.match(
    screen.getByRole("status").textContent ?? "",
    /Acceso administrativo habilitado hasta/,
  );
  assert.equal(screen.queryByLabelText("Clave de administración"), null);

  const revokeButton = screen.getByRole("button", {
    name: "Revocar acceso",
  });
  fireEvent.click(revokeButton);
  fireEvent.click(revokeButton);
  assert.equal(revokeCalls, 1);
  assert.equal(revokeButton.hasAttribute("disabled"), true);

  assert.ok(finishRevocation);
  finishRevocation(true);
  await waitFor(() =>
    assert.equal(revokeButton.hasAttribute("disabled"), false),
  );
});

test("presenta mensajes seguros para errores de elevación", (t) => {
  t.after(cleanup);
  const cases = [
    [401, "ADMIN_KEY_INVALID", /clave de administración no es válida/i],
    [401, "SESSION_INVALID", /sesión venció o cambió/i],
    [429, "ADMIN_ELEVATION_RATE_LIMITED", /demasiados intentos/i],
    [503, "ADMIN_ELEVATION_UNAVAILABLE", /no está disponible/i],
  ] as const;

  for (const [status, code, expected] of cases) {
    renderAdminHeader({
      error: { status, data: { code, detail: "dato técnico" } },
    });
    const alert = screen.getByRole("alert");
    const input = screen.getByLabelText("Clave de administración");
    assert.match(alert.textContent ?? "", expected);
    assert.doesNotMatch(alert.textContent ?? "", /dato técnico/i);
    assert.equal(input.getAttribute("aria-invalid"), "true");
    assert.equal(
      input.getAttribute("aria-describedby"),
      "admin-elevation-help admin-elevation-error",
    );
    cleanup();
  }
});

test("conserva la navegación y marca la sección administrativa actual", (t) => {
  t.after(cleanup);
  renderAdminHeader({}, "/admin/roles-usuarios");

  const navigation = screen.getByRole("navigation", {
    name: "Secciones de administración",
  });
  assert.equal(
    within(navigation)
      .getByRole("link", { name: "Roles y usuarios" })
      .getAttribute("aria-current"),
    "page",
  );
  assert.equal(
    within(navigation)
      .getByRole("link", { name: "Tickets" })
      .hasAttribute("aria-current"),
    false,
  );
});
