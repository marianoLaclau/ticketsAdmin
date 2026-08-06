import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const modulePath = fileURLToPath(
  new URL("../deploy/release-state.sh", import.meta.url),
);
const repository = "acme/ticketsadmin";
const project = "ticketsadmin";
const volume = "ticketsadmin_tickets_data";
const baselineRevision = "1".repeat(40);
const candidateRevision = "2".repeat(40);
const composeContract = "3".repeat(64);
const dbEpoch = `drizzle-${"4".repeat(40)}`;

type Release = {
  activatedAt: string;
  backendImageId: string;
  composeContractSha256: string;
  dbRollbackEpoch: string;
  frontendImageId: string;
  kind: "managed";
  releaseId: string;
  revision: string;
  runAttempt: string;
  runId: string;
  runtimeEpoch: string;
  source: string;
};

function managedRelease(
  revision: string,
  runId: string,
  backendDigit: string,
  frontendDigit: string,
): Release {
  return {
    activatedAt: "2026-08-06T12:00:00Z",
    backendImageId: `sha256:${backendDigit.repeat(64)}`,
    composeContractSha256: composeContract,
    dbRollbackEpoch: dbEpoch,
    frontendImageId: `sha256:${frontendDigit.repeat(64)}`,
    kind: "managed",
    releaseId: `git-${revision}-run-${runId}-1`,
    revision,
    runAttempt: "1",
    runId,
    runtimeEpoch: "readyz-v1",
    source: "https://github.example/acme/ticketsadmin",
  };
}

const baseline = managedRelease(baselineRevision, "100", "a", "b");
const candidate = managedRelease(candidateRevision, "101", "c", "d");
const checkpoint = {
  manifest: "tickets-predeploy-20260806.manifest.json",
  manifestSha256: "5".repeat(64),
};

function invoke(functionName: string, ...args: string[]) {
  return spawnSync(
    "bash",
    [
      "-c",
      'source "$1"; shift; function_name="$1"; shift; "$function_name" "$@"',
      "release-state-test",
      modulePath,
      functionName,
      ...args,
    ],
    { encoding: "utf8" },
  );
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "ticketsadmin-release-state-"));
  const stateDirectory = join(root, "releases");
  mkdirSync(stateDirectory, { mode: 0o700 });
  return {
    cleanup: () => rmSync(root, { force: true, recursive: true }),
    ledger: join(stateDirectory, "release-state.json"),
    root,
    stateDirectory,
  };
}

function beginPending(stateDirectory: string, baselineValue: Release | null) {
  return invoke(
    "release_state_begin_pending",
    stateDirectory,
    repository,
    project,
    volume,
    JSON.stringify(baselineValue),
    JSON.stringify(candidate),
    baselineValue === null ? "first-deploy" : "rollback-compatible",
    JSON.stringify(baselineValue === null ? null : checkpoint),
  );
}

test(
  "publica, transiciona y promueve un ledger durable estricto",
  { skip: process.platform === "win32" },
  () => {
    const current = fixture();
    try {
      const begun = beginPending(current.stateDirectory, baseline);
      assert.equal(begun.status, 0, begun.stderr);
      assert.equal(lstatSync(current.ledger).mode & 0o777, 0o600);

      const prepared = JSON.parse(readFileSync(current.ledger, "utf8"));
      assert.equal(prepared.contract, "ticketsadmin.application-release-state");
      assert.equal(prepared.contractVersion, 1);
      assert.equal(prepared.generation, 1);
      assert.deepEqual(prepared.current, baseline);
      assert.equal(prepared.pending.phase, "prepared");
      assert.equal(prepared.pending.policy, "rollback-compatible");

      const rolling = invoke(
        "release_state_update_pending",
        current.stateDirectory,
        repository,
        project,
        volume,
        "rolling_out",
      );
      assert.equal(rolling.status, 0, rolling.stderr);
      const verified = invoke(
        "release_state_update_pending",
        current.stateDirectory,
        repository,
        project,
        volume,
        "candidate_verified",
      );
      assert.equal(verified.status, 0, verified.stderr);
      const promoted = invoke(
        "release_state_promote_candidate",
        current.stateDirectory,
        repository,
        project,
        volume,
      );
      assert.equal(promoted.status, 0, promoted.stderr);

      const terminal = JSON.parse(readFileSync(current.ledger, "utf8"));
      assert.equal(terminal.generation, 4);
      assert.equal(terminal.pending, null);
      assert.equal(terminal.current.releaseId, candidate.releaseId);
      assert.deepEqual(terminal.previous, baseline);
      assert.equal(terminal.lastAttempt.status, "deployed");
      assert.equal(terminal.lastAttempt.code, null);
      assert.equal(
        current.root.includes(".release-state."),
        false,
        "el fixture no debe ocultar temporales por coincidencia de nombre",
      );
    } finally {
      current.cleanup();
    }
  },
);

test(
  "finaliza un rollback sin mover current a una candidata no verificada",
  { skip: process.platform === "win32" },
  () => {
    const current = fixture();
    try {
      assert.equal(beginPending(current.stateDirectory, baseline).status, 0);
      assert.equal(
        invoke(
          "release_state_update_pending",
          current.stateDirectory,
          repository,
          project,
          volume,
          "rolling_back",
          "deploy_failed",
          "1",
        ).status,
        0,
      );
      const finalized = invoke(
        "release_state_finalize_baseline",
        current.stateDirectory,
        repository,
        project,
        volume,
        "rolled_back",
        "deploy_failed",
        "1",
      );
      assert.equal(finalized.status, 0, finalized.stderr);
      const ledger = JSON.parse(readFileSync(current.ledger, "utf8"));
      assert.deepEqual(ledger.current, baseline);
      assert.equal(ledger.previous, null);
      assert.equal(ledger.pending, null);
      assert.equal(ledger.lastAttempt.status, "rolled_back");
    } finally {
      current.cleanup();
    }
  },
);

test(
  "reserva retrying_forward exclusivamente para transiciones sin rollback",
  { skip: process.platform === "win32" },
  () => {
    const compatible = fixture();
    const forwardOnly = fixture();
    try {
      assert.equal(beginPending(compatible.stateDirectory, baseline).status, 0);
      const rejected = invoke(
        "release_state_update_pending",
        compatible.stateDirectory,
        repository,
        project,
        volume,
        "retrying_forward",
      );
      assert.notEqual(rejected.status, 0);
      assert.equal(
        JSON.parse(readFileSync(compatible.ledger, "utf8")).pending.phase,
        "prepared",
      );

      const begun = invoke(
        "release_state_begin_pending",
        forwardOnly.stateDirectory,
        repository,
        project,
        volume,
        JSON.stringify(baseline),
        JSON.stringify(candidate),
        "fix-forward",
        JSON.stringify(checkpoint),
      );
      assert.equal(begun.status, 0, begun.stderr);
      const retrying = invoke(
        "release_state_update_pending",
        forwardOnly.stateDirectory,
        repository,
        project,
        volume,
        "retrying_forward",
      );
      assert.equal(retrying.status, 0, retrying.stderr);
      assert.equal(
        JSON.parse(readFileSync(forwardOnly.ledger, "utf8")).pending.phase,
        "retrying_forward",
      );
    } finally {
      compatible.cleanup();
      forwardOnly.cleanup();
    }
  },
);

test(
  "cancela un primer deploy que no llego a crear runtime",
  { skip: process.platform === "win32" },
  () => {
    const current = fixture();
    try {
      const begun = beginPending(current.stateDirectory, null);
      assert.equal(begun.status, 0, begun.stderr);
      const cancelled = invoke(
        "release_state_cancel_empty_first_deploy",
        current.stateDirectory,
        repository,
        project,
        volume,
      );
      assert.equal(cancelled.status, 0, cancelled.stderr);
      const ledger = JSON.parse(readFileSync(current.ledger, "utf8"));
      assert.equal(ledger.current, null);
      assert.equal(ledger.pending, null);
      assert.equal(ledger.lastAttempt.status, "aborted");
    } finally {
      current.cleanup();
    }
  },
);

test(
  "falla cerrado ante JSON corrupto, claves extra y permisos inseguros",
  { skip: process.platform === "win32" },
  () => {
    for (const mutation of ["corrupt", "extra-key", "mode"] as const) {
      const current = fixture();
      try {
        assert.equal(beginPending(current.stateDirectory, baseline).status, 0);
        if (mutation === "corrupt") {
          writeFileSync(current.ledger, '{"contract":', { mode: 0o600 });
        } else if (mutation === "extra-key") {
          const ledger = JSON.parse(readFileSync(current.ledger, "utf8"));
          ledger.secret = "must-be-rejected";
          writeFileSync(current.ledger, JSON.stringify(ledger), { mode: 0o600 });
        } else {
          chmodSync(current.ledger, 0o640);
        }
        const loaded = invoke(
          "release_state_load",
          current.stateDirectory,
          repository,
          project,
          volume,
        );
        assert.notEqual(loaded.status, 0, `${mutation} fue aceptado`);
      } finally {
        current.cleanup();
      }
    }
  },
);

test(
  "rechaza symlinks y hardlinks para el ledger",
  { skip: process.platform === "win32" },
  () => {
    for (const linkType of ["symbolic", "hard"] as const) {
      const current = fixture();
      try {
        assert.equal(beginPending(current.stateDirectory, baseline).status, 0);
        const outside = join(current.root, "outside.json");
        writeFileSync(outside, readFileSync(current.ledger), { mode: 0o600 });
        rmSync(current.ledger);
        if (linkType === "symbolic") symlinkSync(outside, current.ledger);
        else linkSync(outside, current.ledger);

        const loaded = invoke(
          "release_state_load",
          current.stateDirectory,
          repository,
          project,
          volume,
        );
        assert.notEqual(loaded.status, 0, `${linkType} link fue aceptado`);
      } finally {
        current.cleanup();
      }
    }
  },
);
