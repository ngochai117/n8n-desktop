#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
N8N_ENV_FILE="${1:-$ROOT_DIR/env.n8n.local}"
CLIPROXY_ENV_FILE="${2:-$ROOT_DIR/env.cliproxy.local}"
MESSAGE_INPUT="${3:-Sách Nhà Giả Kim của tác giả Paulo Coelho}"
TIMEOUT_SECONDS="${BOOK_REVIEW_E2E_TIMEOUT_SECONDS:-35}"
PREFLIGHT_ONLY="${BOOK_REVIEW_E2E_PREFLIGHT_ONLY:-false}"
STRICT_UPDATE_ID="${BOOK_REVIEW_E2E_STRICT_UPDATE_ID:-true}"
EXECUTION_LOOKUP_TIMEOUT_SECONDS="${BOOK_REVIEW_E2E_EXECUTION_LOOKUP_TIMEOUT_SECONDS:-180}"
EXECUTION_LIST_LIMIT="${BOOK_REVIEW_E2E_EXECUTION_LIST_LIMIT:-100}"
declare -a CANDIDATE_EXEC_IDS=()

TEXT_TO_IMAGES_WORKFLOW_TEMPLATE="$ROOT_DIR/workflows/book-review/text-to-images.workflow.json"
TTS_WORKFLOW_TEMPLATE="$ROOT_DIR/workflows/book-review/tts.workflow.json"
WORKFLOW_TEMPLATE="$ROOT_DIR/workflows/book-review/book-review.workflow.json"
MASTER_PROMPT_TEMPLATE="$ROOT_DIR/workflows/book-review/prompts/book-review-master-prompt.txt"
METADATA_PROMPT_TEMPLATE="$ROOT_DIR/workflows/book-review/prompts/book-review-metadata-prompt.txt"
QC_PROMPT_TEMPLATE="$ROOT_DIR/workflows/book-review/prompts/book-review-qc-prompt.txt"
REVIEW_EDIT_PROMPT_TEMPLATE="$ROOT_DIR/workflows/book-review/prompts/book-review-review-edit-prompt.txt"

log() {
  printf '[book-review-e2e] %s\n' "$1"
}

fatal() {
  printf '[book-review-e2e] ERROR: %s\n' "$1" >&2
  exit 1
}

[ -f "$N8N_ENV_FILE" ] || fatal "Missing file: $N8N_ENV_FILE"
[ -f "$CLIPROXY_ENV_FILE" ] || fatal "Missing file: $CLIPROXY_ENV_FILE"
[ -f "$TEXT_TO_IMAGES_WORKFLOW_TEMPLATE" ] || fatal "Missing file: $TEXT_TO_IMAGES_WORKFLOW_TEMPLATE"
[ -f "$TTS_WORKFLOW_TEMPLATE" ] || fatal "Missing file: $TTS_WORKFLOW_TEMPLATE"
[ -f "$WORKFLOW_TEMPLATE" ] || fatal "Missing file: $WORKFLOW_TEMPLATE"
[ -f "$MASTER_PROMPT_TEMPLATE" ] || fatal "Missing file: $MASTER_PROMPT_TEMPLATE"
[ -f "$METADATA_PROMPT_TEMPLATE" ] || fatal "Missing file: $METADATA_PROMPT_TEMPLATE"
[ -f "$QC_PROMPT_TEMPLATE" ] || fatal "Missing file: $QC_PROMPT_TEMPLATE"
[ -f "$REVIEW_EDIT_PROMPT_TEMPLATE" ] || fatal "Missing file: $REVIEW_EDIT_PROMPT_TEMPLATE"

# shellcheck source=/dev/null
source "$N8N_ENV_FILE"
: "${N8N_API_URL:?N8N_API_URL is required}"
: "${N8N_API_KEY:?N8N_API_KEY is required}"
TEST_GDRIVE_FOLDER_ID="${GDRIVE_ROOT_FOLDER_ID_DEFAULT:-${GDRIVE_ROOT_FOLDER_ID:-}}"

TMP_DIR="$(mktemp -d)"
PATCHED_TEMPLATE="$TMP_DIR/book-review-e2e.workflow.json"
RESP_BODY="$TMP_DIR/response.json"
RESP_HEADERS="$TMP_DIR/response.headers"
EXECUTION_JSON="$TMP_DIR/execution.json"

NEEDS_RESTORE=0
RESTORE_DONE=0

cleanup() {
  rm -rf "$TMP_DIR"
}

restore_workflow() {
  if [ "$RESTORE_DONE" -eq 1 ]; then
    return
  fi

  bash "$ROOT_DIR/scripts/workflows/import/import-book-review-workflow.sh" \
    "$N8N_ENV_FILE" \
    "$CLIPROXY_ENV_FILE" \
    "$TEXT_TO_IMAGES_WORKFLOW_TEMPLATE" \
    "$TTS_WORKFLOW_TEMPLATE" \
    "$WORKFLOW_TEMPLATE" \
    "$MASTER_PROMPT_TEMPLATE" \
    "$METADATA_PROMPT_TEMPLATE" \
    "$QC_PROMPT_TEMPLATE" \
    "$REVIEW_EDIT_PROMPT_TEMPLATE" >/dev/null

  RESTORE_DONE=1
  NEEDS_RESTORE=0
  log 'Workflow restored to template defaults.'
}

collect_candidate_execution_ids() {
  local executions_json="$1"
  local started_after="$2"
  CANDIDATE_EXEC_IDS=()
  while IFS= read -r exec_id; do
    [ -n "$exec_id" ] && CANDIDATE_EXEC_IDS+=("$exec_id")
  done < <(
    echo "$executions_json" | jq -r --arg wf "$WORKFLOW_ID" --arg start "$started_after" '
      .data
      | map(select(.workflowId == $wf and .mode == "webhook" and .startedAt >= $start))
      | .[].id
    '
  )

  while IFS= read -r exec_id; do
    [ -n "$exec_id" ] || continue
    local exists=0
    for known_id in "${CANDIDATE_EXEC_IDS[@]-}"; do
      if [ "$known_id" = "$exec_id" ]; then
        exists=1
        break
      fi
    done
    if [ "$exists" -eq 0 ]; then
      CANDIDATE_EXEC_IDS+=("$exec_id")
    fi
  done < <(
    echo "$executions_json" | jq -r --arg wf "$WORKFLOW_ID" '
      .data
      | map(select(.workflowId == $wf and .mode == "webhook"))
      | .[].id
    '
  )
}

count_candidate_execution_ids() {
  local count=0
  for candidate_id in "${CANDIDATE_EXEC_IDS[@]-}"; do
    [ -n "$candidate_id" ] && count=$((count + 1))
  done
  printf '%s\n' "$count"
}

resolve_execution_id_once() {
  local payload_update_id="$1"
  EXEC_ID=''
  for candidate_id in "${CANDIDATE_EXEC_IDS[@]-}"; do
    [ -n "$candidate_id" ] || continue
    curl -sS -H "X-N8N-API-KEY: $N8N_API_KEY" \
      "$N8N_API_URL/api/v1/executions/$candidate_id?includeData=true" > "$EXECUTION_JSON"

    has_main_trigger="$(jq -r --arg node "$TELEGRAM_TRIGGER_NODE" '((((.data // .).resultData.runData) // {}) | has($node))' "$EXECUTION_JSON")"
    trigger_update_id="$(jq -r --arg node "$TELEGRAM_TRIGGER_NODE" '((.data // .).resultData.runData[$node][0].data.main[0][0].json.update_id // empty)' "$EXECUTION_JSON")"

    if [ "$has_main_trigger" = 'true' ] && [ -n "$payload_update_id" ] && [ "$trigger_update_id" = "$payload_update_id" ]; then
      EXEC_ID="$candidate_id"
      return 0
    fi
  done

  return 1
}

resolve_execution_id_with_retry() {
  local payload_update_id="$1"
  local deadline_ts="$2"
  local started_after="$3"
  EXEC_ID=''
  while :; do
    EXEC_JSON="$(curl -sS -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_API_URL/api/v1/executions?limit=$EXECUTION_LIST_LIMIT")"
    collect_candidate_execution_ids "$EXEC_JSON" "$started_after"

    if [ "$(count_candidate_execution_ids)" -gt 0 ] && resolve_execution_id_once "$payload_update_id"; then
      return 0
    fi

    if [ "$(date +%s)" -ge "$deadline_ts" ]; then
      return 1
    fi

    sleep 1
  done
}

on_exit() {
  if [ "$NEEDS_RESTORE" -eq 1 ]; then
    restore_workflow || true
  fi
  cleanup
}
trap on_exit EXIT INT TERM

WORKFLOW_NAME="$(jq -r '.name' "$WORKFLOW_TEMPLATE")"
[ -n "$WORKFLOW_NAME" ] || fatal 'Workflow template missing name'

WORKFLOW_ID="$(jq -r --arg name "$WORKFLOW_NAME" '.workflows[$name].id // empty' "$ROOT_DIR/workflow-registry.json")"
[ -n "$WORKFLOW_ID" ] || fatal "Cannot find workflow id for '$WORKFLOW_NAME' in workflow-registry.json"

USER_INPUT_EXPR="$(jq -r '.nodes[] | select(.name=="Set Config (Main)") | .parameters.assignments.assignments[] | select(.name=="user_input") | .value' "$WORKFLOW_TEMPLATE")"
USER_INPUT_FIELD='chatInput'
if [[ "$USER_INPUT_EXPR" =~ \$json\.([a-zA-Z0-9_]+) ]]; then
  USER_INPUT_FIELD="${BASH_REMATCH[1]}"
fi

TELEGRAM_TRIGGER_NODE='Telegram Trigger'
TELEGRAM_TRIGGER_NODE_ID="$(jq -r --arg n "$TELEGRAM_TRIGGER_NODE" '.nodes[] | select(.name==$n) | .id // empty' "$WORKFLOW_TEMPLATE")"
[ -n "$TELEGRAM_TRIGGER_NODE_ID" ] || fatal "Missing node id for $TELEGRAM_TRIGGER_NODE"

required_nodes=(
  "Telegram Trigger"
  "Set Config (Main)"
  "Generate Full Review"
  "Parse Review Sections"
  "Prepare Session + Init Event"
)

for node_name in "${required_nodes[@]}"; do
  exists="$(jq -r --arg n "$node_name" 'any(.nodes[]; .name == $n)' "$WORKFLOW_TEMPLATE")"
  [ "$exists" = 'true' ] || fatal "Required node missing in template: $node_name"
done

TEMPLATE_SHA="$(shasum -a 256 "$WORKFLOW_TEMPLATE" | awk '{print $1}')"

log "Preflight"
log "- workflow_name: $WORKFLOW_NAME"
log "- workflow_id: $WORKFLOW_ID"
log "- template: $WORKFLOW_TEMPLATE"
log "- template_sha256: $TEMPLATE_SHA"
log "- detected_user_input_field: $USER_INPUT_FIELD"
log "- reviewer_timeout_seconds(test): $TIMEOUT_SECONDS"
log "- test_gdrive_folder_id: ${TEST_GDRIVE_FOLDER_ID:-<empty>}"

if [ "$PREFLIGHT_ONLY" = 'true' ]; then
  log 'Preflight only mode enabled. Skip execution.'
  exit 0
fi

jq \
  --argjson timeout "$TIMEOUT_SECONDS" \
  --arg gdriveFolderId "$TEST_GDRIVE_FOLDER_ID" \
  --arg webhookId 'book-review-e2e-codex' \
  --arg triggerName "$TELEGRAM_TRIGGER_NODE" \
  '
  .nodes |= map(
    if .name == $triggerName then
      (.webhookId = $webhookId)
    elif .name == "Set Config (Main)" then
      (.parameters.assignments.assignments |= map(
        if .name == "reviewer_wait_timeout_seconds" then .value = $timeout
        elif .name == "gdrive_root_folder_id" and ($gdriveFolderId | length) > 0 then .value = $gdriveFolderId
        else . end
      ))
    else
      .
    end
  )
  ' "$WORKFLOW_TEMPLATE" > "$PATCHED_TEMPLATE"

bash "$ROOT_DIR/scripts/workflows/import/import-book-review-workflow.sh" \
  "$N8N_ENV_FILE" \
  "$CLIPROXY_ENV_FILE" \
  "$TEXT_TO_IMAGES_WORKFLOW_TEMPLATE" \
  "$TTS_WORKFLOW_TEMPLATE" \
  "$PATCHED_TEMPLATE" \
  "$MASTER_PROMPT_TEMPLATE" \
  "$METADATA_PROMPT_TEMPLATE" \
  "$QC_PROMPT_TEMPLATE" \
  "$REVIEW_EDIT_PROMPT_TEMPLATE" >/dev/null

NEEDS_RESTORE=1

RUNTIME_WORKFLOW_JSON="$(curl -sS -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_API_URL/api/v1/workflows/$WORKFLOW_ID")"
TELEGRAM_WEBHOOK_ID_RUNTIME="$(echo "$RUNTIME_WORKFLOW_JSON" | jq -r --arg n "$TELEGRAM_TRIGGER_NODE" '
  .nodes[] | select(.name == $n) | .webhookId // empty
')"
[ -n "$TELEGRAM_WEBHOOK_ID_RUNTIME" ] || fatal "Cannot resolve runtime webhookId for node $TELEGRAM_TRIGGER_NODE"

START_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
EPOCH_NOW="$(date +%s)"
TELEGRAM_CHAT_ID_VALUE="${TELEGRAM_CHAT_ID:-6920403077}"
RUNTIME_TRIGGER_NODE_ID="$(echo "$RUNTIME_WORKFLOW_JSON" | jq -r --arg n "$TELEGRAM_TRIGGER_NODE" '
  .nodes[] | select(.name == $n) | .id // empty
')"
[ -n "$RUNTIME_TRIGGER_NODE_ID" ] || fatal "Cannot resolve runtime node id for $TELEGRAM_TRIGGER_NODE"
SECRET_TOKEN="${WORKFLOW_ID}_${RUNTIME_TRIGGER_NODE_ID}"
build_telegram_payload() {
  local epoch="$1"
  jq -nc \
    --arg input "book-review $MESSAGE_INPUT" \
    --arg chatId "$TELEGRAM_CHAT_ID_VALUE" \
    --arg epoch "$epoch" \
    '
    {
      update_id: (2000000000 + ($epoch | tonumber)),
      message: {
        message_id: (500000 + (($epoch | tonumber) % 1000000)),
        date: ($epoch | tonumber),
        chat: {
          id: ($chatId | tonumber? // $chatId),
          type: "private"
        },
        from: {
          id: ($chatId | tonumber? // $chatId),
          is_bot: false,
          first_name: "E2E",
          username: "e2e_local"
        },
        text: $input
      }
    }
    '
}

log 'Executing Telegram webhook simulation test...'

PAYLOAD="$(build_telegram_payload "$EPOCH_NOW")"
PAYLOAD_UPDATE_ID="$(echo "$PAYLOAD" | jq -r '.update_id // empty')"

HTTP_CODE="$(curl -sS -o "$RESP_BODY" -D "$RESP_HEADERS" -w '%{http_code}' \
  -X POST "$N8N_API_URL/webhook/$TELEGRAM_WEBHOOK_ID_RUNTIME/webhook" \
  -H 'Content-Type: application/json' \
  -H "x-telegram-bot-api-secret-token: $SECRET_TOKEN" \
  --data-raw "$PAYLOAD")"

EXEC_JSON="$(curl -sS -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_API_URL/api/v1/executions?limit=$EXECUTION_LIST_LIMIT")"
EXEC_ID=''
collect_candidate_execution_ids "$EXEC_JSON" "$START_TS"

if [ -n "$PAYLOAD_UPDATE_ID" ] && [ "$STRICT_UPDATE_ID" = 'true' ]; then
  LOOKUP_DEADLINE_TS=$(( $(date +%s) + EXECUTION_LOOKUP_TIMEOUT_SECONDS ))
  if ! resolve_execution_id_with_retry "$PAYLOAD_UPDATE_ID" "$LOOKUP_DEADLINE_TS" "$START_TS"; then
    fatal "Cannot map payload_update_id=$PAYLOAD_UPDATE_ID to a webhook execution within ${EXECUTION_LOOKUP_TIMEOUT_SECONDS}s."
  fi
fi

if [ -z "$EXEC_ID" ] && [ "$(count_candidate_execution_ids)" -gt 0 ]; then
  for candidate_id in "${CANDIDATE_EXEC_IDS[@]-}"; do
    [ -n "$candidate_id" ] || continue
    curl -sS -H "X-N8N-API-KEY: $N8N_API_KEY" \
      "$N8N_API_URL/api/v1/executions/$candidate_id?includeData=true" > "$EXECUTION_JSON"

    has_main_trigger="$(jq -r --arg node "$TELEGRAM_TRIGGER_NODE" '((((.data // .).resultData.runData) // {}) | has($node))' "$EXECUTION_JSON")"
    if [ "$has_main_trigger" = 'true' ]; then
      EXEC_ID="$candidate_id"
      break
    fi
  done
fi

printf '\n'
log "E2E result"
log "- webhook_http_code: $HTTP_CODE"
if [ -n "$PAYLOAD_UPDATE_ID" ]; then
  log "- payload_update_id: $PAYLOAD_UPDATE_ID"
fi
log "- workflow_id: $WORKFLOW_ID"
log "- execution_id: ${EXEC_ID:-N/A}"
if [ -n "${N8N_EDITOR_BASE_URL:-}" ] && [ -n "${EXEC_ID:-}" ]; then
  UI_BASE="${N8N_EDITOR_BASE_URL%/}"
  log "- execution_ui_url: $UI_BASE/workflow/$WORKFLOW_ID/executions/$EXEC_ID"
fi

printf '\nResponse preview:\n'
if jq -e . "$RESP_BODY" >/dev/null 2>&1; then
  jq -r '.' "$RESP_BODY"
else
  cat "$RESP_BODY"
  printf '\n'
fi

if [ -n "$EXEC_ID" ]; then
  printf '\nExecution summary:\n'
  jq -r '{
    status,
    startedAt,
    stoppedAt,
    ran_nodes: ((((.data // .).resultData.runData) // {}) | keys)
  }' "$EXECUTION_JSON"
fi

restore_workflow
