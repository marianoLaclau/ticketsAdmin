import { Router } from "express";
import {
  db,
  esTicketVacio,
  seguimientosTable,
  ticketsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { IngestTicketBody } from "@workspace/api-zod";
import {
  calcularFechaLimiteSla,
  clasificarMotivo,
  crearSeguimientoOrigenSerin,
} from "@workspace/ingesta";
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

  const fechaCreacion = new Date();
  const result = db.transaction((tx) => {
    const [inserted] = tx
      .insert(ticketsTable)
      .values({
        conversation_id: data.conversation_id,
        hora: data.hora,
        nombre: data.nombre,
        apellido: data.apellido,
        telefono: data.telefono ?? null,
        dni: data.dni ?? null,
        empresa: data.empresa ?? null,
        estado_empleado: data.estado_empleado ?? null,
        email: data.email ?? null,
        motivo: data.motivo,
        motivo_categoria: clasificarMotivo(data.motivo, data.resumen),
        resumen: data.resumen ?? null,
        notificado: data.notificado ?? false,
        estado:
          (data.estado as
            | "nuevo"
            | "en_proceso"
            | "pendiente"
            | "resuelto"
            | "cerrado") ?? "nuevo",
        prioridad:
          (data.prioridad as "baja" | "media" | "alta" | "urgente") ??
          "media",
        asignado_a: data.asignado_a ?? null,
        audio_url: data.audio_url ?? null,
        notas: data.notas ?? null,
        fecha_creacion: fechaCreacion,
        fecha_limite: data.fecha_limite
          ? new Date(data.fecha_limite)
          : calcularFechaLimiteSla(fechaCreacion),
        progreso: data.progreso ?? 0,
      })
      .onConflictDoNothing({ target: ticketsTable.conversation_id })
      .returning()
      .all();

    if (!inserted) {
      const existing = tx
        .select()
        .from(ticketsTable)
        .where(eq(ticketsTable.conversation_id, data.conversation_id))
        .get();

      if (!existing) {
        throw new Error("No se pudo recuperar el ticket existente");
      }

      return { created: false as const, ticket: existing };
    }

    const seguimientoSerin = crearSeguimientoOrigenSerin(data.empresa);
    if (seguimientoSerin) {
      tx.insert(seguimientosTable)
        .values({
          ticket_id: inserted.id,
          autor: seguimientoSerin.autor,
          nota: seguimientoSerin.nota,
          fecha_creacion: fechaCreacion,
        })
        .run();
    }

    return { created: true as const, ticket: inserted };
  });

  if (!result.created) {
    res.status(200).json(result);
    return;
  }

  const { ticket } = result;

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

  res.status(201).json(result);
});

export default router;
