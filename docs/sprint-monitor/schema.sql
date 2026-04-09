-- Sprint Monitor AI - PostgreSQL schema
-- MVP schema for n8n + AI judgment service + Google Chat delivery

create extension if not exists pgcrypto;

create table if not exists monitor_configs (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  board_id text not null,
  jira_base_url text not null,
  jira_project_key text,
  jira_jql text,
  gitlab_base_url text not null,
  gitlab_project_ids jsonb not null default '[]'::jsonb,
  gchat_unified_webhook text not null,
  message_language text not null default 'en',
  timezone text not null default 'Asia/Ho_Chi_Minh',
  max_candidate_tasks integer not null default 20,
  max_clusters integer not null default 5,
  max_activity_excerpts integer not null default 30,
  suppression_digest_hours integer not null default 24,
  confidence_threshold_digest numeric(4,3) not null default 0.700,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_monitor_configs_team_board
  on monitor_configs(team_id, board_id);

create table if not exists sprint_snapshots (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  board_id text not null,
  sprint_id text not null,
  sprint_name text not null,
  sprint_goal text,
  start_at timestamptz,
  end_at timestamptz,
  timezone text,
  committed_points numeric(10,2),
  added_scope_points numeric(10,2),
  completed_points numeric(10,2),
  remaining_points numeric(10,2),
  snapshot_at timestamptz not null default now(),
  raw_json jsonb not null default '{}'::jsonb
);

create index if not exists idx_sprint_snapshots_team_sprint
  on sprint_snapshots(team_id, sprint_id, snapshot_at desc);

create table if not exists task_snapshots (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  sprint_id text not null,
  task_id text not null,
  task_key text not null,
  title text not null,
  task_type text,
  priority text,
  assignee_id text,
  assignee_name text,
  reviewer_ids jsonb not null default '[]'::jsonb,
  status text,
  status_category text,
  story_points numeric(10,2),
  created_at_source timestamptz,
  updated_at_source timestamptz,
  done_at_source timestamptz,
  epic_id text,
  labels jsonb not null default '[]'::jsonb,
  dependencies jsonb not null default '[]'::jsonb,
  dependents jsonb not null default '[]'::jsonb,
  blocked_by jsonb not null default '[]'::jsonb,
  due_at timestamptz,
  snapshot_at timestamptz not null default now(),
  raw_json jsonb not null default '{}'::jsonb
);

create index if not exists idx_task_snapshots_sprint_task
  on task_snapshots(sprint_id, task_id, snapshot_at desc);

create index if not exists idx_task_snapshots_team_sprint
  on task_snapshots(team_id, sprint_id, snapshot_at desc);

create table if not exists activity_excerpts (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  sprint_id text,
  task_id text not null,
  event_at timestamptz not null,
  event_type text not null,
  actor text,
  source text not null,
  text text,
  classifier_label text,
  classifier_confidence numeric(4,3),
  classifier_reason text,
  ingested_at timestamptz not null default now(),
  raw_json jsonb not null default '{}'::jsonb
);

create index if not exists idx_activity_excerpts_task_event
  on activity_excerpts(task_id, event_at desc);

create table if not exists signal_snapshots (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  sprint_id text not null,
  task_id text,
  signal_scope text not null check (signal_scope in ('sprint','task','cluster')),
  signal_type text,
  candidate_score numeric(6,3),
  phase text,
  signal_json jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now()
);

create index if not exists idx_signal_snapshots_scope
  on signal_snapshots(team_id, sprint_id, signal_scope, computed_at desc);

create table if not exists runs (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  board_id text not null,
  sprint_id text,
  workflow_name text not null,
  run_type text not null check (run_type in ('light_scan','deep_analysis','endgame')),
  status text not null check (status in ('running','success','partial','failed','suppressed')),
  no_message boolean not null default false,
  partial_data boolean not null default false,
  issue_count_detected integer not null default 0,
  issue_count_delivered integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  summary_json jsonb not null default '{}'::jsonb,
  error_json jsonb not null default '{}'::jsonb
);

create index if not exists idx_runs_team_started
  on runs(team_id, started_at desc);

create index if not exists idx_runs_sprint_type
  on runs(sprint_id, run_type, started_at desc);

create table if not exists issues (
  id uuid primary key default gen_random_uuid(),
  issue_key text not null,
  team_id text not null,
  sprint_id text,
  entity_type text not null check (entity_type in ('task','cluster','sprint')),
  entity_id text not null,
  risk_type text not null,
  severity text not null check (severity in ('low','medium','high')),
  state text not null check (state in ('detected','monitoring','nudged','escalated','resolved','suppressed','expired')),
  confidence numeric(4,3) not null,
  decision_owner_type text check (decision_owner_type in ('pm','lead','assignee','reviewer','team','none')),
  execution_owner_type text check (execution_owner_type in ('pm','lead','assignee','reviewer','team','none')),
  recommended_action text,
  why_now text,
  evidence jsonb not null default '[]'::jsonb,
  first_detected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_alerted_at timestamptz,
  resolved_at timestamptz,
  source_run_id uuid references runs(id) on delete set null,
  metadata_json jsonb not null default '{}'::jsonb
);

create unique index if not exists ux_issues_issue_key
  on issues(issue_key);

create index if not exists idx_issues_team_sprint_state
  on issues(team_id, sprint_id, state, severity);

create index if not exists idx_issues_last_alerted
  on issues(last_alerted_at desc);

create table if not exists interventions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references runs(id) on delete set null,
  issue_key text not null,
  delivery_channel text not null check (delivery_channel in ('google_chat_unified','team_digest')),
  destination text not null,
  action_type text not null,
  message_text text not null,
  delivered_at timestamptz,
  delivery_status text not null check (delivery_status in ('pending','sent','failed','suppressed')),
  outcome_status text not null default 'unknown' check (outcome_status in ('unknown','acted','ignored','resolved','superseded')),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_interventions_issue_key
  on interventions(issue_key, created_at desc);

create index if not exists idx_interventions_run_id
  on interventions(run_id);

create table if not exists message_deliveries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references runs(id) on delete set null,
  intervention_id uuid references interventions(id) on delete set null,
  message_type text not null check (message_type in ('unified_digest_card','unified_digest_text','team_digest')),
  destination text not null,
  payload_json jsonb not null default '{}'::jsonb,
  response_code integer,
  response_body text,
  status text not null check (status in ('sent','failed','suppressed')),
  sent_at timestamptz not null default now()
);

create index if not exists idx_message_deliveries_run
  on message_deliveries(run_id, sent_at desc);

create table if not exists historical_patterns (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  pattern_type text not null,
  subject_id text,
  strength numeric(4,3) not null,
  evidence text,
  metadata_json jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now()
);

create index if not exists idx_historical_patterns_team
  on historical_patterns(team_id, pattern_type, generated_at desc);

create table if not exists retro_notes (
  id uuid primary key default gen_random_uuid(),
  team_id text not null,
  sprint_id text not null,
  note_type text not null,
  severity text,
  content text not null,
  source_issue_key text,
  source_run_id uuid references runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_retro_notes_sprint
  on retro_notes(team_id, sprint_id, created_at desc);

-- helpful view for unresolved issues
create or replace view v_open_issues as
select
  issue_key,
  team_id,
  sprint_id,
  entity_type,
  entity_id,
  risk_type,
  severity,
  state,
  confidence,
  decision_owner_type,
  execution_owner_type,
  recommended_action,
  why_now,
  first_detected_at,
  last_seen_at,
  last_alerted_at
from issues
where state in ('detected','monitoring','nudged','escalated','suppressed');
