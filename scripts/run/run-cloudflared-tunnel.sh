#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
N8N_ENV_FILE="${N8N_ENV_FILE:-$ROOT_DIR/env.n8n.local}"

[ -f "$N8N_ENV_FILE" ] && source "$N8N_ENV_FILE"

command -v docker >/dev/null 2>&1 || {
  echo "Khong tim thay docker command." >&2
  exit 1
}

TOKEN="${1:-${CLOUDFLARED_TUNNEL_TOKEN:-}}"
if [ -z "$TOKEN" ]; then
  echo "Usage: bash scripts/run/run-cloudflared-tunnel.sh <token>"
  echo "Hoac dat CLOUDFLARED_TUNNEL_TOKEN trong env.n8n.local"
  exit 1
fi

exec docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token "$TOKEN"
