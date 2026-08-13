import { db, sesionesTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { SESSION_TOKEN_HASH_PREFIX } from "../security/session-cookie";

const SESSION_TOKEN_HASH_LENGTH = SESSION_TOKEN_HASH_PREFIX.length + 64;

// La migración revoca los bearer históricos una vez. Este saneamiento cubre
// además rollback -> roll-forward: un binario anterior puede volver a escribir
// tokens crudos después de que el journal ya marcó la migración como aplicada.
// Se valida el formato completo; un prefijo aislado no convierte basura en una
// sesión segura. Un fallo propaga y evita que el proceso abra el puerto.
export async function purgeUnsafeStoredSessions(): Promise<number> {
  const result = await db.delete(sesionesTable).where(sql`
    length(${sesionesTable.token_hash}) <> ${SESSION_TOKEN_HASH_LENGTH}
    OR substr(${sesionesTable.token_hash}, 1, ${SESSION_TOKEN_HASH_PREFIX.length}) <> ${SESSION_TOKEN_HASH_PREFIX}
    OR substr(${sesionesTable.token_hash}, ${SESSION_TOKEN_HASH_PREFIX.length + 1}) GLOB '*[^0-9a-f]*'
  `);
  return result.changes;
}
