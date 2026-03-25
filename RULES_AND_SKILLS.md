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
- Cac workflow demo se tu dong bind `Notify via Shared Workflow` theo `source=localFile` den template `workflows/shared-notification-router.workflow.json`.

### Skill E: Sync workflow tu n8n UI ve JSON
```bash
bash scripts/workflows/sync/sync-workflows-from-n8n.sh
bash scripts/workflows/sync/sync-workflows-from-n8n.sh --apply
```
- Mac dinh preview-only.
- Dung `--apply` de ghi de template theo state UI moi nhat.
- `--apply` mac dinh se auto log vao `CHANGELOG.md` va `README` Update Log.

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
