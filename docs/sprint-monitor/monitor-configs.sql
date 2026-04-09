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
  timezone,
  enabled,
  updated_at
from monitor_configs
order by team_id, board_id;

-- 2. Insert one config row
-- Replace the placeholder values before running.
insert into monitor_configs (
  team_id,
  board_id,
  jira_base_url,
  jira_project_key,
  jira_jql,
  gitlab_base_url,
  gitlab_project_ids,
  gchat_pm_webhook,
  gchat_lead_webhook,
  timezone,
  enabled
) values (
  'momo-team',
  '123',
  'https://your-company.atlassian.net',
  'MOMO',
  null,
  'https://gitlab.com',
  '["12345678"]'::jsonb,
  'https://chat.googleapis.com/v1/spaces/XXX/messages?key=XXX&token=XXX',
  'https://chat.googleapis.com/v1/spaces/YYY/messages?key=YYY&token=YYY',
  'Asia/Ho_Chi_Minh',
  true
);

-- 3. Update an existing config row
-- Match by team_id + board_id, which is unique in the schema.
update monitor_configs
set
  jira_base_url = 'https://your-real-domain.atlassian.net',
  jira_project_key = 'REALKEY',
  jira_jql = null,
  gitlab_base_url = 'https://gitlab.com',
  gitlab_project_ids = '["REAL_PROJECT_ID"]'::jsonb,
  gchat_pm_webhook = 'https://chat.googleapis.com/v1/spaces/REAL_PM/messages?key=REAL&token=REAL',
  gchat_lead_webhook = 'https://chat.googleapis.com/v1/spaces/REAL_LEAD/messages?key=REAL&token=REAL',
  timezone = 'Asia/Ho_Chi_Minh',
  enabled = true,
  updated_at = now()
where team_id = 'momo-team'
  and board_id = '123';

-- 4. Upsert by unique key
-- Useful when you want one idempotent query for setup or environment refresh.
insert into monitor_configs (
  team_id,
  board_id,
  jira_base_url,
  jira_project_key,
  jira_jql,
  gitlab_base_url,
  gitlab_project_ids,
  gchat_pm_webhook,
  gchat_lead_webhook,
  timezone,
  enabled
) values (
  'momo-team',
  '123',
  'https://your-company.atlassian.net',
  'MOMO',
  null,
  'https://gitlab.com',
  '["12345678"]'::jsonb,
  'https://chat.googleapis.com/v1/spaces/XXX/messages?key=XXX&token=XXX',
  'https://chat.googleapis.com/v1/spaces/YYY/messages?key=YYY&token=YYY',
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
  gchat_pm_webhook = excluded.gchat_pm_webhook,
  gchat_lead_webhook = excluded.gchat_lead_webhook,
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
