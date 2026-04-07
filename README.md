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
- Workflow `MoMo AI Assistant` da duoc rebuild theo huong dedicated sprint-status pipeline.
- Topology toi gian:
  - `Manual Trigger`
  - `Schedule Trigger`
  - `Config Main` (Code node JSON object, de doc/de sua config nhanh)
  - `Get Active Sprint`
  - `Pick Active Sprint`
  - `If Active Sprint?`
  - `Get Sprint Issues`
  - `Aggregate Sprint Metrics`
  - `Write Sprint Review` + `Review Output Parser`
  - `Get User Directory` (Google Sheet `MoMoer`)
  - `Build Final Report` / `No Active Sprint Output`
  - `Send GGChat Webhook`
- Workflow nay se:
  - Lay active sprint cua board `1041`
  - Lay issues trong sprint
  - Tinh metrics FE/BE + warnings theo business rules trong `docs/check-sprint-execution-status-spec.md` bang pipeline deterministic
  - Dua metrics vao AI Agent de viet 1 dong review (co parser JSON output)
  - Neu review co placeholder `<email>`, se map qua Google Chat user mention `<users/{id}>` bang bang mapping trong sheet `MoMoer`
  - Render output text dung contract:
    - `- FE passed: ...`
    - `- BE passed: ...`
    - `- Review: ...`
    - `*WARNINGS*: ...`

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
