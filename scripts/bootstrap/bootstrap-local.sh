#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
VENDOR_DIR="$ROOT_DIR/.vendor"
N8N_MCP_REPO="https://github.com/czlonkowski/n8n-mcp.git"
N8N_SKILLS_REPO="https://github.com/czlonkowski/n8n-skills.git"
MCP_FILE="$ROOT_DIR/.mcp.json"

log() {
  printf '[bootstrap] %s\n' "$1"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

ensure_repo() {
  local repo_url="$1"
  local target_dir="$2"

  if [ -d "$target_dir/.git" ]; then
    log "Updating $(basename "$target_dir")"
    git -C "$target_dir" pull --ff-only
  else
    log "Cloning $(basename "$target_dir")"
    git clone --depth=1 "$repo_url" "$target_dir"
  fi
}

write_docs_mode_mcp_json() {
  if [ -f "$MCP_FILE" ]; then
    log ".mcp.json already exists, skip overwrite"
    return
  fi

  cat > "$MCP_FILE" <<JSON
{
  "mcpServers": {
    "n8n-mcp": {
      "command": "npx",
      "args": ["n8n-mcp"],
      "env": {
        "MCP_MODE": "stdio",
        "LOG_LEVEL": "error",
        "DISABLE_CONSOLE_OUTPUT": "true"
      }
    }
  }
}
JSON
  log "Created docs-mode .mcp.json"
}

install_skills() {
  local src_dir="$VENDOR_DIR/n8n-skills/skills"
  local codex_dir="$HOME/.codex/skills"
  local claude_dir="$HOME/.claude/skills"

  if [ ! -d "$src_dir" ]; then
    echo "Skills source directory not found: $src_dir" >&2
    exit 1
  fi

  mkdir -p "$codex_dir"
  cp -R "$src_dir"/* "$codex_dir"/
  log "Installed n8n skills into $codex_dir"

  if [ -d "$HOME/.claude" ]; then
    mkdir -p "$claude_dir"
    cp -R "$src_dir"/* "$claude_dir"/
    log "Mirrored n8n skills into $claude_dir"
  fi
}

main() {
  require_cmd git
  require_cmd node
  require_cmd npm

  mkdir -p "$VENDOR_DIR"

  if ! command -v n8n >/dev/null 2>&1; then
    log "Installing n8n globally"
    npm install -g n8n
  else
    log "n8n already installed"
  fi

  ensure_repo "$N8N_MCP_REPO" "$VENDOR_DIR/n8n-mcp"
  ensure_repo "$N8N_SKILLS_REPO" "$VENDOR_DIR/n8n-skills"

  log "Installing n8n-mcp globally"
  npm install -g n8n-mcp

  install_skills
  write_docs_mode_mcp_json

  log "Bootstrap completed"
  log "Next: run 'n8n' then open http://localhost:5678"
  log "Then run: bash scripts/bootstrap/verify-local.sh"
}

main "$@"
