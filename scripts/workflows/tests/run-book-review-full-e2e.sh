#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
N8N_ENV_FILE="${1:-$ROOT_DIR/env.n8n.local}"
PROXY_ENV_FILE="${2:-$ROOT_DIR/env.proxy.local}"
MESSAGE_INPUT="${3:-Sách Đắc Nhân Tâm của Dale Carnegie}"
TIMEOUT_SECONDS="${BOOK_REVIEW_E2E_TIMEOUT_SECONDS:-35}"
EXECUTION_LOOKUP_TIMEOUT_SECONDS="${BOOK_REVIEW_E2E_EXECUTION_LOOKUP_TIMEOUT_SECONDS:-240}"
EXECUTION_LIST_LIMIT="${BOOK_REVIEW_E2E_EXECUTION_LIST_LIMIT:-250}"

TEXT_TO_IMAGES_WORKFLOW_TEMPLATE="$ROOT_DIR/workflows/book-review/text-to-images.workflow.json"
TTS_WORKFLOW_TEMPLATE="$ROOT_DIR/workflows/book-review/tts.workflow.json"
WORKFLOW_TEMPLATE="$ROOT_DIR/workflows/book-review/book-review.workflow.json"
MASTER_PROMPT_TEMPLATE="$ROOT_DIR/workflows/book-review/prompts/book-review-master-prompt.txt"
METADATA_PROMPT_TEMPLATE="$ROOT_DIR/workflows/book-review/prompts/book-review-metadata-prompt.txt"
QC_PROMPT_TEMPLATE="$ROOT_DIR/workflows/book-review/prompts/book-review-qc-prompt.txt"
REVIEW_EDIT_PROMPT_TEMPLATE="$ROOT_DIR/workflows/book-review/prompts/book-review-review-edit-prompt.txt"

log() {
  printf '[book-review-full-e2e] %s\n' "$1"
}

fatal() {
  printf '[book-review-full-e2e] ERROR: %s\n' "$1" >&2
  exit 1
}

[ -f "$N8N_ENV_FILE" ] || fatal "Missing file: $N8N_ENV_FILE"
[ -f "$PROXY_ENV_FILE" ] || fatal "Missing file: $PROXY_ENV_FILE"
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
if [ -z "$TEST_GDRIVE_FOLDER_ID" ]; then
  fatal 'Missing GDRIVE_ROOT_FOLDER_ID_DEFAULT (or GDRIVE_ROOT_FOLDER_ID) in env.n8n.local'
fi

TMP_DIR="$(mktemp -d)"
PATCHED_TEMPLATE="$TMP_DIR/book-review-full-e2e.workflow.json"
EXECUTION_JSON="$TMP_DIR/execution.json"
START_EXECUTION_JSON="$TMP_DIR/start-execution.json"

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
    "$PROXY_ENV_FILE" \
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

TELEGRAM_TRIGGER_NODE='Telegram Trigger'
TELEGRAM_TRIGGER_NODE_ID="$(jq -r --arg n "$TELEGRAM_TRIGGER_NODE" '.nodes[] | select(.name==$n) | .id // empty' "$WORKFLOW_TEMPLATE")"
[ -n "$TELEGRAM_TRIGGER_NODE_ID" ] || fatal "Missing node id for $TELEGRAM_TRIGGER_NODE"

jq \
  --argjson timeout "$TIMEOUT_SECONDS" \
  --arg gdriveFolderId "$TEST_GDRIVE_FOLDER_ID" \
  --arg webhookId 'book-review-full-e2e-codex' \
  --arg triggerName "$TELEGRAM_TRIGGER_NODE" \
  '
  .nodes |= map(
    if .name == $triggerName then
      (.webhookId = $webhookId)
    elif .name == "Set Config (Main)" then
      (.parameters.assignments.assignments |= map(
        if .name == "reviewer_wait_timeout_seconds" then .value = $timeout
        elif .name == "gdrive_root_folder_id" then .value = $gdriveFolderId
        else . end
      ))
    else
      .
    end
  )
  ' "$WORKFLOW_TEMPLATE" > "$PATCHED_TEMPLATE"

bash "$ROOT_DIR/scripts/workflows/import/import-book-review-workflow.sh" \
  "$N8N_ENV_FILE" \
  "$PROXY_ENV_FILE" \
  "$TEXT_TO_IMAGES_WORKFLOW_TEMPLATE" \
  "$TTS_WORKFLOW_TEMPLATE" \
  "$PATCHED_TEMPLATE" \
  "$MASTER_PROMPT_TEMPLATE" \
  "$METADATA_PROMPT_TEMPLATE" \
  "$QC_PROMPT_TEMPLATE" \
  "$REVIEW_EDIT_PROMPT_TEMPLATE" >/dev/null

NEEDS_RESTORE=1

RUNTIME_WORKFLOW_JSON="$(curl -sS -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_API_URL/api/v1/workflows/$WORKFLOW_ID")"
TELEGRAM_WEBHOOK_ID_RUNTIME="$(echo "$RUNTIME_WORKFLOW_JSON" | jq -r --arg n "$TELEGRAM_TRIGGER_NODE" '.nodes[] | select(.name == $n) | .webhookId // empty')"
RUNTIME_TRIGGER_NODE_ID="$(echo "$RUNTIME_WORKFLOW_JSON" | jq -r --arg n "$TELEGRAM_TRIGGER_NODE" '.nodes[] | select(.name == $n) | .id // empty')"
[ -n "$TELEGRAM_WEBHOOK_ID_RUNTIME" ] || fatal "Cannot resolve runtime webhookId for node $TELEGRAM_TRIGGER_NODE"
[ -n "$RUNTIME_TRIGGER_NODE_ID" ] || fatal "Cannot resolve runtime node id for $TELEGRAM_TRIGGER_NODE"

SECRET_TOKEN="${WORKFLOW_ID}_${RUNTIME_TRIGGER_NODE_ID}"
TELEGRAM_CHAT_ID_VALUE="${TELEGRAM_CHAT_ID:-6920403077}"

activate_workflow() {
  local body_file code

  # Force refresh active snapshot so Execute Workflow nodes use newest node schema/version.
  curl -sS -o /dev/null \
    -X POST \
    -H "X-N8N-API-KEY: $N8N_API_KEY" \
    "$N8N_API_URL/api/v1/workflows/$WORKFLOW_ID/deactivate" || true

  body_file="$(mktemp)"
  code="$(curl -sS -o "$body_file" -w '%{http_code}' \
    -X POST \
    -H "X-N8N-API-KEY: $N8N_API_KEY" \
    "$N8N_API_URL/api/v1/workflows/$WORKFLOW_ID/activate")"

  if [ "$code" != "200" ] && [ "$code" != "201" ]; then
    local body
    body="$(cat "$body_file")"
    rm -f "$body_file"
    fatal "Failed to activate workflow $WORKFLOW_ID (HTTP $code): $body"
  fi

  rm -f "$body_file"
}

assert_http_success() {
  local code="$1"
  local phase="$2"
  case "$code" in
    2??) return 0 ;;
    *) fatal "$phase returned HTTP $code (expected 2xx)." ;;
  esac
}

activate_workflow
sleep 1

extract_execution_update_id() {
  jq -r '
    (.data // .) as $root
    | [
        ($root.resultData.runData["Telegram Trigger"][0].data.main[0][0].json.update_id // empty),
        ($root.resultData.runData["Telegram Trigger"][0].data.main[0][0].json.body.update_id // empty),
        ($root.resultData.runData["Parse Telegram Event"][0].data.main[0][0].json.update_id // empty),
        ($root.resultData.runData["Parse Telegram Event"][0].data.main[0][0].json.body.update_id // empty),
        ([ $root.resultData.runData[]?[]?.data?.main[]?[]?.json?.update_id ] | map(select(. != null)) | last // empty),
        ([ $root.resultData.runData[]?[]?.data?.main[]?[]?.json?.body?.update_id ] | map(select(. != null)) | last // empty)
      ]
    | map(select(. != null and . != ""))
    | map(tostring)
    | .[0] // empty
  ' "$EXECUTION_JSON" 2>/dev/null || true
}

resolve_execution_id_by_update_id() {
  local update_id="$1"
  local started_after_epoch="${2:-0}"
  local update_id_text
  update_id_text="$(printf '%s' "$update_id")"
  local found_exec=''
  local deadline=$(( $(date +%s) + EXECUTION_LOOKUP_TIMEOUT_SECONDS ))

  while [ "$(date +%s)" -lt "$deadline" ]; do
    local exec_json candidate_id uid
    exec_json="$(curl -sS -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_API_URL/api/v1/executions?limit=$EXECUTION_LIST_LIMIT")"

    while IFS= read -r candidate_id; do
      [ -n "$candidate_id" ] || continue
      curl -sS -H "X-N8N-API-KEY: $N8N_API_KEY" \
        "$N8N_API_URL/api/v1/executions/$candidate_id?includeData=true" > "$EXECUTION_JSON"

      uid="$(extract_execution_update_id)"
      if [ "$uid" = "$update_id_text" ]; then
        found_exec="$candidate_id"
        break
      fi
    done < <(
      echo "$exec_json" | jq -r --arg wf "$WORKFLOW_ID" --argjson startedAfterEpoch "$started_after_epoch" '
        def started_epoch:
          (.startedAt // "")
          | if . == "" then 0 else (sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601) end;
        .data
        | map(select(
            .workflowId == $wf and
            .mode == "webhook" and
            ($startedAfterEpoch == 0 or (started_epoch >= $startedAfterEpoch))
          ))
        | sort_by(started_epoch)
        | reverse
        | .[].id
      '
    )

    if [ -n "$found_exec" ]; then
      printf '%s\n' "$found_exec"
      return 0
    fi

    sleep 1
  done

  return 1
}

post_telegram_message_update() {
  local update_id="$1"
  local message_text="$2"
  local epoch_now="$3"
  local payload

  payload="$(jq -nc \
    --arg txt "$message_text" \
    --arg chatId "$TELEGRAM_CHAT_ID_VALUE" \
    --argjson upd "$update_id" \
    --argjson epoch "$epoch_now" \
    '
    {
      update_id: $upd,
      message: {
        message_id: ($upd % 1000000),
        date: $epoch,
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
        text: $txt
      }
    }
    '
  )"

  curl -sS -o "$TMP_DIR/response-message-$update_id.json" -w '%{http_code}' \
    -X POST "$N8N_API_URL/webhook/$TELEGRAM_WEBHOOK_ID_RUNTIME/webhook" \
    -H 'Content-Type: application/json' \
    -H "x-telegram-bot-api-secret-token: $SECRET_TOKEN" \
    --data-raw "$payload"
}

post_telegram_callback_update() {
  local update_id="$1"
  local callback_data="$2"
  local epoch_now="$3"
  local payload

  payload="$(jq -nc \
    --arg data "$callback_data" \
    --arg chatId "$TELEGRAM_CHAT_ID_VALUE" \
    --argjson upd "$update_id" \
    --argjson epoch "$epoch_now" \
    '
    {
      update_id: $upd,
      callback_query: {
        id: ("cb-" + ($upd | tostring)),
        from: {
          id: ($chatId | tonumber? // $chatId),
          is_bot: false,
          first_name: "E2E",
          username: "e2e_local"
        },
        message: {
          message_id: ($upd % 1000000),
          date: $epoch,
          chat: {
            id: ($chatId | tonumber? // $chatId),
            type: "private"
          },
          text: "callback"
        },
        data: $data
      }
    }
    '
  )"

  curl -sS -o "$TMP_DIR/response-callback-$update_id.json" -w '%{http_code}' \
    -X POST "$N8N_API_URL/webhook/$TELEGRAM_WEBHOOK_ID_RUNTIME/webhook" \
    -H 'Content-Type: application/json' \
    -H "x-telegram-bot-api-secret-token: $SECRET_TOKEN" \
    --data-raw "$payload"
}

assert_worker_event() {
  local expected="$1"
  local actual
  actual="$(jq -r '((.data // .).resultData.runData["Handle Reviewer Event"][0].data.main[0][0].json.event_type // empty)' "$EXECUTION_JSON")"
  if [ "$actual" != "$expected" ]; then
    fatal "Expected worker event '$expected' but got '$actual'."
  fi
}

BASE_UPDATE_ID=$((900000000 + $(date +%s)))
EPOCH_NOW="$(date +%s)"
START_EPOCH="$(date -u +%s)"

log "workflow_id=$WORKFLOW_ID"
log "webhook_id=$TELEGRAM_WEBHOOK_ID_RUNTIME"
log "gdrive_root_folder_id_default=$TEST_GDRIVE_FOLDER_ID"

START_UPDATE_ID="$BASE_UPDATE_ID"
START_HTTP_CODE="$(post_telegram_message_update "$START_UPDATE_ID" "book-review $MESSAGE_INPUT" "$EPOCH_NOW")"
assert_http_success "$START_HTTP_CODE" "Start webhook"
START_EXEC_ID="$(resolve_execution_id_by_update_id "$START_UPDATE_ID" "$START_EPOCH" || true)"
[ -n "$START_EXEC_ID" ] || fatal "Cannot map start update_id=$START_UPDATE_ID to execution."
cp "$EXECUTION_JSON" "$START_EXECUTION_JSON"

assert_worker_event 'init_review'
SESSION_TOKEN="$(jq -r '((.data // .).resultData.runData["Handle Reviewer Event"][0].data.main[0][0].json.session_token // empty)' "$EXECUTION_JSON")"
[ -n "$SESSION_TOKEN" ] || fatal 'Cannot resolve session token from start execution.'

MEDIA_CONTINUE_UPDATE_ID=$((BASE_UPDATE_ID + 1))
MEDIA_CONTINUE_HTTP_CODE="$(post_telegram_callback_update "$MEDIA_CONTINUE_UPDATE_ID" "brv:media:c:$SESSION_TOKEN" "$EPOCH_NOW")"
assert_http_success "$MEDIA_CONTINUE_HTTP_CODE" "Media continue callback"
MEDIA_CONTINUE_EXEC_ID="$(resolve_execution_id_by_update_id "$MEDIA_CONTINUE_UPDATE_ID" "$START_EPOCH" || true)"
[ -n "$MEDIA_CONTINUE_EXEC_ID" ] || fatal "Cannot map media callback update_id=$MEDIA_CONTINUE_UPDATE_ID to execution."
assert_worker_event 'media_continue'

MEDIA_PIPELINE_STATUS="$(jq -r '((((.data // .).resultData.runData["Finalize Media Assets (Worker)"] // []) | map(.data.main[0][0].json.media_pipeline_status // empty) | .[-1]) // empty)' "$EXECUTION_JSON")"
SESSION_FOLDER_URL="$(jq -r '((((.data // .).resultData.runData["Finalize Session Assets Package (Worker)"] // []) | map(.data.main[0][0].json.session_folder_url // empty) | .[-1]) // empty)' "$EXECUTION_JSON")"
SESSION_SHEET_URL="$(jq -r '((((.data // .).resultData.runData["Finalize Session Assets Package (Worker)"] // []) | map(.data.main[0][0].json.session_sheet_url // empty) | .[-1]) // empty)' "$EXECUTION_JSON")"
SESSION_SHEET_CREATE_STATUS_CODE="$(jq -r '((((.data // .).resultData.runData["Finalize Session Assets Package (Worker)"] // []) | map(.data.main[0][0].json.session_sheet_update_status_code // 0) | .[-1]) // 0)' "$EXECUTION_JSON")"
SESSION_SHEET_ERROR_MESSAGE="$(jq -r '((((.data // .).resultData.runData["Create Session Sheet (Worker)"] // []) | map(.data.main[0][0].json.body.error.message // empty) | .[-1]) // empty)' "$EXECUTION_JSON")"
REVIEW_FILE_URL="$(jq -r '((((.data // .).resultData.runData["Finalize Session Assets Package (Worker)"] // []) | map(.data.main[0][0].json.session_review_file_url // empty) | .[-1]) // empty)' "$EXECUTION_JSON")"
if [ -z "$REVIEW_FILE_URL" ] && [ -f "$START_EXECUTION_JSON" ]; then
  REVIEW_FILE_URL="$(jq -r '((((.data // .).resultData.runData["Finalize Session Assets Package (Worker)"] // []) | map(.data.main[0][0].json.session_review_file_url // empty) | .[-1]) // empty)' "$START_EXECUTION_JSON")"
fi
METADATA_FILE_URL="$(jq -r '((((.data // .).resultData.runData["Finalize Session Assets Package (Worker)"] // []) | map(.data.main[0][0].json.session_metadata_file_url // empty) | .[-1]) // empty)' "$EXECUTION_JSON")"
if [ -z "$METADATA_FILE_URL" ] && [ -f "$START_EXECUTION_JSON" ]; then
  METADATA_FILE_URL="$(jq -r '((((.data // .).resultData.runData["Finalize Session Assets Package (Worker)"] // []) | map(.data.main[0][0].json.session_metadata_file_url // empty) | .[-1]) // empty)' "$START_EXECUTION_JSON")"
fi
MEDIA_ASSETS_COUNT="$(jq -r '((((.data // .).resultData.runData["Finalize Media Assets (Worker)"] // []) | map(.data.main[0][0].json.media_assets // []) | .[-1] | length) // 0)' "$EXECUTION_JSON")"
TTS_GENERATED_COUNT="$(jq -r '((((.data // .).resultData.runData["Finalize Media Assets (Worker)"] // []) | map(.data.main[0][0].json.media_stats.tts_generated_count // 0) | .[-1]) // 0)' "$EXECUTION_JSON")"
IMAGE_GENERATED_COUNT="$(jq -r '((((.data // .).resultData.runData["Finalize Media Assets (Worker)"] // []) | map(.data.main[0][0].json.media_stats.image_generated_count // 0) | .[-1]) // 0)' "$EXECUTION_JSON")"

if [ -z "$MEDIA_PIPELINE_STATUS" ]; then
  fatal 'Missing media_pipeline_status on media_continue execution.'
fi

if [ -z "$SESSION_FOLDER_URL" ] || [ -z "$REVIEW_FILE_URL" ] || [ -z "$METADATA_FILE_URL" ]; then
  fatal 'Session asset links are incomplete. Check execution in UI for details.'
fi

if [ -z "$SESSION_SHEET_URL" ]; then
  if [ "${SESSION_SHEET_CREATE_STATUS_CODE:-0}" -ge 400 ]; then
    fatal "Session sheet was not created (HTTP $SESSION_SHEET_CREATE_STATUS_CODE): ${SESSION_SHEET_ERROR_MESSAGE:-unknown error}"
  fi
  fatal 'Session sheet URL is empty. Check Create Session Sheet (Worker) execution.'
fi

printf '\n'
log 'Full E2E result'
log "- start_http_code: $START_HTTP_CODE"
log "- media_continue_http_code: $MEDIA_CONTINUE_HTTP_CODE"
log "- start_execution_id: $START_EXEC_ID"
log "- media_continue_execution_id: $MEDIA_CONTINUE_EXEC_ID"
if [ -n "${N8N_EDITOR_BASE_URL:-}" ]; then
  UI_BASE="${N8N_EDITOR_BASE_URL%/}"
  log "- media_execution_ui_url: $UI_BASE/workflow/$WORKFLOW_ID/executions/$MEDIA_CONTINUE_EXEC_ID"
fi
log "- session_token: $SESSION_TOKEN"
log "- media_pipeline_status: $MEDIA_PIPELINE_STATUS"
log "- media_assets_count: $MEDIA_ASSETS_COUNT"
log "- tts_generated_count: $TTS_GENERATED_COUNT"
log "- image_generated_count: $IMAGE_GENERATED_COUNT"
log "- session_folder_url: $SESSION_FOLDER_URL"
log "- session_sheet_create_status_code: $SESSION_SHEET_CREATE_STATUS_CODE"
if [ -n "$SESSION_SHEET_ERROR_MESSAGE" ]; then
  log "- session_sheet_error_message: $SESSION_SHEET_ERROR_MESSAGE"
fi
log "- session_sheet_url: $SESSION_SHEET_URL"
log "- review_file_url: $REVIEW_FILE_URL"
log "- metadata_file_url: $METADATA_FILE_URL"

printf '\nMedia assets (voice links):\n'
jq -r '
  (
    ((.data // .).resultData.runData["Finalize Media Assets (Worker)"] // [])
    | map(.data.main[0][0].json.media_assets // [])
    | .[-1]
  ) // []
  | map({
      chunk_key,
      tts_status,
      image_status,
      voice,
      voice_drive_file_id,
      error_reason
    })
' "$EXECUTION_JSON"

restore_workflow
