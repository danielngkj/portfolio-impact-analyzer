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
    return entities


def analyze(graph, entity_id, proposed_value):
    """Return one deterministic shortest explanation path per review candidate."""
    entities = validate_graph(graph)
    if entity_id not in entities:
        raise ValueError(f"Unknown entity ID: {entity_id}")
    changed = entities[entity_id]
    if changed["type"] != "Parameter":
        raise ValueError("This scenario starts with a Parameter")
    if isinstance(proposed_value, bool) or not isinstance(proposed_value, (int, float)) or not math.isfinite(proposed_value):
        raise ValueError("Proposed value must be a finite number")
    visited = {entity_id}
    queue = deque([(entity_id, [])])
    candidates = []
    while queue:
        current, path = queue.popleft()
        for relationship, direction, label in POLICY.get(entities[current]["type"], []):
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
                candidates.append({"entity": entities[neighbor], "path": next_path})
                queue.append((neighbor, next_path))
    return {"change": {"entity": changed, "current_value": changed["value"],
                       "proposed_value": proposed_value, "unit": changed["unit"]},
            "candidates": candidates}


def format_report(graph, result):
    entities = {entity["id"]: entity for entity in graph["entities"]}
    change = result["change"]
    lines = [f"Change: {change['entity']['name']} ({change['entity']['id']})",
             f"{change['current_value']} → {change['proposed_value']:g} {change['unit']}",
             f"Potential review candidates: {len(result['candidates'])}",
             "Connections identify review candidates; they do not predict physical outcomes."]
    for heading, documentation in [("Engineering review", False), ("Documentation review", True)]:
        lines.extend(["", heading])
        for candidate in result["candidates"]:
            entity = candidate["entity"]
            if (entity["type"] == "DocumentationTopic") != documentation:
                continue
            lines.append(f"- {entity['id']}: {entity['name']} [{entity['type']}]")
            lines.append(f"  {entity['detail']}")
            explanation = change["entity"]["name"]
            for step in candidate["path"]:
                explanation += f" → {step['label']} → {entities[step['to']]['name']}"
            lines.append(f"  Why review: {explanation}")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--entity", default="PARAM-001")
    parser.add_argument("--proposed", type=float, default=95)
    parser.add_argument("--data", type=Path, default=DATA_PATH)
    parser.add_argument("--json", action="store_true", help="Include stored edges and traversal directions")
    args = parser.parse_args()
    try:
        graph = json.loads(args.data.read_text())
        result = analyze(graph, args.entity, args.proposed)
        print(json.dumps(result, indent=2, ensure_ascii=False) if args.json else format_report(graph, result))
    except (ValueError, KeyError, TypeError, OSError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
