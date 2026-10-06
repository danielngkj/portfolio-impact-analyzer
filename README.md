# Portfolio Impact Analyzer

A relationship-driven review tool for a fictional industrial coffee machine.
The first working milestone models a proposed brew target change from 93°C to
95°C and explains which engineering artifacts and documentation topics to review.
All data is synthetic.

## Run the demo

Python 3.9 or newer is sufficient; there are no third-party dependencies.

```sh
python3 impact_analyzer.py
python3 impact_analyzer.py --entity PARAM-001 --proposed 95 --json
python3 -m unittest discover -s tests -v
```

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

The JSON graph, validation, deterministic traversal, command-line report, and
automated checks are implemented. Next: a single-page interface with a change
form, grouped review candidates, and expandable explanation paths.

See [the first scenario](docs/first-working-scenario.md) for the model and
[the project outline](docs/project-outline-md) for the broader plan.
