# Learning Roadmap — Sprint Monitor AI

## Purpose
File này mô tả phần **tự học / thích nghi theo thời gian** cho Sprint Monitor AI.

Nó không nằm trong MVP cốt lõi.
Mục tiêu là để sau khi hệ thống chạy ổn định, có thể nâng dần từ:
- monitor biết đọc ngữ cảnh
thành
- monitor biết học từ outcome và hành vi của team

---

## 1. Current state
Ở trạng thái hiện tại, hệ thống mới thông minh ở mức:
- rule-based signals
- AI judgment theo snapshot
- suppression/dedup theo policy
- unified digest/action recommendation

Hệ thống **chưa phải self-learning system** theo nghĩa mạnh.

---

## 2. What “learning” should mean here
“Tự học” trong bối cảnh này không nên hiểu là:
- tự sửa prompt lung tung
- tự đổi policy không kiểm soát
- tự kết luận cứng về con người

Nó nên được hiểu là:
- nhớ outcome sau mỗi alert
- rút soft patterns từ nhiều sprint
- dùng pattern đó như prior nhẹ để giảm false positive và tăng relevance

---

## 3. Learning goals
Sau MVP, learning layer nên giúp hệ thống làm tốt hơn ở 4 chỗ:

### 3.1 Better alert relevance
- giảm spam
- giảm false positive
- biết issue nào team thường tự xử, issue nào cần nhắc

### 3.2 Better timing
- biết lúc nào team hay close dồn cuối sprint
- biết khi nào review queue bắt đầu thành bottleneck thật
- biết khi nào “im thêm một chút” là hợp lý, khi nào phải đẩy ngay

### 3.3 Better interpretation
- hiểu loại task nào thường underestimate
- hiểu workstream nào hay bị phụ thuộc upstream
- hiểu tình huống nào nhìn chậm nhưng thực ra vẫn on-track

### 3.4 Better wording and routing
- kiểu message nào lead phản hồi tốt hơn
- kiểu issue nào nên tag ai
- kênh nào hiệu quả hơn cho loại action nào

---

## 4. What data to store for learning

## 4.1 Outcome tracking
Cho mỗi intervention, nên lưu:
- issue_key
- run_id
- issue type
- severity lúc alert
- audience được tag
- message sent
- delivered_at
- sau đó issue có được xử không
- thời gian từ alert đến first action
- task có move stage không
- blocker có được clear không
- cuối sprint prediction có đúng không

## 4.2 Sprint outcome history
Mỗi sprint nên lưu:
- committed vs delivered scope
- spillover count
- review bottleneck occurrences
- blocked time distribution
- workstream imbalance
- top root causes

## 4.3 Behavior signals
Có thể lưu thêm:
- response delay theo loại issue
- frequency issue bị ignore
- review queue age by person/team
- stage duration by task type
- reopened rate

---

## 5. Suggested learning categories

## 5.1 Team-level patterns
Ví dụ:
- team này thường close mạnh ở 20% cuối sprint
- review hay nghẽn ở cuối tuần
- QA hay thành bottleneck sau khi BE merge hàng loạt
- mobile tasks hay cần thêm 1 vòng stabilization

## 5.2 Task-type patterns
Ví dụ:
- tech debt tasks thường bị underestimate
- integration tasks hay spill nếu chưa có staging sớm
- stories > 8 points hay bị carry over

## 5.3 Workstream patterns
Ví dụ:
- App thường phụ thuộc BE deploy/staging
- BE nhanh merge nhưng queue review lại nghẽn
- QA thường không phải nút thắt ở đầu sprint, nhưng thành nút thắt ở cuối

## 5.4 Routing patterns
Ví dụ:
- loại issue A nên tag lead trước
- loại issue B chỉ cần PM chốt
- loại issue C không đáng tag ai nếu chưa đủ confidence

---

## 6. How learning should be used
Learning chỉ nên được dùng như **soft prior**.

### Good use
- giảm confidence của alert nếu pattern lịch sử cho thấy tình huống này thường tự ổn
- tăng sensitivity nếu pattern cho thấy loại issue này hay biến thành spillover
- đổi timing hoặc routing cho hợp team hơn

### Bad use
- bỏ qua facts chỉ vì “mọi lần vẫn ổn”
- suy diễn cố định về cá nhân
- auto-suppress issue quan trọng vì vài lần trước bị ignore

---

## 7. Guardrails

## 7.1 No hard person judgment
Không để hệ thống học kiểu:
- người A hay chậm
- người B unreliable

Nếu có data person-level thì chỉ dùng cực nhẹ cho:
- review queue load
- routing practicality
- never for blame language

## 7.2 Evidence always wins
Nếu facts hiện tại cho thấy risk cao, pattern cũ không được override hoàn toàn.

## 7.3 Human-reviewable patterns
Pattern được rút ra nên:
- có evidence
- có timestamp
- có strength score
- có thể xem/xóa/tắt nếu thấy ngu

---

## 8. Rollout recommendation

## Phase 1 — Passive memory
Chỉ lưu:
- interventions
- issue outcomes
- sprint outcomes

Chưa dùng để thay đổi behavior nhiều.

## Phase 2 — Soft pattern summaries
Sinh ra pattern summaries như:
- review bottleneck hay xuất hiện cuối sprint
- task type X hay spill
- team có burst close cuối sprint

Dùng pattern này như context thêm cho Judge AI.

## Phase 3 — Policy tuning support
Dùng learning để hỗ trợ:
- suppression tuning
- confidence tuning
- timing/routing tuning

Vẫn không để tự sửa policy hoàn toàn.

## Phase 4 — Human-approved adaptation
Cho admin/PM duyệt một số pattern hoặc tuning proposal trước khi bật chính thức.

---

## 9. Minimum DB additions after MVP
Nếu muốn learning tử tế hơn, nên thêm hoặc tận dụng các bảng sau:
- `interventions`
- `issues`
- `message_deliveries`
- `historical_patterns`
- `retro_notes`
- `sprint_snapshots`

Có thể thêm bảng mới nếu cần:
- `issue_outcomes`
- `pattern_feedback`
- `policy_adjustment_candidates`

---

## 10. Example learning outputs
Ví dụ hệ thống có thể sinh pattern như:
- `In the last 5 sprints, review queue became the main bottleneck in the final 25% of sprint 4 times.`
- `Tasks tagged integration/mobile spilled over in 3 of the last 4 sprints when staging was unavailable by mid-sprint.`
- `This team usually closes 30–40% of delivered points in the final 2 days, so low mid-sprint burn alone should not trigger strong alerts.`

---

## 11. Recommendation
Không nên build learning loop ngay trong MVP nếu mục tiêu là ship nhanh và giữ hệ thống ổn định.

Roadmap khôn là:
1. ship MVP deterministic + AI judgment trước
2. log outcome đầy đủ
3. bật passive learning
4. thêm soft patterns
5. chỉ sau đó mới tune behavior theo thời gian

Nói ngắn:
> Trước hết hãy làm nó hữu ích và đáng tin.
> Sau đó mới làm nó “biết lớn lên”.
