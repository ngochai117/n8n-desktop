#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../..',
);

const topLevelPath = path.resolve(
  process.argv[2] || path.join(rootDir, 'workflows/ui-synced/MoMo/momo-ai-assistant.workflow.json'),
);

const stateStorePath = path.join(rootDir, 'workflows/ui-synced/MoMo/momo-ai-assistant-state-store.workflow.json');
const routerToolPath = path.join(rootDir, 'workflows/ui-synced/MoMo/momo-ai-assistant-tool-router.workflow.json');
const healthcheckToolPath = path.join(rootDir, 'workflows/ui-synced/MoMo/momo-ai-assistant-tool-sprint-healthcheck.workflow.json');
const releaseToolPath = path.join(rootDir, 'workflows/ui-synced/MoMo/momo-ai-assistant-tool-sprint-release.workflow.json');
const demoToolPath = path.join(rootDir, 'workflows/ui-synced/MoMo/momo-ai-assistant-tool-demo-commands.workflow.json');
const stateCleanupPath = path.join(rootDir, 'workflows/ui-synced/MoMo/momo-ai-assistant-state-cleanup.workflow.json');

const releaseWrapperPath = path.join(rootDir, 'scripts/workflows/import/import-momo-ai-assistant-tool-sprint-release-workflow.sh');
const routerWrapperPath = path.join(rootDir, 'scripts/workflows/import/import-momo-ai-assistant-tool-router-workflow.sh');

const failures = [];
const passes = [];

function check(condition, message) {
  if (condition) {
    passes.push(message);
    return;
  }
  failures.push(message);
}

function nodeByName(workflow, name) {
  return (workflow.nodes || []).find((node) => node.name === name) || null;
}

function hasMainConnection(workflow, from, to) {
  const entries = (workflow.connections?.[from]?.main || []).flat();
  return entries.some((entry) => entry?.node === to);
}

for (const workflowPath of [
  topLevelPath,
  stateStorePath,
  routerToolPath,
  healthcheckToolPath,
  releaseToolPath,
  demoToolPath,
  stateCleanupPath,
]) {
  check(fs.existsSync(workflowPath), `workflow template exists: ${path.relative(rootDir, workflowPath)}`);
}

for (const scriptPath of [releaseWrapperPath, routerWrapperPath]) {
  check(fs.existsSync(scriptPath), `import wrapper exists: ${path.relative(rootDir, scriptPath)}`);
}

if (failures.length > 0) {
  console.error('[momo-ai-assistant-checklist] FAIL');
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

const topLevel = JSON.parse(fs.readFileSync(topLevelPath, 'utf8'));
const stateStore = JSON.parse(fs.readFileSync(stateStorePath, 'utf8'));
const routerTool = JSON.parse(fs.readFileSync(routerToolPath, 'utf8'));
const healthcheckTool = JSON.parse(fs.readFileSync(healthcheckToolPath, 'utf8'));
const releaseTool = JSON.parse(fs.readFileSync(releaseToolPath, 'utf8'));
const demoTool = JSON.parse(fs.readFileSync(demoToolPath, 'utf8'));
const stateCleanup = JSON.parse(fs.readFileSync(stateCleanupPath, 'utf8'));

check(topLevel.name === 'MoMo AI Assistant', 'top-level workflow name is correct');
check(stateStore.name === 'MoMo AI Assistant State Store', 'state store workflow name is correct');
check(routerTool.name === 'MoMo AI Assistant Tool Router', 'router workflow name is correct');
check(healthcheckTool.name === 'MoMo AI Assistant Tool Sprint Healthcheck', 'healthcheck workflow name is correct');
check(releaseTool.name === 'MoMo AI Assistant Tool Sprint Release', 'release workflow name is correct');
check(demoTool.name === 'MoMo AI Assistant Tool Demo Commands', 'demo workflow name is correct');
check(stateCleanup.name === 'MoMo AI Assistant State Cleanup', 'state cleanup workflow name is correct');

for (const name of [
  'Config Main',
  'Load Session',
  'Build Assistant Context',
  'AI Agent',
  'Assistant Command Router Workflow Tool',
  'Build Agent Delivery Envelope',
  'Save Agent Session',
  'Prepare GGChat Delivery Messages',
  'Build Final Response',
]) {
  check(Boolean(nodeByName(topLevel, name)), `top-level required node exists: ${name}`);
}

check(hasMainConnection(topLevel, 'Config Main', 'Load Session'), 'top-level Config Main routes to Load Session');
check(hasMainConnection(topLevel, 'Load Session', 'Build Assistant Context'), 'top-level Load Session routes to Build Assistant Context');
check(hasMainConnection(topLevel, 'Build Assistant Context', 'AI Agent'), 'top-level assistant context routes to AI Agent');
check(hasMainConnection(topLevel, 'AI Agent', 'Build Agent Delivery Envelope'), 'top-level AI Agent routes to delivery envelope');

const saveAgentSessionNode = nodeByName(topLevel, 'Save Agent Session');
const saveAgentSessionExpr = String(saveAgentSessionNode?.parameters?.workflowInputs?.value?.session || '');
check(
  saveAgentSessionExpr.includes("$('Build Agent Delivery Envelope').first().json.activePendingActionId"),
  'Save Agent Session persists activePendingActionId from Build Agent Delivery Envelope',
);

const routerTriggerNode = nodeByName(routerTool, 'When Executed by Another Workflow');
const routerTriggerInputs = routerTriggerNode?.parameters?.workflowInputs?.values || [];
check(Array.isArray(routerTriggerInputs), 'router trigger uses workflowInputs schema');
check(routerTriggerInputs.some((item) => item.name === 'actorId'), 'router trigger accepts actorId');
check(routerTriggerInputs.some((item) => item.name === 'actorDisplayName'), 'router trigger accepts actorDisplayName');
check(routerTriggerInputs.some((item) => item.name === 'args' && item.type === 'object'), 'router trigger accepts args object');

const routerConfigCode = String(nodeByName(routerTool, 'Config Main')?.parameters?.jsCode || '');
check(routerConfigCode.includes("toolName: 'sprintHealthcheck'"), 'router keeps sprintHealthcheck registry entry');
check(routerConfigCode.includes("toolName: 'sprintRelease'"), 'router defines sprintRelease registry entry');
check(
  routerConfigCode.includes("workflowId: '__REGISTRY__:MoMo AI Assistant Tool Sprint Release'"),
  'router sprintRelease entry uses registry token workflowId',
);
check(routerConfigCode.includes("commandType: 'release_sprint'"), 'router maps release_sprint commandType');
check(routerConfigCode.includes("commandType: 'approve'"), 'router maps approve commandType');
check(routerConfigCode.includes("commandType: 'reject'"), 'router maps reject commandType');
check(routerConfigCode.includes("commandType: 'cancel'"), 'router maps cancel commandType');

const releaseTriggerNode = nodeByName(releaseTool, 'When Executed by Another Workflow');
const releaseTriggerInputs = releaseTriggerNode?.parameters?.workflowInputs?.values || [];
check(Array.isArray(releaseTriggerInputs), 'release tool trigger uses workflowInputs schema');
check(releaseTriggerInputs.some((item) => item.name === 'sessionId'), 'release tool trigger accepts sessionId');
check(releaseTriggerInputs.some((item) => item.name === 'threadKey'), 'release tool trigger accepts threadKey');
check(releaseTriggerInputs.some((item) => item.name === 'args' && item.type === 'object'), 'release tool trigger accepts args object');

for (const name of [
  'Config Main',
  'Load Session',
  'Get Pending Action',
  'Get Active Sprint',
  'Pick Active Sprint',
  'If Active Sprint?',
  'Get Sprint Issues',
  'Get user',
  'Build Release Context',
  'Switch Action',
  'Upsert Pending Action',
  'Build Blocked Result',
  'Close Pending Action',
  'Build Close Pending Result',
  'If Need Pending Approve Update?',
  'Build Execute Seed',
  'Get Issue Transitions',
  'Run Issue Transition',
  'Run Release Version',
  'Complete Active Sprint',
  'Start Next Sprint',
  'Build ExecuteSuccess Result',
].map((name) => (name === 'Build ExecuteSuccess Result' ? 'Build Execute Success Result' : name))) {
  check(Boolean(nodeByName(releaseTool, name)), `release workflow required node exists: ${name}`);
}

check(hasMainConnection(releaseTool, 'Build Release Context', 'Switch Action'), 'release workflow context routes to switch action');
check(hasMainConnection(releaseTool, 'Switch Action', 'Upsert Pending Action'), 'release workflow blocked branch writes pending action');
check(hasMainConnection(releaseTool, 'Switch Action', 'Close Pending Action'), 'release workflow close_pending branch writes pending action');
check(hasMainConnection(releaseTool, 'Switch Action', 'If Need Pending Approve Update?'), 'release workflow execute branch handles approve gate');
check(hasMainConnection(releaseTool, 'If Need Pending Approve Update?', 'Build Execute Seed'), 'release workflow execute seed starts after approve handling');
check(hasMainConnection(releaseTool, 'Build Execute Seed', 'If Has Transition Candidates?'), 'release workflow runs transition gate');
check(hasMainConnection(releaseTool, 'If Version Strict Pass?', 'Complete Active Sprint'), 'release workflow completes sprint after version release pass');
check(hasMainConnection(releaseTool, 'If Complete Sprint Pass?', 'Get Next Sprint'), 'release workflow proceeds next sprint after complete pass');
check(hasMainConnection(releaseTool, 'If Has Next Sprint?', 'Start Next Sprint'), 'release workflow starts next sprint when available');

const releaseBuildSuccessCode = String(nodeByName(releaseTool, 'Build Execute Success Result')?.parameters?.jsCode || '');
check(releaseBuildSuccessCode.includes("messageKey: 'releaseNotes'"), 'release success result includes releaseNotes message');
check(releaseBuildSuccessCode.includes("messageKey: 'releaseActions'"), 'release success result includes releaseActions message');
check(
  releaseBuildSuccessCode.includes('story point check next sprint'),
  'release success result includes next sprint story point check summary',
);

const releaseFailedCode = String(nodeByName(releaseTool, 'Build Execute Failed Result')?.parameters?.jsCode || '');
check(releaseFailedCode.includes('strict mode'), 'release failed result explicitly reports strict mode failure');

const releaseWrapperText = fs.readFileSync(releaseWrapperPath, 'utf8');
check(
  releaseWrapperText.includes('WORKFLOW_REGISTRY_TEMPLATE="workflows/ui-synced/MoMo/momo-ai-assistant-tool-sprint-release.workflow.json"'),
  'release import wrapper updates workflow registry mapping',
);
check(
  releaseWrapperText.includes('__REGISTRY__:'),
  'release import wrapper patches __REGISTRY__ tokens before import',
);

const routerWrapperText = fs.readFileSync(routerWrapperPath, 'utf8');
check(
  routerWrapperText.includes('WORKFLOW_AUTO_ACTIVATE="true"'),
  'router import wrapper auto-activates router workflow',
);

check(Boolean(nodeByName(stateCleanup, 'Schedule Trigger')), 'state cleanup has schedule trigger');
check(Boolean(nodeByName(stateCleanup, 'Run State Cleanup')), 'state cleanup calls state purge');

if (failures.length > 0) {
  console.error('[momo-ai-assistant-checklist] FAIL');
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log('[momo-ai-assistant-checklist] PASS');
for (const message of passes) {
  console.log(`- ${message}`);
}
