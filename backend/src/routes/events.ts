import { Router } from "express";
import { addEventClient } from "../lib/events";

const router = Router();

// Server-Sent Events: el frontend mantiene esta conexión abierta y el
// backend le empuja un evento cada vez que entra un llamado nuevo (webhook)
// o se importan registros. Fuera del contrato OpenAPI a propósito: es un
// stream, no un request/response que Orval pueda modelar.
router.get("/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    // nginx: no bufferear este stream
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  // Si se corta la conexión, el navegador reintenta a los 5s
  res.write("retry: 5000\n\n");

  addEventClient(res);

  // Heartbeat para que proxies intermedios no cierren la conexión por inactividad
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);
  req.on("close", () => clearInterval(heartbeat));
});

export default router;
