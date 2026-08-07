import { joinBasePath } from "./base-path.ts";

export const SESSION_TRANSITION_STORAGE_KEY =
  "gsb-ticket-manager:session-transition:v1";

interface SessionTransitionSignal {
  version: 1;
  basePath: string;
  nonce: string;
}

interface SessionTransitionStorage {
  setItem(key: string, value: string): void;
}

interface SessionTransitionEventTarget {
  addEventListener(type: "storage", listener: EventListener): void;
  removeEventListener(type: "storage", listener: EventListener): void;
}

interface PublishSessionTransitionOptions {
  storage?: SessionTransitionStorage | null;
  createNonce?: () => string;
}

function getBrowserStorage(): SessionTransitionStorage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getBrowserEventTarget(): SessionTransitionEventTarget | null {
  return typeof window === "undefined" ? null : window;
}

function createSessionTransitionNonce(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}:${Math.random()}`;
}

function getSignalBasePath(baseUrl: string): string {
  return joinBasePath(baseUrl);
}

function parseSessionTransitionSignal(
  value: string,
): SessionTransitionSignal | null {
  if (value.length === 0 || value.length > 1_024) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  if (
    record.version !== 1 ||
    typeof record.basePath !== "string" ||
    typeof record.nonce !== "string" ||
    record.nonce.length === 0 ||
    record.nonce.length > 200
  ) {
    return null;
  }

  return {
    version: 1,
    basePath: record.basePath,
    nonce: record.nonce,
  };
}

/**
 * Publica solamente un nonce opaco: nunca usuario, cookie, token ni API key.
 * `storage` no notifica a la pestaña emisora, que completa su propio flujo.
 */
export function publishSessionTransition(
  baseUrl: string,
  options: PublishSessionTransitionOptions = {},
): boolean {
  const storage =
    options.storage === undefined ? getBrowserStorage() : options.storage;
  if (!storage) return false;

  try {
    const nonce = (options.createNonce ?? createSessionTransitionNonce)();
    if (!nonce || nonce.length > 200) return false;

    const signal: SessionTransitionSignal = {
      version: 1,
      basePath: getSignalBasePath(baseUrl),
      nonce,
    };
    storage.setItem(SESSION_TRANSITION_STORAGE_KEY, JSON.stringify(signal));
    return true;
  } catch {
    // El almacenamiento puede estar bloqueado por políticas del navegador.
    // La pestaña actual igualmente completa login/logout normalmente.
    return false;
  }
}

export function isSessionTransitionStorageEvent(
  event: Pick<StorageEvent, "key" | "newValue">,
  baseUrl: string,
): boolean {
  if (
    event.key !== SESSION_TRANSITION_STORAGE_KEY ||
    typeof event.newValue !== "string"
  ) {
    return false;
  }

  const signal = parseSessionTransitionSignal(event.newValue);
  return signal?.basePath === getSignalBasePath(baseUrl);
}

/**
 * Escucha cambios de autenticación provenientes de otras pestañas del mismo
 * origen y despliegue. Devuelve siempre una función de limpieza segura.
 */
export function subscribeToSessionTransitions(
  baseUrl: string,
  onTransition: () => void,
  eventTarget: SessionTransitionEventTarget | null = getBrowserEventTarget(),
): () => void {
  if (!eventTarget) return () => undefined;

  const listener: EventListener = (event) => {
    if (isSessionTransitionStorageEvent(event as StorageEvent, baseUrl)) {
      onTransition();
    }
  };
  eventTarget.addEventListener("storage", listener);
  return () => eventTarget.removeEventListener("storage", listener);
}
