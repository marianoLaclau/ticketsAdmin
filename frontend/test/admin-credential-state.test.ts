import assert from "node:assert/strict";
import test from "node:test";
import { getAdminCredentialState } from "../src/lib/admin-credential-state.ts";

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
