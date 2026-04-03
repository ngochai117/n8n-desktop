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
- Media pipeline, TTS/visual branch, sheet/export, va E2E runtime van tiep tuc trong `docs/book-review-todo.md`.

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
```

Neu can shared workflows de dung tiep o backlog:
```bash
bash scripts/workflows/import/import-gg-sheet-manager-workflow.sh
bash scripts/workflows/import/import-text-to-images-workflow.sh
bash scripts/workflows/import/import-text-to-videos-veo3-workflow.sh
bash scripts/workflows/import/import-tts-workflow.sh
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
```

Checklist hien tai la static contract/topology checklist cho workflow canonical. Repo hien khong advertise full E2E runner cho Book Review cho den khi media branch va runtime E2E duoc rebuild day du.

## Env files
- `env.n8n.local.example`: env mau toi thieu. Mac dinh co the de trong; chi them bien khi can public URL, Cloudflare tunnel, hoac admin tooling nhu import/sync/MCP
- `env.proxy.local.example`: env mau cho proxy runtime. Khong con la input bat buoc cho import/sync workflow

## Repo map
- `workflows/book-review/book-review.workflow.json`: workflow canonical
- `workflows/shared/data-table-store.workflow.json`: subworkflow generic cho Data Table get/upsert
- `workflows/book-review/prompts/`: prompt source files
- `docs/book-review-workflow.md`: mo ta hien trang workflow canonical
- `docs/book-review-todo.md`: backlog tiep tuc
- `scripts/workflows/import/import-book-review-workflow.sh`: wrapper import canonical
- `scripts/workflows/tests/test-book-review-checklist.mjs`: checklist runner
