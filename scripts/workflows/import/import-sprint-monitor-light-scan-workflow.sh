#!/usr/bin/env bash
set -euo pipefail
# SYNC_MANAGED_WRAPPER=1
# SYNC_WORKFLOW_ID=l4HFV7Mr0c5ZXi7j
# SYNC_MANAGED_WRAPPER=1

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
N8N_ENV_FILE="${1:-$ROOT_DIR/env.n8n.local}"
PROXY_ENV_FILE="${2:-$ROOT_DIR/env.proxy.local}"
WORKFLOW_TEMPLATE="${3:-$ROOT_DIR/workflows/sprint-monitor/sprint-monitor-light-scan.workflow.json}"
WORKFLOW_REGISTRY_FILE="${WORKFLOW_REGISTRY_FILE:-$ROOT_DIR/workflow-registry.json}"

bash "$ROOT_DIR/scripts/workflows/import/import-sprint-monitor-engine-workflow.sh" \
  "$N8N_ENV_FILE" \
  "$PROXY_ENV_FILE"

TMP_TEMPLATE="$(mktemp)"

python3 - "$WORKFLOW_TEMPLATE" "$WORKFLOW_REGISTRY_FILE" "$TMP_TEMPLATE" <<'PY'
import json
import re
import sys
from pathlib import Path

template_path = Path(sys.argv[1])
registry_path = Path(sys.argv[2])
output_path = Path(sys.argv[3])

text = template_path.read_text()
registry = json.loads(registry_path.read_text()).get('workflows', {})

def replace_token(match):
    token = match.group(0)
    key = token.split(':', 1)[1]
    entry = registry.get(key, {})
    workflow_id = str(entry.get('id', '')).strip()
    if not workflow_id:
        raise SystemExit(f'Missing workflow ID for registry key: {key}')
    return workflow_id

patched_text = re.sub(r"__REGISTRY__:[^'\"]+", replace_token, text)
output_path.write_text(patched_text)
PY

WORKFLOW_REGISTRY_TEMPLATE="$WORKFLOW_TEMPLATE" \
WORKFLOW_REGISTRY_IMPORT="scripts/workflows/import/import-sprint-monitor-light-scan-workflow.sh" \
  bash "$ROOT_DIR/scripts/workflows/import/import-workflow.sh" \
  "$N8N_ENV_FILE" \
  "$PROXY_ENV_FILE" \
  "$TMP_TEMPLATE"

rm -f "$TMP_TEMPLATE"
