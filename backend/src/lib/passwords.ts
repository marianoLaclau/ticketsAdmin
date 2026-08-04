import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// scrypt del módulo crypto de Node: sin dependencias nativas extra (a
// diferencia de bcrypt/argon2), lo que mantiene el build de Docker simple.
const KEYLEN = 64;
const SCRYPT_SALT_HEX_LENGTH = 32;
const SCRYPT_HASH_HEX_LENGTH = KEYLEN * 2;
const HEX_PATTERN = /^[0-9a-f]+$/i;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEYLEN).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function isUsablePasswordHash(stored: string | null): stored is string {
  if (!stored) return false;
  const parts = stored.split(":");
  if (parts.length !== 3) return false;
  const [scheme, salt, hash] = parts;
  return (
    scheme === "scrypt" &&
    salt.length === SCRYPT_SALT_HEX_LENGTH &&
    hash.length === SCRYPT_HASH_HEX_LENGTH &&
    HEX_PATTERN.test(salt) &&
    HEX_PATTERN.test(hash)
  );
}

export function verifyPassword(
  password: string,
  stored: string | null,
): boolean {
  if (!isUsablePasswordHash(stored)) return false;
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, KEYLEN);
  const expected = Buffer.from(hash, "hex");
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}
