const request = $('Normalize Request').first().json || {};
const signalState = $('Compute Signals').first().json || {};

function sqlEscape(value) {
  return String(value ?? '').replace(/'/g, "''");
}

const teamId = sqlEscape(request.monitorConfig?.teamId || '');
const sprintId = sqlEscape(signalState.sprint?.sprint_id || signalState.sprint?.id || '');

const query = [
  'SELECT json_build_object(',
  "  'openIssues', COALESCE((",
  "    SELECT json_agg(row_to_json(t)) FROM (",
  "      SELECT issue_key, team_id, sprint_id, entity_type, entity_id, risk_type, severity, state, confidence, recommended_action, why_now, evidence, last_seen_at, last_alerted_at, metadata_json",
  "      FROM issues",
  "      WHERE team_id = '" + teamId + "'",
  sprintId ? "        AND sprint_id = '" + sprintId + "'" : '',
  "        AND state IN ('detected','monitoring','nudged','escalated','suppressed')",
  '      ORDER BY last_seen_at DESC',
  '      LIMIT 200',
  '    ) t',
  "  ), '[]'::json),",
  "  'priorInterventions', COALESCE((",
  "    SELECT json_agg(row_to_json(t)) FROM (",
  "      SELECT issue_key, action_type, message_text, delivery_status, created_at",
  "      FROM interventions",
  "      WHERE created_at >= now() - interval '7 day'",
  "      ORDER BY created_at DESC",
  "      LIMIT 200",
  '    ) t',
  "  ), '[]'::json),",
  "  'historicalPatterns', COALESCE((",
  "    SELECT json_agg(row_to_json(t)) FROM (",
  "      SELECT * FROM historical_patterns",
  "      WHERE team_id = '" + teamId + "'",
  '      ORDER BY generated_at DESC',
  '      LIMIT 50',
  '    ) t',
  "  ), '[]'::json),",
  "  'recentRuns', COALESCE((",
  "    SELECT json_agg(row_to_json(t)) FROM (",
  "      SELECT id, run_type, status, no_message, started_at, summary_json",
  "      FROM runs",
  "      WHERE team_id = '" + teamId + "'",
  '      ORDER BY started_at DESC',
  '      LIMIT 50',
  '    ) t',
  "  ), '[]'::json)",
  ') AS state_json;',
].filter(Boolean).join('\n');

return [{
  json: {
    priorStateQuery: query,
  },
}];
