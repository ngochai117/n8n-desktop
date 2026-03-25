#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
MCP_FILE="$ROOT_DIR/.mcp.json"
VENDOR_DIR="$ROOT_DIR/.vendor"

pass() { printf '[PASS] %s\n' "$1"; }
warn() { printf '[WARN] %s\n' "$1"; }
fail() { printf '[FAIL] %s\n' "$1"; exit 1; }

check_cmd() {
  local c="$1"
  if command -v "$c" >/dev/null 2>&1; then
    pass "command available: $c"
  else
    fail "command missing: $c"
  fi
}

check_dir() {
  local d="$1"
  if [ -d "$d" ]; then
    pass "directory exists: $d"
  else
    fail "directory missing: $d"
  fi
}

check_cmd git
check_cmd node
check_cmd npm
check_cmd npx
check_cmd n8n

check_dir "$VENDOR_DIR/n8n-mcp/.git"
check_dir "$VENDOR_DIR/n8n-skills/.git"

if command -v n8n-mcp >/dev/null 2>&1; then
  pass "command available: n8n-mcp"
else
  warn "n8n-mcp command not found globally (npx n8n-mcp may still work)"
fi

check_dir "$HOME/.codex/skills"

expected_skills=(
  "n8n-expression-syntax"
  "n8n-mcp-tools-expert"
  "n8n-workflow-patterns"
  "n8n-validation-expert"
  "n8n-node-configuration"
  "n8n-code-javascript"
  "n8n-code-python"
)

for skill in "${expected_skills[@]}"; do
  if [ -d "$HOME/.codex/skills/$skill" ]; then
    pass "skill installed: $skill"
  else
    fail "missing skill: $skill"
  fi
done

[ -f "$MCP_FILE" ] || fail "missing file: $MCP_FILE"

MODE="$(MCP_FILE="$MCP_FILE" node <<'NODE'
const fs = require('fs');
const p = process.env.MCP_FILE;
const raw = fs.readFileSync(p, 'utf8');
const cfg = JSON.parse(raw);
const server = cfg?.mcpServers?.['n8n-mcp'];
if (!server) {
  console.error('missing mcpServers.n8n-mcp');
  process.exit(2);
}
const env = server.env || {};
const hasUrl = !!env.N8N_API_URL;
const hasKey = !!env.N8N_API_KEY;
if (hasUrl && hasKey) {
  process.stdout.write('full');
} else {
  process.stdout.write('docs');
}
NODE
)" || fail "invalid .mcp.json structure"

if [ "$MODE" = "full" ]; then
  pass ".mcp.json mode: full (workflow management tools enabled)"
else
  warn ".mcp.json mode: docs (no N8N_API_URL/N8N_API_KEY yet)"
fi

pass "Verification complete"
