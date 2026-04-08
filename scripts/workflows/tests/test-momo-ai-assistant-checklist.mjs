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

const routerToolPath = path.join(
  rootDir,
  'workflows/ui-synced/MoMo/momo-ai-assistant-tool-router.workflow.json',
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

for (const workflowPath of [topLevelPath, stateStorePath, routerToolPath, healthcheckToolPath, demoToolPath, stateCleanupPath]) {
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
const routerTool = JSON.parse(fs.readFileSync(routerToolPath, 'utf8'));
const healthcheckTool = JSON.parse(fs.readFileSync(healthcheckToolPath, 'utf8'));
const demoTool = JSON.parse(fs.readFileSync(demoToolPath, 'utf8'));
const stateCleanup = JSON.parse(fs.readFileSync(stateCleanupPath, 'utf8'));

check(topLevel.name === 'MoMo AI Assistant', 'top-level workflow name is MoMo AI Assistant');
check(stateStore.name === 'MoMo AI Assistant State Store', 'state store workflow name is correct');
check(routerTool.name === 'MoMo AI Assistant Tool Router', 'router tool workflow name is correct');
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
  'Build Manual Event',
  'Schedule Trigger',
  'Build Schedule Event',
  'Google Chat Webhook',
  'Build Chat Event',
  'Config Main',
  'Load Session',
  'Build Assistant Context',
  'AI Agent',
  'Assistant Agent Model',
  'Assistant Command Router Workflow Tool',
  'Build Agent Delivery Envelope',
  'Save Agent Session',
  'Build Reply Response',
  'Prepare GGChat Delivery Messages',
  'If Has GGChat Delivery Messages?',
  'Split Out GGChat Delivery Messages',
  'Send GGChat Delivery Message',
  'Build Delivery Ack',
  'Build Final Response',
  'Manual Trigger Release Sprint',
  'Build Manual Release Event',
  'Local Chat Trigger',
  'Build Local Chat Event',
]) {
  check(Boolean(nodeByName(topLevel, name)), `top-level required node exists: ${name}`);
}

for (const removedNode of [
  'Switch Entry Route',
  'Switch Session Mode',
  'Build Chat Assistant Context',
  'Build Stateful Assistant Context',
  'Build Stateless Assistant Context',
  'Build Direct Assistant Context',
  'Sprint Healthcheck Workflow Tool',
  'Demo Command Workflow Tool',
  'Switch Direct Tool',
  'Run Direct Sprint Healthcheck Tool',
  'Log Direct Tool Run',
  'Build Direct Tool Delivery Envelope',
  'Build Unsupported Direct Tool Delivery Envelope',
  'Switch Delivery Target',
  'Build Agent Chat Response',
  'Return Chat Response',
  'Run Sprint Healthcheck Tool',
  'Log Healthcheck Tool Run',
  'Build Healthcheck Response',
  'Send GGChat Summary Card',
  'If Has Warning Details?',
  'Send GGChat Warning Details',
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
  check(!nodeByName(topLevel, legacyNode), `legacy sprint node removed from top-level: ${legacyNode}`);
}

check(hasMainConnection(topLevel, 'Manual Trigger', 'Build Manual Event'), 'Manual Trigger routes to Build Manual Event');
check(hasMainConnection(topLevel, 'Build Manual Event', 'Config Main'), 'Build Manual Event routes to Config Main');
check(hasMainConnection(topLevel, 'Manual Trigger Release Sprint', 'Build Manual Release Event'), 'Manual Trigger Release Sprint routes to Build Manual Release Event');
check(hasMainConnection(topLevel, 'Build Manual Release Event', 'Config Main'), 'Build Manual Release Event routes to Config Main');
check(hasMainConnection(topLevel, 'Local Chat Trigger', 'Build Local Chat Event'), 'Local Chat Trigger routes to Build Local Chat Event');
check(hasMainConnection(topLevel, 'Build Local Chat Event', 'Config Main'), 'Build Local Chat Event routes to Config Main');
check(hasMainConnection(topLevel, 'Schedule Trigger', 'Build Schedule Event'), 'Schedule Trigger routes to Build Schedule Event');
check(hasMainConnection(topLevel, 'Build Schedule Event', 'Config Main'), 'Build Schedule Event routes to Config Main');
check(hasMainConnection(topLevel, 'Google Chat Webhook', 'Build Chat Event'), 'Google Chat Webhook routes to Build Chat Event');
check(hasMainConnection(topLevel, 'Build Chat Event', 'Config Main'), 'Build Chat Event routes to Config Main');
check(hasMainConnection(topLevel, 'Config Main', 'Load Session'), 'Config Main routes to Load Session');
check(hasMainConnection(topLevel, 'Load Session', 'Build Assistant Context'), 'Load Session routes to Build Assistant Context');
check(hasMainConnection(topLevel, 'Build Assistant Context', 'AI Agent'), 'Build Assistant Context routes to AI Agent');
check(hasAiConnection(topLevel, 'Assistant Agent Model', 'ai_languageModel', 'AI Agent'), 'Assistant Agent Model connects to AI Agent');
check(hasAiConnection(topLevel, 'Assistant Command Router Workflow Tool', 'ai_tool', 'AI Agent'), 'router workflow tool connects to AI Agent');
check(hasMainConnection(topLevel, 'AI Agent', 'Build Agent Delivery Envelope'), 'AI Agent routes to Build Agent Delivery Envelope');
check(hasMainConnection(topLevel, 'Build Agent Delivery Envelope', 'Save Agent Session'), 'Build Agent Delivery Envelope routes to Save Agent Session');
check(hasMainConnection(topLevel, 'Save Agent Session', 'Build Reply Response'), 'Save Agent Session routes to Build Reply Response');
check(hasMainConnection(topLevel, 'Build Reply Response', 'Prepare GGChat Delivery Messages'), 'Build Reply Response routes to Prepare GGChat Delivery Messages');
check(hasMainConnection(topLevel, 'Prepare GGChat Delivery Messages', 'If Has GGChat Delivery Messages?'), 'Prepare GGChat Delivery Messages routes to GGChat delivery gate');
check(hasMainConnection(topLevel, 'If Has GGChat Delivery Messages?', 'Split Out GGChat Delivery Messages'), 'GGChat delivery gate routes positive branch to split-out node');
check(hasMainConnection(topLevel, 'If Has GGChat Delivery Messages?', 'Build Delivery Ack'), 'GGChat delivery gate routes negative branch to delivery ack');
check(hasMainConnection(topLevel, 'Split Out GGChat Delivery Messages', 'Send GGChat Delivery Message'), 'split-out GGChat delivery routes to Send GGChat Delivery Message');
check(hasMainConnection(topLevel, 'Send GGChat Delivery Message', 'Build Delivery Ack'), 'Google Chat delivery routes to Build Delivery Ack');
check(hasMainConnection(topLevel, 'Build Delivery Ack', 'Build Final Response'), 'Build Delivery Ack routes to Build Final Response');

const webhookNode = nodeByName(topLevel, 'Google Chat Webhook');
check(webhookNode?.type === 'n8n-nodes-base.webhook', 'Google Chat Webhook uses webhook node');
check(webhookNode?.parameters?.responseMode === 'lastNode', 'Google Chat Webhook responds with last node');
check(webhookNode?.parameters?.httpMethod === 'POST', 'Google Chat Webhook uses POST');

const localChatTriggerNode = nodeByName(topLevel, 'Local Chat Trigger');
check(localChatTriggerNode?.type === '@n8n/n8n-nodes-langchain.chatTrigger', 'Local Chat Trigger uses chat trigger node');

const ifHasGgChatDeliveryMessagesNode = nodeByName(topLevel, 'If Has GGChat Delivery Messages?');
check(ifHasGgChatDeliveryMessagesNode?.type === 'n8n-nodes-base.if', 'If Has GGChat Delivery Messages? uses if node');

const agentNode = nodeByName(topLevel, 'AI Agent');
check(agentNode?.type === '@n8n/n8n-nodes-langchain.agent', 'AI Agent uses langchain agent node');
check(agentNode?.parameters?.text === '={{ $json.chatInput }}', 'AI Agent reads chatInput from assistant context');
check(agentNode?.retryOnFail === false, 'AI Agent disables retryOnFail to avoid looping on tool failures');

const routerToolNode = nodeByName(topLevel, 'Assistant Command Router Workflow Tool');
check(routerToolNode?.type === '@n8n/n8n-nodes-langchain.toolWorkflow', 'Assistant Command Router Workflow Tool uses Call n8n Workflow Tool node');
check(
  String(routerToolNode?.parameters?.workflowId?.value || '').trim().length > 0,
  'AI workflow-tool workflowId is configured on Assistant Command Router Workflow Tool',
);
check(
  String(routerToolNode?.parameters?.workflowInputs?.value?.actorId || '').includes('$("Config Main").first().json.actorId'),
  'Assistant Command Router Workflow Tool passes actorId from Config Main',
);
check(
  String(routerToolNode?.parameters?.workflowInputs?.value?.actorDisplayName || '').includes('$("Config Main").first().json.actorDisplayName'),
  'Assistant Command Router Workflow Tool passes actorDisplayName from Config Main',
);
check(
  String(routerToolNode?.parameters?.workflowInputs?.value?.args || '').includes('$("Config Main").first().json.args'),
  'Assistant Command Router Workflow Tool passes args from Config Main',
);
check(
  !Object.prototype.hasOwnProperty.call(routerToolNode?.parameters?.workflowInputs?.value || {}, 'runtimeConfig'),
  'Assistant Command Router Workflow Tool no longer passes runtimeConfig',
);

const configMainCode = String(nodeByName(topLevel, 'Config Main')?.parameters?.jsCode || '');
check(configMainCode.includes('stableCommands'), 'Config Main defines stableCommands');
check(configMainCode.includes('demoCommands'), 'Config Main defines demoCommands');
check(configMainCode.includes('googleChatReplyOption'), 'Config Main defines Google Chat reply option');

const buildManualEventCode = String(nodeByName(topLevel, 'Build Manual Event')?.parameters?.jsCode || '');
check(buildManualEventCode.includes("triggerSource: 'manual'"), 'Build Manual Event routes as manual triggerSource');
check(buildManualEventCode.includes('manual-trigger-space:manual-check-sprint'), 'Build Manual Event sets deterministic sessionId');
check(!buildManualEventCode.includes('deliveryTarget'), 'Build Manual Event no longer hard-codes deliveryTarget');

const buildManualReleaseEventCode = String(nodeByName(topLevel, 'Build Manual Release Event')?.parameters?.jsCode || '');
check(buildManualReleaseEventCode.includes("triggerSource: 'manual'"), 'Build Manual Release Event routes as manual triggerSource');
check(buildManualReleaseEventCode.includes('manual-trigger-space:manual-release-sprint'), 'Build Manual Release Event sets deterministic sessionId');
check(!buildManualReleaseEventCode.includes('deliveryTarget'), 'Build Manual Release Event no longer hard-codes deliveryTarget');

const buildScheduleEventCode = String(nodeByName(topLevel, 'Build Schedule Event')?.parameters?.jsCode || '');
check(buildScheduleEventCode.includes("triggerSource: 'schedule'"), 'Build Schedule Event routes as schedule triggerSource');
check(!buildScheduleEventCode.includes('deliveryTarget'), 'Build Schedule Event no longer hard-codes deliveryTarget');

for (const name of ['Load Session', 'Save Agent Session']) {
  const node = nodeByName(topLevel, name);
  check(
    String(node?.parameters?.workflowId?.value || '').trim().length > 0,
    `state-store workflowId is configured on: ${name}`,
  );
}

const buildAgentDeliveryEnvelopeCode = String(nodeByName(topLevel, 'Build Agent Delivery Envelope')?.parameters?.jsCode || '');
check(buildAgentDeliveryEnvelopeCode.includes('deliveryPlan'), 'Build Agent Delivery Envelope builds deliveryPlan');
check(buildAgentDeliveryEnvelopeCode.includes("$('Build Assistant Context')"), 'Build Agent Delivery Envelope reads Build Assistant Context');
check(buildAgentDeliveryEnvelopeCode.includes('destinations'), 'Build Agent Delivery Envelope normalizes destinations');

const buildReplyResponseCode = String(nodeByName(topLevel, 'Build Reply Response')?.parameters?.jsCode || '');
check(buildReplyResponseCode.includes('hasReplyDestination'), 'Build Reply Response computes hasReplyDestination');
check(buildReplyResponseCode.includes('responseBody'), 'Build Reply Response builds responseBody');

const prepareGgChatDeliveryMessagesCode = String(nodeByName(topLevel, 'Prepare GGChat Delivery Messages')?.parameters?.jsCode || '');
check(prepareGgChatDeliveryMessagesCode.includes('ggChatRequests'), 'Prepare GGChat Delivery Messages builds ggChatRequests');
check(prepareGgChatDeliveryMessagesCode.includes('ggChatDeliverySkipReason'), 'Prepare GGChat Delivery Messages captures skip reason');
check(prepareGgChatDeliveryMessagesCode.includes('finalThreadKey'), 'Prepare GGChat Delivery Messages builds finalThreadKey');
check(
  prepareGgChatDeliveryMessagesCode.includes('subworkflowThreadKey') &&
    prepareGgChatDeliveryMessagesCode.includes('configThreadKey'),
  'Prepare GGChat Delivery Messages prioritizes subworkflow thread key then Config Main thread key',
);
check(!prepareGgChatDeliveryMessagesCode.includes('threadKeyHint'), 'top-level delivery no longer reads threadKeyHint');

const splitOutGgChatDeliveryMessagesCode = String(nodeByName(topLevel, 'Split Out GGChat Delivery Messages')?.parameters?.jsCode || '');
check(splitOutGgChatDeliveryMessagesCode.includes('ggChatRequests'), 'Split Out GGChat Delivery Messages expands ggChatRequests');

const sendGgChatDeliveryNode = nodeByName(topLevel, 'Send GGChat Delivery Message');
check(sendGgChatDeliveryNode?.type === 'n8n-nodes-base.httpRequest', 'Send GGChat Delivery Message uses HTTP Request node');
check(sendGgChatDeliveryNode?.parameters?.url === '={{ $json.requestUrl }}', 'Send GGChat Delivery Message uses dynamic requestUrl');

const buildDeliveryAckCode = String(nodeByName(topLevel, 'Build Delivery Ack')?.parameters?.jsCode || '');
check(buildDeliveryAckCode.includes('ggChatDeliveryStatus'), 'Build Delivery Ack computes ggChatDeliveryStatus');

const buildFinalResponseCode = String(nodeByName(topLevel, 'Build Final Response')?.parameters?.jsCode || '');
check(buildFinalResponseCode.includes('hasReplyDestination'), 'Build Final Response respects hasReplyDestination');
check(buildFinalResponseCode.includes('responseBody'), 'Build Final Response returns responseBody when available');

for (const name of [
  'When Executed by Another Workflow',
  'Config Main',
  'Resolve Routed Tool',
  'Switch Resolution Status',
  'Run Routed Tool',
  'Build Unsupported Router Result',
]) {
  check(Boolean(nodeByName(routerTool, name)), `router tool node exists: ${name}`);
}

check(
  Array.isArray(nodeByName(routerTool, 'When Executed by Another Workflow')?.parameters?.workflowInputs?.values),
  'router tool trigger uses workflowInputs',
);
check(
  (nodeByName(routerTool, 'When Executed by Another Workflow')?.parameters?.workflowInputs?.values || [])
    .some((item) => item.name === 'actorId' && item.type === 'string'),
  'router tool trigger accepts actorId input',
);
check(
  (nodeByName(routerTool, 'When Executed by Another Workflow')?.parameters?.workflowInputs?.values || [])
    .some((item) => item.name === 'actorDisplayName' && item.type === 'string'),
  'router tool trigger accepts actorDisplayName input',
);
check(
  (nodeByName(routerTool, 'When Executed by Another Workflow')?.parameters?.workflowInputs?.values || [])
    .some((item) => item.name === 'args' && item.type === 'object'),
  'router tool trigger accepts args object input',
);
check(
  !(nodeByName(routerTool, 'When Executed by Another Workflow')?.parameters?.workflowInputs?.values || [])
    .some((item) => ['runtimeConfig', 'resolvedToolName', 'commandType'].includes(item.name)),
  'router tool trigger keeps minimal input contract',
);
check(hasMainConnection(routerTool, 'When Executed by Another Workflow', 'Config Main'), 'router tool trigger routes to Config Main');
check(hasMainConnection(routerTool, 'Config Main', 'Resolve Routed Tool'), 'router config routes to resolve node');
check(hasMainConnection(routerTool, 'Resolve Routed Tool', 'Switch Resolution Status'), 'router resolve node routes to switch');
check(hasMainConnection(routerTool, 'Switch Resolution Status', 'Run Routed Tool'), 'router switch routes to generic runner');
check(hasMainConnection(routerTool, 'Switch Resolution Status', 'Build Unsupported Router Result'), 'router switch routes to unsupported result');

const routerConfigCode = String(nodeByName(routerTool, 'Config Main')?.parameters?.jsCode || '');
check(routerConfigCode.includes('toolRegistry'), 'router config defines toolRegistry');
check(routerConfigCode.includes("toolName: 'sprintHealthcheck'"), 'router config keeps healthcheck entry');
check(routerConfigCode.includes("toolName: 'demoCommand'"), 'router config keeps demo entry');
check(!routerConfigCode.includes('workflowRegistryKey'), 'router config no longer carries workflowRegistryKey in runtime registry');

const resolveRoutedToolCode = String(nodeByName(routerTool, 'Resolve Routed Tool')?.parameters?.jsCode || '');
check(resolveRoutedToolCode.includes('resolvedTool'), 'router resolve node builds resolvedTool');
check(resolveRoutedToolCode.includes('toolInput'), 'router resolve node builds toolInput');
check(resolveRoutedToolCode.includes('mergeObjects'), 'router resolve node merges matcher/tool args');
check(resolveRoutedToolCode.includes("resolutionStatus: resolvedTool ? 'matched' : 'unsupported'"), 'router resolve node sets resolutionStatus');

check(
  nodeByName(routerTool, 'Run Routed Tool')?.parameters?.workflowId?.mode === 'id',
  'router generic runner uses workflowId mode=id',
);
check(
  String(nodeByName(routerTool, 'Run Routed Tool')?.parameters?.workflowId?.value || '').trim() === '={{ $json.resolvedTool.workflowId || "" }}',
  'router generic runner uses dynamic resolvedTool.workflowId',
);
check(
  String(nodeByName(routerTool, 'Run Routed Tool')?.parameters?.workflowInputs?.value?.args || '').includes('toolInput.args'),
  'router generic runner passes toolInput.args to business tool',
);
check(
  String(nodeByName(routerTool, 'Run Routed Tool')?.parameters?.workflowInputs?.value?.actorId || '').includes('toolInput.actorId'),
  'router generic runner passes toolInput.actorId to business tool',
);
check(
  !Object.prototype.hasOwnProperty.call(nodeByName(routerTool, 'Run Routed Tool')?.parameters?.workflowInputs?.value || {}, 'config'),
  'router generic runner no longer passes config to business tool',
);

const routerWrapperPath = path.join(
  rootDir,
  'scripts/workflows/import/import-momo-ai-assistant-tool-router-workflow.sh',
);
const routerWrapperText = fs.readFileSync(routerWrapperPath, 'utf8');
check(
  routerWrapperText.includes('WORKFLOW_AUTO_ACTIVATE="true"'),
  'router import wrapper auto-activates the router workflow after import',
);

const buildUnsupportedRouterResultCode = String(nodeByName(routerTool, 'Build Unsupported Router Result')?.parameters?.jsCode || '');
check(buildUnsupportedRouterResultCode.includes('deliveryPlan'), 'unsupported router result returns deliveryPlan');
check(buildUnsupportedRouterResultCode.includes('destinations'), 'unsupported router result returns destinations');

const healthcheckConfigCode = String(nodeByName(healthcheckTool, 'Config Main')?.parameters?.jsCode || '');
check(!healthcheckConfigCode.includes('ggChatWebhookUrl'), 'healthcheck tool no longer duplicates ggChatWebhookUrl config');

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
  Array.isArray(nodeByName(healthcheckTool, 'When Executed by Another Workflow')?.parameters?.workflowInputs?.values),
  'healthcheck tool trigger uses workflowInputs',
);
check(
  (nodeByName(healthcheckTool, 'When Executed by Another Workflow')?.parameters?.workflowInputs?.values || [])
    .some((item) => item.name === 'actorId'),
  'healthcheck tool trigger accepts actorId input',
);
check(
  (nodeByName(healthcheckTool, 'When Executed by Another Workflow')?.parameters?.workflowInputs?.values || [])
    .some((item) => item.name === 'args' && item.type === 'object'),
  'healthcheck tool trigger accepts args object input',
);
check(
  !(nodeByName(healthcheckTool, 'When Executed by Another Workflow')?.parameters?.workflowInputs?.values || [])
    .some((item) => ['config', 'resolvedToolName', 'commandType'].includes(item.name)),
  'healthcheck tool trigger keeps minimal input contract',
);

const healthcheckToolConfigMainCode = String(nodeByName(healthcheckTool, 'Config Main')?.parameters?.jsCode || '');
check(
  healthcheckToolConfigMainCode.includes('const config = {'),
  'healthcheck tool Config Main defines local config source-of-truth',
);

const buildHealthcheckResultCode = String(nodeByName(healthcheckTool, 'Build Healthcheck Result')?.parameters?.jsCode || '');
check(buildHealthcheckResultCode.includes('deliveryPlan'), 'healthcheck tool returns deliveryPlan');
check(buildHealthcheckResultCode.includes('destinations'), 'healthcheck tool returns destinations');
check(buildHealthcheckResultCode.includes('replySummary'), 'healthcheck tool includes replySummary message when reply destination is enabled');
check(buildHealthcheckResultCode.includes('summaryCardPayload'), 'healthcheck tool still builds summaryCardPayload');
check(!buildHealthcheckResultCode.includes('mode:'), 'healthcheck tool thread config no longer uses mode');
check(!buildHealthcheckResultCode.includes('threadKeyHint'), 'healthcheck tool no longer uses threadKeyHint');

const buildNoActiveSprintResultCode = String(nodeByName(healthcheckTool, 'Build No Active Sprint Result')?.parameters?.jsCode || '');
check(buildNoActiveSprintResultCode.includes('deliveryPlan'), 'no-active-sprint result returns deliveryPlan');
check(buildNoActiveSprintResultCode.includes('destinations'), 'no-active-sprint result returns destinations');
check(!buildNoActiveSprintResultCode.includes('resultData'), 'no-active-sprint result drops unused resultData payload');
check(!buildNoActiveSprintResultCode.includes('mode:'), 'no-active-sprint thread config no longer uses mode');
check(!buildNoActiveSprintResultCode.includes('threadKeyHint'), 'no-active-sprint result no longer uses threadKeyHint');

for (const name of ['When Executed by Another Workflow', 'Build Demo Command Result']) {
  check(Boolean(nodeByName(demoTool, name)), `demo tool node exists: ${name}`);
}

const buildDemoCommandResultCode = String(nodeByName(demoTool, 'Build Demo Command Result')?.parameters?.jsCode || '');
check(buildDemoCommandResultCode.includes('deliveryPlan'), 'demo command tool returns deliveryPlan');
check(buildDemoCommandResultCode.includes('destinations'), 'demo command tool returns destinations');
check(!buildDemoCommandResultCode.includes('toolType'), 'demo command tool drops unused toolType metadata');
check(!buildDemoCommandResultCode.includes('mode:'), 'demo command thread config no longer uses mode');
check(!buildDemoCommandResultCode.includes('threadKeyHint'), 'demo command thread config no longer uses threadKeyHint');
check(
  !(nodeByName(demoTool, 'When Executed by Another Workflow')?.parameters?.workflowInputs?.values || [])
    .some((item) => ['resolvedToolName', 'commandType', 'config'].includes(item.name)),
  'demo tool trigger keeps minimal input contract',
);

check(Boolean(nodeByName(stateCleanup, 'Schedule Trigger')), 'state cleanup workflow has Schedule Trigger');
check(
  String(nodeByName(stateCleanup, 'Schedule Trigger')?.parameters?.rule?.interval?.[0]?.expression || '') === '0 3 * * *',
  'state cleanup workflow keeps daily cleanup cron 0 3 * * *',
);

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
