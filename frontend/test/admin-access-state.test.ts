import assert from "node:assert/strict";
import test from "node:test";
import { isCurrentAdminOperation } from "../src/lib/admin-access-state.ts";

test("acepta una operación de la generación administrativa vigente", () => {
  assert.equal(isCurrentAdminOperation(4, 4, "ready"), true);
});

test("descarta una operación de una generación anterior", () => {
  assert.equal(isCurrentAdminOperation(3, 4, "ready"), false);
});

test("descarta operaciones mientras cambia el acceso", () => {
  assert.equal(isCurrentAdminOperation(4, 4, "pending"), false);
});

test("descarta operaciones cuando falta el acceso", () => {
  assert.equal(isCurrentAdminOperation(4, 4, "missing"), false);
});
