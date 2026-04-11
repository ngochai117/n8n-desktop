#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
WORKFLOW_TEMPLATE="${1:-$ROOT_DIR/workflows/ui-synced/Jira/jira-ai-agent.workflow.json}"

node "$ROOT_DIR/scripts/workflows/tests/test-jira-ai-agent-checklist.mjs" "$WORKFLOW_TEMPLATE"
