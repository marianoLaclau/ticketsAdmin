import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  ADMIN_ELEVATION_FINGERPRINT_PREFIX,
  ADMIN_ELEVATION_TTL_MS,
  createAdminElevationGrant,
  fingerprintAdminApiKey,
  isAdminElevationActive,
  type AdminElevationState,
} from "../src/lib/admin-elevation.ts";

const ADMIN_KEY = "admin-test-key";
const NOW = new Date("2026-08-09T15:00:00.000Z");

function dateAfter(milliseconds: number): Date {
  return new Date(NOW.getTime() + milliseconds);
}

function activeState(
  overrides: Partial<AdminElevationState> = {},
): AdminElevationState {
  return {
    now: NOW,
    sessionExpiresAt: dateAfter(60 * 60_000),
    elevationExpiresAt: dateAfter(ADMIN_ELEVATION_TTL_MS),
    storedKeyFingerprint: fingerprintAdminApiKey(ADMIN_KEY),
    configuredAdminApiKey: ADMIN_KEY,
    ...overrides,
  };
}

describe("política de elevación administrativa", () => {
  it("limita el permiso a quince minutos absolutos sin devolver la clave", () => {
    const grant = createAdminElevationGrant({
      now: NOW,
      sessionExpiresAt: dateAfter(60 * 60_000),
      configuredAdminApiKey: ADMIN_KEY,
    });

    assert.ok(grant);
    assert.equal(
      grant.expiresAt.getTime(),
      NOW.getTime() + ADMIN_ELEVATION_TTL_MS,
    );
    assert.match(
      grant.keyFingerprint,
      new RegExp(`^${ADMIN_ELEVATION_FINGERPRINT_PREFIX}[0-9a-f]{64}$`),
    );
    assert.equal(JSON.stringify(grant).includes(ADMIN_KEY), false);
    assert.deepEqual(Object.keys(grant).sort(), [
      "expiresAt",
      "keyFingerprint",
    ]);
  });

  it("acota la elevación al vencimiento exacto de la sesión", () => {
    const sessionExpiresAt = dateAfter(5 * 60_000);
    const grant = createAdminElevationGrant({
      now: NOW,
      sessionExpiresAt,
      configuredAdminApiKey: ADMIN_KEY,
    });

    assert.ok(grant);
    assert.equal(grant.expiresAt.getTime(), sessionExpiresAt.getTime());
  });

  it("no crea permisos para sesiones vencidas, fechas inválidas o clave vacía", () => {
    for (const input of [
      {
        now: NOW,
        sessionExpiresAt: NOW,
        configuredAdminApiKey: ADMIN_KEY,
      },
      {
        now: NOW,
        sessionExpiresAt: dateAfter(-1),
        configuredAdminApiKey: ADMIN_KEY,
      },
      {
        now: new Date(Number.NaN),
        sessionExpiresAt: dateAfter(1),
        configuredAdminApiKey: ADMIN_KEY,
      },
      {
        now: NOW,
        sessionExpiresAt: new Date(Number.NaN),
        configuredAdminApiKey: ADMIN_KEY,
      },
      {
        now: NOW,
        sessionExpiresAt: dateAfter(1),
        configuredAdminApiKey: "   ",
      },
    ]) {
      assert.equal(createAdminElevationGrant(input), null);
    }
  });

  it("deriva una huella versionada, determinista y separada por dominio", () => {
    const fingerprint = fingerprintAdminApiKey(ADMIN_KEY);

    assert.equal(
      fingerprint,
      "v1:sha256:1b4d891ecc2f45ad7c5d8037fe19601798fad696dce4550956e3bf01030f91f3",
    );
    assert.equal(fingerprintAdminApiKey(ADMIN_KEY), fingerprint);
    assert.notEqual(
      fingerprintAdminApiKey(`${ADMIN_KEY}-rotated`),
      fingerprint,
    );
    assert.notEqual(
      fingerprint,
      `${ADMIN_ELEVATION_FINGERPRINT_PREFIX}${createHash("sha256")
        .update(ADMIN_KEY, "utf8")
        .digest("hex")}`,
    );
    assert.equal(fingerprintAdminApiKey(undefined), null);
    assert.equal(fingerprintAdminApiKey(""), null);
    assert.equal(fingerprintAdminApiKey(" \t "), null);
  });

  it("mantiene activa sólo una elevación vigente dentro de la sesión", () => {
    assert.equal(isAdminElevationActive(activeState()), true);
    assert.equal(
      isAdminElevationActive(activeState({ elevationExpiresAt: dateAfter(1) })),
      true,
    );
    assert.equal(
      isAdminElevationActive(
        activeState({
          sessionExpiresAt: dateAfter(ADMIN_ELEVATION_TTL_MS),
        }),
      ),
      true,
    );

    assert.equal(
      isAdminElevationActive(activeState({ elevationExpiresAt: NOW })),
      false,
    );
    assert.equal(
      isAdminElevationActive(
        activeState({
          sessionExpiresAt: dateAfter(5_000),
          elevationExpiresAt: dateAfter(5_001),
        }),
      ),
      false,
    );
    assert.equal(
      isAdminElevationActive(
        activeState({
          sessionExpiresAt: dateAfter(-1),
          elevationExpiresAt: dateAfter(1),
        }),
      ),
      false,
    );
  });

  it("falla cerrado con campos nulos, huellas inválidas o clave rotada", () => {
    for (const overrides of [
      { elevationExpiresAt: null },
      { storedKeyFingerprint: null },
      { storedKeyFingerprint: "" },
      { storedKeyFingerprint: "v1:sha256:not-a-digest" },
      { configuredAdminApiKey: undefined },
      { configuredAdminApiKey: "   " },
      { configuredAdminApiKey: `${ADMIN_KEY}-rotated` },
      { now: new Date(Number.NaN) },
      { sessionExpiresAt: new Date(Number.NaN) },
      { elevationExpiresAt: new Date(Number.NaN) },
    ] satisfies Array<Partial<AdminElevationState>>) {
      assert.equal(isAdminElevationActive(activeState(overrides)), false);
    }
  });
});
