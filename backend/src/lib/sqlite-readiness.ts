interface SqliteReadinessDatabase {
  readonly open: boolean;
  prepare(source: string): { get(): unknown };
}

/**
 * Comprueba que el handle y el esquema mínimo operativo estén disponibles.
 * Las consultas no recorren datos: solo preparan y leen, como máximo, una fila.
 */
export function probeSqliteReadiness(
  database: SqliteReadinessDatabase,
): boolean {
  if (!database.open) return false;
  database.prepare("SELECT id, version FROM tickets LIMIT 1").get();
  database.prepare("SELECT ticket_id FROM tickets_cuarentena LIMIT 1").get();
  database
    .prepare(
      `SELECT token, usuario_id, fecha_expiracion, fecha_creacion
         FROM sesiones
        LIMIT 1`,
    )
    .get();
  return true;
}
