#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
N8N_ENV_FILE_INPUT="${1:-env.n8n.local}"
CLIPROXY_ENV_FILE_INPUT="${2:-env.cliproxy.local}"
WORKFLOW_TEMPLATE_INPUT="${3:-workflows/demo/gemini-cliproxy-demo.workflow.json}"
REGISTRY_TEMPLATE_INPUT="${WORKFLOW_REGISTRY_TEMPLATE:-$WORKFLOW_TEMPLATE_INPUT}"
WORKFLOW_REGISTRY_FILE="${WORKFLOW_REGISTRY_FILE:-$ROOT_DIR/workflow-registry.json}"
N8N_WORKFLOW_LIST_LIMIT="${N8N_WORKFLOW_LIST_LIMIT:-250}"
N8N_API_RETRY_MAX="${N8N_API_RETRY_MAX:-6}"
N8N_API_RETRY_DELAY_SECONDS="${N8N_API_RETRY_DELAY_SECONDS:-1}"
SHARED_NOTIFICATION_ROUTER_PATH="${SHARED_NOTIFICATION_ROUTER_PATH:-$ROOT_DIR/workflows/shared/shared-notification-router.workflow.json}"
TEXT_TO_IMAGES_WORKFLOW_PATH="${TEXT_TO_IMAGES_WORKFLOW_PATH:-$ROOT_DIR/workflows/book-review/text-to-images.workflow.json}"
TTS_WORKFLOW_PATH="${TTS_WORKFLOW_PATH:-$ROOT_DIR/workflows/book-review/tts.workflow.json}"
TEXT_TO_IMAGES_WORKFLOW_ID="${TEXT_TO_IMAGES_WORKFLOW_ID:-}"
TTS_WORKFLOW_ID="${TTS_WORKFLOW_ID:-}"
TEXT_TO_IMAGES_WORKFLOW_NAME_DEFAULT="${TEXT_TO_IMAGES_WORKFLOW_NAME:-Text To Images}"
TTS_WORKFLOW_NAME_DEFAULT="${TTS_WORKFLOW_NAME:-TTS}"

resolve_path() {
  local path_input="$1"
  if [[ "$path_input" == /* ]]; then
    printf '%s\n' "$path_input"
  else
    printf '%s\n' "$ROOT_DIR/$path_input"
  fi
}

normalize_registry_template() {
  local template_input="$1"
  local abs_path
  abs_path="$(resolve_path "$template_input")"

  if [[ "$abs_path" == "$ROOT_DIR/"* ]]; then
    printf '%s\n' "${abs_path#$ROOT_DIR/}"
  else
    printf '%s\n' "$template_input"
  fi
}

log() {
  printf '[import-workflow] %s\n' "$1"
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Missing required command: $cmd" >&2
    exit 1
  }
}

require_cmd curl
require_cmd jq

N8N_ENV_FILE="$(resolve_path "$N8N_ENV_FILE_INPUT")"
CLIPROXY_ENV_FILE="$(resolve_path "$CLIPROXY_ENV_FILE_INPUT")"
WORKFLOW_TEMPLATE="$(resolve_path "$WORKFLOW_TEMPLATE_INPUT")"
REGISTRY_TEMPLATE="$(normalize_registry_template "$REGISTRY_TEMPLATE_INPUT")"
REGISTRY_TEMPLATE_ABS="$(resolve_path "$REGISTRY_TEMPLATE_INPUT")"
SHARED_NOTIFICATION_ROUTER_PATH="$(resolve_path "$SHARED_NOTIFICATION_ROUTER_PATH")"
TEXT_TO_IMAGES_WORKFLOW_PATH="$(resolve_path "$TEXT_TO_IMAGES_WORKFLOW_PATH")"
TTS_WORKFLOW_PATH="$(resolve_path "$TTS_WORKFLOW_PATH")"

[ -f "$N8N_ENV_FILE" ] || { echo "Missing file: $N8N_ENV_FILE" >&2; exit 1; }
[ -f "$CLIPROXY_ENV_FILE" ] || { echo "Missing file: $CLIPROXY_ENV_FILE" >&2; exit 1; }
[ -f "$WORKFLOW_TEMPLATE" ] || { echo "Missing file: $WORKFLOW_TEMPLATE" >&2; exit 1; }

set -a
# shellcheck source=/dev/null
source "$N8N_ENV_FILE"
# shellcheck source=/dev/null
source "$CLIPROXY_ENV_FILE"
set +a

: "${N8N_API_URL:?N8N_API_URL is required}"
: "${N8N_API_KEY:?N8N_API_KEY is required}"
: "${CLIPROXY_BASE_URL:?CLIPROXY_BASE_URL is required}"
: "${CLIPROXY_CLIENT_KEY:?CLIPROXY_CLIENT_KEY is required}"
N8N_API_URL_DEFAULT="${N8N_API_URL:-}"
N8N_API_KEY_DEFAULT="${N8N_API_KEY:-}"

NOTIFY_TARGETS_DEFAULT="${NOTIFY_TARGETS:-telegram}"
TELEGRAM_BOT_TOKEN_DEFAULT="${TELEGRAM_BOT_TOKEN:-}"
TELEGRAM_CHAT_ID_DEFAULT="${TELEGRAM_CHAT_ID:-}"
GG_CHAT_WEBHOOK_DEFAULT="${GG_CHAT_WEBHOOK:-}"
TELEGRAM_BASE_URL_DEFAULT="${TELEGRAM_BASE_URL:-https://api.telegram.org}"
TELEGRAM_CREDENTIAL_NAME_DEFAULT="${TELEGRAM_CREDENTIAL_NAME:-Local Telegram Bot}"
IMAGE_API_BASE_URL_DEFAULT="${IMAGE_API_BASE_URL:-}"
IMAGE_API_KEY_DEFAULT="${IMAGE_API_KEY:-}"
TTS_API_BASE_URL_DEFAULT="${TTS_API_BASE_URL:-http://127.0.0.1:8001}"
TTS_VOICE_ID_DEFAULT="${TTS_VOICE_ID:-ngochuyen}"
GDRIVE_ROOT_FOLDER_ID_DEFAULT="${GDRIVE_ROOT_FOLDER_ID_DEFAULT:-${GDRIVE_ROOT_FOLDER_ID:-}}"
GDRIVE_CREDENTIAL_NAME_DEFAULT="${GDRIVE_CREDENTIAL_NAME:-}"

if [ "$N8N_WORKFLOW_LIST_LIMIT" -gt 250 ]; then
  echo "N8N_WORKFLOW_LIST_LIMIT must be <= 250 (current: $N8N_WORKFLOW_LIST_LIMIT)" >&2
  exit 1
fi

API_LAST_HTTP_CODE=""
API_LAST_BODY=""

api_request() {
  local method="$1"
  local url="$2"
  local data="${3:-}"
  local body_file
  local attempt=1
  local max_attempts="$N8N_API_RETRY_MAX"
  local base_delay="$N8N_API_RETRY_DELAY_SECONDS"

  if ! [[ "$max_attempts" =~ ^[0-9]+$ ]] || [ "$max_attempts" -lt 1 ]; then
    max_attempts=1
  fi
  if ! [[ "$base_delay" =~ ^[0-9]+$ ]] || [ "$base_delay" -lt 1 ]; then
    base_delay=1
  fi

  while [ "$attempt" -le "$max_attempts" ]; do
    body_file="$(mktemp)"
    if [ -n "$data" ]; then
      API_LAST_HTTP_CODE="$(curl -sS -o "$body_file" -w '%{http_code}' \
        -X "$method" \
        -H "X-N8N-API-KEY: $N8N_API_KEY" \
        -H 'Content-Type: application/json' \
        "$url" \
        -d "$data")"
    else
      API_LAST_HTTP_CODE="$(curl -sS -o "$body_file" -w '%{http_code}' \
        -X "$method" \
        -H "X-N8N-API-KEY: $N8N_API_KEY" \
        "$url")"
    fi

    API_LAST_BODY="$(cat "$body_file")"
    rm -f "$body_file"

    if [ "$API_LAST_HTTP_CODE" != "429" ] && [[ ! "$API_LAST_HTTP_CODE" =~ ^5[0-9][0-9]$ ]]; then
      return
    fi

    if [ "$attempt" -ge "$max_attempts" ]; then
      return
    fi

    local retry_after="$base_delay"
    if [[ "$API_LAST_BODY" =~ [Rr]etry[[:space:]]after[[:space:]]([0-9]+) ]]; then
      retry_after="${BASH_REMATCH[1]}"
    fi
    if ! [[ "$retry_after" =~ ^[0-9]+$ ]] || [ "$retry_after" -lt 1 ]; then
      retry_after="$base_delay"
    fi

    sleep "$retry_after"
    attempt=$((attempt + 1))
  done
}

workflow_exists_by_id() {
  local id="$1"
  api_request GET "$N8N_API_URL/api/v1/workflows/$id"
  [ "$API_LAST_HTTP_CODE" = "200" ] || return 1
  [ "$(echo "$API_LAST_BODY" | jq -r '.isArchived // false')" != "true" ]
}

find_workflow_id_by_name() {
  local workflow_name="$1"

  api_request GET "$N8N_API_URL/api/v1/workflows?limit=$N8N_WORKFLOW_LIST_LIMIT"
  if [ "$API_LAST_HTTP_CODE" != "200" ]; then
    echo "Failed to list workflows from n8n (HTTP $API_LAST_HTTP_CODE)." >&2
    echo "$API_LAST_BODY" | jq . >&2 || echo "$API_LAST_BODY" >&2
    exit 1
  fi

  echo "$API_LAST_BODY" | jq -r --arg name "$workflow_name" '
    (
      (.data // [])
      | map(select(.name == $name and (.isArchived != true)))
      | sort_by(.updatedAt)
      | reverse
      | .[0].id
    ) // empty
  '
}

workflow_template_has_set_assignment() {
  local assignment_name="$1"
  jq -e --arg assignment "$assignment_name" '
    any(.nodes[]?; any((.parameters.assignments.assignments // [])[]?; .name == $assignment))
  ' "$WORKFLOW_TEMPLATE" >/dev/null
}

workflow_template_has_node_name() {
  local node_name="$1"
  jq -e --arg name "$node_name" '
    any(.nodes[]?; .name == $name)
  ' "$WORKFLOW_TEMPLATE" >/dev/null
}

resolve_media_subworkflow_ids() {
  local needs_text_to_images="false"
  local needs_tts="false"

  if workflow_template_has_set_assignment "text_to_images_workflow_id" || workflow_template_has_node_name "Generate Image Assets (Worker)"; then
    needs_text_to_images="true"
  fi

  if workflow_template_has_set_assignment "tts_workflow_id" || workflow_template_has_node_name "Generate TTS Assets (Worker)"; then
    needs_tts="true"
  fi

  if [ "$needs_text_to_images" = "true" ] && [ -z "$TEXT_TO_IMAGES_WORKFLOW_ID" ]; then
    TEXT_TO_IMAGES_WORKFLOW_ID="$(find_workflow_id_by_name "$TEXT_TO_IMAGES_WORKFLOW_NAME_DEFAULT")"
    if [ -n "$TEXT_TO_IMAGES_WORKFLOW_ID" ]; then
      log "Resolved Text To Images workflow ID by name '$TEXT_TO_IMAGES_WORKFLOW_NAME_DEFAULT': $TEXT_TO_IMAGES_WORKFLOW_ID"
    fi
  fi

  if [ "$needs_tts" = "true" ] && [ -z "$TTS_WORKFLOW_ID" ]; then
    TTS_WORKFLOW_ID="$(find_workflow_id_by_name "$TTS_WORKFLOW_NAME_DEFAULT")"
    if [ -n "$TTS_WORKFLOW_ID" ]; then
      log "Resolved TTS workflow ID by name '$TTS_WORKFLOW_NAME_DEFAULT': $TTS_WORKFLOW_ID"
    fi
  fi

  if [ "$needs_text_to_images" = "true" ] && [ -z "$TEXT_TO_IMAGES_WORKFLOW_ID" ]; then
    echo "Cannot resolve TEXT_TO_IMAGES_WORKFLOW_ID for workflow '$WORKFLOW_TEMPLATE'." >&2
    echo "Import 'Text To Images' first or set TEXT_TO_IMAGES_WORKFLOW_ID before importing this workflow." >&2
    exit 1
  fi

  if [ "$needs_tts" = "true" ] && [ -z "$TTS_WORKFLOW_ID" ]; then
    echo "Cannot resolve TTS_WORKFLOW_ID for workflow '$WORKFLOW_TEMPLATE'." >&2
    echo "Import 'TTS' first or set TTS_WORKFLOW_ID before importing this workflow." >&2
    exit 1
  fi
}

find_telegram_credential_id_by_name() {
  local credential_name="$1"

  api_request GET "$N8N_API_URL/api/v1/credentials?limit=$N8N_WORKFLOW_LIST_LIMIT"
  if [ "$API_LAST_HTTP_CODE" != "200" ]; then
    echo "Failed to list credentials from n8n (HTTP $API_LAST_HTTP_CODE)." >&2
    echo "$API_LAST_BODY" | jq . >&2 || echo "$API_LAST_BODY" >&2
    exit 1
  fi

  echo "$API_LAST_BODY" | jq -r --arg credentialName "$credential_name" '
    (
      (.data // [])
      | map(select(.type == "telegramApi" and .name == $credentialName))
      | .[0].id
    ) // empty
  '
}

find_gdrive_credential_binding() {
  local credential_name="$1"

  api_request GET "$N8N_API_URL/api/v1/credentials?limit=$N8N_WORKFLOW_LIST_LIMIT"
  if [ "$API_LAST_HTTP_CODE" != "200" ]; then
    echo "Failed to list credentials from n8n (HTTP $API_LAST_HTTP_CODE)." >&2
    echo "$API_LAST_BODY" | jq . >&2 || echo "$API_LAST_BODY" >&2
    exit 1
  fi

  if [ -n "$credential_name" ]; then
    echo "$API_LAST_BODY" | jq -r --arg credentialName "$credential_name" '
      (
        (.data // [])
        | map(select((.type == "googleDriveOAuth2Api" or .type == "googleApi") and .name == $credentialName))
        | sort_by(
            (if .type == "googleDriveOAuth2Api" then 1 else 0 end),
            (.updatedAt // ""),
            (.createdAt // "")
          )
        | reverse
        | .[0]
      ) as $pick
      | if $pick == null then
          ""
        else
          [$pick.id, $pick.name, $pick.type] | @tsv
        end
    '
    return
  fi

  echo "$API_LAST_BODY" | jq -r '
    (
      (.data // [])
      | map(select(.type == "googleDriveOAuth2Api" or .type == "googleApi"))
      | sort_by(
          (if .type == "googleDriveOAuth2Api" then 1 else 0 end),
          (.updatedAt // ""),
          (.createdAt // "")
        )
      | reverse
      | .[0]
    ) as $pick
    | if $pick == null then
        ""
      else
        [$pick.id, $pick.name, $pick.type] | @tsv
      end
  '
}

create_telegram_credential() {
  local credential_name="$1"
  local access_token="$2"
  local base_url="$3"
  local payload

  payload="$(jq -n \
    --arg name "$credential_name" \
    --arg accessToken "$access_token" \
    --arg baseUrl "$base_url" \
    '{
      name: $name,
      type: "telegramApi",
      data: {
        accessToken: $accessToken,
        baseUrl: $baseUrl
      }
    }')"

  api_request POST "$N8N_API_URL/api/v1/credentials" "$payload"
  if [ "$API_LAST_HTTP_CODE" != "200" ] && [ "$API_LAST_HTTP_CODE" != "201" ]; then
    echo "Failed to create Telegram credential (HTTP $API_LAST_HTTP_CODE)." >&2
    echo "$API_LAST_BODY" | jq . >&2 || echo "$API_LAST_BODY" >&2
    exit 1
  fi

  echo "$API_LAST_BODY" | jq -r '.id // empty'
}

ensure_telegram_credential_id() {
  local has_telegram_nodes="$1"
  if [ "$has_telegram_nodes" != "true" ]; then
    printf '%s\n' ""
    return
  fi

  if [ -z "$TELEGRAM_BOT_TOKEN_DEFAULT" ]; then
    echo "Workflow has Telegram nodes but TELEGRAM_BOT_TOKEN is empty in $N8N_ENV_FILE." >&2
    exit 1
  fi

  local credential_id
  credential_id="$(find_telegram_credential_id_by_name "$TELEGRAM_CREDENTIAL_NAME_DEFAULT")"
  if [ -n "$credential_id" ]; then
    printf '%s\n' "$credential_id"
    return
  fi

  credential_id="$(create_telegram_credential \
    "$TELEGRAM_CREDENTIAL_NAME_DEFAULT" \
    "$TELEGRAM_BOT_TOKEN_DEFAULT" \
    "$TELEGRAM_BASE_URL_DEFAULT")"

  if [ -z "$credential_id" ]; then
    echo "Created Telegram credential but missing id in response." >&2
    exit 1
  fi

  log "Created Telegram credential: $TELEGRAM_CREDENTIAL_NAME_DEFAULT ($credential_id)"
  printf '%s\n' "$credential_id"
}

ensure_gdrive_credential_binding() {
  local has_google_drive_nodes="$1"
  if [ "$has_google_drive_nodes" != "true" ]; then
    printf '%s\n' ""
    return
  fi

  local binding
  binding="$(find_gdrive_credential_binding "$GDRIVE_CREDENTIAL_NAME_DEFAULT")"
  if [ -n "$binding" ]; then
    printf '%s\n' "$binding"
    return
  fi

  if [ -n "$GDRIVE_CREDENTIAL_NAME_DEFAULT" ]; then
    echo "Cannot find Google Drive credential named '$GDRIVE_CREDENTIAL_NAME_DEFAULT' (supported types: googleDriveOAuth2Api, googleApi)." >&2
  else
    echo "Cannot find any Google Drive credential (supported types: googleDriveOAuth2Api, googleApi)." >&2
  fi

  api_request GET "$N8N_API_URL/api/v1/credentials?limit=$N8N_WORKFLOW_LIST_LIMIT"
  if [ "$API_LAST_HTTP_CODE" = "200" ]; then
    echo "Available credentials:" >&2
    echo "$API_LAST_BODY" | jq -r '
      (.data // [])
      | map(select(.type == "googleDriveOAuth2Api" or .type == "googleApi" or .type == "telegramApi"))
      | .[]
      | "- " + (.name // "<no-name>") + " (" + (.type // "<no-type>") + ")"
    ' >&2 || true
  fi

  echo "Create/connect a Google Drive OAuth2 credential in n8n and set GDRIVE_CREDENTIAL_NAME in env.n8n.local to that credential name." >&2
  exit 1
}

has_telegram_nodes="$(
  jq -r '[(.nodes // [])[] | select(.type == "n8n-nodes-base.telegram" or .type == "n8n-nodes-base.telegramTrigger")] | length > 0' "$WORKFLOW_TEMPLATE"
)"

telegram_credential_id="$(ensure_telegram_credential_id "$has_telegram_nodes")"

has_google_drive_nodes="$(
  jq -r '[(.nodes // [])[] | select(.type == "n8n-nodes-base.googleDrive")] | length > 0' "$WORKFLOW_TEMPLATE"
)"

gdrive_binding="$(ensure_gdrive_credential_binding "$has_google_drive_nodes")"
gdrive_credential_id=""
gdrive_credential_name="$GDRIVE_CREDENTIAL_NAME_DEFAULT"
gdrive_credential_type=""
if [ -n "$gdrive_binding" ]; then
  IFS=$'\t' read -r gdrive_credential_id gdrive_credential_name gdrive_credential_type <<< "$gdrive_binding"
fi

resolve_media_subworkflow_ids

payload="$(jq \
  --arg base "$CLIPROXY_BASE_URL" \
  --arg key "$CLIPROXY_CLIENT_KEY" \
  --arg n8nApiUrl "$N8N_API_URL_DEFAULT" \
  --arg n8nApiKey "$N8N_API_KEY_DEFAULT" \
  --arg notifyPath "$SHARED_NOTIFICATION_ROUTER_PATH" \
  --arg notifyTargets "$NOTIFY_TARGETS_DEFAULT" \
  --arg notifyTargetsExpr "={{ \$json.notify_targets || \"$NOTIFY_TARGETS_DEFAULT\" }}" \
  --arg telegramBotToken "$TELEGRAM_BOT_TOKEN_DEFAULT" \
  --arg telegramChatId "$TELEGRAM_CHAT_ID_DEFAULT" \
  --arg ggChatWebhook "$GG_CHAT_WEBHOOK_DEFAULT" \
  --arg imageApiBaseUrl "$IMAGE_API_BASE_URL_DEFAULT" \
  --arg imageApiKey "$IMAGE_API_KEY_DEFAULT" \
  --arg ttsApiBaseUrl "$TTS_API_BASE_URL_DEFAULT" \
  --arg ttsVoiceId "$TTS_VOICE_ID_DEFAULT" \
  --arg gdriveRootFolderId "$GDRIVE_ROOT_FOLDER_ID_DEFAULT" \
  --arg gdriveCredentialName "$gdrive_credential_name" \
  --arg gdriveCredentialId "$gdrive_credential_id" \
  --arg gdriveCredentialResolvedName "$gdrive_credential_name" \
  --arg gdriveCredentialType "$gdrive_credential_type" \
  --arg textToImagesWorkflowPath "$TEXT_TO_IMAGES_WORKFLOW_PATH" \
  --arg ttsWorkflowPath "$TTS_WORKFLOW_PATH" \
  --arg textToImagesWorkflowId "$TEXT_TO_IMAGES_WORKFLOW_ID" \
  --arg ttsWorkflowId "$TTS_WORKFLOW_ID" \
  --arg telegramCredentialId "$telegram_credential_id" \
  --arg telegramCredentialName "$TELEGRAM_CREDENTIAL_NAME_DEFAULT" \
  '
  (.nodes[] | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[] | select(.name=="cliproxy_base_url") | .value) = $base
  | (.nodes[] | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[] | select(.name=="cliproxy_client_key") | .value) = $key
  | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="n8n_api_url") | .value) = $n8nApiUrl
  | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="n8n_api_key") | .value) = $n8nApiKey
  | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="notify_targets") | .value) = $notifyTargets
  | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="telegram_bot_token") | .value) = $telegramBotToken
  | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="telegram_chat_id") | .value) = $telegramChatId
  | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="ggchat_webhook_url") | .value) = $ggChatWebhook
  | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="image_api_base_url") | .value) = $imageApiBaseUrl
  | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="image_api_key") | .value) = $imageApiKey
  | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="tts_api_base_url") | .value) = $ttsApiBaseUrl
  | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="tts_voice_id") | .value) = $ttsVoiceId
  | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="gdrive_root_folder_id") | .value) = $gdriveRootFolderId
  | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="gdrive_credential_name") | .value) = $gdriveCredentialName
  | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="text_to_images_workflow_path") | .value) = $textToImagesWorkflowPath
  | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="tts_workflow_path") | .value) = $ttsWorkflowPath
  | if $textToImagesWorkflowId != "" then
      (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="text_to_images_workflow_id") | .value) = $textToImagesWorkflowId
    else
      .
    end
  | if $ttsWorkflowId != "" then
      (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="tts_workflow_id") | .value) = $ttsWorkflowId
    else
      .
    end
  | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="shared_notification_workflow_path") | .value) = $notifyPath
  | (.nodes[]? | select((.name | tostring) | startswith("Set Notify Targets")) | .parameters.includeOtherFields) = true
  | (.nodes[]? | select((.name | tostring) | startswith("Set Notify Targets")) | .parameters.assignments.assignments[]? | select(.name=="notify_targets") | .value) = $notifyTargetsExpr
  | (.nodes[]? | select((.name | tostring) | startswith("Set Notify Targets")) | .parameters.assignments.assignments[]? | select(.name=="telegram_bot_token") | .value) = $telegramBotToken
  | (.nodes[]? | select((.name | tostring) | startswith("Set Notify Targets")) | .parameters.assignments.assignments[]? | select(.name=="telegram_chat_id") | .value) = $telegramChatId
  | (.nodes[]? | select((.name | tostring) | startswith("Set Notify Targets")) | .parameters.assignments.assignments[]? | select(.name=="ggchat_webhook_url") | .value) = $ggChatWebhook
  | (.nodes[]? | select((.name | tostring) | startswith("Notify via Shared Workflow")) | .parameters.source) = "localFile"
  | (.nodes[]? | select((.name | tostring) | startswith("Notify via Shared Workflow")) | .parameters.workflowPath) = $notifyPath
  | (.nodes[]? | select((.name | tostring) | startswith("Notify via Shared Workflow")) | .parameters) |= del(.workflowId)
  | if $textToImagesWorkflowId != "" then
      (.nodes[]? | select(.name=="Generate Image Assets (Worker)") | .parameters.source) = "database"
      | (.nodes[]? | select(.name=="Generate Image Assets (Worker)") | .parameters.workflowId) = {
          "__rl": true,
          "mode": "list",
          "value": $textToImagesWorkflowId
        }
      | (.nodes[]? | select(.name=="Generate Image Assets (Worker)") | .parameters) |= del(.workflowPath)
    else
      .
    end
  | if $ttsWorkflowId != "" then
      (.nodes[]? | select(.name=="Generate TTS Assets (Worker)") | .parameters.source) = "database"
      | (.nodes[]? | select(.name=="Generate TTS Assets (Worker)") | .parameters.workflowId) = {
          "__rl": true,
          "mode": "list",
          "value": $ttsWorkflowId
        }
      | (.nodes[]? | select(.name=="Generate TTS Assets (Worker)") | .parameters) |= del(.workflowPath)
    else
      .
    end
  | if $gdriveCredentialId != "" and $gdriveCredentialType != "" then
      (.nodes[]? | select(.type=="n8n-nodes-base.googleDrive")) |= (
        .parameters.authentication = (if $gdriveCredentialType == "googleDriveOAuth2Api" then "oAuth2" else "serviceAccount" end)
        | .credentials = (.credentials // {})
        | if $gdriveCredentialType == "googleDriveOAuth2Api" then
            .credentials.googleDriveOAuth2Api = {
              id: $gdriveCredentialId,
              name: $gdriveCredentialResolvedName
            }
            | .credentials |= del(.googleApi)
          else
            .credentials.googleApi = {
              id: $gdriveCredentialId,
              name: $gdriveCredentialResolvedName
            }
            | .credentials |= del(.googleDriveOAuth2Api)
          end
      )
    else
      .
    end
  | if $gdriveCredentialId != "" and $gdriveCredentialType == "googleDriveOAuth2Api" then
      (.nodes[]? | select(.credentials.googleDriveOAuth2Api != null) | .credentials.googleDriveOAuth2Api) = {
        id: $gdriveCredentialId,
        name: $gdriveCredentialResolvedName
      }
    else
      .
    end
  | if $gdriveCredentialId != "" and $gdriveCredentialType == "googleApi" then
      (.nodes[]? | select(.credentials.googleApi != null) | .credentials.googleApi) = {
        id: $gdriveCredentialId,
        name: $gdriveCredentialResolvedName
      }
    else
      .
    end
  | if $telegramCredentialId != "" then
      (.nodes[]? | select(.type=="n8n-nodes-base.telegram" or .type=="n8n-nodes-base.telegramTrigger") | .credentials.telegramApi) = {
        id: $telegramCredentialId,
        name: $telegramCredentialName
      }
    else
      .
    end
  | .settings = (
      (.settings // {})
      | {
          callerPolicy: .callerPolicy,
          availableInMCP: .availableInMCP
        }
      | with_entries(select(.value != null))
    )
  ' "$WORKFLOW_TEMPLATE")"

workflow_name="$(echo "$payload" | jq -r '.name')"
[ -n "$workflow_name" ] || { echo "Workflow template missing .name: $WORKFLOW_TEMPLATE" >&2; exit 1; }

if [ ! -f "$WORKFLOW_REGISTRY_FILE" ]; then
  printf '{\n  "workflows": {}\n}\n' > "$WORKFLOW_REGISTRY_FILE"
fi

registry_workflow_id="$(
  jq -r \
    --arg name "$workflow_name" \
    --arg template "$REGISTRY_TEMPLATE" \
    --arg template_abs "$REGISTRY_TEMPLATE_ABS" \
    '
    ((.workflows // {})[$name].id) // (
      (.workflows // {})
      | to_entries[]
      | select(.value.template == $template or .value.template == $template_abs)
      | .value.id
    ) // empty
    ' "$WORKFLOW_REGISTRY_FILE"
)"

if [ -n "$registry_workflow_id" ] && ! workflow_exists_by_id "$registry_workflow_id"; then
  log "Registry ID is missing or archived in n8n, ignoring it: $registry_workflow_id"
  registry_workflow_id=""
fi

if [ -z "$registry_workflow_id" ]; then
  existing_id="$(find_workflow_id_by_name "$workflow_name")"
  if [ -n "$existing_id" ]; then
    log "Found existing workflow by name, will update by ID: $existing_id"
    registry_workflow_id="$existing_id"
  fi
fi

if [ -n "$registry_workflow_id" ]; then
  api_request PUT "$N8N_API_URL/api/v1/workflows/$registry_workflow_id" "$payload"
  response="$API_LAST_BODY"
  workflow_id="$(echo "$response" | jq -r '.id // empty')"
  action="updated"
else
  api_request POST "$N8N_API_URL/api/v1/workflows" "$payload"
  response="$API_LAST_BODY"
  workflow_id="$(echo "$response" | jq -r '.id // empty')"
  action="created"
fi

if [ -z "$workflow_id" ] && [ "$API_LAST_HTTP_CODE" = "400" ] && echo "$response" | jq -e '.message // "" | test("archived"; "i")' >/dev/null 2>&1; then
  log "Target workflow is archived; creating a fresh workflow instead."
  api_request POST "$N8N_API_URL/api/v1/workflows" "$payload"
  response="$API_LAST_BODY"
  workflow_id="$(echo "$response" | jq -r '.id // empty')"
  action="created"
fi

if [ -z "$workflow_id" ]; then
  echo "Failed to create/update workflow in n8n." >&2
  echo "HTTP status: $API_LAST_HTTP_CODE" >&2
  echo "$response" | jq . >&2 || echo "$response" >&2
  exit 1
fi

tmp_registry="$(mktemp)"
jq \
  --arg name "$workflow_name" \
  --arg id "$workflow_id" \
  --arg template "$REGISTRY_TEMPLATE" \
  --arg synced_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '
  .workflows = (.workflows // {})
  | .workflows = (
      .workflows
      | with_entries(select(.value.id != $id or .key == $name))
    )
  |
  .workflows[$name] = {
    id: $id,
    template: $template,
    lastSyncedAt: $synced_at
  }
  ' "$WORKFLOW_REGISTRY_FILE" > "$tmp_registry"
mv "$tmp_registry" "$WORKFLOW_REGISTRY_FILE"

log "$(tr '[:lower:]' '[:upper:]' <<<"${action:0:1}")${action:1} workflow: $workflow_name"
log "Workflow ID: $workflow_id"
log "Open in UI: $N8N_API_URL/workflow/$workflow_id"
