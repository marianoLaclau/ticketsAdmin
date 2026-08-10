import assert from "node:assert/strict";
import test from "node:test";
import {
  NEW_PASSWORD_HELP,
  NEW_PASSWORD_MAX_LENGTH,
  NEW_PASSWORD_MIN_LENGTH,
  getNewPasswordError,
} from "../src/lib/password-policy.ts";

test("presenta cada incumplimiento de la política sin datos técnicos", () => {
  assert.match(
    getNewPasswordError("corta") ?? "",
    new RegExp(`al menos ${NEW_PASSWORD_MIN_LENGTH}`, "i"),
  );
  assert.match(getNewPasswordError("x".repeat(129)) ?? "", /máximo 128/i);
  assert.match(
    getNewPasswordError(" Frase-larga-y-segura-2026") ?? "",
    /principio y del final/i,
  );
  assert.match(
    getNewPasswordError("PASSWORDPASSWORD") ?? "",
    /común, repetitiva o de ejemplo/i,
  );
  assert.match(getNewPasswordError("a".repeat(16)) ?? "", /repetitiva/i);
  assert.match(
    getNewPasswordError("Frase\ninterna segura 2026") ?? "",
    /caracteres de control/i,
  );
  assert.equal(getNewPasswordError("Frase interna muy segura 2026"), null);
  assert.match(
    NEW_PASSWORD_HELP,
    new RegExp(
      `entre ${NEW_PASSWORD_MIN_LENGTH} y ${NEW_PASSWORD_MAX_LENGTH}`,
      "i",
    ),
  );
});
