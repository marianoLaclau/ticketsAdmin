import { Router } from "express";
import {
  db,
  esTicketVacio,
  seguimientosTable,
  sqlite,
  ticketsTable,
} from "@workspace/db";
import { ImportCsvBody, TruncateTicketsBody } from "@workspace/api-zod";
import { detectarColumnas, filaATicket, parseCsv } from "@workspace/ingesta";
import { broadcastEvent } from "../../../lib/events";

const router = Router();

// Importación masiva desde CSV (misma lógica que el importador CLI)
router.post("/admin/import", async (req, res) => {
  const parsed = ImportCsvBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }
  const { csv, dry_run: dryRun = false } = parsed.data;

  const rows = parseCsv(csv);
  if (rows.length < 2) {
    res.status(400).json({
      error:
        "El CSV no tiene filas de datos (se espera encabezado + registros)",
    });
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

  let invalidos = 0;
  const advertencias: string[] = [];
  const candidatos: NonNullable<ReturnType<typeof filaATicket>>[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const record: Record<string, string> = {};
    for (const [idx, field] of columnas) {
      record[field] = dataRows[i][idx] ?? "";
    }

    const values = filaATicket(record);
    if (!values) {
      advertencias.push(
        `Fila ${i + 2}: sin conversation_id o con fecha/hora inválida, salteada`,
      );
      invalidos++;
      continue;
    }
    candidatos.push(values);
  }

  // El snapshot de existentes, la deduplicación del propio archivo y todas
  // las escrituras comparten una transacción. Si un insert falla, no queda una
  // importación parcial ni se emite un evento sobre datos que hicieron rollback.
  const importacion = db.transaction(
    (tx) => {
      const existing = new Set(
        tx
          .select({ cid: ticketsTable.conversation_id })
          .from(ticketsTable)
          .all()
          .map((row) => row.cid),
      );
      let insertados = 0;
      let insertadosVisibles = 0;
      let yaExistentes = 0;

      for (const values of candidatos) {
        if (existing.has(values.conversation_id)) {
          yaExistentes++;
          continue;
        }
        existing.add(values.conversation_id);

        if (!dryRun) tx.insert(ticketsTable).values(values).run();
        if (!esTicketVacio(values)) insertadosVisibles++;
        insertados++;
      }

      return { insertados, insertadosVisibles, yaExistentes };
    },
    { behavior: dryRun ? "deferred" : "immediate" },
  );

  if (!dryRun && importacion.insertados > 0) {
    if (importacion.insertadosVisibles > 0) {
      broadcastEvent("tickets_importados", {
        cantidad: importacion.insertadosVisibles,
        cantidad_total: importacion.insertados,
      });
    } else {
      broadcastEvent("datos_actualizados");
    }
  }

  res.json({
    dry_run: dryRun,
    filas: dataRows.length,
    insertados: importacion.insertados,
    ya_existentes: importacion.yaExistentes,
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
    res
      .status(400)
      .json({ error: "Falta la confirmación explícita (confirmar: true)" });
    return;
  }

  const { seguimientosEliminados, ticketsEliminados } = db.transaction(
    (tx) => {
      const seguimientosEliminados = tx.delete(seguimientosTable).run().changes;
      const ticketsEliminados = tx.delete(ticketsTable).run().changes;

      // sqlite_sequence vive en la misma conexión/transacción. Consultar el
      // catálogo evita ocultar errores reales con un catch demasiado amplio.
      const sequenceExists = sqlite
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'",
        )
        .get();
      if (sequenceExists) {
        sqlite
          .prepare(
            "DELETE FROM sqlite_sequence WHERE name IN ('tickets', 'seguimientos')",
          )
          .run();
      }

      return { seguimientosEliminados, ticketsEliminados };
    },
    { behavior: "immediate" },
  );

  broadcastEvent("datos_actualizados", {});

  res.json({
    tickets_eliminados: ticketsEliminados,
    seguimientos_eliminados: seguimientosEliminados,
  });
});

export default router;
