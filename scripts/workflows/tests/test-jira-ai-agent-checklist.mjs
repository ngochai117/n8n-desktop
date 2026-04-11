#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const rootDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../..',
);

const workflowPath = path.resolve(
  process.argv[2] || path.join(rootDir, 'workflows/ui-synced/Jira/jira-ai-agent.workflow.json'),
);
const wrapperPath = path.join(rootDir, 'scripts/workflows/import/import-jira-ai-agent-workflow.sh');
const registryPath = path.join(rootDir, 'workflow-registry.json');

const failures = [];
const passes = [];

function check(condition, message) {
  if (condition) {
    passes.push(message);
  } else {
    failures.push(message);
  }
}

function nodeByName(workflow, name) {
  return (workflow.nodes || []).find((node) => node.name === name) || null;
}

function hasMainConnection(workflow, from, to) {
  const entries = (workflow.connections?.[from]?.main || []).flat();
  return entries.some((entry) => entry?.node === to);
}

function hasAiConnection(workflow, from, connectionType, to) {
  const entries = (workflow.connections?.[from]?.[connectionType] || []).flat();
  return entries.some((entry) => entry?.node === to);
}

check(fs.existsSync(workflowPath), `workflow template exists: ${path.relative(rootDir, workflowPath)}`);
check(fs.existsSync(wrapperPath), `import wrapper exists: ${path.relative(rootDir, wrapperPath)}`);
check(fs.existsSync(registryPath), `registry exists: ${path.relative(rootDir, registryPath)}`);

if (failures.length > 0) {
  console.error('[jira-ai-agent-checklist] FAIL');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const wrapperText = fs.readFileSync(wrapperPath, 'utf8');

check(workflow.name === 'Jira AI Agent', 'workflow name is correct');
check(!workflow.nodes.some((node) => node.type === 'n8n-nodes-base.executeWorkflow'), 'workflow does not use subworkflow nodes');

for (const name of [
  'Manual Trigger',
  'Google Chat Webhook',
  'Local Chat Trigger',
  'Build Event',
  'Config Main',
  'Build Agent Context',
  'AI Agent',
  'Agent Model',
  'Structured Jira Agent Output Parser',
  'Jira Tool',
  'HTTP Generic',
  'Get Members',
  'Simple Memory',
  'Normalize Agent Result',
  'Get Members Directory',
  'Render Mentioned Messages',
  'Prepare GGChat Delivery Messages',
  'If Has GGChat Delivery Messages?',
  'Split Out GGChat Delivery Messages',
  'Loop Over GGChat Delivery Messages',
  'Send GGChat Delivery Message',
  'Build Final Response',
]) {
  check(Boolean(nodeByName(workflow, name)), `required node exists: ${name}`);
}

check(hasMainConnection(workflow, 'Manual Trigger', 'Build Event'), 'manual trigger routes to Build Event');
check(hasMainConnection(workflow, 'Google Chat Webhook', 'Build Event'), 'webhook routes to Build Event');
check(hasMainConnection(workflow, 'Local Chat Trigger', 'Build Event'), 'local chat trigger routes to Build Event');
check(hasMainConnection(workflow, 'Build Event', 'Config Main'), 'Build Event routes to Config Main');
check(hasMainConnection(workflow, 'Config Main', 'Build Agent Context'), 'Config Main routes to Build Agent Context');
check(hasMainConnection(workflow, 'Build Agent Context', 'AI Agent'), 'Build Agent Context routes to AI Agent');
check(hasMainConnection(workflow, 'AI Agent', 'Normalize Agent Result'), 'AI Agent routes to Normalize Agent Result');
check(hasMainConnection(workflow, 'Normalize Agent Result', 'Get Members Directory'), 'Normalize Agent Result routes to Get Members Directory');
check(hasMainConnection(workflow, 'Get Members Directory', 'Render Mentioned Messages'), 'Get Members Directory routes to Render Mentioned Messages');
check(hasMainConnection(workflow, 'Render Mentioned Messages', 'Prepare GGChat Delivery Messages'), 'Render Mentioned Messages routes to Prepare GGChat Delivery Messages');
check(hasMainConnection(workflow, 'Prepare GGChat Delivery Messages', 'If Has GGChat Delivery Messages?'), 'delivery prep routes to IF');
check(hasMainConnection(workflow, 'Split Out GGChat Delivery Messages', 'Loop Over GGChat Delivery Messages'), 'split out routes to loop');
check(hasMainConnection(workflow, 'Loop Over GGChat Delivery Messages', 'Send GGChat Delivery Message'), 'loop routes to sender');

const webhookNode = nodeByName(workflow, 'Google Chat Webhook');
check(webhookNode?.parameters?.path === 'jira-ai-agent', 'webhook path is jira-ai-agent');

const aiAgentNode = nodeByName(workflow, 'AI Agent');
const aiPrompt = String(aiAgentNode?.parameters?.options?.systemMessage || '');
check(aiPrompt.includes('INLINE_SAFE_WRITES'), 'AI prompt documents inline safe writes phase');
check(aiPrompt.includes('"toolName": "jiraAgent"'), 'AI prompt documents the required JSON contract');
check(aiPrompt.includes('Không dùng DELETE trong workflow này'), 'AI prompt blocks DELETE writes');
check(aiPrompt.includes('Được phép same-turn Jira writes'), 'AI prompt allows same-turn Jira writes');
check(aiPrompt.includes('ưu tiên assignee hiện tại'), 'AI prompt prefers assignee for direct action mentions');
check(aiPrompt.includes('ưu tiên reporter hoặc requester'), 'AI prompt prefers reporter/requester when asking for context');
check(aiPrompt.includes('204 No Content'), 'AI prompt treats 204 No Content as write success');
check(aiPrompt.includes('@<local-part email>'), 'AI prompt instructs agent to use @handle mentions');
check(aiAgentNode?.parameters?.hasOutputParser === true, 'AI Agent requires specific output format');
check(hasAiConnection(workflow, 'Structured Jira Agent Output Parser', 'ai_outputParser', 'AI Agent'), 'structured output parser wired to AI Agent');

const jiraToolNode = nodeByName(workflow, 'Jira Tool');
check(jiraToolNode?.type === 'n8n-nodes-base.httpRequestTool', 'Jira Tool uses httpRequestTool');
check(jiraToolNode?.parameters?.nodeCredentialType === 'jiraSoftwareServerPatApi', 'Jira Tool uses Jira credential type');
check(String(jiraToolNode?.parameters?.method || '').includes("$fromAI('method'"), 'Jira Tool allows AI-selected HTTP method');
check(jiraToolNode?.parameters?.sendBody === true, 'Jira Tool enables request body');
check(jiraToolNode?.parameters?.specifyBody === 'json', 'Jira Tool sends JSON body');
check(String(jiraToolNode?.parameters?.jsonBody || '').includes("$fromAI('body'"), 'Jira Tool accepts AI-provided JSON body');
check(jiraToolNode?.parameters?.options?.response?.response?.fullResponse === true, 'Jira Tool returns full HTTP response');
check(jiraToolNode?.parameters?.options?.response?.response?.neverError === true, 'Jira Tool never errors on non-2xx/empty-body responses');
check(jiraToolNode?.parameters?.options?.response?.response?.responseFormat === 'autodetect', 'Jira Tool autodetects response format');

const genericToolNode = nodeByName(workflow, 'HTTP Generic');
check(String(genericToolNode?.parameters?.method || '').includes("$fromAI('method'"), 'HTTP Generic allows AI-selected HTTP method');
check(genericToolNode?.parameters?.sendBody === true, 'HTTP Generic enables request body');
check(genericToolNode?.parameters?.specifyBody === 'json', 'HTTP Generic sends JSON body');
check(String(genericToolNode?.parameters?.jsonBody || '').includes("$fromAI('body'"), 'HTTP Generic accepts AI-provided JSON body');
check(genericToolNode?.parameters?.options?.response?.response?.fullResponse === true, 'HTTP Generic returns full HTTP response');
check(genericToolNode?.parameters?.options?.response?.response?.neverError === true, 'HTTP Generic never errors on non-2xx/empty-body responses');
check(genericToolNode?.parameters?.options?.response?.response?.responseFormat === 'autodetect', 'HTTP Generic autodetects response format');

const parserNode = nodeByName(workflow, 'Structured Jira Agent Output Parser');
const parserSchema = String(parserNode?.parameters?.jsonSchemaExample || '');
check(parserNode?.type === '@n8n/n8n-nodes-langchain.outputParserStructured', 'Structured Jira Agent Output Parser uses structured output parser node');
check(parserSchema.includes('"toolName": "jiraAgent"'), 'structured output schema includes jiraAgent toolName');
check(parserSchema.includes('"deliveryPlan"'), 'structured output schema includes deliveryPlan');
check(parserSchema.includes('"meta"'), 'structured output schema includes meta');

const normalizeNode = nodeByName(workflow, 'Normalize Agent Result');
const normalizeCode = String(normalizeNode?.parameters?.jsCode || '');
check(normalizeCode.includes("toolName: 'jiraAgent'"), 'Normalize Agent Result sets toolName to jiraAgent');
check(normalizeCode.includes('defaultDestinationsForChannel'), 'Normalize Agent Result provides delivery defaults');
check(normalizeCode.includes("agent.output && typeof agent.output === 'object'"), 'Normalize Agent Result reads structured output object');
check(!normalizeCode.includes('tryParseJson'), 'Normalize Agent Result no longer parses JSON strings');
check(!normalizeCode.includes('extractJsonText'), 'Normalize Agent Result no longer extracts JSON from text');
check(normalizeCode.includes('Mình chưa thể xác nhận Jira write đã thực thi'), 'Normalize Agent Result has safe action fallback');

const renderNode = nodeByName(workflow, 'Render Mentioned Messages');
const renderCode = String(renderNode?.parameters?.jsCode || '');
check(renderCode.includes('mentionText'), 'Render Mentioned Messages builds mention tokens');
check(renderCode.includes("return prefix + '*@' + handle + '*'"), 'Render Mentioned Messages bolds resolved handles');
check(renderCode.includes('buildMentionFooter'), 'Render Mentioned Messages builds ordered mention footer');
check(renderCode.includes('left.offset - right.offset'), 'Render Mentioned Messages sorts mentions by first appearance');
check(renderCode.includes('normalized.jira_username'), 'Render Mentioned Messages supports Jira username mapping');
check(
  renderCode.includes('const finalText = footer.mentionTail') &&
    renderCode.includes("renderedText + '\\n' + footer.mentionTail") &&
    renderCode.includes('appendedMentionIds'),
  'Render Mentioned Messages appends mention footer',
);

const membersDirectoryNode = nodeByName(workflow, 'Get Members Directory');
check(membersDirectoryNode?.type === 'n8n-nodes-base.googleSheets', 'Get Members Directory uses regular Google Sheets node');
check(nodeByName(workflow, 'Agent Model')?.parameters?.options?.responseFormat === 'json_object', 'Agent Model requests json_object responses');
check(nodeByName(workflow, 'Config Main')?.parameters?.jsCode.includes("writeMode: 'inline-safe-writes'"), 'Config Main sets inline safe writes mode');

check(nodeByName(workflow, 'Build Event')?.parameters?.mode === 'runOnceForEachItem', 'Build Event uses runOnceForEachItem');
check(nodeByName(workflow, 'Config Main')?.parameters?.mode === 'runOnceForEachItem', 'Config Main uses runOnceForEachItem');
check(nodeByName(workflow, 'Build Agent Context')?.parameters?.mode === 'runOnceForEachItem', 'Build Agent Context uses runOnceForEachItem');
check(nodeByName(workflow, 'Normalize Agent Result')?.parameters?.mode === 'runOnceForEachItem', 'Normalize Agent Result uses runOnceForEachItem');
check(nodeByName(workflow, 'Get Members Directory')?.parameters?.filtersUI?.values?.length === 0, 'Get Members Directory loads shared directory without filters');
check(nodeByName(workflow, 'Render Mentioned Messages')?.parameters?.mode === 'runOnceForAllItems', 'Render Mentioned Messages uses runOnceForAllItems');
check(nodeByName(workflow, 'Prepare GGChat Delivery Messages')?.parameters?.mode === 'runOnceForEachItem', 'Prepare GGChat Delivery Messages uses runOnceForEachItem');
check(nodeByName(workflow, 'Split Out GGChat Delivery Messages')?.parameters?.mode === 'runOnceForAllItems', 'Split Out GGChat Delivery Messages uses runOnceForAllItems');
check(nodeByName(workflow, 'Build Final Response')?.parameters?.mode === 'runOnceForEachItem', 'Build Final Response uses runOnceForEachItem');

for (const node of workflow.nodes || []) {
  const code = node?.parameters?.jsCode;
  if (typeof code !== 'string') continue;

  let syntaxOk = true;
  try {
    new vm.Script(`(function(){\n${code}\n})`, { filename: node.name });
  } catch (error) {
    syntaxOk = false;
  }

  check(syntaxOk, `code node syntax is valid: ${node.name}`);
}

const registryEntry = registry.workflows?.['Jira AI Agent'];
check(Boolean(registryEntry), 'registry entry exists for Jira AI Agent');
check(
  registryEntry?.template === 'workflows/ui-synced/Jira/jira-ai-agent.workflow.json',
  'registry template points to Jira AI Agent workflow',
);
check(
  registryEntry?.templateImport === 'scripts/workflows/import/import-jira-ai-agent-workflow.sh',
  'registry import wrapper points to Jira AI Agent script',
);

check(
  wrapperText.includes('workflows/ui-synced/Jira/jira-ai-agent.workflow.json'),
  'import wrapper points to Jira AI Agent template',
);
check(
  wrapperText.includes('WORKFLOW_REGISTRY_IMPORT="scripts/workflows/import/import-jira-ai-agent-workflow.sh"'),
  'import wrapper updates registry import metadata',
);

if (failures.length > 0) {
  console.error('[jira-ai-agent-checklist] FAIL');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log('[jira-ai-agent-checklist] PASS');
for (const message of passes) {
  console.log(`- ${message}`);
}
