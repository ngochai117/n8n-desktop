#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');

const mainWorkflowPath =
  process.argv[2] ??
  path.join(rootDir, 'workflows/book-review/book-review.workflow.json');
const imageWorkflowPath =
  process.argv[3] ??
  path.join(rootDir, 'workflows/book-review/text-to-images.workflow.json');
const ttsWorkflowPath =
  process.argv[4] ??
  path.join(rootDir, 'workflows/book-review/tts.workflow.json');

const sceneOutlinePromptPath = path.join(
  rootDir,
  'workflows/book-review/prompts/book-review-scene-outline-prompt.txt',
);
const sceneExpandPromptPath = path.join(
  rootDir,
  'workflows/book-review/prompts/book-review-scene-expand-prompt.txt',
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
  if (!node) {
    fail(`Cannot find node "${nodeName}" in workflow ${workflow.name}`);
  }
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
  return ((workflow.connections ?? {})[sourceNodeName]?.main ?? [])
    .flat()
    .map((edge) => String(edge?.node ?? ''))
    .filter(Boolean);
}

function createBaseInput(outlinePrompt, expandPrompt, overrides = {}) {
  return {
    content_model: 'cx/gpt-5.4',
    fallback_model: 'cx/gpt-5.2',
    qc_model: 'cx/gpt-5.4',
    proxy_base_url: 'http://127.0.0.1:20128',
    proxy_api_key: 'test-key',
    max_turns: 8,
    qc_score_warning_threshold: 7,
    reviewer_wait_timeout_seconds: 900,
    user_input: 'Sách Nhà Giả Kim của tác giả Paulo Coelho',
    scene_outline_prompt_template: outlinePrompt,
    scene_expand_prompt_template: expandPrompt,
    n8n_api_url: 'http://localhost:5678',
    n8n_api_key: 'n8n-test-key',
    session_store_name: 'book_review_sessions',
    shared_notification_workflow_path: '/tmp/shared-notify.workflow.json',
    telegram_bot_token: 'telegram-token',
    telegram_chat_id: '12345',
    text_to_images_workflow_id: '__TEXT_TO_IMAGES_WORKFLOW_ID__',
    text_to_videos_workflow_id: '__TEXT_TO_VIDEOS_WORKFLOW_ID__',
    tts_workflow_id: '__TTS_WORKFLOW_ID__',
    media_visual_mode: 'image',
    image_api_base_url: 'http://127.0.0.1:8099',
    tts_api_base_url: 'http://127.0.0.1:8001',
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
    assert(
      rawOutput.length > 0,
      'Code node output array must have at least one item',
    );
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

  assert(
    normalized && typeof normalized === 'object',
    'Code node output must be an object',
  );

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

  const outlinePrompt = await fs.readFile(sceneOutlinePromptPath, 'utf8');
  const expandPrompt = await fs.readFile(sceneExpandPromptPath, 'utf8');

  const generateNode = getCodeNode(mainWorkflow, 'Generate Full Review');
  const parseNode = getCodeNode(mainWorkflow, 'Parse Review Sections');
  const processMediaNode = getCodeNode(
    mainWorkflow,
    'Process Media Assets (Worker)',
  );
  const prepareImageInputNode = getCodeNode(
    mainWorkflow,
    'Prepare Image Workflow Input (Worker)',
  );
  const prepareTtsInputNode = getCodeNode(
    mainWorkflow,
    'Prepare TTS Workflow Input (Worker)',
  );
  const finalizeMediaNode = getCodeNode(
    mainWorkflow,
    'Finalize Media Assets (Worker)',
  );

  const imageNormalizeNode = getCodeNode(imageWorkflow, 'Normalize Inputs');
  const imageBuildNode = getCodeNode(
    imageWorkflow,
    'Build Chunks From Drive File',
  );
  const imageCollectNode = getCodeNode(imageWorkflow, 'Collect Image Results');
  const imageCreateNode = getNode(imageWorkflow, 'Create Image Job');

  const ttsNormalizeNode = getCodeNode(ttsWorkflow, 'Normalize Inputs');
  const ttsBuildNode = getCodeNode(ttsWorkflow, 'Build Chunks From Drive File');
  const ttsFinalizeNode = getCodeNode(ttsWorkflow, 'Finalize TTS Results');

  const results = [];

  const tests = [
    {
      id: '1',
      name: 'Workflow topology still has required V2 nodes',
      fn: async () => {
        const requiredMain = [
          'Set Config (Main)',
          'Generate Full Review',
          'Parse Review Sections',
          'Handle Reviewer Event',
          'Process Media Assets (Worker)',
          'Prepare Image Workflow Input (Worker)',
          'Prepare TTS Workflow Input (Worker)',
          'Finalize Media Assets (Worker)',
        ];

        for (const nodeName of requiredMain) {
          assert(
            (mainWorkflow.nodes ?? []).some((node) => node.name === nodeName),
            `Missing main node: ${nodeName}`,
          );
        }

        assert(
          getTargets(mainWorkflow, 'Parse Review Sections').includes(
            'Set Config (Worker)',
          ),
          'Parse Review Sections must route to Set Config (Worker)',
        );

        const requiredImage = [
          'Normalize Inputs',
          'Build Chunks From Drive File',
          'Create Image Job',
          'Collect Image Results',
        ];
        for (const nodeName of requiredImage) {
          assert(
            (imageWorkflow.nodes ?? []).some((node) => node.name === nodeName),
            `Missing image node: ${nodeName}`,
          );
        }

        const requiredTts = [
          'Normalize Inputs',
          'Build Chunks From Drive File',
          'Create TTS Audio',
          'Finalize TTS Results',
        ];
        for (const nodeName of requiredTts) {
          assert(
            (ttsWorkflow.nodes ?? []).some((node) => node.name === nodeName),
            `Missing TTS node: ${nodeName}`,
          );
        }
      },
    },
    {
      id: '2',
      name: 'Set Config uses scene prompt templates and render defaults',
      fn: async () => {
        assert(
          String(
            getSetAssignmentValue(
              mainWorkflow,
              'Set Config (Main)',
              'scene_outline_prompt_template',
            ) ?? '',
          ).includes('__BOOK_REVIEW_SCENE_OUTLINE_PROMPT__'),
          'Set Config (Main) must include scene_outline_prompt_template placeholder',
        );

        assert(
          String(
            getSetAssignmentValue(
              mainWorkflow,
              'Set Config (Main)',
              'scene_expand_prompt_template',
            ) ?? '',
          ).includes('__BOOK_REVIEW_SCENE_EXPAND_PROMPT__'),
          'Set Config (Main) must include scene_expand_prompt_template placeholder',
        );

        assert(
          getSetAssignmentValue(
            mainWorkflow,
            'Set Config (Main)',
            'render_resolution',
          ) !== undefined,
          'Set Config (Main) must include render_resolution',
        );
      },
    },
    {
      id: '3',
      name: 'Generate Full Review runs 2-pass and outputs scene manifest contract',
      fn: async () => {
        const outlineResponse = buildChatResponse(
          JSON.stringify({
            angle: 'review thực dụng',
            target_audience: 'người mới đọc',
            scene_count: 8,
            estimated_total_duration_sec: 980,
            scenes: Array.from({ length: 8 }, (_, index) => ({
              order: index + 1,
              scene_role:
                index === 0 ? 'hook' : index === 7 ? 'outro' : 'core',
              scene_goal: `Goal ${index + 1}`,
              key_points: ['A', 'B'],
            })),
          }),
        );

        const manifestResponse = buildChatResponse(
          JSON.stringify({
            book: {
              title: 'Nhà Giả Kim',
              author: 'Paulo Coelho',
              style_keywords: ['sâu sắc'],
            },
            video: {
              aspect_ratio: '16:9',
              target_duration_min_sec: 900,
              target_duration_max_sec: 1200,
              estimated_total_duration_sec: 960,
            },
            scenes: Array.from({ length: 8 }, (_, index) => ({
              scene_id: `scene_${String(index + 1).padStart(2, '0')}`,
              order: index + 1,
              scene_title: `Scene ${index + 1}`,
              scene_role:
                index === 0 ? 'hook' : index === 7 ? 'outro' : 'core',
              narration_text: 'Nội dung '.repeat(350),
              image_prompt_en: 'cinematic storytelling illustration',
              highlight_quote_vi: index === 0 ? 'Một câu hook' : '',
              estimated_duration_sec: index === 0 || index === 7 ? 60 : 95,
              transition: 'cut',
            })),
          }),
        );

        const input = createBaseInput(outlinePrompt, expandPrompt, {
          start_source: 'manual_test',
        });

        const { data, callCount } = await runCode(generateNode.code, {
          input,
          responses: [outlineResponse, manifestResponse],
        });

        assert(callCount === 2, 'Generate Full Review should call LLM 2 times');
        assert(data.stop_reason === 'completed', 'Generate stop_reason must be completed');
        assert(
          data.review_manifest && typeof data.review_manifest === 'object',
          'Generate output must include review_manifest object',
        );
        assert(
          Array.isArray(data.review_manifest.scenes),
          'review_manifest.scenes must be an array',
        );
        assert(
          data.review_manifest.scenes.length >= 8 &&
            data.review_manifest.scenes.length <= 14,
          'scene_count must be in [8..14]',
        );
        assert(
          String(data.review_manifest.scenes[0]?.scene_role) === 'hook',
          'first scene must be hook',
        );
        assert(
          String(data.review_manifest.scenes[data.review_manifest.scenes.length - 1]?.scene_role) ===
            'outro',
          'last scene must be outro',
        );
        assert(
          normalizeMessage(data.review_readable).length > 0,
          'review_readable must not be empty',
        );
      },
    },
    {
      id: '4',
      name: 'Parse Review Sections normalizes scene manifest and readable draft',
      fn: async () => {
        const manifest = {
          book: {
            title: 'Book X',
            author: 'Author Y',
            style_keywords: ['hài hước'],
          },
          video: {
            aspect_ratio: '16:9',
            target_duration_min_sec: 900,
            target_duration_max_sec: 1200,
            estimated_total_duration_sec: 930,
          },
          scenes: [
            {
              scene_id: 'scene_01',
              order: 1,
              scene_title: 'Hook',
              scene_role: 'hook',
              narration_text: 'Hook content',
              image_prompt_en: 'prompt 1',
              highlight_quote_vi: 'quote',
              estimated_duration_sec: 60,
              transition: 'cut',
            },
            {
              scene_id: 'scene_02',
              order: 2,
              scene_title: 'Outro',
              scene_role: 'outro',
              narration_text: 'Outro content',
              image_prompt_en: 'prompt 2',
              highlight_quote_vi: '',
              estimated_duration_sec: 60,
              transition: 'cut',
            },
          ],
        };

        const { data } = await runCode(parseNode.code, {
          input: {
            review_manifest: manifest,
            metadata: {
              title: 'Title A',
              caption: 'Caption A',
              thumbnail_text: 'Thumb A',
              hashtags: ['#bookreview'],
            },
          },
        });

        assert(
          data.review_manifest?.scenes?.length === 2,
          'Parse node must preserve scenes',
        );
        assert(
          data.review_sections_count === 2,
          'review_sections_count must match scenes count',
        );
        assert(
          normalizeMessage(data.review_readable).includes('scene_01'),
          'review_readable should include scene headings',
        );
      },
    },
    {
      id: '5',
      name: 'Process Media Assets creates scene chunks and gates by event',
      fn: async () => {
        const manifest = {
          scenes: [
            {
              scene_id: 'scene_01',
              order: 1,
              scene_title: 'Hook',
              scene_role: 'hook',
              narration_text: 'A',
              image_prompt_en: 'prompt A',
              highlight_quote_vi: 'qA',
              estimated_duration_sec: 60,
              transition: 'cut',
            },
            {
              scene_id: 'scene_02',
              order: 2,
              scene_title: 'Core',
              scene_role: 'core',
              narration_text: 'B',
              image_prompt_en: 'prompt B',
              highlight_quote_vi: '',
              estimated_duration_sec: 95,
              transition: 'cut',
            },
          ],
        };

        const approved = await runCode(processMediaNode.code, {
          input: {
            review_manifest: manifest,
            event_type: 'media_continue',
            image_api_base_url: 'http://127.0.0.1:8099',
            tts_api_base_url: 'http://127.0.0.1:8001',
          },
        });

        assert(
          approved.data.media_should_run === true,
          'media_should_run must be true on approved event with providers',
        );
        assert(
          Array.isArray(approved.data.media_chunks) &&
            approved.data.media_chunks.length === 2,
          'media_chunks must be built from scene manifest',
        );
        assert(
          approved.data.media_chunks[0].scene_id === 'scene_01',
          'media chunk must carry scene_id',
        );

        const notApproved = await runCode(processMediaNode.code, {
          input: {
            review_manifest: manifest,
            event_type: 'init_review',
            image_api_base_url: 'http://127.0.0.1:8099',
            tts_api_base_url: 'http://127.0.0.1:8001',
          },
        });

        assert(
          notApproved.data.media_should_run === false,
          'media_should_run must be false for non-media events',
        );
      },
    },
    {
      id: '6',
      name: 'Prepare Image/TTS inputs keep scene contract',
      fn: async () => {
        const chunk = {
          scene_id: 'scene_03',
          order: 3,
          scene_title: 'Core 3',
          narration_text: 'text 3',
          image_prompt_en: 'prompt 3',
          highlight_quote_vi: 'quote 3',
        };

        const imagePrepared = await runCode(prepareImageInputNode.code, {
          input: {
            media_run_image: true,
            media_chunks: [chunk],
            drive_output_folder_id: 'folder-1',
          },
        });

        assert(
          imagePrepared.data.chunk_manifest?.[0]?.scene_id === 'scene_03',
          'Prepare Image input must preserve scene_id',
        );

        const ttsPrepared = await runCode(prepareTtsInputNode.code, {
          input: {
            media_run_tts: true,
            media_chunks: [chunk],
            drive_output_folder_id: 'folder-2',
          },
        });

        assert(
          ttsPrepared.data.chunk_manifest?.[0]?.narration_text === 'text 3',
          'Prepare TTS input must preserve narration_text',
        );
      },
    },
    {
      id: '7',
      name: 'Finalize Media Assets merges by scene_id and keeps partial results',
      fn: async () => {
        const baseInput = {
          media_should_run: true,
          media_run_image: true,
          media_run_tts: true,
          media_started_at: new Date(Date.now() - 4000).toISOString(),
          media_chunks: [
            {
              scene_id: 'scene_01',
              order: 1,
              scene_title: 'S1',
              scene_role: 'hook',
              narration_text: 'N1',
              image_prompt_en: 'P1',
              highlight_quote_vi: 'Q1',
              estimated_duration_sec: 60,
              transition: 'cut',
              chunk_key: 'scene_01',
              partName: 'scene_01',
              index: 1,
              text: 'N1',
            },
            {
              scene_id: 'scene_02',
              order: 2,
              scene_title: 'S2',
              scene_role: 'outro',
              narration_text: 'N2',
              image_prompt_en: 'P2',
              highlight_quote_vi: '',
              estimated_duration_sec: 60,
              transition: 'cut',
              chunk_key: 'scene_02',
              partName: 'scene_02',
              index: 2,
              text: 'N2',
            },
          ],
          media_image_items: [
            {
              scene_id: 'scene_01',
              image_status: 'generated',
              image_url: 'https://img/1.png',
              image_drive_file_id: 'img-1',
              image_drive_url: 'https://drive/img-1',
            },
            {
              scene_id: 'scene_02',
              image_status: 'failed',
              error_reason: 'image_failed',
            },
          ],
          media_tts_items: [
            {
              scene_id: 'scene_01',
              tts_status: 'generated',
              voice_url: 'https://voice/1.wav',
              voice_drive_file_id: 'voice-1',
              voice_drive_url: 'https://drive/voice-1',
              duration_seconds: 61,
            },
            {
              scene_id: 'scene_02',
              tts_status: 'generated',
              voice_url: 'https://voice/2.wav',
              voice_drive_file_id: 'voice-2',
              voice_drive_url: 'https://drive/voice-2',
              duration_seconds: 62,
            },
          ],
        };

        const { data } = await runCode(finalizeMediaNode.code, {
          input: baseInput,
        });

        assert(
          Array.isArray(data.media_assets) && data.media_assets.length === 2,
          'Finalize Media must output merged media_assets by scene',
        );
        assert(
          data.media_assets[0].scene_id === 'scene_01',
          'First media asset must keep scene_id',
        );
        assert(
          data.media_assets[1].image_status === 'failed' &&
            data.media_assets[1].tts_status === 'generated',
          'Image partial fail must not drop TTS success for same scene',
        );
      },
    },
    {
      id: '8',
      name: 'Image/TTS subworkflow normalize + finalize keep scene keys',
      fn: async () => {
        const chunkManifest = [
          {
            scene_id: 'scene_05',
            order: 5,
            scene_title: 'Core 5',
            narration_text: 'Narration 5',
            image_prompt_en: 'Prompt 5',
            highlight_quote_vi: 'Quote 5',
          },
        ];

        const imageNormalized = await runCode(imageNormalizeNode.code, {
          input: {
            chunk_manifest: chunkManifest,
            output_mode: 'inline',
          },
        });

        assert(
          imageNormalized.data.media_chunks?.[0]?.scene_id === 'scene_05',
          'Image normalize must output scene_id in media_chunks',
        );

        const imageBuilt = await runCode(imageBuildNode.code, {
          input: {
            chunk_manifest: chunkManifest,
            output_mode: 'inline',
          },
        });

        assert(
          imageBuilt.data.media_chunks?.[0]?.image_prompt_en === 'Prompt 5',
          'Image build chunks must preserve image_prompt_en',
        );

        const imageCollected = await runCode(imageCollectNode.code, {
          items: [
            {
              scene_id: 'scene_05',
              order: 5,
              scene_title: 'Core 5',
              narration_text: 'Narration 5',
              image_prompt_en: 'Prompt 5',
              highlight_quote_vi: 'Quote 5',
              image_status: 'generated',
              image_url: 'https://img/5.png',
            },
          ],
        });

        assert(
          imageCollected.data.media_image_items?.[0]?.image_url ===
            'https://img/5.png',
          'Collect Image Results must output image_url',
        );

        const ttsNormalized = await runCode(ttsNormalizeNode.code, {
          input: {
            chunk_manifest: chunkManifest,
            output_mode: 'inline',
          },
        });

        assert(
          ttsNormalized.data.media_chunks?.[0]?.narration_text === 'Narration 5',
          'TTS normalize must keep narration_text',
        );

        const ttsBuilt = await runCode(ttsBuildNode.code, {
          input: {
            chunk_manifest: chunkManifest,
            output_mode: 'inline',
          },
        });

        assert(
          ttsBuilt.data.media_chunks?.[0]?.scene_id === 'scene_05',
          'TTS build chunks must keep scene_id',
        );

        const ttsFinalized = await runCode(ttsFinalizeNode.code, {
          items: [
            {
              media_chunks: {
                scene_id: 'scene_05',
                order: 5,
                scene_title: 'Core 5',
                narration_text: 'Narration 5',
                image_prompt_en: 'Prompt 5',
                highlight_quote_vi: 'Quote 5',
                chunk_key: 'scene_05',
                partName: 'scene_05',
                index: 5,
                text: 'Narration 5',
                sentence_count: 1,
              },
              tts_status: 'generated',
              voice_url: 'https://voice/5.wav',
              duration_seconds: 77,
              voice_drive_file_id: 'voice-file-5',
              voice_drive_url: 'https://drive/voice-file-5',
            },
          ],
        });

        assert(
          ttsFinalized.data.media_tts_items?.[0]?.scene_id === 'scene_05',
          'Finalize TTS Results must keep scene_id',
        );
        assert(
          Number(ttsFinalized.data.media_tts_items?.[0]?.duration_seconds) === 77,
          'Finalize TTS Results must expose duration_seconds',
        );
      },
    },
    {
      id: '9',
      name: 'Create Image Job uses direct scene prompt contract',
      fn: async () => {
        const jsonBody = String(imageCreateNode.parameters?.jsonBody ?? '');

        assert(
          jsonBody.includes('scene_id'),
          'Create Image Job jsonBody must include scene_id',
        );
        assert(
          jsonBody.includes('image_prompt_en'),
          'Create Image Job jsonBody must include image_prompt_en',
        );
        assert(
          jsonBody.includes('prompt: $json.image_prompt_en'),
          'Create Image Job must prioritize image_prompt_en as prompt',
        );
      },
    },
  ];

  for (const test of tests) {
    const startedAt = Date.now();
    await test.fn();
    const durationMs = Date.now() - startedAt;
    results.push({
      id: test.id,
      name: test.name,
      durationMs,
      status: 'PASS',
    });
  }

  const summary = {
    status: 'PASS',
    total: results.length,
    passed: results.length,
    failed: 0,
  };

  return { summary, results };
}

(async () => {
  try {
    const report = await runChecklist();

    console.log('BOOK REVIEW SCENE CHECKLIST RESULT');
    console.log(JSON.stringify(report.summary, null, 2));

    for (const result of report.results) {
      console.log(
        `- [${result.status}] #${result.id} ${result.name} (${result.durationMs} ms)`,
      );
    }

    process.exit(0);
  } catch (error) {
    console.error('BOOK REVIEW SCENE CHECKLIST FAILED');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
})();
