#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
N8N_ENV_FILE="${N8N_ENV_FILE:-$ROOT_DIR/env.n8n.local}"
CLIPROXY_ENV_FILE="${CLIPROXY_ENV_FILE:-$ROOT_DIR/env.cliproxy.local}"

set -a
[ -f "$N8N_ENV_FILE" ] && source "$N8N_ENV_FILE"
[ -f "$CLIPROXY_ENV_FILE" ] && source "$CLIPROXY_ENV_FILE"
set +a

if command -v n8n >/dev/null 2>&1; then
  exec n8n start "$@"
fi

if command -v npx >/dev/null 2>&1; then
  exec npx --yes n8n start "$@"
fi

if [ -x /opt/homebrew/bin/npx ]; then
  exec /opt/homebrew/bin/npx --yes n8n start "$@"
fi

echo "Khong tim thay n8n/npx. Chay bootstrap truoc: bash scripts/bootstrap/bootstrap-local.sh" >&2
exit 1
