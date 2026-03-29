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
- Proxy runtime phai bind localhost (`127.0.0.1`/`localhost`) cho local-only security.
- Dung `PROXY_API_KEY` cho client-to-proxy auth (khong hard-code trong workflow/template).
- Khong commit env local (`env.proxy.local`) va data runtime local (`~/.9router`) vao repo.

## 4) Documentation policy
- Moi thay doi quy trinh van hanh: cap nhat `README.md`.
- Uu tien ghi chi tiet thay doi vao `CHANGELOG.md` (dac biet voi workflow sync/import).
- Moi thay doi project rules/skills: phai xin xac nhan user truoc.

## 5) Standard commands
- `bash scripts/bootstrap/bootstrap-local.sh`
- `bash scripts/bootstrap/verify-local.sh`
- `bash scripts/bootstrap/enable-full-mcp.sh`
- `bash scripts/proxy/setup-proxy.sh`
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

## 10) Workflow UI cleanliness + routing data policy (bat buoc)
- Thiet ke node phai clean, uu tien gom nhom node logic va tai su dung nhom node thay vi tach le tung node khong can thiet.
- Cac node dieu huong UI nhu `Split Out`, `Merge`, `Switch`, `If` khi dong vai tro router chung phai giu du lieu day du (`include all other fields`) de tranh rot data.
- Neu dung pattern notify hub (vi du `Send Informations`), payload parse phai di theo thu tu: `parse notify data -> split hub -> set notify targets -> fan-out notify`.

## 11) Node-first workflow design policy (bat buoc)
- Uu tien dung cac node component built-in cua n8n de xu ly mapping, routing, merge/split, va transform data.
- Chi dung Code node cho logic khong the bieu dien tot bang component nodes (ve do ro rang, do on dinh, hoac maintainability).
- Khong dung Code node cho cac tac vu da co node built-in tuong duong.

## 12) Sub-agent operating policy reference (bat buoc)
- Ap dung theo `AGENT_RULES_GLOBAL.md` muc 6 (Sub-agent orchestration framework).
- Project nay khong override rieng cho roster `Conductor/Planner/FlowBuilder/Builder/Runner/Gatekeeper`.

## 13) n8n visual-flow readability policy (bat buoc)
- Uu tien workflow theo nguyen tac `moi node = 1 trach nhiem ro rang`.
- Voi tac vu async/polling (image/TTS/job queue...), bat buoc theo mau:
  1) `Create Job` (HTTP Request)
  2) `Wait` (Wait node rieng)
  3) `Get Status` (HTTP Request rieng)
  4) `If Completed?` (If node)
  5) nhanh `false` quay lai `Wait` (loop)
  6) nhanh `true` -> `Get Result`/`Finalize`
- Khong duoc `sleep` bang Code node khi da co Wait node.
- Bat buoc co gioi han polling (`max attempts` hoac timeout) de tranh loop vo han.
- Voi xu ly theo tung item/chunk, uu tien `Loop Over Items`/`Split Out` + `Merge`/`Aggregate` de gom ket qua.
- Code node chi duoc dung cho normalize/parse nho khi node built-in khong bieu dien duoc ro rang.
- Neu logic dai, phai tach thanh nhieu node nho theo tung buoc, khong gom monolithic script kho theo doi.
