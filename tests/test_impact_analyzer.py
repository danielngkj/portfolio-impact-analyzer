import copy
import json
import unittest

from impact_analyzer import DATA_PATH, analyze, validate_graph


class ImpactTests(unittest.TestCase):
    def setUp(self):
        self.graph = json.loads(DATA_PATH.read_text())

    def test_exact_candidates_and_explanations(self):
        result = analyze(self.graph, "PARAM-001", 95)
        candidates = {item["entity"]["id"]: item for item in result["candidates"]}
        self.assertEqual(set(candidates), {"MOD-001", "BEH-001", "REQ-001", "TEST-001", "DOC-001", "DOC-002"})
        self.assertEqual(result["change"]["current_value"], 93)
        self.assertEqual(result["change"]["proposed_value"], 95)
        self.assertEqual([step["direction"] for step in candidates["TEST-001"]["path"]],
                         ["outgoing", "incoming", "incoming", "incoming"])
        self.assertEqual(len(candidates["DOC-002"]["path"]), 1)
        self.assertEqual(len(candidates["DOC-001"]["path"]), 3)
        for entity_id, candidate in candidates.items():
            current = "PARAM-001"
            for step in candidate["path"]:
                self.assertEqual(step["from"], current)
                self.assertIn(step["stored_edge"], self.graph["relationships"])
                edge = step["stored_edge"]
                expected = (edge["source"], edge["target"]) if step["direction"] == "outgoing" else (edge["target"], edge["source"])
                self.assertEqual((step["from"], step["to"]), expected)
                current = step["to"]
            self.assertEqual(current, entity_id)

    def test_change_context_does_not_mutate_graph_or_determine_candidates(self):
        original = copy.deepcopy(self.graph)
        self.assertEqual(analyze(self.graph, "PARAM-001", 95)["candidates"],
                         analyze(self.graph, "PARAM-001", 94)["candidates"])
        self.assertEqual(self.graph, original)

    def test_steam_branch_is_independent(self):
        result = analyze(self.graph, "PARAM-002", 126)
        self.assertEqual([item["entity"]["id"] for item in result["candidates"]], ["DOC-003"])

    def test_shared_module_does_not_pull_in_other_parameters(self):
        self.graph["relationships"].append({"source": "PARAM-002", "relationship": "configures", "target": "MOD-001"})
        ids = {item["entity"]["id"] for item in analyze(self.graph, "PARAM-001", 95)["candidates"]}
        self.assertNotIn("PARAM-002", ids)
        self.assertNotIn("DOC-003", ids)

    def test_duplicate_edges_do_not_duplicate_candidates(self):
        self.graph["relationships"] *= 2
        self.assertEqual(len(analyze(self.graph, "PARAM-001", 95)["candidates"]), 6)

    def test_invalid_input(self):
        for entity_id, value in [("missing", 95), ("MOD-001", 95), ("PARAM-001", float("nan")), ("PARAM-001", float("inf"))]:
            with self.subTest(entity=entity_id, value=value), self.assertRaises(ValueError):
                analyze(self.graph, entity_id, value)

    def test_invalid_graph(self):
        for edge in [{"source": "missing", "relationship": "configures", "target": "MOD-001"},
                     {"source": "DOC-001", "relationship": "configures", "target": "MOD-001"},
                     {"source": "PARAM-001", "relationship": "unknown", "target": "MOD-001"}]:
            graph = copy.deepcopy(self.graph)
            graph["relationships"].append(edge)
            with self.subTest(edge=edge), self.assertRaises(ValueError):
                validate_graph(graph)
        self.graph["entities"].append(self.graph["entities"][0])
        with self.assertRaises(ValueError):
            validate_graph(self.graph)


if __name__ == "__main__":
    unittest.main()
