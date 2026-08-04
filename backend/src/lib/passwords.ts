import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Parámetros explícitos y versionados. El formato anterior de la aplicación
// usaba los mismos defaults de Node, por lo que puede verificarse y migrarse
// sin pedirle al usuario que cambie su contraseña.
const KEYLEN = 64;
const SCRYPT_VERSION = "v1";
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const SCRYPT_SALT_HEX_LENGTH = 32;
const SCRYPT_HASH_HEX_LENGTH = KEYLEN * 2;
const HEX_PATTERN = /^[0-9a-f]+$/i;

// Hash válido con parámetros equivalentes al real. Se usa cuando el usuario
// no existe o su hash está roto para evitar enumeración por diferencia de
// tiempo. No es una credencial y su contraseña no se acepta nunca.
const DUMMY_PASSWORD_HASH =
  "scrypt$v1$16384$8$1$00000000000000000000000000000000$7b15aea76526004190605effbddb02e883abec6455cd6befcb5abb36004a378e7d9c30e182e50c42f37364b2c5d0070b0db0d6b70c4df43682bcc8936e540fb9";

interface ParsedPasswordHash {
  salt: string;
  hash: string;
  legacy: boolean;
}

function isHexOfLength(value: string, length: number): boolean {
  return value.length === length && HEX_PATTERN.test(value);
}

function parsePasswordHash(stored: string | null): ParsedPasswordHash | null {
  if (!stored) return null;

  const legacy = stored.split(":");
  if (
    legacy.length === 3 &&
    legacy[0] === "scrypt" &&
    isHexOfLength(legacy[1] ?? "", SCRYPT_SALT_HEX_LENGTH) &&
    isHexOfLength(legacy[2] ?? "", SCRYPT_HASH_HEX_LENGTH)
  ) {
    return { salt: legacy[1]!, hash: legacy[2]!, legacy: true };
  }

  const current = stored.split("$");
  if (
    current.length === 7 &&
    current[0] === "scrypt" &&
    current[1] === SCRYPT_VERSION &&
    current[2] === String(SCRYPT_N) &&
    current[3] === String(SCRYPT_R) &&
    current[4] === String(SCRYPT_P) &&
    isHexOfLength(current[5] ?? "", SCRYPT_SALT_HEX_LENGTH) &&
    isHexOfLength(current[6] ?? "", SCRYPT_HASH_HEX_LENGTH)
  ) {
    return { salt: current[5]!, hash: current[6]!, legacy: false };
  }

  return null;
}

function deriveKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEYLEN,
      {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        maxmem: SCRYPT_MAXMEM,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = (await deriveKey(password, salt)).toString("hex");
  return `scrypt$${SCRYPT_VERSION}$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash}`;
}

export function isUsablePasswordHash(stored: string | null): stored is string {
  return parsePasswordHash(stored) !== null;
}

export function needsPasswordRehash(stored: string | null): boolean {
  return parsePasswordHash(stored)?.legacy ?? false;
}

export async function verifyPassword(
  password: string,
  stored: string | null,
): Promise<boolean> {
  const parsed = parsePasswordHash(stored);
  if (!parsed) return false;
  const candidate = await deriveKey(password, parsed.salt);
  const expected = Buffer.from(parsed.hash, "hex");
  return (
    candidate.length === expected.length && timingSafeEqual(candidate, expected)
  );
}

export async function verifyPasswordOrDummy(
  password: string,
  stored: string | null,
): Promise<boolean> {
  const usable = isUsablePasswordHash(stored);
  const matches = await verifyPassword(
    password,
    usable ? stored : DUMMY_PASSWORD_HASH,
  );
  return usable && matches;
}
