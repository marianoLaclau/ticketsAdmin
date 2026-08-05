interface SqliteReadinessDatabase {
  readonly open: boolean;
  prepare(source: string): { get(): unknown };
}

/**
 * Comprueba que el handle y el esquema minimo de tickets esten disponibles.
 * La consulta no recorre datos: solo prepara y lee, como maximo, una fila.
 */
export function probeSqliteReadiness(
  database: SqliteReadinessDatabase,
): boolean {
  if (!database.open) return false;
  database.prepare("SELECT id, version FROM tickets LIMIT 1").get();
  return true;
}
