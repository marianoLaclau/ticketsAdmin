import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";
import {
  E2E_BACKEND_PORT,
  E2E_BACKEND_URL,
  E2E_BOOTSTRAP_PASSWORD,
  E2E_FRONTEND_PORT,
  E2E_HOST,
  E2E_SYSADMIN_PASSWORD,
  E2E_WEBHOOK_API_KEY,
} from "../support/environment";

const TEMP_DIRECTORY_PREFIX = "ticket-manager-e2e-";
const DEFAULT_CLEANUP_MAX_ATTEMPTS = 3;
const DEFAULT_CLEANUP_STEP_TIMEOUT_MS = 10_000;
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const backendDirectory = path.join(repoRoot, "backend");
const databaseDirectory = path.join(repoRoot, "lib", "db");
const backendEntry = path.join(backendDirectory, "src", "index.ts");
const migrationEntry = path.join(backendDirectory, "src", "migrate.ts");
const viteConfig = path.join(repoRoot, "frontend", "vite.config.ts");

export interface E2eRuntime {
  stop(): Promise<void>;
}

export interface CleanupStep {
  readonly label: string;
  readonly run: () => Promise<void>;
  readonly timeoutMs?: number;
}

export interface CleanupCoordinatorOptions {
  readonly maxAttempts?: number;
  readonly stepTimeoutMs?: number;
}

export class CleanupStepTimeoutError extends Error {
  readonly stepLabel: string;
  readonly timeoutMs: number;

  constructor(stepLabel: string, timeoutMs: number) {
    super(
      `El paso de cleanup E2E "${stepLabel}" no terminó en ${timeoutMs} ms`,
    );
    this.name = "CleanupStepTimeoutError";
    this.stepLabel = stepLabel;
    this.timeoutMs = timeoutMs;
  }
}

interface CleanupStepState {
  readonly step: CleanupStep;
  completed: boolean;
  active: Promise<void> | null;
  lastFailure: { readonly error: unknown } | null;
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${label} debe ser un entero positivo`);
  }
}

function waitForCleanupStep(
  operation: Promise<void>,
  label: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new CleanupStepTimeoutError(label, timeoutMs));
    }, timeoutMs);

    void operation.then(
      () => {
        clearTimeout(timeout);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export function createCleanupCoordinator(
  steps: readonly CleanupStep[],
  options: CleanupCoordinatorOptions = {},
): () => Promise<void> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_CLEANUP_MAX_ATTEMPTS;
  const defaultTimeoutMs =
    options.stepTimeoutMs ?? DEFAULT_CLEANUP_STEP_TIMEOUT_MS;
  assertPositiveInteger(maxAttempts, "maxAttempts");
  assertPositiveInteger(defaultTimeoutMs, "stepTimeoutMs");

  const states: CleanupStepState[] = steps.map((step) => {
    if (step.timeoutMs !== undefined) {
      assertPositiveInteger(step.timeoutMs, `timeoutMs de ${step.label}`);
    }
    return {
      step,
      completed: false,
      active: null,
      lastFailure: null,
    };
  });
  let cycleInFlight: Promise<void> | null = null;

  const getOrStartOperation = (state: CleanupStepState): Promise<void> => {
    if (state.active) return state.active;

    const operation = Promise.resolve().then(state.step.run);
    state.active = operation;
    state.lastFailure = null;
    void operation.then(
      () => {
        if (state.active !== operation) return;
        state.completed = true;
        state.active = null;
        state.lastFailure = null;
      },
      (error: unknown) => {
        if (state.active !== operation) return;
        state.active = null;
        state.lastFailure = { error };
      },
    );
    return operation;
  };

  const runCycle = async (): Promise<void> => {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      for (const state of states) {
        if (state.completed) continue;

        try {
          const operation = getOrStartOperation(state);
          await waitForCleanupStep(
            operation,
            state.step.label,
            state.step.timeoutMs ?? defaultTimeoutMs,
          );
        } catch (error) {
          if (!state.completed) state.lastFailure = { error };
        }
      }

      if (states.every((state) => state.completed)) return;
    }

    const failures = states.flatMap((state) =>
      state.completed
        ? []
        : [
            {
              label: state.step.label,
              error:
                state.lastFailure?.error ??
                new Error(
                  `El paso de cleanup E2E "${state.step.label}" quedó pendiente`,
                ),
            },
          ],
    );

    const [primaryFailure] = failures;
    if (failures.length === 1 && primaryFailure) throw primaryFailure.error;
    if (failures.length > 1) {
      throw new AggregateError(
        failures.map(({ error }) => error),
        `Fallaron pasos del cleanup E2E: ${failures
          .map(({ label }) => label)
          .join(", ")}`,
      );
    }
  };

  return () => {
    if (cycleInFlight) return cycleInFlight;

    const cycle = Promise.resolve().then(runCycle);
    cycleInFlight = cycle;
    const clearCycle = () => {
      if (cycleInFlight === cycle) cycleInFlight = null;
    };
    void cycle.then(clearCycle, clearCycle);
    return cycle;
  };
}

function unpackCleanupErrors(error: unknown): unknown[] {
  return error instanceof AggregateError ? [...error.errors] : [error];
}

function createRuntimeEnvironment(databasePath: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "test",
    LOG_LEVEL: "warn",
    PORT: String(E2E_BACKEND_PORT),
    LISTEN_HOST: E2E_HOST,
    TICKETS_DB_PATH: databasePath,
    TICKET_CSV_EXPORT_TIMEOUT_MS: "300000",
    WEBHOOK_API_KEY: E2E_WEBHOOK_API_KEY,
    BOOTSTRAP_SYSADMIN_PASSWORD: E2E_BOOTSTRAP_PASSWORD,
    PRIORIDAD_AUTOMATICA_INTERVAL_MS: "600000",
    TZ: "America/Argentina/Buenos_Aires",
  };
}

function runProcess(
  label: string,
  entry: string,
  cwd: string,
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", entry], {
      cwd,
      env: environment,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${label} terminó con ${signal ? `señal ${signal}` : `código ${code ?? "desconocido"}`}`,
        ),
      );
    });
  });
}

async function waitForBackend(): Promise<void> {
  const deadline = Date.now() + 45_000;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${E2E_BACKEND_URL}/api/readyz`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) {
        const payload = (await response.json()) as { status?: unknown };
        if (payload.status === "ready") return;
      }
      lastError = new Error(`readiness respondió HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error("El backend E2E no alcanzó readiness a tiempo", {
    cause: lastError,
  });
}

async function provisionSysAdmin(): Promise<void> {
  const loginResponse = await fetch(`${E2E_BACKEND_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usuario: "sysadmin",
      password: E2E_BOOTSTRAP_PASSWORD,
    }),
  });
  if (!loginResponse.ok) {
    throw new Error(
      `No se pudo autenticar el SysAdmin temporal (HTTP ${loginResponse.status})`,
    );
  }
  const setCookie = loginResponse.headers.get("set-cookie");
  const sessionCookie = setCookie?.split(";", 1)[0];
  if (!sessionCookie) {
    throw new Error("El bootstrap E2E no recibió la cookie de sesión");
  }

  const changeResponse = await fetch(`${E2E_BACKEND_URL}/api/auth/password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: sessionCookie,
    },
    body: JSON.stringify({
      password_actual: E2E_BOOTSTRAP_PASSWORD,
      password_nueva: E2E_SYSADMIN_PASSWORD,
    }),
  });
  if (!changeResponse.ok) {
    throw new Error(
      `No se pudo fijar la clave definitiva del SysAdmin E2E (HTTP ${changeResponse.status})`,
    );
  }
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.removeListener("exit", handleExit);
      resolve(false);
    }, timeoutMs);
    timeout.unref();

    function handleExit(): void {
      clearTimeout(timeout);
      resolve(true);
    }

    child.once("exit", handleExit);
  });
}

async function stopBackend(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  child.kill("SIGTERM");
  if (await waitForExit(child, 5_000)) return;
  child.kill("SIGKILL");
  if (!(await waitForExit(child, 2_000))) {
    throw new Error("El backend E2E siguió activo después de SIGKILL");
  }
}

function assertDisposableDirectory(directory: string): void {
  const resolvedDirectory = path.resolve(directory);
  const expectedParent = path.resolve(tmpdir());
  if (
    path.dirname(resolvedDirectory) !== expectedParent ||
    !path.basename(resolvedDirectory).startsWith(TEMP_DIRECTORY_PREFIX)
  ) {
    throw new Error(
      `Se rechazó limpiar un directorio temporal fuera del alcance E2E: ${resolvedDirectory}`,
    );
  }
}

async function createViteServer(): Promise<ViteDevServer> {
  const previousPort = process.env.PORT;
  const previousProxy = process.env.API_PROXY_TARGET;
  const previousBasePath = process.env.BASE_PATH;
  process.env.PORT = String(E2E_FRONTEND_PORT);
  process.env.API_PROXY_TARGET = E2E_BACKEND_URL;
  process.env.BASE_PATH = "/";

  try {
    return await createServer({
      configFile: viteConfig,
      server: {
        host: E2E_HOST,
        port: E2E_FRONTEND_PORT,
        strictPort: true,
      },
    });
  } finally {
    if (previousPort === undefined) delete process.env.PORT;
    else process.env.PORT = previousPort;
    if (previousProxy === undefined) delete process.env.API_PROXY_TARGET;
    else process.env.API_PROXY_TARGET = previousProxy;
    if (previousBasePath === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = previousBasePath;
  }
}

export async function startE2eRuntime(): Promise<E2eRuntime> {
  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), TEMP_DIRECTORY_PREFIX),
  );
  const databasePath = path.join(temporaryDirectory, "tickets-e2e.db");
  const environment = createRuntimeEnvironment(databasePath);
  let backend: ChildProcess | null = null;
  let vite: ViteDevServer | null = null;
  let stopRequested = false;

  const coordinateCleanup = createCleanupCoordinator([
    {
      label: "Vite",
      run: async () => {
        const current = vite;
        if (!current) return;
        await current.close();
        if (vite === current) vite = null;
      },
    },
    {
      label: "backend",
      run: async () => {
        const current = backend;
        if (!current) return;
        await stopBackend(current);
        if (backend === current) backend = null;
      },
    },
    {
      label: "directorio temporal",
      run: async () => {
        assertDisposableDirectory(temporaryDirectory);
        await rm(temporaryDirectory, { recursive: true, force: true });
      },
    },
  ]);
  const stop = (): Promise<void> => {
    stopRequested = true;
    return coordinateCleanup();
  };

  try {
    // La segunda ejecución demuestra que la cadena real es idempotente.
    await runProcess(
      "La primera migración",
      migrationEntry,
      databaseDirectory,
      environment,
    );
    await runProcess(
      "La segunda migración",
      migrationEntry,
      databaseDirectory,
      environment,
    );

    backend = spawn(process.execPath, ["--import", "tsx", backendEntry], {
      cwd: backendDirectory,
      env: environment,
      stdio: "inherit",
      windowsHide: true,
    });
    backend.once("error", (error) => {
      if (!stopRequested) {
        process.stderr.write(
          `Error del backend E2E: ${error instanceof Error ? error.message : String(error)}\n`,
        );
      }
    });
    backend.once("exit", (code, signal) => {
      if (!stopRequested) {
        process.stderr.write(
          `El backend E2E terminó antes del teardown (${signal ?? code ?? "desconocido"}).\n`,
        );
      }
    });

    await waitForBackend();
    await provisionSysAdmin();
    vite = await createViteServer();
    await vite.listen();
    process.stdout.write(
      `Entorno E2E aislado disponible en http://${E2E_HOST}:${E2E_FRONTEND_PORT}\n`,
    );

    return { stop };
  } catch (error) {
    try {
      await stop();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, ...unpackCleanupErrors(cleanupError)],
        "Falló el arranque E2E y su cleanup quedó incompleto",
        { cause: cleanupError },
      );
    }
    throw error;
  }
}
