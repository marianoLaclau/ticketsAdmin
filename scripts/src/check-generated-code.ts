#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const generatedPaths = [
  "lib/api-client-react/src/generated",
  "lib/api-zod/src/generated",
];

const status = spawnSync(
  "git",
  [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
    "--",
    ...generatedPaths,
  ],
  {
    cwd: workspaceRoot,
    encoding: "utf8",
    windowsHide: true,
  },
);

if (status.error) {
  throw status.error;
}
if (status.status !== 0) {
  process.stderr.write(status.stderr);
  throw new Error(`git status finalizó con código ${String(status.status)}`);
}

const drift = status.stdout.trim();
if (drift) {
  console.error(
    "El cliente o los validadores generados no coinciden con OpenAPI. " +
      "Ejecutá pnpm run codegen y commiteá todos los artefactos:\n",
  );
  console.error(drift);
  process.exitCode = 1;
} else {
  console.log("Artefactos OpenAPI sincronizados");
}
