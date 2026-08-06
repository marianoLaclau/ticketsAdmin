import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const releasePath = fileURLToPath(
  new URL("../deploy/deploy-release.sh", import.meta.url),
);

const fakeCommand = String.raw`#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const command = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const state = process.env.FAKE_STATE_FILE;
const log = process.env.FAKE_LOG_FILE;
const backendImage = process.env.FAKE_BACKEND_IMAGE_ID;
const frontendImage = process.env.FAKE_FRONTEND_IMAGE_ID;
const backendRef = process.env.FAKE_BACKEND_IMAGE_REF;
const frontendRef = process.env.FAKE_FRONTEND_IMAGE_REF;
const revision = process.env.FAKE_REVISION;
const migrationTree = process.env.FAKE_MIGRATION_TREE;
const source = process.env.FAKE_IMAGE_SOURCE;
const releaseId = process.env.FAKE_RELEASE_ID;
const composeContract = process.env.FAKE_COMPOSE_CONTRACT;
const volume = "ticketsadmin_tickets_data";
const backendContainer = "a".repeat(64);
const frontendContainer = "b".repeat(64);

fs.appendFileSync(log, JSON.stringify({
  command,
  args,
  backendImage: process.env.TICKETSADMIN_BACKEND_IMAGE || null,
  frontendImage: process.env.TICKETSADMIN_FRONTEND_IMAGE || null,
}) + "\n");
const deployed = () => fs.existsSync(state);
const output = (value) => process.stdout.write(String(value) + "\n");
const fail = (message) => {
  process.stderr.write(message + "\n");
  process.exit(1);
};
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? "" : args[index + 1];
};

if (command === "git") {
  if (args[0] === "fetch") process.exit(0);
  if (args[0] === "rev-parse") {
    output(args[1] === "HEAD:lib/db/drizzle" ? migrationTree : revision);
  }
  else fail("fake git: unsupported command");
  process.exit(0);
}

if (command === "curl") {
  const url = args[args.length - 1];
  if (url === "http://127.0.0.1:3000/") output('<div id="root"></div>');
  else if (url.endsWith("/api/readyz")) output('{"status":"ready"}');
  else fail("fake curl: unsupported URL");
  process.exit(0);
}

if (command === "jq") {
  const input = fs.readFileSync(0, "utf8");
  const query = args
    .find((argument) => {
      const normalized = argument.trim();
      return normalized.startsWith(".")
        || normalized.startsWith("(")
        || normalized.startsWith("del(")
        || normalized.includes("$data_mounts");
    })
    ?.trim();
  const parsed = JSON.parse(input);
  if (query === ".name") output(parsed.name);
  else if (query === ".volumes.tickets_data.name") output(parsed.volumes.tickets_data.name);
  else if (query && query.includes('has("WEBHOOK_API_KEY")')) {
    const environment = parsed.services?.backend?.environment;
    process.exit(
      environment
        && Object.hasOwn(environment, "WEBHOOK_API_KEY")
        && Object.hasOwn(environment, "ADMIN_API_KEY")
        && Object.hasOwn(environment, "BOOTSTRAP_SYSADMIN_PASSWORD")
        ? 0
        : 1,
    );
  } else if (query && query.startsWith("del(")) {
    for (const service of Object.values(parsed.services || {})) {
      delete service.image;
      delete service.build;
    }
    const environment = parsed.services.backend.environment;
    environment.WEBHOOK_API_KEY = "redacted";
    environment.ADMIN_API_KEY = "redacted";
    environment.BOOTSTRAP_SYSADMIN_PASSWORD = "redacted";
    const stable = (value) => {
      if (Array.isArray(value)) return value.map(stable);
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.keys(value).sort().map((key) => [key, stable(value[key])]),
        );
      }
      return value;
    };
    output(JSON.stringify(stable(parsed)));
  }
  else if (query && query.includes("$data_mounts")) {
    const volumeIndex = args.indexOf("data_volume");
    const expectedVolume = args[volumeIndex + 1];
    const mounts = parsed.filter((mount) => mount.Destination === "/data");
    process.exit(
      mounts.length === 1
        && mounts[0].Type === "volume"
        && mounts[0].RW === true
        && mounts[0].Name === expectedVolume
        ? 0
        : 1,
    );
  } else fail("fake jq: unsupported query");
  process.exit(0);
}

if (command !== "docker") fail("unsupported fake command");

if (args[0] === "image" && args[1] === "inspect") {
  const format = option("--format");
  const target = args[args.length - 1];
  const image = target === backendRef || target === backendImage
    ? backendImage
    : target === frontendRef || target === frontendImage
      ? frontendImage
      : "";
  if (!image) fail("unknown image");
  if (format === "{{.Id}}") output(image);
  else if (format.includes("org.opencontainers.image.revision")) output(revision);
  else if (format.includes("org.opencontainers.image.source")) output(source);
  else if (format.includes("io.ticketsadmin.release-id")) output(releaseId);
  else if (format.includes("io.ticketsadmin.runtime-epoch")) output("readyz-v1");
  else if (format.includes("io.ticketsadmin.db-rollback-epoch")) output("drizzle-" + migrationTree);
  else if (format.includes("io.ticketsadmin.compose-contract-sha256")) output(composeContract);
  else fail("unknown image format");
  process.exit(0);
}

if (args[0] === "compose" && args[1] === "config") {
  output(JSON.stringify({
    name: "ticketsadmin",
    services: {
      backend: {
        environment: {
          WEBHOOK_API_KEY: "placeholder-a",
          ADMIN_API_KEY: "placeholder-b",
          BOOTSTRAP_SYSADMIN_PASSWORD: "placeholder-c",
        },
      },
      frontend: {},
    },
    volumes: { tickets_data: { name: volume } },
  }));
  process.exit(0);
}

if (args[0] === "compose" && args[1] === "up") {
  fs.writeFileSync(state, "deployed\n");
  process.exit(0);
}

if (args[0] === "ps" && args.includes("-aq")) {
  if (!deployed()) process.exit(0);
  const joined = args.join(" ");
  if (joined.includes("volume=")) output(backendContainer);
  else if (joined.includes("service=backend")) output(backendContainer);
  else if (joined.includes("service=frontend")) output(frontendContainer);
  else output(backendContainer + "\n" + frontendContainer);
  process.exit(0);
}

if (args[0] === "volume" && args[1] === "ls") {
  if (deployed()) output(volume);
  process.exit(0);
}

if (args[0] === "volume" && args[1] === "inspect") {
  if (!deployed()) fail("missing volume");
  const format = option("--format");
  if (!format) output("[]");
  else if (format.includes("com.docker.compose.project")) output("ticketsadmin");
  else if (format.includes("com.docker.compose.volume")) output("tickets_data");
  else fail("unknown volume format");
  process.exit(0);
}

if (args[0] === "inspect") {
  const format = option("--format");
  const container = args[args.length - 1];
  if (format === "{{.State.Status}}") output("running");
  else if (format.includes(".State.Health.Status")) output("healthy");
  else if (format === "{{.Image}}") {
    output(container === backendContainer ? backendImage : frontendImage);
  } else if (format === "{{json .Mounts}}") {
    output(JSON.stringify(container === backendContainer ? [{
      Destination: "/data",
      Type: "volume",
      RW: true,
      Name: volume,
      Source: "/var/lib/docker/volumes/" + volume + "/_data",
    }] : []));
  } else fail("unknown container format");
  process.exit(0);
}

fail("fake docker: unsupported command " + args.join(" "));
`;

test(
  "el primer deploy real del orquestador usa IDs exactos bajo el mismo proceso",
  { skip: process.platform === "win32" },
  () => {
    const directory = mkdtempSync(join(tmpdir(), "ticketsadmin-release-test-"));
    try {
      const bin = join(directory, "bin");
      const backups = join(directory, "backups");
      const releases = join(directory, "releases");
      const locks = join(directory, "locks");
      const lockFile = join(locks, "deploy.lock");
      const stateFile = join(directory, "state");
      const logFile = join(directory, "commands.jsonl");
      const outputFile = join(directory, "github-output");
      mkdirSync(bin, { mode: 0o700 });
      mkdirSync(backups, { mode: 0o700 });
      mkdirSync(releases, { mode: 0o700 });
      mkdirSync(locks, { mode: 0o700 });
      writeFileSync(lockFile, "", { mode: 0o600 });
      writeFileSync(logFile, "", { mode: 0o600 });
      writeFileSync(outputFile, "", { mode: 0o600 });

      for (const command of ["docker", "git", "curl"]) {
        const commandPath = join(bin, command);
        writeFileSync(commandPath, fakeCommand, { mode: 0o700 });
        chmodSync(commandPath, 0o700);
      }

      const revision = "1".repeat(40);
      const migrationTree = "6".repeat(40);
      const backendImage = `sha256:${"2".repeat(64)}`;
      const frontendImage = `sha256:${"3".repeat(64)}`;
      const backendRef = "ticketsadmin-backend:test-release";
      const frontendRef = "ticketsadmin-frontend:test-release";
      const imageSource = "https://github.example/acme/ticketsadmin";
      const composeContract = createHash("sha256")
        .update(
          JSON.stringify({
            name: "ticketsadmin",
            services: {
              backend: {
                environment: {
                  ADMIN_API_KEY: "redacted",
                  BOOTSTRAP_SYSADMIN_PASSWORD: "redacted",
                  WEBHOOK_API_KEY: "redacted",
                },
              },
              frontend: {},
            },
            volumes: { tickets_data: { name: "ticketsadmin_tickets_data" } },
          }),
        )
        .digest("hex");
      const runId = "123";
      const runAttempt = "1";
      const result = spawnSync(
        "bash",
        [
          releasePath,
          "--backend-image-id",
          backendImage,
          "--frontend-image-id",
          frontendImage,
          "--backend-image-ref",
          backendRef,
          "--frontend-image-ref",
          frontendRef,
          "--revision",
          revision,
          "--image-source",
          imageSource,
          "--run-id",
          runId,
          "--run-attempt",
          runAttempt,
          "--repository",
          "acme/ticketsadmin",
          "--backup-dir",
          backups,
          "--state-dir",
          releases,
          "--lock-file",
          lockFile,
        ],
        {
          cwd: fileURLToPath(new URL("../..", import.meta.url)),
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
            GITHUB_OUTPUT: outputFile,
            FAKE_STATE_FILE: stateFile,
            FAKE_LOG_FILE: logFile,
            FAKE_BACKEND_IMAGE_ID: backendImage,
            FAKE_FRONTEND_IMAGE_ID: frontendImage,
            FAKE_BACKEND_IMAGE_REF: backendRef,
            FAKE_FRONTEND_IMAGE_REF: frontendRef,
            FAKE_REVISION: revision,
            FAKE_MIGRATION_TREE: migrationTree,
            FAKE_IMAGE_SOURCE: imageSource,
            FAKE_RELEASE_ID: `git-${revision}-run-${runId}-${runAttempt}`,
            FAKE_COMPOSE_CONTRACT: composeContract,
            ADMIN_API_KEY: "admin-sentinel-must-not-appear",
            WEBHOOK_API_KEY: "webhook-sentinel-must-not-appear",
            BOOTSTRAP_SYSADMIN_PASSWORD: "bootstrap-sentinel-must-not-appear",
          },
        },
      );

      assert.equal(
        result.status,
        0,
        `${result.stderr}\n${result.stdout}\n${readFileSync(logFile, "utf8")}`,
      );
      const outputs = readFileSync(outputFile, "utf8");
      assert.match(outputs, /^deployed=true$/m);
      assert.match(outputs, /^first_deploy=true$/m);
      assert.match(outputs, /^backup_created=false$/m);
      assert.match(
        outputs,
        new RegExp(`^deployed_backend_container_id=${"a".repeat(64)}$`, "m"),
      );
      assert.match(
        outputs,
        new RegExp(`^deployed_frontend_container_id=${"b".repeat(64)}$`, "m"),
      );

      const events = readFileSync(logFile, "utf8")
        .trim()
        .split(/\r?\n/)
        .map(
          (line) =>
            JSON.parse(line) as {
              command: string;
              args: string[];
              backendImage: string | null;
              frontendImage: string | null;
            },
        );
      const upIndex = events.findIndex(
        ({ command, args }) =>
          command === "docker" && args[0] === "compose" && args[1] === "up",
      );
      const postDeployInspect = events.findIndex(
        ({ command, args }, index) =>
          index > upIndex && command === "docker" && args[0] === "inspect",
      );
      assert.ok(upIndex >= 0 && postDeployInspect > upIndex);
      assert.equal(events[upIndex]?.backendImage, backendImage);
      assert.equal(events[upIndex]?.frontendImage, frontendImage);
      const serializedEvents = JSON.stringify(events);
      assert.doesNotMatch(
        serializedEvents,
        /admin-sentinel|webhook-sentinel|bootstrap-sentinel/,
      );
      assert.match(serializedEvents, new RegExp(backendImage));
      assert.match(serializedEvents, new RegExp(frontendImage));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

const rollbackFakeCommand = String.raw`#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const command = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const log = process.env.FAKE_LOG_FILE;
const state = process.env.FAKE_STATE_FILE;
const backendImage = process.env.FAKE_BASELINE_BACKEND_IMAGE;
const frontendImage = process.env.FAKE_BASELINE_FRONTEND_IMAGE;
const candidateBackendImage = process.env.FAKE_CANDIDATE_BACKEND_IMAGE;
const candidateFrontendImage = process.env.FAKE_CANDIDATE_FRONTEND_IMAGE;
const backendContainer = "c".repeat(64);
const frontendContainer = "d".repeat(64);
const candidateBackendContainer = "e".repeat(64);
const candidateFrontendContainer = "f".repeat(64);
const volume = "ticketsadmin_tickets_data";
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? "" : args[index + 1];
};
const output = (value) => process.stdout.write(String(value) + "\n");
const fail = (message) => {
  process.stderr.write(message + "\n");
  process.exit(1);
};

fs.appendFileSync(log, JSON.stringify({
  command,
  args,
  backendImage: process.env.TICKETSADMIN_BACKEND_IMAGE || null,
  frontendImage: process.env.TICKETSADMIN_FRONTEND_IMAGE || null,
}) + "\n");

if (command === "curl") {
  const url = args[args.length - 1];
  if (url === "http://127.0.0.1:3000/") output('<div id="root"></div>');
  else if (url.endsWith("/api/readyz")) output('{"status":"ready"}');
  else fail("unsupported curl URL");
  process.exit(0);
}

if (command === "jq") {
  const mounts = JSON.parse(fs.readFileSync(0, "utf8"));
  const volumeIndex = args.indexOf("data_volume");
  const expectedVolume = args[volumeIndex + 1];
  const dataMounts = mounts.filter((mount) => mount.Destination === "/data");
  process.exit(
    dataMounts.length === 1
      && dataMounts[0].Type === "volume"
      && dataMounts[0].RW === true
      && dataMounts[0].Name === expectedVolume
      ? 0
      : 1,
  );
}

if (command !== "docker") fail("unsupported fake command");

if (args[0] === "image" && args[1] === "inspect") {
  const target = args[args.length - 1];
  if (target !== backendImage && target !== frontendImage) fail("unknown baseline image");
  output(target);
  process.exit(0);
}

if (args[0] === "compose" && args[1] === "up") {
  if (process.env.FAKE_ROLLBACK_FAIL === "true") fail("injected rollback failure");
  fs.writeFileSync(state, "baseline\n");
  process.exit(0);
}

if (args[0] === "ps" && args.includes("-aq")) {
  const joined = args.join(" ");
  if (process.env.FAKE_FIRST_DEPLOY === "true") {
    if (joined.includes("service=backend")) output(candidateBackendContainer);
    else if (joined.includes("service=frontend")) output(candidateFrontendContainer);
    else output(candidateBackendContainer + "\n" + candidateFrontendContainer);
    process.exit(0);
  }
  if (joined.includes("volume=")) output(backendContainer);
  else if (joined.includes("service=backend")) output(backendContainer);
  else if (joined.includes("service=frontend")) output(frontendContainer);
  else output(backendContainer + "\n" + frontendContainer);
  process.exit(0);
}

if (args[0] === "inspect") {
  const format = option("--format");
  const container = args[args.length - 1];
  const candidate = container === candidateBackendContainer || container === candidateFrontendContainer;
  if (format === "{{.State.Status}}") {
    output(candidate && fs.readFileSync(state, "utf8").trim() === "contained" ? "exited" : "running");
  }
  else if (format.includes(".State.Health.Status")) output("healthy");
  else if (format === "{{.Image}}") {
    if (container === backendContainer) output(backendImage);
    else if (container === frontendContainer) output(frontendImage);
    else if (container === candidateBackendContainer) output(candidateBackendImage);
    else if (container === candidateFrontendContainer) output(candidateFrontendImage);
    else fail("unknown container image");
  } else if (format.includes("com.docker.compose.service")) {
    output(
      container === backendContainer || container === candidateBackendContainer
        ? "backend"
        : "frontend",
    );
  }
  else if (format === "{{json .Mounts}}") {
    output(JSON.stringify(container === backendContainer ? [{
      Destination: "/data",
      Type: "volume",
      RW: true,
      Name: volume,
    }] : []));
  } else fail("unknown inspect format");
  process.exit(0);
}

if (args[0] === "stop") {
  if (!args.includes(candidateBackendContainer) || !args.includes(candidateFrontendContainer)) {
    fail("containment did not target both candidate containers");
  }
  fs.writeFileSync(state, "contained\n");
  output(candidateBackendContainer + "\n" + candidateFrontendContainer);
  process.exit(0);
}

if (args[0] === "volume" && args[1] === "inspect") {
  const format = option("--format");
  if (!format) output("[]");
  else if (format.includes("com.docker.compose.project")) output("ticketsadmin");
  else if (format.includes("com.docker.compose.volume")) output("tickets_data");
  else fail("unknown volume format");
  process.exit(0);
}

fail("unsupported fake docker command " + args.join(" "));
`;

function runRollbackTrapScenario(options: {
  firstDeploy?: boolean;
  rollbackFails?: boolean;
  signal?: boolean;
}) {
  const directory = mkdtempSync(join(tmpdir(), "ticketsadmin-rollback-test-"));
  const bin = join(directory, "bin");
  const backups = join(directory, "backups");
  const releases = join(directory, "releases");
  const wrapper = join(directory, "run-rollback.sh");
  const stateFile = join(directory, "state");
  const logFile = join(directory, "commands.jsonl");
  const outputFile = join(directory, "github-output");
  const baselineBackend = `sha256:${"4".repeat(64)}`;
  const baselineFrontend = `sha256:${"5".repeat(64)}`;
  const candidateBackend = `sha256:${"6".repeat(64)}`;
  const candidateFrontend = `sha256:${"7".repeat(64)}`;
  const baselineRevision = "8".repeat(40);
  const candidateRevision = "9".repeat(40);
  const composeContract = "a".repeat(64);
  const dbEpoch = `drizzle-${"b".repeat(40)}`;
  const source = "https://github.example/acme/ticketsadmin";
  const baselineRelease = {
    activatedAt: "2026-08-06T10:00:00Z",
    backendImageId: baselineBackend,
    composeContractSha256: composeContract,
    dbRollbackEpoch: dbEpoch,
    frontendImageId: baselineFrontend,
    kind: "managed",
    releaseId: `git-${baselineRevision}-run-400-1`,
    revision: baselineRevision,
    runAttempt: "1",
    runId: "400",
    runtimeEpoch: "readyz-v1",
    source,
  };
  const candidateRelease = {
    ...baselineRelease,
    activatedAt: "2026-08-06T11:00:00Z",
    backendImageId: candidateBackend,
    frontendImageId: candidateFrontend,
    releaseId: `git-${candidateRevision}-run-401-1`,
    revision: candidateRevision,
    runId: "401",
  };

  mkdirSync(bin, { mode: 0o700 });
  mkdirSync(backups, { mode: 0o700 });
  mkdirSync(releases, { mode: 0o700 });
  writeFileSync(stateFile, "candidate\n", { mode: 0o600 });
  writeFileSync(logFile, "", { mode: 0o600 });
  writeFileSync(outputFile, "", { mode: 0o600 });

  for (const command of ["docker", "curl"]) {
    const commandPath = join(bin, command);
    writeFileSync(commandPath, rollbackFakeCommand, { mode: 0o700 });
    chmodSync(commandPath, 0o700);
  }

  writeFileSync(
    wrapper,
    String.raw`#!/usr/bin/env bash
set -Eeuo pipefail
source "$RELEASE_SCRIPT"
assert_compose_contract_unchanged() { return 0; }
BACKUP_DIR="$FAKE_BACKUP_DIR"
RELEASE_STATE_DIR="$FAKE_RELEASE_STATE_DIR"
REPOSITORY="acme/ticketsadmin"
COMPOSE_PROJECT="ticketsadmin"
DATA_VOLUME="ticketsadmin_tickets_data"
FIRST_DEPLOY="$FAKE_FIRST_DEPLOY"
BASELINE_BACKEND_IMAGE_ID="$FAKE_BASELINE_BACKEND_IMAGE"
BASELINE_FRONTEND_IMAGE_ID="$FAKE_BASELINE_FRONTEND_IMAGE"
BACKEND_IMAGE_ID="$FAKE_CANDIDATE_BACKEND_IMAGE"
FRONTEND_IMAGE_ID="$FAKE_CANDIDATE_FRONTEND_IMAGE"
BASELINE_RELEASE_ID="$FAKE_BASELINE_RELEASE_ID"
ROLLBACK_ELIGIBLE="true"
if [[ "$FIRST_DEPLOY" == "true" ]]; then
  release_state_begin_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
    "null" "$FAKE_CANDIDATE_RELEASE_JSON" "first-deploy" "null"
else
  release_state_begin_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
    "$FAKE_BASELINE_RELEASE_JSON" "$FAKE_CANDIDATE_RELEASE_JSON" "rollback-compatible" "$FAKE_CHECKPOINT_JSON"
fi
release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" "rolling_out"
PENDING_REGISTERED="true"
ROLLOUT_STARTED="true"
RELEASE_VERIFIED="false"
FAILURE_PHASE="candidate-smoke"
install_traps
if [[ "$FAKE_SIGNAL" == "true" ]]; then
  kill -TERM "$$"
fi
exit 42
`,
    { mode: 0o700 },
  );
  chmodSync(wrapper, 0o700);

  const result = spawnSync("bash", [wrapper], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      RELEASE_SCRIPT: releasePath,
      GITHUB_OUTPUT: outputFile,
      FAKE_BACKUP_DIR: backups,
      FAKE_RELEASE_STATE_DIR: releases,
      FAKE_STATE_FILE: stateFile,
      FAKE_LOG_FILE: logFile,
      FAKE_BASELINE_BACKEND_IMAGE: baselineBackend,
      FAKE_BASELINE_FRONTEND_IMAGE: baselineFrontend,
      FAKE_BASELINE_RELEASE_ID: baselineRelease.releaseId,
      FAKE_BASELINE_RELEASE_JSON: JSON.stringify(baselineRelease),
      FAKE_CANDIDATE_BACKEND_IMAGE: candidateBackend,
      FAKE_CANDIDATE_FRONTEND_IMAGE: candidateFrontend,
      FAKE_CANDIDATE_RELEASE_JSON: JSON.stringify(candidateRelease),
      FAKE_CHECKPOINT_JSON: JSON.stringify({
        manifest: "tickets-predeploy-trap.manifest.json",
        manifestSha256: "c".repeat(64),
      }),
      FAKE_FIRST_DEPLOY: String(options.firstDeploy ?? false),
      FAKE_ROLLBACK_FAIL: String(options.rollbackFails ?? false),
      FAKE_SIGNAL: String(options.signal ?? false),
    },
  });

  const eventsText = readFileSync(logFile, "utf8").trim();
  const events = eventsText
    ? eventsText.split(/\r?\n/).map(
        (line) =>
          JSON.parse(line) as {
            command: string;
            args: string[];
            backendImage: string | null;
            frontendImage: string | null;
          },
      )
    : [];

  return {
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
    result,
    events,
    outputs: readFileSync(outputFile, "utf8"),
    state: readFileSync(stateFile, "utf8").trim(),
    baselineBackend,
    baselineFrontend,
  };
}

test(
  "el EXIT trap restaura y verifica exactamente el par baseline sin tocar datos",
  { skip: process.platform === "win32" },
  () => {
    const scenario = runRollbackTrapScenario({});
    try {
      assert.equal(scenario.result.status, 42, scenario.result.stderr);
      assert.equal(scenario.state, "baseline");
      assert.match(scenario.outputs, /^rollback_attempted=true$/m);
      assert.match(scenario.outputs, /^rollback_status=succeeded$/m);
      assert.match(scenario.outputs, /^failure_phase=candidate-smoke$/m);
      const up = scenario.events.find(
        ({ command, args }) =>
          command === "docker" && args[0] === "compose" && args[1] === "up",
      );
      assert.equal(up?.backendImage, scenario.baselineBackend);
      assert.equal(up?.frontendImage, scenario.baselineFrontend);
      assert.doesNotMatch(up?.args.join(" ") ?? "", /--remove-orphans/);
      assert.doesNotMatch(
        JSON.stringify(scenario.events),
        /restore-db\.mjs|compose down|volume (?:rm|prune)/,
      );
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "preserva el codigo de TERM despues de verificar el rollback",
  { skip: process.platform === "win32" },
  () => {
    const scenario = runRollbackTrapScenario({ signal: true });
    try {
      assert.equal(scenario.result.status, 143, scenario.result.stderr);
      assert.equal(scenario.state, "baseline");
      assert.match(scenario.outputs, /^rollback_status=succeeded$/m);
    } finally {
      scenario.cleanup();
    }
  },
);

test(
  "un primer deploy o un rollback fallido nunca se anuncian como recuperados",
  { skip: process.platform === "win32" },
  () => {
    const firstDeploy = runRollbackTrapScenario({ firstDeploy: true });
    const failedRollback = runRollbackTrapScenario({ rollbackFails: true });
    try {
      assert.equal(firstDeploy.result.status, 42);
      assert.equal(firstDeploy.state, "contained");
      assert.equal(
        firstDeploy.events.some(
          ({ command, args }) =>
            command === "docker" && args[0] === "compose" && args[1] === "up",
        ),
        false,
      );
      assert.match(firstDeploy.outputs, /^rollback_attempted=false$/m);
      assert.match(
        firstDeploy.outputs,
        /^rollback_status=first-deploy-contained$/m,
      );

      assert.equal(failedRollback.result.status, 42);
      assert.equal(failedRollback.state, "candidate");
      assert.match(failedRollback.outputs, /^rollback_attempted=true$/m);
      assert.match(failedRollback.outputs, /^rollback_status=failed$/m);
      assert.doesNotMatch(failedRollback.outputs, /^deployed=true$/m);
    } finally {
      firstDeploy.cleanup();
      failedRollback.cleanup();
    }
  },
);
