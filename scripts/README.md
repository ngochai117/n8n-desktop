# Scripts Layout

Muc tieu: tach script theo domain de de quan ly khi so luong workflow tang.

## Cac nhom chinh

- `scripts/bootstrap/`
  - `bootstrap-local.sh`: cai dat local prerequisites (n8n-mcp, skills, .mcp.json docs-mode)
  - `verify-local.sh`: kiem tra local setup
  - `enable-full-mcp.sh`: bat full-mode mcp bang env n8n

- `scripts/proxy/`
  - `setup-proxy.sh`: setup local proxy runtime (hien tai: 9router) + verify API + import demo workflows (optional)

- `scripts/run/`
  - `run-n8n.sh`: chay n8n local (load env + `n8n start`)
  - `run-n8n-docker.sh`: chay n8n bang Docker (local container)
  - `run-cloudflared-tunnel.sh`: chay Cloudflared tunnel qua Docker

- `scripts/workflows/import/`
  - `import-all-workflows.sh`: wrapper import toan bo workflow, tu dong quet `import-*.sh` (bo qua `import-all-workflows.sh` va `import-workflow.sh`), uu tien thu tu `shared` -> `gemini` -> `openai` -> `book-review`, sau do chay cac wrapper moi theo alphabet
  - `import-workflow.sh`: import/upsert generic workflow template (core importer)
  - `import-gg-drive-manager-workflow.sh`: wrapper import workflow reusable `GG Drive Manager`
  - `import-gg-sheet-manager-workflow.sh`: wrapper import workflow reusable `GG Sheet Manager`
  - `import-gemini-demo-workflow.sh`: wrapper import workflow Gemini demo
  - `import-shared-notification-router-workflow.sh`: wrapper import workflow notify router da kenh dung chung
  - `import-openai-demo-workflow.sh`: wrapper import workflow OpenAI demo
  - `import-book-review-workflow.sh`: wrapper import 4 workflow (`text-to-images` -> `text-to-videos-veo3` -> `tts` -> `book-review`) + inject prompt templates cho `book-review` (render style kernel tu master prompt vao placeholder `__BOOK_REVIEW_STYLE_KERNEL__`)
  - `import-book-review-ai-agent-workflow.sh`: wrapper import workflow `Book Review AI Agent`

- `scripts/workflows/sync/`
  - `sync-workflows-from-n8n.sh`: sync workflow state tu n8n UI ve file JSON template + auto upsert registry + auto tao/cap nhat wrapper import; folder mapping uu tien DB n8n (`workflow_entity.parentFolderId`) va co dedupe wrapper theo ID/template

- `scripts/workflows/tests/`
  - `test-book-review-checklist.sh`: runner checklist automation
  - `test-book-review-checklist.mjs`: implementation test chi tiet
  - `run-book-review-e2e.sh`: e2e runner cho book-review (tu patch webhook test -> goi chat -> restore workflow goc)
  - `run-book-review-full-e2e.sh`: full e2e runner 3-step reviewer flow + verify session assets (Drive + Sheet)

## Lenh hay dung

```bash
bash scripts/bootstrap/bootstrap-local.sh
bash scripts/bootstrap/verify-local.sh
bash scripts/bootstrap/enable-full-mcp.sh

bash scripts/proxy/setup-proxy.sh

bash scripts/run/run-n8n.sh
bash scripts/run/run-n8n-docker.sh
bash scripts/run/run-cloudflared-tunnel.sh <your-token>

bash scripts/workflows/import/import-workflow.sh
bash scripts/workflows/import/import-all-workflows.sh
bash scripts/workflows/import/import-gg-drive-manager-workflow.sh
bash scripts/workflows/import/import-gg-sheet-manager-workflow.sh
bash scripts/workflows/import/import-gemini-demo-workflow.sh
bash scripts/workflows/import/import-shared-notification-router-workflow.sh
bash scripts/workflows/import/import-openai-demo-workflow.sh
bash scripts/workflows/import/import-book-review-workflow.sh
bash scripts/workflows/import/import-book-review-ai-agent-workflow.sh
# optional custom prompt template for book-review:
bash scripts/workflows/import/import-book-review-workflow.sh \
  env.n8n.local env.proxy.local \
  workflows/book-review/text-to-images.workflow.json \
  workflows/book-review/tts.workflow.json \
  workflows/book-review/book-review.workflow.json \
  workflows/book-review/prompts/book-review-scene-outline-prompt.txt \
  workflows/book-review/prompts/book-review-scene-expand-prompt.txt \
  workflows/book-review/prompts/book-review-metadata-prompt.txt \
  workflows/book-review/prompts/book-review-qc-prompt.txt \
  workflows/book-review/prompts/book-review-review-edit-prompt.txt
# optional override GG Drive manager workflow path for Execute Workflow nodes:
# GG_DRIVE_MANAGER_WORKFLOW_PATH=/abs/path/to/workflows/shared/gg-drive-manager.workflow.json \
#   bash scripts/workflows/import/import-book-review-workflow.sh
# optional override GG Sheet manager workflow path for Execute Workflow nodes:
# GG_SHEET_MANAGER_WORKFLOW_PATH=/abs/path/to/workflows/shared/gg-sheet-manager.workflow.json \
#   bash scripts/workflows/import/import-book-review-workflow.sh

bash scripts/workflows/sync/sync-workflows-from-n8n.sh
bash scripts/workflows/sync/sync-workflows-from-n8n.sh --apply
bash scripts/workflows/sync/sync-workflows-from-n8n.sh --id eKVjShNKmbjf4T8a --apply
bash scripts/workflows/sync/sync-workflows-from-n8n.sh --id eKVjShNKmbjf4T8a --id x62qzfGcBeqrfueM --apply
bash scripts/workflows/sync/sync-workflows-from-n8n.sh --id eKVjShNKmbjf4T8a,x62qzfGcBeqrfueM --apply
bash scripts/workflows/sync/sync-workflows-from-n8n.sh --allow-folder-fallback --apply

bash scripts/workflows/tests/test-book-review-checklist.sh
bash scripts/workflows/tests/run-book-review-e2e.sh
bash scripts/workflows/tests/run-book-review-full-e2e.sh
```
