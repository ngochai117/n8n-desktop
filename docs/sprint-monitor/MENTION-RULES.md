# Mention Rules Spec — Sprint Monitor AI

## Purpose
File này định nghĩa cách hệ thống chọn **ai sẽ bị tag** trong Google Chat output.

Mục tiêu:
- tag đúng người cần xử lý
- tránh tag role chung vô nghĩa
- tránh tag sai người khi confidence thấp
- giữ message trực tiếp, actionable

Mention resolution là **deterministic layer**, không để AI bịa mention token trực tiếp.

---

## 1. Core principles
1. **Ưu tiên tag người cụ thể hơn tag role chung**
2. **Chỉ tag khi có action rõ cần người đó xử**
3. **Không tag bừa để trông cho có lực**
4. **Nếu ownership không chắc, giảm mức tag hoặc không tag**
5. **AI chỉ đề xuất ai cần tag; render layer resolve mention thật**

---

## 2. Mention data source
Nguồn chuẩn hiện tại:
- shared Google Sheet members source cố định, tái dùng như pattern `Get Members/Get User`

Nguồn lookup chính:
- **email**

Shape sheet v1 cố định 3 cột:
- `email`
- `id`
- `name`

V1 không dựa vào các cột role/team/active.
Role mapping `PM/Lead` chưa có trong sheet nên không resolve theo role; chỉ resolve được khi có email cụ thể.

---

## 3. Mention resolution flow

## Step 1 — AI/Judgment identifies responsible parties
AI hoặc deterministic judgment layer có thể trả về:
- assignee email
- reviewer email
- lead email
- PM email
- fallback role if unresolved

## Step 2 — Deterministic resolver maps email to mention
Resolver dùng shared Google Sheet members lookup theo email.

## Step 3 — Renderer inserts mention token
Nếu resolve được user cụ thể → render mention thật.
Nếu không resolve được → fallback theo policy.

---

## 4. Confidence model for tagging

### 4.1 High confidence
Tag thẳng người cụ thể nếu:
- task assignee rõ
- reviewer queue owner rõ
- blocker owner có email rõ
- action gắn trực tiếp với 1 người

### 4.2 Medium confidence
Tag 1 người chính + 1 người quyết định nếu:
- một người thực thi, một người chốt
- ví dụ owner + PM, reviewer + lead

### 4.3 Low confidence
Không tag người cụ thể nếu:
- ownership mơ hồ
- dependency chỉ inferred thấp
- sheet members không map chắc được email
- dữ liệu task thiếu assignee/reviewer rõ ràng

Fallback:
- dùng plain text name hoặc role label
- hoặc không tag ai

---

## 5. Priority order in unified digest

Unified digest tag theo thứ tự ưu tiên:
1. người cần ra quyết định hôm nay
2. người đang giữ blocker chính
3. người có thể unlock quick win nhanh nhất

Unified digest không nên tag quá nhiều người.
Max khuyến nghị: **2 người chính**, 3 nếu thật sự cần.

---

## 6. Who to tag by situation in unified digest

## 6.1 Task stuck in review
Tag theo ưu tiên:
1. reviewer cụ thể nếu biết rõ queue owner
2. lead nếu reviewer chưa rõ hoặc cần điều phối lại queue

## 6.2 Task blocked by assignee-side execution
Tag:
1. assignee task
2. lead nếu blocker đã kéo dài và cần escalation

## 6.3 Sprint scope / descoping decision
Tag:
1. PM cụ thể
2. lead nếu cần input delivery reality

## 6.4 Blocking chain affecting many tasks
Tag:
1. owner của upstream blocker nếu rõ
2. lead nếu cần re-plan sequencing
3. PM nếu phải de-scope / đổi phạm vi

## 6.5 Quick win ready-to-close
Tag:
1. reviewer hoặc assignee trực tiếp unlock được task

## 6.6 Ownership unclear
Không tag cá nhân trừ khi resolve được chắc.
Fallback:
- `Lead:` hoặc `PM:` dưới dạng text label
- hoặc bỏ mention

Lưu ý: các target này không còn được tách ra thành channel riêng. Chúng sẽ được gom vào `Decision today` hoặc `Quick win` của unified digest.

---

## 7. Anti-spam rules
- không tag quá 2 người chính trong unified digest, 3 nếu thật sự cần
- cùng một người không nên bị tag lặp quá dày cho cùng issue
- nếu issue chưa có insight mới, suppress mention lặp lại

---

## 8. Mention output contract
Renderer nên nhận input kiểu này:

```json
{
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
```

Sau đó resolver map sang:

```json
{
  "mentions_resolved": [
    {
      "email": "lead@company.com",
      "display_name": "An Nguyen",
      "mention_text": "<users/123456789>",
      "resolved": true
    }
  ]
}
```

---

## 9. Fallback policy

### If email exists but no member row found
- render plain name/email text if available
- log warning internally
- do not fail whole message

### If role known but person unknown
- use non-mention text like `Lead:` or `PM:`
- avoid fake mention strings

### If no reliable owner
- no tag
- keep action in text

---

## 10. Recommendation
- AI decides **who should act**
- deterministic resolver decides **who exactly gets tagged**
- rendering layer inserts final Google Chat mention token

Tóm tắt v1:
- resolve được khi có email cụ thể và sheet có row khớp
- không có role mapping `PM/Lead` trong sheet
- nếu chỉ biết role thì fallback text, không fail unified digest

Công thức đúng:
- **AI chọn target logic**
- **lookup service/renderer chọn mention thật**
