# Changelog

## 2026-04-09

- Simplify Sprint Monitor Jira link rendering: render layer now regex-scans unified digest text for issue keys and replaces them with Google Chat link markup `<jiraBaseUrl/browse/<ISSUE_KEY>|<ISSUE_KEY>>` right before delivery, with plain-text fallback when no Jira domain is configured.
- Add standalone `Sprint Monitor` MVP workflow set under `workflows/sprint-monitor/`: `Sprint Monitor Light Scan`, `Sprint Monitor Deep Analysis`, `Sprint Monitor Endgame`, and shared subworkflow `Sprint Monitor Engine`.
- Add `scripts/sprint-monitor/generate-workflows.mjs` so the 4 Sprint Monitor workflow JSON templates can be regenerated from maintainable JS source instead of hand-editing raw JSON.
- Add Sprint Monitor support tooling: import wrappers, registry entries, strict checklist runner, and idempotent PostgreSQL schema apply helper `scripts/bootstrap/apply-sprint-monitor-schema.sh`.
- Add `scripts/bootstrap/setup-sprint-monitor-neon.sh` to support Neon-first DB setup for Sprint Monitor: parse connection string, optionally switch n8n UI host to Neon pooler host, apply schema, and print the exact Postgres fields for manual credential creation in n8n UI.
- Clarify Neon helper output and docs so `Host` in the printed credential block is explicitly the n8n credential host, while the direct connection-string host is labeled separately for CLI/schema use.
- Harden the Neon helper against placeholder mistakes by rejecting values like `POOLER_HOST` for `--n8n-host`, and rename the example placeholder toward the clearer `n8n credential host` wording.
- Add `docs/sprint-monitor/monitor-configs.sql` with operational SQL snippets for viewing, inserting, updating, disabling, and upserting `monitor_configs` rows.
- Add Sprint Monitor outbound message language support with `monitor_configs.message_language` (`en|vi`), localized drafter prompts, and localized deterministic delivery fallbacks for PM digests and lead alerts.
- Sprint Monitor top-level import wrappers now import `Sprint Monitor Engine` first and patch `__REGISTRY__:Sprint Monitor Engine` in the top-level templates before calling the generic import helper.
- `import-all-workflows.sh`, `README.md`, and `scripts/README.md` now document the Sprint Monitor workflows, generation/import flow, schema bootstrap, strict checklist, and manual credential-binding requirements.

## 2026-04-08

- `MoMo AI Assistant` refactor them delivery stage theo huong field-toi-gian: cac node `Build Reply Response` / `Prepare GGChat Delivery Messages` / `Build Delivery Ack` / `Build Final Response` uu tien doc truc tiep tu node goc (`$('Ten node')`) thay vi pass-through envelope.
- `Config Main` bo field thua `deliveryPlanVersion` va `defaultAssistantDestinationsByChannel`; fallback destination dua ve logic gon trong `Build Agent Delivery Envelope` (`system -> pushGoogleChat`, con lai `reply`).
- `AI Agent` prompt output contract chot lai theo runtime toi thieu: `toolName`, `resultText`, `deliveryPlan` (bo cac field cu `toolType/resultData/followUpHints`).
- `Save Agent Session` map field session truc tiep tu `Build Assistant Context` + `Build Agent Delivery Envelope`, giam phu thuoc field trung gian.
- Chot input contract toi gian main -> router -> business tool: `triggerSource`, `commandText`, `channel`, `sessionId`, `spaceId`, `threadKey`, `actorId`, `actorDisplayName`, `args`; bo pass-through `runtimeConfig/config`, `resolvedToolName`, `commandType`.
- `Build Assistant Context` va `Build Agent Delivery Envelope` duoc don payload theo source-of-truth: node downstream doc truc tiep `$('Config Main')`/`$('Build Assistant Context')`, khong carry full event/config qua nhieu lop.
- `Load Session` / `Save Agent Session` schema duoc rut gon theo operation thuc te (`getSession`, `upsertSession`), bo input dead (`pendingAction*`, `toolRun`) o top-level mapping.
- `MoMo AI Assistant Tool Sprint Healthcheck` quay ve local `Config Main` cho Jira/threshold/sheet config; contract qua subworkflow boundary giu toi thieu va khong phu thuoc config top-level.
- `MoMo AI Assistant Tool Demo Commands` chuyen sang doc `args.commandType`; router matcher map commandType vao `args` de giu contract input dong nhat.

- Cleanup theo huong toi gian field cho `MoMo AI Assistant`: bo `sessionMode/requestedToolName/requestedToolMode/threadName/rawEvent` o event builders, bo `assistantName` + `pendingActionTtlHours` khoi `Config Main`.
- Top-level bo node `Restore Delivery Envelope`; `Save Agent Session` di thang vao `Build Reply Response`, va `Build Reply Response` doc truc tiep `$('Build Agent Delivery Envelope')`.
- `Build Agent Delivery Envelope` bo metadata khong dung (`responseKind`, `resultData`, `ggChatWebhookUrl` trong output envelope), `Prepare GGChat Delivery Messages` bo fallback `responseKind` khi tao thread seed.
- Router runtime registry bo `workflowRegistryKey`; `Resolve Routed Tool` va unsupported result giam payload trung gian de de trace.
- Tool outputs toi gian: `MoMo AI Assistant Tool Sprint Healthcheck` + `MoMo AI Assistant Tool Demo Commands` chot output runtime con `toolName`, `resultText`, `deliveryPlan`.
- Cap nhat checklist + guide subworkflow theo topology moi va rule doc field truc tiep tu node goc.

- `MoMo AI Assistant Tool Router` matcher `status sprint` hien inject `additionalDestinations: [{ type: 'pushGoogleChat' }]` de test luong vua reply, vua push Google Chat theo kieu card summary + warning detail cung thread.
- `MoMo AI Assistant` cutover delivery contract sang `deliveryPlan` V2: them `destinations[]` o cap plan va `destinations[]` o tung message, bo hard-code `deliveryTarget` khoi cac trigger builders.
- `MoMo AI Assistant` bo `Switch Delivery Target`; top-level delivery engine gio di theo chuoi generic `Build Reply Response -> Prepare GGChat Delivery Messages -> If Has GGChat Delivery Messages? -> Split Out GGChat Delivery Messages -> Build Delivery Ack -> Build Final Response`.
- `MoMo AI Assistant Tool Sprint Healthcheck`, `MoMo AI Assistant Tool Demo Commands`, va `MoMo AI Assistant Tool Router` unsupported result deu tra `deliveryPlan` V2 (`thread` + `destinations[]` + `messages[]`) de moi tool tu quyet dinh dich giao.
- `MoMo AI Assistant Tool Router` nang cap `Resolve Routed Tool` de merge `tool.args` + `matcher.args`, tao duong mo rong delivery qua config 1 noi (`toolRegistry`) ma khong can sua top-level.
- `MoMo AI Assistant` them `defaultAssistantDestinationsByChannel` trong `Config Main` de lam fallback duy nhat cho direct assistant replies; interactive channels fallback ve `reply`, con `system` uu tien `pushGoogleChat`.
- Fix runtime `MoMo AI Assistant`: `MoMo AI Assistant Tool Router` nay duoc auto-activate sau import (wrapper `import-momo-ai-assistant-tool-router-workflow.sh` + opt-in `WORKFLOW_AUTO_ACTIVATE` trong `import-workflow.sh`) de tranh loi `Workflow is not active and cannot be executed`.
- `MoMo AI Assistant` tat `retryOnFail` tren node `AI Agent` va prompt agent duoc bo sung guard "goi tool toi da 1 lan / dung gon khi tool loi" de tranh loop khi workflow tool gap su co.
- `MoMo AI Assistant` them node `Restore Delivery Envelope` sau `Save Agent Session` de giu lai `deliveryTarget/config/deliveryPlan` truoc khi switch delivery; fix case chat `hello` bi roi nham qua nhanh `pushGoogleChat`.
- `MoMo AI Assistant` fallback tu `pushGoogleChat` ve `reply` khi `ggChatWebhookUrl` rong, thay vi fail cung voi loi `ggChatWebhookUrl is required for push delivery`.
- `MoMo AI Assistant Tool Sprint Healthcheck` bo duplicate `ggChatWebhookUrl`; webhook Google Chat hien chi config 1 noi o top-level `Config Main`.
- Them guide ngan [docs/momo-ai-assistant-subworkflow-guide.md] cho quy trinh them/chinh subworkflow cua `MoMo AI Assistant`.
- `MoMo AI Assistant Tool Router` duoc chuan hoa theo `Config Main.toolRegistry`: moi command route/subworkflow mapping nam cung 1 noi, khong con hardcode business route o nhieu node.
- `MoMo AI Assistant Tool Router` them `Resolve Routed Tool` + `Run Routed Tool` generic (dynamic `workflowId`), bo cap execute node rieng cho tung business tool.
- `MoMo AI Assistant Tool Sprint Healthcheck` va `MoMo AI Assistant Tool Demo Commands` duoc chuan hoa input schema ve envelope chung (`triggerSource`, `commandText`, `channel`, `sessionId`, `spaceId`, `threadKey`, `resolvedToolName`, `commandType`, `args`) de router co the goi generic.
- `import-momo-ai-assistant-tool-router-workflow.sh` duoc chuan hoa theo token `__REGISTRY__:<workflow name>`: wrapper nay tu quet router config, import dependency tu `workflow-registry.json`, va patch workflow IDs luc import thay vi hardcode healthcheck/demo.
- `MoMo AI Assistant` duoc don tiep theo huong thin-main: bo toan bo nhanh direct tool runner o top-level, de moi trigger (`manual`, `schedule`, `webhook`, `local chat`) deu di chung luong `Load Session -> Build Assistant Context -> AI Agent -> delivery`.
- Them subworkflow moi `MoMo AI Assistant Tool Router` de lam lop route business command giua `AI Agent` va cac business tools; top-level nay chi con 1 tool node `Assistant Command Router Workflow Tool`.
- `MoMo AI Assistant Tool Router` hien route deterministic sang `MoMo AI Assistant Tool Sprint Healthcheck` hoac `MoMo AI Assistant Tool Demo Commands`, va tra ve unsupported result co `deliveryPlan` neu command chua duoc map.
- Wrapper import/checklist/docs cua `MoMo AI Assistant` duoc cap nhat theo topology moi co router tool, de viec them/sua business subworkflow khong con can don canvas chinh theo direct branch.
- `MoMo AI Assistant` refactor top-level theo contract delivery chung: trigger/event builders -> `Load Session` -> `Build Assistant Context` -> `AI Agent` -> `Switch Delivery Target` -> generic delivery.
- `MoMo AI Assistant` bo special-case Google Chat cho healthcheck o top-level; thay bang `Prepare GGChat Delivery Messages` + `Send GGChat Delivery Message` de gui bat ky `deliveryPlan.messages[]` nao tool tra ve.
- `MoMo AI Assistant` chot lop route con lai o top-level theo huong generic delivery: `Switch Delivery Target`; route business command duoc day xuong `MoMo AI Assistant Tool Router`.
- `MoMo AI Assistant Tool Sprint Healthcheck` va `MoMo AI Assistant Tool Demo Commands` nay tra ve `deliveryPlan` V1 (`thread` + `messages[]`) cung voi `resultText/resultData`, de top-level co the delivery generic va tai su dung cho schedule/chat ve sau.
- Checklist `test-momo-ai-assistant-checklist.mjs` duoc cap nhat theo topology moi, verify cac node switch/delivery-plan contract thay cho cum node healthcheck-specific cu.
- `MoMo AI Assistant` bo backward-compatible memory parser cu (`lastUserMessage`, `lastAssistantMessage`), chot clean-slate memory schema theo `turns[]` (toi da 10 turn) trong `currentIntent`.
- `MoMo AI Assistant State Store` them operation moi `purgeAllState`, route qua `Switch Operation` de xoa va recreate 3 data tables state (`assistantSessions`, `assistantPendingActions`, `assistantToolRuns`).
- Them workflow moi `MoMo AI Assistant State Cleanup` (Manual + Schedule) de goi `purgeAllState` dinh ky; lich mac dinh `0 3 * * *`.
- Them wrapper import `scripts/workflows/import/import-momo-ai-assistant-state-cleanup-workflow.sh` va wire vao `import-momo-ai-assistant-workflow.sh`.
- `MoMo AI Assistant Tool Sprint Healthcheck` harden khi Jira host loi DNS/network: `Get Active Sprint` + `Get Sprint Issues` nay `continueOnFail`, va `Pick Active Sprint`/`Prepare AI Input` tra ve `failureReason` ro nghia thay vi fail cung workflow.
- `MoMo AI Assistant` chuyen manual triggers sang event builder de dua ve cung luong `chat -> AI Agent -> router tool` (command fix cung) va test orchestration giong luong chat that.
- Them `Local Chat Trigger` + `Build Local Chat Event` de test truc tiep luong `chat -> AI Agent -> router tool` ngay tren khung chat n8n editor, khong phu thuoc Google Chat trigger.
- Nang cap `AI Agent` prompt theo huong tro ly hoi thoai (chao hoi/cam on/hoi chung) va bo sung simple memory qua session bang cach serialize vao `currentIntent` (`intent`, `turns[]`, `memoryUpdatedAt`).

## 2026-04-07

- Live test `MoMo AI Assistant` chat webhook da pass: top-level `AI Agent` thuc su goi `Sprint Healthcheck Workflow Tool`, tra ve sprint report text qua HTTP response va state session duoc doc/ghi dung theo thread.
- Fix `MoMo AI Assistant State Store`: Data Table create nodes nay tham chieu truc tiep `Normalize Request` de khong mat `tables.*`, va `Switch Operation` cung route theo `Normalize Request.operation` thay vi output cua node tao bang.
- Fix chat response path: `Return Chat Response` nay tra truc tiep `resultText` tu `Build Agent Chat Response`, khong con roi ve fallback `Da nhan lenh.` sau khi di qua `Save Agent Session`.

- `MoMo AI Assistant` duoc refactor tiep tu pipeline sprint-status don thanh khung assistant nho gon: top-level router/delivery + subworkflow `MoMo AI Assistant State Store` + subworkflow `MoMo AI Assistant Tool Sprint Healthcheck`.
- Manual/Schedule van giu hanh vi `check sprint` nhu truoc, nhung gio goi qua subworkflow read-only `sprintHealthcheck` de sau nay tai su dung duoc cho chat va cac use case khac.
- Them `Google Chat Webhook` + session flow co state store explicit (`assistantSessions`, `assistantPendingActions`, `assistantToolRuns`) de dat nen cho huong hybrid-agentic mo rong ve sau.
- Top-level chat path da co `AI Agent` ro rang, dung `Call n8n Workflow Tool` de tu chon va goi `MoMo AI Assistant Tool Sprint Healthcheck` hoac `MoMo AI Assistant Tool Demo Commands`.
- Router chat duoc siet scope lai: `check sprint` va `status sprint` la lenh stable; `release sprint`, `approve`, `reject`, `cancel` di qua demo tool de giu flow healthcheck/manual/schedule an toan.
- Them wrapper import moi cho `MoMo AI Assistant State Store`, `MoMo AI Assistant Tool Sprint Healthcheck`, `MoMo AI Assistant Tool Demo Commands`; wrapper top-level patch workflow IDs tu `workflow-registry.json` truoc khi import.
- Rebuild checklist `test-momo-ai-assistant-checklist.mjs` theo topology moi va cap nhat docs `README.md` + `scripts/README.md`.

- `MoMo AI Assistant` duoc rebuild greenfield thanh workflow sprint-status dedicated, co 2 trigger song song (`Manual Trigger` + `Schedule Trigger`) vao cung 1 pipeline.
- `Config Main` chuyen qua Code-node JSON object de de doc/de sua config.
- Topology moi: `Get Active Sprint` -> `Pick Active Sprint` -> `If Active Sprint?` -> (`Get Sprint Issues` -> `Aggregate Sprint Metrics` -> `Write Sprint Review` + `Review Output Parser` -> `Get User Directory` -> `Build Final Report`) hoac (`No Active Sprint Output`) -> `Send GGChat Webhook`.
- Stage aggregate xu ly deterministic theo spec: board `1041`, issue type `Task|Bug`, passed statuses (`Ready For Review`, `In Review`, `Ready For Release`, `Close` + map `Closed -> Close`), FE/BE classify theo token, warning rules theo business day, dedupe warning theo uu tien.
- Them AI stage de viet review ngan (structured output JSON). Ho tro placeholder `<email>` trong review, sau do map sang mention Google Chat `<users/{id}>` qua sheet mapping `MoMoer` (columns `email`, `id`, `name`).
- Workflow da wire send webhook Google Chat qua node `Send GGChat Webhook` (URL lay tu env `MOMO_GGCHAT_WEBHOOK_URL`/`GGCHAT_WEBHOOK_URL`).
- Them/cap nhat checklist `scripts/workflows/tests/test-momo-ai-assistant-checklist.mjs` + wrapper `scripts/workflows/tests/test-momo-ai-assistant-checklist.sh` theo topology moi.
- Cap nhat docs van hanh (`README.md`, `scripts/README.md`) va env local (`env.n8n.local`) cho runtime webhook.

## 2026-04-06

- Clone workflow moi `workflows/media/tts-vrex.workflow.json` (`TTS VREX`) tu topology `TTS VieNeu` va cutover API theo docs VREX: base URL mac dinh `https://tts.getvrex.com/api/v1`, resolve voice `GET /voices`, stream audio `POST /tts/stream`, them auth header `Authorization: Bearer <ttsApiKey>`.
- `TTS VREX` them input `ttsApiKey` (bat buoc), ho tro optional `language` + `speed`, fail-fast `missing_tts_api_key`, va scrub `ttsApiKey` khoi output cuoi de giu secret hygiene.
- Them wrapper import `scripts/workflows/import/import-tts-vrex-workflow.sh`, checklist moi `scripts/workflows/tests/test-tts-vrex-checklist.mjs` + `scripts/workflows/tests/test-tts-vrex-checklist.sh`, va upsert registry key `TTS VREX` (ID `Zgc9wgtKmZ1qKm5B`).
- `Book Review` cutover node media call tu `Call TTS VieNeu` sang `Call TTS VREX`, map `ttsApiKey` tu env `TTS_VREX_API_KEY`, va pin `voiceId = d1f5e1f6-fd60-45e7-9564-523ecd819e31`.
- Cap nhat checklist `test-book-review-checklist.mjs` theo topology hien tai (`Build Media Sheet`, `Merge`, `Call TTS VREX`) va assertions moi cho VREX voice/key mapping.
- Cap nhat docs (`README.md`, `scripts/README.md`, `docs/book-review-workflow.md`) de phan biet `TTS VieNeu` vs `TTS VREX` va import/test commands moi.
- `TTS VREX` bo sung params theo docs stream moi: `quality` (4-64), `guidanceScale` (0-4), `denoise` (boolean), `outputFormat` (hien tai normalize va dung `raw` de giu contract WAV join).

## 2026-04-04

- `GG Sheet Manager` chuyen ve 1 action `upsertRows` va them che do `upsertByHeader` (upsert theo key header: match thi update, miss thi append); neu khong co `upsertByHeader` thi `upsertRows` se append khi bo trong `range`.
- `GG Sheet Manager` write path chuyen qua Google Sheets `values:batchUpdate` de update theo nhieu range/cell trong 1 request va giam nguy co de du lieu khi cac nhanh media chay rieng.
- `GG Sheet Manager` Build Result bo check write khi `rows` rong (nhanh write duoc skip hop le), tranh bao loi gia `statusCode=0`.
- `GG Sheet Manager` mac dinh cho phep no-op write (`totalUpdatedRows=0`, `totalUpdatedCells=0`) de idempotent; co the bat fail bang `failOnNoUpdates=true`.
- `Book Review` node `Update TTS Rows in Sheet` chuyen sang `upsertRows + upsertByHeader=scene_id`; payload TTS rows nay include `scene_id` de update dung row media tuong ung.
- `Book Review` node `Build TTS Sheet Row` bo `rowValues` du thua; output nay chi con cac field can cho upsert TTS (`scene_id`, `order`, `tts_url`, `tts_status`, `tts_error_reason`).
- `Book Review` fix mapping `Build TTS Sheet Row`: doc truc tiep data tu `Loop Over Narration Items`.item.json (khong doc nham `narrationItems` nested) de khong bi mat `scene_id` khi upsert TTS vao sheet.
- `GG Drive Manager` fix mat binary khi recurse folder (`Execute Recursive Workflow`): `Attach Folder Search Context` lay binary truc tiep tu `Normalize Request` de `upsert` khong fail `missingFileBinary`.
- `TTS VieNeu` refactor execution topology: tach loop chunk ra node-level (`If Has Chunks?` -> `Split Out Chunks` -> `Loop Over TTS Chunks` -> `Extract/Aggregate`) de moi lan execute chi xu ly 1 chunk, tranh timeout 300s khi loop trong Code node.
- `TTS VieNeu` fix audio binary corruption trong node `Execute /stream Chunks`: chuyen uu tien qua `this.helpers.request` voi `encoding=null` (raw bytes), decode ho tro body dang `{ type: 'Buffer', data: [...] }`, va fallback `httpRequest` chi khi helper `request` khong co.
- `TTS VieNeu` fix `wav_empty_data` false-negative trong node `Join WAV + Finalize`: khi server tra WAV hop le nhung `data` chunk size = `0`, parser nay fallback lay phan bytes con lai sau `data` header de van join duoc audio.
- `TTS VieNeu` align chunk text theo implementation goc `VieNeu-TTS` (`split_text_into_chunks`): chi chia chuoi text, khong cat/chinh sua audio chunk.
- `TTS VieNeu` harden node `Join WAV + Finalize`: parse WAV theo `data` chunk (khong hard-code offset 44), validate format dong nhat giua cac chunk, va fail ro ly do neu chunk WAV khong hop le.
- `TTS VieNeu` join policy uu tien noi tuan tu (silence/concat) de tranh overlap-cat; chi dung crossfade khi `joinMode=crossfade`.
- `TTS VieNeu` chuan hoa contract `camelCase-only`: bo workflow input snake_case va bo alias snake_case trong `Normalize + Plan`.
- Checklist `test-tts-checklist.mjs` cap nhat theo contract moi: camelCase cho n8n input, va cho phep `voice_id` chi trong payload/response call server.

## 2026-04-03

- `TTS VieNeu` fix timeout helper trong node `Execute /stream Chunks`: fallback khi runtime khong co global `AbortController` (tranh fail toan bo chunk voi loi `AbortController is not defined`).
- `TTS VieNeu` fix runtime `fetch is not defined`: node `Execute /stream Chunks` chuyen qua `this.helpers.httpRequest` de goi `/voices` va `/stream` on-dinh tren Code node runtime cua n8n.
- `TTS VieNeu` fix audio corruption trong `/stream` binary response: doc body bang `encoding=base64` de tranh UTF-8 replacement bytes (`ef bf bd`) lam meo WAV.
- `TTS VieNeu` chan `success` gia khi stream tra audio khong hop le: node `Execute /stream Chunks` nay validate WAV (`RIFF/WAVE`, >=44 bytes), va node `Join WAV + Finalize` bat buoc co PCM moi cho `status=success` + `audioBinaryKey=file`.
- `TTS VieNeu` update node `Join WAV + Finalize` de tra `errorReason` chi tiet tu chunk fail dau tien (khong con chi hien chung chung `all_chunks_failed`).
- `GG Sheet Manager` normalize `rows` input theo ca 2 dang (array hoac JSON string) de tranh ghi sheet rong do sai kieu du lieu.
- `GG Sheet Manager` fail-fast khi `upsertRows/appendRows` khong co `spreadsheetId`, HTTP write khong 2xx, hoac API bao update `0 rows/0 cells` du da gui rows.
- `GG Sheet Manager` fix branch sau `Move Sheet To Folder`: `If Should Write Rows` va `Write Sheet Rows` nay doc context tu `Prepare Sheet Meta` de khong bi mat `shouldCallWriteApi/spreadsheetId` khi item shape thay doi.
- Rebuild greenfield `workflows/media/tts.workflow.json` thanh workflow `TTS VieNeu`, giu nguyen workflow ID `2F1jBI12C6NtslBN`.
- `TTS VieNeu` ho tro contract moi (camelCase + snake_case alias), voice resolve qua `GET /voices`, mini-batch `POST /stream`, retry backoff, va join WAV (silence/crossfade).
- `Book Review` wire media branch sau `reviewPassed`: loop theo tung `narration_text` (scene-level), goi `TTS VieNeu`, upload WAV vao `folderPath + /tts`, append log vao Google Sheet.
- `GG Sheet Manager` bo sung action `appendRows` de append dong moi qua Google Sheets `:append` API.
- Cap nhat checklist: refactor `test-book-review-checklist.mjs` va them `test-tts-checklist.mjs` + `test-tts-checklist.sh`.
- Cap nhat registry key workflow tu `TTS` sang `TTS VieNeu` (giu nguyen ID/template import).

## 2026-04-02

- Them `DataTableStore` generic subworkflow cho `get` / `upsert` session state bang Data Table.
- Rebuild reviewer callback flow cua `Book Review`: `reviewing -> continueReview -> reviewPassed` va `reviewing -> stop`.
- `Book Review` hien luu session toi thieu (`sessionToken`, `reviewStatus`, `manifestUrl`, `folderUrl`, `rootFolderId`, `folderPath`) va rehydrate `Manifest.json` bang `manifestUrl`.
- `GG Drive Manager` bo sung `get` bang `fileUrl`, download binary, va tra lai payload de parse file tiep trong workflow cha.
- Canonicalized Book Review tren 1 template duy nhat: `workflows/book-review/book-review.workflow.json`.
- Don wrapper, registry, docs, rules, skills, va naming theo 1 workflow style duy nhat.
- Loai bo tooling runtime cu khong con khop voi workflow canonical hien tai.
- Them `docs/book-review-todo.md` de giu backlog reviewer/media/session/E2E cho giai doan tiep theo.

## 2026-04-02T09:07:08Z

- Workflow sync (UI -> JSON) processed 10 workflow(s): changed=7, missing_ui_folder=0, registry_new=0, registry_updated=10, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=10, changed=7, unchanged=4, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: TTS, Book Review, GG Sheet Manager, GG Drive Manager, Text To Videos VEO3, Text To Images.

## 2026-04-02T09:14:16Z

- Workflow sync (UI -> JSON) completed with no file, registry, or wrapper changes.
- Run mode=apply, total=10, changed=0, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=false, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.

## 2026-04-02T09:15:59Z

- Workflow sync (UI -> JSON) processed 10 workflow(s): changed=3, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=10, changed=3, unchanged=7, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: TTS, GG Sheet Manager, GG Drive Manager.

## 2026-04-02T12:27:36Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=4, missing_ui_folder=0, registry_new=0, registry_updated=4, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=4, unchanged=7, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review, GG Sheet Manager, DataTableStore, GG Drive Manager.

## 2026-04-02T12:32:05Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=1, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: DataTableStore.

## 2026-04-02T12:32:41Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=1, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: DataTableStore.

## 2026-04-02T15:42:03Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=4, missing_ui_folder=0, registry_new=0, registry_updated=5, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=4, unchanged=7, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: TTS, GG Sheet Manager, DataTableStore, GG Drive Manager.

## 2026-04-02T16:28:24Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=3, missing_ui_folder=0, registry_new=0, registry_updated=3, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=3, unchanged=8, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review, GG Sheet Manager, GG Drive Manager.

## 2026-04-02T18:05:38Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=2, missing_ui_folder=0, registry_new=0, registry_updated=2, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=2, unchanged=9, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review, GG Drive Manager.

## 2026-04-02T18:39:04Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=1, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review.

## 2026-04-03T03:19:16Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=2, missing_ui_folder=0, registry_new=0, registry_updated=1, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=2, unchanged=9, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review, GG Drive Manager.

## 2026-04-03T03:40:43Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=1, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=1, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review.

## 2026-04-03T05:37:30Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=2, missing_ui_folder=0, registry_new=0, registry_updated=3, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=2, unchanged=9, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: TTS VieNeu, Book Review.

## 2026-04-03T06:42:26Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=3, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=1, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review.

## 2026-04-03T07:02:09Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=1, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review.

## 2026-04-03T07:21:41Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=2, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=1, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review.

## 2026-04-03T08:00:36Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=1, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=1, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review.

## 2026-04-03T08:17:44Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=1, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review.

## 2026-04-03T08:29:01Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=1, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review.

## 2026-04-04T03:52:42Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=2, missing_ui_folder=0, registry_new=0, registry_updated=2, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=2, unchanged=9, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: TTS VieNeu, Book Review.

## 2026-04-04T03:53:32Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=1, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: TTS VieNeu.

## 2026-04-04T03:56:31Z

- Workflow sync (UI -> JSON) completed with no file, registry, or wrapper changes.
- Run mode=apply, total=11, changed=0, unchanged=11, failed=0, missing_ui_folder=0, registry_changed=false, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.

## 2026-04-04T04:53:22Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=1, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=1, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review.

## 2026-04-04T05:13:27Z

- Workflow sync (UI -> JSON) completed with no file, registry, or wrapper changes.
- Run mode=apply, total=11, changed=0, unchanged=11, failed=0, missing_ui_folder=0, registry_changed=false, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.

## 2026-04-04T05:57:52Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=1, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=1, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: TTS VieNeu.

## 2026-04-04T06:01:24Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=0, missing_ui_folder=0, registry_new=0, registry_updated=1, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=0, unchanged=11, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.

## 2026-04-04T06:41:50Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=2, missing_ui_folder=0, registry_new=0, registry_updated=1, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=2, unchanged=9, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review, GG Drive Manager.

## 2026-04-04T07:47:24Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=3, missing_ui_folder=0, registry_new=0, registry_updated=2, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=3, unchanged=8, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: TTS VieNeu, Book Review, GG Drive Manager.

## 2026-04-04T07:50:27Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=1, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=1, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: TTS VieNeu.

## 2026-04-04T09:25:16Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=3, missing_ui_folder=0, registry_new=0, registry_updated=3, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=3, unchanged=8, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: TTS VieNeu, Book Review, GG Drive Manager.

## 2026-04-04T09:54:47Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=2, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=2, unchanged=9, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: TTS VieNeu, Book Review.

## 2026-04-04T10:06:01Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=2, missing_ui_folder=0, registry_new=0, registry_updated=1, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=2, unchanged=9, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review, GG Drive Manager.

## 2026-04-04T11:20:36Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=3, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=1, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: TTS VieNeu.

## 2026-04-04T14:39:35Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=3, missing_ui_folder=0, registry_new=0, registry_updated=2, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=3, unchanged=8, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: TTS VieNeu, Book Review, GG Sheet Manager.

## 2026-04-05T03:10:18Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=1, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review.

## 2026-04-05T07:26:48Z

- Workflow sync (UI -> JSON) processed 11 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=11, changed=1, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review.

## 2026-04-06T16:45:36Z

- Workflow sync (UI -> JSON) processed 13 workflow(s): changed=3, missing_ui_folder=0, registry_new=1, registry_updated=0, conflicts=0, wrapper_new=1, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=13, changed=3, unchanged=10, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=1, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review, MoMo AI Assistant, TTS VREX.

## 2026-04-07T07:05:35Z
- Workflow sync (UI -> JSON) processed 13 workflow(s): changed=2, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=13, changed=2, unchanged=11, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Book Review, MoMo AI Assistant.

## 2026-04-07T07:47:00Z
- Workflow sync (UI -> JSON) processed 13 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=13, changed=1, unchanged=12, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: MoMo AI Assistant.

## 2026-04-07T07:49:25Z
- Workflow sync (UI -> JSON) processed 13 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=13, changed=1, unchanged=12, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: MoMo AI Assistant.

## 2026-04-07T08:33:10Z
- Workflow sync (UI -> JSON) processed 13 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=13, changed=1, unchanged=12, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: MoMo AI Assistant.

## 2026-04-07T08:36:01Z
- Workflow sync (UI -> JSON) processed 13 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=13, changed=1, unchanged=12, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: MoMo AI Assistant.

## 2026-04-07T08:52:38Z
- Workflow sync (UI -> JSON) processed 13 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=13, changed=1, unchanged=12, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: MoMo AI Assistant.

## 2026-04-07T09:18:10Z
- Workflow sync (UI -> JSON) processed 13 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=13, changed=1, unchanged=12, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Phase 1 Sprint Healthcheck v2.

## 2026-04-07T09:54:13Z
- Workflow sync (UI -> JSON) processed 13 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=1, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=13, changed=1, unchanged=12, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Phase 1 Sprint Healthcheck v2.

## 2026-04-07T10:35:52Z
- Workflow sync (UI -> JSON) processed 13 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=13, changed=1, unchanged=12, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Phase 1 Sprint Healthcheck v2.

## 2026-04-07T11:25:43Z
- Workflow sync (UI -> JSON) processed 13 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=13, changed=1, unchanged=12, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Phase 1 Sprint Healthcheck v2.

## 2026-04-07T12:59:30Z
- Workflow sync (UI -> JSON) processed 13 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=13, changed=1, unchanged=12, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Phase 1 Sprint Healthcheck v2.

## 2026-04-07T13:19:33Z
- Workflow sync (UI -> JSON) processed 13 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=13, changed=1, unchanged=12, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Phase 1 Sprint Healthcheck v2.

## 2026-04-07T13:28:10Z
- Workflow sync (UI -> JSON) processed 13 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=13, changed=1, unchanged=12, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Phase 1 Sprint Healthcheck v2.

## 2026-04-07T14:15:04Z
- Workflow sync (UI -> JSON) processed 13 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=13, changed=1, unchanged=12, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Phase 1 Sprint Healthcheck v2.

## 2026-04-08T00:18:18Z
- Workflow sync (UI -> JSON) processed 1 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=1, changed=1, unchanged=0, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: MoMo AI Assistant.

## 2026-04-08T10:53:32Z
- Workflow sync (UI -> JSON) processed 18 workflow(s): changed=6, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=18, changed=6, unchanged=12, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: MoMo AI Assistant, MoMo AI Assistant Tool Sprint Healthcheck, MoMo AI Assistant State Store, MoMo AI Assistant Tool Router, MoMo AI Assistant Tool Demo Commands, MoMo AI Assistant State Cleanup.

## 2026-04-08T13:05:28Z
- Workflow sync (UI -> JSON) processed 18 workflow(s): changed=2, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=18, changed=2, unchanged=16, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: MoMo AI Assistant, MoMo AI Assistant Tool Sprint Healthcheck.

## 2026-04-08T15:44:24Z
- Workflow sync (UI -> JSON) processed 18 workflow(s): changed=2, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=18, changed=2, unchanged=16, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: MoMo AI Assistant, MoMo AI Assistant Tool Router.

## 2026-04-08T16:13:58Z
- Workflow sync (UI -> JSON) processed 18 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=18, changed=1, unchanged=17, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: MoMo AI Assistant Tool Router.

## 2026-04-09T04:49:10Z
- Workflow sync (UI -> JSON) processed 22 workflow(s): changed=4, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=22, changed=4, unchanged=18, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Sprint Monitor Engine, Sprint Monitor Light Scan, Sprint Monitor Endgame, Sprint Monitor Deep Analysis.

## 2026-04-09T04:56:12Z
- Workflow sync (UI -> JSON) processed 22 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=22, changed=1, unchanged=21, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Sprint Monitor Engine.

## 2026-04-09T05:10:51Z
- Workflow sync (UI -> JSON) processed 22 workflow(s): changed=1, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=22, changed=1, unchanged=21, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Sprint Monitor Engine.

## 2026-04-09T05:40:11Z
- Workflow sync (UI -> JSON) processed 22 workflow(s): changed=4, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=22, changed=4, unchanged=18, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Sprint Monitor Engine, Sprint Monitor Light Scan, Sprint Monitor Endgame, Sprint Monitor Deep Analysis.

## 2026-04-09T05:42:46Z
- Workflow sync (UI -> JSON) completed with no file, registry, or wrapper changes.
- Run mode=apply, total=22, changed=0, unchanged=22, failed=0, missing_ui_folder=0, registry_changed=false, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.

## 2026-04-09T07:21:32Z
- Workflow sync (UI -> JSON) processed 22 workflow(s): changed=2, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=22, changed=2, unchanged=20, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Sprint Monitor Engine, MoMo AI Assistant Tool Router.

## 2026-04-09T10:59:57Z
- Workflow sync (UI -> JSON) processed 22 workflow(s): changed=4, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=22, changed=4, unchanged=18, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Sprint Monitor Engine, Sprint Monitor Light Scan, Sprint Monitor Endgame, Sprint Monitor Deep Analysis.

## 2026-04-09T11:08:50Z
- Workflow sync (UI -> JSON) processed 22 workflow(s): changed=4, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=22, changed=4, unchanged=18, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Sprint Monitor Engine, Sprint Monitor Light Scan, Sprint Monitor Endgame, Sprint Monitor Deep Analysis.

## 2026-04-09T11:11:19Z
- Workflow sync (UI -> JSON) completed with no file, registry, or wrapper changes.
- Run mode=apply, total=1, changed=0, unchanged=1, failed=0, missing_ui_folder=0, registry_changed=false, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.

## 2026-04-09T11:11:19Z
- Workflow sync (UI -> JSON) completed with no file, registry, or wrapper changes.
- Run mode=apply, total=1, changed=0, unchanged=1, failed=0, missing_ui_folder=0, registry_changed=false, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.

## 2026-04-09T11:11:19Z
- Workflow sync (UI -> JSON) completed with no file, registry, or wrapper changes.
- Run mode=apply, total=1, changed=0, unchanged=1, failed=0, missing_ui_folder=0, registry_changed=false, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.

## 2026-04-09T11:11:19Z
- Workflow sync (UI -> JSON) completed with no file, registry, or wrapper changes.
- Run mode=apply, total=1, changed=0, unchanged=1, failed=0, missing_ui_folder=0, registry_changed=false, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.

## 2026-04-09T12:07:24Z
- Workflow sync (UI -> JSON) processed 22 workflow(s): changed=2, missing_ui_folder=0, registry_new=0, registry_updated=0, conflicts=0, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0.
- Run mode=apply, total=22, changed=2, unchanged=20, failed=0, missing_ui_folder=0, registry_changed=true, wrapper_new=0, wrapper_updated=0, wrapper_pruned=0. Changed workflows: Sprint Monitor Engine, Sprint Monitor Endgame.
