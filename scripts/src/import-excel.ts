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
 *
 * La lógica de parseo/mapeo vive en @workspace/ingesta (compartida con el
 * importador web de /admin). Acá solo queda la lectura de .xlsx, el acceso a
 * la base y la interfaz de línea de comandos.
 */
import ExcelJS from "exceljs";
import path from "node:path";
import fs from "node:fs";
import { db, ticketsTable } from "@workspace/db";
import { parseCsv, detectarColumnas, filaATicket } from "@workspace/ingesta";

function cellToString(value: ExcelJS.CellValue): string {
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

type Grid = { name: string; rows: string[][] };

async function readXlsx(filePath: string, sheetName?: string): Promise<Grid> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = sheetName ? workbook.getWorksheet(sheetName) : workbook.worksheets[0];
  if (!sheet) {
    console.error(`No se encontró la hoja ${sheetName ?? "(primera)"} en el archivo.`);
    console.error(`Hojas disponibles: ${workbook.worksheets.map((w) => w.name).join(", ")}`);
    process.exit(1);
  }
  const rows: string[][] = [];
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cells[col - 1] = cellToString(cell.value);
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
  return { name: path.basename(filePath), rows: parseCsv(text) };
}

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

  const { columnas, sinMapear } = detectarColumnas(headerCells);

  console.log(`Origen: "${grid.name}" — ${dataRows.length} filas de datos`);
  console.log("Columnas detectadas:");
  for (const [idx, field] of columnas) {
    console.log(`  columna ${idx + 1} (${headerCells[idx]}) → ${field}`);
  }
  if (sinMapear.length > 0) {
    console.warn(`⚠ Columnas sin mapear (se ignoran): ${sinMapear.join(", ")}`);
  }
  if (![...columnas.values()].includes("conversation_id")) {
    console.error("✗ No se encontró ninguna columna que mapee a conversation_id. Ajustá HEADER_ALIASES en lib/ingesta/src/index.ts");
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
    const record: Record<string, string> = {};
    for (const [idx, field] of columnas) {
      record[field] = dataRows[i][idx] ?? "";
    }

    const values = filaATicket(record);
    if (!values) {
      warnings.push(`Fila ${rowNumber}: sin conversation_id, salteada`);
      skippedInvalid++;
      continue;
    }
    if (existing.has(values.conversation_id)) {
      skippedExisting++;
      continue;
    }
    existing.add(values.conversation_id); // dedupe dentro del mismo archivo

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
