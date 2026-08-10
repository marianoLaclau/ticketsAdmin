import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const releasePath = fileURLToPath(
  new URL("../deploy/deploy-release.sh", import.meta.url),
);

const databaseBytes = Buffer.from("ticketsadmin-e2e-sqlite-snapshot-v1\n");
const databaseSha256 = createHash("sha256").update(databaseBytes).digest("hex");
const canonicalComposeContract = JSON.stringify({
  name: "ticketsadmin",
  services: {
    backend: {
      environment: {
        ADMIN_API_KEY: "redacted",
        BOOTSTRAP_SYSADMIN_PASSWORD: "redacted",
        WEBHOOK_API_KEY: "redacted",
      },
    },
    frontend: { environment: {} },
  },
  volumes: { tickets_data: { name: "ticketsadmin_tickets_data" } },
});
const composeContractSha256 = createHash("sha256")
  .update(canonicalComposeContract)
  .digest("hex");
const preLedgerBaselineRelease = `git-${"9".repeat(40)}-run-123-1`;
const candidateBackendImageId = `sha256:${"c".repeat(64)}`;
const baselineBackendImageId = `sha256:${"e".repeat(64)}`;
const baselineFrontendImageId = `sha256:${"f".repeat(64)}`;
const helperContainerId = "5".repeat(64);
const verifierContainerId = "6".repeat(64);
const secretSentinels = [
  "admin-e2e-sentinel",
  "webhook-e2e-sentinel",
  "bootstrap-e2e-sentinel",
];

type ActiveContainer = {
  configImage: string;
  health: string;
  id: string;
  imageId: string;
  service: "backend" | "frontend";
  startedAt: string;
  status: string;
};

type FakeState = {
  active: {
    backend: ActiveContainer;
    frontend: ActiveContainer;
  };
  dbFingerprint: string;
  phase:
    | "baseline"
    | "candidate-active"
    | "candidate-partial"
    | "contained"
    | "rolled-back";
  volumeId: string;
};

type CommandEvent = {
  args: string[];
  backendImage: string | null;
  command: string;
  frontendImage: string | null;
  phase: FakeState["phase"];
};

const fakeCommand = String.raw`#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const command = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const stateFile = process.env.FAKE_STATE_FILE;
const logFile = process.env.FAKE_LOG_FILE;
const revision = process.env.FAKE_REVISION;
const migrationTree = process.env.FAKE_MIGRATION_TREE;
const imageSource = process.env.FAKE_IMAGE_SOURCE;
const releaseId = process.env.FAKE_RELEASE_ID;
const composeContract = process.env.FAKE_COMPOSE_CONTRACT;
const composeContractSha = process.env.FAKE_COMPOSE_CONTRACT_SHA;
const composeConfigCountFile = process.env.FAKE_COMPOSE_CONFIG_COUNT_FILE;
const composeDriftAfterConfigs = Number(process.env.FAKE_COMPOSE_DRIFT_AFTER_CONFIGS || 0);
const dbEpoch = "drizzle-" + migrationTree;
const dbBytes = Buffer.from(process.env.FAKE_DB_BASE64, "base64");
const dbSha = process.env.FAKE_DB_SHA;
const dbPageCount = 1;
const legacyBaseline = process.env.FAKE_LEGACY_BASELINE === "true";
const preLedgerBaseline = process.env.FAKE_PRE_LEDGER_BASELINE === "true";
const omitComposeSecret = process.env.FAKE_OMIT_COMPOSE_SECRET === "true";
const candidateSucceeds = process.env.FAKE_CANDIDATE_SUCCEEDS === "true";
const candidateReadinessFails = process.env.FAKE_CANDIDATE_READINESS_FAILS === "true";
const failRuntimeRead = process.env.FAKE_FAIL_RUNTIME_READ === "true";
const preLedgerBaselineRelease = "git-" + "9".repeat(40) + "-run-123-1";
const candidateBackend = process.env.FAKE_CANDIDATE_BACKEND;
const candidateFrontend = process.env.FAKE_CANDIDATE_FRONTEND;
const candidateBackendRef = process.env.FAKE_CANDIDATE_BACKEND_REF;
const candidateFrontendRef = process.env.FAKE_CANDIDATE_FRONTEND_REF;
const baselineBackend = process.env.FAKE_BASELINE_BACKEND;
const baselineFrontend = process.env.FAKE_BASELINE_FRONTEND;
const volume = "ticketsadmin_tickets_data";
const helperId = "5".repeat(64);
const verifierId = "6".repeat(64);

const readState = () => JSON.parse(fs.readFileSync(stateFile, "utf8"));
const writeState = (state) => {
  const temporary = stateFile + ".next";
  fs.writeFileSync(temporary, JSON.stringify(state));
  fs.renameSync(temporary, stateFile);
};
const output = (value) => {
  if (Buffer.isBuffer(value)) process.stdout.write(value);
  else process.stdout.write(String(value) + "\n");
};
const fail = (message) => {
  process.stderr.write(message + "\n");
  process.exit(1);
};
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? "" : args[index + 1];
};
const state = readState();

fs.appendFileSync(logFile, JSON.stringify({
  command,
  args,
  backendImage: process.env.TICKETSADMIN_BACKEND_IMAGE || null,
  frontendImage: process.env.TICKETSADMIN_FRONTEND_IMAGE || null,
  phase: state.phase,
}) + "\n");

if (command === "git") {
  if (args[0] === "fetch") process.exit(0);
  if (args[0] === "rev-parse" && args[1] === "HEAD:lib/db/drizzle") {
    output(migrationTree);
  } else if (args[0] === "rev-parse" && (args[1] === "HEAD" || args[1] === "FETCH_HEAD")) {
    output(revision);
  } else {
    fail("unsupported fake git command");
  }
  process.exit(0);
}

if (command === "curl") {
  const url = args[args.length - 1];
  if (url === "http://127.0.0.1:3000/") output('<div id="root"></div>');
  else if (url.endsWith("/api/healthz")) output('{"status":"ok"}');
  else if (url.endsWith("/api/readyz")) {
    if (legacyBaseline && state.phase === "baseline") fail("legacy baseline has no readyz");
    if (candidateReadinessFails && state.phase === "candidate-active") fail("candidate readyz failed");
    output('{"status":"ready"}');
  }
  else fail("unsupported fake curl URL");
  process.exit(0);
}

if (command === "jq") {
  const query = args.find((argument) =>
    argument === ".name"
    || argument === ".volumes.tickets_data.name"
    || argument === ".artifact.sha256"
    || argument === ".artifact.bytes"
    || argument === ".artifact.pageCount"
    || argument.includes("$data_mounts")
    || argument.includes("ticketsadmin.sqlite-evidence")
    || argument.includes("del(.services[].image")
    || argument.includes('has("WEBHOOK_API_KEY")')
  );

  if (args.includes("-n")) {
    const named = {};
    for (let index = 0; index < args.length - 2; index += 1) {
      if (args[index] === "--arg" || args[index] === "--argjson") {
        named[args[index + 1]] = args[index + 2];
        index += 2;
      }
    }
    output(JSON.stringify({
      contract: "ticketsadmin.predeploy-checkpoint",
      contractVersion: 1,
      complete: true,
      snapshot: {
        file: named.snapshot,
        sha256: named.sha256,
        bytes: Number(named.bytes),
        pageCount: Number(named.pageCount),
      },
    }));
    process.exit(0);
  }

  if (query === ".name") {
    output(JSON.parse(fs.readFileSync(0, "utf8")).name);
  } else if (query === ".volumes.tickets_data.name") {
    output(JSON.parse(fs.readFileSync(0, "utf8")).volumes.tickets_data.name);
  } else if (query && query.includes('has("WEBHOOK_API_KEY")')) {
    const input = JSON.parse(fs.readFileSync(0, "utf8"));
    const environment = input.services.backend.environment;
    process.exit(
      environment
      && Object.hasOwn(environment, "WEBHOOK_API_KEY")
      && Object.hasOwn(environment, "ADMIN_API_KEY")
      && Object.hasOwn(environment, "BOOTSTRAP_SYSADMIN_PASSWORD")
        ? 0
        : 1,
    );
  } else if (query && query.includes("del(.services[].image")) {
    const input = JSON.parse(fs.readFileSync(0, "utf8"));
    output(
      input["x-contract-drift"] === true
        ? JSON.stringify({ ...JSON.parse(composeContract), xContractDrift: true })
        : composeContract,
    );
  } else if (query && query.includes("$data_mounts")) {
    const mounts = JSON.parse(fs.readFileSync(0, "utf8"));
    const expectedVolume = option("--arg") === "data_volume"
      ? args[args.indexOf("--arg") + 2]
      : "";
    const dataMounts = mounts.filter((mount) => mount.Destination === "/data");
    process.exit(
      dataMounts.length === 1
      && dataMounts[0].Type === "volume"
      && dataMounts[0].RW === true
      && dataMounts[0].Name === expectedVolume
        ? 0
        : 1,
    );
  } else if (query && query.includes("ticketsadmin.sqlite-evidence")) {
    const document = JSON.parse(fs.readFileSync(args[args.length - 1], "utf8"));
    if (query.includes('.operation == "backup"')) {
      process.exit(document.operation === "backup" && document.artifact.sha256 === dbSha ? 0 : 1);
    }
    process.exit(
      document.operation === "verify"
      && document.comparison.matched === true
      && document.artifact.sha256 === dbSha
        ? 0
        : 1,
    );
  } else if (
    query === ".artifact.sha256"
    || query === ".artifact.bytes"
    || query === ".artifact.pageCount"
  ) {
    const document = JSON.parse(fs.readFileSync(args[args.length - 1], "utf8"));
    const property = query.slice(".artifact.".length);
    output(document.artifact[property]);
  } else {
    fail("unsupported fake jq query");
  }
  process.exit(0);
}

if (command !== "docker") fail("unsupported fake command");

const backendEnvironment = {
  WEBHOOK_API_KEY: "placeholder",
  ADMIN_API_KEY: "placeholder",
  BOOTSTRAP_SYSADMIN_PASSWORD: "",
};
if (omitComposeSecret) delete backendEnvironment.ADMIN_API_KEY;

const composeConfig = {
  name: "ticketsadmin",
  services: {
    backend: {
      build: { context: "." },
      environment: backendEnvironment,
      image: candidateBackendRef,
    },
    frontend: {
      build: { context: "." },
      environment: {},
      image: candidateFrontendRef,
    },
  },
  volumes: { tickets_data: { name: volume } },
};

if (args[0] === "compose" && args[1] === "config") {
  let config = composeConfig;
  if (composeDriftAfterConfigs > 0) {
    const previousCount = fs.existsSync(composeConfigCountFile)
      ? Number(fs.readFileSync(composeConfigCountFile, "utf8"))
      : 0;
    const currentCount = previousCount + 1;
    fs.writeFileSync(composeConfigCountFile, String(currentCount));
    if (currentCount >= composeDriftAfterConfigs) {
      config = { ...composeConfig, "x-contract-drift": true };
    }
  }
  output(JSON.stringify(config));
  process.exit(0);
}

const imageIdentity = (target) => {
  if (target === candidateBackend || target === candidateBackendRef) return candidateBackend;
  if (target === candidateFrontend || target === candidateFrontendRef) return candidateFrontend;
  if (target === baselineBackend) return baselineBackend;
  if (target === baselineFrontend) return baselineFrontend;
  return "";
};

if (args[0] === "image" && args[1] === "inspect") {
  const format = option("--format");
  const target = args[args.length - 1];
  const identity = imageIdentity(target);
  if (!identity) fail("unknown image identity");
  const baseline = identity === baselineBackend || identity === baselineFrontend;
  if (format === "{{.Id}}") output(identity);
  else if (baseline && legacyBaseline) output("<no value>");
  else if (format.includes("org.opencontainers.image.revision")) {
    output(baseline ? "9".repeat(40) : revision);
  } else if (format.includes("org.opencontainers.image.source")) output(imageSource);
  else if (format.includes("io.ticketsadmin.release-id")) {
    output(baseline ? preLedgerBaselineRelease : releaseId);
  } else if (baseline && preLedgerBaseline) output("<no value>");
  else if (format.includes("io.ticketsadmin.runtime-epoch")) output("readyz-v1");
  else if (format.includes("io.ticketsadmin.db-rollback-epoch")) output(dbEpoch);
  else if (format.includes("io.ticketsadmin.compose-contract-sha256")) output(composeContractSha);
  else fail("unsupported image inspect format");
  process.exit(0);
}

if (args[0] === "compose" && args[1] === "up") {
  const requestedBackend = process.env.TICKETSADMIN_BACKEND_IMAGE;
  const requestedFrontend = process.env.TICKETSADMIN_FRONTEND_IMAGE;
  if (requestedBackend === candidateBackend && requestedFrontend === candidateFrontend) {
    state.phase = candidateSucceeds ? "candidate-active" : "candidate-partial";
    state.active.backend = {
      id: "1".repeat(64),
      imageId: candidateBackend,
      configImage: candidateBackend,
      service: "backend",
      status: "running",
      health: "healthy",
      startedAt: "2026-08-06T12:00:00Z",
    };
    if (candidateSucceeds) {
      state.active.frontend = {
        id: "2".repeat(64),
        imageId: candidateFrontend,
        configImage: candidateFrontend,
        service: "frontend",
        status: "running",
        health: "healthy",
        startedAt: "2026-08-06T12:00:01Z",
      };
    }
    writeState(state);
    if (candidateSucceeds) process.exit(0);
    fail("injected candidate failure after backend replacement");
  }
  if (requestedBackend === baselineBackend && requestedFrontend === baselineFrontend) {
    state.phase = "rolled-back";
    state.active.backend = {
      id: "3".repeat(64),
      imageId: baselineBackend,
      configImage: baselineBackend,
      service: "backend",
      status: "running",
      health: "healthy",
      startedAt: "2026-08-06T12:01:00Z",
    };
    state.active.frontend = {
      id: "4".repeat(64),
      imageId: baselineFrontend,
      configImage: baselineFrontend,
      service: "frontend",
      status: "running",
      health: "healthy",
      startedAt: "2026-08-06T12:01:01Z",
    };
    writeState(state);
    process.exit(0);
  }
  fail("compose received an unknown image pair");
}

if (args[0] === "ps" && args.includes("-aq")) {
  if (failRuntimeRead) fail("injected runtime read failure");
  const current = readState();
  const joined = args.join(" ");
  if (joined.includes("volume=")) output(current.active.backend.id);
  else if (joined.includes("service=backend")) output(current.active.backend.id);
  else if (joined.includes("service=frontend")) output(current.active.frontend.id);
  else output(current.active.backend.id + "\n" + current.active.frontend.id);
  process.exit(0);
}

if (args[0] === "volume" && args[1] === "ls") {
  output(volume);
  process.exit(0);
}

if (args[0] === "volume" && args[1] === "inspect") {
  const format = option("--format");
  if (!format) output("[]");
  else if (format.includes("com.docker.compose.project")) output("ticketsadmin");
  else if (format.includes("com.docker.compose.volume")) output("tickets_data");
  else fail("unsupported volume inspect format");
  process.exit(0);
}

if (args[0] === "inspect") {
  const format = option("--format");
  const containerId = args[args.length - 1];
  const current = readState();
  const container = current.active.backend.id === containerId
    ? current.active.backend
    : current.active.frontend.id === containerId
      ? current.active.frontend
      : null;
  if (!container) fail("unknown container identity");
  if (format === "{{.State.Status}}") output(container.status);
  else if (format.includes(".State.Health.Status")) output(container.health);
  else if (format === "{{.Image}}") output(container.imageId);
  else if (format === "{{.State.StartedAt}}") output(container.startedAt);
  else if (format === "{{.Config.Image}}") output(container.configImage);
  else if (format.includes('com.docker.compose.service')) output(container.service);
  else if (format === "{{json .Mounts}}") {
    output(JSON.stringify(container.service === "backend" ? [{
      Destination: "/data",
      Type: "volume",
      RW: true,
      Name: volume,
    }] : []));
  } else fail("unsupported container inspect format");
  process.exit(0);
}

if (args[0] === "run") {
  const cidFile = option("--cidfile");
  if (args.includes("--detach")) {
    fs.writeFileSync(cidFile, helperId);
    output(helperId);
  } else {
    const expectedUser = process.getuid() + ":" + process.getgid();
    const tmpfs = option("--tmpfs");
    if (option("--user") !== expectedUser) {
      fail("EACCES: verifier identity cannot read /evidence/snapshot.db");
    }
    if (!tmpfs.includes("uid=" + process.getuid()) || !tmpfs.includes("gid=" + process.getgid())) {
      fail("verifier tmpfs does not belong to its runtime identity");
    }
    fs.writeFileSync(cidFile, verifierId);
    output(JSON.stringify({
      contract: "ticketsadmin.sqlite-evidence",
      contractVersion: 1,
      ok: true,
      operation: "verify",
      artifact: {
        path: "/evidence/snapshot.db",
        storage: "sqlite-single-file-v1",
        sha256: dbSha,
        bytes: dbBytes.length,
        pageCount: dbPageCount,
      },
      checks: { integrity: "ok", foreignKeys: "ok", ticketManagerSchema: "ok" },
      comparison: { matched: true },
    }));
  }
  process.exit(0);
}

if (args[0] === "exec") {
  if (args[1] !== helperId) fail("unknown backup helper");
  if (args.some((argument) => argument.endsWith("/backup-db.mjs"))) {
    output(JSON.stringify({
      contract: "ticketsadmin.sqlite-evidence",
      contractVersion: 1,
      ok: true,
      operation: "backup",
      sourcePath: "/data/tickets.db",
      artifact: {
        path: "/tmp/snapshot.db",
        storage: "sqlite-single-file-v1",
        sha256: dbSha,
        bytes: dbBytes.length,
        pageCount: dbPageCount,
      },
      checks: { integrity: "ok", foreignKeys: "ok", ticketManagerSchema: "ok" },
    }));
  } else if (args.includes("cat") && args.includes("/tmp/snapshot.db")) {
    output(dbBytes);
  } else {
    fail("unsupported helper exec");
  }
  process.exit(0);
}

if (args[0] === "stop") {
  const current = readState();
  const expected = [current.active.backend.id, current.active.frontend.id].sort();
  const requested = args.filter((argument) => /^[a-f0-9]{64}$/.test(argument)).sort();
  if (JSON.stringify(requested) !== JSON.stringify(expected)) {
    fail("stop targeted an unknown container");
  }
  current.active.backend.status = "exited";
  current.active.backend.health = "unhealthy";
  current.active.frontend.status = "exited";
  current.active.frontend.health = "unhealthy";
  current.phase = "contained";
  writeState(current);
  output(requested.join("\n"));
  process.exit(0);
}

if (args[0] === "rm" && args[1] === "-f") process.exit(0);

fail("unsupported fake docker command " + args.join(" "));
`;

const parseEvents = (path: string): CommandEvent[] => {
  const contents = readFileSync(path, "utf8").trim();
  return contents
    ? contents.split(/\r?\n/).map((line) => JSON.parse(line) as CommandEvent)
    : [];
};

const parseOutputs = (contents: string): Record<string, string> =>
  Object.fromEntries(
    contents
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );

function isComposeUp(event: CommandEvent): boolean {
  return (
    event.command === "docker" &&
    event.args[0] === "compose" &&
    event.args[1] === "up"
  );
}

function assertNoDataRollbackOrBroadTeardown(events: CommandEvent[]): void {
  for (const event of events) {
    if (event.command !== "docker") continue;
    assert.ok(
      [
        "compose",
        "exec",
        "image",
        "inspect",
        "ps",
        "rm",
        "run",
        "stop",
        "volume",
      ].includes(event.args[0] ?? ""),
      `comando Docker inesperado: ${event.args.join(" ")}`,
    );
    assert.equal(
      event.args.some((argument) => argument.includes("restore-db.mjs")),
      false,
      "el release no debe ejecutar restore-db.mjs",
    );
    assert.equal(
      event.args[0] === "compose" && event.args[1] === "down",
      false,
      "el release no debe ejecutar compose down",
    );
    assert.equal(
      event.args[0] === "volume" &&
        (event.args[1] === "rm" || event.args[1] === "prune"),
      false,
      "el release no debe borrar volumenes",
    );
    if (event.args[0] === "compose") {
      assert.ok(
        event.args[1] === "config" || event.args[1] === "up",
        `subcomando Compose inesperado: ${event.args.join(" ")}`,
      );
    }
    if (event.args[0] === "image") {
      assert.equal(
        event.args[1],
        "inspect",
        `mutacion inesperada de imagen: ${event.args.join(" ")}`,
      );
    }
    if (event.args[0] === "volume") {
      assert.ok(
        event.args[1] === "ls" || event.args[1] === "inspect",
        `mutacion inesperada del volumen: ${event.args.join(" ")}`,
      );
    }
    if (event.args[0] === "exec") {
      assert.equal(event.args[1], helperContainerId);
      assert.ok(
        event.args.some((argument) => argument.endsWith("/backup-db.mjs")) ||
          event.args.includes("cat"),
        `exec inesperado: ${event.args.join(" ")}`,
      );
    }
    if (event.args[0] === "run") {
      assert.ok(event.args.includes("--read-only"));
      assert.ok(event.args.includes("--network"));
      assert.equal(event.args[event.args.indexOf("--network") + 1], "none");
      assert.equal(
        event.args.some(
          (argument) =>
            argument === "--privileged" ||
            argument.startsWith("--privileged=") ||
            argument === "--device" ||
            argument.startsWith("--device=") ||
            argument === "--pid" ||
            argument.startsWith("--pid=") ||
            argument === "--ipc" ||
            argument.startsWith("--ipc=") ||
            argument === "--uts" ||
            argument.startsWith("--uts=") ||
            argument === "--userns" ||
            argument.startsWith("--userns=") ||
            argument === "--cgroupns" ||
            argument.startsWith("--cgroupns=") ||
            argument === "--cap-add" ||
            argument.startsWith("--cap-add=") ||
            argument.startsWith("--cap-drop=") ||
            argument.startsWith("--security-opt=") ||
            argument.startsWith("--network=") ||
            argument.startsWith("--read-only=") ||
            argument === "--runtime" ||
            argument.startsWith("--runtime=") ||
            argument === "--env" ||
            argument.startsWith("--env=") ||
            argument === "--env-file" ||
            argument.startsWith("--env-file=") ||
            argument === "-e" ||
            argument.startsWith("-e="),
        ),
        false,
        `un helper obtuvo privilegios o entorno extra: ${event.args.join(" ")}`,
      );
      assert.equal(
        event.args.some(
          (argument) =>
            argument.startsWith("-v") ||
            argument.startsWith("--volume") ||
            argument.startsWith("--mount="),
        ),
        false,
        `un helper uso un volume mount no auditado: ${event.args.join(" ")}`,
      );
      const mounts = event.args
        .map((argument, index) =>
          argument === "--mount" ? event.args[index + 1] : undefined,
        )
        .filter((mount): mount is string => mount !== undefined);
      assert.equal(mounts.length, 1);
      assert.ok(
        mounts.every((mount) => mount.split(",").includes("readonly")),
        `un helper obtuvo un mount escribible: ${event.args.join(" ")}`,
      );
      const fields = Object.fromEntries(
        mounts[0]!.split(",").map((field) => {
          const separator = field.indexOf("=");
          return separator === -1
            ? [field, ""]
            : [field.slice(0, separator), field.slice(separator + 1)];
        }),
      );
      const expectedDataMount =
        fields.type === "volume" &&
        fields.src === "ticketsadmin_tickets_data" &&
        fields.dst === "/data";
      const expectedEvidenceMount =
        fields.type === "bind" &&
        fields.dst === "/evidence" &&
        /^\/tmp\/ticketsadmin-rollback-e2e-[^/]+\/backups\/\.predeploy-backup\.[^/]+$/.test(
          fields.src ?? "",
        );
      assert.equal(
        expectedDataMount || expectedEvidenceMount,
        true,
        `un helper obtuvo un origen inesperado: ${mounts[0]}`,
      );
      const cidFileIndex = event.args.indexOf("--cidfile");
      assert.ok(cidFileIndex >= 0);
      assert.match(
        event.args[cidFileIndex + 1] ?? "",
        /^\/tmp\/ticketsadmin-rollback-e2e-[^/]+\/backups\/\.predeploy-backup\.[^/]+\/(?:helper|verifier)\.cid$/,
      );
      const entrypointIndex = event.args.indexOf("--entrypoint");
      assert.ok(entrypointIndex >= 0);
      assert.equal(
        event.args.filter((argument) => argument === "--entrypoint").length,
        1,
      );
      assert.ok(
        event.args[entrypointIndex + 1] === "sleep" ||
          event.args[entrypointIndex + 1] === "timeout",
      );
      assert.equal(event.args[entrypointIndex + 2], candidateBackendImageId);
      assert.equal(
        event.args.filter((argument) => argument === "--network").length,
        1,
      );
      assert.equal(
        event.args.filter((argument) => argument === "--cap-drop").length,
        1,
      );
      assert.equal(event.args[event.args.indexOf("--cap-drop") + 1], "ALL");
      assert.equal(
        event.args.filter((argument) => argument === "--security-opt").length,
        1,
      );
      assert.equal(
        event.args[event.args.indexOf("--security-opt") + 1],
        "no-new-privileges",
      );
      const normalized = event.args.map((argument, index) => {
        const previous = event.args[index - 1];
        if (previous === "--cidfile") return "<cidfile>";
        if (previous === "--mount") return "<mount>";
        return argument;
      });
      if (expectedDataMount) {
        assert.deepEqual(normalized, [
          "run",
          "--detach",
          "--rm",
          "--cidfile",
          "<cidfile>",
          "--network",
          "none",
          "--read-only",
          "--cap-drop",
          "ALL",
          "--security-opt",
          "no-new-privileges",
          "--pids-limit",
          "64",
          "--tmpfs",
          "/tmp:rw,nosuid,nodev,noexec,mode=0700,size=1g",
          "--mount",
          "<mount>",
          "--entrypoint",
          "sleep",
          candidateBackendImageId,
          "900",
        ]);
      } else {
        const verifierUid = process.getuid?.();
        const verifierGid = process.getgid?.();
        assert.notEqual(verifierUid, undefined);
        assert.notEqual(verifierGid, undefined);
        const verifierUser = `${verifierUid}:${verifierGid}`;
        assert.deepEqual(normalized, [
          "run",
          "--rm",
          "--cidfile",
          "<cidfile>",
          "--network",
          "none",
          "--read-only",
          "--user",
          verifierUser,
          "--cap-drop",
          "ALL",
          "--security-opt",
          "no-new-privileges",
          "--pids-limit",
          "64",
          "--tmpfs",
          `/tmp:rw,nosuid,nodev,noexec,mode=0700,uid=${verifierUid},gid=${verifierGid},size=128m`,
          "--mount",
          "<mount>",
          "--entrypoint",
          "timeout",
          candidateBackendImageId,
          "120",
          "node",
          "/app/dist/verify-db.mjs",
          "--source",
          "/evidence/snapshot.db",
          "--expect-evidence",
          "/evidence/evidence.json",
          "--json",
        ]);
      }
    }
    if (event.args[0] === "rm") {
      assert.equal(event.args[1], "-f");
      assert.ok(
        event.args
          .slice(2)
          .every((id) => [helperContainerId, verifierContainerId].includes(id)),
        `se intento retirar un contenedor ajeno al helper: ${event.args.join(" ")}`,
      );
    }
  }
}

function assertNoDockerMutationBeforeGate(events: CommandEvent[]): void {
  for (const event of events) {
    if (event.command !== "docker") continue;
    const [group, operation] = event.args;
    const readOnly =
      (group === "compose" && operation === "config") ||
      (group === "image" && operation === "inspect") ||
      group === "inspect" ||
      group === "ps" ||
      (group === "volume" && (operation === "ls" || operation === "inspect"));
    assert.equal(
      readOnly,
      true,
      `hubo una mutacion antes del gate: ${event.args.join(" ")}`,
    );
  }
}

function runMainScenario(
  legacyBaseline: boolean,
  options: {
    candidateSucceeds?: boolean;
    candidateReadinessFails?: boolean;
    composeDriftAfterConfigs?: number;
    corruptLedger?: boolean;
    failRuntimeRead?: boolean;
    missingCheckpoint?: boolean;
    omitComposeSecret?: boolean;
    pendingPhase?:
      | "candidate_verified"
      | "containing_first_deploy"
      | "first_deploy_contained"
      | "manual_intervention"
      | "prepared"
      | "retrying_forward"
      | "rollback_failed"
      | "rolling_back"
      | "rolling_out";
    pendingPolicy?: "first-deploy" | "fix-forward" | "rollback-compatible";
    pendingRuntime?: "baseline" | "candidate" | "candidate-unhealthy" | "mixed";
    preLedgerBaseline?: boolean;
    releaseArgs?: string[];
  } = {},
) {
  const directory = mkdtempSync(join(tmpdir(), "ticketsadmin-rollback-e2e-"));
  const binDirectory = join(directory, "bin");
  const backupDirectory = join(directory, "backups");
  const releaseStateDirectory = join(directory, "releases");
  const lockDirectory = join(directory, "locks");
  const lockFile = join(lockDirectory, "deploy.lock");
  const stateFile = join(directory, "state.json");
  const logFile = join(directory, "commands.jsonl");
  const outputFile = join(directory, "github-output");
  const composeConfigCountFile = join(directory, "compose-config-count");
  const revision = "1".repeat(40);
  const migrationTree = "7".repeat(40);
  const candidateBackend = candidateBackendImageId;
  const candidateFrontend = `sha256:${"d".repeat(64)}`;
  const baselineBackend = baselineBackendImageId;
  const baselineFrontend = baselineFrontendImageId;
  const candidateBackendRef = "ticketsadmin-backend:e2e-candidate";
  const candidateFrontendRef = "ticketsadmin-frontend:e2e-candidate";
  const imageSource = "https://github.example/acme/ticketsadmin";
  const candidateReleaseId = `git-${revision}-run-321-1`;
  const baselineRelease = {
    activatedAt: "2026-08-06T10:00:00Z",
    backendImageId: baselineBackend,
    composeContractSha256,
    dbRollbackEpoch: `drizzle-${migrationTree}`,
    frontendImageId: baselineFrontend,
    kind: "managed",
    releaseId: preLedgerBaselineRelease,
    revision: "9".repeat(40),
    runAttempt: "1",
    runId: "123",
    runtimeEpoch: "readyz-v1",
    source: imageSource,
  };
  const candidateRelease = {
    ...baselineRelease,
    activatedAt: "2026-08-06T12:00:00Z",
    backendImageId: candidateBackend,
    frontendImageId: candidateFrontend,
    releaseId: candidateReleaseId,
    revision,
    runId: "321",
  };
  const initialState: FakeState = {
    active: {
      backend: {
        configImage: legacyBaseline
          ? "ticketsadmin-backend:latest"
          : "ticketsadmin-backend:baseline-release",
        health: "healthy",
        id: "a".repeat(64),
        imageId: baselineBackend,
        service: "backend",
        startedAt: "2026-08-06T10:00:00Z",
        status: "running",
      },
      frontend: {
        configImage: legacyBaseline
          ? "ticketsadmin-frontend:latest"
          : "ticketsadmin-frontend:baseline-release",
        health: "healthy",
        id: "b".repeat(64),
        imageId: baselineFrontend,
        service: "frontend",
        startedAt: "2026-08-06T10:00:01Z",
        status: "running",
      },
    },
    dbFingerprint: "db-live-fingerprint-v1",
    phase: "baseline",
    volumeId: "volume-identity-v1",
  };

  if (
    options.pendingRuntime === "candidate" ||
    options.pendingRuntime === "candidate-unhealthy"
  ) {
    initialState.phase = "candidate-active";
    initialState.active.backend = {
      ...initialState.active.backend,
      configImage: candidateBackend,
      id: "1".repeat(64),
      imageId: candidateBackend,
      startedAt: "2026-08-06T12:00:00Z",
    };
    initialState.active.frontend = {
      ...initialState.active.frontend,
      configImage: candidateFrontend,
      id: "2".repeat(64),
      imageId: candidateFrontend,
      startedAt: "2026-08-06T12:00:01Z",
    };
    if (options.pendingRuntime === "candidate-unhealthy") {
      initialState.phase = "contained";
      initialState.active.backend.health = "unhealthy";
      initialState.active.backend.status = "exited";
      initialState.active.frontend.health = "unhealthy";
      initialState.active.frontend.status = "exited";
    }
  } else if (options.pendingRuntime === "mixed") {
    initialState.phase = "candidate-partial";
    initialState.active.backend = {
      ...initialState.active.backend,
      configImage: candidateBackend,
      id: "1".repeat(64),
      imageId: candidateBackend,
      startedAt: "2026-08-06T12:00:00Z",
    };
  }

  mkdirSync(binDirectory, { mode: 0o700 });
  mkdirSync(backupDirectory, { mode: 0o700 });
  mkdirSync(releaseStateDirectory, { mode: 0o700 });
  mkdirSync(lockDirectory, { mode: 0o700 });
  writeFileSync(lockFile, "", { mode: 0o600 });
  writeFileSync(stateFile, JSON.stringify(initialState), { mode: 0o600 });
  writeFileSync(logFile, "", { mode: 0o600 });
  writeFileSync(outputFile, "", { mode: 0o600 });
  const ledgerPath = join(releaseStateDirectory, "release-state.json");
  const pendingSnapshotName = "tickets-predeploy-pending.db";
  const pendingManifestName = "tickets-predeploy-pending.manifest.json";
  let pendingManifestSha256 = "8".repeat(64);
  if (
    options.pendingRuntime &&
    options.pendingPolicy !== "first-deploy" &&
    !options.missingCheckpoint
  ) {
    const pendingManifestContents = JSON.stringify({
      baseline: {
        backend: { imageId: baselineBackend },
        frontend: { imageId: baselineFrontend },
      },
      candidate: {
        backendImageId: candidateBackend,
        frontendImageId: candidateFrontend,
      },
      complete: true,
      contract: "ticketsadmin.predeploy-checkpoint",
      contractVersion: 1,
      dataVolume: { name: "ticketsadmin_tickets_data" },
      repository: "acme/ticketsadmin",
      snapshot: { file: pendingSnapshotName, sha256: databaseSha256 },
    });
    pendingManifestSha256 = createHash("sha256")
      .update(pendingManifestContents)
      .digest("hex");
    writeFileSync(join(backupDirectory, pendingSnapshotName), databaseBytes, {
      mode: 0o600,
    });
    writeFileSync(
      join(backupDirectory, pendingManifestName),
      pendingManifestContents,
      { mode: 0o600 },
    );
  }
  if (options.corruptLedger) {
    writeFileSync(ledgerPath, '{"contract":', { mode: 0o600 });
  } else if (options.pendingRuntime) {
    writeFileSync(
      ledgerPath,
      JSON.stringify({
        contract: "ticketsadmin.application-release-state",
        contractVersion: 1,
        current:
          options.pendingPolicy === "first-deploy" ? null : baselineRelease,
        dataVolume: "ticketsadmin_tickets_data",
        generation: 7,
        lastAttempt: null,
        pending: {
          attemptId: candidateReleaseId,
          baseline:
            options.pendingPolicy === "first-deploy" ? null : baselineRelease,
          candidate: candidateRelease,
          checkpoint:
            options.pendingPolicy === "first-deploy"
              ? null
              : {
                  manifest: pendingManifestName,
                  manifestSha256: pendingManifestSha256,
                },
          failure: null,
          phase: options.pendingPhase ?? "rolling_out",
          policy: options.pendingPolicy ?? "rollback-compatible",
          startedAt: "2026-08-06T12:00:00Z",
          updatedAt: "2026-08-06T12:00:00Z",
        },
        previous: null,
        project: "ticketsadmin",
        repository: "acme/ticketsadmin",
        updatedAt: "2026-08-06T12:00:00Z",
      }),
      { mode: 0o600 },
    );
  }

  for (const command of ["docker", "git", "curl"]) {
    const commandPath = join(binDirectory, command);
    writeFileSync(commandPath, fakeCommand, { mode: 0o700 });
    chmodSync(commandPath, 0o700);
  }

  const result = spawnSync(
    "bash",
    [
      releasePath,
      "--backend-image-id",
      candidateBackend,
      "--frontend-image-id",
      candidateFrontend,
      "--backend-image-ref",
      candidateBackendRef,
      "--frontend-image-ref",
      candidateFrontendRef,
      "--revision",
      revision,
      "--image-source",
      imageSource,
      "--run-id",
      "321",
      "--run-attempt",
      "1",
      "--repository",
      "acme/ticketsadmin",
      "--backup-dir",
      backupDirectory,
      "--state-dir",
      releaseStateDirectory,
      "--lock-file",
      lockFile,
      ...(options.releaseArgs ?? []),
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
        GITHUB_OUTPUT: outputFile,
        FAKE_STATE_FILE: stateFile,
        FAKE_LOG_FILE: logFile,
        FAKE_REVISION: revision,
        FAKE_MIGRATION_TREE: migrationTree,
        FAKE_IMAGE_SOURCE: imageSource,
        FAKE_RELEASE_ID: candidateReleaseId,
        FAKE_COMPOSE_CONTRACT: canonicalComposeContract,
        FAKE_COMPOSE_CONTRACT_SHA: composeContractSha256,
        FAKE_COMPOSE_CONFIG_COUNT_FILE: composeConfigCountFile,
        FAKE_COMPOSE_DRIFT_AFTER_CONFIGS: String(
          options.composeDriftAfterConfigs ?? 0,
        ),
        FAKE_DB_BASE64: databaseBytes.toString("base64"),
        FAKE_DB_SHA: databaseSha256,
        FAKE_LEGACY_BASELINE: String(legacyBaseline),
        FAKE_PRE_LEDGER_BASELINE: String(options.preLedgerBaseline ?? false),
        FAKE_OMIT_COMPOSE_SECRET: String(options.omitComposeSecret ?? false),
        FAKE_CANDIDATE_SUCCEEDS: String(options.candidateSucceeds ?? false),
        FAKE_CANDIDATE_READINESS_FAILS: String(
          options.candidateReadinessFails ?? false,
        ),
        FAKE_FAIL_RUNTIME_READ: String(options.failRuntimeRead ?? false),
        FAKE_CANDIDATE_BACKEND: candidateBackend,
        FAKE_CANDIDATE_FRONTEND: candidateFrontend,
        FAKE_CANDIDATE_BACKEND_REF: candidateBackendRef,
        FAKE_CANDIDATE_FRONTEND_REF: candidateFrontendRef,
        FAKE_BASELINE_BACKEND: baselineBackend,
        FAKE_BASELINE_FRONTEND: baselineFrontend,
        ADMIN_API_KEY: secretSentinels[0],
        WEBHOOK_API_KEY: secretSentinels[1],
        BOOTSTRAP_SYSADMIN_PASSWORD: secretSentinels[2],
      },
    },
  );

  const events = parseEvents(logFile);
  const outputContents = readFileSync(outputFile, "utf8");
  const publishedContents = readdirSync(backupDirectory).map((name) =>
    readFileSync(join(backupDirectory, name)).toString("utf8"),
  );
  const observable = [
    result.stdout,
    result.stderr,
    readFileSync(logFile, "utf8"),
    outputContents,
    existsSync(ledgerPath) ? readFileSync(ledgerPath, "utf8") : "",
    ...publishedContents,
  ].join("\n");
  for (const secret of secretSentinels) {
    assert.equal(
      observable.includes(secret),
      false,
      "el release filtro un sentinel secreto",
    );
  }

  return {
    backupDirectory,
    baselineBackend,
    baselineFrontend,
    candidateBackend,
    candidateFrontend,
    candidateReleaseId,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
    events,
    finalState: JSON.parse(readFileSync(stateFile, "utf8")) as FakeState,
    initialState,
    releaseLedger:
      existsSync(ledgerPath) && !options.corruptLedger
        ? JSON.parse(readFileSync(ledgerPath, "utf8"))
        : null,
    outputs: parseOutputs(outputContents),
    result,
  };
}

test(
  "main preserva el checkpoint y revierte un rollout parcialmente reemplazado",
  { skip: process.platform === "win32" },
  () => {
    const scenario = runMainScenario(false);
    try {
      assert.equal(scenario.result.status, 1, scenario.result.stderr);
      const composeUps = scenario.events.filter(isComposeUp);
      assert.equal(
        composeUps.length,
        2,
        `${scenario.result.stderr}\n${JSON.stringify(scenario.events, null, 2)}`,
      );
      assert.deepEqual(
        [composeUps[0]?.backendImage, composeUps[0]?.frontendImage],
        [scenario.candidateBackend, scenario.candidateFrontend],
      );
      assert.deepEqual(
        [composeUps[1]?.backendImage, composeUps[1]?.frontendImage],
        [scenario.baselineBackend, scenario.baselineFrontend],
      );

      assert.equal(scenario.finalState.phase, "rolled-back");
      assert.equal(
        scenario.finalState.active.backend.imageId,
        scenario.baselineBackend,
      );
      assert.equal(
        scenario.finalState.active.frontend.imageId,
        scenario.baselineFrontend,
      );
      assert.equal(
        scenario.finalState.dbFingerprint,
        scenario.initialState.dbFingerprint,
      );
      assert.equal(
        scenario.finalState.volumeId,
        scenario.initialState.volumeId,
      );
      assert.equal(scenario.outputs.rollback_attempted, "true");
      assert.equal(scenario.outputs.rollback_status, "succeeded");
      assert.equal(scenario.outputs.failure_phase, "candidate-compose-up");
      assert.equal(scenario.outputs.deployed, undefined);

      const published = readdirSync(scenario.backupDirectory).filter(
        (name) => !name.startsWith(".predeploy-backup."),
      );
      const snapshots = published.filter((name) => name.endsWith(".db"));
      const manifests = published.filter((name) =>
        name.endsWith(".manifest.json"),
      );
      assert.equal(snapshots.length, 1);
      assert.equal(manifests.length, 1);
      assert.deepEqual(
        readFileSync(join(scenario.backupDirectory, snapshots[0]!)),
        databaseBytes,
      );
      const manifest = JSON.parse(
        readFileSync(join(scenario.backupDirectory, manifests[0]!), "utf8"),
      ) as { complete?: boolean; snapshot?: { sha256?: string } };
      assert.equal(manifest.complete, true);
      assert.equal(manifest.snapshot?.sha256, databaseSha256);
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "main completa un upgrade existente solo despues de publicar el checkpoint",
  { skip: process.platform === "win32" },
  () => {
    const scenario = runMainScenario(false, { candidateSucceeds: true });
    try {
      assert.equal(
        scenario.result.status,
        0,
        `${scenario.result.stderr}\n${scenario.result.stdout}\n${JSON.stringify(scenario.events, null, 2)}`,
      );
      const composeUps = scenario.events.filter(isComposeUp);
      assert.equal(composeUps.length, 1);
      assert.deepEqual(
        [composeUps[0]?.backendImage, composeUps[0]?.frontendImage],
        [scenario.candidateBackend, scenario.candidateFrontend],
      );
      assert.equal(scenario.finalState.phase, "candidate-active");
      assert.equal(
        scenario.finalState.active.backend.imageId,
        scenario.candidateBackend,
      );
      assert.equal(
        scenario.finalState.active.frontend.imageId,
        scenario.candidateFrontend,
      );
      assert.equal(
        scenario.finalState.dbFingerprint,
        scenario.initialState.dbFingerprint,
      );
      assert.equal(
        scenario.finalState.volumeId,
        scenario.initialState.volumeId,
      );
      assert.equal(scenario.outputs.deployed, "true");
      assert.equal(scenario.outputs.rollback_attempted, "false");
      assert.equal(scenario.outputs.rollback_status, "not-needed");
      assert.equal(scenario.outputs.rollback_eligible, "true");
      const curlUrls = scenario.events
        .filter((event) => event.command === "curl")
        .map((event) => event.args.at(-1));
      assert.equal(
        curlUrls.some((url) => url?.endsWith("/api/healthz")),
        false,
        "un baseline administrado o la candidata no deben usar healthz",
      );
      assert.ok(
        curlUrls.some((url) => url?.endsWith("/api/readyz")),
        "el baseline administrado y la candidata deben exigir readyz",
      );
      const published = readdirSync(scenario.backupDirectory);
      assert.equal(published.filter((name) => name.endsWith(".db")).length, 1);
      assert.equal(
        published.filter((name) => name.endsWith(".manifest.json")).length,
        1,
      );
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "main rechaza un baseline legacy sin autorizacion antes de compose up",
  { skip: process.platform === "win32" },
  () => {
    const scenario = runMainScenario(true);
    try {
      assert.equal(scenario.result.status, 1);
      assert.equal(scenario.events.filter(isComposeUp).length, 0);
      assert.equal(scenario.finalState.phase, "baseline");
      assert.equal(
        scenario.finalState.dbFingerprint,
        scenario.initialState.dbFingerprint,
      );
      assert.equal(
        scenario.finalState.volumeId,
        scenario.initialState.volumeId,
      );
      assert.deepEqual(readdirSync(scenario.backupDirectory), []);
      assert.equal(
        scenario.events.filter((event) => event.command === "curl").length,
        0,
        "la adopcion legacy no autorizada debe fallar antes de sus smokes",
      );
      assert.match(
        scenario.result.stderr,
        /transicion requiere autorizacion explicita/,
      );
      assertNoDockerMutationBeforeGate(scenario.events);
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "main permite adoptar el baseline pre-ledger solo con fix-forward ligado a su release",
  { skip: process.platform === "win32" },
  () => {
    const scenario = runMainScenario(false, {
      preLedgerBaseline: true,
      releaseArgs: [
        "--allow-fix-forward-transition",
        "--expected-baseline-release",
        preLedgerBaselineRelease,
        "--expected-baseline-backend-image-id",
        baselineBackendImageId,
        "--expected-baseline-frontend-image-id",
        baselineFrontendImageId,
      ],
    });
    try {
      assert.equal(scenario.result.status, 1, scenario.result.stderr);
      const composeUps = scenario.events.filter(isComposeUp);
      assert.equal(composeUps.length, 1);
      assert.deepEqual(
        [composeUps[0]?.backendImage, composeUps[0]?.frontendImage],
        [scenario.candidateBackend, scenario.candidateFrontend],
      );
      assert.equal(scenario.finalState.phase, "candidate-partial");
      assert.equal(scenario.outputs.rollback_attempted, "false");
      assert.equal(scenario.outputs.rollback_status, "ineligible-baseline");
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "main permite la adopcion legacy solo cuando la ejecucion nombra el baseline exacto",
  { skip: process.platform === "win32" },
  () => {
    const scenario = runMainScenario(true, {
      releaseArgs: [
        "--allow-legacy-adoption",
        "--expected-baseline-release",
        "legacy-unversioned-adoption",
        "--expected-baseline-backend-image-id",
        baselineBackendImageId,
        "--expected-baseline-frontend-image-id",
        baselineFrontendImageId,
      ],
    });
    try {
      assert.equal(scenario.result.status, 1, scenario.result.stderr);
      assert.equal(scenario.events.filter(isComposeUp).length, 1);
      assert.equal(scenario.finalState.phase, "candidate-partial");
      assert.equal(scenario.outputs.rollback_attempted, "false");
      assert.equal(scenario.outputs.rollback_status, "ineligible-baseline");
      const baselineCurlUrls = scenario.events
        .filter(
          (event) => event.command === "curl" && event.phase === "baseline",
        )
        .map((event) => event.args.at(-1));
      assert.deepEqual(baselineCurlUrls, [
        "http://127.0.0.1:5000/api/healthz",
        "http://127.0.0.1:3000/",
        "http://127.0.0.1:3000/api/healthz",
      ]);
      const backupIndex = scenario.events.findIndex(
        (event) =>
          event.command === "docker" &&
          event.args[0] === "exec" &&
          event.args.includes("/app/dist/backup-db.mjs"),
      );
      const composeUpIndex = scenario.events.findIndex(isComposeUp);
      assert.ok(backupIndex >= 0 && composeUpIndex > backupIndex);
      const published = readdirSync(scenario.backupDirectory);
      assert.equal(published.filter((name) => name.endsWith(".db")).length, 1);
      assert.equal(
        published.filter((name) => name.endsWith(".manifest.json")).length,
        1,
      );
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "la candidata nunca cae a healthz si su readyz falla tras adoptar legacy",
  { skip: process.platform === "win32" },
  () => {
    const scenario = runMainScenario(true, {
      candidateReadinessFails: true,
      candidateSucceeds: true,
      releaseArgs: [
        "--allow-legacy-adoption",
        "--expected-baseline-release",
        "legacy-unversioned-adoption",
        "--expected-baseline-backend-image-id",
        baselineBackendImageId,
        "--expected-baseline-frontend-image-id",
        baselineFrontendImageId,
      ],
    });
    try {
      assert.equal(scenario.result.status, 1);
      assert.match(
        scenario.result.stderr,
        /readiness directa del backend fallo/,
      );
      const candidateCurlUrls = scenario.events
        .filter(
          (event) =>
            event.command === "curl" && event.phase === "candidate-active",
        )
        .map((event) => event.args.at(-1));
      assert.deepEqual(candidateCurlUrls, ["http://127.0.0.1:5000/api/readyz"]);
      assert.equal(scenario.events.filter(isComposeUp).length, 1);
      assert.equal(scenario.outputs.rollback_attempted, "false");
      assert.equal(scenario.outputs.rollback_status, "ineligible-baseline");
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "main rechaza la adopcion legacy ligada a otro ID de imagen",
  { skip: process.platform === "win32" },
  () => {
    const scenario = runMainScenario(true, {
      releaseArgs: [
        "--allow-legacy-adoption",
        "--expected-baseline-release",
        "legacy-unversioned-adoption",
        "--expected-baseline-backend-image-id",
        `sha256:${"0".repeat(64)}`,
        "--expected-baseline-frontend-image-id",
        baselineFrontendImageId,
      ],
    });
    try {
      assert.equal(scenario.result.status, 1);
      assert.equal(scenario.events.filter(isComposeUp).length, 0);
      assert.equal(scenario.finalState.phase, "baseline");
      assert.deepEqual(readdirSync(scenario.backupDirectory), []);
      assert.match(
        scenario.result.stderr,
        /no coincide con el baseline autorizado/,
      );
      assertNoDockerMutationBeforeGate(scenario.events);
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "main rechaza un fix-forward ligado a otro baseline antes del checkpoint",
  { skip: process.platform === "win32" },
  () => {
    const scenario = runMainScenario(false, {
      preLedgerBaseline: true,
      releaseArgs: [
        "--allow-fix-forward-transition",
        "--expected-baseline-release",
        "git-0000000000000000000000000000000000000000-run-999-1",
        "--expected-baseline-backend-image-id",
        baselineBackendImageId,
        "--expected-baseline-frontend-image-id",
        baselineFrontendImageId,
      ],
    });
    try {
      assert.equal(scenario.result.status, 1);
      assert.equal(scenario.events.filter(isComposeUp).length, 0);
      assert.equal(scenario.finalState.phase, "baseline");
      assert.deepEqual(readdirSync(scenario.backupDirectory), []);
      assert.match(
        scenario.result.stderr,
        /no coincide con el baseline autorizado/,
      );
      assertNoDockerMutationBeforeGate(scenario.events);
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "main rechaza un contrato Compose que omite una credencial antes de mutar",
  { skip: process.platform === "win32" },
  () => {
    const scenario = runMainScenario(false, { omitComposeSecret: true });
    try {
      assert.equal(scenario.result.status, 1);
      assert.equal(scenario.events.filter(isComposeUp).length, 0);
      assert.equal(scenario.finalState.phase, "baseline");
      assert.deepEqual(readdirSync(scenario.backupDirectory), []);
      assert.match(
        scenario.result.stderr,
        /Compose omitio el contrato de secretos del backend/,
      );
      assertNoDockerMutationBeforeGate(scenario.events);
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "reconcilia una candidata exacta y exige rerun sin desplegar otra version",
  { skip: process.platform === "win32" },
  () => {
    const scenario = runMainScenario(false, { pendingRuntime: "candidate" });
    try {
      assert.equal(scenario.result.status, 75, scenario.result.stderr);
      assert.equal(scenario.events.filter(isComposeUp).length, 0);
      assert.equal(scenario.finalState.phase, "candidate-active");
      assert.equal(
        scenario.releaseLedger.current.backendImageId,
        scenario.candidateBackend,
      );
      assert.equal(scenario.releaseLedger.pending, null);
      assert.equal(scenario.releaseLedger.lastAttempt.status, "deployed");
      assert.equal(scenario.outputs.recovery_detected, "true");
      assert.equal(scenario.outputs.recovery_action, "promote-candidate");
      assert.equal(scenario.outputs.recovery_status, "succeeded");
      assert.equal(scenario.outputs.deployed, undefined);
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "reconcilia una topologia mixta con rollback exacto y sin restaurar datos",
  { skip: process.platform === "win32" },
  () => {
    const scenario = runMainScenario(false, { pendingRuntime: "mixed" });
    try {
      assert.equal(scenario.result.status, 75, scenario.result.stderr);
      const composeUps = scenario.events.filter(isComposeUp);
      assert.equal(composeUps.length, 1);
      assert.deepEqual(
        [composeUps[0]?.backendImage, composeUps[0]?.frontendImage],
        [scenario.baselineBackend, scenario.baselineFrontend],
      );
      assert.equal(scenario.finalState.phase, "rolled-back");
      assert.equal(
        scenario.finalState.dbFingerprint,
        scenario.initialState.dbFingerprint,
      );
      assert.equal(
        scenario.finalState.volumeId,
        scenario.initialState.volumeId,
      );
      assert.equal(
        scenario.releaseLedger.current.backendImageId,
        scenario.baselineBackend,
      );
      assert.equal(scenario.releaseLedger.pending, null);
      assert.equal(scenario.releaseLedger.lastAttempt.status, "rolled_back");
      assert.equal(scenario.outputs.recovery_action, "rollback-baseline");
      assert.equal(scenario.outputs.recovery_status, "succeeded");
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "cierra un pending cuyo baseline sigue exacto sin ejecutar Compose",
  { skip: process.platform === "win32" },
  () => {
    const scenario = runMainScenario(false, { pendingRuntime: "baseline" });
    try {
      assert.equal(scenario.result.status, 75, scenario.result.stderr);
      assert.equal(scenario.events.filter(isComposeUp).length, 0);
      assert.equal(scenario.finalState.phase, "baseline");
      assert.equal(scenario.releaseLedger.pending, null);
      assert.equal(scenario.releaseLedger.lastAttempt.status, "aborted");
      assert.equal(scenario.outputs.recovery_action, "rollback-baseline");
      assert.equal(scenario.outputs.deployed, undefined);
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "un ledger corrupto falla cerrado antes de cualquier mutacion Docker",
  { skip: process.platform === "win32" },
  () => {
    const scenario = runMainScenario(false, { corruptLedger: true });
    try {
      assert.equal(scenario.result.status, 1);
      assert.equal(scenario.events.filter(isComposeUp).length, 0);
      assert.deepEqual(readdirSync(scenario.backupDirectory), []);
      assert.match(scenario.result.stderr, /ledger durable no pudo validarse/);
      assertNoDockerMutationBeforeGate(scenario.events);
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "respeta rolling_back aunque la candidata haya vuelto a estar healthy",
  { skip: process.platform === "win32" },
  () => {
    const scenario = runMainScenario(false, {
      pendingPhase: "rolling_back",
      pendingRuntime: "candidate",
    });
    try {
      assert.equal(scenario.result.status, 75, scenario.result.stderr);
      const composeUps = scenario.events.filter(isComposeUp);
      assert.equal(composeUps.length, 1);
      assert.deepEqual(
        [composeUps[0]?.backendImage, composeUps[0]?.frontendImage],
        [scenario.baselineBackend, scenario.baselineFrontend],
      );
      assert.equal(scenario.releaseLedger.pending, null);
      assert.equal(scenario.releaseLedger.lastAttempt.status, "rolled_back");
      assert.equal(scenario.outputs.recovery_action, "rollback-baseline");
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "un runtime mutado mientras pending seguia prepared falla cerrado",
  { skip: process.platform === "win32" },
  () => {
    const scenario = runMainScenario(false, {
      pendingPhase: "prepared",
      pendingRuntime: "candidate",
    });
    try {
      assert.equal(scenario.result.status, 1);
      assert.equal(scenario.events.filter(isComposeUp).length, 0);
      assert.equal(scenario.releaseLedger.pending.phase, "manual_intervention");
      assert.equal(
        scenario.releaseLedger.pending.failure.code,
        "state_mismatch",
      );
      assert.equal(scenario.outputs.recovery_action, "fail-closed");
      assert.match(scenario.result.stderr, /runtime cambio antes/);
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "reanuda idempotentemente una contencion interrumpida del primer deploy",
  { skip: process.platform === "win32" },
  () => {
    const scenario = runMainScenario(false, {
      pendingPhase: "containing_first_deploy",
      pendingPolicy: "first-deploy",
      pendingRuntime: "candidate-unhealthy",
    });
    try {
      assert.equal(scenario.result.status, 1);
      assert.equal(scenario.events.filter(isComposeUp).length, 0);
      const stops = scenario.events.filter(
        ({ command, args }) => command === "docker" && args[0] === "stop",
      );
      assert.equal(stops.length, 1);
      assert.equal(scenario.finalState.phase, "contained");
      assert.equal(
        scenario.finalState.dbFingerprint,
        scenario.initialState.dbFingerprint,
      );
      assert.equal(
        scenario.finalState.volumeId,
        scenario.initialState.volumeId,
      );
      assert.equal(scenario.releaseLedger.current, null);
      assert.equal(
        scenario.releaseLedger.pending.phase,
        "first_deploy_contained",
      );
      assert.equal(scenario.outputs.recovery_action, "contain-first-deploy");
      assert.equal(scenario.outputs.recovery_status, "manual-required");
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "rechaza una reanudacion solicitada si el ledger no existe",
  { skip: process.platform === "win32" },
  () => {
    const attempt = `git-${"1".repeat(40)}-run-321-1`;
    const scenario = runMainScenario(false, {
      releaseArgs: [
        "--resume-pending-attempt",
        attempt,
        "--expected-state-generation",
        "7",
      ],
    });
    try {
      assert.equal(scenario.result.status, 1);
      assert.equal(scenario.releaseLedger, null);
      assert.equal(scenario.events.filter(isComposeUp).length, 0);
      assert.equal(readdirSync(scenario.backupDirectory).length, 0);
      assert.match(scenario.result.stderr, /ledger inexistente/);
      assertNoDockerMutationBeforeGate(scenario.events);
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "una autorizacion exacta cierra un primer deploy terminal ya saludable",
  { skip: process.platform === "win32" },
  () => {
    const attempt = `git-${"1".repeat(40)}-run-321-1`;
    const scenario = runMainScenario(false, {
      pendingPhase: "first_deploy_contained",
      pendingPolicy: "first-deploy",
      pendingRuntime: "candidate",
      releaseArgs: [
        "--resume-pending-attempt",
        attempt,
        "--expected-state-generation",
        "7",
      ],
    });
    try {
      assert.equal(scenario.candidateReleaseId, attempt);
      assert.equal(scenario.result.status, 75, scenario.result.stderr);
      assert.equal(scenario.events.filter(isComposeUp).length, 0);
      assert.equal(scenario.releaseLedger.pending, null);
      assert.equal(scenario.releaseLedger.current.releaseId, attempt);
      assert.equal(scenario.releaseLedger.lastAttempt.status, "deployed");
      assert.equal(scenario.outputs.recovery_action, "promote-candidate");
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "una generacion de reanudacion obsoleta no muta Docker ni el ledger",
  { skip: process.platform === "win32" },
  () => {
    const attempt = `git-${"1".repeat(40)}-run-321-1`;
    const scenario = runMainScenario(false, {
      pendingPhase: "manual_intervention",
      pendingRuntime: "candidate",
      releaseArgs: [
        "--resume-pending-attempt",
        attempt,
        "--expected-state-generation",
        "6",
      ],
    });
    try {
      assert.equal(scenario.result.status, 1);
      assert.equal(scenario.events.filter(isComposeUp).length, 0);
      assert.equal(scenario.releaseLedger.generation, 7);
      assert.equal(scenario.releaseLedger.pending.phase, "manual_intervention");
      assert.match(scenario.result.stderr, /no coincide con el ledger actual/);
      assertNoDockerMutationBeforeGate(scenario.events);
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "la reanudacion fix-forward reintenta solo la candidata registrada",
  { skip: process.platform === "win32" },
  () => {
    const attempt = `git-${"1".repeat(40)}-run-321-1`;
    const scenario = runMainScenario(false, {
      candidateSucceeds: true,
      pendingPhase: "manual_intervention",
      pendingPolicy: "fix-forward",
      pendingRuntime: "candidate-unhealthy",
      releaseArgs: [
        "--resume-pending-attempt",
        attempt,
        "--expected-state-generation",
        "7",
      ],
    });
    try {
      assert.equal(scenario.result.status, 75, scenario.result.stderr);
      const composeUps = scenario.events.filter(isComposeUp);
      assert.equal(composeUps.length, 1);
      assert.deepEqual(
        [composeUps[0]?.backendImage, composeUps[0]?.frontendImage],
        [scenario.candidateBackend, scenario.candidateFrontend],
      );
      assert.equal(scenario.releaseLedger.pending, null);
      assert.equal(scenario.releaseLedger.current.releaseId, attempt);
      assert.equal(scenario.releaseLedger.lastAttempt.status, "deployed");
      assert.equal(scenario.outputs.recovery_action, "promote-candidate");
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "una reanudacion fix-forward no acepta el baseline incompatible aunque este saludable",
  { skip: process.platform === "win32" },
  () => {
    const attempt = `git-${"1".repeat(40)}-run-321-1`;
    const scenario = runMainScenario(false, {
      candidateSucceeds: true,
      pendingPhase: "manual_intervention",
      pendingPolicy: "fix-forward",
      pendingRuntime: "baseline",
      releaseArgs: [
        "--resume-pending-attempt",
        attempt,
        "--expected-state-generation",
        "7",
      ],
    });
    try {
      assert.equal(scenario.result.status, 75, scenario.result.stderr);
      const composeUps = scenario.events.filter(isComposeUp);
      assert.equal(composeUps.length, 1);
      assert.deepEqual(
        [composeUps[0]?.backendImage, composeUps[0]?.frontendImage],
        [scenario.candidateBackend, scenario.candidateFrontend],
      );
      assert.equal(scenario.releaseLedger.pending, null);
      assert.equal(scenario.releaseLedger.current.releaseId, attempt);
      assert.equal(scenario.releaseLedger.lastAttempt.status, "deployed");
      assert.equal(scenario.outputs.recovery_action, "promote-candidate");
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "un retry detecta drift de Compose despues de registrar retrying_forward",
  { skip: process.platform === "win32" },
  () => {
    const attempt = `git-${"1".repeat(40)}-run-321-1`;
    const scenario = runMainScenario(false, {
      candidateSucceeds: true,
      composeDriftAfterConfigs: 2,
      pendingPhase: "manual_intervention",
      pendingPolicy: "fix-forward",
      pendingRuntime: "candidate-unhealthy",
      releaseArgs: [
        "--resume-pending-attempt",
        attempt,
        "--expected-state-generation",
        "7",
      ],
    });
    try {
      assert.equal(scenario.result.status, 1);
      assert.equal(scenario.events.filter(isComposeUp).length, 0);
      assert.equal(scenario.releaseLedger.generation, 8);
      assert.equal(scenario.releaseLedger.pending.phase, "retrying_forward");
      assert.match(scenario.result.stderr, /contrato Compose cambio/);
      assertNoDockerMutationBeforeGate(scenario.events);
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "un retry forward interrumpido vuelve a la candidata y nunca acepta el baseline",
  { skip: process.platform === "win32" },
  () => {
    const attempt = `git-${"1".repeat(40)}-run-321-1`;
    const scenario = runMainScenario(false, {
      candidateSucceeds: true,
      pendingPhase: "retrying_forward",
      pendingPolicy: "fix-forward",
      pendingRuntime: "baseline",
    });
    try {
      assert.equal(scenario.result.status, 75, scenario.result.stderr);
      const composeUps = scenario.events.filter(isComposeUp);
      assert.equal(composeUps.length, 1);
      assert.deepEqual(
        [composeUps[0]?.backendImage, composeUps[0]?.frontendImage],
        [scenario.candidateBackend, scenario.candidateFrontend],
      );
      assert.equal(scenario.releaseLedger.pending, null);
      assert.equal(scenario.releaseLedger.current.releaseId, attempt);
      assert.equal(scenario.releaseLedger.lastAttempt.status, "deployed");
      assert.equal(scenario.outputs.recovery_from_phase, "retrying_forward");
      assert.equal(scenario.outputs.recovery_action, "promote-candidate");
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "un baseline exacto cierra pending aunque el checkpoint inactivo se haya perdido",
  { skip: process.platform === "win32" },
  () => {
    const scenario = runMainScenario(false, {
      missingCheckpoint: true,
      pendingRuntime: "baseline",
    });
    try {
      assert.equal(scenario.result.status, 75, scenario.result.stderr);
      assert.equal(scenario.events.filter(isComposeUp).length, 0);
      assert.equal(scenario.releaseLedger.pending, null);
      assert.equal(scenario.releaseLedger.lastAttempt.status, "aborted");
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "no promociona una candidata si desaparecio su checkpoint registrado",
  { skip: process.platform === "win32" },
  () => {
    const scenario = runMainScenario(false, {
      missingCheckpoint: true,
      pendingRuntime: "candidate",
    });
    try {
      assert.equal(scenario.result.status, 1);
      assert.equal(scenario.events.filter(isComposeUp).length, 0);
      assert.equal(scenario.releaseLedger.generation, 7);
      assert.equal(scenario.releaseLedger.pending.phase, "rolling_out");
      assert.match(scenario.result.stderr, /falta el manifiesto del pending/);
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "un fallo de lectura del runtime no convierte pending en estado terminal",
  { skip: process.platform === "win32" },
  () => {
    const scenario = runMainScenario(false, {
      failRuntimeRead: true,
      pendingRuntime: "candidate",
    });
    try {
      assert.equal(scenario.result.status, 1);
      assert.equal(scenario.events.filter(isComposeUp).length, 0);
      assert.equal(scenario.releaseLedger.generation, 7);
      assert.equal(scenario.releaseLedger.pending.phase, "rolling_out");
      assert.equal(scenario.releaseLedger.pending.failure, null);
      assert.doesNotMatch(scenario.result.stderr, /manual_intervention/);
      assertNoDockerMutationBeforeGate(scenario.events);
      assertNoDataRollbackOrBroadTeardown(scenario.events);
    } finally {
      scenario.cleanup();
    }
  },
);
