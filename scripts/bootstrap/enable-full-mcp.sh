#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/env.n8n.local}"
MCP_FILE="$ROOT_DIR/.mcp.json"

log() {
  printf '[enable-full] %s\n' "$1"
}

if [ ! -f "$ENV_FILE" ]; then
  echo "Env file not found: $ENV_FILE" >&2
  echo "Create it from env.n8n.local.example first." >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

if [ -z "${N8N_API_URL:-}" ]; then
  echo "N8N_API_URL is empty in $ENV_FILE" >&2
  exit 1
fi

if [ -z "${N8N_API_KEY:-}" ]; then
  echo "N8N_API_KEY is empty in $ENV_FILE" >&2
  exit 1
fi

N8N_API_URL="$N8N_API_URL" N8N_API_KEY="$N8N_API_KEY" MCP_FILE="$MCP_FILE" node <<'NODE'
const fs = require('fs');

const out = process.env.MCP_FILE;
const url = process.env.N8N_API_URL;
const key = process.env.N8N_API_KEY;

const cfg = {
  mcpServers: {
    'n8n-mcp': {
      command: 'npx',
      args: ['n8n-mcp'],
      env: {
        MCP_MODE: 'stdio',
        LOG_LEVEL: 'error',
        DISABLE_CONSOLE_OUTPUT: 'true',
        N8N_API_URL: url,
        N8N_API_KEY: key,
      },
    },
  },
};

fs.writeFileSync(out, JSON.stringify(cfg, null, 2) + '\n');
NODE

log "Updated .mcp.json to full-mode"
log "N8N_API_URL=$N8N_API_URL"
