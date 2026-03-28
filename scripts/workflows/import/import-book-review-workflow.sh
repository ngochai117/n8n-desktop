#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
N8N_ENV_FILE="${1:-$ROOT_DIR/env.n8n.local}"
CLIPROXY_ENV_FILE="${2:-$ROOT_DIR/env.cliproxy.local}"
TEXT_TO_IMAGES_WORKFLOW_TEMPLATE="${3:-$ROOT_DIR/workflows/book-review/text-to-images.workflow.json}"
TTS_WORKFLOW_TEMPLATE="${4:-$ROOT_DIR/workflows/book-review/tts.workflow.json}"
MAIN_WORKFLOW_TEMPLATE="${5:-$ROOT_DIR/workflows/book-review/book-review.workflow.json}"
PROMPT_TEMPLATE_FILE="${6:-$ROOT_DIR/workflows/book-review/prompts/book-review-master-prompt.txt}"
METADATA_PROMPT_TEMPLATE_FILE="${7:-$ROOT_DIR/workflows/book-review/prompts/book-review-metadata-prompt.txt}"
QC_PROMPT_TEMPLATE_FILE="${8:-$ROOT_DIR/workflows/book-review/prompts/book-review-qc-prompt.txt}"
REVIEW_EDIT_PROMPT_TEMPLATE_FILE="${9:-$ROOT_DIR/workflows/book-review/prompts/book-review-review-edit-prompt.txt}"
WORKFLOW_REGISTRY_FILE="${WORKFLOW_REGISTRY_FILE:-$ROOT_DIR/workflow-registry.json}"
TEXT_TO_IMAGES_WORKFLOW_NAME="${TEXT_TO_IMAGES_WORKFLOW_NAME:-Text To Images}"
TTS_WORKFLOW_NAME="${TTS_WORKFLOW_NAME:-TTS}"

[ -f "$TEXT_TO_IMAGES_WORKFLOW_TEMPLATE" ] || { echo "Missing file: $TEXT_TO_IMAGES_WORKFLOW_TEMPLATE" >&2; exit 1; }
[ -f "$TTS_WORKFLOW_TEMPLATE" ] || { echo "Missing file: $TTS_WORKFLOW_TEMPLATE" >&2; exit 1; }
[ -f "$MAIN_WORKFLOW_TEMPLATE" ] || { echo "Missing file: $MAIN_WORKFLOW_TEMPLATE" >&2; exit 1; }
[ -f "$PROMPT_TEMPLATE_FILE" ] || { echo "Missing file: $PROMPT_TEMPLATE_FILE" >&2; exit 1; }
[ -f "$METADATA_PROMPT_TEMPLATE_FILE" ] || { echo "Missing file: $METADATA_PROMPT_TEMPLATE_FILE" >&2; exit 1; }
[ -f "$QC_PROMPT_TEMPLATE_FILE" ] || { echo "Missing file: $QC_PROMPT_TEMPLATE_FILE" >&2; exit 1; }
[ -f "$REVIEW_EDIT_PROMPT_TEMPLATE_FILE" ] || { echo "Missing file: $REVIEW_EDIT_PROMPT_TEMPLATE_FILE" >&2; exit 1; }
[ -f "$WORKFLOW_REGISTRY_FILE" ] || { echo "Missing file: $WORKFLOW_REGISTRY_FILE" >&2; exit 1; }

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
  local tmp_template="${2:-}"
  local apply_prompts="${3:-false}"

  local source_template="$template"
  if [ "$apply_prompts" = "true" ]; then
    inject_prompts "$template" "$tmp_template"
    source_template="$tmp_template"
  fi

  WORKFLOW_REGISTRY_TEMPLATE="$template" \
  bash "$ROOT_DIR/scripts/workflows/import/import-workflow.sh" \
    "$N8N_ENV_FILE" \
    "$CLIPROXY_ENV_FILE" \
    "$source_template"
}

import_one "$TEXT_TO_IMAGES_WORKFLOW_TEMPLATE"
import_one "$TTS_WORKFLOW_TEMPLATE"

text_to_images_workflow_id="$(
  jq -r --arg name "$TEXT_TO_IMAGES_WORKFLOW_NAME" '.workflows[$name].id // empty' "$WORKFLOW_REGISTRY_FILE"
)"
tts_workflow_id="$(
  jq -r --arg name "$TTS_WORKFLOW_NAME" '.workflows[$name].id // empty' "$WORKFLOW_REGISTRY_FILE"
)"

[ -n "$text_to_images_workflow_id" ] || {
  echo "Cannot resolve workflow ID for '$TEXT_TO_IMAGES_WORKFLOW_NAME' from $WORKFLOW_REGISTRY_FILE" >&2
  exit 1
}
[ -n "$tts_workflow_id" ] || {
  echo "Cannot resolve workflow ID for '$TTS_WORKFLOW_NAME' from $WORKFLOW_REGISTRY_FILE" >&2
  exit 1
}

TEXT_TO_IMAGES_WORKFLOW_ID="$text_to_images_workflow_id" \
TTS_WORKFLOW_ID="$tts_workflow_id" \
import_one "$MAIN_WORKFLOW_TEMPLATE" "$TMP_DIR/main.workflow.json" "true"

echo "[import-book-review] Imported workflows successfully: text-to-images, tts, book-review."
