import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import express from "express";
import {
  createRendimientoChatProxyHandler,
  type RendimientoChatProxyHandlerOptions,
} from "../src/modules/rendimiento/http/chat-proxy-handler";

const TEST_ENVIRONMENT = {
  N8N_CHAT_WEBHOOK_URL: "https://n8n.example.test/webhook/chat",
  N8N_CHAT_BASIC_AUTH_USER: "chat-user",
  N8N_CHAT_BASIC_AUTH_PASSWORD: "chat-password",
};

const VALID_MESSAGE = {
  action: "sendMessage",
  sessionId: "a21d3df1-3414-43d5-b1c2-d6aeeecf6c95",
  chatInput: "¿Cómo está el equipo?",
};

interface TestResponse {
  status: number;
  headers: Headers;
  body: unknown;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function requestChatProxy(
  options: RendimientoChatProxyHandlerOptions,
  body: unknown = VALID_MESSAGE,
): Promise<TestResponse> {
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => {
    res.locals.authUser = { id: 42, rol: "Controller" };
    next();
  });
  app.post(
    "/api/rendimiento/asistente/chat",
    createRendimientoChatProxyHandler(options),
  );

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;

  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/api/rendimiento/asistente/chat`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const responseText = await response.text();
    let responseBody: unknown = responseText;
    try {
      responseBody = JSON.parse(responseText) as unknown;
    } catch {
      // Las respuestas exitosas del Chat Trigger también pueden ser texto.
    }
    return {
      status: response.status,
      headers: response.headers,
      body: responseBody,
    };
  } finally {
    await closeServer(server);
  }
}

describe("proxy server-side del asistente de Rendimiento", () => {
  it("agrega Basic Auth, limita el contrato y conserva la respuesta", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const chatFetch: typeof fetch = async (input, init) => {
      requestedUrl = String(input);
      requestedInit = init;
      return new Response(JSON.stringify({ output: "Respuesta ejecutiva" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const response = await requestChatProxy(
      { chatEnvironment: TEST_ENVIRONMENT, chatFetch },
      {
        ...VALID_MESSAGE,
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { output: "Respuesta ejecutiva" });
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(requestedUrl, TEST_ENVIRONMENT.N8N_CHAT_WEBHOOK_URL);
    assert.equal(requestedInit?.method, "POST");
    assert.equal(requestedInit?.redirect, "error");
    assert.equal(
      new Headers(requestedInit?.headers).get("authorization"),
      `Basic ${Buffer.from("chat-user:chat-password").toString("base64")}`,
    );
    assert.deepEqual(JSON.parse(String(requestedInit?.body)), {
      ...VALID_MESSAGE,
    });
  });

  it("falla cerrado cuando la configuración server-side está incompleta", async () => {
    let calls = 0;
    const response = await requestChatProxy({
      chatEnvironment: {},
      chatFetch: async () => {
        calls += 1;
        return new Response();
      },
    });

    assert.equal(response.status, 503);
    assert.deepEqual(response.body, {
      code: "RENDIMIENTO_CHAT_NOT_CONFIGURED",
      error: "El asistente no está disponible en este momento.",
      output: "El asistente no está disponible en este momento.",
    });
    assert.equal(calls, 0);
  });

  it("rechaza mensajes ajenos al contrato sin contactar a n8n", async () => {
    const invalidBodies: unknown[] = [
      [],
      {},
      { ...VALID_MESSAGE, action: "loadPreviousSession" },
      { ...VALID_MESSAGE, campoArbitrario: true },
      { ...VALID_MESSAGE, metadata: { usuario: "dato sensible" } },
      { ...VALID_MESSAGE, sessionId: "con espacios" },
      { ...VALID_MESSAGE, chatInput: "   " },
      { ...VALID_MESSAGE, chatInput: "x".repeat(8_193) },
    ];

    for (const body of invalidBodies) {
      let calls = 0;
      const response = await requestChatProxy(
        {
          chatEnvironment: TEST_ENVIRONMENT,
          chatFetch: async () => {
            calls += 1;
            return new Response();
          },
        },
        body,
      );
      assert.equal(response.status, 400);
      assert.deepEqual(response.body, {
        code: "RENDIMIENTO_CHAT_INVALID_MESSAGE",
        error: "El mensaje no es válido.",
        output: "El mensaje no es válido.",
      });
      assert.equal(calls, 0);
    }
  });

  it("no propaga respuestas técnicas ni credenciales rechazadas por n8n", async () => {
    const response = await requestChatProxy({
      chatEnvironment: TEST_ENVIRONMENT,
      chatFetch: async () =>
        new Response("Unauthorized: detalle interno", { status: 401 }),
    });

    assert.equal(response.status, 502);
    assert.deepEqual(response.body, {
      code: "RENDIMIENTO_CHAT_UPSTREAM_ERROR",
      error: "El asistente no pudo responder. Intentá nuevamente.",
      output: "El asistente no pudo responder. Intentá nuevamente.",
    });
    assert.doesNotMatch(JSON.stringify(response.body), /unauthorized/i);
    assert.doesNotMatch(
      JSON.stringify(response.body),
      /chat-user|chat-password/i,
    );
  });

  it("normaliza texto plano y bloquea HTML o JSON sin respuesta", async () => {
    const plainText = await requestChatProxy({
      chatEnvironment: TEST_ENVIRONMENT,
      chatFetch: async () =>
        new Response("Respuesta simple", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
    });
    assert.equal(plainText.status, 200);
    assert.deepEqual(plainText.body, { output: "Respuesta simple" });

    for (const upstreamResponse of [
      new Response("<!DOCTYPE html><title>Proxy error</title>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
      new Response("{json roto", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      new Response(JSON.stringify({ debug: "detalle interno" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ]) {
      const response = await requestChatProxy({
        chatEnvironment: TEST_ENVIRONMENT,
        chatFetch: async () => upstreamResponse,
      });
      assert.equal(response.status, 502);
      assert.deepEqual(response.body, {
        code: "RENDIMIENTO_CHAT_INVALID_RESPONSE",
        error: "No pudimos comunicarnos con el asistente. Intentá nuevamente.",
        output: "No pudimos comunicarnos con el asistente. Intentá nuevamente.",
      });
      assert.doesNotMatch(JSON.stringify(response.body), /debug|proxy error/i);
    }
  });

  it("corta workflows que exceden el timeout controlado", async () => {
    const chatFetch: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        const rejectAbort = () =>
          reject(new DOMException("La solicitud fue cancelada", "AbortError"));
        if (signal?.aborted) rejectAbort();
        else signal?.addEventListener("abort", rejectAbort, { once: true });
      });

    const response = await requestChatProxy({
      chatEnvironment: TEST_ENVIRONMENT,
      chatFetch,
      chatTimeoutMs: 10,
    });

    assert.equal(response.status, 504);
    assert.deepEqual(response.body, {
      code: "RENDIMIENTO_CHAT_TIMEOUT",
      error: "El asistente tardó demasiado en responder. Intentá nuevamente.",
      output: "El asistente tardó demasiado en responder. Intentá nuevamente.",
    });
  });

  it("rechaza respuestas desmedidas antes de entregarlas al navegador", async () => {
    const response = await requestChatProxy({
      chatEnvironment: TEST_ENVIRONMENT,
      chatFetch: async () =>
        new Response("x".repeat(1_048_577), {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
    });

    assert.equal(response.status, 502);
    assert.deepEqual(response.body, {
      code: "RENDIMIENTO_CHAT_RESPONSE_TOO_LARGE",
      error: "No pudimos comunicarnos con el asistente. Intentá nuevamente.",
      output: "No pudimos comunicarnos con el asistente. Intentá nuevamente.",
    });
  });
});
