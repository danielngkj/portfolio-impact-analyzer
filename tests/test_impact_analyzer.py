import copy
import json
import unittest

from impact_analyzer import DATA_PATH, analyze, format_report, supported_scenarios, validate_graph


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

    def test_pressure_candidates_and_explanation_evidence(self):
        original = copy.deepcopy(self.graph)
        result = analyze(self.graph, "PARAM-003", 10)
        candidates = {item["entity"]["id"]: item for item in result["candidates"]}
        self.assertEqual(set(candidates), {"MOD-002", "BEH-002", "REQ-002", "TEST-002", "DOC-001", "DOC-004"})
        self.assertEqual(result["change"]["current_value"], 9)
        self.assertEqual(result["change"]["proposed_value"], 10)
        self.assertEqual(result["change"]["unit"], "bar")
        self.assertEqual([step["to"] for step in candidates["TEST-002"]["path"]],
                         ["MOD-002", "BEH-002", "REQ-002", "TEST-002"])
        self.assertEqual(len(candidates["DOC-004"]["path"]), 1)
        for entity_id, candidate in candidates.items():
            current = "PARAM-003"
            for step in candidate["path"]:
                self.assertEqual(step["from"], current)
                edge = step["stored_edge"]
                self.assertIn(edge, self.graph["relationships"])
                expected = (edge["source"], edge["target"]) if step["direction"] == "outgoing" else (edge["target"], edge["source"])
                self.assertEqual((step["from"], step["to"]), expected)
                current = step["to"]
            self.assertEqual(current, entity_id)
        self.assertEqual(result["candidates"], analyze(self.graph, "PARAM-003", 9.5)["candidates"])
        self.assertEqual(self.graph, original)

    def test_shared_document_does_not_bridge_engineering_branches(self):
        reports = [analyze(self.graph, entity, proposed) for entity, proposed in
                   [("PARAM-001", 95), ("PARAM-003", 10)]]
        candidate_maps = [{item["entity"]["id"]: item for item in report["candidates"]}
                          for report in reports]
        self.assertEqual(set(candidate_maps[0]) & set(candidate_maps[1]), {"DOC-001"})
        for candidates, behaviour in zip(candidate_maps, ["BEH-001", "BEH-002"]):
            path = candidates["DOC-001"]["path"]
            self.assertEqual(len(path), 3)
            self.assertEqual(path[-1]["stored_edge"],
                             {"source": "DOC-001", "relationship": "describes", "target": behaviour})
            self.assertEqual(path[-1]["direction"], "incoming")
            self.assertFalse(any(item["entity"]["type"] == "Parameter" for item in candidates.values()))

    def test_shared_module_does_not_pull_in_other_parameters(self):
        self.graph["relationships"].append({"source": "PARAM-002", "relationship": "configures", "target": "MOD-001"})
        ids = {item["entity"]["id"] for item in analyze(self.graph, "PARAM-001", 95)["candidates"]}
        self.assertNotIn("PARAM-002", ids)
        self.assertNotIn("DOC-003", ids)

    def test_duplicate_edges_do_not_duplicate_candidates(self):
        self.graph["relationships"] *= 2
        self.assertEqual(len(analyze(self.graph, "PARAM-001", 95)["candidates"]), 6)

    def test_behaviour_change_paths_questions_and_boundaries(self):
        original = copy.deepcopy(self.graph)
        behaviour = next(e for e in self.graph["entities"] if e["id"] == "BEH-001")
        result = analyze(self.graph, "BEH-001", behaviour["proposed_behaviour"])
        candidates = {c["entity"]["id"]: c for c in result["candidates"]}
        self.assertEqual(set(candidates), {"MOD-001", "REQ-001", "TEST-001", "DOC-001"})
        self.assertEqual(result["change"]["current_behaviour"], behaviour["current_behaviour"])
        self.assertEqual(result["change"]["proposed_behaviour"], behaviour["proposed_behaviour"])
        self.assertEqual(candidates["MOD-001"]["path"][0]["direction"], "outgoing")
        self.assertEqual([s["to"] for s in candidates["TEST-001"]["path"]], ["REQ-001", "TEST-001"])
        for candidate in candidates.values():
            self.assertTrue(candidate["review_question"])
            for step in candidate["path"]:
                self.assertIn(step["stored_edge"], self.graph["relationships"])
        self.assertEqual(self.graph, original)
        self.graph["relationships"].append({"source": "BEH-002", "relationship": "implementedBy", "target": "MOD-001"})
        self.assertEqual({c["entity"]["id"] for c in analyze(self.graph, "BEH-001", behaviour["proposed_behaviour"])["candidates"]}, set(candidates))

    def test_custom_behaviour_context_and_validation(self):
        result = analyze(self.graph, "BEH-001", "  Wait ten seconds before brewing.  ")
        self.assertEqual(result["change"]["proposed_behaviour"], "Wait ten seconds before brewing.")
        self.assertTrue(all("five" not in c["review_question"] for c in result["candidates"]))
        for proposed in ["", "   ", 5, None, True]:
            with self.subTest(proposed=proposed), self.assertRaises(ValueError):
                analyze(self.graph, "BEH-001", proposed)

    def test_scenarios_supply_valid_proposals_and_consistent_questions(self):
        original = copy.deepcopy(self.graph)
        scenarios = supported_scenarios(self.graph)["scenarios"]
        self.assertEqual({s["entity_id"] for s in scenarios}, {"PARAM-001", "PARAM-002", "PARAM-003", "BEH-001", "BEH-002"})
        for scenario in scenarios:
            result = analyze(self.graph, scenario["entity_id"], scenario["proposed"])
            report = format_report(self.graph, result)
            for candidate in result["candidates"]:
                self.assertTrue(candidate["review_question"])
                self.assertIn(candidate["review_question"], report)
        self.assertEqual(self.graph, original)

    def test_invalid_scenario_metadata(self):
        changes = [
            ("PARAM-001", "proposed_value", None),
            ("PARAM-001", "value", True),
            ("PARAM-001", "proposed_value", float("inf")),
            ("PARAM-001", "unit", " "),
            ("BEH-001", "current_behaviour", " "),
            ("BEH-001", "proposed_behaviour", 5),
            ("BEH-001", "review_questions", []),
            ("BEH-001", "review_questions", {"missing": "Review?"}),
            ("BEH-001", "review_questions", {"PARAM-001": "Review?"}),
            ("BEH-001", "review_questions", {"TEST-001": " "}),
        ]
        for entity_id, field, value in changes:
            graph = copy.deepcopy(self.graph)
            next(e for e in graph["entities"] if e["id"] == entity_id)[field] = value
            with self.subTest(entity=entity_id, field=field, value=value), self.assertRaises(ValueError):
                supported_scenarios(graph)

    def test_unchanged_proposals_have_no_candidates(self):
        original = copy.deepcopy(self.graph)
        for scenario in supported_scenarios(self.graph)["scenarios"]:
            values = [scenario["current"]]
            if scenario["kind"] == "behaviour":
                values.append("  " + scenario["current"] + "\n")
            else:
                values.append(float(scenario["current"]))
            for proposed in values:
                result = analyze(self.graph, scenario["entity_id"], proposed)
                self.assertFalse(result["change"]["has_change"])
                self.assertEqual(result["candidates"], [])
                self.assertIn("No change proposed", format_report(self.graph, result))
            changed = analyze(self.graph, scenario["entity_id"], scenario["proposed"])
            self.assertTrue(changed["change"]["has_change"])
            self.assertTrue(changed["candidates"])
        self.assertEqual(self.graph, original)
        self.assertTrue(analyze(self.graph, "PARAM-001", 93.000001)["change"]["has_change"])

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
