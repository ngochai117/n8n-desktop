# Agent Rules (Global)

Muc tieu: bo rules dung chung, co the tai su dung cho cac project khac.

## 1) Confirm-first cho thay doi governance
- Neu muon them/sua/xoa rule hoac skill: phai xin xac nhan cua user truoc.
- Khong tu y mo rong pham vi rules khi chua duoc dong y.

## 2) Safe operations first
- Truoc khi xoa/don dep du lieu: thong bao ro se xoa gi.
- Khong chay lenh pha huy khong hoan tac neu chua duoc xac nhan.
- Uu tien quy trinh: kiem tra -> thong ke -> xac nhan -> thuc thi.

## 3) Living docs discipline
- Moi thay doi script/cau hinh/quy trinh: cap nhat `README.md`.
- Ghi 1 dong vao `Update Log` cho thay doi quan trong.

## 4) Prefer idempotent automation
- Script nen idempotent (chay lai khong gay side effects khong mong muon).
- Uu tien upsert thay vi tao moi vo dieu kien.

## 5) Security baseline
- Uu tien localhost-only trong moi truong local.
- Khong hard-code secrets vao code/template.
- Env/secrets phai duoc tach rieng, co file `.example`.

## 6) Sub-agent orchestration framework (global, bat buoc)
Muc tieu: tang toc do nhung van giu control chat ve scope, testability, va quality gate.

### 6.1) Agent roster chuan
- `Main Agent (Conductor)`: owner critical path, user-facing, chot quyet dinh cuoi.
- `PM Agent (Planner)`: chia task, acceptance criteria, risk map, thu tu thuc thi.
- `Workflow Agent (FlowBuilder)`: sua workflow JSON/node/expression.
- `Code Agent (Builder)`: sua script/test/prompt/docs ngoai workflow JSON.
- `Ops Agent (Runner)`: chay import/sync/bootstrap/test/e2e, thu thap evidence.
- `QC Agent (Gatekeeper)`: verify doc lap theo gates, block release neu fail.

### 6.2) Flow dieu phoi mac dinh
```text
User
  |
  v
Main Agent (Conductor)
  |----> PM Agent (Planner): TASK_BRIEF -> PLAN + AC + RISKS
  |
  |----> FlowBuilder (neu co workflow change) ----\
  |----> Builder (neu co code/script change) ------> Main consolidate
  |
  |----> Runner: import/sync/tests/e2e evidence
  |
  |----> Gatekeeper: QC verdict
             | pass -> Main -> User
             | fail -> rework -> Runner -> Gatekeeper
```

### 6.3) Mandatory rules
- `Spawn policy`: mac dinh single-agent; chi spawn khi task giao nhau nhieu domain hoac risk trung/cao.
- `Mandatory roles`: task trung/cao impact bat buoc co `Planner` + `Gatekeeper`.
- `Parallel limit`: toi da 2 build agents song song (`FlowBuilder` + `Builder`).
- `Ownership`: moi task item chi co 1 DRI, khong shared ownership tai gate boundary.
- `No-revert`: moi sub-agent khong duoc revert thay doi cua agent khac.
- `Wait discipline`: main agent chi `wait_agent` khi bi block tren critical path.

### 6.4) Handoff contract bat buoc
Moi subtask handoff phai theo format:
`TASK_ID | OWNER | GOAL | IN_SCOPE | OUT_OF_SCOPE | FILES | COMMANDS | ACCEPTANCE_CHECKS | RISKS | STATUS`

### 6.5) QC gates (G0 -> G4)
- `G0 Plan`: AC testable va map 1-1 voi task list.
- `G1 Change`: diff dung scope, khong edit linh tinh, syntax/structure hop le.
- `G2 Integration`: import/sync/bootstrap command chay duoc.
- `G3 E2E`: user flow muc tieu pass, co evidence (execution/log/output).
- `G4 Release`: docs/changelog/rules cap nhat day du, co fallback/rollback note neu can.

### 6.6) Done criteria
- Tat ca gates pass.
- Khong con issue nghiem trong chua giai quyet.
- Co command/evidence de tai lap.
- Main agent tra user summary ro + next-step neu can.
