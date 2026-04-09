#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../..',
);
const workflowsDir = path.join(rootDir, 'workflows/sprint-monitor');

const SETTINGS = {
  callerPolicy: 'workflowsFromSameOwner',
  availableInMCP: false,
};

const SHARED_MEMBER_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1uLVZ2b6Ra-r2KCbLHcOL68V6smtxymfTCNNQnWPG8mI';
const SHARED_MEMBER_SHEET_NAME = 'MoMoer';
const GOOGLE_CHAT_REPLY_OPTION = 'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD';

const STRUCTURED_COMMENT_RESULTS_SCHEMA = `{
  "results": [
    {
      "task_id": "string",
      "at": "timestamp",
      "label": "real_progress|review_pending|waiting_external|waiting_internal|qa_pending|scope_change|status_noise|soft_commitment|risk_signal|resolved_signal",
      "confidence": 0.0,
      "reason": "string"
    }
  ]
}`;

const SPRINT_JUDGMENT_SCHEMA = `{
  "sprint_assessment": {
    "health": "green|amber|red",
    "goal_risk": "low|medium|high",
    "delivery_outlook": "likely_on_track|at_risk_but_recoverable|likely_spillover",
    "confidence": 0.0,
    "summary": "string"
  },
  "clusters": [
    {
      "cluster_id": "string",
      "cluster_type": "review_bottleneck|dependency_chain_risk|qa_bottleneck|scope_creep|unowned_work",
      "severity": "low|medium|high",
      "affected_count": 0,
      "why_now": "string",
      "evidence": ["string"],
      "recommended_action": "NO_ACTION|MONITOR_ONLY|SUGGEST_REASSIGN_REVIEWER|ESCALATE_TO_LEAD|ESCALATE_TO_PM|FLAG_SPRINT_GOAL_RISK|SUGGEST_SCOPE_CUT",
      "action_owner_type": "pm|lead|assignee|reviewer|team|none",
      "decision_owner_type": "pm|lead|assignee|reviewer|team|none",
      "execution_owner_type": "pm|lead|assignee|reviewer|team|none",
      "mentions_needed": [
        {
          "type": "person",
          "email": "string",
          "reason": "string",
          "priority": 1
        }
      ],
      "confidence": 0.0
    }
  ],
  "tasks": [
    {
      "task_id": "string",
      "classification": "likely_on_track|at_risk_but_recoverable|likely_spillover|needs_intervention_now|noise_do_not_alert",
      "risk_type": "stale_no_progress|blocked_external|blocked_internal|review_bottleneck|qa_bottleneck|overscoped_work|dependency_chain_risk|scope_creep|silent_but_probably_ok",
      "severity": "low|medium|high",
      "why_now": "string",
      "evidence": ["string"],
      "recommended_action": "NO_ACTION|MONITOR_ONLY|NUDGE_OWNER_FOR_UPDATE|ASK_BLOCKER_CLARIFICATION|SUGGEST_SPLIT_TASK|SUGGEST_SCOPE_CUT|SUGGEST_REASSIGN_REVIEWER|ESCALATE_TO_LEAD|ESCALATE_TO_PM",
      "action_owner_type": "pm|lead|assignee|reviewer|team|none",
      "decision_owner_type": "pm|lead|assignee|reviewer|team|none",
      "execution_owner_type": "pm|lead|assignee|reviewer|team|none",
      "mentions_needed": [
        {
          "type": "person",
          "email": "string",
          "reason": "string",
          "priority": 1
        }
      ],
      "confidence": 0.0
    }
  ],
  "silence_decision": {
    "no_message_needed": true,
    "reason": "string"
  },
  "delivery_plan": {
    "send_unified_digest": true,
    "send_team_digest": false
  }
}`;

const MESSAGE_DRAFTER_SCHEMA = `{
  "unified_digest_text": "string"
}`;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(relativePath, data) {
  const filePath = path.join(rootDir, relativePath);
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function node({
  id,
  name,
  type,
  typeVersion,
  position,
  parameters = {},
  ...extra
}) {
  return {
    parameters,
    id,
    name,
    type,
    typeVersion,
    position,
    ...extra,
  };
}

function mainConnection(from, to, outputIndex = 0, index = 0) {
  return { from, to, outputIndex, index };
}

function aiConnection(from, to, type, index = 0) {
  return { from, to, type, index };
}

function buildConnections(connections) {
  const result = {};

  for (const connection of connections) {
    const fromName = connection.from;
    if (!result[fromName]) {
      result[fromName] = {};
    }

    const key = connection.type || 'main';
    if (!result[fromName][key]) {
      result[fromName][key] = [];
    }

    const outputIndex = connection.outputIndex ?? 0;
    while (result[fromName][key].length <= outputIndex) {
      result[fromName][key].push([]);
    }

    result[fromName][key][outputIndex].push({
      node: connection.to,
      type: key,
      index: connection.index ?? 0,
    });
  }

  return result;
}

function topLevelRequestCode({ workflowName, runType, triggerSource }) {
  return String.raw`const monitorConfigId = String($json.monitorConfigId || '').trim();

function sqlEscape(value) {
  return String(value ?? '').replace(/'/g, "''");
}

const filterClause = monitorConfigId
  ? " AND id = '" + sqlEscape(monitorConfigId) + "'::uuid"
  : '';

return {
  triggerSource: '${triggerSource}',
  workflowName: '${workflowName}',
  runType: '${runType}',
  monitorConfigId,
  configQuery: "SELECT * FROM monitor_configs WHERE enabled = true" + filterClause + " ORDER BY team_id, board_id",
};`;
}

function buildTopLevelWorkflow({ name, runType, cronExpression }) {
  const nodes = [
    node({
      id: '1',
      name: 'Manual Trigger',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [-960, 96],
      parameters: {},
    }),
    node({
      id: '2',
      name: 'Build Manual Request',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [-736, 96],
      parameters: {
        mode: 'runOnceForEachItem',
        jsCode: topLevelRequestCode({
          workflowName: name,
          runType,
          triggerSource: 'manual',
        }),
      },
    }),
    node({
      id: '3',
      name: 'Schedule Trigger',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: [-960, 272],
      parameters: {
        rule: {
          interval: [
            {
              field: 'cronExpression',
              expression: cronExpression,
            },
          ],
        },
      },
    }),
    node({
      id: '4',
      name: 'Build Scheduled Request',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [-736, 272],
      parameters: {
        mode: 'runOnceForEachItem',
        jsCode: topLevelRequestCode({
          workflowName: name,
          runType,
          triggerSource: 'schedule',
        }),
      },
    }),
    node({
      id: '5',
      name: 'Load Monitor Configs (Manual)',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.6,
      position: [-480, 96],
      parameters: {
        resource: 'database',
        operation: 'executeQuery',
        query: '={{ $json.configQuery }}',
        options: {
          queryBatching: 'single',
        },
      },
    }),
    node({
      id: '6',
      name: 'Load Monitor Configs (Scheduled)',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.6,
      position: [-480, 272],
      parameters: {
        resource: 'database',
        operation: 'executeQuery',
        query: '={{ $json.configQuery }}',
        options: {
          queryBatching: 'single',
        },
      },
    }),
    node({
      id: '7',
      name: 'Run Sprint Monitor Engine (Manual)',
      type: 'n8n-nodes-base.executeWorkflow',
      typeVersion: 1.3,
      position: [-208, 96],
      parameters: {
        workflowId: {
          __rl: true,
          value: '__REGISTRY__:Sprint Monitor Engine',
          mode: 'list',
          cachedResultName: 'Sprint Monitor Engine',
        },
        workflowInputs: {
          mappingMode: 'defineBelow',
          value: {
            runType: `={{ '${runType}' }}`,
            workflowName: `={{ '${name}' }}`,
            triggerSource: '={{ "manual" }}',
            monitorConfig: '={{ $json }}',
          },
          matchingColumns: [],
          schema: [
            { id: 'runType', displayName: 'runType', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string', removed: false },
            { id: 'workflowName', displayName: 'workflowName', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string', removed: false },
            { id: 'triggerSource', displayName: 'triggerSource', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string', removed: false },
            { id: 'monitorConfig', displayName: 'monitorConfig', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'object', removed: false },
          ],
          attemptToConvertTypes: false,
          convertFieldsToString: false,
        },
        options: {
          waitForSubWorkflow: true,
        },
      },
    }),
    node({
      id: '8',
      name: 'Run Sprint Monitor Engine (Scheduled)',
      type: 'n8n-nodes-base.executeWorkflow',
      typeVersion: 1.3,
      position: [-208, 272],
      parameters: {
        workflowId: {
          __rl: true,
          value: '__REGISTRY__:Sprint Monitor Engine',
          mode: 'list',
          cachedResultName: 'Sprint Monitor Engine',
        },
        workflowInputs: {
          mappingMode: 'defineBelow',
          value: {
            runType: `={{ '${runType}' }}`,
            workflowName: `={{ '${name}' }}`,
            triggerSource: '={{ "schedule" }}',
            monitorConfig: '={{ $json }}',
          },
          matchingColumns: [],
          schema: [
            { id: 'runType', displayName: 'runType', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string', removed: false },
            { id: 'workflowName', displayName: 'workflowName', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string', removed: false },
            { id: 'triggerSource', displayName: 'triggerSource', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'string', removed: false },
            { id: 'monitorConfig', displayName: 'monitorConfig', required: false, defaultMatch: false, display: true, canBeUsedToMatch: true, type: 'object', removed: false },
          ],
          attemptToConvertTypes: false,
          convertFieldsToString: false,
        },
        options: {
          waitForSubWorkflow: true,
        },
      },
    }),
    node({
      id: '9',
      name: 'Build Workflow Summary',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [80, 184],
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: String.raw`const items = $input.all().map((item) => item?.json || {});
const summary = {
  workflowName: '${name}',
  runType: '${runType}',
  totalConfigs: items.length,
  successCount: items.filter((item) => String(item.status || '') === 'success').length,
  partialCount: items.filter((item) => String(item.status || '') === 'partial').length,
  failedCount: items.filter((item) => String(item.status || '') === 'failed').length,
  skippedCount: items.filter((item) => String(item.status || '') === 'skipped').length,
  noMessageCount: items.filter((item) => Boolean(item.noMessage)).length,
  results: items,
};

return [{ json: summary }];`,
      },
    }),
  ];

  const connections = buildConnections([
    mainConnection('Manual Trigger', 'Build Manual Request'),
    mainConnection('Build Manual Request', 'Load Monitor Configs (Manual)'),
    mainConnection('Load Monitor Configs (Manual)', 'Run Sprint Monitor Engine (Manual)'),
    mainConnection('Run Sprint Monitor Engine (Manual)', 'Build Workflow Summary'),
    mainConnection('Schedule Trigger', 'Build Scheduled Request'),
    mainConnection('Build Scheduled Request', 'Load Monitor Configs (Scheduled)'),
    mainConnection('Load Monitor Configs (Scheduled)', 'Run Sprint Monitor Engine (Scheduled)'),
    mainConnection('Run Sprint Monitor Engine (Scheduled)', 'Build Workflow Summary'),
  ]);

  return {
    name,
    nodes,
    connections,
    settings: SETTINGS,
  };
}

const normalizeRequestCode = String.raw`const input = $json || {};

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return fallback;
}

function asMessageLanguage(value) {
  const normalized = asText(value, 'en').toLowerCase();
  return normalized === 'vi' ? 'vi' : 'en';
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

const rawConfig = asObject(input.monitorConfig);
const runType = asText(input.runType, 'light_scan');
const workflowName = asText(input.workflowName, 'Sprint Monitor Engine');
const triggerSource = asText(input.triggerSource, 'manual');
const timezone = asText(rawConfig.timezone, 'Asia/Ho_Chi_Minh');
const messageLanguage = asMessageLanguage(rawConfig.message_language);
const generatedAt = $now.setZone(timezone).toISO();
const runId = 'run_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);

const monitorConfig = {
  id: asText(rawConfig.id),
  teamId: asText(rawConfig.team_id),
  boardId: asText(rawConfig.board_id),
  jiraBaseUrl: asText(rawConfig.jira_base_url).replace(/\/+$/, ''),
  jiraProjectKey: asText(rawConfig.jira_project_key),
  jiraJql: asText(rawConfig.jira_jql),
  gitlabBaseUrl: asText(rawConfig.gitlab_base_url).replace(/\/+$/, ''),
  gitlabProjectIds: asArray(rawConfig.gitlab_project_ids).map((item) => asText(item)).filter(Boolean),
  gchatUnifiedWebhook: asText(rawConfig.gchat_unified_webhook),
  messageLanguage,
  timezone,
  maxCandidateTasks: Math.max(5, asNumber(rawConfig.max_candidate_tasks, 20)),
  maxClusters: Math.max(1, asNumber(rawConfig.max_clusters, 5)),
  maxActivityExcerpts: Math.max(5, asNumber(rawConfig.max_activity_excerpts, 30)),
  suppressionDigestHours: Math.max(1, asNumber(rawConfig.suppression_digest_hours, 24)),
  confidenceThresholdDigest: asNumber(rawConfig.confidence_threshold_digest, 0.7),
};

if (!Object.keys(rawConfig).length) {
  throw new Error('monitorConfig object is required');
}
if (!monitorConfig.teamId) {
  throw new Error('monitorConfig.teamId is required');
}
if (!monitorConfig.boardId) {
  throw new Error('monitorConfig.boardId is required');
}
if (!monitorConfig.jiraBaseUrl) {
  throw new Error('monitorConfig.jiraBaseUrl is required');
}

const classifierSystemPrompt = [
  'Classify each activity excerpt by what it means for delivery, not by surface wording.',
  'Do not over-infer.',
  'Use only these labels:',
  '- real_progress',
  '- review_pending',
  '- waiting_external',
  '- waiting_internal',
  '- qa_pending',
  '- scope_change',
  '- status_noise',
  '- soft_commitment',
  '- risk_signal',
  '- resolved_signal',
  'Return one label per item with confidence and a short reason.',
].join('\n');

const judgeSystemPrompt = [
  'You are an experienced PM sprint monitoring assistant.',
  'Your job is not to summarize everything. Your job is to decide whether intervention is needed, where risk is accumulating, and what action would actually help.',
  'Avoid generic reminders.',
  'Prefer silence if there is no meaningful intervention.',
  'Use structured signals as facts and activity excerpts as context.',
  'Distinguish between:',
  '1. likely_on_track',
  '2. at_risk_but_recoverable',
  '3. likely_spillover',
  '4. needs_intervention_now',
  'Prefer cluster-level insight over task spam.',
  'State confidence.',
  'Do not infer facts that are not supported by structured signals or excerpts.',
  'If completion appears low but stage distribution suggests work is moving normally, do not overreact.',
].join('\n');

const draftSystemPrompt = messageLanguage === 'vi'
  ? [
      'Viet nhu mot PM partner sac sao va thuc dung.',
      'Hay viet bang tieng Viet tu nhien.',
      'Khong viet kieu dich may.',
      'Chi viet phan text cho unified digest.',
      'Uu tien toi da 4 dong theo thu tu co dinh:',
      '- Urgency: ...',
      '- Main blocker: ...',
      '- Quick win: ...',
      '- Decision today: ...',
      'Urgency phai la dong rieng neu neu thoi gian/throughput dang tao ap luc scope.',
      'Khong tron cau urgency vao Main blocker.',
      'Main blocker/Quick win/Decision today co the bo dong neu du lieu yeu hoac khong ro.',
      'Neu resolve duoc owner, uu tien mention ngan gon (vd @PIC, @Reviewer, @PM).',
      'Moi dong toi da 1-2 cau ngan.',
      'Giu cau ngan, scan nhanh, de hanh dong.',
      'Khong duoc bo sung su that ngoai input cau truc.',
      'Tranh van phong do loi hoac quy ket ca nhan.',
    ].join('\n')
  : [
      'Write like a sharp PM partner.',
      'Write only the text portion of the unified digest.',
      'Prefer up to 4 short lines in this fixed order:',
      '- Urgency: ...',
      '- Main blocker: ...',
      '- Quick win: ...',
      '- Decision today: ...',
      'Urgency must be a separate line when time/throughput pressure exists.',
      'Do not blend urgency into Main blocker.',
      'Main blocker/Quick win/Decision today may be omitted when evidence is weak.',
      'Use action-owner mention placeholders when resolvable (for example @PIC, @Reviewer, @PM).',
      'Keep each line within 1-2 short sentences.',
      'Keep it concise and highly scannable.',
      'Do not invent facts beyond the structured input.',
      'Avoid blameful language.',
    ].join('\n');

return {
  runId,
  runType,
  workflowName,
  triggerSource,
  generatedAt,
  monitorConfig,
  classifierSystemPrompt,
  judgeSystemPrompt,
  draftSystemPrompt,
  aiModels: {
    classifier: 'cx/gpt-5.4',
    judge: 'cx/gpt-5.4',
    drafter: 'cx/gpt-5.4',
  },
  issueKeyPatterns: {
    task: 'task:<task_id>:<risk_type>',
    cluster: 'cluster:<cluster_type>:<subject_id>',
    sprint: 'sprint:<sprint_id>:goal_risk',
  },
  runSummarySeed: {
    workflowName,
    runType,
    triggerSource,
    generatedAt,
    teamId: monitorConfig.teamId,
    boardId: monitorConfig.boardId,
  },
};`;

const pickActiveSprintCode = String.raw`const input = $json || {};
const request = $('Normalize Request').first().json || {};
const monitorConfig = request.monitorConfig || {};
const statusCode = Number(input.statusCode || 200);

function asText(value) {
  return String(value ?? '').trim();
}

const transportError = asText(input.error?.message || input.error?.description || input.message);
if (transportError && !input.body) {
  return {
    hasActiveSprint: false,
    failureReason: 'Failed to reach Jira: ' + transportError,
  };
}

if (statusCode >= 400) {
  const bodyMessage = asText(input.body?.errorMessages?.[0] || input.body?.message);
  return {
    hasActiveSprint: false,
    failureReason: bodyMessage
      ? 'Jira active sprint lookup failed (HTTP ' + statusCode + '): ' + bodyMessage
      : 'Jira active sprint lookup failed (HTTP ' + statusCode + ')',
  };
}

const body = input.body && typeof input.body === 'object' ? input.body : input;
const values = Array.isArray(body.values) ? body.values : [];
const activeSprint = values
  .filter((item) => asText(item?.state).toLowerCase() === 'active')
  .sort((a, b) => new Date(b?.startDate || 0).getTime() - new Date(a?.startDate || 0).getTime())[0] || null;

if (!activeSprint) {
  return {
    hasActiveSprint: false,
    failureReason: 'No active sprint found for board ' + asText(monitorConfig.boardId),
  };
}

return {
  hasActiveSprint: true,
  sprint: {
    id: asText(activeSprint.id),
    sprint_id: asText(activeSprint.id),
    board_id: asText(monitorConfig.boardId),
    sprint_name: asText(activeSprint.name),
    sprint_goal: asText(activeSprint.goal || ''),
    start_at: asText(activeSprint.startDate),
    end_at: asText(activeSprint.endDate),
    timezone: asText(monitorConfig.timezone),
  },
};`;

const buildGitLabProjectItemsCode = String.raw`const request = $('Normalize Request').first().json || {};
const sprint = $('Pick Active Sprint').first().json?.sprint || {};
const monitorConfig = request.monitorConfig || {};
const projectIds = Array.isArray(monitorConfig.gitlabProjectIds) ? monitorConfig.gitlabProjectIds : [];

if (projectIds.length === 0 || !monitorConfig.gitlabBaseUrl) {
  return [{
    json: {
      skipGitLab: true,
      gitlabBaseUrl: monitorConfig.gitlabBaseUrl || '',
      sprint,
      body: {
        projectId: '',
        merge_requests: [],
      },
    },
  }];
}

return projectIds.map((projectId) => ({
  json: {
    skipGitLab: false,
    projectId: String(projectId),
    gitlabBaseUrl: monitorConfig.gitlabBaseUrl,
    sprint,
    requestUrl: monitorConfig.gitlabBaseUrl + '/api/v4/projects/' + encodeURIComponent(String(projectId)) + '/merge_requests',
  },
}));`;

const buildEmptyGitLabSignalsCode = String.raw`return [{
  json: {
    statusCode: 200,
    body: {
      projectId: '',
      merge_requests: [],
    },
  },
}];`;

const aggregateGitLabSignalsCode = String.raw`const request = $('Normalize Request').first().json || {};
const items = $input.all().map((item) => item?.json || {});

function asText(value) {
  return String(value ?? '').trim();
}

function extractIssueKeys(text) {
  return Array.from(new Set(
    asText(text)
      .match(/[A-Z][A-Z0-9]+-\d+/g) || [],
  ));
}

const mergeRequests = [];
const unmatched = [];

for (const item of items) {
  const body = item.body && typeof item.body === 'object' ? item.body : {};
  const bodyMergeRequests = Array.isArray(body.merge_requests)
    ? body.merge_requests
    : (Array.isArray(body) ? body : []);

  for (const mergeRequest of bodyMergeRequests) {
    const issueKeys = Array.from(new Set([
      ...extractIssueKeys(mergeRequest.title),
      ...extractIssueKeys(mergeRequest.description),
      ...extractIssueKeys(mergeRequest.source_branch),
      ...extractIssueKeys(mergeRequest.target_branch),
      ...extractIssueKeys(mergeRequest.merge_commit_sha),
    ]));

    const signal = {
      issueKeys,
      issueKey: issueKeys[0] || '',
      deliverySignalConfidence: issueKeys.length > 0 ? 'high' : 'low',
      projectId: asText(item.projectId || body.projectId),
      mergeRequestId: asText(mergeRequest.iid || mergeRequest.id),
      title: asText(mergeRequest.title),
      mr_state: asText(mergeRequest.state || mergeRequest.merge_status),
      mr_opened_at: asText(mergeRequest.created_at),
      review_requested_at: asText(mergeRequest.updated_at),
      approval_count: Number(Array.isArray(mergeRequest.approved_by) ? mergeRequest.approved_by.length : 0),
      changes_requested_count: Number(Array.isArray(mergeRequest.reviewers) ? mergeRequest.reviewers.filter((reviewer) => reviewer?.state === 'changes_requested').length : 0),
      latest_pipeline_state: asText(mergeRequest.head_pipeline?.status),
      latest_pipeline_at: asText(mergeRequest.head_pipeline?.updated_at || mergeRequest.head_pipeline?.created_at),
      latest_commit_at: asText(mergeRequest.updated_at),
      web_url: asText(mergeRequest.web_url),
      author: asText(mergeRequest.author?.name),
    };

    mergeRequests.push(signal);
    if (signal.issueKeys.length === 0) unmatched.push(signal);
  }
}

const byIssueKey = {};
for (const signal of mergeRequests) {
  for (const issueKey of signal.issueKeys) {
    if (!byIssueKey[issueKey]) byIssueKey[issueKey] = [];
    byIssueKey[issueKey].push(signal);
  }
}

return [{
  json: {
    gitlabSignals: mergeRequests,
    gitlabSignalsByIssueKey: byIssueKey,
    gitlabSummary: {
      totalMergeRequests: mergeRequests.length,
      matchedIssueKeys: Object.keys(byIssueKey).length,
      unmatchedMergeRequests: unmatched.length,
      partialData: items.some((item) => Number(item.statusCode || 200) >= 400),
    },
  },
}];`;

const normalizeSprintContextCode = String.raw`const request = $('Normalize Request').first().json || {};
const sprintInput = $('Pick Active Sprint').first().json || {};
const sprintIssuesResponse = $('Get Sprint Issues').first().json || {};
const gitlab = $('Aggregate GitLab Signals').first().json || {};

const monitorConfig = request.monitorConfig || {};
const sprint = sprintInput.sprint || {};
const statusCode = Number(sprintIssuesResponse.statusCode || 200);
const transportError = String(sprintIssuesResponse.error?.message || sprintIssuesResponse.message || '').trim();

function asText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function businessDaysBetween(startValue, endValue) {
  const startDate = parseDate(startValue);
  const endDate = parseDate(endValue);
  if (!startDate || !endDate || endDate <= startDate) return 0;
  let count = 0;
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  while (cursor < endDate) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6 && cursor <= endDate) count += 1;
  }
  return count;
}

function normalizeStatus(rawStatus) {
  const status = asText(rawStatus);
  const map = {
    open: 'Open',
    'in progress': 'In Progress',
    'ready for review': 'Ready For Review',
    'in review': 'In Review',
    'ready for test': 'Ready For Test',
    'in test': 'In Test',
    'ready for release': 'Ready For Release',
    close: 'Close',
    closed: 'Close',
    done: 'Close',
  };
  return map[status.toLowerCase()] || status;
}

function normalizeUser(user) {
  if (!user || typeof user !== 'object') {
    return {
      id: '',
      name: '',
      email: '',
    };
  }
  return {
    id: asText(user.accountId || user.id || user.key),
    name: asText(user.displayName || user.name),
    email: asText(user.emailAddress || user.email || user.mail).toLowerCase(),
  };
}

function extractStoryPoints(fields) {
  for (const key of ['customfield_10107', 'storyPoints', 'Story Points']) {
    if (fields && Object.prototype.hasOwnProperty.call(fields, key)) {
      const parsed = asNumber(fields[key], NaN);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function extractDependencies(issueLinks) {
  const dependencies = [];
  const dependents = [];
  const blockedBy = [];
  for (const link of asArray(issueLinks)) {
    const inward = link?.inwardIssue;
    const outward = link?.outwardIssue;
    if (inward?.key) {
      dependencies.push(asText(inward.key));
      blockedBy.push(asText(inward.key));
    }
    if (outward?.key) {
      dependents.push(asText(outward.key));
    }
  }
  return { dependencies, dependents, blockedBy };
}

function phaseFromSprint(startAt, endAt, nowIso) {
  const startDate = parseDate(startAt);
  const endDate = parseDate(endAt);
  const nowDate = parseDate(nowIso);
  if (!startDate || !endDate || !nowDate || endDate <= startDate) {
    return { phase: 'mid', elapsedRatio: 0.5, daysRemaining: 0 };
  }
  const elapsedMs = nowDate.getTime() - startDate.getTime();
  const totalMs = Math.max(1, endDate.getTime() - startDate.getTime());
  const elapsedRatio = Math.max(0, Math.min(1.5, elapsedMs / totalMs));
  const daysRemaining = businessDaysBetween(nowDate.toISOString(), endDate.toISOString());
  let phase = 'mid';
  if (elapsedRatio < 0.25) phase = 'early';
  else if (elapsedRatio < 0.75) phase = 'mid';
  else if (daysRemaining > 0) phase = 'late';
  else phase = 'endgame';
  return { phase, elapsedRatio, daysRemaining };
}

const nowIso = request.generatedAt || new Date().toISOString();
const phaseMeta = phaseFromSprint(sprint.start_at, sprint.end_at, nowIso);
const passedStatuses = new Set(['Ready For Review', 'In Review', 'Ready For Release', 'Close']);
const reviewStatuses = new Set(['Ready For Review', 'In Review']);
const qaStatuses = new Set(['Ready For Test', 'In Test']);

let partialData = false;
let failureReason = '';
if (transportError && !sprintIssuesResponse.body) {
  partialData = true;
  failureReason = 'Sprint issue fetch transport error: ' + transportError;
}
if (statusCode >= 400) {
  partialData = true;
  failureReason = 'Sprint issue fetch failed (HTTP ' + statusCode + ')';
}

const body = sprintIssuesResponse.body && typeof sprintIssuesResponse.body === 'object'
  ? sprintIssuesResponse.body
  : sprintIssuesResponse;
const rawIssues = asArray(body.issues);
const allowedTypes = new Set(['Task', 'Bug']);

const tasks = [];
const activityExcerpts = [];
let committedPoints = 0;
let completedPoints = 0;

for (const issue of rawIssues) {
  const fields = issue && typeof issue === 'object' ? (issue.fields || {}) : {};
  const issueType = asText(fields.issuetype?.name);
  if (!allowedTypes.has(issueType)) continue;
  const issueKey = asText(issue.key);
  const status = normalizeStatus(fields.status?.name);
  const assignee = normalizeUser(fields.assignee);
  const reporter = normalizeUser(fields.reporter || fields.creator);
  const dependenciesMeta = extractDependencies(fields.issuelinks);
  const storyPoints = Math.max(0, extractStoryPoints(fields));
  const latestSignals = asArray(gitlab.gitlabSignalsByIssueKey?.[issueKey]);
  const latestSignal = latestSignals.sort((a, b) => new Date(b.latest_commit_at || 0).getTime() - new Date(a.latest_commit_at || 0).getTime())[0] || {};
  const histories = asArray(issue?.changelog?.histories);
  let statusEnteredAt = asText(fields.statuscategorychangedate || fields.updated || fields.created);
  for (const history of histories) {
    const historyItems = asArray(history.items);
    for (const item of historyItems) {
      if (asText(item.field).toLowerCase() !== 'status') continue;
      const toStatus = normalizeStatus(item.toString || item.to);
      if (toStatus === status) {
        statusEnteredAt = asText(history.created || statusEnteredAt);
      }
    }
  }

  committedPoints += storyPoints;
  if (passedStatuses.has(status)) completedPoints += storyPoints;

  const task = {
    task_id: issueKey,
    key: issueKey,
    title: asText(fields.summary),
    type: issueType,
    priority: asText(fields.priority?.name),
    assignee_id: assignee.id,
    assignee_name: assignee.name,
    assignee_email: assignee.email,
    reviewer_ids: [],
    status,
    status_category: asText(fields.status?.statusCategory?.name),
    story_points: storyPoints,
    created_at: asText(fields.created),
    updated_at: asText(fields.updated),
    started_at: asText(fields.customfield_10015 || ''),
    done_at: asText(fields.resolutiondate),
    labels: asArray(fields.labels).map((item) => asText(item)).filter(Boolean),
    epic_id: asText(fields.epic?.id || fields.customfield_10008),
    dependencies: dependenciesMeta.dependencies,
    dependents: dependenciesMeta.dependents,
    blocked_by: dependenciesMeta.blockedBy,
    due_at: asText(fields.duedate),
    browse_url: monitorConfig.jiraBaseUrl + '/browse/' + issueKey,
    reporter_name: reporter.name,
    reporter_email: reporter.email,
    currentStatusEnteredAt: statusEnteredAt,
    days_in_current_status: businessDaysBetween(statusEnteredAt, nowIso),
    delivery_signal_confidence: asText(latestSignal.deliverySignalConfidence, latestSignals.length > 0 ? 'high' : 'low'),
    delivery_signal: latestSignal,
    is_review_stage: reviewStatuses.has(status),
    is_qa_stage: qaStatuses.has(status),
  };

  const comments = asArray(fields.comment?.comments);
  for (const comment of comments.slice(-5)) {
    activityExcerpts.push({
      task_id: issueKey,
      at: asText(comment.created),
      source: 'jira_comment',
      event_type: 'jira_comment',
      actor: asText(comment.author?.displayName),
      text: asText(comment.body),
    });
  }

  for (const history of histories.slice(-5)) {
    const historyDate = asText(history.created);
    for (const item of asArray(history.items)) {
      if (asText(item.field).toLowerCase() !== 'status') continue;
      activityExcerpts.push({
        task_id: issueKey,
        at: historyDate,
        source: 'jira_transition',
        event_type: 'jira_transition',
        actor: asText(history.author?.displayName),
        text: 'Status changed from ' + asText(item.fromString) + ' to ' + asText(item.toString),
      });
    }
  }

  for (const signal of latestSignals.slice(0, 2)) {
    activityExcerpts.push({
      task_id: issueKey,
      at: asText(signal.latest_commit_at || signal.mr_opened_at),
      source: 'gitlab_mr',
      event_type: 'gitlab_mr',
      actor: asText(signal.author),
      text: 'Merge request ' + asText(signal.title) + ' is ' + asText(signal.mr_state),
    });
  }

  tasks.push(task);
}

const selectedActivityExcerpts = activityExcerpts
  .filter((item) => item.text)
  .sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime())
  .slice(0, Math.max(5, Number(monitorConfig.maxActivityExcerpts || 30)));

const sprintSnapshot = {
  ...sprint,
  sprint_id: sprint.sprint_id || sprint.id,
  team_id: monitorConfig.teamId,
  board_id: monitorConfig.boardId,
  committed_points: committedPoints,
  added_scope_points: 0,
  completed_points: completedPoints,
  remaining_points: Math.max(0, committedPoints - completedPoints),
  elapsed_ratio: phaseMeta.elapsedRatio,
  phase: phaseMeta.phase,
  days_remaining: phaseMeta.daysRemaining,
};

return [{
  json: {
    sprint: sprintSnapshot,
    tasks,
    activityExcerpts: selectedActivityExcerpts,
    partialData: partialData || Boolean(gitlab.gitlabSummary?.partialData),
    failureReason,
    gitlabSummary: gitlab.gitlabSummary || {},
  },
}];`;

const buildClassifierPromptCode = String.raw`const context = $('Normalize Sprint Context').first().json || {};
const request = $('Normalize Request').first().json || {};
return [{
  json: {
    classifierSystemPrompt: request.classifierSystemPrompt,
    classifierPrompt: JSON.stringify({
      items: context.activityExcerpts || [],
    }, null, 2),
  },
}];`;

const computeSignalsCode = String.raw`const request = $('Normalize Request').first().json || {};
const context = $('Normalize Sprint Context').first().json || {};
let classifierResults = [];

try {
  const output = $('Comment Classifier AI Agent').first().json?.output || {};
  classifierResults = Array.isArray(output.results) ? output.results : [];
} catch (error) {
  classifierResults = [];
}

function asText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildClassifierMap(items) {
  const map = new Map();
  for (const item of items) {
    const key = asText(item.task_id) + '::' + asText(item.at);
    map.set(key, item);
  }
  return map;
}

const classifierMap = buildClassifierMap(classifierResults);
const tasks = Array.isArray(context.tasks) ? context.tasks.slice() : [];
const phase = asText(context.sprint?.phase, 'mid');
const meaningfulLabels = new Set(['real_progress', 'resolved_signal', 'review_pending', 'waiting_internal', 'waiting_external']);

const assigneeCounts = {};
const reviewerCounts = {};
for (const task of tasks) {
  const assigneeName = asText(task.assignee_name);
  if (assigneeName) assigneeCounts[assigneeName] = (assigneeCounts[assigneeName] || 0) + 1;
}

const candidateTasks = tasks.map((task) => {
  const taskExcerpts = (context.activityExcerpts || []).filter((item) => asText(item.task_id) === asText(task.task_id));
  const meaningfulUpdates = taskExcerpts.filter((item) => {
    const classified = classifierMap.get(asText(item.task_id) + '::' + asText(item.at));
    return meaningfulLabels.has(asText(classified?.label));
  });
  const lastMeaningfulUpdateAt = meaningfulUpdates[0]?.at || task.updated_at || task.currentStatusEnteredAt || context.sprint?.start_at;
  const reviewPendingDays = task.is_review_stage ? asNumber(task.days_in_current_status) : 0;
  const qaPendingDays = task.is_qa_stage ? asNumber(task.days_in_current_status) : 0;
  const blockedDays = Array.isArray(task.blocked_by) && task.blocked_by.length > 0 ? asNumber(task.days_in_current_status) : 0;
  const reviewerQueueCount = reviewPendingDays > 0 ? 1 : 0;
  const assigneeActiveTaskCount = assigneeCounts[asText(task.assignee_name)] || 0;
  const likelyRemainingStageCount = task.status === 'Close' ? 0 : (task.is_review_stage ? 1 : (task.is_qa_stage ? 1 : 2));
  let candidateScore = 0;
  candidateScore += blockedDays * 2.2;
  candidateScore += reviewPendingDays * 1.7;
  candidateScore += qaPendingDays * 1.4;
  candidateScore += Math.max(0, asNumber(task.days_in_current_status) - 2) * 1.1;
  candidateScore += (Array.isArray(task.dependencies) ? task.dependencies.length : 0) * 1.5;
  candidateScore += assigneeActiveTaskCount * 0.4;
  if (phase === 'late' || phase === 'endgame') candidateScore += likelyRemainingStageCount * 1.5;
  if (task.delivery_signal_confidence === 'low') candidateScore -= 0.5;

  let riskType = 'silent_but_probably_ok';
  if (blockedDays > 0) riskType = 'dependency_chain_risk';
  else if (reviewPendingDays > 1) riskType = 'review_bottleneck';
  else if (qaPendingDays > 1) riskType = 'qa_bottleneck';
  else if (candidateScore > 6) riskType = 'stale_no_progress';

  return {
    ...task,
    days_since_last_meaningful_update: asNumber(task.days_in_current_status),
    review_pending_days: reviewPendingDays,
    qa_pending_days: qaPendingDays,
    blocked_days: blockedDays,
    dependency_in_degree: Array.isArray(task.blocked_by) ? task.blocked_by.length : 0,
    dependency_out_degree: Array.isArray(task.dependents) ? task.dependents.length : 0,
    reopened_count: 0,
    status_transition_count_last_5d: taskExcerpts.filter((item) => asText(item.event_type) === 'jira_transition').length,
    comment_activity_count_last_3d: taskExcerpts.filter((item) => asText(item.event_type) === 'jira_comment').length,
    assignee_active_task_count: assigneeActiveTaskCount,
    reviewer_queue_count: reviewerQueueCount,
    scope_added_mid_sprint: false,
    candidate_score: Number(candidateScore.toFixed(3)),
    criticality: candidateScore >= 8 ? 'high' : (candidateScore >= 4 ? 'medium' : 'low'),
    current_stage_order: task.status === 'Close' ? 5 : (task.is_qa_stage ? 4 : (task.is_review_stage ? 3 : 2)),
    expected_stage_order_for_phase: phase === 'early' ? 2 : (phase === 'mid' ? 3 : 4),
    likely_remaining_stage_count: likelyRemainingStageCount,
    risk_type_seed: riskType,
    last_meaningful_update_at: lastMeaningfulUpdateAt,
  };
});

const sortedTasks = candidateTasks
  .slice()
  .sort((a, b) => Number(b.candidate_score || 0) - Number(a.candidate_score || 0));

const topCandidateTasks = sortedTasks.slice(0, Number(request.monitorConfig?.maxCandidateTasks || 20));
const blockedTasks = candidateTasks.filter((task) => Number(task.blocked_days || 0) > 0);
const reviewTasks = candidateTasks.filter((task) => Number(task.review_pending_days || 0) > 0);
const qaTasks = candidateTasks.filter((task) => Number(task.qa_pending_days || 0) > 0);
const epicBuckets = new Map();
for (const task of candidateTasks) {
  const epicId = asText(task.epic_id);
  if (!epicId) continue;
  if (!epicBuckets.has(epicId)) epicBuckets.set(epicId, []);
  epicBuckets.get(epicId).push(task);
}

const clusters = [];
if (reviewTasks.length > 0) {
  clusters.push({
    cluster_id: 'cluster:review_bottleneck:reviewers',
    cluster_type: 'review_bottleneck',
    severity: reviewTasks.length >= 3 ? 'high' : 'medium',
    affected_count: reviewTasks.length,
    why_now: reviewTasks.length + ' task(s) are waiting in review',
    evidence: reviewTasks.slice(0, 5).map((task) => task.key + ' in ' + task.status + ' for ' + task.review_pending_days + 'd'),
    subject_id: 'reviewers',
    recommended_action: 'ESCALATE_TO_LEAD',
    action_owner_type: 'lead',
    decision_owner_type: 'lead',
    execution_owner_type: 'reviewer',
    confidence: 0.78,
  });
}
if (blockedTasks.length > 0) {
  clusters.push({
    cluster_id: 'cluster:dependency_chain_risk:blocked',
    cluster_type: 'dependency_chain_risk',
    severity: blockedTasks.length >= 2 ? 'high' : 'medium',
    affected_count: blockedTasks.length,
    why_now: blockedTasks.length + ' task(s) have dependency blockers',
    evidence: blockedTasks.slice(0, 5).map((task) => task.key + ' blocked by ' + (task.blocked_by || []).join(', ')),
    subject_id: 'blocked',
    recommended_action: 'ESCALATE_TO_LEAD',
    action_owner_type: 'lead',
    decision_owner_type: 'lead',
    execution_owner_type: 'assignee',
    confidence: 0.8,
  });
}
if (qaTasks.length > 0) {
  clusters.push({
    cluster_id: 'cluster:qa_bottleneck:qa',
    cluster_type: 'qa_bottleneck',
    severity: qaTasks.length >= 3 ? 'high' : 'medium',
    affected_count: qaTasks.length,
    why_now: qaTasks.length + ' task(s) are stuck waiting for QA progression',
    evidence: qaTasks.slice(0, 5).map((task) => task.key + ' in ' + task.status + ' for ' + task.qa_pending_days + 'd'),
    subject_id: 'qa',
    recommended_action: 'ESCALATE_TO_LEAD',
    action_owner_type: 'lead',
    decision_owner_type: 'lead',
    execution_owner_type: 'reviewer',
    confidence: 0.74,
  });
}
for (const [epicId, epicTasks] of epicBuckets.entries()) {
  if (epicTasks.length < 3) continue;
  clusters.push({
    cluster_id: 'cluster:scope_creep:' + epicId,
    cluster_type: 'scope_creep',
    severity: epicTasks.length >= 5 ? 'high' : 'medium',
    affected_count: epicTasks.length,
    why_now: 'Epic ' + epicId + ' has multiple unresolved tasks',
    evidence: epicTasks.slice(0, 4).map((task) => task.key + ' score ' + task.candidate_score),
    subject_id: epicId,
    recommended_action: 'FLAG_SPRINT_GOAL_RISK',
    action_owner_type: 'pm',
    decision_owner_type: 'pm',
    execution_owner_type: 'lead',
    confidence: 0.69,
  });
}
if (Object.values(assigneeCounts).some((count) => count >= 4)) {
  const overloaded = Object.entries(assigneeCounts).sort((a, b) => b[1] - a[1])[0];
  clusters.push({
    cluster_id: 'cluster:assignee_overload:' + overloaded[0],
    cluster_type: 'unowned_work',
    severity: overloaded[1] >= 6 ? 'high' : 'medium',
    affected_count: overloaded[1],
    why_now: overloaded[0] + ' owns many active tasks',
    evidence: sortedTasks.filter((task) => asText(task.assignee_name) === overloaded[0]).slice(0, 5).map((task) => task.key),
    subject_id: overloaded[0],
    recommended_action: 'ESCALATE_TO_LEAD',
    action_owner_type: 'lead',
    decision_owner_type: 'lead',
    execution_owner_type: 'lead',
    confidence: 0.66,
  });
}

const topClusters = clusters.slice(0, Number(request.monitorConfig?.maxClusters || 5));
const sprintSignals = {
  phase,
  elapsed_ratio: context.sprint?.elapsed_ratio || 0,
  completed_points_ratio: (Number(context.sprint?.completed_points || 0) / Math.max(1, Number(context.sprint?.committed_points || 0))),
  tasks_not_started_ratio: candidateTasks.filter((task) => asText(task.status) === 'Open').length / Math.max(1, candidateTasks.length),
  tasks_in_dev_ratio: candidateTasks.filter((task) => asText(task.status) === 'In Progress').length / Math.max(1, candidateTasks.length),
  tasks_in_review_ratio: reviewTasks.length / Math.max(1, candidateTasks.length),
  tasks_in_qa_ratio: qaTasks.length / Math.max(1, candidateTasks.length),
  blocked_ratio: blockedTasks.length / Math.max(1, candidateTasks.length),
  review_bottleneck_score: reviewTasks.reduce((sum, task) => sum + Number(task.review_pending_days || 0), 0),
  qa_bottleneck_score: qaTasks.reduce((sum, task) => sum + Number(task.qa_pending_days || 0), 0),
  dependency_risk_score: blockedTasks.reduce((sum, task) => sum + Number(task.blocked_days || 0), 0),
  sprint_goal_coverage_score: Math.max(0.1, 1 - topClusters.length * 0.12),
};

return [{
  json: {
    sprint: context.sprint,
    tasks: candidateTasks,
    topCandidateTasks,
    topClusters,
    activityExcerpts: context.activityExcerpts,
    classifierResults,
    sprintSignals,
    partialData: Boolean(context.partialData),
    failureReason: asText(context.failureReason),
  },
}];`;

const buildPriorStateQueryCode = String.raw`const request = $('Normalize Request').first().json || {};
const signalState = $('Compute Signals').first().json || {};

function sqlEscape(value) {
  return String(value ?? '').replace(/'/g, "''");
}

const teamId = sqlEscape(request.monitorConfig?.teamId || '');
const sprintId = sqlEscape(signalState.sprint?.sprint_id || signalState.sprint?.id || '');

const query = [
  'SELECT json_build_object(',
  "  'openIssues', COALESCE((",
  "    SELECT json_agg(row_to_json(t)) FROM (",
  "      SELECT * FROM v_open_issues",
  "      WHERE team_id = '" + teamId + "'",
  sprintId ? "        AND sprint_id = '" + sprintId + "'" : '',
  '      ORDER BY last_seen_at DESC',
  '      LIMIT 100',
  '    ) t',
  "  ), '[]'::json),",
  "  'priorInterventions', COALESCE((",
  "    SELECT json_agg(row_to_json(t)) FROM (",
  "      SELECT * FROM interventions",
  "      WHERE created_at >= now() - interval '7 day'",
  '      ORDER BY created_at DESC',
  '      LIMIT 200',
  '    ) t',
  "  ), '[]'::json),",
  "  'historicalPatterns', COALESCE((",
  "    SELECT json_agg(row_to_json(t)) FROM (",
  "      SELECT * FROM historical_patterns",
  "      WHERE team_id = '" + teamId + "'",
  '      ORDER BY generated_at DESC',
  '      LIMIT 50',
  '    ) t',
  "  ), '[]'::json)",
  ') AS state_json;',
].filter(Boolean).join('\n');

return [{
  json: {
    priorStateQuery: query,
  },
}];`;

const buildJudgeInputsCode = String.raw`const request = $('Normalize Request').first().json || {};
const signals = $('Compute Signals').first().json || {};
const priorStateRow = $('Load Prior State').first().json || {};

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

const stateJson = asObject(priorStateRow.state_json || priorStateRow.stateJson || {});
const packet = {
  run_context: {
    run_id: request.runId,
    run_type: request.runType,
    generated_at: request.generatedAt,
    team_name: request.monitorConfig?.teamId || '',
    sprint_phase: signals.sprintSignals?.phase || signals.sprint?.phase || 'mid',
  },
  policy: {
    max_mentions_per_digest: 2,
    prefer_cluster_alerts: true,
    silence_if_no_new_actionable_insight: true,
  },
  sprint_snapshot: {
    ...(signals.sprint || {}),
    signals: signals.sprintSignals || {},
  },
  top_clusters: signals.topClusters || [],
  candidate_tasks: signals.topCandidateTasks || [],
  activity_excerpts: signals.activityExcerpts || [],
  prior_interventions: stateJson.priorInterventions || [],
  historical_patterns: stateJson.historicalPatterns || [],
};

return [{
  json: {
    judgeSystemPrompt: request.judgeSystemPrompt,
    judgePrompt: JSON.stringify(packet, null, 2),
    packet,
    openIssues: stateJson.openIssues || [],
    priorInterventions: stateJson.priorInterventions || [],
    historicalPatterns: stateJson.historicalPatterns || [],
  },
}];`;

const deliveryGateCode = String.raw`const request = $('Normalize Request').first().json || {};
const signals = $('Compute Signals').first().json || {};
const judgeNode = $('Sprint Judge AI Agent').first().json || {};
const judge = judgeNode.output && typeof judgeNode.output === 'object' ? judgeNode.output : {};
const prior = $('Build Judge Inputs').first().json || {};

function asText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asOwnerType(value, fallback = 'none') {
  const normalized = asText(value, fallback).toLowerCase();
  return ['pm', 'lead', 'assignee', 'reviewer', 'team', 'none'].includes(normalized)
    ? normalized
    : fallback;
}

function normalizeMentionsNeeded(value) {
  return asArray(value)
    .map((item, index) => ({
      type: asText(item?.type, 'person'),
      email: asText(item?.email).toLowerCase(),
      reason: asText(item?.reason),
      priority: Number(item?.priority || index + 1),
    }))
    .filter((item) => item.email);
}

const suppressionDigestHours = Number(request.monitorConfig?.suppressionDigestHours || 24);
const now = new Date(request.generatedAt || new Date().toISOString());

function hoursSince(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - date.getTime()) / 3600000);
}

function makeIssueKey(entityType, entityId, riskType) {
  return entityType + ':' + entityId + ':' + riskType;
}

const openIssues = asArray(prior.openIssues);
const tasks = asArray(judge.tasks).filter((task) => asText(task.classification) !== 'noise_do_not_alert');
const clusters = asArray(judge.clusters);
const deliverableTaskIssues = [];
const deliverableClusterIssues = [];

for (const task of tasks) {
  const issueKey = makeIssueKey('task', asText(task.task_id), asText(task.risk_type));
  const existing = openIssues.find((item) => asText(item.issue_key) === issueKey);
  const suppressed = existing && hoursSince(existing.last_alerted_at) < suppressionDigestHours && asText(existing.severity) === asText(task.severity);
  if (suppressed) continue;
  deliverableTaskIssues.push({
    issue_key: issueKey,
    entity_type: 'task',
    entity_id: asText(task.task_id),
    risk_type: asText(task.risk_type),
    severity: asText(task.severity, 'medium'),
    action_owner_type: asOwnerType(task.action_owner_type, 'lead'),
    decision_owner_type: asOwnerType(task.decision_owner_type || task.action_owner_type, 'lead'),
    execution_owner_type: asOwnerType(task.execution_owner_type || task.action_owner_type, 'assignee'),
    recommended_action: asText(task.recommended_action),
    why_now: asText(task.why_now),
    evidence: asArray(task.evidence),
    mentions_needed: normalizeMentionsNeeded(task.mentions_needed),
    confidence: Number(task.confidence || 0.6),
  });
}

for (const cluster of clusters) {
  const subjectId = asText(cluster.cluster_id || cluster.cluster_type || 'cluster').split(':').slice(-1)[0];
  const issueKey = makeIssueKey('cluster', asText(cluster.cluster_type), subjectId);
  const existing = openIssues.find((item) => asText(item.issue_key) === issueKey);
  const suppressed = existing && hoursSince(existing.last_alerted_at) < suppressionDigestHours && asText(existing.severity) === asText(cluster.severity);
  if (suppressed) continue;
  deliverableClusterIssues.push({
    issue_key: issueKey,
    entity_type: 'cluster',
    entity_id: asText(cluster.cluster_id || subjectId),
    risk_type: asText(cluster.cluster_type),
    severity: asText(cluster.severity, 'medium'),
    action_owner_type: asOwnerType(cluster.action_owner_type, 'lead'),
    decision_owner_type: asOwnerType(cluster.decision_owner_type || cluster.action_owner_type, 'lead'),
    execution_owner_type: asOwnerType(cluster.execution_owner_type || cluster.action_owner_type, 'lead'),
    recommended_action: asText(cluster.recommended_action),
    why_now: asText(cluster.why_now),
    evidence: asArray(cluster.evidence),
    mentions_needed: normalizeMentionsNeeded(cluster.mentions_needed),
    confidence: Number(cluster.confidence || 0.65),
  });
}

const combinedIssues = [
  ...deliverableClusterIssues,
  ...deliverableTaskIssues,
];

const sendUnifiedDigest = Boolean(judge.delivery_plan?.send_unified_digest) && !Boolean(judge.silence_decision?.no_message_needed);
const shouldDraftMessages = sendUnifiedDigest;
const noMessage = Boolean(judge.silence_decision?.no_message_needed) || (!sendUnifiedDigest && combinedIssues.length === 0);

return [{
  json: {
    judge,
    deliverableIssues: combinedIssues,
    sendUnifiedDigest,
    shouldDraftMessages: shouldDraftMessages && !noMessage,
    noMessage,
    suppressionSummary: {
      openIssueCount: openIssues.length,
      deliverableIssueCount: combinedIssues.length,
    },
    summaryJson: {
      sprintAssessment: judge.sprint_assessment || {},
      topClusterCount: clusters.length,
      topTaskCount: tasks.length,
      partialData: Boolean(signals.partialData),
    },
  },
}];`;

const buildDraftInputsCode = String.raw`const request = $('Normalize Request').first().json || {};
const gate = $('Delivery Gate').first().json || {};
const context = $('Normalize Sprint Context').first().json || {};
const judge = gate.judge || {};

const payload = {
  sprint_assessment: judge.sprint_assessment || {},
  clusters: judge.clusters || [],
  tasks: judge.tasks || [],
  deliverable_issues: gate.deliverableIssues || [],
  sprint: context.sprint || {},
  delivery_plan: judge.delivery_plan || {},
};

return [{
  json: {
    draftSystemPrompt: request.draftSystemPrompt,
    draftPrompt: JSON.stringify(payload, null, 2),
  },
}];`;

const buildRenderModelCode = String.raw`const request = $('Normalize Request').first().json || {};
const context = $('Normalize Sprint Context').first().json || {};
const signals = $('Compute Signals').first().json || {};
const gate = $('Delivery Gate').first().json || {};
const judge = gate.judge || {};
const draftNode = (() => {
  try {
    return $('Message Drafter AI Agent').first().json || {};
  } catch (error) {
    return {};
  }
})();
const draft = draftNode.output && typeof draftNode.output === 'object' ? draftNode.output : {};
const messageLanguage = String(request.monitorConfig?.messageLanguage || 'en').trim().toLowerCase() === 'vi' ? 'vi' : 'en';

function asText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asOwnerType(value, fallback = 'none') {
  const normalized = asText(value, fallback).toLowerCase();
  return ['pm', 'lead', 'assignee', 'reviewer', 'team', 'none'].includes(normalized)
    ? normalized
    : fallback;
}

function t(english, vietnamese) {
  return messageLanguage === 'vi' ? vietnamese : english;
}

function titleCaseFromOwnerType(ownerType) {
  const normalized = asOwnerType(ownerType, 'team');
  const labels = {
    pm: t('PM', 'PM'),
    lead: t('Lead', 'Lead'),
    assignee: t('Owner', 'Owner'),
    reviewer: t('Reviewer', 'Reviewer'),
    team: t('Team', 'Team'),
    none: t('Team', 'Team'),
  };
  return labels[normalized] || labels.team;
}

function normalizeMentionsNeeded(value) {
  return asArray(value)
    .map((item, index) => ({
      type: asText(item?.type, 'person'),
      email: asText(item?.email).toLowerCase(),
      reason: asText(item?.reason),
      priority: Number(item?.priority || index + 1),
    }))
    .filter((item) => item.email);
}

function normalizeEmail(value) {
  const email = asText(value).toLowerCase();
  return email.includes('@') ? email : '';
}

function bulletBody(text, labelPattern) {
  const raw = asText(text);
  if (!raw) return '';
  if (!labelPattern.test(raw)) return raw;
  return raw.replace(labelPattern, '').trim();
}

function pickDraftLine(lines, labelPattern) {
  return asArray(lines).find((line) => labelPattern.test(asText(line))) || '';
}

function isWeakDirectiveLine(text) {
  const normalized = asText(text).toLowerCase();
  if (!normalized) return true;
  return /^(none|n\/a|no action|no decision|khong co|chua ro)\b/.test(normalized);
}

function splitIntoSentences(text) {
  const normalized = asText(text);
  if (!normalized) return [];
  return normalized
    .split(/[.!?;；]\s*/)
    .map((part) => asText(part))
    .filter(Boolean);
}

function looksLikeUrgencySentence(text) {
  const sentence = asText(text);
  if (!sentence) return false;
  const hasDays = /\b\d+\s*(?:days?|ngay|ngày)\b/i.test(sentence);
  const hasRatio = /\b\d+\s*\/\s*\d+\s*(?:pts?|points?)?\b/i.test(sentence);
  const hasPressureCue = /(scope|spillover|urgent|need|can|cần|xu ly ngay|chot)\b/i.test(sentence);
  return (hasDays && hasRatio) || (hasDays && hasPressureCue);
}

function detachUrgencyTail(text) {
  const sentences = splitIntoSentences(text);
  if (sentences.length <= 1) {
    return {
      main: asText(text),
      urgency: '',
    };
  }
  for (let index = sentences.length - 1; index >= 0; index -= 1) {
    if (!looksLikeUrgencySentence(sentences[index])) continue;
    const urgency = sentences[index];
    const main = sentences.filter((_, position) => position !== index).join(' ').trim();
    return {
      main,
      urgency,
    };
  }
  return {
    main: asText(text),
    urgency: '',
  };
}

function dedupeMentions(items) {
  const seen = new Set();
  const results = [];
  for (const item of items) {
    const email = normalizeEmail(item?.email);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    results.push({
      type: 'person',
      email,
      reason: asText(item?.reason),
      priority: Number(item?.priority || results.length + 1),
    });
  }
  return results.sort((a, b) => a.priority - b.priority).slice(0, 2);
}

const memberRows = $input.all().map((item) => item?.json || {});
const memberMap = new Map();
for (const row of memberRows) {
  const normalized = {};
  for (const [key, value] of Object.entries(row || {})) {
    normalized[String(key || '').trim().toLowerCase()] = value;
  }
  const email = normalizeEmail(normalized.email);
  const id = asText(normalized.id);
  const name = asText(normalized.name || normalized.display_name || normalized.displayname);
  if (!email) continue;
  if (!memberMap.has(email)) {
    memberMap.set(email, { id, name, email });
  }
}

const mentionLookup = {};
for (const member of memberMap.values()) {
  const memberId = asText(member?.id);
  const memberEmail = normalizeEmail(member?.email);
  const memberName = asText(member?.name);
  if (!memberId) continue;
  const mentionText = '<users/' + memberId + '>';
  const localPart = memberEmail.includes('@') ? memberEmail.split('@')[0] : '';
  for (const rawKey of [localPart, memberEmail, memberName]) {
    const key = asText(rawKey).toLowerCase();
    if (!key || mentionLookup[key]) continue;
    mentionLookup[key] = mentionText;
  }
}

const sprint = context.sprint || {};
const tasks = asArray(context.tasks);
const deliverableIssues = asArray(gate.deliverableIssues);
const topIssue = deliverableIssues[0] || {};
const topTask = tasks.find((task) => asText(task.task_id) === asText(topIssue.entity_id)) || {};
const notStartedCount = tasks.filter((task) => asText(task.status) === 'Open').length;
const reviewCount = tasks.filter((task) => ['Ready For Review', 'In Review'].includes(asText(task.status))).length;
const blockedCount = tasks.filter((task) => asArray(task.blocked_by).length > 0).length;
const doneTasks = tasks.filter((task) => ['Ready For Review', 'In Review', 'Ready For Release', 'Close'].includes(asText(task.status))).length;
const totalTasks = tasks.length;
const donePoints = asNumber(sprint.completed_points, 0);
const totalPoints = asNumber(sprint.committed_points, 0);
const burnedPercent = totalPoints > 0 ? Number(((donePoints / totalPoints) * 100).toFixed(1)) : null;
const daysLeft = asNumber(sprint.days_remaining, 0);

const statusMap = {
  likely_on_track: t('on track', 'on track'),
  at_risk_but_recoverable: t('at risk', 'at risk'),
  likely_spillover: t('likely spillover', 'likely spillover'),
};
const sprintStatus = statusMap[asText(judge.sprint_assessment?.delivery_outlook)] || t('at risk', 'at risk');
const mainRiskCluster = asArray(judge.clusters)[0];

const defaultMainBlocker = (() => {
  if (!deliverableIssues.length) return '';
  const issue = deliverableIssues[0];
  return asText(issue.why_now) || t('Main blocker needs a decision today.', 'Main blocker can mot quyet dinh trong hom nay.');
})();

const quickWinTask = tasks
  .filter((task) => ['Ready For Review', 'In Review', 'Ready For Test', 'In Test'].includes(asText(task.status)))
  .sort((a, b) => Number(b.story_points || 0) - Number(a.story_points || 0))[0];
const defaultQuickWin = quickWinTask
  ? asText(quickWinTask.key) + ' ' + t('is close to done if ownership is cleared today.', 'co the chot nhanh neu clear owner trong hom nay.')
  : '';

const decisionOwnerType = asOwnerType(topIssue.decision_owner_type || mainRiskCluster?.decision_owner_type, 'lead');
const executionOwnerType = asOwnerType(topIssue.execution_owner_type || mainRiskCluster?.execution_owner_type, 'assignee');

const derivedMentions = [];
if (normalizeEmail(topTask.assignee_email)) {
  derivedMentions.push({ type: 'person', email: topTask.assignee_email, reason: 'execution_owner', priority: 1 });
}
if (normalizeEmail(topTask.reporter_email)) {
  derivedMentions.push({ type: 'person', email: topTask.reporter_email, reason: 'decision_owner', priority: 2 });
}
for (const issue of deliverableIssues.slice(0, 3)) {
  derivedMentions.push(...normalizeMentionsNeeded(issue.mentions_needed));
}
const mentionsNeeded = dedupeMentions(derivedMentions);
const mentionsResolved = mentionsNeeded.map((item) => {
  const member = memberMap.get(item.email);
  return {
    ...item,
    display_name: member?.name || item.email,
    mention_text: member?.id ? '<users/' + member.id + '>' : '',
    resolved: Boolean(member?.id),
  };
});

function mentionOrFallback(position, ownerType) {
  const mention = mentionsResolved[position];
  if (mention?.mention_text) return mention.mention_text;
  if (mention?.display_name) return mention.display_name;
  return titleCaseFromOwnerType(ownerType);
}

function mentionByReasonOrFallback(reasonPattern, position, ownerType) {
  const matched = mentionsResolved.find((item) => reasonPattern.test(asText(item?.reason).toLowerCase()));
  if (matched?.mention_text) return matched.mention_text;
  if (matched?.display_name) return matched.display_name;
  return mentionOrFallback(position, ownerType);
}

function replaceMentionPlaceholders(text, mentionTokens) {
  const raw = asText(text);
  if (!raw) return '';
  return raw.replace(/@(?:PIC|OWNER|ASSIGNEE|REVIEWER|LEAD|PM|DECIDER)\b/gi, (token) => {
    const key = token.replace('@', '').toUpperCase();
    const replacement = asText(mentionTokens[key]);
    return replacement || token;
  });
}

const draftedText = asText(draft.unified_digest_text);
const draftedLines = draftedText.split(/\r?\n/).map((line) => asText(line)).filter(Boolean);

const draftedUrgencyLine = bulletBody(
  pickDraftLine(draftedLines, /^\s*[-*•]?\s*(?:Urgency|Khan cap)\s*:/i),
  /^\s*[-*•]?\s*(?:Urgency|Khan cap)\s*:\s*/i,
);
const draftedMainBlockerLine = bulletBody(
  pickDraftLine(draftedLines, /^\s*[-*•]?\s*Main blocker:/i),
  /^\s*[-*•]?\s*Main blocker:\s*/i,
);
const draftedQuickWinLine = bulletBody(
  pickDraftLine(draftedLines, /^\s*[-*•]?\s*Quick win:/i),
  /^\s*[-*•]?\s*Quick win:\s*/i,
);
const draftedDecisionTodayLine = bulletBody(
  pickDraftLine(draftedLines, /^\s*[-*•]?\s*Decision today:/i),
  /^\s*[-*•]?\s*Decision today:\s*/i,
);

const defaultDecisionToday = topIssue?.issue_key ? [
  mentionOrFallback(0, decisionOwnerType),
  t('to confirm the blocker path today.', 'xac nhan huong xu ly blocker trong hom nay.'),
].join(' ') : '';

const detached = detachUrgencyTail(draftedMainBlockerLine || defaultMainBlocker);
const mainBlockerSeed = asText(detached.main || draftedMainBlockerLine || defaultMainBlocker);
const urgencyLine = asText(draftedUrgencyLine || detached.urgency);

const mentionTokens = {
  PIC: mentionByReasonOrFallback(/execution|assignee|owner|blocker/, 0, executionOwnerType),
  OWNER: mentionByReasonOrFallback(/execution|assignee|owner/, 0, executionOwnerType),
  ASSIGNEE: mentionByReasonOrFallback(/execution|assignee|owner/, 0, executionOwnerType),
  REVIEWER: mentionByReasonOrFallback(/review/, 1, 'reviewer'),
  LEAD: mentionByReasonOrFallback(/lead/, 0, 'lead'),
  PM: mentionByReasonOrFallback(/decision|scope|pm/, 0, decisionOwnerType),
  DECIDER: mentionByReasonOrFallback(/decision|scope|pm/, 0, decisionOwnerType),
};

const mainBlockerLine = replaceMentionPlaceholders(mainBlockerSeed, mentionTokens);
const quickWinLine = isWeakDirectiveLine(draftedQuickWinLine)
  ? replaceMentionPlaceholders(defaultQuickWin, mentionTokens)
  : replaceMentionPlaceholders(draftedQuickWinLine, mentionTokens);
const decisionTodayLine = isWeakDirectiveLine(draftedDecisionTodayLine)
  ? replaceMentionPlaceholders(defaultDecisionToday, mentionTokens)
  : replaceMentionPlaceholders(draftedDecisionTodayLine, mentionTokens);

const metricsLines = [
  t('Team passed', 'Team passed') + ': ' + doneTasks + '/' + Math.max(0, totalTasks) + ' ' + t('tasks', 'tasks') + ' — ' + donePoints + '/' + (totalPoints || 0) + ' pts — ' + (burnedPercent === null ? 'n/a' : String(burnedPercent) + '%') + ' ' + t('burned', 'burned'),
];
const keySignals = [
  t('Blocked', 'Blocked') + ': ' + blockedCount + ' ' + t('tasks', 'tasks'),
  t('In review', 'In review') + ': ' + reviewCount + ' ' + t('tasks', 'tasks'),
  t('Not started', 'Not started') + ': ' + notStartedCount + ' ' + t('tasks', 'tasks'),
];

return [{
  json: {
    threadKey: 'sprint-monitor-' + request.runId,
    sprintStatus,
    daysLeft,
    metricsLines,
    keySignals: keySignals.filter(Boolean).slice(0, 4),
    urgencyLine,
    mainBlockerLine,
    quickWinLine,
    decisionTodayLine,
    mentionsNeeded,
    mentionsResolved,
    mentionTokens,
    mentionLookup,
    decisionOwnerType,
    executionOwnerType,
    unifiedDigestText: draftedText,
    deliveryIssueKeys: deliverableIssues.map((issue) => issue.issue_key),
  },
}];`;

const buildDeliveryMessagesCode = String.raw`const request = $('Normalize Request').first().json || {};
const gate = $('Delivery Gate').first().json || {};
const render = $('Build Render Model').first().json || {};
const messageLanguage = String(request.monitorConfig?.messageLanguage || 'en').trim().toLowerCase() === 'vi' ? 'vi' : 'en';

function asText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function t(english, vietnamese) {
  return messageLanguage === 'vi' ? vietnamese : english;
}

function compactLines(lines) {
  return asArray(lines).map((line) => asText(line)).filter(Boolean);
}

function renderMentions(text) {
  const raw = asText(text);
  if (!raw) return raw;
  const mentionTokens = render.mentionTokens && typeof render.mentionTokens === 'object'
    ? render.mentionTokens
    : {};
  const mentionLookup = render.mentionLookup && typeof render.mentionLookup === 'object'
    ? render.mentionLookup
    : {};
  let rendered = raw.replace(/@(?:PIC|OWNER|ASSIGNEE|REVIEWER|LEAD|PM|DECIDER)\b/gi, (token) => {
    const key = token.replace('@', '').toUpperCase();
    const replacement = asText(mentionTokens[key]);
    return replacement || token;
  });

  rendered = rendered.replace(/(^|[\s(])@([A-Za-z0-9._-]{2,64})\b/g, (full, prefix, handle) => {
    const replacement = asText(mentionLookup[String(handle || '').toLowerCase()]);
    return replacement ? prefix + replacement : full;
  });

  function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^()|[\]\\$]/g, '\\$&');
  }

  const displayNameKeys = Object.keys(mentionLookup)
    .filter((key) => key.includes(' '))
    .sort((a, b) => b.length - a.length);
  for (const displayNameKey of displayNameKeys) {
    const replacement = asText(mentionLookup[displayNameKey]);
    if (!replacement) continue;
    const namePattern = new RegExp(
      '(^|[\\s(])@\\s*' + escapeRegExp(displayNameKey) + '(?=\\s|[.,;:)]|$)',
      'giu',
    );
    rendered = rendered.replace(namePattern, (full, prefix) => prefix + replacement);
  }

  return rendered;
}

function renderJiraLinks(text) {
  const raw = asText(text);
  const baseUrl = asText(request.monitorConfig?.jiraBaseUrl).replace(/\/+$/, '');
  const projectKey = asText(request.monitorConfig?.jiraProjectKey).toUpperCase();
  if (!raw || !baseUrl) return raw;

  function toLink(issueKey, label = issueKey) {
    return '<' + baseUrl + '/browse/' + encodeURIComponent(issueKey) + '|' + label + '>';
  }

  try {
    let rendered = raw.replace(
      /[A-Z][A-Z0-9]+-\d+/g,
      (cardId) => toLink(cardId, cardId),
    );

    // Fallback for compact numeric lists like "4495/4498/4503" when project key is configured.
    if (projectKey) {
      rendered = rendered.replace(/\b\d{3,7}(?:\s*[/,]\s*\d{3,7})+\b/g, (chunk) => {
        return chunk
          .split(/(\s*[/,]\s*)/)
          .map((part) => {
            const token = part.trim();
            if (!/^\d{3,7}$/.test(token)) return part;
            const issueKey = projectKey + '-' + token;
            return toLink(issueKey, issueKey);
          })
          .join('');
      });
    }

    return rendered;
  } catch (error) {
    return raw;
  }
}

const narrativeLines = [];
if (asText(render.urgencyLine)) narrativeLines.push('• Urgency: ' + render.urgencyLine);
if (asText(render.mainBlockerLine)) narrativeLines.push('• Main blocker: ' + render.mainBlockerLine);
if (asText(render.quickWinLine)) narrativeLines.push('• Quick win: ' + render.quickWinLine);
if (asText(render.decisionTodayLine)) narrativeLines.push('• Decision today: ' + render.decisionTodayLine);
const narrativeText = renderJiraLinks(renderMentions(narrativeLines.join('\n')));

const cardPayload = {
  cardsV2: [
    {
      cardId: 'sprint-monitor-unified-digest',
      card: {
        sections: [
          {
            widgets: [
              {
                decoratedText: {
                  text: '<b>' + t('Sprint status', 'Sprint status') + ': ' + asText(render.sprintStatus, t('at risk', 'at risk')) + '</b><br>' + t('Days left', 'Days left') + ': ' + String(render.daysLeft ?? 0),
                  wrapText: true,
                },
              },
              {
                decoratedText: {
                  text: compactLines(render.metricsLines).join('<br>'),
                  wrapText: true,
                },
              },
              {
                decoratedText: {
                  text: compactLines(render.keySignals).join('<br>'),
                  wrapText: true,
                },
              },
            ],
          },
        ],
      },
    },
  ],
};

const deliveries = [];
if (!gate.noMessage && gate.sendUnifiedDigest && request.monitorConfig?.gchatUnifiedWebhook) {
  deliveries.push({
    destination: request.monitorConfig.gchatUnifiedWebhook,
    destinationType: 'google_chat_unified',
    messageType: 'unified_digest_card',
    threadKey: asText(render.threadKey),
    auditText: t('Sprint status', 'Sprint status') + ': ' + asText(render.sprintStatus) + ' | ' + t('Days left', 'Days left') + ': ' + String(render.daysLeft ?? 0),
    payload: cardPayload,
    issueKeys: asArray(render.deliveryIssueKeys),
  });
  deliveries.push({
    destination: request.monitorConfig.gchatUnifiedWebhook,
    destinationType: 'google_chat_unified',
    messageType: 'unified_digest_text',
    threadKey: asText(render.threadKey),
    auditText: narrativeText,
    payload: {
      text: narrativeText,
    },
    issueKeys: asArray(render.deliveryIssueKeys),
  });
}

return [{
  json: {
    noMessage: gate.noMessage,
    deliveries,
    deliveryCount: deliveries.length,
    deliverySummary: {
      requestedCount: deliveries.length,
      unifiedDigestRequested: deliveries.length > 0,
      threadMessageCount: deliveries.length,
    },
  },
}];`;

const expandDeliveryItemsCode = String.raw`const deliveryPayload = $('Build Delivery Messages').first().json || {};
const deliveries = Array.isArray(deliveryPayload.deliveries) ? deliveryPayload.deliveries : [];

return deliveries.map((delivery, index) => ({
  json: {
    requestUrl: delivery.destination + (delivery.destination.includes('?') ? '&' : '?') + 'threadKey=' + encodeURIComponent(String(delivery.threadKey || '')) + '&messageReplyOption=' + encodeURIComponent('${GOOGLE_CHAT_REPLY_OPTION}'),
    requestBody: delivery.payload,
    messageType: delivery.messageType,
    destinationType: delivery.destinationType,
    issueKeys: delivery.issueKeys || [],
    auditText: delivery.auditText || '',
    requestIndex: index,
  },
}));`;

const aggregateDeliveriesCode = String.raw`const items = $input.all().map((item) => item?.json || {});
const successCount = items.filter((item) => Number(item.statusCode || 0) > 0 && Number(item.statusCode) < 400).length;
const failureCount = items.filter((item) => Number(item.statusCode || 0) >= 400).length;

return [{
  json: {
    attemptedCount: items.length,
    successCount,
    failureCount,
    status: items.length === 0
      ? 'skipped'
      : (failureCount === 0 ? 'delivered' : (successCount > 0 ? 'partial' : 'failed')),
    responses: items,
  },
}];`;

const buildPersistQueryCode = String.raw`const request = $('Normalize Request').first().json || {};
const context = $('Normalize Sprint Context').first().json || {};
const signals = $('Compute Signals').first().json || {};
const gate = $('Delivery Gate').first().json || {};
const deliveryPayload = $('Build Delivery Messages').first().json || {};
const deliveryAggregate = (() => {
  try {
    return $('Aggregate Deliveries').first().json || {};
  } catch (error) {
    return {};
  }
})();

function asText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sqlText(value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function sqlJson(value) {
  return "'" + JSON.stringify(value ?? {}).replace(/'/g, "''") + "'::jsonb";
}

function sqlNumeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : 'NULL';
}

const sprint = context.sprint || {};
const tasks = asArray(context.tasks);
const activityExcerpts = asArray(context.activityExcerpts);
const sprintSignals = signals.sprintSignals || {};
const deliverableIssues = asArray(gate.deliverableIssues);
const responses = asArray(deliveryAggregate.responses);
const deliveries = asArray(deliveryPayload.deliveries);
const retroNotes = request.runType === 'endgame'
  ? asArray((gate.judge?.clusters || [])).slice(0, 3).map((cluster) => ({
      note_type: 'retro_candidate',
      severity: cluster.severity || 'medium',
      content: cluster.why_now || '',
      source_issue_key: 'cluster:' + (cluster.cluster_type || 'unknown') + ':' + (cluster.cluster_id || 'cluster'),
    }))
  : [];

let statements = [];

statements.push([
  'INSERT INTO runs (id, team_id, board_id, sprint_id, workflow_name, run_type, status, no_message, partial_data, issue_count_detected, issue_count_delivered, started_at, finished_at, duration_ms, summary_json, error_json)',
  'VALUES (',
  sqlText(request.runId) + ',',
  sqlText(request.monitorConfig?.teamId) + ',',
  sqlText(request.monitorConfig?.boardId) + ',',
  sqlText(sprint.sprint_id || sprint.id) + ',',
  sqlText(request.workflowName) + ',',
  sqlText(request.runType) + ',',
  sqlText(asText(deliveryAggregate.status, gate.noMessage ? 'suppressed' : (context.partialData ? 'partial' : 'success'))) + ',',
  gate.noMessage ? 'true' : 'false',
  ',',
  context.partialData ? 'true' : 'false',
  ',',
  sqlNumeric(deliverableIssues.length) + ',',
  sqlNumeric(deliveryAggregate.successCount || 0) + ',',
  sqlText(request.generatedAt) + ',',
  sqlText(new Date().toISOString()) + ',',
  sqlNumeric(0) + ',',
  sqlJson({
    sprintAssessment: gate.judge?.sprint_assessment || {},
    sprintSignals,
    deliverySummary: deliveryPayload.deliverySummary || {},
  }) + ',',
  sqlJson({
    failureReason: context.failureReason || '',
  }),
  ');',
].join(' '));

statements.push([
  'INSERT INTO sprint_snapshots (team_id, board_id, sprint_id, sprint_name, sprint_goal, start_at, end_at, timezone, committed_points, added_scope_points, completed_points, remaining_points, snapshot_at, raw_json)',
  'VALUES (',
  sqlText(request.monitorConfig?.teamId) + ',',
  sqlText(request.monitorConfig?.boardId) + ',',
  sqlText(sprint.sprint_id || sprint.id) + ',',
  sqlText(sprint.sprint_name) + ',',
  sqlText(sprint.sprint_goal) + ',',
  sqlText(sprint.start_at) + ',',
  sqlText(sprint.end_at) + ',',
  sqlText(sprint.timezone || request.monitorConfig?.timezone) + ',',
  sqlNumeric(sprint.committed_points) + ',',
  sqlNumeric(sprint.added_scope_points || 0) + ',',
  sqlNumeric(sprint.completed_points) + ',',
  sqlNumeric(sprint.remaining_points) + ',',
  sqlText(request.generatedAt) + ',',
  sqlJson(sprint),
  ');',
].join(' '));

if (tasks.length > 0) {
  statements.push('INSERT INTO task_snapshots (team_id, sprint_id, task_id, task_key, title, task_type, priority, assignee_id, assignee_name, reviewer_ids, status, status_category, story_points, created_at_source, updated_at_source, done_at_source, epic_id, labels, dependencies, dependents, blocked_by, due_at, snapshot_at, raw_json) VALUES');
  statements.push(tasks.map((task) => [
    '(',
    sqlText(request.monitorConfig?.teamId) + ',',
    sqlText(sprint.sprint_id || sprint.id) + ',',
    sqlText(task.task_id) + ',',
    sqlText(task.key) + ',',
    sqlText(task.title) + ',',
    sqlText(task.type) + ',',
    sqlText(task.priority) + ',',
    sqlText(task.assignee_id) + ',',
    sqlText(task.assignee_name) + ',',
    sqlJson(task.reviewer_ids || []) + ',',
    sqlText(task.status) + ',',
    sqlText(task.status_category) + ',',
    sqlNumeric(task.story_points) + ',',
    sqlText(task.created_at) + ',',
    sqlText(task.updated_at) + ',',
    sqlText(task.done_at) + ',',
    sqlText(task.epic_id) + ',',
    sqlJson(task.labels || []) + ',',
    sqlJson(task.dependencies || []) + ',',
    sqlJson(task.dependents || []) + ',',
    sqlJson(task.blocked_by || []) + ',',
    sqlText(task.due_at) + ',',
    sqlText(request.generatedAt) + ',',
    sqlJson(task),
    ')',
  ].join(' ')).join(',\n') + ';');
}

if (activityExcerpts.length > 0) {
  statements.push('INSERT INTO activity_excerpts (team_id, sprint_id, task_id, event_at, event_type, actor, source, text, ingested_at, raw_json) VALUES');
  statements.push(activityExcerpts.map((item) => [
    '(',
    sqlText(request.monitorConfig?.teamId) + ',',
    sqlText(sprint.sprint_id || sprint.id) + ',',
    sqlText(item.task_id) + ',',
    sqlText(item.at) + ',',
    sqlText(item.event_type) + ',',
    sqlText(item.actor) + ',',
    sqlText(item.source) + ',',
    sqlText(item.text) + ',',
    sqlText(request.generatedAt) + ',',
    sqlJson(item),
    ')',
  ].join(' ')).join(',\n') + ';');
}

statements.push([
  'INSERT INTO signal_snapshots (team_id, sprint_id, signal_scope, signal_type, candidate_score, phase, signal_json, computed_at)',
  'VALUES (',
  sqlText(request.monitorConfig?.teamId) + ',',
  sqlText(sprint.sprint_id || sprint.id) + ',',
  sqlText('sprint') + ',',
  sqlText('sprint_summary') + ',',
  sqlNumeric(0) + ',',
  sqlText(sprint.phase) + ',',
  sqlJson(sprintSignals) + ',',
  sqlText(request.generatedAt),
  ');',
].join(' '));

for (const task of asArray(signals.topCandidateTasks)) {
  statements.push([
    'INSERT INTO signal_snapshots (team_id, sprint_id, task_id, signal_scope, signal_type, candidate_score, phase, signal_json, computed_at)',
    'VALUES (',
    sqlText(request.monitorConfig?.teamId) + ',',
    sqlText(sprint.sprint_id || sprint.id) + ',',
    sqlText(task.task_id) + ',',
    sqlText('task') + ',',
    sqlText(task.risk_type_seed || 'candidate') + ',',
    sqlNumeric(task.candidate_score) + ',',
    sqlText(sprint.phase) + ',',
    sqlJson(task) + ',',
    sqlText(request.generatedAt),
    ');',
  ].join(' '));
}

if (deliverableIssues.length > 0) {
  statements.push('INSERT INTO issues (issue_key, team_id, sprint_id, entity_type, entity_id, risk_type, severity, state, confidence, decision_owner_type, execution_owner_type, recommended_action, why_now, evidence, first_detected_at, last_seen_at, last_alerted_at, source_run_id, metadata_json) VALUES');
  statements.push(deliverableIssues.map((issue) => [
    '(',
    sqlText(issue.issue_key) + ',',
    sqlText(request.monitorConfig?.teamId) + ',',
    sqlText(sprint.sprint_id || sprint.id) + ',',
    sqlText(issue.entity_type) + ',',
    sqlText(issue.entity_id) + ',',
    sqlText(issue.risk_type) + ',',
    sqlText(issue.severity) + ',',
    sqlText(deliveries.length > 0 ? 'escalated' : 'monitoring') + ',',
    sqlNumeric(issue.confidence) + ',',
    sqlText(issue.decision_owner_type) + ',',
    sqlText(issue.execution_owner_type) + ',',
    sqlText(issue.recommended_action) + ',',
    sqlText(issue.why_now) + ',',
    sqlJson(issue.evidence || []) + ',',
    sqlText(request.generatedAt) + ',',
    sqlText(request.generatedAt) + ',',
    sqlText(deliveries.length > 0 ? request.generatedAt : null) + ',',
    sqlText(request.runId) + ',',
    sqlJson(issue),
    ')',
  ].join(' ')).join(',\n'));
  statements.push([
    'ON CONFLICT (issue_key) DO UPDATE SET',
    'severity = EXCLUDED.severity,',
    'state = EXCLUDED.state,',
    'confidence = EXCLUDED.confidence,',
    'decision_owner_type = EXCLUDED.decision_owner_type,',
    'execution_owner_type = EXCLUDED.execution_owner_type,',
    'recommended_action = EXCLUDED.recommended_action,',
    'why_now = EXCLUDED.why_now,',
    'evidence = EXCLUDED.evidence,',
    'last_seen_at = EXCLUDED.last_seen_at,',
    'last_alerted_at = EXCLUDED.last_alerted_at,',
    'source_run_id = EXCLUDED.source_run_id,',
    'metadata_json = EXCLUDED.metadata_json;',
  ].join(' '));
}

for (let index = 0; index < deliveries.length; index += 1) {
  const delivery = deliveries[index];
  const response = responses[index] || {};
  statements.push([
    'INSERT INTO interventions (run_id, issue_key, delivery_channel, destination, action_type, message_text, delivered_at, delivery_status, metadata_json) VALUES (',
    sqlText(request.runId) + ',',
    sqlText((delivery.issueKeys || [])[0] || '') + ',',
    sqlText(delivery.destinationType || 'google_chat_unified') + ',',
    sqlText(delivery.destination) + ',',
    sqlText(delivery.messageType) + ',',
    sqlText(delivery.auditText || delivery.payload?.text || '') + ',',
    sqlText(Number(response.statusCode || 0) < 400 ? request.generatedAt : null) + ',',
    sqlText(Number(response.statusCode || 0) < 400 ? 'sent' : 'failed') + ',',
    sqlJson(response),
    ');',
  ].join(' '));

  statements.push([
    'INSERT INTO message_deliveries (run_id, message_type, destination, payload_json, response_code, response_body, status, sent_at) VALUES (',
    sqlText(request.runId) + ',',
    sqlText(delivery.messageType) + ',',
    sqlText(delivery.destination) + ',',
    sqlJson(delivery.payload) + ',',
    sqlNumeric(response.statusCode) + ',',
    sqlText(JSON.stringify(response.body || response)) + ',',
    sqlText(Number(response.statusCode || 0) < 400 ? 'sent' : 'failed') + ',',
    sqlText(request.generatedAt),
    ');',
  ].join(' '));
}

for (const note of retroNotes) {
  statements.push([
    'INSERT INTO retro_notes (team_id, sprint_id, note_type, severity, content, source_issue_key, source_run_id, created_at) VALUES (',
    sqlText(request.monitorConfig?.teamId) + ',',
    sqlText(sprint.sprint_id || sprint.id) + ',',
    sqlText(note.note_type) + ',',
    sqlText(note.severity) + ',',
    sqlText(note.content) + ',',
    sqlText(note.source_issue_key) + ',',
    sqlText(request.runId) + ',',
    sqlText(request.generatedAt),
    ');',
  ].join(' '));
}

return [{
  json: {
    persistQuery: statements.join('\n'),
    persistSummary: {
      taskSnapshots: tasks.length,
      activityExcerpts: activityExcerpts.length,
      issueUpserts: deliverableIssues.length,
      deliveryRows: deliveries.length,
      retroNotes: retroNotes.length,
    },
  },
}];`;

const buildNoActiveSprintPersistQueryCode = String.raw`const request = $('Normalize Request').first().json || {};
const noSprint = $('Build No Active Sprint Summary').first().json || {};

function sqlText(value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function sqlJson(value) {
  return "'" + JSON.stringify(value ?? {}).replace(/'/g, "''") + "'::jsonb";
}

return [{
  json: {
    persistQuery: [
      'INSERT INTO runs (id, team_id, board_id, workflow_name, run_type, status, no_message, partial_data, issue_count_detected, issue_count_delivered, started_at, finished_at, duration_ms, summary_json, error_json)',
      'VALUES (',
      sqlText(request.runId) + ',',
      sqlText(request.monitorConfig?.teamId) + ',',
      sqlText(request.monitorConfig?.boardId) + ',',
      sqlText(request.workflowName) + ',',
      sqlText(request.runType) + ',',
      sqlText('skipped') + ',',
      'true,',
      'false,',
      '0,',
      '0,',
      sqlText(request.generatedAt) + ',',
      sqlText(new Date().toISOString()) + ',',
      '0,',
      sqlJson(noSprint.summaryJson || {}) + ',',
      sqlJson({ failureReason: noSprint.failureReason || '' }),
      ');',
    ].join(' '),
  },
}];`;

const buildNoActiveSprintSummaryCode = String.raw`const request = $('Normalize Request').first().json || {};
const activeSprint = $('Pick Active Sprint').first().json || {};

return [{
  json: {
    runId: request.runId,
    status: 'skipped',
    noMessage: true,
    failureReason: activeSprint.failureReason || 'No active sprint',
    summaryJson: {
      workflowName: request.workflowName,
      runType: request.runType,
      triggerSource: request.triggerSource,
      reason: activeSprint.failureReason || 'No active sprint',
    },
  },
}];`;

const buildEngineResultCode = String.raw`const request = $('Normalize Request').first().json || {};
const gate = $('Delivery Gate').first().json || {};
const deliveryPayload = $('Build Delivery Messages').first().json || {};
const persistPayload = $('Build Persist Query').first().json || {};
const deliveryAggregate = (() => {
  try {
    return $('Aggregate Deliveries').first().json || {};
  } catch (error) {
    return {};
  }
})();

const status = gate.noMessage
  ? 'success'
  : (deliveryAggregate.status === 'failed' ? 'partial' : (deliveryAggregate.status || (gate.summaryJson?.partialData ? 'partial' : 'success')));

return [{
  json: {
    runId: request.runId,
    status,
    noMessage: Boolean(gate.noMessage),
    summaryJson: {
      ...(gate.summaryJson || {}),
      suppressionSummary: gate.suppressionSummary || {},
    },
    deliverySummary: {
      ...(deliveryPayload.deliverySummary || {}),
      deliveryStatus: deliveryAggregate.status || 'skipped',
      successCount: Number(deliveryAggregate.successCount || 0),
      failureCount: Number(deliveryAggregate.failureCount || 0),
    },
    persistSummary: persistPayload.persistSummary || {},
  },
}];`;

function buildEngineWorkflow() {
  const nodes = [
    node({
      id: '1',
      name: 'When Executed by Another Workflow',
      type: 'n8n-nodes-base.executeWorkflowTrigger',
      typeVersion: 1.1,
      position: [-2352, 352],
      parameters: {
        inputSource: 'workflowInputs',
        workflowInputs: {
          values: [
            { name: 'runType', type: 'string' },
            { name: 'workflowName', type: 'string' },
            { name: 'triggerSource', type: 'string' },
            { name: 'monitorConfig', type: 'object' },
          ],
        },
      },
    }),
    node({
      id: '2',
      name: 'Normalize Request',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [-2128, 352],
      parameters: {
        mode: 'runOnceForEachItem',
        jsCode: normalizeRequestCode,
      },
    }),
    node({
      id: '3',
      name: 'Get Active Sprint',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.3,
      position: [-1904, 352],
      parameters: {
        url: '={{ $json.monitorConfig.jiraBaseUrl + "/rest/agile/1.0/board/" + encodeURIComponent(String($json.monitorConfig.boardId)) + "/sprint" }}',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'jiraSoftwareServerPatApi',
        sendQuery: true,
        specifyQuery: 'json',
        jsonQuery: '={{ JSON.stringify({ state: "active", maxResults: 50 }) }}',
        options: {
          response: {
            response: {
              fullResponse: true,
              neverError: true,
              responseFormat: 'json',
            },
          },
        },
      },
      continueOnFail: true,
    }),
    node({
      id: '4',
      name: 'Pick Active Sprint',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [-1680, 352],
      parameters: {
        mode: 'runOnceForEachItem',
        jsCode: pickActiveSprintCode,
      },
    }),
    node({
      id: '5',
      name: 'If Active Sprint?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.3,
      position: [-1456, 352],
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: '',
            typeValidation: 'strict',
            version: 3,
          },
          conditions: [
            {
              id: 'has-active-sprint',
              leftValue: '={{ $json.hasActiveSprint }}',
              rightValue: true,
              operator: {
                type: 'boolean',
                operation: 'equals',
              },
            },
          ],
          combinator: 'and',
        },
        options: {},
      },
    }),
    node({
      id: '6',
      name: 'Build No Active Sprint Summary',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [-1232, 576],
      parameters: {
        mode: 'runOnceForEachItem',
        jsCode: buildNoActiveSprintSummaryCode,
      },
    }),
    node({
      id: '7',
      name: 'Build No Active Sprint Persist Query',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [-1008, 576],
      parameters: {
        mode: 'runOnceForEachItem',
        jsCode: buildNoActiveSprintPersistQueryCode,
      },
    }),
    node({
      id: '8',
      name: 'Persist No Active Sprint',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.6,
      position: [-784, 576],
      parameters: {
        resource: 'database',
        operation: 'executeQuery',
        query: '={{ $json.persistQuery }}',
        options: {
          queryBatching: 'single',
        },
      },
      continueOnFail: true,
    }),
    node({
      id: '9',
      name: 'Build No Active Sprint Result',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [-560, 576],
      parameters: {
        mode: 'runOnceForEachItem',
        jsCode: String.raw`const summary = $('Build No Active Sprint Summary').first().json || {};
return [{ json: {
  runId: summary.runId,
  status: summary.status,
  noMessage: summary.noMessage,
  summaryJson: summary.summaryJson || {},
  deliverySummary: { requestedCount: 0, deliveryStatus: 'skipped', successCount: 0, failureCount: 0 },
  persistSummary: { issueUpserts: 0, deliveryRows: 0 },
} }];`,
      },
    }),
    node({
      id: '10',
      name: 'Get Sprint Issues',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.3,
      position: [-1232, 208],
      parameters: {
        url: '={{ $("Normalize Request").first().json.monitorConfig.jiraBaseUrl + "/rest/agile/1.0/sprint/" + encodeURIComponent(String($("Pick Active Sprint").first().json.sprint?.id || "")) + "/issue" }}',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'jiraSoftwareServerPatApi',
        sendQuery: true,
        specifyQuery: 'json',
        jsonQuery: '={{ JSON.stringify({ startAt: 0, maxResults: 500, fields: "*all", expand: "changelog" }) }}',
        options: {
          response: {
            response: {
              fullResponse: true,
              neverError: true,
              responseFormat: 'json',
            },
          },
        },
      },
      continueOnFail: true,
    }),
    node({
      id: '11',
      name: 'Build GitLab Project Items',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [-1008, 208],
      parameters: {
        mode: 'runOnceForEachItem',
        jsCode: buildGitLabProjectItemsCode,
      },
    }),
    node({
      id: '12',
      name: 'If Should Fetch GitLab?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.3,
      position: [-784, 208],
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: '',
            typeValidation: 'strict',
            version: 3,
          },
          conditions: [
            {
              id: 'should-fetch-gitlab',
              leftValue: '={{ !$json.skipGitLab }}',
              rightValue: true,
              operator: {
                type: 'boolean',
                operation: 'equals',
              },
            },
          ],
          combinator: 'and',
        },
        options: {},
      },
    }),
    node({
      id: '13',
      name: 'Get GitLab Merge Requests',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.3,
      position: [-560, 128],
      parameters: {
        method: 'GET',
        url: '={{ $json.requestUrl }}',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'gitlabApi',
        sendQuery: true,
        specifyQuery: 'json',
        jsonQuery: '={{ JSON.stringify({ state: "all", scope: "all", per_page: 100, order_by: "updated_at", sort: "desc" }) }}',
        options: {
          response: {
            response: {
              fullResponse: true,
              neverError: true,
              responseFormat: 'json',
            },
          },
        },
      },
      continueOnFail: true,
    }),
    node({
      id: '14',
      name: 'Build Empty GitLab Signals',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [-560, 288],
      parameters: {
        mode: 'runOnceForEachItem',
        jsCode: buildEmptyGitLabSignalsCode,
      },
    }),
    node({
      id: '15',
      name: 'Aggregate GitLab Signals',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [-336, 208],
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: aggregateGitLabSignalsCode,
      },
    }),
    node({
      id: '16',
      name: 'Normalize Sprint Context',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [-112, 208],
      parameters: {
        mode: 'runOnceForEachItem',
        jsCode: normalizeSprintContextCode,
      },
    }),
    node({
      id: '17',
      name: 'Build Comment Classifier Inputs',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [112, 208],
      parameters: {
        mode: 'runOnceForEachItem',
        jsCode: buildClassifierPromptCode,
      },
    }),
    node({
      id: '18',
      name: 'Comment Classifier AI Agent',
      type: '@n8n/n8n-nodes-langchain.agent',
      typeVersion: 3.1,
      position: [336, 208],
      parameters: {
        promptType: 'define',
        text: '={{ $json.classifierPrompt }}',
        hasOutputParser: true,
        needsFallback: true,
        options: {
          systemMessage: '={{ $json.classifierSystemPrompt }}',
        },
      },
      retryOnFail: true,
      waitBetweenTries: 2000,
      continueOnFail: true,
    }),
    node({
      id: '19',
      name: 'Structured Comment Classifier Output Parser',
      type: '@n8n/n8n-nodes-langchain.outputParserStructured',
      typeVersion: 1.3,
      position: [336, 368],
      parameters: {
        jsonSchemaExample: STRUCTURED_COMMENT_RESULTS_SCHEMA,
      },
    }),
    node({
      id: '20',
      name: 'Comment Classifier Model',
      type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
      typeVersion: 1.3,
      position: [112, 368],
      parameters: {
        model: {
          __rl: true,
          value: 'cx/gpt-5.4',
          mode: 'list',
          cachedResultName: 'cx/gpt-5.4',
        },
        responsesApiEnabled: false,
        options: {
          responseFormat: 'json_object',
        },
      },
    }),
    node({
      id: '21',
      name: 'Compute Signals',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [560, 208],
      parameters: {
        mode: 'runOnceForEachItem',
        jsCode: computeSignalsCode,
      },
    }),
    node({
      id: '22',
      name: 'Build Prior State Query',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [784, 208],
      parameters: {
        mode: 'runOnceForEachItem',
        jsCode: buildPriorStateQueryCode,
      },
    }),
    node({
      id: '23',
      name: 'Load Prior State',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.6,
      position: [1008, 208],
      parameters: {
        resource: 'database',
        operation: 'executeQuery',
        query: '={{ $json.priorStateQuery }}',
        options: {
          queryBatching: 'single',
        },
      },
      continueOnFail: true,
    }),
    node({
      id: '24',
      name: 'Build Judge Inputs',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1232, 208],
      parameters: {
        mode: 'runOnceForEachItem',
        jsCode: buildJudgeInputsCode,
      },
    }),
    node({
      id: '25',
      name: 'Sprint Judge AI Agent',
      type: '@n8n/n8n-nodes-langchain.agent',
      typeVersion: 3.1,
      position: [1456, 208],
      parameters: {
        promptType: 'define',
        text: '={{ $json.judgePrompt }}',
        hasOutputParser: true,
        needsFallback: true,
        options: {
          systemMessage: '={{ $json.judgeSystemPrompt }}',
        },
      },
      retryOnFail: true,
      waitBetweenTries: 2000,
      continueOnFail: true,
    }),
    node({
      id: '26',
      name: 'Structured Sprint Judgment Output Parser',
      type: '@n8n/n8n-nodes-langchain.outputParserStructured',
      typeVersion: 1.3,
      position: [1456, 368],
      parameters: {
        jsonSchemaExample: SPRINT_JUDGMENT_SCHEMA,
      },
    }),
    node({
      id: '27',
      name: 'Sprint Judge Model',
      type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
      typeVersion: 1.3,
      position: [1232, 368],
      parameters: {
        model: {
          __rl: true,
          value: 'cx/gpt-5.4',
          mode: 'list',
          cachedResultName: 'cx/gpt-5.4',
        },
        responsesApiEnabled: false,
        options: {
          responseFormat: 'json_object',
        },
      },
    }),
    node({
      id: '28',
      name: 'Delivery Gate',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1680, 208],
      parameters: {
        mode: 'runOnceForEachItem',
        jsCode: deliveryGateCode,
      },
    }),
    node({
      id: '29',
      name: 'If Need Draft?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.3,
      position: [1904, 208],
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: '',
            typeValidation: 'strict',
            version: 3,
          },
          conditions: [
            {
              id: 'if-need-draft',
              leftValue: '={{ $json.shouldDraftMessages }}',
              rightValue: true,
              operator: {
                type: 'boolean',
                operation: 'equals',
              },
            },
          ],
          combinator: 'and',
        },
        options: {},
      },
    }),
    node({
      id: '30',
      name: 'Build Draft Inputs',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2128, 128],
      parameters: {
        mode: 'runOnceForEachItem',
        jsCode: buildDraftInputsCode,
      },
    }),
    node({
      id: '31',
      name: 'Message Drafter AI Agent',
      type: '@n8n/n8n-nodes-langchain.agent',
      typeVersion: 3.1,
      position: [2352, 128],
      parameters: {
        promptType: 'define',
        text: '={{ $json.draftPrompt }}',
        hasOutputParser: true,
        needsFallback: true,
        options: {
          systemMessage: '={{ $json.draftSystemPrompt }}',
        },
      },
      retryOnFail: true,
      waitBetweenTries: 2000,
      continueOnFail: true,
    }),
    node({
      id: '32',
      name: 'Structured Message Draft Output Parser',
      type: '@n8n/n8n-nodes-langchain.outputParserStructured',
      typeVersion: 1.3,
      position: [2352, 288],
      parameters: {
        jsonSchemaExample: MESSAGE_DRAFTER_SCHEMA,
      },
    }),
    node({
      id: '33',
      name: 'Message Drafter Model',
      type: '@n8n/n8n-nodes-langchain.lmChatOpenAi',
      typeVersion: 1.3,
      position: [2128, 288],
      parameters: {
        model: {
          __rl: true,
          value: 'cx/gpt-5.4',
          mode: 'list',
          cachedResultName: 'cx/gpt-5.4',
        },
        responsesApiEnabled: false,
        options: {
          responseFormat: 'json_object',
        },
      },
    }),
    node({
      id: '42',
      name: 'Get Members',
      type: 'n8n-nodes-base.googleSheets',
      typeVersion: 4.7,
      position: [2576, 128],
      parameters: {
        documentId: {
          __rl: true,
          value: SHARED_MEMBER_SHEET_URL,
          mode: 'url',
        },
        sheetName: {
          __rl: true,
          value: SHARED_MEMBER_SHEET_NAME,
          mode: 'name',
        },
        filtersUI: {
          values: [],
        },
        options: {},
      },
      continueOnFail: true,
    }),
    node({
      id: '43',
      name: 'Build Render Model',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2800, 208],
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: buildRenderModelCode,
      },
    }),
    node({
      id: '34',
      name: 'Build Delivery Messages',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [3024, 208],
      parameters: {
        mode: 'runOnceForEachItem',
        jsCode: buildDeliveryMessagesCode,
      },
    }),
    node({
      id: '35',
      name: 'If Has Deliveries?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.3,
      position: [3248, 208],
      parameters: {
        conditions: {
          options: {
            caseSensitive: true,
            leftValue: '',
            typeValidation: 'strict',
            version: 3,
          },
          conditions: [
            {
              id: 'has-deliveries',
              leftValue: '={{ $json.deliveryCount > 0 }}',
              rightValue: true,
              operator: {
                type: 'boolean',
                operation: 'equals',
              },
            },
          ],
          combinator: 'and',
        },
        options: {},
      },
    }),
    node({
      id: '36',
      name: 'Expand Delivery Items',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [3472, 128],
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: expandDeliveryItemsCode,
      },
    }),
    node({
      id: '37',
      name: 'Send Google Chat Message',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.3,
      position: [3696, 128],
      parameters: {
        method: 'POST',
        url: '={{ $json.requestUrl }}',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ $json.requestBody }}',
        options: {
          response: {
            response: {
              fullResponse: true,
              neverError: true,
              responseFormat: 'json',
            },
          },
        },
      },
      continueOnFail: true,
    }),
    node({
      id: '38',
      name: 'Aggregate Deliveries',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [3920, 128],
      parameters: {
        mode: 'runOnceForAllItems',
        jsCode: aggregateDeliveriesCode,
      },
    }),
    node({
      id: '39',
      name: 'Build Persist Query',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [4144, 208],
      parameters: {
        mode: 'runOnceForEachItem',
        jsCode: buildPersistQueryCode,
      },
    }),
    node({
      id: '40',
      name: 'Persist Run State',
      type: 'n8n-nodes-base.postgres',
      typeVersion: 2.6,
      position: [4368, 208],
      parameters: {
        resource: 'database',
        operation: 'executeQuery',
        query: '={{ $json.persistQuery }}',
        options: {
          queryBatching: 'single',
        },
      },
      continueOnFail: true,
    }),
    node({
      id: '41',
      name: 'Build Engine Result',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [4592, 208],
      parameters: {
        mode: 'runOnceForEachItem',
        jsCode: buildEngineResultCode,
      },
    }),
  ];

  const runOnceForAllItemsCodeNodes = new Set([
    'Build No Active Sprint Summary',
    'Build No Active Sprint Persist Query',
    'Build No Active Sprint Result',
    'Build GitLab Project Items',
    'Build Empty GitLab Signals',
    'Normalize Sprint Context',
    'Build Comment Classifier Inputs',
    'Compute Signals',
    'Build Prior State Query',
    'Build Judge Inputs',
    'Delivery Gate',
    'Build Draft Inputs',
    'Build Render Model',
    'Build Delivery Messages',
    'Build Persist Query',
    'Build Engine Result',
  ]);

  for (const workflowNode of nodes) {
    if (
      workflowNode.type === 'n8n-nodes-base.code' &&
      runOnceForAllItemsCodeNodes.has(workflowNode.name)
    ) {
      workflowNode.parameters.mode = 'runOnceForAllItems';
    }
  }

  const connections = buildConnections([
    mainConnection('When Executed by Another Workflow', 'Normalize Request'),
    mainConnection('Normalize Request', 'Get Active Sprint'),
    mainConnection('Get Active Sprint', 'Pick Active Sprint'),
    mainConnection('Pick Active Sprint', 'If Active Sprint?'),
    mainConnection('If Active Sprint?', 'Get Sprint Issues', 0),
    mainConnection('If Active Sprint?', 'Build No Active Sprint Summary', 1),
    mainConnection('Build No Active Sprint Summary', 'Build No Active Sprint Persist Query'),
    mainConnection('Build No Active Sprint Persist Query', 'Persist No Active Sprint'),
    mainConnection('Persist No Active Sprint', 'Build No Active Sprint Result'),
    mainConnection('Get Sprint Issues', 'Build GitLab Project Items'),
    mainConnection('Build GitLab Project Items', 'If Should Fetch GitLab?'),
    mainConnection('If Should Fetch GitLab?', 'Get GitLab Merge Requests', 0),
    mainConnection('If Should Fetch GitLab?', 'Build Empty GitLab Signals', 1),
    mainConnection('Get GitLab Merge Requests', 'Aggregate GitLab Signals'),
    mainConnection('Build Empty GitLab Signals', 'Aggregate GitLab Signals'),
    mainConnection('Aggregate GitLab Signals', 'Normalize Sprint Context'),
    mainConnection('Normalize Sprint Context', 'Build Comment Classifier Inputs'),
    mainConnection('Build Comment Classifier Inputs', 'Comment Classifier AI Agent'),
    mainConnection('Comment Classifier AI Agent', 'Compute Signals'),
    aiConnection('Structured Comment Classifier Output Parser', 'Comment Classifier AI Agent', 'ai_outputParser'),
    aiConnection('Comment Classifier Model', 'Comment Classifier AI Agent', 'ai_languageModel'),
    mainConnection('Compute Signals', 'Build Prior State Query'),
    mainConnection('Build Prior State Query', 'Load Prior State'),
    mainConnection('Load Prior State', 'Build Judge Inputs'),
    mainConnection('Build Judge Inputs', 'Sprint Judge AI Agent'),
    mainConnection('Sprint Judge AI Agent', 'Delivery Gate'),
    aiConnection('Structured Sprint Judgment Output Parser', 'Sprint Judge AI Agent', 'ai_outputParser'),
    aiConnection('Sprint Judge Model', 'Sprint Judge AI Agent', 'ai_languageModel'),
    mainConnection('Delivery Gate', 'If Need Draft?'),
    mainConnection('If Need Draft?', 'Build Draft Inputs', 0),
    mainConnection('If Need Draft?', 'Get Members', 1),
    mainConnection('Build Draft Inputs', 'Message Drafter AI Agent'),
    mainConnection('Message Drafter AI Agent', 'Get Members'),
    aiConnection('Structured Message Draft Output Parser', 'Message Drafter AI Agent', 'ai_outputParser'),
    aiConnection('Message Drafter Model', 'Message Drafter AI Agent', 'ai_languageModel'),
    mainConnection('Get Members', 'Build Render Model'),
    mainConnection('Build Render Model', 'Build Delivery Messages'),
    mainConnection('Build Delivery Messages', 'If Has Deliveries?'),
    mainConnection('If Has Deliveries?', 'Expand Delivery Items', 0),
    mainConnection('If Has Deliveries?', 'Build Persist Query', 1),
    mainConnection('Expand Delivery Items', 'Send Google Chat Message'),
    mainConnection('Send Google Chat Message', 'Aggregate Deliveries'),
    mainConnection('Aggregate Deliveries', 'Build Persist Query'),
    mainConnection('Build Persist Query', 'Persist Run State'),
    mainConnection('Persist Run State', 'Build Engine Result'),
  ]);

  return {
    name: 'Sprint Monitor Engine',
    nodes,
    connections,
    settings: SETTINGS,
  };
}

function run() {
  ensureDir(workflowsDir);

  writeJson(
    'workflows/sprint-monitor/sprint-monitor-light-scan.workflow.json',
    buildTopLevelWorkflow({
      name: 'Sprint Monitor Light Scan',
      runType: 'light_scan',
      cronExpression: '0 9 * * 1-5',
    }),
  );

  writeJson(
    'workflows/sprint-monitor/sprint-monitor-deep-analysis.workflow.json',
    buildTopLevelWorkflow({
      name: 'Sprint Monitor Deep Analysis',
      runType: 'deep_analysis',
      cronExpression: '0 14 * * 2,4',
    }),
  );

  writeJson(
    'workflows/sprint-monitor/sprint-monitor-endgame.workflow.json',
    buildTopLevelWorkflow({
      name: 'Sprint Monitor Endgame',
      runType: 'endgame',
      cronExpression: '0 16 * * *',
    }),
  );

  writeJson(
    'workflows/sprint-monitor/sprint-monitor-engine.workflow.json',
    buildEngineWorkflow(),
  );

  console.log('Generated Sprint Monitor workflows in', workflowsDir);
}

run();
