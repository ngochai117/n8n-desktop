#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
N8N_ENV_FILE="${1:-$ROOT_DIR/env.n8n.local}"
CLIPROXY_ENV_FILE="${2:-$ROOT_DIR/env.cliproxy.local}"
MAIN_WORKFLOW_TEMPLATE="${3:-$ROOT_DIR/workflows/book-review/book-review-gemini.workflow.json}"
PROMPT_TEMPLATE_FILE="${4:-$ROOT_DIR/workflows/book-review/prompts/book-review-master-prompt.txt}"
METADATA_PROMPT_TEMPLATE_FILE="${5:-$ROOT_DIR/workflows/book-review/prompts/book-review-metadata-prompt.txt}"
QC_PROMPT_TEMPLATE_FILE="${6:-$ROOT_DIR/workflows/book-review/prompts/book-review-qc-prompt.txt}"
REVIEW_EDIT_PROMPT_TEMPLATE_FILE="${7:-$ROOT_DIR/workflows/book-review/prompts/book-review-review-edit-prompt.txt}"

[ -f "$MAIN_WORKFLOW_TEMPLATE" ] || { echo "Missing file: $MAIN_WORKFLOW_TEMPLATE" >&2; exit 1; }
[ -f "$PROMPT_TEMPLATE_FILE" ] || { echo "Missing file: $PROMPT_TEMPLATE_FILE" >&2; exit 1; }
[ -f "$METADATA_PROMPT_TEMPLATE_FILE" ] || { echo "Missing file: $METADATA_PROMPT_TEMPLATE_FILE" >&2; exit 1; }
[ -f "$QC_PROMPT_TEMPLATE_FILE" ] || { echo "Missing file: $QC_PROMPT_TEMPLATE_FILE" >&2; exit 1; }
[ -f "$REVIEW_EDIT_PROMPT_TEMPLATE_FILE" ] || { echo "Missing file: $REVIEW_EDIT_PROMPT_TEMPLATE_FILE" >&2; exit 1; }

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

inject_prompts() {
  local src_template="$1"
  local dst_template="$2"

  jq \
    --rawfile prompt "$PROMPT_TEMPLATE_FILE" \
    --rawfile metadata_prompt "$METADATA_PROMPT_TEMPLATE_FILE" \
    --rawfile qc_prompt "$QC_PROMPT_TEMPLATE_FILE" \
    --rawfile review_edit_prompt "$REVIEW_EDIT_PROMPT_TEMPLATE_FILE" \
    '
    (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="master_prompt_template") | .value) = $prompt
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="metadata_prompt_template") | .value) = $metadata_prompt
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="qc_prompt_template") | .value) = $qc_prompt
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="review_revision_prompt_template") | .value) = $review_edit_prompt
    ' "$src_template" > "$dst_template"
}

import_one() {
  local template="$1"
  local tmp_template="$2"

  inject_prompts "$template" "$tmp_template"

  WORKFLOW_REGISTRY_TEMPLATE="$template" \
  bash "$ROOT_DIR/scripts/workflows/import/import-workflow.sh" \
    "$N8N_ENV_FILE" \
    "$CLIPROXY_ENV_FILE" \
    "$tmp_template"
}

import_one "$MAIN_WORKFLOW_TEMPLATE" "$TMP_DIR/main.workflow.json"

echo "[import-book-review] Imported unified book-review workflow successfully."
