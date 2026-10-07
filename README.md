# Impact Analyzer

An interactive portfolio demo that identifies what may need review when a
setting or feature behaviour changes. It connects engineering artifacts and
documentation through an explicit relationship graph, showing why each review
candidate was selected.

For example, raising a coffee machine’s brew target from **93°C to 95°C** finds
four engineering artifacts and two documentation topics. Each has an inspectable
connection path. Reviewers can record findings and copy a live report.

[Case study](docs/portfolio-case-study.md) · [Development guide](docs/development.md)

## How it works

The synthetic coffee-machine model contains 15 entities and 13 relationships.
A bounded breadth-first traversal returns one shortest explanation path per
candidate, keeping unrelated branches out of the review.

The app runs entirely in the visitor’s browser using **HTML, CSS, JavaScript,
and JSON**. Python remains a reference engine and optional CLI; public hosting
needs no backend, database, or frontend framework.

## Try it locally

```sh
sh scripts/build-static.sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Open <http://127.0.0.1:8000>. Select a parameter or behaviour change, review the
proposal, then choose **Find review candidates**. Stop the file server with Ctrl+C.

## Tests

```sh
python3 -m unittest discover -s tests -v
```

The 26 tests cover Python analysis, browser-engine parity, model validation,
explanation paths, unchanged proposals, and local HTTP behaviour. Python 3.9+
is required; JavaScript checks use Node or macOS’s built-in JavaScriptCore.
There are no third-party package dependencies.

## Hosting

The build packages the public files in `dist/` for static hosting. For GitHub
Pages, select **Settings → Pages → Source → GitHub Actions**. The included
workflow tests and publishes the site on pushes to `main`.

Vercel configuration is also included. See the [deployment instructions](docs/development.md#publish-the-static-demo)
for setup details.

## Limits

All data is fictional. Recorded links identify potential review, not proven
engineering consequences or complete coverage. Proposal text does not create
new dependencies. Review notes and statuses clear when the page is refreshed
or closed.

See the [case study’s scope and limitations](docs/portfolio-case-study.md#scope-and-limitations)
for the model’s boundaries and lessons learned.

Designed and developed by Daniel Ng.
