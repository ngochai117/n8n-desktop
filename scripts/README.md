# Scripts Layout

Muc tieu: tach script theo domain de de quan ly khi so luong workflow tang.

## Cac nhom chinh

- `scripts/bootstrap/`
  - `bootstrap-local.sh`: cai dat local prerequisites (n8n-mcp, skills, .mcp.json docs-mode)
  - `verify-local.sh`: kiem tra local setup
  - `enable-full-mcp.sh`: bat full-mode mcp bang env n8n

- `scripts/cliproxy/`
  - `setup-cliproxy-oauth.sh`: setup OAuth + verify CLIProxy + import demo workflows (optional)

- `scripts/workflows/import/`
  - `import-workflow.sh`: import/upsert generic workflow template (core importer)
  - `import-gemini-demo-workflow.sh`: wrapper import workflow Gemini demo
  - `import-shared-notification-router-workflow.sh`: wrapper import workflow notify router da kenh dung chung
  - `import-openai-demo-workflow.sh`: wrapper import workflow OpenAI demo
  - `import-book-review-workflow.sh`: wrapper import workflow book review + inject master prompt tu file prompt template

- `scripts/workflows/sync/`
  - `sync-workflows-from-n8n.sh`: sync workflow state tu n8n UI ve file JSON template

- `scripts/workflows/tests/`
  - `test-book-review-checklist.sh`: runner checklist automation
  - `test-book-review-checklist.mjs`: implementation test chi tiet

## Lenh hay dung

```bash
bash scripts/bootstrap/bootstrap-local.sh
bash scripts/bootstrap/verify-local.sh
bash scripts/bootstrap/enable-full-mcp.sh

bash scripts/cliproxy/setup-cliproxy-oauth.sh

bash scripts/workflows/import/import-workflow.sh
bash scripts/workflows/import/import-gemini-demo-workflow.sh
bash scripts/workflows/import/import-shared-notification-router-workflow.sh
bash scripts/workflows/import/import-openai-demo-workflow.sh
bash scripts/workflows/import/import-book-review-workflow.sh
# optional custom prompt template for book-review:
bash scripts/workflows/import/import-book-review-workflow.sh \
  env.n8n.local env.cliproxy.local workflows/book-review-gemini.workflow.json \
  workflows/prompts/book-review-master-prompt.txt

bash scripts/workflows/sync/sync-workflows-from-n8n.sh
bash scripts/workflows/sync/sync-workflows-from-n8n.sh --apply

bash scripts/workflows/tests/test-book-review-checklist.sh
```
