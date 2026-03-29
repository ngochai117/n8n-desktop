#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

const mainWorkflowPath =
  process.argv[2] ?? path.join(rootDir, 'workflows/book-review/book-review.workflow.json');
const imageWorkflowPath =
  process.argv[3] ?? path.join(rootDir, 'workflows/book-review/text-to-images.workflow.json');
const ttsWorkflowPath =
  process.argv[4] ?? path.join(rootDir, 'workflows/book-review/tts.workflow.json');

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
    text_to_images_workflow_id: '__TEXT_TO_IMAGES_WORKFLOW_ID__',
    tts_workflow_id: '__TTS_WORKFLOW_ID__',
    ...overrides,
  };
}

async function runCode(
  code,
  {
    input,
    binary = {},
    items = null,
    responses = [],
    throwAtCall,
    throwError,
    allowEmpty = false,
  },
) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const execute = new AsyncFunction(
    '$input',
    'helpers',
    '$helpers',
    '$json',
    '$items',
    '$binary',
    code,
  );

  const responseQueue = [...responses];
  let callCount = 0;
  const normalizedItems = Array.isArray(items)
    ? items.map((item) => {
        if (item && typeof item === 'object' && 'json' in item) {
          return item;
        }
        return { json: item, binary: {} };
      })
    : [{ json: input, binary }];
  const firstItem = normalizedItems[0] ?? { json: input, binary };

  const $input = {
    first: () => firstItem,
    all: () => normalizedItems,
  };

  const helperObject = {
    httpRequest: async () => {
      callCount += 1;

      if (throwAtCall && callCount === throwAtCall) {
        throw throwError ?? new Error('Mock API error');
      }

      if (responseQueue.length === 0) {
        return {};
      }

      return responseQueue.shift();
    },
  };

  const rawOutput = await execute(
    $input,
    helperObject,
    helperObject,
    firstItem.json ?? input,
    () => normalizedItems,
    firstItem.binary ?? binary,
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
    if (rawOutput && typeof rawOutput === 'object' && 'json' in rawOutput) {
      normalized = rawOutput.json;
    } else {
      normalized = rawOutput;
    }
  }

  assert(normalized && typeof normalized === 'object', 'Code node output must be an object');

  return {
    data: normalized,
    raw: rawOutput,
    callCount,
  };
}

async function runChecklist() {
  const mainWorkflow = await loadWorkflow(mainWorkflowPath);
  const imageWorkflow = await loadWorkflow(imageWorkflowPath);
  const ttsWorkflow = await loadWorkflow(ttsWorkflowPath);

  const mainRaw = await fs.readFile(mainWorkflowPath, 'utf8');

  const promptTemplate = await fs.readFile(promptTemplatePath, 'utf8');
  const metadataPromptTemplate = await fs.readFile(metadataPromptTemplatePath, 'utf8');

  const generateNode = getCodeNode(mainWorkflow, 'Generate Full Review');
  const parseNode = getCodeNode(mainWorkflow, 'Parse Review Sections');
  const mediaChunkNode = getCodeNode(mainWorkflow, 'Process Media Assets (Worker)');
  const mediaFinalizeNode = getCodeNode(mainWorkflow, 'Finalize Media Assets (Worker)');

  const imageNormalizeNode = getCodeNode(imageWorkflow, 'Normalize Inputs');
  const imageBuildChunksNode = getCodeNode(imageWorkflow, 'Build Chunks From Drive File');
  const imageCreateJobNode = getNode(imageWorkflow, 'Create Image Job');
  const imageNormalizeCreatedJobNode = getCodeNode(imageWorkflow, 'Normalize Created Image Job');
  const imageNormalizeStatusNode = getCodeNode(imageWorkflow, 'Normalize Image Job Status');
  const imageCollectNode = getCodeNode(imageWorkflow, 'Collect Image Results');
  const imageInlineNode = getCodeNode(imageWorkflow, 'Prepare Inline Output');
  const imageBuildExportNode = getCodeNode(imageWorkflow, 'Build Drive Export Payload');
  const imageDriveOutputNode = getCodeNode(imageWorkflow, 'Prepare Drive Output');

  const ttsNormalizeInputsNode = getCodeNode(ttsWorkflow, 'Normalize Inputs');
  const ttsBuildChunksNode = getCodeNode(ttsWorkflow, 'Build Chunks From Drive File');
  const ttsIfNeedsDriveDownloadNode = getNode(ttsWorkflow, 'If Needs Drive Download');
  const ttsIfShouldRunNode = getNode(ttsWorkflow, 'If TTS Should Run');
  const ttsSplitOutNode = getNode(ttsWorkflow, 'Split Out Media Chunks');
  const ttsLoopNode = getNode(ttsWorkflow, 'Loop Over TTS Chunks');
  const ttsCreateAudioNode = getNode(ttsWorkflow, 'Create TTS Audio');
  const ttsNormalizeResponseNode = getCodeNode(ttsWorkflow, 'Normalize TTS Response');
  const ttsIfPollRequiredNode = getNode(ttsWorkflow, 'If TTS Poll Required');
  const ttsWaitNode = getNode(ttsWorkflow, 'Wait For TTS Poll');
  const ttsPreparePollNode = getNode(ttsWorkflow, 'Prepare TTS Status Poll');
  const ttsGetStatusNode = getNode(ttsWorkflow, 'Get TTS Job Status');
  const ttsFinalizeNode = getCodeNode(ttsWorkflow, 'Finalize TTS Results');
  const ttsFinalizeEmptyNode = getNode(ttsWorkflow, 'Finalize Empty TTS Result');
  const ttsInlineNode = getCodeNode(ttsWorkflow, 'Prepare Inline Output');
  const ttsBuildExportNode = getCodeNode(ttsWorkflow, 'Build Drive Export Payload');
  const ttsDriveOutputNode = getCodeNode(ttsWorkflow, 'Prepare Drive Output');

  const results = [];

  const tests = [
    {
      id: '0',
      name: 'Three-workflow topology and naming are correct',
      fn: async () => {
        assert(mainWorkflow.name === 'Book Review', 'Main workflow name must be Book Review');
        assert(imageWorkflow.name === 'Text To Images', 'Image workflow name must be Text To Images');
        assert(ttsWorkflow.name === 'TTS', 'TTS workflow name must be TTS');

        const mainRequired = [
          'Set Config (Main)',
          'Generate Full Review',
          'Parse Review Sections',
          'Handle Reviewer Event',
          'Process Media Assets (Worker)',
          'Generate Image Assets (Worker)',
          'Generate TTS Assets (Worker)',
          'Merge Media Results (Worker)',
          'Finalize Media Assets (Worker)',
        ];

        for (const nodeName of mainRequired) {
          assert((mainWorkflow.nodes ?? []).some((node) => node.name === nodeName), `Missing node: ${nodeName}`);
        }

        const parseTargets = getTargets(mainWorkflow, 'Parse Review Sections');
        assert(
          parseTargets.includes('Set Config (Worker)'),
          'Parse Review Sections must route directly to Set Config (Worker)',
        );

        const imageExecNode = getNode(mainWorkflow, 'Generate Image Assets (Worker)');
        assert(
          imageExecNode.type === 'n8n-nodes-base.executeWorkflow',
          'Generate Image Assets (Worker) must be Execute Workflow node',
        );
        assert(String(imageExecNode.parameters?.source ?? '') === 'database', 'Image execute node must use database source');
        const imageWorkflowIdParam = imageExecNode.parameters?.workflowId ?? null;
        const imageWorkflowIdValue = typeof imageWorkflowIdParam === 'object' && imageWorkflowIdParam !== null
          ? String(imageWorkflowIdParam.value ?? '')
          : String(imageWorkflowIdParam ?? '');
        assert(
          imageWorkflowIdValue.includes('__TEXT_TO_IMAGES_WORKFLOW_ID__'),
          'Image execute node must use text-to-images workflow ID placeholder',
        );

        const ttsExecNode = getNode(mainWorkflow, 'Generate TTS Assets (Worker)');
        assert(
          ttsExecNode.type === 'n8n-nodes-base.executeWorkflow',
          'Generate TTS Assets (Worker) must be Execute Workflow node',
        );
        assert(String(ttsExecNode.parameters?.source ?? '') === 'database', 'TTS execute node must use database source');
        const ttsWorkflowIdParam = ttsExecNode.parameters?.workflowId ?? null;
        const ttsWorkflowIdValue = typeof ttsWorkflowIdParam === 'object' && ttsWorkflowIdParam !== null
          ? String(ttsWorkflowIdParam.value ?? '')
          : String(ttsWorkflowIdParam ?? '');
        assert(
          ttsWorkflowIdValue.includes('__TTS_WORKFLOW_ID__'),
          'TTS execute node must use tts workflow ID placeholder',
        );

        const processTargets = getTargets(mainWorkflow, 'Process Media Assets (Worker)');
        const ifRunMediaTargets = getTargets(mainWorkflow, 'If Run Media (Worker)');
        const imageInputTargets = getTargets(mainWorkflow, 'Prepare Image Workflow Input (Worker)');
        const ttsInputTargets = getTargets(mainWorkflow, 'Prepare TTS Workflow Input (Worker)');
        const usesDirectFanout =
          processTargets.includes('Generate Image Assets (Worker)') &&
          processTargets.includes('Generate TTS Assets (Worker)');
        const usesPreparedFanout =
          ifRunMediaTargets.includes('Prepare Image Workflow Input (Worker)') &&
          ifRunMediaTargets.includes('Prepare TTS Workflow Input (Worker)') &&
          imageInputTargets.includes('Generate Image Assets (Worker)') &&
          ttsInputTargets.includes('Generate TTS Assets (Worker)');
        const ifRunHasDirectFanout =
          ifRunMediaTargets.includes('Generate Image Assets (Worker)') &&
          ifRunMediaTargets.includes('Generate TTS Assets (Worker)');
        const processUsesRouter =
          processTargets.includes('If Run Media (Worker)') ||
          processTargets.includes('Prepare Session Drive Context (Worker)');
        assert(
          usesDirectFanout || (processUsesRouter && (ifRunHasDirectFanout || usesPreparedFanout)),
          'Media branch must fan-out to both media subworkflows (directly or via If Run Media (Worker))',
        );

        assert(
          !mainRaw.includes('Book Review Gemini via CLIProxyAPI'),
          'Main workflow template must not keep old workflow name string',
        );

        const imageNodeTypes = (imageWorkflow.nodes ?? []).map((node) => node.type);
        const ttsNodeTypes = (ttsWorkflow.nodes ?? []).map((node) => node.type);

        for (const types of [imageNodeTypes, ttsNodeTypes]) {
          assert(types.includes('n8n-nodes-base.executeWorkflowTrigger'), 'Subworkflow must include Execute Workflow Trigger');
          assert(types.includes('n8n-nodes-base.formTrigger'), 'Subworkflow must include Form Trigger');
          assert(types.includes('n8n-nodes-base.googleDrive'), 'Subworkflow must include Google Drive node(s)');
          assert(types.includes('n8n-nodes-base.switch'), 'Subworkflow must include Switch node(s)');
        }

        assert(
          !(ttsWorkflow.nodes ?? []).some((node) => node.name === 'Switch Input Mode'),
          'TTS workflow must not keep the old Switch Input Mode node',
        );
        assert(
          !(ttsWorkflow.nodes ?? []).some((node) => node.name === 'Generate TTS Assets'),
          'TTS workflow must not keep the old Generate TTS Assets node',
        );

        const imageFormTrigger = getNode(imageWorkflow, 'Form Trigger');
        const ttsFormTrigger = getNode(ttsWorkflow, 'Form Trigger');

        const imageRequired = [
          'If Media Should Run?',
          'Split Media Chunks',
          'Loop Over Image Chunks',
          'Create Image Job',
          'Merge Created Image Context',
          'Normalize Created Image Job',
          'Wait For Image Job',
          'Fetch Image Job Status',
          'Merge Image Status Context',
          'Normalize Image Job Status',
          'If Image Still Pending?',
          'Collect Image Results',
          'Prepare Empty Image Results',
          'Switch Output Mode',
          'Prepare Inline Output',
          'Build Drive Export Payload',
          'Prepare Drive Output',
        ];

        for (const nodeName of imageRequired) {
          assert(
            (imageWorkflow.nodes ?? []).some((node) => node.name === nodeName),
            `Missing image workflow node: ${nodeName}`,
          );
        }

        assert(getTargets(imageWorkflow, 'If Media Should Run?').includes('Split Media Chunks'), 'Image workflow must split media chunks when media_should_run=true');
        assert(getTargets(imageWorkflow, 'If Media Should Run?').includes('Prepare Empty Image Results'), 'Image workflow must produce empty results when media_should_run=false');
        assert(getTargets(imageWorkflow, 'Split Media Chunks').includes('Loop Over Image Chunks'), 'Split Media Chunks must feed the image loop');
        assert(getTargets(imageWorkflow, 'Loop Over Image Chunks').includes('Create Image Job'), 'Image loop must create jobs');
        assert(getTargets(imageWorkflow, 'Loop Over Image Chunks').includes('Collect Image Results'), 'Image loop must collect results after all batches');
        assert(getTargets(imageWorkflow, 'Create Image Job').includes('Merge Created Image Context'), 'Create Image Job must merge context before normalization');
        assert(getTargets(imageWorkflow, 'Merge Created Image Context').includes('Normalize Created Image Job'), 'Image job creation must normalize provider responses');
        assert(getTargets(imageWorkflow, 'Normalize Created Image Job').includes('Wait For Image Job'), 'Created image jobs must wait before polling status');
        assert(getTargets(imageWorkflow, 'Wait For Image Job').includes('Fetch Image Job Status') && getTargets(imageWorkflow, 'Wait For Image Job').includes('Merge Image Status Context'), 'Wait node must fan out to status fetch and merge context');
        assert(getTargets(imageWorkflow, 'Fetch Image Job Status').includes('Merge Image Status Context'), 'Fetch Image Job Status must merge fetched status with context');
        assert(getTargets(imageWorkflow, 'Merge Image Status Context').includes('Normalize Image Job Status'), 'Status merge must normalize provider status responses');
        assert(getTargets(imageWorkflow, 'Normalize Image Job Status').includes('If Image Still Pending?'), 'Status normalization must route through the pending check');
        assert(getTargets(imageWorkflow, 'If Image Still Pending?').includes('Wait For Image Job') && getTargets(imageWorkflow, 'If Image Still Pending?').includes('Loop Over Image Chunks'), 'Pending check must either wait again or advance the batch loop');
        assert(getTargets(imageWorkflow, 'Collect Image Results').includes('Switch Output Mode'), 'Collected image results must route to output mode switch');
        assert(getTargets(imageWorkflow, 'Prepare Empty Image Results').includes('Switch Output Mode'), 'Empty image result path must route to output mode switch');

        const ttsRequired = [
          'If Needs Drive Download',
          'If TTS Should Run',
          'Split Out Media Chunks',
          'Loop Over TTS Chunks',
          'Create TTS Audio',
          'Normalize TTS Response',
          'If TTS Poll Required',
          'Wait For TTS Poll',
          'Prepare TTS Status Poll',
          'Get TTS Job Status',
          'Finalize TTS Results',
          'Finalize Empty TTS Result',
        ];

        for (const nodeName of ttsRequired) {
          assert(
            (ttsWorkflow.nodes ?? []).some((node) => node.name === nodeName),
            `Missing TTS workflow node: ${nodeName}`,
          );
        }

        assert(ttsIfNeedsDriveDownloadNode.type === 'n8n-nodes-base.if', 'If Needs Drive Download must be IF');
        assert(ttsIfShouldRunNode.type === 'n8n-nodes-base.if', 'If TTS Should Run must be IF');
        assert(ttsSplitOutNode.type === 'n8n-nodes-base.splitOut', 'Split Out Media Chunks must be Split Out');
        assert(ttsLoopNode.type === 'n8n-nodes-base.splitInBatches', 'Loop Over TTS Chunks must be Split In Batches');
        assert(ttsCreateAudioNode.type === 'n8n-nodes-base.httpRequest', 'Create TTS Audio must be HTTP Request');
        assert(ttsNormalizeResponseNode.node.type === 'n8n-nodes-base.code', 'Normalize TTS Response must be Code');
        assert(ttsIfPollRequiredNode.type === 'n8n-nodes-base.if', 'If TTS Poll Required must be IF');
        assert(ttsWaitNode.type === 'n8n-nodes-base.wait', 'Wait For TTS Poll must be Wait');
        assert(ttsPreparePollNode.type === 'n8n-nodes-base.set', 'Prepare TTS Status Poll must be Set');
        assert(ttsGetStatusNode.type === 'n8n-nodes-base.httpRequest', 'Get TTS Job Status must be HTTP Request');
        assert(ttsFinalizeNode.node.type === 'n8n-nodes-base.code', 'Finalize TTS Results must be Code');
        assert(ttsFinalizeEmptyNode.type === 'n8n-nodes-base.set', 'Finalize Empty TTS Result must be Set');

        for (const [workflowName, formNode] of [
          [imageWorkflow.name, imageFormTrigger],
          [ttsWorkflow.name, ttsFormTrigger],
        ]) {
          const formFields = formNode.parameters?.formFields?.values ?? [];
          const hasInputFileField = formFields.some((field) =>
            String(field?.fieldLabel ?? '') === 'input_file' && String(field?.fieldType ?? '') === 'file');

          assert(
            hasInputFileField,
            `${workflowName} Form Trigger must include input_file as a real file upload field`,
          );
        }
      },
    },
    {
      id: '1',
      name: 'runOnceForEachItem code nodes never use $input.first/$input.all',
      fn: async () => {
        const offenders = [];

        for (const workflow of [mainWorkflow, imageWorkflow, ttsWorkflow]) {
          for (const node of workflow.nodes ?? []) {
            if (node?.type !== 'n8n-nodes-base.code') continue;
            if (String(node?.parameters?.mode ?? '') !== 'runOnceForEachItem') continue;
            const code = String(node?.parameters?.jsCode ?? '');
            if (/\$input\.first\s*\(/.test(code) || /\$input\.all\s*\(/.test(code)) {
              offenders.push(`${workflow.name}::${String(node?.name ?? '(unnamed)')}`);
            }
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
      },
    },
    {
      id: '3',
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
      id: '4',
      name: 'Subworkflow input normalize supports form_upload and drive_url',
      fn: async () => {
        const base = {
          request_id: 'req-test-01',
          chunk_manifest: [
            {
              chunk_key: 'intro:1',
              partName: 'intro',
              index: 1,
              text: 'Xin chao. Day la test.',
              sentence_count: 2,
            },
          ],
        };

        const imageForm = await runCode(imageNormalizeNode.code, {
          input: {
            ...base,
            input_mode: 'form_upload',
            output_mode: 'inline',
          },
        });
        assert(imageForm.data.input_mode === 'form_upload', 'Image normalize should keep form_upload mode');
        assert(Array.isArray(imageForm.data.media_chunks) && imageForm.data.media_chunks.length === 1, 'Image normalize should keep chunk_manifest');

        const ttsDrive = await runCode(ttsNormalizeInputsNode.code, {
          input: {
            request_id: 'req-test-02',
            input_mode: 'drive_url',
            output_mode: 'drive_export',
            drive_file_url: 'https://drive.google.com/file/d/1ABCDEF0123456789XYZ/view?usp=sharing',
          },
        });
        assert(ttsDrive.data.input_mode === 'drive_url', 'TTS normalize should keep drive_url mode');
        assert(ttsDrive.data.drive_file_id === '1ABCDEF0123456789XYZ', 'TTS normalize should parse drive file id from full URL');
        assert(ttsDrive.data.output_mode === 'drive_export', 'TTS normalize should keep drive_export mode');
        assert(ttsDrive.data.needs_drive_download === true, 'TTS normalize should flag drive downloads when a valid drive URL is provided');
      },
    },
    {
      id: '5',
      name: 'Subworkflow contract inline + drive_export works for image and tts, including partial_failed status',
      fn: async () => {
        const chunkInput = {
          request_id: 'req-contract-01',
          media_chunks: [
            {
              chunk_key: 'part:1',
              partName: 'part',
              index: 1,
              text: 'Noi dung test.',
              sentence_count: 1,
            },
          ],
        };

        const imageCollected = await runCode(imageCollectNode.code, {
          input: {
            request_id: 'req-contract-01',
            workflow: 'text-to-images',
          },
          items: [
            {
              json: {
                chunk_key: 'part:1',
                partName: 'part',
                index: 1,
                text: 'Noi dung test.',
                sentence_count: 1,
                image: 'https://example.com/part-1.png',
                video: '',
                image_status: 'generated',
                error_reason: null,
              },
            },
          ],
        });

        assert(
          Array.isArray(imageCollected.data.media_image_items) && imageCollected.data.media_image_items.length === 1,
          'Image collect node must emit a media_image_items array',
        );

        const imageInline = await runCode(imageInlineNode.code, {
          input: {
            ...imageCollected.data,
            output_mode: 'inline',
          },
        });
        assert(imageInline.data.workflow === 'text-to-images', 'Image inline output workflow key mismatch');
        assert(Array.isArray(imageInline.data.items), 'Image inline output must contain items array');

        const imageExport = await runCode(imageBuildExportNode.code, {
          input: imageCollected.data,
        });
        const imageDrive = await runCode(imageDriveOutputNode.code, {
          input: {
            ...imageExport.data,
            id: 'drive-file-1',
            webViewLink: 'https://drive.google.com/file/d/drive-file-1/view',
          },
        });
        assert(
          Array.isArray(imageDrive.data.drive_exports) && imageDrive.data.drive_exports.length === 1,
          'Image drive_export output must contain drive_exports',
        );

        const imagePartialInline = await runCode(imageInlineNode.code, {
          input: {
            ...(await runCode(imageCollectNode.code, {
              input: {
                request_id: 'req-image-partial-inline',
                workflow: 'text-to-images',
              },
              items: [
                { json: { chunk_key: 'a', partName: 'a', index: 1, text: 'A', sentence_count: 1, image_status: 'generated' } },
                { json: { chunk_key: 'b', partName: 'b', index: 2, text: 'B', sentence_count: 1, image_status: 'failed' } },
              ],
            })).data,
          },
        });
        assert(
          imagePartialInline.data.status === 'partial_failed',
          'Image inline output must report partial_failed when some chunks fail',
        );

        const imagePartialExport = await runCode(imageBuildExportNode.code, {
          input: (await runCode(imageCollectNode.code, {
            input: {
              request_id: 'req-image-partial-export',
              workflow: 'text-to-images',
            },
            items: [
              { json: { chunk_key: 'a', partName: 'a', index: 1, text: 'A', sentence_count: 1, image_status: 'generated' } },
              { json: { chunk_key: 'b', partName: 'b', index: 2, text: 'B', sentence_count: 1, image_status: 'failed' } },
            ],
          })).data,
        });
        const imagePartialPayload = JSON.parse(String(imagePartialExport.data.export_payload_json ?? '{}'));
        assert(
          String(imagePartialPayload.status ?? '') === 'partial_failed',
          'Image export payload must report partial_failed when some chunks fail',
        );

        const ttsSyncNormalized = await runCode(ttsNormalizeResponseNode.code, {
          input: {
            request_id: 'req-tts-sync-01',
            media_chunks: {
              chunk_key: 'part:1',
              partName: 'part',
              index: 1,
              text: 'Noi dung test.',
              sentence_count: 1,
            },
            tts_poll_count: 0,
            tts_poll_max_attempts: 3,
            tts_poll_interval_seconds: 5,
            tts_api_base_url: 'http://127.0.0.1:8001',
          },
          binary: {
            tts_response: {
              data: Buffer.from('fake-audio-bytes', 'utf8').toString('base64'),
              mimeType: 'audio/wav',
              fileName: 'part-1.wav',
            },
          },
        });
        assert(ttsSyncNormalized.data.tts_status === 'generated', 'TTS normalize should treat binary audio as generated');
        assert(ttsSyncNormalized.data.tts_should_poll === false, 'TTS normalize should stop polling for binary audio');

        const ttsPendingNormalized = await runCode(ttsNormalizeResponseNode.code, {
          input: {
            request_id: 'req-tts-pending-01',
            media_chunks: {
              chunk_key: 'part:2',
              partName: 'part',
              index: 2,
              text: 'Noi dung test 2.',
              sentence_count: 1,
            },
            tts_poll_count: 1,
            tts_poll_max_attempts: 3,
            tts_poll_interval_seconds: 5,
            tts_api_base_url: 'http://127.0.0.1:8001',
          },
          binary: {
            tts_response: {
              data: Buffer.from(
                JSON.stringify({ status: 'pending', job_id: 'job-1', status_url: 'https://example.com/jobs/job-1' }),
                'utf8',
              ).toString('base64'),
              mimeType: 'application/json',
              fileName: 'tts-job.json',
            },
          },
        });
        assert(ttsPendingNormalized.data.tts_should_poll === true, 'TTS normalize should request polling for pending jobs');
        assert(ttsPendingNormalized.data.tts_job_id === 'job-1', 'TTS normalize should keep job_id from pending response');

        const ttsFinalized = await runCode(ttsFinalizeNode.code, {
          items: [
            {
              json: {
                request_id: 'req-tts-final-01',
                media_chunks: {
                  chunk_key: 'a',
                  partName: 'a',
                  index: 1,
                  text: 'One.',
                  sentence_count: 1,
                },
                chunk_key: 'a',
                partName: 'a',
                index: 1,
                text: 'One.',
                sentence_count: 1,
                voice: 'binary:tts_a',
                duration: 1.23,
                tts_status: 'generated',
                voice_mime_type: 'audio/wav',
                voice_bytes: 123,
                error_reason: null,
              },
            },
            {
              json: {
                request_id: 'req-tts-final-01',
                media_chunks: {
                  chunk_key: 'b',
                  partName: 'b',
                  index: 2,
                  text: 'Two.',
                  sentence_count: 1,
                },
                chunk_key: 'b',
                partName: 'b',
                index: 2,
                text: 'Two.',
                sentence_count: 1,
                voice: '',
                duration: 0,
                tts_status: 'failed',
                voice_mime_type: '',
                voice_bytes: 0,
                error_reason: 'boom',
              },
            },
          ],
        });
        assert(
          Array.isArray(ttsFinalized.data.media_tts_items) && ttsFinalized.data.media_tts_items.length === 2,
          'TTS finalize must aggregate all processed items',
        );
        assert(ttsFinalized.data.status === 'partial_failed', 'TTS finalize should mark mixed results as partial_failed');

        const ttsInline = await runCode(ttsInlineNode.code, {
          input: {
            ...ttsFinalized.data,
            output_mode: 'inline',
          },
        });
        assert(ttsInline.data.workflow === 'tts', 'TTS inline output workflow key mismatch');
        assert(Array.isArray(ttsInline.data.items), 'TTS inline output must contain items array');

        const ttsExport = await runCode(ttsBuildExportNode.code, {
          input: ttsFinalized.data,
        });
        const ttsDrive = await runCode(ttsDriveOutputNode.code, {
          input: {
            ...ttsExport.data,
            id: 'drive-file-2',
            webViewLink: 'https://drive.google.com/file/d/drive-file-2/view',
          },
        });
        assert(
          Array.isArray(ttsDrive.data.drive_exports) && ttsDrive.data.drive_exports.length === 1,
          'TTS drive_export output must contain drive_exports',
        );

        const ttsPartialInline = await runCode(ttsInlineNode.code, {
          input: {
            request_id: 'req-tts-partial-inline',
            media_tts_items: [
              { chunk_key: 'a', tts_status: 'generated' },
              { chunk_key: 'b', tts_status: 'failed' },
            ],
          },
        });
        assert(
          ttsPartialInline.data.status === 'partial_failed',
          'TTS inline output must report partial_failed when some chunks fail',
        );

        const ttsPartialExport = await runCode(ttsBuildExportNode.code, {
          input: {
            request_id: 'req-tts-partial-export',
            media_tts_items: [
              { chunk_key: 'a', tts_status: 'generated' },
              { chunk_key: 'b', tts_status: 'failed' },
            ],
          },
        });
        const ttsPartialPayload = JSON.parse(String(ttsPartialExport.data.export_payload_json ?? '{}'));
        assert(
          String(ttsPartialPayload.status ?? '') === 'partial_failed',
          'TTS export payload must report partial_failed when some chunks fail',
        );
      },
    },
    {
      id: '6',
      name: 'Main media finalize still merges by chunk_key and keeps schema',
      fn: async () => {
        const chunked = await runCode(mediaChunkNode.code, {
          input: {
            ...createBaseInput(promptTemplate, metadataPromptTemplate),
            status: 'success',
            event_type: 'metadata_continue',
            full_review: '<<<SECTION|intro|Mo dau>>>A. B. C. D.<<<END_SECTION>>>',
          },
        });

        assert(Array.isArray(chunked.data.media_chunks) && chunked.data.media_chunks.length > 0, 'Expected chunk list from media chunk node');

        const fakeImageItems = chunked.data.media_chunks.map((chunk) => ({
          chunk_key: chunk.chunk_key,
          partName: chunk.partName,
          index: chunk.index,
          text: chunk.text,
          sentence_count: chunk.sentence_count,
          image: 'https://example.com/' + chunk.chunk_key + '.png',
          video: '',
          image_status: 'generated',
          error_reason: null,
        }));

        const fakeTtsItems = chunked.data.media_chunks.map((chunk) => ({
          chunk_key: chunk.chunk_key,
          partName: chunk.partName,
          index: chunk.index,
          text: chunk.text,
          sentence_count: chunk.sentence_count,
          voice: 'binary:tts_' + chunk.chunk_key,
          duration: 1.23,
          tts_status: 'generated',
          voice_mime_type: 'audio/wav',
          voice_bytes: 123,
          error_reason: null,
        }));

        const finalized = await runCode(mediaFinalizeNode.code, {
          input: {
            ...chunked.data,
            media_image_items: fakeImageItems,
            media_tts_items: fakeTtsItems,
          },
        });

        assert(finalized.data.media_pipeline_status === 'completed', 'Finalized media status should be completed');
        assert(Array.isArray(finalized.data.media_assets), 'media_assets must be array');
        assert(finalized.data.media_assets.length === chunked.data.media_chunks.length, 'media_assets must preserve chunk count');
        assert(
          finalized.data.media_assets.map((item) => item.chunk_key).join('|') ===
            chunked.data.media_chunks.map((item) => item.chunk_key).join('|'),
          'media_assets must keep deterministic chunk_key order',
        );
      },
    },
    {
      id: '7',
      name: 'Placeholders for subworkflow IDs are present in main set-config',
      fn: async () => {
        const setConfigMainTextToImages = String(
          getSetAssignmentValue(mainWorkflow, 'Set Config (Main)', 'text_to_images_workflow_id') ?? '',
        );
        const setConfigMainTts = String(
          getSetAssignmentValue(mainWorkflow, 'Set Config (Main)', 'tts_workflow_id') ?? '',
        );

        assert(
          setConfigMainTextToImages === '__TEXT_TO_IMAGES_WORKFLOW_ID__',
          'Set Config (Main) must keep __TEXT_TO_IMAGES_WORKFLOW_ID__ placeholder',
        );
        assert(
          setConfigMainTts === '__TTS_WORKFLOW_ID__',
          'Set Config (Main) must keep __TTS_WORKFLOW_ID__ placeholder',
        );
      },
    },
    {
      id: '8',
      name: 'Drive file decode path builds chunks when binary exists',
      fn: async () => {
        const textContent = 'Cau 1. Cau 2. Cau 3. Cau 4.';
        const binaryPayload = {
          source: {
            data: Buffer.from(textContent, 'utf8').toString('base64'),
            fileName: 'input.txt',
            mimeType: 'text/plain',
          },
        };

        const imageDriveDecode = await runCode(imageBuildChunksNode.code, {
          input: {
            media_chunks: [],
          },
          binary: binaryPayload,
        });

        assert(
          Array.isArray(imageDriveDecode.data.media_chunks) && imageDriveDecode.data.media_chunks.length > 0,
          'Image drive decode must build chunks from binary file',
        );

        const ttsDriveDecode = await runCode(ttsBuildChunksNode.code, {
          input: {
            media_chunks: [],
          },
          binary: binaryPayload,
        });

        assert(
          Array.isArray(ttsDriveDecode.data.media_chunks) && ttsDriveDecode.data.media_chunks.length > 0,
          'TTS drive decode must build chunks from binary file',
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
  console.log(`Main workflow: ${mainWorkflowPath}`);
  console.log(`Image workflow: ${imageWorkflowPath}`);
  console.log(`TTS workflow: ${ttsWorkflowPath}`);
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
