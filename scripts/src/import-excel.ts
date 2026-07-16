/**
 * Importador one-shot del histórico de llamadas (Excel .xlsx o CSV exportado por n8n).
 *
 * Uso:
 *   pnpm --filter @workspace/scripts run import-excel -- "C:\ruta\llamadas.xlsx"
 *   pnpm --filter @workspace/scripts run import-excel -- "C:\ruta\llamadas.csv" --dry-run
 *   pnpm --filter @workspace/scripts run import-excel -- "C:\ruta\llamadas.xlsx" --sheet "Hoja1"
 *
 * Es idempotente: las filas cuyo conversation_id ya existe en la base se saltean,
 * así que se puede correr varias veces sin duplicar tickets.
 */
import ExcelJS from "exceljs";
import path from "node:path";
import fs from "node:fs";
import { db, ticketsTable, ESTADOS, PRIORIDADES, type Estado, type Prioridad } from "@workspace/db";

// --- Mapeo de encabezados ----------------------------------------------------
// Se normalizan los encabezados (minúsculas, sin acentos, espacios → _) y se
// buscan estos alias. Si el archivo real usa otros nombres, agregarlos acá.
// SLA: 48 hs desde la recepción del llamado para resolverlo
const SLA_MS = 48 * 60 * 60 * 1000;

const HEADER_ALIASES: Record<string, string[]> = {
  conversation_id: ["conversation_id", "conversationid", "id_conversacion", "conversacion", "id"],
  hora: ["hora", "time", "hora_llamada"],
  fecha: ["fecha", "fecha_hora", "date", "fecha_creacion", "fecha_llamada", "dia"],
  nombre: ["nombre", "first_name", "name"],
  apellido: ["apellido", "last_name", "surname"],
  telefono: ["telefono", "phone", "celular", "tel"],
  dni: ["dni", "documento", "doc"],
  empresa: ["empresa", "company", "compania", "organizacion"],
  email: ["email", "mail", "correo", "e_mail"],
  motivo: ["motivo", "reason", "asunto", "tema"],
  resumen: ["resumen", "summary", "descripcion", "detalle"],
  notificado: ["notificado", "notified", "notificacion"],
  estado: ["estado", "status"],
  prioridad: ["prioridad", "priority"],
  asignado_a: ["asignado_a", "asignado", "assigned_to", "responsable"],
  audio_url: ["audio_url", "audio", "url_audio", "grabacion", "recording"],
  notas: ["notas", "notes", "observaciones"],
};

type CellValue = ExcelJS.CellValue | string;

function normalizeHeader(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/[\s\-./]+/g, "_");
}

function cellToString(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim(); // hyperlink / rich text
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((r) => r.text).join("").trim();
    }
    if ("result" in value) return cellToString(value.result as ExcelJS.CellValue); // formula
    return String(value).trim();
  }
  return String(value).trim();
}

function parseBoolean(raw: string): boolean {
  return ["si", "sí", "true", "1", "yes", "x", "verdadero"].includes(raw.toLowerCase().trim());
}

function parseFecha(value: CellValue): Date | null {
  if (value instanceof Date) return value;
  const s = cellToString(value);
  if (!s) return null;
  // dd/mm/yyyy con hora opcional en formatos "hh:mm", "- hh:mm", "- hh:mmhs"
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s*[-–]?\s*(\d{1,2}):(\d{2})\s*(?:hs)?)?/i);
  if (m) {
    const [, d, mo, y, h, mi] = m;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    return new Date(year, Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0));
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// --- Lectura del archivo → grilla de celdas ----------------------------------

type Grid = { name: string; rows: CellValue[][] };

async function readXlsx(filePath: string, sheetName?: string): Promise<Grid> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
  if (!sheet) {
    console.error(`No se encontró la hoja ${sheetName ?? "(primera)"} en el archivo.`);
    console.error(`Hojas disponibles: ${workbook.worksheets.map((w) => w.name).join(", ")}`);
    process.exit(1);
  }
  const rows: CellValue[][] = [];
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const cells: CellValue[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = cell.value;
    });
    rows.push(cells);
  }
  return { name: sheet.name, rows };
}

function readCsv(filePath: string): Grid {
  let text = fs.readFileSync(filePath, "utf8");
  if (text.includes("�")) {
    // No era UTF-8 (típico de Excel en Windows) — reintentar como latin1
    text = fs.readFileSync(filePath, "latin1");
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const firstLine = text.slice(0, text.indexOf("\n"));
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  // Parser CSV con soporte de comillas (RFC 4180)
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field); field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return { name: path.basename(filePath), rows };
}

// --- Importación ---------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const sheetFlagIdx = args.indexOf("--sheet");
  const sheetName = sheetFlagIdx >= 0 ? args[sheetFlagIdx + 1] : undefined;
  const filePath = args.find((a) => !a.startsWith("--") && a !== sheetName);

  if (!filePath) {
    console.error("Uso: pnpm --filter @workspace/scripts run import-excel -- <archivo.xlsx|csv> [--dry-run] [--sheet <nombre>]");
    process.exit(1);
  }
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`No se encontró el archivo: ${resolved}`);
    process.exit(1);
  }

  const grid = resolved.toLowerCase().endsWith(".csv") ? readCsv(resolved) : await readXlsx(resolved, sheetName);
  const [headerCells, ...dataRows] = grid.rows;

  // Detectar columnas a partir de la fila de encabezados
  const columnMap = new Map<number, string>(); // índice de columna → campo del ticket
  const unmapped: string[] = [];
  headerCells.forEach((cell, idx) => {
    const normalized = normalizeHeader(cellToString(cell));
    if (!normalized) return;
    const field = Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.includes(normalized))?.[0];
    if (field && ![...columnMap.values()].includes(field)) {
      columnMap.set(idx, field);
    } else {
      unmapped.push(cellToString(cell));
    }
  });

  console.log(`Origen: "${grid.name}" — ${dataRows.length} filas de datos`);
  console.log("Columnas detectadas:");
  for (const [idx, field] of columnMap) {
    console.log(`  columna ${idx + 1} (${cellToString(headerCells[idx])}) → ${field}`);
  }
  if (unmapped.length > 0) {
    console.warn(`⚠ Columnas sin mapear (se ignoran): ${unmapped.join(", ")}`);
  }
  if (![...columnMap.values()].includes("conversation_id")) {
    console.error("✗ No se encontró ninguna columna que mapee a conversation_id. Ajustá HEADER_ALIASES en scripts/src/import-excel.ts");
    process.exit(1);
  }

  const existing = new Set(
    (await db.select({ cid: ticketsTable.conversation_id }).from(ticketsTable)).map((r) => r.cid),
  );

  let inserted = 0;
  let skippedExisting = 0;
  let skippedInvalid = 0;
  const warnings: string[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2; // 1-based + encabezado
    const record: Record<string, CellValue> = {};
    for (const [idx, field] of columnMap) {
      record[field] = dataRows[i][idx];
    }

    const conversationId = cellToString(record.conversation_id);
    if (!conversationId) {
      warnings.push(`Fila ${rowNumber}: sin conversation_id, salteada`);
      skippedInvalid++;
      continue;
    }
    if (existing.has(conversationId)) {
      skippedExisting++;
      continue;
    }
    existing.add(conversationId); // dedupe dentro del mismo archivo

    const estadoRaw = normalizeHeader(cellToString(record.estado));
    const prioridadRaw = normalizeHeader(cellToString(record.prioridad));
    const estado: Estado = (ESTADOS as readonly string[]).includes(estadoRaw) ? (estadoRaw as Estado) : "nuevo";
    const prioridad: Prioridad = (PRIORIDADES as readonly string[]).includes(prioridadRaw) ? (prioridadRaw as Prioridad) : "media";
    const fechaCreacion = parseFecha(record.fecha);

    // Si no hay columna de hora pero la fecha trae hora, derivarla de ahí
    let hora = cellToString(record.hora);
    if (!hora && fechaCreacion && (fechaCreacion.getHours() !== 0 || fechaCreacion.getMinutes() !== 0)) {
      hora = `${String(fechaCreacion.getHours()).padStart(2, "0")}:${String(fechaCreacion.getMinutes()).padStart(2, "0")}`;
    }

    const values = {
      conversation_id: conversationId,
      hora: hora || "00:00",
      nombre: cellToString(record.nombre) || "Sin nombre",
      apellido: cellToString(record.apellido) || "",
      telefono: cellToString(record.telefono) || null,
      dni: cellToString(record.dni) || null,
      empresa: cellToString(record.empresa) || null,
      email: cellToString(record.email) || null,
      motivo: cellToString(record.motivo) || "Sin especificar",
      resumen: cellToString(record.resumen) || null,
      notificado: parseBoolean(cellToString(record.notificado)),
      estado,
      prioridad,
      asignado_a: cellToString(record.asignado_a) || null,
      audio_url: cellToString(record.audio_url) || null,
      notas: cellToString(record.notas) || null,
      fecha_limite: new Date((fechaCreacion?.getTime() ?? Date.now()) + SLA_MS),
      ...(fechaCreacion ? { fecha_creacion: fechaCreacion } : {}),
    };

    if (!dryRun) {
      await db.insert(ticketsTable).values(values);
    }
    inserted++;
  }

  for (const w of warnings.slice(0, 20)) console.warn(`⚠ ${w}`);
  if (warnings.length > 20) console.warn(`⚠ ... y ${warnings.length - 20} advertencias más`);

  console.log("");
  console.log(dryRun ? "== SIMULACIÓN (--dry-run, no se escribió nada) ==" : "== Importación terminada ==");
  console.log(`  Insertados:            ${inserted}`);
  console.log(`  Ya existentes (salteados): ${skippedExisting}`);
  console.log(`  Inválidos (salteados):     ${skippedInvalid}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
