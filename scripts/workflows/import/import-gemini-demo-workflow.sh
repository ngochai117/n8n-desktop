#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
N8N_ENV_FILE="${1:-$ROOT_DIR/env.n8n.local}"
CLIPROXY_ENV_FILE="${2:-$ROOT_DIR/env.cliproxy.local}"
WORKFLOW_TEMPLATE="${3:-$ROOT_DIR/workflows/gemini-cliproxy-demo.workflow.json}"
REGISTRY_TEMPLATE="${WORKFLOW_REGISTRY_TEMPLATE:-$WORKFLOW_TEMPLATE}"
WORKFLOW_REGISTRY_FILE="${WORKFLOW_REGISTRY_FILE:-$ROOT_DIR/workflow-registry.json}"
N8N_WORKFLOW_LIST_LIMIT="${N8N_WORKFLOW_LIST_LIMIT:-250}"
SHARED_NOTIFICATION_ROUTER_PATH="${SHARED_NOTIFICATION_ROUTER_PATH:-$ROOT_DIR/workflows/shared-notification-router.workflow.json}"

log() {
  printf '[import-demo] %s\n' "$1"
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

payload="$(jq \
  --arg base "$CLIPROXY_BASE_URL" \
  --arg key "$CLIPROXY_CLIENT_KEY" \
  --arg notifyPath "$SHARED_NOTIFICATION_ROUTER_PATH" \
  '
  (.nodes[] | select(.name=="Set Config") | .parameters.assignments.assignments[] | select(.name=="cliproxy_base_url") | .value) = $base
  | (.nodes[] | select(.name=="Set Config") | .parameters.assignments.assignments[] | select(.name=="cliproxy_client_key") | .value) = $key
  | (.nodes[] | select(.name=="Notify via Shared Workflow") | .parameters.source) = "localFile"
  | (.nodes[] | select(.name=="Notify via Shared Workflow") | .parameters.workflowPath) = $notifyPath
  | (.nodes[] | select(.name=="Notify via Shared Workflow") | .parameters) |= del(.workflowId)
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
    '
    ((.workflows // {})[$name].id) // (
      (.workflows // {})
      | to_entries[]
      | select(.value.template == $template)
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
