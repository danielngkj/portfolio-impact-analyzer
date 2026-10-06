# Second working scenario: brew target pressure

Status: implemented in the dataset, command-line demo, and browser interface.
All values and engineering details are synthetic.

## Proposed change

Raise the brew target pressure from **9 bar to 10 bar**. The review policy and
relationship semantics are unchanged from the temperature scenario.

| ID | Type | Name | Review context |
| --- | --- | --- | --- |
| PARAM-003 | Parameter | Brew target pressure | Current target 9 bar; proposed target 10 bar |
| MOD-002 | SoftwareModule | Pump controller | Uses the pressure target to control the brew pump |
| BEH-002 | Behaviour | Brew pressure regulation | Regulates pressure toward the configured target |
| REQ-002 | Requirement | Brew pressure tracking | Tracks the configured target within ±0.5 bar during extraction |
| TEST-002 | Test | Brew pressure tracking test | Fixture currently uses 9 bar |
| DOC-004 | DocumentationTopic | Set brew pressure | Currently states a 9 bar default |
| DOC-001 | DocumentationTopic | Brew regulation specification | Shared topic describing temperature and pressure regulation |

Six entities are new; DOC-001 already exists. The full dataset now contains
15 entities across the same six types.

## Stored relationships

| Source | Relationship | Target |
| --- | --- | --- |
| PARAM-003 | configures | MOD-002 |
| BEH-002 | implementedBy | MOD-002 |
| REQ-002 | realizedBy | BEH-002 |
| TEST-002 | verifies | REQ-002 |
| DOC-001 | describes | BEH-002 |
| DOC-004 | references | PARAM-003 |

The tracking test has this explanation:

> Brew target pressure → configures → Pump controller → implements → Brew
> pressure regulation → realizes → Brew pressure tracking → is verified by →
> Brew pressure tracking test

## Shared documentation and review boundaries

The pressure change returns **six candidates**: four engineering artifacts and
two documentation topics. Set brew pressure is connected directly to the
parameter. Brew regulation specification is reached through the pump controller
and pressure behaviour.

Temperature and pressure results overlap only at DOC-001. Each scenario shows
its own three-step explanation for that shared topic. Documentation is a
terminal review target: traversal does not continue through DOC-001 to the
other behaviour. The steam parameter still returns only DOC-003.

The pressure requirement is relative to the configured target, so its wording
may remain valid. Its connection warrants review, while the test fixture and
stated documentation default provide concrete details to inspect. The model
does not establish whether 10 bar is physically achievable or appropriate.

## Try and verify

```sh
python3 impact_analyzer.py --entity PARAM-003 --proposed 10
python3 impact_analyzer.py --entity PARAM-003 --proposed 10 --json
python3 -m unittest discover -s tests -v
```

In the browser, select **Brew target pressure**. The form shows 9 bar as the
current value and suggests 10 bar. Run the analysis and expand the shared
specification's explanation to inspect the pressure-specific stored edges.

Engine tests verify exact candidates, path evidence, shared-topic boundaries,
value-independent selection, and dataset preservation. HTTP tests include the
pressure request and check parity with the same engine.
