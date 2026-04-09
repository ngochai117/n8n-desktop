# Sprint Monitor Flow

## Nhìn nhanh
Sprint Monitor hiện có 4 workflow:

- `Sprint Monitor Light Scan`
- `Sprint Monitor Deep Analysis`
- `Sprint Monitor Endgame`
- `Sprint Monitor Engine`

Ba workflow đầu là lớp ngoài cùng. Chúng chỉ có nhiệm vụ:

1. chờ trigger manual hoặc cron
2. load `monitor_configs`
3. gọi `Sprint Monitor Engine`
4. gom kết quả thành summary

Vì vậy khi nhìn trên UI n8n, 3 workflow này trông gần như giống nhau là đúng thiết kế.

## Ba workflow ngoài khác nhau ở đâu?

- `Light Scan`
  - mục tiêu: phát hiện bất thường sớm
  - kỳ vọng: đa số run không gửi message
  - cron mặc định: `0 9 * * 1-5`
  - `runType`: `light_scan`

- `Deep Analysis`
  - mục tiêu: tạo PM digest và nhìn bottleneck rõ hơn
  - kỳ vọng: có thể gửi PM digest hoặc lead alerts chọn lọc
  - cron mặc định: `0 14 * * 2,4`
  - `runType`: `deep_analysis`

- `Endgame`
  - mục tiêu: nhìn nguy cơ spillover, scope cut, carryover
  - kỳ vọng: output thiên về quyết định cuối sprint và retro notes
  - cron mặc định: `0 16 * * *`
  - `runType`: `endgame`

Khác biệt lớn nhất hiện tại nằm ở `runType` truyền vào engine, không nằm ở graph ngoài cùng.

## Flow của `Sprint Monitor Engine`

### 1. Nhận input
Engine nhận 4 input:

- `runType`
- `workflowName`
- `triggerSource`
- `monitorConfig`

### 2. Normalize request
Engine chuẩn hóa config và tạo context chạy:

- timezone
- Jira/GitLab base URL
- project IDs
- Google Chat webhooks
- thresholds
- `runId`
- thời điểm chạy

### 3. Tìm active sprint trong Jira
Engine gọi Jira để lấy active sprint của board.

Nếu không có active sprint:

- không chạy tiếp
- ghi `runs` với trạng thái `skipped`
- trả kết quả `noMessage = true`

### 4. Lấy dữ liệu sprint từ Jira
Nếu có active sprint, engine lấy:

- sprint issues
- status
- assignee
- story points
- links/dependencies
- comments
- changelog

### 5. Lấy tín hiệu delivery từ GitLab
Engine lấy merge requests từ các project GitLab đã cấu hình.

Nó cố map MR về Jira issue key bằng cách đọc:

- MR title
- MR description
- branch name
- một số field commit/MR liên quan

Nếu không map chắc chắn được thì giữ signal ở mức yếu, không gán bừa vào task.

### 6. Normalize thành dữ liệu chuẩn
Engine biến raw data thành 3 nhóm chính:

- `sprint`
- `tasks`
- `activityExcerpts`

Đây là lớp dữ liệu chuẩn để các bước sau dùng chung.

### 7. AI classify comments
Engine gửi `activityExcerpts` sang AI để phân loại nghĩa của activity, ví dụ:

- progress thật
- đang chờ review
- chờ nội bộ
- chờ external
- QA pending
- noise

Mục tiêu là hiểu comment có ý nghĩa delivery hay không, thay vì chỉ đọc chữ.

### 8. Compute signals bằng rule deterministic
Sau bước classify, engine tính signal cho từng task:

- task đang đứng yên bao lâu
- review pending bao lâu
- QA pending bao lâu
- bị block hay không
- có quá nhiều dependency không
- assignee có overload không

Từ đó nó tạo:

- `topCandidateTasks`
- `topClusters`
- `sprintSignals`

### 9. Load prior state từ PostgreSQL
Engine đọc state cũ để biết lịch sử:

- open issues
- prior interventions
- historical patterns

Bước này giúp tránh spam và có suppression logic.

### 10. AI judge sprint
Engine gửi packet lớn hơn sang AI để judge:

- sprint health
- goal risk
- delivery outlook
- task risks
- cluster risks
- audience nên nhận alert
- có nên im lặng không
- có cần PM digest không

### 11. Delivery gate và suppression
Trước khi gửi message, engine kiểm tra:

- issue này đã alert gần đây chưa
- severity có tăng không
- có insight mới không
- PM digest có đang bị suppress không

Kết quả của bước này là:

- issue nào còn đáng gửi
- có gửi PM digest không
- có gửi lead alert không
- có thể `noMessage = true`

### 12. Draft message
Nếu cần gửi, engine gọi AI draft message.

Nếu draft fail:

- engine vẫn không drop run
- nó dùng fallback text deterministic

### 13. Gửi Google Chat
Engine gửi:

- PM digest vào PM webhook
- lead alerts vào lead webhook

Hiện tại owner nudges và team digest chưa bật cho MVP.

### 14. Persist toàn bộ state
Cuối run, engine ghi vào PostgreSQL:

- `runs`
- `sprint_snapshots`
- `task_snapshots`
- `activity_excerpts`
- `signal_snapshots`
- `issues`
- `interventions`
- `message_deliveries`
- `retro_notes` nếu là `endgame`

### 15. Trả kết quả cho workflow ngoài
Engine trả summary object:

- `runId`
- `status`
- `noMessage`
- `summaryJson`
- `deliverySummary`
- `persistSummary`

## Nói ngắn gọn
Nếu mô tả rất ngắn thì flow là:

`Trigger -> Load config -> Engine -> Jira + GitLab -> Normalize -> AI classify -> Compute signals -> Load prior state -> AI judge -> Suppress -> Draft -> Send Chat -> Persist`

## Khi nhìn UI n8n nên hiểu thế nào?

- thấy 3 workflow ngoài giống nhau: đúng, vì đó là wrapper
- thấy `Sprint Monitor Engine` dài: đúng, vì logic thật nằm ở đây
- muốn hiểu behavior hệ thống: đọc engine trước
- muốn hiểu lịch chạy và mode: đọc 3 wrapper ngoài
