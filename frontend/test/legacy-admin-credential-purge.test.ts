import assert from "node:assert/strict";
import test from "node:test";
import {
  purgeLegacyAdminCredentials,
  purgeLegacyAdminCredentialsFromBrowser,
} from "../src/lib/legacy-admin-credential-purge.ts";

interface StorageDoubleOptions {
  readonly keyErrors?: ReadonlySet<number>;
  readonly lengthError?: Error;
  readonly removeErrors?: ReadonlySet<string>;
}

function createStorageDouble(
  initialKeys: readonly string[],
  options: StorageDoubleOptions = {},
) {
  const keys = [...initialKeys];
  const removed: string[] = [];
  let valueReadCount = 0;

  const storage = {
    get length() {
      if (options.lengthError) throw options.lengthError;
      return keys.length;
    },
    key(index: number) {
      if (options.keyErrors?.has(index)) {
        throw new DOMException("key blocked", "SecurityError");
      }
      return keys[index] ?? null;
    },
    removeItem(key: string) {
      removed.push(key);
      if (options.removeErrors?.has(key)) {
        throw new DOMException("remove blocked", "SecurityError");
      }
      const index = keys.indexOf(key);
      if (index >= 0) keys.splice(index, 1);
    },
    getItem() {
      valueReadCount += 1;
      throw new Error("credential values must never be read");
    },
  };

  return {
    keys,
    removed,
    storage,
    get valueReadCount() {
      return valueReadCount;
    },
  };
}

test("purga solamente la clave exacta y el prefijo legacy sin leer valores", () => {
  const double = createStorageDouble([
    "unrelated",
    "admin-key:user:1",
    "admin-key",
    "admin-key:user:",
    "admin-key:user:abc",
    "admin-key:user",
    "admin-key-old",
    "prefix:admin-key:user:2",
  ]);

  purgeLegacyAdminCredentials(double.storage);

  assert.deepEqual(double.removed, [
    "admin-key",
    "admin-key:user:1",
    "admin-key:user:",
    "admin-key:user:abc",
  ]);
  assert.deepEqual(double.keys, [
    "unrelated",
    "admin-key:user",
    "admin-key-old",
    "prefix:admin-key:user:2",
  ]);
  assert.equal(double.valueReadCount, 0);
});

test("intenta borrar la clave exacta aun cuando no puede enumerar storage", () => {
  const double = createStorageDouble(["admin-key", "admin-key:user:1"], {
    lengthError: new DOMException("storage blocked", "SecurityError"),
  });

  assert.doesNotThrow(() => purgeLegacyAdminCredentials(double.storage));
  assert.deepEqual(double.removed, ["admin-key"]);
  assert.deepEqual(double.keys, ["admin-key:user:1"]);
  assert.equal(double.valueReadCount, 0);
});

test("continua enumerando cuando una posicion no es accesible", () => {
  const double = createStorageDouble(
    ["admin-key:user:1", "admin-key:user:2", "admin-key:user:3"],
    { keyErrors: new Set([1]) },
  );

  assert.doesNotThrow(() => purgeLegacyAdminCredentials(double.storage));
  assert.deepEqual(double.removed, [
    "admin-key",
    "admin-key:user:1",
    "admin-key:user:3",
  ]);
  assert.deepEqual(double.keys, ["admin-key:user:2"]);
});

test("un fallo de borrado no impide purgar las demas credenciales", () => {
  const double = createStorageDouble(
    ["admin-key", "admin-key:user:1", "admin-key:user:2"],
    { removeErrors: new Set(["admin-key", "admin-key:user:1"]) },
  );

  assert.doesNotThrow(() => purgeLegacyAdminCredentials(double.storage));
  assert.deepEqual(double.removed, [
    "admin-key",
    "admin-key:user:1",
    "admin-key:user:2",
  ]);
  assert.deepEqual(double.keys, ["admin-key", "admin-key:user:1"]);
});

test("purga localStorage y sessionStorage de manera independiente", () => {
  const local = createStorageDouble(["admin-key:user:7", "local-safe"]);
  const session = createStorageDouble(["admin-key", "session-safe"]);

  purgeLegacyAdminCredentialsFromBrowser({
    localStorage: local.storage,
    sessionStorage: session.storage,
  });

  assert.deepEqual(local.keys, ["local-safe"]);
  assert.deepEqual(session.keys, ["session-safe"]);
  assert.equal(local.valueReadCount, 0);
  assert.equal(session.valueReadCount, 0);
});

test("un getter de storage bloqueado no impide purgar el otro", () => {
  const session = createStorageDouble(["admin-key:user:9", "session-safe"]);
  const storageHost = Object.defineProperties(
    {},
    {
      localStorage: {
        get() {
          throw new DOMException("local blocked", "SecurityError");
        },
      },
      sessionStorage: { value: session.storage },
    },
  ) as Pick<Window, "localStorage" | "sessionStorage">;

  assert.doesNotThrow(() =>
    purgeLegacyAdminCredentialsFromBrowser(storageHost),
  );
  assert.deepEqual(session.keys, ["session-safe"]);
});
