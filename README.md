# n8n Local + MCP + Skills + Proxy

Muc tieu cua project: chay n8n local, dung MCP + skills de build workflow, va tich hop proxy runtime (hien tai la 9router) de goi Gemini/Codex qua OpenAI-compatible endpoint (khong dung provider API key truc tiep trong workflow JSON).

## Living Document Rule
- Moi thay doi script, cau hinh, quy trinh van hanh: bat buoc cap nhat file nay.
- Moi thay doi quan trong: ghi vao `CHANGELOG.md` de theo doi lich su.

## Git hygiene
- Local-only files khong commit: `.mcp.json`, `env.*.local`, `.vendor/`, `.DS_Store`, editor temp files.
- Dung `env.n8n.local.example` va `env.proxy.local.example` lam mau de tao env local tren tung may.
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

## Proxy local setup (Gemini + Codex, runtime hien tai: 9router)
### Env contract
Su dung file `env.proxy.local` (neu chua co, script se tu tao):
- `PROXY_BASE_URL` (mac dinh: `http://127.0.0.1:20128`)
- `PROXY_API_KEY` (API key copy tu Dashboard cua 9router)
- `TELEGRAM_BOT_TOKEN` (optional; dung cho workflow notify Telegram)
- `TELEGRAM_CHAT_ID` (optional; chat/user/group ID de nhan notify)
- `GGCHAT_WEBHOOK_URL` (optional; incoming webhook URL cho Google Chat)
- `IMAGE_API_BASE_URL` (optional; endpoint tao anh cho media branch book-review)
- `IMAGE_API_KEY` (optional; auth key cho image API)
- `MEDIA_VISUAL_MODE` (optional; `image` hoac `video`, mac dinh `image`)
- `VIDEO_MODEL` (optional; mac dinh `veo3` khi dung `text-to-videos-veo3`)
- `VIDEO_CLIP_DURATION_SECONDS` (optional; mac dinh `8`)
- `VIDEO_TARGET_BUFFER_SECONDS` (optional; mac dinh `1`)
- `TTS_API_BASE_URL` (optional; mac dinh `http://127.0.0.1:8001`)
- `TTS_VOICE_ID` (optional; mac dinh `ngochuyen`)
- `GDRIVE_ROOT_FOLDER_ID` (optional; root folder Google Drive cho media pipeline)
- `GDRIVE_CREDENTIAL_NAME` (optional; ten credential Google Drive trong n8n de mapping config)

Mau file: `env.proxy.local.example`

### One-command setup
```bash
bash scripts/proxy/setup-proxy.sh
```
Script se:
- Kiem tra `curl`, `jq`
- Cai `9router` qua npm global neu chua co
- Start 9router local (background) neu chua chay
- Verify endpoint `GET /v1/models` (neu da co `PROXY_API_KEY`)
- Tu dong import workflow demo Gemini + OpenAI vao n8n (neu co `env.n8n.local`)

### Optional flags
```bash
bash scripts/proxy/setup-proxy.sh --skip-install
bash scripts/proxy/setup-proxy.sh --skip-start
bash scripts/proxy/setup-proxy.sh --skip-verify
bash scripts/proxy/setup-proxy.sh --skip-workflow-import
bash scripts/proxy/setup-proxy.sh --env-file /path/to/env.file
```

### Dashboard + API key
Dashboard:
```text
http://127.0.0.1:20128/dashboard
```
- Vao tab providers de ket noi account/provider.
- Copy API key trong dashboard roi dien vao `PROXY_API_KEY` trong `env.proxy.local`.

Model duoc cau hinh tap trung trong `env.proxy.local`:
- `CONTENT_MODEL` (Book Review content + OpenAI demo)
- `FALLBACK_MODEL` (fallback khi content model gap capacity)
- `QC_MODEL` (model cho luong QC)
- `GEMINI_CONTENT_MODEL` (Gemini demo)
- `IMAGE_MODEL` (model tao anh)

## Xem model nhanh (command line)
Liet ke toan bo model:
```bash
source env.proxy.local
curl -sS -H "Authorization: Bearer $PROXY_API_KEY" "$PROXY_BASE_URL/v1/models" | jq -r '.data[].id' | sort
```

Chi xem model Gemini:
```bash
source env.proxy.local
curl -sS -H "Authorization: Bearer $PROXY_API_KEY" "$PROXY_BASE_URL/v1/models" | jq -r '.data[].id' | rg '^gemini' | sort
```

Chi xem model OpenAI:
```bash
source env.proxy.local
curl -sS -H "Authorization: Bearer $PROXY_API_KEY" "$PROXY_BASE_URL/v1/models" | jq -r '.data[].id' | rg '^(cx/)?gpt' | sort
```

Fetch model moi nhat + goi y model moi nhat (khong vao menu):
```bash
source env.proxy.local
curl -sS -H "Authorization: Bearer $PROXY_API_KEY" "$PROXY_BASE_URL/v1/models" \
| jq -r '.data[].id' \
| awk '
  /^gemini/ {gem[++g]= $0}
  /^(cx\/)?gpt/ {gpt[++o]= $0}
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
- `workflows/shared/gg-drive-manager.workflow.json`
- `workflows/demo/gemini-proxy-demo.workflow.json`
- `workflows/demo/openai-proxy-demo.workflow.json`
- `workflows/book-review/book-review.workflow.json`
- `workflows/book-review/text-to-images.workflow.json`
- `workflows/book-review/text-to-videos-veo3.workflow.json`
- `workflows/book-review/tts.workflow.json`

Workflow folder structure:
```text
workflows/
  book-review/
    prompts/
      book-review-scene-outline-prompt.txt
      book-review-scene-expand-prompt.txt
      book-review-metadata-prompt.txt
      book-review-qc-prompt.txt
      book-review-review-edit-prompt.txt
    book-review.workflow.json
    text-to-images.workflow.json
    text-to-videos-veo3.workflow.json
    tts.workflow.json
  demo/
    gemini-proxy-demo.workflow.json
    openai-proxy-demo.workflow.json
  shared/
    gg-drive-manager.workflow.json
    shared-notification-router.workflow.json
```

`GG Drive Mananger` reusable workflow:
- Input chinh: `rootFolderId`, `folderPath`, `action`, `file` (binary)
- Input them: `fileName` (optional), `binaryFieldName` (optional)
- Neu khong truyen `rootFolderId` thi workflow tu mac dinh `root` (My Drive).
- `action` ho tro: `upsert` (default), `get`, `delete`, `list`
- `upsert` se tao folder thieu theo `folderPath`; `get/delete/list` chi doc/xoa/liet ke, khong tao folder moi.
- Output co san `folderId`, `folderUrl`, `fileId`, `fileUrl`

Pipeline:
- `Manual Trigger`
- `Set Config`
- `HTTP Request` -> `POST {PROXY_BASE_URL}/v1/chat/completions`
- `Code` node extract text tu `choices[0].message.content`
- `Set Notify Targets` node de chon kenh notify theo workflow (`telegram`, `ggchat`, hoac ket hop CSV)
- `Code` node build notify payload dong (`status`, `summary`, `details`)
- `Execute Workflow` node goi workflow dung chung `Shared Notification Router`
- `Shared Notification Router` route notify theo `notify_targets`, ho tro Telegram + Google Chat

Book review chat pipeline:
- Kien truc tach thanh 3 workflow:
  - `book-review.workflow.json` (main): scene-outline -> scene-manifest -> reviewer gate -> media orchestration.
  - `text-to-images.workflow.json`: workflow reusable tao anh.
  - `text-to-videos-veo3.workflow.json`: workflow reusable tao video theo scene (co mock mode, contract `generate_until_enough`).
  - `tts.workflow.json`: workflow reusable tao giọng doc (Form Trigger + Drive URL + Execute Workflow Trigger).
- Main flow (`book-review.workflow.json`) goi media qua `Execute Workflow` theo mode:
  - `media_visual_mode=image` -> `Generate Image Assets (Worker)` goi `Text To Images`.
  - `media_visual_mode=video` -> `Generate Image Assets (Worker)` goi `Text To Videos VEO3`.
  - `Generate TTS Assets (Worker)` van goi `TTS`.
- Main generate branch dung 2-pass content:
  - Pass 1: tao `scene_outline` (scene_count 8-14, scene_01 hook, scene cuoi outro)
  - Pass 2: mo rong thanh `review_manifest` day du scene contract.
- Main output song song:
  - `review_manifest` (JSON source-of-truth)
  - `review_readable` (ban doc cho reviewer)
  - persist file Drive: `review_readable.txt` + `review_manifest.json`.
- Callback data router su dung format ngan <=64 bytes: `brv:media:c:<token>` (Tao Media), `brv:media:s:<token>` (Dung).
- Khong con nhanh scheduler timeout; router xu ly truc tiep callback/message event.
- Notify hub cho workflow review sach da chuan hoa theo pattern:
  - Parse thong diep bat dau: `Bắt đầu review: {{user_input}}`.
  - Start command se push thong bao tien trinh som: `Dang tao noi dung ...` (route qua shared notify).
  - Worker build payload thong bao o `Build Notify Payload (Worker)` roi goi truc tiep `Notify via Shared Workflow (Main)`.
  - Da bo node `Send Informations` de giam clutter UI.
  - `Set Notify Targets (Main)` giu vai tro set target notify cho luong main/start.
- Don gian hoa init session:
  - Da bo node `Prepare Session + Init Event`.
  - `Parse Review Sections` tao `session_token` + gan `event_type=init_review`, sau do route thang vao worker config.
- Runtime UX + Drive persistence (update 2026-03-29):
  - Progress message `Dang tao noi dung...` duoc gui ngay khi bat dau `book-review ...`, auto edit moi 3 giay, va xoa khi tao noi dung xong.
  - Progress message TTS bo sung counter `file x/y` (x la so chunk da xu ly theo thu tu, y la tong chunk TTS) trong khi dang tao voice.
  - Callback action `Tao Media` khong popup text du; workflow chi ack silent + clear inline keyboard.
  - Node `Parse Telegram Event` chi lang nghe callback inline button (`brv:media:c|s:<session_token>`) de luong reviewer gon va de trace.
  - Session folder name giu theo format `book-review-<slug-book>-<session_token>` va duoc tai su dung trong suot session (khong tao folder moi neu da co ID).
  - Persist asset theo tung process/event:
    - `init_review`: tao folder session + subfolder `voice/image`, sau do persist `review file` + `metadata file`.
    - `media_continue`/`auto_continue_media`: xu ly TTS + image, persist media assets va `session sheet`.
  - Neu da co `session_sheet_id`, TTS workflow se update tung dong `assets` ngay khi upload xong moi file voice (realtime row update).
  - Telegram sau `book-review ...` se gui ngay link Drive cho `review_readable`, `review_manifest`, `session folder` (va `session sheet` neu co).
  - QC review duoc tach rieng khoi gate reviewer; chi gui block `[QC REVIEW]`, khong co nut action.
- Media branch node-first (chi chay cho `media_continue`/`auto_continue_media`):
  - `Process Media Assets (chunk+gate)` -> `Generate TTS Assets (Worker)` -> `Generate Image Assets (Worker)` -> `Finalize Media Assets`.
  - `Generate Image Assets (Worker)` chon subworkflow theo `media_visual_mode` (`image|video`).
  - Asset media merge deterministic theo `scene_id + order` (khong con `partName:index`), output giu ca `image_*` va `video_*` de tuong thich nguoc.
  - Contract media V2:
    - image input: `scene_id`, `order`, `scene_title`, `narration_text`, `image_prompt_en`, `highlight_quote_vi`, `drive_output_folder_id`.
    - tts input: `scene_id`, `order`, `scene_title`, `narration_text`, `image_prompt_en`, `highlight_quote_vi`, `drive_output_folder_id`.
  - TTS/image fail tung scene khong lam mat ket qua scene khac; finalize van tong hop `media_assets`.
  - Mac dinh runtime media: `image_timeout_ms=900000`, `tts_timeout_ms=900000`, `image_parallelism=2`, `tts_parallelism=2` (batch song song clamp `1..20`).
- Scene outline prompt: `workflows/book-review/prompts/book-review-scene-outline-prompt.txt`
- Scene expand prompt: `workflows/book-review/prompts/book-review-scene-expand-prompt.txt`
- Metadata prompt duoc tach rieng tai: `workflows/book-review/prompts/book-review-metadata-prompt.txt`
- QC prompt duoc tach rieng tai: `workflows/book-review/prompts/book-review-qc-prompt.txt`
- Review-edit prompt duoc tach rieng tai: `workflows/book-review/prompts/book-review-review-edit-prompt.txt`
- Master style source: `workflows/book-review/prompts/book-review-master-prompt.txt`
  - Prompt con dung placeholder `__BOOK_REVIEW_STYLE_KERNEL__`.
  - Import script se inject style tu block `STYLE KERNEL START ... STYLE KERNEL END` trong master prompt.
- Workflow hop nhat ket thuc moi nhanh bang notify hub: `Build Notify Payload (Worker) -> Notify via Shared Workflow (Main)`; payload worker mac dinh `notify_targets=none` de tranh spam `n8n INFO`.

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
bash scripts/workflows/sync/sync-workflows-from-n8n.sh --name "Demo Gemini via Proxy API" --apply

# Apply nhung khong ghi changelog
bash scripts/workflows/sync/sync-workflows-from-n8n.sh --apply --no-log
```
- Script se sanitize truong nhay cam (`proxy_base_url`, `proxy_api_key`, `n8n_api_url`, `n8n_api_key`, `image_api_key`, `gdrive_root_folder_id`, `gdrive_credential_name`) va workflow placeholders (`Notify via Shared Workflow`, `text_to_images_workflow_id`, `text_to_videos_workflow_id`, `tts_workflow_id`) truoc khi ghi file.
- `workflow-registry.json` nen luu `template` dang duong dan tuong doi (vi du: `workflows/book-review/book-review.workflow.json`) de tranh vo path khi doi ten folder project.
- Khi chay `--apply` (mac dinh), script se auto append log vao `CHANGELOG.md`.

Import thu cong neu can:
```bash
bash scripts/workflows/import/import-workflow.sh
bash scripts/workflows/import/import-all-workflows.sh
bash scripts/workflows/import/import-gg-drive-manager-workflow.sh
bash scripts/workflows/import/import-shared-notification-router-workflow.sh
bash scripts/workflows/import/import-gemini-demo-workflow.sh
bash scripts/workflows/import/import-openai-demo-workflow.sh
bash scripts/workflows/import/import-book-review-workflow.sh
# optional override template text-to-videos:
# TEXT_TO_VIDEOS_WORKFLOW_TEMPLATE=workflows/book-review/text-to-videos-veo3.workflow.json \
#   bash scripts/workflows/import/import-book-review-workflow.sh
# or custom prompt files:
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
```
- `import-all-workflows.sh` tu dong quet tat ca wrapper `scripts/workflows/import/import-*.sh` (bo qua `import-all-workflows.sh` va `import-workflow.sh`).
- De workflow moi tu dong duoc gom vao lenh all, chi can them wrapper theo naming convention `import-*.sh`.

Automation checklist test (book review workflow):
```bash
bash scripts/workflows/tests/test-book-review-checklist.sh
```
- Chay checklist topology + contract cho workflow chinh (`book-review`) va subworkflow media (`text-to-images`, `tts`), bao gom regression generate/parse + media merge.
- Neu bat mode video, import them `text-to-videos-veo3.workflow.json` de kiem tra contract video path.

E2E nhanh cho book review (khong can tu tim webhook path):
```bash
bash scripts/workflows/tests/run-book-review-e2e.sh
# custom message:
bash scripts/workflows/tests/run-book-review-e2e.sh env.n8n.local env.proxy.local "Sách Đắc Nhân Tâm của Dale Carnegie"
```
- Script se tu patch `Telegram Trigger` sang webhook test (`book-review-e2e-codex/webhook`), simulate Telegram update (co secret header), in execution summary, sau do restore workflow ve template goc.
- Script in them `payload_update_id` va mac dinh chi chap nhan execution co `update_id` khop payload vua gui (tranh bat nham execution cu).
- Neu can fallback sang behavior cu khi debug nhanh: `BOOK_REVIEW_E2E_STRICT_UPDATE_ID=false bash scripts/workflows/tests/run-book-review-e2e.sh`.

Full E2E cho book review (start -> media_continue + check session assets):
```bash
bash scripts/workflows/tests/run-book-review-full-e2e.sh
# custom message:
bash scripts/workflows/tests/run-book-review-full-e2e.sh env.n8n.local env.proxy.local "Sách Đắc Nhân Tâm của Dale Carnegie"
```
- Script se patch webhook test, goi 2 buoc reviewer event (`start -> media_continue`), verify `media_pipeline_status`, va check link session assets (folder, files, sheet), sau do auto restore workflow template.
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
- `env.proxy.local.example`: mau env proxy (runtime hien tai: 9router)
- `workflow-registry.json`: registry workflow (id, name, template, last sync) de upsert theo ID
- `scripts/README.md`: so do phan cap scripts + lenh thong dung
- `scripts/proxy/setup-proxy.sh`: setup A-Z cho proxy local (runtime hien tai: 9router)
- `scripts/workflows/import/import-workflow.sh`: core importer upsert workflow template vao n8n
- `scripts/workflows/import/import-all-workflows.sh`: wrapper import toan bo workflow, tu dong quet `import-*.sh` (bo qua `import-all-workflows.sh` va `import-workflow.sh`), uu tien thu tu `shared` -> `gemini` -> `openai` -> `book-review`, sau do chay cac wrapper moi theo alphabet
- `scripts/workflows/import/import-gg-drive-manager-workflow.sh`: import workflow reusable `GG Drive Mananger`
- `scripts/workflows/import/import-gemini-demo-workflow.sh`: wrapper import workflow Gemini demo vao n8n
- `scripts/workflows/import/import-shared-notification-router-workflow.sh`: import workflow notify router da kenh dung chung
- `scripts/workflows/import/import-openai-demo-workflow.sh`: import workflow OpenAI demo vao n8n
- `scripts/workflows/import/import-book-review-workflow.sh`: import workflow book review hop nhat vao n8n
- `scripts/workflows/sync/sync-workflows-from-n8n.sh`: sync workflow state tu n8n UI ve JSON templates (preview/apply)
- `scripts/workflows/tests/test-book-review-checklist.sh`: chay full automation checklist cho workflow review sach
- `scripts/workflows/tests/test-book-review-checklist.mjs`: test runner chi tiet cho checklist automation
- `scripts/workflows/tests/run-book-review-e2e.sh`: e2e runner book review (patch Telegram webhook test -> simulate update -> auto restore)
- `scripts/workflows/tests/run-book-review-full-e2e.sh`: full e2e runner 2-step reviewer flow + verify session assets tren Drive/Sheet
- `scripts/workflows/tests/check-book-review-media-output.sh`: kiem tra media data tren execution (summary + schema + error reasons)
- `scripts/workflows/tests/check-book-review-debug-table.sh`: xem log media debug trong Data Table (ho tro loc theo `session_token`)
- `workflows/demo/gemini-proxy-demo.workflow.json`: workflow demo template
- `workflows/demo/openai-proxy-demo.workflow.json`: workflow OpenAI demo template
- `workflows/book-review/book-review.workflow.json`: workflow book-review main (generate + router + worker + media merge)
- `workflows/book-review/text-to-images.workflow.json`: workflow reusable tao nhieu anh tu text chunks
- `workflows/book-review/text-to-videos-veo3.workflow.json`: workflow reusable tao video theo scene (mock + VEO3 contract)
- `workflows/book-review/tts.workflow.json`: workflow reusable tao TTS tu text chunks
- `workflows/shared/gg-drive-manager.workflow.json`: workflow reusable quan ly file Google Drive theo `rootFolderId/folderPath/action`
- `workflows/shared/shared-notification-router.workflow.json`: workflow notify router da kenh (telegram/ggchat)
- `workflows/book-review/prompts/book-review-scene-outline-prompt.txt`: prompt pass 1 xac dinh angle + scene_count + muc tieu tung scene
- `workflows/book-review/prompts/book-review-scene-expand-prompt.txt`: prompt pass 2 sinh `review_manifest` day du theo scene
- `workflows/book-review/prompts/book-review-metadata-prompt.txt`: metadata prompt nguon de edit title/caption/thumbnail/hashtags
- `workflows/book-review/prompts/book-review-qc-prompt.txt`: prompt QC danh gia noi dung/diem/rui ro
- `workflows/book-review/prompts/book-review-review-edit-prompt.txt`: prompt revise ban review theo instruction reviewer

## Troubleshooting nhanh
- Da chuyen toan bo troubleshooting/preflight/runtime incidents sang:
  - `docs/testing-runtime-incidents.md`
