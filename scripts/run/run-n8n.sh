#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
N8N_ENV_FILE="${N8N_ENV_FILE:-$ROOT_DIR/env.n8n.local}"
PROXY_ENV_FILE="${PROXY_ENV_FILE:-$ROOT_DIR/env.proxy.local}"
N8N_MIN_NODE_VERSION="${N8N_MIN_NODE_VERSION:-22.16.0}"

normalize_version() {
  local raw="$1"
  raw="${raw#v}"
  IFS='.' read -r major minor patch <<<"$raw"
  major="${major:-0}"
  minor="${minor:-0}"
  patch="${patch:-0}"
  printf '%d%03d%03d\n' "$major" "$minor" "$patch"
}

node_version_ok() {
  local node_version="$1"
  [ "$(normalize_version "$node_version")" -ge "$(normalize_version "$N8N_MIN_NODE_VERSION")" ]
}

try_load_nvm() {
  if [ -n "${NVM_DIR:-}" ] && [ -s "${NVM_DIR}/nvm.sh" ]; then
    # shellcheck source=/dev/null
    source "${NVM_DIR}/nvm.sh"
    return
  fi

  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    # shellcheck source=/dev/null
    source "$HOME/.nvm/nvm.sh"
  fi
}

ensure_node_runtime() {
  local current_node_version=""

  if command -v node >/dev/null 2>&1; then
    current_node_version="$(node -v 2>/dev/null || true)"
    if [ -n "$current_node_version" ] && node_version_ok "$current_node_version"; then
      return 0
    fi
  fi

  try_load_nvm
  if command -v nvm >/dev/null 2>&1; then
    nvm use --silent 22 >/dev/null 2>&1 || true
    if command -v node >/dev/null 2>&1; then
      current_node_version="$(node -v 2>/dev/null || true)"
      if [ -n "$current_node_version" ] && node_version_ok "$current_node_version"; then
        return 0
      fi
    fi
  fi

  current_node_version="${current_node_version:-not-found}"
  cat >&2 <<EOF
Node.js hien tai: $current_node_version
n8n yeu cau Node.js >= $N8N_MIN_NODE_VERSION.

Cach sua nhanh (nvm):
  nvm install 22.16.0
  nvm use 22.16.0
  nvm alias default 22.16.0

Sau do chay lai:
  bash scripts/run/run-n8n.sh
EOF
  return 1
}

set -a
[ -f "$N8N_ENV_FILE" ] && source "$N8N_ENV_FILE"
[ -f "$PROXY_ENV_FILE" ] && source "$PROXY_ENV_FILE"
set +a

ensure_node_runtime

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
