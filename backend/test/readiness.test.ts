import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HealthCheckResponse,
  ReadinessCheckResponse,
} from "@workspace/api-zod";
import Database from "better-sqlite3";
import { createReadinessControl } from "../src/lib/readiness.ts";
import { probeSqliteReadiness } from "../src/lib/sqlite-readiness.ts";

describe("control de readiness", () => {
  it("avanza de starting a ready y nunca abandona draining", () => {
    let dependencyReady = true;
    let probes = 0;
    const control = createReadinessControl(() => {
      probes += 1;
      return dependencyReady;
    });

    assert.equal(control.currentPhase(), "starting");
    assert.equal(control.isReady(), false);
    assert.equal(probes, 0);

    control.markReady();
    assert.equal(control.currentPhase(), "ready");
    assert.equal(control.isReady(), true);
    assert.equal(probes, 1);

    dependencyReady = false;
    assert.equal(control.isReady(), false);
    dependencyReady = true;
    assert.equal(control.isReady(), true);

    control.beginDrain();
    control.markReady();
    assert.equal(control.currentPhase(), "draining");
    assert.equal(control.isReady(), false);
    assert.equal(probes, 3);
  });

  it("falla cerrado si la sonda lanza una excepcion", () => {
    const errors: unknown[] = [];
    const control = createReadinessControl(
      () => {
        throw new Error("fallo interno que no debe propagarse");
      },
      (error) => errors.push(error),
    );
    control.markReady();
    assert.equal(control.isReady(), false);
    assert.equal(errors.length, 1);
  });
});

describe("contrato de health y readiness", () => {
  it("mantiene separados liveness y readiness", () => {
    assert.equal(HealthCheckResponse.safeParse({ status: "ok" }).success, true);
    assert.equal(
      HealthCheckResponse.safeParse({ status: "unavailable" }).success,
      false,
    );
    assert.equal(
      ReadinessCheckResponse.safeParse({ status: "ready" }).success,
      true,
    );
    assert.equal(
      ReadinessCheckResponse.safeParse({ status: "ok" }).success,
      false,
    );
    assert.equal(
      ReadinessCheckResponse.safeParse({ status: "unavailable" }).success,
      false,
    );
  });
});

describe("sonda SQLite de readiness", () => {
  it("valida el handle y el esquema minimo requerido", () => {
    const database = new Database(":memory:");

    assert.throws(() => probeSqliteReadiness(database), /no such table/i);
    database.exec(
      "CREATE TABLE tickets (id INTEGER PRIMARY KEY, version INTEGER NOT NULL)",
    );
    assert.throws(() => probeSqliteReadiness(database), /no such table/i);
    database.exec(
      "CREATE TABLE tickets_cuarentena (ticket_id INTEGER PRIMARY KEY)",
    );
    assert.throws(() => probeSqliteReadiness(database), /no such table/i);
    database.exec(`
      CREATE TABLE sesiones (
        token TEXT PRIMARY KEY NOT NULL,
        usuario_id INTEGER NOT NULL,
        fecha_expiracion INTEGER NOT NULL,
        fecha_creacion INTEGER NOT NULL
      )
    `);
    assert.throws(
      () => probeSqliteReadiness(database),
      /admin_elevacion_hasta/i,
    );
    database.exec("ALTER TABLE sesiones ADD admin_elevacion_hasta INTEGER");
    assert.throws(
      () => probeSqliteReadiness(database),
      /admin_elevacion_clave_hash/i,
    );
    database.exec("ALTER TABLE sesiones ADD admin_elevacion_clave_hash TEXT");
    assert.equal(probeSqliteReadiness(database), true);

    database.close();
    assert.equal(probeSqliteReadiness(database), false);
  });
});
