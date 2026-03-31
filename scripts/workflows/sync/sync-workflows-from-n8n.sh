#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
N8N_ENV_FILE="${N8N_ENV_FILE:-$ROOT_DIR/env.n8n.local}"
WORKFLOW_REGISTRY_FILE="${WORKFLOW_REGISTRY_FILE:-$ROOT_DIR/workflow-registry.json}"
CHANGELOG_FILE="${CHANGELOG_FILE:-$ROOT_DIR/CHANGELOG.md}"
IMPORT_WRAPPER_DIR="${IMPORT_WRAPPER_DIR:-$ROOT_DIR/scripts/workflows/import}"
AUTO_TEMPLATE_DIR="${AUTO_TEMPLATE_DIR:-workflows/ui-synced}"
N8N_WORKFLOW_LIST_LIMIT="${N8N_WORKFLOW_LIST_LIMIT:-250}"
N8N_SQLITE_DB_PATH="${N8N_SQLITE_DB_PATH:-$HOME/.n8n/database.sqlite}"
FOLDER_FROM_NAME_FALLBACK="${FOLDER_FROM_NAME_FALLBACK:-false}"
REQUIRE_UI_FOLDER_FOR_NEW_WORKFLOWS="${REQUIRE_UI_FOLDER_FOR_NEW_WORKFLOWS:-true}"

APPLY="false"
ONLY_NAME=""
ONLY_IDS=""
WRITE_LOG="true"

API_LAST_HTTP_CODE=""
API_LAST_BODY=""
WRAPPER_RESULT_STATUS=""
WRAPPER_RESULT_PATH=""
WRAPPER_RESULT_UPDATED="false"
WRAPPER_RESULT_PRUNED=0

log() {
  printf '[sync-workflows] %s\n' "$1"
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Missing required command: $cmd" >&2
    exit 1
  }
}

file_has_regex() {
  local pattern="$1"
  local file="$2"
  if command -v rg >/dev/null 2>&1; then
    rg -q -- "$pattern" "$file"
  else
    grep -Eq -- "$pattern" "$file"
  fi
}

file_has_fixed() {
  local text="$1"
  local file="$2"
  if command -v rg >/dev/null 2>&1; then
    rg -q --fixed-strings -- "$text" "$file"
  else
    grep -Fq -- "$text" "$file"
  fi
}

usage() {
  cat <<USAGE
Usage: bash scripts/workflows/sync/sync-workflows-from-n8n.sh [options]

Options:
  --apply               Write changes to workflow JSON files and workflow-registry.json.
  --name <workflow>     Sync one workflow by exact workflow name on n8n UI.
  --id <workflow-id>    Sync by n8n ID. Repeatable or comma-separated.
  --allow-folder-fallback
                        Allow fallback from workflow name path when UI folder metadata is missing.
  --no-log              Do not append entries to CHANGELOG.md.
  -h, --help            Show this help.

Notes:
  - Default scope is ALL non-archived workflows from n8n UI.
  - Folder mapping reads from local n8n SQLite DB (workflow_entity.parentFolderId -> folder path).
  - Script auto upserts workflow-registry.json and creates template JSON path for new workflows.
  - Script auto creates import wrapper script (import-*.sh) for workflows missing a wrapper.
  - New workflow path uses DB folder path first, then API metadata, then optional name fallback.
  - Strict mode is ON by default: if new workflow has no UI folder metadata, sync fails (no fallback).
  - Conflict-safe behavior: existing registry ID mapping has highest priority; name conflicts create a new key/path.
  - Default mode is preview only (no file writes).
USAGE
}

id_already_added() {
  local needle="$1"
  local current

  if [ -z "$ONLY_IDS" ]; then
    return 1
  fi

  while IFS= read -r current; do
    [ -n "$current" ] || continue
    if [ "$current" = "$needle" ]; then
      return 0
    fi
  done <<< "$ONLY_IDS"

  return 1
}

add_ids_from_arg() {
  local raw="$1"
  local part trimmed

  while IFS= read -r part; do
    trimmed="$(printf '%s' "$part" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
    if [ -z "$trimmed" ]; then
      continue
    fi
    if ! id_already_added "$trimmed"; then
      if [ -z "$ONLY_IDS" ]; then
        ONLY_IDS="$trimmed"
      else
        ONLY_IDS="$ONLY_IDS"$'\n'"$trimmed"
      fi
    fi
  done < <(printf '%s\n' "$raw" | tr ',' '\n')
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --apply)
        APPLY="true"
        shift
        ;;
      --name)
        [ "$#" -ge 2 ] || { echo "--name requires a value" >&2; exit 1; }
        ONLY_NAME="$2"
        shift 2
        ;;
      --id)
        [ "$#" -ge 2 ] || { echo "--id requires a value" >&2; exit 1; }
        add_ids_from_arg "$2"
        shift 2
        ;;
      --allow-folder-fallback)
        FOLDER_FROM_NAME_FALLBACK="true"
        REQUIRE_UI_FOLDER_FOR_NEW_WORKFLOWS="false"
        shift
        ;;
      --no-log)
        WRITE_LOG="false"
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown argument: $1" >&2
        usage >&2
        exit 1
        ;;
    esac
  done

  if [ -n "$ONLY_NAME" ] && [ -n "$ONLY_IDS" ]; then
    echo "--name and --id cannot be used together" >&2
    exit 1
  fi
}

resolve_template_path() {
  local template_path="$1"
  if [[ "$template_path" == /* ]]; then
    printf '%s\n' "$template_path"
  else
    printf '%s\n' "$ROOT_DIR/$template_path"
  fi
}

resolve_repo_path() {
  local repo_path="$1"
  if [[ "$repo_path" == /* ]]; then
    printf '%s\n' "$repo_path"
  else
    printf '%s\n' "$ROOT_DIR/$repo_path"
  fi
}

normalize_registry_template_path() {
  local template_path="$1"
  if [ -z "$template_path" ] || [ "$template_path" = "null" ]; then
    printf ''
    return
  fi

  if [[ "$template_path" == "$ROOT_DIR"/* ]]; then
    printf '%s\n' "${template_path#"$ROOT_DIR"/}"
    return
  fi

  printf '%s\n' "$template_path"
}

trim_spaces() {
  local value="$1"
  printf '%s' "$value" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//'
}

sanitize_path_segment() {
  local value="$1"
  local sanitized

  sanitized="$(trim_spaces "$value")"
  sanitized="$(printf '%s' "$sanitized" | tr -d '[:cntrl:]' | sed -E 's|[\\/]|-|g')"
  sanitized="$(trim_spaces "$sanitized")"
  printf '%s\n' "$sanitized"
}

normalize_folder_path() {
  local raw_path="$1"
  local normalized segment clean result=""

  normalized="$(printf '%s' "$raw_path" | tr '\\' '/' | sed -E 's|/+|/|g; s|^/||; s|/$||')"
  if [ -z "$normalized" ]; then
    printf '%s\n' ""
    return
  fi

  while IFS= read -r segment; do
    clean="$(sanitize_path_segment "$segment")"
    [ -n "$clean" ] || continue
    if [ -z "$result" ]; then
      result="$clean"
    else
      result="$result/$clean"
    fi
  done < <(printf '%s\n' "$normalized" | tr '/' '\n')

  printf '%s\n' "$result"
}

workflow_name_leaf() {
  local wf_name="$1"
  local leaf

  if [[ "$wf_name" == */* ]]; then
    leaf="${wf_name##*/}"
  else
    leaf="$wf_name"
  fi
  trim_spaces "$leaf"
}

workflow_folder_from_name_path() {
  local wf_name="$1"
  local raw_folder

  if [[ "$wf_name" != */* ]]; then
    printf '%s\n' ""
    return
  fi

  raw_folder="${wf_name%/*}"
  normalize_folder_path "$raw_folder"
}

workflow_folder_from_ui_payload() {
  local raw="$1"
  local raw_folder

  raw_folder="$(echo "$raw" | jq -r '
    [
      .folder.path?,
      .folderPath?,
      .parentFolder.path?,
      .parentFolderPath?,
      .meta.folderPath?,
      .meta.parentFolderPath?,
      .meta.uiFolderPath?,
      .meta.folderName?,
      .folder.name?,
      .parentFolder.name?
    ]
    | map(select(type == "string" and (length > 0)))
    | .[0] // ""
  ')"

  normalize_folder_path "$raw_folder"
}

load_workflow_folder_map_from_db() {
  local out_file="$1"
  local sql

  if [ ! -f "$N8N_SQLITE_DB_PATH" ]; then
    return 1
  fi

  sql="
WITH RECURSIVE folder_tree(id, name, parentFolderId, path) AS (
  SELECT id, name, parentFolderId, name
  FROM folder
  WHERE parentFolderId IS NULL
  UNION ALL
  SELECT f.id, f.name, f.parentFolderId, folder_tree.path || '/' || f.name
  FROM folder f
  JOIN folder_tree ON f.parentFolderId = folder_tree.id
)
SELECT w.id, COALESCE(folder_tree.path, '')
FROM workflow_entity w
LEFT JOIN folder_tree ON w.parentFolderId = folder_tree.id
WHERE COALESCE(w.isArchived, 0) = 0;
"

  sqlite3 -noheader -separator $'\t' "$N8N_SQLITE_DB_PATH" "$sql" > "$out_file"
}

workflow_folder_from_db_map() {
  local map_file="$1"
  local wf_id="$2"
  local path=""

  if [ ! -s "$map_file" ]; then
    printf '%s\n' ""
    return
  fi

  path="$(awk -F '\t' -v wf_id="$wf_id" '$1 == wf_id { print $2; exit }' "$map_file")"
  normalize_folder_path "$path"
}

to_repo_relative_path() {
  local input_path="$1"
  if [[ "$input_path" == "$ROOT_DIR/"* ]]; then
    printf '%s\n' "${input_path#"$ROOT_DIR"/}"
  else
    printf '%s\n' "$input_path"
  fi
}

slugify_name() {
  local input="$1"
  local slug

  slug="$(printf '%s' "$input" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-+/-/g')"

  printf '%s\n' "$slug"
}

wrapper_template_from_file() {
  local wrapper_path="$1"

  sed -n \
    -e 's|^[[:space:]]*WORKFLOW_TEMPLATE="\${3:-\$ROOT_DIR/\(.*\)}"[[:space:]]*$|\1|p' \
    -e 's|^[[:space:]]*WORKFLOW_TEMPLATE="\${3:-\(/.*\)}"[[:space:]]*$|\1|p' \
    "$wrapper_path" | head -n 1
}

wrapper_is_simple_template_wrapper() {
  local wrapper_path="$1"
  if ! file_has_regex '^[[:space:]]*WORKFLOW_TEMPLATE="\$\{3:-' "$wrapper_path"; then
    return 1
  fi
  if ! file_has_fixed 'scripts/workflows/import/import-workflow.sh' "$wrapper_path"; then
    return 1
  fi
  if file_has_regex '^[[:space:]]*[A-Z0-9_]+WORKFLOW_TEMPLATE="\$\{[0-9]:-' "$wrapper_path"; then
    return 1
  fi
  return 0
}

wrapper_has_workflow_id_marker() {
  local wrapper_path="$1"
  local wf_id="$2"
  file_has_regex "^# SYNC_WORKFLOW_ID=$wf_id$" "$wrapper_path"
}

wrapper_set_workflow_id_marker() {
  local wrapper_path="$1"
  local wf_id="$2"
  local tmp_file

  if wrapper_has_workflow_id_marker "$wrapper_path" "$wf_id"; then
    return
  fi

  tmp_file="$(mktemp)"
  awk -v wf_id="$wf_id" '
    NR==1 { print; next }
    NR==2 && $0 == "set -euo pipefail" {
      print
      print "# SYNC_MANAGED_WRAPPER=1"
      print "# SYNC_WORKFLOW_ID=" wf_id
      next
    }
    { print }
  ' "$wrapper_path" > "$tmp_file"
  mv "$tmp_file" "$wrapper_path"
}

update_simple_wrapper_template_line() {
  local wrapper_path="$1"
  local template_path="$2"
  local tmp_file template_line

  if [[ "$template_path" == /* ]]; then
    template_line="WORKFLOW_TEMPLATE=\"\${3:-$template_path}\""
  else
    template_line="WORKFLOW_TEMPLATE=\"\${3:-\$ROOT_DIR/$template_path}\""
  fi

  tmp_file="$(mktemp)"
  awk -v template_line="$template_line" '
    BEGIN { replaced=0 }
    {
      if (!replaced && $0 ~ /^[[:space:]]*WORKFLOW_TEMPLATE="\$\{3:-/) {
        print template_line
        replaced=1
      } else {
        print
      }
    }
  ' "$wrapper_path" > "$tmp_file"
  mv "$tmp_file" "$wrapper_path"
}

wrapper_name_has_id_suffix() {
  local wrapper_name="$1"
  [[ "$wrapper_name" =~ ^import-.*-[A-Za-z0-9]{8}(-[0-9]+)?-workflow\.sh$ ]]
}

list_wrappers_by_workflow_id() {
  local wf_id="$1"
  local id_short wrapper_path wrapper_name

  id_short="${wf_id:0:8}"

  shopt -s nullglob
  for wrapper_path in "$IMPORT_WRAPPER_DIR"/import-*.sh; do
    wrapper_name="$(basename "$wrapper_path")"
    case "$wrapper_name" in
      import-all-workflows.sh|import-workflow.sh)
        continue
        ;;
    esac

    if wrapper_has_workflow_id_marker "$wrapper_path" "$wf_id"; then
      printf '%s\n' "$wrapper_path"
      continue
    fi

    if [[ "$wrapper_name" =~ -$id_short(-[0-9]+)?-workflow\.sh$ ]]; then
      printf '%s\n' "$wrapper_path"
      continue
    fi
  done
  shopt -u nullglob
}

list_simple_wrappers_by_template() {
  local template_path="$1"
  local wrapper_path wrapper_name

  shopt -s nullglob
  for wrapper_path in "$IMPORT_WRAPPER_DIR"/import-*.sh; do
    wrapper_name="$(basename "$wrapper_path")"
    case "$wrapper_name" in
      import-all-workflows.sh|import-workflow.sh)
        continue
        ;;
    esac

    if ! wrapper_is_simple_template_wrapper "$wrapper_path"; then
      continue
    fi

    if wrapper_references_template "$wrapper_path" "$template_path"; then
      printf '%s\n' "$wrapper_path"
    fi
  done
  shopt -u nullglob
}

wrapper_references_template() {
  local wrapper_path="$1"
  local template_path="$2"
  local rel_path abs_path

  rel_path="$(to_repo_relative_path "$template_path")"
  abs_path="$(resolve_template_path "$template_path")"

  if file_has_fixed "$rel_path" "$wrapper_path"; then
    return 0
  fi

  if file_has_fixed "$abs_path" "$wrapper_path"; then
    return 0
  fi

  return 1
}

find_wrapper_by_template() {
  local template_path="$1"
  local wrapper_path wrapper_name current_template

  shopt -s nullglob
  for wrapper_path in "$IMPORT_WRAPPER_DIR"/import-*.sh; do
    wrapper_name="$(basename "$wrapper_path")"
    case "$wrapper_name" in
      import-all-workflows.sh|import-workflow.sh)
        continue
        ;;
    esac

    if wrapper_name_has_id_suffix "$wrapper_name"; then
      continue
    fi

    if wrapper_references_template "$wrapper_path" "$template_path"; then
      printf '%s\n' "$wrapper_path"
      shopt -u nullglob
      return 0
    fi
  done

  for wrapper_path in "$IMPORT_WRAPPER_DIR"/import-*.sh; do
    wrapper_name="$(basename "$wrapper_path")"
    case "$wrapper_name" in
      import-all-workflows.sh|import-workflow.sh)
        continue
        ;;
    esac

    current_template="$(wrapper_template_from_file "$wrapper_path")"
    if [ "$current_template" = "$template_path" ] || wrapper_references_template "$wrapper_path" "$template_path"; then
      printf '%s\n' "$wrapper_path"
      shopt -u nullglob
      return 0
    fi
  done
  shopt -u nullglob

  return 1
}

generate_unique_wrapper_script_path() {
  local wf_name="$1"
  local wf_id="$2"
  local wf_template_raw="$3"
  local slug id_short wrapper_path current_template n

  slug="$(slugify_name "$wf_name")"
  id_short="${wf_id:0:8}"
  if [ -z "$slug" ]; then
    slug="workflow-$id_short"
  fi

  wrapper_path="$IMPORT_WRAPPER_DIR/import-$slug-workflow.sh"
  if [ ! -f "$wrapper_path" ]; then
    printf '%s\n' "$wrapper_path"
    return
  fi

  current_template="$(wrapper_template_from_file "$wrapper_path")"
  if [ "$current_template" = "$wf_template_raw" ]; then
    printf '%s\n' "$wrapper_path"
    return
  fi

  wrapper_path="$IMPORT_WRAPPER_DIR/import-$slug-$id_short-workflow.sh"
  if [ ! -f "$wrapper_path" ]; then
    printf '%s\n' "$wrapper_path"
    return
  fi

  current_template="$(wrapper_template_from_file "$wrapper_path")"
  if [ "$current_template" = "$wf_template_raw" ]; then
    printf '%s\n' "$wrapper_path"
    return
  fi

  n=2
  while true; do
    wrapper_path="$IMPORT_WRAPPER_DIR/import-$slug-$id_short-$n-workflow.sh"
    if [ ! -f "$wrapper_path" ]; then
      printf '%s\n' "$wrapper_path"
      return
    fi
    current_template="$(wrapper_template_from_file "$wrapper_path")"
    if [ "$current_template" = "$wf_template_raw" ]; then
      printf '%s\n' "$wrapper_path"
      return
    fi
    n=$((n + 1))
  done
}

create_wrapper_script_file() {
  local wrapper_path="$1"
  local template_path="$2"
  local wf_id="$3"
  local template_default_expr

  if [[ "$template_path" == /* ]]; then
    template_default_expr="\${3:-$template_path}"
  else
    template_default_expr="\${3:-\$ROOT_DIR/$template_path}"
  fi

  mkdir -p "$(dirname "$wrapper_path")"
cat > "$wrapper_path" <<EOF
#!/usr/bin/env bash
set -euo pipefail
# SYNC_MANAGED_WRAPPER=1
# SYNC_WORKFLOW_ID=$wf_id

ROOT_DIR="\$(cd "\$(dirname "\$0")/../../.." && pwd)"
N8N_ENV_FILE="\${1:-\$ROOT_DIR/env.n8n.local}"
PROXY_ENV_FILE="\${2:-\$ROOT_DIR/env.proxy.local}"
WORKFLOW_TEMPLATE="$template_default_expr"

bash "\$ROOT_DIR/scripts/workflows/import/import-workflow.sh" \\
  "\$N8N_ENV_FILE" \\
  "\$PROXY_ENV_FILE" \\
  "\$WORKFLOW_TEMPLATE"
EOF
  chmod +x "$wrapper_path"
}

ensure_wrapper_for_template() {
  local wf_name="$1"
  local wf_id="$2"
  local wf_template_raw="$3"
  local wrapper_hint="$4"
  local wrapper_path wrapper_rel existing_wrapper id_wrappers template_wrappers prune_candidates
  local keep_wrapper keep_wrapper_rel pruned_count=0

  WRAPPER_RESULT_STATUS=""
  WRAPPER_RESULT_PATH=""
  WRAPPER_RESULT_UPDATED="false"
  WRAPPER_RESULT_PRUNED=0

  keep_wrapper=""
  if [ -n "$wrapper_hint" ] && [ -f "$wrapper_hint" ]; then
    keep_wrapper="$wrapper_hint"
  fi

  existing_wrapper="$(find_wrapper_by_template "$wf_template_raw" || true)"
  if [ -n "$existing_wrapper" ]; then
    if [ -z "$keep_wrapper" ]; then
      keep_wrapper="$existing_wrapper"
    else
      local keep_wrapper_name
      keep_wrapper_name="$(basename "$keep_wrapper")"
      if wrapper_name_has_id_suffix "$keep_wrapper_name"; then
        keep_wrapper="$existing_wrapper"
      fi
    fi
  fi

  local name_wrapper_candidate
  name_wrapper_candidate="$IMPORT_WRAPPER_DIR/import-$(slugify_name "$wf_name")-workflow.sh"
  if [ -f "$name_wrapper_candidate" ] && wrapper_is_simple_template_wrapper "$name_wrapper_candidate"; then
    if [ -z "$keep_wrapper" ]; then
      keep_wrapper="$name_wrapper_candidate"
    else
      local keep_wrapper_name
      keep_wrapper_name="$(basename "$keep_wrapper")"
      if wrapper_name_has_id_suffix "$keep_wrapper_name"; then
        keep_wrapper="$name_wrapper_candidate"
      fi
    fi
  fi

  if [ -z "$keep_wrapper" ]; then
    id_wrappers="$(list_wrappers_by_workflow_id "$wf_id" | sort -u || true)"
    keep_wrapper="$(printf '%s\n' "$id_wrappers" | head -n 1)"
  fi

  if [ -n "$keep_wrapper" ]; then
    if [ "$APPLY" = "true" ] && wrapper_is_simple_template_wrapper "$keep_wrapper"; then
      if ! wrapper_references_template "$keep_wrapper" "$wf_template_raw"; then
        update_simple_wrapper_template_line "$keep_wrapper" "$wf_template_raw"
        WRAPPER_RESULT_UPDATED="true"
      fi
      wrapper_set_workflow_id_marker "$keep_wrapper" "$wf_id"
    fi

    id_wrappers="$(list_wrappers_by_workflow_id "$wf_id" | sort -u || true)"
    template_wrappers="$(list_simple_wrappers_by_template "$wf_template_raw" | sort -u || true)"
    prune_candidates="$(printf '%s\n%s\n' "$id_wrappers" "$template_wrappers" | awk 'NF' | sort -u)"

    if [ -n "$prune_candidates" ]; then
      while IFS= read -r wrapper_path; do
        [ -n "$wrapper_path" ] || continue
        if [ "$wrapper_path" = "$keep_wrapper" ]; then
          continue
        fi
        if [ "$APPLY" = "true" ]; then
          rm -f "$wrapper_path"
          pruned_count=$((pruned_count + 1))
          log "WRAPPER PRUNED $wf_name ($wf_id) -> $(to_repo_relative_path "$wrapper_path")"
        else
          pruned_count=$((pruned_count + 1))
          log "WRAPPER DUPLICATE $wf_name ($wf_id) -> $(to_repo_relative_path "$wrapper_path") (preview only, use --apply to prune)"
        fi
      done <<< "$prune_candidates"
    fi

    WRAPPER_RESULT_PATH="$keep_wrapper"
    WRAPPER_RESULT_PRUNED="$pruned_count"
    keep_wrapper_rel="$(to_repo_relative_path "$keep_wrapper")"
    WRAPPER_RESULT_STATUS="exists"
    if [ "$WRAPPER_RESULT_UPDATED" = "true" ]; then
      log "WRAPPER UPDATED $wf_name ($wf_id) -> $keep_wrapper_rel"
    else
      log "WRAPPER OK $wf_name ($wf_id) -> $keep_wrapper_rel"
    fi
    return
  fi

  wrapper_path="$(generate_unique_wrapper_script_path "$wf_name" "$wf_id" "$wf_template_raw")"
  wrapper_rel="$(to_repo_relative_path "$wrapper_path")"
  WRAPPER_RESULT_PATH="$wrapper_path"
  WRAPPER_RESULT_PRUNED=0

  if [ "$APPLY" = "true" ]; then
    create_wrapper_script_file "$wrapper_path" "$wf_template_raw" "$wf_id"
    WRAPPER_RESULT_STATUS="created"
    log "WRAPPER CREATED $wf_name ($wf_id) -> $wrapper_rel"
  else
    WRAPPER_RESULT_STATUS="planned"
    log "WRAPPER NEW $wf_name ($wf_id) -> $wrapper_rel (preview only, use --apply to write)"
  fi
}

ensure_changelog_file() {
  local file="$1"
  if [ -f "$file" ]; then
    return
  fi
  cat > "$file" <<'EOT'
# Changelog

Nhat ky thay doi chi tiet cua du an (dac biet cho workflow sync/import va automation scripts).
EOT
}

append_changelog_entry() {
  local file="$1"
  local ts="$2"
  local summary="$3"
  local details="$4"
  cat >> "$file" <<EOT

## $ts
- $summary
- $details
EOT
}

api_get() {
  local url="$1"
  local body_file code

  body_file="$(mktemp)"
  code="$(curl -sS -o "$body_file" -w '%{http_code}' -H "X-N8N-API-KEY: $N8N_API_KEY" "$url")"

  API_LAST_HTTP_CODE="$code"
  API_LAST_BODY="$(cat "$body_file")"
  rm -f "$body_file"
}

registry_has_key() {
  local registry_file="$1"
  local key="$2"

  jq -e --arg key "$key" '.workflows // {} | has($key)' "$registry_file" >/dev/null 2>&1
}

registry_entry_by_id_tsv() {
  local registry_file="$1"
  local wf_id="$2"

  jq -r --arg wf_id "$wf_id" '
    .workflows = (.workflows // {})
    | ((.workflows | to_entries | map(select((.value.id // "") == $wf_id)) | .[0]) // null) as $entry
    | if $entry == null then "" else [$entry.key, ($entry.value.id // ""), ($entry.value.template // ""), ($entry.value.templateImport // $entry.value.wrapper // ""), ($entry.value.lastSyncedAt // "")] | @tsv end
  ' "$registry_file"
}

registry_entry_by_name_tsv() {
  local registry_file="$1"
  local wf_name="$2"

  jq -r --arg wf_name "$wf_name" '
    .workflows = (.workflows // {})
    | ((.workflows | to_entries | map(select(.key == $wf_name)) | .[0]) // null) as $entry
    | if $entry == null then "" else [$entry.key, ($entry.value.id // ""), ($entry.value.template // ""), ($entry.value.templateImport // $entry.value.wrapper // ""), ($entry.value.lastSyncedAt // "")] | @tsv end
  ' "$registry_file"
}

template_owner_id() {
  local registry_file="$1"
  local template_path="$2"

  jq -r --arg template_path "$template_path" '
    .workflows = (.workflows // {})
    | [(.workflows | to_entries[]) | select((.value.template // "") == $template_path) | (.value.id // "")][0] // ""
  ' "$registry_file"
}

generate_unique_registry_key() {
  local registry_file="$1"
  local base_key="$2"
  local wf_id="$3"
  local id_short candidate n

  id_short="${wf_id:0:8}"
  candidate="$base_key"

  if [ -z "$candidate" ]; then
    candidate="Workflow $id_short"
  fi

  if ! registry_has_key "$registry_file" "$candidate"; then
    printf '%s\n' "$candidate"
    return
  fi

  candidate="$base_key [$id_short]"
  if [ -z "$base_key" ]; then
    candidate="Workflow $id_short"
  fi

  if ! registry_has_key "$registry_file" "$candidate"; then
    printf '%s\n' "$candidate"
    return
  fi

  n=2
  while true; do
    candidate="$base_key [$id_short]-$n"
    if [ -z "$base_key" ]; then
      candidate="Workflow $id_short-$n"
    fi
    if ! registry_has_key "$registry_file" "$candidate"; then
      printf '%s\n' "$candidate"
      return
    fi
    n=$((n + 1))
  done
}

template_path_taken_by_other() {
  local registry_file="$1"
  local template_path="$2"
  local wf_id="$3"
  local owner abs_path

  owner="$(template_owner_id "$registry_file" "$template_path")"
  if [ -n "$owner" ] && [ "$owner" != "$wf_id" ]; then
    return 0
  fi

  abs_path="$(resolve_template_path "$template_path")"
  if [ -f "$abs_path" ] && [ -z "$owner" ]; then
    return 0
  fi

  return 1
}

generate_unique_template_path() {
  local registry_file="$1"
  local wf_name="$2"
  local wf_id="$3"
  local wf_folder="$4"
  local id_short slug base_dir candidate n target_dir leaf_name

  id_short="${wf_id:0:8}"
  leaf_name="$(workflow_name_leaf "$wf_name")"
  slug="$(slugify_name "$leaf_name")"
  if [ -z "$slug" ]; then
    slug="workflow-$id_short"
  fi

  base_dir="$AUTO_TEMPLATE_DIR"
  base_dir="${base_dir%/}"
  if [ -z "$base_dir" ]; then
    base_dir="workflows/ui-synced"
  fi

  if [ -n "$wf_folder" ]; then
    target_dir="$base_dir/$wf_folder"
  else
    target_dir="$base_dir"
  fi

  candidate="$target_dir/$slug.workflow.json"
  if ! template_path_taken_by_other "$registry_file" "$candidate" "$wf_id"; then
    printf '%s\n' "$candidate"
    return
  fi

  candidate="$target_dir/$slug-$id_short.workflow.json"
  if ! template_path_taken_by_other "$registry_file" "$candidate" "$wf_id"; then
    printf '%s\n' "$candidate"
    return
  fi

  n=2
  while true; do
    candidate="$target_dir/$slug-$id_short-$n.workflow.json"
    if ! template_path_taken_by_other "$registry_file" "$candidate" "$wf_id"; then
      printf '%s\n' "$candidate"
      return
    fi
    n=$((n + 1))
  done
}

set_registry_entry() {
  local registry_file="$1"
  local wf_key="$2"
  local wf_id="$3"
  local wf_template="$4"
  local wf_wrapper="$5"
  local touch_last_synced_at="$6"
  local tmp_file

  tmp_file="$(mktemp)"
  jq \
    --arg wf_key "$wf_key" \
    --arg wf_id "$wf_id" \
    --arg wf_template "$wf_template" \
    --arg wf_wrapper "$wf_wrapper" \
    --arg touch_last_synced_at "$touch_last_synced_at" '
    .workflows = (.workflows // {})
    | .workflows[$wf_key] = (.workflows[$wf_key] // {}) + {
        id: $wf_id,
        template: $wf_template,
        lastSyncedAt: (
          if $touch_last_synced_at != "" then
            $touch_last_synced_at
          else
            ((.workflows[$wf_key].lastSyncedAt // "") | tostring)
          end
        )
      }
    | if $wf_wrapper != "" then
        .workflows[$wf_key].templateImport = $wf_wrapper
      else
        .
      end
    | .workflows[$wf_key] |= del(.wrapper)
  ' "$registry_file" > "$tmp_file"
  mv "$tmp_file" "$registry_file"
}

fetch_selected_workflows_json() {
  local selected_json

  if [ -n "$ONLY_IDS" ]; then
    local selected_tmp errors requested_id selected_item
    selected_tmp="$(mktemp)"
    errors=0

    while IFS= read -r requested_id; do
      [ -n "$requested_id" ] || continue
      api_get "$N8N_API_URL/api/v1/workflows/$requested_id"
      if [ "$API_LAST_HTTP_CODE" != "200" ]; then
        echo "Failed to fetch workflow by id '$requested_id' (HTTP $API_LAST_HTTP_CODE)." >&2
        errors=$((errors + 1))
        continue
      fi

      selected_item="$(echo "$API_LAST_BODY" | jq -c '
        if (.archived // .isArchived // false) then
          null
        else
          {
            id: (.id | tostring),
            name: ((.name // "") | if . == "" then ("Workflow " + (.id | tostring)) else . end)
          }
        end
      ')"

      if [ "$selected_item" = "null" ]; then
        echo "Workflow '$requested_id' is archived, skip sync." >&2
        errors=$((errors + 1))
        continue
      fi

      printf '%s\n' "$selected_item" >> "$selected_tmp"
    done <<< "$ONLY_IDS"

    if [ "$errors" -gt 0 ]; then
      rm -f "$selected_tmp"
      echo "Failed to resolve one or more --id values." >&2
      exit 1
    fi

    if [ ! -s "$selected_tmp" ]; then
      rm -f "$selected_tmp"
      echo "No workflows matched the provided --id values." >&2
      exit 1
    fi

    selected_json="$(jq -cs 'unique_by(.id)' "$selected_tmp")"
    rm -f "$selected_tmp"

    printf '%s\n' "$selected_json"
    return
  fi

  api_get "$N8N_API_URL/api/v1/workflows?limit=$N8N_WORKFLOW_LIST_LIMIT"
  if [ "$API_LAST_HTTP_CODE" != "200" ]; then
    echo "Failed to list workflows from n8n UI (HTTP $API_LAST_HTTP_CODE)." >&2
    exit 1
  fi

  selected_json="$(echo "$API_LAST_BODY" | jq -c '
    [
      (.data // [])[]
      | select((.archived // .isArchived // false) | not)
      | {
          id: (.id | tostring),
          name: ((.name // "") | if . == "" then ("Workflow " + (.id | tostring)) else . end)
        }
    ]
  ')"

  if [ -n "$ONLY_NAME" ]; then
    selected_json="$(echo "$selected_json" | jq -c --arg workflow_name "$ONLY_NAME" '
      map(select(.name == $workflow_name))
    ')"
  fi

  if [ "$(echo "$selected_json" | jq 'length')" -eq 0 ]; then
    if [ -n "$ONLY_NAME" ]; then
      echo "No workflow found on n8n UI with name: $ONLY_NAME" >&2
    else
      echo "No non-archived workflows found on n8n UI." >&2
    fi
    exit 1
  fi

  printf '%s\n' "$selected_json"
}

sanitize_and_shape_workflow() {
  jq '
    {
      name: .name,
      nodes: .nodes,
      connections: .connections,
      settings: (.settings // {})
    }
    | (.nodes[]? |= del(.issues))
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "proxy_base_url") | .value) = "__PROXY_BASE_URL__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "proxy_api_key") | .value) = "__PROXY_API_KEY__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "n8n_api_url") | .value) = "__N8N_API_URL__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "n8n_api_key") | .value) = "__N8N_API_KEY__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "telegram_bot_token") | .value) = "__TELEGRAM_BOT_TOKEN__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "telegram_chat_id") | .value) = "__TELEGRAM_CHAT_ID__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "ggchat_webhook_url") | .value) = "__GG_CHAT_WEBHOOK__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "image_api_key") | .value) = ""
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "gdrive_root_folder_id") | .value) = "__GDRIVE_ROOT_FOLDER_ID__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "gdrive_credential_name") | .value) = "__GDRIVE_CREDENTIAL_NAME__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "gdriveRootFolderId") | .value) = "__GDRIVE_ROOT_FOLDER_ID__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "gdriveCredentialName") | .value) = "__GDRIVE_CREDENTIAL_NAME__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "text_to_images_workflow_id") | .value) = "__TEXT_TO_IMAGES_WORKFLOW_ID__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "text_to_videos_workflow_id") | .value) = "__TEXT_TO_VIDEOS_WORKFLOW_ID__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "tts_workflow_id") | .value) = "__TTS_WORKFLOW_ID__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "shared_notification_workflow_path") | .value) = "__SHARED_NOTIFICATION_WORKFLOW_PATH__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "gg_drive_manager_workflow_path") | .value) = "__GG_DRIVE_MANAGER_WORKFLOW_PATH__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "ggDriveManagerWorkflowPath") | .value) = "__GG_DRIVE_MANAGER_WORKFLOW_PATH__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "gg_sheet_manager_workflow_path") | .value) = "__GG_SHEET_MANAGER_WORKFLOW_PATH__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "ggSheetManagerWorkflowPath") | .value) = "__GG_SHEET_MANAGER_WORKFLOW_PATH__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "master_prompt_template") | .value) = "__BOOK_REVIEW_MASTER_PROMPT__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "scene_outline_prompt_template") | .value) = "__BOOK_REVIEW_SCENE_OUTLINE_PROMPT__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "scene_expand_prompt_template") | .value) = "__BOOK_REVIEW_SCENE_EXPAND_PROMPT__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "metadata_prompt_template") | .value) = "__BOOK_REVIEW_METADATA_PROMPT__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "qc_prompt_template") | .value) = "__BOOK_REVIEW_QC_PROMPT__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Config")) | .parameters.assignments.assignments[]? | select(.name == "review_revision_prompt_template") | .value) = "__BOOK_REVIEW_REVIEW_EDIT_PROMPT__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Notify Targets")) | .parameters.includeOtherFields) = true
    | (.nodes[]? | select((.name | tostring) | startswith("Set Notify Targets")) | .parameters.assignments.assignments[]? | select(.name == "notify_targets") | .value) = "__NOTIFY_TARGETS__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Notify Targets")) | .parameters.assignments.assignments[]? | select(.name == "telegram_bot_token") | .value) = "__TELEGRAM_BOT_TOKEN__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Notify Targets")) | .parameters.assignments.assignments[]? | select(.name == "telegram_chat_id") | .value) = "__TELEGRAM_CHAT_ID__"
    | (.nodes[]? | select((.name | tostring) | startswith("Set Notify Targets")) | .parameters.assignments.assignments[]? | select(.name == "ggchat_webhook_url") | .value) = "__GG_CHAT_WEBHOOK__"
    | (.nodes[]? | select((.name | tostring) | startswith("Notify via Shared Workflow")) | .parameters.workflowPath) = "__SHARED_NOTIFICATION_WORKFLOW_PATH__"
    | (.nodes[]? | select(.name == "Generate Image Assets (Worker)") | .parameters.source) = "database"
    | (.nodes[]? | select(.name == "Generate Image Assets (Worker)") | .parameters.workflowId) = {
        "__rl": true,
        "mode": "id",
        "value": "={{ (() => { const mode = String($json.media_visual_mode || 'image').toLowerCase(); if (mode === 'video') { return $json.text_to_videos_workflow_id || \"__TEXT_TO_VIDEOS_WORKFLOW_ID__\"; } return $json.text_to_images_workflow_id || \"__TEXT_TO_IMAGES_WORKFLOW_ID__\"; })() }}"
      }
    | (.nodes[]? | select(.name == "Generate Image Assets (Worker)") | .parameters) |= del(.workflowPath)
    | (.nodes[]? | select(.name == "Generate TTS Assets (Worker)") | .parameters.source) = "database"
    | (.nodes[]? | select(.name == "Generate TTS Assets (Worker)") | .parameters.workflowId) = {
        "__rl": true,
        "mode": "id",
        "value": "={{ $json.tts_workflow_id || \"__TTS_WORKFLOW_ID__\" }}"
      }
    | (.nodes[]? | select(.name == "Generate TTS Assets (Worker)") | .parameters) |= del(.workflowPath)
    | (.nodes[]? | select(.credentials.googleApi != null) | .credentials.googleApi) = {
        id: "__GDRIVE_CREDENTIAL_ID__",
        name: "__GDRIVE_CREDENTIAL_NAME__"
      }
    | (.nodes[]? | select(.credentials.googleDriveOAuth2Api != null) | .credentials.googleDriveOAuth2Api) = {
        id: "__GDRIVE_CREDENTIAL_ID__",
        name: "__GDRIVE_CREDENTIAL_NAME__"
      }
    | (.nodes[]? | select(.type == "n8n-nodes-base.telegram" or .type == "n8n-nodes-base.telegramTrigger") | .credentials.telegramApi) = {
        id: "__TELEGRAM_CREDENTIAL_ID__",
        name: "__TELEGRAM_CREDENTIAL_NAME__"
      }
  '
}

main() {
  parse_args "$@"

  require_cmd curl
  require_cmd jq
  require_cmd diff
  require_cmd sed
  require_cmd tr
  require_cmd sqlite3

  if [ ! -f "$N8N_ENV_FILE" ]; then
    echo "Missing file: $N8N_ENV_FILE" >&2
    exit 1
  fi

  if [ "$N8N_WORKFLOW_LIST_LIMIT" -le 0 ] || [ "$N8N_WORKFLOW_LIST_LIMIT" -gt 250 ]; then
    echo "N8N_WORKFLOW_LIST_LIMIT must be between 1 and 250 (current: $N8N_WORKFLOW_LIST_LIMIT)." >&2
    exit 1
  fi

  set -a
  # shellcheck source=/dev/null
  source "$N8N_ENV_FILE"
  set +a

  : "${N8N_API_URL:?N8N_API_URL is required}"
  : "${N8N_API_KEY:?N8N_API_KEY is required}"

  local selected_json selected_lines
  selected_json="$(fetch_selected_workflows_json)"
  selected_lines="$(echo "$selected_json" | jq -c '.[]')"

  local folder_db_map_file folder_db_loaded
  folder_db_map_file="$(mktemp)"
  folder_db_loaded="false"
  if load_workflow_folder_map_from_db "$folder_db_map_file"; then
    folder_db_loaded="true"
    log "Loaded workflow folder map from DB: $N8N_SQLITE_DB_PATH"
  else
    : > "$folder_db_map_file"
    log "WARN cannot load folder map from DB: $N8N_SQLITE_DB_PATH"
  fi

  local registry_original_exists registry_runtime_file
  registry_original_exists="false"
  if [ -f "$WORKFLOW_REGISTRY_FILE" ]; then
    registry_original_exists="true"
  fi

  registry_runtime_file="$(mktemp)"
  if [ "$registry_original_exists" = "true" ]; then
    cp "$WORKFLOW_REGISTRY_FILE" "$registry_runtime_file"
  else
    printf '{\n  "workflows": {}\n}\n' > "$registry_runtime_file"
    log "Registry file not found, will initialize: $WORKFLOW_REGISTRY_FILE"
  fi

  local run_synced_at
  run_synced_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  local total=0
  local changed=0
  local unchanged=0
  local failed=0
  local missing_ui_folder=0
  local registry_new=0
  local registry_updated=0
  local registry_conflict=0
  local wrapper_new=0
  local wrapper_preview_new=0
  local wrapper_existing=0
  local wrapper_updated=0
  local wrapper_pruned=0
  local wrapper_preview_pruned=0
  local changed_names=""

  while IFS= read -r listed_entry; do
    [ -n "$listed_entry" ] || continue
    total=$((total + 1))

    local listed_id listed_name
    listed_id="$(echo "$listed_entry" | jq -r '.id')"
    listed_name="$(echo "$listed_entry" | jq -r '.name')"

    api_get "$N8N_API_URL/api/v1/workflows/$listed_id"
    if [ "$API_LAST_HTTP_CODE" != "200" ]; then
      log "FAIL $listed_name ($listed_id) HTTP $API_LAST_HTTP_CODE"
      failed=$((failed + 1))
      continue
    fi

    local raw wf_id wf_name
    raw="$API_LAST_BODY"
    wf_id="$(echo "$raw" | jq -r '.id // empty')"
    wf_name="$(echo "$raw" | jq -r '.name // empty')"
    if [ -z "$wf_id" ]; then
      log "FAIL $listed_name ($listed_id) missing workflow id in response"
      failed=$((failed + 1))
      continue
    fi
    if [ -z "$wf_name" ]; then
      wf_name="$listed_name"
    fi

    local wf_folder_ui wf_folder_db wf_folder_by_name wf_folder_target
    wf_folder_ui="$(workflow_folder_from_ui_payload "$raw")"
    wf_folder_db=""
    if [ "$folder_db_loaded" = "true" ]; then
      wf_folder_db="$(workflow_folder_from_db_map "$folder_db_map_file" "$wf_id")"
    fi
    if [ -z "$wf_folder_ui" ] && [ -n "$wf_folder_db" ]; then
      wf_folder_ui="$wf_folder_db"
    fi
    wf_folder_by_name=""
    if [ -z "$wf_folder_ui" ] && [ "$FOLDER_FROM_NAME_FALLBACK" = "true" ]; then
      wf_folder_by_name="$(workflow_folder_from_name_path "$wf_name")"
    fi
    wf_folder_target="$wf_folder_ui"
    if [ -z "$wf_folder_target" ]; then
      wf_folder_target="$wf_folder_by_name"
    fi

    local by_id_tsv by_name_tsv
    local key="" old_id="" old_template="" old_wrapper="" old_last_synced=""
    local wf_key wf_template_raw strategy_note

    by_id_tsv="$(registry_entry_by_id_tsv "$registry_runtime_file" "$wf_id")"
    if [ -n "$by_id_tsv" ]; then
      IFS=$'\t' read -r key old_id old_template old_wrapper old_last_synced <<< "$by_id_tsv"
      wf_key="$key"
      wf_template_raw="$(normalize_registry_template_path "$old_template")"
      strategy_note="id-match"
    else
      by_name_tsv="$(registry_entry_by_name_tsv "$registry_runtime_file" "$wf_name")"
      if [ -n "$by_name_tsv" ]; then
        IFS=$'\t' read -r key old_id old_template old_wrapper old_last_synced <<< "$by_name_tsv"
        if [ -z "$old_id" ] || [ "$old_id" = "$wf_id" ]; then
          wf_key="$key"
          wf_template_raw="$(normalize_registry_template_path "$old_template")"
          strategy_note="name-match"
        else
          wf_key="$(generate_unique_registry_key "$registry_runtime_file" "$wf_name" "$wf_id")"
          wf_template_raw=""
          strategy_note="name-conflict-existing-id=$old_id"
          registry_conflict=$((registry_conflict + 1))
          log "CONFLICT name '$wf_name' already mapped to ID '$old_id'; create new key '$wf_key' for ID '$wf_id'"
        fi
      else
        wf_key="$(generate_unique_registry_key "$registry_runtime_file" "$wf_name" "$wf_id")"
        wf_template_raw=""
        strategy_note="new"
      fi
    fi

    if [ -z "$wf_template_raw" ]; then
      if [ -z "$wf_folder_target" ] && [ "$REQUIRE_UI_FOLDER_FOR_NEW_WORKFLOWS" = "true" ]; then
        log "FAIL $wf_name ($wf_id) missing UI folder metadata; strict folder mode forbids fallback. Use --allow-folder-fallback to override."
        failed=$((failed + 1))
        missing_ui_folder=$((missing_ui_folder + 1))
        continue
      fi
      wf_template_raw="$(generate_unique_template_path "$registry_runtime_file" "$wf_name" "$wf_id" "$wf_folder_target")"
      wf_template_raw="$(normalize_registry_template_path "$wf_template_raw")"
    fi

    local existing_entry_tsv existing_entry_exists existing_id existing_template existing_wrapper
    existing_entry_tsv="$(registry_entry_by_name_tsv "$registry_runtime_file" "$wf_key")"
    existing_entry_exists="false"
    existing_id=""
    existing_template=""
    existing_wrapper=""
    if [ -n "$existing_entry_tsv" ]; then
      existing_entry_exists="true"
      IFS=$'\t' read -r key existing_id existing_template existing_wrapper old_last_synced <<< "$existing_entry_tsv"
      if [ -n "$existing_wrapper" ]; then
        existing_wrapper="$(to_repo_relative_path "$existing_wrapper")"
      fi
    fi

    local mapping_changed
    mapping_changed="false"
    if [ "$existing_entry_exists" = "false" ]; then
      mapping_changed="true"
      registry_new=$((registry_new + 1))
    elif [ "$existing_id" != "$wf_id" ] || [ "$(normalize_registry_template_path "$existing_template")" != "$wf_template_raw" ]; then
      mapping_changed="true"
      registry_updated=$((registry_updated + 1))
    fi

    local shaped tmp_new wf_template existing_file file_changed
    shaped="$(echo "$raw" | sanitize_and_shape_workflow)"
    tmp_new="$(mktemp)"
    echo "$shaped" | jq . > "$tmp_new"

    wf_template="$(resolve_template_path "$wf_template_raw")"
    if [ -f "$wf_template" ]; then
      existing_file="$wf_template"
    else
      mkdir -p "$(dirname "$wf_template")"
      existing_file=""
    fi

    file_changed="true"
    if [ -n "$existing_file" ] && diff -q "$existing_file" "$tmp_new" >/dev/null 2>&1; then
      file_changed="false"
      unchanged=$((unchanged + 1))
      rm -f "$tmp_new"
      log "UNCHANGED $wf_name ($wf_id) -> $wf_template_raw [$strategy_note]"
    else
      changed=$((changed + 1))
      if [ -z "$changed_names" ]; then
        changed_names="$wf_name"
      else
        changed_names="$changed_names, $wf_name"
      fi

      if [ "$APPLY" = "true" ]; then
        mv "$tmp_new" "$wf_template"
        log "UPDATED $wf_name ($wf_id) -> $wf_template_raw [$strategy_note]"
      else
        rm -f "$tmp_new"
        log "CHANGED $wf_name ($wf_id) -> $wf_template_raw [$strategy_note] (preview only, use --apply to write)"
      fi
    fi

    local wrapper_hint
    wrapper_hint="$existing_wrapper"
    if [ -z "$wrapper_hint" ]; then
      wrapper_hint="$old_wrapper"
    fi
    if [ -n "$wrapper_hint" ]; then
      wrapper_hint="$(resolve_repo_path "$wrapper_hint" 2>/dev/null || printf '%s\n' "$wrapper_hint")"
      if [ ! -f "$wrapper_hint" ]; then
        wrapper_hint=""
      fi
    fi

    ensure_wrapper_for_template "$wf_name" "$wf_id" "$wf_template_raw" "$wrapper_hint"

    local wrapper_path_raw wrapper_path_norm
    wrapper_path_raw=""
    wrapper_path_norm=""
    if [ -n "$WRAPPER_RESULT_PATH" ]; then
      wrapper_path_raw="$WRAPPER_RESULT_PATH"
      wrapper_path_norm="$(to_repo_relative_path "$wrapper_path_raw")"
    fi

    if [ "$mapping_changed" = "false" ] && [ "$wrapper_path_norm" != "" ] && [ "$wrapper_path_norm" != "$existing_wrapper" ]; then
      mapping_changed="true"
      registry_updated=$((registry_updated + 1))
    fi

    local should_touch_last_synced
    should_touch_last_synced=""
    if [ "$APPLY" = "true" ] && { [ "$mapping_changed" = "true" ] || [ "$file_changed" = "true" ] || [ "$WRAPPER_RESULT_UPDATED" = "true" ] || [ "$WRAPPER_RESULT_PRUNED" -gt 0 ]; }; then
      should_touch_last_synced="$run_synced_at"
    fi

    set_registry_entry "$registry_runtime_file" "$wf_key" "$wf_id" "$wf_template_raw" "$wrapper_path_norm" "$should_touch_last_synced"

    case "$WRAPPER_RESULT_STATUS" in
      exists)
        wrapper_existing=$((wrapper_existing + 1))
        if [ "$WRAPPER_RESULT_UPDATED" = "true" ]; then
          wrapper_updated=$((wrapper_updated + 1))
        fi
        if [ "$WRAPPER_RESULT_PRUNED" -gt 0 ]; then
          if [ "$APPLY" = "true" ]; then
            wrapper_pruned=$((wrapper_pruned + WRAPPER_RESULT_PRUNED))
          else
            wrapper_preview_pruned=$((wrapper_preview_pruned + WRAPPER_RESULT_PRUNED))
          fi
        fi
        ;;
      created)
        wrapper_new=$((wrapper_new + 1))
        ;;
      planned)
        wrapper_preview_new=$((wrapper_preview_new + 1))
        ;;
    esac
  done <<< "$selected_lines"

  local registry_file_changed
  registry_file_changed="false"
  if [ "$APPLY" = "true" ]; then
    if [ "$registry_original_exists" = "false" ]; then
      mkdir -p "$(dirname "$WORKFLOW_REGISTRY_FILE")"
      cp "$registry_runtime_file" "$WORKFLOW_REGISTRY_FILE"
      registry_file_changed="true"
      log "CREATED registry -> $WORKFLOW_REGISTRY_FILE"
    elif ! diff -q "$WORKFLOW_REGISTRY_FILE" "$registry_runtime_file" >/dev/null 2>&1; then
      cp "$registry_runtime_file" "$WORKFLOW_REGISTRY_FILE"
      registry_file_changed="true"
      log "UPDATED registry -> $WORKFLOW_REGISTRY_FILE"
    fi
  fi

  log "Summary total=$total changed=$changed unchanged=$unchanged failed=$failed missing_ui_folder=$missing_ui_folder registry_new=$registry_new registry_updated=$registry_updated conflicts=$registry_conflict wrapper_new=$wrapper_new wrapper_updated=$wrapper_updated wrapper_pruned=$wrapper_pruned wrapper_preview_new=$wrapper_preview_new wrapper_preview_pruned=$wrapper_preview_pruned wrapper_existing=$wrapper_existing mode=$( [ "$APPLY" = "true" ] && echo apply || echo preview )"

  if [ "$APPLY" = "true" ] && [ "$WRITE_LOG" = "true" ]; then
    local summary details

    if [ "$changed" -eq 0 ] && [ "$registry_file_changed" = "false" ] && [ "$wrapper_new" -eq 0 ]; then
      summary="Workflow sync (UI -> JSON) completed with no file, registry, or wrapper changes."
    else
      summary="Workflow sync (UI -> JSON) processed $total workflow(s): changed=$changed, missing_ui_folder=$missing_ui_folder, registry_new=$registry_new, registry_updated=$registry_updated, conflicts=$registry_conflict, wrapper_new=$wrapper_new, wrapper_updated=$wrapper_updated, wrapper_pruned=$wrapper_pruned."
    fi

    details="Run mode=apply, total=$total, changed=$changed, unchanged=$unchanged, failed=$failed, missing_ui_folder=$missing_ui_folder, registry_changed=$registry_file_changed, wrapper_new=$wrapper_new, wrapper_updated=$wrapper_updated, wrapper_pruned=$wrapper_pruned."
    if [ -n "$changed_names" ]; then
      details="$details Changed workflows: $changed_names."
    fi

    ensure_changelog_file "$CHANGELOG_FILE"
    append_changelog_entry "$CHANGELOG_FILE" "$run_synced_at" "$summary" "$details"

    log "Logged run to $CHANGELOG_FILE."
  fi

  rm -f "$registry_runtime_file"
  rm -f "$folder_db_map_file"

  if [ "$failed" -gt 0 ]; then
    exit 1
  fi
}

main "$@"
