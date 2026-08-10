import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LoginAttemptLimiter,
  LoginKdfGate,
  LoginThroughputLimiter,
} from "../src/lib/login-rate-limit";

function confirmFailure(limiter: LoginAttemptLimiter, identity: string): void {
  const decision = limiter.reserve(identity);
  assert.equal(decision.allowed, true);
  if (!decision.allowed) assert.fail("el intento debia reservarse");
  limiter.confirmFailure(decision.reservation);
}

describe("limitador de intentos de login", () => {
  it("bloquea fallos confirmados en una ventana deslizante", () => {
    let now = 10_000;
    const limiter = new LoginAttemptLimiter({
      maxAttempts: 3,
      windowMs: 1_000,
      blockMs: 2_000,
      now: () => now,
    });

    for (let index = 0; index < 3; index += 1) {
      confirmFailure(limiter, "operadora");
    }

    const blocked = limiter.reserve("operadora");
    assert.equal(blocked.allowed, false);
    if (blocked.allowed) assert.fail("el cuarto intento debia bloquearse");
    assert.equal(blocked.newlyBlocked, true);
    assert.equal(blocked.retryAfterSeconds, 2);

    now = 11_001;
    const stillBlocked = limiter.reserve("operadora");
    assert.equal(stillBlocked.allowed, false);
    if (stillBlocked.allowed) assert.fail("el bloqueo todavia debia seguir");
    assert.equal(stillBlocked.newlyBlocked, false);
    assert.equal(stillBlocked.retryAfterSeconds, 1);

    now = 12_000;
    assert.equal(limiter.reserve("operadora").allowed, true);
  });

  it("las reservas paralelas no se convierten en un bloqueo largo", () => {
    const limiter = new LoginAttemptLimiter({ maxAttempts: 2 });
    const first = limiter.reserve("operadora");
    const second = limiter.reserve("operadora");
    assert.equal(first.allowed, true);
    assert.equal(second.allowed, true);
    if (!first.allowed || !second.allowed) {
      assert.fail("ambas reservas debian ser admitidas");
    }

    const transient = limiter.reserve("operadora");
    assert.equal(transient.allowed, false);
    if (transient.allowed) assert.fail("el exceso paralelo debia esperar");
    assert.equal(transient.newlyBlocked, false);
    assert.equal(transient.retryAfterSeconds, 1);

    limiter.refund(first.reservation);
    limiter.refund(second.reservation);
    assert.equal(limiter.reserve("operadora").allowed, true);
  });

  it("normaliza la identidad, permite reiniciar y reembolsar", () => {
    const limiter = new LoginAttemptLimiter({ maxAttempts: 1 });
    confirmFailure(limiter, "  SysAdmin ");
    assert.equal(limiter.reserve("SYSADMIN").allowed, false);
    limiter.reset("sysadmin");

    const afterReset = limiter.reserve("sysadmin");
    assert.equal(afterReset.allowed, true);
    if (!afterReset.allowed) assert.fail("el reset debia liberar la cuenta");
    limiter.refund(afterReset.reservation);
    assert.equal(limiter.size, 0);
    assert.equal(limiter.reserve("sysadmin").allowed, true);
  });

  it("mantiene claves hasheadas de tamaño fijo y memoria acotada", () => {
    const limiter = new LoginAttemptLimiter({
      maxAttempts: 3,
      maxAccounts: 2,
    });
    const longIdentity = "x".repeat(100_000);
    const first = limiter.reserve(longIdentity);
    assert.equal(first.allowed, true);
    if (!first.allowed) assert.fail("la identidad larga debia reservarse");
    assert.equal(first.reservation.key.length, 64);
    assert.equal(first.reservation.key.includes(longIdentity), false);

    const second = limiter.reserve("segunda");
    assert.equal(second.allowed, true);
    if (!second.allowed) assert.fail("la segunda identidad debia reservarse");

    const atCapacity = limiter.reserve("tercera");
    assert.equal(atCapacity.allowed, false);
    if (atCapacity.allowed)
      assert.fail("no debia expulsar una reserva en vuelo");
    assert.equal(atCapacity.retryAfterSeconds, 60);
    assert.equal(limiter.size, 2);

    limiter.refund(first.reservation);
    assert.equal(limiter.reserve("tercera").allowed, true);
    assert.equal(limiter.size, 2);
  });
});

describe("tasa global del trabajo criptografico", () => {
  it("agota un token bucket y lo repone con un reloj inyectado", () => {
    let now = 0;
    const limiter = new LoginThroughputLimiter({
      capacity: 2,
      refillTokens: 1,
      refillIntervalMs: 1_000,
      now: () => now,
    });

    assert.equal(limiter.consume().allowed, true);
    assert.equal(limiter.consume().allowed, true);
    const exhausted = limiter.consume();
    assert.equal(exhausted.allowed, false);
    if (exhausted.allowed) assert.fail("el bucket debia agotarse");
    assert.equal(exhausted.retryAfterSeconds, 1);

    now = 999;
    assert.equal(limiter.consume().allowed, false);
    now = 1_000;
    assert.equal(limiter.consume().allowed, true);
    limiter.refund();
    assert.equal(limiter.availableTokens, 1);
  });
});

describe("admision concurrente del trabajo criptografico", () => {
  it("acota ejecuciones y cola sin perder los trabajos ya admitidos", async () => {
    const gate = new LoginKdfGate(2, 1);
    const started: string[] = [];
    const releases: Array<() => void> = [];
    const work = (id: string) =>
      gate.run(async () => {
        started.push(id);
        await new Promise<void>((resolve) => releases.push(resolve));
        return id;
      });

    const first = work("primero");
    const second = work("segundo");
    await Promise.resolve();
    const third = work("tercero");
    await Promise.resolve();
    const rejected = await work("rechazado");

    assert.deepEqual(started, ["primero", "segundo"]);
    assert.equal(gate.activeCount, 2);
    assert.equal(gate.queuedCount, 1);
    assert.deepEqual(rejected, { admitted: false });

    releases.shift()?.();
    const firstResult = await first;
    assert.deepEqual(firstResult, { admitted: true, value: "primero" });
    await Promise.resolve();
    assert.deepEqual(started, ["primero", "segundo", "tercero"]);

    releases.shift()?.();
    releases.shift()?.();
    assert.deepEqual(await second, { admitted: true, value: "segundo" });
    assert.deepEqual(await third, { admitted: true, value: "tercero" });
    assert.equal(gate.activeCount, 0);
    assert.equal(gate.queuedCount, 0);
  });

  it("libera el slot y despierta la cola aunque un trabajo falle", async () => {
    const gate = new LoginKdfGate(1, 1);
    let rejectFirst: ((error: Error) => void) | undefined;
    const first = gate.run(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectFirst = reject;
        }),
    );
    await Promise.resolve();
    const second = gate.run(async () => "segundo");
    rejectFirst?.(new Error("fallo esperado"));

    await assert.rejects(first, /fallo esperado/);
    assert.deepEqual(await second, { admitted: true, value: "segundo" });
    assert.equal(gate.activeCount, 0);
    assert.equal(gate.queuedCount, 0);
  });
});
