# Scripts

## Muc tieu
- Giu cac script import/sync/checklist gon, bieu dat dung trang thai hien tai cua repo.
- Khong duy tri wrapper hay runner song song cho cung 1 workflow canonical.

## Import
- `import-book-review-workflow.sh`: import workflow canonical `Book Review`
- `import-data-table-store-workflow.sh`: import subworkflow Data Table generic cho session state
- `import-gg-drive-manager-workflow.sh`: import subworkflow Drive reusable
- `import-gg-sheet-manager-workflow.sh`: import subworkflow Sheet reusable
- `import-text-to-images-workflow.sh`: import shared workflow Text To Images
- `import-text-to-videos-veo3-workflow.sh`: import shared workflow Text To Videos VEO3
- `import-tts-workflow.sh`: import shared workflow TTS
- `import-shared-notification-router-workflow.sh`: import shared notification workflow
- `import-all-workflows.sh`: import tat ca wrapper theo thu tu uu tien

## Sync
- `sync-workflows-from-n8n.sh`: sync workflow state tu n8n UI ve JSON templates

## Tests
- `test-book-review-checklist.sh`: wrapper chay checklist cho Book Review
- `test-book-review-checklist.mjs`: static topology/contract checklist cho workflow canonical

## Book Review notes
- Workflow canonical: `workflows/book-review/book-review.workflow.json`
- Shared session store: `workflows/shared/data-table-store.workflow.json`
- Book Review hien da persist reviewer session state va handle `continueReview` / `stopReview`
- Backlog media/TTS branch tiep theo: `docs/book-review-todo.md`
