import assert from "node:assert/strict";
import test from "node:test";
import {
  getAdminCredentialState,
  isCurrentAdminOperation,
} from "../src/lib/admin-credential-state.ts";

test("distingue la ausencia de una credencial estable", () => {
  assert.equal(getAdminCredentialState("", ""), "missing");
});

test("mantiene bloqueado el directorio durante cualquier transición", () => {
  assert.equal(getAdminCredentialState("nueva", "anterior"), "pending");
  assert.equal(getAdminCredentialState("", "anterior"), "pending");
  assert.equal(getAdminCredentialState("nueva", ""), "pending");
});

test("habilita el directorio sólo con la credencial efectiva exacta", () => {
  assert.equal(getAdminCredentialState("secreto", "secreto"), "ready");
  assert.equal(getAdminCredentialState(" secreto ", " secreto "), "ready");
});

test("acepta una operación de la generación administrativa vigente", () => {
  assert.equal(isCurrentAdminOperation(4, 4, "ready"), true);
});

test("descarta una operación de una generación anterior", () => {
  assert.equal(isCurrentAdminOperation(3, 4, "ready"), false);
});

test("descarta operaciones mientras cambia la credencial", () => {
  assert.equal(isCurrentAdminOperation(4, 4, "pending"), false);
});

test("descarta operaciones cuando falta la credencial", () => {
  assert.equal(isCurrentAdminOperation(4, 4, "missing"), false);
});
