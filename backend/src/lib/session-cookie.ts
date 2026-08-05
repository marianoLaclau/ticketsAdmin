import type { CookieOptions, Request, Response } from "express";

export const SESSION_COOKIE = "gsb_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
export const SESSION_COOKIE_OPTIONS = Object.freeze({
  httpOnly: true,
  sameSite: "lax",
  secure: false,
  path: "/",
}) satisfies CookieOptions;

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

export function setSessionCookie(res: Response, token: string): void {
  if (!SESSION_TOKEN_PATTERN.test(token)) {
    throw new Error("El token de sesión debe tener 64 caracteres hexadecimales");
  }
  res.cookie(SESSION_COOKIE, token, {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: SESSION_TTL_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, SESSION_COOKIE_OPTIONS);
}

export function isSessionExpired(
  expiration: Date,
  now = new Date(),
): boolean {
  const expirationTime = expiration.getTime();
  const nowTime = now.getTime();
  return (
    !Number.isFinite(expirationTime) ||
    !Number.isFinite(nowTime) ||
    expirationTime <= nowTime
  );
}
