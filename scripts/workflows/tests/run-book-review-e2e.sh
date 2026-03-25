#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
N8N_ENV_FILE="${1:-$ROOT_DIR/env.n8n.local}"
CLIPROXY_ENV_FILE="${2:-$ROOT_DIR/env.cliproxy.local}"
MESSAGE_INPUT="${3:-Sách Nhà Giả Kim của tác giả Paulo Coelho}"
TIMEOUT_SECONDS="${BOOK_REVIEW_E2E_TIMEOUT_SECONDS:-35}"

WORKFLOW_TEMPLATE="$ROOT_DIR/workflows/book-review-gemini.workflow.json"
MASTER_PROMPT_TEMPLATE="$ROOT_DIR/workflows/prompts/book-review-master-prompt.txt"
METADATA_PROMPT_TEMPLATE="$ROOT_DIR/workflows/prompts/book-review-metadata-prompt.txt"

[ -f "$N8N_ENV_FILE" ] || { echo "Missing file: $N8N_ENV_FILE" >&2; exit 1; }
[ -f "$CLIPROXY_ENV_FILE" ] || { echo "Missing file: $CLIPROXY_ENV_FILE" >&2; exit 1; }
[ -f "$WORKFLOW_TEMPLATE" ] || { echo "Missing file: $WORKFLOW_TEMPLATE" >&2; exit 1; }

# shellcheck source=/dev/null
source "$N8N_ENV_FILE"
: "${N8N_API_URL:?N8N_API_URL is required}"
: "${N8N_API_KEY:?N8N_API_KEY is required}"

TMP_DIR="$(mktemp -d)"
PATCHED_TEMPLATE="$TMP_DIR/book-review-e2e.workflow.json"
RESP_BODY="$TMP_DIR/response.json"
RESP_HEADERS="$TMP_DIR/response.headers"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

restore_workflow() {
  bash "$ROOT_DIR/scripts/workflows/import/import-book-review-workflow.sh" \
    "$N8N_ENV_FILE" \
    "$CLIPROXY_ENV_FILE" \
    "$WORKFLOW_TEMPLATE" \
    "$MASTER_PROMPT_TEMPLATE" \
    "$METADATA_PROMPT_TEMPLATE" >/dev/null
}

trap 'restore_workflow || true; cleanup' INT TERM

jq \
  --argjson timeout "$TIMEOUT_SECONDS" \
  '
  .nodes |= map(
    if .name == "When chat message received" then
      (.parameters.public = true) |
      (.webhookId = "book-review-e2e-codex")
    elif .name == "Set Config" then
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
  "$METADATA_PROMPT_TEMPLATE" >/dev/null

WORKFLOW_ID="$(jq -r '.workflows["Book Review Gemini via CLIProxyAPI"].id' "$ROOT_DIR/workflow-registry.json")"
START_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

PAYLOAD="$(jq -nc \
  --arg sid "e2e-$(date +%s)" \
  --arg input "$MESSAGE_INPUT" \
  '{action:"sendMessage",sessionId:$sid,chatInput:$input}')"

HTTP_CODE="$(curl -sS -o "$RESP_BODY" -D "$RESP_HEADERS" -w '%{http_code}' \
  -X POST "$N8N_API_URL/webhook/book-review-e2e-codex/chat" \
  -H 'Content-Type: application/json' \
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
    "$N8N_API_URL/api/v1/executions/$EXEC_ID?includeData=true" > "$TMP_DIR/execution.json"
fi

echo "E2E webhook HTTP code: $HTTP_CODE"
echo "Workflow ID: $WORKFLOW_ID"
echo "Execution ID: ${EXEC_ID:-N/A}"

echo "Response preview:"
jq -r '{
  message,
  stop_reason,
  reviewer_decision,
  risk_level,
  video_title,
  video_caption,
  video_thumbnail_text,
  video_hashtags
}' "$RESP_BODY"

if [ -n "$EXEC_ID" ]; then
  echo
  echo "Execution summary:"
  jq -r '{
    status,
    startedAt,
    stoppedAt,
    ran_nodes: ((.data.resultData.runData // {}) | keys),
    reviewer_commands: (.data.resultData.runData["Reviewer Orchestrator"][0].data.main[0][0].json.reviewer_commands // [])
  }' "$TMP_DIR/execution.json"
fi

restore_workflow

echo
echo "Workflow restored to template defaults."
