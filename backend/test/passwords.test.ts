import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import { describe, it } from "node:test";
import {
  hashPassword,
  isUsablePasswordHash,
  needsPasswordRehash,
  verifyPassword,
  verifyPasswordOrDummy,
} from "../src/modules/auth/security/passwords.ts";

const password = "Clave-de-prueba-2026";

describe("hashes scrypt versionados", () => {
  it("genera sales independientes y verifica el formato actual", async () => {
    const [first, second] = await Promise.all([
      hashPassword(password),
      hashPassword(password),
    ]);

    assert.match(first, /^scrypt\$v1\$16384\$8\$1\$/);
    assert.notEqual(first, second);
    assert.equal(isUsablePasswordHash(first), true);
    assert.equal(needsPasswordRehash(first), false);
    assert.equal(await verifyPassword(password, first), true);
    assert.equal(await verifyPassword("incorrecta", first), false);
  });

  it("mantiene compatibilidad con el formato legado y lo marca para rehash", async () => {
    const salt = "0123456789abcdef0123456789abcdef";
    const hash = scryptSync(password, salt, 64).toString("hex");
    const legacy = `scrypt:${salt}:${hash}`;

    assert.equal(isUsablePasswordHash(legacy), true);
    assert.equal(needsPasswordRehash(legacy), true);
    assert.equal(await verifyPassword(password, legacy), true);
  });

  it("rechaza formatos malformados y el hash dummy nunca autentica", async () => {
    const validSalt = "00".repeat(16);
    const validDigest = "00".repeat(64);
    for (const stored of [
      null,
      "",
      "scrypt:sal:hash",
      `scrypt$v2$16384$8$1$${validSalt}$${validDigest}`,
      `scrypt$v1$999999999$8$1$${validSalt}$${validDigest}`,
    ]) {
      assert.equal(isUsablePasswordHash(stored), false);
      assert.equal(await verifyPassword(password, stored), false);
      assert.equal(await verifyPasswordOrDummy(password, stored), false);
    }
  });

  it("deja avanzar el event loop mientras deriva varias claves", async () => {
    let ticks = 0;
    const heartbeat = setInterval(() => {
      ticks += 1;
    }, 1);
    try {
      await Promise.all([
        hashPassword(`${password}-1`),
        hashPassword(`${password}-2`),
        hashPassword(`${password}-3`),
        hashPassword(`${password}-4`),
      ]);
    } finally {
      clearInterval(heartbeat);
    }
    assert.ok(ticks > 0, "scrypt no debe bloquear el event loop");
  });
});
