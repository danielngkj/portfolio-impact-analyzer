"""Deterministic review traversal for the synthetic coffee-machine model."""

import argparse
import json
import math
from collections import deque
from pathlib import Path

DATA_PATH = Path(__file__).parent / "data" / "coffee-machine.json"
RELATIONSHIPS = {
    "configures": ("Parameter", "SoftwareModule"),
    "implementedBy": ("Behaviour", "SoftwareModule"),
    "realizedBy": ("Requirement", "Behaviour"),
    "verifies": ("Test", "Requirement"),
    "describes": ("DocumentationTopic", "Behaviour"),
    "references": ("DocumentationTopic", "Parameter"),
}
# Stored semantics and review policy are deliberately separate.
POLICY = {
    "Parameter": [("configures", "outgoing", "configures"),
                  ("references", "incoming", "is referenced by")],
    "SoftwareModule": [("implementedBy", "incoming", "implements")],
    "Behaviour": [("realizedBy", "incoming", "realizes"),
                  ("describes", "incoming", "is described by")],
    "Requirement": [("verifies", "incoming", "is verified by")],
}


REVIEW_QUESTIONS = {
    "Parameter": {
        "SoftwareModule": "Does this implementation support the proposed target and its operating limits?",
        "Behaviour": "Does regulation still meet its expected performance at the proposed target?",
        "Requirement": "Does the requirement remain valid for the proposed target?",
        "Test": "Do test fixtures and assertions cover the proposed target?",
        "DocumentationTopic": "Does this topic state a value or describe operation that needs updating?",
    },
    "Behaviour": {
        "SoftwareModule": "What implementation changes are needed for the proposed behaviour?",
        "Requirement": "Does this requirement capture the proposed behaviour and acceptance criteria?",
        "Test": "Which assertions and edge cases need updating to verify the proposed behaviour?",
        "DocumentationTopic": "Which descriptions need updating to explain the proposed behaviour?",
    },
}


def finite_number(value):
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value)


def nonempty_text(value):
    return isinstance(value, str) and bool(value.strip())


def validate_graph(graph):
    entities = {}
    valid_types = {kind for pair in RELATIONSHIPS.values() for kind in pair}
    for entity in graph["entities"]:
        if entity["id"] in entities:
            raise ValueError(f"Duplicate entity ID: {entity['id']}")
        if entity["type"] not in valid_types:
            raise ValueError(f"Unknown entity type: {entity['type']}")
        if not entity.get("name"):
            raise ValueError(f"Missing name: {entity['id']}")
        entities[entity["id"]] = entity
    for edge in graph["relationships"]:
        source, target = edge["source"], edge["target"]
        if source not in entities or target not in entities:
            raise ValueError(f"Unknown relationship endpoint: {edge}")
        expected = RELATIONSHIPS.get(edge["relationship"])
        actual = (entities[source]["type"], entities[target]["type"])
        if expected != actual:
            raise ValueError(f"Invalid relationship or type combination: {edge}")
    for entity in entities.values():
        kind = entity["type"]
        if not nonempty_text(entity.get("detail")):
            raise ValueError(f"Missing detail: {entity['id']}")
        if kind == "Parameter":
            if not all(finite_number(entity.get(field)) for field in ("value", "proposed_value")):
                raise ValueError(f"Current and proposed values must be finite numbers: {entity['id']}")
            if not nonempty_text(entity.get("unit")):
                raise ValueError(f"Missing parameter unit: {entity['id']}")
        if kind == "Behaviour":
            for field in ("current_behaviour", "proposed_behaviour"):
                if not nonempty_text(entity.get(field)):
                    raise ValueError(f"Missing or empty {field}: {entity['id']}")
        if "review_questions" in entity:
            questions = entity["review_questions"]
            if kind not in REVIEW_QUESTIONS or not isinstance(questions, dict):
                raise ValueError(f"Invalid review questions: {entity['id']}")
            for target, question in questions.items():
                if target not in entities or target == entity["id"] or entities[target]["type"] not in REVIEW_QUESTIONS[kind]:
                    raise ValueError(f"Invalid review-question reference: {entity['id']} → {target}")
                if not nonempty_text(question):
                    raise ValueError(f"Empty review question: {entity['id']} → {target}")
    return entities


def supported_scenarios(graph):
    """Expose validated suggestions without changing the graph."""
    entities = validate_graph(graph)
    scenarios = []
    for entity in entities.values():
        if entity["type"] == "Parameter":
            scenarios.append({"entity_id": entity["id"], "kind": "parameter",
                              "current": entity["value"], "proposed": entity["proposed_value"], "unit": entity["unit"]})
        elif entity["type"] == "Behaviour":
            scenarios.append({"entity_id": entity["id"], "kind": "behaviour",
                              "current": entity["current_behaviour"], "proposed": entity["proposed_behaviour"]})
    return {"scenarios": scenarios}


def analyze(graph, entity_id, proposed_value):
    """Return one deterministic shortest explanation path per review candidate."""
    entities = validate_graph(graph)
    if entity_id not in entities:
        raise ValueError(f"Unknown entity ID: {entity_id}")
    changed = entities[entity_id]
    if changed["type"] == "Parameter":
        if not finite_number(proposed_value):
            raise ValueError("Proposed value must be a finite number")
        change = {"kind": "parameter", "entity": changed, "current_value": changed["value"],
                  "proposed_value": proposed_value, "unit": changed["unit"]}
    elif changed["type"] == "Behaviour":
        if not nonempty_text(proposed_value):
            raise ValueError("Proposed behaviour must be a non-empty description")
        change = {"kind": "behaviour", "entity": changed,
                  "current_behaviour": changed.get("current_behaviour", changed["detail"]),
                  "proposed_behaviour": proposed_value.strip()}
    else:
        raise ValueError("This scenario starts with a Parameter or Behaviour")
    change["has_change"] = (change["current_value"] != change["proposed_value"]
                            if change["kind"] == "parameter" else
                            change["current_behaviour"].strip() != change["proposed_behaviour"])
    if not change["has_change"]:
        return {"change": change, "candidates": []}
    visited = {entity_id}
    queue = deque([(entity_id, [])])
    candidates = []
    while queue:
        current, path = queue.popleft()
        steps = POLICY.get(entities[current]["type"], [])
        # A changed behaviour reaches its implementation directly. Do not fan out
        # through that shared module into unrelated behaviours.
        if changed["type"] == "Behaviour":
            if current == entity_id:
                steps = [("implementedBy", "outgoing", "is implemented by")] + steps
            elif entities[current]["type"] == "SoftwareModule":
                steps = []
        for relationship, direction, label in steps:
            start, end = ("source", "target") if direction == "outgoing" else ("target", "source")
            for edge in graph["relationships"]:
                if edge["relationship"] != relationship or edge[start] != current:
                    continue
                neighbor = edge[end]
                if neighbor in visited:
                    continue
                visited.add(neighbor)
                step = {"from": current, "to": neighbor, "relationship": relationship,
                        "direction": direction, "label": label, "stored_edge": dict(edge)}
                next_path = path + [step]
                candidate = {"entity": entities[neighbor], "path": next_path}
                proposal = change.get("proposed_behaviour", proposed_value)
                stored_proposal = changed.get("proposed_behaviour") if changed["type"] == "Behaviour" else changed["proposed_value"]
                questions = changed.get("review_questions", {}) if proposal == stored_proposal else {}
                candidate["review_question"] = questions.get(neighbor, REVIEW_QUESTIONS[changed["type"]].get(
                    entities[neighbor]["type"], "What needs review for the proposed change?"))
                candidates.append(candidate)
                queue.append((neighbor, next_path))
    return {"change": change, "candidates": candidates}


def format_report(graph, result):
    entities = {entity["id"]: entity for entity in graph["entities"]}
    change = result["change"]
    lines = [f"Change: {change['entity']['name']} ({change['entity']['id']})",
             (f"Current: {change['current_behaviour']}\nProposed: {change['proposed_behaviour']}"
              if change['kind'] == 'behaviour' else
              f"{change['current_value']} → {change['proposed_value']:g} {change['unit']}"),
             f"Potential review candidates: {len(result['candidates'])}",
             "Connections identify review candidates; they do not predict physical outcomes."]
    if not change["has_change"]:
        lines.append("No change proposed. The proposal matches the current value or behaviour; no review candidates are needed.")
        return "\n".join(lines)
    for heading, documentation in [("Engineering review", False), ("Documentation review", True)]:
        lines.extend(["", heading])
        for candidate in result["candidates"]:
            entity = candidate["entity"]
            if (entity["type"] == "DocumentationTopic") != documentation:
                continue
            lines.append(f"- {entity['id']}: {entity['name']} [{entity['type']}]")
            lines.append(f"  {entity['detail']}")
            if "review_question" in candidate:
                lines.append(f"  Review question: {candidate['review_question']}")
            explanation = change["entity"]["name"]
            for step in candidate["path"]:
                explanation += f" → {step['label']} → {entities[step['to']]['name']}"
            lines.append(f"  Why review: {explanation}")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--entity", default="PARAM-001")
    parser.add_argument("--proposed", default=None)
    parser.add_argument("--data", type=Path, default=DATA_PATH)
    parser.add_argument("--json", action="store_true", help="Include stored edges and traversal directions")
    args = parser.parse_args()
    try:
        graph = json.loads(args.data.read_text())
        entities = validate_graph(graph)
        changed = entities.get(args.entity, {})
        proposed = args.proposed
        if changed.get("type") == "Behaviour":
            proposed = proposed if proposed is not None else changed.get("proposed_behaviour", "")
        else:
            proposed = float(proposed) if proposed is not None else changed.get("proposed_value")
        result = analyze(graph, args.entity, proposed)
        print(json.dumps(result, indent=2, ensure_ascii=False) if args.json else format_report(graph, result))
    except (ValueError, KeyError, TypeError, OSError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
