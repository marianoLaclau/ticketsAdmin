import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  db,
  seguimientosTable,
  ticketsTable,
  type Ticket,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  DeleteTicketParams,
  UpdateTicketParams,
  UpdateTicketQueryParams,
} from "@workspace/api-zod";
import {
  puedeCerrarTickets,
  requireAdminAccess,
  requireSysAdmin,
  type SessionUser,
} from "../lib/auth";
import {
  normalizeTicketQuery,
  parseBooleanQueryParam,
} from "../lib/ticket-query-normalization";
import {
  buildTicketAuditNote,
  formatTicketAuditAuthor,
  getTicketAuditEditedFields,
} from "../lib/ticket-audit";
import {
  hasTechnicalTicketUpdateFields,
  parseTicketUpdateBody,
} from "../lib/ticket-update-validation";
import { buildTicketUpdateChanges } from "../lib/ticket-update-changes";
import { broadcastEvent } from "../lib/events";
import { buildTicketAccessCondition } from "../lib/ticket-access";
import { exportTicketsCsv } from "./ticket-csv-route";
import {
  createTicketFollowup,
  listTicketFollowups,
} from "./ticket-followup-handlers";
import { getTicketDetail } from "./ticket-detail-handler";
import { listTickets } from "./ticket-list-handler";

const router = Router();

type PatchTransactionResult =
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | {
      kind: "conflict";
      ticketId: number;
      expectedVersion: number;
      currentVersion: number;
    }
  | { kind: "unchanged"; ticket: Ticket }
  | { kind: "updated"; ticket: Ticket };

function requireTechnicalTicketUpdate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!hasTechnicalTicketUpdateFields(req.body)) {
    next();
    return;
  }

  requireSysAdmin(req, res, () => requireAdminAccess(req, res, next));
}

// `incluir_vacios` nunca amplía alcance por sí solo. El acceso administrativo
// requiere simultáneamente sesión SysAdmin y la segunda llave del panel.
function requireAdminForEmptyTickets(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (parseBooleanQueryParam(req.query.incluir_vacios) !== true) {
    next();
    return;
  }

  requireSysAdmin(req, res, () => requireAdminAccess(req, res, next));
}

// Listado operativo/administrativo: los filtros y el orden se aplican antes
// de la paginación y comparten exactamente la misma semántica con el CSV.
router.get("/tickets", requireAdminForEmptyTickets, listTickets);

// Debe declararse antes de `/:id` para que Express no interprete export.csv
// como un identificador de ticket.
router.get("/tickets/export.csv", exportTicketsCsv);

router.get("/tickets/:id", requireAdminForEmptyTickets, getTicketDetail);

router.patch(
  "/tickets/:id",
  requireAdminForEmptyTickets,
  requireTechnicalTicketUpdate,
  async (req, res) => {
    const params = UpdateTicketParams.safeParse({ id: req.params.id });
    const query = UpdateTicketQueryParams.safeParse(
      normalizeTicketQuery(req.query),
    );
    if (!params.success || !Number.isInteger(params.data.id)) {
      res.status(400).json({ error: "Identificador de ticket inválido" });
      return;
    }
    if (!query.success) {
      res.status(400).json({ error: "Parámetros de consulta inválidos" });
      return;
    }
    const bodyParsed = parseTicketUpdateBody(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ error: bodyParsed.error });
      return;
    }

    const authUser = res.locals.authUser as SessionUser;
    const autor = formatTicketAuditAuthor(authUser);
    const now = new Date();
    const accessCondition = buildTicketAccessCondition(
      params.data.id,
      query.data.incluir_vacios,
    );

    const result = db.transaction(
      (tx): PatchTransactionResult => {
        const current = tx
          .select()
          .from(ticketsTable)
          .where(accessCondition)
          .get();
        if (!current) return { kind: "not_found" };

        const body = bodyParsed.data;
        if (
          body.estado === "cerrado" &&
          body.estado !== current.estado &&
          !puedeCerrarTickets(authUser.rol)
        ) {
          return { kind: "forbidden" };
        }
        if (body.expected_version !== current.version) {
          return {
            kind: "conflict",
            ticketId: current.id,
            expectedVersion: body.expected_version,
            currentVersion: current.version,
          };
        }

        const { updates: actualUpdates, changedFields } =
          buildTicketUpdateChanges({
            current,
            body,
            assigneeUserId: authUser.id,
            assigneeDisplayName: autor,
            now,
          });

        if (changedFields.length === 0) {
          return { kind: "unchanged", ticket: current };
        }

        const updated = tx
          .update(ticketsTable)
          .set({ ...actualUpdates, version: current.version + 1 })
          .where(
            and(
              accessCondition,
              eq(ticketsTable.version, body.expected_version),
            ),
          )
          .returning()
          .get();
        if (!updated) {
          return {
            kind: "conflict",
            ticketId: current.id,
            expectedVersion: body.expected_version,
            currentVersion: current.version,
          };
        }

        const stateChanged = current.estado !== updated.estado;
        const priorityChanged = current.prioridad !== updated.prioridad;
        const assignmentChanged =
          current.asignado_usuario_id !== updated.asignado_usuario_id ||
          current.asignado_a !== updated.asignado_a;
        const editedFields = getTicketAuditEditedFields(changedFields);

        tx.insert(seguimientosTable)
          .values({
            ticket_id: current.id,
            nota: buildTicketAuditNote(current, updated, changedFields),
            estado_anterior: stateChanged ? current.estado : null,
            estado_nuevo: stateChanged ? updated.estado : null,
            prioridad_anterior: priorityChanged ? current.prioridad : null,
            prioridad_nueva: priorityChanged ? updated.prioridad : null,
            asignado_anterior_usuario_id: assignmentChanged
              ? current.asignado_usuario_id
              : null,
            asignado_anterior: assignmentChanged ? current.asignado_a : null,
            asignado_nuevo_usuario_id: assignmentChanged
              ? updated.asignado_usuario_id
              : null,
            asignado_nuevo: assignmentChanged ? updated.asignado_a : null,
            campos_editados: editedFields.length > 0 ? editedFields : null,
            autor,
            fecha_creacion: now,
          })
          .run();

        return { kind: "updated", ticket: updated };
      },
      { behavior: "immediate" },
    );

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Ticket no encontrado" });
      return;
    }
    if (result.kind === "forbidden") {
      res
        .status(403)
        .json({ error: "Solo un administrador puede cerrar tickets" });
      return;
    }
    if (result.kind === "conflict") {
      res.status(409).json({
        code: "TICKET_VERSION_CONFLICT",
        error: "El ticket cambió desde que fue consultado",
        ticket_id: result.ticketId,
        expected_version: result.expectedVersion,
        current_version: result.currentVersion,
      });
      return;
    }
    if (result.kind === "unchanged") {
      res.json(result.ticket);
      return;
    }

    // El evento se emite una vez confirmada la transacción. Las demás sesiones
    // refrescan ticket, tabla, dashboard e historial sin observar estados parciales.
    broadcastEvent("ticket_actualizado", {
      ticket_id: result.ticket.id,
      estado: result.ticket.estado,
      prioridad: result.ticket.prioridad,
      version: result.ticket.version,
      asignado_usuario_id: result.ticket.asignado_usuario_id,
      asignado_a: result.ticket.asignado_a,
    });

    res.json(result.ticket);
  },
);

router.delete(
  "/tickets/:id",
  requireSysAdmin,
  requireAdminAccess,
  async (req, res) => {
    const parsed = DeleteTicketParams.safeParse({ id: req.params.id });
    if (!parsed.success || !Number.isInteger(parsed.data.id)) {
      res.status(400).json({ error: "Identificador de ticket inválido" });
      return;
    }

    const result = db
      .delete(ticketsTable)
      .where(eq(ticketsTable.id, parsed.data.id))
      .run();
    if (result.changes > 0) {
      broadcastEvent("ticket_eliminado", { ticket_id: parsed.data.id });
    }
    res.status(204).end();
  },
);

router.get(
  "/tickets/:id/seguimientos",
  requireAdminForEmptyTickets,
  listTicketFollowups,
);

router.post(
  "/tickets/:id/seguimientos",
  requireAdminForEmptyTickets,
  createTicketFollowup,
);

export default router;
