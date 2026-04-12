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
const deliveryWorkflowPath = path.join(rootDir, 'workflows/ui-synced/Jira/jira-ai-agent-google-chat-delivery.workflow.json');
const deliveryWrapperPath = path.join(rootDir, 'scripts/workflows/import/import-jira-ai-agent-google-chat-delivery-workflow.sh');
const versionsWorkflowPath = path.join(rootDir, 'workflows/ui-synced/Jira/jira-project-versions-query.workflow.json');
const versionsWrapperPath = path.join(rootDir, 'scripts/workflows/import/import-jira-project-versions-query-workflow.sh');
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
check(fs.existsSync(deliveryWorkflowPath), `delivery workflow template exists: ${path.relative(rootDir, deliveryWorkflowPath)}`);
check(fs.existsSync(deliveryWrapperPath), `delivery import wrapper exists: ${path.relative(rootDir, deliveryWrapperPath)}`);
check(fs.existsSync(versionsWorkflowPath), `versions workflow template exists: ${path.relative(rootDir, versionsWorkflowPath)}`);
check(fs.existsSync(versionsWrapperPath), `versions import wrapper exists: ${path.relative(rootDir, versionsWrapperPath)}`);
check(fs.existsSync(registryPath), `registry exists: ${path.relative(rootDir, registryPath)}`);

if (failures.length > 0) {
  console.error('[jira-ai-agent-checklist] FAIL');
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
const deliveryWorkflow = JSON.parse(fs.readFileSync(deliveryWorkflowPath, 'utf8'));
const versionsWorkflow = JSON.parse(fs.readFileSync(versionsWorkflowPath, 'utf8'));
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const wrapperText = fs.readFileSync(wrapperPath, 'utf8');
const deliveryWrapperText = fs.readFileSync(deliveryWrapperPath, 'utf8');
const versionsWrapperText = fs.readFileSync(versionsWrapperPath, 'utf8');

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
  'Jira Project Versions Query Tool',
  'HTTP Request',
  'Google Chat Batch Delivery Tool',
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
check(hasMainConnection(workflow, 'Render Mentioned Messages', 'Build Final Response'), 'Render Mentioned Messages routes directly to Build Final Response');
check(!hasMainConnection(workflow, 'Render Mentioned Messages', 'Prepare GGChat Delivery Messages'), 'legacy delivery branch is disconnected from Render Mentioned Messages');
check(!hasMainConnection(workflow, 'Prepare GGChat Delivery Messages', 'If Has GGChat Delivery Messages?'), 'legacy delivery prep is disconnected');
check(!hasMainConnection(workflow, 'Split Out GGChat Delivery Messages', 'Loop Over GGChat Delivery Messages'), 'legacy delivery loop is disconnected');
check(!hasMainConnection(workflow, 'Loop Over GGChat Delivery Messages', 'Send GGChat Delivery Message'), 'legacy delivery sender is disconnected');

const webhookNode = nodeByName(workflow, 'Google Chat Webhook');
check(webhookNode?.parameters?.path === 'jira-ai-agent', 'webhook path is jira-ai-agent');

const aiAgentNode = nodeByName(workflow, 'AI Agent');
const aiPrompt = String(aiAgentNode?.parameters?.options?.systemMessage || '');
check(aiPrompt.includes('INLINE_SAFE_WRITES'), 'AI prompt documents inline safe writes phase');
check(aiPrompt.includes('"toolName": "jiraAgent"'), 'AI prompt documents the required JSON contract');
check(aiPrompt.includes('Không dùng DELETE trong workflow này'), 'AI prompt blocks DELETE writes');
check(aiPrompt.includes('Được phép same-turn Jira writes'), 'AI prompt allows same-turn Jira writes');
check(aiAgentNode?.parameters?.options?.maxIterations === 25, 'AI Agent maxIterations is raised to 25');
check(aiPrompt.includes('`jira_project_versions_query`'), 'AI prompt mentions the dedicated project versions query tool');
check(aiPrompt.includes('không gọi thêm tool phụ chỉ để enrich lại cùng dữ liệu đó'), 'AI prompt avoids redundant enrichment when issue payload is already sufficient');
check(aiPrompt.includes('ưu tiên assignee hiện tại'), 'AI prompt prefers assignee for direct action mentions');
check(aiPrompt.includes('ưu tiên reporter hoặc requester'), 'AI prompt prefers reporter/requester when asking for context');
check(aiPrompt.includes('@<local-part email>'), 'AI prompt instructs agent to use @handle mentions');
check(aiPrompt.includes('*@hai.nguyen8*'), 'AI prompt instructs agent to bold @handle using Google Chat formatting');
check(aiPrompt.includes('google_chat_batch_delivery'), 'AI prompt documents google_chat_batch_delivery tool');
check(aiPrompt.includes('dùng tool `google_chat_batch_delivery` đúng 1 lần'), 'AI prompt requires exactly one wrapper call for same-thread Google Chat delivery');
check(aiPrompt.includes('không trả lại các message `pushGoogleChat`'), 'AI prompt prevents duplicate pushGoogleChat output after wrapper delivery');
check(aiPrompt.includes('top-level `thread` + top-level `messages[]`'), 'AI prompt defines flattened delivery contract');
check(aiPrompt.includes('Không dùng `deliveryPlan`'), 'AI prompt forbids deliveryPlan wrapper');
check(aiPrompt.includes('Mỗi item trong `messages[]` chỉ gồm `destination` và `payload`'), 'AI prompt limits messages to destination and payload');
check(aiPrompt.includes('Không dùng `destinations[]`, không dùng `type`, không dùng `messageKey`'), 'AI prompt forbids overlapping message fields');
check(!aiPrompt.includes('Chỉ dùng `Get Members`'), 'AI prompt no longer instructs agent to call Get Members');
check(aiAgentNode?.parameters?.hasOutputParser === true, 'AI Agent requires specific output format');
check(hasAiConnection(workflow, 'Structured Jira Agent Output Parser', 'ai_outputParser', 'AI Agent'), 'structured output parser wired to AI Agent');

const jiraToolNode = nodeByName(workflow, 'Jira Tool');
check(jiraToolNode?.type === 'n8n-nodes-base.httpRequestTool', 'Jira Tool uses httpRequestTool');
check(jiraToolNode?.parameters?.nodeCredentialType === 'jiraSoftwareServerPatApi', 'Jira Tool uses Jira credential type');
check(String(jiraToolNode?.parameters?.toolDescription || '').includes('/rest/agile/1.0/'), 'Jira Tool description documents agile API family');
check(String(jiraToolNode?.parameters?.toolDescription || '').includes('Never call board or sprint endpoints under /rest/api/2'), 'Jira Tool description blocks board/sprint under core API');
check(String(jiraToolNode?.parameters?.toolDescription || '').includes('prefer agile endpoints instead of guessing core API URLs'), 'Jira Tool description prefers agile endpoints for board and sprint resources');
check(String(jiraToolNode?.parameters?.toolDescription || '').includes('prefer the dedicated `jira_project_versions_query` tool'), 'Jira Tool description prefers the dedicated project versions query tool');
check(String(jiraToolNode?.parameters?.toolDescription || '').includes('use those objects directly'), 'Jira Tool description reuses fixVersions objects already present in issue payloads');
check(String(jiraToolNode?.parameters?.toolDescription || '').includes('do not call `jira_project_versions_query` just to enrich the same versions again'), 'Jira Tool description blocks redundant version enrichment calls');
check(String(jiraToolNode?.parameters?.toolDescription || '').includes('outside the current issue list scope'), 'Jira Tool description limits version query lookups to out-of-scope needs');
check(String(jiraToolNode?.parameters?.toolDescription || '').includes('Do not use status names in JQL unless you have verified the exact Jira status value in the same turn'), 'Jira Tool description blocks unverified status names in JQL');
check(String(jiraToolNode?.parameters?.toolDescription || '').includes('prefer fetching issue lists first and evaluating the returned statuses yourself'), 'Jira Tool description prefers evaluating statuses from fetched issues');
check(String(jiraToolNode?.parameters?.toolDescription || '').includes('do not call /rest/agile/1.0/sprint/{id}/complete'), 'Jira Tool description forbids nonexistent sprint complete endpoint');
check(String(jiraToolNode?.parameters?.toolDescription || '').includes('update /rest/agile/1.0/sprint/{id} and set state=closed'), 'Jira Tool description documents sprint state close pattern');
check(String(jiraToolNode?.parameters?.toolDescription || '').includes('204 No Content or empty bodies'), 'Jira Tool description warns that writes may return empty bodies');
check(String(jiraToolNode?.parameters?.method || '').includes("$fromAI('method'"), 'Jira Tool allows AI-selected HTTP method');
check(jiraToolNode?.parameters?.sendBody === true, 'Jira Tool enables request body');
check(jiraToolNode?.parameters?.specifyBody === 'json', 'Jira Tool sends JSON body');
check(String(jiraToolNode?.parameters?.jsonBody || '').includes("$fromAI('body'"), 'Jira Tool accepts AI-provided JSON body');
check(String(jiraToolNode?.parameters?.url || '').includes('/rest/agile/1.0/...'), 'Jira Tool URL hint documents agile API endpoints');
check(String(jiraToolNode?.parameters?.url || '').includes('Never use /rest/api/2/board/...'), 'Jira Tool URL hint blocks wrong board API path');
check(String(jiraToolNode?.parameters?.url || '').includes('never use /rest/agile/1.0/sprint/{id}/complete'), 'Jira Tool URL hint blocks nonexistent sprint complete endpoint');
check(String(jiraToolNode?.parameters?.url || '').includes('{\"state\":\"closed\"}'), 'Jira Tool URL hint documents sprint close request body');
check(jiraToolNode?.parameters?.optimizeResponse === false, 'Jira Tool optimizeResponse is disabled');
check(jiraToolNode?.parameters?.options?.response?.response?.fullResponse === true, 'Jira Tool fullResponse metadata is enabled');
check(jiraToolNode?.parameters?.options?.response?.response?.neverError === true, 'Jira Tool never errors on non-2xx or empty-body responses');
check(jiraToolNode?.parameters?.options?.response?.response?.responseFormat === 'autodetect', 'Jira Tool autodetects response format to survive 204 and text bodies');
check(String(jiraToolNode?.parameters?.dataField || '').includes("$fromAI('Field_Containing_Data'"), 'Jira Tool allows AI-selected data field');
check(jiraToolNode?.parameters?.fieldsToInclude === 'selected', 'Jira Tool supports selecting response fields');
check(String(jiraToolNode?.parameters?.fields || '').includes("$fromAI('Fields'"), 'Jira Tool allows AI-selected response fields');

const transportToolNode = nodeByName(workflow, 'HTTP Request');
check(transportToolNode?.type === 'n8n-nodes-base.httpRequestTool', 'HTTP Request transport node uses httpRequestTool');
check(hasAiConnection(workflow, 'HTTP Request', 'ai_tool', 'AI Agent') === false, 'HTTP Request transport node is disconnected from AI Agent');

const versionsToolNode = nodeByName(workflow, 'Jira Project Versions Query Tool');
check(versionsToolNode?.type === '@n8n/n8n-nodes-langchain.toolWorkflow', 'Jira Project Versions Query Tool uses toolWorkflow');
check(versionsToolNode?.parameters?.name === 'jira_project_versions_query', 'Jira Project Versions Query Tool exposes the expected tool name');
check(String(versionsToolNode?.parameters?.description || '').includes('free-text query, generic field filters, field projection, sorting, and limiting'), 'Jira Project Versions Query Tool description documents query and filter capabilities');
check(String(versionsToolNode?.parameters?.workflowId?.value || '').includes('__REGISTRY__:Jira Project Versions Query'), 'Jira Project Versions Query Tool points to registry-backed versions workflow');
check(hasAiConnection(workflow, 'Jira Project Versions Query Tool', 'ai_tool', 'AI Agent'), 'Jira Project Versions Query Tool is connected to AI Agent');
check(String(versionsToolNode?.parameters?.workflowInputs?.value?.filters || '').includes("$fromAI('filters'"), 'Jira Project Versions Query Tool accepts AI-provided filters');
check(String(versionsToolNode?.parameters?.workflowInputs?.value?.fields || '').includes("$fromAI('fields'"), 'Jira Project Versions Query Tool accepts AI-provided fields');
check(
  Array.isArray(versionsToolNode?.parameters?.workflowInputs?.schema) &&
    versionsToolNode.parameters.workflowInputs.schema.some((field) => field?.id === 'filters' && field?.type === 'string') &&
    versionsToolNode.parameters.workflowInputs.schema.some((field) => field?.id === 'fields' && field?.type === 'string'),
  'Jira Project Versions Query Tool schema keeps filters and fields as string inputs',
);

const googleChatBatchToolNode = nodeByName(workflow, 'Google Chat Batch Delivery Tool');
check(googleChatBatchToolNode?.type === '@n8n/n8n-nodes-langchain.toolWorkflow', 'Google Chat Batch Delivery Tool uses toolWorkflow');
check(googleChatBatchToolNode?.parameters?.name === 'google_chat_batch_delivery', 'Google Chat Batch Delivery Tool exposes the expected tool name');
check(String(googleChatBatchToolNode?.parameters?.description || '').includes('ordered messages array of raw Google Chat webhook payloads'), 'Google Chat Batch Delivery Tool description documents ordered raw payload delivery');
check(String(googleChatBatchToolNode?.parameters?.description || '').includes('Call it exactly once per delivery batch'), 'Google Chat Batch Delivery Tool description requires a single wrapper call per delivery batch');
check(String(googleChatBatchToolNode?.parameters?.description || '').includes('Reuse the current threadKey'), 'Google Chat Batch Delivery Tool description prefers current threadKey reuse');
check(String(googleChatBatchToolNode?.parameters?.description || '').includes('do not wrap payloads inside custom objects like message/body/data'), 'Google Chat Batch Delivery Tool description blocks custom payload wrappers');
check(String(googleChatBatchToolNode?.parameters?.description || '').includes('Do not send empty payloads'), 'Google Chat Batch Delivery Tool description forbids empty payloads');
check(String(googleChatBatchToolNode?.parameters?.description || '').includes('fall back to a text payload instead'), 'Google Chat Batch Delivery Tool description documents text fallback when card payload is invalid');
check(String(googleChatBatchToolNode?.parameters?.workflowId?.value || '').includes('__REGISTRY__:Jira AI Agent Google Chat Delivery'), 'Google Chat Batch Delivery Tool points to registry-backed delivery workflow');
check(hasAiConnection(workflow, 'Google Chat Batch Delivery Tool', 'ai_tool', 'AI Agent'), 'Google Chat Batch Delivery Tool is connected to AI Agent');
check(String(googleChatBatchToolNode?.parameters?.workflowInputs?.value?.messages || '').includes("$fromAI('messages'"), 'Google Chat Batch Delivery Tool accepts AI-provided messages[]');
check(String(googleChatBatchToolNode?.parameters?.workflowInputs?.value?.messages || '').includes('Do not wrap payloads inside custom objects like message/body/data'), 'Google Chat Batch Delivery Tool message input blocks custom payload wrappers');
check(String(googleChatBatchToolNode?.parameters?.workflowInputs?.value?.messages || '').includes('Do not send empty payloads'), 'Google Chat Batch Delivery Tool message input forbids empty payloads');
check(String(googleChatBatchToolNode?.parameters?.workflowInputs?.value?.messages || '').includes('fall back to a text payload instead'), 'Google Chat Batch Delivery Tool message input documents text fallback');
check(
  Array.isArray(googleChatBatchToolNode?.parameters?.workflowInputs?.schema) &&
    googleChatBatchToolNode.parameters.workflowInputs.schema.some((field) => field?.id === 'messages' && field?.type === 'array'),
  'Google Chat Batch Delivery Tool schema keeps messages as array input',
);

const parserNode = nodeByName(workflow, 'Structured Jira Agent Output Parser');
const parserSchema = String(parserNode?.parameters?.jsonSchemaExample || '');
check(parserNode?.type === '@n8n/n8n-nodes-langchain.outputParserStructured', 'Structured Jira Agent Output Parser uses structured output parser node');
check(parserSchema.includes('"toolName": "jiraAgent"'), 'structured output schema includes jiraAgent toolName');
check(parserSchema.includes('"thread"'), 'structured output schema includes thread');
check(parserSchema.includes('"messages"'), 'structured output schema includes messages');
check(parserSchema.includes('"meta"'), 'structured output schema includes meta');
check(parserSchema.includes('"payload": {}'), 'structured output schema keeps payload generic');
check(!parserSchema.includes('"deliveryPlan"'), 'structured output schema no longer includes deliveryPlan');

const normalizeNode = nodeByName(workflow, 'Normalize Agent Result');
const normalizeCode = String(normalizeNode?.parameters?.jsCode || '');
check(normalizeCode.includes("toolName: 'jiraAgent'"), 'Normalize Agent Result sets toolName to jiraAgent');
check(normalizeCode.includes('defaultDestinationForChannel'), 'Normalize Agent Result provides destination defaults');
check(normalizeCode.includes("agent.output && typeof agent.output === 'object'"), 'Normalize Agent Result reads structured output object');
check(!normalizeCode.includes('tryParseJson'), 'Normalize Agent Result no longer parses JSON strings');
check(!normalizeCode.includes('extractJsonText'), 'Normalize Agent Result no longer extracts JSON from text');
check(normalizeCode.includes('Mình chưa thể xác nhận Jira write đã thực thi'), 'Normalize Agent Result has safe action fallback');
check(normalizeCode.includes('hasNonEmptyPayload'), 'Normalize Agent Result rejects empty payload objects');
check(normalizeCode.includes('buildFallbackTextPayload'), 'Normalize Agent Result falls back to text payloads when payload is empty');
check(normalizeCode.includes('parsed.messages || legacyPlan.messages || []'), 'Normalize Agent Result supports new and legacy message contracts');
check(normalizeCode.includes('destination,'), 'Normalize Agent Result writes singular destination field');

const agentPrompt = String(nodeByName(workflow, 'AI Agent')?.parameters?.options?.systemMessage || '');
check(agentPrompt.includes('Không được để `messages[].payload` rỗng'), 'AI Agent prompt forbids empty message payloads');

const renderNode = nodeByName(workflow, 'Render Mentioned Messages');
const renderCode = String(renderNode?.parameters?.jsCode || '');
check(renderCode.includes('mentionText'), 'Render Mentioned Messages builds mention tokens');
check(renderCode.includes("return prefix + '*@' + handle + '*'"), 'Render Mentioned Messages bolds resolved handles');
check(renderCode.includes('buildMentionFooter'), 'Render Mentioned Messages builds ordered mention footer');
check(renderCode.includes('left.offset - right.offset'), 'Render Mentioned Messages sorts mentions by first appearance');
check(renderCode.includes('normalized.jira_username'), 'Render Mentioned Messages supports Jira username mapping');
check(
  renderCode.includes('const finalText = footer.mentionTail') &&
    (renderCode.includes("renderedText + '\\n' + footer.mentionTail") ||
      renderCode.includes("renderedText + '\\\\n' + footer.mentionTail")) &&
    renderCode.includes('appendedMentionIds'),
  'Render Mentioned Messages appends mention footer',
);
check(renderCode.includes("\\*?@([A-Za-z0-9._-]{2,64})\\*?\\b"), 'Render Mentioned Messages recognizes both plain and bold @handle mentions');

const membersDirectoryNode = nodeByName(workflow, 'Get Members Directory');
check(membersDirectoryNode?.type === 'n8n-nodes-base.googleSheets', 'Get Members Directory uses regular Google Sheets node');
check(nodeByName(workflow, 'Agent Model')?.parameters?.options?.responseFormat === 'json_object', 'Agent Model requests json_object responses');
check(nodeByName(workflow, 'Config Main')?.parameters?.jsCode.includes("writeMode: 'inline-safe-writes'"), 'Config Main sets inline safe writes mode');
check(nodeByName(workflow, 'Build Agent Context')?.parameters?.jsCode.includes('jiraAgileApiBaseUrl'), 'Build Agent Context exposes agile Jira API base URL');
check(hasAiConnection(workflow, 'Get Members', 'ai_tool', 'AI Agent') === false, 'Get Members is disconnected from AI Agent');

check(nodeByName(workflow, 'Build Event')?.parameters?.mode === 'runOnceForEachItem', 'Build Event uses runOnceForEachItem');
check(nodeByName(workflow, 'Config Main')?.parameters?.mode === 'runOnceForEachItem', 'Config Main uses runOnceForEachItem');
check(nodeByName(workflow, 'Build Agent Context')?.parameters?.mode === 'runOnceForEachItem', 'Build Agent Context uses runOnceForEachItem');
check(nodeByName(workflow, 'Normalize Agent Result')?.parameters?.mode === 'runOnceForEachItem', 'Normalize Agent Result uses runOnceForEachItem');
check(nodeByName(workflow, 'Get Members Directory')?.parameters?.filtersUI?.values?.length === 0, 'Get Members Directory loads shared directory without filters');
check(
  nodeByName(workflow, 'Render Mentioned Messages')?.parameters?.mode == null ||
    nodeByName(workflow, 'Render Mentioned Messages')?.parameters?.mode === 'runOnceForAllItems',
  'Render Mentioned Messages keeps the default or explicit all-items mode',
);
check(nodeByName(workflow, 'Build Final Response')?.parameters?.mode === 'runOnceForAllItems', 'Build Final Response uses runOnceForAllItems');
check(
  !String(nodeByName(workflow, 'Build Final Response')?.parameters?.jsCode || '').includes('Prepare GGChat Delivery Messages'),
  'Build Final Response no longer depends on the legacy delivery branch',
);

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

check(deliveryWorkflow.name === 'Jira AI Agent Google Chat Delivery', 'delivery workflow name is correct');
for (const name of [
  'When Executed by Another Workflow',
  'Normalize Delivery Request',
  'Get Members Directory',
  'Render Mentioned Messages',
  'If Has Google Chat Messages?',
  'Split Out Messages',
  'Loop Over Messages',
  'Send Google Chat Message',
  'Build Tool Result',
]) {
  check(Boolean(nodeByName(deliveryWorkflow, name)), `delivery workflow node exists: ${name}`);
}

check(hasMainConnection(deliveryWorkflow, 'When Executed by Another Workflow', 'Normalize Delivery Request'), 'delivery trigger routes to Normalize Delivery Request');
check(hasMainConnection(deliveryWorkflow, 'Normalize Delivery Request', 'Get Members Directory'), 'delivery normalize routes to members directory');
check(hasMainConnection(deliveryWorkflow, 'Get Members Directory', 'Render Mentioned Messages'), 'delivery members directory routes to Render Mentioned Messages');
check(hasMainConnection(deliveryWorkflow, 'Render Mentioned Messages', 'If Has Google Chat Messages?'), 'delivery render routes to IF');
check(hasMainConnection(deliveryWorkflow, 'Split Out Messages', 'Loop Over Messages'), 'Split Out Messages routes to Loop Over Messages');
check(hasMainConnection(deliveryWorkflow, 'Loop Over Messages', 'Send Google Chat Message'), 'Loop Over Messages routes to Send Google Chat Message');
check(hasMainConnection(deliveryWorkflow, 'If Has Google Chat Messages?', 'Build Tool Result'), 'delivery IF false branch routes to Build Tool Result');
check(hasMainConnection(deliveryWorkflow, 'Loop Over Messages', 'Build Tool Result'), 'delivery loop completion routes to Build Tool Result');

const deliveryTriggerNode = nodeByName(deliveryWorkflow, 'When Executed by Another Workflow');
const deliveryInputs = deliveryTriggerNode?.parameters?.workflowInputs?.values || [];
check(deliveryTriggerNode?.type === 'n8n-nodes-base.executeWorkflowTrigger', 'delivery workflow uses executeWorkflowTrigger');
check(
  ['threadKey', 'threadSeed', 'webhookUrl', 'messageReplyOption', 'messages'].every((field) =>
    deliveryInputs.some((input) => input?.name === field),
  ),
  'delivery workflow trigger exposes wrapper inputs',
);
check(deliveryInputs.some((input) => input?.name === 'messages' && input?.type === 'array'), 'delivery workflow trigger declares messages as array');

const deliveryNormalizeCode = String(nodeByName(deliveryWorkflow, 'Normalize Delivery Request')?.parameters?.jsCode || '');
check(deliveryNormalizeCode.includes('const rawMessages = Array.isArray(input.messages) ? input.messages : [];'), 'delivery workflow normalizes raw message array input');
check(deliveryNormalizeCode.includes('const finalThreadKey = toText(input.threadKey || \'\') ||'), 'delivery workflow reuses or generates threadKey');
check(deliveryNormalizeCode.includes('requestUrl = baseUrl + separator + \'threadKey=\''), 'delivery workflow builds request URL with threadKey');
check(deliveryNormalizeCode.includes('No valid Google Chat message payloads were provided.'), 'delivery workflow skips empty payload batches');

const deliveryMembersDirectoryNode = nodeByName(deliveryWorkflow, 'Get Members Directory');
check(deliveryMembersDirectoryNode?.type === 'n8n-nodes-base.googleSheets', 'delivery workflow uses Google Sheets directory for mentions');

const deliveryRenderCode = String(nodeByName(deliveryWorkflow, 'Render Mentioned Messages')?.parameters?.jsCode || '');
check(deliveryRenderCode.includes('mentionText'), 'delivery workflow render node builds mention metadata');
check(deliveryRenderCode.includes("return full;"), 'delivery workflow render node preserves body formatting from the agent');
check(deliveryRenderCode.includes("\\*?@([A-Za-z0-9._-]{2,64})\\*?\\b"), 'delivery workflow render node recognizes bold @handle mentions');
check(deliveryRenderCode.includes('appendedMentionIds'), 'delivery workflow render node appends mention footer ids');

const deliveryHttpNode = nodeByName(deliveryWorkflow, 'Send Google Chat Message');
check(deliveryHttpNode?.type === 'n8n-nodes-base.httpRequest', 'delivery workflow uses regular HTTP Request node for Google Chat transport');
check(deliveryHttpNode?.parameters?.method === 'POST', 'delivery workflow posts to Google Chat');
check(String(deliveryHttpNode?.parameters?.url || '').includes('$json.requestUrl'), 'delivery workflow sends to computed request URL');
check(String(deliveryHttpNode?.parameters?.jsonBody || '').includes('$json.requestBody'), 'delivery workflow posts raw payload bodies');

const deliveryResultCode = String(nodeByName(deliveryWorkflow, 'Build Tool Result')?.parameters?.jsCode || '');
check(deliveryResultCode.includes("toolName: 'googleChatBatchDelivery'"), 'delivery workflow returns googleChatBatchDelivery tool result');
check(deliveryResultCode.includes("status === 'sent' || status === 'partial'"), 'delivery workflow marks partial delivery as success');

for (const node of deliveryWorkflow.nodes || []) {
  const code = node?.parameters?.jsCode;
  if (typeof code !== 'string') continue;

  let syntaxOk = true;
  try {
    new vm.Script(`(function(){\n${code}\n})`, { filename: `${deliveryWorkflow.name}:${node.name}` });
  } catch (error) {
    syntaxOk = false;
  }

  check(syntaxOk, `delivery code node syntax is valid: ${node.name}`);
}

check(versionsWorkflow.name === 'Jira Project Versions Query', 'versions workflow name is correct');
for (const name of [
  'When Executed by Another Workflow',
  'Normalize Version Query Request',
  'Fetch Project Versions',
  'Build Tool Result',
]) {
  check(Boolean(nodeByName(versionsWorkflow, name)), `versions workflow node exists: ${name}`);
}

check(hasMainConnection(versionsWorkflow, 'When Executed by Another Workflow', 'Normalize Version Query Request'), 'versions trigger routes to Normalize Version Query Request');
check(hasMainConnection(versionsWorkflow, 'Normalize Version Query Request', 'Fetch Project Versions'), 'versions normalize routes to Fetch Project Versions');
check(hasMainConnection(versionsWorkflow, 'Fetch Project Versions', 'Build Tool Result'), 'versions fetch routes to Build Tool Result');

const versionsTriggerNode = nodeByName(versionsWorkflow, 'When Executed by Another Workflow');
const versionsInputs = versionsTriggerNode?.parameters?.workflowInputs?.values || [];
check(versionsTriggerNode?.type === 'n8n-nodes-base.executeWorkflowTrigger', 'versions workflow uses executeWorkflowTrigger');
check(
  ['jiraBaseUrl', 'projectKey', 'projectId', 'query', 'filters', 'fields', 'limit', 'sortBy', 'sortDirection'].every((field) =>
    versionsInputs.some((input) => input?.name === field),
  ),
  'versions workflow trigger exposes query and filter inputs',
);
check(versionsInputs.some((input) => input?.name === 'filters' && input?.type === 'string'), 'versions workflow trigger declares filters as string');
check(versionsInputs.some((input) => input?.name === 'fields' && input?.type === 'string'), 'versions workflow trigger declares fields as string');

const versionsNormalizeCode = String(nodeByName(versionsWorkflow, 'Normalize Version Query Request')?.parameters?.jsCode || '');
check(versionsNormalizeCode.includes("const projectRef = projectKey || projectId;"), 'versions workflow normalizes projectKey or projectId');
check(versionsNormalizeCode.includes("const requestUrl = projectRef ? jiraBaseUrl + '/rest/api/2/project/' + encodeURIComponent(projectRef) + '/versions' : '';"), 'versions workflow builds project versions request URL');
check(versionsNormalizeCode.includes("const fields = normalizeFields(input.fields);"), 'versions workflow normalizes requested fields');
check(versionsNormalizeCode.includes("const filters = normalizeFilters(input.filters);"), 'versions workflow normalizes generic filters');

const versionsHttpNode = nodeByName(versionsWorkflow, 'Fetch Project Versions');
check(versionsHttpNode?.type === 'n8n-nodes-base.httpRequest', 'versions workflow uses regular HTTP Request node');
check(versionsHttpNode?.parameters?.method === 'GET', 'versions workflow fetches Jira project versions with GET');
check(String(versionsHttpNode?.parameters?.url || '').includes('$json.requestUrl'), 'versions workflow sends request to computed project versions URL');

const versionsResultCode = String(nodeByName(versionsWorkflow, 'Build Tool Result')?.parameters?.jsCode || '');
check(versionsResultCode.includes("toolName: 'jiraProjectVersionsQuery'"), 'versions workflow returns jiraProjectVersionsQuery tool result');
check(versionsResultCode.includes('matchFilter(version, filter)'), 'versions workflow applies generic field filters');
check(versionsResultCode.includes('pickFields(version, selectedFields)'), 'versions workflow projects selected fields');
check(versionsResultCode.includes('versionNames'), 'versions workflow returns versionNames summary');

for (const node of versionsWorkflow.nodes || []) {
  const code = node?.parameters?.jsCode;
  if (typeof code !== 'string') continue;

  let syntaxOk = true;
  try {
    new vm.Script(`(function(){\n${code}\n})`, { filename: `${versionsWorkflow.name}:${node.name}` });
  } catch (error) {
    syntaxOk = false;
  }

  check(syntaxOk, `versions code node syntax is valid: ${node.name}`);
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
const deliveryRegistryEntry = registry.workflows?.['Jira AI Agent Google Chat Delivery'];
check(Boolean(deliveryRegistryEntry), 'registry entry exists for Jira AI Agent Google Chat Delivery');
check(
  deliveryRegistryEntry?.template === 'workflows/ui-synced/Jira/jira-ai-agent-google-chat-delivery.workflow.json',
  'registry template points to delivery workflow',
);
check(
  deliveryRegistryEntry?.templateImport === 'scripts/workflows/import/import-jira-ai-agent-google-chat-delivery-workflow.sh',
  'registry import wrapper points to delivery workflow script',
);
const versionsRegistryEntry = registry.workflows?.['Jira Project Versions Query'];
check(Boolean(versionsRegistryEntry), 'registry entry exists for Jira Project Versions Query');
check(
  versionsRegistryEntry?.template === 'workflows/ui-synced/Jira/jira-project-versions-query.workflow.json',
  'registry template points to versions workflow',
);
check(
  versionsRegistryEntry?.templateImport === 'scripts/workflows/import/import-jira-project-versions-query-workflow.sh',
  'registry import wrapper points to versions workflow script',
);

check(
  wrapperText.includes('workflows/ui-synced/Jira/jira-ai-agent.workflow.json'),
  'import wrapper points to Jira AI Agent template',
);
check(
  wrapperText.includes('jq -r --arg key "$registry_key"'),
  'import wrapper resolves registry-backed subworkflow dependencies before importing Jira AI Agent',
);
check(
  wrapperText.includes('WORKFLOW_REGISTRY_TEMPLATE="workflows/ui-synced/Jira/jira-ai-agent.workflow.json"'),
  'import wrapper keeps registry template pointed at the canonical Jira AI Agent template',
);
check(
  wrapperText.includes('WORKFLOW_REGISTRY_IMPORT="scripts/workflows/import/import-jira-ai-agent-workflow.sh"'),
  'import wrapper updates registry import metadata',
);
check(
  deliveryWrapperText.includes('workflows/ui-synced/Jira/jira-ai-agent-google-chat-delivery.workflow.json'),
  'delivery import wrapper points to the delivery workflow template',
);
check(
  deliveryWrapperText.includes('WORKFLOW_REGISTRY_IMPORT="scripts/workflows/import/import-jira-ai-agent-google-chat-delivery-workflow.sh"'),
  'delivery import wrapper updates registry import metadata',
);
check(
  versionsWrapperText.includes('workflows/ui-synced/Jira/jira-project-versions-query.workflow.json'),
  'versions import wrapper points to the versions workflow template',
);
check(
  versionsWrapperText.includes('WORKFLOW_REGISTRY_IMPORT="scripts/workflows/import/import-jira-project-versions-query-workflow.sh"'),
  'versions import wrapper updates registry import metadata',
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
