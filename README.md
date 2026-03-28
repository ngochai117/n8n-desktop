# n8n Local + MCP + Skills + CLIProxyAPI OAuth

Muc tieu cua project: chay n8n local, dung MCP + skills de build workflow, va tich hop CLIProxyAPI de goi Gemini/Codex qua OAuth auth (khong dung provider API key truc tiep).

## Living Document Rule
- Moi thay doi script, cau hinh, quy trinh van hanh: bat buoc cap nhat file nay.
- Moi thay doi quan trong: ghi vao `CHANGELOG.md` de theo doi lich su.

## Git hygiene
- Local-only files khong commit: `.mcp.json`, `env.*.local`, `.vendor/`, `.DS_Store`, editor temp files.
- Dung `env.n8n.local.example` va `env.cliproxy.local.example` lam mau de tao env local tren tung may.
- `workflow-registry.json`, scripts, workflows, docs va file `.example` la thanh phan cua repo va nen duoc version control.

## Agent Environment Note
- Tren mot so may local, shell agent mac dinh khong load `nvm`, nen `command -v node` co the fail du Node.js van ton tai.
- Truoc khi ket luan thieu Node, luon verify bang shell interactive:
```bash
zsh -lic 'command -v node && node -v && npm -v'
```
- Khi chay script test `.mjs`, uu tien mode interactive:
```bash
zsh -lic 'bash scripts/workflows/tests/test-book-review-checklist.sh'
```
- Chi fallback sang patch `jq` + `apply_patch` neu ca shell interactive van khong tim thay `node`.

## Sub-agent playbook
- Roster chuan:
  - `Conductor` (main owner)
  - `Planner` (PM)
  - `FlowBuilder` (workflow)
  - `Builder` (code/script/docs)
  - `Runner` (ops/e2e)
  - `Gatekeeper` (QC)
- So do phoi hop nhanh:
```text
Conductor -> Planner -> (FlowBuilder + Builder) -> Runner -> Gatekeeper -> Conductor -> User
                                              (fail) <--------------------/
```
- Governance chi tiet + gate `G0..G4`: `AGENT_RULES_GLOBAL.md` (muc 6).
- Skill pack thuc thi: `RULES_AND_SKILLS.md` (Skill H).

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
- `IMAGE_API_BASE_URL` (optional; endpoint tao anh cho media branch book-review)
- `IMAGE_API_KEY` (optional; auth key cho image API)
- `TTS_API_BASE_URL` (optional; mac dinh `http://127.0.0.1:8001`)
- `TTS_VOICE_ID` (optional; mac dinh `ngochuyen`)
- `GDRIVE_ROOT_FOLDER_ID` (optional; root folder Google Drive cho media pipeline)
- `GDRIVE_CREDENTIAL_NAME` (optional; ten credential Google Drive trong n8n de mapping config)

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
- `workflows/book-review/book-review.workflow.json`
- `workflows/book-review/text-to-images.workflow.json`
- `workflows/book-review/tts.workflow.json`

Workflow folder structure:
```text
workflows/
  book-review/
    prompts/
      book-review-master-prompt.txt
      book-review-metadata-prompt.txt
      book-review-qc-prompt.txt
      book-review-review-edit-prompt.txt
    book-review.workflow.json
    text-to-images.workflow.json
    tts.workflow.json
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
- Kien truc tach thanh 3 workflow:
  - `book-review.workflow.json` (main): generate + parse + router + worker + merge media.
  - `text-to-images.workflow.json`: workflow reusable tao anh (Form Trigger + Drive URL + Execute Workflow Trigger).
  - `tts.workflow.json`: workflow reusable tao giọng doc (Form Trigger + Drive URL + Execute Workflow Trigger).
- Main flow (`book-review.workflow.json`) goi 2 subworkflow media qua `Execute Workflow`:
  - `Generate Image Assets (Worker)` -> `Text To Images`
  - `Generate TTS Assets (Worker)` -> `TTS`
- Main generate branch tra `message_ack + session_token + reviewer_stage=review_pending` (duoc kick-off tu Telegram command `book-review ...`).
- Callback data router su dung format ngan <=64 bytes: `brv:rvw:c:<token>`, `brv:rvw:x:<token>`, `brv:meta:c:<token>`, ...
- Khong con nhanh scheduler timeout; router xu ly truc tiep callback/message event.
- Notify hub cho workflow review sach da chuan hoa theo pattern:
  - Parse thong diep bat dau: `Bắt đầu review: {{user_input}}`.
  - Moi payload thong bao (main/router/worker/start-message) deu dua vao mang `send_informations`.
  - `Send Informations` (`Split Out`) se split theo `send_informations` va giu full data (`include=allOtherFields`).
  - `Set Notify Targets (Main)` duoc dat ngay truoc `Notify via Shared Workflow (Main)` va la diem set target notify duy nhat.
- Luong revise review trong worker giu full context (`master prompt da inject user_input + review text + reviewer instruction`) va khong fallback clipping.
- Truoc notify success (chi cho `metadata_continue`/`auto_continue_metadata`), worker chay media branch node-based theo nhanh ro rang:
  - `Process Media Assets (chunk+gate)` -> `Generate Image Assets (Worker)` + `Generate TTS Assets (Worker)` (goi subworkflow, parallel) -> `Merge Media Results` -> `Finalize Media Assets`.
  - `Process Media Assets` va `Finalize Media Assets` deu goi `Persist Media Debug` (2 checkpoint: `prepared` va `finalized`) de khong mat dau khi fail giua nhanh media.
  - `Route Final Persist To Notify` dung sau `Persist Media Debug` de chi cho checkpoint `finalized` di tiep sang `Build Notify Payload` (tranh notify duplicate tu checkpoint som).
  - `Process Media Assets` tach review thanh chunk 3 cau va gate theo event final-success truoc khi fan-out.
  - `Generate Image Assets` + `Generate TTS Assets` chay song song theo tung chunk, sau do duoc merge deterministic theo `chunk_key`.
  - `Finalize Media Assets` tong hop output vao `media_assets`/`media_pipeline_status`, dong thoi gan `media_finished_at` + `media_elapsed_seconds`; neu thieu config hoac loi API thi soft-fail de khong chan luong chinh.
  - `Persist Media Debug` mac dinh `enabled`; luu log quan trong vao Data Table (`media_debug_store_name`, default `book_review_media_debug`) de truy vet execution that bai/sai data.
  - Mac dinh runtime media da tang cho workload dai: `image_timeout_ms=900000`, `tts_timeout_ms=900000`, `image_parallelism=2`, `tts_parallelism=2` (van co clamp `1..5`).
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
- Script se sanitize truong nhay cam (`cliproxy_base_url`, `cliproxy_client_key`, `n8n_api_url`, `n8n_api_key`, `image_api_key`, `gdrive_root_folder_id`, `gdrive_credential_name`) va workflow placeholders (`Notify via Shared Workflow`, `text_to_images_workflow_id`, `tts_workflow_id`) truoc khi ghi file.
- `workflow-registry.json` nen luu `template` dang duong dan tuong doi (vi du: `workflows/book-review/book-review.workflow.json`) de tranh vo path khi doi ten folder project.
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
  workflows/book-review/text-to-images.workflow.json \
  workflows/book-review/tts.workflow.json \
  workflows/book-review/book-review.workflow.json \
  workflows/book-review/prompts/book-review-master-prompt.txt \
  workflows/book-review/prompts/book-review-metadata-prompt.txt \
  workflows/book-review/prompts/book-review-qc-prompt.txt \
  workflows/book-review/prompts/book-review-review-edit-prompt.txt
```

Automation checklist test (book review workflow):
```bash
bash scripts/workflows/tests/test-book-review-checklist.sh
```
- Chay checklist topology + contract cho 3 workflow (`book-review`, `text-to-images`, `tts`), bao gom regression generate/parse + media merge.

E2E nhanh cho book review (khong can tu tim webhook path):
```bash
bash scripts/workflows/tests/run-book-review-e2e.sh
# custom message:
bash scripts/workflows/tests/run-book-review-e2e.sh env.n8n.local env.cliproxy.local "Sách Đắc Nhân Tâm của Dale Carnegie"
```
- Script se tu patch `Telegram Trigger` sang webhook test (`book-review-e2e-codex/webhook`), simulate Telegram update (co secret header), in execution summary, sau do restore workflow ve template goc.
- Script in them `payload_update_id` va mac dinh chi chap nhan execution co `update_id` khop payload vua gui (tranh bat nham execution cu).
- Neu can fallback sang behavior cu khi debug nhanh: `BOOK_REVIEW_E2E_STRICT_UPDATE_ID=false bash scripts/workflows/tests/run-book-review-e2e.sh`.

Full E2E cho book review (start -> review_continue -> metadata_continue + check session assets):
```bash
bash scripts/workflows/tests/run-book-review-full-e2e.sh
# custom message:
bash scripts/workflows/tests/run-book-review-full-e2e.sh env.n8n.local env.cliproxy.local "Sách Đắc Nhân Tâm của Dale Carnegie"
```
- Script se patch webhook test, goi du 3 buoc reviewer event, verify `media_pipeline_status`, va check link session assets (folder, files, sheet), sau do auto restore workflow template.
- Neu `session_sheet_url` rong va node `Create Session Sheet (Worker)` tra loi `>=400`, script se fail voi thong diep chi tiet tu Google API.
- Dieu kien bat buoc de pass full E2E co session sheet: trong Google Cloud project cua OAuth credential phai bat `Google Sheets API` (`sheets.googleapis.com`).
- Checklist preflight + cac issue runtime chung: `docs/testing-runtime-incidents.md`.

Kiem tra chat luong data media tren execution gan nhat (khong doan):
```bash
bash scripts/workflows/tests/check-book-review-media-output.sh
# override execution id:
bash scripts/workflows/tests/check-book-review-media-output.sh env.n8n.local 744
# chi lay execution final-success co media branch chay that:
BOOK_REVIEW_MEDIA_FINAL_ONLY=true bash scripts/workflows/tests/check-book-review-media-output.sh
```
- Script in ro `media_pipeline_status`, so luong `media_assets`, thong ke generated/failed/skipped, check schema contract, va top `error_reason`.
- Neu `env.n8n.local` co `N8N_EDITOR_BASE_URL`, script se in `execution_ui_url` de mo thang execution tren UI.
- `BOOK_REVIEW_MEDIA_FINAL_ONLY=true` chi lay execution final-success theo pipeline media moi (`Persist Media Debug` co checkpoint `prepared/finalized`); neu chua co execution phu hop script se bao loi de tranh nham voi execution cu.
- Neu can gate nghiem ngat (co fail la fail script): `BOOK_REVIEW_MEDIA_STRICT=true bash scripts/workflows/tests/check-book-review-media-output.sh`.
- Tren n8n UI, mo execution va click node `Persist Media Debug (Worker)` de xem `media_debug_phase`, `media_pipeline_status`, `media_debug_store_status`, `media_debug_store_table_name`, `media_debug_store_key`.
- Kiem tra nhanh Data Table debug:
```bash
bash scripts/workflows/tests/check-book-review-debug-table.sh
# loc theo session token:
bash scripts/workflows/tests/check-book-review-debug-table.sh env.n8n.local book_review_media_debug <session_token>
```

## Cac file quan trong
- `plan.md`: kien truc va roadmap
- `AGENTS.md`: entrypoint chuan cho AI agents
- `AGENT_RULES_GLOBAL.md`: rules dung chung (global)
- `AGENT_RULES_PROJECT.md`: rules rieng cua project
- `RULES_AND_SKILLS.md`: operational playbooks/skills (governance sub-agent nam tai `AGENT_RULES_GLOBAL.md`)
- `CHANGELOG.md`: changelog chi tiet (tu dong append khi sync workflow --apply)
- `docs/testing-runtime-incidents.md`: so tay runtime/test incidents + preflight checklist truoc E2E
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
- `scripts/workflows/tests/run-book-review-e2e.sh`: e2e runner book review (patch Telegram webhook test -> simulate update -> auto restore)
- `scripts/workflows/tests/run-book-review-full-e2e.sh`: full e2e runner 3-step reviewer flow + verify session assets tren Drive/Sheet
- `scripts/workflows/tests/check-book-review-media-output.sh`: kiem tra media data tren execution (summary + schema + error reasons)
- `scripts/workflows/tests/check-book-review-debug-table.sh`: xem log media debug trong Data Table (ho tro loc theo `session_token`)
- `workflows/demo/gemini-cliproxy-demo.workflow.json`: workflow demo template
- `workflows/demo/openai-cliproxy-demo.workflow.json`: workflow OpenAI demo template
- `workflows/book-review/book-review.workflow.json`: workflow book-review main (generate + router + worker + media merge)
- `workflows/book-review/text-to-images.workflow.json`: workflow reusable tao nhieu anh tu text chunks
- `workflows/book-review/tts.workflow.json`: workflow reusable tao TTS tu text chunks
- `workflows/shared/shared-notification-router.workflow.json`: workflow notify router da kenh (telegram/ggchat)
- `workflows/book-review/prompts/book-review-master-prompt.txt`: master prompt nguon de edit de dang
- `workflows/book-review/prompts/book-review-metadata-prompt.txt`: metadata prompt nguon de edit title/caption/thumbnail/hashtags
- `workflows/book-review/prompts/book-review-qc-prompt.txt`: prompt QC danh gia noi dung/diem/rui ro
- `workflows/book-review/prompts/book-review-review-edit-prompt.txt`: prompt revise ban review theo instruction reviewer

## Troubleshooting nhanh
- Da chuyen toan bo troubleshooting/preflight/runtime incidents sang:
  - `docs/testing-runtime-incidents.md`
