#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
MAIN_WORKFLOW_TEMPLATE="${1:-$ROOT_DIR/workflows/book-review/book-review-gemini.workflow.json}"

node "$ROOT_DIR/scripts/workflows/tests/test-book-review-checklist.mjs" \
  "$MAIN_WORKFLOW_TEMPLATE"
