#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
N8N_ENV_FILE="${1:-$ROOT_DIR/env.n8n.local}"
PROXY_ENV_FILE="${2:-$ROOT_DIR/env.proxy.local}"
TEXT_TO_IMAGES_WORKFLOW_TEMPLATE="${3:-$ROOT_DIR/workflows/book-review/text-to-images.workflow.json}"
TTS_WORKFLOW_TEMPLATE="${4:-$ROOT_DIR/workflows/book-review/tts.workflow.json}"
MAIN_WORKFLOW_TEMPLATE="${5:-$ROOT_DIR/workflows/book-review/book-review.workflow.json}"
TEXT_TO_VIDEOS_WORKFLOW_TEMPLATE="${TEXT_TO_VIDEOS_WORKFLOW_TEMPLATE:-$ROOT_DIR/workflows/book-review/text-to-videos-veo3.workflow.json}"
SCENE_OUTLINE_PROMPT_TEMPLATE_FILE="${6:-$ROOT_DIR/workflows/book-review/prompts/book-review-scene-outline-prompt.txt}"
SCENE_EXPAND_PROMPT_TEMPLATE_FILE="${7:-$ROOT_DIR/workflows/book-review/prompts/book-review-scene-expand-prompt.txt}"
METADATA_PROMPT_TEMPLATE_FILE="${8:-$ROOT_DIR/workflows/book-review/prompts/book-review-metadata-prompt.txt}"
QC_PROMPT_TEMPLATE_FILE="${9:-$ROOT_DIR/workflows/book-review/prompts/book-review-qc-prompt.txt}"
REVIEW_EDIT_PROMPT_TEMPLATE_FILE="${10:-$ROOT_DIR/workflows/book-review/prompts/book-review-review-edit-prompt.txt}"
MASTER_PROMPT_TEMPLATE_FILE="${MASTER_PROMPT_TEMPLATE_FILE:-$ROOT_DIR/workflows/book-review/prompts/book-review-master-prompt.txt}"
WORKFLOW_REGISTRY_FILE="${WORKFLOW_REGISTRY_FILE:-$ROOT_DIR/workflow-registry.json}"
TEXT_TO_IMAGES_WORKFLOW_NAME="${TEXT_TO_IMAGES_WORKFLOW_NAME:-Text To Images}"
TEXT_TO_VIDEOS_WORKFLOW_NAME="${TEXT_TO_VIDEOS_WORKFLOW_NAME:-Text To Videos VEO3}"
TTS_WORKFLOW_NAME="${TTS_WORKFLOW_NAME:-TTS}"

[ -f "$TEXT_TO_IMAGES_WORKFLOW_TEMPLATE" ] || { echo "Missing file: $TEXT_TO_IMAGES_WORKFLOW_TEMPLATE" >&2; exit 1; }
[ -f "$TEXT_TO_VIDEOS_WORKFLOW_TEMPLATE" ] || { echo "Missing file: $TEXT_TO_VIDEOS_WORKFLOW_TEMPLATE" >&2; exit 1; }
[ -f "$TTS_WORKFLOW_TEMPLATE" ] || { echo "Missing file: $TTS_WORKFLOW_TEMPLATE" >&2; exit 1; }
[ -f "$MAIN_WORKFLOW_TEMPLATE" ] || { echo "Missing file: $MAIN_WORKFLOW_TEMPLATE" >&2; exit 1; }
[ -f "$SCENE_OUTLINE_PROMPT_TEMPLATE_FILE" ] || { echo "Missing file: $SCENE_OUTLINE_PROMPT_TEMPLATE_FILE" >&2; exit 1; }
[ -f "$SCENE_EXPAND_PROMPT_TEMPLATE_FILE" ] || { echo "Missing file: $SCENE_EXPAND_PROMPT_TEMPLATE_FILE" >&2; exit 1; }
[ -f "$METADATA_PROMPT_TEMPLATE_FILE" ] || { echo "Missing file: $METADATA_PROMPT_TEMPLATE_FILE" >&2; exit 1; }
[ -f "$QC_PROMPT_TEMPLATE_FILE" ] || { echo "Missing file: $QC_PROMPT_TEMPLATE_FILE" >&2; exit 1; }
[ -f "$REVIEW_EDIT_PROMPT_TEMPLATE_FILE" ] || { echo "Missing file: $REVIEW_EDIT_PROMPT_TEMPLATE_FILE" >&2; exit 1; }
[ -f "$MASTER_PROMPT_TEMPLATE_FILE" ] || { echo "Missing file: $MASTER_PROMPT_TEMPLATE_FILE" >&2; exit 1; }
[ -f "$WORKFLOW_REGISTRY_FILE" ] || { echo "Missing file: $WORKFLOW_REGISTRY_FILE" >&2; exit 1; }

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

extract_style_kernel() {
  awk '
    /STYLE KERNEL START/ { capture=1; next }
    /STYLE KERNEL END/ { capture=0 }
    capture { print }
  ' "$MASTER_PROMPT_TEMPLATE_FILE"
}

render_prompt_with_style() {
  local src_prompt="$1"
  local dst_prompt="$2"
  local style_kernel="$3"

  STYLE_KERNEL="$style_kernel" node - "$src_prompt" "$dst_prompt" <<'NODE'
const fs = require('fs');

const src = process.argv[2];
const dst = process.argv[3];
const styleKernel = String(process.env.STYLE_KERNEL || '').trim();

if (!src || !dst) {
  throw new Error('render_prompt_with_style requires source and destination path');
}
if (!styleKernel) {
  throw new Error('STYLE_KERNEL is empty. Check master prompt markers STYLE KERNEL START/END.');
}

const template = fs.readFileSync(src, 'utf8');
const rendered = template.replace(/__BOOK_REVIEW_STYLE_KERNEL__/g, styleKernel);
fs.writeFileSync(dst, rendered.endsWith('\n') ? rendered : rendered + '\n');
NODE
}

inject_prompts() {
  local src_template="$1"
  local dst_template="$2"
  local style_kernel
  style_kernel="$(extract_style_kernel)"

  if [ -z "$(printf '%s' "$style_kernel" | tr -d '[:space:]')" ]; then
    echo "STYLE KERNEL is empty in: $MASTER_PROMPT_TEMPLATE_FILE" >&2
    echo "Expected markers: STYLE KERNEL START ... STYLE KERNEL END" >&2
    exit 1
  fi

  local rendered_scene_outline_prompt="$TMP_DIR/scene-outline.prompt.rendered.txt"
  local rendered_scene_expand_prompt="$TMP_DIR/scene-expand.prompt.rendered.txt"
  local rendered_metadata_prompt="$TMP_DIR/metadata.prompt.rendered.txt"
  local rendered_qc_prompt="$TMP_DIR/qc.prompt.rendered.txt"
  local rendered_review_edit_prompt="$TMP_DIR/review-edit.prompt.rendered.txt"

  render_prompt_with_style "$SCENE_OUTLINE_PROMPT_TEMPLATE_FILE" "$rendered_scene_outline_prompt" "$style_kernel"
  render_prompt_with_style "$SCENE_EXPAND_PROMPT_TEMPLATE_FILE" "$rendered_scene_expand_prompt" "$style_kernel"
  render_prompt_with_style "$METADATA_PROMPT_TEMPLATE_FILE" "$rendered_metadata_prompt" "$style_kernel"
  render_prompt_with_style "$QC_PROMPT_TEMPLATE_FILE" "$rendered_qc_prompt" "$style_kernel"
  render_prompt_with_style "$REVIEW_EDIT_PROMPT_TEMPLATE_FILE" "$rendered_review_edit_prompt" "$style_kernel"

  jq \
    --rawfile master_prompt "$MASTER_PROMPT_TEMPLATE_FILE" \
    --rawfile scene_outline_prompt "$rendered_scene_outline_prompt" \
    --rawfile scene_expand_prompt "$rendered_scene_expand_prompt" \
    --rawfile metadata_prompt "$rendered_metadata_prompt" \
    --rawfile qc_prompt "$rendered_qc_prompt" \
    --rawfile review_edit_prompt "$rendered_review_edit_prompt" \
    '
    (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="master_prompt_template") | .value) = $master_prompt
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="scene_outline_prompt_template") | .value) = $scene_outline_prompt
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name=="scene_expand_prompt_template") | .value) = $scene_expand_prompt
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
    "$PROXY_ENV_FILE" \
    "$source_template"
}

import_one "$TEXT_TO_IMAGES_WORKFLOW_TEMPLATE"
import_one "$TEXT_TO_VIDEOS_WORKFLOW_TEMPLATE"
import_one "$TTS_WORKFLOW_TEMPLATE"

text_to_images_workflow_id="$(
  jq -r --arg name "$TEXT_TO_IMAGES_WORKFLOW_NAME" '.workflows[$name].id // empty' "$WORKFLOW_REGISTRY_FILE"
)"
text_to_videos_workflow_id="$(
  jq -r --arg name "$TEXT_TO_VIDEOS_WORKFLOW_NAME" '.workflows[$name].id // empty' "$WORKFLOW_REGISTRY_FILE"
)"
tts_workflow_id="$(
  jq -r --arg name "$TTS_WORKFLOW_NAME" '.workflows[$name].id // empty' "$WORKFLOW_REGISTRY_FILE"
)"

[ -n "$text_to_images_workflow_id" ] || {
  echo "Cannot resolve workflow ID for '$TEXT_TO_IMAGES_WORKFLOW_NAME' from $WORKFLOW_REGISTRY_FILE" >&2
  exit 1
}
[ -n "$text_to_videos_workflow_id" ] || {
  echo "Cannot resolve workflow ID for '$TEXT_TO_VIDEOS_WORKFLOW_NAME' from $WORKFLOW_REGISTRY_FILE" >&2
  exit 1
}
[ -n "$tts_workflow_id" ] || {
  echo "Cannot resolve workflow ID for '$TTS_WORKFLOW_NAME' from $WORKFLOW_REGISTRY_FILE" >&2
  exit 1
}

TEXT_TO_IMAGES_WORKFLOW_ID="$text_to_images_workflow_id" \
TEXT_TO_VIDEOS_WORKFLOW_ID="$text_to_videos_workflow_id" \
TTS_WORKFLOW_ID="$tts_workflow_id" \
import_one "$MAIN_WORKFLOW_TEMPLATE" "$TMP_DIR/main.workflow.json" "true"

echo "[import-book-review] Imported workflows successfully: text-to-images, text-to-videos-veo3, tts, book-review."
