import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export function safeEquals(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

// Webhook (n8n): la clave es OBLIGATORIA — si no está configurada en el
// servidor, la ingesta queda cerrada (503) hasta que se configure.
export function requireWebhookKey(req: Request, res: Response, next: NextFunction) {
  const configuredKey = process.env.WEBHOOK_API_KEY;
  if (!configuredKey) {
    res.status(503).json({ error: "WEBHOOK_API_KEY no está configurada en el servidor" });
    return;
  }
  const providedKey = req.header("x-api-key");
  if (!providedKey || !safeEquals(providedKey, configuredKey)) {
    res.status(401).json({ error: "API key inválida" });
    return;
  }
  next();
}

// Admin: la clave es OPCIONAL — si ADMIN_API_KEY no está seteada, el panel
// queda abierto (modo red local de confianza). Si está seteada, se exige
// el header x-admin-key en todas las operaciones de administración.
export function requireAdminKey(req: Request, res: Response, next: NextFunction) {
  const configuredKey = process.env.ADMIN_API_KEY;
  if (!configuredKey) {
    next();
    return;
  }
  const providedKey = req.header("x-admin-key");
  if (!providedKey || !safeEquals(providedKey, configuredKey)) {
    res.status(401).json({ error: "Clave de administración inválida" });
    return;
  }
  next();
}
