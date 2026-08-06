import Database from "better-sqlite3";

export function createApplicationDatabase(
  databasePath: string,
): Database.Database {
  const database = new Database(databasePath);
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE tickets (
      id INTEGER PRIMARY KEY,
      conversation_id TEXT NOT NULL UNIQUE,
      hora TEXT NOT NULL,
      nombre TEXT NOT NULL,
      apellido TEXT NOT NULL,
      motivo TEXT NOT NULL,
      fecha_creacion INTEGER NOT NULL
    );
    CREATE TABLE seguimientos (
      id INTEGER PRIMARY KEY,
      ticket_id INTEGER NOT NULL REFERENCES tickets(id),
      nota TEXT NOT NULL,
      fecha_creacion INTEGER NOT NULL
    );
  `);
  return database;
}

export function insertTicket(
  database: Database.Database,
  id: number,
  nombre: string,
): void {
  database
    .prepare(
      `INSERT INTO tickets
        (id, conversation_id, hora, nombre, apellido, motivo, fecha_creacion)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      `conv-${id}`,
      `10:${String(id).padStart(2, "0")}`,
      nombre,
      "Test",
      "Consulta",
      id,
    );
}

export function ticketNames(databasePath: string): string[] {
  const database = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    return (
      database
        .prepare("SELECT nombre FROM tickets ORDER BY id")
        .all() as Array<{
        nombre: string;
      }>
    ).map(({ nombre }) => nombre);
  } finally {
    database.close();
  }
}
