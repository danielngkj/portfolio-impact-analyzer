"""Serve the local impact-analyzer interface using Python's standard library."""

import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from impact_analyzer import DATA_PATH, analyze, supported_scenarios, validate_graph

WEB_ROOT = Path(__file__).parent / "web"
ASSETS = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/case-study": ("case-study.html", "text/html; charset=utf-8"),
    "/case-study/": ("case-study.html", "text/html; charset=utf-8"),
    "/case-study.md": ("../docs/portfolio-case-study.md", "text/markdown; charset=utf-8"),
    "/review-paths.svg": ("review-paths.svg", "image/svg+xml"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/analyzer.js": ("analyzer.js", "text/javascript; charset=utf-8"),
    "/data/coffee-machine.json": ("../data/coffee-machine.json", "application/json; charset=utf-8"),
    "/style.css": ("style.css", "text/css; charset=utf-8"),
}

# Explicit asset entries keep arbitrary filesystem paths inaccessible.
for icon in ("sliders-horizontal", "code-xml", "activity", "list-checks", "flask-conical", "file-text"):
    ASSETS[f"/icons/{icon}.svg"] = (f"icons/{icon}.svg", "image/svg+xml")


class Handler(BaseHTTPRequestHandler):
    def respond(self, status, body, content_type="application/json; charset=utf-8"):
        if isinstance(body, dict):
            body = json.dumps(body, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path in ASSETS:
            filename, content_type = ASSETS[url.path]
            self.respond(200, (WEB_ROOT / filename).read_bytes(), content_type)
            return
        if url.path not in ("/api/model", "/api/scenarios", "/api/analyze"):
            self.respond(404, {"error": "Not found"})
            return
        try:
            graph = json.loads(DATA_PATH.read_text())
            validate_graph(graph)
            if url.path == "/api/model":
                self.respond(200, graph)
                return
            if url.path == "/api/scenarios":
                self.respond(200, supported_scenarios(graph))
                return
            query = parse_qs(url.query)
            entity = query.get("entity", [""])[0]
            proposed = query.get("proposed", [""])[0]
            changed = next((item for item in graph["entities"] if item["id"] == entity), {})
            if changed.get("type") != "Behaviour":
                proposed = float(proposed)
            self.respond(200, analyze(graph, entity, proposed))
        except (ValueError, KeyError, TypeError) as error:
            self.respond(400, {"error": str(error)})
        except OSError:
            self.respond(500, {"error": "The model could not be loaded."})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Impact analyzer: http://127.0.0.1:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
