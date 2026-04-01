# Rules & Skills

Tai lieu nay tap trung vao "skills/playbooks". Rules da duoc tach thanh 2 lop:
- `AGENT_RULES_GLOBAL.md`: rules dung chung cho moi project.
- `AGENT_RULES_PROJECT.md`: rules rieng cho project nay.

Neu can them/sua rule hoac skill moi:
- Bat buoc xin xac nhan tu ban truoc khi ghi vao cac file rules/skills.

## Skills (Operational Playbooks)

### Skill A: Setup full local stack
```bash
bash scripts/bootstrap/bootstrap-local.sh
bash scripts/bootstrap/enable-full-mcp.sh
bash scripts/bootstrap/verify-local.sh
```

### Skill B: Setup proxy runtime
```bash
bash scripts/proxy/setup-proxy.sh
```

### Skill C: Quan ly account/model qua dashboard proxy
Web UI:
```text
http://127.0.0.1:20128/dashboard
```
- Dang nhap bang password dashboard (neu runtime yeu cau)
- Copy API key de dien vao `PROXY_API_KEY` (luu trong `env.proxy.local`)
- Ket noi provider tai dashboard truoc khi chay workflow demo

### Skill D: Import/Update workflow demos
```bash
bash scripts/workflows/import/import-shared-notification-router-workflow.sh
bash scripts/workflows/import/import-gemini-demo-workflow.sh
bash scripts/workflows/import/import-openai-demo-workflow.sh
bash scripts/workflows/import/import-book-review-workflow.sh
```
- Da la upsert theo rules o tren (khong tao trung vo toi va).
- Cac workflow demo se tu dong bind `Notify via Shared Workflow` theo `source=localFile` den template `workflows/shared/shared-notification-router.workflow.json`.

### Skill E: Sync workflow tu n8n UI ve JSON
```bash
bash scripts/workflows/sync/sync-workflows-from-n8n.sh
bash scripts/workflows/sync/sync-workflows-from-n8n.sh --apply
```
- Mac dinh preview-only.
- Dung `--apply` de ghi de template theo state UI moi nhat.
- `--apply` mac dinh se auto log vao `CHANGELOG.md`.

### Skill F: Storage audit + git cleanup an toan
Thong ke nhanh dung luong:
```bash
du -sh ./*
```

Toi uu `.git` an toan (khong doi lich su remote):
```bash
git reflog expire --expire-unreachable=now --all
git gc --prune=now --aggressive
```
- Dung khi repo phinh lon do object/reflog cu.
- Khong phai thay the cho viec loai file lon khoi lich su (can filter-repo neu can).

### Skill G: Automation test checklist cho workflow review sach
```bash
bash scripts/workflows/tests/test-book-review-checklist.sh
```
- Chay full 6 case checklist (continue-loop, max-turns, api-error,...).
- Neu user yeu cau "chay checklist", mac dinh phai chay skill nay truoc khi ket luan.

### Skill H: Chia sub-agent cho feature work
- Governance va gates nam o `AGENT_RULES_GLOBAL.md` (muc 6).
- Skill pack thuc thi mac dinh:
  - `PM-Planning`:
    - Dung khi: moi nhan task hoac scope thay doi.
    - Output: task breakdown co thu tu + acceptance criteria + risk map + gate map.
  - `Workflow-Edit-n8n`:
    - Dung khi: sua workflow JSON/node/expression/webhook.
    - Output: patch + node-level rationale + import/sync notes.
  - `Code-Edit`:
    - Dung khi: sua script/test/prompt/docs ngoai workflow JSON.
    - Output: patch + command verify.
  - `Ops-E2E`:
    - Dung khi: can bang chung runtime (import/sync/bootstrap/e2e).
    - Output: command log tom tat + evidence pass/fail.
  - `QC-Gate`:
    - Dung khi: sau moi buoc implementation va truoc khi ket luan.
    - Output: checklist gate `G0..G4` + verdict `PASS/FAIL` + required rework neu fail.

### Skill I: n8n node-first polling pattern (bat buoc)
- Khi workflow co async job (image/TTS/provider queue), phai dung mau ro rang:
  - `Create Job` -> `Wait` -> `Get Status` -> `If Completed?` -> loop lai `Wait` neu chua xong -> `Get Result`.
- Moi node 1 nhiem vu; tranh monolithic Code node.
- Dung `Loop Over Items`/`Split Out` de xu ly theo chunk, roi `Merge`/`Aggregate` de gom ket qua.
- Code node chi de normalize/parse nho khi node built-in khong du ro rang.

### Skill J: Workflow sticky-note update convention (bat buoc neu workflow co note)
- Trigger:
  - Dung khi workflow da co `stickyNote` va can sua logic/contract.
- Checklist note toi thieu:
  - `NOTE::<WORKFLOW_TAG>::INPUT_FIELDS`: input contract + default + output keys.
  - `NOTE::<WORKFLOW_TAG>::STAGE_*`: cac stage xu ly chinh.
  - `NOTE::<WORKFLOW_TAG>::BRANCH_*`: cac nhanh dieu kien quan trong.
- Rules:
  - Note phai khop flow hien tai, khong de stale.
  - Update idempotent theo prefix `NOTE::<WORKFLOW_TAG>::` (khong duplicate note sau moi lan patch/import).
  - Sau khi cap nhat note, bat buoc import lai workflow wrapper tuong ung.

### Skill K: Chuan hoa `Execute Workflow Trigger` input schema (bat buoc cho subworkflow)
- Trigger:
  - Dung khi sua/cap nhat workflow co node `When Executed by Another Workflow`.
- Muc tieu:
  - Caller `Execute Workflow` map duoc input fields truc tiep trong UI, khong phu thuoc schema rong.
- Checklist:
  - Sync workflow tu UI ve JSON template.
  - Kiem tra trigger dang `typeVersion=1.1`, `inputSource=workflowInputs`.
  - Kiem tra `workflowInputs.values` khong duoc la `[{}]`.
  - Moi field bat buoc co `name` + `type` (`any|string|number|boolean|array|object`).
  - Neu schema rong/reset, patch lai theo contract input duoc workflow su dung thuc te (Code/Set/HTTP params).
  - Import lai wrapper workflow tuong ung de publish state moi.
- Lenh goi y:
```bash
bash scripts/workflows/sync/sync-workflows-from-n8n.sh --name "GG Drive Manager" --apply
bash scripts/workflows/sync/sync-workflows-from-n8n.sh --name "GG Sheet Manager" --apply
bash scripts/workflows/sync/sync-workflows-from-n8n.sh --name "TTS" --apply
bash scripts/workflows/sync/sync-workflows-from-n8n.sh --name "Text To Images" --apply

bash scripts/workflows/import/import-gg-drive-manager-workflow.sh
bash scripts/workflows/import/import-gg-sheet-manager-workflow.sh
bash scripts/workflows/import/import-tts-workflow.sh
bash scripts/workflows/import/import-text-to-images-workflow.sh
```

## Files tham chieu nhanh
- `AGENTS.md`
- `AGENT_RULES_GLOBAL.md`
- `AGENT_RULES_PROJECT.md`
- `README.md`
- `CHANGELOG.md`
- `workflow-registry.json`
- `scripts/workflows/import/import-gemini-demo-workflow.sh`
- `scripts/workflows/import/import-openai-demo-workflow.sh`
- `scripts/workflows/import/import-book-review-workflow.sh`
- `scripts/workflows/sync/sync-workflows-from-n8n.sh`
- `scripts/workflows/tests/test-book-review-checklist.sh`
- `scripts/workflows/tests/test-book-review-checklist.mjs`
