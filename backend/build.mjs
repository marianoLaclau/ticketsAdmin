import { spawnSync } from "node:child_process";
import { createRequire, isBuiltin } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const allowedRuntimeExternals = new Set(["better-sqlite3"]);
const allowedOptionalExternalRequires = new Map([
  ["supports-color", "/node_modules/debug/src/node.js"],
]);

function isAllowedOptionalExternal(imported, importerPath) {
  if (imported.kind !== "require-call") return false;

  const normalizedImporter = importerPath.replaceAll("\\", "/");
  for (const [packageName, importerSuffix] of allowedOptionalExternalRequires) {
    if (
      imported.path === packageName &&
      normalizedImporter.endsWith(importerSuffix)
    ) {
      return true;
    }
  }
  return false;
}

function assertRuntimeExternals(metafile) {
  const unexpected = new Set();
  const validatedOptionalPaths = new Set();
  const invalidOptionalUsages = new Map();

  for (const [inputPath, input] of Object.entries(metafile.inputs)) {
    for (const imported of input.imports) {
      if (
        !imported.external ||
        !allowedOptionalExternalRequires.has(imported.path)
      ) {
        continue;
      }
      // debug@4 declara este peer como opcional y lo carga bajo try/catch.
      // Se valida también el importer para no autorizar usos ajenos por nombre.
      if (isAllowedOptionalExternal(imported, inputPath)) {
        validatedOptionalPaths.add(imported.path);
        continue;
      }
      const usages = invalidOptionalUsages.get(imported.path) ?? new Set();
      usages.add(`${imported.path} (${imported.kind}) <- ${inputPath}`);
      invalidOptionalUsages.set(imported.path, usages);
    }
  }

  for (const [outputPath, output] of Object.entries(metafile.outputs)) {
    for (const imported of output.imports) {
      if (!imported.external) continue;
      if (isBuiltin(imported.path)) continue;
      if (allowedRuntimeExternals.has(imported.path)) {
        continue;
      }
      if (
        imported.kind === "require-call" &&
        validatedOptionalPaths.has(imported.path) &&
        !invalidOptionalUsages.has(imported.path)
      ) {
        continue;
      }
      for (const usage of invalidOptionalUsages.get(imported.path) ?? []) {
        unexpected.add(usage);
      }
      unexpected.add(`${imported.path} (${imported.kind}) <- ${outputPath}`);
    }
  }

  if (unexpected.size > 0) {
    throw new Error(
      `El bundle dejó dependencias runtime no autorizadas: ${[...unexpected].sort().join(", ")}`,
    );
  }
}

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  const buildResult = await esbuild({
    entryPoints: {
      index: path.resolve(artifactDir, "src/index.ts"),
      migrate: path.resolve(artifactDir, "src/migrate.ts"),
      "backup-db": path.resolve(artifactDir, "../scripts/src/backup-db.ts"),
      "restore-db": path.resolve(artifactDir, "../scripts/src/restore-db.ts"),
      "verify-db": path.resolve(artifactDir, "../scripts/src/verify-db.ts"),
    },
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    // El addon nativo debe existir como dependencia productiva del runtime.
    // Todo otro paquete se bundlea y cualquier external inesperado falla abajo.
    external: [...allowedRuntimeExternals],
    metafile: true,
    sourcemap: "linked",
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] }),
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });

  assertRuntimeExternals(buildResult.metafile);

  const cliSmokeContracts = [
    ["backup-db", "--json"],
    ["restore-db", "--confirm-stopped"],
    ["verify-db", "--expect-evidence"],
  ];
  for (const [bundleName, expectedHelp] of cliSmokeContracts) {
    const bundle = path.join(distDir, `${bundleName}.mjs`);
    const smoke = spawnSync(process.execPath, [bundle, "--help"], {
      cwd: artifactDir,
      encoding: "utf8",
      windowsHide: true,
    });
    if (
      smoke.error ||
      smoke.status !== 0 ||
      !smoke.stdout.includes(expectedHelp)
    ) {
      throw new Error(
        [
          `El bundle ${bundleName}.mjs no superó su smoke test de ejecución`,
          smoke.error?.message,
          smoke.stderr,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
  }

  for (const bundleName of ["backup-db", "verify-db"]) {
    const bundle = path.join(distDir, `${bundleName}.mjs`);
    const failure = spawnSync(process.execPath, [bundle, "--json"], {
      cwd: artifactDir,
      encoding: "utf8",
      windowsHide: true,
    });
    let payload;
    try {
      payload = JSON.parse(failure.stderr.trim());
    } catch {
      payload = undefined;
    }
    if (
      failure.error ||
      failure.status !== 2 ||
      failure.stdout !== "" ||
      payload?.contract !== "ticketsadmin.sqlite-evidence" ||
      payload?.error?.code !== "INVALID_ARGUMENT"
    ) {
      throw new Error(
        [
          `El bundle ${bundleName}.mjs no respetó el contrato JSON de error`,
          failure.error?.message,
          failure.stdout,
          failure.stderr,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
  }
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
