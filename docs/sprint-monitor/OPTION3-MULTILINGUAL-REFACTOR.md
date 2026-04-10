# Option 3 Refactor Spec — Multilingual Judge Architecture

## Purpose
File này mô tả hướng refactor đầy đủ nếu hệ thống Sprint Monitor AI đi theo **Option 3**:
- Judge AI hỗ trợ đa ngôn ngữ như first-class capability
- nhưng gate, DB, suppression, history, material change vẫn ổn định
- text localized không được làm thay đổi semantic identity của issue

Đây là kiến trúc **đúng bài về lâu dài**, nhưng scope lớn hơn hẳn Option 1/2.

---

# 1. Problem statement

Hiện tại pipeline dễ bị trộn 2 thứ với nhau:
1. **semantics** — issue này là gì, risk gì, severity gì, có đáng gửi không
2. **narrative** — issue này được mô tả bằng tiếng gì, wording nào, câu dài hay ngắn

Nếu cho Judge đa ngôn ngữ mà không refactor hai lớp này, hệ thống sẽ rất dễ lỗi kiểu:
- cùng một issue nhưng đổi ngôn ngữ thành issue mới
- wording đổi thành material change giả
- gate gửi lại alert chỉ vì câu chữ khác
- suppression/history mất ổn định giữa các lần chạy

=> Muốn Option 3 chạy đúng, phải **tách semantics khỏi wording hoàn toàn**.

---

# 2. Architecture goal

Sau refactor, hệ thống phải đạt các tính chất sau:

## 2.1 Language-invariant gating
Cùng một dữ liệu risk, dù output là tiếng Việt hay tiếng Anh, quyết định:
- send / no_message
- suppression
- issue identity
- material change

phải **không đổi**.

## 2.2 Multilingual narrative
Judge có thể sinh narrative theo ngôn ngữ đích:
- English
- Vietnamese
- mixed/other languages nếu sau này cần

mà không phá semantic identity.

## 2.3 Stable issue history
DB và run history phải theo dõi issue theo **semantic signature**, không theo text.

## 2.4 Deterministic rendering compatibility
Links, mentions, formatting, cards vẫn do render layer deterministic xử lý.

---

# 3. Design principles

1. **Semantics first, narrative second**
2. **No free-text in issue identity**
3. **Enums/codes stay canonical and language-agnostic**
4. **Material change must be semantic, not stylistic**
5. **Render layer remains deterministic for links/mentions/layout**
6. **Narrative is replaceable; semantic model is not**

---

# 4. Target end-state pipeline

```text
Jira / GitLab / Confluence
-> canonical normalization
-> signal engine
-> mode selector (scan/review)
-> Judge AI
   -> semantic_output
   -> narrative_output
-> semantic signature builder
-> semantic material-change detector
-> suppression / gate / DB writes
-> render layer
-> Google Chat delivery
```

Trong pipeline này:
- `semantic_output` là nguồn cho gate/DB/history
- `narrative_output` là nguồn cho user-facing wording
- render layer chỉ lo trình bày, không quyết semantic identity

---

# 5. Core refactor: split semantic and narrative outputs

## 5.1 Judge output must be split
Judge AI phải trả ra tối thiểu 2 object cấp cao:

```json
{
  "semantic_output": {
    "run_mode": "scan|review",
    "phase": "early|mid|late|endgame",
    "send_recommendation": true,
    "reason_code": "ACTIONABLE_INSIGHT",
    "issues": [],
    "summary": {}
  },
  "narrative_output": {
    "language": "vi",
    "urgency": "string",
    "main_blocker": "string",
    "quick_win": "string",
    "decision_today": "string"
  }
}
```

## 5.2 What belongs in semantic_output
Semantic layer phải chứa mọi thứ cần cho:
- issue identity
- gate/no_message
- suppression
- history
- material change detection
- analytics/eval

## 5.3 What belongs in narrative_output
Narrative layer chỉ nên chứa:
- user-facing text
- localized summaries
- short wording for digest blocks

Narrative không được quyết định issue identity.

---

# 6. Canonical semantic model

## 6.1 Canonical issue object
Mỗi issue phải được chuẩn hóa về object như sau:

```json
{
  "entity_type": "task|cluster|sprint",
  "entity_id": "EXPENSE-4507",
  "risk_type": "dependency_chain_risk",
  "severity": "low|medium|high",
  "recommended_action": "ESCALATE_TO_PM|SUGGEST_SCOPE_CUT|MONITOR_ONLY|...",
  "action_owner_type": "assignee|reviewer|lead|pm|team|none",
  "decision_owner_type": "lead|pm|none",
  "execution_owner_type": "assignee|reviewer|lead|none",
  "confidence": 0.84,
  "change_flags": ["new_issue", "severity_up", "material_change"],
  "phase": "mid",
  "is_goal_blocker": true,
  "is_quick_win": false,
  "blocking_entities": ["EXPENSE-4503", "EXPENSE-4498"],
  "blocked_entities": ["EXPENSE-4495"],
  "evidence_refs": ["jira:comment:123", "gitlab:mr:456"]
}
```

## 6.2 Canonical summary object
Ngoài issue-level, cần summary-level semantic object:

```json
{
  "delivery_outlook": "likely_on_track|at_risk_but_recoverable|likely_spillover",
  "goal_risk": "low|medium|high",
  "days_left": 4,
  "completed_points": 6,
  "total_points": 87,
  "elapsed_ratio": 0.579,
  "review_mode": "standard|endgame",
  "has_actionable_insight": true
}
```

---

# 7. Enums and codes must remain language-agnostic

Judge đa ngôn ngữ **không có nghĩa** semantic enums được localized.

## 7.1 Must remain canonical
- `risk_type`
- `severity`
- `recommended_action`
- `action_owner_type`
- `decision_owner_type`
- `execution_owner_type`
- `change_flags`
- `delivery_outlook`
- `goal_risk`

## 7.2 Must not be localized in semantic layer
Sai ví dụ:
- `risk_type = "rủi ro phụ thuộc"`
- `recommended_action = "cắt scope"`

Đúng phải là:
- `risk_type = "dependency_chain_risk"`
- `recommended_action = "SUGGEST_SCOPE_CUT"`

Narrative layer mới được localized.

---

# 8. issue_signature refactor

## 8.1 Why this is the most critical change
Nếu `issue_signature` còn dựa vào free-text như `why_now` hoặc `summary`, thì Option 3 sẽ spam/duplicate ngay khi đổi ngôn ngữ hoặc wording.

## 8.2 New signature rules
`issue_signature` chỉ được build từ structured fields ổn định.

### Recommended signature input
- `entity_type`
- `entity_id`
- `risk_type`
- `severity`
- `recommended_action`
- `action_owner_type`
- `decision_owner_type`
- `execution_owner_type`
- `phase` (optional; cân nhắc nếu muốn phase-change tạo signature khác hay không)

### Must not be included
- `why_now`
- `urgency text`
- `main_blocker text`
- `quick_win text`
- `decision_today text`
- raw evidence prose
- any localized strings

## 8.3 Optional secondary signatures
Có thể thêm:
- `narrative_signature` — chỉ để quan sát wording change
- `render_signature` — để debug render behavior

Nhưng các signature này **không được dùng cho suppression/gating**.

---

# 9. Material change detection refactor

## 9.1 Split into two concepts
### A. semantic_material_change
Dùng để quyết định có gửi message hay không.

### B. narrative_change
Dùng cho observability/debugging, không tác động gate.

## 9.2 semantic_material_change should trigger on
- issue mới xuất hiện
- severity tăng
- recommended_action đổi
- owner type đổi
- impacted entities đổi
- blocker mới ảnh hưởng sprint goal
- review mode đổi sang endgame và làm decision shape đổi thực chất

## 9.3 narrative_change should NOT trigger send by itself
Ví dụ narrative đổi do:
- đổi ngôn ngữ vi ↔ en
- câu gọn hơn
- từ đồng nghĩa khác
- thay đổi phrasing nhưng semantics giữ nguyên

=> không được coi là material change gửi lại alert.

---

# 10. Database refactor

## 10.1 Store semantic and narrative separately
### issues table
Nên thêm hoặc đảm bảo có các cột/object sau:
- `semantic_signature`
- `semantic_json`
- `last_semantic_change_at`
- `narrative_json`
- `last_narrative_change_at`
- `message_language`

## 10.2 Recommended DB shape
Ví dụ object lưu trong DB:

```json
{
  "semantic_signature": "sha256(...)",
  "semantic_json": {
    "entity_type": "task",
    "entity_id": "EXPENSE-4507",
    "risk_type": "dependency_chain_risk",
    "severity": "high",
    "recommended_action": "SUGGEST_SCOPE_CUT"
  },
  "narrative_json": {
    "language": "vi",
    "main_blocker": "EXPENSE-4507 đang chặn ..."
  }
}
```

## 10.3 Migration approach
- giữ dữ liệu cũ nếu có
- backfill `semantic_signature` từ structured fields hiện tại
- ngừng dùng free-text signature sau migration

---

# 11. Gate refactor

## 11.1 Delivery gate must use semantic layer only
Gate should read:
- `send_recommendation`
- `reason_code`
- `semantic_material_change`
- `suppression status`
- `run_mode`

Gate should NOT read:
- localized urgency string
- localized why_now
- text summary length/style

## 11.2 Gate rules
### scan mode
Chỉ gửi nếu:
- new semantic issue
- severity up
- meaningful action change
- new goal blocker

Nếu chỉ narrative đổi → `no_message`.

### review mode
Cho phép gửi nếu:
- actionable insight tồn tại
- not suppressed by DB
- narrative localized sẵn sàng hoặc deterministic fallback sẵn sàng

### review + endgame framing
Bắt buộc có decision-oriented semantic output:
- salvageable/not
- scope cut / carryover recommendation

---

# 12. Prompt refactor

## 12.1 Prompt must explicitly separate semantic and narrative outputs
System prompt cần ép Judge:
- first decide structured semantics
- then write localized narrative
- never let localized wording alter semantic enums/codes

## 12.2 Required prompt rule
Ví dụ rule:

> Return two separate outputs:
> 1. semantic_output: language-agnostic codes and structured issue decisions used for gating/history
> 2. narrative_output: localized user-facing wording for digest rendering
> Never localize or paraphrase semantic enums/codes.
> Changes in narrative wording alone must not imply a new issue or material change.

## 12.3 message_language handling
Judge có thể nhận:
- `reasoning_language = en`
- `message_language = vi|en|...`

Judge reasoning vẫn có thể ở EN, nhưng `narrative_output` theo `message_language`.

---

# 13. Render layer responsibilities after refactor

Sau Option 3 refactor, render layer vẫn giữ vai trò deterministic ở các phần sau:
- layout card/text
- Jira link injection
- Google Chat mention resolution
- label placement
- length caps
- fallback phrasing if narrative missing

Render layer không thay semantic identity.

## 13.1 Input to render layer
```json
{
  "semantic_output": {},
  "narrative_output": {},
  "render_inputs": {
    "workstream_metrics": [],
    "signals": [],
    "mentions_needed": []
  }
}
```

## 13.2 Fallback behavior
Nếu `narrative_output` fail hoặc không đạt quality:
- render deterministic text từ semantic fields
- không fail cả run nếu semantic layer vẫn hợp lệ

---

# 14. Message language strategy

## 14.1 Separate reasoning and message language
- `reasoning_language`: EN canonical
- `message_language`: config per room/team

## 14.2 Source inputs remain in original language
Jira/Confluence/comments có thể là vi/en/mixed.
Judge phải đọc source nguyên gốc, nhưng semantic output vẫn canonical.

## 14.3 Preserve as-is fields
Luôn preserve:
- issue keys
- epic keys
- human names
- proper nouns
- technical labels nếu team cần

---

# 15. Suggested API contract changes

## 15.1 Judge endpoint request
```json
{
  "run_context": {
    "run_mode": "scan|review",
    "phase": "mid|late|endgame"
  },
  "language_config": {
    "reasoning_language": "en",
    "message_language": "vi"
  },
  "policy": {},
  "sprint_snapshot": {},
  "top_clusters": [],
  "candidate_tasks": [],
  "activity_excerpts": [],
  "prior_interventions": [],
  "historical_patterns": []
}
```

## 15.2 Judge endpoint response
```json
{
  "semantic_output": {
    "run_mode": "review",
    "phase": "late",
    "send_recommendation": true,
    "reason_code": "ACTIONABLE_INSIGHT",
    "summary": {
      "delivery_outlook": "likely_spillover",
      "goal_risk": "high",
      "days_left": 4,
      "completed_points": 6,
      "total_points": 87,
      "elapsed_ratio": 0.579,
      "review_mode": "standard"
    },
    "issues": [
      {
        "entity_type": "task",
        "entity_id": "EXPENSE-4507",
        "risk_type": "dependency_chain_risk",
        "severity": "high",
        "recommended_action": "ESCALATE_TO_PM",
        "action_owner_type": "lead",
        "decision_owner_type": "pm",
        "execution_owner_type": "lead",
        "confidence": 0.87,
        "change_flags": ["material_change"],
        "is_goal_blocker": true,
        "is_quick_win": false,
        "blocking_entities": ["EXPENSE-4503", "EXPENSE-4498"],
        "blocked_entities": ["EXPENSE-4495"],
        "evidence_refs": ["jira:transition:123"]
      }
    ]
  },
  "narrative_output": {
    "language": "vi",
    "urgency": "Còn 4 ngày · sprint đã qua 57.9% thời gian · mới xong 6/87 điểm → risk spillover cao.",
    "main_blocker": "EXPENSE-4507 đang chặn EXPENSE-4503, EXPENSE-4498 và gián tiếp giữ EXPENSE-4495.",
    "quick_win": "EXPENSE-4505 đang ở Ready For Review 3 ngày.",
    "decision_today": "Khóa danh sách must-land và bỏ scope nhánh phụ thuộc nếu 4507 không xong trong 24h."
  }
}
```

---

# 16. Suggested workflow changes

## 16.1 Build Judge Inputs
Thêm:
- `language_config.reasoning_language`
- `language_config.message_language`

## 16.2 Structured Parser
Phải parse được cả:
- `semantic_output`
- `narrative_output`

## 16.3 Build Signatures
Tách node/signature builder:
- `semantic_signature`
- optional `narrative_signature`

## 16.4 Delivery Gate
Gate chỉ đọc semantic layer + suppression DB.

## 16.5 Build Render Model
Ghép:
- semantic summary
- localized narrative
- metrics/signals
- mention/link placeholders

---

# 17. Migration plan

## Phase 1 — Introduce dual-output contract
- Judge bắt đầu trả semantic + narrative
- nhưng gate vẫn có backward-compatible fallback

## Phase 2 — Switch signature to semantic-only
- backfill DB
- stop using free-text in issue identity

## Phase 3 — Split material change detection
- semantic vs narrative change
- observability dashboards kiểm tra mismatch

## Phase 4 — Enable multilingual Judge broadly
- bật cho vi/en
- test same-risk different-language invariance

## Phase 5 — Cleanup legacy assumptions
- remove old free-text-based gating logic
- remove duplicated narrative fields if obsolete

---

# 18. Test plan

## 18.1 Gate invariance
Cùng dataset, đổi `message_language` en ↔ vi:
- send/no_message không đổi
- issue signature không đổi
- suppression behavior không đổi

## 18.2 Narrative stability
Chỉ wording đổi, semantics giữ nguyên:
- không tạo issue mới
- không trigger material change

## 18.3 Semantic change detection
Severity/recommended_action/owner_type đổi:
- phải trigger material change đúng

## 18.4 Mention/link integrity
- localized narrative không làm hỏng Jira keys
- mentions vẫn resolve đúng
- placeholders được restore đúng

## 18.5 Failure path
Nếu narrative output fail nhưng semantic output valid:
- fallback deterministic render vẫn gửi được nếu gate cho phép

---

# 19. Risks

## 19.1 Refactor complexity
Đây là refactor kiến trúc, không phải patch nhỏ.

## 19.2 Migration bugs
Nếu backfill signature sai, history/suppression có thể lệch.

## 19.3 Prompt drift
Judge có thể lẫn semantic và narrative nếu prompt không đủ chặt.

## 19.4 Team misunderstanding
Nếu team không hiểu semantic vs narrative split, họ sẽ lại đưa free-text vào gate sau vài tuần rồi tự phá hệ thống.

---

# 20. Recommendation
Nếu chọn Option 3, đừng làm kiểu nửa mùa.

Thứ tự đúng là:
1. **canonical semantic model**
2. **semantic-only signature**
3. **semantic material-change gate**
4. **dual-output Judge (semantic + narrative)**
5. **multilingual narrative rollout**

Một câu chốt:
> Muốn Judge đa ngôn ngữ mà hệ thống vẫn tỉnh táo, hãy để **semantics là xương sống**, còn **ngôn ngữ chỉ là lớp da**.
