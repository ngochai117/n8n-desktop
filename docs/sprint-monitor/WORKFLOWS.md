# n8n Workflow Spec — Sprint Monitor AI

## 1. Overview

Topology hien tai chi con 2 workflow:

1. `sprint-scheduler` (`Sprint Monitor Scheduler`)
2. `sprint-engine` (`Sprint Monitor Engine`)

`Sprint Monitor Scheduler` la entrypoint duy nhat cho schedule run.
Engine la noi chua toan bo logic fetch/normalize/AI/gate/delivery/persist.

---

## 2. Shared config

Nguon config: `monitor_configs` (PostgreSQL).

Fields dang dung:
- `team_id`
- `board_id`
- `jira_base_url`
- `jira_project_key`
- `jira_jql`
- `gitlab_base_url`
- `gitlab_project_ids[]`
- `gchat_unified_webhook`
- `timezone`
- `max_candidate_tasks`
- `max_clusters`
- `max_activity_excerpts`
- `message_language`
- `suppression_digest_hours`
- `confidence_threshold_digest`

Khong them field mode checkpoint vao DB trong ban nay.

---

## 3. Workflow A — `Sprint Monitor Scheduler`

### 3.1 Goal
- single cron entrypoint
- load configs
- call engine

### 3.2 Trigger
- `Schedule Trigger` (single cron)
- `Manual Trigger`

### 3.3 Steps
1. Build request (`workflowName`, `triggerSource`, seed `runType=scan`)
   - manual path ho tro `forceMode=auto|scan|review` cho debug
2. Load enabled `monitor_configs`
3. Call `Sprint Monitor Engine`
4. Build summary (`modeCounts`, success/noMessage stats)

---

## 4. Workflow B — `Sprint Monitor Engine`

### 4.1 Canonical flow
1. Normalize request + runtime config
2. Fetch active sprint
3. If no active sprint -> persist suppressed run -> return
4. Fetch sprint issues + GitLab signals
5. Normalize sprint context
6. AI classify comments
7. Compute deterministic signals
8. Load prior DB state (`openIssues`, `priorInterventions`, `historicalPatterns`, `recentRuns`)
9. Select mode (`scan`/`review`)
10. Build mode-aware judge packet + call AI judge
11. Apply deterministic DB gate
12. Render mode-aware delivery text
13. Send Google Chat (if any)
14. Persist runs/issues/interventions/deliveries
15. Return engine result

### 4.2 Mode selection (hardcoded)
- manual debug override:
  - neu `triggerSource=manual` va `forceMode in {scan,review}` thi dung mode do
  - `forceMode=auto` thi quay lai auto selector
- `review` when:
  - `days_remaining <= 1` (near-end)
  - or local weekday is Monday/Thursday (timezone from config)
- otherwise `scan`

### 4.3 Deterministic delivery gate
Per issue, compute:
- `newIssue`
- `severityIncrease`
- `materialChange`
- `newGoalBlocker`

Rules:
- `scan`: force `noMessage` unless at least one delta above survives DB suppression
- `review`: deliver only when actionable insight exists and survives DB suppression
- AI output cannot bypass these deterministic rules

### 4.4 Mode-aware rendering
- `scan`: compact 2-3 delta lines only, no full 4-block digest
- `review`: full unified digest (`Urgency`, `Main blocker`, `Quick win`, `Decision today`)
- `review` near-end: `Decision today` must be salvage/de-scope/carryover oriented

Mention behavior giu nguyen:
- body dung bold `@handle`
- mention IDs append o footer tail

### 4.5 Persistence
- `runs.run_type` luu mode duoc chon (`scan`/`review`)
- `retro_notes` chi tao khi `review` + near-end

---

## 5. Error handling

- Jira/GitLab fetch loi: mark partial/failed theo muc do
- Judge output invalid: fail run, khong delivery
- Drafter fail: fallback render deterministic
- Google Chat fail: persist failed delivery rows

---

## 6. Handoff note

Khi handoff implementation, dung cung bo:
- `SPEC.md`
- `ARCHITECTURE.md`
- `PROMPTS.md`
- `FLOW.md`
- `schema.sql`
