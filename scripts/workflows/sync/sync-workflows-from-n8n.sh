#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
N8N_ENV_FILE="${N8N_ENV_FILE:-$ROOT_DIR/env.n8n.local}"
WORKFLOW_REGISTRY_FILE="${WORKFLOW_REGISTRY_FILE:-$ROOT_DIR/workflow-registry.json}"
CHANGELOG_FILE="${CHANGELOG_FILE:-$ROOT_DIR/CHANGELOG.md}"

APPLY="false"
ONLY_NAME=""
ONLY_ID=""
WRITE_LOG="true"

log() {
  printf '[sync-workflows] %s\n' "$1"
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Missing required command: $cmd" >&2
    exit 1
  }
}

usage() {
  cat <<USAGE
Usage: bash scripts/workflows/sync/sync-workflows-from-n8n.sh [options]

Options:
  --apply               Write changes to workflow JSON files.
  --name <workflow>     Sync only one workflow by name (registry key).
  --id <workflow-id>    Sync only one workflow by n8n ID.
  --no-log              Do not append entries to CHANGELOG.md.
  -h, --help            Show this help.

Default mode is preview only (no file writes).
USAGE
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --apply)
        APPLY="true"
        shift
        ;;
      --name)
        [ "$#" -ge 2 ] || { echo "--name requires a value" >&2; exit 1; }
        ONLY_NAME="$2"
        shift 2
        ;;
      --id)
        [ "$#" -ge 2 ] || { echo "--id requires a value" >&2; exit 1; }
        ONLY_ID="$2"
        shift 2
        ;;
      --no-log)
        WRITE_LOG="false"
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown argument: $1" >&2
        usage >&2
        exit 1
        ;;
    esac
  done
}

resolve_template_path() {
  local template_path="$1"
  if [[ "$template_path" == /* ]]; then
    printf '%s\n' "$template_path"
  else
    printf '%s\n' "$ROOT_DIR/$template_path"
  fi
}

sanitize_and_shape_workflow() {
  jq '
    {
      name: .name,
      nodes: .nodes,
      connections: .connections,
      settings: (.settings // {})
    }
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "proxy_base_url") | .value) = "__PROXY_BASE_URL__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "proxy_api_key") | .value) = "__PROXY_API_KEY__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "n8n_api_url") | .value) = "__N8N_API_URL__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "n8n_api_key") | .value) = "__N8N_API_KEY__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "telegram_bot_token") | .value) = "__TELEGRAM_BOT_TOKEN__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "telegram_chat_id") | .value) = "__TELEGRAM_CHAT_ID__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "ggchat_webhook_url") | .value) = "__GG_CHAT_WEBHOOK__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "image_api_key") | .value) = ""
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "gdrive_root_folder_id") | .value) = "__GDRIVE_ROOT_FOLDER_ID__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "gdrive_credential_name") | .value) = "__GDRIVE_CREDENTIAL_NAME__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "text_to_images_workflow_id") | .value) = "__TEXT_TO_IMAGES_WORKFLOW_ID__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "text_to_videos_workflow_id") | .value) = "__TEXT_TO_VIDEOS_WORKFLOW_ID__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "tts_workflow_id") | .value) = "__TTS_WORKFLOW_ID__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "shared_notification_workflow_path") | .value) = "__SHARED_NOTIFICATION_WORKFLOW_PATH__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "master_prompt_template") | .value) = "__BOOK_REVIEW_MASTER_PROMPT__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "metadata_prompt_template") | .value) = "__BOOK_REVIEW_METADATA_PROMPT__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "qc_prompt_template") | .value) = "__BOOK_REVIEW_QC_PROMPT__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "review_revision_prompt_template") | .value) = "__BOOK_REVIEW_REVIEW_EDIT_PROMPT__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Notify Targets")) | .parameters.includeOtherFields) = true
    | (.nodes[]? | select((.name | tostring) | startswith("Set Notify Targets")) | .parameters.assignments.assignments[]? | select(.name == "notify_targets") | .value) = "__NOTIFY_TARGETS__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Notify Targets")) | .parameters.assignments.assignments[]? | select(.name == "telegram_bot_token") | .value) = "__TELEGRAM_BOT_TOKEN__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Notify Targets")) | .parameters.assignments.assignments[]? | select(.name == "telegram_chat_id") | .value) = "__TELEGRAM_CHAT_ID__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Notify Targets")) | .parameters.assignments.assignments[]? | select(.name == "ggchat_webhook_url") | .value) = "__GG_CHAT_WEBHOOK__"
    | (.nodes[]? | select((.name | tostring) | startswith("Notify via Shared Workflow")) | .parameters.workflowPath) = "__SHARED_NOTIFICATION_WORKFLOW_PATH__"
    | (.nodes[]? | select(.name == "Generate Image Assets (Worker)") | .parameters.source) = "database"
    | (.nodes[]? | select(.name == "Generate Image Assets (Worker)") | .parameters.workflowId) = {
        "__rl": true,
        "mode": "id",
        "value": "={{ (() => { const mode = String($json.media_visual_mode || 'image').toLowerCase(); if (mode === 'video') { return $json.text_to_videos_workflow_id || \"__TEXT_TO_VIDEOS_WORKFLOW_ID__\"; } return $json.text_to_images_workflow_id || \"__TEXT_TO_IMAGES_WORKFLOW_ID__\"; })() }}"
      }
    | (.nodes[]? | select(.name == "Generate Image Assets (Worker)") | .parameters) |= del(.workflowPath)
    | (.nodes[]? | select(.name == "Generate TTS Assets (Worker)") | .parameters.source) = "database"
    | (.nodes[]? | select(.name == "Generate TTS Assets (Worker)") | .parameters.workflowId) = {
        "__rl": true,
        "mode": "id",
        "value": "={{ $json.tts_workflow_id || \"__TTS_WORKFLOW_ID__\" }}"
      }
    | (.nodes[]? | select(.name == "Generate TTS Assets (Worker)") | .parameters) |= del(.workflowPath)
    | (.nodes[]? | select(.credentials.googleApi != null) | .credentials.googleApi) = {
        id: "__GDRIVE_CREDENTIAL_ID__",
        name: "__GDRIVE_CREDENTIAL_NAME__"
      }
    | (.nodes[]? | select(.credentials.googleDriveOAuth2Api != null) | .credentials.googleDriveOAuth2Api) = {
        id: "__GDRIVE_CREDENTIAL_ID__",
        name: "__GDRIVE_CREDENTIAL_NAME__"
      }
    | (.nodes[]? | select(.type == "n8n-nodes-base.telegram" or .type == "n8n-nodes-base.telegramTrigger") | .credentials.telegramApi) = {
        id: "__TELEGRAM_CREDENTIAL_ID__",
        name: "__TELEGRAM_CREDENTIAL_NAME__"
      }
  '
}

ensure_changelog_file() {
  local file="$1"
  if [ -f "$file" ]; then
    return
  fi
  cat > "$file" <<'EOT'
# Changelog

Nhat ky thay doi chi tiet cua du an (dac biet cho workflow sync/import va automation scripts).
EOT
}

append_changelog_entry() {
  local file="$1"
  local ts="$2"
  local summary="$3"
  local details="$4"
  cat >> "$file" <<EOT

## $ts
- $summary
- $details
EOT
}

main() {
  parse_args "$@"

  require_cmd curl
  require_cmd jq
  require_cmd diff

  [ -f "$N8N_ENV_FILE" ] || { echo "Missing file: $N8N_ENV_FILE" >&2; exit 1; }
  [ -f "$WORKFLOW_REGISTRY_FILE" ] || { echo "Missing file: $WORKFLOW_REGISTRY_FILE" >&2; exit 1; }

  set -a
  # shellcheck source=/dev/null
  source "$N8N_ENV_FILE"
  set +a

  : "${N8N_API_URL:?N8N_API_URL is required}"
  : "${N8N_API_KEY:?N8N_API_KEY is required}"

  local selected
  selected="$(jq -c '.workflows // {} | to_entries[]' "$WORKFLOW_REGISTRY_FILE")"

  if [ -n "$ONLY_NAME" ]; then
    selected="$(printf '%s\n' "$selected" | jq -c --arg n "$ONLY_NAME" 'select(.key == $n)')"
  fi

  if [ -n "$ONLY_ID" ]; then
    selected="$(printf '%s\n' "$selected" | jq -c --arg i "$ONLY_ID" 'select(.value.id == $i)')"
  fi

  if [ -z "${selected:-}" ]; then
    echo "No workflows matched in registry." >&2
    exit 1
  fi

  local total=0
  local changed=0
  local unchanged=0
  local failed=0
  local changed_names=""

  while IFS= read -r entry; do
    [ -n "$entry" ] || continue
    total=$((total + 1))

    local wf_name wf_id wf_template_raw wf_template
    wf_name="$(echo "$entry" | jq -r '.key')"
    wf_id="$(echo "$entry" | jq -r '.value.id')"
    wf_template_raw="$(echo "$entry" | jq -r '.value.template')"

    if [ -z "$wf_id" ] || [ "$wf_id" = "null" ]; then
      log "SKIP $wf_name (missing id in registry)"
      failed=$((failed + 1))
      continue
    fi

    if [ -z "$wf_template_raw" ] || [ "$wf_template_raw" = "null" ]; then
      log "SKIP $wf_name (missing template path in registry)"
      failed=$((failed + 1))
      continue
    fi

    wf_template="$(resolve_template_path "$wf_template_raw")"

    local body_file code raw shaped existing_file tmp_new
    body_file="$(mktemp)"
    code="$(curl -sS -o "$body_file" -w '%{http_code}' -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_API_URL/api/v1/workflows/$wf_id")"
    raw="$(cat "$body_file")"
    rm -f "$body_file"

    if [ "$code" != "200" ]; then
      log "FAIL $wf_name ($wf_id) HTTP $code"
      failed=$((failed + 1))
      continue
    fi

    shaped="$(echo "$raw" | sanitize_and_shape_workflow)"
    tmp_new="$(mktemp)"
    echo "$shaped" | jq . > "$tmp_new"

    if [ -f "$wf_template" ]; then
      existing_file="$wf_template"
    else
      mkdir -p "$(dirname "$wf_template")"
      existing_file=""
    fi

    if [ -n "$existing_file" ] && diff -q "$existing_file" "$tmp_new" >/dev/null 2>&1; then
      log "UNCHANGED $wf_name -> $wf_template_raw"
      unchanged=$((unchanged + 1))
      rm -f "$tmp_new"
      continue
    fi

    if [ "$APPLY" = "true" ]; then
      mv "$tmp_new" "$wf_template"
      changed=$((changed + 1))
      if [ -z "$changed_names" ]; then
        changed_names="$wf_name"
      else
        changed_names="$changed_names, $wf_name"
      fi
      log "UPDATED $wf_name -> $wf_template_raw"
    else
      changed=$((changed + 1))
      log "CHANGED $wf_name -> $wf_template_raw (preview only, use --apply to write)"
      rm -f "$tmp_new"
    fi
  done <<< "$selected"

  log "Summary total=$total changed=$changed unchanged=$unchanged failed=$failed mode=$( [ "$APPLY" = "true" ] && echo apply || echo preview )"

  if [ "$APPLY" = "true" ] && [ "$WRITE_LOG" = "true" ]; then
    local ts_iso summary details
    ts_iso="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

    if [ -z "$changed_names" ]; then
      summary="Workflow sync (UI -> JSON) completed with no file changes."
      details="Run mode=apply, total=$total, changed=$changed, unchanged=$unchanged, failed=$failed."
    else
      summary="Workflow sync (UI -> JSON) updated $changed workflow(s)."
      details="Changed: $changed_names. Run mode=apply, total=$total, unchanged=$unchanged, failed=$failed."
    fi

    ensure_changelog_file "$CHANGELOG_FILE"
    append_changelog_entry "$CHANGELOG_FILE" "$ts_iso" "$summary" "$details"

    log "Logged run to $CHANGELOG_FILE."
  fi

  if [ "$failed" -gt 0 ]; then
    exit 1
  fi
}

main "$@"
