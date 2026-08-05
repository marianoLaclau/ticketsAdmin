import { Router } from "express";
import { addEventClient } from "../lib/events";
import { getSessionUser, type SessionUser } from "../lib/auth";
import { getSessionToken, hashSessionToken } from "../lib/session-cookie";

const router = Router();

// Server-Sent Events: el frontend mantiene esta conexión abierta y el
// backend le empuja un evento cada vez que entra un llamado nuevo (webhook)
// o se importan registros. Fuera del contrato OpenAPI a propósito: es un
// stream, no un request/response que Orval pueda modelar.
router.get("/events", (req, res) => {
  const user = res.locals.authUser as SessionUser;
  const sessionToken = getSessionToken(req);
  const sessionTokenHash = sessionToken
    ? hashSessionToken(sessionToken)
    : undefined;

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

  addEventClient(res, { usuarioId: user.id, sessionTokenHash });

  // Cada heartbeat revalida la cookie. Así una sesión vencida o revocada no
  // puede conservar indefinidamente un stream que se abrió cuando era válida.
  let validando = false;
  const heartbeat = setInterval(() => {
    if (validando || res.destroyed || res.writableEnded) return;
    validando = true;
    void getSessionUser(req)
      .then((session) => {
        if (!session || session.id !== user.id) {
          res.end();
          return;
        }
        if (res.destroyed || res.writableEnded) return;
        res.write(": ping\n\n");
      })
      .catch(() => res.end())
      .finally(() => {
        validando = false;
      });
  }, 25_000);
  const stopHeartbeat = () => clearInterval(heartbeat);
  req.on("close", stopHeartbeat);
  res.on("close", stopHeartbeat);
});

export default router;
