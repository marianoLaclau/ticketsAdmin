import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export const SQLITE_RUNTIME_SUFFIXES = ["-shm", "-wal", "-journal"] as const;

export function areSamePath(first: string, second: string): boolean {
  if (process.platform === "win32") {
    return (
      first.toLocaleLowerCase("en-US") === second.toLocaleLowerCase("en-US")
    );
  }
  return first === second;
}

export function areSameExistingFile(first: string, second: string): boolean {
  if (areSamePath(first, second)) {
    return true;
  }

  const firstStat = fs.statSync(first, { throwIfNoEntry: false });
  const secondStat = fs.statSync(second, { throwIfNoEntry: false });
  return Boolean(
    firstStat &&
    secondStat &&
    firstStat.dev === secondStat.dev &&
    firstStat.ino !== 0 &&
    firstStat.ino === secondStat.ino,
  );
}

export function pathEntryExists(filePath: string): boolean {
  return fs.lstatSync(filePath, { throwIfNoEntry: false }) !== undefined;
}

export function assertRegularFile(
  filePath: string,
  description: string,
): fs.Stats {
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile()) {
    throw new Error(`${description} no existe o no es un archivo: ${filePath}`);
  }
  return stat;
}

export function removeSqliteArtifacts(databasePath: string): void {
  for (const suffix of ["", ...SQLITE_RUNTIME_SUFFIXES]) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

export function createPrivateStagingDirectory(
  parentDirectory: string,
  prefix: string,
): string {
  const directory = fs.mkdtempSync(path.join(parentDirectory, prefix));
  fs.chmodSync(directory, 0o700);
  return directory;
}

export function createPrivateFile(filePath: string): void {
  const descriptor = fs.openSync(filePath, "wx", 0o600);
  try {
    // Preserve the invariant even on filesystems that alter the requested mode.
    fs.chmodSync(filePath, 0o600);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function syncFile(filePath: string): void {
  const descriptor = fs.openSync(filePath, "r+");
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function syncDirectory(directoryPath: string): void {
  // Windows does not allow opening a directory with fs.openSync. The file is
  // still flushed through a writable handle; directory fsync is used on POSIX.
  if (process.platform === "win32") {
    return;
  }

  const descriptor = fs.openSync(directoryPath, "r");
  try {
    try {
      fs.fsyncSync(descriptor);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EINVAL" && code !== "ENOTSUP") {
        throw error;
      }
      // Some POSIX filesystems do not implement directory fsync. The snapshot
      // file itself was already flushed and publication remains no-clobber.
    }
  } finally {
    fs.closeSync(descriptor);
  }
}
