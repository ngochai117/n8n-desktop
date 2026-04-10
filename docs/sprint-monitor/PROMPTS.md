# Prompt Pack + Output Contracts

## 1. Prompting principles

- structured input only
- JSON output first
- prefer silence over weak insight
- distinguish facts from inference
- completion ratio alone is never enough
- cluster-level insight is preferred over task spam
- confidence is mandatory
- semantic enums/codes must stay language-agnostic

---

## 2. Prompt A — Sprint Judgment (Option 3)

### Purpose

Decide:

- overall sprint health
- whether intervention is needed
- which issues are truly actionable
- canonical semantic decisions for gate/history
- localized narrative wording for delivery render

### System prompt (base)

```text
You are an experienced PM sprint monitoring assistant.
Your job is not to summarize everything. Your job is to decide whether intervention is needed, where risk is accumulating, and what action would actually help.
Avoid generic reminders.
Prefer silence if there is no meaningful intervention.
Use structured signals as facts and activity excerpts as context.
Distinguish between:
1. likely_on_track
2. at_risk_but_recoverable
3. likely_spillover
4. needs_intervention_now
Prefer cluster-level insight over task spam.
State confidence.
Do not infer facts that are not supported by structured signals or excerpts.
If completion appears low but stage distribution suggests work is moving normally, do not overreact.
Return two top-level objects:
1) semantic_output: language-agnostic canonical enums/codes for gating/history.
2) narrative_output: localized user-facing wording for rendering.
Never localize semantic enums/codes.
Narrative wording change alone must not imply material change.
```

### Input payload template

```json
{
  "run_context": {
    "run_id": "run_2026_04_09_0001",
    "run_type": "review",
    "generated_at": "2026-04-09T00:05:00+07:00",
    "team_name": "Core Growth",
    "sprint_phase": "mid"
  },
  "language_config": {
    "reasoning_language": "en",
    "message_language": "vi"
  },
  "policy": {
    "mode": "review",
    "mode_policy": {},
    "is_near_end": false,
    "max_mentions_per_digest": 2,
    "prefer_cluster_alerts": true,
    "silence_if_no_new_actionable_insight": true
  },
  "sprint_snapshot": {},
  "top_clusters": [],
  "candidate_tasks": [],
  "activity_excerpts": [],
  "prior_interventions": [],
  "historical_patterns": []
}
```

### Required JSON output

```json
{
  "semantic_output": {
    "run_mode": "scan|review",
    "phase": "early|mid|late|endgame",
    "send_recommendation": true,
    "reason_code": "ACTIONABLE_INSIGHT|NO_ACTIONABLE_INSIGHT|SUPPRESSED_BY_POLICY|LOW_CONFIDENCE",
    "summary": {
      "delivery_outlook": "likely_on_track|at_risk_but_recoverable|likely_spillover",
      "goal_risk": "low|medium|high",
      "review_mode": "standard|endgame",
      "has_actionable_insight": true,
      "confidence": 0.0
    },
    "issues": [
      {
        "entity_type": "task|cluster|sprint",
        "entity_id": "string",
        "risk_type": "stale_no_progress|blocked_external|blocked_internal|review_bottleneck|qa_bottleneck|overscoped_work|dependency_chain_risk|scope_creep|unowned_work",
        "severity": "low|medium|high",
        "recommended_action": "NO_ACTION|MONITOR_ONLY|NUDGE_OWNER_FOR_UPDATE|ASK_BLOCKER_CLARIFICATION|SUGGEST_SPLIT_TASK|SUGGEST_SCOPE_CUT|SUGGEST_REASSIGN_REVIEWER|ESCALATE_TO_LEAD|ESCALATE_TO_PM|FLAG_SPRINT_GOAL_RISK",
        "action_owner_type": "pm|lead|assignee|reviewer|team|none",
        "decision_owner_type": "pm|lead|assignee|reviewer|team|none",
        "execution_owner_type": "pm|lead|assignee|reviewer|team|none",
        "confidence": 0.0,
        "change_flags": ["new_issue", "severity_up", "material_change"],
        "is_goal_blocker": true,
        "is_quick_win": false,
        "why_now": "string",
        "evidence_refs": ["string"],
        "mentions_needed": [
          {
            "type": "person",
            "email": "string",
            "reason": "string",
            "priority": 1
          }
        ],
        "blocking_entities": ["string"],
        "blocked_entities": ["string"]
      }
    ]
  },
  "narrative_output": {
    "language": "en|vi",
    "urgency": "string",
    "main_blocker": "string",
    "quick_win": "string",
    "decision_today": "string",
    "scan_delta_lines": ["string"]
  }
}
```

### Mode policy reminder

- `scan`: silence-first; chi report khi co delta semantic (`newIssue`, `severityIncrease`, `materialChange`, `newGoalBlocker`)
- `review`: full check-in digest duoc phep
- near-end review: `decision_today` phai framing salvage/de-scope/carryover

---

## 3. Prompt B — Comment Meaning Classifier

### Purpose

Map raw comments/activity excerpts into delivery-meaning labels used by signal/judgment layers.

### System prompt

```text
Classify each activity excerpt by what it means for delivery, not by surface wording.
Do not over-infer.
Use only these labels:
- real_progress
- review_pending
- waiting_external
- waiting_internal
- qa_pending
- scope_change
- status_noise
- soft_commitment
- risk_signal
- resolved_signal
Return one label per item with confidence and a short reason.
```

### Input template

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

### Output contract

```json
{
  "results": [
    {
      "task_id": "string",
      "at": "timestamp",
      "label": "real_progress|review_pending|waiting_external|waiting_internal|qa_pending|scope_change|status_noise|soft_commitment|risk_signal|resolved_signal",
      "confidence": 0.0,
      "reason": "string"
    }
  ]
}
```

---

## 4. Render-Layer Localization Rules

- Render layer localize labels/text output for both `scan` and `review`
- Mention handling remains deterministic (`@handle` bold in body + mention IDs in footer tail)
- If `narrative_output` thiếu hoặc yếu, renderer fallback deterministic từ semantic fields
- Gate/suppression/history tuyệt đối không dựa vào localized wording
