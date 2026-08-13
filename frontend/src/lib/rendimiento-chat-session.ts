export const RENDIMIENTO_CHAT_SESSION_STORAGE_KEY = "gsb_rag_chat_session_id";

const N8N_LEGACY_LOCAL_STORAGE_KEY = "n8n-chat/sessionId";
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ChatSessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type RandomUuid = () => string;

let ephemeralSessionId: string | null = null;

function browserSessionStorage(): ChatSessionStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function browserLocalStorage(): Pick<Storage, "removeItem"> | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function defaultRandomUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hexadecimal = [...bytes].map((byte) =>
    byte.toString(16).padStart(2, "0"),
  );
  return [
    hexadecimal.slice(0, 4).join(""),
    hexadecimal.slice(4, 6).join(""),
    hexadecimal.slice(6, 8).join(""),
    hexadecimal.slice(8, 10).join(""),
    hexadecimal.slice(10, 16).join(""),
  ].join("-");
}

function generateSessionId(randomUuid: RandomUuid): string {
  const sessionId = randomUuid();
  if (!UUID_V4_PATTERN.test(sessionId)) {
    throw new Error("crypto.randomUUID() no devolvió un UUID v4 válido");
  }
  return sessionId;
}

function storeSessionId(
  storage: ChatSessionStorage | null,
  sessionId: string,
): void {
  try {
    storage?.setItem(RENDIMIENTO_CHAT_SESSION_STORAGE_KEY, sessionId);
  } catch {
    // El chat sigue funcionando en memoria si el browser bloquea el storage.
  }
}

export function getOrCreateRendimientoChatSessionId(
  storage: ChatSessionStorage | null = browserSessionStorage(),
  randomUuid: RandomUuid = defaultRandomUuid,
): string {
  try {
    const storedSessionId = storage?.getItem(
      RENDIMIENTO_CHAT_SESSION_STORAGE_KEY,
    );
    if (storedSessionId && UUID_V4_PATTERN.test(storedSessionId)) {
      ephemeralSessionId = storedSessionId;
      return storedSessionId;
    }
  } catch {
    // Continúa con una sesión efímera si leer el storage no está permitido.
  }

  const sessionId =
    ephemeralSessionId && UUID_V4_PATTERN.test(ephemeralSessionId)
      ? ephemeralSessionId
      : generateSessionId(randomUuid);
  ephemeralSessionId = sessionId;
  storeSessionId(storage, sessionId);
  return sessionId;
}

export function renewRendimientoChatSessionId(
  storage: ChatSessionStorage | null = browserSessionStorage(),
  randomUuid: RandomUuid = defaultRandomUuid,
): string {
  const sessionId = generateSessionId(randomUuid);
  ephemeralSessionId = sessionId;
  storeSessionId(storage, sessionId);
  return sessionId;
}

/**
 * @n8n/chat@1.33.4 escribe además una clave global propia aunque reciba un
 * sessionId explícito. No la usa porque loadPreviousSession está desactivado;
 * la eliminamos para que la única fuente de sesión sea sessionStorage.
 */
export function clearN8nLegacyChatSession(): void {
  try {
    browserLocalStorage()?.removeItem(N8N_LEGACY_LOCAL_STORAGE_KEY);
  } catch {
    // La privacidad no debe romper la navegación si storage está bloqueado.
  }
}

export function clearRendimientoChatSession(): void {
  ephemeralSessionId = null;
  try {
    browserSessionStorage()?.removeItem(RENDIMIENTO_CHAT_SESSION_STORAGE_KEY);
  } catch {
    // El cierre de sesión debe continuar aunque storage esté bloqueado.
  }
  clearN8nLegacyChatSession();
}
