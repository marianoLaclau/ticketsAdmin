import { randomUUID } from "node:crypto";

function runtimePort(environmentName: string, fallback: number): number {
  const value = Number(process.env[environmentName] ?? fallback);
  if (!Number.isInteger(value) || value <= 0 || value > 65_535) {
    throw new Error(`${environmentName} debe ser un puerto TCP válido`);
  }
  return value;
}

export const E2E_HOST = "127.0.0.1";
export const E2E_FRONTEND_PORT = runtimePort("E2E_FRONTEND_PORT", 4174);
export const E2E_BACKEND_PORT = runtimePort("E2E_BACKEND_PORT", 5101);
export const E2E_BASE_URL = `http://${E2E_HOST}:${E2E_FRONTEND_PORT}`;
export const E2E_BACKEND_URL = `http://${E2E_HOST}:${E2E_BACKEND_PORT}`;

function runtimeSecret(environmentName: string, purpose: string): string {
  const configured = process.env[environmentName];
  if (configured) return configured;

  const generated = `E2e-${purpose}-${randomUUID()}!A9`;
  // Playwright crea los workers después del global setup, por lo que heredan
  // exactamente las mismas credenciales aleatorias que recibió el backend.
  process.env[environmentName] = generated;
  return generated;
}

// Cada ejecución usa secretos distintos y una base efímera. Nunca se
// reutilizan credenciales contra datos locales, staging ni producción.
export const E2E_WEBHOOK_API_KEY = runtimeSecret(
  "E2E_WEBHOOK_API_KEY",
  "webhook",
);
export const E2E_BOOTSTRAP_PASSWORD = runtimeSecret(
  "E2E_BOOTSTRAP_PASSWORD",
  "bootstrap",
);
export const E2E_SYSADMIN_PASSWORD = runtimeSecret(
  "E2E_SYSADMIN_PASSWORD",
  "sysadmin",
);
export const E2E_AGENT_TEMP_PASSWORD = runtimeSecret(
  "E2E_AGENT_TEMP_PASSWORD",
  "agent-temp",
);
export const E2E_AGENT_PASSWORD = runtimeSecret(
  "E2E_AGENT_PASSWORD",
  "agent-final",
);
