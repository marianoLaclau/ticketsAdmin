import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";
import { loadWorkspaceEnv } from "../src/load-workspace-env";

const variableName = "TICKET_MANAGER_ENV_LOADER_TEST";
const previousValue = process.env[variableName];
const testRoot = path.join(
  process.cwd(),
  "tmp",
  `workspace-env-${process.pid}`,
);
const nestedDirectory = path.join(testRoot, "lib", "db");

rmSync(testRoot, { recursive: true, force: true });
mkdirSync(nestedDirectory, { recursive: true });
writeFileSync(path.join(testRoot, "pnpm-workspace.yaml"), "packages: []\n");
writeFileSync(
  path.join(testRoot, ".env"),
  `${variableName}=desde-la-raiz\n`,
  "utf8",
);

after(() => {
  if (previousValue === undefined) delete process.env[variableName];
  else process.env[variableName] = previousValue;
  rmSync(testRoot, { recursive: true, force: true });
});

describe("carga compartida de .env", () => {
  it("encuentra la raíz desde un paquete y respeta el entorno explícito", () => {
    delete process.env[variableName];
    assert.equal(
      loadWorkspaceEnv(nestedDirectory),
      path.join(testRoot, ".env"),
    );
    assert.equal(process.env[variableName], "desde-la-raiz");

    process.env[variableName] = "explicito";
    loadWorkspaceEnv(nestedDirectory);
    assert.equal(process.env[variableName], "explicito");
  });
});
