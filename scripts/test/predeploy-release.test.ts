import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const releaseUrl = new URL("../deploy/deploy-release.sh", import.meta.url);
const releasePath = fileURLToPath(releaseUrl);
const release = readFileSync(releaseUrl, "utf8").replace(/\r\n?/g, "\n");
const releaseStateUrl = new URL("../deploy/release-state.sh", import.meta.url);
const releaseStatePath = fileURLToPath(releaseStateUrl);
const releaseState = readFileSync(releaseStateUrl, "utf8").replace(
  /\r\n?/g,
  "\n",
);
const workflow = readFileSync(
  new URL("../../.github/workflows/deploy.yml", import.meta.url),
  "utf8",
).replace(/\r\n?/g, "\n");

const activeRelease = release
  .replace(/^[ \t]*#[^\n]*$/gm, "")
  .replace(/\n{3,}/g, "\n\n");

function assertPatternsInOrder(
  source: string,
  patterns: readonly RegExp[],
  message: string,
): void {
  let cursor = 0;

  for (const pattern of patterns) {
    const match = pattern.exec(source.slice(cursor));
    assert.ok(match, `${message}: falta ${pattern}`);
    cursor += match.index + match[0].length;
  }
}

function releaseWorkflowStep(): string {
  const match = workflow.match(
    /\n {6}- name:[^\n]+\n([\s\S]*?scripts\/deploy\/deploy-release\.sh[\s\S]*?)(?=\n {6}- name:|$)/,
  );
  assert.ok(match?.[1], "el workflow no invoca deploy-release.sh");
  return match[1];
}

function shellFunction(name: string): string {
  const match = activeRelease.match(
    new RegExp(
      `(?:^|\\n)(?:function[ \\t]+)?${name}[ \\t]*(?:\\(\\))?[ \\t]*\\{\\n([\\s\\S]*?)\\n\\}`,
      "m",
    ),
  );
  assert.ok(match?.[1], `no se encontro la funcion ${name}`);
  return match[1];
}

test(
  "Bash valida sintaxis y rechaza una opcion repetida antes de operar",
  { skip: process.platform === "win32" },
  () => {
    const syntax = spawnSync("bash", ["-n", releasePath], { encoding: "utf8" });
    assert.equal(syntax.status, 0, syntax.stderr);
    const stateSyntax = spawnSync("bash", ["-n", releaseStatePath], {
      encoding: "utf8",
    });
    assert.equal(stateSyntax.status, 0, stateSyntax.stderr);

    const duplicate = spawnSync(
      "bash",
      [releasePath, "--run-id", "1", "--run-id", "2"],
      { encoding: "utf8" },
    );
    assert.equal(duplicate.status, 1);
    assert.match(duplicate.stderr, /opcion repetida: --run-id/);
    assert.doesNotMatch(
      duplicate.stdout + duplicate.stderr,
      /(?:^|\D)1(?:\D|$)|(?:^|\D)2(?:\D|$)/,
    );
  },
);

test("el release usa shell estricto y una interfaz sin credenciales", () => {
  assert.match(release, /^#!\/usr\/bin\/env bash\n/);
  assert.match(activeRelease, /set -E?euo pipefail/);
  assert.match(activeRelease, /umask 0?77/);

  for (const option of [
    "backend-image-id",
    "backend-image-ref",
    "frontend-image-id",
    "frontend-image-ref",
    "revision",
    "image-source",
    "run-id",
    "run-attempt",
    "repository",
    "backup-dir",
    "state-dir",
    "lock-file",
    "expected-baseline-release",
    "expected-baseline-backend-image-id",
    "expected-baseline-frontend-image-id",
    "resume-pending-attempt",
    "expected-state-generation",
  ]) {
    assert.match(activeRelease, new RegExp(`--${option}\\b`));
  }

  assert.doesNotMatch(
    activeRelease,
    /--(?:admin-api-key|webhook-api-key|bootstrap-sysadmin-password)\b/i,
  );
  assert.doesNotMatch(
    activeRelease,
    /(?:echo|printf)[^\n]*(?:ADMIN_API_KEY|WEBHOOK_API_KEY|BOOTSTRAP_SYSADMIN_PASSWORD)/,
  );
  assert.doesNotMatch(activeRelease, /\beval\b/);
  assert.match(activeRelease, /--allow-legacy-adoption/);
  assert.match(activeRelease, /--allow-fix-forward-transition/);
  assert.match(
    activeRelease,
    /autorizaciones legacy y fix-forward son mutuamente excluyentes/,
  );
});

test("persiste y reconcilia el intento antes de aceptar otro rollout", () => {
  const main = shellFunction("main");
  const cleanup = shellFunction("cleanup");

  assert.match(
    release,
    /source "\$DEPLOY_SCRIPT_DIRECTORY\/release-state\.sh"/,
  );
  assertPatternsInOrder(
    main,
    [
      /flock\b/,
      /load_release_state/,
      /reconcile_release_state/,
      /capture_baseline/,
      /create_predeploy_backup/,
      /register_pending_release/,
      /release_state_update_pending[^\n]*|release_state_update_pending/,
      /deploy_candidates/,
      /smoke_services/,
      /release_state_promote_candidate/,
    ],
    "el ledger debe envolver toda mutacion del runtime",
  );
  assertPatternsInOrder(
    cleanup,
    [
      /release_state_update_pending/,
      /rollback_application/,
      /release_state_finalize_baseline/,
    ],
    "cleanup debe escribir rolling_back antes de restaurar el baseline",
  );
  assert.match(releaseState, /ticketsadmin\.application-release-state/);
  assert.match(releaseState, /mktemp "\$directory\/\.release-state\.XXXXXX"/);
  assert.match(releaseState, /chmod 600/);
  assert.match(releaseState, /sync "\$temporary"/);
  assert.match(releaseState, /mv -T -- "\$temporary" "\$file"/);
  assert.match(releaseState, /sync -f "\$directory"/);
  assert.doesNotMatch(
    releaseState,
    /restore-db\.mjs|docker compose down|docker volume (?:rm|prune)/,
  );
});

test("un unico lock abarca baseline, backup, freshness, rollout y smoke", () => {
  const main = shellFunction("main");

  assert.match(activeRelease, /flock\b/);
  assert.match(activeRelease, /(?:exec\s+\{?\w+\}?|[0-9]+)>[^\n]*lock/i);
  assert.doesNotMatch(activeRelease, /flock\s+[^\n]*\s-c\s/);
  assert.match(activeRelease, /git fetch --no-tags origin main/);
  assert.match(
    activeRelease,
    /docker compose up -d[^\n]*--no-build[^\n]*--wait/,
  );
  assert.match(activeRelease, /127\.0\.0\.1:5000\/api\/readyz/);
  assert.match(activeRelease, /127\.0\.0\.1:3000\/api\/readyz/);

  assertPatternsInOrder(
    main,
    [
      /flock\b/,
      /capture_baseline/,
      /create_predeploy_backup/,
      /assert_fresh_main/,
      /revalidate_baseline/,
      /(?:revalidate_candidates|validate_candidate)/,
      /deploy_candidates/,
      /verify_deployed_release/,
      /smoke_services/,
    ],
    "el lock debe permanecer tomado durante toda la operacion",
  );

  const firstSmoke = main.search(/smoke_services/);
  const explicitUnlock = main.search(/flock\s+(?:-u|--unlock)(?:\s|$)/);
  assert.ok(
    explicitUnlock === -1 || explicitUnlock > firstSmoke,
    "el release no puede liberar el lock antes del smoke test",
  );
});

test("acota healthz al baseline legacy autorizado y conserva readyz estricto", () => {
  const legacySmoke = shellFunction("smoke_legacy_baseline");
  const readySmoke = shellFunction("smoke_services");
  const baselineSmoke = shellFunction("smoke_captured_baseline");
  const rollback = shellFunction("rollback_application");
  const main = shellFunction("main");

  assert.match(legacySmoke, /BASELINE_RELEASE_ID/);
  assert.match(legacySmoke, /legacy-unversioned-adoption/);
  assert.match(legacySmoke, /ALLOW_LEGACY_ADOPTION/);
  assert.match(legacySmoke, /127\.0\.0\.1:5000\/api\/healthz/);
  assert.match(legacySmoke, /127\.0\.0\.1:3000\/api\/healthz/);
  assert.match(legacySmoke, /\{"status":"ok"\}/);
  assert.doesNotMatch(legacySmoke, /\/api\/readyz/);

  assert.match(readySmoke, /127\.0\.0\.1:5000\/api\/readyz/);
  assert.match(readySmoke, /127\.0\.0\.1:3000\/api\/readyz/);
  assert.match(readySmoke, /\{"status":"ready"\}/);
  assert.doesNotMatch(readySmoke, /\/api\/healthz/);

  assert.match(baselineSmoke, /BASELINE_RELEASE_ID/);
  assert.match(baselineSmoke, /legacy-unversioned-adoption/);
  assert.match(baselineSmoke, /smoke_legacy_baseline/);
  assert.match(baselineSmoke, /smoke_services/);
  assert.match(rollback, /smoke_services/);
  assert.doesNotMatch(rollback, /smoke_legacy_baseline/);

  assertPatternsInOrder(
    main,
    [
      /capture_baseline/,
      /assert_ledger_matches_captured_baseline/,
      /authorize_baseline_transition/,
      /smoke_captured_baseline/,
      /create_predeploy_backup/,
      /register_pending_release/,
      /deploy_candidates/,
      /verify_deployed_release/,
      /smoke_services/,
    ],
    "la autorizacion y el checkpoint deben preceder toda mutacion candidata",
  );
});

test("confirma imagenes, topologia y volumen despues del rollout", () => {
  const verification = shellFunction("verify_running_release");
  const candidateVerification = shellFunction("verify_deployed_release");
  const main = shellFunction("main");

  assert.match(verification, /list_service_containers backend/);
  assert.match(verification, /list_service_containers frontend/);
  assert.match(verification, /list_project_containers/);
  assert.match(verification, /assert_container_healthy/);
  assert.match(verification, /assert_backend_data_mount/);
  assert.match(verification, /assert_data_volume/);
  assert.match(verification, /expected_backend_image/);
  assert.match(verification, /expected_frontend_image/);
  assert.match(candidateVerification, /BACKEND_IMAGE_ID/);
  assert.match(candidateVerification, /FRONTEND_IMAGE_ID/);
  assertPatternsInOrder(
    main,
    [/deploy_candidates/, /verify_deployed_release/, /smoke_services/],
    "el smoke solo puede correr despues de comprobar el artefacto desplegado",
  );
});

test("revalida baseline y candidatos antes de desplegar IDs exactos", () => {
  const main = shellFunction("main");
  const deploy = shellFunction("deploy_candidates");

  assertPatternsInOrder(
    main,
    [
      /create_predeploy_backup/,
      /assert_fresh_main/,
      /revalidate_baseline/,
      /(?:revalidate_candidates|validate_candidate)/,
      /deploy_candidates/,
    ],
    "ningun estado capturado antes del backup puede usarse sin revalidacion",
  );
  assert.match(
    deploy,
    /TICKETSADMIN_BACKEND_IMAGE[^\n]*\$\{?[A-Za-z_]*backend[A-Za-z_]*image[A-Za-z_]*id\}?/i,
  );
  assert.match(
    deploy,
    /TICKETSADMIN_FRONTEND_IMAGE[^\n]*\$\{?[A-Za-z_]*frontend[A-Za-z_]*image[A-Za-z_]*id\}?/i,
  );
  assert.doesNotMatch(
    deploy,
    /TICKETSADMIN_(?:BACKEND|FRONTEND)_IMAGE[^\n]*\$\{?[A-Za-z_]*image[A-Za-z_]*ref\}?/i,
  );
  assert.match(
    deploy,
    /docker compose up -d[^\n]*--remove-orphans[^\n]*--no-build[^\n]*--wait[^\n]*--wait-timeout 180/,
  );
});

test("valida candidatos por ID inmutable y labels OCI antes de usarlos", () => {
  assert.match(activeRelease, /docker image inspect/);
  assert.match(activeRelease, /org\.opencontainers\.image\.revision/);
  assert.match(activeRelease, /org\.opencontainers\.image\.source/);
  assert.match(activeRelease, /io\.ticketsadmin\.release-id/);
  assert.match(activeRelease, /io\.ticketsadmin\.runtime-epoch/);
  assert.match(activeRelease, /io\.ticketsadmin\.db-rollback-epoch/);
  assert.match(activeRelease, /io\.ticketsadmin\.compose-contract-sha256/);
  assert.match(activeRelease, /(?:\.Id|\{\{\.Id\}\})/);
  assert.match(activeRelease, /backend[_-]image[_-]id/i);
  assert.match(activeRelease, /frontend[_-]image[_-]id/i);
  assert.match(activeRelease, /backend[_-]image[_-]ref/i);
  assert.match(activeRelease, /frontend[_-]image[_-]ref/i);
  assert.match(activeRelease, /(?:GITHUB_SHA|revision)/i);
  assert.match(activeRelease, /image[_-]source/i);
  assert.match(activeRelease, /EXPECTED_RELEASE_ID/);
  assert.match(activeRelease, /EXPECTED_RUNTIME_EPOCH/);
  assert.match(activeRelease, /EXPECTED_DB_ROLLBACK_EPOCH/);
  assert.match(activeRelease, /COMPOSE_CONTRACT_SHA256/);

  assert.match(
    activeRelease,
    /docker (?:create|run)[\s\S]{0,1200}\$\{?[A-Za-z_]*backend[A-Za-z_]*image[A-Za-z_]*id\}?/i,
  );
  assert.doesNotMatch(
    activeRelease,
    /docker (?:create|run)[^\n]*\$\{?[A-Za-z_]*backend[A-Za-z_]*image[A-Za-z_]*ref\}?/i,
  );
});

test("descubre la topologia existente por labels y falla ante estados ambiguos", () => {
  assert.match(activeRelease, /docker ps -aq/);
  assert.match(activeRelease, /docker compose config/);
  assert.match(
    activeRelease,
    /com\.docker\.compose\.project=\$\{?[A-Za-z_]*compose[A-Za-z_]*project[A-Za-z_]*\}?/i,
  );
  assert.match(activeRelease, /com\.docker\.compose\.service=\$service/);
  assert.match(activeRelease, /list_service_containers backend/);
  assert.match(activeRelease, /list_service_containers frontend/);
  assert.match(activeRelease, /com\.docker\.compose\.oneoff=False/i);
  assert.match(activeRelease, /State\.Status/);
  assert.match(activeRelease, /State\.Health\.Status/);
  assert.match(activeRelease, /\{\{\.Image\}\}|jq[^\n]*\.Image|\.Image\b/);
  assert.match(activeRelease, /Mounts/);
  assert.match(activeRelease, /(?:Destination|dst|target)[^\n]*\/data/i);
  assert.match(activeRelease, /(?:Type|type)[^\n]*volume/i);
  assert.match(activeRelease, /(?:RW|readwrite)/i);
  assert.match(activeRelease, /\.Name == \$data_volume/);

  // Debe distinguir de forma explicita instalacion nueva, par completo y
  // cualquier combinacion parcial/multiple; esta ultima no puede continuar.
  assert.match(
    activeRelease,
    /(?:first|new|fresh|primera|nueva)[_-]?(?:deploy|install)|first_deploy/i,
  );
  assert.match(
    activeRelease,
    /(?:partial|ambiguous|inconsistent|incomplet|ambigu)/i,
  );
  assert.match(activeRelease, /(?:exit|return)\s+[1-9][0-9]*/);
  assert.match(activeRelease, /docker volume inspect/);
  assert.match(activeRelease, /docker volume ls --format/);
  assert.doesNotMatch(
    activeRelease,
    /if[^\n]*docker volume inspect/,
    "un error de Docker no puede confundirse con un volumen ausente",
  );
  assert.match(activeRelease, /data_volume_exists/);
  assert.match(activeRelease, /(?:orphan|hu[eé]rfan|unexpected[_ -]volume)/i);
  assert.match(activeRelease, /list_project_containers/);
  assert.match(activeRelease, /list_data_volume_containers/);
  assert.match(activeRelease, /--filter "volume=\$DATA_VOLUME"/);
  assert.match(activeRelease, /assert_volume_exclusive_to/);
  assert.match(activeRelease, /servicios? orphan|contenedores? orphan/i);
  assert.match(activeRelease, /revisiones distintas/);
  assert.match(activeRelease, /ticketsadmin-backend(?::latest)?/);
  assert.match(activeRelease, /ticketsadmin-frontend(?::latest)?/);
  assert.match(activeRelease, /legacy-unversioned-adoption/);
});

test("inspecciona Compose con placeholders locales sin materializar secretos", () => {
  const identity = shellFunction("resolve_compose_identity");

  assert.match(identity, /WEBHOOK_API_KEY=not-used-during-release-inspection/);
  assert.match(identity, /ADMIN_API_KEY=not-used-during-release-inspection/);
  assert.match(identity, /BOOTSTRAP_SYSADMIN_PASSWORD=/);
  assert.match(identity, /has\("WEBHOOK_API_KEY"\)/);
  assert.match(identity, /has\("ADMIN_API_KEY"\)/);
  assert.match(identity, /has\("BOOTSTRAP_SYSADMIN_PASSWORD"\)/);
  assert.match(identity, /docker compose config --format json/);
  assert.match(identity, /del\(\.services\[\]\.image, \.services\[\]\.build\)/);
  assert.match(identity, /sha256sum/);
  assert.doesNotMatch(
    identity,
    /\$(?:WEBHOOK_API_KEY|ADMIN_API_KEY|BOOTSTRAP_SYSADMIN_PASSWORD)/,
  );
});

test("calcula el epoch de base desde la cadena Git y gatea la adopcion legacy", () => {
  const repository = shellFunction("resolve_repository_contracts");
  const authorization = shellFunction("authorize_baseline_transition");
  const main = shellFunction("main");

  assert.match(repository, /git rev-parse HEAD:lib\/db\/drizzle/);
  assert.match(
    repository,
    /EXPECTED_DB_ROLLBACK_EPOCH="drizzle-\$migration_tree"/,
  );
  assertPatternsInOrder(
    main,
    [
      /resolve_repository_contracts/,
      /revalidate_candidates/,
      /capture_baseline/,
      /authorize_baseline_transition/,
      /smoke_captured_baseline/,
      /create_predeploy_backup/,
      /deploy_candidates/,
    ],
    "los contratos y la autorizacion deben resolverse antes de mutar servicios",
  );
  assert.match(authorization, /ROLLBACK_ELIGIBLE/);
  assert.match(authorization, /ALLOW_LEGACY_ADOPTION/);
  assert.match(authorization, /ALLOW_FIX_FORWARD_TRANSITION/);
  assert.match(authorization, /EXPECTED_BASELINE_RELEASE/);
  assert.match(authorization, /EXPECTED_BASELINE_BACKEND_IMAGE_ID/);
  assert.match(authorization, /EXPECTED_BASELINE_FRONTEND_IMAGE_ID/);
  assert.match(authorization, /BASELINE_RELEASE_ID/);
  assert.match(authorization, /BASELINE_BACKEND_IMAGE_ID/);
  assert.match(authorization, /BASELINE_FRONTEND_IMAGE_ID/);
  assert.match(authorization, /BASELINE_FIX_FORWARD_IDENTIFIED/);
  assert.match(authorization, /legacy-unversioned-adoption/);
  assert.match(authorization, /die/);
});

test("revierte solo la aplicacion cuando baseline y candidato son compatibles", () => {
  const cleanup = shellFunction("cleanup");
  const rollback = shellFunction("rollback_application");
  const main = shellFunction("main");

  assert.match(cleanup, /ROLLOUT_STARTED/);
  assert.match(cleanup, /RELEASE_VERIFIED/);
  assert.match(cleanup, /ROLLBACK_ELIGIBLE/);
  assert.match(cleanup, /rollback_application/);
  assert.match(cleanup, /ineligible-baseline/);
  assert.match(cleanup, /first-deploy-contained/);
  assert.match(cleanup, /contain_first_deploy_candidate/);
  assert.match(rollback, /BASELINE_BACKEND_IMAGE_ID/);
  assert.match(rollback, /BASELINE_FRONTEND_IMAGE_ID/);
  assert.match(rollback, /assert_compose_contract_unchanged/);
  assert.match(
    rollback,
    /docker compose up -d --no-build --wait --wait-timeout 180/,
  );
  assert.doesNotMatch(rollback, /--remove-orphans/);
  assertPatternsInOrder(
    rollback,
    [/docker compose up/, /verify_running_release/, /smoke_services/],
    "el rollback debe comprobar el baseline restaurado antes de declararlo exitoso",
  );
  assertPatternsInOrder(
    main,
    [
      /assert_compose_contract_unchanged/,
      /ROLLOUT_STARTED="true"/,
      /deploy_candidates/,
      /verify_deployed_release/,
      /smoke_services/,
      /RELEASE_VERIFIED="true"/,
    ],
    "el rollback debe quedar armado durante toda la fase candidata",
  );
  assert.doesNotMatch(
    rollback,
    /restore-db\.mjs|docker compose down|docker volume (?:rm|prune)/,
  );
});

test("el helper de backup queda aislado y monta la base solo lectura", () => {
  const backup = shellFunction("create_predeploy_backup");
  const dockerHelperCommands = Array.from(
    backup.matchAll(/docker (?:create|run)[^\n]*/g),
    ([command]) => command,
  ).join("\n");

  assert.match(activeRelease, /docker (?:create|run)/);
  assert.match(activeRelease, /--network[= ]+none/);
  assert.match(activeRelease, /--read-only/);
  assert.match(activeRelease, /--cap-drop[= ]+ALL/i);
  assert.match(activeRelease, /--security-opt[= ]+no-new-privileges/i);
  assert.match(activeRelease, /--tmpfs[\s\S]{0,160}\/tmp/);
  assert.match(
    activeRelease,
    /--mount[\s\S]{0,300}type=volume[\s\S]{0,300}(?:readonly|,ro(?:,|\s|$))/i,
  );
  assert.match(activeRelease, /docker run[^\n]*--detach/);
  assert.match(activeRelease, /docker exec/);
  assert.match(activeRelease, /trap[^\n]*(?:EXIT|RETURN)/);
  assert.match(activeRelease, /\btimeout\b/);
  assert.match(
    activeRelease,
    /docker rm -f[\s\S]{0,160}(?:helper|container[_-]id)/i,
  );
  assert.match(activeRelease, /verifier\.cid/);
  assert.match(
    activeRelease,
    /--entrypoint timeout[^\n]*120 node[^\n]*verify-db\.mjs/,
  );

  assert.doesNotMatch(activeRelease, /docker cp/);
  assert.match(
    activeRelease,
    /docker exec[\s\S]{0,240}\bcat\b[\s\S]{0,240}>[ \t]*"?\$\{?[A-Za-z_]*(?:staging|snapshot|backup)[A-Za-z_]*\}?"?/i,
  );
  assert.doesNotMatch(
    backup,
    /ADMIN_API_KEY|WEBHOOK_API_KEY|BOOTSTRAP_SYSADMIN_PASSWORD/,
  );
  assert.doesNotMatch(dockerHelperCommands, /--env(?:=|\s)|(?:^|\s)-e(?:\s|$)/);
});

test("transporta y verifica evidencia antes de publicar el artefacto", () => {
  const backup = shellFunction("create_predeploy_backup");

  assert.match(activeRelease, /backup-db\.mjs[^\n]*--json/);
  assert.match(activeRelease, /verify-db\.mjs[^\n]*--expect-evidence/);
  assert.match(activeRelease, /sha256sum/);
  assert.match(activeRelease, /stat[^\n]*(?:%s|--format[= ]['"]?%s)/);
  assert.match(activeRelease, /pageCount/);
  assert.match(activeRelease, /ticketsadmin\.sqlite-evidence/);
  assert.match(activeRelease, /contractVersion/);
  assert.match(activeRelease, /matched/);
  assert.match(activeRelease, /mktemp -d[^\n]*backup/i);
  assert.match(activeRelease, /realpath/);
  assert.match(activeRelease, /sync/);
  assert.match(
    backup,
    /(?:--mount|--volume)[^\n]*(?:staging|snapshot|backup)[^\n]*(?:readonly|:ro\b)/i,
  );
  assert.match(
    backup,
    /docker (?:run|create)[\s\S]{0,800}\$\{?[A-Za-z_]*backend[A-Za-z_]*image[A-Za-z_]*id\}?[\s\S]{0,800}verify-db\.mjs/i,
  );
  assert.match(backup, /verifier_uid="\$\(id -u\)"/);
  assert.match(backup, /verifier_gid="\$\(id -g\)"/);
  assert.match(
    backup,
    /docker run[^\n]*--user "\$verifier_uid:\$verifier_gid"[^\n]*--cap-drop ALL/,
  );
  assert.match(backup, /--tmpfs "[^\n]*uid=\$verifier_uid,gid=\$verifier_gid/);
  assert.doesNotMatch(backup, /chmod (?:444|711)/);

  assertPatternsInOrder(
    backup,
    [
      /backup-db\.mjs/,
      /docker exec[^\n]*\bcat\b/,
      /sha256sum/,
      /verifier_uid="\$\(id -u\)"/,
      /verify-db\.mjs/,
      /(?:manifest|metadata)/i,
    ],
    "la evidencia debe verificarse antes de crear el manifiesto",
  );
});

test("publica sin overwrite y deja el manifiesto como commit marker final", () => {
  const backup = shellFunction("create_predeploy_backup");

  assert.match(backup, /\bln\b[\s\S]{0,240}(?:snapshot|backup|\.db)/i);
  assert.match(backup, /\bln\b[\s\S]{0,240}(?:manifest|metadata)/i);
  assert.doesNotMatch(activeRelease, /\bln\s+-f\b/);
  assert.doesNotMatch(activeRelease, /\bmv\s+-f\b/);

  assertPatternsInOrder(
    backup,
    [
      /\bln\b[\s\S]{0,240}(?:snapshot|backup|\.db)/i,
      /sync/,
      /\bln\b[\s\S]{0,240}(?:manifest|metadata)/i,
      /sync/,
    ],
    "el DB debe publicarse y sincronizarse antes del manifiesto final",
  );

  assert.ok(
    shellFunction("main").indexOf("create_predeploy_backup") <
      shellFunction("main").indexOf("deploy_candidates"),
    "el backup completo debe preceder al rollout",
  );

  assert.doesNotMatch(activeRelease, /restore-db\.mjs/);
  assert.doesNotMatch(activeRelease, /docker compose down/);
  assert.doesNotMatch(activeRelease, /docker (?:image|system) prune/);
  assert.doesNotMatch(activeRelease, /docker volume (?:rm|prune)/);
  assert.doesNotMatch(activeRelease, /\brm\s+-rf\b/);
});

test("el manifiesto v1 es explicito, trazable y no serializa el entorno", () => {
  const backup = shellFunction("create_predeploy_backup");

  assert.match(backup, /jq -n/);
  assert.match(
    backup,
    /ticketsadmin\.(?:predeploy|release)[-_](?:checkpoint|backup)/i,
  );
  assert.match(backup, /contractVersion/);
  assert.match(backup, /repository/);
  assert.match(backup, /revision/);
  assert.match(backup, /runId/);
  assert.match(backup, /runAttempt/);
  assert.match(backup, /createdAt/);
  assert.match(backup, /baseline/);
  assert.match(backup, /candidate/);
  assert.match(backup, /dataVolume/);
  assert.match(backup, /sha256/);
  assert.match(backup, /bytes/);
  assert.match(backup, /pageCount/);
  assert.doesNotMatch(backup, /\b(?:env|printenv|set)\s*(?:>|\|)/);
  assert.doesNotMatch(
    backup,
    /ADMIN_API_KEY|WEBHOOK_API_KEY|BOOTSTRAP_SYSADMIN_PASSWORD/,
  );
});

test("el workflow entrega IDs exactos y mantiene secretos fuera de argv", () => {
  const step = releaseWorkflowStep();

  assert.match(step, /exec bash scripts\/deploy\/deploy-release\.sh/);
  assert.match(
    step,
    /--backend-image-id[ \t]+"?\$\{\{ steps\.candidate_images\.outputs\.backend_id \}\}"?/,
  );
  assert.match(
    step,
    /--frontend-image-id[ \t]+"?\$\{\{ steps\.candidate_images\.outputs\.frontend_id \}\}"?/,
  );
  assert.match(step, /--backend-image-ref/);
  assert.match(step, /--frontend-image-ref/);
  assert.match(
    step,
    /--revision[ \t]+"?\$(?:GITHUB_SHA|TICKETSADMIN_IMAGE_REVISION)"?/,
  );
  assert.match(
    workflow,
    /TICKETSADMIN_IMAGE_REVISION:[ \t]*\$\{\{ github\.sha \}\}/,
  );
  assert.match(step, /--backup-dir/);
  assert.match(step, /--lock-file/);
  assert.doesNotMatch(
    step,
    /--[^\n]*(?:secrets\.(?:ADMIN_API_KEY|WEBHOOK_API_KEY|BOOTSTRAP_SYSADMIN_PASSWORD)|\$(?:ADMIN_API_KEY|WEBHOOK_API_KEY|BOOTSTRAP_SYSADMIN_PASSWORD))/,
  );

  assert.match(step, /ADMIN_API_KEY:[ \t]*\$\{\{ secrets\.ADMIN_API_KEY \}\}/);
  assert.match(
    step,
    /WEBHOOK_API_KEY:[ \t]*\$\{\{ secrets\.WEBHOOK_API_KEY \}\}/,
  );
  assert.match(
    step,
    /BOOTSTRAP_SYSADMIN_PASSWORD:[ \t]*\$\{\{ secrets\.BOOTSTRAP_SYSADMIN_PASSWORD \}\}/,
  );
});
