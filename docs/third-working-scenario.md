# Third working scenario: brew readiness behaviour

Status: implemented in the engine, command-line demo, API, and browser.
All engineering details are synthetic.

Current behaviour: brewing starts once temperature reaches the configured target.
Proposed behaviour: temperature must stay within ±1°C of the configured target
for five continuous seconds before brewing starts.

The change starts at BEH-001 rather than a parameter. Four review candidates
are returned:

| Candidate | Review focus | Explanation path |
| --- | --- | --- |
| MOD-001 Temperature controller | Gate brewing on the stability interval; reset the timer outside tolerance | Behaviour → implementedBy → module |
| REQ-001 Brew temperature tracking | Specify the continuous interval and readiness condition | Behaviour → incoming realizedBy → requirement |
| TEST-001 Brew temperature tracking test | Early-start prevention, successful readiness, and timer reset | Behaviour → requirement → incoming verifies → test |
| DOC-001 Brew regulation specification | Explain the revised brewing-start condition | Behaviour → incoming describes → topic |

The changed behaviour is shown separately from candidates. Traversal stops at
modules, tests, and documentation. Neither shared implementation nor the
shared specification pulls in pressure regulation. Parameter settings and
steam artifacts remain outside the result.

In the browser, select **Behaviour change**, keep **Brew temperature regulation**,
and click **Find review candidates**. Inspect before/after text, review questions,
and expandable path evidence. Editing the proposal clears the previous report.
Switching back to **Parameter change** restores the numeric input.

Run `python3 impact_analyzer.py --entity BEH-001` for the stored proposal, or
supply `--proposed "Wait ten seconds before brewing."` for custom context.
The API accepts the description in the URL-encoded `proposed` field.
Blank descriptions are rejected. Descriptions do not modify the graph or
change dependency selection; custom descriptions receive general review
questions rather than questions authored for the five-second scenario.

Connections identify potential review. Review findings establish actual
implementation, requirement, test, or documentation changes. This demo does
not simulate control logic or prove engineering consequences.
