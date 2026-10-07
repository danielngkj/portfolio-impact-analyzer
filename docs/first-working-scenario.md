# First working scenario: brew target temperature

The JSON model, reference CLI, and browser interface support this scenario.

## Problem and boundary

A systems engineer proposes changing the fictional machine's brew target
temperature from 93°C to 95°C. A technical writer needs to identify which
engineering artifacts and documentation topics potentially require review,
and inspect the relationship that connects each artifact to the change.

The first demo answers one question: what should we review for this change?
It does not predict physical outcomes or declare that an artifact must change.
All data is synthetic. The analyzer records the proposed value as change context
and follows graph connections to select review candidates.

## Smallest useful dataset

The original scenario uses nine entities across six types, listed below. The
full dataset now has 15 entities, including the
[pressure scenario](second-working-scenario.md). Documentation nodes represent
individual topics, so the result identifies a specific review target.

| ID | Type | Name | Synthetic detail |
| --- | --- | --- | --- |
| PARAM-001 | Parameter | Brew target temperature | Current value 93°C; proposed value 95°C |
| MOD-001 | SoftwareModule | Temperature controller | Uses the target to regulate brew temperature |
| BEH-001 | Behaviour | Brew temperature regulation | Regulates temperature toward the configured target |
| REQ-001 | Requirement | Brew temperature tracking | Temperature shall track the configured target within ±1°C before brewing |
| TEST-001 | Test | Brew temperature tracking test | Verifies tracking at the configured target; fixture currently uses 93°C |
| DOC-001 | DocumentationTopic | Brew regulation specification | Describes temperature and pressure regulation and their configured targets |
| DOC-002 | DocumentationTopic | Set brew temperature | References the parameter and currently states a 93°C default |
| PARAM-002 | Parameter | Steam target temperature | Separate steam setting, 125°C |
| DOC-003 | DocumentationTopic | Set steam temperature | References only the steam parameter |

The two steam entities provide a negative control: they must stay outside the
brew-temperature result. The pressure scenario adds a separate module,
behaviour, requirement, test, parameter, and setting topic using the same types
and policy. Features, hardware components, and alerts remain outside the model.

## Stored relationships

Use the outline's relationship directions consistently:

| Source | Relationship | Target | Meaning |
| --- | --- | --- | --- |
| PARAM-001 | configures | MOD-001 | The module uses this parameter |
| BEH-001 | implementedBy | MOD-001 | The module implements this behaviour |
| REQ-001 | realizedBy | BEH-001 | The behaviour realizes this requirement |
| TEST-001 | verifies | REQ-001 | The test checks this requirement |
| DOC-001 | describes | BEH-001 | The topic explains this behaviour |
| DOC-002 | references | PARAM-001 | The topic explicitly refers to this parameter |
| DOC-003 | references | PARAM-002 | The topic explicitly refers to this parameter |

`references` is the one additional relationship needed for direct documentation
traceability. Its initial domain is DocumentationTopic and range is Parameter.
The other relationships have the source and target types shown above.

## Traversal policy

Impact traversal is a review policy layered on the graph. Do not follow every
edge in both directions: shared connections alone are not an impact rule.

For this first scenario, allow these steps:

1. Parameter → SoftwareModule via outgoing `configures`.
2. SoftwareModule → Behaviour via incoming `implementedBy`.
3. Behaviour → Requirement via incoming `realizedBy`.
4. Requirement → Test via incoming `verifies`.
5. Behaviour → DocumentationTopic via incoming `describes`.
6. Parameter → DocumentationTopic via incoming `references`.

Stop traversal at tests and documentation topics. Track visited entity IDs to
avoid cycles, and record each step’s relationship and direction. Preserve stored
triples. Display inverse traversal with readable labels such as “implements,”
“realizes,” and “is verified by.”

## Expected demonstration

Input: PARAM-001, 93°C → 95°C.

Expected review candidates: one module, one behaviour, one requirement, one
test, and two documentation topics. The interface shows the changed parameter
separately from the six review candidates. PARAM-002 and DOC-003 do not appear, nor do
PARAM-003, MOD-002, BEH-002, REQ-002, TEST-002, or DOC-004. DOC-001 is shared
with pressure regulation, but traversal stops at the topic and does not follow
its other connection into the pressure branch.

Every candidate has an inspectable path. For example:

> Brew target temperature → configures → Temperature controller
> → implements → Brew temperature regulation → realizes → Brew temperature
> tracking → is verified by → Brew temperature tracking test

Documentation review reasons:

- **Brew regulation specification:** describes the behaviour implemented by the
  module configured by the changed parameter.
- **Set brew temperature:** directly references the changed parameter and
  contains a default value to review.

The tracking requirement is a review candidate even though its wording may
remain valid at 95°C. This distinction is central to the demo.

## Implementation and verification

The browser loads the JSON dataset and runs validation and traversal in
JavaScript. The Python reference engine provides the CLI and optional local API.
Both engines return one deterministic shortest explanation path per candidate.
They use documentation topics as review units and `references` for direct
parameter mentions.

Run `python3 impact_analyzer.py` from the project root. Add `--json` to inspect
stored edges and traversal directions. For browser setup and tests, follow the
[development guide](development.md).

Verify the exact candidate set, exclusion of unrelated branches, and the stored
edges and directions behind every explanation. Reject unknown entity IDs and
invalid relationship endpoints or type combinations.

In the browser, expand **Show connection path** and **Show relationship evidence**
to inspect the explanation. Editing the proposal clears the previous report.
Select the steam parameter to check the independent branch.
