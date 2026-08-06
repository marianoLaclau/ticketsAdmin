import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
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
    // Some packages may not be bundleable, so we externalize them, we can add more here as needed.
    // Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
    // Examples of unbundleable packages:
    // - uses native modules and loads them dynamically (e.g. sharp)
    // - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
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
