#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');
const workflowPath =
  process.argv[2] ?? path.join(rootDir, 'workflows/book-review/book-review-gemini.workflow.json');
const promptTemplatePath = path.join(
  rootDir,
  'workflows/book-review/prompts/book-review-master-prompt.txt',
);
const metadataPromptTemplatePath = path.join(
  rootDir,
  'workflows/book-review/prompts/book-review-metadata-prompt.txt',
);
const qcPromptTemplatePath = path.join(
  rootDir,
  'workflows/book-review/prompts/book-review-qc-prompt.txt',
);
const reviewEditPromptTemplatePath = path.join(
  rootDir,
  'workflows/book-review/prompts/book-review-review-edit-prompt.txt',
);

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function normalizeMessage(message) {
  return String(message ?? '').replace(/\r\n/g, '\n').trim();
}

function buildChatResponse(content) {
  return {
    choices: [
      {
        message: {
          content,
        },
      },
    ],
  };
}

async function loadWorkflow(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

function getCodeNode(workflow, nodeName) {
  const node = (workflow.nodes ?? []).find((n) => n.name === nodeName);
  if (!node) fail(`Cannot find node "${nodeName}" in workflow template`);
  const code = node.parameters?.jsCode;
  if (!code || typeof code !== 'string') fail(`Missing jsCode in node "${nodeName}"`);
  return { node, code };
}

function createBaseInput(promptTemplate, metadataPromptTemplate, overrides = {}) {
  return {
    model: 'gemini-3-flash-preview',
    fallback_model: 'gemini-2.5-pro',
    openai_model: 'gpt-5.4',
    cliproxy_base_url: 'http://127.0.0.1:8317',
    cliproxy_client_key: 'test-key',
    max_turns: 8,
    qc_score_warning_threshold: 7,
    reviewer_wait_timeout_seconds: 900,
    user_input: 'Sach Nha Gia Kim cua tac gia Paulo Coelho',
    master_prompt_template: promptTemplate,
    metadata_prompt_template: metadataPromptTemplate,
    qc_prompt_template: 'You are a strict Vietnamese book-review QC editor.',
    review_revision_prompt_template: 'You are a senior Vietnamese script editor.',
    ...overrides,
  };
}

async function runCode(code, { input, responses = [], throwAtCall, throwError }) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const execute = new AsyncFunction('$input', 'helpers', '$helpers', '$json', '$items', code);

  const responseQueue = [...responses];
  let callCount = 0;
  const observedRequests = [];

  const $input = {
    first: () => ({ json: input }),
    all: () => [{ json: input }],
  };

  const helperObject = {
    httpRequest: async (request) => {
      callCount += 1;
      observedRequests.push(request);

      if (throwAtCall && callCount === throwAtCall) {
        throw throwError ?? new Error('Mock API error');
      }

      if (responseQueue.length === 0) {
        throw new Error(`No mock response left for call ${callCount}`);
      }

      return responseQueue.shift();
    },
  };

  const rawOutput = await execute(
    $input,
    helperObject,
    helperObject,
    input,
    () => [{ json: input }],
  );

  let normalized;
  if (Array.isArray(rawOutput)) {
    assert(rawOutput.length > 0, 'Code node output array must have at least one item');
    const item = rawOutput[0];
    if (item && typeof item === 'object' && 'json' in item) {
      normalized = item.json;
    } else {
      normalized = item;
    }
  } else {
    normalized = rawOutput;
  }

  assert(normalized && typeof normalized === 'object', 'Code node output must be an object');

  return {
    data: normalized,
    callCount,
    observedRequests,
  };
}

async function runChecklist() {
  const workflow = await loadWorkflow(workflowPath);
  const promptTemplate = await fs.readFile(promptTemplatePath, 'utf8');
  const metadataPromptTemplate = await fs.readFile(metadataPromptTemplatePath, 'utf8');
  await fs.readFile(qcPromptTemplatePath, 'utf8');
  await fs.readFile(reviewEditPromptTemplatePath, 'utf8');

  const generateNode = getCodeNode(workflow, 'Generate Full Review');
  const parseNode = getCodeNode(workflow, 'Parse Review Sections');
  const reviewerNode = getCodeNode(workflow, 'Reviewer Orchestrator');

  const results = [];

  const tests = [
    {
      id: '0',
      name: 'Workflow topology updated to simplified reviewer loop',
      fn: async () => {
        const requiredNodes = [
          'Generate Full Review',
          'Parse Review Sections',
          'Reviewer Orchestrator',
          'Build Notify Payload',
          'Notify via Shared Workflow',
          'Return Chat Response',
        ];

        for (const nodeName of requiredNodes) {
          const node = (workflow.nodes ?? []).find((n) => n.name === nodeName);
          assert(node, `Missing required node: ${nodeName}`);
        }

        const forbiddenNodes = [
          'Generate Video Metadata',
          'Send message and wait for response',
          'AI QC + Internal Scoring',
        ];
        for (const nodeName of forbiddenNodes) {
          const node = (workflow.nodes ?? []).find((n) => n.name === nodeName);
          assert(!node, `Forbidden legacy node still exists: ${nodeName}`);
        }

        const setNotify = (workflow.nodes ?? []).find((n) => n.name === 'Set Notify Targets');
        assert(setNotify, 'Missing Set Notify Targets node');
        assert(
          setNotify?.parameters?.includeOtherFields === true,
          'Set Notify Targets must keep includeOtherFields=true',
        );

        const setConfig = (workflow.nodes ?? []).find((n) => n.name === 'Set Config');
        assert(setConfig, 'Missing Set Config node');
        const metadataPromptAssignment = setConfig?.parameters?.assignments?.assignments?.find(
          (item) => item?.name === 'metadata_prompt_template',
        );
        const qcPromptAssignment = setConfig?.parameters?.assignments?.assignments?.find(
          (item) => item?.name === 'qc_prompt_template',
        );
        const reviewEditPromptAssignment = setConfig?.parameters?.assignments?.assignments?.find(
          (item) => item?.name === 'review_revision_prompt_template',
        );
        assert(
          metadataPromptAssignment?.value === '__BOOK_REVIEW_METADATA_PROMPT__',
          'Set Config must include metadata_prompt_template placeholder',
        );
        assert(
          qcPromptAssignment?.value === '__BOOK_REVIEW_QC_PROMPT__',
          'Set Config must include qc_prompt_template placeholder',
        );
        assert(
          reviewEditPromptAssignment?.value === '__BOOK_REVIEW_REVIEW_EDIT_PROMPT__',
          'Set Config must include review_revision_prompt_template placeholder',
        );

        const notifyNode = (workflow.nodes ?? []).find((n) => n.name === 'Notify via Shared Workflow');
        assert(notifyNode, 'Missing Notify via Shared Workflow node');
        assert(
          notifyNode?.parameters?.workflowPath === '__SHARED_NOTIFICATION_WORKFLOW_PATH__',
          'Notify via Shared Workflow must keep placeholder workflowPath in template',
        );

        const reviewerTargets =
          workflow?.connections?.['Reviewer Orchestrator']?.main?.[0]?.map((edge) => edge?.node) ?? [];
        assert(
          reviewerTargets.includes('Return Chat Response'),
          'Reviewer Orchestrator must connect directly to Return Chat Response',
        );

        const parseTargets =
          workflow?.connections?.['Parse Review Sections']?.main?.[0]?.map((edge) => edge?.node) ?? [];
        assert(
          parseTargets.includes('Set Notify Targets'),
          'Parse Review Sections must connect directly to Set Notify Targets',
        );
      },
    },
    {
      id: '1',
      name: 'runOnceForEachItem code nodes use safe input access',
      fn: async () => {
        const offenders = [];
        for (const node of workflow.nodes ?? []) {
          if (node?.type !== 'n8n-nodes-base.code') continue;
          if (String(node?.parameters?.mode ?? '') !== 'runOnceForEachItem') continue;

          const code = String(node?.parameters?.jsCode ?? '');
          if (/\$input\.first\s*\(/.test(code) || /\$input\.all\s*\(/.test(code)) {
            offenders.push(String(node?.name ?? '(unnamed)'));
          }
        }

        assert(
          offenders.length === 0,
          'runOnceForEachItem nodes must not use $input.first/$input.all. Offenders: ' + offenders.join(', '),
        );
      },
    },
    {
      id: '2',
      name: 'Generate Full Review one-shot flow',
      fn: async () => {
        const run = await runCode(generateNode.code, {
          input: createBaseInput(promptTemplate, metadataPromptTemplate),
          responses: [
            buildChatResponse('Noi dung review ngan de test.\n<<<SECTION|intro|Phan mo dau>>>\nA\n<<<END_SECTION>>>\n-END-'),
          ],
        });

        assert(run.callCount === 1, 'Expected one API call');
        assert(run.data.stop_reason === 'completed', 'Expected stop_reason=completed');
        assert(normalizeMessage(run.data.message).length > 10, 'Expected non-empty output message');
      },
    },
    {
      id: '3',
      name: 'Generate Full Review continue loop',
      fn: async () => {
        const run = await runCode(generateNode.code, {
          input: createBaseInput(promptTemplate, metadataPromptTemplate),
          responses: [
            buildChatResponse('Doan 1\n-CONTINUE-\nVui long Continue'),
            buildChatResponse('Doan 2\n-END-'),
          ],
        });

        assert(run.callCount === 2, 'Expected two API calls');
        assert(run.data.turn_count === 2, 'Expected turn_count=2');
        assert(!normalizeMessage(run.data.full_review).includes('-CONTINUE-'), 'Intermediate marker must be stripped');
      },
    },
    {
      id: '4',
      name: 'Generate Full Review max_turns guard',
      fn: async () => {
        const run = await runCode(generateNode.code, {
          input: createBaseInput(promptTemplate, metadataPromptTemplate, { max_turns: 2 }),
          responses: [
            buildChatResponse('Doan 1\n-CONTINUE-'),
            buildChatResponse('Doan 2\n-CONTINUE-'),
          ],
        });

        assert(run.callCount === 2, 'Expected two calls at max_turns=2');
        assert(run.data.stop_reason === 'max_turns', 'Expected stop_reason=max_turns');
      },
    },
    {
      id: '5',
      name: 'Parse Review Sections extracts intro/parts/outro without intro hooks',
      fn: async () => {
        const fullReview = [
          '<<<SECTION|intro|Phan mo dau>>>',
          'Mo dau thong thuong',
          '<<<END_SECTION>>>',
          '',
          '<<<SECTION|part_01|Y 1>>>',
          'Noi dung 1',
          '<<<END_SECTION>>>',
          '',
          '<<<SECTION|outro|Phan ket>>>',
          'Ket luan va CTA',
          '<<<END_SECTION>>>',
          '-END-',
        ].join('\n');

        const run = await runCode(parseNode.code, {
          input: {
            ...createBaseInput(promptTemplate, metadataPromptTemplate),
            message: fullReview,
            full_review: fullReview,
          },
        });

        assert(run.data.review_sections_count === 3, 'Expected 3 parsed sections');
        assert(run.data.review_intro === 'Mo dau thong thuong', 'Expected intro text parsed');
        assert(Array.isArray(run.data.review_parts) && run.data.review_parts.length === 1, 'Expected 1 part');
      },
    },
    {
      id: '6',
      name: 'Reviewer Orchestrator skips Telegram stage when token/chat missing',
      fn: async () => {
        const qcResponse = {
          qc_checks: [
            { id: 'content_accuracy', status: 'pass', note: 'ok' },
            { id: 'fabricated_quote', status: 'warn', note: 'uncertain quote' },
            { id: 'hook_strength_5s', status: 'pass', note: 'good' },
            { id: 'cta_contextual', status: 'warn', note: 'cta can be stronger' },
          ],
          qc_issues: ['quote uncertain'],
          scores: {
            hook: 8,
            clarity: 8,
            originality: 6,
            practical_value: 7,
          },
          risk_level: 'med',
        };

        const run = await runCode(reviewerNode.code, {
          input: {
            ...createBaseInput(promptTemplate, metadataPromptTemplate),
            full_review: 'Noi dung review',
            review_intro: 'Mo dau',
            review_outro: 'Ket + CTA',
            telegram_bot_token: '',
            telegram_chat_id: '',
          },
          responses: [buildChatResponse(JSON.stringify(qcResponse))],
        });

        assert(run.callCount === 1, 'Expected 1 HTTP call for QC before Telegram gate');
        assert(run.data.qc_status === 'generated', 'Expected qc_status=generated');
        assert(run.data.hook_score === 8, 'Expected hook_score from Reviewer Orchestrator QC');
        assert(run.data.reviewer_gate_status === 'skip_no_telegram', 'Expected skip_no_telegram status');
        assert(run.data.metadata_status === 'skip', 'Expected metadata_status=skip');
      },
    },
    {
      id: '7',
      name: 'Prompt contract reverted to single intro section (no intro_01..03)',
      fn: async () => {
        const prompt = await fs.readFile(promptTemplatePath, 'utf8');
        assert(prompt.includes('<<<SECTION|intro|Phan mo dau>>>'), 'Prompt must still require intro section');
        assert(!prompt.includes('intro_01:'), 'Prompt must not require intro_01 format');
        assert(!prompt.includes('intro_02:'), 'Prompt must not require intro_02 format');
        assert(!prompt.includes('intro_03:'), 'Prompt must not require intro_03 format');
      },
    },
    {
      id: '8',
      name: 'Metadata prompt file excludes long description output',
      fn: async () => {
        const prompt = await fs.readFile(metadataPromptTemplatePath, 'utf8');
        assert(prompt.includes('title'), 'Metadata prompt should mention title');
        assert(prompt.includes('caption'), 'Metadata prompt should mention caption');
        assert(prompt.includes('thumbnail_text'), 'Metadata prompt should mention thumbnail_text');
        assert(prompt.includes('hashtags'), 'Metadata prompt should mention hashtags');
        assert(
          !/youtube_description_long|video_description/i.test(prompt),
          'Metadata prompt must not request long description fields',
        );
      },
    },
  ];

  for (const test of tests) {
    const started = Date.now();
    try {
      await test.fn();
      const elapsed = Date.now() - started;
      results.push({ id: test.id, name: test.name, status: 'PASS', elapsed });
      console.log(`[PASS] Case ${test.id}: ${test.name} (${elapsed}ms)`);
    } catch (error) {
      const elapsed = Date.now() - started;
      results.push({
        id: test.id,
        name: test.name,
        status: 'FAIL',
        elapsed,
        error: error?.message ? String(error.message) : String(error),
      });
      console.log(`[FAIL] Case ${test.id}: ${test.name} (${elapsed}ms)`);
      console.log(`       ${results[results.length - 1].error}`);
    }
  }

  const passCount = results.filter((result) => result.status === 'PASS').length;
  const failCount = results.length - passCount;

  console.log('');
  console.log('=== Summary ===');
  console.log(`Workflow template: ${workflowPath}`);
  console.log(`Prompt template:   ${promptTemplatePath}`);
  console.log(`Metadata prompt:  ${metadataPromptTemplatePath}`);
  console.log(`Total cases: ${results.length}`);
  console.log(`PASS: ${passCount}`);
  console.log(`FAIL: ${failCount}`);

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

runChecklist().catch((error) => {
  console.error('[book-review-checklist] Fatal:', error?.message ?? error);
  process.exit(1);
});
