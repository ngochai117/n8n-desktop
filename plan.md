# Ke hoach trien khai Local n8n + MCP + Skills + CLIProxyAPI OAuth

## Tong quan
Muc tieu he thong:
- Chay n8n local tren may ca nhan
- Dung n8n-mcp + n8n-skills de tu dong xay workflow
- Tich hop CLIProxyAPI de goi Gemini/Codex bang OAuth auth
- Khong dung provider API key truc tiep trong workflow demo

## Kien truc tong the
- AI coding client doc `.mcp.json`
- MCP server `n8n-mcp` (stdio)
- n8n local tai `http://localhost:5678`
- CLIProxyAPI local tai `http://127.0.0.1:8317`
- Workflow n8n goi HTTP den CLIProxyAPI (`/v1/chat/completions`)
- OAuth token cua Gemini/Codex luu trong `~/.cli-proxy-api`

## Muc tieu giai doan
1. Giai doan A: nen tang n8n local + MCP + skills
- bootstrap local
- verify stack
- enable full MCP mode voi N8N API key

2. Giai doan B: CLIProxyAPI OAuth
- install cliproxyapi qua brew
- sync config localhost-only
- Gemini OAuth login (`--login`)
- Codex OAuth login (`--codex-login`)
- start service + verify endpoints
- quan ly account/model bang CLIProxy Management Center (web UI)

3. Giai doan C: Gemini + OpenAI workflow demo
- import workflow demo Gemini vao n8n
- import workflow demo OpenAI vao n8n
- execute bang Manual Trigger
- xac nhan tra ve text response tu Gemini/OpenAI qua cliproxy
- import/update theo co che upsert (uu tien update theo workflow ID)

## Roadmap van hanh
1. `bash scripts/bootstrap/bootstrap-local.sh`
2. `bash scripts/bootstrap/verify-local.sh`
3. `bash scripts/bootstrap/enable-full-mcp.sh`
4. `bash scripts/cliproxy/setup-cliproxy-oauth.sh`
5. Quan ly account/provider/model trong Management Center (`/management.html`)
6. Execute workflow demo trong n8n UI

## Nguyen tac van hanh
- Uu tien local-only (localhost); management UI duoc bat va bao ve bang `CLIPROXY_MANAGEMENT_KEY`
- OAuth auth cho Gemini/Codex thay vi hard-code provider API key
- Moi thay doi setup/cau hinh phai cap nhat `README.md` + `Update Log`
- Moi thay doi rules/skills phai duoc user confirm truoc khi ghi vao docs governance
- Khong sua truc tiep workflow production bang AI khi chua qua test dev
- Cac workflow script import phai check ton tai truoc, neu co thi update theo ID, neu chua co thi tao moi
- Co che upsert phai bo qua workflow archived, uu tien ID theo registry (name/template), fallback tim theo name (non-archived)
