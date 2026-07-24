import { Router } from "express";
import { db, esTicketVacio, ticketsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { IngestTicketBody } from "@workspace/api-zod";
import { calcularFechaLimiteSla, clasificarMotivo } from "@workspace/ingesta";
import { requireWebhookKey } from "../lib/auth";
import { broadcastEvent } from "../lib/events";
import { findInvalidRfc3339DateTimeField } from "../lib/rfc3339";

const router = Router();

// Ingesta de llamadas: n8n envía el JSON que arma ElevenLabs al terminar la llamada.
// Idempotente por conversation_id — un reintento de n8n devuelve el ticket existente.
router.post("/webhooks/ticket", requireWebhookKey, async (req, res) => {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    const invalidDateField = findInvalidRfc3339DateTimeField(
      req.body,
      ["fecha_limite"] as const,
    );
    if (invalidDateField) {
      res.status(400).json({
        error: `${invalidDateField} debe ser una fecha RFC3339 válida con zona horaria`,
      });
      return;
    }
  }

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

  const fechaCreacion = new Date();
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
    fecha_creacion: fechaCreacion,
    fecha_limite: data.fecha_limite
      ? new Date(data.fecha_limite)
      : calcularFechaLimiteSla(fechaCreacion),
    progreso: data.progreso ?? 0,
  }).returning();

  // Un registro en cuarentena refresca Administración, pero no genera una
  // alerta de nuevo llamado para los operadores.
  if (esTicketVacio(ticket)) {
    broadcastEvent("datos_actualizados");
  } else {
    broadcastEvent("ticket_creado", {
      ticket_id: ticket.id,
      nombre: ticket.nombre,
      apellido: ticket.apellido,
      motivo: ticket.motivo,
    });
  }

  res.status(201).json({ created: true, ticket });
});

export default router;
