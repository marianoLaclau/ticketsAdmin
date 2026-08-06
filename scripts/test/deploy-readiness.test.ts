import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const compose = readFileSync(
  new URL("../../docker-compose.yml", import.meta.url),
  "utf8",
).replace(/\r\n?/g, "\n");
const workflow = readFileSync(
  new URL("../../.github/workflows/deploy.yml", import.meta.url),
  "utf8",
).replace(/\r\n?/g, "\n");
const backendDockerfile = readFileSync(
  new URL("../../Dockerfile.backend", import.meta.url),
  "utf8",
).replace(/\r\n?/g, "\n");
const frontendDockerfile = readFileSync(
  new URL("../../Dockerfile.frontend", import.meta.url),
  "utf8",
).replace(/\r\n?/g, "\n");
const dockerIgnore = readFileSync(
  new URL("../../.dockerignore", import.meta.url),
  "utf8",
).replace(/\r\n?/g, "\n");
const activeCompose = compose.replace(/#[^\n]*/g, "");

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function serviceBlock(name: "backend" | "frontend"): string {
  const end = name === "backend" ? "\\n  frontend:" : "\\nvolumes:";
  const pattern = new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)${end}`);
  const match = pattern.exec(activeCompose);
  assert.ok(match?.[1], `no se encontro el servicio ${name}`);
  return match[1];
}

function workflowStep(name: string): string {
  const pattern = new RegExp(
    `\\n {6}- name: ${escapeRegExp(name)}\\n([\\s\\S]*?)(?=\\n {6}- name:|$)`,
  );
  const match = pattern.exec(workflow);
  assert.ok(match?.[1], `no se encontro el step ${name}`);
  return match[1];
}

test("Compose publica readiness end-to-end", () => {
  const backend = serviceBlock("backend");
  const frontend = serviceBlock("frontend");

  assert.match(backend, /http:\/\/127\.0\.0\.1:5000\/api\/readyz/);
  assert.match(backend, /\{"status":"ready"\}/);
  assert.doesNotMatch(backend, /\/api\/healthz/);
  assert.match(backend, /start_period:\s*60s/);

  assert.match(frontend, /condition:\s*service_healthy/);
  assert.match(frontend, /restart:\s*true/);
  assert.match(frontend, /"CMD-SHELL"/);
  assert.match(frontend, /spa="\$\$\(wget[^\n]*127\.0\.0\.1\/\)"/);
  assert.match(frontend, /printf[^\n]*\$\$spa[^\n]*<div id="root"><\/div>/);
  assert.match(frontend, /&& ready="\$\$\(wget[^\n]*\/api\/readyz\)"/);
  assert.match(frontend, /printf[^\n]*\$\$ready[^\n]*grep -Fxq/);
  assert.match(frontend, /\{"status":"ready"\}/);
});

test("el workflow delega checkpoint, deploy y smoke a una sola operacion", () => {
  const release = workflowStep("Create checkpoint and deploy verified release");
  const diagnostics = workflowStep("Deployment diagnostics");

  assert.match(release, /bash scripts\/deploy\/deploy-release\.sh/);
  assert.match(release, /id: release/);
  assert.match(release, /--backend-image-id/);
  assert.match(release, /--frontend-image-id/);
  assert.match(release, /--backup-dir/);
  assert.match(release, /--lock-file/);
  assert.doesNotMatch(workflow, /name: Deploy and wait for healthy services/);
  assert.doesNotMatch(workflow, /name: Smoke test published services/);
  assert.doesNotMatch(workflow, /run: docker compose up/);

  assert.match(
    diagnostics,
    /if: failure\(\) && steps\.release\.outcome == 'failure'/,
  );
  assert.match(
    diagnostics,
    /docker compose logs --no-color --tail=100 backend frontend/,
  );
  assert.doesNotMatch(diagnostics, /--follow|logs\s+-f/);

  assert.doesNotMatch(workflow, /docker image prune/);
});

test("el runner valida capacidades de Compose antes de construir", () => {
  const preflight = workflowStep("Verify Docker Compose capabilities");
  assert.match(preflight, /minimum_version="2\.17\.0"/);
  assert.match(preflight, /compose_up_help="\$\(docker compose up --help\)"/);
  assert.match(preflight, /--wait\(\[\[:space:\]\]\|\$\)/);
  assert.match(preflight, /--wait-timeout\(\[\[:space:\]\]\|\$\)/);
  assert.match(preflight, /--no-build\(\[\[:space:\]\]\|\$\)/);
  assert.match(preflight, /command -v "\$required_command" >\/dev\/null/);
  assert.match(
    preflight,
    /bash curl flock jq sha256sum stat mktemp realpath sync/,
  );
  assert.match(preflight, /TICKETSADMIN_BACKUP_DIR/);
  assert.match(preflight, /TICKETSADMIN_DEPLOY_LOCK_DIR/);
  assert.match(preflight, /test ! -L "\$private_directory"/);
  assert.match(preflight, /realpath -e -- "\$private_directory"/);
  assert.match(preflight, /stat -c '%u'/);
  assert.match(preflight, /stat -c '%a'/);
  assert.match(preflight, /= "700"/);
  assert.match(
    preflight,
    /lock_file="\$TICKETSADMIN_DEPLOY_LOCK_DIR\/deploy\.lock"/,
  );
  assert.match(preflight, /test ! -L "\$lock_file"/);
  assert.match(preflight, /= "600"/);
  assert.match(preflight, /docker compose config --quiet/);
  assert.ok(
    workflow.indexOf("Verify Docker Compose capabilities") <
      workflow.indexOf("Build images"),
    "el preflight debe ocurrir antes del build",
  );
});

test("cada ejecucion construye y verifica referencias de imagen identificables", () => {
  const backend = serviceBlock("backend");
  const frontend = serviceBlock("frontend");
  const verify = workflowStep("Verify candidate image identities");
  const release = workflowStep("Create checkpoint and deploy verified release");

  assert.match(
    backend,
    /image: \$\{TICKETSADMIN_BACKEND_IMAGE:-ticketsadmin-backend:local\}/,
  );
  assert.match(
    frontend,
    /image: \$\{TICKETSADMIN_FRONTEND_IMAGE:-ticketsadmin-frontend:local\}/,
  );
  assert.match(backend, /pull_policy:\s*never/);
  assert.match(frontend, /pull_policy:\s*never/);
  assert.match(backend, /TICKETSADMIN_IMAGE_REVISION:/);
  assert.match(frontend, /TICKETSADMIN_IMAGE_REVISION:/);

  assert.match(
    workflow,
    /TICKETSADMIN_BACKEND_IMAGE: ticketsadmin-backend:git-\$\{\{ github\.sha \}\}-run-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/,
  );
  assert.match(
    workflow,
    /TICKETSADMIN_FRONTEND_IMAGE: ticketsadmin-frontend:git-\$\{\{ github\.sha \}\}-run-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/,
  );
  assert.doesNotMatch(workflow, /(?:backend|frontend):latest/);

  assert.match(verify, /docker image inspect/);
  assert.match(verify, /org\.opencontainers\.image\.revision/);
  assert.match(verify, /org\.opencontainers\.image\.source/);
  assert.match(verify, /io\.ticketsadmin\.release-id/);
  assert.match(verify, /test "\$revision" = "\$GITHUB_SHA"/);
  assert.match(verify, /test "\$source" = "\$TICKETSADMIN_IMAGE_SOURCE"/);
  assert.match(
    verify,
    /verify_image "\$TICKETSADMIN_BACKEND_IMAGE" backend_id/,
  );
  assert.match(
    verify,
    /verify_image "\$TICKETSADMIN_FRONTEND_IMAGE" frontend_id/,
  );
  assert.match(verify, /GITHUB_OUTPUT/);
  assert.match(verify, /node dist\/backup-db\.mjs --help/);
  assert.match(verify, /node dist\/verify-db\.mjs --help/);
  assert.match(verify, /node dist\/restore-db\.mjs --help/);
  assert.match(
    verify,
    /--network none --add-host backend:127\.0\.0\.1[\s\S]*--entrypoint nginx[\s\S]*"\$TICKETSADMIN_FRONTEND_IMAGE" -t/,
  );
  assert.match(release, /steps\.candidate_images\.outputs\.backend_id/);
  assert.match(release, /steps\.candidate_images\.outputs\.frontend_id/);

  for (const dockerfile of [backendDockerfile, frontendDockerfile]) {
    assert.match(dockerfile, /ARG TICKETSADMIN_IMAGE_REVISION=development/);
    assert.match(dockerfile, /ARG TICKETSADMIN_RELEASE_ID=development/);
    assert.match(dockerfile, /org\.opencontainers\.image\.revision/);
    assert.match(dockerfile, /org\.opencontainers\.image\.source/);
    assert.match(dockerfile, /io\.ticketsadmin\.release-id/);
    assert.ok(
      dockerfile.indexOf("COPY package.json pnpm-lock.yaml") <
        dockerfile.indexOf("RUN pnpm install --frozen-lockfile"),
    );
    assert.ok(
      dockerfile.indexOf("RUN pnpm install --frozen-lockfile") <
        dockerfile.indexOf("COPY . ."),
    );
  }

  assert.ok(
    workflow.indexOf("Build images") <
      workflow.indexOf("Verify candidate image identities"),
  );
  assert.ok(
    workflow.indexOf("Verify candidate image identities") <
      workflow.indexOf("Create checkpoint and deploy verified release"),
  );

  assert.match(dockerIgnore, /^\.pnpm-store$/m);
  assert.match(dockerIgnore, /^tmp$/m);
  assert.match(dockerIgnore, /^\*\*\/node_modules$/m);
});
