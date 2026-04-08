#!/usr/bin/env bash
set -euo pipefail
# SYNC_MANAGED_WRAPPER=1
# SYNC_WORKFLOW_ID=t5WpwGyUw5qprVgS

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
N8N_ENV_FILE="${1:-$ROOT_DIR/env.n8n.local}"
PROXY_ENV_FILE="${2:-$ROOT_DIR/env.proxy.local}"
WORKFLOW_TEMPLATE="${3:-$ROOT_DIR/workflows/ui-synced/MoMo/momo-ai-assistant-state-cleanup.workflow.json}"
WORKFLOW_REGISTRY_FILE="${WORKFLOW_REGISTRY_FILE:-$ROOT_DIR/workflow-registry.json}"

STATE_STORE_ID="$(
  jq -r '.workflows["MoMo AI Assistant State Store"].id // empty' "$WORKFLOW_REGISTRY_FILE"
)"

[ -n "$STATE_STORE_ID" ] || { echo "Missing registry ID for MoMo AI Assistant State Store" >&2; exit 1; }

TMP_TEMPLATE="$(mktemp)"

jq \
  --arg stateStoreId "$STATE_STORE_ID" \
  '
  (.nodes[] | select(.name == "Run State Cleanup") | .parameters.workflowId) = {
    "__rl": true,
    "value": $stateStoreId,
    "mode": "list",
    "cachedResultUrl": ("/workflow/" + $stateStoreId),
    "cachedResultName": "MoMo AI Assistant State Store"
  }
  ' "$WORKFLOW_TEMPLATE" > "$TMP_TEMPLATE"

WORKFLOW_REGISTRY_TEMPLATE="workflows/ui-synced/MoMo/momo-ai-assistant-state-cleanup.workflow.json" \
WORKFLOW_REGISTRY_IMPORT="scripts/workflows/import/import-momo-ai-assistant-state-cleanup-workflow.sh" \
  bash "$ROOT_DIR/scripts/workflows/import/import-workflow.sh" \
  "$N8N_ENV_FILE" \
  "$PROXY_ENV_FILE" \
  "$TMP_TEMPLATE"

rm -f "$TMP_TEMPLATE"
