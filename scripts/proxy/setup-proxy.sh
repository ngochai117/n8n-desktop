#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DEFAULT_ENV_FILE="$ROOT_DIR/env.proxy.local"

ENV_FILE="$DEFAULT_ENV_FILE"
SKIP_INSTALL="false"
SKIP_START="false"
SKIP_VERIFY="false"
SKIP_WORKFLOW_IMPORT="false"
RUNTIME_CMD=""

log() {
  printf '[proxy-setup] %s\n' "$1"
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Missing required command: $cmd" >&2
    exit 1
  }
}

ensure_env_file() {
  local env_file="$1"
  if [ -f "$env_file" ]; then
    return
  fi

  cat > "$env_file" <<'ENV'
PROXY_BASE_URL=http://127.0.0.1:20128
PROXY_API_KEY=
CONTENT_MODEL=cx/gpt-5.4
FALLBACK_MODEL=cx/gpt-5.2
QC_MODEL=cx/gpt-5.4
GEMINI_CONTENT_MODEL=gemini-3-flash-preview
IMAGE_MODEL=nano-banana-pro
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
GGCHAT_WEBHOOK_URL=
IMAGE_API_BASE_URL=
IMAGE_API_KEY=
TTS_API_BASE_URL=http://127.0.0.1:8001
TTS_VOICE_ID=ngochuyen
GDRIVE_ROOT_FOLDER_ID=
GDRIVE_CREDENTIAL_NAME=
ENV

  log "Created $env_file"
  log "Paste your API key from provider dashboard into PROXY_API_KEY"
}

normalize_base_url() {
  local base_url="$1"
  base_url="${base_url%/}"
  if [[ "$base_url" =~ /v1$ ]]; then
    base_url="${base_url%/v1}"
  fi
  printf '%s\n' "$base_url"
}

validate_local_base_url() {
  local base_url="$1"

  if [[ "$base_url" =~ ^https?://([^/:]+)(:([0-9]+))?$ ]]; then
    local host
    host="${BASH_REMATCH[1]}"
    if [ "$host" != "127.0.0.1" ] && [ "$host" != "localhost" ]; then
      echo "PROXY_BASE_URL must use localhost/127.0.0.1 for local-only security" >&2
      return 1
    fi
    return 0
  fi

  echo "Invalid PROXY_BASE_URL format: $base_url" >&2
  return 1
}

probe_proxy_http_code() {
  local base_url="$1"
  curl -sS -o /tmp/proxy_probe.out -w '%{http_code}' "$base_url/v1/models" || true
}

wait_for_proxy() {
  local base_url="$1"
  local code=""

  for _ in {1..45}; do
    code="$(probe_proxy_http_code "$base_url")"
    case "$code" in
      200|401|403)
        return 0
        ;;
    esac
    sleep 1
  done

  echo "Proxy endpoint is not ready at $base_url (last status: $code)" >&2
  [ -f /tmp/proxy_probe.out ] && cat /tmp/proxy_probe.out >&2
  return 1
}

ensure_proxy_runtime_installed() {
  if [ -z "$RUNTIME_CMD" ]; then
    RUNTIME_CMD="$(resolve_runtime_cmd)"
  fi

  if [ -n "$RUNTIME_CMD" ]; then
    log "Runtime already installed ($RUNTIME_CMD)"
    return
  fi

  require_cmd npm
  log "Installing runtime via npm (package: 9router)"
  npm install -g 9router

  RUNTIME_CMD="$(resolve_runtime_cmd)"
  [ -n "$RUNTIME_CMD" ] || {
    echo "Installed 9router but command not found in PATH. Restart shell and retry." >&2
    exit 1
  }
}

resolve_runtime_cmd() {
  if command -v 9router >/dev/null 2>&1; then
    command -v 9router
    return
  fi

  if [ -x /opt/homebrew/bin/9router ]; then
    printf '%s\n' "/opt/homebrew/bin/9router"
    return
  fi

  if [ -x /usr/local/bin/9router ]; then
    printf '%s\n' "/usr/local/bin/9router"
    return
  fi
}

ensure_proxy_db_seed() {
  local data_dir db_file

  data_dir="${DATA_DIR:-$HOME/.9router}"
  db_file="$data_dir/db.json"

  mkdir -p "$data_dir"
  if [ ! -s "$db_file" ]; then
    printf '{}' > "$db_file"
    log "Seeded runtime database at $db_file"
  fi
}

start_proxy_if_needed() {
  local base_url="$1"

  local code
  code="$(probe_proxy_http_code "$base_url")"
  case "$code" in
    200|401|403)
      log "Proxy endpoint already running ($base_url)"
      return
      ;;
  esac

  log "Starting runtime in background (logs: /tmp/proxy.log)"
  if [ -z "$RUNTIME_CMD" ]; then
    RUNTIME_CMD="$(resolve_runtime_cmd)"
  fi
  [ -n "$RUNTIME_CMD" ] || {
    echo "Cannot find runtime command (9router)." >&2
    exit 1
  }
  nohup "$RUNTIME_CMD" >/tmp/proxy.log 2>&1 &

  wait_for_proxy "$base_url"
}

verify_proxy_auth() {
  local base_url="$1"
  local api_key="$2"

  if [ -z "$api_key" ]; then
    log "PROXY_API_KEY is empty, skipped auth verification"
    log "Open dashboard, copy API key, set PROXY_API_KEY in env, then rerun with --skip-install --skip-start"
    return
  fi

  local body_file code
  body_file="$(mktemp)"
  code="$(curl -sS -o "$body_file" -w '%{http_code}' -H "Authorization: Bearer $api_key" "$base_url/v1/models" || true)"

  if [ "$code" != "200" ]; then
    echo "Auth verification failed (HTTP $code) at $base_url/v1/models" >&2
    cat "$body_file" >&2 || true
    rm -f "$body_file"
    exit 1
  fi

  local model_count
  model_count="$(jq -r '.data | length' "$body_file" 2>/dev/null || echo "")"
  if [[ "$model_count" =~ ^[0-9]+$ ]] && [ "$model_count" -gt 0 ]; then
    log "Model listing passed: $model_count models"
  else
    log "Model endpoint reachable with auth"
  fi

  rm -f "$body_file"
}

usage() {
  cat <<USAGE
Usage: bash scripts/proxy/setup-proxy.sh [options]

Options:
  --env-file <path>       Path to env file (default: $DEFAULT_ENV_FILE)
  --skip-install          Skip npm install -g runtime package
  --skip-start            Skip auto-start runtime
  --skip-verify           Skip API verification calls
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
      --skip-install)
        SKIP_INSTALL="true"
        shift
        ;;
      --skip-start)
        SKIP_START="true"
        shift
        ;;
      --skip-verify)
        SKIP_VERIFY="true"
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

  require_cmd curl
  require_cmd jq

  ensure_env_file "$ENV_FILE"

  set -a
  # shellcheck source=/dev/null
  source "$ENV_FILE"
  set +a

  : "${PROXY_BASE_URL:=http://127.0.0.1:20128}"
  : "${PROXY_API_KEY:=}"

  PROXY_BASE_URL="$(normalize_base_url "$PROXY_BASE_URL")"
  validate_local_base_url "$PROXY_BASE_URL"

  if [ "$SKIP_INSTALL" = "false" ]; then
    ensure_proxy_runtime_installed
  else
    log "Skipped install step"
  fi

  ensure_proxy_db_seed

  if [ "$SKIP_START" = "false" ]; then
    start_proxy_if_needed "$PROXY_BASE_URL"
  else
    log "Skipped start step"
  fi

  if [ "$SKIP_VERIFY" = "false" ]; then
    wait_for_proxy "$PROXY_BASE_URL"
    verify_proxy_auth "$PROXY_BASE_URL" "$PROXY_API_KEY"
  else
    log "Skipped verify step"
  fi

  if [ "$SKIP_WORKFLOW_IMPORT" = "false" ] && [ -f "$ROOT_DIR/env.n8n.local" ]; then
    if [ -f "$ROOT_DIR/workflows/demo/gemini-proxy-demo.workflow.json" ]; then
      log "Importing Gemini demo workflow into n8n"
      bash "$ROOT_DIR/scripts/workflows/import/import-gemini-demo-workflow.sh" "$ROOT_DIR/env.n8n.local" "$ENV_FILE" "$ROOT_DIR/workflows/demo/gemini-proxy-demo.workflow.json"
    fi

    if [ -f "$ROOT_DIR/workflows/demo/openai-proxy-demo.workflow.json" ]; then
      log "Importing OpenAI demo workflow into n8n"
      bash "$ROOT_DIR/scripts/workflows/import/import-openai-demo-workflow.sh" "$ROOT_DIR/env.n8n.local" "$ENV_FILE" "$ROOT_DIR/workflows/demo/openai-proxy-demo.workflow.json"
    fi
  else
    log "Skipped workflow import"
  fi

  log "Dashboard: $PROXY_BASE_URL/dashboard"
  log "API endpoint: $PROXY_BASE_URL/v1"
  log "Env file: $ENV_FILE"
  log "Done. Local proxy setup complete."
}

main "$@"
