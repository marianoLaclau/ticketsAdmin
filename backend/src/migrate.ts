import "./lib/load-env";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db, sqlite } from "@workspace/db";
import { logger } from "./lib/logger";

// Corre las migraciones SQL generadas (lib/db/drizzle) contra el archivo
// SQLite en uso. Idempotente: drizzle registra las ya aplicadas. Pensado
// para correr una vez al arrancar el contenedor, antes de levantar la API.
const migrationsFolder = path.join(process.cwd(), "drizzle");

migrate(db, { migrationsFolder });
logger.info({ migrationsFolder }, "Migraciones aplicadas");
sqlite.close();
