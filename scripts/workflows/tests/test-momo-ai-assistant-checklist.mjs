#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../..',
);

const workflowPath = path.resolve(
  process.argv[2] || path.join(rootDir, 'workflows/ui-synced/MoMo/momo-ai-assistant.workflow.json'),
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

function hasConnection(workflow, from, to) {
  const entries = (workflow.connections?.[from]?.main || []).flat();
  return entries.some((entry) => entry?.node === to);
}

function hasAiConnection(workflow, from, to, type) {
  const entries = (workflow.connections?.[from]?.[type] || []).flat();
  return entries.some((entry) => entry?.node === to);
}

if (!fs.existsSync(workflowPath)) {
  console.error(`[momo-ai-assistant-checklist] Missing workflow template: ${workflowPath}`);
  process.exit(1);
}

const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

check(workflow.name === 'MoMo AI Assistant', 'workflow name is MoMo AI Assistant');

const requiredNodes = [
  'Manual Trigger',
  'Schedule Trigger',
  'Config Main',
  'Write Sprint Review',
  'Review Model',
  'Get user',
  'HTTP Generic',
  'Send GGChat Webhook',
];

for (const name of requiredNodes) {
  check(Boolean(nodeByName(workflow, name)), `required node exists: ${name}`);
}

check((workflow.nodes || []).length === 8, 'workflow has 8 nodes (trigger + config + agent + tools + ggchat)');

for (const legacyNode of [
  'Get Active Sprint',
  'Pick Active Sprint',
  'If Active Sprint?',
  'Get Sprint Issues',
  'Prepare AI Input',
  'Aggregate Sprint Metrics',
  'Merge Sprint + Users',
  'No Active Sprint Output',
  'Review Output Parser',
  'Get user in sheet',
  'Build Final Report',
]) {
  check(!nodeByName(workflow, legacyNode), `legacy node removed: ${legacyNode}`);
}

const configCode = String(nodeByName(workflow, 'Config Main')?.parameters?.jsCode || '');
for (const token of [
  'boardId',
  'projectId',
  'jiraBaseUrl',
  'timeZone',
  'storyPointFieldKey',
  'qcsFieldKey',
  'spreadsheetId',
  'spreadsheetSheetName',
  'ggChatWebhookUrl',
  'nowIso',
]) {
  check(configCode.includes(token), `Config Main includes token: ${token}`);
}

const reviewAgent = nodeByName(workflow, 'Write Sprint Review');
check(reviewAgent?.type === '@n8n/n8n-nodes-langchain.agent', 'Write Sprint Review uses AI agent node');
check(reviewAgent?.parameters?.hasOutputParser === false, 'Write Sprint Review output parser is disabled');

const prompt = String(reviewAgent?.parameters?.options?.systemMessage || '');
for (const token of [
  'HTTP Generic',
  'Get user',
  'storyPointFieldKey',
  'qcsFieldKey',
  '- FE passed:',
  '- BE passed:',
  '*WARNINGS*:',
  '<users/{id}>',
]) {
  check(prompt.includes(token), `Write Sprint Review prompt includes: ${token}`);
}
check(
  prompt.includes('active sprint') || prompt.includes('Sprint đang active'),
  'Write Sprint Review prompt includes active sprint condition',
);

const getUserTool = nodeByName(workflow, 'Get user');
check(getUserTool?.type === 'n8n-nodes-base.googleSheetsTool', 'Get user uses Google Sheets tool node');
check(
  String(getUserTool?.parameters?.documentId?.value || '').includes('spreadsheetId'),
  'Get user reads spreadsheetId from Config Main',
);
check(
  String(getUserTool?.parameters?.sheetName?.value || '').includes('spreadsheetSheetName'),
  'Get user reads sheetName from Config Main',
);

const httpGenericTool = nodeByName(workflow, 'HTTP Generic');
check(httpGenericTool?.type === 'n8n-nodes-base.httpRequestTool', 'HTTP Generic uses HTTP Request tool node');
check(
  String(httpGenericTool?.parameters?.nodeCredentialType || '') === 'jiraSoftwareServerPatApi',
  'HTTP Generic uses Jira credential type',
);

const sendNode = nodeByName(workflow, 'Send GGChat Webhook');
check(sendNode?.parameters?.method === 'POST', 'Send GGChat Webhook uses POST');
check(
  String(sendNode?.parameters?.jsonBody || '').includes('text'),
  'Send GGChat Webhook sends text payload',
);
check(sendNode?.executeOnce === true, 'Send GGChat Webhook executes once');
check(
  String(sendNode?.parameters?.url || '').includes('Config Main'),
  'Send GGChat Webhook has Config Main URL fallback',
);

check(
  hasConnection(workflow, 'Manual Trigger', 'Config Main'),
  'Manual Trigger routes to Config Main',
);
check(
  hasConnection(workflow, 'Schedule Trigger', 'Config Main'),
  'Schedule Trigger routes to Config Main',
);
check(
  hasConnection(workflow, 'Config Main', 'Write Sprint Review'),
  'Config Main routes to Write Sprint Review',
);
check(
  hasConnection(workflow, 'Write Sprint Review', 'Send GGChat Webhook'),
  'Write Sprint Review routes to Send GGChat Webhook',
);
check(
  hasAiConnection(workflow, 'Review Model', 'Write Sprint Review', 'ai_languageModel'),
  'Review Model is connected as ai_languageModel',
);
check(
  hasAiConnection(workflow, 'Get user', 'Write Sprint Review', 'ai_tool'),
  'Get user is connected as ai_tool',
);
check(
  hasAiConnection(workflow, 'HTTP Generic', 'Write Sprint Review', 'ai_tool'),
  'HTTP Generic is connected as ai_tool',
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
