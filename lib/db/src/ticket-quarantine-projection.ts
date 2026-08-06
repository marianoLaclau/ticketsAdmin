import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

const MIGRATION_FILE = "0014_materialize_ticket_quarantine.sql";
const STATEMENT_BREAKPOINT = "--> statement-breakpoint";
const TABLE_NAME = "tickets_cuarentena";
const MIGRATION_CREATED_AT = 1_786_044_497_874;

export const TICKET_QUARANTINE_TRIGGER_NAMES = [
  "tickets_cuarentena_ticket_insert",
  "tickets_cuarentena_ticket_update",
  "tickets_cuarentena_seguimiento_insert",
  "tickets_cuarentena_seguimiento_delete",
  "tickets_cuarentena_seguimiento_ticket_update",
] as const;

interface TableInfoRow {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

interface ForeignKeyRow {
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
}

interface SchemaObjectRow {
  name: string;
  sql: string | null;
}

interface QuarantineDefinition {
  createTable: string;
  backfill: string;
  expectedTicketIds: string;
  hash: string;
  triggers: ReadonlyMap<string, string>;
}

interface ProjectionParityRow {
  missing: number;
  extra: number;
}

interface MigrationLedgerRow {
  hash: string;
}

function findWorkspaceRoot(startDirectory: string): string | null {
  let directory = path.resolve(startDirectory);
  while (true) {
    if (
      // El workspace es una señal más estable que asumir desde qué paquete
      // invocó pnpm al proceso.
      readFileIfPresent(path.join(directory, "pnpm-workspace.yaml")) !== null
    ) {
      return directory;
    }
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

function readFileIfPresent(filePath: string): string | null {
  try {
    return readFileSync(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return null;
    throw error;
  }
}

function loadMigrationSql(): string {
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  const candidates = [
    fileURLToPath(new URL(`../drizzle/${MIGRATION_FILE}`, import.meta.url)),
    path.resolve(process.cwd(), "drizzle", MIGRATION_FILE),
    ...(workspaceRoot
      ? [path.join(workspaceRoot, "lib", "db", "drizzle", MIGRATION_FILE)]
      : []),
  ];

  for (const candidate of new Set(candidates)) {
    const sql = readFileIfPresent(candidate);
    if (sql !== null) return sql;
  }

  throw new Error(
    `No se encontró la definición versionada ${MIGRATION_FILE}; no se puede validar la cuarentena`,
  );
}

function withoutLeadingComments(statement: string): string {
  return statement.replace(/^\s*(?:--[^\r\n]*(?:\r?\n|$)\s*)*/u, "");
}

function parseDefinition(sql = loadMigrationSql()): QuarantineDefinition {
  const statements = sql
    .split(STATEMENT_BREAKPOINT)
    .map((statement) => statement.trim())
    .filter(Boolean);
  const createTable = statements.find((statement) =>
    /^CREATE TABLE\s+[`"]?tickets_cuarentena[`"]?/iu.test(
      withoutLeadingComments(statement),
    ),
  );
  const backfill = statements.find((statement) =>
    /^INSERT INTO\s+[`"]?tickets_cuarentena[`"]?/iu.test(
      withoutLeadingComments(statement),
    ),
  );
  const triggers = new Map<string, string>();

  for (const statement of statements) {
    const executable = withoutLeadingComments(statement);
    const match = /^CREATE TRIGGER\s+[`"]?([^`"\s]+)[`"]?\s/iu.exec(executable);
    if (match?.[1]) triggers.set(match[1], executable);
  }

  if (
    !createTable ||
    !backfill ||
    triggers.size !== TICKET_QUARANTINE_TRIGGER_NAMES.length ||
    TICKET_QUARANTINE_TRIGGER_NAMES.some((name) => !triggers.has(name))
  ) {
    throw new Error(
      `La migración ${MIGRATION_FILE} no contiene el contrato completo de cuarentena`,
    );
  }

  const executableBackfill = withoutLeadingComments(backfill);
  const selectOffset = executableBackfill.search(/\bSELECT\b/iu);
  if (selectOffset < 0) {
    throw new Error(
      `La migración ${MIGRATION_FILE} no contiene el SELECT de backfill`,
    );
  }

  return {
    createTable: withoutLeadingComments(createTable),
    backfill: executableBackfill,
    expectedTicketIds: executableBackfill
      .slice(selectOffset)
      .replace(/;\s*$/u, ""),
    hash: createHash("sha256").update(sql).digest("hex"),
    triggers,
  };
}

function normalizeSql(value: string): string {
  // sqlite_master conserva el texto del CREATE salvo el terminador final. No
  // se normalizan espacios ni mayúsculas porque también pueden ser literales.
  return value.trim().replace(/;\s*$/u, "");
}

function tableExists(sqlite: Database.Database, tableName: string): boolean {
  return (
    sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName) !== undefined
  );
}

function assertQuarantineTableContract(sqlite: Database.Database): void {
  const columns = sqlite.pragma(
    `table_info('${TABLE_NAME}')`,
  ) as TableInfoRow[];
  const foreignKeys = sqlite.pragma(
    `foreign_key_list('${TABLE_NAME}')`,
  ) as ForeignKeyRow[];
  const column = columns[0];
  const foreignKey = foreignKeys[0];
  const validColumn =
    columns.length === 1 &&
    column?.name === "ticket_id" &&
    column.type.toUpperCase() === "INTEGER" &&
    column.pk === 1;
  const validForeignKey =
    foreignKeys.length === 1 &&
    foreignKey?.table === "tickets" &&
    foreignKey.from === "ticket_id" &&
    foreignKey.to === "id" &&
    foreignKey.on_update.toUpperCase() === "NO ACTION" &&
    foreignKey.on_delete.toUpperCase() === "CASCADE";

  if (!validColumn || !validForeignKey) {
    throw new Error(
      "La tabla tickets_cuarentena existe con un contrato incompatible",
    );
  }
}

function hasExpectedTriggers(
  sqlite: Database.Database,
  definition: QuarantineDefinition,
): boolean {
  const rows = sqlite
    .prepare(
      `
      SELECT name, sql
      FROM sqlite_master
      WHERE type = 'trigger'
        AND tbl_name IN ('tickets', 'seguimientos', 'tickets_cuarentena')
    `,
    )
    .all() as SchemaObjectRow[];
  if (rows.length !== TICKET_QUARANTINE_TRIGGER_NAMES.length) return false;

  const actual = new Map(rows.map((row) => [row.name, row.sql]));
  return TICKET_QUARANTINE_TRIGGER_NAMES.every((name) => {
    const actualSql = actual.get(name);
    const expectedSql = definition.triggers.get(name);
    return (
      actualSql !== null &&
      actualSql !== undefined &&
      expectedSql !== undefined &&
      normalizeSql(actualSql) === normalizeSql(expectedSql)
    );
  });
}

function hasExpectedMarkers(
  sqlite: Database.Database,
  definition: QuarantineDefinition,
): boolean {
  const parity = sqlite
    .prepare(
      `
      WITH expected(ticket_id) AS (${definition.expectedTicketIds})
      SELECT
        EXISTS(
          SELECT ticket_id FROM expected
          EXCEPT
          SELECT ticket_id FROM tickets_cuarentena
        ) AS missing,
        EXISTS(
          SELECT ticket_id FROM tickets_cuarentena
          EXCEPT
          SELECT ticket_id FROM expected
        ) AS extra
    `,
    )
    .get() as ProjectionParityRow;
  return parity.missing === 0 && parity.extra === 0;
}

function hasRecordedMigration(
  sqlite: Database.Database,
  definition: QuarantineDefinition,
): boolean {
  const row = sqlite
    .prepare(
      `
      SELECT hash
      FROM __drizzle_migrations
      WHERE created_at = ?
    `,
    )
    .get(MIGRATION_CREATED_AT) as MigrationLedgerRow | undefined;
  return row?.hash === definition.hash;
}

function hasCompleteProjection(
  sqlite: Database.Database,
  definition: QuarantineDefinition,
): boolean {
  if (!tableExists(sqlite, TABLE_NAME)) return false;
  assertQuarantineTableContract(sqlite);
  return (
    hasExpectedTriggers(sqlite, definition) &&
    hasExpectedMarkers(sqlite, definition)
  );
}

/**
 * Garantiza la proyección para bases locales históricas creadas con
 * `drizzle-kit push`, que no ejecuta backfills ni crea triggers.
 *
 * Las bases con ledger deben llegar completas por la migración 0014. Si no,
 * se falla cerrado para no ocultar una cadena de migraciones incompleta.
 */
export function ensureTicketQuarantineProjection(sqlite: Database.Database): {
  repaired: boolean;
} {
  if (sqlite.pragma("foreign_keys", { simple: true }) !== 1) {
    throw new Error(
      "SQLite debe tener foreign_keys habilitado para validar la cuarentena",
    );
  }

  const definition = parseDefinition();
  const hasLedger = tableExists(sqlite, "__drizzle_migrations");
  if (hasLedger && !hasRecordedMigration(sqlite, definition)) {
    throw new Error(
      "La migración 0014 no está registrada íntegramente; ejecutá las migraciones antes de iniciar",
    );
  }
  if (hasCompleteProjection(sqlite, definition)) return { repaired: false };

  const repair = sqlite.transaction((): { repaired: boolean } => {
    // Revalidar después de adquirir el write lock evita que dos procesos
    // reparen sobre una observación obsoleta.
    if (hasCompleteProjection(sqlite, definition)) return { repaired: false };
    if (hasLedger) {
      throw new Error(
        "La cuarentena está incompleta en una base versionada; ejecutá las migraciones antes de iniciar",
      );
    }

    if (tableExists(sqlite, TABLE_NAME)) {
      assertQuarantineTableContract(sqlite);
    } else {
      sqlite.exec(definition.createTable);
    }

    for (const name of TICKET_QUARANTINE_TRIGGER_NAMES) {
      sqlite.exec(`DROP TRIGGER IF EXISTS \`${name}\``);
    }
    sqlite.exec(`DELETE FROM \`${TABLE_NAME}\``);
    sqlite.exec(definition.backfill);
    for (const name of TICKET_QUARANTINE_TRIGGER_NAMES) {
      sqlite.exec(definition.triggers.get(name)!);
    }

    if (!hasCompleteProjection(sqlite, definition)) {
      throw new Error(
        "La proyección de cuarentena no coincide con la migración versionada",
      );
    }
    const foreignKeyErrors = sqlite.pragma("foreign_key_check") as unknown[];
    if (foreignKeyErrors.length > 0) {
      throw new Error(
        "La proyección de cuarentena viola la integridad referencial",
      );
    }
    return { repaired: true };
  });

  return repair.immediate();
}
