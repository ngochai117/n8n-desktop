# n8n Workflow Spec — Sprint Monitor AI

## 1. Overview
Tài liệu này mô tả **workflow-level handoff** cho n8n. Mục tiêu là để team hoặc AI khác dựng workflow mà không phải đoán ý.

Có 3 workflow chính:
1. `sprint-light-scan`
2. `sprint-deep-analysis`
3. `sprint-endgame`

Ngoài ra có thể thêm workflow phụ:
4. `rebuild-historical-patterns` (không bắt buộc cho MVP)

---

## 2. Shared config
Các workflow dùng chung config sau:
- `team_id`
- `board_id`
- `jira_base_url`
- `jira_project_key` hoặc JQL source
- `gitlab_base_url`
- `gitlab_project_ids[]`
- `gchat_pm_webhook`
- `gchat_lead_webhook`
- `timezone`
- `max_candidate_tasks`
- `max_clusters`
- `max_activity_excerpts`
- `owner_nudge_enabled`
- `suppression_owner_hours`
- `suppression_lead_hours`
- `suppression_pm_hours`
- `confidence_threshold_owner`
- `confidence_threshold_lead`
- `confidence_threshold_pm`

Khuyến nghị lưu config trong PostgreSQL bảng `monitor_configs`, không hardcode vào workflow.

---

## 3. Workflow A — `sprint-light-scan`

## 3.1 Goal
- chạy nhẹ
- detect abnormality mới
- phần lớn run không gửi gì

## 3.2 Trigger
- Cron node
- cadence gợi ý: mỗi sáng hoặc 1–2 lần/ngày trong business hours

## 3.3 Steps
### Step A1 — Load config
Node gợi ý:
- Postgres query hoặc Set node nếu đang prototype

Output cần có:
- các config shared ở trên

### Step A2 — Fetch active sprint from Jira
Node gợi ý:
- HTTP Request

Kết quả cần map:
- active sprint id
- sprint name
- start/end

### Step A3 — Fetch sprint tasks from Jira
Node gợi ý:
- HTTP Request với JQL theo sprint active

Lấy tối thiểu:
- issue id/key/title/status/assignee/priority/story points/updated
- labels/epic/links

### Step A4 — Fetch recent task activity
Node gợi ý:
- HTTP Request bulk hoặc loop có batching

Lấy:
- recent comments
- recent transitions
- blocker-related changes

### Step A5 — Fetch GitLab delivery signals
Node gợi ý:
- HTTP Request

Lấy:
- MR state
- approvals
- changes requested
- review requested at
- latest pipeline state/time
- latest commit time

### Step A6 — Normalize data
Node gợi ý:
- Code node

Làm:
- map dữ liệu Jira/GitLab về canonical objects
- join task ↔ MR theo convention mà team chọn

### Step A7 — Optional comment classification
Node gợi ý:
- HTTP Request gọi `POST /classify-comments`

Dùng khi:
- có recent excerpts cần xác định meaningful hay noise

### Step A8 — Compute signals
Node gợi ý:
- Code node

Tính:
- days since meaningful update
- review pending age
- blocked age
- candidate score
- sprint phase sơ bộ
- queue skew sơ bộ

### Step A9 — Candidate ranking
Node gợi ý:
- Code node

Chọn:
- top candidate tasks
- abnormal clusters sơ bộ
- activity excerpts cần đưa vào AI

### Step A10 — Load prior open issues/interventions
Node gợi ý:
- Postgres query

Lấy:
- unresolved issues cùng sprint
- recent interventions trong suppression windows

### Step A11 — Build AI packet
Node gợi ý:
- Code/Set node

Packet gồm:
- run_context
- policy
- sprint_snapshot
- candidate_tasks
- top_clusters
- activity_excerpts
- prior_interventions
- historical_patterns (nếu có)

### Step A12 — Call `POST /judge-sprint`
Node gợi ý:
- HTTP Request

### Step A13 — Validate judgment response
Node gợi ý:
- Code node

Check:
- JSON parse được
- đủ field bắt buộc
- enum hợp lệ
- confidence trong khoảng 0..1

Nếu fail:
- retry ngắn 1 lần
- fail run nếu vẫn invalid

### Step A14 — Suppression check
Node gợi ý:
- Code node + Postgres query

Check:
- issue_key đã alert gần đây chưa
- severity có tăng không
- có insight mới không

### Step A15 — Decide no-message vs deliver
Nếu `silence_decision.no_message_needed = true` hoặc suppression chặn hết:
- skip delivery
- vẫn persist run + issue state

### Step A16 — Draft messages
Node gợi ý:
- HTTP Request gọi `POST /draft-messages`
- hoặc fallback template node nếu drafting service fail

### Step A17 — Send Google Chat
Node gợi ý:
- HTTP Request tới webhook/bot endpoint

### Step A18 — Persist state
Node gợi ý:
- Postgres queries

Ghi:
- run record
- issue upserts
- interventions
- message deliveries

## 3.4 Error handling
- Jira fetch fail: retry; nếu vẫn fail thì mark run failed
- GitLab partial fail: mark partial, không gửi strong alert
- AI fail: no delivery, persist failed run
- Google Chat fail: persist failed delivery, optional retry

---

## 4. Workflow B — `sprint-deep-analysis`

## 4.1 Goal
- phân tích sâu hơn
- tạo PM digest có judgment
- cluster-level insight

## 4.2 Trigger
- Cron node
- cadence gợi ý: T3/T5, hoặc 2 lần/tuần

## 4.3 Differences vs light scan
- fetch nhiều comment/activity hơn
- load historical patterns
- candidate selection rộng hơn nhưng vẫn capped
- PM digest là output chính

## 4.4 Steps
### Step B1 — Load config
### Step B2 — Fetch active sprint + sprint metadata
### Step B3 — Fetch full sprint tasks
### Step B4 — Fetch comments/activity excerpts for candidate pool
### Step B5 — Fetch GitLab MR/review/pipeline data
### Step B6 — Normalize canonical objects
### Step B7 — Classify comments
### Step B8 — Compute full signal set
### Step B9 — Detect clusters
Cluster types tối thiểu:
- reviewer bottleneck
- dependency chain risk
- assignee overload
- epic risk cluster
- blocked cluster

### Step B10 — Load prior state + prior interventions
### Step B11 — Load historical patterns
### Step B12 — Build AI packet
### Step B13 — Call `POST /judge-sprint`
### Step B14 — Validate response
### Step B15 — Apply policy filters
Ví dụ:
- cap tối đa 2 lead alerts
- suppress owner nudges nếu disabled
- suppress PM escalation nếu confidence dưới threshold

### Step B16 — Call `POST /draft-messages`
### Step B17 — Deliver PM digest to PM Google Chat room
### Step B18 — Deliver lead alerts if any
### Step B19 — Persist all records

## 4.5 Expected output
- 1 PM digest/run nếu có insight đáng nói
- 0–2 lead alerts
- no owner spam in MVP

---

## 5. Workflow C — `sprint-endgame`

## 5.1 Goal
- cuối sprint: đánh giá cái gì còn cứu được
- near end/post end: spillover, descoping, carryover, retro note

## 5.2 Trigger
- 1 ngày trước sprint end
- ngày cuối sprint
- optional: ngày đầu sprint kế tiếp để recap carryover

## 5.3 Steps
### Step C1 — Load config
### Step C2 — Fetch sprint + all unresolved tasks
### Step C3 — Fetch recent activity and GitLab signals
### Step C4 — Normalize + compute signals
### Step C5 — Load unresolved issues and prior interventions
### Step C6 — Build endgame packet
Khác với deep analysis ở chỗ packet phải nhấn mạnh:
- days remaining = 0 hoặc rất thấp
- salvageability
- carryover likelihood
- tasks still too early in stage

### Step C7 — Call `POST /judge-sprint`
### Step C8 — Validate + apply suppression
### Step C9 — Draft PM decision digest
### Step C10 — Send PM digest
### Step C11 — Persist retro candidates/issues

## 5.4 Expected output style
- practical
- decision-focused
- less monitoring, more recommendation

---

## 6. Recommended node types
- Cron
- HTTP Request
- Code
- IF
- Postgres
- Set
- Merge

Không khuyến nghị dựng logic judgment chủ yếu bằng hàng đống IF nodes nối nhau. Dễ hóa bùn.

---

## 7. Data normalization rules
Trong Code node normalize, mỗi task nên map về object chuẩn có:
- task identity
- Jira fields chuẩn
- GitLab delivery fields
- recent activities
- derived links/dependencies

Nếu không map được GitLab ↔ Jira một cách chắc chắn:
- set cờ `delivery_signal_confidence = low`
- giảm độ tin cậy downstream

---

## 8. Suggested retry policy
- Jira/GitLab HTTP: retry 2 lần, exponential backoff nhẹ
- AI endpoints: retry 1 lần nếu timeout hoặc invalid JSON
- Google Chat: retry 1 lần cho webhook/network errors

---

## 9. Suggested observability
Mỗi run nên log:
- run_id
- workflow_name
- sprint_id
- issue_count_detected
- issue_count_delivered
- no_message flag
- ai_confidence_summary
- duration_ms
- partial_data flag

---

## 10. MVP workflow boundaries
MVP nên chốt:
- no auto owner DMs by default
- PM digest + lead alerts only
- no team-wide broadcast
- no Jira/GitLab write-back

---

## 11. Handoff note
Nếu team build trực tiếp bằng n8n, họ phải dùng file này cùng với:
- `SPEC.md`
- `ARCHITECTURE.md`
- `PROMPTS.md`
- `schema.sql`
