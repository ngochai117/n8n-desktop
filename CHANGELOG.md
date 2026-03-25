# Changelog

Nhat ky thay doi chi tiet cua du an (dac biet cho workflow sync/import va automation scripts).

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
