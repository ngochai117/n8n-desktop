#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../..",
);
const workflowPath = path.resolve(
  process.argv[2] ||
    path.join(rootDir, "workflows/book-review/book-review.workflow.json"),
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

function assignmentMap(node) {
  const map = new Map();
  const assignments = node?.parameters?.assignments?.assignments || [];
  for (const assignment of assignments) {
    map.set(String(assignment?.name || ""), assignment);
  }
  return map;
}

if (!fs.existsSync(workflowPath)) {
  console.error(
    `[book-review-checklist] Missing workflow template: ${workflowPath}`,
  );
  process.exit(1);
}

const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
const serialized = JSON.stringify(workflow);
const obsoleteWorkflowName = ["Book", "Review", "AI", "Agent"].join(" ");
const obsoleteWorkflowPath = ["book-review", "ai", "agent.workflow.json"].join(
  "-",
);

check(workflow.name === "Book Review", "workflow name is Book Review");
check(
  !serialized.includes(obsoleteWorkflowName),
  "workflow JSON has no obsolete alternate naming",
);
check(
  !serialized.includes(obsoleteWorkflowPath),
  "workflow JSON has no obsolete alternate path",
);

const requiredNodes = [
  "When chat message received",
  "Telegram Trigger",
  "Config Main",
  "Parse Callback Data",
  "Route Request",
  "Send Creating Outline Message",
  "Outline AI Agent",
  "Structured Outline Output Parser",
  "Manifest AI Agent",
  "Structured Expand Output Parser",
  "QC AI Agent",
  "Structured QC Output Parser",
  "Prepare Manifest",
  "Convert Manifest to File",
  "Save Manifest to Drive",
  "Convert Content Readable to File",
  "Save Content Readable to Drive",
  "Merge Persisted Files",
  "Save Reviewing Session",
  "Delete Loading Message",
  "Send Review Message",
  "Get Review Session",
  "Route Session Action",
  "If Stop Session Is Reviewing",
  "Update Session Stop",
  "Answer Stop Query",
  "Build Stop Noop Query",
  "Answer Stop Noop Query",
  "If Continue Session Is Reviewing",
  "Update Session ContinueReview",
  "Answer Continue Query",
  "Get Manifest from Drive",
  "Extract Manifest JSON",
  "Prepare Continue Payload",
  "Update Session ReviewPassed",
  "Send Review Passed Message",
  "Build Continue Noop Query",
  "Answer Continue Noop Query",
];

for (const name of requiredNodes) {
  check(Boolean(nodeByName(workflow, name)), `required node exists: ${name}`);
}

const forbiddenNodes = [
  "Edit a text message",
  "Send Creating Outline Message1",
];

for (const name of forbiddenNodes) {
  check(!nodeByName(workflow, name), `obsolete node removed: ${name}`);
}

const configMain = nodeByName(workflow, "Config Main");
const configAssignments = assignmentMap(configMain);
check(
  configAssignments.has("masterPrompt"),
  "Config Main exposes masterPrompt",
);
check(
  configAssignments.has("telegramChatId"),
  "Config Main exposes telegramChatId",
);
check(configAssignments.has("chatInput"), "Config Main exposes chatInput");
check(
  configAssignments.has("ggDriveRootFolderId"),
  "Config Main exposes ggDriveRootFolderId",
);
check(
  configAssignments.has("sessionTableName"),
  "Config Main exposes sessionTableName",
);
check(
  !(configMain?.parameters?.assignments?.assignments || []).some(
    (item) => String(item?.name || "").trim() === "",
  ),
  "Config Main has no blank assignments",
);

const telegramTrigger = nodeByName(workflow, "Telegram Trigger");
const triggerUpdates = telegramTrigger?.parameters?.updates || [];
check(
  Array.isArray(triggerUpdates) &&
    triggerUpdates.includes("message") &&
    triggerUpdates.includes("callback_query"),
  "Telegram Trigger listens to message and callback_query updates",
);

const parseCallback = nodeByName(workflow, "Parse Callback Data");
const parseCallbackCode = String(parseCallback?.parameters?.jsCode || "");
check(
  parseCallbackCode.includes("callbackAction"),
  "Parse Callback Data derives callbackAction",
);
check(
  parseCallbackCode.includes("sessionToken"),
  "Parse Callback Data derives sessionToken",
);

const switchNode = nodeByName(workflow, "Route Request");
const switchSerialized = JSON.stringify(switchNode?.parameters || {});
check(
  switchSerialized.includes("startReview"),
  "Route Request routes startReview",
);
check(
  switchSerialized.includes("stopReview"),
  "Route Request routes stopReview",
);
check(
  switchSerialized.includes("continueReview"),
  "Route Request routes continueReview",
);

const prepareManifest = nodeByName(workflow, "Prepare Manifest");
const prepareManifestCode = String(prepareManifest?.parameters?.jsCode || "");
check(
  prepareManifestCode.includes("sessionToken"),
  "Prepare Manifest emits sessionToken",
);
check(
  prepareManifestCode.includes("safeToken"),
  "Prepare Manifest emits safeToken",
);
check(
  prepareManifestCode.includes("folderPath"),
  "Prepare Manifest emits folderPath",
);

const saveManifest = nodeByName(workflow, "Save Manifest to Drive");
const saveReadable = nodeByName(workflow, "Save Content Readable to Drive");
check(
  saveManifest?.parameters?.workflowInputs?.value?.fileName === "Manifest.json",
  "Drive manifest upsert uses Manifest.json",
);
check(
  saveReadable?.parameters?.workflowInputs?.value?.fileName ===
    "ContentReadable.txt",
  "Drive readable upsert uses ContentReadable.txt",
);
check(
  String(
    saveManifest?.parameters?.workflowInputs?.value?.rootFolderId || "",
  ).includes("ggDriveRootFolderId"),
  "Drive manifest upsert reads ggDriveRootFolderId",
);
check(
  String(
    saveReadable?.parameters?.workflowInputs?.value?.rootFolderId || "",
  ).includes("ggDriveRootFolderId"),
  "Drive readable upsert reads ggDriveRootFolderId",
);
check(
  String(
    saveManifest?.parameters?.workflowInputs?.value?.folderPath || "",
  ).includes("Prepare Manifest"),
  "Drive manifest upsert reads folderPath from Prepare Manifest",
);

const saveReviewing = nodeByName(workflow, "Save Reviewing Session");
const saveReviewingValue =
  saveReviewing?.parameters?.workflowInputs?.value || {};
check(
  String(saveReviewingValue.data || "").includes('status: "reviewing"'),
  "Save Reviewing Session stores reviewing status",
);
check(
  String(saveReviewingValue.data || "").includes("manifestUrl"),
  "Save Reviewing Session stores manifestUrl",
);

check(
  saveReviewing?.parameters?.workflowId?.value === "Hq9y27aFMsQhEcuB",
  "Save Reviewing Session references DataTableStore workflow ID",
);

const sendReviewMessage = nodeByName(workflow, "Send Review Message");
const sendReviewSerialized = JSON.stringify(
  sendReviewMessage?.parameters || {},
);
check(
  sendReviewSerialized.includes("continueReview:"),
  "Send Review Message encodes continueReview token callback",
);
check(
  sendReviewSerialized.includes("stopReview:"),
  "Send Review Message encodes stopReview token callback",
);
check(
  sendReviewMessage?.parameters?.replyMarkup === "inlineKeyboard",
  "Send Review Message keeps inline keyboard actions",
);

const getSession = nodeByName(workflow, "Get Review Session");
check(
  getSession?.parameters?.workflowId?.value === "Hq9y27aFMsQhEcuB",
  "Get Review Session references DataTableStore workflow ID",
);

const continueUpdate = nodeByName(workflow, "Update Session ContinueReview");
const reviewPassedUpdate = nodeByName(workflow, "Update Session ReviewPassed");
const stopUpdate = nodeByName(workflow, "Update Session Stop");
check(
  String(
    continueUpdate?.parameters?.workflowInputs?.value?.data || "",
  ).includes('status: "continueReview"'),
  "Update Session ContinueReview stores continueReview",
);
check(
  String(
    reviewPassedUpdate?.parameters?.workflowInputs?.value?.data || "",
  ).includes('status: "reviewPassed"'),
  "Update Session ReviewPassed stores reviewPassed",
);
check(
  String(stopUpdate?.parameters?.workflowInputs?.value?.data || "").includes(
    'status: "stop"',
  ),
  "Update Session Stop stores stop",
);

const getManifest = nodeByName(workflow, "Get Manifest from Drive");
check(
  getManifest?.parameters?.workflowInputs?.value?.action === "get",
  "Get Manifest from Drive uses action=get",
);
check(
  String(
    getManifest?.parameters?.workflowInputs?.value?.fileUrl || "",
  ).includes("manifestUrl"),
  "Get Manifest from Drive loads manifestUrl from session row",
);

const extractManifest = nodeByName(workflow, "Extract Manifest JSON");
check(
  extractManifest?.parameters?.operation === "fromJson",
  "Extract Manifest JSON uses fromJson",
);
check(
  extractManifest?.parameters?.binaryPropertyName === "file",
  "Extract Manifest JSON reads binary field file",
);
check(
  extractManifest?.parameters?.destinationKey === "manifest",
  "Extract Manifest JSON writes to manifest key",
);

const continuePayload = nodeByName(workflow, "Prepare Continue Payload");
check(
  String(continuePayload?.parameters?.jsCode || "").includes(
    "Manifest JSON is missing after GG Drive rehydrate.",
  ),
  "Prepare Continue Payload validates rehydrated manifest",
);

const answerContinue = nodeByName(workflow, "Answer Continue Query");
const answerStop = nodeByName(workflow, "Answer Stop Query");
check(
  answerContinue?.parameters?.operation === "answerQuery",
  "Answer Continue Query answers callback query",
);
check(
  answerStop?.parameters?.operation === "answerQuery",
  "Answer Stop Query answers callback query",
);

const mergeAfterPersist =
  workflow.connections?.["Merge Persisted Files"]?.main?.[0]?.[0]?.node || "";
check(
  mergeAfterPersist === "Save Reviewing Session",
  "Merge Persisted Files persists reviewer session before Telegram send",
);

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
