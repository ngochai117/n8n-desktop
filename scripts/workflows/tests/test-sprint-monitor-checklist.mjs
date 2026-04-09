#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../..',
);
const strictMode =
  process.argv.includes('--strict') ||
  process.env.SPRINT_MONITOR_CHECKLIST_STRICT === '1';

const filesToCheck = [
  'scripts/sprint-monitor/generate-workflows.mjs',
  'scripts/bootstrap/apply-sprint-monitor-schema.sh',
  'scripts/workflows/import/import-sprint-monitor-light-scan-workflow.sh',
  'scripts/workflows/import/import-sprint-monitor-deep-analysis-workflow.sh',
  'scripts/workflows/import/import-sprint-monitor-endgame-workflow.sh',
  'scripts/workflows/import/import-sprint-monitor-engine-workflow.sh',
  'scripts/workflows/tests/test-sprint-monitor-checklist.sh',
  'scripts/workflows/tests/test-sprint-monitor-checklist.mjs',
  'README.md',
  'scripts/README.md',
  'CHANGELOG.md',
  'workflow-registry.json',
];

const sprintMonitorDocFiles = [
  'docs/sprint-monitor/README.md',
  'docs/sprint-monitor/FLOW.md',
  'docs/sprint-monitor/SPEC.md',
  'docs/sprint-monitor/ARCHITECTURE.md',
  'docs/sprint-monitor/PROMPTS.md',
  'docs/sprint-monitor/WORKFLOWS.md',
  'docs/sprint-monitor/RENDERING-SPEC.md',
  'docs/sprint-monitor/MENTION-RULES.md',
  'docs/sprint-monitor/schema.sql',
  'docs/sprint-monitor/monitor-configs.sql',
];

const staleDocPatterns = [
  'pm_digest',
  'lead_alert',
  'owner_nudge',
  'gchat_pm_webhook',
  'gchat_lead_webhook',
  'max_owner_nudges_per_run',
  'max_lead_alerts_per_run',
  'PM digest',
  'lead alert',
  'owner nudges',
  'lead alerts',
  'PM room',
  'Lead room',
];

const expectedWorkflows = [
  {
    name: 'Sprint Monitor Light Scan',
    template: 'workflows/sprint-monitor/sprint-monitor-light-scan.workflow.json',
    templateImport: 'scripts/workflows/import/import-sprint-monitor-light-scan-workflow.sh',
  },
  {
    name: 'Sprint Monitor Deep Analysis',
    template: 'workflows/sprint-monitor/sprint-monitor-deep-analysis.workflow.json',
    templateImport: 'scripts/workflows/import/import-sprint-monitor-deep-analysis-workflow.sh',
  },
  {
    name: 'Sprint Monitor Endgame',
    template: 'workflows/sprint-monitor/sprint-monitor-endgame.workflow.json',
    templateImport: 'scripts/workflows/import/import-sprint-monitor-endgame-workflow.sh',
  },
  {
    name: 'Sprint Monitor Engine',
    template: 'workflows/sprint-monitor/sprint-monitor-engine.workflow.json',
    templateImport: 'scripts/workflows/import/import-sprint-monitor-engine-workflow.sh',
  },
];

const expectedWorkflowNames = expectedWorkflows.map((item) => item.name);
const expectedWrapperNames = expectedWorkflows.map((item) => path.basename(item.templateImport));
const failures = [];
const warnings = [];
const passes = [];

function check(condition, message) {
  if (condition) {
    passes.push(message);
    return;
  }
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

for (const relativePath of filesToCheck) {
  check(fileExists(relativePath), `support file exists: ${relativePath}`);
}

for (const relativePath of sprintMonitorDocFiles) {
  check(fileExists(relativePath), `Sprint Monitor doc exists: ${relativePath}`);
}

const registry = fileExists('workflow-registry.json') ? readJson('workflow-registry.json') : { workflows: {} };

for (const workflowDef of expectedWorkflows) {
  const entry = registry.workflows?.[workflowDef.name] || null;
  check(Boolean(entry), `registry entry exists: ${workflowDef.name}`);
  if (!entry) continue;

  check(entry.template === workflowDef.template, `${workflowDef.name} registry template matches`);
  check(
    entry.templateImport === workflowDef.templateImport,
    `${workflowDef.name} registry templateImport matches`,
  );
  check(typeof entry.id === 'string', `${workflowDef.name} registry id is a string`);
}

const importAllContent = fileExists('scripts/workflows/import/import-all-workflows.sh')
  ? readText('scripts/workflows/import/import-all-workflows.sh')
  : '';

for (const wrapperName of expectedWrapperNames) {
  check(
    importAllContent.includes(wrapperName),
    `import-all-workflows.sh references ${wrapperName}`,
  );
}

const readmeContent = fileExists('README.md') ? readText('README.md') : '';
const scriptsReadmeContent = fileExists('scripts/README.md') ? readText('scripts/README.md') : '';
const changelogContent = fileExists('CHANGELOG.md') ? readText('CHANGELOG.md') : '';
const sprintReadmeContent = fileExists('docs/sprint-monitor/README.md')
  ? readText('docs/sprint-monitor/README.md')
  : '';
const sprintDocContents = sprintMonitorDocFiles
  .filter((relativePath) => fileExists(relativePath))
  .map((relativePath) => ({
    relativePath,
    content: readText(relativePath),
  }));

check(readmeContent.includes('Sprint Monitor'), 'README.md mentions Sprint Monitor');
check(
  scriptsReadmeContent.includes('Sprint Monitor'),
  'scripts/README.md mentions Sprint Monitor',
);
check(changelogContent.includes('Sprint Monitor'), 'CHANGELOG.md mentions Sprint Monitor');
check(
  readmeContent.includes('apply-sprint-monitor-schema.sh'),
  'README.md documents Sprint Monitor schema apply script',
);
check(
  scriptsReadmeContent.includes('test-sprint-monitor-checklist.sh'),
  'scripts/README.md documents Sprint Monitor checklist script',
);
check(
  readmeContent.includes('generate-workflows.mjs'),
  'README.md documents Sprint Monitor workflow generator',
);
check(
  scriptsReadmeContent.includes('generate-workflows.mjs'),
  'scripts/README.md documents Sprint Monitor workflow generator',
);
check(
  sprintReadmeContent.includes('unified digest'),
  'docs/sprint-monitor/README.md documents the unified digest model',
);

for (const { relativePath, content } of sprintDocContents) {
  for (const pattern of staleDocPatterns) {
    check(
      !content.includes(pattern),
      `${relativePath} no longer references stale Sprint Monitor channel text: ${pattern}`,
    );
  }
}

const requiredDocPatterns = [
  ['docs/sprint-monitor/PROMPTS.md', ['send_unified_digest', 'unified_digest_text']],
  ['docs/sprint-monitor/RENDERING-SPEC.md', ['unified digest thread', 'cardsV2', 'mentions_needed', '[A-Z][A-Z0-9]+-\\\\d+', 'apply trên text output trước khi gửi Google Chat']],
  ['docs/sprint-monitor/ARCHITECTURE.md', ['unified digest thread', 'unified_digest_text']],
  ['docs/sprint-monitor/WORKFLOWS.md', ['gchat_unified_webhook', 'unified digest']],
  ['docs/sprint-monitor/FLOW.md', ['unified digest']],
  ['docs/sprint-monitor/README.md', ['gchat_unified_webhook', 'unified digest']],
  ['docs/sprint-monitor/schema.sql', ['gchat_unified_webhook', 'unified_digest_card', 'unified_digest_text']],
  ['docs/sprint-monitor/monitor-configs.sql', ['gchat_unified_webhook']],
  ['docs/sprint-monitor/MENTION-RULES.md', ['mentions_needed']],
  ['docs/sprint-monitor/SPEC.md', ['unified digest']],
];

for (const [relativePath, patterns] of requiredDocPatterns) {
  if (!fileExists(relativePath)) continue;
  const content = readText(relativePath);
  for (const pattern of patterns) {
    check(
      content.includes(pattern),
      `${relativePath} includes unified digest artifact: ${pattern}`,
    );
  }
}

for (const moMoWorkflowPath of [
  'workflows/ui-synced/MoMo/momo-ai-assistant.workflow.json',
  'workflows/ui-synced/MoMo/momo-ai-assistant-tool-sprint-healthcheck.workflow.json',
]) {
  if (!fileExists(moMoWorkflowPath)) {
    warn(`missing MoMo workflow template: ${moMoWorkflowPath}`);
    continue;
  }

  const content = readText(moMoWorkflowPath);
  check(
    !content.includes('Sprint Monitor'),
    `${path.basename(moMoWorkflowPath)} stays free of Sprint Monitor references`,
  );
}

const templatePaths = expectedWorkflows.map((item) => item.template);
const existingTemplates = templatePaths.filter((templatePath) => fileExists(templatePath));
const missingTemplates = templatePaths.filter((templatePath) => !fileExists(templatePath));

function nodeByName(workflow, name) {
  return (workflow.nodes || []).find((node) => node.name === name) || null;
}

function hasMainConnection(workflow, from, to) {
  const entries = (workflow.connections?.[from]?.main || []).flat();
  return entries.some((entry) => entry?.node === to);
}

function hasMainConnectionFromOutput(workflow, from, outputIndex, to) {
  const branch = workflow.connections?.[from]?.main?.[outputIndex] || [];
  return branch.some((entry) => entry?.node === to);
}

function hasAiConnection(workflow, from, type, to) {
  const entries = (workflow.connections?.[from]?.[type] || []).flat();
  return entries.some((entry) => entry?.node === to);
}

if (existingTemplates.length > 0) {
  for (const templatePath of existingTemplates) {
    const workflow = readJson(templatePath);
    check(
      expectedWorkflowNames.includes(workflow.name),
      `workflow template has expected name: ${templatePath}`,
    );
    check(
      workflow.settings && typeof workflow.settings === 'object',
      `workflow template has settings object: ${templatePath}`,
    );
  }
}

const topLevelExpectations = [
  {
    path: 'workflows/sprint-monitor/sprint-monitor-light-scan.workflow.json',
    name: 'Sprint Monitor Light Scan',
    runType: 'light_scan',
  },
  {
    path: 'workflows/sprint-monitor/sprint-monitor-deep-analysis.workflow.json',
    name: 'Sprint Monitor Deep Analysis',
    runType: 'deep_analysis',
  },
  {
    path: 'workflows/sprint-monitor/sprint-monitor-endgame.workflow.json',
    name: 'Sprint Monitor Endgame',
    runType: 'endgame',
  },
];

for (const wrapperPath of [
  'scripts/workflows/import/import-sprint-monitor-light-scan-workflow.sh',
  'scripts/workflows/import/import-sprint-monitor-deep-analysis-workflow.sh',
  'scripts/workflows/import/import-sprint-monitor-endgame-workflow.sh',
]) {
  if (!fileExists(wrapperPath)) continue;
  const wrapperContent = readText(wrapperPath);
  check(
    wrapperContent.includes('import-sprint-monitor-engine-workflow.sh'),
    `${path.basename(wrapperPath)} imports Sprint Monitor Engine first`,
  );
  check(
    wrapperContent.includes('__REGISTRY__'),
    `${path.basename(wrapperPath)} patches Sprint Monitor Engine registry token`,
  );
}

for (const item of topLevelExpectations) {
  if (!fileExists(item.path)) continue;
  const workflow = readJson(item.path);
  for (const nodeName of [
    'Manual Trigger',
    'Build Manual Request',
    'Schedule Trigger',
    'Build Scheduled Request',
    'Load Monitor Configs (Manual)',
    'Load Monitor Configs (Scheduled)',
    'Run Sprint Monitor Engine (Manual)',
    'Run Sprint Monitor Engine (Scheduled)',
    'Build Workflow Summary',
  ]) {
    check(Boolean(nodeByName(workflow, nodeName)), `${item.name} includes node: ${nodeName}`);
  }

  check(hasMainConnection(workflow, 'Manual Trigger', 'Build Manual Request'), `${item.name} manual trigger connects to request builder`);
  check(hasMainConnection(workflow, 'Schedule Trigger', 'Build Scheduled Request'), `${item.name} schedule trigger connects to request builder`);
  check(hasMainConnection(workflow, 'Build Manual Request', 'Load Monitor Configs (Manual)'), `${item.name} manual request loads configs`);
  check(hasMainConnection(workflow, 'Build Scheduled Request', 'Load Monitor Configs (Scheduled)'), `${item.name} scheduled request loads configs`);
  check(hasMainConnection(workflow, 'Load Monitor Configs (Manual)', 'Run Sprint Monitor Engine (Manual)'), `${item.name} manual configs connect to engine call`);
  check(hasMainConnection(workflow, 'Load Monitor Configs (Scheduled)', 'Run Sprint Monitor Engine (Scheduled)'), `${item.name} scheduled configs connect to engine call`);
  check(hasMainConnection(workflow, 'Run Sprint Monitor Engine (Manual)', 'Build Workflow Summary'), `${item.name} manual engine call connects to summary`);
  check(hasMainConnection(workflow, 'Run Sprint Monitor Engine (Scheduled)', 'Build Workflow Summary'), `${item.name} scheduled engine call connects to summary`);

  const manualRunner = nodeByName(workflow, 'Run Sprint Monitor Engine (Manual)');
  const scheduledRunner = nodeByName(workflow, 'Run Sprint Monitor Engine (Scheduled)');
  check(manualRunner?.type === 'n8n-nodes-base.executeWorkflow', `${item.name} manual engine runner uses executeWorkflow`);
  check(scheduledRunner?.type === 'n8n-nodes-base.executeWorkflow', `${item.name} scheduled engine runner uses executeWorkflow`);
  check(
    String(
      manualRunner?.parameters?.workflowId?.value ||
        manualRunner?.parameters?.workflowId?.cachedResultName ||
        '',
    ).includes('Sprint Monitor Engine'),
    `${item.name} manual engine runner references Sprint Monitor Engine registry token`,
  );
  check(
    String(
      scheduledRunner?.parameters?.workflowId?.value ||
        scheduledRunner?.parameters?.workflowId?.cachedResultName ||
        '',
    ).includes('Sprint Monitor Engine'),
    `${item.name} scheduled engine runner references Sprint Monitor Engine registry token`,
  );
  check(
    String(manualRunner?.parameters?.workflowInputs?.value?.runType || '').includes(item.runType),
    `${item.name} manual engine runner passes ${item.runType}`,
  );
  check(
    String(scheduledRunner?.parameters?.workflowInputs?.value?.runType || '').includes(item.runType),
    `${item.name} scheduled engine runner passes ${item.runType}`,
  );
}

const enginePath = 'workflows/sprint-monitor/sprint-monitor-engine.workflow.json';
if (fileExists(enginePath)) {
  const engine = readJson(enginePath);
  for (const nodeName of [
    'When Executed by Another Workflow',
    'Normalize Request',
    'Get Active Sprint',
    'Pick Active Sprint',
    'If Active Sprint?',
    'Build No Active Sprint Summary',
    'Build No Active Sprint Persist Query',
    'Persist No Active Sprint',
    'Build No Active Sprint Result',
    'Get Sprint Issues',
    'Build GitLab Project Items',
    'If Should Fetch GitLab?',
    'Get GitLab Merge Requests',
    'Build Empty GitLab Signals',
    'Aggregate GitLab Signals',
    'Normalize Sprint Context',
    'Build Comment Classifier Inputs',
    'Comment Classifier AI Agent',
    'Structured Comment Classifier Output Parser',
    'Comment Classifier Model',
    'Compute Signals',
    'Build Prior State Query',
    'Load Prior State',
    'Build Judge Inputs',
    'Sprint Judge AI Agent',
    'Structured Sprint Judgment Output Parser',
    'Sprint Judge Model',
    'Delivery Gate',
    'If Need Draft?',
    'Build Draft Inputs',
    'Message Drafter AI Agent',
    'Structured Message Draft Output Parser',
    'Message Drafter Model',
    'Get Members',
    'Build Render Model',
    'Build Delivery Messages',
    'If Has Deliveries?',
    'Expand Delivery Items',
    'Send Google Chat Message',
    'Aggregate Deliveries',
    'Build Persist Query',
    'Persist Run State',
    'Build Engine Result',
  ]) {
    check(Boolean(nodeByName(engine, nodeName)), `Sprint Monitor Engine includes node: ${nodeName}`);
  }

  check(hasMainConnection(engine, 'When Executed by Another Workflow', 'Normalize Request'), 'engine trigger connects to Normalize Request');
  check(hasMainConnection(engine, 'Normalize Request', 'Get Active Sprint'), 'Normalize Request connects to Get Active Sprint');
  check(hasMainConnection(engine, 'Get Active Sprint', 'Pick Active Sprint'), 'Get Active Sprint connects to Pick Active Sprint');
  check(hasMainConnection(engine, 'Pick Active Sprint', 'If Active Sprint?'), 'Pick Active Sprint connects to If Active Sprint?');
  check(hasMainConnectionFromOutput(engine, 'If Active Sprint?', 0, 'Get Sprint Issues'), 'active sprint true branch fetches sprint issues');
  check(hasMainConnectionFromOutput(engine, 'If Active Sprint?', 1, 'Build No Active Sprint Summary'), 'active sprint false branch builds no-sprint summary');
  check(hasMainConnection(engine, 'Get Sprint Issues', 'Build GitLab Project Items'), 'Get Sprint Issues connects to GitLab project builder');
  check(hasMainConnection(engine, 'Build GitLab Project Items', 'If Should Fetch GitLab?'), 'GitLab project builder connects to fetch gate');
  check(hasMainConnectionFromOutput(engine, 'If Should Fetch GitLab?', 0, 'Get GitLab Merge Requests'), 'GitLab fetch gate true branch fetches merge requests');
  check(hasMainConnectionFromOutput(engine, 'If Should Fetch GitLab?', 1, 'Build Empty GitLab Signals'), 'GitLab fetch gate false branch builds empty signals');
  check(hasMainConnection(engine, 'Aggregate GitLab Signals', 'Normalize Sprint Context'), 'GitLab aggregation connects to Normalize Sprint Context');
  check(hasMainConnection(engine, 'Normalize Sprint Context', 'Build Comment Classifier Inputs'), 'Normalize Sprint Context connects to classifier inputs');
  check(hasMainConnection(engine, 'Comment Classifier AI Agent', 'Compute Signals'), 'comment classifier connects to Compute Signals');
  check(hasMainConnection(engine, 'Compute Signals', 'Build Prior State Query'), 'Compute Signals connects to prior-state query builder');
  check(hasMainConnection(engine, 'Build Prior State Query', 'Load Prior State'), 'prior-state query builder connects to Postgres load');
  check(hasMainConnection(engine, 'Load Prior State', 'Build Judge Inputs'), 'Load Prior State connects to judge inputs');
  check(hasMainConnection(engine, 'Build Judge Inputs', 'Sprint Judge AI Agent'), 'judge inputs connect to sprint judge');
  check(hasMainConnection(engine, 'Sprint Judge AI Agent', 'Delivery Gate'), 'sprint judge connects to delivery gate');
  check(hasMainConnection(engine, 'Delivery Gate', 'If Need Draft?'), 'delivery gate connects to draft gate');
  check(hasMainConnectionFromOutput(engine, 'If Need Draft?', 0, 'Build Draft Inputs'), 'draft gate true branch builds draft inputs');
  check(hasMainConnection(engine, 'Build Draft Inputs', 'Message Drafter AI Agent'), 'draft inputs connect to drafter agent');
  check(hasMainConnectionFromOutput(engine, 'If Need Draft?', 1, 'Get Members'), 'draft gate false branch still resolves members for deterministic render');
  check(hasMainConnection(engine, 'Message Drafter AI Agent', 'Get Members'), 'drafter connects to member lookup');
  check(hasMainConnection(engine, 'Get Members', 'Build Render Model'), 'member lookup connects to render model');
  check(hasMainConnection(engine, 'Build Render Model', 'Build Delivery Messages'), 'render model connects to delivery builder');
  check(hasMainConnection(engine, 'Build Delivery Messages', 'If Has Deliveries?'), 'delivery builder connects to delivery gate');
  check(hasMainConnectionFromOutput(engine, 'If Has Deliveries?', 0, 'Expand Delivery Items'), 'delivery gate true branch expands items');
  check(hasMainConnectionFromOutput(engine, 'If Has Deliveries?', 1, 'Build Persist Query'), 'delivery gate false branch persists directly');
  check(hasMainConnection(engine, 'Expand Delivery Items', 'Send Google Chat Message'), 'expanded delivery items connect to Google Chat sender');
  check(hasMainConnection(engine, 'Send Google Chat Message', 'Aggregate Deliveries'), 'Google Chat sender connects to delivery aggregation');
  check(hasMainConnection(engine, 'Aggregate Deliveries', 'Build Persist Query'), 'delivery aggregation connects to persist query builder');
  check(hasMainConnection(engine, 'Build Persist Query', 'Persist Run State'), 'persist query builder connects to Postgres persist node');
  check(hasMainConnection(engine, 'Persist Run State', 'Build Engine Result'), 'persist node connects to engine result');

  check(hasAiConnection(engine, 'Structured Comment Classifier Output Parser', 'ai_outputParser', 'Comment Classifier AI Agent'), 'comment classifier output parser connects to AI agent');
  check(hasAiConnection(engine, 'Comment Classifier Model', 'ai_languageModel', 'Comment Classifier AI Agent'), 'comment classifier model connects to AI agent');
  check(hasAiConnection(engine, 'Structured Sprint Judgment Output Parser', 'ai_outputParser', 'Sprint Judge AI Agent'), 'sprint judgment output parser connects to AI agent');
  check(hasAiConnection(engine, 'Sprint Judge Model', 'ai_languageModel', 'Sprint Judge AI Agent'), 'sprint judge model connects to AI agent');
  check(hasAiConnection(engine, 'Structured Message Draft Output Parser', 'ai_outputParser', 'Message Drafter AI Agent'), 'message draft output parser connects to drafter agent');
  check(hasAiConnection(engine, 'Message Drafter Model', 'ai_languageModel', 'Message Drafter AI Agent'), 'message drafter model connects to drafter agent');

  const postgresNodes = (engine.nodes || []).filter((node) => node.type === 'n8n-nodes-base.postgres');
  check(postgresNodes.length >= 3, 'Sprint Monitor Engine includes Postgres nodes for state IO');
  const sheetsNodes = (engine.nodes || []).filter((node) => node.type === 'n8n-nodes-base.googleSheets');
  check(sheetsNodes.length >= 1, 'Sprint Monitor Engine includes Google Sheets member lookup');
  check(Boolean(nodeByName(engine, 'Load Prior State')), 'Sprint Monitor Engine includes Load Prior State Postgres node');
  check(Boolean(nodeByName(engine, 'Persist Run State')), 'Sprint Monitor Engine includes Persist Run State Postgres node');
  check(Boolean(nodeByName(engine, 'Persist No Active Sprint')), 'Sprint Monitor Engine includes Persist No Active Sprint Postgres node');

  const engineTrigger = nodeByName(engine, 'When Executed by Another Workflow');
  const workflowInputs = engineTrigger?.parameters?.workflowInputs?.values || [];
  check(
    workflowInputs.some((item) => item?.name === 'runType' && item?.type === 'string'),
    'Sprint Monitor Engine input schema includes runType:string',
  );
  check(
    workflowInputs.some((item) => item?.name === 'workflowName' && item?.type === 'string'),
    'Sprint Monitor Engine input schema includes workflowName:string',
  );
  check(
    workflowInputs.some((item) => item?.name === 'triggerSource' && item?.type === 'string'),
    'Sprint Monitor Engine input schema includes triggerSource:string',
  );
  check(
    workflowInputs.some((item) => item?.name === 'monitorConfig' && item?.type === 'object'),
    'Sprint Monitor Engine input schema includes monitorConfig:object',
  );

  const engineContent = JSON.stringify(engine);
  for (const stalePattern of ['pm_digest', 'lead_alert', 'owner_nudge', 'gchatPmWebhook', 'gchatLeadWebhook', '"audience"']) {
    check(
      !engineContent.includes(stalePattern),
      `Sprint Monitor Engine omits stale runtime artifact: ${stalePattern}`,
    );
  }

  const renderModelCode = String(nodeByName(engine, 'Build Render Model')?.parameters?.jsCode || '');
  check(!renderModelCode.includes('buildJiraLink('), 'Build Render Model no longer expands Jira links directly');
  check(!renderModelCode.includes('withLink('), 'Build Render Model no longer injects pre-rendered Jira links');

  const deliveryBuilderCode = String(nodeByName(engine, 'Build Delivery Messages')?.parameters?.jsCode || '');
  check(deliveryBuilderCode.includes('[A-Z][A-Z0-9]+-\\d+'), 'Build Delivery Messages includes Jira issue key regex replacement');
  check(deliveryBuilderCode.includes("request.monitorConfig?.jiraBaseUrl"), 'Build Delivery Messages uses jiraBaseUrl from monitor config');
}

if (missingTemplates.length > 0) {
  const message =
    `Sprint Monitor workflow templates are not present yet: ${missingTemplates.join(', ')}`;
  if (strictMode) {
    failures.push(message);
  } else {
    warn(message);
  }
}

if (failures.length > 0) {
  console.error('[sprint-monitor-checklist] FAIL');
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log('[sprint-monitor-checklist] PASS');
for (const message of passes) {
  console.log(`- ${message}`);
}
for (const message of warnings) {
  console.log(`- [WARN] ${message}`);
}

if (!strictMode && missingTemplates.length > 0) {
  console.log('- [INFO] Run with --strict after Sprint Monitor workflow JSON files are added.');
}
