import { Buffer } from "node:buffer";
import type { Request, Response } from "express";

const DEFAULT_CHAT_TIMEOUT_MS = 120_000;
const MAX_CHAT_TIMEOUT_MS = 120_000;
const MAX_CHAT_INPUT_BYTES = 8 * 1_024;
const MAX_UPSTREAM_RESPONSE_BYTES = 1_048_576;
const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface RendimientoChatEnvironment {
  readonly N8N_CHAT_WEBHOOK_URL?: string;
  readonly N8N_CHAT_BASIC_AUTH_USER?: string;
  readonly N8N_CHAT_BASIC_AUTH_PASSWORD?: string;
  readonly N8N_CHAT_TIMEOUT_MS?: string;
  readonly NODE_ENV?: string;
}

interface RendimientoChatConfiguration {
  webhookUrl: string;
  authorization: string;
  timeoutMs: number;
}

interface RendimientoChatMessage {
  action: "sendMessage";
  sessionId: string;
  chatInput: string;
}

export interface RendimientoChatProxyHandlerOptions {
  chatEnvironment?: RendimientoChatEnvironment;
  chatFetch?: typeof fetch;
  chatTimeoutMs?: number;
}

class RendimientoChatConfigurationError extends Error {}
class RendimientoChatUpstreamResponseTooLargeError extends Error {}
class RendimientoChatInvalidUpstreamResponseError extends Error {}

function configurationError(message: string): never {
  throw new RendimientoChatConfigurationError(message);
}

function parseTimeoutMs(rawValue: string | undefined): number {
  if (rawValue === undefined || rawValue.trim() === "") {
    return DEFAULT_CHAT_TIMEOUT_MS;
  }

  const timeoutMs = Number(rawValue);
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1_000 ||
    timeoutMs > MAX_CHAT_TIMEOUT_MS
  ) {
    configurationError("N8N_CHAT_TIMEOUT_MS no es válido");
  }
  return timeoutMs;
}

function resolveChatConfiguration(
  environment: RendimientoChatEnvironment,
  timeoutOverride?: number,
): RendimientoChatConfiguration {
  const rawUrl = environment.N8N_CHAT_WEBHOOK_URL?.trim();
  const username = environment.N8N_CHAT_BASIC_AUTH_USER;
  const password = environment.N8N_CHAT_BASIC_AUTH_PASSWORD;

  if (!rawUrl || !username || !password) {
    configurationError("La integración de chat no está configurada");
  }
  if (
    username !== username.trim() ||
    username.includes(":") ||
    username.length > 256 ||
    /\p{Cc}/u.test(username)
  ) {
    configurationError("El usuario de Basic Auth no es válido");
  }
  if (
    password !== password.trim() ||
    password.length > 512 ||
    /\p{Cc}/u.test(password)
  ) {
    configurationError("La contraseña de Basic Auth no es válida");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    configurationError("N8N_CHAT_WEBHOOK_URL no es una URL válida");
  }

  const isSecure = url.protocol === "https:";
  const isLocalHttp =
    url.protocol === "http:" &&
    environment.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  if (
    (!isSecure && !isLocalHttp) ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== ""
  ) {
    configurationError("N8N_CHAT_WEBHOOK_URL no es segura");
  }

  const timeoutMs =
    timeoutOverride ?? parseTimeoutMs(environment.N8N_CHAT_TIMEOUT_MS);
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > MAX_CHAT_TIMEOUT_MS
  ) {
    configurationError("El timeout del chat no es válido");
  }

  return {
    webhookUrl: url.href,
    authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`,
    timeoutMs,
  };
}

function parseChatMessage(body: unknown): RendimientoChatMessage | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;

  const candidate = body as Record<string, unknown>;
  const allowedKeys = new Set(["action", "sessionId", "chatInput"]);
  if (Object.keys(candidate).some((key) => !allowedKeys.has(key))) return null;

  const sessionId = candidate.sessionId;
  const chatInput = candidate.chatInput;
  if (
    candidate.action !== "sendMessage" ||
    typeof sessionId !== "string" ||
    !SESSION_ID_PATTERN.test(sessionId) ||
    typeof chatInput !== "string" ||
    chatInput.trim() === "" ||
    Buffer.byteLength(chatInput, "utf8") > MAX_CHAT_INPUT_BYTES
  ) {
    return null;
  }

  return {
    action: "sendMessage",
    sessionId,
    chatInput,
  };
}

async function readUpstreamResponse(response: globalThis.Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_UPSTREAM_RESPONSE_BYTES
  ) {
    await response.body?.cancel();
    throw new RendimientoChatUpstreamResponseTooLargeError();
  }

  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_UPSTREAM_RESPONSE_BYTES) {
        await reader.cancel();
        throw new RendimientoChatUpstreamResponseTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

interface NormalizedChatResponse {
  output: string;
}

function normalizeUpstreamResponse(
  body: Uint8Array,
  contentType: string,
): NormalizedChatResponse {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body).trim();
  } catch {
    throw new RendimientoChatInvalidUpstreamResponseError();
  }
  if (!text) throw new RendimientoChatInvalidUpstreamResponseError();

  if (!contentType.includes("application/json")) {
    if (/<(?:!doctype|html|body|script)\b/i.test(text)) {
      throw new RendimientoChatInvalidUpstreamResponseError();
    }
    return { output: text };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new RendimientoChatInvalidUpstreamResponseError();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RendimientoChatInvalidUpstreamResponseError();
  }

  const candidate = parsed as Record<string, unknown>;
  const directOutput = [candidate.output, candidate.text, candidate.message]
    .find((value): value is string => typeof value === "string")
    ?.trim();
  const messageObject =
    candidate.message &&
    typeof candidate.message === "object" &&
    !Array.isArray(candidate.message)
      ? (candidate.message as Record<string, unknown>)
      : null;
  const nestedOutput =
    messageObject?.type === "text" && typeof messageObject.text === "string"
      ? messageObject.text.trim()
      : "";
  const output = directOutput || nestedOutput;

  if (!output) {
    throw new RendimientoChatInvalidUpstreamResponseError();
  }

  return { output };
}

function sendProxyError(
  res: Response,
  status: 502 | 503 | 504,
  code: string,
  message: string,
) {
  res.status(status).json({ code, error: message, output: message });
}

function getAuthenticatedUserId(res: Response): number | null {
  const authUser = res.locals.authUser as { id?: unknown } | undefined;
  return authUser &&
    Number.isSafeInteger(authUser.id) &&
    Number(authUser.id) > 0
    ? Number(authUser.id)
    : null;
}

export function createRendimientoChatProxyHandler(
  options: RendimientoChatProxyHandlerOptions = {},
) {
  const fetchUpstream = options.chatFetch ?? fetch;

  return async (req: Request, res: Response): Promise<void> => {
    res.set("Cache-Control", "private, no-store");
    res.set("X-Content-Type-Options", "nosniff");

    const authenticatedUserId = getAuthenticatedUserId(res);
    if (authenticatedUserId === null) {
      res.status(403).json({
        code: "PERFORMANCE_ACCESS_REQUIRED",
        error: "Requiere rol SysAdmin o Controller",
        output: "No tenés permiso para usar este asistente.",
      });
      return;
    }

    let configuration: RendimientoChatConfiguration;
    try {
      configuration = resolveChatConfiguration(
        options.chatEnvironment ?? process.env,
        options.chatTimeoutMs,
      );
    } catch (error) {
      if (!(error instanceof RendimientoChatConfigurationError)) throw error;
      sendProxyError(
        res,
        503,
        "RENDIMIENTO_CHAT_NOT_CONFIGURED",
        "El asistente no está disponible en este momento.",
      );
      return;
    }

    const message = parseChatMessage(req.body);
    if (!message) {
      res.status(400).json({
        code: "RENDIMIENTO_CHAT_INVALID_MESSAGE",
        error: "El mensaje no es válido.",
        output: "El mensaje no es válido.",
      });
      return;
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, configuration.timeoutMs);
    timeout.unref();

    const abortOnDisconnect = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.once("aborted", abortOnDisconnect);
    res.once("close", abortOnDisconnect);

    try {
      const upstreamResponse = await fetchUpstream(configuration.webhookUrl, {
        method: "POST",
        redirect: "error",
        headers: {
          accept: "application/json, text/plain;q=0.9",
          authorization: configuration.authorization,
          "content-type": "application/json",
        },
        body: JSON.stringify(message),
        signal: controller.signal,
      });

      if (req.aborted || res.destroyed) return;

      if (!upstreamResponse.ok) {
        await upstreamResponse.body?.cancel();
        sendProxyError(
          res,
          502,
          "RENDIMIENTO_CHAT_UPSTREAM_ERROR",
          "El asistente no pudo responder. Intentá nuevamente.",
        );
        return;
      }

      const body = await readUpstreamResponse(upstreamResponse);
      if (req.aborted || res.destroyed) return;

      const upstreamContentType =
        upstreamResponse.headers.get("content-type")?.toLowerCase() ?? "";
      res
        .status(upstreamResponse.status)
        .json(normalizeUpstreamResponse(body, upstreamContentType));
    } catch (error) {
      if (req.aborted || res.destroyed) return;

      if (timedOut) {
        sendProxyError(
          res,
          504,
          "RENDIMIENTO_CHAT_TIMEOUT",
          "El asistente tardó demasiado en responder. Intentá nuevamente.",
        );
        return;
      }

      sendProxyError(
        res,
        502,
        error instanceof RendimientoChatUpstreamResponseTooLargeError
          ? "RENDIMIENTO_CHAT_RESPONSE_TOO_LARGE"
          : error instanceof RendimientoChatInvalidUpstreamResponseError
            ? "RENDIMIENTO_CHAT_INVALID_RESPONSE"
            : "RENDIMIENTO_CHAT_CONNECTION_ERROR",
        "No pudimos comunicarnos con el asistente. Intentá nuevamente.",
      );
    } finally {
      clearTimeout(timeout);
      req.removeListener("aborted", abortOnDisconnect);
      res.removeListener("close", abortOnDisconnect);
    }
  };
}
