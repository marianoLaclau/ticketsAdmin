import type {
  SqliteVerificationOptions,
  SqliteVerificationResult,
} from "./sqlite-verification";

export type SqliteRestoreErrorCode =
  | "OFFLINE_CONFIRMATION_REQUIRED"
  | "INVALID_RESTORE_PATH"
  | "TARGET_NOT_FOUND"
  | "RECOVERY_REQUIRED"
  | "RECOVERY_ALREADY_EXISTS"
  | "RESTORE_LOCKED"
  | "RESTORE_LOCK_LOST"
  | "TARGET_BUSY"
  | "TARGET_CHANGED"
  | "RESTORE_FAILED"
  | "ROLLBACK_FAILED";

export class SqliteRestoreError extends Error {
  readonly code: SqliteRestoreErrorCode;

  constructor(
    code: SqliteRestoreErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SqliteRestoreError";
    this.code = code;
  }
}

export interface RestoreVerifiedSqliteOptions {
  source: string;
  target: string;
  recoveryOutput?: string;
  /**
   * Node cannot prove portably that no other process holds SQLite. The caller
   * must stop every writer before acknowledging this precondition.
   */
  offlineConfirmed: true;
  /** A missing target is rejected unless disaster recovery opts in explicitly. */
  allowMissingTarget?: boolean;
  verification?: SqliteVerificationOptions;
}

export interface SqliteRestoreResult extends SqliteVerificationResult {
  sourcePath: string;
  targetPath: string;
  recoveryPath: string | null;
}
