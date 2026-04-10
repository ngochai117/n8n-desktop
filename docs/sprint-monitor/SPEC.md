# Product + Behavior Spec — Sprint Monitor AI

## 1. Objective
Xây một hệ thống monitor sprint hành xử như **PM assistant thông minh**, không phải bot nhắc deadline theo giờ.

Hệ thống phải:
- đọc được ngữ cảnh theo pha sprint
- phát hiện risk thật thay vì bám cứng vào date/status
- biết khi nào **không nên gửi gì**
- khi đã gửi thì phải đưa ra **intervention hữu ích**
- hỗ trợ PM/lead ra quyết định nhanh hơn, không tăng noise

## 2. Product thesis
Completion thấp chưa chắc nguy hiểm.
Task im lặng chưa chắc đang ngâm.
Task có nhiều comment chưa chắc đang tiến triển.

Sản phẩm này phải đánh giá **khả năng về đích** và **mức đáng can thiệp** chứ không chỉ đọc raw board fields.

## 3. Target users
### Primary
- PM
- Engineering lead / team lead

### Secondary
- EM / delivery manager
- owner của task (giai đoạn sau)

## 4. Non-goals
- thay PM ra quyết định cuối cùng
- tự động sửa Jira/GitLab
- chấm KPI cá nhân
- dùng để giám sát vi mô nhân sự
- tạo thêm một kênh spam daily status

## 5. In-scope capabilities
- đọc dữ liệu sprint từ Jira
- đọc tín hiệu delivery từ GitLab
- tính rule-based signals
- dùng AI để judgment sprint health / task risk / intervention
- gửi digest hoặc alert vào Google Chat
- lưu issue lifecycle, suppression, audit log
- hỗ trợ mode selector runtime: `scan` và `review`

## 6. Out-of-scope for MVP
- auto DM owner trên diện rộng
- học pattern sâu nhiều quý dữ liệu
- write-back vào Jira/GitLab
- cross-team dependency graph toàn công ty

## 7. Product principles
1. **Fact first**: facts đến từ Jira/GitLab/tool layer, không từ AI suy đoán.
2. **Signals before stories**: phải có signal/metric trước khi AI diễn giải.
3. **Silence is a feature**: không có insight mới thì im.
4. **Cluster > spam**: ưu tiên bottleneck cấp cụm thay vì bắn từng task.
5. **Action > observation**: message phải dẫn tới hành động.
6. **Context-aware**: cùng một tín hiệu, pha sprint khác nhau thì xử khác nhau.
7. **Stateful**: phải nhớ issue đã được nhắc chưa, unresolved bao lâu.

## 8. End-to-end product behavior
### 8.1 Input
- sprint metadata
- task list trong sprint
- task activity/comments
- GitLab MR/review/pipeline signals
- prior issues/interventions
- team config/policy

### 8.2 Processing
- chuẩn hóa dữ liệu
- tính signals deterministic
- chọn candidates/clusters
- gọi AI judgment
- áp dụng suppression/escalation rules
- render message
- gửi Google Chat
- persist state

### 8.3 Output
- unified digest
- no-message decision
- internal issue log

## 9. Sprint phase model
### Phase A — Early sprint
Mục tiêu: phát hiện risk nền móng.

Quan tâm:
- task chưa assign
- scope mơ hồ
- estimate thiếu hoặc lệch lớn
- task quá to/chưa split
- dependency chưa surfaced
- quá nhiều work khởi động song song

Không nên overreact với completion ratio ở pha này.

### Phase B — Mid sprint
Mục tiêu: phát hiện stalled work và bottleneck hệ thống.

Quan tâm:
- task không đổi stage quá lâu
- review queue phình ra
- blocker không được remove
- completion thấp nhưng phải so với stage distribution
- owner/reviewer overload

### Phase C — Late sprint
Mục tiêu: đánh giá khả năng về đích thật sự.

Quan tâm:
- task quan trọng vẫn còn ở dev quá muộn
- downstream QA/UAT chưa kịp mở
- dependency chain unresolved
- scope chưa cắt dù buffer thấp
- sprint goal coverage thấp

### Phase D — Endgame / Post-sprint
Mục tiêu: cứu cái cứu được và ghi nhận root cause.

Quan tâm:
- task nào salvageable
- task nào chắc chắn carry over
- nguyên nhân nghẽn chính
- descoping / carry-over recommendation
- retro note candidates

## 10. Source-of-truth and data mapping
### Jira là source of truth cho:
- sprint metadata
- issue metadata
- assignee / labels / priority / estimate
- issue links / dependencies nếu team dùng ở Jira
- status transitions
- comments / activity log

### GitLab là source of truth cho:
- merge request status
- approvals / changes requested
- review age
- pipeline state
- commit recency (nếu map được)

### Google Chat là delivery-only
- không dùng làm source-of-truth cho trạng thái sprint
- không parse message Google Chat để suy ra progress trong MVP

## 11. Canonical entities
### 11.1 Sprint
Fields tối thiểu:
- sprint_id
- board_id
- team_id
- sprint_name
- sprint_goal
- start_at
- end_at
- timezone
- committed_points
- added_scope_points
- completed_points
- remaining_points

### 11.2 Task
Fields tối thiểu:
- task_id
- key
- title
- type
- priority
- assignee_id
- assignee_name
- reviewer_ids[]
- status
- status_category
- story_points
- created_at
- updated_at
- started_at (nếu có)
- done_at (nếu có)
- labels[]
- epic_id
- dependencies[]
- dependents[]
- blocked_by[]
- due_at

### 11.3 Delivery signal
- mr_state
- mr_opened_at
- review_requested_at
- approval_count
- changes_requested_count
- latest_pipeline_state
- latest_pipeline_at
- latest_commit_at

### 11.4 Activity excerpt
- task_id
- event_at
- event_type
- actor
- text
- source (`jira_comment`, `jira_transition`, `gitlab_mr`, `gitlab_review`, ...)

## 12. Signal engine spec
Signal engine là deterministic layer. Không dùng AI cho timestamp math hay dedupe.

### 12.1 Task-level signals
- `days_since_last_meaningful_update`
- `days_in_current_status`
- `is_blocked`
- `blocked_days`
- `review_pending_days`
- `qa_pending_days`
- `dependency_in_degree`
- `dependency_out_degree`
- `reopened_count`
- `status_transition_count_last_5d`
- `comment_activity_count_last_3d`
- `assignee_active_task_count`
- `reviewer_queue_count`
- `scope_added_mid_sprint`
- `candidate_score`
- `criticality`
- `current_stage_order`
- `expected_stage_order_for_phase`
- `likely_remaining_stage_count`

### 12.2 Sprint-level signals
- `phase`
- `elapsed_ratio`
- `completed_points_ratio`
- `scope_change_ratio`
- `tasks_not_started_ratio`
- `tasks_in_dev_ratio`
- `tasks_in_review_ratio`
- `tasks_in_qa_ratio`
- `blocked_ratio`
- `review_bottleneck_score`
- `qa_bottleneck_score`
- `dependency_risk_score`
- `burndown_delta_vs_expected`
- `velocity_alignment`
- `sprint_goal_coverage_score`

### 12.3 Meaningful update rules
Tính là meaningful nếu có ít nhất một trong các event:
- status change qua stage quan trọng
- MR opened / merged
- review requested / approval added
- blocker added/removed
- pipeline pass sau giai đoạn build/test quan trọng
- comment được classifier xác định là `real_progress`, `resolved_signal`, `review_pending`, `waiting_internal`, `waiting_external` có ý nghĩa giao vận thật

Không tính:
- metadata sync
- assignment change không mang nghĩa tiến triển
- comment filler (`checking`, `noted`, `will update soon`)
- automation comment vô nghĩa

## 13. AI responsibilities
AI service chỉ làm 4 việc:
1. classify comment meaning
2. judge sprint health
3. recommend intervention
4. draft concise messages

AI không làm:
- source-of-truth fetching
- metric calculation
- suppression/dedupe
- retry/delivery
- access control

## 14. Risk taxonomy
- `stale_no_progress`
- `blocked_external`
- `blocked_internal`
- `review_bottleneck`
- `qa_bottleneck`
- `overscoped_work`
- `dependency_chain_risk`
- `scope_creep`
- `likely_spillover`
- `unowned_work`
- `silent_but_probably_ok`
- `noise_do_not_alert`

## 15. Intervention taxonomy
- `NO_ACTION`
- `MONITOR_ONLY`
- `NUDGE_OWNER_FOR_UPDATE`
- `ASK_BLOCKER_CLARIFICATION`
- `SUGGEST_SPLIT_TASK`
- `SUGGEST_SCOPE_CUT`
- `SUGGEST_REASSIGN_REVIEWER`
- `ESCALATE_TO_LEAD`
- `ESCALATE_TO_PM`
- `FLAG_SPRINT_GOAL_RISK`
- `PREPARE_RETRO_NOTE`

## 16. Run modes
### 16.1 Scan mode
Cadence: chạy bởi scheduler mặc định.

Mục tiêu:
- radar + silence-first
- chỉ báo khi có thay đổi đủ mạnh

Deterministic gate:
- bắt buộc có ít nhất 1 trong các delta:
  - `newIssue`
  - `severityIncrease`
  - `materialChange`
  - `newGoalBlocker`

### 16.2 Review mode
Cadence: checkpoint chính (Monday/Thursday) hoặc near-end.

Mục tiêu:
- check-in chính với actionable digest
- nếu near-end thì framing phải nghiêng về salvage/de-scope/carryover

## 17. Candidate selection rules
Không ném cả backlog cho AI.

Pre-filter candidates theo:
- task có candidate score cao
- task trên critical path
- task ảnh hưởng sprint goal
- task có review age / blocked age / stale age cao
- cluster bất thường theo reviewer / assignee / epic / dependency chain
- unresolved issue đã từng alert

## 18. Output behavior rules
Message tốt phải trả lời:
- chuyện gì đang xảy ra
- tại sao đáng lo ngay bây giờ
- ảnh hưởng cụ thể là gì
- cần ai làm gì

Message tệ cần tránh:
- “Task A stale 3 ngày.”
- “Progress thấp.”
- “Please update status.”

## 19. Silence policy
Không gửi gì nếu:
- không có issue mới hoặc severity tăng
- completion thấp nhưng delivery outlook vẫn ổn
- issue đã biết và chưa có insight/action mới
- confidence thấp
- tín hiệu mâu thuẫn mạnh

`NO_MESSAGE` là outcome chính thức, phải được lưu vào run result.

## 20. Suppression policy
- cùng issue key không alert lặp lại trong suppression window
- unified digest suppressed mặc định 24h
- suppress đến khi severity tăng hoặc issue shape đổi
- review chỉ gửi khi có actionable insight và không bị DB suppression
- team-wide alerts rất hạn chế, MVP không bật mặc định

## 21. Responsibility routing
### Unified digest target
- sprint health
- goal risk
- likely spillover
- scope cut recommendation
- endgame summary
- review bottleneck
- dependency cluster risk
- workload imbalance
- unresolved blocker cluster

### Mention targets
- chỉ bật khi confidence cao
- chỉ cho case cần quyết định hoặc xử lý rõ ràng

## 22. Human-in-the-loop
Trong giai đoạn đầu, các output sau nên có review gate:
- team-wide alert
- message quy trách nhiệm cá nhân
- descoping recommendation gửi rộng
- PM escalation confidence thấp

## 23. Acceptance criteria
MVP đạt nếu:
- PM/lead thấy unified digest đáng đọc
- false positive thấp hơn bot rule-based cũ
- có nhiều run không gửi gì nhưng vẫn log đúng
- phát hiện đúng bottleneck review/dependency trong phần lớn case thật
- output đọc như người hiểu việc

## 24. Failure modes
- overreact giữa sprint
- spam stale tasks
- nhầm completion thấp = sprint nguy hiểm
- tin comment noise là progress thật
- lặp alert vô ích
- blame cá nhân không đúng dữ kiện

## 25. Guardrails
- evidence-first
- confidence bắt buộc
- JSON schema validation bắt buộc
- cap số alert mỗi run
- ưu tiên cluster alert
- không dùng AI output trực tiếp nếu chưa qua validator

## 26. Implementation handoff note
Bản spec này **không đủ một mình** cho build. Team triển khai phải dùng cùng:
- `ARCHITECTURE.md`
- `PROMPTS.md`
- `WORKFLOWS.md`
- `schema.sql`

## 27. Final recommendation
Chốt stack:
- **n8n** làm workflow backbone
- **AI judgment service** làm brain
- **PostgreSQL** làm state + audit store
- **Google Chat** làm delivery channel
