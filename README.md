# n8n Local + MCP + Skills + CLIProxyAPI OAuth

Muc tieu cua project: chay n8n local, dung MCP + skills de build workflow, va tich hop CLIProxyAPI de goi Gemini/Codex qua OAuth auth (khong dung provider API key truc tiep).

## Living Document Rule
- Moi thay doi script, cau hinh, quy trinh van hanh: bat buoc cap nhat file nay.
- Sau moi lan cap nhat: them 1 dong vao `Update Log` (ngay, thay doi, ly do ngan).

## Git hygiene
- Local-only files khong commit: `.mcp.json`, `env.*.local`, `.vendor/`, `.DS_Store`, editor temp files.
- Dung `env.n8n.local.example` va `env.cliproxy.local.example` lam mau de tao env local tren tung may.
- `workflow-registry.json`, scripts, workflows, docs va file `.example` la thanh phan cua repo va nen duoc version control.

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
- `workflows/shared-notification-router.workflow.json`
- `workflows/gemini-cliproxy-demo.workflow.json`
- `workflows/openai-cliproxy-demo.workflow.json`
- `workflows/book-review-gemini.workflow.json`

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
- `Set Config` (model/fallback_model/base url/client key/max turns/user input/master prompt template)
- `Code` node goi Gemini theo vong lap, auto gui `"Continue"` khi gap control tag `-CONTINUE-` (line marker)
- Chunk cuoi duoc dong bo theo control tag `-END-`; chunk trung gian se cat bo phan tu marker tro ve sau
- Neu gap `429` capacity o model chinh, node tu dong fallback sang model du phong
- Tra output cuoi cung qua field `message` (response mode `lastNode`)
- Master prompt duoc tach rieng tai: `workflows/prompts/book-review-master-prompt.txt` (placeholder `{{USER_INPUT}}`)
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

# Apply nhung khong ghi changelog/readme
bash scripts/workflows/sync/sync-workflows-from-n8n.sh --apply --no-log
```
- Script se sanitize truong nhay cam (`cliproxy_base_url`, `cliproxy_client_key`) ve placeholder truoc khi ghi file.
- Khi chay `--apply` (mac dinh), script se auto append log vao `CHANGELOG.md` va `README.md > Update Log`.

Import thu cong neu can:
```bash
bash scripts/workflows/import/import-shared-notification-router-workflow.sh
bash scripts/workflows/import/import-gemini-demo-workflow.sh
bash scripts/workflows/import/import-openai-demo-workflow.sh
bash scripts/workflows/import/import-book-review-workflow.sh
# or custom prompt file:
bash scripts/workflows/import/import-book-review-workflow.sh \
  env.n8n.local env.cliproxy.local workflows/book-review-gemini.workflow.json \
  workflows/prompts/book-review-master-prompt.txt
```

Automation checklist test (book review workflow):
```bash
bash scripts/workflows/tests/test-book-review-checklist.sh
```
- Chay full checklist automation: one-shot, multi-turn "Continue", marker inline khong trigger, max-turns, API error, fallback model.

## Cac file quan trong
- `plan.md`: kien truc va roadmap
- `AGENTS.md`: entrypoint chuan cho AI agents
- `AGENT_RULES_GLOBAL.md`: rules dung chung (global)
- `AGENT_RULES_PROJECT.md`: rules rieng cua project
- `RULES_AND_SKILLS.md`: operational playbooks/skills
- `CHANGELOG.md`: changelog chi tiet (tu dong append khi sync workflow --apply)
- `.mcp.json`: config MCP project-level
- `env.n8n.local.example`: mau env n8n
- `env.cliproxy.local.example`: mau env cliproxy
- `workflow-registry.json`: registry workflow (id, name, template, last sync) de upsert theo ID
- `configs/cliproxy.config.template.yaml`: template config cliproxy
- `scripts/README.md`: so do phan cap scripts + lenh thong dung
- `scripts/cliproxy/setup-cliproxy-oauth.sh`: setup A-Z cho cliproxy oauth
- `scripts/workflows/import/import-gemini-demo-workflow.sh`: import workflow demo vao n8n
- `scripts/workflows/import/import-shared-notification-router-workflow.sh`: import workflow notify router da kenh dung chung
- `scripts/workflows/import/import-openai-demo-workflow.sh`: import workflow OpenAI demo vao n8n
- `scripts/workflows/import/import-book-review-workflow.sh`: import workflow review sach chat vao n8n
- `scripts/workflows/sync/sync-workflows-from-n8n.sh`: sync workflow state tu n8n UI ve JSON templates (preview/apply)
- `scripts/workflows/tests/test-book-review-checklist.sh`: chay full automation checklist cho workflow review sach
- `scripts/workflows/tests/test-book-review-checklist.mjs`: test runner chi tiet cho checklist automation
- `workflows/gemini-cliproxy-demo.workflow.json`: workflow demo template
- `workflows/openai-cliproxy-demo.workflow.json`: workflow OpenAI demo template
- `workflows/book-review-gemini.workflow.json`: workflow review sach qua chat + auto "Continue"
- `workflows/shared-notification-router.workflow.json`: workflow notify router da kenh (telegram/ggchat)
- `workflows/prompts/book-review-master-prompt.txt`: master prompt nguon de edit de dang

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

## Update Log
- 2026-03-24: Khoi tao README living doc + bo script bootstrap/verify/full-mode + plan.md. Ly do: trien khai setup n8n local + MCP + skills tu dau.
- 2026-03-25: Them CLIProxyAPI OAuth stack (Gemini + Codex), script setup A-Z + workflow demo Gemini + import script. Ly do: dung auth flow thay provider API key va tao demo workflow su dung Gemini.
- 2026-03-25: Them workflow demo OpenAI qua CLIProxyAPI + script import rieng, va setup script import ca Gemini/OpenAI. Ly do: can demo tuong tu cho luong OpenAI.
- 2026-03-25: Nang cap default model demo len `gemini-3.1-pro-preview` va `gpt-5.4`; bo sung cach tra cuu model. Ly do: uu tien model moi nhat va de quan sat list model nhanh.
- 2026-03-25: Them huong dan nhanh xem model bang lenh CLI (all/gemini/openai). Ly do: tra cuu model nhanh khi can doi model workflow.
- 2026-03-25: Chuyen import workflow sang co che upsert theo ID + them `workflow-registry.json` + bo tai lieu `RULES_AND_SKILLS.md`. Ly do: tranh tao trung workflow va chuan hoa quy tac van hanh.
- 2026-03-25: Hardening import workflow upsert (skip archived ID, fallback tim ID theo template/name, xu ly API response an toan). Ly do: dam bao update dung workflow va khong tao trung khi chay lap.
- 2026-03-25: Bo sung playbook root `RULES_AND_SKILLS.md` voi safety rules (storage cleanup + git cleanup an toan). Ly do: chuan hoa van hanh khi mo rong repo va tranh thao tac pha huy.
- 2026-03-25: Chuan hoa tai lieu cho AI agents: them `AGENTS.md`, tach rules thanh `AGENT_RULES_GLOBAL.md` va `AGENT_RULES_PROJECT.md`, giu `RULES_AND_SKILLS.md` cho playbooks. Ly do: tach ro rules chung/rieng va de maintain de hon.
- 2026-03-25: Them `.gitignore` cho local secrets/artifacts (`.mcp.json`, `env.*.local`, `.vendor/`, `.DS_Store`). Ly do: khoi tao Git repo sach, tranh commit secret va dependency/runtime files theo may.
- 2026-03-25: Them workflow `book-review-gemini` dung Chat Trigger + Code loop auto "Tiếp", kem script import rieng. Ly do: ho tro use case review sach dai va gom ket qua thanh 1 ban cuoi.
- 2026-03-25: Doi control tag cua workflow review sach sang `-CONTINUE-` / `-END-`, cap nhat parser de nhan marker theo line va cat bo noi dung nhac "Continue" sau marker. Ly do: tranh bi ket vong lap khi model khong dat marker o cuoi chunk.
- 2026-03-25: Them automation checklist script cho workflow review sach + bo sung rule bat buoc chay checklist bang automation script. Ly do: chuan hoa quy trinh test va tranh ket luan bang review tay.
- 2026-03-25: Chuyen quan ly account/model sang CLIProxy Management Center, loai bo bo script manager tren terminal, bo sung `CLIPROXY_MANAGEMENT_KEY` trong env. Ly do: dung UI native cua CLIProxy de don gian hoa van hanh.
- 2026-03-25: Them script sync workflow tu n8n UI ve JSON template (`preview/apply`) de tranh drift khi sua UI roi update bang JSON. Ly do: uu tien luong lam viec truc quan + an toan du lieu.
- 2026-03-25: Them `CHANGELOG.md` rieng va auto logging khi sync workflow (`--apply`) vao ca `CHANGELOG.md` + `README Update Log`. Ly do: theo doi thay doi de hon ma van giu README gon.
- 2026-03-25: Sync workflow templates tu n8n UI ve JSON (apply, changed=0, unchanged=3, failed=0). Chi tiet: `CHANGELOG.md`.
- 2026-03-25: Chuyen default Gemini sang `gemini-3-flash-preview` va them fallback `gemini-2.5-pro` cho workflow review sach khi gap capacity `429`. Ly do: giam loi `MODEL_CAPACITY_EXHAUSTED` tren model pro preview.
- 2026-03-25: Import script sanitize `settings` truoc khi upsert workflow (giu `callerPolicy`/`availableInMCP`) de tranh loi `request/body/settings must NOT have additional properties` sau khi sync tu UI. Ly do: tang do on dinh cho vong lap UI -> JSON -> import.
- 2026-03-25: Tai cau truc thu muc `scripts/` theo domain (`bootstrap`, `cliproxy`, `workflows/{import,sync,tests}`) va cap nhat toan bo references. Ly do: giam roi, de mo rong khi so workflow/script tang.
- 2026-03-25: Tach master prompt workflow book review ra file rieng (`workflows/prompts/book-review-master-prompt.txt`) va inject vao workflow luc import. Ly do: de edit prompt ma khong phai sua `jsCode` dai trong JSON.
- 2026-03-25: Them workflow notify dung chung `Shared Desktop Notify`, noi 3 workflow demo vao notify success/failed voi noi dung dong, va cap nhat importer de auto bind `workflowPath` cho node `Notify via Shared Workflow` (source `localFile`). Ly do: nhan noti tren may nhat quan ma khong can hard-code moi workflow.
- 2026-03-25: Doi ten script import notify sang `import-shared-desktop-notify-workflow.sh` va bo sung nhanh Telegram notify song song trong `Shared Desktop Notify` (auto-skip neu chua cau hinh token/chat). Ly do: dong bo naming va mo rong kenh thong bao.
- 2026-03-25: Refactor notify chung thanh `Shared Notification Router`, them routing theo `notify_targets` (desktop/telegram/ggchat) va them `Set Notify Targets` tren tung workflow de de tuy chinh kenh nhan. Ly do: de mo rong them kenh moi va tuy bien theo workflow ma khong sua logic notify trung tam.
- 2026-03-25: Xoa hoan toan notify desktop cu: loai bo alias import scripts cu, cap nhat rules/docs chi con `Shared Notification Router`, va xoa workflow cu tren n8n (`Shared Desktop Notify`). Ly do: tranh nham lan giua flow cu va router da kenh moi.
