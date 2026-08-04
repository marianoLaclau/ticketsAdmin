import type { Response } from "express";

// Clientes SSE conectados (una entrada por pestaña de navegador abierta).
// Es estado en memoria del proceso: alcanza porque el backend corre como
// instancia única; si algún día se escala horizontalmente, esto pasa a
// necesitar un pub/sub externo.
interface EventClient {
  res: Response;
  usuarioId?: number;
  sessionToken?: string;
}

const clients = new Map<Response, EventClient>();

export interface EventClientIdentity {
  usuarioId?: number;
  sessionToken?: string;
}

export function addEventClient(
  res: Response,
  identity: EventClientIdentity = {},
): void {
  clients.set(res, { res, ...identity });
  res.on("close", () => clients.delete(res));
}

function closeClient(client: EventClient): void {
  clients.delete(client.res);
  if (client.res.destroyed || client.res.writableEnded) return;
  try {
    client.res.end();
  } catch {
    client.res.destroy();
  }
}

export function closeEventClientsForUsers(
  usuarioIds: readonly number[],
): number {
  const ids = new Set(usuarioIds);
  let closed = 0;
  for (const client of clients.values()) {
    if (client.usuarioId !== undefined && ids.has(client.usuarioId)) {
      closeClient(client);
      closed += 1;
    }
  }
  return closed;
}

export function closeEventClientsForSession(sessionToken: string): number {
  let closed = 0;
  for (const client of clients.values()) {
    if (client.sessionToken === sessionToken) {
      closeClient(client);
      closed += 1;
    }
  }
  return closed;
}

export function broadcastEvent(
  tipo: string,
  data: Record<string, unknown> = {},
): void {
  const payload = `data: ${JSON.stringify({ tipo, ...data })}\n\n`;
  for (const client of clients.values()) {
    const { res } = client;
    if (res.destroyed || res.writableEnded) {
      clients.delete(res);
      continue;
    }

    try {
      res.write(payload);
    } catch {
      // Un navegador puede desaparecer entre el chequeo y la escritura. La
      // notificación SSE es secundaria: nunca debe convertir en 500 una
      // operación que ya quedó confirmada en la base.
      clients.delete(res);
    }
  }
}
