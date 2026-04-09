#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
N8N_ENV_FILE="${1:-$ROOT_DIR/env.n8n.local}"
PROXY_ENV_FILE="${2:-$ROOT_DIR/env.proxy.local}"
IMPORT_DIR="$ROOT_DIR/scripts/workflows/import"

contains_item() {
  local needle="$1"
  shift
  local item
  for item in "$@"; do
    if [ "$item" = "$needle" ]; then
      return 0
    fi
  done
  return 1
}

priority_scripts=(
  "import-shared-notification-router-workflow.sh"
  "import-data-table-store-workflow.sh"
  "import-sprint-monitor-light-scan-workflow.sh"
  "import-sprint-monitor-deep-analysis-workflow.sh"
  "import-sprint-monitor-endgame-workflow.sh"
  "import-sprint-monitor-engine-workflow.sh"
  "import-gemini-demo-workflow.sh"
  "import-openai-demo-workflow.sh"
  "import-book-review-workflow.sh"
)

candidate_scripts=()
shopt -s nullglob
for script_path in "$IMPORT_DIR"/import-*.sh; do
  script_name="$(basename "$script_path")"
  case "$script_name" in
    import-all-workflows.sh|import-workflow.sh)
      continue
      ;;
  esac
  candidate_scripts+=("$script_name")
done
shopt -u nullglob

if [ "${#candidate_scripts[@]}" -eq 0 ]; then
  echo "[import-all-workflows] No wrapper scripts found in $IMPORT_DIR" >&2
  exit 1
fi

ordered_scripts=()
for script_name in "${priority_scripts[@]}"; do
  if contains_item "$script_name" "${candidate_scripts[@]}"; then
    ordered_scripts+=("$script_name")
  fi
done

extra_scripts=()
for script_name in "${candidate_scripts[@]}"; do
  if ! contains_item "$script_name" "${ordered_scripts[@]}"; then
    extra_scripts+=("$script_name")
  fi
done

if [ "${#extra_scripts[@]}" -gt 0 ]; then
  while IFS= read -r script_name; do
    [ -n "$script_name" ] || continue
    ordered_scripts+=("$script_name")
  done < <(printf '%s\n' "${extra_scripts[@]}" | sort)
fi

echo "[import-all-workflows] Found ${#ordered_scripts[@]} wrapper script(s)."
for script_name in "${ordered_scripts[@]}"; do
  echo "[import-all-workflows] Running: $script_name"
  bash "$IMPORT_DIR/$script_name" "$N8N_ENV_FILE" "$PROXY_ENV_FILE"
done

echo "[import-all-workflows] Done. Imported ${#ordered_scripts[@]} wrapper workflow script(s)."
