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
1. Chay n8n local:
```bash
bash scripts/run/run-n8n.sh
```
2. Chay n8n bang Docker (tach rieng):
```bash
bash scripts/run/run-n8n-docker.sh
```
3. Chay Cloudflared tunnel (qua Docker):
```bash
bash scripts/run/run-cloudflared-tunnel.sh <your-token>
```
4. Mo UI:
```text
http://localhost:5678
```
5. Verify local stack:
```bash
bash scripts/bootstrap/verify-local.sh
```

### Script n8n local
- Script nay giu dung flow gon: load env -> chay `n8n start`.
- Co the truyen tham so n8n truc tiep:
```bash
bash scripts/run/run-n8n.sh --tunnel
```

### Script n8n docker
- Script nay chi chay 1 lenh docker n8n local (khong gom flow build/deploy).
- Dung truc tiep:
```bash
bash scripts/run/run-n8n-docker.sh
```

### Script cloudflared
- Dung dung command cloudflared qua docker nhu ban dang dung:
```bash
bash scripts/run/run-cloudflared-tunnel.sh <token>
```
- Neu da dat `CLOUDFLARED_TUNNEL_TOKEN` trong `env.n8n.local` thi khong can truyen token tren command line.

## n8n API setup (cho MCP)
1. Tao API key trong n8n UI:
`Settings -> n8n API -> Create an API key`
2. Dien vao `env.n8n.local`:
   - `N8N_API_URL`
   - `N8N_API_KEY`
   - `WEBHOOK_URL` (public HTTPS URL, vi du `https://n8n.shadow-lord.online`)
   - `N8N_EDITOR_BASE_URL` (URL mo UI editor; co the trung domain voi `WEBHOOK_URL`, va co the dung `http` neu ban truy cap local qua Cloudflare edge)
   - `CLOUDFLARED_TUNNEL_TOKEN` (optional; dung cho script `run-cloudflared-tunnel.sh`)
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
- Kien truc da duoc gom lai 1 workflow event-driven de de theo doi trong n8n UI:
  - `book-review-gemini.workflow.json` gom ca 3 nhanh:
    - Main chat: generate full review + parse + persist session + tra ACK async ngay.
    - Router: nhan Telegram callback/message + scheduler timeout 1 phut, chuan hoa command thanh event.
    - Worker: xu ly event review/metadata/finalize, cap nhat session state, gui preview/final qua Telegram.
- Main chat trigger tra `message_ack + session_token + reviewer_stage=review_pending` (khong block cho den khi reviewer xong).
- Callback data router su dung format ngan <=64 bytes: `brv:rvw:c:<token>`, `brv:rvw:x:<token>`, `brv:meta:c:<token>`, ...
- Policy no-reply theo deadline: scheduler path tu dong dispatch `auto_continue_review` hoac `auto_continue_metadata`.
- Notify hub cho workflow review sach da chuan hoa theo pattern:
  - Parse thong diep bat dau: `Bắt đầu review: {{user_input}}`.
  - Moi payload thong bao (main/router/worker/start-message) deu dua vao mang `send_informations`.
  - `Send Informations` (`Split Out`) se split theo `send_informations` va giu full data (`include=allOtherFields`).
  - `Set Notify Targets (Main)` duoc dat ngay truoc `Notify via Shared Workflow (Main)` va la diem set target notify duy nhat.
- Luong revise review trong worker giu full context (`master prompt da inject user_input + review text + reviewer instruction`) va co fallback clipping khi gap loi input/context limit.
- Master prompt duoc tach rieng tai: `workflows/book-review/prompts/book-review-master-prompt.txt` (placeholder `{{USER_INPUT}}`)
- Metadata prompt duoc tach rieng tai: `workflows/book-review/prompts/book-review-metadata-prompt.txt`
- QC prompt duoc tach rieng tai: `workflows/book-review/prompts/book-review-qc-prompt.txt`
- Review-edit prompt duoc tach rieng tai: `workflows/book-review/prompts/book-review-review-edit-prompt.txt`
- Workflow hop nhat ket thuc moi nhanh bang notify hub: `build payload -> Send Informations -> Set Notify Targets (Main) -> Shared Notification Router`, dong thoi tra chat response tu hub cung du lieu.

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
- Script se sanitize truong nhay cam (`cliproxy_base_url`, `cliproxy_client_key`, `n8n_api_url`, `n8n_api_key`) va workflow path placeholders (`Notify via Shared Workflow`) truoc khi ghi file.
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
  env.n8n.local env.cliproxy.local \
  workflows/book-review/book-review-gemini.workflow.json \
  workflows/book-review/prompts/book-review-master-prompt.txt \
  workflows/book-review/prompts/book-review-metadata-prompt.txt \
  workflows/book-review/prompts/book-review-qc-prompt.txt \
  workflows/book-review/prompts/book-review-review-edit-prompt.txt
```

Automation checklist test (book review workflow):
```bash
bash scripts/workflows/tests/test-book-review-checklist.sh
```
- Chay checklist topology + contract event-driven trong workflow hop nhat, bao gom async ACK, router callback/scheduler, worker event contract, va regression generate/parse.

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
- `scripts/workflows/import/import-book-review-workflow.sh`: import workflow book review hop nhat vao n8n
- `scripts/workflows/sync/sync-workflows-from-n8n.sh`: sync workflow state tu n8n UI ve JSON templates (preview/apply)
- `scripts/workflows/tests/test-book-review-checklist.sh`: chay full automation checklist cho workflow review sach
- `scripts/workflows/tests/test-book-review-checklist.mjs`: test runner chi tiet cho checklist automation
- `scripts/workflows/tests/run-book-review-e2e.sh`: e2e runner book review (patch test webhook -> run -> auto restore)
- `workflows/demo/gemini-cliproxy-demo.workflow.json`: workflow demo template
- `workflows/demo/openai-cliproxy-demo.workflow.json`: workflow OpenAI demo template
- `workflows/book-review/book-review-gemini.workflow.json`: workflow review sach hop nhat (main + router + worker trong cung 1 file)
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
