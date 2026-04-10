const request = $('Normalize Request').first().json || {};
const context = $('Normalize Sprint Context').first().json || {};
const gate = $('Delivery Gate').first().json || {};
const semanticOutput = gate.semanticOutput || {};
const narrativeOutput = gate.narrativeOutput || {};
const messageLanguage = String(gate.messageLanguage || request.monitorConfig?.messageLanguage || 'en').trim().toLowerCase() === 'vi' ? 'vi' : 'en';

function asText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function t(english, vietnamese) {
  return messageLanguage === 'vi' ? vietnamese : english;
}

function normalizeEmail(value) {
  const email = asText(value).toLowerCase();
  return email.includes('@') ? email : '';
}

function extractHandleFromEmail(value) {
  const email = normalizeEmail(value);
  return email ? email.split('@')[0] : '';
}

function rewriteLegacyTokens(text) {
  return asText(text)
    .replace(/@PIC\b/gi, '@ASSIGNEE')
    .replace(/@REVIEWER\b/gi, '@OWNER')
    .replace(/@QC\b/gi, '@QCS');
}

function tokenDisplayText(token) {
  const upper = asText(token).replace(/^@/, '').toUpperCase();
  if (upper === 'LEAD') return '@Lead';
  if (upper === 'PM') return '@PM';
  if (upper === 'ASSIGNEE') return '@ASSIGNEE';
  if (upper === 'OWNER') return '@OWNER';
  if (upper === 'QCS') return '@QCS';
  return '@' + asText(token).replace(/^@/, '');
}

const memberRows = $input.all().map((item) => item?.json || {});
const directoryByKey = new Map();

function registerDirectoryKey(rawKey, entry) {
  const key = asText(rawKey).replace(/^@/, '').toLowerCase();
  if (!key || directoryByKey.has(key)) return;
  directoryByKey.set(key, entry);
}

for (const row of memberRows) {
  const normalized = {};
  for (const [key, value] of Object.entries(row || {})) {
    normalized[String(key || '').trim().toLowerCase()] = value;
  }
  const email = normalizeEmail(normalized.email);
  const id = asText(normalized.id);
  const name = asText(normalized.name || normalized.display_name || normalized.displayname);
  const handle = extractHandleFromEmail(email);
  if (!id || !email) continue;
  const entry = {
    id,
    email,
    name,
    handle,
    mentionText: '<users/' + id + '>',
  };
  registerDirectoryKey(email, entry);
  registerDirectoryKey(handle, entry);
  registerDirectoryKey(name, entry);
}

function resolveMemberFromToken(token) {
  const key = asText(token).replace(/^@/, '').toLowerCase();
  if (!key) return null;
  return directoryByKey.get(key) || null;
}

function renderLineMentions(lineKind, rawLine) {
  const sourceLine = rewriteLegacyTokens(rawLine);
  const appendedMentions = [];
  const resolvedPeople = [];
  const roleTokens = [];

  const renderedText = asText(sourceLine).replace(/(^|[\s(/])@([A-Za-z0-9._-]{2,64})\b/g, (full, prefix, rawToken) => {
    const token = asText(rawToken);
    const upper = token.toUpperCase();
    if (!token) return full;

    if (['PM', 'LEAD', 'ASSIGNEE', 'OWNER', 'QCS'].includes(upper)) {
      roleTokens.push('@' + upper);
      return prefix + '*' + tokenDisplayText(token) + '*';
    }

    const member = resolveMemberFromToken(token);
    if (member?.mentionText) {
      const handle = asText(member.handle || token).replace(/^@/, '').toLowerCase();
      appendedMentions.push(member.mentionText);
      resolvedPeople.push({
        token: '@' + token,
        handle,
        mentionText: member.mentionText,
        displayName: asText(member.name || member.email || handle),
      });
      return prefix + '*@' + handle + '*';
    }

    return prefix + '*@' + token + '*';
  });

  return {
    lineKind,
    text: renderedText,
    resolvedPeople,
    roleTokens,
    appendedMentionIds: Array.from(new Set(appendedMentions)),
  };
}

function cleanLine(value) {
  return asText(value).replace(/^[-*•\s]+/, '').trim();
}

const sprint = context.sprint || {};
const tasks = asArray(context.tasks);
const selectedMode = asText(gate.selectedMode, 'scan');
const isNearEnd = Boolean(gate.isNearEnd);
const deliverableIssues = asArray(gate.deliverableIssues);
const deltaIssues = asArray(gate.deltaDeliverableIssues).length > 0
  ? asArray(gate.deltaDeliverableIssues)
  : deliverableIssues;

const notStartedCount = tasks.filter((task) => asText(task.status) === 'Open').length;
const reviewCount = tasks.filter((task) => ['Ready For Review', 'In Review'].includes(asText(task.status))).length;
const blockedCount = tasks.filter((task) => asArray(task.blocked_by).length > 0).length;
const doneTasks = tasks.filter((task) => ['Ready For Review', 'In Review', 'Ready For Release', 'Close'].includes(asText(task.status))).length;
const totalTasks = tasks.length;
const donePoints = asNumber(sprint.completed_points, 0);
const totalPoints = asNumber(sprint.committed_points, 0);
const burnedPercent = totalPoints > 0 ? Number(((donePoints / totalPoints) * 100).toFixed(1)) : null;
const elapsedRatio = asNumber(sprint.elapsed_ratio, 0);
const daysLeft = asNumber(sprint.days_remaining, 0);

const statusMap = {
  likely_on_track: t('on track', 'on track'),
  at_risk_but_recoverable: t('at risk', 'at risk'),
  likely_spillover: t('likely spillover', 'likely spillover'),
};
const sprintStatus = statusMap[asText(gate.sprintAssessment?.delivery_outlook || semanticOutput.summary?.delivery_outlook)] || t('at risk', 'at risk');

function buildDeterministicUrgency() {
  const parts = [];
  if (daysLeft > 0) parts.push(t(String(daysLeft) + ' days left', 'Còn ' + String(daysLeft) + ' ngày'));
  if (daysLeft === 0) parts.push(t('last sprint day', 'Ngày cuối sprint'));
  if (totalPoints > 0) {
    parts.push(t(String(donePoints) + '/' + String(totalPoints) + ' pts done', String(donePoints) + '/' + String(totalPoints) + ' điểm đã xong'));
  }
  const highPressure = (daysLeft > 0 && daysLeft <= 4) || elapsedRatio >= 0.55 || (burnedPercent !== null && burnedPercent < 40);
  if (highPressure) {
    parts.push(t('scope pressure is high; re-prioritize today', 'áp lực scope cao; cần chốt ưu tiên hôm nay'));
  }
  return parts.join(' · ');
}

function fallbackMainBlocker() {
  const issue = deliverableIssues[0] || {};
  return asText(issue.narrative?.why_now)
    || asText(issue.semantic_raw?.why_now)
    || t('Main blocker needs a decision today.', 'Main blocker cần một quyết định trong hôm nay.');
}

function fallbackQuickWin() {
  const quick = deliverableIssues.find((issue) => issue.is_quick_win) || {};
  return asText(quick.narrative?.why_now)
    || t('Clear the nearest review/test ownership to convert waiting tasks to done.', 'Gỡ owner review/test gần done nhất để chốt task trong hôm nay.');
}

function fallbackDecisionToday() {
  return isNearEnd
    ? t('@PM/@Lead lock salvage, de-scope, or carryover before day end.', '@PM/@Lead chốt salvage, de-scope hoặc carryover trước cuối ngày.')
    : t('@PM/@Lead lock must-land scope today for blocker resolution.', '@PM/@Lead cần khóa must-land scope hôm nay để unblock sprint.');
}

let urgencyLine = '';
let mainBlockerLine = '';
let quickWinLine = '';
let decisionTodayLine = '';
let scanDeltaLines = [];
let lineMentions = [];

if (selectedMode === 'review') {
  urgencyLine = cleanLine(narrativeOutput.urgency) || buildDeterministicUrgency();
  mainBlockerLine = cleanLine(narrativeOutput.main_blocker) || fallbackMainBlocker();
  quickWinLine = cleanLine(narrativeOutput.quick_win) || fallbackQuickWin();
  decisionTodayLine = cleanLine(narrativeOutput.decision_today) || fallbackDecisionToday();

  lineMentions = [
    renderLineMentions('mainBlocker', mainBlockerLine),
    renderLineMentions('quickWin', quickWinLine),
    renderLineMentions('decisionToday', decisionTodayLine),
  ].filter((line) => asText(line.text));

  mainBlockerLine = asText(lineMentions.find((line) => line.lineKind === 'mainBlocker')?.text || mainBlockerLine);
  quickWinLine = asText(lineMentions.find((line) => line.lineKind === 'quickWin')?.text || quickWinLine);
  decisionTodayLine = asText(lineMentions.find((line) => line.lineKind === 'decisionToday')?.text || decisionTodayLine);
} else {
  const narrativeScanLines = asArray(narrativeOutput.scan_delta_lines).map((line) => cleanLine(line)).filter(Boolean).slice(0, 3);

  const deterministicScanLines = deltaIssues.slice(0, 3).map((issue) => {
    const reasons = [];
    if (issue.changeFlags?.newIssue) reasons.push(t('new', 'mới'));
    if (issue.changeFlags?.severityIncrease) reasons.push(t('severity up', 'tăng mức độ'));
    if (issue.changeFlags?.materialChange) reasons.push(t('material change', 'đổi ngữ nghĩa'));
    if (issue.changeFlags?.newGoalBlocker) reasons.push(t('goal blocker', 'block mục tiêu'));

    const reasonText = reasons.length > 0 ? ' [' + reasons.join(', ') + ']' : '';
    const keyText = asText(issue.entity_id || issue.issue_key || issue.risk_type);
    const whyText = asText(issue.narrative?.why_now || issue.semantic_raw?.why_now || issue.recommended_action || issue.risk_type);
    const mentionEmail = asText(issue.mentions_needed?.[0]?.email).toLowerCase();
    const mentionHandle = mentionEmail.includes('@') ? '@' + mentionEmail.split('@')[0] : '';

    return t('Delta', 'Delta') + ': ' + keyText + ' — ' + whyText + reasonText + (mentionHandle ? ' ' + mentionHandle : '');
  });

  const finalScanLines = (narrativeScanLines.length > 0 ? narrativeScanLines : deterministicScanLines).slice(0, 3);
  const rendered = finalScanLines.map((line) => renderLineMentions('scanDelta', line));
  lineMentions = rendered.filter((line) => asText(line.text));
  scanDeltaLines = lineMentions.map((line) => asText(line.text)).filter(Boolean).slice(0, 3);
}

const mentionTail = Array.from(
  new Set(
    lineMentions.flatMap((line) => asArray(line.appendedMentionIds).map((mention) => asText(mention)).filter(Boolean)),
  ),
).join(' ');

const metricsLines = [
  t('Team passed', 'Team passed') + ': ' + doneTasks + '/' + Math.max(0, totalTasks) + ' ' + t('tasks', 'tasks') + ' — ' + donePoints + '/' + (totalPoints || 0) + ' pts — ' + (burnedPercent === null ? 'n/a' : String(burnedPercent) + '%') + ' ' + t('burned', 'burned'),
];
const keySignals = [
  t('Blocked', 'Blocked') + ': ' + blockedCount + ' ' + t('tasks', 'tasks'),
  t('In review', 'In review') + ': ' + reviewCount + ' ' + t('tasks', 'tasks'),
  t('Not started', 'Not started') + ': ' + notStartedCount + ' ' + t('tasks', 'tasks'),
];

return [{
  json: {
    selectedMode,
    isNearEnd,
    messageLanguage,
    threadKey: 'sprint-monitor-' + request.runId,
    sprintStatus,
    daysLeft,
    metricsLines,
    keySignals: keySignals.filter(Boolean).slice(0, 4),
    urgencyLine,
    mainBlockerLine,
    quickWinLine,
    decisionTodayLine,
    scanDeltaLines,
    mentionTail,
    lineMentions,
    deliveryIssueKeys: deliverableIssues.map((issue) => issue.issue_key),
  },
}];
