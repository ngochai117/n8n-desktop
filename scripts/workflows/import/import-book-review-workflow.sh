#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
N8N_ENV_FILE="${1:-$ROOT_DIR/env.n8n.local}"
CLIPROXY_ENV_FILE="${2:-$ROOT_DIR/env.cliproxy.local}"
WORKFLOW_TEMPLATE="${3:-$ROOT_DIR/workflows/book-review-gemini.workflow.json}"
PROMPT_TEMPLATE_FILE="${4:-$ROOT_DIR/workflows/prompts/book-review-master-prompt.txt}"

[ -f "$WORKFLOW_TEMPLATE" ] || { echo "Missing file: $WORKFLOW_TEMPLATE" >&2; exit 1; }
[ -f "$PROMPT_TEMPLATE_FILE" ] || { echo "Missing file: $PROMPT_TEMPLATE_FILE" >&2; exit 1; }

TMP_TEMPLATE="$(mktemp)"
trap 'rm -f "$TMP_TEMPLATE"' EXIT

jq \
  --rawfile prompt "$PROMPT_TEMPLATE_FILE" \
  '
  (.nodes[] | select(.name=="Set Config") | .parameters.assignments.assignments[] | select(.name=="master_prompt_template") | .value) = $prompt
  ' "$WORKFLOW_TEMPLATE" > "$TMP_TEMPLATE"

WORKFLOW_REGISTRY_TEMPLATE="$WORKFLOW_TEMPLATE" \
bash "$ROOT_DIR/scripts/workflows/import/import-workflow.sh" \
  "$N8N_ENV_FILE" \
  "$CLIPROXY_ENV_FILE" \
  "$TMP_TEMPLATE"
