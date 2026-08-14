import { useEffect, useMemo, useRef, useState } from "react";
import {
  LoaderCircle,
  MessageCircle,
  MessageSquarePlus,
  RotateCcw,
  X,
} from "lucide-react";
import {
  clearN8nLegacyChatSession,
  getOrCreateRendimientoChatSessionId,
  renewRendimientoChatSessionId,
} from "@/lib/rendimiento-chat-session";

const CHAT_PANEL_ID = "rendimiento-chat-panel";
const CHAT_PROXY_URL = "/api/rendimiento/asistente/chat";

export interface RendimientoChatOptions {
  webhookUrl: string;
  target: Element;
  mode: "fullscreen";
  showWindowCloseButton: boolean;
  showWelcomeScreen: boolean;
  loadPreviousSession: boolean;
  sessionId: string;
  defaultLanguage: "en";
  initialMessages: string[];
  i18n: {
    en: {
      title: string;
      subtitle: string;
      footer: string;
      getStarted: string;
      inputPlaceholder: string;
      closeButtonTooltip: string;
    };
  };
  allowFileUploads: boolean;
  enableStreaming: boolean;
}

export interface RendimientoChatApp {
  unmount(): void;
}

export type RendimientoChatFactory = (
  options: RendimientoChatOptions,
) => RendimientoChatApp;

type RendimientoChatFactoryLoader = () => Promise<RendimientoChatFactory>;

interface RendimientoChatWidgetProps {
  webhookUrl?: string | null;
  loadChatFactory?: RendimientoChatFactoryLoader;
}

type ChatLoadStatus = "idle" | "loading" | "ready" | "error";

function configuredWebhookUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URL(CHAT_PROXY_URL, window.location.origin).href;
}

export function normalizeRendimientoChatWebhookUrl(
  value: unknown,
  applicationOrigin = typeof window === "undefined"
    ? null
    : window.location.origin,
): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;

  if (value.trim() === CHAT_PROXY_URL) return CHAT_PROXY_URL;

  try {
    const url = new URL(value.trim());
    if (url.username || url.password) return null;

    const isSecure = url.protocol === "https:";
    const isLocalHttp =
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
    const configuredProxyUrl = applicationOrigin
      ? new URL(CHAT_PROXY_URL, applicationOrigin).href
      : null;
    const isSameOriginProxy = url.href === configuredProxyUrl;

    return isSecure || isLocalHttp || isSameOriginProxy ? url.href : null;
  } catch {
    return null;
  }
}

async function loadN8nChatFactory(): Promise<RendimientoChatFactory> {
  await import("@n8n/chat/style.css");
  const { createChat } = await import("@n8n/chat");
  return createChat as RendimientoChatFactory;
}

function focusChatInput(target: HTMLElement | null) {
  window.requestAnimationFrame(() => {
    target
      ?.querySelector<HTMLTextAreaElement>("textarea:not([disabled])")
      ?.focus();
  });
}

export function RendimientoChatWidget({
  webhookUrl = configuredWebhookUrl(),
  loadChatFactory = loadN8nChatFactory,
}: RendimientoChatWidgetProps) {
  const normalizedWebhookUrl = useMemo(
    () => normalizeRendimientoChatWebhookUrl(webhookUrl),
    [webhookUrl],
  );
  const [isOpen, setIsOpen] = useState(false);
  const [loadStatus, setLoadStatus] = useState<ChatLoadStatus>("idle");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const targetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const chatAppRef = useRef<RendimientoChatApp | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (
      !isOpen ||
      !normalizedWebhookUrl ||
      chatAppRef.current ||
      !targetRef.current
    ) {
      return;
    }

    let cancelled = false;
    let legacyStorageCleanupTimer: number | undefined;
    const target = targetRef.current;
    const sessionId =
      sessionIdRef.current ?? getOrCreateRendimientoChatSessionId();
    sessionIdRef.current = sessionId;
    clearN8nLegacyChatSession();
    setLoadStatus("loading");

    void loadChatFactory()
      .then((createChat) => {
        if (cancelled) return;

        const chatApp = createChat({
          webhookUrl: normalizedWebhookUrl,
          target,
          mode: "fullscreen",
          showWindowCloseButton: false,
          showWelcomeScreen: false,
          loadPreviousSession: false,
          sessionId,
          defaultLanguage: "en",
          initialMessages: [
            "Hola 👋",
            "Estoy acá para ayudarte con cualquier pregunta relacionada con los tickets, su gestión y seguimiento. ¿Qué te gustaría consultar?",
          ],
          i18n: {
            en: {
              title: "Asistente de consultas",
              subtitle: "Consultá sobre la gestión de tickets.",
              footer: "",
              getStarted: "Nueva conversación",
              inputPlaceholder: "Escribí tu consulta…",
              closeButtonTooltip: "Cerrar asistente",
            },
          },
          allowFileUploads: false,
          enableStreaming: false,
        });

        if (cancelled) {
          chatApp.unmount();
          target.replaceChildren();
          return;
        }

        chatAppRef.current = chatApp;
        legacyStorageCleanupTimer = window.setTimeout(
          clearN8nLegacyChatSession,
          0,
        );
        target
          .querySelector<HTMLElement>(".chat-header h1")
          ?.setAttribute("aria-level", "2");
        setLoadStatus("ready");
        focusChatInput(target);
      })
      .catch(() => {
        if (!cancelled) setLoadStatus("error");
      });

    return () => {
      cancelled = true;
      if (legacyStorageCleanupTimer !== undefined) {
        window.clearTimeout(legacyStorageCleanupTimer);
      }
    };
  }, [isOpen, loadChatFactory, normalizedWebhookUrl, retryAttempt]);

  useEffect(() => {
    const target = targetRef.current;

    return () => {
      chatAppRef.current?.unmount();
      chatAppRef.current = null;
      target?.replaceChildren();
      clearN8nLegacyChatSession();
    };
  }, [normalizedWebhookUrl]);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  if (!normalizedWebhookUrl) return null;

  const openChat = () => {
    setIsOpen(true);
    if (loadStatus === "ready") focusChatInput(targetRef.current);
  };

  const closeChat = () => {
    setIsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const retryLoading = () => {
    setLoadStatus("idle");
    setRetryAttempt((attempt) => attempt + 1);
  };

  const startNewConversation = () => {
    sessionIdRef.current = renewRendimientoChatSessionId();
    chatAppRef.current?.unmount();
    chatAppRef.current = null;
    targetRef.current?.replaceChildren();
    clearN8nLegacyChatSession();
    setLoadStatus("idle");
    setRetryAttempt((attempt) => attempt + 1);
  };

  return (
    <div className="rendimiento-chat-widget">
      <section
        id={CHAT_PANEL_ID}
        className="rendimiento-chat-panel"
        role="dialog"
        aria-label="Asistente de consultas"
        aria-modal="false"
        aria-busy={loadStatus === "loading"}
        hidden={!isOpen}
      >
        <button
          type="button"
          className="rendimiento-chat-new"
          aria-label="Iniciar una nueva conversación"
          title="Nueva conversación"
          disabled={loadStatus === "loading"}
          onClick={startNewConversation}
        >
          <MessageSquarePlus aria-hidden="true" />
        </button>

        <button
          type="button"
          className="rendimiento-chat-close"
          aria-label="Cerrar asistente de consultas"
          onClick={closeChat}
        >
          <X aria-hidden="true" />
        </button>

        {loadStatus === "loading" ? (
          <div
            className="rendimiento-chat-status"
            role="status"
            aria-live="polite"
          >
            <LoaderCircle
              className="rendimiento-chat-spinner"
              aria-hidden="true"
            />
            <span>Preparando el asistente…</span>
          </div>
        ) : null}

        {loadStatus === "error" ? (
          <div className="rendimiento-chat-status" role="alert">
            <p>No pudimos cargar el asistente.</p>
            <button
              type="button"
              className="rendimiento-chat-retry"
              onClick={retryLoading}
            >
              <RotateCcw aria-hidden="true" />
              Reintentar
            </button>
          </div>
        ) : null}

        <div
          ref={targetRef}
          className="rendimiento-chat-target"
          data-testid="rendimiento-chat-target"
        />
      </section>

      <button
        ref={triggerRef}
        type="button"
        className="rendimiento-chat-trigger"
        aria-controls={CHAT_PANEL_ID}
        aria-expanded={isOpen}
        aria-label="Abrir Asistente IA"
        onClick={openChat}
        hidden={isOpen}
      >
        <MessageCircle aria-hidden="true" />
        <span>Asistente IA</span>
      </button>
    </div>
  );
}
