# n8n Local + MCP + Skills + CLIProxyAPI OAuth

Muc tieu cua project: chay n8n local, dung MCP + skills de build workflow, va tich hop CLIProxyAPI de goi Gemini/Codex qua OAuth auth (khong dung provider API key truc tiep).

## Living Document Rule
- Moi thay doi script, cau hinh, quy trinh van hanh: bat buoc cap nhat file nay.
- Moi thay doi quan trong: ghi vao `CHANGELOG.md` de theo doi lich su.

## Git hygiene
- Local-only files khong commit: `.mcp.json`, `env.*.local`, `.vendor/`, `.DS_Store`, editor temp files.
- Dung `env.n8n.local.example` va `env.cliproxy.local.example` lam mau de tao env local tren tung may.
- `workflow-registry.json`, scripts, workflows, docs va file `.example` la thanh phan cua repo va nen duoc version control.

## Sub-agent playbook
- Khi task la `feature work`, uu tien 1 main agent giu critical path va toi da 3 sub-agent song song:
  - 1 `explorer` de map impact + rules bat buoc.
  - 1 `worker` cho shell/import/sync/bootstrap neu co automation change.
  - 1 `worker` cho checklist/test harness hoac verification path.
- Khong chia 2 worker cung sua 1 workflow JSON lon neu ownership chua duoc khoa ro; main agent nen giu phan workflow integration neu do la tam diem cua task.
- Playbook day du, prompt mau va checklist spawn nam trong `RULES_AND_SKILLS.md` (Skill H).

## Quick Start
1. Bootstrap n8n + n8n-mcp + n8n-skills:
```bash
bash scripts/bootstrap/bootstrap-local.sh
```
2. Bat n8n local:
```bash
n8n
```
Neu muon bat Telegram notify trong workflow notify dung chung, chay n8n voi env da source:
```bash
set -a
source env.cliproxy.local
set +a
n8n
```
3. Mo UI:
```text
http://localhost:5678
```
4. Verify local stack:
```bash
bash scripts/bootstrap/verify-local.sh
```

## n8n API setup (cho MCP)
1. Tao API key trong n8n UI:
`Settings -> n8n API -> Create an API key`
2. Dien vao `env.n8n.local`.
3. Bat full MCP mode:
```bash
bash scripts/bootstrap/enable-full-mcp.sh
bash scripts/bootstrap/verify-local.sh
```

## CLIProxyAPI OAuth setup (Gemini + Codex)
### Env contract
Su dung file `env.cliproxy.local` (neu chua co, script se tu tao):
- `CLIPROXY_BASE_URL` (mac dinh: `http://127.0.0.1:8317`)
- `CLIPROXY_CLIENT_KEY` (client key de n8n goi proxy)
- `CLIPROXY_MANAGEMENT_KEY` (key dang nhap trang management)
- `CLIPROXY_GOOGLE_PROJECT_ID` (optional; neu de trong, login Gemini se cho phep chon trong luong OAuth)
- `TELEGRAM_BOT_TOKEN` (optional; dung cho workflow notify Telegram)
- `TELEGRAM_CHAT_ID` (optional; chat/user/group ID de nhan notify)
- `GGCHAT_WEBHOOK_URL` (optional; incoming webhook URL cho Google Chat)

Mau file: `env.cliproxy.local.example`

### One-command setup + pause OAuth
```bash
bash scripts/cliproxy/setup-cliproxy-oauth.sh
```
Script se:
- Kiem tra `brew`, `curl`, `jq`, `n8n`
- Cai `cliproxyapi` qua Homebrew neu chua co
- Sync config local-only vao `~/.cli-proxy-api/config.yaml`
- Tu dong tao/luu `CLIPROXY_MANAGEMENT_KEY` trong env neu chua co
- Chay Gemini OAuth (`--login`) + Codex OAuth (`--codex-login`) voi pause
- Start `brew services cliproxyapi`
- Verify:
  - `GET /v1/models`
  - `POST /v1/chat/completions`
  - test unauthorized khi thieu auth header
- Tu dong import workflow demo Gemini + OpenAI vao n8n (neu co `env.n8n.local`)

### Optional flags
```bash
bash scripts/cliproxy/setup-cliproxy-oauth.sh --skip-oauth
bash scripts/cliproxy/setup-cliproxy-oauth.sh --skip-workflow-import
bash scripts/cliproxy/setup-cliproxy-oauth.sh --env-file /path/to/env.file
```

## Quan ly CLIProxy qua Web UI
Management Center:
```text
http://127.0.0.1:8317/management.html#/login
```

Dang nhap:
- `Current URL`: `http://127.0.0.1:8317`
- `Management Key`: lay tu `env.cliproxy.local` (bien `CLIPROXY_MANAGEMENT_KEY`)

Neu quen key:
- Key plain-text de xem lai nam trong file env (`env.cliproxy.local`), khong nam trong `~/.cli-proxy-api/config.yaml` vi server co the hash key sau khi start.
- Co the rotate key bang cach sua `CLIPROXY_MANAGEMENT_KEY` trong env roi chay lai:
```bash
bash scripts/cliproxy/setup-cliproxy-oauth.sh --skip-oauth --skip-workflow-import
```

Them account Gemini/Codex/khac:
- Vao menu `OAuth Login` trong Management Center.
- Chon provider va login them account moi.
- Quay lai `Auth Files` de refresh va bat/tat account theo nhu cau.

Mac dinh uu tien model moi nhat:
- Gemini demo: `gemini-3-flash-preview`
- Book review fallback model: `gemini-2.5-pro` (tu dong fallback neu model chinh gap capacity 429)
- OpenAI demo: `gpt-5.4`

## Xem model nhanh (command line)
Liet ke toan bo model:
```bash
source env.cliproxy.local
curl -sS -H "Authorization: Bearer $CLIPROXY_CLIENT_KEY" "$CLIPROXY_BASE_URL/v1/models" | jq -r '.data[].id' | sort
```

Chi xem model Gemini:
```bash
source env.cliproxy.local
curl -sS -H "Authorization: Bearer $CLIPROXY_CLIENT_KEY" "$CLIPROXY_BASE_URL/v1/models" | jq -r '.data[].id' | rg '^gemini' | sort
```

Chi xem model OpenAI:
```bash
source env.cliproxy.local
curl -sS -H "Authorization: Bearer $CLIPROXY_CLIENT_KEY" "$CLIPROXY_BASE_URL/v1/models" | jq -r '.data[].id' | rg '^gpt' | sort
```

Fetch model moi nhat + goi y model moi nhat (khong vao menu):
```bash
source env.cliproxy.local
curl -sS -H "Authorization: Bearer $CLIPROXY_CLIENT_KEY" "$CLIPROXY_BASE_URL/v1/models" \
| jq -r '.data[].id' \
| awk '
  /^gemini/ {gem[++g]= $0}
  /^gpt/    {gpt[++o]= $0}
  END {
    print "Gemini models:";
    for (i=1;i<=g;i++) print "  " gem[i];
    print "OpenAI models:";
    for (i=1;i<=o;i++) print "  " gpt[i];
  }'
```

## Workflow demo Gemini + OpenAI + Book Review Chat
Template workflows:
- `workflows/shared/shared-notification-router.workflow.json`
- `workflows/demo/gemini-cliproxy-demo.workflow.json`
- `workflows/demo/openai-cliproxy-demo.workflow.json`
- `workflows/book-review/book-review-gemini.workflow.json`

Workflow folder structure:
```text
workflows/
  book-review/
    prompts/
      book-review-master-prompt.txt
      book-review-metadata-prompt.txt
      book-review-qc-prompt.txt
      book-review-review-edit-prompt.txt
    book-review-gemini.workflow.json
  demo/
    gemini-cliproxy-demo.workflow.json
    openai-cliproxy-demo.workflow.json
  shared/
    shared-notification-router.workflow.json
```

Pipeline:
- `Manual Trigger`
- `Set Config`
- `HTTP Request` -> `POST {CLIPROXY_BASE_URL}/v1/chat/completions`
- `Code` node extract text tu `choices[0].message.content`
- `Set Notify Targets` node de chon kenh notify theo workflow (`telegram`, `ggchat`, hoac ket hop CSV)
- `Code` node build notify payload dong (`status`, `summary`, `details`)
- `Execute Workflow` node goi workflow dung chung `Shared Notification Router`
- `Shared Notification Router` route notify theo `notify_targets`, ho tro Telegram + Google Chat

Book review chat pipeline:
- `When chat message received` (`Chat Trigger`)
- `Set Config` (model/fallback_model/base url/client key/max turns/user input va cac prompt template: master/metadata/qc/review-edit)
- `Code` node goi Gemini theo vong lap, auto gui `"Continue"` khi gap control tag `-CONTINUE-` (line marker)
- `Parse Review Sections` noi thang sang `Set Notify Targets`; bo node pass-through `AI QC + Internal Scoring` de giam do phuc tap topology.
- Chunk cuoi duoc dong bo theo control tag `-END-`; chunk trung gian se cat bo phan tu marker tro ve sau
- Neu gap `429` capacity o model chinh, node tu dong fallback sang model du phong
- Tra output cuoi cung qua field `message` (response mode `lastNode`)
- Master prompt duoc tach rieng tai: `workflows/book-review/prompts/book-review-master-prompt.txt` (placeholder `{{USER_INPUT}}`)
- Metadata prompt duoc tach rieng tai: `workflows/book-review/prompts/book-review-metadata-prompt.txt`
- QC prompt duoc tach rieng tai: `workflows/book-review/prompts/book-review-qc-prompt.txt`
- Review-edit prompt duoc tach rieng tai: `workflows/book-review/prompts/book-review-review-edit-prompt.txt`
- Cuoi workflow co `Set Notify Targets` + build payload + goi `Shared Notification Router` cho ca success/failed

Quy tac import/update:
- Script import da la **UPSERT**:
  - Co workflow ID trong `workflow-registry.json` (match theo `name` hoac `template`) -> `PUT` update theo ID
  - Neu ID dang tro vao workflow da `archived`/khong con ton tai -> bo qua ID cu
  - Khong co ID hop le nhung tim thay theo `name` (chi lay workflow chua archived) -> `PUT` update theo ID tim duoc
  - Khong tim thay -> `POST` tao moi

Sync tu UI ve JSON template (khuyen nghi truoc khi nho AI sua workflow):
```bash
# Preview thay doi, khong ghi file
bash scripts/workflows/sync/sync-workflows-from-n8n.sh

# Ghi file template tu state hien tai tren n8n UI
bash scripts/workflows/sync/sync-workflows-from-n8n.sh --apply

# Chi sync 1 workflow theo ten
bash scripts/workflows/sync/sync-workflows-from-n8n.sh --name "Demo Gemini via CLIProxyAPI" --apply

# Apply nhung khong ghi changelog
bash scripts/workflows/sync/sync-workflows-from-n8n.sh --apply --no-log
```
- Script se sanitize truong nhay cam (`cliproxy_base_url`, `cliproxy_client_key`) va `Notify via Shared Workflow.workflowPath` ve placeholder truoc khi ghi file.
- `workflow-registry.json` nen luu `template` dang duong dan tuong doi (vi du: `workflows/book-review/book-review-gemini.workflow.json`) de tranh vo path khi doi ten folder project.
- Khi chay `--apply` (mac dinh), script se auto append log vao `CHANGELOG.md`.

Import thu cong neu can:
```bash
bash scripts/workflows/import/import-workflow.sh
bash scripts/workflows/import/import-shared-notification-router-workflow.sh
bash scripts/workflows/import/import-gemini-demo-workflow.sh
bash scripts/workflows/import/import-openai-demo-workflow.sh
bash scripts/workflows/import/import-book-review-workflow.sh
# or custom prompt files:
bash scripts/workflows/import/import-book-review-workflow.sh \
  env.n8n.local env.cliproxy.local workflows/book-review/book-review-gemini.workflow.json \
  workflows/book-review/prompts/book-review-master-prompt.txt \
  workflows/book-review/prompts/book-review-metadata-prompt.txt \
  workflows/book-review/prompts/book-review-qc-prompt.txt \
  workflows/book-review/prompts/book-review-review-edit-prompt.txt
```

Automation checklist test (book review workflow):
```bash
bash scripts/workflows/tests/test-book-review-checklist.sh
```
- Chay full checklist automation: one-shot, multi-turn "Continue", marker inline khong trigger, max-turns, API error, fallback model.

E2E nhanh cho book review (khong can tu tim webhook path):
```bash
bash scripts/workflows/tests/run-book-review-e2e.sh
# custom message:
bash scripts/workflows/tests/run-book-review-e2e.sh env.n8n.local env.cliproxy.local "Sách Đắc Nhân Tâm của Dale Carnegie"
```
- Script se tu patch workflow sang webhook test (`book-review-e2e-codex/chat`), goi 1 message, in execution summary, sau do restore workflow ve template goc.

## Cac file quan trong
- `plan.md`: kien truc va roadmap
- `AGENTS.md`: entrypoint chuan cho AI agents
- `AGENT_RULES_GLOBAL.md`: rules dung chung (global)
- `AGENT_RULES_PROJECT.md`: rules rieng cua project
- `RULES_AND_SKILLS.md`: operational playbooks/skills (gom ca sub-agent delegation playbook cho feature work)
- `CHANGELOG.md`: changelog chi tiet (tu dong append khi sync workflow --apply)
- `.mcp.json`: config MCP project-level
- `env.n8n.local.example`: mau env n8n
- `env.cliproxy.local.example`: mau env cliproxy
- `workflow-registry.json`: registry workflow (id, name, template, last sync) de upsert theo ID
- `configs/cliproxy.config.template.yaml`: template config cliproxy
- `scripts/README.md`: so do phan cap scripts + lenh thong dung
- `scripts/cliproxy/setup-cliproxy-oauth.sh`: setup A-Z cho cliproxy oauth
- `scripts/workflows/import/import-workflow.sh`: core importer upsert workflow template vao n8n
- `scripts/workflows/import/import-gemini-demo-workflow.sh`: wrapper import workflow Gemini demo vao n8n
- `scripts/workflows/import/import-shared-notification-router-workflow.sh`: import workflow notify router da kenh dung chung
- `scripts/workflows/import/import-openai-demo-workflow.sh`: import workflow OpenAI demo vao n8n
- `scripts/workflows/import/import-book-review-workflow.sh`: import workflow review sach chat vao n8n
- `scripts/workflows/sync/sync-workflows-from-n8n.sh`: sync workflow state tu n8n UI ve JSON templates (preview/apply)
- `scripts/workflows/tests/test-book-review-checklist.sh`: chay full automation checklist cho workflow review sach
- `scripts/workflows/tests/test-book-review-checklist.mjs`: test runner chi tiet cho checklist automation
- `scripts/workflows/tests/run-book-review-e2e.sh`: e2e runner book review (patch test webhook -> run -> auto restore)
- `workflows/demo/gemini-cliproxy-demo.workflow.json`: workflow demo template
- `workflows/demo/openai-cliproxy-demo.workflow.json`: workflow OpenAI demo template
- `workflows/book-review/book-review-gemini.workflow.json`: workflow review sach qua chat + auto "Continue"
- `workflows/shared/shared-notification-router.workflow.json`: workflow notify router da kenh (telegram/ggchat)
- `workflows/book-review/prompts/book-review-master-prompt.txt`: master prompt nguon de edit de dang
- `workflows/book-review/prompts/book-review-metadata-prompt.txt`: metadata prompt nguon de edit title/caption/thumbnail/hashtags
- `workflows/book-review/prompts/book-review-qc-prompt.txt`: prompt QC danh gia noi dung/diem/rui ro
- `workflows/book-review/prompts/book-review-review-edit-prompt.txt`: prompt revise ban review theo instruction reviewer

## Troubleshooting nhanh
- `cliproxyapi` chua len service:
  - `brew services list | rg cliproxyapi`
  - `brew services restart cliproxyapi`
- `v1/models` bi 401/403:
  - Kiem tra `Authorization: Bearer <CLIPROXY_CLIENT_KEY>`
  - Kiem tra key trong `~/.cli-proxy-api/config.yaml`
- Chat test fail sau setup:
  - Chay lai setup va hoan tat browser OAuth cho ca Gemini + Codex
- n8n import workflow fail:
  - Kiem tra `env.n8n.local` co `N8N_API_URL` + `N8N_API_KEY`
