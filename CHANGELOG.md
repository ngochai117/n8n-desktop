# Changelog

Nhat ky thay doi chi tiet cua du an (dac biet cho workflow sync/import va automation scripts).

## Historical Entries Migrated from README Update Log (deduped)
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
- 2026-03-25: Chuyen default Gemini sang `gemini-3-flash-preview` va them fallback `gemini-2.5-pro` cho workflow review sach khi gap capacity `429`. Ly do: giam loi `MODEL_CAPACITY_EXHAUSTED` tren model pro preview.
- 2026-03-25: Import script sanitize `settings` truoc khi upsert workflow (giu `callerPolicy`/`availableInMCP`) de tranh loi `request/body/settings must NOT have additional properties` sau khi sync tu UI. Ly do: tang do on dinh cho vong lap UI -> JSON -> import.
- 2026-03-25: Tai cau truc thu muc `scripts/` theo domain (`bootstrap`, `cliproxy`, `workflows/{import,sync,tests}`) va cap nhat toan bo references. Ly do: giam roi, de mo rong khi so workflow/script tang.
- 2026-03-25: Tach master prompt workflow book review ra file rieng (`workflows/book-review/prompts/book-review-master-prompt.txt`) va inject vao workflow luc import. Ly do: de edit prompt ma khong phai sua `jsCode` dai trong JSON.
- 2026-03-25: Hardening registry workflow template path sang dang tuong doi + cap nhat importer/sync de auto resolve relative/absolute. Ly do: doi ten folder project van chay on dinh, khong vo path trong workflow-registry.
- 2026-03-25: Tach core importer thanh `scripts/workflows/import/import-workflow.sh`; cac wrapper (`import-gemini/openai/shared/book-review`) deu goi lai core nay. Ly do: dat ten trung lap ro hon va de mo rong them workflow moi.
- 2026-03-26: Sync workflow templates tu n8n UI ve JSON (apply, changed=1, unchanged=0, failed=0). Chi tiet: `CHANGELOG.md`.
- 2026-03-26: Sync workflow templates tu n8n UI ve JSON (apply, changed=0, unchanged=1, failed=0). Chi tiet: `CHANGELOG.md`.
- 2026-03-26: Fix workflow book-review: tra chat response truc tiep tu `Reviewer Orchestrator`, gom QC ve 1 nguon logic trong orchestrator (node AI QC giu pass-through), va sanitize `workflowPath` ve placeholder trong templates/sync script. Ly do: tranh mat metadata o response, tranh drift QC, va bo absolute path theo may local.

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
