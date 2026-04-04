# Agent Rules (Project Specific)

Project: `n8n-desktop`

## 1) Canonical workflow
- Repo nay chi duy tri 1 workflow chinh cho Book Review: `Book Review`.
- Template canonical: `workflows/book-review/book-review.workflow.json`.
- Khong duy tri alias, wrapper, doc, hay path song song cho cung 1 workflow.

## 2) Workflow import policy
- Workflow import phai la upsert, uu tien update theo workflow ID trong `workflow-registry.json`.
- Neu workflow da duoc sua tren UI, uu tien sync nguoc ve JSON truoc khi AI sua tiep: `bash scripts/workflows/sync/sync-workflows-from-n8n.sh --apply`.
- Moi lan agent sua workflow JSON canonical, bat buoc import lai wrapper tuong ung truoc khi ket luan.

## 3) Workflow design style (bat buoc)
- UI-first: canvas phai de doc, de trace, de debug.
- Stage-driven: flow uu tien cac cum ro rang `trigger/input -> shared config -> AI stage -> canonicalize -> persist/send`.
- `Config Main` chi chua shared values dung thuc su nhieu noi.
- Khong de qua nhieu config nodes. Neu 1 gia tri chi phuc vu cuc nho, uu tien dat ngay node gan no hoac dung code node san co.
- Moi node = 1 trach nhiem ro rang. Khong de branch chet, action chet, hay UI hua hen tinh nang chua implement.
- Truoc khi persist/fan-out, phai co 1 diem canonicalize/normalize de chot contract output.
- Uu tien node-first cho routing, file handling, merge/split, subworkflow call. Code node chi dung cho normalize/parse/contract logic ma node built-in dien dat khong ro.
- Chi dung `Merge` khi thuc su co tu 2 nhanh song song can join lai va can hanh vi `Include Any Unpaired Items` de doi/giu context. Khong dung `Merge` chi de keo lai context ma node sau co the doc truc tiep tu node truoc do.
- Khong lam dung node `Prepare ...` cho passthrough, constant mapping, hay logic rat don gian. Neu input cua node sau co the dien dat ro bang expression thi uu tien dat thang tai node do.
- Khong fallback chap va cho data path nghiep vu (khong dung kieu `a || b || c`).
- Khong truyen/map day chuyen qua nhieu node chi de giu context.
- Node nao dung data thi doc truc tiep tu node goc chua data do (uu tien expression tham chieu node goc), khong qua cac lop map trung gian neu khong bat buoc.
- Giam toi da node `Set/Edit Fields/Prepare`; chi giu lai khi bat buoc ve ky thuat (vi du: doi kieu du lieu, doi binary field key, hoac chot lai contract output).
- Naming cho workflow config/field/contract moi dung `camelCase`.

## 4) Runtime and config hygiene
- Proxy runtime local phai bind localhost (`127.0.0.1`/`localhost`).
- Khong hard-code secrets vao code/template.
- Prompt source cua Book Review nam trong `workflows/book-review/prompts/`.
- Khi workflow canonical chua wire prompt file truc tiep, prompt source van duoc quan ly tai thu muc prompt va backlog tiep tuc duoc ghi trong `docs/book-review-todo.md`.
- Dung env/example gon, khong de bien mo coi khong con phuc vu workflow canonical va tooling hien tai.

## 5) Current Book Review scope
- Workflow canonical hien tai uu tien generate outline -> manifest -> QC -> persist draft/manifest -> gui review ready.
- Reviewer session flow, media pipeline, session persistence, va E2E runtime se duoc implement tiep theo backlog trong `docs/book-review-todo.md`.
- Khong duoc tai su dung branch/logic cu chi de "cho chay tam" neu no lam flow kho doc hoac tao contract mo ho.

## 6) Standard commands
- `bash scripts/bootstrap/bootstrap-local.sh`
- `bash scripts/bootstrap/verify-local.sh`
- `bash scripts/bootstrap/enable-full-mcp.sh`
- `bash scripts/proxy/setup-proxy.sh`
- `bash scripts/workflows/import/import-book-review-workflow.sh`
- `bash scripts/workflows/sync/sync-workflows-from-n8n.sh`
- `bash scripts/workflows/tests/test-book-review-checklist.sh`

## 7) Checklist execution policy
- Neu user yeu cau "chay checklist" cho Book Review, mac dinh chay:
  - `bash scripts/workflows/tests/test-book-review-checklist.sh`
- Checklist hien tai la static contract/topology checklist cho workflow canonical.
- Khong mo ta E2E/media checklist nhu da san sang khi workflow chua implement den muc do.

## 8) Code-node mode safety
- Neu node Code dung `mode=runOnceForEachItem`, uu tien doc item hien tai bang `$json`.
- Khong dung `$input.first()` hoac `$input.all()` trong `runOnceForEachItem`.
- Chi dung `$input.first()`/`$input.all()` khi node o `mode=runOnceForAllItems`.

## 9) Execute Workflow Trigger input schema
- Ap dung cho moi subworkflow dung `When Executed by Another Workflow`.
- Khong de schema rong dang `workflowInputs.values: [{}]`.
- Bat buoc khai bao `inputSource=workflowInputs` va moi field co `name` + `type`.
- Neu schema bi reset/rong sau sync UI, phai map lai theo contract thuc te va import lai workflow.

## 10) Sticky-note va visual readability
- Neu workflow co sticky note, moi lan sua logic/contract phai cap nhat note.
- Note phai phan anh dung input/output va cac stage dang ton tai.
- Khong de sticky note stale sau khi cutover hay don flow.
