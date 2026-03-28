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

### Skill B: Setup CLIProxyAPI OAuth
```bash
bash scripts/cliproxy/setup-cliproxy-oauth.sh
```

### Skill C: Quan ly account/model qua Management Center
Web UI:
```text
http://127.0.0.1:8317/management.html#/login
```
- Dang nhap bang `CLIPROXY_MANAGEMENT_KEY` (luu trong `env.cliproxy.local`)
- Them account qua tab `OAuth Login`
- Quan ly auth files va enabled/disabled qua tab `Auth Files`

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
