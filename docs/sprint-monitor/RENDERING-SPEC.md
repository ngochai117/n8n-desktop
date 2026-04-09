# Rendering Spec — Unified Sprint Digest

## Purpose

File này định nghĩa **format output cuối cùng** cho Sprint Monitor AI theo mô hình **single digest thread**.

Mục tiêu:

- giảm chữ
- tăng scanability
- tách **metrics cứng** khỏi **judgment/action**
- render card ID thành **Jira hyperlink**
- tag đúng người cần hành động
- phù hợp với behavior thực tế của Google Chat

Đây là lớp presentation/delivery. Không thay đổi logic judgment cốt lõi.

---

## 1. Core rendering principles

1. **Số liệu trước, narrative sau**
2. **Unified sprint digest trên Google Chat nên tách thành 2 message trong cùng thread: card trước, text sau**
3. **Không tách thành nhiều luồng alert riêng; một unified digest thread là chuẩn v1**
4. **Mọi issue key phải render thành hyperlink Jira**
5. **Mọi action phải có target rõ để map mention**
6. **Mention ưu tiên người cụ thể; không tag role chung nếu resolve được owner thật**
7. **Nếu không có action mới, không cố viết cho dài**
8. **Không viết kiểu báo cáo văn xuôi dài một cục**

---

## 2. Output layers

Output nên chia thành 2 lớp chính:

### Layer A — Metrics block

Là phần cứng, deterministic, dễ scan.
Với Google Chat, block này nên đi trong **card message riêng (cardsV2)**.

### Layer B — Action block

Là phần AI viết ngắn để chỉ ra:

- blocker chính
- quick win
- decision cần chốt
- ai cần xử lý

Với Google Chat, block này nên đi trong **text message tiếp theo cùng thread**.

---

## 3. Unified sprint digest format

## 3.1 Delivery strategy on Google Chat

Unified sprint digest chuẩn trên Google Chat phải gửi thành **2 message trong cùng thread**:

### Message 1 — Card

Chứa metrics + status + key signals.

### Message 2 — Text

Chứa action block:

- `Urgency:` ...
- `Main blocker:` ...
- `Quick win:` ...
- `Decision today:` ...

Không khuyến nghị nhét card + text vào cùng một message vì Google Chat thường render text lên trên, làm hỏng scan order.

## 3.2 Card structure

### Block 1 — Header

- `Sprint status:` `on track | at risk | likely spillover`
- `Days left:` `N`

### Block 2 — Workstream metrics

Render theo từng workstream nếu board có chia track.

Ví dụ:

- `FE passed: 0/10 tasks — 0/38 pts — 0% burned`
- `BE passed: 1/9 tasks — 1/41 pts — 2.4% burned`
- `QA passed: 0/4 tasks — 0/12 pts — 0% burned`

Nếu không có workstream rõ thì dùng team-level metrics.

### Block 3 — Key signals

Chỉ 2–4 dòng tối đa, ví dụ:

- `Blocked: 3 tasks`
- `In review: 2 tasks`
- `Not started: 7 tasks`
- `Main risk cluster: Epic 278099`

## 3.3 Text structure

Text message tiếp theo trong cùng thread ưu tiên tối đa 4 dòng theo thứ tự cố định:

- `Urgency:` ...
- `Main blocker:` ...
- `Quick win:` ...
- `Decision today:` ...

Fallback policy:

- ưu tiên lấy `Urgency` từ draft; nếu draft thiếu thì có thể bỏ dòng này
- nếu AI lỡ nhét urgency vào `Main blocker`, renderer tách phần urgency ra dòng riêng khi detect được pattern rõ
- `Main blocker`, `Quick win`, `Decision today` có thể omit nếu data yếu hoặc không đủ chắc

---

## 3.4 Unified digest example

### Message 1 — Card content

```text
Sprint status: likely spillover
Days left: 4

FE passed: 0/10 tasks — 0/38 pts — 0% burned
BE passed: 1/9 tasks — 1/41 pts — 2.4% burned
QA passed: 0/4 tasks — 0/12 pts — 0% burned

Blocked: 3 tasks
In review: 2 tasks
Main risk cluster: Epic 278099
```

### Message 2 — Threaded text content

```text
• Urgency: Còn 4 ngày · 6/87 pts done · cần chốt lại scope hôm nay.
• Main blocker: EXPENSE-4507 đang chặn EXPENSE-4503, EXPENSE-4498, và kéo theo EXPENSE-4495.
• Quick win: EXPENSE-4505 đang chờ review 3 ngày — có thể convert sang done nếu assign reviewer hôm nay.
• Decision today: @An xác nhận EXPENSE-4507 còn cứu được trong sprint không; @Mai chốt phần nào của Epic 278099 giữ lại, phần nào de-scope.
```

---

## 4. Why unified digest

Không tách alert thành nhiều luồng riêng vì:

- dễ thành spam khi số issue nhiều
- người nhận phải theo dõi nhiều luồng
- cùng một chuỗi blocker có thể vừa là insight điều phối vừa là insight chốt quyết định

Không giữ nhiều kênh nhắc riêng trong phiên bản hiện tại vì:

- giá trị chưa rõ so với noise risk
- dễ đụng ownership sai nếu data chưa sạch
- có thể bổ sung lại sau khi hệ thống ổn định

=> Phiên bản hiện tại chỉ giữ **1 unified digest thread** để mọi người follow cùng một chỗ.

---

## 6. Metrics rendering rules

## 6.1 Required formulas

### Tasks passed

`done_tasks / total_tasks`

### Points passed

`done_points / total_points`

### Burned percent

`done_points / total_points * 100`

Nếu `total_points = 0`:

- render `n/a` thay vì chia bừa

### Example

- `FE passed: 0/10 tasks — 0/38 pts — 0% burned`
- `BE passed: 1/9 tasks — 1/41 pts — 2.4% burned`

## 6.2 Workstream rollup

Mỗi task nên map về 1 workstream:

- `backend`
- `frontend`
- `web`
- `ios`
- `android`
- `qa`
- `unknown`

Nếu board dùng `FE` chung cho web/mobile thì render theo config team.

## 6.3 Secondary metrics

Cho phép render thêm nếu hữu ích:

- blocked count
- in review count
- not started count
- review queue age
- dependency blocked count

Nhưng unified digest card không nên vượt quá 3–4 signal lines.

---

## 7. Hyperlink rendering rules

## 7.1 Jira issue links

Mọi issue key trong text output phải được renderer scan bằng regex:

```text
[A-Z][A-Z0-9]+-\\d+
```

Mỗi match sẽ được map thành link rendering theo format text của Google Chat, giữ nguyên visible `cardId`:

```text
<https://your-jira-domain/browse/JIRA_KEY|JIRA_KEY>
```

## 7.2 Epic links

Nếu có epic key/id map được sang Jira URL thì cũng phải render thành link.

## 7.3 Fallback

Nếu không render link được:

- vẫn hiện key
- nhưng nên log internal warning
- không chặn cả message

---

## 8. Mention rules

Mention rules chi tiết nằm ở file riêng: `MENTION-RULES.md`.

Tại render layer, áp dụng các rule rút gọn sau:

- mention resolution theo **AI handle trong text** (`@thoa.le`, `@hung.ngo`) + role token chung (`@PM`, `@Lead`, ...)
- không ép map owner/reviewer/qcs theo line-context task để tránh map sai người
- legacy token rewrite (input-compatible):
  - `@PIC -> @ASSIGNEE`
  - `@Reviewer -> @OWNER`
  - `@QC -> @QCS`
- body render rule:
  - token mention nào cũng render dạng bold text token theo Google Chat markdown (`*@thoa.le*`, `*@PM*`)
  - với handle resolve được user thật: body vẫn giữ bold handle, không thay bằng full name
  - với role token/unresolved handle: vẫn giữ bold token, không fail message
- footer mention rule:
  - append 1 tail liên tục ở cuối text (`<users/...> <users/...> ...`), không thêm label prefix
  - chỉ gồm mention thực sự resolve được từ handle trong body, dedupe theo user id
- internal debug payload:
  - bỏ `mentionTokens`
  - dùng `lineMentions` (line -> context issue -> handles trong line -> resolved people -> appended mention ids)

---

## 9. Length limits

## 9.1 Unified digest

### Card message

- nên gọn vừa đủ để scan nhanh
- không nhồi narrative vào card

### Text message

- tối đa ~700–900 ký tự là đẹp
- tuyệt đối tránh thành 1 đoạn văn dài khó quét

Nếu vượt ngưỡng:

- cắt narrative
- giữ `Urgency` + `Main blocker` + `Decision today`

---

## 10. Content rules for Judgment block

## 10.0 Urgency

Phải nêu:

- thời gian còn lại (`days_left`)
- throughput pressure (`done/total pts` hoặc tasks)
- cue cần hành động trong hôm nay

## 10.1 Main blocker

Phải nêu:

- task/cluster nào là blocker chính
- nó đang chặn gì

## 10.2 Quick win

Phải nêu:

- task nào gần done nhất
- action nhỏ nào unlock được nhanh

## 10.3 Decision today

Phải nêu:

- ai cần chốt
- chốt cái gì
- chốt trong hôm nay / ngay bây giờ nếu cần

---

## 11. Tone rules

- ngắn
- trực diện
- không corporate fluff
- không kể chuyện dài
- không thuyết giảng
- không nhắc lại obvious facts quá nhiều

Không viết kiểu:

- “The current situation indicates that...”
- “Please kindly review and provide update...”

Nên viết kiểu:

- `Urgency: ...`
- `Main blocker: ...`
- `Quick win: ...`
- `Decision today: ...`

---

## 12. Prompt-to-render contract

AI judgment output nên bổ sung hoặc map được sang các field sau để render đẹp.

Lưu ý: `mentions_needed` chỉ là yêu cầu logic; mention thật sẽ được resolve deterministic theo `MENTION-RULES.md`.

```json
{
  "render_inputs": {
    "sprint_status": "likely spillover",
    "days_left": 4,
    "workstream_metrics": [
      {
        "label": "FE",
        "done_tasks": 0,
        "total_tasks": 10,
        "done_points": 0,
        "total_points": 38,
        "burned_percent": 0.0
      },
      {
        "label": "BE",
        "done_tasks": 1,
        "total_tasks": 9,
        "done_points": 1,
        "total_points": 41,
        "burned_percent": 2.4
      }
    ],
    "signals": [
      "Blocked: 3 tasks",
      "In review: 2 tasks",
      "Main risk cluster: Epic 278099"
    ],
    "main_blocker": "EXPENSE-4507 đang chặn EXPENSE-4503, EXPENSE-4498, và kéo theo EXPENSE-4495.",
    "quick_win": "EXPENSE-4505 đang chờ review 3 ngày — có thể convert sang done nếu assign reviewer hôm nay.",
    "decision_today": "Lead xác nhận EXPENSE-4507 còn cứu được trong sprint không; PM chốt phần nào của Epic 278099 giữ lại, phần nào de-scope.",
    "mentions_needed": [
      {
        "type": "person",
        "email": "lead@company.com",
        "reason": "decision_today",
        "priority": 1
      },
      {
        "type": "person",
        "email": "pm@company.com",
        "reason": "scope_decision",
        "priority": 2
      }
    ]
  }
}
```

---

## 13. Fallback behavior

Nếu AI draft quá dài hoặc quá lan man:

- bỏ draft
- render bằng deterministic template từ structured fields

Nếu thiếu `Urgency` hoặc `Urgency` quá chung chung:

- không tự generate fallback line; giữ output theo nội dung draft/parse được

Nếu không có quick win:

- bỏ dòng quick win

Nếu không có decision today rõ:

- bỏ dòng decision today (không nhét filler text)

---

## 14. Recommendation

Giữ AI cho phần judgment.
Giữ render layer thật cứng và có format chuẩn.

Với Google Chat, công thức đúng là:

- **AI quyết định nói gì**
- **render layer dựng unified digest thành 2 message cùng thread: card trước, text sau**
- **mention resolver chèn đúng người cần xử lý**

---

## 15. Change note — Jira link rendering

- regex: `[A-Z][A-Z0-9]+-\\d+`
- map thành link rendering dạng `<https://<jira-domain>/browse/<cardId>|<cardId>>`
- apply trên text output trước khi gửi Google Chat
- fallback: nếu text có cụm số rút gọn kiểu `4495/4498/4503`, renderer expand theo `jira_project_key` thành `PROJECTKEY-4495/PROJECTKEY-4498/PROJECTKEY-4503` rồi render link
- nếu thiếu `jira-domain` hoặc replace lỗi thì giữ plain text, không fail cả message

## 16. Change note — concise action-first wording

### Rule update

Unified digest text nên đi theo thứ tự cố định:

1. `Urgency:`
2. `Main blocker:`
3. `Quick win:`
4. `Decision today:`

### Wording rules

- `Urgency` phải là 1 dòng riêng, đặt lên đầu, nêu rõ thời gian còn lại + throughput/scope pressure.
- `Main blocker` đi thẳng vào task đang chặn và task bị chặn; không cần mở đầu kiểu “rủi ro sprint đang dồn vào...”.
- `Quick win` chỉ giữ thông tin làm đổi hành động; bỏ các chi tiết thừa như point/UAT nếu không cần cho quyết định.
- `Decision today` phải là quyết định cụ thể cần chốt, không nói chung chung theo epic/topic.
- Mỗi bullet phải có action owner rõ nếu resolve được mention.
- Mỗi bullet tối đa 1–2 câu ngắn.

Example rewrite:
Urgency: Còn 4 ngày · 6/87 pts done · cần chốt lại scope hôm nay.
Main blocker: EXPENSE-4507 đang chặn EXPENSE-4503 và EXPENSE-4498, gián tiếp giữ EXPENSE-4495. @thoa.le xác nhận hôm nay có kéo xong EXPENSE-4507 không.
Quick win: EXPENSE-4505 đang chờ review 3 ngày. @hung.ngo chốt review hôm nay.
Decision today: @PM chốt giữ phần nào trong sprint: nếu EXPENSE-4507 không xong trong 24h thì bỏ hoặc dời các task phụ thuộc, không tiếp tục giữ full scope.
