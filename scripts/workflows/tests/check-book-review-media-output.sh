#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
N8N_ENV_FILE="${1:-$ROOT_DIR/env.n8n.local}"
EXECUTION_ID_OVERRIDE="${2:-}"
WORKFLOW_NAME='Book Review'
STRICT_MODE="${BOOK_REVIEW_MEDIA_STRICT:-false}"
FINAL_ONLY_MODE="${BOOK_REVIEW_MEDIA_FINAL_ONLY:-false}"

log() {
  printf '[book-review-media-check] %s\n' "$1"
}

fatal() {
  printf '[book-review-media-check] ERROR: %s\n' "$1" >&2
  exit 1
}

[ -f "$N8N_ENV_FILE" ] || fatal "Missing file: $N8N_ENV_FILE"

# shellcheck source=/dev/null
source "$N8N_ENV_FILE"
: "${N8N_API_URL:?N8N_API_URL is required}"
: "${N8N_API_KEY:?N8N_API_KEY is required}"

WORKFLOW_ID="$(jq -r --arg name "$WORKFLOW_NAME" '.workflows[$name].id // empty' "$ROOT_DIR/workflow-registry.json")"
[ -n "$WORKFLOW_ID" ] || fatal "Cannot find workflow id for '$WORKFLOW_NAME' in workflow-registry.json"

TMP_DIR="$(mktemp -d)"
EXECUTION_JSON="$TMP_DIR/execution.json"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

find_latest_main_execution_id() {
  local exec_json candidate_id has_main_trigger
  local media_should_run
  local has_debug_persist

  exec_json="$(curl -sS -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_API_URL/api/v1/executions?limit=60")"

  while IFS= read -r candidate_id; do
    [ -n "$candidate_id" ] || continue
    curl -sS -H "X-N8N-API-KEY: $N8N_API_KEY" \
      "$N8N_API_URL/api/v1/executions/$candidate_id?includeData=true" > "$EXECUTION_JSON"

    has_main_trigger="$(jq -r '((.data.resultData.runData // {}) | has("Telegram Trigger"))' "$EXECUTION_JSON")"
    if [ "$has_main_trigger" = 'true' ]; then
      if [ "$FINAL_ONLY_MODE" = 'true' ]; then
        media_should_run="$(jq -r '
          (.data.resultData.runData["Process Media Assets (Worker)"][0].data.main[0][0].json.media_should_run // false)
        ' "$EXECUTION_JSON")"
        has_debug_persist="$(jq -r '
          ((.data.resultData.runData // {}) | has("Persist Media Debug (Worker)"))
        ' "$EXECUTION_JSON")"
        if [ "$media_should_run" != 'true' ]; then
          continue
        fi
        if [ "$has_debug_persist" != 'true' ]; then
          continue
        fi
      fi
      printf '%s\n' "$candidate_id"
      return 0
    fi
  done < <(
    echo "$exec_json" | jq -r --arg wf "$WORKFLOW_ID" '
      .data
      | map(select(.workflowId == $wf and .mode == "webhook"))
      | .[].id
    '
  )

  return 1
}

EXECUTION_ID="$EXECUTION_ID_OVERRIDE"
if [ -z "$EXECUTION_ID" ]; then
  EXECUTION_ID="$(find_latest_main_execution_id || true)"
fi

if [ -z "$EXECUTION_ID" ]; then
  if [ "$FINAL_ONLY_MODE" = 'true' ]; then
    fatal 'Cannot locate final-success execution with media_should_run=true. Hay tiep tuc flow den metadata_continue/auto_continue_metadata roi chay lai.'
  fi
  fatal 'Cannot locate a main webhook execution (Telegram Trigger)'
fi

if [ ! -s "$EXECUTION_JSON" ] || [ -n "$EXECUTION_ID_OVERRIDE" ]; then
  curl -sS -H "X-N8N-API-KEY: $N8N_API_KEY" \
    "$N8N_API_URL/api/v1/executions/$EXECUTION_ID?includeData=true" > "$EXECUTION_JSON"
fi

log "workflow_id=$WORKFLOW_ID"
log "execution_id=$EXECUTION_ID"
if [ -n "${N8N_EDITOR_BASE_URL:-}" ]; then
  UI_BASE="${N8N_EDITOR_BASE_URL%/}"
  log "execution_ui_url=$UI_BASE/workflow/$WORKFLOW_ID/executions/$EXECUTION_ID"
  log 'ui_debug_node=Persist Media Debug (Worker)'
fi

printf '\nExecution summary:\n'
jq -r '{
  status,
  startedAt,
  stoppedAt,
  ran_nodes: ((.data.resultData.runData // {}) | keys)
}' "$EXECUTION_JSON"

printf '\nMedia summary:\n'
jq -r '
  (
    (
      (.data.resultData.runData["Persist Media Debug (Worker)"] // [])
      | map(.data.main[0][0].json // {})
      | (map(select((.media_debug_phase // "") == "finalized")) | .[-1])
    ) //
    (
      (.data.resultData.runData["Persist Media Debug (Worker)"] // [])
      | map(.data.main[0][0].json // {})
      | .[-1]
    ) //
    .data.resultData.runData["Finalize Media Assets (Worker)"][0].data.main[0][0].json //
    {}
  ) as $j
  | ($j.media_assets // []) as $assets
  | ((.data.resultData.runData["Persist Media Debug (Worker)"] // []) | map(.data.main[0][0].json.media_debug_phase // "unknown")) as $persistPhases
  | (.data.resultData.runData["Generate TTS Assets (Worker)"][0].data.main[0][0].json.tts_api_base_url // "missing") as $ttsBaseUrl
  | {
      media_pipeline_status: ($j.media_pipeline_status // "missing"),
      media_debug_phase: ($j.media_debug_phase // "missing"),
      media_elapsed_seconds: ($j.media_elapsed_seconds // 0),
      persist_runs_count: ((.data.resultData.runData["Persist Media Debug (Worker)"] // []) | length),
      persist_phases: $persistPhases,
      tts_api_base_url: $ttsBaseUrl,
      media_debug_ui_card: ($j.media_debug_ui_card // ""),
      media_assets_count: ($assets | length),
      image_generated_count: ($j.media_stats.image_generated_count // 0),
      tts_generated_count: ($j.media_stats.tts_generated_count // 0),
      failed_count: ($j.media_stats.failed_count // 0),
      skipped_count: ($j.media_stats.skipped_count // 0),
      media_store_status: ($j.media_debug_store_status // "missing"),
      media_store_table_name: ($j.media_debug_store_table_name // ""),
      media_store_error: ($j.media_debug_store_error // ""),
      schema_ok: (if ($assets | length) == 0 then false else all($assets[];
        (.partName|type=="string") and
        (.index|type=="number") and
        (.text|type=="string") and
        (.image|type=="string") and
        (.video|type=="string") and
        (.voice|type=="string") and
        (.duration|type=="number") and
        (.image_status|type=="string") and
        (.tts_status|type=="string")
      ) end)
    }
' "$EXECUTION_JSON"

printf '\nTop error reasons:\n'
jq -r '
  (
    (
      (.data.resultData.runData["Persist Media Debug (Worker)"] // [])
      | map(.data.main[0][0].json // {})
      | (map(select((.media_debug_phase // "") == "finalized")) | .[-1])
    ).media_assets //
    (
      (.data.resultData.runData["Persist Media Debug (Worker)"] // [])
      | map(.data.main[0][0].json // {})
      | .[-1]
    ).media_assets //
    .data.resultData.runData["Finalize Media Assets (Worker)"][0].data.main[0][0].json.media_assets //
    []
  )
  | map(select((.error_reason // "") != ""))
  | group_by(.error_reason)
  | map({error_reason: .[0].error_reason, count: length})
  | sort_by(-.count)
  | .[:8]
' "$EXECUTION_JSON"

FAILED_COUNT="$(jq -r '
  (
    (
      (.data.resultData.runData["Persist Media Debug (Worker)"] // [])
      | map(.data.main[0][0].json // {})
      | (map(select((.media_debug_phase // "") == "finalized")) | .[-1])
    ).media_stats.failed_count //
    (
      (.data.resultData.runData["Persist Media Debug (Worker)"] // [])
      | map(.data.main[0][0].json // {})
      | .[-1]
    ).media_stats.failed_count //
    .data.resultData.runData["Finalize Media Assets (Worker)"][0].data.main[0][0].json.media_stats.failed_count //
    0
  )
' "$EXECUTION_JSON")"
PIPELINE_STATUS="$(jq -r '
  (
    (
      (.data.resultData.runData["Persist Media Debug (Worker)"] // [])
      | map(.data.main[0][0].json // {})
      | (map(select((.media_debug_phase // "") == "finalized")) | .[-1])
    ).media_pipeline_status //
    (
      (.data.resultData.runData["Persist Media Debug (Worker)"] // [])
      | map(.data.main[0][0].json // {})
      | .[-1]
    ).media_pipeline_status //
    .data.resultData.runData["Finalize Media Assets (Worker)"][0].data.main[0][0].json.media_pipeline_status //
    "missing"
  )
' "$EXECUTION_JSON")"
SCHEMA_OK="$(jq -r '
  (
    (
      (.data.resultData.runData["Persist Media Debug (Worker)"] // [])
      | map(.data.main[0][0].json // {})
      | (map(select((.media_debug_phase // "") == "finalized")) | .[-1])
    ).media_assets //
    (
      (.data.resultData.runData["Persist Media Debug (Worker)"] // [])
      | map(.data.main[0][0].json // {})
      | .[-1]
    ).media_assets //
    .data.resultData.runData["Finalize Media Assets (Worker)"][0].data.main[0][0].json.media_assets //
    []
  ) as $assets
  | if ($assets | length) == 0 then "false" else
      (if all($assets[];
        (.partName|type=="string") and
        (.index|type=="number") and
        (.text|type=="string") and
        (.image|type=="string") and
        (.video|type=="string") and
        (.voice|type=="string") and
        (.duration|type=="number") and
        (.image_status|type=="string") and
        (.tts_status|type=="string")
      ) then "true" else "false" end)
    end
' "$EXECUTION_JSON")"

if [ "$PIPELINE_STATUS" = 'skipped_non_final_success' ]; then
  log 'Note: execution nay la non-final event, media branch duoc skip co chu dich.'
  log 'Muốn test media thật, hãy chạy execution final-success (metadata_continue/auto_continue_metadata).'
fi

if [ "$STRICT_MODE" = 'true' ]; then
  if [ "$SCHEMA_OK" != 'true' ]; then
    fatal 'STRICT failed: media schema is invalid or media_assets is empty'
  fi
  if [ "$FAILED_COUNT" -gt 0 ]; then
    fatal "STRICT failed: failed_count=$FAILED_COUNT"
  fi
fi

log 'Done.'
