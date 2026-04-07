#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../..",
);
const workflowPath = path.resolve(
  process.argv[2] || path.join(rootDir, "workflows/media/tts-vrex.workflow.json"),
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
  console.error(`[tts-vrex-checklist] Missing workflow template: ${workflowPath}`);
  process.exit(1);
}

const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));

check(workflow.name === "TTS VREX", "workflow name is TTS VREX");

if (fs.existsSync(registryPath)) {
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const registryRow = registry?.workflows?.["TTS VREX"] || {};
  check(
    registryRow.template === "workflows/media/tts-vrex.workflow.json",
    "registry maps TTS VREX template path",
  );
  check(
    typeof registryRow.id === "string" && registryRow.id.length > 0,
    "registry keeps non-empty TTS VREX ID",
  );
} else {
  failures.push("workflow-registry.json is missing");
}

const requiredNodes = [
  "When Executed by Another Workflow",
  "Normalize + Plan",
  "If Has Chunks?",
  "Split Out Chunks",
  "Prepare Single Chunk Payload",
  "Loop Over TTS Chunks",
  "Execute /stream Chunks",
  "Extract Chunk Result",
  "Aggregate TTS Chunk Results",
  "Join WAV + Finalize",
  "Convert to File",
];

for (const name of requiredNodes) {
  check(Boolean(nodeByName(workflow, name)), `required node exists: ${name}`);
}

const triggerNode = nodeByName(workflow, "When Executed by Another Workflow");
const triggerInputs = (triggerNode?.parameters?.workflowInputs?.values || []).map((row) => row.name);
for (const key of [
  "text",
  "ttsApiKey",
  "voiceId",
  "mode",
  "maxCharsChunk",
  "batchSize",
  "joinMode",
  "silenceSeconds",
  "crossfadeSeconds",
  "language",
  "speed",
  "quality",
  "guidanceScale",
  "denoise",
  "outputFormat",
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
]) {
  check(!triggerInputs.includes(forbidden), `trigger input excludes legacy ${forbidden}`);
}

const normalizeCode = String(nodeByName(workflow, "Normalize + Plan")?.parameters?.jsCode || "");
check(
  normalizeCode.includes("https://tts.getvrex.com/api/v1"),
  "Normalize + Plan uses VREX default base URL",
);
check(
  normalizeCode.includes("missing_tts_api_key"),
  "Normalize + Plan fail-fast on missing ttsApiKey",
);
check(
  normalizeCode.includes("input.quality"),
  "Normalize + Plan maps quality input",
);
check(
  normalizeCode.includes("input.guidanceScale"),
  "Normalize + Plan maps guidanceScale input",
);
check(
  normalizeCode.includes("input.denoise"),
  "Normalize + Plan maps denoise input",
);

const executeCode = String(nodeByName(workflow, "Execute /stream Chunks")?.parameters?.jsCode || "");
check(executeCode.includes("/voices"), "Execute /stream Chunks resolves voice from /voices");
check(executeCode.includes("/tts/stream"), "Execute /stream Chunks calls /tts/stream endpoint");
check(
  executeCode.includes("Authorization"),
  "Execute /stream Chunks includes Authorization header",
);
check(
  executeCode.includes("output_format"),
  "Execute /stream Chunks sends output_format payload",
);
check(
  executeCode.includes("voice_id"),
  "Execute /stream Chunks uses snake_case voice_id in server payload",
);
check(
  executeCode.includes("guidance_scale"),
  "Execute /stream Chunks sends guidance_scale payload",
);
check(
  executeCode.includes("denoise"),
  "Execute /stream Chunks sends denoise payload",
);
check(
  executeCode.includes("quality"),
  "Execute /stream Chunks sends quality payload",
);

const joinCode = String(nodeByName(workflow, "Join WAV + Finalize")?.parameters?.jsCode || "");
check(joinCode.includes("parseWavPcm"), "Join WAV + Finalize parses WAV chunks robustly");
check(joinCode.includes("audioBase64"), "Join WAV + Finalize outputs audioBase64");
check(joinCode.includes("delete jsonOutput.ttsApiKey"), "Join WAV + Finalize removes ttsApiKey from output");
const convertNode = nodeByName(workflow, "Convert to File");
check(
  convertNode?.parameters?.sourceProperty === "audioBase64",
  "Convert to File reads audioBase64",
);
check(
  convertNode?.parameters?.binaryPropertyName === "audio",
  "Convert to File outputs binary key audio",
);

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
  console.error("[tts-vrex-checklist] FAIL");
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log("[tts-vrex-checklist] PASS");
for (const message of passes) {
  console.log(`- ${message}`);
}
