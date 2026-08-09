/**
 * Lógica compartida de ingesta de llamadas desde CSV/planillas.
 *
 * La usan dos consumidores:
 *  - scripts/src/import-excel.ts (CLI, agrega soporte .xlsx vía exceljs)
 *  - backend /api/admin/import (importador web)
 *
 * Todo acá es puro (strings adentro, strings/objetos afuera) — sin
 * dependencias de base de datos ni de Node más allá de lo estándar.
 */

export { parseCsv } from "./csv";
export {
  detectarColumnas,
  HEADER_ALIASES,
  normalizeHeader,
  type ColumnasDetectadas,
} from "./headers";
export { fechaExcelAStringLocal, parseFecha } from "./fecha-hora";
export { filaATicket, parseBoolean } from "./fila-a-ticket";
export {
  ESTADOS_VALIDOS,
  PRIORIDADES_VALIDAS,
  type TicketImportado,
} from "./types";
export * from "./motivos";
export * from "./sla";
export * from "./serin";
