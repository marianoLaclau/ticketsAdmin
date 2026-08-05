import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CreateAdminUserBody,
  LoginBody,
  ResetAdminUserPasswordBody,
} from "@workspace/api-zod";
import {
  LOGIN_PASSWORD_MIN_LENGTH,
  NEW_PASSWORD_MAX_LENGTH,
  NEW_PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "@workspace/password-policy";

const validUserBody = (password: string) => ({
  nombre: "Contrato",
  username: "contrato",
  password,
  email: "contrato@example.test",
  role_id: 1,
  activo: true,
});

describe("contrato generado de contraseñas", () => {
  const boundaryPassword = (length: number): string =>
    `A${"x".repeat(length - 2)}1`;

  it("mantiene alta y reset alineados con los límites compartidos", () => {
    for (const [length, expected] of [
      [NEW_PASSWORD_MIN_LENGTH - 1, false],
      [NEW_PASSWORD_MIN_LENGTH, true],
      [NEW_PASSWORD_MAX_LENGTH, true],
      [NEW_PASSWORD_MAX_LENGTH + 1, false],
    ] as const) {
      const password =
        expected && length >= 2
          ? boundaryPassword(length)
          : "x".repeat(length);
      assert.equal(
        CreateAdminUserBody.safeParse(validUserBody(password)).success,
        expected,
      );
      assert.equal(
        ResetAdminUserPasswordBody.safeParse({ password }).success,
        expected,
      );
    }
  });

  it("expresa espacios exteriores y conserva espacios interiores", () => {
    for (const password of [
      " Frase-larga-segura-2026",
      "Frase-larga-segura-2026 ",
    ]) {
      assert.equal(
        CreateAdminUserBody.safeParse(validUserBody(password)).success,
        false,
      );
      assert.equal(
        ResetAdminUserPasswordBody.safeParse({ password }).success,
        false,
      );
    }

    const internal = "Frase interna segura 2026";
    assert.equal(
      CreateAdminUserBody.safeParse(validUserBody(internal)).success,
      true,
    );
    assert.equal(
      ResetAdminUserPasswordBody.safeParse({ password: internal }).success,
      true,
    );
  });

  it("rechaza caracteres de control también en el contrato generado", () => {
    for (const password of [
      "Frase\ninterna segura 2026",
      "Frase\rinterna segura 2026",
      "Frase\tinterna segura 2026",
      "Frase\u0000interna segura 2026",
      "Frase segura 2026\u2028continúa\u0000inválida",
      "Frase interna segura 2026\u007f",
    ]) {
      assert.equal(
        CreateAdminUserBody.safeParse(validUserBody(password)).success,
        false,
      );
      assert.equal(
        ResetAdminUserPasswordBody.safeParse({ password }).success,
        false,
      );
    }
  });

  it("limita login sin aplicarle la política de contraseñas nuevas", () => {
    for (const [password, expected] of [
      ["", false],
      ["x".repeat(LOGIN_PASSWORD_MIN_LENGTH), true],
      [" passwordpassword ", true],
      ["x".repeat(PASSWORD_MAX_LENGTH), true],
      ["x".repeat(PASSWORD_MAX_LENGTH + 1), false],
    ] as const) {
      assert.equal(
        LoginBody.safeParse({ usuario: "operadora", password }).success,
        expected,
      );
    }
  });
});
