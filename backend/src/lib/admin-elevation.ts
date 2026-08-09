import { createHash, timingSafeEqual } from "node:crypto";

export const ADMIN_ELEVATION_TTL_MS = 15 * 60 * 1_000;
export const ADMIN_ELEVATION_FINGERPRINT_PREFIX = "v1:sha256:";

const ADMIN_ELEVATION_FINGERPRINT_DOMAIN = "gsb-admin-elevation-api-key:v1\0";
const ADMIN_ELEVATION_FINGERPRINT_PATTERN = /^v1:sha256:[0-9a-f]{64}$/;

export interface AdminElevationGrant {
  expiresAt: Date;
  keyFingerprint: string;
}

export interface AdminElevationState {
  now: Date;
  sessionExpiresAt: Date;
  elevationExpiresAt: Date | null;
  storedKeyFingerprint: string | null;
  configuredAdminApiKey: string | undefined;
}

function validTime(value: Date): number | null {
  const time = value.getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * Deriva una huella no reutilizable de la clave administrativa configurada.
 *
 * El prefijo permite rotar el algoritmo en el futuro y el dominio impide que
 * el mismo secreto produzca el hash usado por otro subsistema.
 */
export function fingerprintAdminApiKey(
  configuredAdminApiKey: string | undefined,
): string | null {
  if (!configuredAdminApiKey?.trim()) return null;

  const digest = createHash("sha256")
    .update(ADMIN_ELEVATION_FINGERPRINT_DOMAIN, "utf8")
    .update(configuredAdminApiKey, "utf8")
    .digest("hex");
  return `${ADMIN_ELEVATION_FINGERPRINT_PREFIX}${digest}`;
}

/**
 * Construye exclusivamente los valores que pueden persistirse en la sesión.
 * Una sesión ya vencida o una configuración inválida fallan de forma cerrada.
 */
export function createAdminElevationGrant({
  now,
  sessionExpiresAt,
  configuredAdminApiKey,
}: Pick<
  AdminElevationState,
  "now" | "sessionExpiresAt" | "configuredAdminApiKey"
>): AdminElevationGrant | null {
  const nowTime = validTime(now);
  const sessionExpiresAtTime = validTime(sessionExpiresAt);
  const keyFingerprint = fingerprintAdminApiKey(configuredAdminApiKey);

  if (
    nowTime === null ||
    sessionExpiresAtTime === null ||
    sessionExpiresAtTime <= nowTime ||
    keyFingerprint === null
  ) {
    return null;
  }

  return {
    expiresAt: new Date(
      Math.min(nowTime + ADMIN_ELEVATION_TTL_MS, sessionExpiresAtTime),
    ),
    keyFingerprint,
  };
}

function safeFingerprintEquals(stored: string, current: string): boolean {
  if (
    !ADMIN_ELEVATION_FINGERPRINT_PATTERN.test(stored) ||
    !ADMIN_ELEVATION_FINGERPRINT_PATTERN.test(current)
  ) {
    return false;
  }

  const storedDigest = Buffer.from(
    stored.slice(ADMIN_ELEVATION_FINGERPRINT_PREFIX.length),
    "hex",
  );
  const currentDigest = Buffer.from(
    current.slice(ADMIN_ELEVATION_FINGERPRINT_PREFIX.length),
    "hex",
  );
  return timingSafeEqual(storedDigest, currentDigest);
}

/** Evalúa la elevación persistida contra la sesión y la clave vigentes. */
export function isAdminElevationActive({
  now,
  sessionExpiresAt,
  elevationExpiresAt,
  storedKeyFingerprint,
  configuredAdminApiKey,
}: AdminElevationState): boolean {
  const nowTime = validTime(now);
  const sessionExpiresAtTime = validTime(sessionExpiresAt);
  const elevationExpiresAtTime = elevationExpiresAt
    ? validTime(elevationExpiresAt)
    : null;
  const currentKeyFingerprint = fingerprintAdminApiKey(configuredAdminApiKey);

  if (
    nowTime === null ||
    sessionExpiresAtTime === null ||
    elevationExpiresAtTime === null ||
    elevationExpiresAtTime <= nowTime ||
    elevationExpiresAtTime > sessionExpiresAtTime ||
    !storedKeyFingerprint ||
    !currentKeyFingerprint
  ) {
    return false;
  }

  return safeFingerprintEquals(storedKeyFingerprint, currentKeyFingerprint);
}
