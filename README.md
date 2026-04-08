# n8n-desktop

Repo nay chua local tooling va workflow templates cho n8n, voi `Book Review` la workflow canonical cho use case review sach.

## Workflow canonical
- Ten workflow tren n8n: `Book Review`
- Template: `workflows/book-review/book-review.workflow.json`
- Prompt source: `workflows/book-review/prompts/`
- Backlog tiep tuc: `docs/book-review-todo.md`

## Workflow style bat buoc
- UI-first: canvas phai clean, de doc, de trace.
- Stage-driven: nhin vao la thay tung cum lon cua flow.
- `Config Main` chi chua shared values dung nhieu noi.
- Han che tao them config nodes. Gia tri local thi dat gan node/cum dang dung no.
- Moi node mot trach nhiem ro rang.
- Co 1 diem canonicalize truoc khi persist/gui/fan-out.
- Field/config/contract moi dung `camelCase`.
- Khong giu branch, action, alias, doc hay file song song chi de tuong thich nguoc.

## Current Book Review scope
- Workflow canonical hien tai tap trung vao:
  - nhan input
  - tao outline
  - mo rong thanh manifest
  - QC output
  - chuan hoa output
  - persist `Manifest.json` va `ContentReadable.txt`
  - persist reviewer session state vao `DataTableStore`
  - gui review ready message voi `continueReview:<sessionToken>` / `stopReview:<sessionToken>`
  - rehydrate manifest tu `manifestUrl` khi reviewer chon Continue va chot `reviewPassed`
  - media branch TTS sau `reviewPassed`: loop theo tung `narration_text` (theo scene), goi subworkflow `TTS VREX` (voiceId co dinh `d1f5e1f6-fd60-45e7-9564-523ecd819e31` + env `TTS_VREX_API_KEY`), upload WAV vao folder `/tts`, va append row log vao Google Sheet
- Visual branch va E2E runtime van tiep tuc trong `docs/book-review-todo.md`.

## Quick start
```bash
bash scripts/bootstrap/bootstrap-local.sh
bash scripts/bootstrap/enable-full-mcp.sh
bash scripts/bootstrap/verify-local.sh
bash scripts/proxy/setup-proxy.sh
```

## Import
```bash
bash scripts/workflows/import/import-data-table-store-workflow.sh
bash scripts/workflows/import/import-gg-drive-manager-workflow.sh
bash scripts/workflows/import/import-book-review-workflow.sh
bash scripts/workflows/import/import-momo-ai-assistant-workflow.sh
```

Neu can shared workflows de dung tiep o backlog:
```bash
bash scripts/workflows/import/import-gg-sheet-manager-workflow.sh
bash scripts/workflows/import/import-text-to-images-workflow.sh
bash scripts/workflows/import/import-text-to-videos-veo3-workflow.sh
bash scripts/workflows/import/import-tts-workflow.sh
bash scripts/workflows/import/import-tts-vrex-workflow.sh
bash scripts/workflows/import/import-shared-notification-router-workflow.sh
```

## Sync
```bash
bash scripts/workflows/sync/sync-workflows-from-n8n.sh
bash scripts/workflows/sync/sync-workflows-from-n8n.sh --apply
```

## Checklist
```bash
bash scripts/workflows/tests/test-book-review-checklist.sh
bash scripts/workflows/tests/test-tts-checklist.sh
bash scripts/workflows/tests/test-tts-vrex-checklist.sh
bash scripts/workflows/tests/test-momo-ai-assistant-checklist.sh
```

Checklist hien tai la static contract/topology checklist cho workflow canonical (`Book Review`) va shared workflows `TTS VieNeu` + `TTS VREX`. Repo hien khong advertise full E2E runner cho media/runtime cho den khi backlog E2E duoc rebuild day du.

## MoMo AI Assistant (Sprint Status)
- Workflow `MoMo AI Assistant` da duoc cat thanh 6 lop de mo rong dan ma van giu manual/schedule healthcheck chay on dinh:
  - top-level `MoMo AI Assistant`: trigger + AI Agent chat orchestration + delivery
  - subworkflow `MoMo AI Assistant State Store`: explicit tables `assistantSessions`, `assistantPendingActions`, `assistantToolRuns`
  - subworkflow `MoMo AI Assistant Tool Router`: router tool dung giua AI Agent va business subworkflows
  - subworkflow `MoMo AI Assistant Tool Sprint Healthcheck`: read-only tool giu logic sprint healthcheck hien tai
  - subworkflow `MoMo AI Assistant Tool Demo Commands`: demo tool cho `release sprint` / `approve` / `reject` / `cancel`
  - subworkflow `MoMo AI Assistant State Cleanup`: cron cleanup state (`purgeAllState`) theo lich
- Router config V1:
  - single source of truth nam trong node `Config Main` cua `MoMo AI Assistant Tool Router`
  - moi tool duoc khai bao tai `toolRegistry` voi `toolName`, `workflowRegistryKey`, `workflowId`, `matchers`, `args`
  - them/sua command routing thi sua 1 noi trong `toolRegistry`, khong can don canvas top-level
  - router chi con 1 node runner generic `Run Routed Tool` dung `resolvedTool.workflowId`
  - import wrapper `import-momo-ai-assistant-tool-router-workflow.sh` tu scan token `__REGISTRY__:<workflow name>` trong router config de import dependency, patch workflow ID luc import, va auto-activate router sau import de `Assistant Command Router Workflow Tool` goi duoc ngay
- Google Chat config V2:
  - `ggChatWebhookUrl` hien duoc giu 1 noi duy nhat trong node `Config Main` cua top-level `MoMo AI Assistant`
  - business subworkflow khong can duplicate webhook URL
  - top-level se loc `deliveryPlan.destinations[]` theo config kha dung; neu thieu `ggChatWebhookUrl` thi interactive channels fallback ve `reply`, con `schedule/system` se skip push thay vi fail cung
- Contract delivery V2:
  - moi business tool/subworkflow tra ve `deliveryPlan`
  - top-level khong con route business-case; moi trigger deu di chung luong `Load Session -> Build Assistant Context -> AI Agent -> Assistant Command Router Workflow Tool`
  - subworkflow/tool tu quyet dinh `deliveryPlan.destinations[]`; trigger khong con hard-code `deliveryTarget`
  - moi `message` co `destinations[]` rieng de quyet dinh message nao di `reply`, message nao di `pushGoogleChat`
  - top-level delivery engine da doi tu `Switch Delivery Target` sang chuoi generic `Build Reply Response -> Prepare GGChat Delivery Messages -> If Has GGChat Delivery Messages? -> Build Final Response`
  - Google Chat push khong con hard-code rieng cho healthcheck; node `Prepare GGChat Delivery Messages` + `Send GGChat Delivery Message` gui bat ky message nao co `destinations: ['pushGoogleChat']`
- Da live-test chat webhook local: `check sprint` / `status sprint` di qua `AI Agent -> sprint_healthcheck` on dinh, session thread duoc luu dung, va response tra ve report text thay vi fallback generic.
- Luong dang bat:
  - `Manual Trigger` va `Manual Trigger Release Sprint` deu route ve nhanh `chat -> AI Agent -> router tool` voi command fix cung (`status sprint` va `release sprint`) de test nhanh orchestration
  - `Schedule Trigger` route ve command fix cung `check sprint`, sau do di cung luong `AI Agent -> router tool -> delivery engine` de ban Google Chat
  - `Google Chat Webhook` nhan lenh chat, load session theo `spaceId:threadKey`, dua context vao `AI Agent`, roi de agent goi `Assistant Command Router Workflow Tool`
  - them `Local Chat Trigger` (khung chat trong n8n editor) de test luong `chat -> AI Agent -> router tool` ngay trong UI, khong can Google Chat webhook
  - `AI Agent` da duoc tune de chat tu nhien hon (chao hoi/cam on/hoi chung) va co simple memory 10 turns qua session (`turns[]`) de giu mach hoi thoai giua cac luot
  - `AI Agent` khong con `retryOnFail`; neu router/tool gap su co thi agent se dung gon hon thay vi loop retry
  - state session cleanup cron chay hang ngay luc `03:00` qua workflow `MoMo AI Assistant State Cleanup` de reset state dev
- Lenh chat stable V1:
  - `check sprint`
  - `status sprint`
  - matcher `status sprint` hien dang inject them `additionalDestinations: pushGoogleChat` o router, de vua reply cho luong chat hien tai vua ban card + warning detail sang Google Chat webhook test
- Lenh chat demo placeholder:
  - `release sprint`
  - `approve`
  - `reject`
  - `cancel`
- Nhom lenh demo hien chi de kiem tra router/session skeleton, chua bat action that de tranh side-effect trong luc uu tien giu flow healthcheck chay on dinh.
- Guide ngan de them/chinh subworkflow:
  - `docs/momo-ai-assistant-subworkflow-guide.md`
- Import thu tu:
```bash
bash scripts/workflows/import/import-momo-ai-assistant-state-store-workflow.sh
bash scripts/workflows/import/import-momo-ai-assistant-state-cleanup-workflow.sh
bash scripts/workflows/import/import-momo-ai-assistant-tool-router-workflow.sh
bash scripts/workflows/import/import-momo-ai-assistant-tool-sprint-healthcheck-workflow.sh
bash scripts/workflows/import/import-momo-ai-assistant-tool-demo-commands-workflow.sh
bash scripts/workflows/import/import-momo-ai-assistant-workflow.sh
```

## Troubleshooting (GG Drive recursive upsert)
- `GG Drive Manager` giu nguyen binary khi recurse folder path (`Execute Recursive Workflow`) de nhanh `upsert` khong mat file binary va khong fail `missingFileBinary`.

## Troubleshooting (Sheet write)
- `GG Sheet Manager` da normalize `rows` theo ca 2 dang: array va JSON string.
- `upsertRows` se fail-fast neu:
  - thieu `spreadsheetId`
  - Google Sheets API tra status khong phai 2xx
- Mac dinh cho phep no-op write (200 nhung `0 rows/0 cells`) de idempotent; neu can fail-fast cho no-op thi set `failOnNoUpdates=true`.
- `GG Sheet Manager` dung 1 action write duy nhat: `upsertRows`.
- Neu truyen `upsertByHeader` (vi du: `scene_id`) thi `upsertRows` se upsert theo key header (match: update, miss: append).
- Neu khong truyen `upsertByHeader`:
  - co `range` -> write vao range do
  - khong co `range` -> append cuoi sheet
- Voi media TTS: truyen `upsertByHeader=scene_id` de update dung row media tuong ung, khong tao row duplicate cho scene da co.

## Troubleshooting (TTS stream)
- `TTS VieNeu` chi chunk tren text; audio chunk khong bi cat/chinh sua truoc khi join.
- `TTS VieNeu` da tach loop chunk ra node-level (`Split Out Chunks` + `Loop Over TTS Chunks`), moi vong chi goi `/stream` cho 1 chunk de tranh timeout 300s khi loop trong Code node.
- Join WAV parse theo `data` chunk (khong hard-code byte offset), neu WAV chunk loi se fail ro `errorReason` thay vi tra `success` gia.
- Join WAV co fallback khi server tra WAV co `data` chunk size = `0`: workflow se lay phan byte con lai sau `data` header de tranh fail gia `wav_empty_data`.
- Node `Execute /stream Chunks` uu tien `this.helpers.request` + `encoding=null` de giu nguyen binary bytes; tranh loi audio meo do UTF-8 coercion khi dung `this.helpers.httpRequest` cho stream WAV.
- Mac dinh join theo `silence`/`concat`; chi crossfade khi set ro `joinMode=crossfade`.
- Contract input cua `TTS VieNeu` la `camelCase-only` (khong dung alias snake_case).
- Payload call server trong node `Execute /stream Chunks` van dung `voice_id` (snake_case) theo contract API cua server.
- `TTS VREX` dung API `https://tts.getvrex.com/api/v1` voi `Authorization: Bearer <ttsApiKey>`, resolve voice qua `GET /voices` va stream WAV qua `POST /tts/stream`.
- `TTS VREX` fail-fast neu thieu `ttsApiKey`; `Book Review` can truyen key qua env `TTS_VREX_API_KEY` (khong hard-code secret).

## Env files
- `env.n8n.local.example`: env mau toi thieu. Mac dinh co the de trong; chi them bien khi can public URL, Cloudflare tunnel, hoac admin tooling nhu import/sync/MCP
- `env.proxy.local.example`: env mau cho proxy runtime. Khong con la input bat buoc cho import/sync workflow

## Repo map
- `workflows/book-review/book-review.workflow.json`: workflow canonical
- `workflows/media/tts.workflow.json`: shared workflow `TTS VieNeu`
- `workflows/media/tts-vrex.workflow.json`: shared workflow `TTS VREX`
- `workflows/shared/data-table-store.workflow.json`: subworkflow generic cho Data Table get/upsert
- `workflows/book-review/prompts/`: prompt source files
- `docs/book-review-workflow.md`: mo ta hien trang workflow canonical
- `docs/book-review-todo.md`: backlog tiep tuc
- `scripts/workflows/import/import-book-review-workflow.sh`: wrapper import canonical
- `scripts/workflows/tests/test-book-review-checklist.mjs`: checklist runner
- `scripts/workflows/tests/test-tts-checklist.mjs`: checklist runner cho `TTS VieNeu`
- `scripts/workflows/tests/test-tts-vrex-checklist.mjs`: checklist runner cho `TTS VREX`
