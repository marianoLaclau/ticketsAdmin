import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BLOCKED_NEW_PASSWORDS,
  NEW_PASSWORD_MAX_LENGTH,
  NEW_PASSWORD_MIN_LENGTH,
  getNewPasswordViolation,
} from "../src/index.ts";

describe("política compartida de contraseñas nuevas", () => {
  const boundaryPassword = (length: number): string =>
    `A${"b".repeat(length - 2)}1`;

  it("acepta frases largas e incluso espacios interiores", () => {
    for (const password of [
      "Frase larga interna 2026",
      boundaryPassword(NEW_PASSWORD_MIN_LENGTH),
      boundaryPassword(NEW_PASSWORD_MAX_LENGTH),
    ]) {
      assert.equal(getNewPasswordViolation(password), null);
    }
  });

  it("distingue longitud y espacios exteriores", () => {
    assert.equal(getNewPasswordViolation("a".repeat(15)), "too_short");
    assert.equal(getNewPasswordViolation("a".repeat(129)), "too_long");
    assert.equal(
      getNewPasswordViolation(" Frase-larga-y-segura-2026"),
      "outer_whitespace",
    );
    assert.equal(
      getNewPasswordViolation("\tFrase-larga-y-segura-2026"),
      "control_character",
    );
    assert.equal(
      getNewPasswordViolation("Frase-larga-y-segura-2026\u00a0"),
      "outer_whitespace",
    );
  });

  it("rechaza caracteres de control en cualquier posición", () => {
    for (const password of [
      "Frase\ninterna segura 2026",
      "Frase\rinterna segura 2026",
      "Frase\tinterna segura 2026",
      "Frase\u0000interna segura 2026",
      "Frase interna segura 2026\u007f",
    ]) {
      assert.equal(getNewPasswordViolation(password), "control_character");
    }
  });

  it("bloquea claves comunes y ejemplos públicos sin distinguir Unicode o mayúsculas", () => {
    for (const password of BLOCKED_NEW_PASSWORDS) {
      assert.equal(getNewPasswordViolation(password), "blocked");
    }
    assert.equal(getNewPasswordViolation("PASSWORDPASSWORD"), "blocked");
    assert.equal(getNewPasswordViolation("a".repeat(16)), "blocked");
    assert.equal(getNewPasswordViolation("Ｚ".repeat(16)), "blocked");
    assert.equal(
      getNewPasswordViolation("ＰＡＳＳＷＯＲＤＰＡＳＳＷＯＲＤ"),
      "blocked",
    );
  });
});
