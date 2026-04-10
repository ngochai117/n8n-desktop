# System Architecture — Sprint Monitor AI

## 1. Architecture decision
Chosen architecture:
- **n8n** for orchestration, scheduling, retries, branching, integrations
- **AI Judgment Service** for analysis, classification, and decisioning
- **PostgreSQL** for state, issue lifecycle, audit, delivery logs, learned patterns
- **Google Chat** for notifications
- **Jira + GitLab** as upstream systems

This system is deliberately split into deterministic layers and AI layers.

---

## 2. Layer responsibilities

## 2.1 Upstream systems
### Jira
Responsible for:
- sprint metadata
- issue metadata
- workflow status/history
- comments/activity
- assignee/priority/estimate
- issue links/dependencies when available

### GitLab
Responsible for:
- merge request state
- approvals / changes requested
- review timestamps
- pipeline state
- commit freshness

## 2.2 n8n layer
Responsible for:
- schedule triggers
- fetching Jira data
- fetching GitLab data
- joining and normalizing upstream data
- calling signal compute steps
- loading prior state from PostgreSQL
- building AI payload packets
- calling AI endpoints
- validating response presence and enforcing semantic gating rules
- applying suppression checks before delivery
- writing run results, issues, interventions, and deliveries to PostgreSQL
- failure routing and retry policies

Not responsible for:
- nuanced PM judgment
- freeform prompt logic sprawl
- long-term business logic embedded in dozens of IF nodes

## 2.3 AI Judgment Service
Responsible for:
- comment meaning classification
- sprint health assessment
- task and cluster risk classification
- intervention recommendation
- producing dual-output judgment (`semantic_output` + `narrative_output`)
- JSON schema validation for generated responses

Not responsible for:
- fetching Jira/GitLab directly in MVP
- storing canonical issue state
- dedupe/suppression
- delivery retries

## 2.4 PostgreSQL
Responsible for:
- config
- sprint snapshots
- run history
- open issues
- interventions sent
- message deliveries
- pattern summaries
- auditability

## 2.5 Google Chat delivery
Responsible for:
- unified digest thread delivery
- optional team digest later

Not responsible for:
- state tracking
- acknowledgement logic in MVP

---

## 3. Runtime topology

### Services
1. n8n instance
2. AI judgment service API
3. PostgreSQL database
4. outbound Google Chat webhook/bot integration
5. Jira + GitLab APIs

### Deployment notes
- n8n and AI service should be separately deployable
- AI service should expose HTTP JSON APIs
- PostgreSQL should be shared by n8n and AI service only if needed; preferred: n8n owns persistence, AI service remains mostly stateless

---

## 4. Canonical processing pipeline

## Step 1 — Trigger
A single cron in n8n starts `Sprint Monitor Scheduler`.
Scheduler then calls `Sprint Monitor Engine`, where mode is selected at runtime (`scan`/`review`).

## Step 2 — Load config
n8n loads runtime config from DB or environment:
- team_id
- board_id
- unified Google Chat webhook
- suppression windows
- confidence thresholds
- phase thresholds

Google Sheet members source không nằm trong `monitor_configs`.
V1 dùng shared source cố định trong workflow để resolve mention theo email.

## Step 3 — Fetch current sprint context
n8n fetches:
- active sprint from Jira
- sprint tasks
- task details
- issue links
- recent activity/comments
- GitLab MR/review/pipeline state for mapped tasks

## Step 4 — Normalize data
n8n or a helper code node maps raw upstream payloads into canonical objects:
- sprint object
- task objects
- activity excerpts
- delivery signal objects

## Step 5 — Compute signals
n8n computes deterministic task/sprint signals or calls helper code/service.

## Step 6 — Load prior state
n8n queries PostgreSQL for:
- open issues in current sprint
- prior interventions
- historical patterns
- previous run summary

## Step 7 — Candidate selection
n8n reduces prompt size by selecting:
- high candidate score tasks
- unresolved issues
- top abnormal clusters
- tasks on sprint goal path

## Step 8 — AI judgment
n8n sends packet to `POST /judge-sprint`.

## Step 9 — Validation and policy check
n8n validates:
- JSON returned
- required fields exist
- severity/action enums valid
- confidence thresholds respected
- alert caps not exceeded

## Step 10 — Deterministic semantic gate
n8n computes deterministic change flags from semantic fields only:
- `newIssue`
- `severityIncrease`
- `materialChange` (semantic signature)
- `newGoalBlocker`

Gate does not read localized free-text.

## Step 10.5 — Render localized messages
n8n renders localized text/card from `narrative_output`.
If narrative is weak or missing, renderer falls back to deterministic text from semantic fields.

## Step 11 — Resolve mentions
n8n đọc shared Google Sheet members source cố định với 3 cột:
- `email`
- `id`
- `name`

Resolver chỉ map mention thật khi có email cụ thể.
Nếu chỉ biết role như `PM` hoặc `Lead`, renderer fallback text thay vì bịa mention.

## Step 12 — Suppression and dedupe
Before delivery, n8n checks DB for:
- same issue_key recently alerted
- same responsibility target recently mentioned
- unresolved issue with no material change

## Step 13 — Deliver
n8n posts a unified digest thread to Google Chat.

## Step 14 — Persist results
n8n writes:
- run record
- issue upserts
- interventions sent
- message deliveries
- optional retro notes candidates

---

## 5. Run modes

## 5.1 Scan
Purpose:
- radar mode with silence-by-default
- only notify when deterministic delta exists (`newIssue` / `severityIncrease` / `materialChange` / `newGoalBlocker`)

Expected output:
- compact 2-3 delta lines
- no full 4-block unified digest

## 5.2 Review
Purpose:
- primary checkpoint digest with actionable decisions

Selection:
- Monday/Thursday checkpoints
- near-end (`days_remaining <= 1`)

Expected output:
- full unified digest (`Urgency`, `Main blocker`, `Quick win`, `Decision today`)
- near-end framing focuses on salvage/de-scope/carryover

---

## 6. API contracts

## 6.1 `POST /classify-comments`
### Purpose
Classify activity excerpts into delivery-relevant meaning labels.

### Request
```json
{
  "items": [
    {
      "task_id": "BILL-123",
      "at": "2026-04-08T11:10:00+07:00",
      "source": "jira_comment",
      "text": "Implementation is done. Waiting for review from Binh before handing to QA."
    }
  ]
}
```

### Response
```json
{
  "results": [
    {
      "task_id": "BILL-123",
      "at": "2026-04-08T11:10:00+07:00",
      "label": "review_pending",
      "confidence": 0.91,
      "reason": "The comment indicates implementation completed and the next dependency is reviewer action."
    }
  ]
}
```

## 6.2 `POST /judge-sprint`
### Purpose
Return dual-output judgment:
- `semantic_output` for gate/history
- `narrative_output` for delivery rendering

### Request shape
```json
{
  "run_context": {},
  "policy": {},
  "sprint_snapshot": {},
  "candidate_tasks": [],
  "top_clusters": [],
  "activity_excerpts": [],
  "prior_interventions": [],
  "historical_patterns": []
}
```

### Response shape
See `PROMPTS.md` for canonical schema (`semantic_output` + `narrative_output`).

---

## 7. Canonical issue model
Each detected issue must have a stable issue key.

### Issue key patterns
- `task:<task_id>:<risk_type>`
- `cluster:<cluster_type>:<subject_id>`
- `sprint:<sprint_id>:goal_risk`

### Issue states
- `detected`
- `monitoring`
- `nudged`
- `escalated`
- `resolved`
- `suppressed`
- `expired`

### State transition guidelines
- new abnormality → `detected`
- observed again without delivery → `monitoring`
- owner message sent → `nudged`
- lead/PM alert sent → `escalated`
- issue disappears / task moves / bottleneck clears → `resolved`
- duplicate within window → `suppressed`
- sprint ended and issue irrelevant → `expired`

---

## 8. Candidate selection design
This is required so prompt sizes stay bounded and judgment stays focused.

### Select task candidates by any of:
- top candidate score
- linked to sprint goal
- unresolved prior issue
- high blocked/review/stale age
- on dependency chain affecting multiple dependents
- moved little despite criticality

### Select clusters by any of:
- reviewer queue skew
- assignee overload skew
- epic with many unresolved tasks
- dependency chain with many blocked dependents
- QA queue abnormality

### Hard cap recommendation
- candidate tasks: 10–25
- clusters: 3–8
- activity excerpts: 20–50

---

## 9. Suppression and escalation policy

### Suppression windows
- unified digest: 24h default
- suppress until severity materially changes
- team digest: disabled in MVP

### Material change examples
- severity low → medium/high
- impacted tasks increase
- same issue persists closer to sprint end
- blocker changes from internal to delivery-critical
- previously recoverable now likely spillover

---

## 10. Message routing design

### Unified digest receives
- sprint health digest
- likely spillovers
- sprint goal risk
- scope cut / descoping suggestions
- endgame/carryover recommendations
- review bottleneck alerts
- dependency chain cluster alerts
- workload/reviewer imbalance
- unresolved blocker escalations

### Mention targets later
- only for confidence >= configured threshold
- no blame wording

---

## 11. Error handling

### Upstream fetch failures
- partial fetch from Jira/GitLab should mark run as `partial`
- if critical data missing, no outbound message; persist failed/partial run
- retry based on workflow type and node policy

### AI failures
- if `/judge-sprint` invalid JSON or schema mismatch: retry once or twice
- if still invalid: mark run failed, do not send message
- if `narrative_output` is missing but semantic output is valid: fallback to deterministic renderer

### Delivery failures
- Google Chat failure should write failed delivery log
- can retry once based on destination criticality

---

## 12. Security and secrets
- Jira tokens in n8n credentials/secrets store
- GitLab tokens in n8n credentials/secrets store
- AI service key in n8n secure credentials
- Google Chat webhook or bot credentials in secure storage
- database credentials not hardcoded in workflow JSON

---

## 13. Scaling notes
- keep AI service stateless if possible
- n8n workflows should be parameterized by team/board
- multiple teams can reuse same service with different config rows
- avoid large raw comment payloads; pre-select excerpts

---

## 14. Recommendation
This architecture is sufficient for MVP and intentionally leaves the workflow engine deterministic while letting AI do judgment-heavy work only.
