# Changelog

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
