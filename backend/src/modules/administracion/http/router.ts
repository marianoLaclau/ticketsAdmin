import { Router } from "express";
import { db, esTicketVacio, ticketsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateAdminTicketBody } from "@workspace/api-zod";
import { calcularFechaLimiteSla, clasificarMotivo } from "@workspace/ingesta";
import { requireSysAdmin } from "../../../lib/auth";
import { broadcastEvent } from "../../../lib/events";
import { findInvalidRfc3339DateTimeField } from "../../../lib/rfc3339";
import adminBulkRouter from "./bulk-router";
import adminRolesRouter from "./roles-router";
import adminUsersRouter from "./users-router";

const router = Router();

// Doble frontera sobre la sesión ya validada: primero el rol SysAdmin y luego
// una elevación administrativa vigente con intención explícita.
router.use("/admin", requireSysAdmin);

// Alta manual de un registro (el flujo normal sigue siendo el webhook)
router.post("/admin/tickets", async (req, res) => {
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) {
    const invalidDateField = findInvalidRfc3339DateTimeField(req.body, [
      "fecha_limite",
    ] as const);
    if (invalidDateField) {
      res.status(400).json({
        error: `${invalidDateField} debe ser una fecha RFC3339 válida con zona horaria`,
      });
      return;
    }
  }

  const parsed = CreateAdminTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;

  const [existing] = await db
    .select({ id: ticketsTable.id })
    .from(ticketsTable)
    .where(eq(ticketsTable.conversation_id, data.conversation_id));
  if (existing) {
    res.status(409).json({
      error: "Ya existe un ticket con ese conversation_id",
      ticket_id: existing.id,
    });
    return;
  }

  const fechaCreacion = new Date();
  const [ticket] = await db
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
          "nuevo" | "en_proceso" | "pendiente" | "resuelto" | "cerrado") ??
        "nuevo",
      prioridad:
        (data.prioridad as "baja" | "media" | "alta" | "urgente") ?? "media",
      asignado_a: data.asignado_a ?? null,
      audio_url: data.audio_url ?? null,
      notas: data.notas ?? null,
      fecha_creacion: fechaCreacion,
      fecha_limite: data.fecha_limite
        ? new Date(data.fecha_limite)
        : calcularFechaLimiteSla(fechaCreacion),
      progreso: data.progreso ?? 0,
    })
    .returning();

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

  res.status(201).json(ticket);
});

// Gestión de roles y usuarios del catálogo administrativo
router.use("/admin/roles", adminRolesRouter);

router.use("/admin/users", adminUsersRouter);

router.use(adminBulkRouter);

export default router;
