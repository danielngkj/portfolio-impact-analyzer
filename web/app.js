const $ = (id) => document.getElementById(id);
let model;
let entities;
let scenarios;
let busy = false;
const reviews = new Map();
let activeFindings;
let activeCandidateIds = [];
const reviewStatuses = ['Unreviewed', 'Needs investigation', 'Needs change', 'No change needed'];

function updateReviewProgress() {
  const counts = Object.fromEntries(reviewStatuses.map((status) => [status, 0]));
  for (const id of activeCandidateIds) counts[activeFindings.get(id)?.status || 'Unreviewed']++;
  $('review-progress').textContent = `${counts.Unreviewed} unreviewed · ${counts['Needs investigation']} need investigation · ${counts['Needs change']} need change · ${counts['No change needed']} need no change`;
}
const typeLabels = {Parameter: 'Parameter', SoftwareModule: 'Software module', Behaviour: 'Behaviour', Requirement: 'Requirement', Test: 'Test', DocumentationTopic: 'Documentation topic'};

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

const typeIcons = {Parameter: 'sliders-horizontal', SoftwareModule: 'code-xml', Behaviour: 'activity', Requirement: 'list-checks', Test: 'flask-conical', DocumentationTopic: 'file-text'};

function artifactIcon(type) {
  const icon = element('img', undefined, 'artifact-icon');
  icon.src = `/icons/${typeIcons[type]}.svg`;
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
  for (const part of changes) {
    const tag = part.kind === 'removed' ? 'del' : part.kind === 'added' ? 'ins' : 'span';
    const segment = element(tag, part.text);
    if (part.kind !== 'same') {
      const announcement = element('span', `${part.kind === 'removed' ? 'Removed' : 'Added'} text: `, 'sr-only');
      const end = element('span', ` End ${part.kind} text. `, 'sr-only');
      $('text-diff').append(announcement, segment, end);
    } else $('text-diff').append(segment);
  }
  $('diff-caption').textContent = changes.some((part) => part.kind !== 'same')
    ? 'Wording comparison only; this does not determine engineering impact.' : 'No text changes.';
}

async function request(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The analysis could not be completed.');
  return data;
}

function setBusy(value) {
  busy = value;
  for (const id of ['change-kind', 'entity', 'analyze']) $(id).disabled = value;
  $('proposed').disabled = value || $('change-kind').value === 'Behaviour';
  $('proposed-behaviour').disabled = value || $('change-kind').value !== 'Behaviour';
  document.querySelector('.results').setAttribute('aria-busy', String(value));
}

function clearReport(message) {
  $('report').hidden = true;
  $('error').hidden = true;
  $('status').textContent = message;
}

function selectKind() {
  const kind = $('change-kind').value;
  $('entity-label').replaceChildren(artifactName({type: kind, name: typeLabels[kind]}));
  $('entity').replaceChildren();
  for (const item of model.entities.filter((item) => item.type === kind && scenarios[item.id])) {
    const option = element('option', item.name);
    option.value = item.id;
    $('entity').append(option);
  }
  selectEntity();
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
  const finding = activeFindings.get(item.id) || {status: 'Unreviewed', note: ''};
  activeFindings.set(item.id, finding);
  const review = element('details', undefined, 'candidate-review');
  const reviewSummary = element('summary', finding.status);
  reviewSummary.setAttribute('aria-label', `Review status for ${item.name}: ${finding.status}. Edit review`);
  review.append(reviewSummary);
  const controls = element('div', undefined, 'review-controls');
  const statusLabel = element('label', 'Your review status');
  const statusInput = element('select');
  statusInput.id = `review-status-${item.id}`;
  statusLabel.htmlFor = statusInput.id;
  for (const status of reviewStatuses) {
    const option = element('option', status);
    option.value = status;
    statusInput.append(option);
  }
  statusInput.value = finding.status;
  const noteLabel = element('label', 'Review note');
  const noteInput = element('textarea');
  noteInput.id = `review-note-${item.id}`;
  noteLabel.htmlFor = noteInput.id;
  noteInput.rows = 2;
  noteInput.placeholder = 'Record your finding or reason (optional)';
  noteInput.value = finding.note;
  statusInput.addEventListener('change', () => {
    finding.status = statusInput.value;
    reviewSummary.textContent = finding.status;
    reviewSummary.setAttribute('aria-label', `Review status for ${item.name}: ${finding.status}. Edit review`);
    card.dataset.reviewStatus = finding.status;
    updateReviewProgress();
  });
  noteInput.addEventListener('input', () => { finding.note = noteInput.value; });
  card.dataset.reviewStatus = finding.status;
  controls.append(statusLabel, statusInput, noteLabel, noteInput);
  review.append(controls);
  card.append(review);
  return card;
}

function render(result) {
  const change = result.change;
  // Compare the actual proposal; older running servers may omit has_change.
  const hasChange = change.kind === 'behaviour'
    ? change.current_behaviour.trim() !== change.proposed_behaviour.trim()
    : change.current_value !== change.proposed_value;
  const candidatesForReview = hasChange ? result.candidates : [];
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
  $('report').hidden = false;
  $('status').textContent = !hasChange
    ? 'No change proposed. The proposal matches the current value or behaviour; no review candidates are needed.'
    : `${candidatesForReview.length} potential review ${candidatesForReview.length === 1 ? 'candidate' : 'candidates'} for ${change.entity.name.toLowerCase()}.`;
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
    const query = new URLSearchParams({entity: $('entity').value, proposed: String(proposed)});
    render(await request(`/api/analyze?${query}`));
  } catch (error) {
    $('status').textContent = '';
    $('error').textContent = error.message;
    $('error').hidden = false;
  } finally {
    setBusy(false);
  }
}

$('change-form').addEventListener('submit', (event) => { event.preventDefault(); runAnalysis(); });
$('change-kind').addEventListener('change', selectKind);
$('entity').addEventListener('change', selectEntity);
$('proposed-behaviour').addEventListener('input', () => clearReport('Proposed behaviour changed. Run the analysis to update the results.'));
$('proposed').addEventListener('input', () => clearReport('Proposed value changed. Run the analysis to update the results.'));

async function initialize() {
  try {
    const [graph, catalog] = await Promise.all([request('/api/model'), request('/api/scenarios')]);
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
