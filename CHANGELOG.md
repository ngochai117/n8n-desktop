# Changelog

Nhat ky thay doi chi tiet cua du an (dac biet cho workflow sync/import va automation scripts).

## 2026-03-31
- Them wrapper import tong cho toan bo workflow:
  - Tao script moi `scripts/workflows/import/import-all-workflows.sh`.
  - Script all importer doi sang co che tu dong quet wrapper `import-*.sh` (bo qua `import-all-workflows.sh` va `import-workflow.sh`), uu tien thu tu `shared-notification-router` -> `gemini-demo` -> `openai-demo` -> `book-review`, sau do chay wrapper moi theo alphabet.
  - Cap nhat huong dan lenh + naming convention trong `README.md` va `scripts/README.md`.

## 2026-03-30
- Prompt maintainability refactor (master-style single source):
  - `book-review-master-prompt.txt` doi sang format co marker `STYLE KERNEL START ... STYLE KERNEL END`.
  - Prompt con (`scene-outline`, `scene-expand`, `metadata`, `qc`, `review-edit`) giu role/task rieng va dung placeholder `__BOOK_REVIEW_STYLE_KERNEL__`.
  - `import-book-review-workflow.sh` them buoc render prompt: extract style kernel tu master va inject vao prompt con truoc khi import workflow.
  - Cap nhat docs `README.md`, `scripts/README.md` ve co che style kernel.

- Hardening metadata generation + style alignment (Book Review):
  - `Handle Reviewer Event`:
    - Them unwrap schema metadata (`metadata_output`, `output.metadata`, `data.metadata`, ...) thay vi chi doc top-level keys.
    - Khong con silently fill fallback generic khi model tra sai shape; neu thieu key se set `metadata_error` ro nguyen nhan (`missing required keys/fields`).
    - Fallback metadata doi sang dynamic theo `user_input` (title/caption/hashtags linh hoat hon), bo hardcoded cum tu generic "Góc nhìn đáng suy ngẫm".
  - Prompt updates:
    - `book-review-scene-outline-prompt.txt`: bo sung style kernel (hook/bridge/no-meta/lens) de pass outline bám giọng review.
    - `book-review-scene-expand-prompt.txt`: bo sung style kernel + adaptive lens theo the loai de narration it kho khan.
    - `book-review-metadata-prompt.txt`: siết anti-generic phrases va buoc metadata ke thua giọng nội dung review.
  - Verify:
    - `bash scripts/workflows/tests/test-book-review-checklist.sh` -> PASS `9/9`.
    - `bash scripts/workflows/import/import-book-review-workflow.sh` -> update thanh cong `Text To Images`, `Text To Videos VEO3`, `TTS`, `Book Review`.

- Them visual mode dual-path cho media pipeline (giu `text-to-images`, bo sung `text-to-videos-veo3`):
  - Tao workflow moi: `workflows/book-review/text-to-videos-veo3.workflow.json` (name: `Text To Videos VEO3`).
  - Main workflow:
    - Them config `media_visual_mode` (`image|video`, mac dinh `image`), `text_to_videos_workflow_id`, `video_model`, `video_clip_duration_seconds`, `video_target_buffer_seconds`.
    - `Generate Image Assets (Worker)` doi sang dynamic subworkflow routing theo `media_visual_mode` (image -> `Text To Images`, video -> `Text To Videos VEO3`).
    - Media orchestration doi sang `TTS -> visual` de visual path co the nhan `duration_seconds` thuc te tu TTS.
    - `Finalize Media Assets (Worker)` + `Prepare Session Assets Package (Worker)` doi sang merge visual linh hoat (`video_*` + `image_*` aliases), render payload co `visual_url` + `video_url` + `image_url`.
    - Session context/package bo sung alias `session_video_folder_*` ben canh `session_image_folder_*`.
  - `Text To Videos VEO3`:
    - Add config `video_clip_duration_seconds`, `video_target_buffer_seconds`, `video_mock_mode`.
    - `Create Image Job` payload bo sung strategy contract:
      - `generation_strategy=generate_until_enough`
      - `target_duration_seconds`, `shot_count_initial`, `shot_prompts_en[]`, `duration_buffer_seconds`, `clip_duration_average_seconds`
      - `concat_and_trim=true`, `trim_to_target_duration=true`, `filler_policy=hold_last_frame`
    - Normalize/collect output chuan hoa `video_url/video_status/video_drive_*` va giu alias `image_*` de tuong thich nguoc.
  - Import/sync tooling:
    - `import-book-review-workflow.sh` import them `text-to-videos-veo3` truoc `tts`/`book-review`.
    - `import-workflow.sh` + `sync-workflows-from-n8n.sh` bo sung placeholder/config `text_to_videos_workflow_id` va dynamic workflowId expression cho node visual branch.
    - Them env example: `MEDIA_VISUAL_MODE`, `VIDEO_MODEL`, `VIDEO_CLIP_DURATION_SECONDS`, `VIDEO_TARGET_BUFFER_SECONDS`.
  - Verify:
    - `jq empty` pass cho workflow JSON chinh.
    - JS code-node syntax check pass.
    - `bash scripts/workflows/tests/test-book-review-checklist.sh` -> PASS `9/9`.

- Book Review V2 scene-manifest pipeline (thay SECTION canonical):
  - Main workflow:
    - `Generate Full Review` doi sang 2-pass (`scene-outline` -> `scene-expand`) va output `review_manifest` + `review_readable`.
    - `Parse Review Sections` doi sang normalize manifest/scene, tao compatibility fields + readable draft.
    - `Process Media Assets (Worker)` tao media items theo scene (`scene_id/order`) thay vi chunk `partName:index`.
    - `Prepare Image/TTS Workflow Input (Worker)` truyen contract scene bat buoc (`scene_id`, `scene_title`, `narration_text`, `image_prompt_en`, ...).
    - `Finalize Media Assets (Worker)` merge ket qua theo `scene_id`, giu partial-failure path.
    - `Prepare Session Assets Package (Worker)` doi sheet schema theo scene; file Drive doi thanh `review_readable.txt` + `review_manifest.json`.
    - `Notify Session Drive Links (Worker)` doi label notify sang readable/manifest links.
    - `Persist Session Asset Context (Worker)` + `Handle Reviewer Event` giu `review_manifest/review_readable` xuyen session callback.
  - Subworkflow media:
    - `Text To Images`: `Normalize Inputs` + `Build Chunks From Drive File` + `Collect Image Results` doi sang scene contract.
    - `Create Image Job` doi prompt source sang `$json.image_prompt_en` tren main path.
    - `TTS`: `Normalize Inputs` + `Build Chunks From Drive File` doi sang scene contract.
    - `Finalize TTS Results` emit `scene_id`, `voice_url`, `duration_seconds`; `Prepare Uploaded Voice Item` giu `voice_url`.
  - Config/import:
    - Them prompt placeholders `scene_outline_prompt_template`, `scene_expand_prompt_template` vao `Set Config (Main/Worker)`.
    - Bo sung render config placeholders (`render_*`) cho future render contract.
  - Test/docs:
    - Viet lai `scripts/workflows/tests/test-book-review-checklist.mjs` theo scene-manifest contract (9 tests).
    - Cap nhat `docs/book-review-workflow.md` va `README.md` (prompt files, import args, contract V2).
  - Verify:
    - `bash scripts/workflows/tests/test-book-review-checklist.sh` -> PASS `9/9`.
    - `bash scripts/workflows/import/import-book-review-workflow.sh` -> re-import thanh cong `Text To Images`, `TTS`, `Book Review`.

- Cap nhat media chunking cho `Book Review` + subworkflow `TTS` + `Text To Images`:
  - Ho tro parse SECTION marker linh hoat (`intro/outro` khong bat buoc title, `part_XX` co title).
  - Them chunk title rieng cho moi `part_XX` (title thanh chunk dau tien); `intro/outro` khong tao title chunk.
  - Noi dung trong `**...**` duoc tach thanh chunk doc lap.
  - Noi dung thuong doi sang chunk thong minh theo cau voi gioi han `256` ky tu/chunk (uu tien giu cau va dau nhay dong/mo trong cung chunk).
- Bat `parallelism` thuc su cho media subworkflow:
  - `Loop Over TTS Chunks`: `batchSize` doc tu `tts_parallelism` (mac dinh `2`).
  - `Loop Over Image Chunks`: `batchSize` doc tu `image_parallelism` (mac dinh `2`).
- Cap nhat prompt contract:
  - Fix typo format marker trong `book-review-master-prompt.txt` (`part_02` dong vi du du `>>>`).
- Verify:
  - Re-import 3 workflow thanh cong (`Text To Images`, `TTS`, `Book Review`).
  - Checklist automation pass `9/9`.

## Historical Entries Migrated from README Update Log (deduped)
- 2026-03-24: Khoi tao README living doc + bo script bootstrap/verify/full-mode + plan.md. Ly do: trien khai setup n8n local + MCP + skills tu dau.
- 2026-03-25: Them CLIProxyAPI OAuth stack (Gemini + Codex), script setup A-Z + workflow demo Gemini + import script. Ly do: dung auth flow thay provider API key va tao demo workflow su dung Gemini.
- 2026-03-25: Them workflow demo OpenAI qua CLIProxyAPI + script import rieng, va setup script import ca Gemini/OpenAI. Ly do: can demo tuong tu cho luong OpenAI.
- 2026-03-25: Nang cap default model demo len `gemini-3.1-pro-preview` va `cx/gpt-5.4`; bo sung cach tra cuu model. Ly do: uu tien model moi nhat va de quan sat list model nhanh.
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
- 2026-03-25: Chuyen default Gemini sang `gemini-3-flash-preview` va them fallback `gemini-2.5-pro` cho workflow review sach khi gap capacity `429`. Ly do: giam loi `MODEL_CAPACITY_EXHAUSTED` tren model pro preview.
- 2026-03-25: Import script sanitize `settings` truoc khi upsert workflow (giu `callerPolicy`/`availableInMCP`) de tranh loi `request/body/settings must NOT have additional properties` sau khi sync tu UI. Ly do: tang do on dinh cho vong lap UI -> JSON -> import.
- 2026-03-25: Tai cau truc thu muc `scripts/` theo domain (`bootstrap`, `cliproxy`, `workflows/{import,sync,tests}`) va cap nhat toan bo references. Ly do: giam roi, de mo rong khi so workflow/script tang.
- 2026-03-25: Tach master prompt workflow book review ra file rieng (`workflows/book-review/prompts/book-review-master-prompt.txt`) va inject vao workflow luc import. Ly do: de edit prompt ma khong phai sua `jsCode` dai trong JSON.
- 2026-03-25: Hardening registry workflow template path sang dang tuong doi + cap nhat importer/sync de auto resolve relative/absolute. Ly do: doi ten folder project van chay on dinh, khong vo path trong workflow-registry.
- 2026-03-25: Tach core importer thanh `scripts/workflows/import/import-workflow.sh`; cac wrapper (`import-gemini/openai/shared/book-review`) deu goi lai core nay. Ly do: dat ten trung lap ro hon va de mo rong them workflow moi.
- 2026-03-26: Sync workflow templates tu n8n UI ve JSON (apply, changed=1, unchanged=0, failed=0). Chi tiet: `CHANGELOG.md`.
- 2026-03-26: Sync workflow templates tu n8n UI ve JSON (apply, changed=0, unchanged=1, failed=0). Chi tiet: `CHANGELOG.md`.
- 2026-03-26: Fix workflow book-review: tra chat response truc tiep tu `Reviewer Orchestrator`, gom QC ve 1 nguon logic trong orchestrator (node AI QC giu pass-through), va sanitize `workflowPath` ve placeholder trong templates/sync script. Ly do: tranh mat metadata o response, tranh drift QC, va bo absolute path theo may local.

## 2026-03-29
- Cleanup naming/runtime contract theo huong `proxy` thuần (khong giu backward compatibility):
  - Xoa wrapper scripts cu (`scripts/9router/setup-9router.sh`, `scripts/cliproxy/setup-cliproxy-oauth.sh`) va loai bo env aliases `ROUTER_*`/`CLIPROXY_*`.
  - Doi ten demo templates thanh `workflows/demo/gemini-proxy-demo.workflow.json` + `workflows/demo/openai-proxy-demo.workflow.json`; cap nhat wrappers import + registry.
  - Chuan hoa docs/rules (`README.md`, `scripts/README.md`, `AGENTS.md`, `AGENT_RULES_PROJECT.md`, `RULES_AND_SKILLS.md`) de chi con `env.proxy.local`, `PROXY_*`, `scripts/proxy/setup-proxy.sh`.
  - Don dep regression sau broad replace: bo duplicate assignment o `import-workflow.sh`, `sync-workflows-from-n8n.sh`, `test-book-review-checklist.mjs`.
  - Verify: `bash -n` scripts pass; checklist automation pass `9/9`.
- TTS progress + realtime sheet update (book-review):
  - `Handle Reviewer Event` bo sung metadata progress TTS (`tts_progress_message_id`, `tts_progress_started_at_ms`, `tts_progress_estimated_minutes`) va truyen xuong media branch.
  - `Process Media Assets (Worker)` bo sung `order` toan cuc cho tung chunk va `tts_progress_total_files`.
  - `Prepare TTS Workflow Input (Worker)` truyen context progress (`message_id`, `started_at`, `estimate`, `total`) vao subworkflow `TTS`.
  - `TTS` workflow them node `Update TTS Progress Message` de edit Telegram text theo dang `Dang tao TTS... (... ) | file x/y`.
  - `TTS` workflow them nhanh realtime Google Sheets update theo tung voice (`Write Voice Row To Session Sheet (Realtime)`) khi co `session_sheet_id`.
  - `Normalize Inputs` + `Finalize TTS Results` giu truong `order` de mapping dung dong sheet.
  - Import workflow da cap nhat thanh cong:
    - `Text To Images`: `tcF2wcybrmgzFNew`
    - `TTS`: `2F1jBI12C6NtslBN`
    - `Book Review`: `4g3N5urBBIuo9HcJ`
- Cleanup tiep workflow `Book Review` theo huong simple + it logic an:
  - `Parse Telegram Event` doi sang callback-only parser (chi xu ly inline button `brv:media:c|s:<session_token>`), bo lookup command-text qua Data Table.
  - `Handle Reviewer Event` bo progress message no-op/thua (`Dang tao noi dung` o worker va thong bao `Dang xu ly TTS va anh...`), giu flow telegraph ro rang hon.
  - `Generate Full Review` doi timer progress ve nhịp co dinh moi 3 giay.
  - `Send Review QC And Action` bo fallback text generic `Chua co feedback QC.`, thay bang feedback fallback cu the hon.
- Hardening test runner full E2E:
  - `scripts/workflows/tests/run-book-review-full-e2e.sh` cap nhat doc data tu topology moi (`Finalize Media Assets`, `Finalize Session Assets Package`) thay cho node cu `Persist Media Debug`.
  - Bo dependency `manifest_file_url`.
  - Them fallback lay `review_file_url`/`metadata_file_url` tu execution `init_review` neu execution `media_continue` khong carry lai context link.
- Verification runtime sau patch:
  - Import workflow pass (`Book Review` ID `4g3N5urBBIuo9HcJ`).
  - Checklist pass `9/9`.
  - E2E nhanh pass: execution `1580` (HTTP `200`).
  - Full E2E pass: start execution `1588`, media execution `1590` (HTTP `200`).
  - Ghi nhan runtime issue ben ngoai workflow: TTS API tren `127.0.0.1:8001` dang `ECONNREFUSED` nen `tts_generated_count=0`.
- Refactor giam node cho `Book Review` (UI clean + flow gon hon):
  - Bo 3 node khong can thiet: `Prepare Session + Init Event`, `Persist Media Debug (Worker)`, `Send Informations`.
  - `Parse Review Sections` nay tao luon `session_token` + `event_type=init_review`, route truc tiep sang `Set Config (Worker)`.
  - Flow notify worker doi thanh `Build Notify Payload (Worker) -> Notify via Shared Workflow (Main)` (khong qua split node trung gian).
  - Cap nhat automation scripts theo topology moi:
    - `scripts/workflows/tests/test-book-review-checklist.mjs` bo hard requirement node cu, them assert route moi.
    - `scripts/workflows/tests/run-book-review-e2e.sh` doi required node preflight sang `Set Config (Worker)`.
  - Verify lai:
    - Checklist PASS `9/9`.
    - E2E PASS (execution `1576`, webhook `200`).
  - Tiep tuc toi gian cum Drive-persist de giam clutter UI:
    - Bo nhanh manifest file: `If Persist Manifest File (Worker)`, `Google Drive Save Manifest File (Worker)`, `Merge Manifest File Context (Worker)`, `Prepare Manifest File Link (Worker)`.
    - Bo `If Session Sheet Exists (Worker)`; flow sheet nay create-moi 1 lan trong media finalize path.
    - Tong so node workflow chinh giam them: `65 -> 60`.
  - Verify lan 2:
    - Checklist PASS `9/9`.
    - E2E PASS (execution `1578`, webhook `200`).
- Don gian hoa luong notify `Book Review` theo huong shared notifier truc tiep:
  - Bo node gate `If Should Notify Externally (Worker)`.
  - Bo field `should_notify_externally` trong payload start + worker.
  - Noi truc tiep `Send Informations` -> `Set Notify Targets (Main)` -> `Notify via Shared Workflow (Main)`.
  - Quy tac gate notify chi con `notify_targets` (`telegram/ggchat/all` de gui, `none` de skip), de debug thieu notify de hon.
- Fix UX thong bao preview/link Drive:
  - Bo noi dung placeholder `Link Drive se duoc gui trong thong bao tiep theo` trong `sendReviewPreview`.
  - `sendReviewPreview` chi gui khi da co link Drive thuc te.
  - Them node `Notify Session Drive Links (Worker)` sau `Finalize Session Assets Package (Worker)` de gui Telegram message chua link Drive (review/metadata/folder/sheet) ngay khi persist xong.
- Refactor tiep luong notify + asset theo feedback runtime:
  - `If Final Success Event (Worker)` ca 2 nhanh deu route vao `Process Media Assets (Worker)`; media branch duoc gate ben trong node theo event final (`metadata_continue`/`auto_continue_metadata`) de tranh chay TTS/Anh som, nhung van tao/persist session assets cho init/review change.
  - Bo spam notify hub: `Build Notify Payload (Worker)` + start payload (`Code in JavaScript`) mac dinh `notify_targets='none'` (khong con message `n8n INFO: Book Review` du).
  - `Set Notify Targets (Main)` doi sang fallback expression, ton trong `notify_targets` tren tung payload thay vi override cung.
  - Them node `Send Review QC And Action (Worker)` sau `Notify Session Drive Links (Worker)` de gui block `[QC REVIEW]` + buttons sau khi da co link Drive.
  - Bo co `skip_worker_notify` trong worker flow.
  - Nang cap progress helper trong `Handle Reviewer Event`: thong diep step co elapsed minutes (`da cho X phut`) va auto edit moi 60s, sau khi xong se xoa message.
- Dieu chinh nhanh theo feedback "co message moi gui":
  - Them node `If Has Notify Message (Main)` sau `Send Informations`; chi item co `message` moi di tiep sang `Set Notify Targets (Main)` va shared router.
  - `Set Notify Targets (Main)` quay lai set cung placeholder env (khong phu thuoc payload `notify_targets`).
  - Shared workflow `Shared Notification Router` cap nhat: Telegram uu tien gui `message` neu co, fallback moi dung `title + body` (giam prefix `n8n INFO` cho cac message step).
- Fix UX callback/progress:
  - Bo start notify tĩnh (`Code in JavaScript` set `message=''`, `notify_targets='none'`) de tranh hien thong bao khong update.
  - `lockCallbackActionMessage` khong con `editMessageText` voi prefix `✅ ...`; chi clear inline keyboard.
  - Refactor tiep Book Review workflow theo feedback runtime Telegram + Drive:
  - Progress message trong `Handle Reviewer Event` cap nhat moi 3 giay (hien thi elapsed theo giay) va van auto-delete khi step xong.
  - Bo callback ack text `Da ghi nhan tiep tuc review/metadata` (callback query chi ack silent + clear inline keyboard).
  - Session drive context (folder/file/sheet IDs + URLs) duoc luu/restore trong payload session; bo sung node `Persist Session Asset Context (Worker)` de ghi nguoc context sau moi lan persist.
  - `Prepare Session Drive Context (Worker)` chi tao folder/subfolder khi thieu ID, giu on dinh 1 folder/session khi reviewer tiep tuc chinh sua.
  - Tach persist theo process/event:
    - `init_review`/`review_change`: review file.
    - `review_continue`/`auto_continue_review`/`metadata_change`: metadata file.
    - `metadata_continue`/`auto_continue_metadata`: manifest + session sheet.
  - Them update path theo file ID cho review/metadata (`Google Drive Update Review File (Worker)`, `Google Drive Update Metadata File (Worker)`) de replace noi dung thay vi tao file moi.
  - Metadata preview da gui link Drive (qua `Notify Session Drive Links`) thay vi gui block text metadata.
  - `Send Review QC And Action (Worker)` cap nhat nhanh metadata: message metadata action se gui link Drive (`metadata file`, `session folder`, `session sheet`) khi co, khong con text chung khong link.
  - Don gian hoa reviewer flow theo huong 1-gate:
    - Master prompt bo sung contract metadata block (`<<<METADATA_JSON>>> ... <<<END_METADATA_JSON>>>`) va `Parse Review Sections` boc tach metadata tu response ban dau.
    - Session bootstrap + worker stage doi sang `media_pending`; callback Telegram chi con 2 action `Tao Media`/`Dung` (`brv:media:c|s:<token>`).
    - `Prepare Session Assets Package (Worker)` persist theo event moi:
      - `init_review`: review file + metadata file.
      - `media_continue`: manifest + session sheet + media assets.
    - `Notify Session Drive Links (Worker)` chi gui cho `init_review`, kem link review/metadata/folder/sheet.
    - `Process Media Assets (Worker)` + `If Final Success Event (Worker)` doi gate sang `media_continue` (co giu backward-compatible event cu trong parser/if conditions).
    - QC tach khoi gate media: `Send Review QC And Action (Worker)` gui buttons `Tao Media|Dung` truoc, sau do moi danh gia va gui block `[QC REVIEW]` (khong con action tiep tuc QC).
    - Cap nhat tooling/test docs theo flow moi: `run-book-review-full-e2e.sh` chuyen sang 2 buoc (`start -> media_continue`) va README/testing incidents dong bo mo ta.

## 2026-03-27
- Them ghi chu moi truong agent trong `README.md`: neu shell khong co `node`/`npm` thi uu tien patch bang `jq` + `apply_patch`, va check `command -v node` truoc khi chay checklist `.mjs`.
- Chuan hoa ghi chu moi truong agent: truong hop `nvm` khien shell agent khong thay `node`, can verify/chay checklist qua shell interactive `zsh -lic` truoc khi ket luan thieu Node.
- Refactor media branch book-review sang topology node-based: `Process Media Assets (chunk+gate) -> Generate Image Assets + Generate TTS Assets (parallel) -> Merge Media Results -> Finalize Media Assets -> Build Notify Payload`.
- Book-review workflow them media branch truoc notify success:
  - Them chuoi node media worker: `Process Media Assets (Worker)` -> `Generate Image Assets (Worker)` + `Generate TTS Assets (Worker)` -> `Merge Media Results (Worker)` -> `Finalize Media Assets (Worker)` -> `Build Notify Payload (Worker)`.
  - Chi chay media branch cho final-success event (`metadata_continue`, `auto_continue_metadata`).
  - Tach review thanh chunk 3 cau, chay song song nhanh image + TTS, merge deterministic theo `chunk_key`.
  - Them output moi: `media_chunks`, `media_assets`, `media_debug_full`, `media_pipeline_status`, `media_stats`.
  - `Build Notify Payload (Worker)` bo sung summary media (`media_status`, `media_assets` count) trong `details`.
- Them config media trong `Set Config (Main/Worker)`: `image_*`, `tts_*` (bao gom `image_parallelism`, `tts_parallelism`).
- Cap nhat tooling:
  - `scripts/workflows/import/import-workflow.sh` bo sung inject env media (`IMAGE_API_BASE_URL`, `IMAGE_API_KEY`, `TTS_API_BASE_URL`, `TTS_VOICE_ID`).
  - `scripts/workflows/sync/sync-workflows-from-n8n.sh` sanitize `image_api_key` ve rong khi sync --apply.
- Cap nhat checklist automation `scripts/workflows/tests/test-book-review-checklist.mjs` voi case moi cho media topology + media behavior contract.
- Them script kiem tra chat luong media data theo execution (`scripts/workflows/tests/check-book-review-media-output.sh`): in media summary, check schema contract, thong ke error reasons, ho tro strict gate.
- Hardening TTS localhost connectivity:
  - Chuyen default `tts_api_base_url` sang `http://127.0.0.1:8001` (Set Config + import default) de tranh resolve IPv6 `::1`.
  - Bo sung normalize trong node `Generate TTS Assets (Worker)`: neu URL la `localhost` thi map sang `127.0.0.1` truoc khi goi `/stream`.
- Tang kha nang debug tren n8n UI:
  - Them node `Media Debug Snapshot (Worker)` giua `Finalize Media Assets (Worker)` va `Build Notify Payload (Worker)`.
  - Node nay emit `media_debug_snapshot`, `media_debug_preview`, `media_debug_failed_preview` de xem nhanh tren execution UI.
- Mo rong debug media theo huong UI-first + DB fallback:
  - `Media Debug Snapshot (Worker)` bo sung `media_debug_ui_card` de doc nhanh tren execution UI.
  - Them node `Persist Media Debug (Worker)` sau snapshot, soft-fail va mac dinh `disabled`; khi bat `media_debug_store_enabled=true` se upsert vao Data Table `book_review_media_debug` (co the doi ten qua `media_debug_store_name`).
  - Them config moi trong `Set Config (Main/Worker)`: `media_debug_store_enabled`, `media_debug_store_name`, `media_debug_store_include_full`, `media_debug_store_max_chars`.
  - `Build Notify Payload (Worker)` bo sung detail field `media_store` + `media_store_error` de theo doi trang thai persist debug.
  - Script `check-book-review-media-output.sh` ho tro:
    - in URL execution UI neu co `N8N_EDITOR_BASE_URL`,
    - doc summary uu tien tu `Persist Media Debug (Worker)`/`Media Debug Snapshot (Worker)`,
    - loc execution final-success qua `BOOK_REVIEW_MEDIA_FINAL_ONLY=true` va bo qua execution media-legacy (khong co `Media Debug Snapshot`).
  - Script `run-book-review-e2e.sh` in them `execution_ui_url` de mo execution ngay sau khi test.
- Don dep trigger + artifact debug:
  - Xoa node du `When chat message received` khoi `book-review-gemini.workflow.json`; workflow start 100% tu `Telegram Trigger` + command `book-review ...`.
  - Xoa 4 workflow debug tren n8n UI: `Codex Telegram File Debug`, `Codex Telegram File Bridge Test`, `Codex Telegram File Bridge Test 2`, `Codex Telegram Node SendDocument Test`.
  - Xoa file debug khong con dung trong repo: `workflows/shared/telegram-send-text-file.workflow.json`, `scripts/workflows/import/import-telegram-file-bridge-workflow.sh`.
  - Cap nhat checklist + e2e runner theo flow moi (e2e simulate Telegram webhook thay vi chat trigger webhook cu).
- Chuan hoa bo sub-agent theo huong "best-practice framework":
  - `AGENT_RULES_GLOBAL.md`: nang cap muc 6 thanh framework day du (roster doi ten, orchestration diagram, handoff contract, QC gates G0..G4, done criteria).
  - `AGENT_RULES_PROJECT.md`: cap nhat tham chieu roster moi (`Conductor/Planner/FlowBuilder/Builder/Runner/Gatekeeper`).
  - `RULES_AND_SKILLS.md` (Skill H): bo sung skill pack thuc thi (`PM-Planning`, `Workflow-Edit-n8n`, `Code-Edit`, `Ops-E2E`, `QC-Gate`).
  - `README.md`: them so do phoi hop nhanh + roster de onboarding de hon.
- Giam notify spam tren luong reviewer Telegram:
  - `Build Notify Payload (Router)` doi status dispatch sang `info` va ep `notify_targets='none'` de khong gui thong bao trung lap.
  - `Build Notify Payload (Worker)` chi gui notify ra ngoai khi `failed` hoac `success` cuoi (`metadata_continue`), bo qua cac su kien `info` trung gian.
- Lam sach noi dung review khi gui preview/final va khi dua vao QC:
  - Them helper `normalizeReviewForDisplay()` trong `Handle Reviewer Event` de bo marker `<<<SECTION|...>>>` / `<<<END_SECTION>>>`.
  - Ap dung helper cho `sendReviewPreview`, `sendFinalMessage`, va `runQc.review_excerpt` de tranh feedback ve SECTION khong lien mach.
- Rut gon lai bo script run theo feedback "de doc de chay":
  - `run-n8n.sh`: quay ve dang toi gian (load env + `n8n start`).
  - `run-n8n-docker.sh`: quay ve lenh docker n8n toi gian.
  - `run-cloudflared-tunnel.sh`: quay ve lenh cloudflared docker toi gian (nhan token argument hoac env).
- Refactor bo script run theo huong de dung hon:
  - `scripts/run/run-n8n.sh`: chi giu mode n8n local.
  - `scripts/run/run-n8n-docker.sh`: tach rieng cho luong n8n Docker.
  - `scripts/run/run-cloudflared-tunnel.sh`: tach rieng cho Cloudflared tunnel qua Docker.
- Don gian hoa README Quick Start theo 3 script tach biet (n8n local / n8n docker / tunnel), giam options da mode trong 1 script.
- Them script `scripts/run/run-n8n.sh` de start n8n gon hon: mac dinh run local, co auto-bootstrap khi thieu dependency, va co `--bootstrap` de force bootstrap moi lan chay.
- Bo sung docker mode trong script run (`--docker`, `--detach`, `--docker-image`, `--docker-name`, `--port`) de chay n8n bang 1 lenh.
- Hardening docker runner trong `run-n8n.sh`: check Docker daemon truoc khi chay, chmod data dir bind-mount de giam loi permission, va auto in `docker logs` neu container crash som.
- Them cloudflared flags trong `run-n8n.sh` (`--cloudflared`, `--cloudflared-token`, `--cloudflared-image`, `--cloudflared-name`) de bat tunnel sidecar cung lenh run n8n; support env fallback `CLOUDFLARED_TUNNEL_TOKEN`.
- Cap nhat `README.md` Quick Start sang flow 1-lenh (`run-n8n.sh`) va bo sung bang options cho script moi.
- Chuan hoa `env.n8n.local`: bo bien token tunnel cu, giu cau hinh public URL thong qua `WEBHOOK_URL` + `N8N_EDITOR_BASE_URL`.
- Cap nhat `env.n8n.local.example` bo sung 2 bien `WEBHOOK_URL` va `N8N_EDITOR_BASE_URL`.
- Cap nhat `README.md` giai thich ro vai tro rieng cua `WEBHOOK_URL` (webhook public, uu tien HTTPS) va `N8N_EDITOR_BASE_URL` (URL mo editor), tranh nham hai bien bat buoc phai giong het.
- Gom luong book-review ve 1 workflow hop nhat (`book-review-gemini.workflow.json`) de de theo doi trong n8n UI, thay vi chia thanh file router/worker rieng.
- Cap nhat dong bo importer/checklist/e2e/registry/docs theo kien truc 1 workflow; wrapper `import-book-review-workflow.sh` gio chi import 1 template + prompt files.
- Don dep legacy import/sync fields lien quan `reviewer_worker_workflow_path` va `Execute Reviewer Worker` sau khi da gom workflow.
- Xoa 2 workflow cu tren n8n: `Book Review Reviewer Router` va `Book Review Reviewer Worker`.
- Fix luong worker/main notify: worker bo qua item thieu `event_type` (khong bao failed gia), va `Prepare Session + Init Event` giu nguyen `stop_reason` upstream (vi du `api_error`) thay vi ghi de `review_empty`.
- Fix runtime error `Handle Reviewer Event: A 'json' property isn't an object [item 0]` bang cach doi guard thieu `event_type` sang output object hop le (`skip_worker_notify=true`) va chan notify node worker khi item skip/invalid.
- Refactor notify hub theo topology UI moi: them `Send Informations` (`Split Out`) + `Merge`, gom moi payload thong bao vao contract `send_informations`, va giu full data qua node dieu huong.
- Chuan hoa luong notify: `parse notify data -> Send Informations -> Set Notify Targets (Main) -> Notify via Shared Workflow (Main)`; bo phu thuoc vao `Set Notify Targets (Router/Worker)` rieng.
- Thay code placeholder `Code in JavaScript` bang parser thong diep bat dau `Bắt đầu review: {{user_input}}`.
- Chuyen cac node `Build Notify Payload (Main/Router/Worker)` sang `runOnceForEachItem`, emit payload chuan + `send_informations`.
- Cap nhat `Return Chat Response` de pick deterministic chat payload theo `chat_priority` tu output cua `Send Informations` (uu tien start message, fallback ACK).
- Hardening webhook response: dam bao nhanh worker-skip van tao 1 payload notify an toan (khong de `Split Out` ra 0 item) va noi `Notify via Shared Workflow (Main)` ve `Return Chat Response` de tranh loi `No item to return was found`.
- Cap nhat checklist automation (`test-book-review-checklist.mjs`) theo topology/contract moi; ket qua PASS 11/11.
- Chay import lai workflow book-review sau khi sua JSON va verify E2E (`run-book-review-e2e.sh`) dat `webhook_http_code=200`.
- Cap nhat rules project: bo sung policy clean UI grouping + routing nodes phai giu full data.

## 2026-03-28
- Tinh chinh workflow `Book Review` theo huong node-first + Telegram progress UX:
  - Bo node `Return Chat Response` khoi luong chinh (khong con chat-response branch).
  - Them node `Finalize Step Progress Messages (Worker)` de xoa cac message tien trinh Telegram sau khi step/media hoan tat.
  - `Handle Reviewer Event` doi thong diep ACK cu (`Da nhan lenh ... Dang xu ly`) sang thong diep tien trinh theo step:
    - `Dang tao noi dung...`
    - `QC dang danh gia...`
    - `Dang tao TTS...`
    - `Dang tao anh...`
  - Bo gui `[FINAL OUTPUT]` + bo gui lai `Metadata cuoi` tren Telegram; thay bang thong diep tiep tuc media (`Dang xu ly TTS va anh...`).
  - Worker notify payload bo sung link Drive/session (`review_file`, `metadata_file`, `manifest_file`, `session_folder`, `session_sheet`) de gui ve Telegram qua shared notify router.
- Chuan hoa ten session folder Drive:
  - `Prepare Session Drive Context (Worker)` doi format folder sang `book-review-<ten-sach-slug>-<sessionkey>`.
- Cap nhat script E2E nhanh:
  - `scripts/workflows/tests/run-book-review-e2e.sh` bo assert node `Return Chat Response` vi node nay da duoc loai bo.
- Fix notify start-command cho Telegram:
  - Revert parser start-command ve dung format goc `book-review ...` (khong mo rong typo alias).
  - Sua node start payload (`Code in JavaScript`) de bat `should_notify_externally=true`, nham dam bao thong bao tien trinh dau vao duoc gui ra Telegram ngay khi bat dau.
- Bo sung config/env cho Google Drive de chuan bi tach media workflow:
  - Them 2 field moi trong `Set Config (Main/Worker)`: `gdrive_root_folder_id`, `gdrive_credential_name`.
  - `import-workflow.sh` doc env `GDRIVE_ROOT_FOLDER_ID`, `GDRIVE_CREDENTIAL_NAME` va inject vao workflow khi import.
  - `sync-workflows-from-n8n.sh` sanitize 2 field tren ve placeholder (`__GDRIVE_ROOT_FOLDER_ID__`, `__GDRIVE_CREDENTIAL_NAME__`) de tranh leak config local.
  - Cap nhat `env.cliproxy.local.example`, `README.md`, va checklist automation de cover contract config moi.
- Refactor media debug branch theo huong DB-first + checkpoint:
  - Bo node `Media Debug Snapshot (Worker)` khoi topology.
  - `Process Media Assets (Worker)` now fan-out them 1 nhanh vao `Persist Media Debug (Worker)` de ghi checkpoint som (`media_debug_phase=prepared`/`skipped_prepared`) truoc khi chay image + TTS.
  - `Finalize Media Assets (Worker)` tiep tuc ghi checkpoint cuoi (`media_debug_phase=finalized`) va bo sung `media_finished_at`, `media_elapsed_seconds`.
  - Them node `Route Final Persist To Notify (Worker)` de chi cho checkpoint `finalized` di tiep sang `Build Notify Payload (Worker)`, tranh notify duplicate.
  - Fix runtime error route node: doi mode sang `runOnceForAllItems` + filter item theo `media_debug_phase` (khong con loi `A 'json' property isn't an object`).
- Tang default runtime cho media dai:
  - `image_timeout_ms` + `tts_timeout_ms` default `900000` (clamp max `7200000`).
  - `image_parallelism` + `tts_parallelism` default `2` (clamp `1..5`).
- Mo rong persist payload de debug tot hon:
  - `Persist Media Debug (Worker)` ghi them phase/time metrics vao `debug_payload_json` va `debug_key`.
  - Hardening JSON debug payload: mac dinh chi luu `media_debug_full_count` (khong dump full array), chi mo rong full data khi `media_debug_store_include_full=true`, va truncate theo dinh dang JSON hop le de script check co the parse on dinh.
- Cap nhat tooling test/debug:
  - `check-book-review-media-output.sh` uu tien doc checkpoint `finalized` (neu co), in them `persist_runs_count` + `persist_phases`.
  - `check-book-review-debug-table.sh` fix query `sortBy` (URL-encode) va in them `media_debug_phase`, `media_started_at`, `media_finished_at`, `media_elapsed_seconds`.
  - `run-book-review-e2e.sh` bo sung `payload_update_id` trace va stricter mapping execution theo `update_id` (`BOOK_REVIEW_E2E_STRICT_UPDATE_ID=true` mac dinh) de tranh bat nham execution cu.
- Checklist automation cap nhat theo topology moi (`Persist -> Route Final Persist -> Build Notify`) va pass `17/17`.

## 2026-03-25T03:13:45Z
- Workflow sync (UI -> JSON) completed with no file changes.
- Run mode=apply, total=3, changed=0, unchanged=3, failed=0.

## 2026-03-25T05:00:00Z
- Added shared workflow `Shared Desktop Notify` for OS-level notifications via `Execute Command`.
- Updated demo workflows (Gemini/OpenAI/Book Review) to always call shared notify workflow with dynamic success/failed payloads.
- Updated import scripts to auto-bind `Notify via Shared Workflow.workflowPath` (source `localFile`) at import time.
- Added project rule requiring each workflow to include shared notify at the end.

## 2026-03-25T05:15:00Z
- Renamed import wrapper to `scripts/workflows/import/import-shared-desktop-notify-workflow.sh` for naming consistency.
- Extended `Shared Desktop Notify` to send Telegram notifications in parallel with desktop notifications.
- Telegram branch is optional and auto-skips when `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` is missing.

## 2026-03-25T05:40:00Z
- Refactored shared notify workflow to `Shared Notification Router` with multi-channel routing by `notify_targets`.
- Added Google Chat support via webhook (`GGCHAT_WEBHOOK_URL`) and kept Telegram/Desktop support.
- Added `Set Notify Targets` node in each main workflow to control destinations per workflow without editing router logic.
- Renamed canonical import wrapper to `scripts/workflows/import/import-shared-notification-router-workflow.sh` and kept old script names as deprecated aliases.

## 2026-03-25T05:55:00Z
- Removed deprecated import aliases `import-shared-desktop-notify-workflow.sh` and `import-shared-notify-workflow.sh`.
- Updated rules/docs to reference only `Shared Notification Router` and canonical import script.
- Deleted legacy workflow `Shared Desktop Notify` from n8n (`z3jShmBEcC7nQ246`).

## 2026-03-25T17:18:23Z
- Workflow sync (UI -> JSON) updated 1 workflow(s).
- Changed: Book Review Gemini via CLIProxyAPI. Run mode=apply, total=1, unchanged=0, failed=0.

## 2026-03-25T18:43:49Z
- Workflow sync (UI -> JSON) completed with no file changes.
- Run mode=apply, total=1, changed=0, unchanged=1, failed=0.

## 2026-03-26T00:00:00Z
- Added a sub-agent delegation playbook for feature work in `RULES_AND_SKILLS.md` (Skill H).
- Documented the recommended split of `explorer` / `worker` (script) / `worker` (test) and when not to parallelize around shared workflow JSON.
- Updated `README.md` to point agents to the new playbook so delegation strategy is visible from the main runbook.

## 2026-03-26
- Simplified `book-review-gemini` topology by removing pass-through node `AI QC + Internal Scoring`; `Parse Review Sections` now connects directly to `Set Notify Targets`.
- Updated automation checks to match new topology (`test-book-review-checklist.mjs`, `run-book-review-e2e.sh`) and enforced direct connection assertion.
- Updated workflow documentation to reflect the 9-node flow.

## 2026-03-26T11:00:24Z
- Workflow sync (UI -> JSON) completed with no file changes.
- Run mode=apply, total=4, changed=0, unchanged=4, failed=0.

## 2026-03-26T11:01:14Z
- Workflow sync (UI -> JSON) updated 1 workflow(s).
- Changed: Book Review Gemini via CLIProxyAPI. Run mode=apply, total=4, unchanged=3, failed=0.

## 2026-03-26T13:17:20Z
- Re-architected book-review reviewer flow from monolithic orchestrator to event-driven 3-workflow topology:
  - `Book Review Gemini via CLIProxyAPI` (main ACK async + session dispatch)
  - `Book Review Reviewer Router` (Telegram callback/message + scheduler timeout routing)
  - `Book Review Reviewer Worker` (review/metadata event handling + finalize)
- Added session persistence via n8n Data Table API (`book_review_sessions`) keyed by `session_token` with JSON-string payload + required fields.
- Updated import/sync automation:
  - `import-book-review-workflow.sh` now imports all 3 book-review workflows in one command.
  - `import-workflow.sh` now injects/sanitizes `n8n_api_url`, `n8n_api_key`, `reviewer_worker_workflow_path`, and supports Telegram Trigger credential binding.
  - `sync-workflows-from-n8n.sh` sanitizer now restores new placeholders for worker path + n8n API fields.
- Replaced checklist assertions to validate event-driven contracts (async ACK, router callback format, worker event types, anti-polling) while keeping generate/parse regressions.
- Updated `README.md` to document the new async contract and 3-workflow architecture.

## 2026-03-28T05:54:10Z
- Refactor workflow naming + split architecture theo chuan moi:
  - `Book Review` (`workflows/book-review/book-review.workflow.json`)
  - `Text To Images` (`workflows/book-review/text-to-images.workflow.json`)
  - `TTS` (`workflows/book-review/tts.workflow.json`)
- Main workflow (`Book Review`) giu full review/QC/router/worker, nhung doi media branch sang goi subworkflow qua `Execute Workflow` (database source):
  - `Generate Image Assets (Worker)` goi `__TEXT_TO_IMAGES_WORKFLOW_ID__`
  - `Generate TTS Assets (Worker)` goi `__TTS_WORKFLOW_ID__`
- Them contract placeholders moi trong `Set Config (Main/Worker)`:
  - `text_to_images_workflow_id`
  - `tts_workflow_id`
- Tao 2 workflow media reusable (`Text To Images`, `TTS`) ho tro:
  - Input mode: `form_upload | drive_url` (full URL)
  - Output mode: `inline | drive_export`
  - Node-first routing: `Form Trigger`, `Execute Workflow Trigger`, `Switch`, `Google Drive`, `Merge`, `Convert To File`, `HTTP Request`
- Cap nhat tooling/import/sync:
  - `scripts/workflows/import/import-book-review-workflow.sh` import theo thu tu `text-to-images -> tts -> book-review` va chi inject prompt cho `book-review`.
  - `scripts/workflows/import/import-workflow.sh` resolve + inject workflow IDs cho 2 subworkflow media.
  - `scripts/workflows/sync/sync-workflows-from-n8n.sh` sanitize them placeholder `__TEXT_TO_IMAGES_WORKFLOW_ID__` va `__TTS_WORKFLOW_ID__`.
- Cap nhat test/runtime scripts:
  - `test-book-review-checklist.mjs` viet lai theo topology 3-workflow + contract media modes.
  - `test-book-review-checklist.sh`, `run-book-review-e2e.sh`, `check-book-review-media-output.sh` doi template/name moi.
- Cap nhat docs:
  - `README.md`, `docs/book-review-workflow.md`, `scripts/README.md` theo naming + topology moi.
- Chay import upsert thanh cong tren n8n:
  - `Text To Images`: `tcF2wcybrmgzFNew`
  - `TTS`: `2F1jBI12C6NtslBN`
  - `Book Review`: `4g3N5urBBIuo9HcJ`
- `workflow-registry.json` cap nhat 3 entries moi, loai bo entry cu `Book Review Gemini via CLIProxyAPI`.
- Hotfix import runtime cho media subworkflow:
  - `import-workflow.sh` auto resolve ID theo name (`Text To Images`, `TTS`) khi template can, va fail fast neu chua resolve duoc (tranh import xong nhung runtime goi placeholder).
  - `README.md` cap nhat lai mo ta sanitize theo placeholder ID (`text_to_images_workflow_id`, `tts_workflow_id`).
- Hardening full E2E runner `run-book-review-full-e2e.sh`:
  - Fix map execution theo `update_id` de tranh miss execution cung giay (loi so sanh chuoi `startedAt` co milliseconds).
  - Bo sung fail message ro rang cho session sheet: neu `Create Session Sheet (Worker)` tra loi `>=400`, script in chi tiet loi Google API thay vi bao chung chung `Session asset links are incomplete`.
- Fix media finalize + session asset link trong `book-review.workflow.json`:
  - `Prepare Image/TTS Workflow Input (Worker)` khong con tra `[]` trong `runOnceForEachItem` (tranh runtime error `A 'json' property isn't an object`).
  - `Finalize Media Assets (Worker)` bo sung fallback merge theo `media_image_items/media_tts_items` khi `media_chunks` khong day du, va normalize status `skipped_not_requested`.
  - Doi clash policy cua cac merge node file/sheet context sang `preferInput2` de lay dung ID tu node save/create (khong ghi de bang folder id).
- Cap nhat docs (`README.md`, `scripts/README.md`) cho full E2E script moi + prerequisite bat `Google Sheets API` (`sheets.googleapis.com`) de pass kiem tra `session_sheet_url`.
- Tach troubleshooting khoi README de giam noise:
  - Tao file `docs/testing-runtime-incidents.md` luu nguyen nhan run cham, preflight checklist truoc full E2E, va incident log runtime khong lien quan business logic.
  - Muc `## Troubleshooting nhanh` trong `README.md` duoc rut gon thanh 1 link tro den file docs tren.
- Fix context mat sau khi ghi Google Sheet rows trong `book-review`:
  - Them node `Merge Session Sheet Write Context (Worker)` de combine output cua `Write Session Sheet Rows (Worker)` voi context session truoc do.
  - `Finalize Session Assets Package (Worker)` va `Persist Media Debug (Worker)` gio nhan du `media_pipeline_status` + full session asset links.
- Xac nhan runtime sau khi bat `Google Sheets API`:
  - `run-book-review-full-e2e.sh` pass (HTTP 200 cho start/review/metadata, `session_sheet_create_status_code=200`, co `session_sheet_url`).
- Fix bug media folder + ten file TTS theo feedback runtime:
  - `book-review.workflow.json`: doi clash handling cua `Merge Session Folder Context (Worker)`, `Merge Voice Folder Context (Worker)`, `Merge Image Folder Context (Worker)` sang `preferInput2` de giu dung folder id vua tao (khong bi ghi de boi session folder id).
  - `tts.workflow.json`: `Normalize TTS Response` them helper `chooseVoiceFileName()` de bo ten generic nhu `stream`, ep filename theo `chunk_key` (`tts-<chunk_key>.wav|mp3`) khi provider tra ve ten chung.
  - Verify runtime (execution `1465`): `voice_folder_id` tach rieng voi `session_folder_id` va co URL folder `voice` dung.

## 2026-03-29
- Migrate runtime tu CLI Proxy sang 9router:
  - Them script moi `scripts/9router/setup-9router.sh` (install/start/verify/import workflow).
  - Doi default env cua cac script `run/import/tests` sang `env.9router.local` + fallback tuong thich nguoc `env.cliproxy.local`.
  - Core importer map `ROUTER_BASE_URL`/`ROUTER_API_KEY` vao workflow config (va van fallback `CLIPROXY_*` de tranh vo workflow cu).
  - Cap nhat docs van hanh (`README.md`, `scripts/README.md`, `docs/testing-runtime-incidents.md`) va bo sung `env.9router.local.example`.
  - Giu `scripts/cliproxy/setup-cliproxy-oauth.sh` dang wrapper redirect sang setup 9router de khong vo command cu.
- Chuan hoa naming trung tinh `proxy` de de doi provider ve sau:
  - Them entrypoint chinh `scripts/proxy/setup-proxy.sh`; giu `scripts/9router/setup-9router.sh` va `scripts/cliproxy/setup-cliproxy-oauth.sh` lam wrapper tuong thich nguoc.
  - Doi default env sang `env.proxy.local` + bo sung `env.proxy.local.example`; loai bo 2 file example cu (`env.9router.local.example`, `env.cliproxy.local.example`) de giam nham lan.
  - Doi cac script `run/import/tests` sang bien `PROXY_*`/`PROXY_ENV_FILE`, fallback tu `ROUTER_*` va `CLIPROXY_*`.
  - Cap nhat importer/sync de support them assignment `proxy_base_url`/`proxy_api_key` ben canh `router_*` va `cliproxy_*`.
  - Cap nhat docs van hanh (`README.md`, `scripts/README.md`, `docs/testing-runtime-incidents.md`) theo naming `proxy`.
