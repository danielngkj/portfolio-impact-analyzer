const $ = (id) => document.getElementById(id);
let model;
let entities;
let busy = false;
const typeLabels = {SoftwareModule: 'Software module', Behaviour: 'Behaviour', Requirement: 'Requirement', Test: 'Test', DocumentationTopic: 'Documentation topic'};

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function request(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The analysis could not be completed.');
  return data;
}

function setBusy(value) {
  busy = value;
  for (const id of ['entity', 'proposed', 'analyze']) $(id).disabled = value;
  document.querySelector('.results').setAttribute('aria-busy', String(value));
}

function clearReport(message) {
  $('report').hidden = true;
  $('error').hidden = true;
  $('status').textContent = message;
}

function selectParameter() {
  const entity = entities[$('entity').value];
  $('parameter-detail').textContent = entity.detail;
  $('current-value').textContent = `${entity.value} ${entity.unit}`;
  $('unit').textContent = `(${entity.unit})`;
  $('proposed').value = entity.value + (entity.id === 'PARAM-001' ? 2 : 1);
  clearReport('Ready to analyze this proposed change.');
}

function candidateCard(candidate, change) {
  const item = candidate.entity;
  const card = element('article', undefined, 'candidate');
  card.append(element('p', `${item.id} / ${typeLabels[item.type] || item.type}`, 'meta'), element('h4', item.name), element('p', item.detail));
  const details = element('details');
  details.append(element('summary', `Why review this? · ${candidate.path.length} ${candidate.path.length === 1 ? 'connection' : 'connections'}`));
  details.append(element('p', `${change.entity.name} (${change.entity.id})`, 'path-start'));
  const path = element('ol', undefined, 'path');
  for (const step of candidate.path) {
    const target = entities[step.to];
    const row = element('li', `${step.label} → ${target.name}`);
    row.append(element('small', `${step.direction} traversal · ${step.stored_edge.source} — ${step.relationship} → ${step.stored_edge.target}`));
    path.append(row);
  }
  details.append(path);
  card.append(details);
  return card;
}

function render(result) {
  const change = result.change;
  const engineering = result.candidates.filter((item) => item.entity.type !== 'DocumentationTopic');
  const documentation = result.candidates.filter((item) => item.entity.type === 'DocumentationTopic');
  $('change-title').textContent = change.entity.name;
  $('change-values').textContent = `${change.current_value} → ${change.proposed_value} ${change.unit}`;
  $('counts').replaceChildren();
  for (const [number, label] of [[result.candidates.length, 'Review candidates'], [engineering.length, 'Engineering artifacts'], [documentation.length, 'Documentation topics']]) {
    const count = element('div', undefined, 'count');
    count.append(element('strong', number), element('span', label));
    $('counts').append(count);
  }
  for (const [id, candidates] of [['engineering', engineering], ['documentation', documentation]]) {
    $(id).replaceChildren(...candidates.map((item) => candidateCard(item, change)));
    if (!candidates.length) $(id).append(element('p', 'No candidates connected by the current review policy.', 'empty'));
    $(`${id}-count`).textContent = `${candidates.length} ${candidates.length === 1 ? 'candidate' : 'candidates'}`;
  }
  $('report').hidden = false;
  $('status').textContent = `${result.candidates.length} potential review ${result.candidates.length === 1 ? 'candidate' : 'candidates'} for ${change.entity.name.toLowerCase()}.`;
}

async function runAnalysis() {
  if (busy || !$('change-form').reportValidity()) return;
  const proposed = Number($('proposed').value);
  if (!Number.isFinite(proposed)) {
    clearReport('');
    $('error').textContent = 'Enter a finite numeric value.';
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
$('entity').addEventListener('change', selectParameter);
$('proposed').addEventListener('input', () => clearReport('Proposed value changed. Run the analysis to update the results.'));

async function initialize() {
  try {
    model = await request('/api/model');
    entities = Object.fromEntries(model.entities.map((item) => [item.id, item]));
    for (const item of model.entities.filter((item) => item.type === 'Parameter')) {
      const option = element('option', item.name);
      option.value = item.id;
      $('entity').append(option);
    }
    selectParameter();
    setBusy(false);
    await runAnalysis();
  } catch (error) {
    $('status').textContent = '';
    $('error').textContent = `Unable to load the model. ${error.message} Reload this page to try again.`;
    $('error').hidden = false;
    document.querySelector('.results').setAttribute('aria-busy', 'false');
  }
}
initialize();
