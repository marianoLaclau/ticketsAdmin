import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CookieOptions, Request, Response } from "express";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  SESSION_TTL_MS,
  SESSION_TOKEN_HASH_PATTERN,
  SESSION_TOKEN_PATTERN,
  clearSessionCookie,
  getSessionToken,
  hashSessionToken,
  hasSessionCookie,
  isSessionExpired,
  setSessionCookie,
} from "../src/lib/session-cookie";

function requestWithCookie(value?: unknown): Request {
  return {
    cookies:
      value === undefined
        ? {}
        : {
            [SESSION_COOKIE]: value,
          },
  } as Request;
}

describe("token de cookie de sesión", () => {
  it("acepta únicamente el formato aleatorio emitido por el backend", () => {
    const token = "a1".repeat(32);
    assert.equal(getSessionToken(requestWithCookie(token)), token);
    assert.equal(hasSessionCookie(requestWithCookie(token)), true);

    for (const invalid of [
      "",
      "a".repeat(63),
      "a".repeat(65),
      "A1".repeat(32),
      "g1".repeat(32),
      123,
    ]) {
      const request = requestWithCookie(invalid);
      assert.equal(hasSessionCookie(request), true);
      assert.equal(getSessionToken(request), null);
    }

    assert.equal(hasSessionCookie(requestWithCookie()), false);
    assert.equal(getSessionToken(requestWithCookie()), null);
  });

  it("deriva un hash versionado que no puede reutilizarse como cookie", () => {
    const token = "a1".repeat(32);
    const tokenHash = hashSessionToken(token);

    assert.equal(
      tokenHash,
      "sha256:e2732a12a6b58fcdddd074a673d2d5338996d9c678154e345a7cd1669377f115",
    );
    assert.match(tokenHash, SESSION_TOKEN_HASH_PATTERN);
    assert.doesNotMatch(tokenHash, SESSION_TOKEN_PATTERN);
    assert.notEqual(tokenHash, token);
    assert.throws(() => hashSessionToken("token-invalido"));
  });

  it("centraliza atributos idénticos al crear y eliminar la cookie", () => {
    let created:
      { name: string; value: string; options: CookieOptions } | undefined;
    let cleared: { name: string; options: CookieOptions } | undefined;
    const response = {
      cookie(name: string, value: string, options: CookieOptions) {
        created = { name, value, options };
        return this;
      },
      clearCookie(name: string, options: CookieOptions) {
        cleared = { name, options };
        return this;
      },
    } as unknown as Response;
    const token = "b2".repeat(32);

    setSessionCookie(response, token);
    clearSessionCookie(response);

    assert.deepEqual(created, {
      name: SESSION_COOKIE,
      value: token,
      options: { ...SESSION_COOKIE_OPTIONS, maxAge: SESSION_TTL_MS },
    });
    assert.deepEqual(cleared, {
      name: SESSION_COOKIE,
      options: SESSION_COOKIE_OPTIONS,
    });
    assert.throws(() => setSessionCookie(response, "token-invalido"));
  });

  it("considera vencida también la sesión en el instante exacto", () => {
    const now = new Date("2026-08-05T12:00:00.000Z");
    assert.equal(
      isSessionExpired(new Date("2026-08-05T11:59:59.999Z"), now),
      true,
    );
    assert.equal(isSessionExpired(new Date(now), now), true);
    assert.equal(
      isSessionExpired(new Date("2026-08-05T12:00:00.001Z"), now),
      false,
    );
    assert.equal(isSessionExpired(new Date(Number.NaN), now), true);
    assert.equal(isSessionExpired(now, new Date(Number.NaN)), true);
  });
});
