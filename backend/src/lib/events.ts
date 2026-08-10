import type { Response } from "express";

// Clientes SSE conectados (una entrada por pestaña de navegador abierta).
// Es estado en memoria del proceso: alcanza porque el backend corre como
// instancia única; si algún día se escala horizontalmente, esto pasa a
// necesitar un pub/sub externo.
interface EventClient {
  res: Response;
  usuarioId?: number;
  sessionTokenHash?: string;
}

const clients = new Map<Response, EventClient>();
let acceptingClients = true;

const SESSION_REVOKED_EVENT = "sesion_revocada";

export interface EventClientIdentity {
  usuarioId?: number;
  sessionTokenHash?: string;
}

export function addEventClient(
  res: Response,
  identity: EventClientIdentity = {},
): boolean {
  // La autenticacion previa es asincrona: el navegador puede abortar antes de
  // que la ruta llegue hasta aqui y el evento close ya no volvera a emitirse.
  // Node puede reflejar ese cierre primero en ServerResponse, IncomingMessage
  // o el socket segun la plataforma, por eso se aceptan todas sus senales
  // terminales una vez que el servidor observo la desconexion.
  if (
    res.destroyed ||
    res.closed ||
    res.writableEnded ||
    res.req?.aborted ||
    res.socket?.destroyed
  )
    return false;

  if (!acceptingClients) {
    try {
      if (res.headersSent) {
        res.destroy();
      } else {
        res
          .status(503)
          .set({ "Cache-Control": "no-store", Connection: "close" })
          .end();
      }
    } catch {
      res.destroy();
    }
    return false;
  }

  clients.set(res, { res, ...identity });
  res.on("close", () => clients.delete(res));
  return true;
}

function serializeEvent(
  tipo: string,
  data: Record<string, unknown> = {},
): string {
  return `data: ${JSON.stringify({ ...data, tipo })}\n\n`;
}

function closeClient(client: EventClient, terminalEvent?: string): void {
  clients.delete(client.res);
  if (client.res.destroyed || client.res.writableEnded) return;
  try {
    if (terminalEvent) client.res.write(serializeEvent(terminalEvent));
    client.res.end();
  } catch {
    client.res.destroy();
  }
}

function closeMatchingClients(
  predicate: (client: EventClient) => boolean,
  terminalEvent?: string,
): number {
  let closed = 0;
  for (const client of clients.values()) {
    if (!predicate(client)) continue;
    closeClient(client, terminalEvent);
    closed += 1;
  }
  return closed;
}

export function closeEventClientsForUsers(
  usuarioIds: readonly number[],
): number {
  const ids = new Set(usuarioIds);
  return closeMatchingClients(
    (client) => client.usuarioId !== undefined && ids.has(client.usuarioId),
  );
}

/**
 * Avisa una revocación administrativa antes de cerrar cada stream afectado.
 * Se mantiene separado del cierre silencioso porque una rotación válida de
 * cookie también descarta streams viejos, pero no debe expulsar al usuario.
 */
export function revokeEventClientsForUsers(
  usuarioIds: readonly number[],
): number {
  const ids = new Set(usuarioIds);
  return closeMatchingClients(
    (client) => client.usuarioId !== undefined && ids.has(client.usuarioId),
    SESSION_REVOKED_EVENT,
  );
}

export function closeEventClientsForSessionHash(
  sessionTokenHash: string,
): number {
  return closeMatchingClients(
    (client) => client.sessionTokenHash === sessionTokenHash,
  );
}

/**
 * Impide nuevas altas y cierra los streams actuales. El latch es irreversible
 * porque este proceso ya inició su apagado y no volverá a aceptar tráfico.
 */
export function beginEventClientShutdown(): number {
  acceptingClients = false;
  return closeMatchingClients(() => true);
}

export function broadcastEvent(
  tipo: string,
  data: Record<string, unknown> = {},
): void {
  const payload = serializeEvent(tipo, data);
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
