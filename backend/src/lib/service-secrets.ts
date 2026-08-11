export const SERVICE_SECRET_MIN_LENGTH = 32;

export const REQUIRED_SERVICE_SECRET_NAMES = ["WEBHOOK_API_KEY"] as const;

type ServiceSecretName = (typeof REQUIRED_SERVICE_SECRET_NAMES)[number];
interface ServiceSecretEnvironment {
  readonly WEBHOOK_API_KEY?: string;
}

const PUBLIC_PLACEHOLDERS = new Set([
  "change-me",
  "changeme",
  "generar-otra-clave-larga-y-aleatoria",
  "generar-una-clave-larga-y-aleatoria",
  "not-used-by-backup",
  "not-used-for-readonly-command",
  "replace-me",
]);

function validateServiceSecret(
  name: ServiceSecretName,
  value: string | undefined,
): string {
  if (!value) {
    throw new Error(`${name} es obligatoria`);
  }
  if (value.length < SERVICE_SECRET_MIN_LENGTH) {
    throw new Error(
      `${name} debe tener al menos ${SERVICE_SECRET_MIN_LENGTH} caracteres`,
    );
  }
  if (value !== value.trim()) {
    throw new Error(`${name} no puede comenzar ni terminar con espacios`);
  }
  if (/\p{Cc}/u.test(value)) {
    throw new Error(`${name} no puede contener caracteres de control`);
  }

  const normalized = value.toLowerCase();
  if (
    PUBLIC_PLACEHOLDERS.has(normalized) ||
    normalized.startsWith("generar-") ||
    normalized.startsWith("not-used-") ||
    new Set(value).size === 1
  ) {
    throw new Error(`${name} no puede usar un valor público o predecible`);
  }
  return value;
}

/**
 * Valida toda la configuración que autentica llamadas entre servicios antes
 * de abrir el puerto HTTP. Nunca incluye los valores secretos en sus errores.
 */
export function validateServiceSecrets(
  environment: ServiceSecretEnvironment = process.env,
): void {
  validateServiceSecret("WEBHOOK_API_KEY", environment.WEBHOOK_API_KEY);
}
