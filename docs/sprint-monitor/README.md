# Sprint Monitor AI

Bộ tài liệu implementation handoff cho hệ thống monitor sprint dùng:
- **Jira**: source of truth cho sprint/task/workflow
- **GitLab**: MR/review/pipeline signals
- **Google Chat**: notification channel
- **n8n**: workflow orchestration
- **AI Judgment Service**: decisioning with dual output (`semantic_output` + `narrative_output`)
- **PostgreSQL**: state, issue lifecycle, audit, delivery logs

## Tài liệu trong thư mục này
- `SPEC.md` — product + behavior spec đầy đủ
- `ARCHITECTURE.md` — kiến trúc hệ thống, service boundaries, API contracts
- `FLOW.md` — bản giải thích ngắn, dễ đọc về cách workflow đang chạy
- `PROMPTS.md` — prompt pack + output schema + guardrails
- `WORKFLOWS.md` — n8n workflow spec chi tiết theo node/step/error path
- `schema.sql` — PostgreSQL schema khởi tạo
- `monitor-configs.sql` — query mẫu để xem, insert, update, upsert config trong `monitor_configs`

## Ghi chú config
- `monitor_configs.gchat_unified_webhook` là webhook duy nhất cho unified digest
- `monitor_configs.message_language` hỗ trợ `en` và `vi`
- Judge output duoc split theo Option 3: semantic canonical cho gate/DB + narrative localized cho render
- Unified digest render theo 2 message cùng thread: card metrics + text action
- Topology runtime hien tai: `Sprint Monitor Scheduler` (single cron entry) -> `Sprint Monitor Engine` (mode selector `scan/review`)
- Mode rule mac dinh: `review` khi Monday/Thursday hoac near-end (`days_remaining <= 1`), con lai `scan`
- Mention resolver dùng shared Google Sheet members source cố định với 3 cột `email`, `id`, `name`
- V1 chưa có role mapping `PM/Lead`; nếu không resolve được email cụ thể thì fallback text

## Handoff recommendation
Nếu giao cho team khác hoặc AI build, hãy đưa trọn bộ 5 file trên. Không chỉ đưa README/SPEC.

## One-line thesis
> Đây không phải bot check status. Đây là PM co-pilot biết lúc nào nên im, lúc nào nên cảnh báo, và cảnh báo đúng người.
