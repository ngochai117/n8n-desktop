const request = $('Normalize Request').first().json || {};
const signals = $('Compute Signals').first().json || {};
const priorStateRow = $('Load Prior State').first().json || {};
const modeSelection = $('Select Run Mode').first().json || {};

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

const stateJson = asObject(priorStateRow.state_json || priorStateRow.stateJson || {});
const selectedMode = asText(modeSelection.selectedMode, 'scan');
const isNearEnd = Boolean(modeSelection.isNearEnd);
const messageLanguage = asText(request.monitorConfig?.messageLanguage, 'en').toLowerCase() === 'vi' ? 'vi' : 'en';

const modePromptLines = selectedMode === 'scan'
  ? [
      'Run mode is scan (radar).',
      'Default behavior is silence.',
      'Only report when there is a new issue, severity increase, semantic material change, or a new blocker that impacts sprint goal.',
      'Do not generate a full daily digest shape in scan mode.',
      'Mention policy in scan: use at most 1 person mention across scan_delta_lines, and only when a direct owner must act now.',
    ]
  : [
      'Run mode is review (primary checkpoint).',
      'You may generate a full unified digest with Urgency/Main blocker/Quick win/Decision today when evidence is actionable.',
      isNearEnd
        ? 'Near-end framing is mandatory: Decision today must focus on salvage, de-scope, and carryover.'
        : 'Use standard checkpoint framing with concrete owners and decisions.',
      'Mention policy in review: use at most 2 person mentions total, only for owners with concrete next action today.',
    ];

const outputContractLines = [
  'Return JSON with two top-level objects:',
  '1) semantic_output: language-agnostic canonical enums/codes used for gating/history.',
  '2) narrative_output: localized user-facing wording in message_language.',
  'If specific owners are known, populate semantic_output.issues[].mentions_needed with person emails.',
  'When narrative_output includes people, use @<email local-part> handles matching mentions_needed.',
  'Prefer owner inference from structured context: review stages -> reviewer, testing stages -> QCs, otherwise assignee.',
  'If no specific person is reliable, leave mentions_needed empty and use owner type only; do not guess people.',
  'Do not spam mentions, and never exceed mode mention cap.',
  'Never localize semantic enums/codes (risk_type, severity, recommended_action, owner types, delivery_outlook, goal_risk).',
  'Narrative wording changes alone must not imply material change.',
  'Do not rely on delivery_plan to bypass deterministic gate.',
];

const packet = {
  run_context: {
    run_id: request.runId,
    run_type: selectedMode,
    requested_run_type: request.requestedRunType || request.runType,
    generated_at: request.generatedAt,
    team_name: request.monitorConfig?.teamId || '',
    sprint_phase: signals.sprintSignals?.phase || signals.sprint?.phase || 'mid',
    mode_selection_source: modeSelection.modeSelectionSource || 'auto',
  },
  language_config: {
    reasoning_language: 'en',
    message_language: messageLanguage,
  },
  policy: {
    mode_selection_source: modeSelection.modeSelectionSource || 'auto',
    max_mentions_per_digest: selectedMode === 'scan' ? 1 : 2,
    prefer_cluster_alerts: true,
    silence_if_no_new_actionable_insight: true,
    mode: selectedMode,
    mode_policy: modeSelection.modePolicy || {},
    is_near_end: isNearEnd,
    canonical_semantic_required: true,
  },
  sprint_snapshot: {
    ...(signals.sprint || {}),
    signals: signals.sprintSignals || {},
  },
  top_clusters: signals.topClusters || [],
  candidate_tasks: signals.topCandidateTasks || [],
  activity_excerpts: signals.activityExcerpts || [],
  prior_interventions: stateJson.priorInterventions || [],
  historical_patterns: stateJson.historicalPatterns || [],
  recent_runs: stateJson.recentRuns || [],
};

return [{
  json: {
    judgeSystemPrompt: [request.judgeSystemPrompt, '', ...modePromptLines, '', ...outputContractLines].join('\n'),
    judgePrompt: JSON.stringify(packet, null, 2),
    packet,
    openIssues: stateJson.openIssues || [],
    priorInterventions: stateJson.priorInterventions || [],
    historicalPatterns: stateJson.historicalPatterns || [],
    recentRuns: stateJson.recentRuns || [],
    modeSelection,
    messageLanguage,
  },
}];
