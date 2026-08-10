import assert from "node:assert/strict";
import { test } from "@playwright/test";
import {
  createCleanupCoordinator,
  type CleanupStep,
  CleanupStepTimeoutError,
} from "../scripts/runtime";

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

test("agota tres intentos y agrega los errores finales en orden", async () => {
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
  assert.deepEqual(calls, [
    "Vite",
    "backend",
    "directorio temporal",
    "Vite",
    "backend",
    "directorio temporal",
    "Vite",
    "backend",
    "directorio temporal",
  ]);
});

test("resuelve un rechazo tardío transitorio dentro de una sola llamada", async () => {
  const transientError = new Error("cierre transitorio de Vite");
  let rejectFirstAttempt: ((error: Error) => void) | null = null;
  let viteAttempts = 0;
  let backendAttempts = 0;
  let directoryAttempts = 0;
  const stop = createCleanupCoordinator(
    [
      {
        label: "Vite",
        run: () => {
          viteAttempts += 1;
          if (viteAttempts > 1) return Promise.resolve();
          return new Promise<void>((_resolve, reject) => {
            rejectFirstAttempt = reject;
          });
        },
      },
      {
        label: "backend",
        run: () => {
          backendAttempts += 1;
          rejectFirstAttempt?.(transientError);
          rejectFirstAttempt = null;
          return Promise.resolve();
        },
      },
      {
        label: "directorio temporal",
        run: () => {
          directoryAttempts += 1;
          return Promise.resolve();
        },
      },
    ],
    { stepTimeoutMs: 5 },
  );

  const firstCaller = stop();
  const concurrentCaller = stop();
  assert.equal(concurrentCaller, firstCaller);
  await firstCaller;

  assert.equal(viteAttempts, 2);
  assert.equal(backendAttempts, 1);
  assert.equal(directoryAttempts, 1);

  await stop();
  assert.equal(viteAttempts, 2);
  assert.equal(backendAttempts, 1);
  assert.equal(directoryAttempts, 1);
});

test("una resolución tardía completa el paso sin lanzar un duplicado", async () => {
  let resolveVite: (() => void) | null = null;
  let viteAttempts = 0;
  const stop = createCleanupCoordinator(
    [
      {
        label: "Vite",
        run: () => {
          viteAttempts += 1;
          return new Promise<void>((resolve) => {
            resolveVite = resolve;
          });
        },
      },
      {
        label: "backend",
        run: () => {
          resolveVite?.();
          resolveVite = null;
          return Promise.resolve();
        },
      },
      { label: "directorio temporal", run: () => Promise.resolve() },
    ],
    { stepTimeoutMs: 5 },
  );

  await stop();
  assert.equal(viteAttempts, 1);
});

test("acota una promesa pendiente sin bloquear los otros pasos ni duplicarla", async () => {
  const never = new Promise<void>(() => undefined);
  let viteAttempts = 0;
  let backendAttempts = 0;
  let directoryAttempts = 0;
  const stop = createCleanupCoordinator(
    [
      {
        label: "Vite",
        run: () => {
          viteAttempts += 1;
          return never;
        },
      },
      {
        label: "backend",
        run: () => {
          backendAttempts += 1;
          return Promise.resolve();
        },
      },
      {
        label: "directorio temporal",
        run: () => {
          directoryAttempts += 1;
          return Promise.resolve();
        },
      },
    ],
    { maxAttempts: 3, stepTimeoutMs: 5 },
  );

  const startedAt = Date.now();
  const firstCaller = stop();
  const concurrentCaller = stop();
  assert.equal(concurrentCaller, firstCaller);
  await assert.rejects(firstCaller, (error: unknown) => {
    assert.ok(error instanceof CleanupStepTimeoutError);
    assert.equal(error.stepLabel, "Vite");
    assert.equal(error.timeoutMs, 5);
    return true;
  });

  assert.ok(Date.now() - startedAt < 1_000);
  assert.equal(viteAttempts, 1);
  assert.equal(backendAttempts, 1);
  assert.equal(directoryAttempts, 1);
});
