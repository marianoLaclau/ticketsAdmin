#!/usr/bin/env bash

# Ledger durable usado por deploy-release.sh. Este archivo se carga con
# `source`; no modifica las opciones ni los traps del proceso llamador.
# Todas las funciones reciben el directorio, repositorio, proyecto y volumen
# de forma explicita y publican el documento completo de manera atomica.

readonly RELEASE_STATE_CONTRACT="ticketsadmin.application-release-state"
readonly RELEASE_STATE_CONTRACT_VERSION=1
readonly RELEASE_STATE_FILENAME="release-state.json"
readonly RELEASE_STATE_MAX_BYTES=131072

release_state_error() {
  printf 'Estado de release invalido: %s\n' "$1" >&2
  return 1
}

release_state_validate_directory() {
  local directory="$1"
  local canonical owner mode

  [[ "$directory" == /* && -d "$directory" && ! -L "$directory" ]] ||
    release_state_error "el directorio debe ser absoluto, real y preexistente" || return
  canonical="$(realpath -e -- "$directory")" ||
    release_state_error "no se pudo resolver el directorio" || return
  [[ "$canonical" == "$directory" ]] ||
    release_state_error "el directorio debe usar su ruta canonica" || return
  owner="$(stat -c '%u' -- "$directory")" ||
    release_state_error "no se pudo inspeccionar el propietario del directorio" || return
  mode="$(stat -c '%a' -- "$directory")" ||
    release_state_error "no se pudo inspeccionar el modo del directorio" || return
  [[ "$owner" == "$(id -u)" ]] ||
    release_state_error "el directorio pertenece a otra identidad" || return
  [[ "$mode" == "700" ]] ||
    release_state_error "el directorio debe tener modo 0700" || return
  [[ -w "$directory" && -x "$directory" ]] ||
    release_state_error "el directorio no es escribible" || return
}

release_state_validate_document() {
  local document="$1"
  local repository="$2"
  local project="$3"
  local data_volume="$4"

  jq -e \
    --arg contract "$RELEASE_STATE_CONTRACT" \
    --argjson contractVersion "$RELEASE_STATE_CONTRACT_VERSION" \
    --arg repository "$repository" \
    --arg project "$project" \
    --arg dataVolume "$data_volume" '
    def exact($keys): (keys_unsorted | sort) == ($keys | sort);
    def timestamp:
      type == "string" and
      test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$");
    def image_id: type == "string" and test("^sha256:[a-f0-9]{64}$");
    def revision: type == "string" and test("^[a-f0-9]{40}$");
    def source: type == "string" and test("^[A-Za-z][A-Za-z0-9+.-]*://[A-Za-z0-9._:/-]+$");
    def positive_id: type == "string" and test("^[1-9][0-9]*$");
    def safe_id: type == "string" and test("^[A-Za-z0-9][A-Za-z0-9_.-]{0,255}$");
    def managed_release:
      exact(["kind", "releaseId", "revision", "source", "runId", "runAttempt",
        "backendImageId", "frontendImageId", "runtimeEpoch", "dbRollbackEpoch",
        "composeContractSha256", "activatedAt"]) and
      .kind == "managed" and (.revision | revision) and (.source | source) and
      (.runId | positive_id) and (.runAttempt | positive_id) and
      .releaseId == "git-\(.revision)-run-\(.runId)-\(.runAttempt)" and
      (.backendImageId | image_id) and (.frontendImageId | image_id) and
      .backendImageId != .frontendImageId and
      (.runtimeEpoch | type == "string" and test("^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")) and
      (.dbRollbackEpoch | type == "string" and test("^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")) and
      (.composeContractSha256 | type == "string" and test("^[a-f0-9]{64}$")) and
      (.activatedAt | timestamp);
    def pre_contract_release:
      exact(["kind", "releaseId", "revision", "source", "runId", "runAttempt",
        "backendImageId", "frontendImageId", "runtimeEpoch", "dbRollbackEpoch",
        "composeContractSha256", "activatedAt"]) and
      .kind == "pre-contract" and (.revision | revision) and (.source | source) and
      (.runId | positive_id) and (.runAttempt | positive_id) and
      .releaseId == "git-\(.revision)-run-\(.runId)-\(.runAttempt)" and
      (.backendImageId | image_id) and (.frontendImageId | image_id) and
      .backendImageId != .frontendImageId and
      .runtimeEpoch == "pre-rollback-ledger" and
      .dbRollbackEpoch == "pre-rollback-ledger" and
      .composeContractSha256 == "pre-rollback-ledger" and
      (.activatedAt | timestamp);
    def legacy_release:
      exact(["kind", "releaseId", "revision", "source", "runId", "runAttempt",
        "backendImageId", "frontendImageId", "runtimeEpoch", "dbRollbackEpoch",
        "composeContractSha256", "activatedAt"]) and
      .kind == "legacy" and .releaseId == "legacy-unversioned-adoption" and
      .revision == "legacy-unversioned" and .source == "legacy-compose-adoption" and
      .runId == null and .runAttempt == null and
      (.backendImageId | image_id) and (.frontendImageId | image_id) and
      .backendImageId != .frontendImageId and
      .runtimeEpoch == "legacy-unknown" and .dbRollbackEpoch == "legacy-unknown" and
      .composeContractSha256 == "legacy-unknown" and (.activatedAt | timestamp);
    def release: type == "object" and (managed_release or pre_contract_release or legacy_release);
    def nullable_release: . == null or release;
    def checkpoint:
      . == null or (
        type == "object" and exact(["manifest", "manifestSha256"]) and
        (.manifest | type == "string" and test("^[A-Za-z0-9][A-Za-z0-9_.-]{0,255}\\.manifest\\.json$")) and
        (.manifest | contains("/") | not) and (.manifest | contains("..") | not) and
        (.manifestSha256 | type == "string" and test("^[a-f0-9]{64}$"))
      );
    def failure_code:
      . == "deploy_failed" or . == "smoke_failed" or . == "rollback_failed" or
      . == "runtime_unknown" or . == "state_mismatch" or
      . == "first_deploy_containment_failed" or . == "incompatible_baseline";
    def failure:
      . == null or (
        type == "object" and exact(["code", "exitCode"]) and
        (.code | failure_code) and
        (.exitCode | type == "number" and floor == . and . >= 1 and . <= 255)
      );
    def pending:
      type == "object" and
      exact(["attemptId", "phase", "policy", "startedAt", "updatedAt", "baseline",
        "candidate", "checkpoint", "failure"]) and
      (.attemptId | safe_id) and .attemptId == .candidate.releaseId and
      (.phase == "prepared" or .phase == "rolling_out" or
        .phase == "retrying_forward" or
        .phase == "candidate_verified" or .phase == "rolling_back" or
        .phase == "containing_first_deploy" or
        .phase == "first_deploy_contained" or .phase == "manual_intervention" or
        .phase == "rollback_failed") and
      (.policy == "rollback-compatible" or .policy == "legacy-adoption" or
        .policy == "fix-forward" or .policy == "first-deploy") and
      (if .phase == "retrying_forward" then
        (.policy == "legacy-adoption" or .policy == "fix-forward")
      else true end) and
      (.startedAt | timestamp) and (.updatedAt | timestamp) and
      (.baseline | nullable_release) and (.candidate | managed_release) and
      (.checkpoint | checkpoint) and (.failure | failure);
    def last_attempt:
      . == null or (
        type == "object" and
        exact(["attemptId", "status", "completedAt", "releaseId", "code", "exitCode"]) and
        (.attemptId | safe_id) and (.releaseId | safe_id) and
        (.status == "deployed" or .status == "rolled_back" or .status == "aborted" or
          .status == "contained" or .status == "manual_intervention" or
          .status == "rollback_failed") and
        (.completedAt | timestamp) and
        (.code == null or (.code | failure_code)) and
        (.exitCode == null or (.exitCode | type == "number" and floor == . and . >= 1 and . <= 255))
      );
    type == "object" and
    exact(["contract", "contractVersion", "generation", "updatedAt", "repository",
      "project", "dataVolume", "current", "previous", "pending", "lastAttempt"]) and
    .contract == $contract and .contractVersion == $contractVersion and
    (.generation | type == "number" and floor == . and . >= 1) and
    (.updatedAt | timestamp) and .repository == $repository and
    .project == $project and .dataVolume == $dataVolume and
    (.current | nullable_release) and (.previous | nullable_release) and
    (.lastAttempt | last_attempt) and
    (
      .pending == null or
      ((.pending | pending) and
        .pending.baseline == .current and
        (if .pending.policy == "first-deploy" then
          .pending.baseline == null and .current == null and .pending.checkpoint == null
        elif .pending.policy == "rollback-compatible" then
          .pending.baseline.kind == "managed" and .pending.checkpoint != null and
          .pending.baseline.runtimeEpoch == .pending.candidate.runtimeEpoch and
          .pending.baseline.dbRollbackEpoch == .pending.candidate.dbRollbackEpoch and
          .pending.baseline.composeContractSha256 == .pending.candidate.composeContractSha256
        elif .pending.policy == "legacy-adoption" then
          .pending.baseline.kind == "legacy" and .pending.checkpoint != null
        else
          .pending.baseline != null and .pending.checkpoint != null
        end))
    )
  ' <<<"$document" >/dev/null || release_state_error "el documento no cumple el contrato v1"
}

release_state_validate_file() {
  local file="$1"
  local repository="$2"
  local project="$3"
  local data_volume="$4"
  local canonical owner mode links bytes document

  [[ -f "$file" && ! -L "$file" ]] ||
    release_state_error "el ledger debe ser un archivo regular, no un symlink" || return
  canonical="$(realpath -e -- "$file")" ||
    release_state_error "no se pudo resolver el ledger" || return
  [[ "$canonical" == "$file" ]] ||
    release_state_error "el ledger debe usar su ruta canonica" || return
  owner="$(stat -c '%u' -- "$file")" ||
    release_state_error "no se pudo inspeccionar el propietario del ledger" || return
  mode="$(stat -c '%a' -- "$file")" ||
    release_state_error "no se pudo inspeccionar el modo del ledger" || return
  links="$(stat -c '%h' -- "$file")" ||
    release_state_error "no se pudo inspeccionar los enlaces del ledger" || return
  bytes="$(stat -c '%s' -- "$file")" ||
    release_state_error "no se pudo inspeccionar el tamano del ledger" || return
  [[ "$owner" == "$(id -u)" ]] || release_state_error "el ledger pertenece a otra identidad" || return
  [[ "$mode" == "600" ]] || release_state_error "el ledger debe tener modo 0600" || return
  [[ "$links" == "1" ]] || release_state_error "el ledger no admite hardlinks" || return
  [[ "$bytes" =~ ^[0-9]+$ && "$bytes" -gt 0 && "$bytes" -le "$RELEASE_STATE_MAX_BYTES" ]] ||
    release_state_error "el ledger excede el tamano permitido o esta vacio" || return
  document="$(<"$file")" || release_state_error "no se pudo leer el ledger" || return
  release_state_validate_document "$document" "$repository" "$project" "$data_volume"
}

release_state_load() {
  local directory="$1"
  local repository="$2"
  local project="$3"
  local data_volume="$4"
  local file="$directory/$RELEASE_STATE_FILENAME"

  release_state_validate_directory "$directory" || return
  [[ -e "$file" || -L "$file" ]] || return 2
  release_state_validate_file "$file" "$repository" "$project" "$data_volume" || return
  jq -cS . -- "$file"
}

release_state_publish_document() {
  local directory="$1"
  local repository="$2"
  local project="$3"
  local data_volume="$4"
  local document="$5"
  local file="$directory/$RELEASE_STATE_FILENAME"
  local temporary=""

  release_state_validate_directory "$directory" || return
  release_state_validate_document "$document" "$repository" "$project" "$data_volume" || return
  temporary="$(mktemp "$directory/.release-state.XXXXXX")" ||
    release_state_error "no se pudo crear el temporal del ledger" || return
  if ! printf '%s\n' "$document" >"$temporary" ||
    ! chmod 600 "$temporary" ||
    ! release_state_validate_file "$temporary" "$repository" "$project" "$data_volume" ||
    ! sync "$temporary" ||
    ! mv -T -- "$temporary" "$file" ||
    ! sync "$file" ||
    ! sync -f "$directory"; then
    [[ -n "$temporary" && -e "$temporary" && "$temporary" == "$directory"/.release-state.* ]] &&
      rm -f -- "$temporary"
    release_state_error "no se pudo publicar el ledger durable" || return
  fi
}

release_state_begin_pending() {
  local directory="$1" repository="$2" project="$3" data_volume="$4"
  local baseline_json="$5" candidate_json="$6" policy="$7" checkpoint_json="$8"
  local state now document load_status

  if state="$(release_state_load "$directory" "$repository" "$project" "$data_volume")"; then
    :
  else
    load_status=$?
    [[ "$load_status" == "2" ]] || return "$load_status"
    state="null"
  fi
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)" || release_state_error "no se pudo fechar el intento" || return
  document="$(jq -cnS \
    --arg contract "$RELEASE_STATE_CONTRACT" \
    --argjson contractVersion "$RELEASE_STATE_CONTRACT_VERSION" \
    --arg repository "$repository" --arg project "$project" --arg dataVolume "$data_volume" \
    --arg now "$now" --arg policy "$policy" \
    --argjson state "$state" --argjson baseline "$baseline_json" \
    --argjson candidate "$candidate_json" --argjson checkpoint "$checkpoint_json" '
      if $state == null then
        {contract: $contract, contractVersion: $contractVersion, generation: 1,
          updatedAt: $now, repository: $repository, project: $project,
          dataVolume: $dataVolume, current: $baseline, previous: null,
          pending: null, lastAttempt: null}
      else
        if $state.pending != null or $state.current != $baseline then
          error("state is not ready for a new pending release")
        else $state | .generation += 1 | .updatedAt = $now end
      end |
      .pending = {
        attemptId: $candidate.releaseId, phase: "prepared", policy: $policy,
        startedAt: $now, updatedAt: $now, baseline: $baseline,
        candidate: $candidate, checkpoint: $checkpoint, failure: null
      }
    ')" || release_state_error "no se pudo construir el intento pendiente" || return
  release_state_publish_document "$directory" "$repository" "$project" "$data_volume" "$document"
}

release_state_update_pending() {
  local directory="$1" repository="$2" project="$3" data_volume="$4"
  local phase="$5" code="${6:-}" exit_code="${7:-}"
  local state now document failure_json

  state="$(release_state_load "$directory" "$repository" "$project" "$data_volume")" || return
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)" || release_state_error "no se pudo fechar la transicion" || return
  if [[ -n "$code" ]]; then
    [[ "$exit_code" =~ ^[1-9][0-9]*$ && "$exit_code" -le 255 ]] ||
      release_state_error "exit code invalido" || return
    failure_json="$(jq -cn --arg code "$code" --argjson exitCode "$exit_code" '{code: $code, exitCode: $exitCode}')" || return
  else
    failure_json="null"
  fi
  document="$(jq -cS --arg phase "$phase" --arg now "$now" --argjson failure "$failure_json" '
    if .pending == null then error("missing pending release") else
      .generation += 1 |
      .updatedAt = $now |
      .pending.phase = $phase |
      .pending.updatedAt = $now |
      .pending.failure = $failure
    end
  ' <<<"$state")" || release_state_error "no se pudo actualizar el intento pendiente" || return
  release_state_publish_document "$directory" "$repository" "$project" "$data_volume" "$document"
}

release_state_promote_candidate() {
  local directory="$1" repository="$2" project="$3" data_volume="$4"
  local state now document

  state="$(release_state_load "$directory" "$repository" "$project" "$data_volume")" || return
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)" || release_state_error "no se pudo fechar la promocion" || return
  document="$(jq -cS --arg now "$now" '
    if .pending == null or .pending.phase != "candidate_verified" then
      error("candidate is not verified")
    else
      .generation += 1 |
      .updatedAt = $now |
      .previous = .current |
      .current = (.pending.candidate | .activatedAt = $now) |
      .lastAttempt = {
        attemptId: .pending.attemptId, status: "deployed", completedAt: $now,
        releaseId: .pending.candidate.releaseId, code: null, exitCode: null
      } |
      .pending = null
    end
  ' <<<"$state")" || release_state_error "no se pudo promover la candidata" || return
  release_state_publish_document "$directory" "$repository" "$project" "$data_volume" "$document"
}

release_state_finalize_baseline() {
  local directory="$1" repository="$2" project="$3" data_volume="$4"
  local status="$5" code="${6:-}" exit_code="${7:-}"
  local state now document code_json exit_json

  state="$(release_state_load "$directory" "$repository" "$project" "$data_volume")" || return
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)" || release_state_error "no se pudo fechar la recuperacion" || return
  if [[ -n "$code" ]]; then
    code_json="$(jq -cn --arg code "$code" '$code')" || return
    [[ "$exit_code" =~ ^[1-9][0-9]*$ && "$exit_code" -le 255 ]] ||
      release_state_error "exit code invalido" || return
    exit_json="$exit_code"
  else
    code_json="null"
    exit_json="null"
  fi
  document="$(jq -cS --arg now "$now" --arg status "$status" \
    --argjson code "$code_json" --argjson exitCode "$exit_json" '
    if .pending == null or .pending.baseline == null then error("missing pending baseline") else
      .generation += 1 |
      .updatedAt = $now |
      .current = .pending.baseline |
      .lastAttempt = {
        attemptId: .pending.attemptId, status: $status, completedAt: $now,
        releaseId: .pending.baseline.releaseId, code: $code, exitCode: $exitCode
      } |
      .pending = null
    end
  ' <<<"$state")" || release_state_error "no se pudo finalizar el baseline" || return
  release_state_publish_document "$directory" "$repository" "$project" "$data_volume" "$document"
}

release_state_cancel_empty_first_deploy() {
  local directory="$1" repository="$2" project="$3" data_volume="$4"
  local state now document

  state="$(release_state_load "$directory" "$repository" "$project" "$data_volume")" || return
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)" || release_state_error "no se pudo fechar la cancelacion" || return
  document="$(jq -cS --arg now "$now" '
    if .pending == null or .pending.policy != "first-deploy" or
      .pending.baseline != null or .current != null then
      error("pending release is not an empty first deploy")
    else
      .generation += 1 |
      .updatedAt = $now |
      .lastAttempt = {
        attemptId: .pending.attemptId, status: "aborted", completedAt: $now,
        releaseId: .pending.candidate.releaseId, code: null, exitCode: null
      } |
      .pending = null
    end
  ' <<<"$state")" || release_state_error "no se pudo cancelar el primer deploy vacio" || return
  release_state_publish_document "$directory" "$repository" "$project" "$data_volume" "$document"
}
