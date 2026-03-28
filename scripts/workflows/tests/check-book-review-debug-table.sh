#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
N8N_ENV_FILE="${1:-$ROOT_DIR/env.n8n.local}"
TABLE_NAME_OVERRIDE="${2:-}"
SESSION_TOKEN_FILTER="${3:-${BOOK_REVIEW_DEBUG_SESSION_TOKEN:-}}"
LIMIT="${BOOK_REVIEW_DEBUG_TABLE_LIMIT:-20}"

log() {
  printf '[book-review-debug-table] %s\n' "$1"
}

fatal() {
  printf '[book-review-debug-table] ERROR: %s\n' "$1" >&2
  exit 1
}

[ -f "$N8N_ENV_FILE" ] || fatal "Missing file: $N8N_ENV_FILE"

# shellcheck source=/dev/null
source "$N8N_ENV_FILE"
: "${N8N_API_URL:?N8N_API_URL is required}"
: "${N8N_API_KEY:?N8N_API_KEY is required}"

TABLE_NAME="${TABLE_NAME_OVERRIDE:-${MEDIA_DEBUG_TABLE_NAME:-book_review_media_debug}}"
SORT_BY_QS="$(printf '%s' 'updated_at:desc' | jq -sRr @uri)"

LIST_JSON="$(curl -sS -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_API_URL/api/v1/data-tables?limit=200")"
TABLE_ID="$(echo "$LIST_JSON" | jq -r --arg name "$TABLE_NAME" '.data // [] | map(select(.name==$name)) | .[0].id // empty')"

[ -n "$TABLE_ID" ] || fatal "Cannot find data table '$TABLE_NAME'"

if [ -n "$SESSION_TOKEN_FILTER" ]; then
  FILTER_QS="$(jq -cn --arg token "$SESSION_TOKEN_FILTER" '{type:"and",filters:[{columnName:"session_token",condition:"eq",value:$token}]}' | jq -sRr @uri)"
  ROWS_URL="$N8N_API_URL/api/v1/data-tables/$TABLE_ID/rows?limit=$LIMIT&sortBy=$SORT_BY_QS&filter=$FILTER_QS"
else
  ROWS_URL="$N8N_API_URL/api/v1/data-tables/$TABLE_ID/rows?limit=$LIMIT&sortBy=$SORT_BY_QS"
fi

ROWS_JSON="$(curl -sS -H "X-N8N-API-KEY: $N8N_API_KEY" "$ROWS_URL")"
ROW_ERROR="$(echo "$ROWS_JSON" | jq -r '.message // empty')"
[ -z "$ROW_ERROR" ] || fatal "Data table rows API failed: $ROW_ERROR"

log "table_name=$TABLE_NAME"
log "table_id=$TABLE_ID"
if [ -n "$SESSION_TOKEN_FILTER" ]; then
  log "session_token_filter=$SESSION_TOKEN_FILTER"
fi

printf '\nRows summary:\n'
echo "$ROWS_JSON" | jq -r '{
  row_count: ((.data // []) | length),
  rows: (
    (.data // [])
    | map(
      (.debug_payload_json | (try fromjson catch {})) as $p
      | {
          updated_at: (.updated_at // ""),
          session_token: (.session_token // ""),
          event_type: (.event_type // ""),
          reviewer_stage: (.reviewer_stage // ""),
          media_pipeline_status: (.media_pipeline_status // ""),
          media_debug_phase: ($p.summary.media_debug_phase // ""),
          media_started_at: ($p.summary.media_started_at // ""),
          media_finished_at: ($p.summary.media_finished_at // ""),
          media_elapsed_seconds: ($p.summary.media_elapsed_seconds // 0),
          media_assets_count: (.media_assets_count // 0),
          failed_count: (.failed_count // 0),
          skipped_count: (.skipped_count // 0),
          image_generated_count: (.image_generated_count // 0),
          tts_generated_count: (.tts_generated_count // 0),
          status: ($p.summary.status // ""),
          stop_reason: ($p.summary.stop_reason // ""),
          notify_message: (($p.notify_message // "") | tostring | .[0:180])
        }
    )
  )
}'

log 'Done.'
