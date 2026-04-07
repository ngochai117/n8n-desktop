#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
WORKFLOW_TEMPLATE="${1:-$ROOT_DIR/workflows/ui-synced/MoMo/momo-ai-assistant.workflow.json}"

node "$ROOT_DIR/scripts/workflows/tests/test-momo-ai-assistant-checklist.mjs" "$WORKFLOW_TEMPLATE"
