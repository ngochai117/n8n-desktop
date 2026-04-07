#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
WORKFLOW_TEMPLATE="${1:-$ROOT_DIR/workflows/media/tts-vrex.workflow.json}"

node "$ROOT_DIR/scripts/workflows/tests/test-tts-vrex-checklist.mjs" "$WORKFLOW_TEMPLATE"
