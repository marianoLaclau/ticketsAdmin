import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { resolveDbPath } from "./db-path";

export const sqlite: Database.Database = new Database(resolveDbPath());
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

export { resolveDbPath } from "./db-path";
export * from "./schema";
export * from "./ticket-visibility";
