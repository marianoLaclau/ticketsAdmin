import type { Response } from "express";

// Clientes SSE conectados (una entrada por pestaña de navegador abierta).
// Es estado en memoria del proceso: alcanza porque el backend corre como
// instancia única; si algún día se escala horizontalmente, esto pasa a
// necesitar un pub/sub externo.
const clients = new Set<Response>();

export function addEventClient(res: Response): void {
  clients.add(res);
  res.on("close", () => clients.delete(res));
}

export function broadcastEvent(tipo: string, data: Record<string, unknown> = {}): void {
  const payload = `data: ${JSON.stringify({ tipo, ...data })}\n\n`;
  for (const res of clients) {
    res.write(payload);
  }
}
