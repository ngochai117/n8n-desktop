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
  - `import-workflow.sh`: import/upsert generic workflow template (core importer)
  - `import-gemini-demo-workflow.sh`: wrapper import workflow Gemini demo
  - `import-shared-notification-router-workflow.sh`: wrapper import workflow notify router da kenh dung chung
  - `import-openai-demo-workflow.sh`: wrapper import workflow OpenAI demo
  - `import-book-review-workflow.sh`: wrapper import 3 workflow (`text-to-images` -> `tts` -> `book-review`) + inject prompt templates cho `book-review`

- `scripts/workflows/sync/`
  - `sync-workflows-from-n8n.sh`: sync workflow state tu n8n UI ve file JSON template

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
bash scripts/workflows/import/import-gemini-demo-workflow.sh
bash scripts/workflows/import/import-shared-notification-router-workflow.sh
bash scripts/workflows/import/import-openai-demo-workflow.sh
bash scripts/workflows/import/import-book-review-workflow.sh
# optional custom prompt template for book-review:
bash scripts/workflows/import/import-book-review-workflow.sh \
  env.n8n.local env.proxy.local \
  workflows/book-review/text-to-images.workflow.json \
  workflows/book-review/tts.workflow.json \
  workflows/book-review/book-review.workflow.json \
  workflows/book-review/prompts/book-review-master-prompt.txt \
  workflows/book-review/prompts/book-review-metadata-prompt.txt \
  workflows/book-review/prompts/book-review-qc-prompt.txt \
  workflows/book-review/prompts/book-review-review-edit-prompt.txt

bash scripts/workflows/sync/sync-workflows-from-n8n.sh
bash scripts/workflows/sync/sync-workflows-from-n8n.sh --apply

bash scripts/workflows/tests/test-book-review-checklist.sh
bash scripts/workflows/tests/run-book-review-e2e.sh
bash scripts/workflows/tests/run-book-review-full-e2e.sh
```
