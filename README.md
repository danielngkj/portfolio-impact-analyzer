# Portfolio Impact Analyzer

A relationship-driven review tool for a fictional industrial coffee machine.
The working demo models a proposed brew target change from 93°C to
95°C and explains which engineering artifacts and documentation topics to review.
A second scenario proposes raising brew pressure from 9 to 10 bar.
A third changes brew readiness to require five continuous seconds within temperature tolerance.
All data is synthetic.

## Run the demo

Python 3.9 or newer is sufficient; there are no third-party dependencies.

```sh
python3 impact_analyzer.py
python3 impact_analyzer.py --entity PARAM-001 --proposed 95 --json
python3 impact_analyzer.py --entity PARAM-003 --proposed 10
python3 impact_analyzer.py --entity BEH-001
python3 -m unittest discover -s tests -v
```

## Open the browser interface

```sh
python3 web_server.py
```

Open <http://127.0.0.1:8000>. Use `--port 8001` if port 8000 is already in use.
Stop the server with Ctrl+C.

The interface opens with the brew-temperature proposal ready to review; analysis runs when you select **Find review candidates**. Choose a parameter,
enter a proposed value, and select **Find review candidates**. Engineering and
documentation results are grouped separately. Expand **Show connection path** to
inspect the path, stored relationships, and traversal directions.

Changing the form clears the previous report until you run the analysis again.
The steam example returns only its directly connected documentation topic.
The local server calls the same Python engine as the command-line demo and
requires no third-party dependencies.
The server listens only on `127.0.0.1`; this milestone is a local demo.

The default demo returns six candidates: one software module, one behaviour,
one requirement, one test, and two documentation topics. The steam-temperature
and pressure engineering branches stay outside the temperature result. The pressure example also returns
six candidates, sharing only the Brew regulation specification topic with the
temperature example. Select **Brew target pressure** in the browser to try it.
Every candidate includes an explanation path;
JSON output also preserves the stored relationship and traversal direction.

## Test the scenarios yourself

After starting the server, use the parameter selector to compare these results:

| Parameter | Current → proposed | Expected review candidates |
| --- | --- | --- |
| Brew target temperature | 93 → 95°C | MOD-001, BEH-001, REQ-001, TEST-001, DOC-001, DOC-002 |
| Brew target pressure | 9 → 10 bar | MOD-002, BEH-002, REQ-002, TEST-002, DOC-001, DOC-004 |
| Steam target temperature | 125 → 126°C | DOC-003 only |

1. Select **Brew target pressure** and click **Find review candidates**.
2. Confirm four engineering artifacts and two documentation topics.
3. Expand **Show connection path** on **Brew regulation specification**. Its path
   should pass through Pump controller and Brew pressure regulation.
4. Switch to **Brew target temperature** and run the analysis again. The same
   specification should now have a path through Temperature controller and
   Brew temperature regulation.
5. Change the proposed value. The old report should disappear until you rerun
   the analysis; the new value changes the context, not the candidate set.

The two engineering scenarios share only DOC-001. Documentation topics terminate
traversal, so the shared topic does not connect the two engineering result sets.
These checks are a manual walkthrough; automated engine and HTTP validation
also cover the pressure scenario.

## Model decisions

- Documentation topics are the review unit.
- `references` captures direct mentions of parameters in documentation.
- Results express potential review, not proven engineering consequences.

Relationship semantics and traversal policy are separate. The engine follows
only the approved policy, terminates at tests and documentation, and returns
one shortest path per candidate. Proposed values and behaviour descriptions provide change context and
do not affect traversal or overwrite the dataset.

## Current status

The JSON graph, validation, deterministic traversal, command-line report,
browser interface, and automated engine and HTTP checks are implemented.
All three engineering scenarios support a complete change → review → explanation
demo. The dataset contains 15 entities and 13 relationships across six types.

Validation includes fourteen engine tests and seven HTTP integration tests covering
API parity with the engine, invalid requests, model and asset serving, and
restricted file access. The browser flow has also been checked manually for
brew and steam results, expandable paths, required input, and clearing old
results when the form changes.

The [portfolio case study](docs/portfolio-case-study.md) completes the Phase 10
narrative for this bounded demo: problem, model, solution, documentation
traceability, validation, and lessons learned. The
[second engineering scenario](docs/second-working-scenario.md) exercises
brew pressure and a documentation topic shared with temperature regulation.

See [the first scenario](docs/first-working-scenario.md) for the model and
[the project outline](docs/project-outline-md) for the broader plan.

## Behaviour changes

Choose **Behaviour change** and **Brew temperature regulation** in the browser.
The form shows the current behaviour and an editable proposed description:
require five continuous seconds within ±1°C before brewing starts. Run the
analysis to see MOD-001, REQ-001, TEST-001, and DOC-001, each with a review
question and an inspectable path. Editing the description clears the report.

The changed behaviour reaches its implementing module directly. Modules,
tests, and documentation terminate traversal for behaviour changes, preventing
shared implementations or topics from pulling unrelated behaviours into review.
Parameter-setting topics are excluded because this scenario does not change
the target value or the setting's meaning.

The descriptions provide context; the engine does not interpret arbitrary
text to infer dependencies. The stored five-second proposal has authored
review questions. Custom proposals receive general questions appropriate to
each artifact type. All 21 engine and HTTP tests pass.

See [the third scenario](docs/third-working-scenario.md) for details.

## Backend scenario catalog

`GET /api/scenarios` returns supported change scenarios with `entity_id`,
`kind`, `current`, and `proposed`, plus `unit` for parameters. Suggestions are
stored in the model and used by both the browser and CLI. For example,
`python3 impact_analyzer.py --entity PARAM-003` now defaults to 10 bar.
Pressure behaviour also includes a suggested three-second ramp proposal.

Every engine candidate includes a `review_question`, shared by API, browser,
and CLI reports. Questions authored for a stored proposal apply only when that
proposal is selected; custom proposals use general questions by artifact type.
Model validation rejects missing descriptions, non-finite parameter values,
missing units, invalid question references, and empty questions.

## Review findings

Each candidate starts **Unreviewed**. Expand the review status on a candidate
to access its status and note fields. The status disclosure sits at the upper
right of each card and remains visible when collapsed. Choose **Needs investigation**,
**Needs change**, or **No change needed**, and optionally enter a review note.
The summary counts each status separately. These are the user's findings,
separate from the engine's potential review candidates.

Findings are held in page memory for each exact proposal. Rerunning the same
proposal or returning to it restores its findings; a different proposal starts
unreviewed even when it shares candidates. Refreshing or closing the page
clears findings. Saving and reopening reviews is a future enhancement.

An unchanged proposal returns no candidates and an explicit **No change proposed**
message. Numeric values are compared numerically; behaviour descriptions are
compared as text after trimming surrounding whitespace. The analyzer does not
infer semantic equivalence between differently worded descriptions.

## Portfolio scope

This local, single-user learning demo illustrates explicit entities and
relationships, bounded graph traversal, and explainable review candidates.
It supports parameter and behaviour changes with temporary review findings.
It does not infer dependencies from free text, simulate engineering outcomes,
or guarantee complete coverage. Requirements are review targets rather than
change inputs; persistence, collaboration, production hosting, and alerts-project
integration are deferred. The [case study](docs/portfolio-case-study.md) explains
these boundaries with examples and is available at `/case-study` in the browser.
