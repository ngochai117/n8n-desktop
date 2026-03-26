# Agent Rules (Project Specific)

Project: `n8n-desktop`

## 1) Workflow import policy (bat buoc upsert)
- Khong tao moi workflow neu da ton tai.
- Uu tien update theo `workflow ID`.
- Registry: `workflow-registry.json` (map theo `name` hoac `template`).
- Neu ID trong registry da archived/khong ton tai: bo qua ID do.
- Neu chua co ID hop le: tim theo `name` (chi lay workflow non-archived), tim thay thi update, khong thay moi tao moi.
- Neu workflow vua duoc sua tren UI, uu tien sync nguoc ve JSON truoc khi AI sua tiep: `bash scripts/workflows/sync/sync-workflows-from-n8n.sh --apply`.
- Moi lan agent sua bat ky file workflow JSON nao (trong `workflows/*.workflow.json`), bat buoc chay lai script import workflow tuong ung de cap nhat state tren n8n truoc khi ket luan da xong.

## 2) Model policy
- Uu tien model moi nhat/manh nhat khi cap nhat demo.
- Mac dinh hien tai:
  - Gemini: `gemini-3-flash-preview` (fallback: `gemini-2.5-pro` cho workflow review sach)
  - OpenAI: `gpt-5.4`
- Tra cuu model qua Management Center hoac `GET /v1/models` truoc khi doi model.

## 3) Runtime security policy
- CLIProxyAPI bind localhost (`127.0.0.1`), management UI bat local va bao ve bang `CLIPROXY_MANAGEMENT_KEY`.
- Dung `CLIPROXY_CLIENT_KEY` cho client-to-proxy auth.
- OAuth provider auth luu trong `~/.cli-proxy-api`.

## 4) Documentation policy
- Moi thay doi quy trinh van hanh: cap nhat `README.md`.
- Uu tien ghi chi tiet thay doi vao `CHANGELOG.md` (dac biet voi workflow sync/import).
- Moi thay doi project rules/skills: phai xin xac nhan user truoc.

## 5) Standard commands
- `bash scripts/bootstrap/bootstrap-local.sh`
- `bash scripts/bootstrap/verify-local.sh`
- `bash scripts/bootstrap/enable-full-mcp.sh`
- `bash scripts/cliproxy/setup-cliproxy-oauth.sh`
- `bash scripts/workflows/import/import-shared-notification-router-workflow.sh`
- `bash scripts/workflows/import/import-gemini-demo-workflow.sh`
- `bash scripts/workflows/import/import-openai-demo-workflow.sh`
- `bash scripts/workflows/import/import-book-review-workflow.sh`
- `bash scripts/workflows/sync/sync-workflows-from-n8n.sh`
- `bash scripts/workflows/tests/test-book-review-checklist.sh`

## 6) Checklist execution policy (bat buoc)
- Neu user yeu cau "chay checklist" (hoac tuong duong), agent phai chay automation test checklist.
- Khong duoc chi review ly thuyet/thu cong neu chua chay script checklist.
- Script mac dinh cho workflow review sach: `bash scripts/workflows/tests/test-book-review-checklist.sh`

## 7) Shared notification policy (bat buoc)
- Moi workflow trong project phai goi workflow notify dung chung o cuoi pipeline.
- Workflow notify dung chung mac dinh: `Shared Notification Router`.
- Notification phai bao gom status `success/failed` va noi dung dong tu workflow chinh (khong hard-code thong diep co dinh).

## 8) n8n Code-node mode safety (bat buoc)
- Neu node Code dung `mode=runOnceForEachItem`, uu tien doc input item hien tai bang `$json`.
- Khong dung `$input.first()` hoac `$input.all()` trong `runOnceForEachItem` (de tranh runtime error: `Can't use .first() here`).
- Chi dung `$input.first()`/`$input.all()` khi node o `mode=runOnceForAllItems`.
- Truoc khi ket luan da fix workflow, chay checklist automation de bat loi mode-access regression.

## 9) AI prompt externalization policy (bat buoc)
- Moi prompt AI moi (system/template prompt) phai duoc tach thanh file `.txt` rieng trong thu muc prompt theo workflow: `workflows/<workflow>/prompts/`.
- Khong hard-code prompt dai truc tiep trong workflow JSON neu prompt do co the quan ly qua file.
- Prompt file phai duoc inject vao workflow qua `Set Config` + script import wrapper tuong ung.
- Khi sync workflow tu UI ve JSON, script sanitizer phai tra ve placeholder cho cac field prompt template de tranh drift/noise.
