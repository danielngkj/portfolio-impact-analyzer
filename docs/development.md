# Development guide

Use this guide to run, test, and publish Impact Analyzer. Read the [case study](portfolio-case-study.md)
for model decisions, scenarios, and limitations.

## Local setup and CLI

Start the local development server with Python 3.9 or later:

```sh
python3 web_server.py
```

Open <http://127.0.0.1:8000>. If port 8000 is occupied, add `--port 8001`.
Refresh the browser after editing source files. Press Ctrl+C to stop the server.

To check the packaged site, build and serve `dist/`:

```sh
sh scripts/build-static.sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Rebuild after editing source files. The browser runs the analysis in JavaScript;
Python serves the files for this local preview. Build and host the public site
without a Python runtime.

Run the Python reference engine from the command line:

```sh
python3 impact_analyzer.py --entity PARAM-001 --proposed 95 --json
python3 impact_analyzer.py --entity PARAM-003 --proposed 10
python3 impact_analyzer.py --entity BEH-001
```

Omit `--proposed` to use the model’s suggested change.

## Testing

Run the full test suite:

```sh
python3 -m unittest discover -s tests -v
```

The 26 tests cover graph validation, candidate selection, paths, unchanged
proposals, local HTTP routes, and static build contents. Parity tests compare
JavaScript and Python results for suggested and custom proposals, duplicate edges,
and shared-module boundaries. Update both engines when changing analysis rules.

Use Python 3.9 or later and either Node or macOS’s built-in JavaScriptCore.
The suite uses no third-party packages.

## Publish the static demo

In the repository’s **Settings → Pages**, select **GitHub Actions** as the source.
The [Pages workflow](../.github/workflows/pages.yml) tests, builds, and publishes
`dist/` when you push to `main`. To publish manually, run the workflow from
the **Actions** tab.

After deployment, open <https://danielngkj.github.io/portfolio-impact-analyzer/>.
Confirm the workflow succeeds and the demo loads before adding a portfolio link.
To use a custom domain, configure it in Pages settings.

The build copies only public assets into `dist/`. Relative paths support both
root hosting and GitHub Pages’ repository subfolder. Serve `dist/`, not `web/`.

## Code structure and reference API

| Location | Purpose |
| --- | --- |
| `data/coffee-machine.json` | Defines synthetic entities, relationships, suggestions, and authored questions |
| `web/analyzer.js` | Validates the model and traverses the graph in the browser |
| `web/app.js`, `web/index.html`, `web/style.css` | Render the interface and manage findings and reports |
| `impact_analyzer.py`, `web_server.py` | Provide the Python reference CLI and optional local server |
| `scripts/build-static.sh` | Packages public assets |
| `tests/` | Check engines, parity, packaging, and HTTP routes |

The optional local server exposes `/api/model`, `/api/scenarios`, and
`/api/analyze?entity=PARAM-001&proposed=95` for reference checks. The static browser
loads the JSON model and analyzes it locally.

## Verification checklist

Before publishing UI or analysis changes:

1. Run the tests and preview the static build.
2. Confirm temperature and pressure changes each return six candidates; steam
   returns only DOC-003. The brew-temperature behaviour change returns four.
3. Inspect the shared specification’s path: temperature uses Temperature
   controller; pressure uses Pump controller.
4. Submit unchanged numeric and behaviour proposals. Confirm both return no candidates.
5. Change statuses, apply filters, enter investigation notes, and copy the report.
   Confirm the report retains findings for filtered cards.
6. Clear the change type and confirm the initial card returns. Follow the
   case-study links. Check the controls on narrow screens and with reduced motion enabled.

For detailed expected paths, see the [temperature](first-working-scenario.md),
[pressure](second-working-scenario.md), and [behaviour](third-working-scenario.md)
scenarios.
