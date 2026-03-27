#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
N8N_ENV_FILE="${1:-$ROOT_DIR/env.n8n.local}"
CLIPROXY_ENV_FILE="${2:-$ROOT_DIR/env.cliproxy.local}"
MESSAGE_INPUT="${3:-Sách Nhà Giả Kim của tác giả Paulo Coelho}"
TIMEOUT_SECONDS="${BOOK_REVIEW_E2E_TIMEOUT_SECONDS:-35}"
PREFLIGHT_ONLY="${BOOK_REVIEW_E2E_PREFLIGHT_ONLY:-false}"

WORKFLOW_TEMPLATE="$ROOT_DIR/workflows/book-review/book-review-gemini.workflow.json"
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
[ -f "$WORKFLOW_TEMPLATE" ] || fatal "Missing file: $WORKFLOW_TEMPLATE"
[ -f "$MASTER_PROMPT_TEMPLATE" ] || fatal "Missing file: $MASTER_PROMPT_TEMPLATE"
[ -f "$METADATA_PROMPT_TEMPLATE" ] || fatal "Missing file: $METADATA_PROMPT_TEMPLATE"
[ -f "$QC_PROMPT_TEMPLATE" ] || fatal "Missing file: $QC_PROMPT_TEMPLATE"
[ -f "$REVIEW_EDIT_PROMPT_TEMPLATE" ] || fatal "Missing file: $REVIEW_EDIT_PROMPT_TEMPLATE"

# shellcheck source=/dev/null
source "$N8N_ENV_FILE"
: "${N8N_API_URL:?N8N_API_URL is required}"
: "${N8N_API_KEY:?N8N_API_KEY is required}"

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
    "$WORKFLOW_TEMPLATE" \
    "$MASTER_PROMPT_TEMPLATE" \
    "$METADATA_PROMPT_TEMPLATE" \
    "$QC_PROMPT_TEMPLATE" \
    "$REVIEW_EDIT_PROMPT_TEMPLATE" >/dev/null

  RESTORE_DONE=1
  NEEDS_RESTORE=0
  log 'Workflow restored to template defaults.'
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
  "Return Chat Response"
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

if [ "$PREFLIGHT_ONLY" = 'true' ]; then
  log 'Preflight only mode enabled. Skip execution.'
  exit 0
fi

jq \
  --argjson timeout "$TIMEOUT_SECONDS" \
  --arg webhookId 'book-review-e2e-codex' \
  --arg triggerName "$TELEGRAM_TRIGGER_NODE" \
  '
  .nodes |= map(
    if .name == $triggerName then
      (.webhookId = $webhookId)
    elif .name == "Set Config (Main)" then
      (.parameters.assignments.assignments |= map(
        if .name == "reviewer_wait_timeout_seconds" then .value = $timeout
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
  "$PATCHED_TEMPLATE" \
  "$MASTER_PROMPT_TEMPLATE" \
  "$METADATA_PROMPT_TEMPLATE" \
  "$QC_PROMPT_TEMPLATE" \
  "$REVIEW_EDIT_PROMPT_TEMPLATE" >/dev/null

NEEDS_RESTORE=1

START_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
EPOCH_NOW="$(date +%s)"
TELEGRAM_CHAT_ID_VALUE="${TELEGRAM_CHAT_ID:-6920403077}"
SECRET_TOKEN="${WORKFLOW_ID}_${TELEGRAM_TRIGGER_NODE_ID}"
PAYLOAD="$(jq -nc \
  --arg input "book-review $MESSAGE_INPUT" \
  --arg chatId "$TELEGRAM_CHAT_ID_VALUE" \
  --arg epoch "$EPOCH_NOW" \
  '
  {
    update_id: (900000 + (($epoch | tonumber) % 100000)),
    message: {
      message_id: (2000 + (($epoch | tonumber) % 100000)),
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
  ')"

log 'Executing Telegram webhook simulation test...'
HTTP_CODE="$(curl -sS -o "$RESP_BODY" -D "$RESP_HEADERS" -w '%{http_code}' \
  -X POST "$N8N_API_URL/webhook/book-review-e2e-codex/webhook" \
  -H 'Content-Type: application/json' \
  -H "x-telegram-bot-api-secret-token: $SECRET_TOKEN" \
  --data-raw "$PAYLOAD")"

EXEC_JSON="$(curl -sS -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_API_URL/api/v1/executions?limit=30")"
EXEC_ID="$(echo "$EXEC_JSON" | jq -r --arg wf "$WORKFLOW_ID" --arg start "$START_TS" '
  .data
  | map(select(.workflowId == $wf and .mode == "webhook" and .startedAt >= $start))
  | .[0].id // empty
')"

if [ -z "$EXEC_ID" ]; then
  EXEC_ID="$(echo "$EXEC_JSON" | jq -r --arg wf "$WORKFLOW_ID" '
    .data | map(select(.workflowId == $wf and .mode == "webhook")) | .[0].id // empty
  ')"
fi

if [ -n "$EXEC_ID" ]; then
  curl -sS -H "X-N8N-API-KEY: $N8N_API_KEY" \
    "$N8N_API_URL/api/v1/executions/$EXEC_ID?includeData=true" > "$EXECUTION_JSON"
fi

printf '\n'
log "E2E result"
log "- webhook_http_code: $HTTP_CODE"
log "- workflow_id: $WORKFLOW_ID"
log "- execution_id: ${EXEC_ID:-N/A}"

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
    ran_nodes: ((.data.resultData.runData // {}) | keys)
  }' "$EXECUTION_JSON"
fi

restore_workflow
