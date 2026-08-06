import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
const source = process.env.FAKE_IMAGE_SOURCE;
const releaseId = process.env.FAKE_RELEASE_ID;
const volume = "ticketsadmin_tickets_data";
const backendContainer = "a".repeat(64);
const frontendContainer = "b".repeat(64);

fs.appendFileSync(log, JSON.stringify({ command, args }) + "\n");
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
  if (args[0] === "rev-parse") output(revision);
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
  const query = args.find((argument) => argument.startsWith("."))
    || args.find((argument) => argument.includes("$data_mounts"));
  const parsed = JSON.parse(input);
  if (query === ".name") output(parsed.name);
  else if (query === ".volumes.tickets_data.name") output(parsed.volumes.tickets_data.name);
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
  else fail("unknown image format");
  process.exit(0);
}

if (args[0] === "compose" && args[1] === "config") {
  output(JSON.stringify({
    name: "ticketsadmin",
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
      const locks = join(directory, "locks");
      const lockFile = join(locks, "deploy.lock");
      const stateFile = join(directory, "state");
      const logFile = join(directory, "commands.jsonl");
      const outputFile = join(directory, "github-output");
      mkdirSync(bin, { mode: 0o700 });
      mkdirSync(backups, { mode: 0o700 });
      mkdirSync(locks, { mode: 0o700 });
      writeFileSync(lockFile, "", { mode: 0o600 });
      writeFileSync(logFile, "", { mode: 0o600 });
      writeFileSync(outputFile, "", { mode: 0o600 });

      for (const command of ["docker", "git", "curl", "jq"]) {
        const commandPath = join(bin, command);
        writeFileSync(commandPath, fakeCommand, { mode: 0o700 });
        chmodSync(commandPath, 0o700);
      }

      const revision = "1".repeat(40);
      const backendImage = `sha256:${"2".repeat(64)}`;
      const frontendImage = `sha256:${"3".repeat(64)}`;
      const backendRef = "ticketsadmin-backend:test-release";
      const frontendRef = "ticketsadmin-frontend:test-release";
      const imageSource = "https://github.example/acme/ticketsadmin";
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
            FAKE_IMAGE_SOURCE: imageSource,
            FAKE_RELEASE_ID: `git-${revision}-run-${runId}-${runAttempt}`,
            ADMIN_API_KEY: "admin-sentinel-must-not-appear",
            WEBHOOK_API_KEY: "webhook-sentinel-must-not-appear",
            BOOTSTRAP_SYSADMIN_PASSWORD: "bootstrap-sentinel-must-not-appear",
          },
        },
      );

      assert.equal(result.status, 0, result.stderr);
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
        .map((line) => JSON.parse(line) as { command: string; args: string[] });
      const upIndex = events.findIndex(
        ({ command, args }) =>
          command === "docker" && args[0] === "compose" && args[1] === "up",
      );
      const postDeployInspect = events.findIndex(
        ({ command, args }, index) =>
          index > upIndex && command === "docker" && args[0] === "inspect",
      );
      assert.ok(upIndex >= 0 && postDeployInspect > upIndex);
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
