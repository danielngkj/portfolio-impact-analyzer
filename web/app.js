const $ = (id) => document.getElementById(id);
let model;
let entities;
let scenarios;
let busy = false;
let activeReport;
let reportTimestamp;
let copyTimer;
const reviews = new Map();
let activeFindings;
let activeCandidateIds = [];
let activeStatusFilter = null;
const reviewStatuses = ['Needs change', 'Needs investigation', 'No change needed'];

function updateReviewProgress() {
  const counts = Object.fromEntries(reviewStatuses.map((status) => [status, 0]));
  for (const id of activeCandidateIds) counts[activeFindings.get(id)?.status || 'Needs change']++;
  $('review-progress').replaceChildren();
  for (const [index, status] of reviewStatuses.entries()) {
    const count = element('button', undefined, 'review-status-count');
    count.type = 'button';
    count.setAttribute('aria-pressed', String(activeStatusFilter === status));
    count.addEventListener('click', () => {
      activeStatusFilter = activeStatusFilter === status ? null : status;
      document.querySelectorAll('.candidate-review[open]').forEach((review) => { review.open = false; });
      updateReviewProgress();
      Array.from($('review-progress').children).find((button) => button.dataset.reviewStatus === status)?.focus();
    });
    count.dataset.reviewStatus = status;
    count.tabIndex = 0;
    count.setAttribute('aria-label', `${status}: ${counts[status]}`);
    const number = element('strong', counts[status]);
    number.setAttribute('aria-hidden', 'true');
    const tooltip = element('span', activeStatusFilter === status ? `${status} · Show all` : `${status} · Filter`, 'status-tooltip');
    tooltip.id = `count-tooltip-${index}`;
    tooltip.setAttribute('role', 'tooltip');
    count.setAttribute('aria-describedby', tooltip.id);
    count.append(statusIcon(status), number, tooltip);
    $('review-progress').append(count);
  }
  applyStatusFilter();
}

function applyStatusFilter() {
  for (const id of ['engineering', 'documentation']) {
    const container = $(id);
    const cards = Array.from(container.querySelectorAll('.candidate'));
    for (const card of cards) {
      // Keep an active editor available until its note is finished.
      card.hidden = Boolean(activeStatusFilter && card.dataset.reviewStatus !== activeStatusFilter && !card.querySelector('.candidate-review').open);
    }
    container.querySelector('.filter-empty')?.remove();
    const visible = cards.filter((card) => !card.hidden).length;
    if (activeStatusFilter && cards.length && !visible) container.append(element('p', 'No matching artifacts.', 'empty filter-empty'));
    $(`${id}-count`).textContent = activeStatusFilter ? `${visible} / ${cards.length}` : `${cards.length} ${cards.length === 1 ? 'candidate' : 'candidates'}`;
  }
}

const typeLabels = {Parameter: 'Parameter', SoftwareModule: 'Software module', Behaviour: 'Behaviour', Requirement: 'Requirement', Test: 'Test', DocumentationTopic: 'Documentation topic'};

// Lucide copy, message-square, search, pencil, and circle-check geometry (see icons/LICENSE).
const statusIconShapes = {
  'note': [['path', {d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'}]],
  'copy': [['rect', {x: 9, y: 9, width: 13, height: 13, rx: 2}], ['path', {d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'}]],
  'Needs investigation': [['circle', {cx: 11, cy: 11, r: 8}], ['path', {d: 'm21 21-4.3-4.3'}]],
  'Needs change': [['path', {d: 'M21.174 6.812a1 1 0 0 0-3.986-3.986L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.5z'}], ['path', {d: 'm15 5 4 4'}]],
  'No change needed': [['circle', {cx: 12, cy: 12, r: 10}], ['path', {d: 'm9 12 2 2 4-4'}]],
};

function statusIcon(status) {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of Object.entries({viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'status-icon'})) icon.setAttribute(name, value);
  for (const [tag, attributes] of statusIconShapes[status]) {
    const shape = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
    icon.append(shape);
  }
  return icon;
}

function resetCopyState() {
  clearTimeout(copyTimer);
  $('copy-report').replaceChildren(statusIcon('copy'));
  $('copy-report').title = 'Copy report';
  $('copy-report').setAttribute('aria-label', 'Copy report');
  $('copy-feedback').textContent = '';
}

function markdownText(value) {
  return String(value).replace(/([\\`*_{}\[\]<>#])/g, '\\$1');
}

function buildReviewReport(result, findings, timestamp) {
  const change = result.change;
  const before = change.kind === 'behaviour' ? change.current_behaviour : `${change.current_value} ${change.unit}`;
  const after = change.kind === 'behaviour' ? change.proposed_behaviour : `${change.proposed_value} ${change.unit}`;
  const lines = [`# Change review: ${markdownText(change.entity.name)}`, '',
    `Artifact: ${change.entity.id}`, `Analyzed: ${timestamp}`, '',
    `Current: ${markdownText(before)}`, `Proposed: ${markdownText(after)}`];
  const counts = Object.fromEntries(reviewStatuses.map((status) => [status, 0]));
  for (const candidate of result.candidates) counts[findings.get(candidate.entity.id)?.status || 'Needs change']++;
  lines.push('', '## Review summary', '',
    `- Needs change: ${counts['Needs change']}`,
    `- Needs investigation: ${counts['Needs investigation']}`,
    `- No change needed: ${counts['No change needed']}`);
  if (!result.candidates.length && before.trim() === after.trim()) lines.push('No change proposed.');
  const noChangeNeeded = [];
  for (const candidate of result.candidates) {
    const item = candidate.entity;
    const finding = findings.get(item.id) || {status: 'Needs change', note: ''};
    if (finding.status === 'No change needed') {
      noChangeNeeded.push(item);
      continue;
    }
    lines.push('', `## ${markdownText(item.name)} — ${finding.status}`, '',
      `${item.id} · ${typeLabels[item.type]}`, '',
      `Review question: ${markdownText(candidate.review_question)}`);
    if (finding.note.trim()) {
      lines.push('', 'Finding:', ...finding.note.trimEnd().split(/\r?\n/).map((line) => `> ${markdownText(line)}`));
    }
    let path = markdownText(change.entity.name);
    for (const step of candidate.path) path += ` → ${step.label} → ${markdownText(entities[step.to].name)}`;
    lines.push('', `Connection: ${path}`);
  }
  if (noChangeNeeded.length) {
    lines.push('', '## No change needed', '');
    for (const item of noChangeNeeded) {
      const note = findings.get(item.id)?.note.trim().replace(/\s+/g, ' ') || '';
      lines.push(`- ${item.id} · ${markdownText(item.name)}${note ? ` — ${markdownText(note)}` : ''}`);
    }
  }
  return lines.join('\n');
}

function highlightReport(report) {
  const preview = $('report-preview');
  preview.replaceChildren();
  const lines = report.split('\n');
  lines.forEach((line, index) => {
    const row = element('span', undefined, 'report-line');
    if (line.startsWith('# ')) row.classList.add('report-title');
    else if (line.startsWith('## ')) row.classList.add('report-artifact');
    else if (line.startsWith('> ')) row.classList.add('report-note');
    if (line.startsWith('## ')) {
      const status = reviewStatuses.find((value) => line.endsWith(` — ${value}`));
      if (status) {
        row.append(element('span', line.slice(0, -status.length)));
        const badge = element('span', status, 'report-status');
        badge.dataset.reviewStatus = status;
        row.append(badge);
      } else row.textContent = line;
    } else {
      const label = line.match(/^(Artifact|Analyzed|Current|Proposed|Review question|Finding|Connection):/);
      if (label) row.append(element('span', label[0], 'report-label'), element('span', line.slice(label[0].length)));
      else row.textContent = line;
    }
    // Preserve exactly the Markdown text, including line breaks, for copying.
    if (index < lines.length - 1) row.append(element('span', '\n'));
    preview.append(row);
  });
}

function updateReportPreview() {
  if (!activeReport) return;
  highlightReport(buildReviewReport(activeReport, activeFindings, reportTimestamp));
  resetCopyState();
}

async function copyReport() {
  const report = $('report-preview').textContent;
  try {
    await navigator.clipboard.writeText(report);
    if ($('report-preview').textContent !== report || $('report').hidden) return;
    $('copy-report').replaceChildren(statusIcon('No change needed'));
    $('copy-report').title = 'Copied';
    $('copy-report').setAttribute('aria-label', 'Copied');
    $('copy-feedback').textContent = 'Copied';
    copyTimer = setTimeout(resetCopyState, 2000);
  } catch {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents($('report-preview'));
    selection.removeAllRanges(); selection.addRange(range);
    $('report-preview').focus();
    $('copy-feedback').textContent = 'Automatic copy unavailable. Report selected; press Control+C or Command+C.';
    $('copy-report').title = 'Copy unavailable; copy the selected report manually';
  }
}

const tocSections = [
  ['proposed-change', 'Proposed change'], ['change-summary', 'Change summary'],
  ['review-overview', 'Review findings'], ['engineering-review', 'Engineering'],
  ['documentation-review', 'Documentation'], ['review-report', 'Review report'],
];

function updateToc() {
  $('page-toc').hidden = $('report').hidden || $('review-overview').hidden;
  $('toc-links').replaceChildren();
  if ($('page-toc').hidden) return;
  for (const [id, label] of tocSections) {
    if ($(id).closest('[hidden]')) continue;
    const link = element('a', label);
    link.href = `#${id}`;
    const row = element('li');
    row.append(link);
    $('toc-links').append(row);
  }
  updateTocPosition();
}

function updateTocPosition() {
  const links = Array.from($('toc-links').querySelectorAll('a'));
  let active = links[0];
  for (const link of links) {
    if ($(link.hash.slice(1)).getBoundingClientRect().top <= 120) active = link;
  }
  if (window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) active = links[links.length - 1];
  for (const link of links) {
    if (link === active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}

let tocScrollPending = false;
function scheduleTocUpdate() {
  if (tocScrollPending) return;
  tocScrollPending = true;
  requestAnimationFrame(() => { tocScrollPending = false; updateTocPosition(); });
}
window.addEventListener('scroll', scheduleTocUpdate, {passive: true});
window.addEventListener('resize', scheduleTocUpdate);

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

const typeIcons = {Parameter: 'sliders-horizontal', SoftwareModule: 'code-xml', Behaviour: 'activity', Requirement: 'list-checks', Test: 'flask-conical', DocumentationTopic: 'file-text'};

function artifactIcon(type) {
  const icon = element('img', undefined, 'artifact-icon');
  icon.src = `icons/${typeIcons[type]}.svg`;
  icon.alt = '';
  icon.setAttribute('aria-hidden', 'true');
  icon.width = 18;
  icon.height = 18;
  return icon;
}

function artifactName(item, text = item.name) {
  const label = element('span', undefined, 'artifact-name');
  label.append(artifactIcon(item.type), element('span', text));
  return label;
}

function pathArtifact(item, changed = false) {
  const node = element('div', undefined, 'path-artifact');
  const type = element('span', undefined, 'path-artifact-type');
  type.append(artifactIcon(item.type), element('span', typeLabels[item.type]));
  node.append(type, element('strong', item.name), element('small', `${item.id}${changed ? ' · Changed artifact' : ''}`));
  return node;
}

function textChanges(current, proposed) {
  const before = current.match(/\s+|[^\s]+/g) || [];
  const after = proposed.match(/\s+|[^\s]+/g) || [];
  // Bound comparison work for unusually long free-text proposals.
  if (before.length * after.length > 250000) {
    return current === proposed ? [{kind: 'same', text: current}]
      : [{kind: 'removed', text: current}, {kind: 'added', text: proposed}];
  }
  const lengths = Array.from({length: before.length + 1}, () => new Uint32Array(after.length + 1));
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      lengths[i][j] = before[i] === after[j] ? 1 + lengths[i + 1][j + 1]
        : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const changes = [];
  function add(kind, text) {
    const last = changes[changes.length - 1];
    if (last?.kind === kind) last.text += text;
    else changes.push({kind, text});
  }
  let i = 0, j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      add('same', before[i++]); j++;
    } else if (i < before.length && (j === after.length || lengths[i + 1][j] >= lengths[i][j + 1])) {
      add('removed', before[i++]);
    } else add('added', after[j++]);
  }
  return changes;
}

function renderTextChanges(change) {
  const disclosure = $('text-changes');
  disclosure.hidden = change.kind !== 'behaviour';
  disclosure.open = false;
  $('text-diff').replaceChildren();
  if (disclosure.hidden) return;
  const changes = textChanges(change.current_behaviour, change.proposed_behaviour);
  for (const [label, excluded, highlight] of [['Current', 'added', 'removed'], ['Proposed', 'removed', 'added']]) {
    const row = element('div', undefined, 'diff-row');
    const text = element('p');
    for (const part of changes) {
      if (part.kind === excluded) continue;
      const segment = element('span', part.text, part.kind === highlight ? `diff-${highlight}` : undefined);
      text.append(segment);
    }
    row.append(element('span', label, 'summary-label'), text);
    $('text-diff').append(row);
  }
}

async function request(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The analysis could not be completed.');
  return data;
}

function setBusy(value) {
  busy = value;
  $('change-kind').disabled = value;
  const selected = Boolean($('change-kind').value);
  $('change-fields').disabled = value || !selected;
  for (const id of ['entity', 'analyze']) $(id).disabled = value || !selected;
  $('proposed').disabled = value || !selected || $('change-kind').value === 'Behaviour';
  $('proposed-behaviour').disabled = value || $('change-kind').value !== 'Behaviour';
  document.querySelector('.results').setAttribute('aria-busy', String(value));
}

function resetResultsReveal() {
  $('proposed-change').getAnimations({subtree: true}).forEach((animation) => animation.cancel());
  $('report').querySelectorAll('[inert]').forEach((section) => { section.inert = false; });
}

function clearReport(message) {
  resetResultsReveal();
  activeReport = null;
  $('report-preview').textContent = '';
  resetCopyState();
  $('report').hidden = true;
  updateToc();
  $('error').hidden = true;
  $('status').textContent = message;
}

function selectKind() {
  const kind = $('change-kind').value;
  const workspace = document.querySelector('.workspace');
  const selector = $('change-kind');
  const previous = selector.getBoundingClientRect();
  const leavingLanding = workspace.classList.contains('landing') && Boolean(kind);
  workspace.classList.toggle('landing', !kind);
  if (leavingLanding && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const destination = selector.getBoundingClientRect();
    $('change-form-panel').animate([
      {transform: `translate(${previous.left - destination.left}px, ${previous.top - destination.top}px)`},
      {transform: 'translate(0, 0)'}
    ], {duration: 320, easing: 'ease-out'});
  }
  $('artifact-selector').hidden = !kind;
  $('change-fields').hidden = !kind;
  if (!kind) {
    workspace.classList.remove('analysis-started');
    $('entity').replaceChildren();
    $('entity-label').textContent = 'Item';
    $('parameter-detail').textContent = '';
    $('current-value').textContent = '—';
    $('proposed').value = '';
    $('proposed-behaviour').value = '';
    $('proposed').hidden = false;
    $('proposed-behaviour').hidden = true;
    $('proposed-label').htmlFor = 'proposed';
    $('proposed-label').textContent = 'Proposed value';
    clearReport('Select a change type to begin.');
    setBusy(busy);
    return;
  }
  $('entity-label').replaceChildren(artifactName({type: kind, name: 'Item'}));
  $('entity').replaceChildren();
  for (const item of model.entities.filter((item) => item.type === kind && scenarios[item.id])) {
    const option = element('option', item.name);
    option.value = item.id;
    $('entity').append(option);
  }
  selectEntity();
  setBusy(busy);
}

function selectEntity() {
  const entity = entities[$('entity').value];
  $('parameter-detail').textContent = entity.detail;
  const behaviour = entity.type === 'Behaviour';
  $('current-label').textContent = behaviour ? 'Current behaviour' : 'Current value';
  $('current-value').textContent = behaviour ? (entity.current_behaviour || entity.detail) : `${entity.value} ${entity.unit}`;
  $('proposed-label').htmlFor = behaviour ? 'proposed-behaviour' : 'proposed';
  $('proposed-label').textContent = behaviour ? 'Proposed behaviour' : `Proposed value (${entity.unit})`;
  $('proposed').hidden = behaviour;
  $('proposed-behaviour').hidden = !behaviour;
  $('proposed').disabled = behaviour;
  $('proposed-behaviour').disabled = !behaviour;
  if (behaviour) $('proposed-behaviour').value = scenarios[entity.id].proposed;
  else $('proposed').value = scenarios[entity.id].proposed;
  clearReport('Choose a change, review the proposal, then select Find review candidates.');
}

function candidateCard(candidate, change) {
  const item = candidate.entity;
  const card = element('article', undefined, 'candidate');
  const meta = element('p', undefined, 'meta');
  const badge = element('span', undefined, 'type-badge');
  badge.append(artifactName(item, typeLabels[item.type] || item.type));
  meta.append(badge, element('span', item.id, 'artifact-id'));
  const heading = element('div', undefined, 'candidate-heading');
  heading.append(meta, element('h4', item.name));
  card.append(heading);
  card.append(element('p', candidate.review_question, 'review-question'));
  card.append(element('p', item.detail, 'artifact-detail'));
  const details = element('details');
  details.append(element('summary', `Show connection path · ${candidate.path.length} ${candidate.path.length === 1 ? 'connection' : 'connections'}`));
  const path = element('ol', undefined, 'connection-chain');
  path.setAttribute('aria-label', `Connection path from ${change.entity.name} to ${item.name}`);
  const origin = element('li', undefined, 'chain-step');
  origin.append(pathArtifact(change.entity, true));
  path.append(origin);
  const evidence = element('details', undefined, 'path-evidence');
  evidence.append(element('summary', 'Show relationship evidence'));
  const edges = element('ol', undefined, 'path');
  for (const step of candidate.path) {
    const target = entities[step.to];
    const row = element('li', undefined, 'chain-step');
    const connector = element('span', undefined, 'chain-connector');
    const arrow = element('span', '→', 'chain-arrow');
    arrow.setAttribute('aria-hidden', 'true');
    connector.append(element('span', step.label), arrow);
    row.append(connector, pathArtifact(target));
    path.append(row);
    const edge = element('li', `${entities[step.from].name} ${step.label} ${target.name}`);
    edge.append(element('small', `${step.direction} traversal · ${step.stored_edge.source} — ${step.relationship} → ${step.stored_edge.target}`));
    edges.append(edge);
  }
  evidence.append(edges);
  const viewport = element('div', undefined, 'chain-viewport');
  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'region');
  viewport.setAttribute('aria-label', 'Artifact connection chain; scroll horizontally to see the full path');
  viewport.append(path);
  details.append(viewport, evidence);
  card.append(details);
  const finding = activeFindings.get(item.id) || {status: 'Needs change', note: ''};
  activeFindings.set(item.id, finding);
  const review = element('details', undefined, 'candidate-review');
  const reviewSummary = element('summary');
  reviewSummary.append(statusIcon('note'));
  reviewSummary.title = 'Review note';
  reviewSummary.setAttribute('aria-label', `Review note for ${item.name}`);
  review.append(reviewSummary);
  review.addEventListener('toggle', () => {
    if (!review.open) applyStatusFilter();
    if (review.open) {
      document.querySelectorAll('.candidate-review[open]').forEach((other) => {
        if (other !== review) other.open = false;
      });
    }
  });
  const controls = element('div', undefined, 'review-controls');
  const actions = element('div', undefined, 'candidate-actions');
  const statusButtons = element('div', undefined, 'card-status-buttons');
  statusButtons.setAttribute('role', 'group');
  statusButtons.setAttribute('aria-label', `Review status for ${item.name}`);
  const noteLabel = element('label', 'Review note');
  const noteInput = element('textarea');
  noteInput.id = `review-note-${item.id}`;
  noteLabel.htmlFor = noteInput.id;
  noteInput.rows = 2;
  noteInput.placeholder = 'Enter to finish · Shift+Enter for a new line';
  noteInput.value = finding.note;
  const noteFeedback = element('span', '', 'note-feedback');
  noteFeedback.setAttribute('role', 'status');
  noteFeedback.setAttribute('aria-live', 'polite');
  let feedbackTimer;
  for (const status of reviewStatuses) {
    const button = element('button', undefined, 'card-status-button');
    button.type = 'button';
    button.dataset.reviewStatus = status;
    button.setAttribute('aria-label', status);
    button.setAttribute('aria-pressed', String(finding.status === status));
    const tooltip = element('span', status, 'status-tooltip');
    button.append(statusIcon(status), tooltip);
    button.addEventListener('click', () => {
      finding.status = status;
      card.dataset.reviewStatus = status;
      for (const sibling of statusButtons.children) sibling.setAttribute('aria-pressed', String(sibling === button));
      review.open = status === 'Needs investigation';
      updateReviewProgress();
      updateReportPreview();
      if (review.open) noteInput.focus();
      else if (card.hidden) $('review-progress').querySelector('[aria-pressed="true"]')?.focus();
    });
    statusButtons.append(button);
  }
  noteInput.addEventListener('input', () => {
    finding.note = noteInput.value;
    updateReportPreview();
    clearTimeout(feedbackTimer);
    noteFeedback.textContent = finding.note.trimEnd().endsWith('.') ? 'Report updated' : '';
    if (noteFeedback.textContent) feedbackTimer = setTimeout(() => { noteFeedback.textContent = ''; }, 2500);
  });
  noteInput.addEventListener('blur', () => {
    finding.note = noteInput.value.trimEnd();
    noteInput.value = finding.note;
    updateReportPreview();
  });
  noteInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    noteInput.blur();
    review.open = false;
    applyStatusFilter();
    if (card.hidden) $('review-progress').querySelector('[aria-pressed="true"]')?.focus();
    else reviewSummary.focus();
  });
  card.dataset.reviewStatus = finding.status;
  controls.append(noteLabel, noteInput, noteFeedback);
  review.append(controls);
  actions.append(statusButtons, review);
  card.append(actions);
  return card;
}

function render(result) {
  document.querySelector('.workspace').classList.add('analysis-started');
  const change = result.change;
  activeStatusFilter = null;
  const hasChange = change.has_change;
  const candidatesForReview = hasChange ? result.candidates : [];
  activeReport = {...result, candidates: candidatesForReview};
  reportTimestamp = new Date().toISOString();
  // Findings belong to the exact proposal, never merely the shared artifact.
  const reviewKey = JSON.stringify([change.entity.id, change.current_value ?? change.current_behaviour,
    change.proposed_value ?? change.proposed_behaviour, change.unit ?? '']);
  if (!reviews.has(reviewKey)) reviews.set(reviewKey, new Map());
  activeFindings = reviews.get(reviewKey);
  activeCandidateIds = candidatesForReview.map((candidate) => candidate.entity.id);
  const engineering = candidatesForReview.filter((item) => item.entity.type !== 'DocumentationTopic');
  const documentation = candidatesForReview.filter((item) => item.entity.type === 'DocumentationTopic');
  $('change-title').replaceChildren(artifactName(change.entity));
  $('change-values').replaceChildren();
  for (const [label, value] of [
    ['Current', change.kind === 'behaviour' ? change.current_behaviour : `${change.current_value} ${change.unit}`],
    ['Proposed', change.kind === 'behaviour' ? change.proposed_behaviour : `${change.proposed_value} ${change.unit}`],
  ]) {
    const block = element('div', undefined, `change-block state-${label.toLowerCase()}`);
    block.append(element('span', label, 'summary-label'), element('p', value));
    $('change-values').append(block);
  }
  renderTextChanges(change);
  $('counts').textContent = `${candidatesForReview.length} ${candidatesForReview.length === 1 ? 'candidate' : 'candidates'} · ${engineering.length} engineering · ${documentation.length} documentation`;
  for (const [id, candidates] of [['engineering', engineering], ['documentation', documentation]]) {
    $(id).parentElement.hidden = !hasChange;
    $(id).replaceChildren(...candidates.map((item) => candidateCard(item, change)));
    if (!candidates.length) $(id).append(element('p', 'No candidates connected by the current review policy.', 'empty'));
    $(`${id}-count`).textContent = `${candidates.length} ${candidates.length === 1 ? 'candidate' : 'candidates'}`;
  }
  $('review-overview').hidden = !hasChange;
  updateReviewProgress();
  updateReportPreview();
  $('report').hidden = false;
  updateToc();
  $('status').textContent = !hasChange
    ? 'No change proposed. The proposal matches the current value or behaviour; no review candidates are needed.'
    : `${candidatesForReview.length} potential review ${candidatesForReview.length === 1 ? 'candidate' : 'candidates'} for ${change.entity.name.toLowerCase()}.`;
  revealResults();
}

function revealResults() {
  resetResultsReveal();
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const fadeDuration = 750;
    const groupPause = 100;
    const blocks = [$('change-summary'), $('counts'), $('review-overview')];
    for (const id of ['engineering-review', 'documentation-review']) {
      if (!$(id).hidden) {
        blocks.push($(id).querySelector('.group-heading'), ...$(id).querySelectorAll('.candidate, .empty'));
      }
    }
    if (!$('review-overview').hidden) blocks.push($('review-report'));
    const screenHeight = Math.max(240, window.innerHeight - 48);
    let group = 0;
    let groupTop = blocks[0].getBoundingClientRect().top;
    blocks.filter((block) => !block.hidden).forEach((section) => {
      const bounds = section.getBoundingClientRect();
      // Keep complete cards together, pausing only when the next block
      // would extend beyond the current screenful.
      if (bounds.bottom > groupTop + screenHeight && bounds.top > groupTop) {
        group += 1;
        groupTop = bounds.top;
      }
      section.inert = true;
      const frames = [
        {opacity: 0},
        {opacity: 1}
      ];
      const timing = {duration: fadeDuration, delay: group * (fadeDuration + groupPause), fill: 'backwards', easing: 'cubic-bezier(0.22, 1, 0.36, 1)'};
      const animation = section.animate(frames, timing);
      animation.onfinish = () => { section.inert = false; };
    });
  }
}

async function runAnalysis() {
  if (busy || !$('change-form').reportValidity()) return;
  const behaviour = $('change-kind').value === 'Behaviour';
  const proposed = behaviour ? $('proposed-behaviour').value.trim() : Number($('proposed').value);
  if (behaviour ? !proposed : !Number.isFinite(proposed)) {
    clearReport('');
    $('error').textContent = behaviour ? 'Describe the proposed behaviour.' : 'Enter a finite numeric value.';
    $('error').hidden = false;
    return;
  }
  clearReport('Tracing the review connections…');
  setBusy(true);
  try {
    render(ImpactAnalyzer.analyze(model, $('entity').value, proposed));
  } catch (error) {
    $('status').textContent = '';
    $('error').textContent = error.message;
    $('error').hidden = false;
  } finally {
    setBusy(false);
  }
}

document.addEventListener('click', (event) => {
  document.querySelectorAll('.candidate-review[open]').forEach((review) => {
    if (!review.parentElement.contains(event.target)) review.open = false;
  });
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  document.querySelectorAll('.candidate-review[open]').forEach((review) => {
    const restoreFocus = review.contains(document.activeElement);
    review.open = false;
    applyStatusFilter();
    if (restoreFocus) {
      if (review.closest('.candidate').hidden) $('review-progress').querySelector('[aria-pressed="true"]')?.focus();
      else review.querySelector('summary').focus();
    }
  });
});

$('copy-report').addEventListener('click', copyReport);

$('change-form').addEventListener('submit', (event) => { event.preventDefault(); runAnalysis(); });
$('change-kind').addEventListener('change', selectKind);
$('entity').addEventListener('change', selectEntity);
$('proposed-behaviour').addEventListener('input', () => clearReport('Proposed behaviour changed. Run the analysis to update the results.'));
$('proposed').addEventListener('input', () => clearReport('Proposed value changed. Run the analysis to update the results.'));

async function initialize() {
  try {
    const graph = await request('data/coffee-machine.json');
    const catalog = ImpactAnalyzer.supportedScenarios(graph);
    model = graph;
    scenarios = Object.fromEntries(catalog.scenarios.map((item) => [item.entity_id, item]));
    entities = Object.fromEntries(model.entities.map((item) => [item.id, item]));
    selectKind();
    setBusy(false);

  } catch (error) {
    $('status').textContent = '';
    $('error').textContent = `Unable to load the model. ${error.message} Reload this page to try again.`;
    $('error').hidden = false;
    document.querySelector('.results').setAttribute('aria-busy', 'false');
  }
}
initialize();
