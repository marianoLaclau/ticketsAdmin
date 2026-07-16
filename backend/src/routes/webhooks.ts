import { Router, type Request, type Response, type NextFunction } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { db, ticketsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { IngestTicketBody } from "@workspace/api-zod";

const router = Router();

// SLA: todo llamado debe resolverse dentro de las 48 hs de recibido.
// Si n8n no manda fecha_limite, se preestablece acá (después es editable desde la UI).
const SLA_MS = 48 * 60 * 60 * 1000;

function safeEquals(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a).digest();
  const hashB = createHash("sha256").update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

function requireApiKey(req: Request, res: Response, next: NextFunction) {
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

// Ingesta de llamadas: n8n envía el JSON que arma ElevenLabs al terminar la llamada.
// Idempotente por conversation_id — un reintento de n8n devuelve el ticket existente.
router.post("/webhooks/ticket", requireApiKey, async (req, res) => {
  const parsed = IngestTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;

  const [existing] = await db.select().from(ticketsTable).where(eq(ticketsTable.conversation_id, data.conversation_id));
  if (existing) {
    res.status(200).json({ created: false, ticket: existing });
    return;
  }

  const [ticket] = await db.insert(ticketsTable).values({
    conversation_id: data.conversation_id,
    hora: data.hora,
    nombre: data.nombre,
    apellido: data.apellido,
    telefono: data.telefono ?? null,
    dni: data.dni ?? null,
    empresa: data.empresa ?? null,
    email: data.email ?? null,
    motivo: data.motivo,
    resumen: data.resumen ?? null,
    notificado: data.notificado ?? false,
    estado: (data.estado as "nuevo" | "en_proceso" | "pendiente" | "resuelto" | "cerrado") ?? "nuevo",
    prioridad: (data.prioridad as "baja" | "media" | "alta" | "urgente") ?? "media",
    asignado_a: data.asignado_a ?? null,
    audio_url: data.audio_url ?? null,
    notas: data.notas ?? null,
    fecha_limite: data.fecha_limite ? new Date(data.fecha_limite) : new Date(Date.now() + SLA_MS),
    progreso: data.progreso ?? 0,
  }).returning();

  res.status(201).json({ created: true, ticket });
});

export default router;
