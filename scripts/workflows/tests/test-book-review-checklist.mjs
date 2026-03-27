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

function getNode(workflow, nodeName) {
  const node = (workflow.nodes ?? []).find((item) => item.name === nodeName);
  if (!node) fail(`Cannot find node "${nodeName}" in workflow ${workflow.name}`);
  return node;
}

function getCodeNode(workflow, nodeName) {
  const node = getNode(workflow, nodeName);
  const code = node.parameters?.jsCode;
  if (!code || typeof code !== 'string') {
    fail(`Missing jsCode in node "${nodeName}"`);
  }
  return { node, code };
}

function getSetAssignmentValue(workflow, setNodeName, assignmentName) {
  const node = getNode(workflow, setNodeName);
  const assignments = node.parameters?.assignments?.assignments ?? [];
  return assignments.find((item) => item?.name === assignmentName)?.value;
}

function getTargets(workflow, sourceNodeName) {
  return (((workflow.connections ?? {})[sourceNodeName]?.main ?? [])
    .flat()
    .map((edge) => String(edge?.node ?? ''))
    .filter(Boolean));
}

function createBaseInput(promptTemplate, metadataPromptTemplate, overrides = {}) {
  return {
    model: 'gpt-5',
    fallback_model: 'gpt-5',
    openai_model: 'gpt-5',
    cliproxy_base_url: 'http://127.0.0.1:8317',
    cliproxy_client_key: 'test-key',
    max_turns: 8,
    qc_score_warning_threshold: 7,
    reviewer_wait_timeout_seconds: 900,
    user_input: 'Sach Nha Gia Kim cua tac gia Paulo Coelho',
    master_prompt_template: promptTemplate,
    metadata_prompt_template: metadataPromptTemplate,
    n8n_api_url: 'http://localhost:5678',
    n8n_api_key: 'n8n-test-key',
    session_store_name: 'book_review_sessions',
    shared_notification_workflow_path: '/tmp/shared-notify.workflow.json',
    telegram_bot_token: 'telegram-token',
    telegram_chat_id: '12345',
    ...overrides,
  };
}

async function runCode(code, { input, responses = [], throwAtCall, throwError, allowEmpty = false }) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const execute = new AsyncFunction('$input', 'helpers', '$helpers', '$json', '$items', code);

  const responseQueue = [...responses];
  let callCount = 0;

  const $input = {
    first: () => ({ json: input }),
    all: () => [{ json: input }],
  };

  const helperObject = {
    httpRequest: async () => {
      callCount += 1;

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
    if (rawOutput.length === 0 && allowEmpty) {
      return {
        data: null,
        raw: rawOutput,
        callCount,
      };
    }
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
    raw: rawOutput,
    callCount,
  };
}

async function runChecklist() {
  const workflow = await loadWorkflow(workflowPath);
  const promptTemplate = await fs.readFile(promptTemplatePath, 'utf8');
  const metadataPromptTemplate = await fs.readFile(metadataPromptTemplatePath, 'utf8');

  const generateNode = getCodeNode(workflow, 'Generate Full Review');
  const parseNode = getCodeNode(workflow, 'Parse Review Sections');
  const prepareNode = getCodeNode(workflow, 'Prepare Session + Init Event');
  const returnNode = getCodeNode(workflow, 'Return Chat Response');
  const routerParseNode = getCodeNode(workflow, 'Parse Telegram Event');
  const telegramStartNode = getCodeNode(workflow, 'Parse Telegram Start Command');
  const workerNode = getCodeNode(workflow, 'Handle Reviewer Event');

  const results = [];

  const tests = [
    {
      id: '0',
      name: 'Unified workflow topology keeps async ACK + internal event flow',
      fn: async () => {
        const requiredNodes = [
          'Set Config (Main)',
          'Generate Full Review',
          'Parse Review Sections',
          'Send Informations',
          'Set Notify Targets (Main)',
          'Prepare Session + Init Event',
          'Notify via Shared Workflow (Main)',
          'Return Chat Response',
          'Telegram Trigger',
          'Set Config (Telegram)',
          'Parse Telegram Event',
          'Parse Telegram Start Command',
          'Set Config (Worker)',
          'Handle Reviewer Event',
          'Build Notify Payload (Worker)',
        ];

        for (const nodeName of requiredNodes) {
          assert((workflow.nodes ?? []).some((node) => node.name === nodeName), `Missing node: ${nodeName}`);
        }

        assert(
          !(workflow.nodes ?? []).some((node) => node.name === 'Execute Reviewer Worker'),
          'Legacy Execute Reviewer Worker node must not exist after merge',
        );
        assert(
          !(workflow.nodes ?? []).some((node) => node.name === 'Reviewer Orchestrator'),
          'Legacy monolith node Reviewer Orchestrator must not exist',
        );

        const prepareBranches = getTargets(workflow, 'Prepare Session + Init Event');
        assert(
          prepareBranches.length === 1 && prepareBranches[0] === 'Set Config (Worker)',
          'Prepare Session + Init Event must dispatch directly to worker set-config',
        );

        const routerBranches = getTargets(workflow, 'Parse Telegram Event');
        assert(
          routerBranches.length === 1 && routerBranches[0] === 'Set Config (Worker)',
          'Parse Telegram Event must dispatch directly to worker set-config',
        );

        const telegramBranches = getTargets(workflow, 'Set Config (Telegram)');
        assert(
          telegramBranches.includes('Parse Telegram Event') &&
            telegramBranches.includes('Parse Telegram Start Command'),
          'Set Config (Telegram) must fan-out to reviewer router and telegram start parser',
        );

        const telegramStartBranches = getTargets(workflow, 'Parse Telegram Start Command');
        assert(
          telegramStartBranches.includes('Set Config (Main)') &&
            telegramStartBranches.includes('Code in JavaScript'),
          'Parse Telegram Start Command must fan-out to main flow and start notification builder',
        );
        assert(
          !(workflow.nodes ?? []).some((node) => node.name === 'Merge'),
          'Merge node must be removed for clean UI',
        );

        const sendInfoBranches = getTargets(workflow, 'Send Informations');
        assert(
          sendInfoBranches.includes('Return Chat Response') &&
            sendInfoBranches.includes('Set Notify Targets (Main)'),
          'Send Informations must fan-out to chat response + notify target setter',
        );

        const setNotifyMainTargets = getTargets(workflow, 'Set Notify Targets (Main)');
        assert(
          setNotifyMainTargets.length === 1 && setNotifyMainTargets[0] === 'Notify via Shared Workflow (Main)',
          'Set Notify Targets (Main) must be placed right before shared notify',
        );

        assert(
          !(workflow.nodes ?? []).some((node) => node.name === 'When chat message received'),
          'Legacy chat trigger must be removed after migrating start trigger to Telegram',
        );

        assert(
          getSetAssignmentValue(workflow, 'Set Config (Main)', 'n8n_api_url') === '__N8N_API_URL__',
          'Set Config (Main) must keep n8n_api_url placeholder',
        );
        assert(
          getSetAssignmentValue(workflow, 'Set Config (Main)', 'n8n_api_key') === '__N8N_API_KEY__',
          'Set Config (Main) must keep n8n_api_key placeholder',
        );
        assert(
          getSetAssignmentValue(workflow, 'Set Config (Main)', 'shared_notification_workflow_path') ===
            '__SHARED_NOTIFICATION_WORKFLOW_PATH__',
          'Set Config (Main) must keep shared_notification_workflow_path placeholder',
        );
        assert(
          getSetAssignmentValue(workflow, 'Set Config (Main)', 'master_prompt_template') ===
            '__BOOK_REVIEW_MASTER_PROMPT__',
          'Set Config (Main) must keep master prompt placeholder',
        );

        assert(
          returnNode.code.includes("Prepare Session + Init Event"),
          'Return Chat Response must read ack payload from Prepare Session + Init Event',
        );
      },
    },
    {
      id: '1',
      name: 'runOnceForEachItem code nodes never use $input.first/$input.all',
      fn: async () => {
        const offenders = [];

        for (const node of workflow.nodes ?? []) {
          if (node?.type !== 'n8n-nodes-base.code') continue;
          if (String(node?.parameters?.mode ?? '') !== 'runOnceForEachItem') continue;
          const code = String(node?.parameters?.jsCode ?? '');
          if (/\$input\.first\s*\(/.test(code) || /\$input\.all\s*\(/.test(code)) {
            offenders.push(`${workflow.name}::${String(node?.name ?? '(unnamed)')}`);
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
      name: 'Generate Full Review one-shot still works',
      fn: async () => {
        const baseInput = createBaseInput(promptTemplate, metadataPromptTemplate);
        const run = await runCode(generateNode.code, {
          input: baseInput,
          responses: [
            buildChatResponse(
              'Noi dung review ngan de test.\n<<<SECTION|intro|Phan mo dau>>>\nA\n<<<END_SECTION>>>\n-END-',
            ),
          ],
        });

        assert(run.callCount === 1, 'Expected one API call');
        assert(run.data.stop_reason === 'completed', 'Expected stop_reason=completed');
        assert(normalizeMessage(run.data.message).length > 10, 'Expected non-empty output message');
        assert(
          run.data.n8n_api_url === baseInput.n8n_api_url &&
            run.data.n8n_api_key === baseInput.n8n_api_key &&
            run.data.shared_notification_workflow_path === baseInput.shared_notification_workflow_path,
          'Generate output must preserve config fields for downstream nodes',
        );
      },
    },
    {
      id: '3',
      name: 'Generate Full Review continue-loop still works',
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
      name: 'Parse Review Sections extracts intro/parts/outro',
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
      id: '4b',
      name: 'Prepare Session preserves upstream stop_reason when review is empty',
      fn: async () => {
        const run = await runCode(prepareNode.code, {
          input: {
            ...createBaseInput(promptTemplate, metadataPromptTemplate),
            full_review: '',
            message: '[Lỗi gọi model (gpt-5): MODEL_CAPACITY_EXHAUSTED]',
            stop_reason: 'api_error',
          },
        });

        assert(run.data.reviewer_stage === 'failed', 'Expected reviewer_stage=failed');
        assert(run.data.stop_reason === 'api_error', 'Expected upstream stop_reason to be preserved');
        assert(
          normalizeMessage(run.data.message_ack).includes('stop_reason=api_error'),
          'Expected message_ack to include upstream stop_reason details',
        );
      },
    },
    {
      id: '5',
      name: 'Router branch contract is preserved and scheduler timeout branch is removed',
      fn: async () => {
        const telegramTrigger = getNode(workflow, 'Telegram Trigger');
        assert(telegramTrigger.type === 'n8n-nodes-base.telegramTrigger', 'Telegram Trigger node type must be correct');

        assert(
          routerParseNode.code.includes('brv:(rvw|meta):(c|x|s)'),
          'Router callback parser must use compact callback data format brv:*',
        );

        const setConfigTelegram = getNode(workflow, 'Set Config (Telegram)');
        assert(
          setConfigTelegram.parameters?.includeOtherFields === true,
          'Set Config (Telegram) must keep includeOtherFields=true',
        );
        assert(
          !(workflow.nodes ?? []).some((node) =>
            ['Schedule Trigger', 'Set Config (Scheduler)', 'Build Timeout Events'].includes(node.name),
          ),
          'Scheduler timeout branch nodes must be removed for clean UI',
        );
      },
    },
    {
      id: '5b',
      name: 'Router accepts free-text change instruction while awaiting reviewer input',
      fn: async () => {
        const freeTextInstruction =
          'Hook rat cham va giong ke qua hinh anh. Hay gom y thanh 3-4 tuyen cam xuc lien mach.';

        const run = await runCode(routerParseNode.code, {
          input: {
            ...createBaseInput(promptTemplate, metadataPromptTemplate),
            message: {
              text: freeTextInstruction,
              chat: { id: '6920403077' },
              from: { id: '6920403077' },
            },
          },
          responses: [
            {
              data: [
                {
                  id: 'table_test_01',
                  name: 'book_review_sessions',
                },
              ],
            },
            {
              data: [
                {
                  session_token: 'mn8m0e71rc23xyfo',
                  stage: 'review_pending',
                  awaiting_instruction: '1',
                },
              ],
            },
          ],
        });

        assert(run.callCount === 2, 'Router free-text change path should use 2 API calls');
        assert(run.data.event_type === 'review_change', 'Free-text instruction must map to review_change event');
        assert(run.data.session_token === 'mn8m0e71rc23xyfo', 'Router must bind latest awaiting session token');
        assert(run.data.instruction === freeTextInstruction, 'Router must pass full free-text instruction');
      },
    },
    {
      id: '5x',
      name: 'Telegram start parser accepts book-review command and maps to main input',
      fn: async () => {
        const run = await runCode(telegramStartNode.code, {
          input: {
            ...createBaseInput(promptTemplate, metadataPromptTemplate),
            message: {
              text: 'book-review Sách Nhà Giả Kim của tác giả Paulo Coelho',
              chat: { id: '6920403077' },
              from: { id: '6920403077' },
            },
          },
        });

        assert(
          run.data.chatInput === 'Sách Nhà Giả Kim của tác giả Paulo Coelho',
          'Telegram start parser must map command payload to chatInput',
        );
        assert(
          run.data.user_input === 'Sách Nhà Giả Kim của tác giả Paulo Coelho',
          'Telegram start parser must map command payload to user_input',
        );
        assert(
          run.data.start_command === 'book-review',
          'Telegram start parser must mark start_command=book-review',
        );
      },
    },
    {
      id: '5c',
      name: 'Router ignores doi-instruction when no awaiting session is active',
      fn: async () => {
        const run = await runCode(routerParseNode.code, {
          input: {
            ...createBaseInput(promptTemplate, metadataPromptTemplate),
            message: {
              text: 'doi noi dung',
              chat: { id: '6920403077' },
              from: { id: '6920403077' },
            },
          },
          responses: [
            {
              data: [
                {
                  id: 'table_test_01',
                  name: 'book_review_sessions',
                },
              ],
            },
            {
              data: [],
            },
          ],
          allowEmpty: true,
        });

        assert(run.callCount === 2, 'Router should only check table + awaiting session for doi-instruction');
        assert(Array.isArray(run.raw) && run.raw.length === 0, 'Router must not dispatch event when not awaiting');
      },
    },
    {
      id: '6',
      name: 'Worker event contract includes all required event types and no Telegram polling loop',
      fn: async () => {
        const requiredEvents = [
          'init_review',
          'review_change',
          'review_continue',
          'review_stop',
          'metadata_change',
          'metadata_continue',
          'metadata_stop',
          'auto_continue_review',
          'auto_continue_metadata',
        ];

        for (const eventType of requiredEvents) {
          assert(
            workerNode.code.includes(`'${eventType}'`) || workerNode.code.includes(`"${eventType}"`),
            `Worker must support event_type=${eventType}`,
          );
        }

        assert(!workerNode.code.includes('getUpdates'), 'Worker must not poll Telegram getUpdates');
        assert(!routerParseNode.code.includes('getUpdates'), 'Router parse node must not poll getUpdates');
        assert(
          !workerNode.code.includes('Lenh nhanh: tiep | dung | doi <noi_dung_muon_sua>') &&
            !workerNode.code.includes('Lenh nhanh: tiep | dung | doi <field + noi_dung>'),
          'Worker previews must not include legacy Lenh nhanh helper text',
        );
        assert(
          workerNode.code.includes("skip_worker_notify: true"),
          'Worker must mark skip_worker_notify=true when event_type is missing',
        );
        const workerNotifyPayloadNode = getCodeNode(workflow, 'Build Notify Payload (Worker)');
        assert(
          workerNotifyPayloadNode.code.includes('send_informations') &&
            workerNotifyPayloadNode.code.includes('skip_worker_notify === true'),
          'Worker notify payload node must emit send_informations and handle skipped worker items safely',
        );
        assert(
          workerNode.code.includes('lockCallbackActionMessage') &&
            workerNode.code.includes("telegramApi('editMessageText'"),
          'Worker must lock callback action message by editing Telegram message to prevent double-click',
        );
        assert(
          workerNode.code.includes('isSessionTimedOut') &&
            workerNode.code.includes('buildTimeoutActionText') &&
            workerNode.code.includes("action: 'timeout_override_continue'") &&
            !workerNode.code.includes("action: 'timeout_click_rejected'") &&
            !workerNode.code.includes("stop_reason = 'reviewer_timeout'"),
          'Worker must soft-handle timeout: notify stale click but continue processing',
        );
        assert(
          workerNode.code.includes('sendReviewQcAndAction') &&
            workerNode.code.indexOf("await sendReviewPreview(session, 'REVIEW PREVIEW');") <
              workerNode.code.indexOf('session.qc = await runQc(session);'),
          'Worker init_review must send preview before running QC, then send QC + action',
        );

        const workerSetConfig = getNode(workflow, 'Set Config (Worker)');
        assert(
          workerSetConfig.parameters?.includeOtherFields === true,
          'Set Config (Worker) must keep includeOtherFields=true',
        );
      },
    },
    {
      id: '7',
      name: 'Revise flow keeps full master-prompt payload without clipping fallback',
      fn: async () => {
        assert(
          workerNode.code.includes('buildMasterPrompt(masterPromptTemplate, userInputText)'),
          'Worker revise flow must inject master prompt with user_input',
        );
        assert(
          workerNode.code.includes('master_prompt_injected'),
          'Revise payload must include master_prompt_injected context',
        );
        assert(
          !workerNode.code.includes('clipContextText(') && !workerNode.code.includes('shouldRetryWithTrimmedContext('),
          'Revise flow must not clip context fallback anymore',
        );
        assert(
          workerNode.code.includes('buildChangeAckMessage') &&
            workerNode.code.includes("await sendTelegramMessage(buildChangeAckMessage('review', instructionText));") &&
            workerNode.code.includes("await sendTelegramMessage(buildChangeAckMessage('metadata', instructionText));"),
          'Worker must acknowledge received change instructions before regenerate',
        );
      },
    },
    {
      id: '8',
      name: 'QC feedback, metadata payload, and long-text file delivery contract are preserved',
      fn: async () => {
        assert(workerNode.code.includes('words.slice(0, 200)'), 'QC feedback must be capped at 200 words');
        assert(
          workerNode.code.includes('review_excerpt') && workerNode.code.includes('reviewer_instruction'),
          'Metadata generation must send both review text and reviewer instruction',
        );
        assert(
          workerNode.code.includes('telegramReviewFileThresholdChars') &&
            workerNode.code.includes('sendTelegramTextFile') &&
            workerNode.code.includes("'/webhook/' + telegramFileBridgePath"),
          'Worker must route long review text to Telegram file bridge webhook',
        );
        assert(
          (workflow.nodes ?? []).some((node) => node.name === 'Telegram File Bridge Webhook') &&
            (workflow.nodes ?? []).some((node) => node.name === 'Convert Telegram Bridge Text To File') &&
            (workflow.nodes ?? []).some((node) => node.name === 'Send Telegram File Bridge Document'),
          'Workflow must include Telegram file bridge nodes (Webhook -> ConvertToFile -> Telegram sendDocument)',
        );
        assert(
          workerNode.code.includes("fileLabel: 'preview'") &&
            workerNode.code.includes("fileLabel: 'final'"),
          'Worker must tag preview/final review file payloads',
        );
      },
    },
    {
      id: '9',
      name: 'Notify hub contract and placeholders are preserved',
      fn: async () => {
        const setNotifyNodes = (workflow.nodes ?? []).filter((node) => node.name.startsWith('Set Notify Targets'));
        assert(setNotifyNodes.length === 1, 'Workflow must keep only one Set Notify Targets node');

        const notifyMain = getNode(workflow, 'Set Notify Targets (Main)');
        assert(
          notifyMain.parameters?.includeOtherFields === true,
          'Set Notify Targets (Main) must keep includeOtherFields=true',
        );
        const notifyTargetValue = String(
          getSetAssignmentValue(workflow, 'Set Notify Targets (Main)', 'notify_targets') ?? '',
        );
        assert(
          notifyTargetValue === '__NOTIFY_TARGETS__' ||
            (notifyTargetValue.includes('$json.notify_targets') &&
              notifyTargetValue.includes('__NOTIFY_TARGETS__')),
          'Set Notify Targets (Main) notify_targets must keep placeholder or dynamic payload expression',
        );

        const sendInfoNode = getNode(workflow, 'Send Informations');
        assert(sendInfoNode.type === 'n8n-nodes-base.splitOut', 'Send Informations must be Split Out node');
        assert(
          String(sendInfoNode.parameters?.fieldToSplitOut ?? '') === 'send_informations',
          'Send Informations must split by send_informations field',
        );
        assert(
          String(sendInfoNode.parameters?.include ?? '') === 'allOtherFields',
          'Send Informations must keep all other fields while splitting',
        );

        const mainNotify = getNode(workflow, 'Notify via Shared Workflow (Main)');
        assert(
          String(mainNotify.parameters?.workflowPath ?? '') === '__SHARED_NOTIFICATION_WORKFLOW_PATH__',
          'Main notify workflow path must keep placeholder',
        );

        assert(
          getTargets(workflow, 'Build Notify Payload (Worker)').includes('Send Informations'),
          'Worker notify payload builder must hand off via Send Informations',
        );

        assert(
          getTargets(workflow, 'Parse Telegram Start Command').includes('Code in JavaScript') &&
            getCodeNode(workflow, 'Code in JavaScript').code.includes('Bắt đầu review:') &&
            getCodeNode(workflow, 'Code in JavaScript').code.includes('send_informations'),
          'Telegram start command must trigger start notification payload',
        );

        assert(
          getCodeNode(workflow, 'Build Notify Payload (Worker)').code.includes('send_informations'),
          'Worker notify payload builder must emit send_informations contract',
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
  console.log(`Workflow: ${workflowPath}`);
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
