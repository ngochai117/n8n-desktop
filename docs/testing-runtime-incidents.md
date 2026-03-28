# Testing Runtime Incidents

Muc tieu: luu cac van de phat sinh khi chay/import/test workflow (dac biet E2E), uu tien cac van de he thong/cau hinh/runtime, KHONG phai loi business logic.

## Tai sao run E2E co the lau
1. `run-book-review-full-e2e.sh` la flow 3 buoc (`start -> review_continue -> metadata_continue`), khong phai 1 request don.
2. Moi lan run script se import workflow test + restore workflow goc sau khi xong, ton them thoi gian I/O/API.
3. Script co polling de map execution theo `update_id`; timeout lookup co the den vai phut neu he thong ban.
4. Full flow co media branch (TTS/image). Neu text dai -> chunk nhieu -> so request tang manh.
5. Latency phu thuoc external services (Google Drive/Sheets, provider TTS/image, webhook network).
6. Neu co workflow webhook khac cung active (vi du Telegram bridge), execution list se nhieu noise, ton them thoi gian loc.

## Preflight truoc khi chay Full E2E
1. Verify env + API keys:
```bash
source env.n8n.local
source env.cliproxy.local
[ -n "$N8N_API_URL" ] && [ -n "$N8N_API_KEY" ]
```
2. Verify n8n API song:
```bash
curl -sS -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_API_URL/api/v1/workflows?limit=1" >/dev/null
```
3. Import lai workflow truoc khi test:
```bash
bash scripts/workflows/import/import-book-review-workflow.sh
```
4. Dung input ngan cho smoke test (1 cau) truoc khi test dai.
5. Neu can session sheet, bat buoc bat `Google Sheets API` (`sheets.googleapis.com`) trong Google Cloud project cua OAuth credential.
6. Neu chay TTS that, dam bao `TTS_API_BASE_URL` reachable va service dang chay.
7. Chay thu tu test de fail fast:
   - `bash scripts/workflows/tests/test-book-review-checklist.sh`
   - `bash scripts/workflows/tests/run-book-review-e2e.sh`
   - `bash scripts/workflows/tests/run-book-review-full-e2e.sh`

## Van de chung (non-logic) va cach xu ly
1. Trieu chung: `redirect_uri_mismatch`
- Nguyen nhan: OAuth Redirect URL trong Google Cloud khong trung URL callback n8n.
- Xu ly: them dung callback URL vao `Authorized redirect URIs` (khong nhap vao JavaScript origins).

2. Trieu chung: OAuth popup dung o callback/`Unauthorized`
- Nguyen nhan: n8n auth session/cookie khong hop le hoac callback domain khong trung host n8n dang dung.
- Xu ly: login lai n8n UI tren dung domain callback, reconnect credential.

3. Trieu chung: `Session sheet was not created (HTTP 403)`
- Nguyen nhan: `Google Sheets API` chua bat cho OAuth project.
- Xu ly: bat `sheets.googleapis.com`, doi vai phut propagate, run lai full E2E.

4. Trieu chung: TTS fail `connect ECONNREFUSED 127.0.0.1:8001`
- Nguyen nhan: TTS service chua chay/sai base URL.
- Xu ly: start TTS service, dat `TTS_API_BASE_URL` dung host/port (uu tien `127.0.0.1`).

5. Trieu chung: map execution sai/khong tim thay update vua gui
- Nguyen nhan: lookup execution bang filter thoi gian mong manh hoac co noise tu webhook khac.
- Xu ly: map bang `update_id` + epoch filter + chi lay webhook execution cua dung workflow.

6. Trieu chung: run lau bat thuong
- Nguyen nhan: input qua dai (chunk nhieu), retry/polling timeout cao, external API cham.
- Xu ly: smoke test bang text ngan truoc, sau do moi mo rong.

## Incident log
### 2026-03-28
- Phat hien lookup execution trong full E2E bi miss do so sanh `startedAt` theo string voi milliseconds.
- Da fix script lookup theo `update_id` + epoch filter de on dinh hon.
- Phat hien merge context file/sheet trong `book-review` lay sai input uu tien, lam URL file bi gan nham folder id.
- Da fix clash policy merge + harden `Finalize Media Assets (Worker)`.
- Phat hien tiep: context bi mat sau node `Write Session Sheet Rows (Worker)` nen `Persist Media Debug` co the khong thay `media_pipeline_status`.
- Da fix bang node merge bo sung `Merge Session Sheet Write Context (Worker)` de giu context session + response status.
- Sau khi bat `Google Sheets API`, full E2E pass va co day du `session_sheet_url`.
