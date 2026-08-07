import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTHENTICATED_HOME_PATH,
  PASSWORD_CHANGE_PATH,
  getAuthenticatedEntryPath,
  getChangedPasswordError,
  getCurrentPasswordError,
  getPasswordChangeFormError,
  getRepeatedPasswordError,
} from "../src/lib/password-change.ts";

describe("flujo de cambio obligatorio de contraseña", () => {
  it("elige el destino autenticado sin permitir escapar del cambio", () => {
    assert.equal(
      getAuthenticatedEntryPath({ debe_cambiar_password: true }),
      PASSWORD_CHANGE_PATH,
    );
    assert.equal(
      getAuthenticatedEntryPath({ debe_cambiar_password: false }),
      AUTHENTICATED_HOME_PATH,
    );
    assert.equal(
      getAuthenticatedEntryPath({}),
      PASSWORD_CHANGE_PATH,
      "un contrato incompleto debe fallar cerrado",
    );
  });

  it("conserva compatibilidad con la contraseña temporal histórica", () => {
    assert.equal(getCurrentPasswordError("x"), null);
    assert.match(getCurrentPasswordError("") ?? "", /temporal/i);
    assert.match(getCurrentPasswordError("x".repeat(129)) ?? "", /128/i);
  });

  it("aplica política, diferencia y confirmación a la clave definitiva", () => {
    const currentPassword = "Temporal-2026-muy-segura";
    const newPassword = "Definitiva interna 2026 segura";

    assert.match(
      getChangedPasswordError(currentPassword, "corta") ?? "",
      /16/i,
    );
    assert.match(
      getChangedPasswordError(currentPassword, currentPassword) ?? "",
      /diferente/i,
    );
    assert.equal(getChangedPasswordError(currentPassword, newPassword), null);
    assert.match(getRepeatedPasswordError(newPassword, "") ?? "", /repet/i);
    assert.match(
      getRepeatedPasswordError(newPassword, `${newPassword}!`) ?? "",
      /no coinciden/i,
    );
    assert.equal(getRepeatedPasswordError(newPassword, newPassword), null);
    assert.equal(
      getPasswordChangeFormError({
        currentPassword,
        newPassword,
        repeatedPassword: newPassword,
      }),
      null,
    );
  });
});
