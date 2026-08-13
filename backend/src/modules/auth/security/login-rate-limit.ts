import { createHash } from "node:crypto";

// Estado singleton del limitador de autenticacion: no duplicar esta instancia.

const MINUTE_MS = 60_000;

export const LOGIN_ACCOUNT_MAX_ATTEMPTS = 10;
export const LOGIN_ACCOUNT_WINDOW_MS = 15 * MINUTE_MS;
export const LOGIN_ACCOUNT_BLOCK_MS = 15 * MINUTE_MS;
export const LOGIN_RATE_LIMIT_MAX_ACCOUNTS = 20_000;
export const LOGIN_KDF_MAX_CONCURRENT = 4;
export const LOGIN_KDF_MAX_QUEUED = 8;
export const LOGIN_KDF_GLOBAL_CAPACITY = 30;
export const LOGIN_KDF_GLOBAL_REFILL_PER_MINUTE = 30;

interface Attempt {
  id: number;
  at: number;
}

interface AccountEntry {
  failures: Attempt[];
  pending: Attempt[];
  blockedUntil: number | null;
  lastSeenAt: number;
}

export interface LoginAttemptReservation {
  key: string;
  attemptId: number;
}

export type LoginAttemptDecision =
  | {
      allowed: true;
      reservation: LoginAttemptReservation;
    }
  | {
      allowed: false;
      retryAfterSeconds: number;
      newlyBlocked: boolean;
    };

interface LoginAttemptLimiterOptions {
  maxAttempts?: number;
  windowMs?: number;
  blockMs?: number;
  maxAccounts?: number;
  now?: () => number;
}

function normalizeLoginIdentity(value: string): string {
  return value.trim().toLowerCase();
}

function hashLoginIdentity(value: string): string {
  return createHash("sha256")
    .update("gsb-login-rate-limit\0", "utf8")
    .update(normalizeLoginIdentity(value), "utf8")
    .digest("hex");
}

function retryAfterSeconds(until: number, now: number): number {
  return Math.max(1, Math.ceil((until - now) / 1_000));
}

/**
 * Limitador deslizante por identidad de login.
 *
 * Una reserva pendiente evita que solicitudes paralelas atraviesen juntas el
 * límite, pero solo una credencial efectivamente rechazada se confirma como
 * fallo. Las claves quedan hasheadas y el mapa tiene un máximo estricto.
 */
export class LoginAttemptLimiter {
  private readonly entries = new Map<string, AccountEntry>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly blockMs: number;
  private readonly maxAccounts: number;
  private readonly now: () => number;
  private nextAttemptId = 1;

  constructor(options: LoginAttemptLimiterOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? LOGIN_ACCOUNT_MAX_ATTEMPTS;
    this.windowMs = options.windowMs ?? LOGIN_ACCOUNT_WINDOW_MS;
    this.blockMs = options.blockMs ?? LOGIN_ACCOUNT_BLOCK_MS;
    this.maxAccounts = options.maxAccounts ?? LOGIN_RATE_LIMIT_MAX_ACCOUNTS;
    this.now = options.now ?? Date.now;

    for (const [name, value] of Object.entries({
      maxAttempts: this.maxAttempts,
      windowMs: this.windowMs,
      blockMs: this.blockMs,
      maxAccounts: this.maxAccounts,
    })) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive safe integer`);
      }
    }
  }

  reserve(identity: string): LoginAttemptDecision {
    const now = this.now();
    const key = hashLoginIdentity(identity);
    let entry = this.entries.get(key);

    if (entry && entry.blockedUntil !== null) {
      if (entry.blockedUntil > now) {
        entry.lastSeenAt = now;
        return {
          allowed: false,
          retryAfterSeconds: retryAfterSeconds(entry.blockedUntil, now),
          newlyBlocked: false,
        };
      }
      // Una vez cumplido el bloqueo empieza una ventana limpia.
      this.entries.delete(key);
      entry = undefined;
    }

    if (!entry) {
      if (!this.ensureCapacity(now)) {
        return {
          allowed: false,
          retryAfterSeconds: 60,
          newlyBlocked: false,
        };
      }
      entry = {
        failures: [],
        pending: [],
        blockedUntil: null,
        lastSeenAt: now,
      };
      this.entries.set(key, entry);
    }

    this.pruneEntry(entry, now);
    entry.lastSeenAt = now;

    if (entry.failures.length >= this.maxAttempts) {
      entry.blockedUntil = now + this.blockMs;
      return {
        allowed: false,
        retryAfterSeconds: retryAfterSeconds(entry.blockedUntil, now),
        newlyBlocked: true,
      };
    }

    // Las reservas pendientes cuentan para admisión, pero no activan un
    // bloqueo largo: si luego no ejecutan KDF se pueden reembolsar sin carrera.
    if (entry.failures.length + entry.pending.length >= this.maxAttempts) {
      return {
        allowed: false,
        retryAfterSeconds: 1,
        newlyBlocked: false,
      };
    }

    const attemptId = this.nextAttemptId++;
    entry.pending.push({ id: attemptId, at: now });
    return { allowed: true, reservation: { key, attemptId } };
  }

  confirmFailure(reservation: LoginAttemptReservation): void {
    const entry = this.entries.get(reservation.key);
    if (!entry) return;

    const pendingIndex = entry.pending.findIndex(
      ({ id }) => id === reservation.attemptId,
    );
    if (pendingIndex < 0) return;

    entry.pending.splice(pendingIndex, 1);
    const now = this.now();
    this.pruneEntry(entry, now);
    entry.failures.push({ id: reservation.attemptId, at: now });
    entry.lastSeenAt = now;
  }

  /** Libera una reserva que no terminó como credencial inválida. */
  refund(reservation: LoginAttemptReservation): void {
    const entry = this.entries.get(reservation.key);
    if (!entry) return;
    entry.pending = entry.pending.filter(
      ({ id }) => id !== reservation.attemptId,
    );
    if (
      entry.failures.length === 0 &&
      entry.pending.length === 0 &&
      entry.blockedUntil === null
    ) {
      this.entries.delete(reservation.key);
    }
  }

  /** Un login válido inicia una cuenta nueva de intentos para esa identidad. */
  reset(identity: string): void {
    this.entries.delete(hashLoginIdentity(identity));
  }

  resetAll(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private pruneEntry(entry: AccountEntry, now: number): void {
    entry.failures = entry.failures.filter(
      ({ at }) => now - at < this.windowMs,
    );
    entry.pending = entry.pending.filter(({ at }) => now - at < this.windowMs);
  }

  private ensureCapacity(now: number): boolean {
    if (this.entries.size < this.maxAccounts) return true;

    for (const [key, entry] of this.entries) {
      this.pruneEntry(entry, now);
      const activelyBlocked =
        entry.blockedUntil !== null && entry.blockedUntil > now;
      if (
        entry.failures.length === 0 &&
        entry.pending.length === 0 &&
        !activelyBlocked
      ) {
        this.entries.delete(key);
      }
    }
    if (this.entries.size < this.maxAccounts) return true;

    let candidate: {
      key: string;
      activity: number;
      lastSeenAt: number;
    } | null = null;
    for (const [key, entry] of this.entries) {
      if (entry.blockedUntil !== null && entry.blockedUntil > now) continue;
      // Una reserva en vuelo debe conservar su entrada hasta poder confirmar o
      // reembolsar el resultado. Si todas están ocupadas, se rechaza una nueva
      // identidad antes que perder la contabilidad de un KDF ya admitido.
      if (entry.pending.length > 0) continue;
      const activity = entry.failures.length + entry.pending.length;
      if (
        !candidate ||
        activity < candidate.activity ||
        (activity === candidate.activity &&
          entry.lastSeenAt < candidate.lastSeenAt)
      ) {
        candidate = { key, activity, lastSeenAt: entry.lastSeenAt };
      }
    }
    if (candidate) this.entries.delete(candidate.key);
    return this.entries.size < this.maxAccounts;
  }
}

interface LoginThroughputLimiterOptions {
  capacity?: number;
  refillTokens?: number;
  refillIntervalMs?: number;
  now?: () => number;
}

export type LoginThroughputDecision =
  { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** Token bucket global que limita la tasa sostenida de KDF públicos. */
export class LoginThroughputLimiter {
  private readonly capacity: number;
  private readonly refillTokens: number;
  private readonly refillIntervalMs: number;
  private readonly now: () => number;
  private tokens: number;
  private lastRefillAt: number;

  constructor(options: LoginThroughputLimiterOptions = {}) {
    this.capacity = options.capacity ?? LOGIN_KDF_GLOBAL_CAPACITY;
    this.refillTokens =
      options.refillTokens ?? LOGIN_KDF_GLOBAL_REFILL_PER_MINUTE;
    this.refillIntervalMs = options.refillIntervalMs ?? MINUTE_MS;
    this.now = options.now ?? Date.now;

    for (const [name, value] of Object.entries({
      capacity: this.capacity,
      refillTokens: this.refillTokens,
      refillIntervalMs: this.refillIntervalMs,
    })) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive safe integer`);
      }
    }

    this.tokens = this.capacity;
    this.lastRefillAt = this.now();
  }

  consume(): LoginThroughputDecision {
    const now = this.now();
    this.refill(now);
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return { allowed: true };
    }

    const tokensPerMs = this.refillTokens / this.refillIntervalMs;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((1 - this.tokens) / tokensPerMs / 1_000),
      ),
    };
  }

  refund(): void {
    this.refill(this.now());
    this.tokens = Math.min(this.capacity, this.tokens + 1);
  }

  resetAll(): void {
    this.tokens = this.capacity;
    this.lastRefillAt = this.now();
  }

  get availableTokens(): number {
    this.refill(this.now());
    return this.tokens;
  }

  private refill(now: number): void {
    const elapsed = Math.max(0, now - this.lastRefillAt);
    if (elapsed === 0) return;
    this.tokens = Math.min(
      this.capacity,
      this.tokens + (elapsed * this.refillTokens) / this.refillIntervalMs,
    );
    this.lastRefillAt = now;
  }
}

type WorkAdmission<T> = { admitted: true; value: T } | { admitted: false };

/** Evita una cola sin límite de trabajos scrypt iniciados desde el login. */
export class LoginKdfGate {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(
    private readonly maxConcurrent = LOGIN_KDF_MAX_CONCURRENT,
    private readonly maxQueued = LOGIN_KDF_MAX_QUEUED,
  ) {
    if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent <= 0) {
      throw new Error("maxConcurrent must be a positive safe integer");
    }
    if (!Number.isSafeInteger(maxQueued) || maxQueued < 0) {
      throw new Error("maxQueued must be a non-negative safe integer");
    }
  }

  async run<T>(work: () => Promise<T>): Promise<WorkAdmission<T>> {
    if (this.active >= this.maxConcurrent) {
      if (this.queue.length >= this.maxQueued) return { admitted: false };
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }

    this.active += 1;
    try {
      return { admitted: true, value: await work() };
    } finally {
      this.active -= 1;
      this.queue.shift()?.();
    }
  }

  get activeCount(): number {
    return this.active;
  }

  get queuedCount(): number {
    return this.queue.length;
  }
}

export type LoginKdfAdmission<T> =
  { admitted: true; value: T } | { admitted: false; retryAfterSeconds: number };

export const loginAttemptLimiter = new LoginAttemptLimiter();
export const loginKdfThroughputLimiter = new LoginThroughputLimiter();
export const loginKdfGate = new LoginKdfGate();

export async function executeLoginKdf<T>(
  work: () => Promise<T>,
): Promise<LoginKdfAdmission<T>> {
  const throughput = loginKdfThroughputLimiter.consume();
  if (!throughput.allowed) {
    return {
      admitted: false,
      retryAfterSeconds: throughput.retryAfterSeconds,
    };
  }

  const gate = await loginKdfGate.run(work);
  if (!gate.admitted) {
    loginKdfThroughputLimiter.refund();
    return { admitted: false, retryAfterSeconds: 1 };
  }
  return gate;
}
