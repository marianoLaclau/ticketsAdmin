import {
  LoginAttemptLimiter,
  type LoginAttemptDecision,
  type LoginAttemptReservation,
} from "./login-rate-limit";
import { SESSION_TOKEN_HASH_PATTERN } from "./session-cookie";

const MINUTE_MS = 60_000;

export const ADMIN_ELEVATION_MAX_FAILURES = 5;
export const ADMIN_ELEVATION_ATTEMPT_WINDOW_MS = 15 * MINUTE_MS;
export const ADMIN_ELEVATION_BLOCK_MS = 15 * MINUTE_MS;
export const ADMIN_ELEVATION_RATE_LIMIT_MAX_SESSIONS = 20_000;

export type AdminElevationAttemptDecision = LoginAttemptDecision;
export type AdminElevationAttemptReservation = LoginAttemptReservation;

export interface AdminElevationRateLimiterOptions {
  maxSessions?: number;
  now?: () => number;
}

function assertSessionTokenHash(tokenHash: string): void {
  if (!SESSION_TOKEN_HASH_PATTERN.test(tokenHash)) {
    throw new Error("La identidad de elevación debe ser un hash de sesión");
  }
}

/**
 * Limitador por sesión para validar la clave administrativa.
 *
 * Delega la ventana, las reservas concurrentes y la capacidad acotada al
 * limitador de intentos ya probado. La identidad admitida es exclusivamente
 * el hash de sesión; la clave administrativa nunca ingresa a esta estructura.
 */
export class AdminElevationRateLimiter {
  private readonly limiter: LoginAttemptLimiter;

  constructor(options: AdminElevationRateLimiterOptions = {}) {
    this.limiter = new LoginAttemptLimiter({
      maxAttempts: ADMIN_ELEVATION_MAX_FAILURES,
      windowMs: ADMIN_ELEVATION_ATTEMPT_WINDOW_MS,
      blockMs: ADMIN_ELEVATION_BLOCK_MS,
      maxAccounts:
        options.maxSessions ?? ADMIN_ELEVATION_RATE_LIMIT_MAX_SESSIONS,
      now: options.now,
    });
  }

  reserve(tokenHash: string): AdminElevationAttemptDecision {
    assertSessionTokenHash(tokenHash);
    return this.limiter.reserve(tokenHash);
  }

  confirmFailure(reservation: AdminElevationAttemptReservation): void {
    this.limiter.confirmFailure(reservation);
  }

  refund(reservation: AdminElevationAttemptReservation): void {
    this.limiter.refund(reservation);
  }

  resetSession(tokenHash: string): void {
    assertSessionTokenHash(tokenHash);
    this.limiter.reset(tokenHash);
  }

  resetAll(): void {
    this.limiter.resetAll();
  }

  get size(): number {
    return this.limiter.size;
  }
}

export const adminElevationRateLimiter = new AdminElevationRateLimiter();
