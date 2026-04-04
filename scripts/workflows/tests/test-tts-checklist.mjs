#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../..",
);
const workflowPath = path.resolve(
  process.argv[2] || path.join(rootDir, "workflows/media/tts.workflow.json"),
);
const registryPath = path.join(rootDir, "workflow-registry.json");

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

if (!fs.existsSync(workflowPath)) {
  console.error(`[tts-checklist] Missing workflow template: ${workflowPath}`);
  process.exit(1);
}

const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));

check(workflow.name === "TTS VieNeu", "workflow name is TTS VieNeu");

if (fs.existsSync(registryPath)) {
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const registryId = registry?.workflows?.["TTS VieNeu"]?.id || "";
  check(
    registryId === "2F1jBI12C6NtslBN",
    "registry keeps TTS VieNeu ID 2F1jBI12C6NtslBN",
  );
} else {
  failures.push("workflow-registry.json is missing");
}

const requiredNodes = [
  "When Executed by Another Workflow",
  "Form Trigger",
  "Normalize + Plan",
  "Execute /stream Chunks",
  "Join WAV + Finalize",
];

for (const name of requiredNodes) {
  check(Boolean(nodeByName(workflow, name)), `required node exists: ${name}`);
}

const triggerNode = nodeByName(workflow, "When Executed by Another Workflow");
const triggerInputs = (triggerNode?.parameters?.workflowInputs?.values || []).map((row) => row.name);
for (const key of [
  "text",
  "voiceId",
  "mode",
  "maxCharsChunk",
  "batchSize",
  "joinMode",
  "silenceSeconds",
  "crossfadeSeconds",
  "retry",
  "requestTimeoutSec",
  "ttsApiBaseUrl",
]) {
  check(triggerInputs.includes(key), `trigger input includes ${key}`);
}
for (const forbidden of [
  "voice_id",
  "max_chars_chunk",
  "batch_size",
  "join_mode",
  "silence_seconds",
  "crossfade_seconds",
  "request_timeout_sec",
  "tts_api_base_url",
  "input_text",
  "request_id",
]) {
  check(!triggerInputs.includes(forbidden), `trigger input excludes legacy ${forbidden}`);
}

const normalizeCode = String(nodeByName(workflow, "Normalize + Plan")?.parameters?.jsCode || "");
check(
  normalizeCode.includes("(?<=[.!?…])\\s+"),
  "Normalize + Plan includes sentence split regex",
);
check(
  normalizeCode.includes("(?<=[,;:\\-–—])\\s+"),
  "Normalize + Plan includes punctuation fallback split regex",
);
check(
  normalizeCode.includes("splitTextIntoChunks"),
  "Normalize + Plan uses text-only chunk planner",
);
check(
  !normalizeCode.includes("input.max_chars_chunk")
    && !normalizeCode.includes("input.batch_size")
    && !normalizeCode.includes("input.join_mode")
    && !normalizeCode.includes("input.silence_seconds")
    && !normalizeCode.includes("input.crossfade_seconds")
    && !normalizeCode.includes("input.request_timeout_sec")
    && !normalizeCode.includes("input.tts_api_base_url")
    && !normalizeCode.includes("input.voice_id"),
  "Normalize + Plan is camelCase-only for n8n inputs",
);

const executeCode = String(nodeByName(workflow, "Execute /stream Chunks")?.parameters?.jsCode || "");
check(executeCode.includes("/voices"), "Execute /stream Chunks resolves voice from /voices");
check(executeCode.includes("/stream"), "Execute /stream Chunks calls /stream endpoint");
check(executeCode.includes("[500, 1000, 2000]"), "Execute /stream Chunks uses retry backoff 0.5/1/2s");
check(executeCode.includes("batchSize"), "Execute /stream Chunks supports mini-batch execution");
check(
  executeCode.includes("voice_id"),
  "Execute /stream Chunks uses snake_case voice_id only for server payload/response",
);

const joinCode = String(nodeByName(workflow, "Join WAV + Finalize")?.parameters?.jsCode || "");
check(joinCode.includes("parseWavPcm"), "Join WAV + Finalize parses WAV chunks robustly");
check(joinCode.includes("joinedWav"), "Join WAV + Finalize outputs binary key joinedWav");
check(joinCode.includes("sampleRate"), "Join WAV + Finalize emits sampleRate");
check(joinCode.includes("pcmFormat"), "Join WAV + Finalize emits pcmFormat");

const allNodeNames = (workflow.nodes || []).map((node) => node.name);
for (const forbidden of [
  "If TTS Poll Required",
  "Wait For TTS Poll",
  "Prepare TTS Status Poll",
  "Get TTS Job Status",
]) {
  check(!allNodeNames.includes(forbidden), `legacy polling node removed: ${forbidden}`);
}

if (failures.length > 0) {
  console.error("[tts-checklist] FAIL");
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log("[tts-checklist] PASS");
for (const message of passes) {
  console.log(`- ${message}`);
}
