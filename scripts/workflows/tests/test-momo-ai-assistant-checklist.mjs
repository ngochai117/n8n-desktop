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

const stateStorePath = path.join(
  rootDir,
  'workflows/ui-synced/MoMo/momo-ai-assistant-state-store.workflow.json',
);

const healthcheckToolPath = path.join(
  rootDir,
  'workflows/ui-synced/MoMo/momo-ai-assistant-tool-sprint-healthcheck.workflow.json',
);

const demoToolPath = path.join(
  rootDir,
  'workflows/ui-synced/MoMo/momo-ai-assistant-tool-demo-commands.workflow.json',
);

const stateCleanupPath = path.join(
  rootDir,
  'workflows/ui-synced/MoMo/momo-ai-assistant-state-cleanup.workflow.json',
);

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

function hasAiConnection(workflow, from, type, to) {
  const entries = (workflow.connections?.[from]?.[type] || []).flat();
  return entries.some((entry) => entry?.node === to);
}

for (const workflowPath of [topLevelPath, stateStorePath, healthcheckToolPath, demoToolPath, stateCleanupPath]) {
  check(fs.existsSync(workflowPath), `workflow template exists: ${path.relative(rootDir, workflowPath)}`);
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
const healthcheckTool = JSON.parse(fs.readFileSync(healthcheckToolPath, 'utf8'));
const demoTool = JSON.parse(fs.readFileSync(demoToolPath, 'utf8'));
const stateCleanup = JSON.parse(fs.readFileSync(stateCleanupPath, 'utf8'));

check(topLevel.name === 'MoMo AI Assistant', 'top-level workflow name is MoMo AI Assistant');
check(stateStore.name === 'MoMo AI Assistant State Store', 'state store workflow name is correct');
check(
  healthcheckTool.name === 'MoMo AI Assistant Tool Sprint Healthcheck',
  'healthcheck tool workflow name is correct',
);
check(
  demoTool.name === 'MoMo AI Assistant Tool Demo Commands',
  'demo tool workflow name is correct',
);
check(
  stateCleanup.name === 'MoMo AI Assistant State Cleanup',
  'state cleanup workflow name is correct',
);

for (const name of [
  'Manual Trigger',
  'Manual Trigger Release Sprint',
  'Build Manual Release Event',
  'Local Chat Trigger',
  'Build Local Chat Event',
  'Switch Entry Route',
  'Schedule Trigger',
  'Google Chat Webhook',
  'Config Main',
  'Switch Entry Route',
  'Load Session',
  'Build Chat Assistant Context',
  'AI Agent',
  'Assistant Agent Model',
  'Sprint Healthcheck Workflow Tool',
  'Demo Command Workflow Tool',
  'Build Agent Chat Response',
  'Save Agent Session',
  'Return Chat Response',
  'Build Stateless Assistant Context',
  'Run Sprint Healthcheck Tool',
  'Log Healthcheck Tool Run',
  'Build Healthcheck Response',
  'Send GGChat Summary Card',
  'If Has Warning Details?',
  'Send GGChat Warning Details',
  'Build Delivery Ack',
]) {
  check(Boolean(nodeByName(topLevel, name)), `top-level required node exists: ${name}`);
}

for (const removedNode of [
  'Route Intent',
  'Switch Intent',
  'If Healthcheck Stateful?',
  'Save Healthcheck Session',
  'Save Release Placeholder Session',
  'Build Release Placeholder Response',
  'Save Approve Session',
  'Build Approve Response',
  'Save Reject Session',
  'Build Reject Response',
  'Save Cancel Session',
  'Build Cancel Response',
  'Save Help Session',
  'Build Help Response',
]) {
  check(!nodeByName(topLevel, removedNode), `top-level removed obsolete node: ${removedNode}`);
}

for (const legacyNode of [
  'Get Active Sprint',
  'Pick Active Sprint',
  'If Active Sprint?',
  'Get Sprint Issues',
  'Get user',
  'Prepare AI Input',
  'Write Sprint Review',
]) {
  check(!nodeByName(topLevel, legacyNode), `legacy direct sprint node removed from top-level: ${legacyNode}`);
}

check(hasMainConnection(topLevel, 'Manual Trigger', 'Build Manual Event'), 'Manual Trigger routes to Build Manual Event');
check(hasMainConnection(topLevel, 'Manual Trigger Release Sprint', 'Build Manual Release Event'), 'Manual Trigger Release Sprint routes to Build Manual Release Event');
check(hasMainConnection(topLevel, 'Local Chat Trigger', 'Build Local Chat Event'), 'Local Chat Trigger routes to Build Local Chat Event');
check(hasMainConnection(topLevel, 'Build Local Chat Event', 'Config Main'), 'Build Local Chat Event routes to Config Main');
check(hasMainConnection(topLevel, 'Schedule Trigger', 'Build Schedule Event'), 'Schedule Trigger routes to Build Schedule Event');
check(hasMainConnection(topLevel, 'Google Chat Webhook', 'Build Chat Event'), 'Google Chat Webhook routes to Build Chat Event');
check(hasMainConnection(topLevel, 'Config Main', 'Switch Entry Route'), 'Config Main routes to Switch Entry Route');
check(hasMainConnection(topLevel, 'Switch Entry Route', 'Load Session'), 'chat branch loads session');
check(hasMainConnection(topLevel, 'Switch Entry Route', 'Build Stateless Assistant Context'), 'manual/schedule branch builds stateless context');
check(hasMainConnection(topLevel, 'Build Chat Assistant Context', 'AI Agent'), 'chat context routes to AI Agent');
check(hasAiConnection(topLevel, 'Assistant Agent Model', 'ai_languageModel', 'AI Agent'), 'Assistant Agent Model connects to AI Agent');
check(hasAiConnection(topLevel, 'Sprint Healthcheck Workflow Tool', 'ai_tool', 'AI Agent'), 'healthcheck workflow tool connects to AI Agent');
check(hasAiConnection(topLevel, 'Demo Command Workflow Tool', 'ai_tool', 'AI Agent'), 'demo command workflow tool connects to AI Agent');
check(hasMainConnection(topLevel, 'AI Agent', 'Build Agent Chat Response'), 'AI Agent routes to Build Agent Chat Response');
check(hasMainConnection(topLevel, 'Build Agent Chat Response', 'Save Agent Session'), 'Build Agent Chat Response routes to Save Agent Session');
check(hasMainConnection(topLevel, 'Save Agent Session', 'Return Chat Response'), 'Save Agent Session routes to Return Chat Response');
check(hasMainConnection(topLevel, 'Build Stateless Assistant Context', 'Run Sprint Healthcheck Tool'), 'stateless context routes to direct healthcheck tool');
check(hasMainConnection(topLevel, 'Run Sprint Healthcheck Tool', 'Log Healthcheck Tool Run'), 'direct healthcheck tool routes to tool-run logger');
check(hasMainConnection(topLevel, 'Log Healthcheck Tool Run', 'Build Healthcheck Response'), 'tool-run logger routes to Build Healthcheck Response');
check(hasMainConnection(topLevel, 'Build Healthcheck Response', 'Send GGChat Summary Card'), 'healthcheck response routes to Google Chat summary card');

const webhookNode = nodeByName(topLevel, 'Google Chat Webhook');
check(webhookNode?.type === 'n8n-nodes-base.webhook', 'Google Chat Webhook uses webhook node');
check(webhookNode?.parameters?.responseMode === 'lastNode', 'Google Chat Webhook responds with last node');
check(webhookNode?.parameters?.httpMethod === 'POST', 'Google Chat Webhook uses POST');

const localChatTriggerNode = nodeByName(topLevel, 'Local Chat Trigger');
check(localChatTriggerNode?.type === '@n8n/n8n-nodes-langchain.chatTrigger', 'Local Chat Trigger uses chat trigger node');

const agentNode = nodeByName(topLevel, 'AI Agent');
check(agentNode?.type === '@n8n/n8n-nodes-langchain.agent', 'AI Agent uses langchain agent node');
check(agentNode?.parameters?.text === '={{ $json.chatInput }}', 'AI Agent reads chatInput from chat context');

const sprintToolNode = nodeByName(topLevel, 'Sprint Healthcheck Workflow Tool');
check(sprintToolNode?.type === '@n8n/n8n-nodes-langchain.toolWorkflow', 'Sprint Healthcheck Workflow Tool uses Call n8n Workflow Tool node');
const demoCommandToolNode = nodeByName(topLevel, 'Demo Command Workflow Tool');
check(demoCommandToolNode?.type === '@n8n/n8n-nodes-langchain.toolWorkflow', 'Demo Command Workflow Tool uses Call n8n Workflow Tool node');

const configMainCode = String(nodeByName(topLevel, 'Config Main')?.parameters?.jsCode || '');
check(configMainCode.includes('stableCommands'), 'Config Main defines stableCommands');
check(configMainCode.includes('demoCommands'), 'Config Main defines demoCommands');

const buildManualEventCode = String(nodeByName(topLevel, 'Build Manual Event')?.parameters?.jsCode || '');
check(buildManualEventCode.includes("triggerSource: 'chat'"), 'Build Manual Event routes as chat triggerSource');
check(buildManualEventCode.includes('manual-trigger-space:manual-check-sprint'), 'Build Manual Event sets deterministic sessionId');

const buildManualReleaseEventCode = String(nodeByName(topLevel, 'Build Manual Release Event')?.parameters?.jsCode || '');
check(buildManualReleaseEventCode.includes("triggerSource: 'chat'"), 'Build Manual Release Event routes as chat triggerSource');
check(buildManualReleaseEventCode.includes('manual-trigger-space:manual-release-sprint'), 'Build Manual Release Event sets deterministic sessionId');

for (const name of ['Load Session', 'Log Healthcheck Tool Run', 'Save Agent Session']) {
  const node = nodeByName(topLevel, name);
  check(
    String(node?.parameters?.workflowId?.value || '').includes('__MOMO_AI_ASSISTANT_STATE_STORE_ID__'),
    `state-store placeholder workflowId exists on: ${name}`,
  );
}

check(
  String(nodeByName(topLevel, 'Run Sprint Healthcheck Tool')?.parameters?.workflowId?.value || '').includes('__MOMO_AI_ASSISTANT_TOOL_SPRINT_HEALTHCHECK_ID__'),
  'direct healthcheck executeWorkflow placeholder exists on Run Sprint Healthcheck Tool',
);
check(
  String(sprintToolNode?.parameters?.workflowId?.value || '').includes('__MOMO_AI_ASSISTANT_TOOL_SPRINT_HEALTHCHECK_ID__'),
  'AI workflow-tool placeholder exists on Sprint Healthcheck Workflow Tool',
);
check(
  String(demoCommandToolNode?.parameters?.workflowId?.value || '').includes('__MOMO_AI_ASSISTANT_TOOL_DEMO_COMMANDS_ID__'),
  'AI workflow-tool placeholder exists on Demo Command Workflow Tool',
);

for (const name of [
  'When Executed by Another Workflow',
  'Config Main',
  'Get Active Sprint',
  'Pick Active Sprint',
  'If Active Sprint?',
  'Get Sprint Issues',
  'Get user',
  'Prepare AI Input',
  'Write Sprint Review',
  'Review Model',
  'Build Healthcheck Result',
  'Build No Active Sprint Result',
]) {
  check(Boolean(nodeByName(healthcheckTool, name)), `healthcheck tool node exists: ${name}`);
}

for (const removedNode of [
  'Manual Trigger',
  'Schedule Trigger',
  'Send GGChat Summary Card',
  'Send GGChat Warning Details',
]) {
  check(!nodeByName(healthcheckTool, removedNode), `healthcheck tool removed node: ${removedNode}`);
}

check(
  nodeByName(healthcheckTool, 'When Executed by Another Workflow')?.parameters?.inputSource === 'workflowInputs',
  'healthcheck tool trigger uses workflowInputs',
);

for (const name of ['When Executed by Another Workflow', 'Build Demo Command Result']) {
  check(Boolean(nodeByName(demoTool, name)), `demo tool node exists: ${name}`);
}

const demoTrigger = nodeByName(demoTool, 'When Executed by Another Workflow');
check(demoTrigger?.parameters?.inputSource === 'workflowInputs', 'demo tool trigger uses workflowInputs');
const demoTriggerFields = (demoTrigger?.parameters?.workflowInputs?.values || []).map((item) => item.name);
for (const field of ['commandType', 'commandText', 'channel', 'sessionId', 'spaceId', 'threadKey']) {
  check(demoTriggerFields.includes(field), `demo tool trigger declares field: ${field}`);
}

for (const name of [
  'Manual Trigger',
  'Schedule Trigger',
  'Build Cleanup Request',
  'Run State Cleanup',
  'Build Cleanup Result',
]) {
  check(Boolean(nodeByName(stateCleanup, name)), `state cleanup node exists: ${name}`);
}

check(
  hasMainConnection(stateCleanup, 'Manual Trigger', 'Build Cleanup Request'),
  'state cleanup manual trigger routes to Build Cleanup Request',
);
check(
  hasMainConnection(stateCleanup, 'Schedule Trigger', 'Build Cleanup Request'),
  'state cleanup schedule trigger routes to Build Cleanup Request',
);
check(
  hasMainConnection(stateCleanup, 'Build Cleanup Request', 'Run State Cleanup'),
  'state cleanup build request routes to Run State Cleanup',
);
check(
  hasMainConnection(stateCleanup, 'Run State Cleanup', 'Build Cleanup Result'),
  'state cleanup run node routes to Build Cleanup Result',
);
check(
  String(nodeByName(stateCleanup, 'Run State Cleanup')?.parameters?.workflowId?.value || '').includes('__MOMO_AI_ASSISTANT_STATE_STORE_ID__'),
  'state cleanup uses state-store placeholder workflowId',
);

for (const name of [
  'When Executed by Another Workflow',
  'Normalize Request',
  'Ensure Sessions Table',
  'Ensure Pending Actions Table',
  'Ensure Tool Runs Table',
  'Switch Operation',
  'Get Session Row',
  'Upsert Session Row',
  'Get Pending Action Row',
  'Upsert Pending Action Row',
  'Create Tool Run Row',
]) {
  check(Boolean(nodeByName(stateStore, name)), `state store node exists: ${name}`);
}

const triggerInputs =
  nodeByName(stateStore, 'When Executed by Another Workflow')?.parameters?.workflowInputs?.values || [];
const triggerFields = triggerInputs.map((item) => item.name);
for (const field of ['operation', 'sessionId', 'pendingActionId', 'session', 'pendingAction', 'toolRun']) {
  check(triggerFields.includes(field), `state store trigger declares field: ${field}`);
}

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
