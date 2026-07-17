import { Router } from "express";
import { db, ticketsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { IngestTicketBody } from "@workspace/api-zod";
import { clasificarMotivo, SLA_MS } from "@workspace/ingesta";
import { requireWebhookKey } from "../lib/auth";
import { broadcastEvent } from "../lib/events";

const router = Router();

// Ingesta de llamadas: n8n envía el JSON que arma ElevenLabs al terminar la llamada.
// Idempotente por conversation_id — un reintento de n8n devuelve el ticket existente.
router.post("/webhooks/ticket", requireWebhookKey, async (req, res) => {
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
    motivo_categoria: clasificarMotivo(data.motivo, data.resumen),
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

  // Avisar en vivo a las pestañas abiertas que entró un llamado nuevo
  broadcastEvent("ticket_creado", {
    ticket_id: ticket.id,
    nombre: ticket.nombre,
    apellido: ticket.apellido,
    motivo: ticket.motivo,
  });

  res.status(201).json({ created: true, ticket });
});

export default router;
