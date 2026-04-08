#!/usr/bin/env bash
set -euo pipefail
# SYNC_MANAGED_WRAPPER=1
# SYNC_WORKFLOW_ID=JffudBpBO0QYjP8K

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
N8N_ENV_FILE="${1:-$ROOT_DIR/env.n8n.local}"
PROXY_ENV_FILE="${2:-$ROOT_DIR/env.proxy.local}"
WORKFLOW_TEMPLATE="${3:-$ROOT_DIR/workflows/ui-synced/MoMo/momo-ai-assistant.workflow.json}"
WORKFLOW_REGISTRY_FILE="${WORKFLOW_REGISTRY_FILE:-$ROOT_DIR/workflow-registry.json}"

bash "$ROOT_DIR/scripts/workflows/import/import-momo-ai-assistant-state-store-workflow.sh" \
  "$N8N_ENV_FILE" \
  "$PROXY_ENV_FILE"

bash "$ROOT_DIR/scripts/workflows/import/import-momo-ai-assistant-state-cleanup-workflow.sh" \
  "$N8N_ENV_FILE" \
  "$PROXY_ENV_FILE"

bash "$ROOT_DIR/scripts/workflows/import/import-momo-ai-assistant-tool-sprint-healthcheck-workflow.sh" \
  "$N8N_ENV_FILE" \
  "$PROXY_ENV_FILE"

bash "$ROOT_DIR/scripts/workflows/import/import-momo-ai-assistant-tool-demo-commands-workflow.sh" \
  "$N8N_ENV_FILE" \
  "$PROXY_ENV_FILE"

STATE_STORE_ID="$(
  jq -r '.workflows["MoMo AI Assistant State Store"].id // empty' "$WORKFLOW_REGISTRY_FILE"
)"

HEALTHCHECK_TOOL_ID="$(
  jq -r '.workflows["MoMo AI Assistant Tool Sprint Healthcheck"].id // empty' "$WORKFLOW_REGISTRY_FILE"
)"

DEMO_TOOL_ID="$(
  jq -r '.workflows["MoMo AI Assistant Tool Demo Commands"].id // empty' "$WORKFLOW_REGISTRY_FILE"
)"

[ -n "$STATE_STORE_ID" ] || { echo "Missing registry ID for MoMo AI Assistant State Store" >&2; exit 1; }
[ -n "$HEALTHCHECK_TOOL_ID" ] || { echo "Missing registry ID for MoMo AI Assistant Tool Sprint Healthcheck" >&2; exit 1; }
[ -n "$DEMO_TOOL_ID" ] || { echo "Missing registry ID for MoMo AI Assistant Tool Demo Commands" >&2; exit 1; }

TMP_TEMPLATE="$(mktemp)"

jq \
  --arg stateStoreId "$STATE_STORE_ID" \
  --arg healthcheckToolId "$HEALTHCHECK_TOOL_ID" \
  --arg demoToolId "$DEMO_TOOL_ID" \
  '
  (.nodes[] | select(
    .name == "Load Session"
    or .name == "Log Healthcheck Tool Run"
    or .name == "Save Agent Session"
  ) | .parameters.workflowId) = {
    "__rl": true,
    "value": $stateStoreId,
    "mode": "list",
    "cachedResultUrl": ("/workflow/" + $stateStoreId),
    "cachedResultName": "MoMo AI Assistant State Store"
  }
  | (.nodes[] | select(.name == "Run Sprint Healthcheck Tool") | .parameters.workflowId) = {
    "__rl": true,
    "value": $healthcheckToolId,
    "mode": "list",
    "cachedResultUrl": ("/workflow/" + $healthcheckToolId),
    "cachedResultName": "MoMo AI Assistant Tool Sprint Healthcheck"
  }
  | (.nodes[] | select(.name == "Sprint Healthcheck Workflow Tool") | .parameters.workflowId) = {
    "__rl": true,
    "value": $healthcheckToolId,
    "mode": "list",
    "cachedResultUrl": ("/workflow/" + $healthcheckToolId),
    "cachedResultName": "MoMo AI Assistant Tool Sprint Healthcheck"
  }
  | (.nodes[] | select(.name == "Demo Command Workflow Tool") | .parameters.workflowId) = {
    "__rl": true,
    "value": $demoToolId,
    "mode": "list",
    "cachedResultUrl": ("/workflow/" + $demoToolId),
    "cachedResultName": "MoMo AI Assistant Tool Demo Commands"
  }
  | (.nodes[] | select(.name == "Run Demo Command Tool") | .parameters.workflowId) = {
    "__rl": true,
    "value": $demoToolId,
    "mode": "list",
    "cachedResultUrl": ("/workflow/" + $demoToolId),
    "cachedResultName": "MoMo AI Assistant Tool Demo Commands"
  }
  ' "$WORKFLOW_TEMPLATE" > "$TMP_TEMPLATE"

WORKFLOW_REGISTRY_TEMPLATE="workflows/ui-synced/MoMo/momo-ai-assistant.workflow.json" \
WORKFLOW_REGISTRY_IMPORT="scripts/workflows/import/import-momo-ai-assistant-workflow.sh" \
  bash "$ROOT_DIR/scripts/workflows/import/import-workflow.sh" \
  "$N8N_ENV_FILE" \
  "$PROXY_ENV_FILE" \
  "$TMP_TEMPLATE"

rm -f "$TMP_TEMPLATE"
