/* Browser counterpart of impact_analyzer.py. Keep traversal and validation in parity. */
const ImpactAnalyzer = (() => {
  const relationships = {
    configures: ['Parameter', 'SoftwareModule'],
    implementedBy: ['Behaviour', 'SoftwareModule'],
    realizedBy: ['Requirement', 'Behaviour'],
    verifies: ['Test', 'Requirement'],
    describes: ['DocumentationTopic', 'Behaviour'],
    references: ['DocumentationTopic', 'Parameter']
  };
  const policy = {
    Parameter: [['configures', 'outgoing', 'configures'], ['references', 'incoming', 'is referenced by']],
    SoftwareModule: [['implementedBy', 'incoming', 'implements']],
    Behaviour: [['realizedBy', 'incoming', 'realizes'], ['describes', 'incoming', 'is described by']],
    Requirement: [['verifies', 'incoming', 'is verified by']]
  };
  const reviewQuestions = {
    Parameter: {
      SoftwareModule: 'Does this implementation support the proposed target and its operating limits?',
      Behaviour: 'Does regulation still meet its expected performance at the proposed target?',
      Requirement: 'Does the requirement remain valid for the proposed target?',
      Test: 'Do test fixtures and assertions cover the proposed target?',
      DocumentationTopic: 'Does this topic state a value or describe operation that needs updating?'
    },
    Behaviour: {
      SoftwareModule: 'What implementation changes are needed for the proposed behaviour?',
      Requirement: 'Does this requirement capture the proposed behaviour and acceptance criteria?',
      Test: 'Which assertions and edge cases need updating to verify the proposed behaviour?',
      DocumentationTopic: 'Which descriptions need updating to explain the proposed behaviour?'
    }
  };
  const nonemptyText = (value) => typeof value === 'string' && Boolean(value.trim());

  function validateGraph(graph) {
    if (!graph || !Array.isArray(graph.entities) || !Array.isArray(graph.relationships)) {
      throw new Error('The model must contain entities and relationships.');
    }
    const entities = new Map();
    const validTypes = new Set(Object.values(relationships).flat());
    for (const entity of graph.entities) {
      if (!entity || !nonemptyText(entity.id)) throw new Error('Missing entity ID');
      if (entities.has(entity.id)) throw new Error(`Duplicate entity ID: ${entity.id}`);
      if (!validTypes.has(entity.type)) throw new Error(`Unknown entity type: ${entity.type}`);
      if (!nonemptyText(entity.name)) throw new Error(`Missing name: ${entity.id}`);
      entities.set(entity.id, entity);
    }
    for (const edge of graph.relationships) {
      if (!edge || !entities.has(edge.source) || !entities.has(edge.target)) {
        throw new Error(`Unknown relationship endpoint: ${JSON.stringify(edge)}`);
      }
      const expected = Object.hasOwn(relationships, edge.relationship) ? relationships[edge.relationship] : null;
      if (!expected || expected[0] !== entities.get(edge.source).type || expected[1] !== entities.get(edge.target).type) {
        throw new Error(`Invalid relationship or type combination: ${JSON.stringify(edge)}`);
      }
    }
    for (const entity of entities.values()) {
      if (!nonemptyText(entity.detail)) throw new Error(`Missing detail: ${entity.id}`);
      if (entity.type === 'Parameter') {
        if (![entity.value, entity.proposed_value].every(Number.isFinite)) {
          throw new Error(`Current and proposed values must be finite numbers: ${entity.id}`);
        }
        if (!nonemptyText(entity.unit)) throw new Error(`Missing parameter unit: ${entity.id}`);
      }
      if (entity.type === 'Behaviour') {
        for (const field of ['current_behaviour', 'proposed_behaviour']) {
          if (!nonemptyText(entity[field])) throw new Error(`Missing or empty ${field}: ${entity.id}`);
        }
      }
      if (Object.hasOwn(entity, 'review_questions')) {
        const questions = entity.review_questions;
        if (!Object.hasOwn(reviewQuestions, entity.type) || !questions || typeof questions !== 'object' || Array.isArray(questions)) {
          throw new Error(`Invalid review questions: ${entity.id}`);
        }
        for (const [target, question] of Object.entries(questions)) {
          if (!entities.has(target) || target === entity.id || !Object.hasOwn(reviewQuestions[entity.type], entities.get(target).type)) {
            throw new Error(`Invalid review-question reference: ${entity.id} → ${target}`);
          }
          if (!nonemptyText(question)) throw new Error(`Empty review question: ${entity.id} → ${target}`);
        }
      }
    }
    return entities;
  }

  function supportedScenarios(graph) {
    const scenarios = [];
    for (const entity of validateGraph(graph).values()) {
      if (entity.type === 'Parameter') {
        scenarios.push({entity_id: entity.id, kind: 'parameter', current: entity.value, proposed: entity.proposed_value, unit: entity.unit});
      } else if (entity.type === 'Behaviour') {
        scenarios.push({entity_id: entity.id, kind: 'behaviour', current: entity.current_behaviour, proposed: entity.proposed_behaviour});
      }
    }
    return {scenarios};
  }

  function analyze(graph, entityId, proposed) {
    const entities = validateGraph(graph);
    if (!entities.has(entityId)) throw new Error(`Unknown entity ID: ${entityId}`);
    const changed = entities.get(entityId);
    let change;
    if (changed.type === 'Parameter') {
      if (!Number.isFinite(proposed)) throw new Error('Proposed value must be a finite number');
      change = {kind: 'parameter', entity: changed, current_value: changed.value, proposed_value: proposed, unit: changed.unit};
      change.has_change = changed.value !== proposed;
    } else if (changed.type === 'Behaviour') {
      if (!nonemptyText(proposed)) throw new Error('Proposed behaviour must be a non-empty description');
      change = {kind: 'behaviour', entity: changed, current_behaviour: changed.current_behaviour, proposed_behaviour: proposed.trim()};
      change.has_change = changed.current_behaviour.trim() !== change.proposed_behaviour;
    } else {
      throw new Error('This scenario starts with a Parameter or Behaviour');
    }
    const candidates = [];
    if (!change.has_change) return {change, candidates};
    const visited = new Set([entityId]);
    const queue = [[entityId, []]];
    const proposal = change.kind === 'behaviour' ? change.proposed_behaviour : proposed;
    const storedProposal = changed.type === 'Behaviour' ? changed.proposed_behaviour : changed.proposed_value;
    const questions = proposal === storedProposal ? (changed.review_questions || {}) : {};
    for (let index = 0; index < queue.length; index++) {
      const [current, path] = queue[index];
      let steps = policy[entities.get(current).type] || [];
      // Changed behaviours reach their implementation, but shared modules are terminal.
      if (changed.type === 'Behaviour') {
        if (current === entityId) steps = [['implementedBy', 'outgoing', 'is implemented by'], ...steps];
        else if (entities.get(current).type === 'SoftwareModule') steps = [];
      }
      for (const [relationship, direction, label] of steps) {
        const [start, end] = direction === 'outgoing' ? ['source', 'target'] : ['target', 'source'];
        for (const edge of graph.relationships) {
          if (edge.relationship !== relationship || edge[start] !== current || visited.has(edge[end])) continue;
          const neighbor = edge[end];
          visited.add(neighbor);
          const nextPath = [...path, {from: current, to: neighbor, relationship, direction, label, stored_edge: {...edge}}];
          candidates.push({entity: entities.get(neighbor), path: nextPath,
            review_question: questions[neighbor] || reviewQuestions[changed.type][entities.get(neighbor).type] || 'What needs review for the proposed change?'});
          queue.push([neighbor, nextPath]);
        }
      }
    }
    return {change, candidates};
  }
  return {validateGraph, supportedScenarios, analyze};
})();
