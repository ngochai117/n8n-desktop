# Testing Runtime Notes

Tai lieu nay chi giu cac luu y runtime cho workflow canonical hien tai.

## Scope hien tai
- Checklist chinh thuc:
  - `bash scripts/workflows/tests/test-book-review-checklist.sh`
- Full E2E reviewer/media/session chua duoc advertise o repo hien tai.
- Backlog E2E/runtime tiep tuc duoc ghi trong `docs/book-review-todo.md`.

## Preflight
1. Optional admin preflight, chi can khi ban muon import/sync hoac bat full MCP:
```bash
source env.n8n.local
[ -n "$N8N_API_URL" ] && [ -n "$N8N_API_KEY" ]
```
2. Neu da set admin API vars, verify n8n API:
```bash
curl -sS -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_API_URL/api/v1/workflows?limit=1" >/dev/null
```
3. Neu ban dang dung import wrapper, import lai workflow canonical:
```bash
bash scripts/workflows/import/import-book-review-workflow.sh
```
4. Chay checklist:
```bash
bash scripts/workflows/tests/test-book-review-checklist.sh
```

## Van de chung
1. `redirect_uri_mismatch`
- Redirect URL cua Google Cloud khong khop callback URL cua n8n.

2. Telegram credential khong hop le
- Reconnect credential trong n8n UI.

3. Drive folder/file khong tao duoc
- Kiem tra OAuth credential va cac field root folder duoc set truc tiep tren n8n UI/workflow node.

4. Sync/import sai workflow
- Sync tu UI roi import lai wrapper canonical.
