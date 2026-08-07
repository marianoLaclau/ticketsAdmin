import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminCredentialSnapshot,
  discardLegacyAdminKey,
  getAdminKeyStorageKey,
  getOwnedAdminAccess,
  planAdminCredentialSave,
  selectOwnedAdminKey,
  type AdminCredentialSnapshot,
} from "../src/lib/admin-access-ownership.ts";
import { getConfirmedSessionUser } from "../src/lib/session-state.ts";

const ownerA: AdminCredentialSnapshot = {
  ownerUserId: 11,
  key: "llave-a",
};

test("entrega la llave solamente a su propietario autenticado", () => {
  assert.equal(selectOwnedAdminKey(11, ownerA), "llave-a");
  assert.equal(selectOwnedAdminKey(22, ownerA), "");
  assert.deepEqual(getOwnedAdminAccess(11, ownerA), {
    adminKey: "llave-a",
    adminRequest: { headers: { "x-admin-key": "llave-a" } },
  });
  assert.deepEqual(getOwnedAdminAccess(22, ownerA), {
    adminKey: "",
    adminRequest: {},
  });
});

test("bloquea el snapshot durante logout o identidad no resuelta", () => {
  assert.equal(selectOwnedAdminKey(undefined, ownerA), "");
  assert.equal(selectOwnedAdminKey(undefined, null), "");
  assert.equal(selectOwnedAdminKey(11, null), "");
  assert.deepEqual(getOwnedAdminAccess(undefined, ownerA), {
    adminKey: "",
    adminRequest: {},
  });
});

test("un cambio de identidad bloquea primero y carga luego su propio snapshot", () => {
  assert.equal(selectOwnedAdminKey(22, ownerA), "");

  const ownerB = createAdminCredentialSnapshot(22, "llave-b");
  assert.deepEqual(ownerB, { ownerUserId: 22, key: "llave-b" });
  assert.equal(selectOwnedAdminKey(22, ownerB), "llave-b");
  assert.equal(selectOwnedAdminKey(11, ownerB), "");
});

test("una identidad sin confirmar no obtiene llave ni request", () => {
  const staleUser = { id: 11 };
  const userIdWhileFetching = getConfirmedSessionUser(staleUser, {
    isError: false,
    fetchStatus: "fetching",
  })?.id;
  const userIdAfterError = getConfirmedSessionUser(staleUser, {
    isError: true,
    fetchStatus: "idle",
  })?.id;

  assert.deepEqual(getOwnedAdminAccess(userIdWhileFetching, ownerA), {
    adminKey: "",
    adminRequest: {},
  });
  assert.deepEqual(getOwnedAdminAccess(userIdAfterError, ownerA), {
    adminKey: "",
    adminRequest: {},
  });
});

test("descarta la clave legacy sin leerla ni asignarla a una identidad", () => {
  const values = new Map<string, string>([["admin-key", "legacy"]]);
  const removed: string[] = [];
  const persistedOwner = createAdminCredentialSnapshot(22, "propia");

  discardLegacyAdminKey({
    removeItem(key) {
      removed.push(key);
      values.delete(key);
    },
  });

  assert.deepEqual(removed, ["admin-key"]);
  assert.equal(values.has("admin-key"), false);
  assert.deepEqual(createAdminCredentialSnapshot(undefined, null), null);
  assert.deepEqual(createAdminCredentialSnapshot(22, null), {
    ownerUserId: 22,
    key: "",
  });
  assert.deepEqual(getOwnedAdminAccess(22, persistedOwner), {
    adminKey: "propia",
    adminRequest: { headers: { "x-admin-key": "propia" } },
  });
});

test("guardar persiste o borra exclusivamente bajo el usuario actual", () => {
  assert.deepEqual(planAdminCredentialSave(undefined, "secreto"), {
    snapshot: null,
    persistence: { kind: "none" },
  });
  assert.deepEqual(planAdminCredentialSave(22, "nueva"), {
    snapshot: { ownerUserId: 22, key: "nueva" },
    persistence: {
      kind: "set",
      storageKey: getAdminKeyStorageKey(22),
      key: "nueva",
    },
  });
  assert.deepEqual(planAdminCredentialSave(22, ""), {
    snapshot: { ownerUserId: 22, key: "" },
    persistence: {
      kind: "remove",
      storageKey: getAdminKeyStorageKey(22),
    },
  });
});
