import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  normalizeRendimientoChatWebhookUrl,
  RendimientoChatWidget,
  type RendimientoChatApp,
  type RendimientoChatFactory,
  type RendimientoChatOptions,
} from "../src/features/rendimiento/RendimientoChatWidget.tsx";
import {
  getOrCreateRendimientoChatSessionId,
  RENDIMIENTO_CHAT_SESSION_STORAGE_KEY,
} from "../src/lib/rendimiento-chat-session.ts";
import { clearRevokedSessionState } from "../src/lib/session-state.ts";

const CHAT_PROXY_URL = "/api/rendimiento/asistente/chat";
const LEGACY_N8N_SESSION_STORAGE_KEY = "n8n-chat/sessionId";
const SESSION_ID_A = "11111111-1111-4111-8111-111111111111";
const SESSION_ID_B = "22222222-2222-4222-8222-222222222222";
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(value) {
      assert.ok(resolvePromise);
      resolvePromise(value);
    },
  };
}

function prepareBrowserChatStorage(
  t: TestContext,
  sessionId: string | null = SESSION_ID_A,
) {
  window.sessionStorage.removeItem(RENDIMIENTO_CHAT_SESSION_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_N8N_SESSION_STORAGE_KEY);
  if (sessionId !== null) {
    window.sessionStorage.setItem(
      RENDIMIENTO_CHAT_SESSION_STORAGE_KEY,
      sessionId,
    );
  }
  t.after(() => {
    window.sessionStorage.removeItem(RENDIMIENTO_CHAT_SESSION_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_N8N_SESSION_STORAGE_KEY);
  });
}

function createFactoryProbe(config: { writesLegacySession?: boolean } = {}) {
  const receivedOptions: RendimientoChatOptions[] = [];
  let unmountCalls = 0;
  const factory: RendimientoChatFactory = (options) => {
    receivedOptions.push(options);
    if (config.writesLegacySession) {
      window.localStorage.setItem(
        LEGACY_N8N_SESSION_STORAGE_KEY,
        "session-id-escrito-por-n8n",
      );
    }
    const input = document.createElement("textarea");
    input.setAttribute("aria-label", "Mensaje al asistente");
    options.target.append(input);

    return {
      unmount() {
        unmountCalls += 1;
      },
    } satisfies RendimientoChatApp;
  };

  return {
    factory,
    receivedOptions,
    get unmountCalls() {
      return unmountCalls;
    },
  };
}

test("normaliza solo el proxy y URLs seguras o HTTP locales", () => {
  assert.equal(
    normalizeRendimientoChatWebhookUrl(CHAT_PROXY_URL),
    CHAT_PROXY_URL,
  );
  assert.equal(
    normalizeRendimientoChatWebhookUrl(
      "  https://n8n.example.test:8443/webhook/chat  ",
    ),
    "https://n8n.example.test:8443/webhook/chat",
  );
  assert.equal(
    normalizeRendimientoChatWebhookUrl("http://localhost:5678/webhook/chat"),
    "http://localhost:5678/webhook/chat",
  );
  assert.equal(
    normalizeRendimientoChatWebhookUrl("http://127.0.0.1:5678/webhook/chat"),
    "http://127.0.0.1:5678/webhook/chat",
  );
  assert.equal(
    normalizeRendimientoChatWebhookUrl("http://[::1]:5678/webhook/chat"),
    "http://[::1]:5678/webhook/chat",
  );

  for (const invalidValue of [
    "https://usuario:secreto@n8n.example.test/webhook/chat",
    "http://n8n.example.test/webhook/chat",
    "ftp://localhost/webhook/chat",
    "esto no es una URL",
    "",
    null,
    undefined,
  ]) {
    assert.equal(normalizeRendimientoChatWebhookUrl(invalidValue), null);
  }
});

test("usa la clave de sessionStorage acordada y reemplaza un UUID inválido", (t) => {
  prepareBrowserChatStorage(t, null);
  assert.equal(RENDIMIENTO_CHAT_SESSION_STORAGE_KEY, "gsb_rag_chat_session_id");
  window.sessionStorage.setItem(
    RENDIMIENTO_CHAT_SESSION_STORAGE_KEY,
    "session-id-invalido",
  );

  const replacement = getOrCreateRendimientoChatSessionId(
    window.sessionStorage,
    () => SESSION_ID_B,
  );

  assert.equal(replacement, SESSION_ID_B);
  assert.equal(
    window.sessionStorage.getItem(RENDIMIENTO_CHAT_SESSION_STORAGE_KEY),
    SESSION_ID_B,
  );
  assert.equal(
    getOrCreateRendimientoChatSessionId(window.sessionStorage, () => {
      throw new Error("no debe generar otro UUID para una sesión válida");
    }),
    SESSION_ID_B,
  );
});

test("presenta un disparador accesible y mantiene cerrado el panel inicialmente", (t) => {
  t.after(cleanup);
  let loaderCalls = 0;

  render(
    <RendimientoChatWidget
      webhookUrl={CHAT_PROXY_URL}
      loadChatFactory={async () => {
        loaderCalls += 1;
        return createFactoryProbe().factory;
      }}
    />,
  );

  const trigger = screen.getByRole("button", {
    name: "Abrir asistente de Rendimiento",
  });
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(trigger.getAttribute("aria-controls"), "rendimiento-chat-panel");

  const panel = document.querySelector<HTMLElement>("#rendimiento-chat-panel");
  assert.ok(panel);
  assert.equal(panel.hidden, true);
  assert.equal(panel.getAttribute("role"), "dialog");
  assert.equal(panel.getAttribute("aria-label"), "Asistente de Rendimiento");
  assert.equal(loaderCalls, 0);
});

test("reutiliza la misma sesión al cerrar, abrir y remontar en la pestaña", async (t) => {
  t.after(cleanup);
  prepareBrowserChatStorage(t);
  const user = userEvent.setup();
  const probe = createFactoryProbe();
  let loaderCalls = 0;

  const firstView = render(
    <RendimientoChatWidget
      webhookUrl={CHAT_PROXY_URL}
      loadChatFactory={async () => {
        loaderCalls += 1;
        return probe.factory;
      }}
    />,
  );

  await user.click(
    screen.getByRole("button", { name: "Abrir asistente de Rendimiento" }),
  );

  await waitFor(() => assert.equal(probe.receivedOptions.length, 1));
  assert.equal(loaderCalls, 1);

  const [options] = probe.receivedOptions;
  assert.ok(options);
  assert.equal(options.webhookUrl, CHAT_PROXY_URL);
  assert.ok(options.target instanceof Element);
  assert.equal(options.target, screen.getByTestId("rendimiento-chat-target"));
  assert.equal(options.mode, "fullscreen");
  assert.equal(options.loadPreviousSession, false);
  assert.equal(options.sessionId, SESSION_ID_A);
  assert.equal(options.allowFileUploads, false);
  assert.equal(options.enableStreaming, false);
  assert.equal(
    Object.prototype.hasOwnProperty.call(options, "metadata"),
    false,
  );

  await user.click(
    screen.getByRole("button", { name: "Cerrar asistente de Rendimiento" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Abrir asistente de Rendimiento" }),
  );
  assert.equal(loaderCalls, 1);
  assert.equal(probe.receivedOptions.length, 1);

  firstView.unmount();
  render(
    <RendimientoChatWidget
      webhookUrl={CHAT_PROXY_URL}
      loadChatFactory={async () => {
        loaderCalls += 1;
        return probe.factory;
      }}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "Abrir asistente de Rendimiento" }),
  );
  await waitFor(() => assert.equal(probe.receivedOptions.length, 2));
  assert.equal(loaderCalls, 2);
  assert.equal(probe.receivedOptions[1]?.sessionId, SESSION_ID_A);
  assert.equal(
    window.sessionStorage.getItem(RENDIMIENTO_CHAT_SESSION_STORAGE_KEY),
    SESSION_ID_A,
  );
});

test("Nueva conversación persiste otro UUID y remonta el chat", async (t) => {
  t.after(cleanup);
  prepareBrowserChatStorage(t);
  const user = userEvent.setup();
  const probe = createFactoryProbe();

  render(
    <RendimientoChatWidget
      webhookUrl={CHAT_PROXY_URL}
      loadChatFactory={async () => probe.factory}
    />,
  );

  await user.click(
    screen.getByRole("button", { name: "Abrir asistente de Rendimiento" }),
  );
  await waitFor(() => assert.equal(probe.receivedOptions.length, 1));
  assert.equal(probe.receivedOptions[0]?.sessionId, SESSION_ID_A);

  const newConversation = screen.getByRole("button", {
    name: /Iniciar una nueva conversaci/i,
  });
  await waitFor(() =>
    assert.equal(newConversation.hasAttribute("disabled"), false),
  );
  await user.click(newConversation);

  await waitFor(() => assert.equal(probe.receivedOptions.length, 2));
  const renewedSessionId = probe.receivedOptions[1]?.sessionId;
  assert.ok(renewedSessionId);
  assert.match(renewedSessionId, UUID_V4_PATTERN);
  assert.notEqual(renewedSessionId, SESSION_ID_A);
  assert.equal(probe.unmountCalls, 1);
  assert.equal(
    window.sessionStorage.getItem(RENDIMIENTO_CHAT_SESSION_STORAGE_KEY),
    renewedSessionId,
  );
});

test("elimina la clave legacy que @n8n/chat intenta escribir en localStorage", async (t) => {
  t.after(cleanup);
  prepareBrowserChatStorage(t);
  window.localStorage.setItem(
    LEGACY_N8N_SESSION_STORAGE_KEY,
    "session-id-legacy-previo",
  );
  const user = userEvent.setup();
  const probe = createFactoryProbe({ writesLegacySession: true });

  render(
    <RendimientoChatWidget
      webhookUrl={CHAT_PROXY_URL}
      loadChatFactory={async () => probe.factory}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "Abrir asistente de Rendimiento" }),
  );
  await waitFor(() => assert.equal(probe.receivedOptions.length, 1));
  await waitFor(() =>
    assert.equal(
      window.localStorage.getItem(LEGACY_N8N_SESSION_STORAGE_KEY),
      null,
    ),
  );
});

test("la limpieza terminal usada por logout borra ambas sesiones del chat", (t) => {
  prepareBrowserChatStorage(t);
  window.localStorage.setItem(
    LEGACY_N8N_SESSION_STORAGE_KEY,
    "session-id-legacy",
  );
  const queryClient = new QueryClient();
  t.after(() => queryClient.clear());

  clearRevokedSessionState(queryClient);

  assert.equal(
    window.sessionStorage.getItem(RENDIMIENTO_CHAT_SESSION_STORAGE_KEY),
    null,
  );
  assert.equal(
    window.localStorage.getItem(LEGACY_N8N_SESSION_STORAGE_KEY),
    null,
  );
});

test("cierra con el botón o Escape y devuelve el foco al disparador", async (t) => {
  t.after(cleanup);
  prepareBrowserChatStorage(t);
  const previousAnimationFrame = window.requestAnimationFrame;
  window.requestAnimationFrame = (callback) =>
    window.setTimeout(() => callback(performance.now()), 0);
  t.after(() => {
    window.requestAnimationFrame = previousAnimationFrame;
  });
  const user = userEvent.setup();
  const probe = createFactoryProbe();

  render(
    <RendimientoChatWidget
      webhookUrl={CHAT_PROXY_URL}
      loadChatFactory={async () => probe.factory}
    />,
  );

  const trigger = screen.getByRole("button", {
    name: "Abrir asistente de Rendimiento",
  });
  await user.click(trigger);
  const input = await screen.findByRole("textbox", {
    name: "Mensaje al asistente",
  });
  await waitFor(() => assert.equal(document.activeElement, input));

  await user.click(
    screen.getByRole("button", { name: "Cerrar asistente de Rendimiento" }),
  );
  await waitFor(() => assert.equal(document.activeElement, trigger));
  assert.equal(trigger.getAttribute("aria-expanded"), "false");

  await user.click(trigger);
  await waitFor(() => assert.equal(document.activeElement, input));
  await user.keyboard("{Escape}");
  await waitFor(() => assert.equal(document.activeElement, trigger));
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
});

test("desmonta la aplicación de chat y limpia su target al salir", async (t) => {
  t.after(cleanup);
  prepareBrowserChatStorage(t);
  const user = userEvent.setup();
  const probe = createFactoryProbe();
  const view = render(
    <RendimientoChatWidget
      webhookUrl={CHAT_PROXY_URL}
      loadChatFactory={async () => probe.factory}
    />,
  );

  await user.click(
    screen.getByRole("button", { name: "Abrir asistente de Rendimiento" }),
  );
  await waitFor(() => assert.equal(probe.receivedOptions.length, 1));
  const target = probe.receivedOptions[0]?.target;
  assert.ok(target);
  assert.equal(target.childElementCount, 1);

  view.unmount();

  assert.equal(probe.unmountCalls, 1);
  assert.equal(target.childElementCount, 0);
});

test("informa el fallo y Reintentar vuelve a cargar la fábrica", async (t) => {
  t.after(cleanup);
  prepareBrowserChatStorage(t);
  const user = userEvent.setup();
  const probe = createFactoryProbe();
  let loaderCalls = 0;
  const loadChatFactory = async (): Promise<RendimientoChatFactory> => {
    loaderCalls += 1;
    if (loaderCalls === 1) throw new Error("fallo simulado");
    return probe.factory;
  };

  render(
    <RendimientoChatWidget
      webhookUrl={CHAT_PROXY_URL}
      loadChatFactory={loadChatFactory}
    />,
  );

  await user.click(
    screen.getByRole("button", { name: "Abrir asistente de Rendimiento" }),
  );
  const alert = await screen.findByRole("alert");
  assert.match(alert.textContent ?? "", /No pudimos cargar el asistente/);

  await user.click(screen.getByRole("button", { name: "Reintentar" }));
  await waitFor(() => assert.equal(loaderCalls, 2));
  await waitFor(() => assert.equal(probe.receivedOptions.length, 1));
  assert.equal(screen.queryByRole("alert"), null);
});

test("ignora una carga tardía si el widget ya fue desmontado", async (t) => {
  t.after(cleanup);
  prepareBrowserChatStorage(t);
  const user = userEvent.setup();
  const pendingFactory = deferred<RendimientoChatFactory>();
  const probe = createFactoryProbe();
  let loaderCalls = 0;
  const view = render(
    <RendimientoChatWidget
      webhookUrl={CHAT_PROXY_URL}
      loadChatFactory={() => {
        loaderCalls += 1;
        return pendingFactory.promise;
      }}
    />,
  );

  await user.click(
    screen.getByRole("button", { name: "Abrir asistente de Rendimiento" }),
  );
  await waitFor(() => assert.equal(loaderCalls, 1));
  view.unmount();

  await act(async () => {
    pendingFactory.resolve(probe.factory);
    await pendingFactory.promise;
  });

  assert.equal(probe.receivedOptions.length, 0);
  assert.equal(probe.unmountCalls, 0);
});
