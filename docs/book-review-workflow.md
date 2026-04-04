# Book Review Workflow

## Muc tieu

- Duy tri 1 workflow canonical cho Book Review.
- Uu tien flow de doc tren UI, stage ro rang, debug de.
- Khong song song 2 style workflow cho cung use case.

## Topology hien tai

1. Trigger nhan message vao workflow.
2. `Config Main` chuan hoa shared values can dung lai, bao gom `sessionTableName`.
3. `Parse Callback Data` + `Switch` route giua:
   - `startReview`
   - `stopReview`
   - `continueReview`
4. Nhanh `startReview` chay pipeline generate:
   - `Outline AI Agent`
   - `Manifest AI Agent`
   - `QC AI Agent`
5. `Prepare Manifest` canonicalize payload cuoi:
   - `manifest`
   - `manifestJSONString`
   - `contentReadable`
   - `qc`
   - `sessionToken`
   - `safeToken`
   - `folderPath`
6. Persist hai file len Drive:
   - `Manifest.json`
   - `ContentReadable.txt`
7. `Save Reviewing Session` luu session toi thieu vao `DataTableStore` ngay trong input mapping:
   - `sessionToken`
   - `status`
   - `manifestUrl`
   - `folderUrl`
   - `rootFolderId`
   - `folderPath`
8. Gui review ready message len Telegram voi inline keyboard:
   - `continueReview:<sessionToken>`
   - `stopReview:<sessionToken>`
9. Nhanh `stopReview`:
   - load session theo `sessionToken`
   - chi update `status = stop` neu session dang `reviewing`
   - answer callback query
10. Nhanh `continueReview`:

- load session theo `sessionToken`
- chi update `status = continueReview` neu session dang `reviewing`
- goi `GG Drive Manager get` bang `manifestUrl`
- parse lai `Manifest.json`
- chay media branch TTS:
  - loop tung `scenes[*].narration_text` (moi scene 1 request TTS)
  - goi subworkflow `TTS VieNeu` voi full narration text
  - upload WAV vao Drive folder `folderPath/tts`
  - append row log vao Google Sheet (scene fields + `tts_url|tts_status|tts_error_reason`)
- chot `status = reviewPassed` (kem thong ke TTS rows)
- gui message xac nhan media branch da chay xong

## Design style

- Shared values dat o `Config Main`.
- Khong de config node phinh to vo ly.
- Gia tri cuc bo thi dat ngay tai node/cum dang dung no.
- Moi AI stage co node rieng cho model, agent, parser.
- Co 1 node canonicalize truoc khi persist/gui.
- Reviewer session flow da rebuild day du cho nhanh `reviewPassed` + TTS narration branch.

## Output chinh

- `reviewManifest`: JSON scene manifest
- `reviewReadable`: ban text doc duoc
- `qc`: ket qua QC co score + feedback
- `sessionToken` va `status` cho reviewer callback
- Drive links cho hai file output
- `manifestUrl` / `folderUrl` de media branch rehydrate session
- TTS artifacts trong folder `/tts`
- Google Sheet rows cho tung scene narration TTS (bao gom `tts_url`, `tts_status`, `tts_error_reason`)

## Tiep tuc

- Backlog media/TTS va session assets tiep theo duoc ghi tai `docs/book-review-todo.md`.
