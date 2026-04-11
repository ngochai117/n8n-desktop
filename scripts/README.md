# Scripts

## Muc tieu
- Giu cac script import/sync/checklist gon, bieu dat dung trang thai hien tai cua repo.
- Khong duy tri wrapper hay runner song song cho cung 1 workflow canonical.

## Import
- `import-book-review-workflow.sh`: import workflow canonical `Book Review`
- `import-momo-ai-assistant-workflow.sh`: import workflow `MoMo AI Assistant`
- `import-momo-ai-assistant-state-store-workflow.sh`: import subworkflow state store explicit cho `MoMo AI Assistant`
- `import-momo-ai-assistant-state-cleanup-workflow.sh`: import subworkflow cleanup state (`purgeAllState`) cho `MoMo AI Assistant`
- `import-momo-ai-assistant-tool-router-workflow.sh`: import subworkflow router tool cho `MoMo AI Assistant`; wrapper nay tu scan token `__REGISTRY__:<workflow name>` trong router config de import dependency, patch workflow IDs, va auto-activate router luc import
- `import-momo-ai-assistant-tool-sprint-healthcheck-workflow.sh`: import subworkflow read-only sprint healthcheck cho `MoMo AI Assistant`
- `import-momo-ai-assistant-tool-sprint-release-workflow.sh`: import subworkflow deterministic sprint release tool (approve gate + strict execution) cho `MoMo AI Assistant`
- `import-momo-ai-assistant-tool-demo-commands-workflow.sh`: import subworkflow demo command tool (optional)
- `import-sprint-monitor-scheduler-workflow.sh`: import workflow `Sprint Monitor Scheduler`; wrapper nay import `Sprint Monitor Engine` truoc va patch registry token trong top-level template
- `import-sprint-monitor-engine-workflow.sh`: import workflow `Sprint Monitor Engine`
- `import-data-table-store-workflow.sh`: import subworkflow Data Table generic cho session state
- `import-gg-drive-manager-workflow.sh`: import subworkflow Drive reusable
- `import-gg-sheet-manager-workflow.sh`: import subworkflow Sheet reusable
- `import-text-to-images-workflow.sh`: import shared workflow Text To Images
- `import-text-to-videos-veo3-workflow.sh`: import shared workflow Text To Videos VEO3
- `import-tts-workflow.sh`: import shared workflow TTS VieNeu
- `import-tts-vrex-workflow.sh`: import shared workflow TTS VREX
- `import-shared-notification-router-workflow.sh`: import shared notification workflow
- `import-all-workflows.sh`: import tat ca wrapper theo thu tu uu tien

## Sync
- `sync-workflows-from-n8n.sh`: sync workflow state tu n8n UI ve JSON templates

## Tests
- `test-book-review-checklist.sh`: wrapper chay checklist cho Book Review
- `test-book-review-checklist.mjs`: static topology/contract checklist cho workflow canonical
- `test-tts-checklist.sh`: wrapper chay checklist cho `TTS VieNeu`
- `test-tts-checklist.mjs`: static topology/contract checklist cho workflow `TTS VieNeu`
- `test-tts-vrex-checklist.sh`: wrapper chay checklist cho `TTS VREX`
- `test-tts-vrex-checklist.mjs`: static topology/contract checklist cho workflow `TTS VREX`
- `test-momo-ai-assistant-checklist.sh`: wrapper chay checklist cho `MoMo AI Assistant`
- `test-momo-ai-assistant-checklist.mjs`: static topology/contract checklist cho top-level + state store + state cleanup + router tool + healthcheck tool + sprint release tool cua `MoMo AI Assistant`
- `test-sprint-monitor-checklist.sh`: wrapper chay checklist cho `Sprint Monitor`
- `test-sprint-monitor-checklist.mjs`: static topology/contract checklist cho `Sprint Monitor Scheduler` + `Sprint Monitor Engine` + support files

## Sprint Monitor workflow source
- Sprint Monitor duoc quan ly giong workflow khac: sua truc tiep cac template JSON trong `workflows/sprint-monitor/` va import lai bang `scripts/workflows/import/import-sprint-monitor-*.sh`

## Bootstrap
- `apply-sprint-monitor-schema.sh`: apply `docs/sprint-monitor/schema.sql` vao PostgreSQL local theo `SPRINT_MONITOR_PGURL` / `DATABASE_URL` hoac `PGHOST` / `PGDATABASE` / `PGUSER`
- `setup-sprint-monitor-neon.sh`: parse Neon connection string, ghi helper env vao `.vendor/sprint-monitor/neon.env`, apply schema, va in field Postgres de dien vao n8n UI; `--n8n-host` la host paste vao credential UI, thuong la Neon pooler host co `-pooler`, va script se fail sớm neu ban truyen placeholder nhu `POOLER_HOST`

## Book Review notes
- Workflow canonical: `workflows/book-review/book-review.workflow.json`
- Shared TTS workflows: `workflows/media/tts.workflow.json` (`TTS VieNeu`) + `workflows/media/tts-vrex.workflow.json` (`TTS VREX`)
- Shared session store: `workflows/shared/data-table-store.workflow.json`
- Book Review hien da persist reviewer session state, handle `continueReview` / `stopReview`, va wire TTS narration branch sau `reviewPassed` qua `Call TTS VREX`
- Backlog visual/E2E tiep theo: `docs/book-review-todo.md`
