# Book Review TODO

## Current baseline
- Workflow canonical hien tai da co generate -> QC -> persist manifest/readable -> save reviewer session -> send review ready.
- Reviewer callback da handle `continueReview` / `stopReview` voi `sessionToken`.
- `continueReview` hien da rehydrate `Manifest.json` tu `manifestUrl` va chot `reviewPassed`.
- Media/TTS branch sau `reviewPassed` van chua noi tiep.

## Backlog can lam tiep

### 1) Reviewer/session flow
- Hoan thien lock/edit review message neu can disable keyboard sau callback.
- Them retry/error recovery cho case session bi ket o `continueReview`.
- Neu can, bo sung signal debug cho reviewer branch.

### 2) Media branch
- Noi branch media sau `reviewPassed`.
- Rebuild branch TTS.
- Rebuild branch visual (`Text To Images` / `Text To Videos VEO3`).
- Progress message theo stage neu can.
- Media shared workflows hien da duoc simplify: chi tra artifact/result cho workflow cha, khong tu upload Drive hay ghi Sheet.

### 3) Session assets
- Session folder context da co `rootFolderId` + `folderPath`.
- Can quyet dinh them artifact/session package nao can persist.
- Rebuild session sheet output khi media branch tro lai.
- Chot naming canonical cho file, folder, sheet.

### 4) Shared integrations
- Wire lai `GG Drive Manager` contract cho branch reviewer/media/session.
- Wire lai `GG Sheet Manager` contract khi session sheet quay lai.
- Wire lai `Shared Notification Router` neu workflow can notify ngoai Telegram.

### 5) Prompt + config cleanup
- Rewire prompt source files trong `workflows/book-review/prompts/` vao workflow canonical.
- Giam hardcode prompt dai trong workflow JSON.
- Tiep tuc don shared config chi giu gia tri dung nhieu noi.

### 6) Tests/runtime
- Rebuild checklist khi topology reviewer/media/session quay lai.
- Rebuild E2E runner cho canonical workflow.
- Rebuild media/debug tooling theo contract moi.

## Thu tu goi y
1. media branch sau `reviewPassed`
2. TTS + visual branch
3. session assets + sheet
4. shared notify + E2E
