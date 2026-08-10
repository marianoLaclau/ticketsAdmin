#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

DEPLOY_SCRIPT_DIRECTORY="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)" || exit 1
# shellcheck source=scripts/deploy/release-state.sh
source "$DEPLOY_SCRIPT_DIRECTORY/release-state.sh"

readonly EXPECTED_COMPOSE_PROJECT="ticketsadmin"
readonly SQLITE_SOURCE_PATH="/data/tickets.db"
readonly EXPECTED_RUNTIME_EPOCH="readyz-v1"
EXPECTED_DB_ROLLBACK_EPOCH=""

BACKEND_IMAGE_ID=""
FRONTEND_IMAGE_ID=""
BACKEND_IMAGE_REF=""
FRONTEND_IMAGE_REF=""
REVISION=""
IMAGE_SOURCE=""
RUN_ID=""
RUN_ATTEMPT=""
REPOSITORY=""
BACKUP_DIR=""
RELEASE_STATE_DIR=""
LOCK_FILE=""
EXPECTED_RELEASE_ID=""
ALLOW_LEGACY_ADOPTION="false"
ALLOW_FIX_FORWARD_TRANSITION="false"
EXPECTED_BASELINE_RELEASE=""
EXPECTED_BASELINE_BACKEND_IMAGE_ID=""
EXPECTED_BASELINE_FRONTEND_IMAGE_ID=""
RESUME_PENDING_ATTEMPT=""
EXPECTED_STATE_GENERATION=""

COMPOSE_PROJECT=""
DATA_VOLUME=""
COMPOSE_CONTRACT_SHA256=""
FIRST_DEPLOY="false"
BASELINE_BACKEND_CONTAINER_ID=""
BASELINE_FRONTEND_CONTAINER_ID=""
BASELINE_BACKEND_IMAGE_ID=""
BASELINE_FRONTEND_IMAGE_ID=""
BASELINE_BACKEND_STARTED_AT=""
BASELINE_FRONTEND_STARTED_AT=""
BASELINE_IMAGE_REVISION=""
BASELINE_IMAGE_SOURCE=""
BASELINE_RELEASE_ID=""
BASELINE_RUNTIME_EPOCH=""
BASELINE_DB_ROLLBACK_EPOCH=""
BASELINE_COMPOSE_CONTRACT_SHA256=""
BASELINE_FIX_FORWARD_IDENTIFIED="false"
ROLLBACK_ELIGIBLE="false"

STAGING_DIR=""
CID_FILE=""
VERIFY_CID_FILE=""
EVIDENCE_FILE=""
SNAPSHOT_FILE=""
VERIFY_FILE=""
MANIFEST_STAGING_FILE=""
HELPER_ID=""
PUBLISHED_BACKUP_PATH=""
PUBLISHED_MANIFEST_PATH=""
DEPLOYED_BACKEND_CONTAINER_ID=""
DEPLOYED_FRONTEND_CONTAINER_ID=""
ROLLOUT_STARTED="false"
RELEASE_VERIFIED="false"
ROLLBACK_ACTIVE="false"
FAILURE_PHASE="pre-rollout"
RELEASE_STATE_JSON=""
RELEASE_STATE_PRESENT="false"
PENDING_REGISTERED="false"
CANDIDATE_RELEASE_JSON=""
BASELINE_RELEASE_JSON="null"
RECOVERY_EXIT_STATUS=0

usage() {
  cat <<'EOF'
Uso:
  deploy-release.sh \
    --backend-image-id <sha256:id> \
    --frontend-image-id <sha256:id> \
    --backend-image-ref <referencia> \
    --frontend-image-ref <referencia> \
    --revision <git-sha> \
    --image-source <url> \
    --run-id <numero> \
    --run-attempt <numero> \
    --repository <owner/repo> \
    --backup-dir <ruta-absoluta> \
    --state-dir <ruta-absoluta> \
    --lock-file <ruta-absoluta> \
    [--allow-legacy-adoption] \
    [--allow-fix-forward-transition] \
    [--expected-baseline-release <release-id>] \
    [--expected-baseline-backend-image-id <sha256:id>] \
    [--expected-baseline-frontend-image-id <sha256:id>] \
    [--resume-pending-attempt <release-id>] \
    [--expected-state-generation <numero>]

Captura un checkpoint SQLite verificable y despliega el par exacto de
imagenes bajo un unico lock. No restaura datos automaticamente.
EOF
}

die() {
  printf 'Release abortada: %s\n' "$1" >&2
  exit 1
}

require_option_value() {
  local option="$1"
  local value="${2:-}"
  [[ -n "$value" && "$value" != --* ]] || die "falta el valor de $option"
}

set_option_once() {
  local variable="$1"
  local option="$2"
  local value="$3"
  [[ -z "${!variable}" ]] || die "opcion repetida: $option"
  printf -v "$variable" '%s' "$value"
}

parse_args() {
  while (($# > 0)); do
    case "$1" in
      --backend-image-id)
        require_option_value "$1" "${2:-}"
        set_option_once BACKEND_IMAGE_ID "$1" "$2"
        shift 2
        ;;
      --frontend-image-id)
        require_option_value "$1" "${2:-}"
        set_option_once FRONTEND_IMAGE_ID "$1" "$2"
        shift 2
        ;;
      --backend-image-ref)
        require_option_value "$1" "${2:-}"
        set_option_once BACKEND_IMAGE_REF "$1" "$2"
        shift 2
        ;;
      --frontend-image-ref)
        require_option_value "$1" "${2:-}"
        set_option_once FRONTEND_IMAGE_REF "$1" "$2"
        shift 2
        ;;
      --revision)
        require_option_value "$1" "${2:-}"
        set_option_once REVISION "$1" "$2"
        shift 2
        ;;
      --image-source)
        require_option_value "$1" "${2:-}"
        set_option_once IMAGE_SOURCE "$1" "$2"
        shift 2
        ;;
      --run-id)
        require_option_value "$1" "${2:-}"
        set_option_once RUN_ID "$1" "$2"
        shift 2
        ;;
      --run-attempt)
        require_option_value "$1" "${2:-}"
        set_option_once RUN_ATTEMPT "$1" "$2"
        shift 2
        ;;
      --repository)
        require_option_value "$1" "${2:-}"
        set_option_once REPOSITORY "$1" "$2"
        shift 2
        ;;
      --backup-dir)
        require_option_value "$1" "${2:-}"
        set_option_once BACKUP_DIR "$1" "$2"
        shift 2
        ;;
      --state-dir)
        require_option_value "$1" "${2:-}"
        set_option_once RELEASE_STATE_DIR "$1" "$2"
        shift 2
        ;;
      --lock-file)
        require_option_value "$1" "${2:-}"
        set_option_once LOCK_FILE "$1" "$2"
        shift 2
        ;;
      --allow-legacy-adoption)
        [[ "$ALLOW_LEGACY_ADOPTION" == "false" ]] || die "opcion repetida: $1"
        ALLOW_LEGACY_ADOPTION="true"
        shift
        ;;
      --allow-fix-forward-transition)
        [[ "$ALLOW_FIX_FORWARD_TRANSITION" == "false" ]] || die "opcion repetida: $1"
        ALLOW_FIX_FORWARD_TRANSITION="true"
        shift
        ;;
      --expected-baseline-release)
        require_option_value "$1" "${2:-}"
        set_option_once EXPECTED_BASELINE_RELEASE "$1" "$2"
        shift 2
        ;;
      --expected-baseline-backend-image-id)
        require_option_value "$1" "${2:-}"
        set_option_once EXPECTED_BASELINE_BACKEND_IMAGE_ID "$1" "$2"
        shift 2
        ;;
      --expected-baseline-frontend-image-id)
        require_option_value "$1" "${2:-}"
        set_option_once EXPECTED_BASELINE_FRONTEND_IMAGE_ID "$1" "$2"
        shift 2
        ;;
      --resume-pending-attempt)
        require_option_value "$1" "${2:-}"
        set_option_once RESUME_PENDING_ATTEMPT "$1" "$2"
        shift 2
        ;;
      --expected-state-generation)
        require_option_value "$1" "${2:-}"
        set_option_once EXPECTED_STATE_GENERATION "$1" "$2"
        shift 2
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        die "argumento desconocido"
        ;;
    esac
  done
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "falta el comando requerido: $1"
}

validate_private_directory() {
  local directory="$1"
  local description="$2"
  local canonical owner mode

  [[ -d "$directory" && ! -L "$directory" ]] ||
    die "$description no es un directorio real"
  canonical="$(realpath -e -- "$directory")" || die "no se pudo resolver $description"
  [[ "$canonical" == "$directory" ]] || die "$description debe usar su ruta canonica"
  owner="$(stat -c '%u' -- "$directory")" || die "no se pudo inspeccionar $description"
  mode="$(stat -c '%a' -- "$directory")" || die "no se pudo inspeccionar $description"
  [[ "$owner" == "$(id -u)" ]] || die "$description pertenece a otra identidad"
  [[ "$mode" == "700" ]] || die "$description debe tener modo 0700"
  [[ -w "$directory" && -x "$directory" ]] || die "$description no es escribible"
}

validate_inputs() {
  local lock_directory lock_owner lock_mode lock_canonical

  [[ "$BACKEND_IMAGE_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || die "ID de backend invalido"
  [[ "$FRONTEND_IMAGE_ID" =~ ^sha256:[0-9a-f]{64}$ ]] || die "ID de frontend invalido"
  [[ "$BACKEND_IMAGE_REF" =~ ^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,255}$ ]] ||
    die "referencia de backend invalida"
  [[ "$FRONTEND_IMAGE_REF" =~ ^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,255}$ ]] ||
    die "referencia de frontend invalida"
  [[ "$REVISION" =~ ^[0-9a-f]{40}$ ]] || die "revision Git invalida"
  [[ "$IMAGE_SOURCE" =~ ^[A-Za-z][A-Za-z0-9+.-]*://[A-Za-z0-9._:/-]+$ ]] ||
    die "origen OCI invalido"
  [[ "$RUN_ID" =~ ^[1-9][0-9]*$ ]] || die "run id invalido"
  [[ "$RUN_ATTEMPT" =~ ^[1-9][0-9]*$ ]] || die "run attempt invalido"
  [[ "$REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] ||
    die "repositorio invalido"
  [[ "$BACKUP_DIR" == /* && "$RELEASE_STATE_DIR" == /* && "$LOCK_FILE" == /* ]] ||
    die "backup, estado y lock requieren rutas absolutas"
  [[ "$ALLOW_LEGACY_ADOPTION" != "true" || "$ALLOW_FIX_FORWARD_TRANSITION" != "true" ]] ||
    die "las autorizaciones legacy y fix-forward son mutuamente excluyentes"
  if [[ "$ALLOW_LEGACY_ADOPTION" == "true" || "$ALLOW_FIX_FORWARD_TRANSITION" == "true" ]]; then
    [[ "$EXPECTED_BASELINE_RELEASE" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,255}$ ]] ||
      die "la autorizacion exige un release baseline esperado valido"
    [[ "$EXPECTED_BASELINE_BACKEND_IMAGE_ID" =~ ^sha256:[0-9a-f]{64}$ ]] ||
      die "la autorizacion exige el ID backend exacto del baseline"
    [[ "$EXPECTED_BASELINE_FRONTEND_IMAGE_ID" =~ ^sha256:[0-9a-f]{64}$ ]] ||
      die "la autorizacion exige el ID frontend exacto del baseline"
  else
    [[ -z "$EXPECTED_BASELINE_RELEASE" &&
      -z "$EXPECTED_BASELINE_BACKEND_IMAGE_ID" &&
      -z "$EXPECTED_BASELINE_FRONTEND_IMAGE_ID" ]] ||
      die "la identidad baseline esperada solo se acepta con una autorizacion explicita"
  fi
  if [[ -n "$RESUME_PENDING_ATTEMPT" || -n "$EXPECTED_STATE_GENERATION" ]]; then
    [[ "$RESUME_PENDING_ATTEMPT" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,255}$ ]] ||
      die "la reanudacion exige un attempt ID valido"
    [[ "$EXPECTED_STATE_GENERATION" =~ ^[1-9][0-9]*$ ]] ||
      die "la reanudacion exige la generacion exacta del ledger"
    [[ "$ALLOW_LEGACY_ADOPTION" == "false" && "$ALLOW_FIX_FORWARD_TRANSITION" == "false" ]] ||
      die "la reanudacion de pending no admite otra autorizacion de transicion"
  fi
  EXPECTED_RELEASE_ID="git-${REVISION}-run-${RUN_ID}-${RUN_ATTEMPT}"

  validate_private_directory "$BACKUP_DIR" "el directorio de backups"
  validate_private_directory "$RELEASE_STATE_DIR" "el directorio de estado de releases"
  lock_directory="$(dirname -- "$LOCK_FILE")"
  validate_private_directory "$lock_directory" "el directorio del lock"

  [[ -f "$LOCK_FILE" && ! -L "$LOCK_FILE" ]] ||
    die "el lock debe preexistir como archivo regular"
  lock_canonical="$(realpath -e -- "$LOCK_FILE")" || die "no se pudo resolver el lock"
  [[ "$lock_canonical" == "$LOCK_FILE" ]] || die "el lock debe usar su ruta canonica"
  lock_owner="$(stat -c '%u' -- "$LOCK_FILE")" || die "no se pudo inspeccionar el lock"
  lock_mode="$(stat -c '%a' -- "$LOCK_FILE")" || die "no se pudo inspeccionar el lock"
  [[ "$lock_owner" == "$(id -u)" ]] || die "el lock pertenece a otra identidad"
  [[ "$lock_mode" == "600" ]] || die "el lock debe tener modo 0600"
}

load_release_state() {
  local load_status

  if RELEASE_STATE_JSON="$(release_state_load \
    "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME")"; then
    RELEASE_STATE_PRESENT="true"
    return
  else
    load_status=$?
  fi
  if ((load_status == 2)); then
    RELEASE_STATE_JSON=""
    RELEASE_STATE_PRESENT="false"
    return
  fi
  die "el ledger durable no pudo validarse"
}

refresh_release_state() {
  RELEASE_STATE_JSON="$(release_state_load \
    "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME")" ||
    die "el ledger durable no pudo releerse"
  RELEASE_STATE_PRESENT="true"
}

build_candidate_release_record() {
  local activated_at
  activated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)" || die "no se pudo fechar la candidata"
  jq -cnS \
    --arg kind "managed" \
    --arg releaseId "$EXPECTED_RELEASE_ID" \
    --arg revision "$REVISION" \
    --arg source "$IMAGE_SOURCE" \
    --arg runId "$RUN_ID" \
    --arg runAttempt "$RUN_ATTEMPT" \
    --arg backendImageId "$BACKEND_IMAGE_ID" \
    --arg frontendImageId "$FRONTEND_IMAGE_ID" \
    --arg runtimeEpoch "$EXPECTED_RUNTIME_EPOCH" \
    --arg dbRollbackEpoch "$EXPECTED_DB_ROLLBACK_EPOCH" \
    --arg composeContractSha256 "$COMPOSE_CONTRACT_SHA256" \
    --arg activatedAt "$activated_at" '
      {$kind, $releaseId, $revision, $source, $runId, $runAttempt,
        $backendImageId, $frontendImageId, $runtimeEpoch, $dbRollbackEpoch,
        $composeContractSha256, $activatedAt}
    '
}

build_captured_baseline_record() {
  local activated_at kind run_id_json run_attempt_json
  activated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)" || die "no se pudo fechar el baseline"

  if [[ "$BASELINE_RELEASE_ID" == "legacy-unversioned-adoption" ]]; then
    kind="legacy"
    run_id_json="null"
    run_attempt_json="null"
  else
    [[ "$BASELINE_RELEASE_ID" =~ ^git-${BASELINE_IMAGE_REVISION}-run-([1-9][0-9]*)-([1-9][0-9]*)$ ]] ||
      die "el release ID del baseline no se puede persistir"
    run_id_json="$(jq -cn --arg value "${BASH_REMATCH[1]}" '$value')" || die "run id baseline invalido"
    run_attempt_json="$(jq -cn --arg value "${BASH_REMATCH[2]}" '$value')" || die "run attempt baseline invalido"
    if [[ "$BASELINE_RUNTIME_EPOCH" == "pre-rollback-ledger" ]]; then
      kind="pre-contract"
    else
      kind="managed"
    fi
  fi

  jq -cnS \
    --arg kind "$kind" \
    --arg releaseId "$BASELINE_RELEASE_ID" \
    --arg revision "$BASELINE_IMAGE_REVISION" \
    --arg source "$BASELINE_IMAGE_SOURCE" \
    --argjson runId "$run_id_json" \
    --argjson runAttempt "$run_attempt_json" \
    --arg backendImageId "$BASELINE_BACKEND_IMAGE_ID" \
    --arg frontendImageId "$BASELINE_FRONTEND_IMAGE_ID" \
    --arg runtimeEpoch "$BASELINE_RUNTIME_EPOCH" \
    --arg dbRollbackEpoch "$BASELINE_DB_ROLLBACK_EPOCH" \
    --arg composeContractSha256 "$BASELINE_COMPOSE_CONTRACT_SHA256" \
    --arg activatedAt "$activated_at" '
      {$kind, $releaseId, $revision, $source, $runId, $runAttempt,
        $backendImageId, $frontendImageId, $runtimeEpoch, $dbRollbackEpoch,
        $composeContractSha256, $activatedAt}
    '
}

assert_ledger_matches_captured_baseline() {
  [[ "$RELEASE_STATE_PRESENT" == "true" ]] || return 0
  jq -e '.pending == null' <<<"$RELEASE_STATE_JSON" >/dev/null ||
    die "el ledger conserva un intento sin reconciliar"

  if [[ "$FIRST_DEPLOY" == "true" ]]; then
    jq -e '.current == null' <<<"$RELEASE_STATE_JSON" >/dev/null ||
      die "el ledger declara una release pero la instalacion esta vacia"
    return
  fi

  jq -e \
    --arg releaseId "$BASELINE_RELEASE_ID" \
    --arg revision "$BASELINE_IMAGE_REVISION" \
    --arg source "$BASELINE_IMAGE_SOURCE" \
    --arg backendImageId "$BASELINE_BACKEND_IMAGE_ID" \
    --arg frontendImageId "$BASELINE_FRONTEND_IMAGE_ID" \
    --arg runtimeEpoch "$BASELINE_RUNTIME_EPOCH" \
    --arg dbRollbackEpoch "$BASELINE_DB_ROLLBACK_EPOCH" \
    --arg composeContractSha256 "$BASELINE_COMPOSE_CONTRACT_SHA256" '
      .current != null and
      .current.releaseId == $releaseId and
      .current.revision == $revision and
      .current.source == $source and
      .current.backendImageId == $backendImageId and
      .current.frontendImageId == $frontendImageId and
      .current.runtimeEpoch == $runtimeEpoch and
      .current.dbRollbackEpoch == $dbRollbackEpoch and
      .current.composeContractSha256 == $composeContractSha256
    ' <<<"$RELEASE_STATE_JSON" >/dev/null ||
    die "el runtime no coincide con current en el ledger durable"
}

validate_managed_release_images() {
  local release_json="$1"
  local revision source release_id runtime_epoch db_epoch compose_contract
  local backend_id frontend_id image_id component inspected value

  [[ "$(jq -r '.kind' <<<"$release_json")" == "managed" ]] ||
    die "la release de recuperacion no es administrada"
  revision="$(jq -r '.revision' <<<"$release_json")"
  source="$(jq -r '.source' <<<"$release_json")"
  release_id="$(jq -r '.releaseId' <<<"$release_json")"
  runtime_epoch="$(jq -r '.runtimeEpoch' <<<"$release_json")"
  db_epoch="$(jq -r '.dbRollbackEpoch' <<<"$release_json")"
  compose_contract="$(jq -r '.composeContractSha256' <<<"$release_json")"
  backend_id="$(jq -r '.backendImageId' <<<"$release_json")"
  frontend_id="$(jq -r '.frontendImageId' <<<"$release_json")"

  for component in backend frontend; do
    if [[ "$component" == "backend" ]]; then image_id="$backend_id"; else image_id="$frontend_id"; fi
    inspected="$(docker image inspect --format '{{.Id}}' "$image_id")" ||
      die "falta la imagen $component registrada para recuperar"
    [[ "$inspected" == "$image_id" ]] || die "Docker resolvio otro ID durante la recuperacion"
    value="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image_id")" || return
    [[ "$value" == "$revision" ]] || die "la revision OCI de recuperacion no coincide"
    value="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.source"}}' "$image_id")" || return
    [[ "$value" == "$source" ]] || die "el origen OCI de recuperacion no coincide"
    value="$(docker image inspect --format '{{index .Config.Labels "io.ticketsadmin.release-id"}}' "$image_id")" || return
    [[ "$value" == "$release_id" ]] || die "el release ID de recuperacion no coincide"
    value="$(docker image inspect --format '{{index .Config.Labels "io.ticketsadmin.runtime-epoch"}}' "$image_id")" || return
    [[ "$value" == "$runtime_epoch" ]] || die "el runtime epoch de recuperacion no coincide"
    value="$(docker image inspect --format '{{index .Config.Labels "io.ticketsadmin.db-rollback-epoch"}}' "$image_id")" || return
    [[ "$value" == "$db_epoch" ]] || die "el DB epoch de recuperacion no coincide"
    value="$(docker image inspect --format '{{index .Config.Labels "io.ticketsadmin.compose-contract-sha256"}}' "$image_id")" || return
    [[ "$value" == "$compose_contract" ]] || die "el contrato Compose de recuperacion no coincide"
  done
}

validate_pending_checkpoint() {
  local pending_json="$1"
  local policy manifest_name expected_manifest_sha manifest_path actual_manifest_sha
  local snapshot_name snapshot_path expected_snapshot_sha actual_snapshot_sha owner mode
  local candidate_backend candidate_frontend baseline_backend baseline_frontend

  policy="$(jq -r '.policy' <<<"$pending_json")"
  if [[ "$policy" == "first-deploy" ]]; then
    [[ "$(jq -r '.checkpoint == null' <<<"$pending_json")" == "true" ]] ||
      die "un primer deploy no debe referenciar un checkpoint"
    return
  fi

  manifest_name="$(jq -r '.checkpoint.manifest' <<<"$pending_json")"
  expected_manifest_sha="$(jq -r '.checkpoint.manifestSha256' <<<"$pending_json")"
  manifest_path="$BACKUP_DIR/$manifest_name"
  [[ -f "$manifest_path" && ! -L "$manifest_path" ]] || die "falta el manifiesto del pending"
  [[ "$(realpath -e -- "$manifest_path")" == "$manifest_path" ]] ||
    die "el manifiesto del pending fue sustituido"
  owner="$(stat -c '%u' -- "$manifest_path")" || die "no se pudo inspeccionar el manifiesto pendiente"
  mode="$(stat -c '%a' -- "$manifest_path")" || die "no se pudo inspeccionar el modo del manifiesto"
  [[ "$owner" == "$(id -u)" && "$mode" == "600" ]] ||
    die "el manifiesto pendiente no conserva propietario y modo privados"
  actual_manifest_sha="$(sha256sum -- "$manifest_path")"
  actual_manifest_sha="${actual_manifest_sha%% *}"
  [[ "$actual_manifest_sha" == "$expected_manifest_sha" ]] ||
    die "el manifiesto pendiente no coincide con el ledger"

  candidate_backend="$(jq -r '.candidate.backendImageId' <<<"$pending_json")"
  candidate_frontend="$(jq -r '.candidate.frontendImageId' <<<"$pending_json")"
  baseline_backend="$(jq -r '.baseline.backendImageId' <<<"$pending_json")"
  baseline_frontend="$(jq -r '.baseline.frontendImageId' <<<"$pending_json")"
  jq -e \
    --arg repository "$REPOSITORY" \
    --arg dataVolume "$DATA_VOLUME" \
    --arg candidateBackend "$candidate_backend" \
    --arg candidateFrontend "$candidate_frontend" \
    --arg baselineBackend "$baseline_backend" \
    --arg baselineFrontend "$baseline_frontend" '
      .contract == "ticketsadmin.predeploy-checkpoint" and
      .contractVersion == 1 and .complete == true and
      .repository == $repository and .dataVolume.name == $dataVolume and
      .candidate.backendImageId == $candidateBackend and
      .candidate.frontendImageId == $candidateFrontend and
      .baseline.backend.imageId == $baselineBackend and
      .baseline.frontend.imageId == $baselineFrontend and
      (.snapshot.file | type == "string" and test("^[A-Za-z0-9][A-Za-z0-9_.-]{0,255}\\.db$")) and
      (.snapshot.file | contains("/") | not) and
      (.snapshot.file | contains("..") | not) and
      (.snapshot.sha256 | type == "string" and test("^[a-f0-9]{64}$"))
    ' "$manifest_path" >/dev/null || die "el manifiesto pendiente no cumple el contrato esperado"

  snapshot_name="$(jq -r '.snapshot.file' "$manifest_path")"
  expected_snapshot_sha="$(jq -r '.snapshot.sha256' "$manifest_path")"
  snapshot_path="$BACKUP_DIR/$snapshot_name"
  [[ -f "$snapshot_path" && ! -L "$snapshot_path" ]] || die "falta el snapshot del pending"
  [[ "$(realpath -e -- "$snapshot_path")" == "$snapshot_path" ]] ||
    die "el snapshot del pending fue sustituido"
  owner="$(stat -c '%u' -- "$snapshot_path")" || die "no se pudo inspeccionar el snapshot pendiente"
  mode="$(stat -c '%a' -- "$snapshot_path")" || die "no se pudo inspeccionar el modo del snapshot"
  [[ "$owner" == "$(id -u)" && "$mode" == "600" ]] ||
    die "el snapshot pendiente no conserva propietario y modo privados"
  actual_snapshot_sha="$(sha256sum -- "$snapshot_path")"
  actual_snapshot_sha="${actual_snapshot_sha%% *}"
  [[ "$actual_snapshot_sha" == "$expected_snapshot_sha" ]] ||
    die "el snapshot pendiente no coincide con su manifiesto"
}

classify_pending_runtime() {
  local pending_json="$1"
  local policy candidate_backend candidate_frontend baseline_backend baseline_frontend
  local backend_output frontend_output project_output container_id service image
  local -a backend_containers=() frontend_containers=() project_containers=()

  policy="$(jq -r '.policy' <<<"$pending_json")"
  candidate_backend="$(jq -r '.candidate.backendImageId' <<<"$pending_json")"
  candidate_frontend="$(jq -r '.candidate.frontendImageId' <<<"$pending_json")"
  baseline_backend="$(jq -r '.baseline.backendImageId // ""' <<<"$pending_json")"
  baseline_frontend="$(jq -r '.baseline.frontendImageId // ""' <<<"$pending_json")"
  backend_output="$(list_service_containers backend)" || die "no se pudo clasificar el backend pendiente"
  frontend_output="$(list_service_containers frontend)" || die "no se pudo clasificar el frontend pendiente"
  project_output="$(list_project_containers)" || die "no se pudo clasificar la topologia pendiente"
  [[ -z "$backend_output" ]] || mapfile -t backend_containers <<<"$backend_output"
  [[ -z "$frontend_output" ]] || mapfile -t frontend_containers <<<"$frontend_output"
  [[ -z "$project_output" ]] || mapfile -t project_containers <<<"$project_output"

  if ((${#project_containers[@]} == 0)); then
    if data_volume_exists; then
      [[ "$policy" == "first-deploy" ]] && printf 'first_deploy_contained\n' || printf 'unknown\n'
    else
      printf 'empty\n'
    fi
    return
  fi
  ((${#backend_containers[@]} <= 1 && ${#frontend_containers[@]} <= 1)) || {
    printf 'unknown\n'
    return
  }
  ((${#project_containers[@]} == ${#backend_containers[@]} + ${#frontend_containers[@]})) || {
    printf 'unknown\n'
    return
  }

  for container_id in "${project_containers[@]}"; do
    service="$(inspect_container_value "$container_id" '{{index .Config.Labels "com.docker.compose.service"}}')" || {
      printf 'unknown\n'; return;
    }
    image="$(inspect_container_value "$container_id" '{{.Image}}')" || {
      printf 'unknown\n'; return;
    }
    case "$service:$image" in
      "backend:$candidate_backend" | "frontend:$candidate_frontend") ;;
      "backend:$baseline_backend" | "frontend:$baseline_frontend")
        [[ -n "$baseline_backend" && -n "$baseline_frontend" ]] || { printf 'unknown\n'; return; }
        ;;
      *) printf 'unknown\n'; return ;;
    esac
  done

  if ((${#backend_containers[@]} == 1 && ${#frontend_containers[@]} == 1)); then
    local active_backend active_frontend
    active_backend="$(inspect_container_value "${backend_containers[0]}" '{{.Image}}')" || { printf 'unknown\n'; return; }
    active_frontend="$(inspect_container_value "${frontend_containers[0]}" '{{.Image}}')" || { printf 'unknown\n'; return; }
    if [[ "$active_backend" == "$candidate_backend" && "$active_frontend" == "$candidate_frontend" ]]; then
      if (verify_running_release "$candidate_backend" "$candidate_frontend" "la recuperacion candidata" && smoke_services); then
        printf 'candidate_exact\n'
      else
        printf 'known_unhealthy\n'
      fi
      return
    fi
    if [[ -n "$baseline_backend" && "$active_backend" == "$baseline_backend" && "$active_frontend" == "$baseline_frontend" ]]; then
      if (verify_running_release "$baseline_backend" "$baseline_frontend" "la recuperacion baseline" && smoke_services); then
        printf 'baseline_exact\n'
      else
        printf 'known_unhealthy\n'
      fi
      return
    fi
  fi
  printf 'mixed_known\n'
}

load_baseline_globals_from_record() {
  local baseline_json="$1"
  FIRST_DEPLOY="false"
  ROLLBACK_ELIGIBLE="true"
  BASELINE_BACKEND_IMAGE_ID="$(jq -r '.backendImageId' <<<"$baseline_json")"
  BASELINE_FRONTEND_IMAGE_ID="$(jq -r '.frontendImageId' <<<"$baseline_json")"
  BASELINE_RELEASE_ID="$(jq -r '.releaseId' <<<"$baseline_json")"
  BASELINE_RUNTIME_EPOCH="$(jq -r '.runtimeEpoch' <<<"$baseline_json")"
  BASELINE_DB_ROLLBACK_EPOCH="$(jq -r '.dbRollbackEpoch' <<<"$baseline_json")"
  BASELINE_COMPOSE_CONTRACT_SHA256="$(jq -r '.composeContractSha256' <<<"$baseline_json")"
}

record_recovery_outputs() {
  local attempt_id="$1" from_phase="$2" action="$3" status="$4" release_id="$5"
  write_output recovery_detected "true"
  write_output recovery_attempt_id "$attempt_id"
  write_output recovery_from_phase "$from_phase"
  write_output recovery_action "$action"
  write_output recovery_status "$status"
  write_output recovered_release_id "$release_id"
}

authorize_terminal_resume() {
  local attempt_id="$1"
  local generation

  [[ -n "$RESUME_PENDING_ATTEMPT" && -n "$EXPECTED_STATE_GENERATION" ]] ||
    die "el ledger exige una reanudacion manual ligada al intento y generacion exactos"
  generation="$(jq -r '.generation' <<<"$RELEASE_STATE_JSON")"
  [[ "$RESUME_PENDING_ATTEMPT" == "$attempt_id" && "$EXPECTED_STATE_GENERATION" == "$generation" ]] ||
    die "la autorizacion de reanudacion no coincide con el ledger actual"
}

fail_resumed_candidate() {
  local pending_json="$1" attempt_id="$2" from_phase="$3" policy="$4"
  local candidate_json
  candidate_json="$(jq -c '.candidate' <<<"$pending_json")"

  if [[ "$policy" == "first-deploy" ]]; then
    release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
      "containing_first_deploy" "deploy_failed" 1 ||
      die "fallo el retry y no se pudo armar su contencion"
    FIRST_DEPLOY="true"
    BACKEND_IMAGE_ID="$(jq -r '.backendImageId' <<<"$candidate_json")"
    FRONTEND_IMAGE_ID="$(jq -r '.frontendImageId' <<<"$candidate_json")"
    if contain_first_deploy_candidate; then
      release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
        "first_deploy_contained" || die "la contencion reanudada no pudo confirmarse"
      record_recovery_outputs "$attempt_id" "$from_phase" "contain-first-deploy" "manual-required" "$attempt_id"
      die "el retry del primer deploy fallo y sus contenedores quedaron contenidos"
    fi
    release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
      "manual_intervention" "first_deploy_containment_failed" 1 || true
    die "el retry del primer deploy fallo y no pudo contenerse"
  fi

  release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
    "manual_intervention" "deploy_failed" 1 || true
  record_recovery_outputs "$attempt_id" "$from_phase" "fail-closed" "manual-required" "$attempt_id"
  die "el retry fix-forward fallo y conserva el pending para intervencion"
}

resume_terminal_candidate() {
  local pending_json="$1" attempt_id="$2" from_phase="$3" policy="$4"
  local candidate_json recovered_release retry_phase="rolling_out"
  candidate_json="$(jq -c '.candidate' <<<"$pending_json")"

  validate_pending_checkpoint "$pending_json"
  validate_managed_release_images "$candidate_json"
  [[ "$(jq -r '.composeContractSha256' <<<"$candidate_json")" == "$COMPOSE_CONTRACT_SHA256" ]] ||
    die "el checkout actual no puede reintentar el contrato Compose candidato"
  if [[ "$policy" == "legacy-adoption" || "$policy" == "fix-forward" ]]; then
    retry_phase="retrying_forward"
  fi
  release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
    "$retry_phase" || die "no se pudo registrar el retry candidato antes de Compose"
  assert_compose_contract_unchanged
  BACKEND_IMAGE_ID="$(jq -r '.backendImageId' <<<"$candidate_json")"
  FRONTEND_IMAGE_ID="$(jq -r '.frontendImageId' <<<"$candidate_json")"
  if ! deploy_candidates; then
    fail_resumed_candidate "$pending_json" "$attempt_id" "$from_phase" "$policy"
  fi
  if ! (verify_running_release "$BACKEND_IMAGE_ID" "$FRONTEND_IMAGE_ID" "el retry candidato" && smoke_services); then
    fail_resumed_candidate "$pending_json" "$attempt_id" "$from_phase" "$policy"
  fi
  release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
    "candidate_verified" || die "el retry verificado no pudo registrarse"
  release_state_promote_candidate "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" ||
    die "el retry verificado no pudo promoverse"
  refresh_release_state
  recovered_release="$(jq -r '.current.releaseId' <<<"$RELEASE_STATE_JSON")"
  record_recovery_outputs "$attempt_id" "$from_phase" "promote-candidate" "succeeded" "$recovered_release"
  RECOVERY_EXIT_STATUS=75
}

reconcile_release_state() {
  local pending_json attempt_id phase policy classification baseline_json candidate_json recovered_release
  local terminal_resume="false"

  if [[ "$RELEASE_STATE_PRESENT" != "true" ]]; then
    [[ -z "$RESUME_PENDING_ATTEMPT" && -z "$EXPECTED_STATE_GENERATION" ]] ||
      die "se solicito reanudar un ledger inexistente"
    return 0
  fi
  pending_json="$(jq -c '.pending' <<<"$RELEASE_STATE_JSON")"
  if [[ "$pending_json" == "null" ]]; then
    [[ -z "$RESUME_PENDING_ATTEMPT" && -z "$EXPECTED_STATE_GENERATION" ]] ||
      die "se solicito reanudar un ledger que no tiene pending"
    return 0
  fi
  attempt_id="$(jq -r '.attemptId' <<<"$pending_json")"
  phase="$(jq -r '.phase' <<<"$pending_json")"
  policy="$(jq -r '.policy' <<<"$pending_json")"
  baseline_json="$(jq -c '.baseline' <<<"$pending_json")"
  candidate_json="$(jq -c '.candidate' <<<"$pending_json")"

  if [[ "$phase" == "first_deploy_contained" || "$phase" == "manual_intervention" || "$phase" == "rollback_failed" ]]; then
    authorize_terminal_resume "$attempt_id"
    terminal_resume="true"
  elif [[ -n "$RESUME_PENDING_ATTEMPT" || -n "$EXPECTED_STATE_GENERATION" ]]; then
    die "la reanudacion manual solo se acepta para un pending terminal"
  fi

  classification="$(classify_pending_runtime "$pending_json")"

  if [[ "$phase" == "prepared" && "$classification" != "baseline_exact" &&
    ! ( "$policy" == "first-deploy" && "$classification" == "empty" ) ]]; then
    release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
      "manual_intervention" "state_mismatch" 1 || true
    record_recovery_outputs "$attempt_id" "$phase" "fail-closed" "manual-required" "$attempt_id"
    die "el runtime cambio antes de que el ledger armara rolling_out"
  fi
  if [[ "$phase" == "candidate_verified" && "$classification" != "candidate_exact" ]]; then
    release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
      "manual_intervention" "state_mismatch" 1 || true
    record_recovery_outputs "$attempt_id" "$phase" "fail-closed" "manual-required" "$attempt_id"
    die "una candidata verificada ya no coincide con el runtime"
  fi
  if [[ "$phase" == "rolling_back" && "$classification" == "candidate_exact" ]]; then
    classification="mixed_known"
  fi
  if [[ "$phase" == "containing_first_deploy" && "$classification" == "candidate_exact" ]]; then
    classification="mixed_known"
  fi
  if [[ "$phase" == "retrying_forward" ]]; then
    case "$classification" in
      candidate_exact) ;;
      baseline_exact)
        resume_terminal_candidate "$pending_json" "$attempt_id" "$phase" "$policy"
        return 0
        ;;
      *)
        release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
          "manual_intervention" "runtime_unknown" 1 || true
        record_recovery_outputs "$attempt_id" "$phase" "fail-closed" "manual-required" "$attempt_id"
        die "el retry forward interrumpido no conserva una topologia segura"
        ;;
    esac
  fi
  if [[ "$terminal_resume" == "true" && "$policy" == "rollback-compatible" &&
    "$classification" == "candidate_exact" ]]; then
    classification="mixed_known"
  fi
  if [[ "$terminal_resume" == "true" && "$policy" != "rollback-compatible" &&
    ( "$classification" == "baseline_exact" || "$classification" == "mixed_known" ||
      "$classification" == "known_unhealthy" ||
      "$classification" == "first_deploy_contained" ) ]]; then
    resume_terminal_candidate "$pending_json" "$attempt_id" "$phase" "$policy"
    return 0
  fi

  case "$classification" in
    candidate_exact)
      validate_pending_checkpoint "$pending_json"
      validate_managed_release_images "$candidate_json"
      release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
        "candidate_verified" || die "no se pudo registrar la candidata recuperada"
      release_state_promote_candidate "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" ||
        die "no se pudo promover la candidata recuperada"
      refresh_release_state
      recovered_release="$(jq -r '.current.releaseId' <<<"$RELEASE_STATE_JSON")"
      record_recovery_outputs "$attempt_id" "$phase" "promote-candidate" "succeeded" "$recovered_release"
      printf 'Se promovio el intento pendiente %s; reejecute el workflow para desplegar la nueva candidata.\n' "$attempt_id" >&2
      RECOVERY_EXIT_STATUS=75
      return 0
      ;;
    baseline_exact)
      [[ "$baseline_json" != "null" ]] || die "un primer deploy pendiente no puede tener baseline activo"
      if [[ "$(jq -r '.kind' <<<"$baseline_json")" == "managed" ]]; then
        validate_managed_release_images "$baseline_json"
      fi
      if [[ "$phase" == "rolling_back" ||
        ( "$terminal_resume" == "true" && "$policy" == "rollback-compatible" ) ]]; then
        release_state_finalize_baseline "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
          "rolled_back" || die "no se pudo finalizar el rollback recuperado"
      else
        release_state_finalize_baseline "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
          "aborted" || die "no se pudo cancelar el intento pendiente"
      fi
      refresh_release_state
      recovered_release="$(jq -r '.current.releaseId' <<<"$RELEASE_STATE_JSON")"
      record_recovery_outputs "$attempt_id" "$phase" "rollback-baseline" "succeeded" "$recovered_release"
      printf 'Se reconcilio el baseline %s; reejecute el workflow para desplegar la nueva candidata.\n' "$recovered_release" >&2
      RECOVERY_EXIT_STATUS=75
      return 0
      ;;
    empty)
      [[ "$policy" == "first-deploy" ]] || die "el runtime desaparecio durante un intento con baseline"
      release_state_cancel_empty_first_deploy "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" ||
        die "no se pudo cancelar el primer deploy interrumpido"
      record_recovery_outputs "$attempt_id" "$phase" "none" "succeeded" "$attempt_id"
      printf 'Se cancelo el primer deploy que no llego a crear runtime; reejecute el workflow.\n' >&2
      RECOVERY_EXIT_STATUS=75
      return 0
      ;;
    mixed_known | known_unhealthy)
      if [[ "$policy" == "rollback-compatible" ]]; then
        [[ "$baseline_json" != "null" ]] || die "el rollback durable no contiene baseline"
        validate_pending_checkpoint "$pending_json"
        validate_managed_release_images "$candidate_json"
        validate_managed_release_images "$baseline_json"
        [[ "$(jq -r '.composeContractSha256' <<<"$baseline_json")" == "$COMPOSE_CONTRACT_SHA256" ]] ||
          die "el checkout actual no puede reconstruir el contrato Compose del baseline"
        release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
          "rolling_back" || die "no se pudo registrar el rollback antes de mutar Docker"
        load_baseline_globals_from_record "$baseline_json"
        ROLLBACK_ACTIVE="true"
        if rollback_application; then
          ROLLBACK_ACTIVE="false"
          release_state_finalize_baseline "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
            "rolled_back" || die "no se pudo cerrar el rollback recuperado"
          recovered_release="$(jq -r '.releaseId' <<<"$baseline_json")"
          record_recovery_outputs "$attempt_id" "$phase" "rollback-baseline" "succeeded" "$recovered_release"
          printf 'Rollback durable recuperado sobre %s; reejecute el workflow.\n' "$recovered_release" >&2
          RECOVERY_EXIT_STATUS=75
          return 0
        fi
        ROLLBACK_ACTIVE="false"
        release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
          "rollback_failed" "rollback_failed" 1 || true
        record_recovery_outputs "$attempt_id" "$phase" "rollback-baseline" "failed" "$attempt_id"
        die "fallo el rollback de un intento interrumpido"
      elif [[ "$policy" == "first-deploy" ]]; then
        validate_managed_release_images "$candidate_json"
        release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
          "containing_first_deploy" "runtime_unknown" 1 ||
          die "no se pudo registrar la contencion antes de mutar Docker"
        FIRST_DEPLOY="true"
        BACKEND_IMAGE_ID="$(jq -r '.backendImageId' <<<"$candidate_json")"
        FRONTEND_IMAGE_ID="$(jq -r '.frontendImageId' <<<"$candidate_json")"
        if contain_first_deploy_candidate; then
          release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
            "first_deploy_contained" || die "no se pudo confirmar la contencion durable"
          record_recovery_outputs "$attempt_id" "$phase" "contain-first-deploy" "manual-required" "$attempt_id"
          die "el primer deploy fue contenido y requiere inspeccion manual del volumen"
        fi
        release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
          "manual_intervention" "first_deploy_containment_failed" 1 || true
        die "no se pudo contener el primer deploy interrumpido"
      else
        release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
          "manual_intervention" "incompatible_baseline" 1 || true
        record_recovery_outputs "$attempt_id" "$phase" "fail-closed" "manual-required" "$attempt_id"
        die "una transicion sin rollback quedo parcial y exige intervencion"
      fi
      ;;
    first_deploy_contained)
      release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
        "first_deploy_contained" || true
      record_recovery_outputs "$attempt_id" "$phase" "fail-closed" "manual-required" "$attempt_id"
      die "el volumen del primer deploy interrumpido requiere intervencion manual"
      ;;
    *)
      release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
        "manual_intervention" "runtime_unknown" 1 || true
      record_recovery_outputs "$attempt_id" "$phase" "fail-closed" "manual-required" "$attempt_id"
      die "el runtime pendiente contiene identidades desconocidas"
      ;;
  esac
}

register_pending_release() {
  local policy checkpoint_json checkpoint_sha manifest_name

  CANDIDATE_RELEASE_JSON="$(build_candidate_release_record)" || die "no se pudo construir la candidata durable"
  if [[ "$FIRST_DEPLOY" == "true" ]]; then
    BASELINE_RELEASE_JSON="null"
    checkpoint_json="null"
    policy="first-deploy"
  else
    if [[ "$RELEASE_STATE_PRESENT" == "true" ]]; then
      BASELINE_RELEASE_JSON="$(jq -c '.current' <<<"$RELEASE_STATE_JSON")"
    else
      BASELINE_RELEASE_JSON="$(build_captured_baseline_record)" || die "no se pudo construir el baseline durable"
    fi
    [[ -n "$PUBLISHED_MANIFEST_PATH" ]] || die "falta el manifiesto del checkpoint durable"
    manifest_name="$(basename -- "$PUBLISHED_MANIFEST_PATH")"
    checkpoint_sha="$(sha256sum -- "$PUBLISHED_MANIFEST_PATH")"
    checkpoint_sha="${checkpoint_sha%% *}"
    checkpoint_json="$(jq -cnS --arg manifest "$manifest_name" --arg manifestSha256 "$checkpoint_sha" \
      '{$manifest, $manifestSha256}')" || die "no se pudo describir el checkpoint durable"
    if [[ "$ROLLBACK_ELIGIBLE" == "true" ]]; then
      policy="rollback-compatible"
    elif [[ "$BASELINE_RELEASE_ID" == "legacy-unversioned-adoption" ]]; then
      policy="legacy-adoption"
    else
      policy="fix-forward"
    fi
  fi

  release_state_begin_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
    "$BASELINE_RELEASE_JSON" "$CANDIDATE_RELEASE_JSON" "$policy" "$checkpoint_json" ||
    die "no se pudo publicar el intento pendiente antes del rollout"
  refresh_release_state
  PENDING_REGISTERED="true"
}

cleanup_helper() {
  if [[ ! "$HELPER_ID" =~ ^[0-9a-f]{64}$ && -n "$CID_FILE" && -f "$CID_FILE" ]]; then
    HELPER_ID="$(<"$CID_FILE")"
  fi
  if [[ "$HELPER_ID" =~ ^[0-9a-f]{64}$ ]]; then
    docker rm -f "$HELPER_ID" >/dev/null 2>&1 || true
  fi
  HELPER_ID=""
}

cleanup_verifier() {
  local verifier_id=""
  if [[ -n "$VERIFY_CID_FILE" && -f "$VERIFY_CID_FILE" ]]; then
    verifier_id="$(<"$VERIFY_CID_FILE")"
  fi
  if [[ "$verifier_id" =~ ^[0-9a-f]{64}$ ]]; then
    docker rm -f "$verifier_id" >/dev/null 2>&1 || true
  fi
}

cleanup() {
  local status=$?
  local rollback_attempted="false"
  local rollback_status="not-needed"

  trap - EXIT HUP INT TERM
  set +e
  cleanup_helper
  cleanup_verifier

  if ((status != 0)) && [[ "$ROLLOUT_STARTED" == "true" && "$RELEASE_VERIFIED" != "true" ]]; then
    if [[ "$FIRST_DEPLOY" == "true" ]]; then
      if [[ "$PENDING_REGISTERED" != "true" ]] ||
        ! release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
          "containing_first_deploy" "runtime_unknown" "$status"; then
        rollback_status="first-deploy-ledger-failed"
        printf 'Primer deploy fallido: no se pudo registrar la contencion y Docker no fue mutado por cleanup.\n' >&2
      elif contain_first_deploy_candidate; then
        rollback_status="first-deploy-contained"
        if release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
          "first_deploy_contained"; then
          printf 'Primer deploy fallido: se detuvieron solo contenedores candidatos y se preservaron los datos.\n' >&2
        else
          rollback_status="first-deploy-containment-unconfirmed"
          printf 'Primer deploy contenido, pero el ledger no pudo confirmar el estado terminal.\n' >&2
        fi
      else
        rollback_status="first-deploy-containment-failed"
        release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
          "manual_intervention" "first_deploy_containment_failed" "$status" || true
        printf 'Primer deploy fallido: no se pudo contener con seguridad la topologia candidata.\n' >&2
      fi
    elif [[ "$ROLLBACK_ELIGIBLE" != "true" ]]; then
      rollback_status="ineligible-baseline"
      release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
        "manual_intervention" "incompatible_baseline" "$status" || true
      printf 'Rollback automatico bloqueado: la release anterior no comparte los epochs seguros.\n' >&2
    else
      rollback_attempted="true"
      if [[ "$PENDING_REGISTERED" != "true" ]] ||
        ! release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
          "rolling_back" "deploy_failed" "$status"; then
        rollback_status="ledger-write-failed"
        printf 'Rollback bloqueado: no se pudo persistir rolling_back antes de mutar Docker.\n' >&2
      else
        ROLLBACK_ACTIVE="true"
        if rollback_application; then
          if release_state_finalize_baseline "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
            "rolled_back" "deploy_failed" "$status"; then
            rollback_status="succeeded"
            PENDING_REGISTERED="false"
            printf 'Rollback de aplicacion verificado sobre la release %s.\n' "$BASELINE_RELEASE_ID" >&2
          else
            rollback_status="ledger-finalization-failed"
            printf 'El baseline fue restaurado, pero el ledger conserva el intento para reconciliarlo.\n' >&2
          fi
        else
          rollback_status="failed"
          release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
            "rollback_failed" "rollback_failed" "$status" || true
          printf 'Rollback de aplicacion fallido; se requiere intervencion y no se restauraron datos.\n' >&2
        fi
        ROLLBACK_ACTIVE="false"
      fi
    fi

    write_output rollback_attempted "$rollback_attempted"
    write_output rollback_status "$rollback_status"
    write_output failure_phase "$FAILURE_PHASE"
  fi

  if [[ -n "$STAGING_DIR" && "$STAGING_DIR" == "$BACKUP_DIR"/.predeploy-backup.* ]]; then
    local candidate
    for candidate in \
      "$CID_FILE" \
      "$VERIFY_CID_FILE" \
      "$EVIDENCE_FILE" \
      "$SNAPSHOT_FILE" \
      "$VERIFY_FILE" \
      "$MANIFEST_STAGING_FILE"; do
      [[ -n "$candidate" ]] && rm -f -- "$candidate"
    done
    rmdir -- "$STAGING_DIR" >/dev/null 2>&1 || true
  fi

  exit "$status"
}

install_traps() {
  trap cleanup EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
}

validate_candidate() {
  local image_id="$1"
  local image_ref="$2"
  local component="$3"
  local inspected_id referenced_id revision_label source_label release_label
  local runtime_epoch db_rollback_epoch compose_contract

  inspected_id="$(docker image inspect --format '{{.Id}}' "$image_id")" ||
    die "no se pudo inspeccionar la imagen candidata de $component"
  referenced_id="$(docker image inspect --format '{{.Id}}' "$image_ref")" ||
    die "la referencia candidata de $component ya no existe"
  revision_label="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image_id")" ||
    die "no se pudo leer la revision OCI de $component"
  source_label="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.source"}}' "$image_id")" ||
    die "no se pudo leer el origen OCI de $component"
  release_label="$(docker image inspect --format '{{index .Config.Labels "io.ticketsadmin.release-id"}}' "$image_id")" ||
    die "no se pudo leer la identidad de release de $component"
  runtime_epoch="$(docker image inspect --format '{{index .Config.Labels "io.ticketsadmin.runtime-epoch"}}' "$image_id")" ||
    die "no se pudo leer el runtime epoch de $component"
  db_rollback_epoch="$(docker image inspect --format '{{index .Config.Labels "io.ticketsadmin.db-rollback-epoch"}}' "$image_id")" ||
    die "no se pudo leer el DB rollback epoch de $component"
  compose_contract="$(docker image inspect --format '{{index .Config.Labels "io.ticketsadmin.compose-contract-sha256"}}' "$image_id")" ||
    die "no se pudo leer el contrato Compose de $component"

  [[ "$inspected_id" == "$image_id" ]] || die "el ID candidato de $component cambio"
  [[ "$referenced_id" == "$image_id" ]] || die "la referencia candidata de $component fue sustituida"
  [[ "$revision_label" == "$REVISION" ]] || die "la revision OCI de $component no coincide"
  [[ "$source_label" == "$IMAGE_SOURCE" ]] || die "el origen OCI de $component no coincide"
  [[ "$release_label" == "$EXPECTED_RELEASE_ID" ]] || die "la identidad de release de $component no coincide"
  [[ "$runtime_epoch" == "$EXPECTED_RUNTIME_EPOCH" ]] || die "el runtime epoch de $component no coincide"
  [[ "$db_rollback_epoch" == "$EXPECTED_DB_ROLLBACK_EPOCH" ]] ||
    die "el DB rollback epoch de $component no coincide"
  [[ "$compose_contract" == "$COMPOSE_CONTRACT_SHA256" ]] ||
    die "el contrato Compose de $component no coincide"
}

revalidate_candidates() {
  validate_candidate "$BACKEND_IMAGE_ID" "$BACKEND_IMAGE_REF" "backend"
  validate_candidate "$FRONTEND_IMAGE_ID" "$FRONTEND_IMAGE_REF" "frontend"
}

resolve_repository_contracts() {
  local head_revision migration_tree

  head_revision="$(git rev-parse HEAD)" || die "no se pudo identificar el checkout"
  [[ "$head_revision" == "$REVISION" ]] || die "el checkout no coincide con la revision candidata"
  migration_tree="$(git rev-parse HEAD:lib/db/drizzle)" ||
    die "no se pudo identificar la cadena de migraciones"
  [[ "$migration_tree" =~ ^([0-9a-f]{40}|[0-9a-f]{64})$ ]] ||
    die "Git produjo una identidad de migraciones invalida"
  EXPECTED_DB_ROLLBACK_EPOCH="drizzle-$migration_tree"
}

resolve_compose_identity() {
  local compose_config compose_contract

  # Compose solo necesita valores sintacticamente validos para resolver la
  # topologia. Los placeholders viven en este proceso hijo: el entorno real
  # permanece disponible para el rollout, pero sus secretos no se materializan
  # en el JSON que inspeccionamos ni en memoria de este shell.
  compose_config="$(
    WEBHOOK_API_KEY=not-used-during-release-inspection \
      ADMIN_API_KEY=not-used-during-release-inspection \
      BOOTSTRAP_SYSADMIN_PASSWORD='' \
      docker compose config --format json
  )" ||
    die "no se pudo resolver la configuracion de Compose"
  COMPOSE_PROJECT="$(jq -er '.name' <<<"$compose_config")" ||
    die "Compose no informo el nombre del proyecto"
  DATA_VOLUME="$(jq -er '.volumes.tickets_data.name' <<<"$compose_config")" ||
    die "Compose no informo el volumen tickets_data"
  jq -e '
    (.services.backend.environment | type) == "object" and
    (.services.backend.environment | has("WEBHOOK_API_KEY")) and
    (.services.backend.environment | has("ADMIN_API_KEY")) and
    (.services.backend.environment | has("BOOTSTRAP_SYSADMIN_PASSWORD"))
  ' <<<"$compose_config" >/dev/null || die "Compose omitio el contrato de secretos del backend"
  compose_contract="$(jq -cS '
    del(.services[].image, .services[].build) |
    .services.backend.environment.WEBHOOK_API_KEY = "redacted" |
    .services.backend.environment.ADMIN_API_KEY = "redacted" |
    .services.backend.environment.BOOTSTRAP_SYSADMIN_PASSWORD = "redacted"
  ' <<<"$compose_config")" ||
    die "no se pudo canonicalizar el contrato Compose"
  COMPOSE_CONTRACT_SHA256="$(printf '%s' "$compose_contract" | sha256sum)"
  COMPOSE_CONTRACT_SHA256="${COMPOSE_CONTRACT_SHA256%% *}"
  unset compose_config
  unset compose_contract

  [[ "$COMPOSE_PROJECT" == "$EXPECTED_COMPOSE_PROJECT" ]] ||
    die "el proyecto Compose no es ticketsadmin"
  [[ "$DATA_VOLUME" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]+$ ]] ||
    die "Compose produjo un nombre de volumen invalido"
  [[ "$COMPOSE_CONTRACT_SHA256" =~ ^[a-f0-9]{64}$ ]] ||
    die "Compose produjo un contrato invalido"
}

assert_compose_contract_unchanged() {
  local expected_project="$COMPOSE_PROJECT"
  local expected_volume="$DATA_VOLUME"
  local expected_contract="$COMPOSE_CONTRACT_SHA256"

  resolve_compose_identity
  [[ "$COMPOSE_PROJECT" == "$expected_project" ]] || die "el proyecto Compose cambio durante el release"
  [[ "$DATA_VOLUME" == "$expected_volume" ]] || die "el volumen Compose cambio durante el release"
  [[ "$COMPOSE_CONTRACT_SHA256" == "$expected_contract" ]] ||
    die "el contrato Compose cambio durante el release"
}

list_service_containers() {
  local service="$1"
  docker ps -aq --no-trunc \
    --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" \
    --filter "label=com.docker.compose.service=$service" \
    --filter "label=com.docker.compose.oneoff=False"
}

list_project_containers() {
  docker ps -aq --no-trunc \
    --filter "label=com.docker.compose.project=$COMPOSE_PROJECT" \
    --filter "label=com.docker.compose.oneoff=False"
}

list_data_volume_containers() {
  docker ps -aq --no-trunc --filter "volume=$DATA_VOLUME"
}

data_volume_exists() {
  local volumes volume_name
  volumes="$(docker volume ls --format '{{.Name}}')" ||
    die "no se pudo determinar si existe el volumen de datos"
  while IFS= read -r volume_name; do
    [[ "$volume_name" == "$DATA_VOLUME" ]] && return 0
  done <<<"$volumes"
  return 1
}

array_contains() {
  local expected="$1"
  shift
  local candidate
  for candidate in "$@"; do
    [[ "$candidate" == "$expected" ]] && return 0
  done
  return 1
}

is_missing_label() {
  [[ -z "$1" || "$1" == "<no value>" ]]
}

inspect_container_value() {
  local container_id="$1"
  local format="$2"
  docker inspect --format "$format" "$container_id"
}

assert_container_healthy() {
  local container_id="$1"
  local component="$2"
  local status health

  status="$(inspect_container_value "$container_id" '{{.State.Status}}')" ||
    die "no se pudo inspeccionar el estado de $component"
  health="$(inspect_container_value "$container_id" '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}')" ||
    die "no se pudo inspeccionar el health de $component"
  [[ "$status" == "running" ]] || die "$component no esta running"
  [[ "$health" == "healthy" ]] || die "$component no esta healthy"
}

assert_backend_data_mount() {
  local container_id="$1"
  local mounts

  mounts="$(inspect_container_value "$container_id" '{{json .Mounts}}')" ||
    die "no se pudieron inspeccionar los mounts del backend"
  jq -e --arg data_volume "$DATA_VOLUME" '
    [.[] | select(.Destination == "/data")] as $data_mounts |
    ($data_mounts | length) == 1 and
    $data_mounts[0].Type == "volume" and
    $data_mounts[0].RW == true and
    $data_mounts[0].Name == $data_volume
  ' <<<"$mounts" >/dev/null || die "el mount /data del backend no es el volumen RW esperado"
}

assert_data_volume() {
  local project_label volume_label

  docker volume inspect "$DATA_VOLUME" >/dev/null 2>&1 ||
    die "el volumen de datos esperado no existe"
  project_label="$(docker volume inspect --format '{{index .Labels "com.docker.compose.project"}}' "$DATA_VOLUME")" ||
    die "no se pudo inspeccionar el proyecto del volumen"
  volume_label="$(docker volume inspect --format '{{index .Labels "com.docker.compose.volume"}}' "$DATA_VOLUME")" ||
    die "no se pudo inspeccionar la identidad del volumen"
  [[ "$project_label" == "$COMPOSE_PROJECT" ]] || die "el volumen pertenece a otro proyecto"
  [[ "$volume_label" == "tickets_data" ]] || die "el volumen tiene una etiqueta inesperada"
}

assert_volume_exclusive_to() {
  local expected_container_id="$1"
  local users_output
  local -a volume_users=()

  users_output="$(list_data_volume_containers)" || die "no se pudieron inspeccionar los usuarios del volumen"
  [[ -z "$users_output" ]] || mapfile -t volume_users <<<"$users_output"
  ((${#volume_users[@]} == 1)) ||
    die "el volumen de datos tiene escritores o contenedores externos"
  [[ "${volume_users[0]}" == "$expected_container_id" ]] ||
    die "el volumen de datos no pertenece exclusivamente al backend esperado"
}

capture_baseline() {
  local backend_output frontend_output project_output
  local backend_revision frontend_revision backend_source frontend_source
  local backend_release frontend_release backend_ref frontend_ref legacy_backend_release legacy_frontend_release
  local backend_runtime_epoch frontend_runtime_epoch backend_db_epoch frontend_db_epoch
  local backend_compose_contract frontend_compose_contract
  local -a backend_containers=()
  local -a frontend_containers=()
  local -a project_containers=()

  backend_output="$(list_service_containers backend)" || die "no se pudo descubrir el backend"
  frontend_output="$(list_service_containers frontend)" || die "no se pudo descubrir el frontend"
  project_output="$(list_project_containers)" || die "no se pudo descubrir la topologia Compose"
  [[ -z "$backend_output" ]] || mapfile -t backend_containers <<<"$backend_output"
  [[ -z "$frontend_output" ]] || mapfile -t frontend_containers <<<"$frontend_output"
  [[ -z "$project_output" ]] || mapfile -t project_containers <<<"$project_output"

  if ((${#backend_containers[@]} == 0 && ${#frontend_containers[@]} == 0)); then
    ((${#project_containers[@]} == 0)) ||
      die "topologia ambigua: existen contenedores orphan del proyecto"
    if data_volume_exists; then
      die "orphan volume: hay datos sin el par de contenedores administrado"
    fi
    FIRST_DEPLOY="true"
    return
  fi

  if ((${#backend_containers[@]} != 1 || ${#frontend_containers[@]} != 1)); then
    die "topologia ambigua o incompleta: se exige exactamente un backend y un frontend"
  fi
  ((${#project_containers[@]} == 2)) || die "topologia ambigua: existen servicios orphan"
  array_contains "${backend_containers[0]}" "${project_containers[@]}" ||
    die "el backend no pertenece al baseline Compose completo"
  array_contains "${frontend_containers[0]}" "${project_containers[@]}" ||
    die "el frontend no pertenece al baseline Compose completo"

  BASELINE_BACKEND_CONTAINER_ID="${backend_containers[0]}"
  BASELINE_FRONTEND_CONTAINER_ID="${frontend_containers[0]}"
  [[ "$BASELINE_BACKEND_CONTAINER_ID" =~ ^[0-9a-f]{64}$ ]] || die "ID de contenedor backend invalido"
  [[ "$BASELINE_FRONTEND_CONTAINER_ID" =~ ^[0-9a-f]{64}$ ]] || die "ID de contenedor frontend invalido"

  assert_container_healthy "$BASELINE_BACKEND_CONTAINER_ID" "backend"
  assert_container_healthy "$BASELINE_FRONTEND_CONTAINER_ID" "frontend"
  assert_backend_data_mount "$BASELINE_BACKEND_CONTAINER_ID"
  assert_data_volume

  BASELINE_BACKEND_IMAGE_ID="$(inspect_container_value "$BASELINE_BACKEND_CONTAINER_ID" '{{.Image}}')" ||
    die "no se pudo capturar la imagen del backend"
  BASELINE_FRONTEND_IMAGE_ID="$(inspect_container_value "$BASELINE_FRONTEND_CONTAINER_ID" '{{.Image}}')" ||
    die "no se pudo capturar la imagen del frontend"
  BASELINE_BACKEND_STARTED_AT="$(inspect_container_value "$BASELINE_BACKEND_CONTAINER_ID" '{{.State.StartedAt}}')" ||
    die "no se pudo capturar el inicio del backend"
  BASELINE_FRONTEND_STARTED_AT="$(inspect_container_value "$BASELINE_FRONTEND_CONTAINER_ID" '{{.State.StartedAt}}')" ||
    die "no se pudo capturar el inicio del frontend"
  backend_revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$BASELINE_BACKEND_IMAGE_ID")" ||
    die "no se pudo inspeccionar la revision del baseline"
  frontend_revision="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$BASELINE_FRONTEND_IMAGE_ID")" ||
    die "no se pudo inspeccionar la revision frontend del baseline"
  backend_source="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.source"}}' "$BASELINE_BACKEND_IMAGE_ID")" ||
    die "no se pudo inspeccionar el origen del baseline"
  frontend_source="$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.source"}}' "$BASELINE_FRONTEND_IMAGE_ID")" ||
    die "no se pudo inspeccionar el origen frontend del baseline"
  backend_release="$(docker image inspect --format '{{index .Config.Labels "io.ticketsadmin.release-id"}}' "$BASELINE_BACKEND_IMAGE_ID")" ||
    die "no se pudo inspeccionar la identidad del release backend"
  frontend_release="$(docker image inspect --format '{{index .Config.Labels "io.ticketsadmin.release-id"}}' "$BASELINE_FRONTEND_IMAGE_ID")" ||
    die "no se pudo inspeccionar la identidad del release frontend"
  backend_runtime_epoch="$(docker image inspect --format '{{index .Config.Labels "io.ticketsadmin.runtime-epoch"}}' "$BASELINE_BACKEND_IMAGE_ID")" ||
    die "no se pudo inspeccionar el runtime epoch del baseline"
  frontend_runtime_epoch="$(docker image inspect --format '{{index .Config.Labels "io.ticketsadmin.runtime-epoch"}}' "$BASELINE_FRONTEND_IMAGE_ID")" ||
    die "no se pudo inspeccionar el runtime epoch frontend del baseline"
  backend_db_epoch="$(docker image inspect --format '{{index .Config.Labels "io.ticketsadmin.db-rollback-epoch"}}' "$BASELINE_BACKEND_IMAGE_ID")" ||
    die "no se pudo inspeccionar el DB rollback epoch del baseline"
  frontend_db_epoch="$(docker image inspect --format '{{index .Config.Labels "io.ticketsadmin.db-rollback-epoch"}}' "$BASELINE_FRONTEND_IMAGE_ID")" ||
    die "no se pudo inspeccionar el DB rollback epoch frontend del baseline"
  backend_compose_contract="$(docker image inspect --format '{{index .Config.Labels "io.ticketsadmin.compose-contract-sha256"}}' "$BASELINE_BACKEND_IMAGE_ID")" ||
    die "no se pudo inspeccionar el contrato Compose del baseline"
  frontend_compose_contract="$(docker image inspect --format '{{index .Config.Labels "io.ticketsadmin.compose-contract-sha256"}}' "$BASELINE_FRONTEND_IMAGE_ID")" ||
    die "no se pudo inspeccionar el contrato Compose frontend del baseline"

  if is_missing_label "$backend_revision" && is_missing_label "$frontend_revision" &&
    is_missing_label "$backend_source" && is_missing_label "$frontend_source" &&
    is_missing_label "$backend_release" && is_missing_label "$frontend_release" &&
    is_missing_label "$backend_runtime_epoch" && is_missing_label "$frontend_runtime_epoch" &&
    is_missing_label "$backend_db_epoch" && is_missing_label "$frontend_db_epoch" &&
    is_missing_label "$backend_compose_contract" && is_missing_label "$frontend_compose_contract"; then
    backend_ref="$(inspect_container_value "$BASELINE_BACKEND_CONTAINER_ID" '{{.Config.Image}}')"
    frontend_ref="$(inspect_container_value "$BASELINE_FRONTEND_CONTAINER_ID" '{{.Config.Image}}')"
    [[ "$backend_ref" == "ticketsadmin-backend" || "$backend_ref" == "ticketsadmin-backend:latest" ]] ||
      die "el backend legado no usa la referencia historica esperada"
    [[ "$frontend_ref" == "ticketsadmin-frontend" || "$frontend_ref" == "ticketsadmin-frontend:latest" ]] ||
      die "el frontend legado no usa la referencia historica esperada"
    BASELINE_IMAGE_REVISION="legacy-unversioned"
    BASELINE_IMAGE_SOURCE="legacy-compose-adoption"
    BASELINE_RELEASE_ID="legacy-unversioned-adoption"
    BASELINE_RUNTIME_EPOCH="legacy-unknown"
    BASELINE_DB_ROLLBACK_EPOCH="legacy-unknown"
    BASELINE_COMPOSE_CONTRACT_SHA256="legacy-unknown"
    ROLLBACK_ELIGIBLE="false"
  else
    [[ "$backend_revision" =~ ^[0-9a-f]{40}$ && "$frontend_revision" == "$backend_revision" ]] ||
      die "backend y frontend activos pertenecen a revisiones distintas"
    [[ "$backend_source" == "$IMAGE_SOURCE" && "$frontend_source" == "$backend_source" ]] ||
      die "backend y frontend activos tienen origenes OCI distintos"
    BASELINE_IMAGE_REVISION="$backend_revision"
    BASELINE_IMAGE_SOURCE="$backend_source"

    if ! is_missing_label "$backend_release"; then
      [[ "$frontend_release" == "$backend_release" ]] ||
        die "backend y frontend activos pertenecen a releases distintos"
      BASELINE_RELEASE_ID="$backend_release"
    else
      is_missing_label "$frontend_release" ||
        die "solo una imagen del baseline tiene identidad de release"
      backend_ref="$(inspect_container_value "$BASELINE_BACKEND_CONTAINER_ID" '{{.Config.Image}}')"
      frontend_ref="$(inspect_container_value "$BASELINE_FRONTEND_CONTAINER_ID" '{{.Config.Image}}')"
      legacy_backend_release="${backend_ref#ticketsadmin-backend:}"
      legacy_frontend_release="${frontend_ref#ticketsadmin-frontend:}"
      [[ "$legacy_backend_release" == "$legacy_frontend_release" ]] ||
        die "el baseline legado combina builds de releases distintos"
      [[ "$legacy_backend_release" =~ ^git-${BASELINE_IMAGE_REVISION}-run-[1-9][0-9]*-[1-9][0-9]*$ ]] ||
        die "el baseline legado no tiene referencias de release verificables"
      BASELINE_RELEASE_ID="$legacy_backend_release"
    fi

    if is_missing_label "$backend_runtime_epoch" && is_missing_label "$frontend_runtime_epoch" &&
      is_missing_label "$backend_db_epoch" && is_missing_label "$frontend_db_epoch" &&
      is_missing_label "$backend_compose_contract" && is_missing_label "$frontend_compose_contract"; then
      BASELINE_RUNTIME_EPOCH="pre-rollback-ledger"
      BASELINE_DB_ROLLBACK_EPOCH="pre-rollback-ledger"
      BASELINE_COMPOSE_CONTRACT_SHA256="pre-rollback-ledger"
      BASELINE_FIX_FORWARD_IDENTIFIED="true"
      ROLLBACK_ELIGIBLE="false"
    else
      [[ "$backend_runtime_epoch" == "$frontend_runtime_epoch" ]] ||
        die "backend y frontend activos tienen runtime epochs distintos"
      [[ "$backend_db_epoch" == "$frontend_db_epoch" ]] ||
        die "backend y frontend activos tienen DB rollback epochs distintos"
      [[ "$backend_compose_contract" == "$frontend_compose_contract" ]] ||
        die "backend y frontend activos tienen contratos Compose distintos"
      [[ "$backend_runtime_epoch" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$ ]] ||
        die "el runtime epoch del baseline es invalido"
      [[ "$backend_db_epoch" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$ ]] ||
        die "el DB rollback epoch del baseline es invalido"
      [[ "$backend_compose_contract" =~ ^[a-f0-9]{64}$ ]] ||
        die "el contrato Compose del baseline es invalido"
      BASELINE_RUNTIME_EPOCH="$backend_runtime_epoch"
      BASELINE_DB_ROLLBACK_EPOCH="$backend_db_epoch"
      BASELINE_COMPOSE_CONTRACT_SHA256="$backend_compose_contract"
      BASELINE_FIX_FORWARD_IDENTIFIED="true"
      if [[ "$BASELINE_RUNTIME_EPOCH" == "$EXPECTED_RUNTIME_EPOCH" &&
        "$BASELINE_DB_ROLLBACK_EPOCH" == "$EXPECTED_DB_ROLLBACK_EPOCH" &&
        "$BASELINE_COMPOSE_CONTRACT_SHA256" == "$COMPOSE_CONTRACT_SHA256" ]]; then
        ROLLBACK_ELIGIBLE="true"
      fi
    fi
  fi
  assert_volume_exclusive_to "$BASELINE_BACKEND_CONTAINER_ID"
}

authorize_baseline_transition() {
  if [[ "$FIRST_DEPLOY" == "true" || "$ROLLBACK_ELIGIBLE" == "true" ]]; then
    return
  fi

  if [[ "$ALLOW_LEGACY_ADOPTION" == "true" &&
    "$BASELINE_RELEASE_ID" == "legacy-unversioned-adoption" ]]; then
    [[ "$EXPECTED_BASELINE_RELEASE" == "$BASELINE_RELEASE_ID" &&
      "$EXPECTED_BASELINE_BACKEND_IMAGE_ID" == "$BASELINE_BACKEND_IMAGE_ID" &&
      "$EXPECTED_BASELINE_FRONTEND_IMAGE_ID" == "$BASELINE_FRONTEND_IMAGE_ID" ]] ||
      die "la adopcion legacy no coincide con el baseline autorizado"
    printf 'Adopcion legacy autorizada: esta transicion exige fix-forward si el candidato falla.\n' >&2
    return
  fi

  if [[ "$ALLOW_FIX_FORWARD_TRANSITION" == "true" &&
    "$BASELINE_FIX_FORWARD_IDENTIFIED" == "true" ]]; then
    [[ "$EXPECTED_BASELINE_RELEASE" == "$BASELINE_RELEASE_ID" &&
      "$EXPECTED_BASELINE_BACKEND_IMAGE_ID" == "$BASELINE_BACKEND_IMAGE_ID" &&
      "$EXPECTED_BASELINE_FRONTEND_IMAGE_ID" == "$BASELINE_FRONTEND_IMAGE_ID" ]] ||
      die "la transicion fix-forward no coincide con el baseline autorizado"
    printf 'Transicion incompatible autorizada: exige fix-forward si el candidato falla.\n' >&2
    return
  fi

  die "el baseline no admite rollback; la transicion requiere autorizacion explicita"
}

revalidate_baseline() {
  local backend_output frontend_output project_output current
  local -a project_containers=()

  backend_output="$(list_service_containers backend)" || die "no se pudo revalidar el backend"
  frontend_output="$(list_service_containers frontend)" || die "no se pudo revalidar el frontend"
  project_output="$(list_project_containers)" || die "no se pudo revalidar la topologia Compose"
  [[ -z "$project_output" ]] || mapfile -t project_containers <<<"$project_output"

  if [[ "$FIRST_DEPLOY" == "true" ]]; then
    [[ -z "$backend_output" && -z "$frontend_output" && -z "$project_output" ]] ||
      die "la topologia cambio durante el primer deploy"
    if data_volume_exists; then
      die "unexpected volume: el volumen aparecio durante el primer deploy"
    fi
    return
  fi

  [[ "$backend_output" == "$BASELINE_BACKEND_CONTAINER_ID" ]] ||
    die "el contenedor backend fue sustituido durante el checkpoint"
  [[ "$frontend_output" == "$BASELINE_FRONTEND_CONTAINER_ID" ]] ||
    die "el contenedor frontend fue sustituido durante el checkpoint"
  ((${#project_containers[@]} == 2)) || die "aparecio un servicio orphan durante el checkpoint"
  array_contains "$BASELINE_BACKEND_CONTAINER_ID" "${project_containers[@]}" ||
    die "el backend desaparecio del proyecto Compose"
  array_contains "$BASELINE_FRONTEND_CONTAINER_ID" "${project_containers[@]}" ||
    die "el frontend desaparecio del proyecto Compose"
  assert_container_healthy "$BASELINE_BACKEND_CONTAINER_ID" "backend"
  assert_container_healthy "$BASELINE_FRONTEND_CONTAINER_ID" "frontend"
  assert_backend_data_mount "$BASELINE_BACKEND_CONTAINER_ID"
  assert_data_volume
  assert_volume_exclusive_to "$BASELINE_BACKEND_CONTAINER_ID"

  current="$(inspect_container_value "$BASELINE_BACKEND_CONTAINER_ID" '{{.Image}}')"
  [[ "$current" == "$BASELINE_BACKEND_IMAGE_ID" ]] || die "la imagen activa del backend cambio"
  current="$(inspect_container_value "$BASELINE_FRONTEND_CONTAINER_ID" '{{.Image}}')"
  [[ "$current" == "$BASELINE_FRONTEND_IMAGE_ID" ]] || die "la imagen activa del frontend cambio"
  current="$(inspect_container_value "$BASELINE_BACKEND_CONTAINER_ID" '{{.State.StartedAt}}')"
  [[ "$current" == "$BASELINE_BACKEND_STARTED_AT" ]] || die "el backend fue reiniciado"
  current="$(inspect_container_value "$BASELINE_FRONTEND_CONTAINER_ID" '{{.State.StartedAt}}')"
  [[ "$current" == "$BASELINE_FRONTEND_STARTED_AT" ]] || die "el frontend fue reiniciado"
}

assert_fresh_main() {
  local head_revision fetched_revision

  git fetch --no-tags origin main
  head_revision="$(git rev-parse HEAD)"
  fetched_revision="$(git rev-parse FETCH_HEAD)"
  [[ "$head_revision" == "$REVISION" ]] || die "el checkout ya no coincide con la revision candidata"
  [[ "$fetched_revision" == "$REVISION" ]] || die "main avanzo mientras se preparaba el release"
}

create_predeploy_backup() {
  local timeout=900
  local helper_created_id evidence_sha evidence_bytes evidence_pages
  local host_sha host_bytes verify_sha verify_bytes verify_pages post_verify_sha post_verify_bytes
  local snapshot_identity published_identity published_sha published_bytes
  local created_at compact_timestamp checkpoint_name verifier_uid verifier_gid

  if [[ "$FIRST_DEPLOY" == "true" ]]; then
    return
  fi

  STAGING_DIR="$(mktemp -d "$BACKUP_DIR/.predeploy-backup.${RUN_ID}.${RUN_ATTEMPT}.XXXXXX")" ||
    die "no se pudo crear el staging privado del backup"
  STAGING_DIR="$(realpath -e -- "$STAGING_DIR")" || die "no se pudo resolver el staging"
  [[ "$STAGING_DIR" == "$BACKUP_DIR"/.predeploy-backup.* ]] || die "staging fuera del directorio permitido"

  CID_FILE="$STAGING_DIR/helper.cid"
  VERIFY_CID_FILE="$STAGING_DIR/verifier.cid"
  EVIDENCE_FILE="$STAGING_DIR/evidence.json"
  SNAPSHOT_FILE="$STAGING_DIR/snapshot.db"
  VERIFY_FILE="$STAGING_DIR/verification.json"
  MANIFEST_STAGING_FILE="$STAGING_DIR/manifest.json"

  helper_created_id="$(docker run --detach --rm --cidfile "$CID_FILE" --network none --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --tmpfs '/tmp:rw,nosuid,nodev,noexec,mode=0700,size=1g' --mount "type=volume,src=$DATA_VOLUME,dst=/data,readonly" --entrypoint sleep "$BACKEND_IMAGE_ID" "$timeout")" ||
    die "no se pudo iniciar el helper aislado de backup"
  HELPER_ID="$(<"$CID_FILE")"
  [[ "$HELPER_ID" =~ ^[0-9a-f]{64}$ && "$helper_created_id" == "$HELPER_ID" ]] ||
    die "Docker devolvio una identidad de helper invalida"
  docker exec "$HELPER_ID" node /app/dist/backup-db.mjs --source "$SQLITE_SOURCE_PATH" --output /tmp/snapshot.db --json >"$EVIDENCE_FILE"
  jq --exit-status --arg source "$SQLITE_SOURCE_PATH" '
    .contract == "ticketsadmin.sqlite-evidence" and
    .contractVersion == 1 and
    .ok == true and
    .operation == "backup" and
    .sourcePath == $source and
    .artifact.path == "/tmp/snapshot.db" and
    .artifact.storage == "sqlite-single-file-v1" and
    (.artifact.sha256 | test("^[a-f0-9]{64}$")) and
    (.artifact.bytes | type == "number" and . > 0 and floor == .) and
    (.artifact.pageCount | type == "number" and . > 0 and floor == .) and
    .checks.integrity == "ok" and
    .checks.foreignKeys == "ok" and
    .checks.ticketManagerSchema == "ok"
  ' "$EVIDENCE_FILE" >/dev/null || die "el helper no emitio evidencia SQLite valida"

  docker exec "$HELPER_ID" cat /tmp/snapshot.db >"$SNAPSHOT_FILE"
  cleanup_helper

  evidence_sha="$(jq --exit-status --raw-output '.artifact.sha256' "$EVIDENCE_FILE")"
  evidence_bytes="$(jq --exit-status --raw-output '.artifact.bytes' "$EVIDENCE_FILE")"
  evidence_pages="$(jq --exit-status --raw-output '.artifact.pageCount' "$EVIDENCE_FILE")"
  host_sha="$(sha256sum -- "$SNAPSHOT_FILE")"
  host_sha="${host_sha%% *}"
  host_bytes="$(stat -c '%s' -- "$SNAPSHOT_FILE")"
  [[ "$host_sha" == "$evidence_sha" ]] || die "el SHA-256 transportado no coincide"
  [[ "$host_bytes" == "$evidence_bytes" ]] || die "los bytes transportados no coinciden"

  # Conserva staging 0700 y evidencia 0600: con todas las capabilities
  # descartadas, el verificador debe usar la misma identidad que creo la copia.
  verifier_uid="$(id -u)"
  verifier_gid="$(id -g)"
  docker run --rm --cidfile "$VERIFY_CID_FILE" --network none --read-only --user "$verifier_uid:$verifier_gid" --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --tmpfs "/tmp:rw,nosuid,nodev,noexec,mode=0700,uid=$verifier_uid,gid=$verifier_gid,size=128m" --mount "type=bind,src=$STAGING_DIR,dst=/evidence,readonly" --entrypoint timeout "$BACKEND_IMAGE_ID" 120 node /app/dist/verify-db.mjs --source /evidence/snapshot.db --expect-evidence /evidence/evidence.json --json >"$VERIFY_FILE"
  jq --exit-status '
    .contract == "ticketsadmin.sqlite-evidence" and
    .contractVersion == 1 and
    .ok == true and
    .operation == "verify" and
    .artifact.storage == "sqlite-single-file-v1" and
    .checks.integrity == "ok" and
    .checks.foreignKeys == "ok" and
    .checks.ticketManagerSchema == "ok" and
    .comparison.matched == true
  ' "$VERIFY_FILE" >/dev/null || die "la reverificacion transportada no produjo matched=true"
  verify_sha="$(jq --exit-status --raw-output '.artifact.sha256' "$VERIFY_FILE")"
  verify_bytes="$(jq --exit-status --raw-output '.artifact.bytes' "$VERIFY_FILE")"
  verify_pages="$(jq --exit-status --raw-output '.artifact.pageCount' "$VERIFY_FILE")"
  [[ "$verify_sha" == "$evidence_sha" ]] || die "la reverificacion cambio el SHA-256"
  [[ "$verify_bytes" == "$evidence_bytes" ]] || die "la reverificacion cambio los bytes"
  [[ "$verify_pages" == "$evidence_pages" ]] || die "la reverificacion cambio las paginas"

  post_verify_sha="$(sha256sum -- "$SNAPSHOT_FILE")"
  post_verify_sha="${post_verify_sha%% *}"
  post_verify_bytes="$(stat -c '%s' -- "$SNAPSHOT_FILE")"
  [[ "$post_verify_sha" == "$evidence_sha" && "$post_verify_bytes" == "$evidence_bytes" ]] ||
    die "el snapshot cambio despues de reverificarlo"

  # La publicacion solo ocurre si el baseline, main y las referencias siguen
  # siendo exactamente los capturados antes de ejecutar codigo candidato.
  assert_fresh_main
  revalidate_baseline
  revalidate_candidates

  created_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  compact_timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
  checkpoint_name="tickets-predeploy-${compact_timestamp}-git-${REVISION:0:12}-run-${RUN_ID}-${RUN_ATTEMPT}"
  PUBLISHED_BACKUP_PATH="$BACKUP_DIR/$checkpoint_name.db"
  PUBLISHED_MANIFEST_PATH="$BACKUP_DIR/$checkpoint_name.manifest.json"
  [[ ! -e "$PUBLISHED_BACKUP_PATH" && ! -L "$PUBLISHED_BACKUP_PATH" ]] ||
    die "el nombre final del backup ya existe"
  [[ ! -e "$PUBLISHED_MANIFEST_PATH" && ! -L "$PUBLISHED_MANIFEST_PATH" ]] ||
    die "el nombre final del manifiesto ya existe"

  sync "$SNAPSHOT_FILE"
  ln -- "$SNAPSHOT_FILE" "$PUBLISHED_BACKUP_PATH"
  sync "$PUBLISHED_BACKUP_PATH"
  sync "$BACKUP_DIR"
  snapshot_identity="$(stat -c '%d:%i' -- "$SNAPSHOT_FILE")"
  published_identity="$(stat -c '%d:%i' -- "$PUBLISHED_BACKUP_PATH")"
  published_sha="$(sha256sum -- "$PUBLISHED_BACKUP_PATH")"
  published_sha="${published_sha%% *}"
  published_bytes="$(stat -c '%s' -- "$PUBLISHED_BACKUP_PATH")"
  [[ ! -L "$PUBLISHED_BACKUP_PATH" && "$published_identity" == "$snapshot_identity" ]] ||
    die "el backup publicado ya no es el hardlink verificado"
  [[ "$published_sha" == "$evidence_sha" && "$published_bytes" == "$evidence_bytes" ]] ||
    die "el backup publicado no conserva la evidencia"

  jq -n \
    --arg contract "ticketsadmin.predeploy-checkpoint" \
    --arg createdAt "$created_at" \
    --arg repository "$REPOSITORY" \
    --arg revision "$REVISION" \
    --arg runId "$RUN_ID" \
    --arg runAttempt "$RUN_ATTEMPT" \
    --arg backendContainer "$BASELINE_BACKEND_CONTAINER_ID" \
    --arg frontendContainer "$BASELINE_FRONTEND_CONTAINER_ID" \
    --arg backendBaselineImage "$BASELINE_BACKEND_IMAGE_ID" \
    --arg frontendBaselineImage "$BASELINE_FRONTEND_IMAGE_ID" \
    --arg backendStartedAt "$BASELINE_BACKEND_STARTED_AT" \
    --arg frontendStartedAt "$BASELINE_FRONTEND_STARTED_AT" \
    --arg baselineRevision "$BASELINE_IMAGE_REVISION" \
    --arg baselineSource "$BASELINE_IMAGE_SOURCE" \
    --arg baselineReleaseId "$BASELINE_RELEASE_ID" \
    --arg baselineRuntimeEpoch "$BASELINE_RUNTIME_EPOCH" \
    --arg baselineDbRollbackEpoch "$BASELINE_DB_ROLLBACK_EPOCH" \
    --arg baselineComposeContract "$BASELINE_COMPOSE_CONTRACT_SHA256" \
    --argjson rollbackEligible "$ROLLBACK_ELIGIBLE" \
    --arg backendCandidateImage "$BACKEND_IMAGE_ID" \
    --arg frontendCandidateImage "$FRONTEND_IMAGE_ID" \
    --arg candidateRuntimeEpoch "$EXPECTED_RUNTIME_EPOCH" \
    --arg candidateDbRollbackEpoch "$EXPECTED_DB_ROLLBACK_EPOCH" \
    --arg candidateComposeContract "$COMPOSE_CONTRACT_SHA256" \
    --arg dataVolume "$DATA_VOLUME" \
    --arg source "$SQLITE_SOURCE_PATH" \
    --arg snapshot "$(basename -- "$PUBLISHED_BACKUP_PATH")" \
    --arg sha256 "$evidence_sha" \
    --argjson bytes "$evidence_bytes" \
    --argjson pageCount "$evidence_pages" \
    '{
      contract: $contract,
      contractVersion: 1,
      complete: true,
      createdAt: $createdAt,
      repository: $repository,
      revision: $revision,
      runId: $runId,
      runAttempt: $runAttempt,
      baseline: {
        revision: $baselineRevision,
        source: $baselineSource,
        releaseId: $baselineReleaseId,
        compatibility: {
          runtimeEpoch: $baselineRuntimeEpoch,
          dbRollbackEpoch: $baselineDbRollbackEpoch,
          composeContractSha256: $baselineComposeContract,
          rollbackEligible: $rollbackEligible
        },
        backend: {containerId: $backendContainer, imageId: $backendBaselineImage, startedAt: $backendStartedAt},
        frontend: {containerId: $frontendContainer, imageId: $frontendBaselineImage, startedAt: $frontendStartedAt}
      },
      candidate: {
        backendImageId: $backendCandidateImage,
        frontendImageId: $frontendCandidateImage,
        compatibility: {
          runtimeEpoch: $candidateRuntimeEpoch,
          dbRollbackEpoch: $candidateDbRollbackEpoch,
          composeContractSha256: $candidateComposeContract
        }
      },
      dataVolume: {name: $dataVolume, source: $source},
      snapshot: {file: $snapshot, sha256: $sha256, bytes: $bytes, pageCount: $pageCount},
      checks: {integrity: "ok", foreignKeys: "ok", ticketManagerSchema: "ok"}
    }' >"$MANIFEST_STAGING_FILE"
  chmod 600 "$MANIFEST_STAGING_FILE"
  sync "$MANIFEST_STAGING_FILE"
  published_identity="$(stat -c '%d:%i' -- "$PUBLISHED_BACKUP_PATH")"
  published_sha="$(sha256sum -- "$PUBLISHED_BACKUP_PATH")"
  published_sha="${published_sha%% *}"
  published_bytes="$(stat -c '%s' -- "$PUBLISHED_BACKUP_PATH")"
  [[ ! -L "$PUBLISHED_BACKUP_PATH" && "$published_identity" == "$snapshot_identity" ]] ||
    die "el backup fue sustituido antes de publicar el manifiesto"
  [[ "$published_sha" == "$evidence_sha" && "$published_bytes" == "$evidence_bytes" ]] ||
    die "el backup cambio antes de publicar el manifiesto"
  ln -- "$MANIFEST_STAGING_FILE" "$PUBLISHED_MANIFEST_PATH"
  sync "$PUBLISHED_MANIFEST_PATH"
  sync "$BACKUP_DIR"
}

deploy_candidates() {
  TICKETSADMIN_BACKEND_IMAGE="$BACKEND_IMAGE_ID" TICKETSADMIN_FRONTEND_IMAGE="$FRONTEND_IMAGE_ID" docker compose up -d --remove-orphans --no-build --wait --wait-timeout 180
}

verify_running_release() {
  local expected_backend_image="$1"
  local expected_frontend_image="$2"
  local description="$3"
  local backend_output frontend_output project_output deployed_image
  local -a backend_containers=()
  local -a frontend_containers=()
  local -a project_containers=()

  backend_output="$(list_service_containers backend)" || die "no se pudo inspeccionar el backend desplegado"
  frontend_output="$(list_service_containers frontend)" || die "no se pudo inspeccionar el frontend desplegado"
  project_output="$(list_project_containers)" || die "no se pudo inspeccionar la topologia desplegada"
  [[ -z "$backend_output" ]] || mapfile -t backend_containers <<<"$backend_output"
  [[ -z "$frontend_output" ]] || mapfile -t frontend_containers <<<"$frontend_output"
  [[ -z "$project_output" ]] || mapfile -t project_containers <<<"$project_output"

  ((${#backend_containers[@]} == 1 && ${#frontend_containers[@]} == 1)) ||
    die "$description no produjo exactamente un backend y un frontend"
  ((${#project_containers[@]} == 2)) || die "$description dejo una topologia Compose ambigua"
  DEPLOYED_BACKEND_CONTAINER_ID="${backend_containers[0]}"
  DEPLOYED_FRONTEND_CONTAINER_ID="${frontend_containers[0]}"
  array_contains "$DEPLOYED_BACKEND_CONTAINER_ID" "${project_containers[@]}" ||
    die "el backend desplegado no pertenece al proyecto esperado"
  array_contains "$DEPLOYED_FRONTEND_CONTAINER_ID" "${project_containers[@]}" ||
    die "el frontend desplegado no pertenece al proyecto esperado"

  assert_container_healthy "$DEPLOYED_BACKEND_CONTAINER_ID" "backend de $description"
  assert_container_healthy "$DEPLOYED_FRONTEND_CONTAINER_ID" "frontend de $description"
  deployed_image="$(inspect_container_value "$DEPLOYED_BACKEND_CONTAINER_ID" '{{.Image}}')"
  [[ "$deployed_image" == "$expected_backend_image" ]] ||
    die "el backend no ejecuta la imagen exacta esperada para $description"
  deployed_image="$(inspect_container_value "$DEPLOYED_FRONTEND_CONTAINER_ID" '{{.Image}}')"
  [[ "$deployed_image" == "$expected_frontend_image" ]] ||
    die "el frontend no ejecuta la imagen exacta esperada para $description"
  assert_backend_data_mount "$DEPLOYED_BACKEND_CONTAINER_ID"
  assert_data_volume
  assert_volume_exclusive_to "$DEPLOYED_BACKEND_CONTAINER_ID"
}

verify_deployed_release() {
  verify_running_release "$BACKEND_IMAGE_ID" "$FRONTEND_IMAGE_ID" "el rollout candidato"
}

contain_first_deploy_candidate() {
  (
    set -Eeuo pipefail
    local containers_output container_id service image status
    local -a containers=()

    [[ "$FIRST_DEPLOY" == "true" ]] || die "contencion invocada fuera del primer deploy"
    containers_output="$(list_project_containers)" ||
      die "no se pudo inspeccionar el primer deploy fallido"
    [[ -z "$containers_output" ]] || mapfile -t containers <<<"$containers_output"

    for container_id in "${containers[@]}"; do
      [[ "$container_id" =~ ^[0-9a-f]{64}$ ]] || die "el primer deploy dejo un contenedor ambiguo"
      service="$(inspect_container_value "$container_id" '{{index .Config.Labels "com.docker.compose.service"}}')" ||
        die "no se pudo identificar un servicio del primer deploy"
      image="$(inspect_container_value "$container_id" '{{.Image}}')" ||
        die "no se pudo identificar una imagen del primer deploy"
      case "$service:$image" in
        "backend:$BACKEND_IMAGE_ID" | "frontend:$FRONTEND_IMAGE_ID") ;;
        *) die "el primer deploy contiene una identidad ajena a las candidatas" ;;
      esac
    done

    if ((${#containers[@]} > 0)); then
      docker stop --time 30 "${containers[@]}" >/dev/null ||
        die "Docker no pudo detener las candidatas del primer deploy"
    fi
    for container_id in "${containers[@]}"; do
      status="$(inspect_container_value "$container_id" '{{.State.Status}}')" ||
        die "no se pudo verificar la contencion del primer deploy"
      [[ "$status" != "running" ]] || die "una candidata del primer deploy sigue ejecutandose"
    done
  )
}

rollback_application() {
  (
    set -Eeuo pipefail

    [[ "$ROLLBACK_ACTIVE" == "true" ]] || die "rollback invocado fuera de una recuperacion"
    [[ "$FIRST_DEPLOY" != "true" && "$ROLLBACK_ELIGIBLE" == "true" ]] ||
      die "el baseline no es elegible para rollback"
    [[ "$(docker image inspect --format '{{.Id}}' "$BASELINE_BACKEND_IMAGE_ID")" == "$BASELINE_BACKEND_IMAGE_ID" ]] ||
      die "la imagen backend del baseline ya no existe"
    [[ "$(docker image inspect --format '{{.Id}}' "$BASELINE_FRONTEND_IMAGE_ID")" == "$BASELINE_FRONTEND_IMAGE_ID" ]] ||
      die "la imagen frontend del baseline ya no existe"
    assert_compose_contract_unchanged

    TICKETSADMIN_BACKEND_IMAGE="$BASELINE_BACKEND_IMAGE_ID" \
      TICKETSADMIN_FRONTEND_IMAGE="$BASELINE_FRONTEND_IMAGE_ID" \
      docker compose up -d --no-build --wait --wait-timeout 180 ||
      die "Compose no pudo restaurar las imagenes baseline"
    verify_running_release \
      "$BASELINE_BACKEND_IMAGE_ID" \
      "$BASELINE_FRONTEND_IMAGE_ID" \
      "el rollback"
    smoke_services
  )
}

smoke_legacy_baseline() {
  local spa

  [[ "$BASELINE_RELEASE_ID" == "legacy-unversioned-adoption" &&
    "$ALLOW_LEGACY_ADOPTION" == "true" ]] ||
    die "el smoke healthz solo esta permitido para una adopcion legacy autorizada"
  [[ "$(curl -fsS --max-time 5 http://127.0.0.1:5000/api/healthz)" == '{"status":"ok"}' ]] ||
    die "health historico directo del backend fallo"
  spa="$(curl -fsS --max-time 5 http://127.0.0.1:3000/)" || die "la SPA historica no respondio"
  grep -Fq '<div id="root"></div>' <<<"$spa" || die "el frontend historico no sirvio la SPA esperada"
  [[ "$(curl -fsS --max-time 5 http://127.0.0.1:3000/api/healthz)" == '{"status":"ok"}' ]] ||
    die "health historico del backend a traves de Nginx fallo"
}

smoke_services() {
  local spa
  [[ "$(curl -fsS --max-time 5 http://127.0.0.1:5000/api/readyz)" == '{"status":"ready"}' ]] ||
    die "readiness directa del backend fallo"
  spa="$(curl -fsS --max-time 5 http://127.0.0.1:3000/)" || die "la SPA no respondio"
  grep -Fq '<div id="root"></div>' <<<"$spa" || die "el frontend no sirvio la SPA esperada"
  [[ "$(curl -fsS --max-time 5 http://127.0.0.1:3000/api/readyz)" == '{"status":"ready"}' ]] ||
    die "readiness del backend a traves de Nginx fallo"
}

smoke_captured_baseline() {
  if [[ "$BASELINE_RELEASE_ID" == "legacy-unversioned-adoption" ]]; then
    smoke_legacy_baseline
  else
    smoke_services
  fi
}

write_output() {
  local key="$1"
  local value="$2"
  [[ -z "${GITHUB_OUTPUT:-}" ]] && return
  [[ "$key" =~ ^[a-z_]+$ && "$value" != *$'\n'* && "$value" != *$'\r'* ]] ||
    die "salida de workflow invalida"
  printf '%s=%s\n' "$key" "$value" >>"$GITHUB_OUTPUT"
}

main() {
  local required recovery_status

  install_traps
  parse_args "$@"
  for required in basename bash chmod curl date dirname docker flock git grep id jq ln mktemp mv realpath rm rmdir sha256sum stat sync; do
    require_command "$required"
  done
  validate_inputs

  exec 9>"$LOCK_FILE"
  flock --exclusive --nonblock 9 || die "otro deploy u operacion mantiene el lock"

  resolve_repository_contracts
  resolve_compose_identity
  load_release_state
  reconcile_release_state
  recovery_status="$RECOVERY_EXIT_STATUS"
  if ((recovery_status != 0)); then
    exit "$recovery_status"
  fi
  revalidate_candidates
  capture_baseline
  assert_ledger_matches_captured_baseline
  authorize_baseline_transition
  if [[ "$FIRST_DEPLOY" != "true" ]]; then
    smoke_captured_baseline
  fi
  assert_fresh_main
  create_predeploy_backup
  assert_fresh_main
  revalidate_baseline
  revalidate_candidates
  assert_compose_contract_unchanged
  register_pending_release
  release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
    "rolling_out" || die "no se pudo armar durablemente el rollout"
  FAILURE_PHASE="candidate-compose-up"
  ROLLOUT_STARTED="true"
  deploy_candidates
  FAILURE_PHASE="candidate-verification"
  verify_deployed_release
  FAILURE_PHASE="candidate-smoke"
  smoke_services
  RELEASE_VERIFIED="true"
  release_state_update_pending "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" \
    "candidate_verified" || die "la candidata verificada no pudo registrarse"
  release_state_promote_candidate "$RELEASE_STATE_DIR" "$REPOSITORY" "$COMPOSE_PROJECT" "$DATA_VOLUME" ||
    die "la candidata verificada no pudo promoverse en el ledger"
  refresh_release_state
  PENDING_REGISTERED="false"
  ROLLOUT_STARTED="false"
  FAILURE_PHASE="completed"

  write_output deployed "true"
  write_output rollback_attempted "false"
  write_output rollback_status "not-needed"
  write_output rollback_eligible "$ROLLBACK_ELIGIBLE"
  write_output first_deploy "$FIRST_DEPLOY"
  write_output backup_path "$PUBLISHED_BACKUP_PATH"
  write_output manifest_path "$PUBLISHED_MANIFEST_PATH"
  if [[ -n "$PUBLISHED_MANIFEST_PATH" ]]; then
    write_output backup_created "true"
  else
    write_output backup_created "false"
  fi
  write_output baseline_backend_container_id "$BASELINE_BACKEND_CONTAINER_ID"
  write_output baseline_frontend_container_id "$BASELINE_FRONTEND_CONTAINER_ID"
  write_output baseline_backend_image_id "$BASELINE_BACKEND_IMAGE_ID"
  write_output baseline_frontend_image_id "$BASELINE_FRONTEND_IMAGE_ID"
  write_output deployed_backend_container_id "$DEPLOYED_BACKEND_CONTAINER_ID"
  write_output deployed_frontend_container_id "$DEPLOYED_FRONTEND_CONTAINER_ID"
  printf 'Release %s desplegada y verificada.\n' "$REVISION"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
