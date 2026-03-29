#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
N8N_ENV_FILE="${N8N_ENV_FILE:-$ROOT_DIR/env.n8n.local}"
PROXY_ENV_FILE="${PROXY_ENV_FILE:-$ROOT_DIR/env.proxy.local}"
DATA_DIR="${N8N_DOCKER_DATA_DIR:-$ROOT_DIR/.vendor/docker/n8n-data}"

command -v docker >/dev/null 2>&1 || {
  echo "Khong tim thay docker command." >&2
  exit 1
}

mkdir -p "$DATA_DIR"

CMD=(
  docker run --rm -it
  --name n8n-local
  -p 5678:5678
  -v "$DATA_DIR:/home/node/.n8n"
)

[ -f "$N8N_ENV_FILE" ] && CMD+=(--env-file "$N8N_ENV_FILE")
[ -f "$PROXY_ENV_FILE" ] && CMD+=(--env-file "$PROXY_ENV_FILE")

CMD+=(docker.n8n.io/n8nio/n8n:latest)

exec "${CMD[@]}" "$@"
