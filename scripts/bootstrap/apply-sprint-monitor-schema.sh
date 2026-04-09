#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SCHEMA_FILE="$ROOT_DIR/docs/sprint-monitor/schema.sql"
SPRINT_MONITOR_PGURL="${SPRINT_MONITOR_PGURL:-${DATABASE_URL:-}}"

log() {
  printf '[sprint-monitor-schema] %s\n' "$1"
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Missing required command: $cmd" >&2
    exit 1
  }
}

main() {
  require_cmd psql

  [ -f "$SCHEMA_FILE" ] || {
    echo "Missing schema file: $SCHEMA_FILE" >&2
    exit 1
  }

  if [ -n "$SPRINT_MONITOR_PGURL" ]; then
    log "Applying schema via connection URL"
    psql "$SPRINT_MONITOR_PGURL" -v ON_ERROR_STOP=1 -f "$SCHEMA_FILE"
    log "Schema applied successfully"
    exit 0
  fi

  if [ -z "${PGHOST:-}" ] || [ -z "${PGDATABASE:-}" ] || [ -z "${PGUSER:-}" ]; then
    cat >&2 <<'EOF'
Missing PostgreSQL connection info.
Set SPRINT_MONITOR_PGURL or DATABASE_URL, or export PGHOST, PGDATABASE, and PGUSER.
EOF
    exit 1
  fi

  log "Applying schema via PG* environment variables"
  psql -v ON_ERROR_STOP=1 -f "$SCHEMA_FILE"
  log "Schema applied successfully"
}

main "$@"
