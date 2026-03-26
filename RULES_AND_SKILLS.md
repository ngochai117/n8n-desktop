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
- Muc tieu: tang toc do nhung van tranh conflict, dac biet voi workflow JSON, prompt injection va luong import/sync/test.
- Mac dinh giu 1 main agent lam owner cua critical path:
  - Lam ro yeu cau, scope va success criteria.
  - Chot huong thiet ke cuoi cung.
  - Tich hop ket qua va quyet dinh khi nao moi `wait_agent`.
- Mac dinh toi da 3 sub-agent song song cho task vua:
  - 1 `explorer`: map entry points, rules bat buoc, file/test/workflow lien quan.
  - 1 `worker` cho shell/import/sync/bootstrap neu feature cham automation hoac env wiring.
  - 1 `worker` cho checklist/test harness hoac verification path.
- Khong chia 2 worker cung sua 1 workflow JSON lon neu chua khoa ro ownership; main agent nen giu phan workflow integration neu do la tam diem cua feature.

Prompt mau cho `explorer`:
```text
Doc repo va tra loi gon: feature nay cham script nao, workflow nao, test nao, va rule project nao bat buoc phai giu? Khong sua file. Neu co xung dot ownership tiem an thi chi ro.
```

Prompt mau cho `worker` script/import-sync:
```text
Ban so huu pham vi automation shell/import/sync trong repo nay. Hay sua chi cac file duoc giao, khong revert thay doi cua agent khac, va tom tat file da doi + rui ro con lai. Uu tien giu dung rules upsert, sync tu UI va prompt externalization.
```

Prompt mau cho `worker` test/checklist:
```text
Ban so huu pham vi checklist/test harness cho task nay. Hay chi sua file test duoc giao, khong revert thay doi cua agent khac, va tra ve file da doi + cac gap chua verify duoc. Uu tien bat regression quanh workflow behavior, fallback va notify flow neu co lien quan.
```

Checklist ra quyet dinh truoc khi spawn:
- Spawn ngay khi subtask co input/output ro, write scope tach duoc, va main agent con viec khac de lam song song.
- Khong spawn khi can mot quyet dinh thiet ke truoc, khi nhieu phan cung dung vao 1 workflow JSON, hoac task nho den muc main agent tu lam nhanh hon.
- Moi worker prompt phai neu ro:
  - Muc tieu duy nhat.
  - File/pham vi so huu.
  - Rang buoc "khong revert thay doi cua agent khac".
  - Dau ra mong doi: file da doi + tom tat rui ro.

Mau phan ra mac dinh cho feature work:
1. Main agent doc yeu cau va spawn 1 `explorer` de map impact/rules.
2. Trong luc cho `explorer`, main agent tu khoa thiet ke, acceptance criteria va phan nao se giu local.
3. Khi scope da ro, spawn worker theo lat cat `script` va `test` neu write scopes tach biet.
4. Main agent chi `wait_agent` khi thuc su bi block de tich hop.
5. Sau khi merge logic, main agent tu chay verify tong:
   - Workflow behavior: dung import/sync flow, checklist pass, khong vi pham rules upsert/prompt externalization/shared notify.
   - Script changes: happy path, missing env/dependency, preview-vs-apply neu lien quan.
   - Workflow changes: it nhat 1 case thanh cong va 1 case loi hoac fallback.

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
