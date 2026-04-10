# Sprint Monitor Flow

## Nhin nhanh

Sprint Monitor hien tai co 2 workflow:

- `Sprint Monitor Scheduler` (top-level, 1 cron + manual)
- `Sprint Monitor Engine` (logic chinh)

`Sprint Monitor Scheduler` chi lam 4 viec:

1. trigger manual hoac cron
2. load `monitor_configs`
3. goi `Sprint Monitor Engine`
4. gom summary output

## Runtime mode model

Engine chi dung 2 runType hien tai (`scan`, `review`) de dieu phoi.

Moi run se tu chon `selectedMode`:

- `review` neu near-end (`days_remaining <= 1`) hoac dung checkpoint review (Monday/Thursday theo `monitorConfig.timezone`)
- `scan` cho cac run con lai

## Debug override (manual)

Khi test/debug, co the ep mode bang input `forceMode`:

- `scan` hoac `review`: override mode selector (chi khi `triggerSource=manual`)
- `auto` (mac dinh): dung auto selector nhu production

Cron/schedule run luon di theo auto selector, khong dung manual override.

## Engine pipeline

`Trigger -> Load config -> Jira/GitLab fetch -> Normalize -> AI classify -> Compute signals -> Load DB state -> Select mode -> Build judge packet (mode-aware + language config) -> AI judge (semantic_output + narrative_output) -> Deterministic DB gate (semantic-only) -> Render localized text/card -> Deliver -> Persist`

## Option 3 split (semantic vs narrative)

- `semantic_output`: canonical enums/codes cho gate, suppression, issue identity, material-change
- `narrative_output`: wording localized theo `message_language` cho text/card
- thay doi wording/ngon ngu khong duoc tao `materialChange` neu semantic khong doi

## Deterministic gate bat buoc

Truoc khi gui message, engine ap gate deterministic (khong de AI bypass):

- tinh co `newIssue`, `severityIncrease`, `materialChange`, `newGoalBlocker`
- `scan`: neu khong co delta hop le => force `noMessage`
- `review`: chi gui khi co actionable insight va khong bi suppression DB

## Delivery behavior theo mode

- `scan`: compact 2-3 dong delta, uu tien silence, khong dung full 4-block digest
- `review`: full unified digest (`Urgency / Main blocker / Quick win / Decision today`)
- `review` near-end: `Decision today` phai theo framing `salvage / de-scope / carryover`

## Persist behavior

- `runs.run_type` luu mode da chon (`scan` hoac `review`)
- `issues.metadata_json` luu `semantic_signature`, `semantic_json`, `narrative_json`, `message_language`
- near-end `review` moi tao `retro_notes`
