import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADMIN_ELEVATION_ATTEMPT_WINDOW_MS,
  ADMIN_ELEVATION_BLOCK_MS,
  ADMIN_ELEVATION_MAX_FAILURES,
  AdminElevationRateLimiter,
  type AdminElevationAttemptReservation,
} from "../src/lib/admin-elevation-rate-limit.ts";
import { hashSessionToken } from "../src/lib/session-cookie.ts";

const SESSION_A = hashSessionToken("a".repeat(64));
const SESSION_B = hashSessionToken("b".repeat(64));
const SESSION_C = hashSessionToken("c".repeat(64));

function reserveAllowed(
  limiter: AdminElevationRateLimiter,
  session = SESSION_A,
): AdminElevationAttemptReservation {
  const decision = limiter.reserve(session);
  assert.equal(decision.allowed, true);
  return decision.reservation;
}

function confirmFailures(
  limiter: AdminElevationRateLimiter,
  total: number,
  session = SESSION_A,
): void {
  for (let attempt = 0; attempt < total; attempt += 1) {
    limiter.confirmFailure(reserveAllowed(limiter, session));
  }
}

describe("límite de elevación administrativa", () => {
  it("admite cinco fallos y bloquea el sexto durante quince minutos", () => {
    const limiter = new AdminElevationRateLimiter();

    confirmFailures(limiter, ADMIN_ELEVATION_MAX_FAILURES);
    const blocked = limiter.reserve(SESSION_A);

    assert.deepEqual(blocked, {
      allowed: false,
      retryAfterSeconds: ADMIN_ELEVATION_BLOCK_MS / 1_000,
      newlyBlocked: true,
    });
  });

  it("cuenta reservas paralelas antes de ejecutar la validación", () => {
    const limiter = new AdminElevationRateLimiter();
    const pending = Array.from({ length: ADMIN_ELEVATION_MAX_FAILURES }, () =>
      reserveAllowed(limiter),
    );

    assert.deepEqual(limiter.reserve(SESSION_A), {
      allowed: false,
      retryAfterSeconds: 1,
      newlyBlocked: false,
    });

    limiter.refund(pending.pop()!);
    assert.equal(limiter.reserve(SESSION_A).allowed, true);
  });

  it("reembolsa intentos no ejecutados y reinicia una sesión tras el éxito", () => {
    const limiter = new AdminElevationRateLimiter();

    for (
      let attempt = 0;
      attempt < ADMIN_ELEVATION_MAX_FAILURES + 2;
      attempt += 1
    ) {
      limiter.refund(reserveAllowed(limiter));
    }
    assert.equal(limiter.size, 0);

    confirmFailures(limiter, ADMIN_ELEVATION_MAX_FAILURES);
    assert.equal(limiter.reserve(SESSION_A).allowed, false);
    limiter.resetSession(SESSION_A);
    assert.equal(limiter.reserve(SESSION_A).allowed, true);
  });

  it("respeta tanto la ventana de fallos como el fin exacto del bloqueo", () => {
    let now = 1_000;
    const windowLimiter = new AdminElevationRateLimiter({ now: () => now });
    confirmFailures(windowLimiter, ADMIN_ELEVATION_MAX_FAILURES - 1);

    now += ADMIN_ELEVATION_ATTEMPT_WINDOW_MS;
    confirmFailures(windowLimiter, ADMIN_ELEVATION_MAX_FAILURES);
    assert.equal(windowLimiter.reserve(SESSION_A).allowed, false);

    let blockNow = 10_000;
    const blockLimiter = new AdminElevationRateLimiter({
      now: () => blockNow,
    });
    confirmFailures(blockLimiter, ADMIN_ELEVATION_MAX_FAILURES);
    assert.equal(blockLimiter.reserve(SESSION_A).allowed, false);

    blockNow += ADMIN_ELEVATION_BLOCK_MS - 1;
    const stillBlocked = blockLimiter.reserve(SESSION_A);
    assert.equal(stillBlocked.allowed, false);
    if (!stillBlocked.allowed) assert.equal(stillBlocked.retryAfterSeconds, 1);

    blockNow += 1;
    assert.equal(blockLimiter.reserve(SESSION_A).allowed, true);
  });

  it("aísla el bloqueo por sesión", () => {
    const limiter = new AdminElevationRateLimiter();
    confirmFailures(limiter, ADMIN_ELEVATION_MAX_FAILURES, SESSION_A);

    assert.equal(limiter.reserve(SESSION_A).allowed, false);
    assert.equal(limiter.reserve(SESSION_B).allowed, true);
  });

  it("mantiene capacidad estricta y rechaza identidades que no son hashes", () => {
    const limiter = new AdminElevationRateLimiter({ maxSessions: 2 });
    reserveAllowed(limiter, SESSION_A);
    reserveAllowed(limiter, SESSION_B);

    assert.deepEqual(limiter.reserve(SESSION_C), {
      allowed: false,
      retryAfterSeconds: 60,
      newlyBlocked: false,
    });
    assert.equal(limiter.size, 2);
    assert.throws(
      () => limiter.reserve("ADMIN_API_KEY-cruda"),
      /hash de sesión/,
    );
    assert.throws(() => limiter.resetSession("token-crudo"), /hash de sesión/);
    assert.equal(limiter.size, 2);
  });
});
