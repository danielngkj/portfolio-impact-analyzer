import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import urlopen
from urllib.parse import urlencode

from impact_analyzer import DATA_PATH, analyze, supported_scenarios
from web_server import Handler


class QuietHandler(Handler):
    def log_message(self, *args):
        pass


class WebTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def get(self, path):
        try:
            response = urlopen(self.base + path, timeout=3)
        except HTTPError as error:
            response = error
        with response:
            return response.status, response.headers, response.read()

    def test_api_matches_engine_and_preserves_dataset(self):
        original = DATA_PATH.read_bytes()
        graph = json.loads(original)
        for entity, proposed in [("PARAM-001", 95), ("PARAM-002", 126), ("PARAM-003", 10), ("PARAM-001", 94.5)]:
            with self.subTest(entity=entity, proposed=proposed):
                status, headers, body = self.get(f"/api/analyze?entity={entity}&proposed={proposed}")
                self.assertEqual(status, 200)
                self.assertEqual(json.loads(body), analyze(graph, entity, proposed))
                self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertEqual(DATA_PATH.read_bytes(), original)

    def test_behaviour_api_matches_engine(self):
        graph = json.loads(DATA_PATH.read_text())
        behaviour = next(e for e in graph["entities"] if e["id"] == "BEH-001")
        for proposed in [behaviour["proposed_behaviour"], "Wait ten seconds before brewing."]:
            query = urlencode({"entity": "BEH-001", "proposed": proposed})
            status, _, body = self.get("/api/analyze?" + query)
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body), analyze(graph, "BEH-001", proposed))
        for proposed in ["", "   "]:
            status, _, body = self.get("/api/analyze?" + urlencode({"entity": "BEH-001", "proposed": proposed}))
            self.assertEqual(status, 400)
            self.assertTrue(json.loads(body)["error"])

    def test_scenario_catalog_and_proposals(self):
        graph = json.loads(DATA_PATH.read_text())
        status, _, body = self.get("/api/scenarios")
        self.assertEqual(status, 200)
        catalog = json.loads(body)
        self.assertEqual(catalog, supported_scenarios(graph))
        for scenario in catalog["scenarios"]:
            query = urlencode({"entity": scenario["entity_id"], "proposed": scenario["proposed"]})
            status, _, body = self.get("/api/analyze?" + query)
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body), analyze(graph, scenario["entity_id"], scenario["proposed"]))

    def test_unchanged_proposals_return_no_candidates(self):
        graph = json.loads(DATA_PATH.read_text())
        for scenario in supported_scenarios(graph)["scenarios"]:
            query = urlencode({"entity": scenario["entity_id"], "proposed": scenario["current"]})
            status, _, body = self.get("/api/analyze?" + query)
            self.assertEqual(status, 200)
            result = json.loads(body)
            self.assertFalse(result["change"]["has_change"])
            self.assertEqual(result["candidates"], [])

    def test_invalid_requests_return_json_errors(self):
        for query in ["", "entity=missing&proposed=95", "entity=MOD-001&proposed=95",
                      "entity=PARAM-001&proposed=nan", "entity=PARAM-001&proposed=inf",
                      "entity=PARAM-001&proposed=hello"]:
            with self.subTest(query=query):
                status, _, body = self.get("/api/analyze?" + query)
                self.assertEqual(status, 400)
                self.assertTrue(json.loads(body)["error"])

    def test_model_and_assets_are_served(self):
        status, _, body = self.get("/api/model")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), json.loads(DATA_PATH.read_text()))
        for path, content_type in [("/", "text/html"), ("/case-study", "text/html"), ("/case-study.md", "text/markdown"), ("/review-paths.svg", "image/svg+xml"), ("/app.js", "text/javascript"), ("/style.css", "text/css"),
                                         *[(f"/icons/{icon}.svg", "image/svg+xml") for icon in
                                           ["sliders-horizontal", "code-xml", "activity", "list-checks", "flask-conical", "file-text"]]]:
            status, headers, body = self.get(path)
            self.assertEqual(status, 200)
            self.assertTrue(headers["Content-Type"].startswith(content_type))
            self.assertTrue(body)

    def test_non_assets_are_not_exposed(self):
        for path in ["/data/coffee-machine.json", "/.git/config", "/../impact_analyzer.py", "/icons/unknown.svg", "/icons/../../impact_analyzer.py"]:
            status, _, body = self.get(path)
            self.assertEqual(status, 404)
            self.assertEqual(json.loads(body), {"error": "Not found"})


if __name__ == "__main__":
    unittest.main()
