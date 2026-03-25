#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');
const workflowPath =
  process.argv[2] ?? path.join(rootDir, 'workflows/book-review-gemini.workflow.json');
const promptTemplatePath = path.join(rootDir, 'workflows/prompts/book-review-master-prompt.txt');

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
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

function normalizeMessage(message) {
  return String(message ?? '').replace(/\r\n/g, '\n').trim();
}

async function loadCodeFromWorkflow(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const workflow = JSON.parse(raw);
  const node = (workflow.nodes ?? []).find((n) => n.name === 'Generate Full Review');
  if (!node) fail('Cannot find node "Generate Full Review" in workflow template');
  const code = node.parameters?.jsCode;
  if (!code || typeof code !== 'string') fail('Missing jsCode in "Generate Full Review" node');
  return code;
}

function createBaseInput(promptTemplate, overrides = {}) {
  return {
    model: 'gemini-3-flash-preview',
    fallback_model: 'gemini-2.5-pro',
    cliproxy_base_url: 'http://127.0.0.1:8317',
    cliproxy_client_key: 'test-key',
    max_turns: 8,
    user_input: 'Sach Nha Gia Kim cua tac gia Paulo Coelho',
    master_prompt_template: promptTemplate,
    ...overrides,
  };
}

async function runCode(code, { input, responses, throwAtCall, throwError }) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const execute = new AsyncFunction('$input', 'helpers', '$helpers', code);

  const responseQueue = [...responses];
  let callCount = 0;
  const observedRequests = [];

  const $input = {
    first: () => ({ json: input }),
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

  const output = await execute($input, helperObject, helperObject);
  assert(Array.isArray(output), 'Code node output must be an array');
  assert(output.length > 0, 'Code node output must have at least one item');
  assert(output[0] && typeof output[0] === 'object', 'First output item must be an object');
  assert(output[0].json && typeof output[0].json === 'object', 'First output item must have json');

  return {
    data: output[0].json,
    callCount,
    observedRequests,
  };
}

async function runChecklist() {
  const code = await loadCodeFromWorkflow(workflowPath);
  const promptTemplate = await fs.readFile(promptTemplatePath, 'utf8');
  const results = [];

  const tests = [
    {
      id: '1',
      name: 'Sample input returns long review content',
      fn: async () => {
        const longChunk =
          'Ban da bao gio thay minh dung giua nga ba cuoc doi, cam thay moi thu rat mo ho? ' +
          'Cuon sach nay nhu mot tam guong, nhac ban nhe nhang ve hanh trinh tim kho bau ben trong chinh minh. ' +
          'Noi dung du dai de test checklist automation.\n-END-';
        const run = await runCode(code, {
          input: createBaseInput(promptTemplate, {
            user_input: 'Sach Nha Gia Kim cua tac gia Paulo Coelho',
          }),
          responses: [buildChatResponse(longChunk)],
        });

        assert(run.callCount === 1, 'Expected exactly 1 call in case 1');
        assert(run.data.stop_reason === 'completed', 'Expected stop_reason=completed in case 1');
        assert(
          normalizeMessage(run.data.message).length > 120,
          'Expected output message to be long enough in case 1',
        );
      },
    },
    {
      id: '2',
      name: 'Single response without continue marker stops immediately',
      fn: async () => {
        const run = await runCode(code, {
          input: createBaseInput(promptTemplate),
          responses: [buildChatResponse('Day la doan duy nhat khong co marker ket thuc.')],
        });

        assert(run.callCount === 1, 'Expected exactly 1 call in case 2');
        assert(run.data.turn_count === 1, 'Expected turn_count=1 in case 2');
        assert(run.data.stop_reason === 'completed', 'Expected stop_reason=completed in case 2');
      },
    },
    {
      id: '3',
      name: 'Continue loop sends "Continue" and merges full response',
      fn: async () => {
        const run = await runCode(code, {
          input: createBaseInput(promptTemplate),
          responses: [
            buildChatResponse(
              'Doan 1 mo dau hanh trinh.\n\n-CONTINUE-\n(Ban hay noi "Continue" de minh viet tiep.)',
            ),
            buildChatResponse('Doan 2 ket lai thong diep.\n-END-'),
          ],
        });

        assert(run.callCount === 2, 'Expected 2 calls in case 3');
        assert(run.data.turn_count === 2, 'Expected turn_count=2 in case 3');
        assert(run.data.stop_reason === 'completed', 'Expected stop_reason=completed in case 3');
        assert(
          !normalizeMessage(run.data.full_review).includes('-CONTINUE-'),
          'Expected intermediate "-CONTINUE-" to be removed in case 3',
        );
        assert(
          !normalizeMessage(run.data.full_review).includes('Ban hay noi "Continue"'),
          'Expected trailing reminder after "-CONTINUE-" to be removed in case 3',
        );
        assert(
          normalizeMessage(run.data.full_review).includes('Doan 1 mo dau hanh trinh.'),
          'Expected chunk 1 in merged content for case 3',
        );
        assert(
          normalizeMessage(run.data.full_review).includes('Doan 2 ket lai thong diep.'),
          'Expected chunk 2 in merged content for case 3',
        );

        const secondRequestMessages = run.observedRequests[1]?.body?.messages ?? [];
        const lastUserMessage = secondRequestMessages
          .slice()
          .reverse()
          .find((m) => m.role === 'user');
        assert(
          lastUserMessage?.content === 'Continue',
          'Expected second request to include follow-up user message "Continue"',
        );
      },
    },
    {
      id: '4',
      name: 'Continue marker in the middle should not trigger another call',
      fn: async () => {
        const run = await runCode(code, {
          input: createBaseInput(promptTemplate),
          responses: [
            buildChatResponse(
              'Noi dung co nhac den -CONTINUE- o giua cau, nhung ket thuc cua doan khong phai marker.',
            ),
          ],
        });

        assert(run.callCount === 1, 'Expected exactly 1 call in case 4');
        assert(run.data.turn_count === 1, 'Expected turn_count=1 in case 4');
        assert(run.data.stop_reason === 'completed', 'Expected stop_reason=completed in case 4');
      },
    },
    {
      id: '5',
      name: 'Stop safely at max_turns when continue marker keeps appearing',
      fn: async () => {
        const run = await runCode(code, {
          input: createBaseInput(promptTemplate, { max_turns: 2 }),
          responses: [
            buildChatResponse('Doan 1\n-CONTINUE-'),
            buildChatResponse('Doan 2 van tiep tuc\n-CONTINUE-'),
          ],
        });

        assert(run.callCount === 2, 'Expected exactly 2 calls in case 5');
        assert(run.data.turn_count === 2, 'Expected turn_count=2 in case 5');
        assert(run.data.stop_reason === 'max_turns', 'Expected stop_reason=max_turns in case 5');
        assert(
          normalizeMessage(run.data.message).includes('Đã đạt giới hạn 2'),
          'Expected max_turns note in output message for case 5',
        );
      },
    },
    {
      id: '6',
      name: 'API error should set api_error with contextual message',
      fn: async () => {
        const run = await runCode(code, {
          input: createBaseInput(promptTemplate),
          responses: [],
          throwAtCall: 1,
          throwError: new Error('401 Unauthorized'),
        });

        assert(run.callCount === 1, 'Expected exactly 1 call in case 6');
        assert(run.data.turn_count === 0, 'Expected turn_count=0 in case 6');
        assert(run.data.stop_reason === 'api_error', 'Expected stop_reason=api_error in case 6');
        assert(
          normalizeMessage(run.data.message).includes('401 Unauthorized'),
          'Expected error details in output message for case 6',
        );
      },
    },
    {
      id: '7',
      name: 'Capacity error on primary model should fallback to backup model',
      fn: async () => {
        const primaryModel = 'gemini-3-flash-preview';
        const backupModel = 'gemini-2.5-pro';
        let simulatedCallCount = 0;

        const run = await runCode(code, {
          input: createBaseInput(promptTemplate, {
            model: primaryModel,
            fallback_model: backupModel,
          }),
          responses: [buildChatResponse('Noi dung tu model du phong.')],
          throwAtCall: 1,
          throwError: new Error(
            'Request failed with status code 429: MODEL_CAPACITY_EXHAUSTED on primary model',
          ),
        });

        simulatedCallCount = run.callCount;

        assert(simulatedCallCount === 2, 'Expected fallback to trigger second call in case 7');
        assert(run.data.stop_reason === 'completed', 'Expected stop_reason=completed in case 7');
        assert(run.data.fallback_used === true, 'Expected fallback_used=true in case 7');
        assert(run.data.model === backupModel, 'Expected output model to be backup model in case 7');

        const firstModel = run.observedRequests[0]?.body?.model;
        const secondModel = run.observedRequests[1]?.body?.model;
        assert(firstModel === primaryModel, 'Expected first call to use primary model in case 7');
        assert(secondModel === backupModel, 'Expected second call to use backup model in case 7');
      },
    },
  ];

  for (const test of tests) {
    try {
      await test.fn();
      results.push({ ...test, status: 'PASS' });
    } catch (error) {
      results.push({
        ...test,
        status: 'FAIL',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const failed = results.filter((r) => r.status === 'FAIL');

  console.log('[book-review-checklist] Workflow:', workflowPath);
  for (const result of results) {
    if (result.status === 'PASS') {
      console.log(`- [PASS] Case ${result.id}: ${result.name}`);
    } else {
      console.log(`- [FAIL] Case ${result.id}: ${result.name}`);
      console.log(`  Reason: ${result.error}`);
    }
  }

  if (failed.length > 0) {
    console.log(
      `[book-review-checklist] Result: ${results.length - failed.length}/${results.length} PASS`,
    );
    process.exit(1);
  }

  console.log(`[book-review-checklist] Result: ${results.length}/${results.length} PASS`);
}

runChecklist().catch((error) => {
  console.error('[book-review-checklist] Fatal:', error instanceof Error ? error.message : error);
  process.exit(1);
});
