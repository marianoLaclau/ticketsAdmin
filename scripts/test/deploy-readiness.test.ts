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

test("el deploy espera, prueba ambos puertos y diagnostica fallos", () => {
  const deploy = workflowStep("Deploy and wait for healthy services");
  const smoke = workflowStep("Smoke test published services");
  const prune = workflowStep("Clean up dangling images");
  const diagnostics = workflowStep("Deployment diagnostics");

  assert.match(
    deploy,
    /docker compose up -d --remove-orphans --wait --wait-timeout 180/,
  );
  assert.match(smoke, /5000\/api\/readyz\)" = '\{"status":"ready"\}'/);
  assert.match(
    smoke,
    /spa="\$\(curl -fsS --max-time 5 http:\/\/127\.0\.0\.1:3000\/\)"/,
  );
  assert.match(smoke, /grep -Fq '<div id="root"><\/div>' <<< "\$spa"/);
  assert.match(smoke, /3000\/api\/readyz\)" = '\{"status":"ready"\}'/);
  assert.match(
    prune,
    /if: success\(\) && steps\.freshness_after_build\.outputs\.deploy == 'true'/,
  );
  assert.match(prune, /run: docker image prune -f/);
  assert.match(diagnostics, /if: failure\(\)/);
  assert.match(
    diagnostics,
    /docker compose logs --no-color --tail=100 backend frontend/,
  );
  assert.doesNotMatch(diagnostics, /--follow|logs\s+-f/);

  assert.ok(
    workflow.indexOf("Clean up dangling images") >
      workflow.indexOf("Smoke test published services"),
    "prune debe ocurrir despues del smoke",
  );
});

test("el runner valida capacidades de Compose antes de construir", () => {
  const preflight = workflowStep("Verify Docker Compose capabilities");
  assert.match(preflight, /minimum_version="2\.17\.0"/);
  assert.match(preflight, /compose_up_help="\$\(docker compose up --help\)"/);
  assert.match(preflight, /--wait\(\[\[:space:\]\]\|\$\)/);
  assert.match(preflight, /--wait-timeout\(\[\[:space:\]\]\|\$\)/);
  assert.match(preflight, /command -v curl >\/dev\/null/);
  assert.match(preflight, /docker compose config --quiet/);
  assert.ok(
    workflow.indexOf("Verify Docker Compose capabilities") <
      workflow.indexOf("Build images"),
    "el preflight debe ocurrir antes del build",
  );
});
