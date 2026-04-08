#!/usr/bin/env bash
set -euo pipefail
# SYNC_MANAGED_WRAPPER=1
# SYNC_WORKFLOW_ID=buH9JMCFNDnD3ZWU

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
N8N_ENV_FILE="${1:-$ROOT_DIR/env.n8n.local}"
PROXY_ENV_FILE="${2:-$ROOT_DIR/env.proxy.local}"
WORKFLOW_TEMPLATE="${3:-$ROOT_DIR/workflows/ui-synced/MoMo/momo-ai-assistant-state-store.workflow.json}"

WORKFLOW_REGISTRY_IMPORT="scripts/workflows/import/import-momo-ai-assistant-state-store-workflow.sh" \
  bash "$ROOT_DIR/scripts/workflows/import/import-workflow.sh" \
  "$N8N_ENV_FILE" \
  "$PROXY_ENV_FILE" \
  "$WORKFLOW_TEMPLATE"
