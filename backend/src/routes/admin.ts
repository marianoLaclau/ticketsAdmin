import { Router } from "express";
import { db, sqlite, ticketsTable, seguimientosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { CreateAdminTicketBody, ImportCsvBody, TruncateTicketsBody } from "@workspace/api-zod";
import { parseCsv, detectarColumnas, filaATicket, SLA_MS } from "@workspace/ingesta";
import { requireAdminKey } from "../lib/auth";

const router = Router();

router.use("/admin", requireAdminKey);

// Alta manual de un registro (el flujo normal sigue siendo el webhook)
router.post("/admin/tickets", async (req, res) => {
  const parsed = CreateAdminTicketBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const data = parsed.data;

  const [existing] = await db.select({ id: ticketsTable.id }).from(ticketsTable).where(eq(ticketsTable.conversation_id, data.conversation_id));
  if (existing) {
    res.status(409).json({ error: "Ya existe un ticket con ese conversation_id", ticket_id: existing.id });
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

  res.status(201).json(ticket);
});

// Importación masiva desde CSV (misma lógica que el importador CLI)
router.post("/admin/import", async (req, res) => {
  const parsed = ImportCsvBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const { csv, dry_run: dryRun = false } = parsed.data;

  const rows = parseCsv(csv);
  if (rows.length < 2) {
    res.status(400).json({ error: "El CSV no tiene filas de datos (se espera encabezado + registros)" });
    return;
  }
  const [headerCells, ...dataRows] = rows;
  const { columnas, sinMapear } = detectarColumnas(headerCells);

  if (![...columnas.values()].includes("conversation_id")) {
    res.status(400).json({
      error: "No se encontró ninguna columna que mapee a conversation_id",
      sin_mapear: sinMapear,
    });
    return;
  }

  const existing = new Set(
    (await db.select({ cid: ticketsTable.conversation_id }).from(ticketsTable)).map((r) => r.cid),
  );

  let insertados = 0;
  let yaExistentes = 0;
  let invalidos = 0;
  const advertencias: string[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const record: Record<string, string> = {};
    for (const [idx, field] of columnas) {
      record[field] = dataRows[i][idx] ?? "";
    }

    const values = filaATicket(record);
    if (!values) {
      advertencias.push(`Fila ${i + 2}: sin conversation_id, salteada`);
      invalidos++;
      continue;
    }
    if (existing.has(values.conversation_id)) {
      yaExistentes++;
      continue;
    }
    existing.add(values.conversation_id);

    if (!dryRun) {
      await db.insert(ticketsTable).values(values);
    }
    insertados++;
  }

  res.json({
    dry_run: dryRun,
    filas: dataRows.length,
    insertados,
    ya_existentes: yaExistentes,
    invalidos,
    columnas: [...columnas.entries()].map(([idx, campo]) => ({
      columna: headerCells[idx] ?? `col ${idx + 1}`,
      campo,
    })),
    sin_mapear: sinMapear,
    advertencias: advertencias.slice(0, 50),
  });
});

// Truncate: borra TODOS los registros y reinicia los ids. El schema queda.
router.post("/admin/truncate", async (req, res) => {
  const parsed = TruncateTicketsBody.safeParse(req.body);
  if (!parsed.success || parsed.data.confirmar !== true) {
    res.status(400).json({ error: "Falta la confirmación explícita (confirmar: true)" });
    return;
  }

  const seguimientosEliminados = (await db.delete(seguimientosTable).returning({ id: seguimientosTable.id })).length;
  const ticketsEliminados = (await db.delete(ticketsTable).returning({ id: ticketsTable.id })).length;

  // Reiniciar los contadores AUTOINCREMENT (la tabla sqlite_sequence puede
  // no existir si nunca hubo inserts — en ese caso no hay nada que reiniciar)
  try {
    sqlite.exec("DELETE FROM sqlite_sequence WHERE name IN ('tickets', 'seguimientos')");
  } catch {
    // sin sqlite_sequence no hay contadores que reiniciar
  }

  res.json({
    tickets_eliminados: ticketsEliminados,
    seguimientos_eliminados: seguimientosEliminados,
  });
});

export default router;
