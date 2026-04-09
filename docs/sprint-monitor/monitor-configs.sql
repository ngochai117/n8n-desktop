-- Sprint Monitor AI - operational SQL for monitor_configs
-- Use this file for day-2 config operations after schema.sql has been applied.

-- 1. View current configs
select
  id,
  team_id,
  board_id,
  jira_base_url,
  jira_project_key,
  jira_jql,
  gitlab_base_url,
  gitlab_project_ids,
  gchat_unified_webhook,
  message_language,
  suppression_digest_hours,
  confidence_threshold_digest,
  timezone,
  enabled,
  updated_at
from monitor_configs
order by team_id, board_id;

-- 2. Insert one config row
-- Replace the placeholder values before running.
-- Shared Google Sheet members source is fixed in the workflow; no sheet config is needed here.
insert into monitor_configs (
  team_id,
  board_id,
  jira_base_url,
  jira_project_key,
  jira_jql,
  gitlab_base_url,
  gitlab_project_ids,
  gchat_unified_webhook,
  message_language,
  suppression_digest_hours,
  confidence_threshold_digest,
  timezone,
  enabled
) values (
  'tfbv',
  '1041',
  'https://atlassiansuite.mservice.com.vn:8443',
  'EXPENSE',
  null,
  'https://gitlab.mservice.com.vn',
  '["2419"]'::jsonb,
  'https://chat.googleapis.com/v1/spaces/XXX/messages?key=XXX&token=XXX',
  'vi',
  24,
  0.700,
  'Asia/Ho_Chi_Minh',
  true
);

-- 3. Update an existing config row
-- Match by team_id + board_id, which is unique in the schema.
-- Shared Google Sheet members source is fixed in the workflow; no sheet config is needed here.
update monitor_configs
set
  jira_base_url = 'https://your-real-domain.atlassian.net',
  jira_project_key = 'REALKEY',
  jira_jql = null,
  gitlab_base_url = 'https://gitlab.com',
  gitlab_project_ids = '["REAL_PROJECT_ID"]'::jsonb,
  gchat_unified_webhook = 'https://chat.googleapis.com/v1/spaces/REAL/messages?key=REAL&token=REAL',
  message_language = 'vi',
  suppression_digest_hours = 24,
  confidence_threshold_digest = 0.700,
  timezone = 'Asia/Ho_Chi_Minh',
  enabled = true,
  updated_at = now()
where team_id = 'momo-team'
  and board_id = '123';

-- 4. Upsert by unique key
-- Useful when you want one idempotent query for setup or environment refresh.
-- Shared Google Sheet members source is fixed in the workflow; no sheet config is needed here.
insert into monitor_configs (
  team_id,
  board_id,
  jira_base_url,
  jira_project_key,
  jira_jql,
  gitlab_base_url,
  gitlab_project_ids,
  gchat_unified_webhook,
  message_language,
  suppression_digest_hours,
  confidence_threshold_digest,
  timezone,
  enabled
) values (
  'tfbv',
  '1041',
  'https://atlassiansuite.mservice.com.vn:8443',
  'EXPENSE',
  null,
  'https://gitlab.mservice.com.vn',
  '["2419"]'::jsonb,
  'https://chat.googleapis.com/v1/spaces/XXX/messages?key=XXX&token=XXX',
  'vi',
  24,
  0.700,
  'Asia/Ho_Chi_Minh',
  true
)
on conflict (team_id, board_id) do update
set
  jira_base_url = excluded.jira_base_url,
  jira_project_key = excluded.jira_project_key,
  jira_jql = excluded.jira_jql,
  gitlab_base_url = excluded.gitlab_base_url,
  gitlab_project_ids = excluded.gitlab_project_ids,
  gchat_unified_webhook = excluded.gchat_unified_webhook,
  message_language = excluded.message_language,
  suppression_digest_hours = excluded.suppression_digest_hours,
  confidence_threshold_digest = excluded.confidence_threshold_digest,
  timezone = excluded.timezone,
  enabled = excluded.enabled,
  updated_at = now();

-- 5. Disable a config without deleting it
update monitor_configs
set
  enabled = false,
  updated_at = now()
where team_id = 'momo-team'
  and board_id = '123';
