#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
N8N_ENV_FILE="${1:-$ROOT_DIR/env.n8n.local}"
PROXY_ENV_FILE="${2:-$ROOT_DIR/env.proxy.local}"
WORKFLOW_TEMPLATE="${3:-$ROOT_DIR/workflows/book-review/tts.workflow.json}"

bash "$ROOT_DIR/scripts/workflows/import/import-workflow.sh" \
  "$N8N_ENV_FILE" \
  "$PROXY_ENV_FILE" \
  "$WORKFLOW_TEMPLATE"
