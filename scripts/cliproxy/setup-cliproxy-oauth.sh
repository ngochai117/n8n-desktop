#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DEFAULT_ENV_FILE="$ROOT_DIR/env.cliproxy.local"
TEMPLATE_FILE="$ROOT_DIR/configs/cliproxy.config.template.yaml"
CLIPROXY_HOME="$HOME/.cli-proxy-api"
CLIPROXY_CONFIG="$CLIPROXY_HOME/config.yaml"

ENV_FILE="$DEFAULT_ENV_FILE"
SKIP_OAUTH="false"
SKIP_WORKFLOW_IMPORT="false"

log() {
  printf '[cliproxy-setup] %s\n' "$1"
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Missing required command: $cmd" >&2
    exit 1
  }
}

escape_sed() {
  printf '%s' "$1" | sed -e 's/[\/&]/\\&/g'
}

generate_random_key() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  else
    date +%s | shasum | awk '{print $1}' | cut -c1-48
  fi
}

pause_step() {
  if [ -t 0 ]; then
    read -r -p "[cliproxy-setup] $1 Press Enter to continue... " _
  else
    log "$1"
  fi
}

parse_port_from_base_url() {
  local base_url="$1"
  if [[ "$base_url" =~ ^https?://([^/:]+)(:([0-9]+))?/?$ ]]; then
    local scheme host port
    scheme="${base_url%%://*}"
    host="${BASH_REMATCH[1]}"
    port="${BASH_REMATCH[3]:-}"

    if [ "$host" != "127.0.0.1" ] && [ "$host" != "localhost" ]; then
      echo "CLIPROXY_BASE_URL must use localhost/127.0.0.1 for local-only security" >&2
      return 1
    fi

    if [ -z "$port" ]; then
      if [ "$scheme" = "https" ]; then
        port="443"
      else
        port="80"
      fi
    fi

    printf '%s' "$port"
    return 0
  fi

  echo "Invalid CLIPROXY_BASE_URL format: $base_url" >&2
  return 1
}

ensure_env_file() {
  local env_file="$1"

  if [ -f "$env_file" ]; then
    return
  fi

  log "Env file not found. Creating: $env_file"
  cat > "$env_file" <<ENV
CLIPROXY_BASE_URL=http://127.0.0.1:8317
CLIPROXY_CLIENT_KEY=$(generate_random_key)
CLIPROXY_MANAGEMENT_KEY=$(generate_random_key)
CLIPROXY_GOOGLE_PROJECT_ID=
ENV

  log "Created $env_file with generated CLIPROXY_CLIENT_KEY and CLIPROXY_MANAGEMENT_KEY"
  log "If needed, edit CLIPROXY_GOOGLE_PROJECT_ID before rerunning"
}

ensure_management_key_in_env() {
  local env_file="$1"
  local key="$2"
  if grep -Eq '^CLIPROXY_MANAGEMENT_KEY=' "$env_file"; then
    return
  fi
  printf '\nCLIPROXY_MANAGEMENT_KEY=%s\n' "$key" >> "$env_file"
  log "Added CLIPROXY_MANAGEMENT_KEY to $env_file"
}

sync_config() {
  local host="127.0.0.1"
  local port="$1"
  local auth_dir="$2"
  local client_key="$3"
  local management_key="$4"

  local esc_host esc_port esc_auth_dir esc_client_key esc_management_key
  esc_host="$(escape_sed "$host")"
  esc_port="$(escape_sed "$port")"
  esc_auth_dir="$(escape_sed "$auth_dir")"
  esc_client_key="$(escape_sed "$client_key")"
  esc_management_key="$(escape_sed "$management_key")"

  mkdir -p "$CLIPROXY_HOME"

  sed \
    -e "s/__HOST__/$esc_host/g" \
    -e "s/__PORT__/$esc_port/g" \
    -e "s#__AUTH_DIR__#$esc_auth_dir#g" \
    -e "s#__CLIENT_KEY__#$esc_client_key#g" \
    -e "s#__MANAGEMENT_KEY__#$esc_management_key#g" \
    "$TEMPLATE_FILE" > "$CLIPROXY_CONFIG"

  log "Synced config to $CLIPROXY_CONFIG"
}

ensure_brew_config_link() {
  local brew_prefix service_config backup
  brew_prefix="$(brew --prefix)"
  service_config="$brew_prefix/etc/cliproxyapi.conf"

  mkdir -p "$(dirname "$service_config")"

  if [ -L "$service_config" ]; then
    ln -sf "$CLIPROXY_CONFIG" "$service_config"
  elif [ -f "$service_config" ]; then
    backup="$service_config.bak.$(date +%Y%m%d%H%M%S)"
    mv "$service_config" "$backup"
    ln -s "$CLIPROXY_CONFIG" "$service_config"
    log "Backed up existing brew config to $backup"
  else
    ln -s "$CLIPROXY_CONFIG" "$service_config"
  fi

  log "Service config linked: $service_config -> $CLIPROXY_CONFIG"
}

wait_for_proxy() {
  local base_url="$1"
  local key="$2"

  local code=""
  for _ in {1..30}; do
    code="$(curl -sS -o /tmp/cliproxy_probe.out -w '%{http_code}' -H "Authorization: Bearer $key" "$base_url/v1/models" || true)"
    if [ "$code" = "200" ]; then
      return 0
    fi
    sleep 1
  done

  echo "CLIProxyAPI is not ready at $base_url (last status: $code)" >&2
  [ -f /tmp/cliproxy_probe.out ] && cat /tmp/cliproxy_probe.out >&2
  return 1
}

verify_proxy() {
  local base_url="$1"
  local client_key="$2"

  local code_noauth
  code_noauth="$(curl -sS -o /tmp/cliproxy_noauth.out -w '%{http_code}' "$base_url/v1/models" || true)"
  if [ "$code_noauth" != "401" ] && [ "$code_noauth" != "403" ]; then
    echo "Expected unauthorized response without key, got HTTP $code_noauth" >&2
    [ -f /tmp/cliproxy_noauth.out ] && cat /tmp/cliproxy_noauth.out >&2
    exit 1
  fi
  log "Negative test passed (unauthorized without key): HTTP $code_noauth"

  local models
  models="$(curl -sS -H "Authorization: Bearer $client_key" "$base_url/v1/models")"
  local model_count
  model_count="$(echo "$models" | jq -r '.data | length')"
  if [ -z "$model_count" ] || [ "$model_count" = "null" ] || [ "$model_count" -eq 0 ]; then
    echo "No models returned from $base_url/v1/models" >&2
    echo "$models" | jq . >&2 || echo "$models" >&2
    exit 1
  fi
  log "Model listing passed: $model_count models"

  local chat_response text
  chat_response="$(curl -sS -X POST "$base_url/v1/chat/completions" \
    -H "Authorization: Bearer $client_key" \
    -H 'Content-Type: application/json' \
    -d '{
      "model": "gemini-3-flash-preview",
      "messages": [{"role": "user", "content": "Reply with exactly: CLIPROXY_OK"}],
      "stream": false
    }')"

  text="$(echo "$chat_response" | jq -r '.choices[0].message.content // empty')"
  if [ -z "$text" ]; then
    echo "Chat completion response missing choices[0].message.content" >&2
    echo "$chat_response" | jq . >&2 || echo "$chat_response" >&2
    exit 1
  fi

  log "Chat completion passed"
}

usage() {
  cat <<USAGE
Usage: bash scripts/cliproxy/setup-cliproxy-oauth.sh [options]

Options:
  --env-file <path>       Path to env file (default: $DEFAULT_ENV_FILE)
  --skip-oauth            Skip Gemini/Codex OAuth login steps
  --skip-workflow-import  Skip n8n demo workflow import
  -h, --help              Show this help message
USAGE
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --env-file)
        [ "$#" -ge 2 ] || { echo "--env-file requires a value" >&2; exit 1; }
        ENV_FILE="$2"
        shift 2
        ;;
      --skip-oauth)
        SKIP_OAUTH="true"
        shift
        ;;
      --skip-workflow-import)
        SKIP_WORKFLOW_IMPORT="true"
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
}

main() {
  parse_args "$@"

  require_cmd brew
  require_cmd curl
  require_cmd jq
  require_cmd n8n

  [ -f "$TEMPLATE_FILE" ] || { echo "Missing template file: $TEMPLATE_FILE" >&2; exit 1; }

  ensure_env_file "$ENV_FILE"

  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a

  : "${CLIPROXY_BASE_URL:=http://127.0.0.1:8317}"
  : "${CLIPROXY_CLIENT_KEY:?CLIPROXY_CLIENT_KEY is required in $ENV_FILE}"
  : "${CLIPROXY_MANAGEMENT_KEY:=}"
  : "${CLIPROXY_GOOGLE_PROJECT_ID:=}"

  if [ -z "$CLIPROXY_MANAGEMENT_KEY" ]; then
    CLIPROXY_MANAGEMENT_KEY="$(generate_random_key)"
    ensure_management_key_in_env "$ENV_FILE" "$CLIPROXY_MANAGEMENT_KEY"
  fi

  local port
  port="$(parse_port_from_base_url "$CLIPROXY_BASE_URL")"

  if ! brew list --versions cliproxyapi >/dev/null 2>&1; then
    log "Installing cliproxyapi via Homebrew"
    brew install cliproxyapi
  else
    log "cliproxyapi already installed"
  fi

  require_cmd cliproxyapi

  sync_config "$port" "$CLIPROXY_HOME" "$CLIPROXY_CLIENT_KEY" "$CLIPROXY_MANAGEMENT_KEY"
  ensure_brew_config_link

  brew services stop cliproxyapi >/dev/null 2>&1 || true

  if [ "$SKIP_OAUTH" = "false" ]; then
    pause_step "Step 1/4 Gemini OAuth login will start."
    if [ -n "$CLIPROXY_GOOGLE_PROJECT_ID" ]; then
      cliproxyapi --config "$CLIPROXY_CONFIG" --login --project_id "$CLIPROXY_GOOGLE_PROJECT_ID"
    else
      cliproxyapi --config "$CLIPROXY_CONFIG" --login
    fi

    pause_step "Step 2/4 Codex OAuth login will start."
    cliproxyapi --config "$CLIPROXY_CONFIG" --codex-login
  else
    log "Skipping OAuth steps by request (--skip-oauth)"
  fi

  log "Starting cliproxyapi service"
  brew services start cliproxyapi

  pause_step "Step 3/4 Waiting for service readiness."
  wait_for_proxy "$CLIPROXY_BASE_URL" "$CLIPROXY_CLIENT_KEY"
  verify_proxy "$CLIPROXY_BASE_URL" "$CLIPROXY_CLIENT_KEY"

  if [ "$SKIP_WORKFLOW_IMPORT" = "false" ] && [ -f "$ROOT_DIR/env.n8n.local" ]; then
    if [ -f "$ROOT_DIR/workflows/demo/gemini-cliproxy-demo.workflow.json" ]; then
      log "Importing Gemini demo workflow into n8n"
      bash "$ROOT_DIR/scripts/workflows/import/import-gemini-demo-workflow.sh" "$ROOT_DIR/env.n8n.local" "$ENV_FILE" "$ROOT_DIR/workflows/demo/gemini-cliproxy-demo.workflow.json"
    fi

    if [ -f "$ROOT_DIR/workflows/demo/openai-cliproxy-demo.workflow.json" ]; then
      log "Importing OpenAI demo workflow into n8n"
      bash "$ROOT_DIR/scripts/workflows/import/import-openai-demo-workflow.sh" "$ROOT_DIR/env.n8n.local" "$ENV_FILE" "$ROOT_DIR/workflows/demo/openai-cliproxy-demo.workflow.json"
    fi
  else
    log "Skipped workflow import"
  fi

  log "Management UI: $CLIPROXY_BASE_URL/management.html#/login"
  log "Management Key is stored in: $ENV_FILE (CLIPROXY_MANAGEMENT_KEY)"
  log "Step 4/4 Done. CLIProxyAPI OAuth setup complete."
}

main "$@"
