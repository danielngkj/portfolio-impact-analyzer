import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.request import urlopen

from impact_analyzer import DATA_PATH, analyze
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
        for entity, proposed in [("PARAM-001", 95), ("PARAM-002", 126), ("PARAM-001", 94.5)]:
            with self.subTest(entity=entity, proposed=proposed):
                status, headers, body = self.get(f"/api/analyze?entity={entity}&proposed={proposed}")
                self.assertEqual(status, 200)
                self.assertEqual(json.loads(body), analyze(graph, entity, proposed))
                self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertEqual(DATA_PATH.read_bytes(), original)

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
        for path, content_type in [("/", "text/html"), ("/app.js", "text/javascript"), ("/style.css", "text/css")]:
            status, headers, body = self.get(path)
            self.assertEqual(status, 200)
            self.assertTrue(headers["Content-Type"].startswith(content_type))
            self.assertTrue(body)

    def test_non_assets_are_not_exposed(self):
        for path in ["/data/coffee-machine.json", "/.git/config", "/../impact_analyzer.py"]:
            status, _, body = self.get(path)
            self.assertEqual(status, 404)
            self.assertEqual(json.loads(body), {"error": "Not found"})


if __name__ == "__main__":
    unittest.main()
