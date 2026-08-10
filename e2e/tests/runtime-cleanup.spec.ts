import assert from "node:assert/strict";
import { test } from "@playwright/test";
import { createCleanupCoordinator, type CleanupStep } from "../scripts/runtime";

function failingStep(
  label: string,
  error: Error,
  calls: string[],
): CleanupStep {
  return {
    label,
    run: () => {
      calls.push(label);
      return Promise.reject(error);
    },
  };
}

test("intenta todos los pasos y agrega sus errores en orden", async () => {
  const calls: string[] = [];
  const viteError = new Error("falló Vite");
  const backendError = new Error("falló backend");
  const directoryError = new Error("falló temporal");
  const stop = createCleanupCoordinator([
    failingStep("Vite", viteError, calls),
    failingStep("backend", backendError, calls),
    failingStep("directorio temporal", directoryError, calls),
  ]);

  await assert.rejects(stop(), (error: unknown) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [viteError, backendError, directoryError]);
    assert.match(error.message, /Vite, backend, directorio temporal/);
    return true;
  });
  assert.deepEqual(calls, ["Vite", "backend", "directorio temporal"]);
});

test("comparte el intento concurrente y reintenta sólo los pasos fallidos", async () => {
  const calls: string[] = [];
  const primaryError = new Error("cierre transitorio de Vite");
  let viteAttempts = 0;
  const stop = createCleanupCoordinator([
    {
      label: "Vite",
      run: () => {
        viteAttempts += 1;
        calls.push(`Vite-${viteAttempts}`);
        return viteAttempts === 1
          ? Promise.reject(primaryError)
          : Promise.resolve();
      },
    },
    {
      label: "backend",
      run: () => {
        calls.push("backend");
        return Promise.resolve();
      },
    },
    {
      label: "directorio temporal",
      run: () => {
        calls.push("directorio temporal");
        return Promise.resolve();
      },
    },
  ]);

  const firstAttempt = stop();
  const concurrentAttempt = stop();
  assert.equal(concurrentAttempt, firstAttempt);
  await assert.rejects(
    firstAttempt,
    (error: unknown) => error === primaryError,
  );
  assert.deepEqual(calls, ["Vite-1", "backend", "directorio temporal"]);

  await stop();
  assert.deepEqual(calls, [
    "Vite-1",
    "backend",
    "directorio temporal",
    "Vite-2",
  ]);

  await stop();
  assert.deepEqual(calls, [
    "Vite-1",
    "backend",
    "directorio temporal",
    "Vite-2",
  ]);
});
