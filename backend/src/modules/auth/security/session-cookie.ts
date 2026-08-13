import { createHash } from "node:crypto";
import type { CookieOptions, Request, Response } from "express";

// Contrato unico de la cookie y del hash de sesion del backend.

export const SESSION_COOKIE = "gsb_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
export const SESSION_TOKEN_HASH_PREFIX = "sha256:";
export const SESSION_TOKEN_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
export const SESSION_COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  sameSite: "lax",
  secure: false,
  path: "/",
}) satisfies CookieOptions;

const SESSION_TOKEN_HASH_DOMAIN = "gsb-session-token:v1\0";

function getCookies(req: Request): Record<string, unknown> | undefined {
  return (req as Request & { cookies?: Record<string, unknown> }).cookies;
}

export function hasSessionCookie(req: Request): boolean {
  const cookies = getCookies(req);
  return Boolean(
    cookies && Object.prototype.hasOwnProperty.call(cookies, SESSION_COOKIE),
  );
}

export function getSessionToken(req: Request): string | null {
  const token = getCookies(req)?.[SESSION_COOKIE];
  return typeof token === "string" && SESSION_TOKEN_PATTERN.test(token)
    ? token
    : null;
}

export function hashSessionToken(token: string): string {
  if (!SESSION_TOKEN_PATTERN.test(token)) {
    throw new Error(
      "El token de sesión debe tener 64 caracteres hexadecimales",
    );
  }
  const digest = createHash("sha256")
    .update(SESSION_TOKEN_HASH_DOMAIN)
    .update(token)
    .digest("hex");
  return `${SESSION_TOKEN_HASH_PREFIX}${digest}`;
}

export function setSessionCookie(res: Response, token: string): void {
  if (!SESSION_TOKEN_PATTERN.test(token)) {
    throw new Error(
      "El token de sesión debe tener 64 caracteres hexadecimales",
    );
  }
  res.cookie(SESSION_COOKIE, token, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, SESSION_COOKIE_OPTIONS);
}

export function isSessionExpired(expiration: Date, now = new Date()): boolean {
  const expirationTime = expiration.getTime();
  const nowTime = now.getTime();
  return (
    !Number.isFinite(expirationTime) ||
    !Number.isFinite(nowTime) ||
    expirationTime <= nowTime
  );
}
