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

check(workflow.name === "Book Review", "workflow name is Book Review");

const requiredNodes = [
  "When chat message received",
  "Telegram Trigger",
  "Config Main",
  "Parse Callback Data",
  "Route Request",
  "Prepare Manifest",
  "Save Manifest to Drive",
  "Save Content Readable to Drive",
  "Build Media Sheet",
  "List Media Folder Items",
  "If Existing Media Sheet?",
  "Delete Existing Media Sheet",
  "Ensure Media Sheet",
  "Write Initial Media Sheet Rows",
  "Merge",
  "Save Reviewing Session",
  "Get Review Session",
  "Switch",
  "Answer Continue Query",
  "Update Session Continue Review",
  "Get Manifest from Drive",
  "Extract Manifest JSON",
  "If Load Manifest Success",
  "Answer Start Media",
  "Config Media",
  "Build Narration Queue",
  "Split Out Narration Items",
  "Loop Over Narration Items",
  "Call TTS VREX",
  "Upload TTS WAV to Drive",
  "Build TTS Sheet Row",
  "Finalize TTS Sheet Rows",
  "Update TTS Rows in Sheet",
  "Update Session Review Passed",
  "Send Media Done Message",
];

for (const name of requiredNodes) {
  check(Boolean(nodeByName(workflow, name)), `required node exists: ${name}`);
}

check(!nodeByName(workflow, "Call TTS VieNeu"), "legacy node Call TTS VieNeu removed");

const configMain = nodeByName(workflow, "Config Main");
const configAssignments = assignmentMap(configMain);

for (const key of [
  "masterPrompt",
  "telegramChatId",
  "chatInput",
  "ggDriveRootFolderId",
  "sessionTableName",
  "mediaSpreadsheetName",
]) {
  check(configAssignments.has(key), `Config Main exposes ${key}`);
}

const routeRequest = nodeByName(workflow, "Route Request");
const routeRequestSerialized = JSON.stringify(routeRequest?.parameters || {});
check(
  routeRequestSerialized.includes("reviewPassed"),
  "Route Request routes reviewPassed callback",
);

const sendReviewMessage = nodeByName(workflow, "Send Review Message");
const sendReviewSerialized = JSON.stringify(sendReviewMessage?.parameters || {});
check(
  sendReviewSerialized.includes("reviewPassed:"),
  "Send Review Message encodes reviewPassed callback token",
);

const configMedia = nodeByName(workflow, "Config Media");
const configMediaCode = String(configMedia?.parameters?.jsCode || "");
check(
  configMediaCode.includes("mediaSheetIdFromSession"),
  "Config Media prioritizes mediaSheetId from session",
);
check(
  configMediaCode.includes("ttsSheetSpreadsheetId"),
  "Config Media falls back to ttsSheetSpreadsheetId",
);
check(
  configMediaCode.includes("/tts"),
  "Config Media derives /tts folder path",
);

const ensureMediaSheet = nodeByName(workflow, "Ensure Media Sheet");
const ensureMediaSheetInputs = JSON.stringify(
  ensureMediaSheet?.parameters?.workflowInputs?.value || {},
);
check(
  ensureMediaSheet?.parameters?.workflowId?.value === "Dhguhje1kdEgdj9I",
  "Ensure Media Sheet uses GG Sheet Manager workflow",
);
check(
  ensureMediaSheetInputs.includes("ensureSheet"),
  "Ensure Media Sheet uses action ensureSheet",
);
check(
  ensureMediaSheetInputs.includes("Build Media Sheet"),
  "Ensure Media Sheet reads spreadsheet/sheet name from Build Media Sheet",
);

const buildMediaSheet = nodeByName(workflow, "Build Media Sheet");
const buildMediaSheetCode = String(buildMediaSheet?.parameters?.jsCode || "");
check(
  buildMediaSheetCode.includes("narration_text"),
  "Build Media Sheet preloads narration_text column",
);
check(
  buildMediaSheetCode.includes("mediaSheetRows"),
  "Build Media Sheet emits mediaSheetRows",
);
check(
  buildMediaSheetCode.includes("scene_id"),
  "Build Media Sheet keeps scene_id in sheet seed rows",
);

const deleteExistingMediaSheet = nodeByName(workflow, "Delete Existing Media Sheet");
check(
  deleteExistingMediaSheet?.parameters?.workflowId?.value === "QpcIxaHiYXDqjw4p",
  "Delete Existing Media Sheet uses GG Drive Manager workflow",
);

const buildNarrationQueue = nodeByName(workflow, "Build Narration Queue");
const buildNarrationQueueCode = String(buildNarrationQueue?.parameters?.jsCode || "");
check(
  !buildNarrationQueueCode.includes("splitSentences"),
  "Build Narration Queue does not split narration_text by sentence",
);
check(
  buildNarrationQueueCode.includes("narrationItems"),
  "Build Narration Queue emits narrationItems",
);
check(
  buildNarrationQueueCode.includes("scene_"),
  "Build Narration Queue emits canonical scene-level tts_file_name",
);

const callTts = nodeByName(workflow, "Call TTS VREX");
check(
  callTts?.parameters?.workflowId?.value === "Zgc9wgtKmZ1qKm5B",
  "Call TTS VREX uses workflow ID Zgc9wgtKmZ1qKm5B",
);

const callTtsInputs = callTts?.parameters?.workflowInputs?.value || {};
check(
  String(callTtsInputs.mode || "") === "fullText",
  "Call TTS VREX runs full narration_text in mode fullText",
);
check(
  String(callTtsInputs.voiceId || "") === "d1f5e1f6-fd60-45e7-9564-523ecd819e31",
  "Call TTS VREX pins expected voiceId",
);
check(
  String(callTtsInputs.ttsApiKey || "").includes("TTS_VREX_API_KEY"),
  "Call TTS VREX maps ttsApiKey from env TTS_VREX_API_KEY",
);

const uploadTts = nodeByName(workflow, "Upload TTS WAV to Drive");
const uploadTtsInputs = JSON.stringify(uploadTts?.parameters?.workflowInputs?.value || {});
check(
  uploadTts?.parameters?.workflowId?.value === "QpcIxaHiYXDqjw4p",
  "Upload TTS WAV to Drive uses GG Drive Manager workflow",
);
check(
  uploadTtsInputs.includes("ttsFolderPath"),
  "Upload TTS WAV to Drive writes into ttsFolderPath",
);
check(
  uploadTtsInputs.includes("tts_file_name"),
  "Upload TTS WAV to Drive maps scene file name from tts_file_name",
);

const updateRows = nodeByName(workflow, "Update TTS Rows in Sheet");
const updateRowsInputs = JSON.stringify(updateRows?.parameters?.workflowInputs?.value || {});
check(
  updateRows?.parameters?.workflowId?.value === "Dhguhje1kdEgdj9I",
  "Update TTS Rows in Sheet uses GG Sheet Manager workflow",
);
check(
  updateRowsInputs.includes("upsertRows"),
  "Update TTS Rows in Sheet uses action upsertRows",
);
check(
  updateRowsInputs.includes("ttsSheetSpreadsheetId"),
  "Update TTS Rows in Sheet reads ttsSheetSpreadsheetId",
);
check(
  updateRowsInputs.includes("upsertByHeader"),
  "Update TTS Rows in Sheet upserts rows by header",
);

const updateSessionReviewPassed = nodeByName(workflow, "Update Session Review Passed");
const updateSessionReviewPassedInputs = JSON.stringify(
  updateSessionReviewPassed?.parameters?.workflowInputs?.value || {},
);
check(
  updateSessionReviewPassed?.parameters?.workflowId?.value === "Hq9y27aFMsQhEcuB",
  "Update Session Review Passed uses DataTableStore workflow",
);
check(
  updateSessionReviewPassedInputs.includes("reviewPassed"),
  "Update Session Review Passed writes status reviewPassed",
);

const saveReviewingSession = nodeByName(workflow, "Save Reviewing Session");
const saveReviewingSessionInputs = JSON.stringify(
  saveReviewingSession?.parameters?.workflowInputs?.value || {},
);
check(
  saveReviewingSessionInputs.includes("mediaSheetSpreadsheetUrl"),
  "Save Reviewing Session stores mediaSheetSpreadsheetUrl",
);
check(
  saveReviewingSessionInputs.includes("folderPath"),
  "Save Reviewing Session stores folderPath",
);

const buildTtsSheetRow = nodeByName(workflow, "Build TTS Sheet Row");
const buildTtsSheetRowCode = String(buildTtsSheetRow?.parameters?.jsCode || "");
check(
  !buildTtsSheetRowCode.includes("sentence_index"),
  "Build TTS Sheet Row no longer writes sentence_index column",
);
check(
  !buildTtsSheetRowCode.includes("sentence_text"),
  "Build TTS Sheet Row no longer writes sentence_text column",
);
check(
  buildTtsSheetRowCode.includes("Call TTS VREX"),
  "Build TTS Sheet Row reads TTS output from Call TTS VREX",
);

const connections = workflow.connections || {};
function hasConnection(from, to) {
  const entries = (connections[from]?.main || []).flat();
  return entries.some((entry) => entry?.node === to);
}

check(
  hasConnection("Prepare Manifest", "List Media Folder Items"),
  "Prepare Manifest branches to List Media Folder Items",
);
check(
  hasConnection("List Media Folder Items", "Build Media Sheet"),
  "List Media Folder Items branches to Build Media Sheet",
);
check(
  hasConnection("Build Media Sheet", "If Existing Media Sheet?"),
  "Build Media Sheet feeds If Existing Media Sheet?",
);
check(
  hasConnection("Write Initial Media Sheet Rows", "Merge"),
  "Write Initial Media Sheet Rows feeds Merge",
);
check(
  hasConnection("Save Manifest to Drive", "Merge"),
  "Save Manifest to Drive feeds Merge",
);
check(
  hasConnection("Save Content Readable to Drive", "Merge"),
  "Save Content Readable to Drive feeds Merge",
);
check(
  hasConnection("If Existing Media Sheet?", "Delete Existing Media Sheet"),
  "If Existing Media Sheet? branches to Delete Existing Media Sheet",
);
check(
  hasConnection("If Existing Media Sheet?", "Ensure Media Sheet"),
  "If Existing Media Sheet? branches to Ensure Media Sheet",
);
check(
  hasConnection("Call TTS VREX", "Upload TTS WAV to Drive"),
  "Call TTS VREX feeds Upload TTS WAV to Drive",
);
check(
  hasConnection("Finalize TTS Sheet Rows", "Update TTS Rows in Sheet"),
  "Finalize TTS Sheet Rows feeds Update TTS Rows in Sheet",
);

const mediaConnectionKeys = [
  "Config Media",
  "List Media Folder Items",
  "Build Media Sheet",
  "If Existing Media Sheet?",
  "Delete Existing Media Sheet",
  "Ensure Media Sheet",
  "Write Initial Media Sheet Rows",
  "Merge",
  "Build Narration Queue",
  "Split Out Narration Items",
  "Loop Over Narration Items",
  "Call TTS VREX",
  "Upload TTS WAV to Drive",
  "Build TTS Sheet Row",
  "Finalize TTS Sheet Rows",
  "Update TTS Rows in Sheet",
  "Update Session Review Passed",
];

for (const key of mediaConnectionKeys) {
  check(Boolean(connections[key]), `connection exists for ${key}`);
}

if (failures.length > 0) {
  console.error("[book-review-checklist] FAIL");
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log("[book-review-checklist] PASS");
for (const message of passes) {
  console.log(`- ${message}`);
}
