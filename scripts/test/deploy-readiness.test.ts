import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function readRepositoryFile(path: string): string {
  return readFileSync(
    new URL(`../../${path}`, import.meta.url),
    "utf8",
  ).replace(/\r\n?/g, "\n");
}

const compose = readRepositoryFile("docker-compose.yml");
const workflow = readRepositoryFile(".github/workflows/deploy.yml");
const backendDockerfile = readRepositoryFile("Dockerfile.backend");
const frontendDockerfile = readRepositoryFile("Dockerfile.frontend");
const activeCompose = compose.replace(/#[^\n]*/g, "");

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function serviceBlock(name: "backend" | "frontend"): string {
  const end = name === "backend" ? "\\n  frontend:" : "\\nvolumes:";
  const match = new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)${end}`).exec(
    activeCompose,
  );
  assert.ok(match?.[1], `no se encontró el servicio ${name}`);
  return match[1];
}

function workflowStep(name: string): string {
  const match = new RegExp(
    `\\n {6}- name: ${escapeRegExp(name)}\\n([\\s\\S]*?)(?=\\n {6}- name:|$)`,
  ).exec(workflow);
  assert.ok(match?.[1], `no se encontró el step ${name}`);
  return match[1];
}

test("Compose publica readiness end-to-end y conserva SQLite", () => {
  const backend = serviceBlock("backend");
  const frontend = serviceBlock("frontend");

  assert.match(backend, /image: ticketsadmin-backend:local/);
  assert.match(backend, /tickets_data:\/data/);
  assert.match(backend, /http:\/\/127\.0\.0\.1:5000\/api\/readyz/);
  assert.match(backend, /\{"status":"ready"\}/);
  assert.doesNotMatch(backend, /\/api\/healthz/);
  assert.match(backend, /start_period:\s*60s/);

  assert.match(frontend, /image: ticketsadmin-frontend:local/);
  assert.match(frontend, /condition:\s*service_healthy/);
  assert.match(frontend, /restart:\s*true/);
  assert.match(frontend, /<div id="root"><\/div>/);
  assert.match(frontend, /\/api\/readyz/);
  assert.match(frontend, /\{"status":"ready"\}/);
  assert.match(activeCompose, /\nvolumes:\n {2}tickets_data:\s*$/);
});

test("el deploy real ejecuta backup, build, up y smoke en ese orden", () => {
  const backup = workflowStep("Backup SQLite");
  const build = workflowStep("Build images");
  const deploy = workflowStep("Deploy");
  const smoke = workflowStep("Smoke test");
  const diagnostics = workflowStep("Diagnostics on failure");

  const orderedSteps = [
    "Backup SQLite",
    "Build images",
    "Deploy",
    "Smoke test",
  ];
  for (let index = 1; index < orderedSteps.length; index += 1) {
    assert.ok(
      workflow.indexOf(`- name: ${orderedSteps[index - 1]}`) <
        workflow.indexOf(`- name: ${orderedSteps[index]}`),
      `${orderedSteps[index - 1]} debe preceder a ${orderedSteps[index]}`,
    );
  }

  assert.match(backup, /set -euo pipefail/);
  assert.match(backup, /\/var\/lib\/ticketsadmin\/backups/);
  assert.match(backup, /ticketsadmin_tickets_data:\/data:ro/);
  assert.match(backup, /\.backup '\/backups\/pre-deploy-\$stamp\.db'/);
  assert.match(backup, /PRAGMA integrity_check;/);
  assert.match(backup, /grep -Fxq ok/);
  assert.doesNotMatch(backup, /continue-on-error|cp \/data\/tickets\.db/);

  assert.match(build, /run: docker compose build/);
  assert.match(build, /WEBHOOK_API_KEY: not-used-during-image-build/);
  assert.match(build, /ADMIN_API_KEY: not-used-during-image-build/);
  assert.doesNotMatch(build, /secrets\./);

  assert.match(deploy, /docker compose up -d --wait --wait-timeout 180/);
  assert.match(deploy, /secrets\.WEBHOOK_API_KEY/);
  assert.match(deploy, /secrets\.ADMIN_API_KEY/);
  assert.match(deploy, /secrets\.BOOTSTRAP_SYSADMIN_PASSWORD/);

  assert.match(smoke, /127\.0\.0\.1:5000\/api\/readyz/);
  assert.match(smoke, /127\.0\.0\.1:3000\//);
  assert.match(smoke, /<div id="root"><\/div>/);
  assert.match(diagnostics, /if: failure\(\)/);
  assert.match(diagnostics, /docker compose ps \|\| true/);
  assert.match(diagnostics, /logs --no-color --tail=150 backend frontend/);
  assert.doesNotMatch(diagnostics, /--follow|logs\s+-f/);

  assert.doesNotMatch(
    workflow,
    /deploy-release|release-state|recover-pending|fix-forward|docker compose down|docker volume rm|docker image prune|restore-db/,
  );
});

test("el workflow serializa deploys desde main sin cancelar uno activo", () => {
  assert.match(workflow, /push:\n\s+branches: \[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /runs-on: self-hosted/);
  assert.match(workflow, /group: deploy-testing/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /timeout-minutes: 30/);
});

test("no quedan entrypoints ni metadatos del orquestador retirado", () => {
  for (const path of [
    ".github/workflows/recover-pending.yml",
    "scripts/deploy/deploy-release.sh",
    "scripts/deploy/release-state.sh",
  ]) {
    assert.equal(existsSync(new URL(`../../${path}`, import.meta.url)), false);
  }

  for (const source of [compose, backendDockerfile, frontendDockerfile]) {
    assert.doesNotMatch(
      source,
      /TICKETSADMIN_(?:RELEASE|IMAGE|COMPOSE_CONTRACT|DB_ROLLBACK)/,
    );
    assert.doesNotMatch(
      source,
      /io\.ticketsadmin\.(?:release-id|runtime-epoch|db-rollback-epoch|compose-contract)/,
    );
  }

  for (const dockerfile of [backendDockerfile, frontendDockerfile]) {
    assert.ok(
      dockerfile.indexOf(
        "COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./",
      ) < dockerfile.indexOf("RUN pnpm install --frozen-lockfile"),
    );
    assert.ok(
      dockerfile.indexOf("RUN pnpm install --frozen-lockfile") <
        dockerfile.indexOf("COPY . ."),
    );
  }
});
