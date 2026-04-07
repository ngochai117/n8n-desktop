# n8n Spec — Check Sprint Execution Status

## Objective

Tạo workflow n8n sinh báo cáo `Check sprint execution status` cho project:
- `[QLCT] Quan Ly Chi Tieu, EXPENSE All items`
- `board_id: 1041`

Đầu ra là **text thuần**, đúng format yêu cầu, dùng cho cron hoặc gửi vào kênh chat.

---

## Output contract

Workflow phải trả về đúng cấu trúc text sau:

```text
- FE passed: <passed_tasks>/<total_tasks> tasks - <passed_points>/<total_points> points
- BE passed: <passed_tasks>/<total_tasks> tasks - <passed_points>/<total_points> points
- Review: <Đánh giá tóm gọn sức khỏe Sprint dựa trên tiến độ - thời gian hiện tại - ngày kết thúc sprint, tối đa 150 ký tự>.

*WARNINGS*:
@Member:
 * <link|KEY> Summary. <Lý do>.
```

Nếu không có warning nào:

```text
- FE passed: ...
- BE passed: ...
- Review: ...

*WARNINGS*:
Mọi thứ đang đúng tiến độ
```

Ràng buộc:
- Không có đoạn chào đầu
- Không có đoạn kết luận cuối
- Không code block
- Không bảng

---

## Business rules

### Scope dữ liệu
- Board: `1041`
- Sprint: sprint đang `active`
- Issue types lấy: `Task`, `Bug`
- Issue types loại bỏ: `Sub-task`, `Defect`

### Story points
- Nếu Story Point là `null` / rỗng → tính là `0`

### Passed statuses
Các status được xem là `Passed`:
- `Ready For Review`
- `In Review`
- `Ready For Release`
- `Close`

> Ghi chú: prompt gốc dùng `Close`. Nếu Jira thực tế có `Closed`, nên thêm normalize map `Closed -> Close` ở bước chuẩn hóa.

### Team classification
#### FE (Frontend)
Issue thuộc FE nếu thỏa ít nhất một điều kiện:
- Summary/title chứa một trong các token: `[App]`, `[APP]`, `[FE]` (không phân biệt hoa thường)
- Hoặc assignee display name chứa chữ `App`

#### BE (Backend)
Issue thuộc BE nếu summary/title chứa một trong các token:
- `[BE]`
- `[API]`

#### Fallback
- Nếu issue không match FE/BE thì bỏ khỏi thống kê FE/BE và bỏ khỏi warnings theo team, trừ khi muốn theo dõi ở bucket `UNKNOWN` nội bộ để debug.
- Khuyến nghị: giữ bucket `UNKNOWN` trong JSON nội bộ nhưng **không render ra output cuối**.

### Tagging rule
Khi cần tag mà thiếu người phù hợp:
- thiếu `Assignee` → tag `Reporter`
- thiếu `QCs` → tag `Reporter`

### Warning rules
Dùng **ngày làm việc** chứ không dùng ngày lịch.

#### 1) Task Dev ngâm lâu
Điều kiện:
- Status thuộc `[Open, In Progress]`
- Số ngày làm việc ở trạng thái hiện tại `> 7`

Tag:
- `Assignee`
- nếu thiếu thì `Reporter`

Lý do:
- `Ngâm Dev [X] ngày`

#### 2) Task đợi QC
Điều kiện:
- Status = `Ready For Test`
- Số ngày làm việc ở trạng thái hiện tại `> 1`

Tag:
- `QCs`
- nếu thiếu thì `Reporter`

Lý do:
- `Đợi QC [X] ngày`

#### 3) Task QC ngâm lâu
Điều kiện:
- Status = `In Test`
- Số ngày làm việc ở trạng thái hiện tại `> 7`

Tag:
- `QCs`
- nếu thiếu thì `Reporter`

Lý do:
- `Ngâm QC [X] ngày`

#### 4) Task cần PO approve gần cuối sprint
Điều kiện:
- thời điểm hiện tại cách `Sprint End Date <= 2 ngày làm việc`
  **hoặc** đã quá `Sprint End Date`
- và status thuộc `[Ready For Review, In Review]`

Tag:
- `Reporter`

Lý do:
- `Cần PO approve`

---

## Recommended n8n architecture

## Option recommended
Dùng kết hợp:
- **Cron node** hoặc trigger khác
- **Jira nodes / HTTP Request to Jira API** để lấy dữ liệu
- **AI Agent hoặc LLM node** để hỗ trợ mapping field phức tạp / tóm tắt review
- **Structured output parser** để ép AI trả JSON đúng schema
- **1 Code node mỏng** ở cuối để render text final

> Không nên dùng một prompt lớn để tự làm hết từ raw Jira sang final text. Dễ lệch số.

---

## Workflow stages

### Stage 1 — Fetch active sprint
#### Node 1: Trigger
- `Cron` hoặc `Manual Trigger`

#### Node 2: Get active sprint
Có 2 cách:
- Jira Software node nếu đủ field
- hoặc `HTTP Request`

Suggested API:
- `GET /rest/agile/1.0/board/1041/sprint?state=active`

Expected output:
- `sprintId`
- `sprintName`
- `startDate`
- `endDate`

Fail condition:
- nếu không có active sprint → workflow return text ngắn: `Không tìm thấy active sprint cho board 1041`

---

### Stage 2 — Fetch issues in sprint
#### Node 3: Get sprint issues
Suggested API:
- `GET /rest/agile/1.0/sprint/{sprintId}/issue`

Cần lấy đủ các field sau nếu có:
- `key`
- `summary`
- `description`
- `issuetype`
- `status`
- `assignee.displayName`
- `assignee.accountId` hoặc identifier nếu có
- `reporter.displayName`
- `reporter.accountId`
- custom field `Story Point`
- custom field `QCs`
- `created`
- `updated`
- `statuscategorychangedate` nếu có
- changelog / transitions nếu Jira instance cho phép kéo kèm
- `self` hoặc browse URL ingredients

Nếu node Jira không kéo đủ field/changelog:
- dùng `HTTP Request` + JQL + expand fields/changelog

---

### Stage 3 — Normalize Jira payload
#### Node 4: AI Agent or LLM — `Normalize Sprint Issues`
Vai trò:
- nhận raw Jira issue JSON
- map sang schema chuẩn nội bộ
- xử lý các field khó/không đồng nhất
- suy ra team FE/BE
- suy ra tag target fallback
- tính `currentStatusAgingBusinessDays` nếu input đã có mốc thời gian đủ rõ

**Quan trọng:** ép node này trả **JSON schema**, không trả prose.

### Input to node
- active sprint metadata
- danh sách issue raw
- `now` timestamp
- timezone: `Asia/Saigon`
- rule definitions cố định

### Required normalized schema

```json
{
  "sprint": {
    "id": 0,
    "name": "",
    "startDate": "",
    "endDate": "",
    "workingDaysElapsed": 0,
    "workingDaysRemaining": 0,
    "isNearEnd": false,
    "isOverdue": false
  },
  "issues": [
    {
      "key": "QLCT-123",
      "url": "https://jira/.../browse/QLCT-123",
      "summary": "...",
      "descriptionShort": "...",
      "issueType": "Task",
      "status": "In Progress",
      "storyPoints": 3,
      "team": "FE",
      "assignee": "Nguyen Van A",
      "assigneeTag": "@Nguyen Van A",
      "reporter": "Tran Thi B",
      "reporterTag": "@Tran Thi B",
      "qcs": ["Le Thi C"],
      "qcsTags": ["@Le Thi C"],
      "currentStatusAgingBusinessDays": 8,
      "isPassed": false,
      "warningCandidates": [
        {
          "type": "dev_stale",
          "ownerTag": "@Nguyen Van A",
          "reason": "Ngâm Dev 8 ngày"
        }
      ]
    }
  ]
}
```

### Prompt skeleton for node
System intent:
- You are a strict Jira data normalizer.
- Return JSON only.
- Never write prose.
- Apply business rules exactly.
- If a value is missing, use fallback rules.

Key instructions:
- Exclude `Sub-task` and `Defect`
- Keep `Task` and `Bug`
- `storyPoints = 0` when null
- FE/BE classification exactly by token rules
- Use `Reporter` when `Assignee` or `QCs` missing for tagging fallback
- Do not invent missing users beyond fallback
- Build `warningCandidates` strictly from provided rules
- Keep unknown/unmatched issues but set `team = UNKNOWN` for internal debug

### Why AI here is acceptable
Node này hợp để xử lý:
- custom field lộn xộn
- nhiều cấu trúc Jira khác nhau
- mapping `QCs` / `Story Point` / status labels
- parse description nếu summary thiếu nghĩa

Nhưng vì có số liệu, phải dùng **structured JSON output**.

---

### Stage 4 — Validate + aggregate
#### Node 5: AI Agent or LLM — `Aggregate Sprint Metrics`
Vai trò:
- đọc normalized JSON
- aggregate thành metrics cuối
- generate warnings grouped by member
- produce review context object cho bước final

Node này cũng phải trả **JSON schema**, không prose.

### Output schema

```json
{
  "sprint": {
    "name": "Sprint 52",
    "workingDaysElapsed": 6,
    "workingDaysRemaining": 2,
    "isNearEnd": true,
    "isOverdue": false
  },
  "teams": {
    "FE": {
      "passedTasks": 4,
      "totalTasks": 10,
      "passedPoints": 13,
      "totalPoints": 28
    },
    "BE": {
      "passedTasks": 6,
      "totalTasks": 12,
      "passedPoints": 20,
      "totalPoints": 31
    }
  },
  "warningsGrouped": [
    {
      "memberTag": "@Nguyen Van A",
      "items": [
        {
          "key": "QLCT-123",
          "url": "https://jira/.../browse/QLCT-123",
          "summary": "Tối ưu màn hình lịch sử giao dịch",
          "reason": "Ngâm Dev 8 ngày"
        }
      ]
    }
  ],
  "reviewInput": {
    "feRatio": "4/10",
    "beRatio": "6/12",
    "fePointRatio": "13/28",
    "bePointRatio": "20/31",
    "warningCount": 5,
    "keyRisks": [
      "FE đang chậm ở khâu dev",
      "nhiều task chờ QC",
      "sprint còn 2 ngày làm việc"
    ]
  }
}
```

### Notes
- `UNKNOWN` team không render vào final output
- Nếu FE hoặc BE không có task nào, vẫn render `0/0 tasks - 0/0 points`
- Warnings phải group theo `memberTag`
- Một task có thể tạo nhiều warning nếu thỏa nhiều điều kiện, nhưng khuyến nghị dedupe theo mức ưu tiên:
  1. `po_approve`
  2. `qc_stale`
  3. `wait_qc`
  4. `dev_stale`

Nếu một task trúng nhiều rule, chỉ render **1 warning quan trọng nhất** để output đỡ loạn.

---

### Stage 5 — Generate short review
#### Node 6: LLM — `Write Sprint Review`
Vai trò:
- chỉ viết đúng một dòng `Review`
- tối đa 150 ký tự
- không chào hỏi
- không markdown

### Input
- `reviewInput`
- sprint remaining days / overdue state
- warning count
- passed ratio FE/BE

### Prompt guidance
- đánh giá sức khỏe sprint dựa trên tiến độ, thời gian còn lại, số warning
- nói thẳng cần làm gì
- tối đa 150 ký tự
- tiếng Việt
- không mở đầu xã giao
- output chỉ là một câu duy nhất

### Example outputs
- `Sprint đang chậm ở FE và khâu QC; cần chốt review sớm, đẩy test trong 2 ngày còn lại.`
- `Tiến độ BE ổn hơn FE; sprint sát hạn, cần xử lý ngay các task chờ QC và PO approve.`

---

### Stage 6 — Render final text
#### Node 7: Code node nhẹ — `Render Output`
Node này chỉ làm string render cuối, không làm business logic nặng.

Pseudo render logic:

```javascript
const data = $json;

const fe = data.teams.FE || { passedTasks: 0, totalTasks: 0, passedPoints: 0, totalPoints: 0 };
const be = data.teams.BE || { passedTasks: 0, totalTasks: 0, passedPoints: 0, totalPoints: 0 };

const lines = [];
lines.push(`- FE passed: ${fe.passedTasks}/${fe.totalTasks} tasks - ${fe.passedPoints}/${fe.totalPoints} points`);
lines.push(`- BE passed: ${be.passedTasks}/${be.totalTasks} tasks - ${be.passedPoints}/${be.totalPoints} points`);
lines.push(`- Review: ${data.review}`);
lines.push('');
lines.push('*WARNINGS*:');

if (!data.warningsGrouped || data.warningsGrouped.length === 0) {
  lines.push('Mọi thứ đang đúng tiến độ');
} else {
  for (const group of data.warningsGrouped) {
    lines.push(`${group.memberTag}:`);
    for (const item of group.items) {
      lines.push(` * <${item.url}|${item.key}> ${item.summary}. ${item.reason}.`);
    }
  }
}

return [{ json: { text: lines.join('\n') } }];
```

---

## Suggested node list

1. `Cron Trigger`
2. `HTTP Request - Get Active Sprint`
3. `HTTP Request - Get Sprint Issues`
4. `AI Agent / LLM - Normalize Sprint Issues (structured JSON)`
5. `AI Agent / LLM - Aggregate Sprint Metrics (structured JSON)`
6. `LLM - Write Sprint Review`
7. `Code - Render Final Output`
8. `Send / Save / Post result`

---

## Why this split works

### AI dùng ở đâu
- normalize field phức tạp
- parse custom structure Jira
- viết 1 câu review ngắn

### Không dùng AI ở đâu
- gửi output
- cron scheduling
- fetch HTTP
- final text rendering

### Vì sao không nên all-in-one agent
- khó debug lệch số task/point
- khó test mỗi rule warning
- model dễ tự “sáng tạo” ngoài rule

---

## Testing checklist

### Test data correctness
- Có active sprint thật
- Story point null thành 0
- Không lấy Sub-task / Defect
- Vẫn lấy Bug
- FE/BE classification đúng token rule

### Test warnings
- Open/In Progress > 7 working days
- Ready For Test > 1 working day
- In Test > 7 working days
- Ready For Review/In Review gần sprint end hoặc overdue
- fallback tag về Reporter khi thiếu Assignee/QCs

### Test rendering
- đúng format text
- không code block
- không bảng
- warnings group theo member
- không warning thì ghi đúng `Mọi thứ đang đúng tiến độ`

---

## Future hardening

Sau khi chạy ổn 1-2 sprint, nên giảm AI dần ở phần normalize/aggregate nếu thấy output ổn định đủ để code hóa. Lúc đó:
- AI chỉ còn viết `Review`
- phần số liệu/warnings thành deterministic pipeline

Đó là đường bền hơn và ít tốn token hơn.

---

## Final recommendation

V1 cứ cho phép dùng `AI Agent` / `LLM` ở hai khâu:
- normalize Jira payload
- aggregate / warning grouping

Nhưng phải ép **structured JSON output** và giữ **Code node cuối cực mỏng** chỉ để render format. Đây là điểm cân bằng tốt giữa:
- ít code tay
- vẫn giữ business rule chặt
- debug được khi số bị lệch
