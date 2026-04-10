#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../..',
);
const strictMode =
  process.argv.includes('--strict') ||
  process.env.SPRINT_MONITOR_CHECKLIST_STRICT === '1';

const failures = [];
const warnings = [];
const passes = [];

function check(condition, message) {
  if (condition) {
    passes.push(message);
    return;
  }
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function nodeByName(workflow, name) {
  return (workflow.nodes || []).find((node) => node.name === name) || null;
}

function hasMainConnection(workflow, from, to) {
  const entries = (workflow.connections?.[from]?.main || []).flat();
  return entries.some((entry) => entry?.node === to);
}

function hasMainConnectionFromOutput(workflow, from, outputIndex, to) {
  const branch = workflow.connections?.[from]?.main?.[outputIndex] || [];
  return branch.some((entry) => entry?.node === to);
}

function hasAiConnection(workflow, from, type, to) {
  const entries = (workflow.connections?.[from]?.[type] || []).flat();
  return entries.some((entry) => entry?.node === to);
}

const filesToCheck = [
  'scripts/bootstrap/apply-sprint-monitor-schema.sh',
  'scripts/workflows/import/import-sprint-monitor-scheduler-workflow.sh',
  'scripts/workflows/import/import-sprint-monitor-engine-workflow.sh',
  'scripts/workflows/tests/test-sprint-monitor-checklist.sh',
  'scripts/workflows/tests/test-sprint-monitor-checklist.mjs',
  'README.md',
  'scripts/README.md',
  'CHANGELOG.md',
  'workflow-registry.json',
  'workflows/sprint-monitor/sprint-monitor-scheduler.workflow.json',
  'workflows/sprint-monitor/sprint-monitor-engine.workflow.json',
];

for (const relativePath of filesToCheck) {
  check(fileExists(relativePath), `support file exists: ${relativePath}`);
}

for (const removedPath of [
  'workflows/sprint-monitor/sprint-monitor-light-scan.workflow.json',
  'workflows/sprint-monitor/sprint-monitor-deep-analysis.workflow.json',
  'workflows/sprint-monitor/sprint-monitor-endgame.workflow.json',
  'scripts/workflows/import/import-sprint-monitor-light-scan-workflow.sh',
  'scripts/workflows/import/import-sprint-monitor-deep-analysis-workflow.sh',
  'scripts/workflows/import/import-sprint-monitor-endgame-workflow.sh',
]) {
  check(!fileExists(removedPath), `legacy artifact removed: ${removedPath}`);
}

const registry = fileExists('workflow-registry.json') ? readJson('workflow-registry.json') : { workflows: {} };
const schedulerEntry = registry.workflows?.['Sprint Monitor Scheduler'];
const engineEntry = registry.workflows?.['Sprint Monitor Engine'];

check(Boolean(schedulerEntry), 'registry entry exists: Sprint Monitor Scheduler');
check(Boolean(engineEntry), 'registry entry exists: Sprint Monitor Engine');
if (schedulerEntry) {
  check(schedulerEntry.id === 'l4HFV7Mr0c5ZXi7j', 'scheduler keeps repurposed Light Scan workflow ID');
  check(
    schedulerEntry.template === 'workflows/sprint-monitor/sprint-monitor-scheduler.workflow.json',
    'scheduler registry template matches',
  );
  check(
    schedulerEntry.templateImport === 'scripts/workflows/import/import-sprint-monitor-scheduler-workflow.sh',
    'scheduler registry import wrapper matches',
  );
}
if (engineEntry) {
  check(
    engineEntry.template === 'workflows/sprint-monitor/sprint-monitor-engine.workflow.json',
    'engine registry template matches',
  );
  check(
    engineEntry.templateImport === 'scripts/workflows/import/import-sprint-monitor-engine-workflow.sh',
    'engine registry import wrapper matches',
  );
}
check(!registry.workflows?.['Sprint Monitor Light Scan'], 'registry no longer contains Sprint Monitor Light Scan');
check(!registry.workflows?.['Sprint Monitor Deep Analysis'], 'registry no longer contains Sprint Monitor Deep Analysis');
check(!registry.workflows?.['Sprint Monitor Endgame'], 'registry no longer contains Sprint Monitor Endgame');

const importAllContent = fileExists('scripts/workflows/import/import-all-workflows.sh')
  ? readText('scripts/workflows/import/import-all-workflows.sh')
  : '';
check(
  importAllContent.includes('import-sprint-monitor-scheduler-workflow.sh'),
  'import-all-workflows.sh references scheduler wrapper',
);
check(
  !importAllContent.includes('import-sprint-monitor-deep-analysis-workflow.sh')
    && !importAllContent.includes('import-sprint-monitor-endgame-workflow.sh')
    && !importAllContent.includes('import-sprint-monitor-light-scan-workflow.sh'),
  'import-all-workflows.sh omits legacy Sprint Monitor wrappers',
);

const schedulerPath = 'workflows/sprint-monitor/sprint-monitor-scheduler.workflow.json';
if (fileExists(schedulerPath)) {
  const scheduler = readJson(schedulerPath);
  check(scheduler.name === 'Sprint Monitor Scheduler', 'scheduler workflow name is Sprint Monitor Scheduler');

  for (const nodeName of [
    'Manual Trigger',
    'Build Manual Request',
    'Schedule Trigger',
    'Build Scheduled Request',
    'Load Monitor Configs (Manual)',
    'Load Monitor Configs (Scheduled)',
    'Run Sprint Monitor Engine (Manual)',
    'Run Sprint Monitor Engine (Scheduled)',
    'Build Workflow Summary',
  ]) {
    check(Boolean(nodeByName(scheduler, nodeName)), `scheduler includes node: ${nodeName}`);
  }

  check(hasMainConnection(scheduler, 'Manual Trigger', 'Build Manual Request'), 'scheduler manual path wired');
  check(hasMainConnection(scheduler, 'Schedule Trigger', 'Build Scheduled Request'), 'scheduler schedule path wired');
  check(hasMainConnection(scheduler, 'Build Manual Request', 'Load Monitor Configs (Manual)'), 'scheduler manual config load wired');
  check(hasMainConnection(scheduler, 'Build Scheduled Request', 'Load Monitor Configs (Scheduled)'), 'scheduler scheduled config load wired');

  const manualRunner = nodeByName(scheduler, 'Run Sprint Monitor Engine (Manual)');
  const scheduledRunner = nodeByName(scheduler, 'Run Sprint Monitor Engine (Scheduled)');
  check(
    String(manualRunner?.parameters?.workflowInputs?.value?.requestedRunType || '').includes('scan'),
    'scheduler manual runner seeds requestedRunType=scan',
  );
  check(
    String(manualRunner?.parameters?.workflowInputs?.value?.forceMode || '').includes('Build Manual Request'),
    'scheduler manual runner forwards forceMode override',
  );
  check(
    String(scheduledRunner?.parameters?.workflowInputs?.value?.requestedRunType || '').includes('scan'),
    'scheduler scheduled runner seeds requestedRunType=scan',
  );
  check(
    String(scheduledRunner?.parameters?.workflowInputs?.value?.forceMode || '').includes('auto'),
    'scheduler scheduled runner locks forceMode=auto',
  );
}

const enginePath = 'workflows/sprint-monitor/sprint-monitor-engine.workflow.json';
if (fileExists(enginePath)) {
  const engine = readJson(enginePath);

  for (const nodeName of [
    'Normalize Request',
    'Compute Signals',
    'Build Prior State Query',
    'Load Prior State',
    'Select Run Mode',
    'Build Judge Inputs',
    'Delivery Gate',
    'Build Render Model',
    'Build Delivery Messages',
    'Build Persist Query',
    'Build Engine Result',
  ]) {
    check(Boolean(nodeByName(engine, nodeName)), `engine includes node: ${nodeName}`);
  }

  check(hasMainConnection(engine, 'Load Prior State', 'Select Run Mode'), 'engine routes prior state to Select Run Mode');
  check(hasMainConnection(engine, 'Select Run Mode', 'Build Judge Inputs'), 'engine routes mode selection to judge inputs');
  check(hasMainConnection(engine, 'Build Judge Inputs', 'Sprint Judge AI Agent'), 'engine routes judge inputs to judge AI');
  check(hasMainConnection(engine, 'Sprint Judge AI Agent', 'Delivery Gate'), 'engine routes judge AI to delivery gate');
  check(hasMainConnection(engine, 'Delivery Gate', 'Get Members'), 'engine routes gate directly to member resolver');
  check(!nodeByName(engine, 'If Need Draft?'), 'engine no longer includes drafter IF node');
  check(!nodeByName(engine, 'Build Draft Inputs'), 'engine no longer includes drafter input builder');
  check(!nodeByName(engine, 'Message Drafter AI Agent'), 'engine no longer includes drafter AI agent');
  check(!nodeByName(engine, 'Structured Message Draft Output Parser'), 'engine no longer includes drafter parser');
  check(!nodeByName(engine, 'Message Drafter Model'), 'engine no longer includes drafter model');

  check(hasAiConnection(engine, 'Structured Sprint Judgment Output Parser', 'ai_outputParser', 'Sprint Judge AI Agent'), 'judge parser wired to judge AI');
  check(hasAiConnection(engine, 'Sprint Judge Model', 'ai_languageModel', 'Sprint Judge AI Agent'), 'judge model wired to judge AI');

  const normalizeCode = String(nodeByName(engine, 'Normalize Request')?.parameters?.jsCode || '');
  const modeCode = String(nodeByName(engine, 'Select Run Mode')?.parameters?.jsCode || '');
  const judgeInputCode = String(nodeByName(engine, 'Build Judge Inputs')?.parameters?.jsCode || '');
  const gateCode = String(nodeByName(engine, 'Delivery Gate')?.parameters?.jsCode || '');
  const renderCode = String(nodeByName(engine, 'Build Render Model')?.parameters?.jsCode || '');
  const deliveryCode = String(nodeByName(engine, 'Build Delivery Messages')?.parameters?.jsCode || '');
  const persistCode = String(nodeByName(engine, 'Build Persist Query')?.parameters?.jsCode || '');
  const resultCode = String(nodeByName(engine, 'Build Engine Result')?.parameters?.jsCode || '');
  const judgeSchema = String(nodeByName(engine, 'Structured Sprint Judgment Output Parser')?.parameters?.jsonSchemaExample || '');

  check(
    normalizeCode.includes("const runType = requestedRunType === 'review' ? 'review' : 'scan';"),
    'Normalize Request normalizes runType to scan/review only',
  );
  check(!normalizeCode.includes('light_scan'), 'Normalize Request no longer accepts legacy light_scan');
  check(!normalizeCode.includes('deep_analysis'), 'Normalize Request no longer accepts legacy deep_analysis');
  check(!normalizeCode.includes('endgame'), 'Normalize Request no longer accepts legacy endgame');

  check(modeCode.includes('weekday === 1 || weekday === 4'), 'Select Run Mode uses Monday/Thursday review checkpoints');
  check(modeCode.includes('daysRemaining <= 1'), 'Select Run Mode enforces near-end threshold <= 1 day');
  check(
    modeCode.includes("selectedMode = hasManualOverride")
      || modeCode.includes("selectedMode = (isNearEnd || isReviewCheckpoint) ? 'review' : 'scan'"),
    'Select Run Mode computes scan/review mode',
  );
  check(modeCode.includes('triggerSource === \'manual\''), 'Select Run Mode gates override to manual trigger');
  check(modeCode.includes("['scan', 'review'].includes(forceMode)"), 'Select Run Mode validates forceMode values');
  check(modeCode.includes("modeSelectionSource = hasManualOverride ? 'manual_override' : 'auto'"), 'Select Run Mode emits modeSelectionSource');

  check(judgeInputCode.includes('mode_policy'), 'Build Judge Inputs includes mode policy in packet');
  check(judgeInputCode.includes('is_near_end'), 'Build Judge Inputs includes near-end flag in packet');
  check(judgeInputCode.includes('Do not generate a full daily digest shape'), 'Build Judge Inputs adds strict scan prompt policy');
  check(judgeInputCode.includes('salvage, de-scope, and carryover'), 'Build Judge Inputs adds near-end review framing');
  check(judgeInputCode.includes('language_config'), 'Build Judge Inputs includes language_config');
  check(judgeInputCode.includes('semantic_output'), 'Build Judge Inputs enforces semantic_output contract');
  check(judgeInputCode.includes('narrative_output'), 'Build Judge Inputs enforces narrative_output contract');

  check(judgeSchema.includes('"semantic_output"'), 'Judge parser schema includes semantic_output');
  check(judgeSchema.includes('"narrative_output"'), 'Judge parser schema includes narrative_output');

  check(gateCode.includes('newIssue'), 'Delivery Gate computes newIssue flag');
  check(gateCode.includes('severityIncrease'), 'Delivery Gate computes severityIncrease flag');
  check(gateCode.includes('materialChange'), 'Delivery Gate computes materialChange flag');
  check(gateCode.includes('newGoalBlocker'), 'Delivery Gate computes newGoalBlocker flag');
  check(gateCode.includes("selectedMode === 'scan'"), 'Delivery Gate has explicit scan branch');
  check(gateCode.includes('!hasDeterministicDelta'), 'Delivery Gate forces noMessage for scan without delta');
  check(gateCode.includes('!hasActionableInsight'), 'Delivery Gate forces noMessage for review without actionable insight');
  check(gateCode.includes('semantic_signature'), 'Delivery Gate computes semantic_signature');
  check(gateCode.includes('semanticOutput'), 'Delivery Gate reads semanticOutput');
  check(gateCode.includes('narrativeOutput'), 'Delivery Gate reads narrativeOutput');

  check(renderCode.includes('scanDeltaLines'), 'Build Render Model exposes scanDeltaLines');
  check(renderCode.includes("selectedMode === 'review'"), 'Build Render Model has review-only full digest branch');
  check(renderCode.includes("renderLineMentions('scanDelta'"), 'Build Render Model applies mention resolver to scan delta lines');
  check(renderCode.includes('narrativeOutput'), 'Build Render Model reads localized narrative output');

  check(deliveryCode.includes("if (mode === 'scan')"), 'Build Delivery Messages has scan-only compact delivery branch');
  check(deliveryCode.includes('scanDeltaLines'), 'Build Delivery Messages uses scan delta lines');
  check(deliveryCode.includes('unified_digest_card'), 'Build Delivery Messages keeps card path for review mode');
  check(deliveryCode.includes('messageLanguage'), 'Build Delivery Messages carries message language');

  check(persistCode.includes('const selectedMode'), 'Build Persist Query persists selected mode');
  check(persistCode.includes('modeSelectionSource'), 'Build Persist Query persists modeSelectionSource');
  check(persistCode.includes("selectedMode === 'review' && isNearEnd"), 'Build Persist Query near-end retro notes gated on review mode');
  check(persistCode.includes('semantic_signature'), 'Build Persist Query stores semantic_signature');
  check(persistCode.includes('semantic_json'), 'Build Persist Query stores semantic_json in metadata');
  check(persistCode.includes('narrative_json'), 'Build Persist Query stores narrative_json in metadata');
  check(persistCode.includes('message_language'), 'Build Persist Query stores message_language in metadata');

  check(resultCode.includes('selectedMode'), 'Build Engine Result returns selectedMode');
  check(resultCode.includes('modeSelectionSource'), 'Build Engine Result returns modeSelectionSource');
  check(resultCode.includes('deterministicGate'), 'Build Engine Result returns deterministic gate summary');
  check(resultCode.includes('messageLanguage'), 'Build Engine Result returns messageLanguage');
}

const readmeContent = fileExists('README.md') ? readText('README.md') : '';
const scriptsReadmeContent = fileExists('scripts/README.md') ? readText('scripts/README.md') : '';
const changelogContent = fileExists('CHANGELOG.md') ? readText('CHANGELOG.md') : '';

check(readmeContent.includes('Sprint Monitor Scheduler'), 'README documents Sprint Monitor Scheduler');
check(readmeContent.includes('scan/review'), 'README documents scan/review mode model');
check(scriptsReadmeContent.includes('import-sprint-monitor-scheduler-workflow.sh'), 'scripts/README documents scheduler import wrapper');
check(!scriptsReadmeContent.includes('import-sprint-monitor-deep-analysis-workflow.sh'), 'scripts/README removes deep-analysis wrapper docs');
check(!scriptsReadmeContent.includes('import-sprint-monitor-endgame-workflow.sh'), 'scripts/README removes endgame wrapper docs');
check(changelogContent.includes('single scheduler') || changelogContent.includes('Sprint Monitor Scheduler'), 'CHANGELOG includes scheduler cutover note');

if (warnings.length > 0 && strictMode) {
  failures.push(...warnings.map((item) => '[WARN-as-error] ' + item));
}

if (failures.length > 0) {
  console.error('[sprint-monitor-checklist] FAIL');
  for (const message of failures) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

console.log('[sprint-monitor-checklist] PASS');
for (const message of passes) {
  console.log(`- ${message}`);
}
for (const message of warnings) {
  console.log(`- [WARN] ${message}`);
}
