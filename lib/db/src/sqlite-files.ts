import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export const SQLITE_RUNTIME_SUFFIXES = ["-shm", "-wal", "-journal"] as const;

export interface FileSystemIdentity {
  dev: bigint;
  ino: bigint;
}

export interface PrivateStagingDirectory {
  identity: FileSystemIdentity;
  parentDirectory: string;
  path: string;
  prefix: string;
}

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

export function areRelatedSqliteArtifactPaths(
  first: string,
  second: string,
): boolean {
  const isArtifactOf = (candidate: string, database: string): boolean =>
    ["", ...SQLITE_RUNTIME_SUFFIXES].some((suffix) =>
      areSamePath(candidate, `${database}${suffix}`),
    );

  return isArtifactOf(first, second) || isArtifactOf(second, first);
}

export function pathEntryExists(filePath: string): boolean {
  return fs.lstatSync(filePath, { throwIfNoEntry: false }) !== undefined;
}

function fileSystemIdentitiesMatch(
  first: FileSystemIdentity,
  second: FileSystemIdentity,
): boolean {
  return first.dev === second.dev && first.ino === second.ino;
}

export function resolveExistingPath(input: string): string {
  return fs.realpathSync.native(path.resolve(input));
}

/**
 * Resolves every existing parent (including junctions) without following the
 * final path entry. This keeps no-clobber checks meaningful for outputs that
 * do not exist yet while still allowing the leaf itself to be rejected as a
 * symlink by its caller.
 */
export function resolvePotentialPath(input: string): string {
  const resolvedPath = path.resolve(input);
  const leafName = path.basename(resolvedPath);
  let existingParent = path.dirname(resolvedPath);
  const missingSegments: string[] = [];

  while (!pathEntryExists(existingParent)) {
    const nextParent = path.dirname(existingParent);
    if (areSamePath(nextParent, existingParent)) {
      throw new Error(
        `No se pudo encontrar un directorio existente para resolver: ${resolvedPath}`,
      );
    }
    missingSegments.unshift(path.basename(existingParent));
    existingParent = nextParent;
  }

  const canonicalParent = fs.realpathSync.native(existingParent);
  return path.join(canonicalParent, ...missingSegments, leafName);
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

export function createPrivateStagingDirectory(
  parentDirectory: string,
  prefix: string,
): PrivateStagingDirectory {
  const directory = fs.mkdtempSync(path.join(parentDirectory, prefix));
  fs.chmodSync(directory, 0o700);
  const stat = fs.lstatSync(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.ino === 0n) {
    throw new Error(
      `El filesystem no expone una identidad estable para el staging: ${directory}`,
    );
  }
  return {
    identity: { dev: stat.dev, ino: stat.ino },
    parentDirectory,
    path: directory,
    prefix,
  };
}

function readDirectoryIdentity(
  directoryPath: string,
): FileSystemIdentity | null {
  const stat = fs.lstatSync(directoryPath, {
    bigint: true,
    throwIfNoEntry: false,
  });
  if (!stat?.isDirectory() || stat.isSymbolicLink() || stat.ino === 0n) {
    return null;
  }
  return { dev: stat.dev, ino: stat.ino };
}

function assertStagingIdentity(staging: PrivateStagingDirectory): void {
  if (
    !areSamePath(path.dirname(staging.path), staging.parentDirectory) ||
    !path.basename(staging.path).startsWith(staging.prefix)
  ) {
    throw new Error(`Se rechazó un staging inesperado: ${staging.path}`);
  }

  const current = readDirectoryIdentity(staging.path);
  if (!current || !fileSystemIdentitiesMatch(current, staging.identity)) {
    throw new Error(
      `El staging fue retirado o reemplazado; se preservó el path visible: ${staging.path}`,
    );
  }
}

/**
 * Removes only known regular SQLite artifacts and then an empty directory.
 * There is deliberately no recursive deletion: unexpected content or a
 * replaced directory is preserved for inspection.
 */
export function removePrivateStagingDirectory(
  staging: PrivateStagingDirectory,
  knownDatabaseNames: readonly string[],
): void {
  assertStagingIdentity(staging);
  const allowedNames = new Set(
    knownDatabaseNames.flatMap((name) =>
      ["", ...SQLITE_RUNTIME_SUFFIXES].map((suffix) => `${name}${suffix}`),
    ),
  );
  const entries = fs.readdirSync(staging.path, { withFileTypes: true });
  const entryIdentities = new Map<string, FileSystemIdentity>();

  for (const entry of entries) {
    if (!allowedNames.has(entry.name) || !entry.isFile()) {
      throw new Error(
        `El staging contiene una entrada inesperada y se preservó completo: ${entry.name}`,
      );
    }
    const entryPath = path.join(staging.path, entry.name);
    const stat = fs.lstatSync(entryPath, { bigint: true });
    if (stat.isSymbolicLink() || stat.ino === 0n) {
      throw new Error(
        `El staging contiene una entrada sin identidad segura: ${entry.name}`,
      );
    }
    entryIdentities.set(entry.name, { dev: stat.dev, ino: stat.ino });
  }

  for (const [entryName, expectedIdentity] of entryIdentities) {
    assertStagingIdentity(staging);
    const entryPath = path.join(staging.path, entryName);
    const currentStat = fs.lstatSync(entryPath, {
      bigint: true,
      throwIfNoEntry: false,
    });
    if (
      !currentStat?.isFile() ||
      currentStat.isSymbolicLink() ||
      currentStat.dev !== expectedIdentity.dev ||
      currentStat.ino !== expectedIdentity.ino
    ) {
      throw new Error(
        `Una entrada del staging cambió durante la limpieza: ${entryName}`,
      );
    }
    fs.unlinkSync(entryPath);
  }

  assertStagingIdentity(staging);
  fs.rmdirSync(staging.path);
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
