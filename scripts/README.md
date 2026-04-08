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
- `import-momo-ai-assistant-tool-demo-commands-workflow.sh`: import subworkflow demo command tool cho `MoMo AI Assistant`
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
- `test-momo-ai-assistant-checklist.mjs`: static topology/contract checklist cho top-level + state store + state cleanup + router tool + healthcheck tool + demo command tool cua `MoMo AI Assistant`

## Book Review notes
- Workflow canonical: `workflows/book-review/book-review.workflow.json`
- Shared TTS workflows: `workflows/media/tts.workflow.json` (`TTS VieNeu`) + `workflows/media/tts-vrex.workflow.json` (`TTS VREX`)
- Shared session store: `workflows/shared/data-table-store.workflow.json`
- Book Review hien da persist reviewer session state, handle `continueReview` / `stopReview`, va wire TTS narration branch sau `reviewPassed` qua `Call TTS VREX`
- Backlog visual/E2E tiep theo: `docs/book-review-todo.md`
