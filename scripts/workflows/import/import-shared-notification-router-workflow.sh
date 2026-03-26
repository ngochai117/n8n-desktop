#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
N8N_ENV_FILE="${1:-$ROOT_DIR/env.n8n.local}"
CLIPROXY_ENV_FILE="${2:-$ROOT_DIR/env.cliproxy.local}"
WORKFLOW_TEMPLATE="${3:-$ROOT_DIR/workflows/shared/shared-notification-router.workflow.json}"

bash "$ROOT_DIR/scripts/workflows/import/import-workflow.sh" \
  "$N8N_ENV_FILE" \
  "$CLIPROXY_ENV_FILE" \
  "$WORKFLOW_TEMPLATE"
