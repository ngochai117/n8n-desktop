# Book Review TODO

## Current baseline
- Workflow canonical hien tai da co generate -> QC -> persist draft/manifest -> send review ready.
- Chua rebuild reviewer/media/session branch.

## Backlog can lam tiep

### 1) Reviewer/session flow
- Tao `sessionToken` on dinh cho moi run.
- Parse callback/action co trace token.
- Persist session state vao data table.
- Lock/ack callback message dung cach.

### 2) Media branch
- Them gate `mediaContinue` / `mediaStop`.
- Rebuild branch TTS.
- Rebuild branch visual (`Text To Images` / `Text To Videos VEO3`).
- Progress message theo stage neu can.
- Media shared workflows hien da duoc simplify: chi tra artifact/result cho workflow cha, khong tu upload Drive hay ghi Sheet.

### 3) Session assets
- Tao session folder context.
- Persist them review/session package neu can.
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
1. sessionToken + callback contract
2. review-ready state persistence
3. mediaContinue/mediaStop
4. TTS + visual branch
5. session assets + sheet
6. shared notify + E2E
