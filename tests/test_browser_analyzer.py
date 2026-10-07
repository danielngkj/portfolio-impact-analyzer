"""Compare the browser engine with the Python reference (Node or macOS JavaScriptCore)."""
import copy
import ctypes
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from impact_analyzer import DATA_PATH, analyze, supported_scenarios

ROOT = Path(__file__).resolve().parents[1]


class JavaScript:
    def __init__(self):
        self.node = shutil.which("node")
        if self.node:
            return
        if sys.platform != "darwin":
            raise RuntimeError("Install Node to run browser-engine parity tests.")
        self.lib = ctypes.CDLL("/System/Library/Frameworks/JavaScriptCore.framework/JavaScriptCore")
        declarations = {
            "JSGlobalContextCreate": (ctypes.c_void_p, [ctypes.c_void_p]),
            "JSGlobalContextRelease": (None, [ctypes.c_void_p]),
            "JSStringCreateWithUTF8CString": (ctypes.c_void_p, [ctypes.c_char_p]),
            "JSStringRelease": (None, [ctypes.c_void_p]),
            "JSEvaluateScript": (ctypes.c_void_p, [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int, ctypes.POINTER(ctypes.c_void_p)]),
            "JSValueToStringCopy": (ctypes.c_void_p, [ctypes.c_void_p, ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]),
            "JSStringGetMaximumUTF8CStringSize": (ctypes.c_size_t, [ctypes.c_void_p]),
            "JSStringGetUTF8CString": (ctypes.c_size_t, [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_size_t]),
        }
        for name, (result, arguments) in declarations.items():
            function = getattr(self.lib, name)
            function.restype, function.argtypes = result, arguments

    def evaluate(self, source):
        if self.node:
            output = subprocess.check_output([self.node, "-e", f"console.log(eval({json.dumps(source)}))"], text=True)
            return json.loads(output)
        context = self.lib.JSGlobalContextCreate(None)
        script = self.lib.JSStringCreateWithUTF8CString(source.encode())
        exception = ctypes.c_void_p()
        value = self.lib.JSEvaluateScript(context, script, None, None, 1, ctypes.byref(exception))
        string = self.lib.JSValueToStringCopy(context, exception.value or value, None)
        size = self.lib.JSStringGetMaximumUTF8CStringSize(string)
        buffer = ctypes.create_string_buffer(size)
        self.lib.JSStringGetUTF8CString(string, buffer, size)
        self.lib.JSStringRelease(string)
        self.lib.JSStringRelease(script)
        self.lib.JSGlobalContextRelease(context)
        if exception.value:
            raise AssertionError(buffer.value.decode())
        return json.loads(buffer.value.decode())


class BrowserAnalyzerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runtime = JavaScript()
        cls.engine = (ROOT / "web/analyzer.js").read_text()

    def setUp(self):
        self.graph = json.loads(DATA_PATH.read_text())

    def evaluate(self, expression, graph=None):
        graph = self.graph if graph is None else graph
        return self.runtime.evaluate(self.engine + "\nconst graph = " + json.dumps(graph) + ";\n" + expression)

    def assert_parity(self, graph):
        scenarios = supported_scenarios(graph)["scenarios"]
        cases = []
        for scenario in scenarios:
            values = [scenario["proposed"], scenario["current"]]
            values += ([scenario["current"] + 0.000001, scenario["proposed"] + 0.5]
                       if scenario["kind"] == "parameter" else
                       ["  " + scenario["current"] + "\n", "  Wait ten seconds before starting.  "])
            cases.extend([[scenario["entity_id"], value] for value in values])
        actual = self.evaluate("JSON.stringify(" + json.dumps(cases) + ".map(([id, value]) => ImpactAnalyzer.analyze(graph, id, value)))", graph)
        self.assertEqual(actual, [analyze(graph, entity, value) for entity, value in cases])
        self.assertTrue(self.evaluate("const before = JSON.stringify(graph); ImpactAnalyzer.analyze(graph, 'PARAM-001', 95); JSON.stringify(before === JSON.stringify(graph))", graph))

    def test_all_scenarios_custom_and_unchanged_proposals(self):
        self.assertEqual(self.evaluate("JSON.stringify(ImpactAnalyzer.supportedScenarios(graph))"), supported_scenarios(self.graph))
        self.assert_parity(self.graph)

    def test_duplicate_edges_and_shared_module_boundaries(self):
        self.graph["relationships"] *= 2
        self.graph["relationships"] += [
            {"source": "PARAM-002", "relationship": "configures", "target": "MOD-001"},
            {"source": "BEH-002", "relationship": "implementedBy", "target": "MOD-001"},
        ]
        self.assert_parity(self.graph)

    def test_invalid_proposals(self):
        cases = "[['missing',95],['MOD-001',95],['PARAM-001',NaN],['PARAM-001',Infinity],['PARAM-001',true],['PARAM-001','95'],['BEH-001',''],['BEH-001','   '],['BEH-001',5],['BEH-001',null]]"
        rejected = self.evaluate(f"JSON.stringify({cases}.map(([id,value]) => {{try {{ImpactAnalyzer.analyze(graph,id,value); return false;}} catch {{return true;}}}}))")
        self.assertTrue(all(rejected))

    def test_invalid_model_and_metadata(self):
        mutations = [
            lambda g: g["entities"].append(g["entities"][0]),
            lambda g: g["relationships"].append({"source": "missing", "relationship": "configures", "target": "MOD-001"}),
            lambda g: g["relationships"][0].update(relationship="unknown"),
            lambda g: g["relationships"][0].update(relationship="describes"),
        ]
        for entity, field, value in [
            ("PARAM-001", "value", True), ("PARAM-001", "proposed_value", None),
            ("PARAM-001", "unit", " "), ("BEH-001", "current_behaviour", " "),
            ("BEH-001", "proposed_behaviour", 5), ("BEH-001", "review_questions", []),
            ("BEH-001", "review_questions", {"missing": "Review?"}),
            ("BEH-001", "review_questions", {"PARAM-001": "Review?"}),
            ("BEH-001", "review_questions", {"TEST-001": " "}),
        ]:
            mutations.append(lambda g, entity=entity, field=field, value=value: next(e for e in g["entities"] if e["id"] == entity).update({field: value}))
        for mutate in mutations:
            graph = copy.deepcopy(self.graph)
            mutate(graph)
            self.assertTrue(self.evaluate("let rejected = false; try {ImpactAnalyzer.supportedScenarios(graph);} catch {rejected = true;} JSON.stringify(rejected)", graph))

    def test_browser_script_syntax_and_no_api_dependency(self):
        app = (ROOT / "web/app.js").read_text()
        self.assertNotIn("/api/", app)
        self.assertTrue(self.runtime.evaluate("new Function(" + json.dumps(app) + "); JSON.stringify(true)"))
        with tempfile.TemporaryDirectory() as output:
            subprocess.run(["sh", str(ROOT / "scripts/build-static.sh"), output], check=True, capture_output=True)
            site = Path(output)
            self.assertEqual((site / "data/coffee-machine.json").read_bytes(), DATA_PATH.read_bytes())
            self.assertEqual((site / "case-study.md").read_bytes(), (ROOT / "docs/portfolio-case-study.md").read_bytes())
            expected = {"index.html", "app.js", "analyzer.js", "style.css", "review-paths.svg", "case-study.md",
                        "case-study/index.html", "data/coffee-machine.json"}
            expected.update(f"icons/{path.name}" for path in (ROOT / "web/icons").glob("*.svg"))
            self.assertEqual({str(path.relative_to(site)) for path in site.rglob("*") if path.is_file()}, expected)
            index = (site / "index.html").read_text()
            self.assertLess(index.index('src="/analyzer.js"'), index.index('src="/app.js"'))


if __name__ == "__main__":
    unittest.main()
