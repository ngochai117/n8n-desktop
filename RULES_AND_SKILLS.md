# Rules & Skills

Tai lieu nay tap trung vao playbook van hanh. Rules chung nam o:
- `AGENT_RULES_GLOBAL.md`
- `AGENT_RULES_PROJECT.md`

Neu can them/sua/xoa rule hoac skill:
- Bat buoc xin xac nhan tu user truoc khi ghi file.

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

### Skill C: Proxy dashboard va API key
Web UI:
```text
http://127.0.0.1:20128/dashboard
```
- Neu can chay proxy runtime hoac demo proxy, luu API key vao `env.proxy.local`.
- Khong hard-code key vao workflow/template.

### Skill D: Import canonical workflows
```bash
bash scripts/workflows/import/import-shared-notification-router-workflow.sh
bash scripts/workflows/import/import-gg-drive-manager-workflow.sh
bash scripts/workflows/import/import-gg-sheet-manager-workflow.sh
bash scripts/workflows/import/import-text-to-images-workflow.sh
bash scripts/workflows/import/import-text-to-videos-veo3-workflow.sh
bash scripts/workflows/import/import-tts-workflow.sh
bash scripts/workflows/import/import-book-review-workflow.sh
```
- `Book Review` chi con 1 wrapper canonical.
- Khong co wrapper alias hay wrapper song song cho cung 1 workflow.

### Skill E: Sync workflow tu n8n UI ve JSON
```bash
bash scripts/workflows/sync/sync-workflows-from-n8n.sh
bash scripts/workflows/sync/sync-workflows-from-n8n.sh --apply
```
- Mac dinh preview-only.
- Dung `--apply` de ghi de template theo state UI moi nhat.

### Skill F: Book Review checklist
```bash
bash scripts/workflows/tests/test-book-review-checklist.sh
```
- Checklist hien tai verify contract/topology cua workflow canonical.
- Khong coi la full E2E runner.

### Skill G: Book Review backlog
- Backlog reviewer/media/session persistence/E2E duoc ghi tai:
  - `docs/book-review-todo.md`
- Neu tiep tuc implement, uu tien cap nhat backlog truoc va sau moi cum thay doi lon.

## Files tham chieu nhanh
- `AGENTS.md`
- `AGENT_RULES_GLOBAL.md`
- `AGENT_RULES_PROJECT.md`
- `RULES_AND_SKILLS.md`
- `README.md`
- `scripts/README.md`
- `workflow-registry.json`
- `workflows/book-review/book-review.workflow.json`
- `workflows/book-review/prompts/`
- `docs/book-review-workflow.md`
- `docs/book-review-todo.md`
- `scripts/workflows/import/import-book-review-workflow.sh`
- `scripts/workflows/tests/test-book-review-checklist.sh`
- `scripts/workflows/tests/test-book-review-checklist.mjs`
