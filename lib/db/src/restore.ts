import { restoreVerifiedSqliteBackupInternal } from "./restore-internal";
import type {
  RestoreVerifiedSqliteOptions,
  SqliteRestoreResult,
} from "./restore-types";

/**
 * Restores a verified TicketManager snapshot while the application is fully
 * stopped. An existing target is not touched until a verified recovery copy
 * has been published.
 */
export async function restoreVerifiedSqliteBackup(
  options: RestoreVerifiedSqliteOptions,
): Promise<SqliteRestoreResult> {
  return restoreVerifiedSqliteBackupInternal(options);
}

export {
  SqliteRestoreError,
  type RestoreVerifiedSqliteOptions,
  type SqliteRestoreErrorCode,
  type SqliteRestoreResult,
} from "./restore-types";
