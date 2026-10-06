# Portfolio Impact Analyzer

A relationship-driven review tool for a fictional industrial coffee machine.
The working demo models a proposed brew target change from 93°C to
95°C and explains which engineering artifacts and documentation topics to review.
All data is synthetic.

## Run the demo

Python 3.9 or newer is sufficient; there are no third-party dependencies.

```sh
python3 impact_analyzer.py
python3 impact_analyzer.py --entity PARAM-001 --proposed 95 --json
python3 -m unittest discover -s tests -v
```

## Open the browser interface

```sh
python3 web_server.py
```

Open <http://127.0.0.1:8000>. Use `--port 8001` if port 8000 is already in use.
Stop the server with Ctrl+C.

The interface opens with the brew-temperature example. Choose a parameter,
enter a proposed value, and select **Find review candidates**. Engineering and
documentation results are grouped separately. Expand **Why review this?** to
inspect the path, stored relationships, and traversal directions.

Changing the form clears the previous report until you run the analysis again.
The steam example returns only its directly connected documentation topic.
The local server calls the same Python engine as the command-line demo and
requires no third-party dependencies.
The server listens only on `127.0.0.1`; this milestone is a local demo.

The default demo returns six candidates: one software module, one behaviour,
one requirement, one test, and two documentation topics. The steam-temperature
branch stays outside the result. Every candidate includes an explanation path;
JSON output also preserves the stored relationship and traversal direction.

## Model decisions

- Documentation topics are the review unit.
- `references` captures direct mentions of parameters in documentation.
- Results express potential review, not proven engineering consequences.

Relationship semantics and traversal policy are separate. The engine follows
only the approved policy, terminates at tests and documentation, and returns
one shortest path per candidate. Proposed values provide change context and
do not affect traversal or overwrite the dataset.

## Current status

The JSON graph, validation, deterministic traversal, command-line report,
browser interface, and automated engine and HTTP checks are implemented.
The first scenario now supports a complete change → review → explanation demo.

Validation includes seven engine tests and four HTTP integration tests covering
API parity with the engine, invalid requests, model and asset serving, and
restricted file access. The browser flow has also been checked manually for
brew and steam results, expandable paths, required input, and clearing old
results when the form changes.

Next: define a second engineering scenario to exercise the relationship model
and review policy beyond the brew-temperature example.

See [the first scenario](docs/first-working-scenario.md) for the model and
[the project outline](docs/project-outline-md) for the broader plan.
