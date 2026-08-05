import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SERVICE_SECRET_MIN_LENGTH,
  validateServiceSecrets,
} from "../src/lib/service-secrets";

const validEnvironment = {
  WEBHOOK_API_KEY: "webhook-7c99c3408ac44d2197d8f6d4",
  ADMIN_API_KEY: "admin-45f2c78ce00e47a391d9e9f931",
};

describe("secretos entre servicios", () => {
  it("acepta dos secretos independientes y suficientemente largos", () => {
    assert.doesNotThrow(() => validateServiceSecrets(validEnvironment));
  });

  it("rechaza variables ausentes o vacias", () => {
    for (const environment of [
      { ...validEnvironment, WEBHOOK_API_KEY: undefined },
      { ...validEnvironment, ADMIN_API_KEY: "" },
    ]) {
      assert.throws(
        () => validateServiceSecrets(environment),
        /WEBHOOK_API_KEY|ADMIN_API_KEY/,
      );
    }
  });

  it("nunca incluye el secreto rechazado en el error", () => {
    const sensitiveValue = ` secreto-${"7f".repeat(20)} `;
    assert.throws(
      () =>
        validateServiceSecrets({
          ...validEnvironment,
          WEBHOOK_API_KEY: sensitiveValue,
        }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes(sensitiveValue.trim()), false);
        return true;
      },
    );
  });

  it("rechaza secretos cortos, espacios exteriores y controles", () => {
    for (const value of [
      "x".repeat(SERVICE_SECRET_MIN_LENGTH - 1),
      ` ${"x".repeat(SERVICE_SECRET_MIN_LENGTH)}`,
      `${"x".repeat(16)}\u0000${"y".repeat(16)}`,
    ]) {
      assert.throws(() =>
        validateServiceSecrets({ ...validEnvironment, ADMIN_API_KEY: value }),
      );
    }
  });

  it("rechaza placeholders, valores repetitivos y claves reutilizadas", () => {
    for (const value of [
      "generar-una-clave-larga-y-aleatoria",
      "not-used-for-readonly-command",
      "x".repeat(SERVICE_SECRET_MIN_LENGTH),
    ]) {
      assert.throws(() =>
        validateServiceSecrets({ ...validEnvironment, WEBHOOK_API_KEY: value }),
      );
    }
    assert.throws(
      () =>
        validateServiceSecrets({
          WEBHOOK_API_KEY: validEnvironment.ADMIN_API_KEY,
          ADMIN_API_KEY: validEnvironment.ADMIN_API_KEY,
        }),
      /deben ser diferentes/,
    );
  });
});
