const request = $('Normalize Request').first().json || {};
const context = $('Normalize Sprint Context').first().json || {};
const signals = $('Compute Signals').first().json || {};
const gate = $('Delivery Gate').first().json || {};
const deliveryPayload = $('Build Delivery Messages').first().json || {};
const deliveryAggregate = (() => {
  try {
    return $('Aggregate Deliveries').first().json || {};
  } catch (error) {
    return {};
  }
})();

function asText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function sqlText(value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function sqlJson(value) {
  return "'" + JSON.stringify(value ?? {}).replace(/'/g, "''") + "'::jsonb";
}

function sqlNumeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : 'NULL';
}

const sprint = context.sprint || {};
const tasks = asArray(context.tasks);
const activityExcerpts = asArray(context.activityExcerpts);
const sprintSignals = signals.sprintSignals || {};
const deliverableIssues = asArray(gate.deliverableIssues);
const responses = asArray(deliveryAggregate.responses);
const deliveries = asArray(deliveryPayload.deliveries);
const selectedMode = asText(gate.selectedMode, asText(request.runType, 'scan'));
const modeSelectionSource = asText(gate.modeSelectionSource, 'auto');
const isNearEnd = Boolean(gate.isNearEnd);
const messageLanguage = asText(gate.messageLanguage || deliveryPayload.messageLanguage || request.monitorConfig?.messageLanguage, 'en');

const retroNotes = selectedMode === 'review' && isNearEnd
  ? deliverableIssues.slice(0, 3).map((issue) => ({
      note_type: 'retro_candidate',
      severity: issue.severity || 'medium',
      content: asText(issue.narrative?.why_now || issue.semantic_raw?.why_now || issue.recommended_action),
      source_issue_key: issue.issue_key,
    }))
  : [];

let statements = [];

statements.push([
  'INSERT INTO runs (id, team_id, board_id, sprint_id, workflow_name, run_type, status, no_message, partial_data, issue_count_detected, issue_count_delivered, started_at, finished_at, duration_ms, summary_json, error_json)',
  'VALUES (',
  sqlText(request.runId) + ',',
  sqlText(request.monitorConfig?.teamId) + ',',
  sqlText(request.monitorConfig?.boardId) + ',',
  sqlText(sprint.sprint_id || sprint.id) + ',',
  sqlText(request.workflowName) + ',',
  sqlText(selectedMode) + ',',
  sqlText(asText(deliveryAggregate.status, gate.noMessage ? 'suppressed' : (context.partialData ? 'partial' : 'success'))) + ',',
  gate.noMessage ? 'true' : 'false',
  ',',
  context.partialData ? 'true' : 'false',
  ',',
  sqlNumeric(deliverableIssues.length) + ',',
  sqlNumeric(deliveryAggregate.successCount || 0) + ',',
  sqlText(request.generatedAt) + ',',
  sqlText(new Date().toISOString()) + ',',
  sqlNumeric(0) + ',',
  sqlJson({
    selectedMode,
    modeSelectionSource,
    modeSelectionSourceV2: modeSelectionSource,
    isNearEnd,
    modeSelection: gate.modeSelection || {},
    messageLanguage,
    modeLanguage: {
      reasoningLanguage: 'en',
      messageLanguage,
    },
    sprintAssessment: gate.sprintAssessment || {},
    sprintSignals,
    deliverySummary: deliveryPayload.deliverySummary || {},
    deterministicGate: gate.deterministicGate || {},
  }) + ',',
  sqlJson({
    failureReason: context.failureReason || '',
  }),
  ');',
].join(' '));

statements.push([
  'INSERT INTO sprint_snapshots (team_id, board_id, sprint_id, sprint_name, sprint_goal, start_at, end_at, timezone, committed_points, added_scope_points, completed_points, remaining_points, snapshot_at, raw_json)',
  'VALUES (',
  sqlText(request.monitorConfig?.teamId) + ',',
  sqlText(request.monitorConfig?.boardId) + ',',
  sqlText(sprint.sprint_id || sprint.id) + ',',
  sqlText(sprint.sprint_name) + ',',
  sqlText(sprint.sprint_goal) + ',',
  sqlText(sprint.start_at) + ',',
  sqlText(sprint.end_at) + ',',
  sqlText(sprint.timezone || request.monitorConfig?.timezone) + ',',
  sqlNumeric(sprint.committed_points) + ',',
  sqlNumeric(sprint.added_scope_points || 0) + ',',
  sqlNumeric(sprint.completed_points) + ',',
  sqlNumeric(sprint.remaining_points) + ',',
  sqlText(request.generatedAt) + ',',
  sqlJson(sprint),
  ');',
].join(' '));

if (tasks.length > 0) {
  statements.push('INSERT INTO task_snapshots (team_id, sprint_id, task_id, task_key, title, task_type, priority, assignee_id, assignee_name, reviewer_ids, status, status_category, story_points, created_at_source, updated_at_source, done_at_source, epic_id, labels, dependencies, dependents, blocked_by, due_at, snapshot_at, raw_json) VALUES');
  statements.push(tasks.map((task) => [
    '(',
    sqlText(request.monitorConfig?.teamId) + ',',
    sqlText(sprint.sprint_id || sprint.id) + ',',
    sqlText(task.task_id) + ',',
    sqlText(task.key) + ',',
    sqlText(task.title) + ',',
    sqlText(task.type) + ',',
    sqlText(task.priority) + ',',
    sqlText(task.assignee_id) + ',',
    sqlText(task.assignee_name) + ',',
    sqlJson(task.reviewer_ids || []) + ',',
    sqlText(task.status) + ',',
    sqlText(task.status_category) + ',',
    sqlNumeric(task.story_points) + ',',
    sqlText(task.created_at) + ',',
    sqlText(task.updated_at) + ',',
    sqlText(task.done_at) + ',',
    sqlText(task.epic_id) + ',',
    sqlJson(task.labels || []) + ',',
    sqlJson(task.dependencies || []) + ',',
    sqlJson(task.dependents || []) + ',',
    sqlJson(task.blocked_by || []) + ',',
    sqlText(task.due_at) + ',',
    sqlText(request.generatedAt) + ',',
    sqlJson(task),
    ')',
  ].join(' ')).join(',\n') + ';');
}

if (activityExcerpts.length > 0) {
  statements.push('INSERT INTO activity_excerpts (team_id, sprint_id, task_id, event_at, event_type, actor, source, text, ingested_at, raw_json) VALUES');
  statements.push(activityExcerpts.map((item) => [
    '(',
    sqlText(request.monitorConfig?.teamId) + ',',
    sqlText(sprint.sprint_id || sprint.id) + ',',
    sqlText(item.task_id) + ',',
    sqlText(item.at) + ',',
    sqlText(item.event_type) + ',',
    sqlText(item.actor) + ',',
    sqlText(item.source) + ',',
    sqlText(item.text) + ',',
    sqlText(request.generatedAt) + ',',
    sqlJson(item),
    ')',
  ].join(' ')).join(',\n') + ';');
}

statements.push([
  'INSERT INTO signal_snapshots (team_id, sprint_id, signal_scope, signal_type, candidate_score, phase, signal_json, computed_at)',
  'VALUES (',
  sqlText(request.monitorConfig?.teamId) + ',',
  sqlText(sprint.sprint_id || sprint.id) + ',',
  sqlText('sprint') + ',',
  sqlText('sprint_summary') + ',',
  sqlNumeric(0) + ',',
  sqlText(sprint.phase) + ',',
  sqlJson(sprintSignals) + ',',
  sqlText(request.generatedAt),
  ');',
].join(' '));

for (const task of asArray(signals.topCandidateTasks)) {
  statements.push([
    'INSERT INTO signal_snapshots (team_id, sprint_id, task_id, signal_scope, signal_type, candidate_score, phase, signal_json, computed_at)',
    'VALUES (',
    sqlText(request.monitorConfig?.teamId) + ',',
    sqlText(sprint.sprint_id || sprint.id) + ',',
    sqlText(task.task_id) + ',',
    sqlText('task') + ',',
    sqlText(task.risk_type_seed || 'candidate') + ',',
    sqlNumeric(task.candidate_score) + ',',
    sqlText(sprint.phase) + ',',
    sqlJson(task) + ',',
    sqlText(request.generatedAt),
    ');',
  ].join(' '));
}

if (deliverableIssues.length > 0) {
  statements.push('INSERT INTO issues (issue_key, team_id, sprint_id, entity_type, entity_id, risk_type, severity, state, confidence, recommended_action, why_now, evidence, first_detected_at, last_seen_at, last_alerted_at, source_run_id, metadata_json) VALUES');
  statements.push(deliverableIssues.map((issue) => {
    const metadata = {
      semantic_signature: asText(issue.semantic_signature),
      semantic_json: {
        entity_type: issue.entity_type,
        entity_id: issue.entity_id,
        risk_type: issue.risk_type,
        severity: issue.severity,
        recommended_action: issue.recommended_action,
        action_owner_type: issue.action_owner_type,
        decision_owner_type: issue.decision_owner_type,
        execution_owner_type: issue.execution_owner_type,
        phase: issue.phase,
        is_goal_blocker: Boolean(issue.is_goal_blocker),
        is_quick_win: Boolean(issue.is_quick_win),
        blocking_entities: asArray(issue.blocking_entities),
        blocked_entities: asArray(issue.blocked_entities),
        evidence_refs: asArray(issue.evidence_refs),
      },
      narrative_json: {
        why_now: asText(issue.narrative?.why_now || issue.semantic_raw?.why_now),
      },
      message_language: messageLanguage,
      change_flags: issue.changeFlags || {},
      suppression: issue.suppression || {},
      mode: selectedMode,
    };

    return [
      '(',
      sqlText(issue.issue_key) + ',',
      sqlText(request.monitorConfig?.teamId) + ',',
      sqlText(sprint.sprint_id || sprint.id) + ',',
      sqlText(issue.entity_type) + ',',
      sqlText(issue.entity_id) + ',',
      sqlText(issue.risk_type) + ',',
      sqlText(issue.severity) + ',',
      sqlText(deliveries.length > 0 ? 'escalated' : 'monitoring') + ',',
      sqlNumeric(issue.confidence) + ',',
      sqlText(issue.recommended_action) + ',',
      sqlText(asText(issue.narrative?.why_now || issue.semantic_raw?.why_now)) + ',',
      sqlJson(asArray(issue.evidence_refs)) + ',',
      sqlText(request.generatedAt) + ',',
      sqlText(request.generatedAt) + ',',
      sqlText(deliveries.length > 0 ? request.generatedAt : null) + ',',
      sqlText(request.runId) + ',',
      sqlJson(metadata),
      ')',
    ].join(' ');
  }).join(',\n'));
  statements.push([
    'ON CONFLICT (issue_key) DO UPDATE SET',
    'severity = EXCLUDED.severity,',
    'state = EXCLUDED.state,',
    'confidence = EXCLUDED.confidence,',
    'recommended_action = EXCLUDED.recommended_action,',
    'why_now = EXCLUDED.why_now,',
    'evidence = EXCLUDED.evidence,',
    'last_seen_at = EXCLUDED.last_seen_at,',
    'last_alerted_at = EXCLUDED.last_alerted_at,',
    'source_run_id = EXCLUDED.source_run_id,',
    'metadata_json = EXCLUDED.metadata_json;',
  ].join(' '));
}

for (let index = 0; index < deliveries.length; index += 1) {
  const delivery = deliveries[index];
  const response = responses[index] || {};
  const sent = Number(response.statusCode || 0) > 0 && Number(response.statusCode || 0) < 400;

  statements.push([
    'INSERT INTO interventions (run_id, issue_key, delivery_channel, destination, action_type, message_text, delivered_at, delivery_status, metadata_json) VALUES (',
    sqlText(request.runId) + ',',
    sqlText((delivery.issueKeys || [])[0] || '') + ',',
    sqlText(delivery.destinationType || 'google_chat_unified') + ',',
    sqlText(delivery.destination) + ',',
    sqlText(delivery.messageType) + ',',
    sqlText(delivery.auditText || delivery.payload?.text || '') + ',',
    sqlText(sent ? request.generatedAt : null) + ',',
    sqlText(sent ? 'sent' : 'failed') + ',',
    sqlJson({ ...response, messageLanguage, selectedMode }),
    ');',
  ].join(' '));

  statements.push([
    'INSERT INTO message_deliveries (run_id, message_type, destination, payload_json, response_code, response_body, status, sent_at) VALUES (',
    sqlText(request.runId) + ',',
    sqlText(delivery.messageType) + ',',
    sqlText(delivery.destination) + ',',
    sqlJson(delivery.payload) + ',',
    sqlNumeric(response.statusCode) + ',',
    sqlText(JSON.stringify(response.body || response)) + ',',
    sqlText(sent ? 'sent' : 'failed') + ',',
    sqlText(request.generatedAt),
    ');',
  ].join(' '));
}

for (const note of retroNotes) {
  statements.push([
    'INSERT INTO retro_notes (team_id, sprint_id, note_type, severity, content, source_issue_key, source_run_id, created_at) VALUES (',
    sqlText(request.monitorConfig?.teamId) + ',',
    sqlText(sprint.sprint_id || sprint.id) + ',',
    sqlText(note.note_type) + ',',
    sqlText(note.severity) + ',',
    sqlText(note.content) + ',',
    sqlText(note.source_issue_key) + ',',
    sqlText(request.runId) + ',',
    sqlText(request.generatedAt),
    ');',
  ].join(' '));
}

return [{
  json: {
    persistQuery: statements.join('\n'),
    persistSummary: {
      selectedMode,
      modeSelectionSource,
      messageLanguage,
      taskSnapshots: tasks.length,
      activityExcerpts: activityExcerpts.length,
      issueUpserts: deliverableIssues.length,
      deliveryRows: deliveries.length,
      retroNotes: retroNotes.length,
    },
  },
}];
