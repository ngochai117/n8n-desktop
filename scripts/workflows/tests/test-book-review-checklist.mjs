#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const workflowPath = path.resolve(process.argv[2] || path.join(rootDir, 'workflows/book-review/book-review.workflow.json'));

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

function assignmentMap(node) {
  const map = new Map();
  const assignments = node?.parameters?.assignments?.assignments || [];
  for (const assignment of assignments) {
    map.set(String(assignment?.name || ''), assignment);
  }
  return map;
}

if (!fs.existsSync(workflowPath)) {
  console.error(`[book-review-checklist] Missing workflow template: ${workflowPath}`);
  process.exit(1);
}

const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const serialized = JSON.stringify(workflow);
const obsoleteWorkflowName = ['Book', 'Review', 'AI', 'Agent'].join(' ');
const obsoleteWorkflowPath = ['book-review', 'ai', 'agent.workflow.json'].join('-');
const obsoleteDriveKey = ['gg', 'Drive', 'RootFolderId'].join('');
const obsoleteQcPromptRef = ['master', '_prompt'].join('');

check(workflow.name === 'Book Review', 'workflow name is Book Review');
check(!serialized.includes(obsoleteWorkflowName), 'workflow JSON has no obsolete alternate naming');
check(!serialized.includes(obsoleteWorkflowPath), 'workflow JSON has no obsolete alternate path');

const requiredNodes = [
  'Telegram Trigger',
  'Config Main',
  'Send Creating Outline Message',
  'Outline AI Agent',
  'Structured Outline Output Parser',
  'Manifest AI Agent',
  'Structured Expand Output Parser',
  'QC AI Agent',
  'Structured Output Parser',
  'Prepare Manifest',
  'Convert Manifest to File',
  'GG Drive Manager Save Manifest',
  'Convert Content Readable to File',
  'GG Drive Manager Save Content Readable',
  'Merge',
  'Delete Loading Message',
  'Send Review Message',
];

for (const name of requiredNodes) {
  check(Boolean(nodeByName(workflow, name)), `required node exists: ${name}`);
}

const forbiddenNodes = [
  'When chat message received',
  'Switch',
  'Edit a text message',
  'Send Creating Outline Message1',
];

for (const name of forbiddenNodes) {
  check(!nodeByName(workflow, name), `obsolete node removed: ${name}`);
}

const configMain = nodeByName(workflow, 'Config Main');
const configAssignments = assignmentMap(configMain);
check(configAssignments.has('masterPrompt'), 'Config Main exposes masterPrompt');
check(configAssignments.has('telegramChatId'), 'Config Main exposes telegramChatId');
check(configAssignments.has('chatInput'), 'Config Main exposes chatInput');
check(configAssignments.has('gdriveRootFolderId'), 'Config Main exposes gdriveRootFolderId');
check(!configAssignments.has(obsoleteDriveKey), 'Config Main no longer uses obsolete Drive root key');
check(!(configMain?.parameters?.assignments?.assignments || []).some((item) => String(item?.name || '').trim() === ''), 'Config Main has no blank assignments');
check(!String(configAssignments.get('telegramChatId')?.value || '').includes('callback_query'), 'Config Main telegramChatId does not depend on callback data');
check(!String(configAssignments.get('chatInput')?.value || '').includes('callback_query'), 'Config Main chatInput does not depend on callback data');

const trigger = nodeByName(workflow, 'Telegram Trigger');
check(Array.isArray(trigger?.parameters?.updates) && trigger.parameters.updates.length === 1 && trigger.parameters.updates[0] === 'message', 'Telegram Trigger listens to message updates only');

const configMainOutput = workflow.connections?.['Config Main']?.main?.[0]?.[0]?.node || '';
check(configMainOutput === 'Send Creating Outline Message', 'Config Main flows directly into Send Creating Outline Message');

const outlineAgent = nodeByName(workflow, 'Outline AI Agent');
const manifestAgent = nodeByName(workflow, 'Manifest AI Agent');
const qcAgent = nodeByName(workflow, 'QC AI Agent');
check(String(outlineAgent?.parameters?.options?.systemMessage || '').includes('masterPrompt'), 'Outline AI Agent reads masterPrompt');
check(String(manifestAgent?.parameters?.options?.systemMessage || '').includes('masterPrompt'), 'Manifest AI Agent reads masterPrompt');
check(String(qcAgent?.parameters?.options?.systemMessage || '').includes('masterPrompt'), 'QC AI Agent reads masterPrompt');
check(!String(qcAgent?.parameters?.options?.systemMessage || '').includes(obsoleteQcPromptRef), 'QC AI Agent does not use stale QC prompt reference');

const convertManifest = nodeByName(workflow, 'Convert Manifest to File');
const convertReadable = nodeByName(workflow, 'Convert Content Readable to File');
check(convertManifest?.parameters?.options?.fileName === 'review_manifest.json', 'manifest file name is canonical');
check(convertReadable?.parameters?.options?.fileName === 'review_readable.txt', 'readable file name is canonical');

const saveManifest = nodeByName(workflow, 'GG Drive Manager Save Manifest');
const saveReadable = nodeByName(workflow, 'GG Drive Manager Save Content Readable');
check(saveManifest?.parameters?.workflowInputs?.value?.fileName === 'review_manifest.json', 'Drive manifest upsert uses canonical file name');
check(saveReadable?.parameters?.workflowInputs?.value?.fileName === 'review_readable.txt', 'Drive readable upsert uses canonical file name');
check(String(saveManifest?.parameters?.workflowInputs?.value?.rootFolderId || '').includes('gdriveRootFolderId'), 'Drive manifest upsert reads gdriveRootFolderId');
check(String(saveReadable?.parameters?.workflowInputs?.value?.rootFolderId || '').includes('gdriveRootFolderId'), 'Drive readable upsert reads gdriveRootFolderId');

const sendReviewMessage = nodeByName(workflow, 'Send Review Message');
check(!Object.prototype.hasOwnProperty.call(sendReviewMessage?.parameters || {}, 'replyMarkup'), 'Send Review Message has no inline action markup');
check(!Object.prototype.hasOwnProperty.call(sendReviewMessage?.parameters || {}, 'inlineKeyboard'), 'Send Review Message has no inline keyboard');

const mergeNode = nodeByName(workflow, 'Merge');
check(mergeNode?.parameters?.mode === 'combine', 'Merge node still combines persisted outputs');

const summary = `[book-review-checklist] passed=${passes.length} failed=${failures.length}`;
console.log(summary);
for (const message of passes) {
  console.log(`PASS ${message}`);
}
if (failures.length > 0) {
  for (const message of failures) {
    console.error(`FAIL ${message}`);
  }
  process.exit(1);
}
