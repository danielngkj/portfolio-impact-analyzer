# Impact Analyzer

A relationship-driven review tool for a fictional industrial coffee machine.
The working demo models a proposed brew target change from 93°C to
95°C and explains which engineering artifacts and documentation topics to review.
A second scenario proposes raising brew pressure from 9 to 10 bar.
A third changes brew readiness to require five continuous seconds within temperature tolerance.
All data is synthetic.

## Run the demo

The public browser demo is static HTML, CSS, JavaScript, and JSON. It needs no
Python runtime, API service, database, or frontend framework. Python 3.9 or newer
is used only for the reference CLI and optional local development server.

```sh
python3 impact_analyzer.py
python3 impact_analyzer.py --entity PARAM-001 --proposed 95 --json
python3 impact_analyzer.py --entity PARAM-003 --proposed 10
python3 impact_analyzer.py --entity BEH-001
python3 -m unittest discover -s tests -v
```

The browser-engine parity tests use Node, or the built-in JavaScriptCore runtime
on macOS. Install Node when running the full test suite on Linux or Windows.

## Open the browser interface

```sh
python3 web_server.py
```

Open <http://127.0.0.1:8000>. Use `--port 8001` if port 8000 is already in use.
Stop the server with Ctrl+C.

The interface starts with a centered card asking **What kind of change are you making?** Select **Parameter change** or
**Behaviour change** to reveal the item selector and proposal fields, then
select **Find review candidates**. Selecting a type moves the form into the left
sidebar. Editing or rerunning proposals preserves that layout; selecting
**Select change type** restores the clean centered card. Controls fade in
sequentially, and results fade in by roughly a screenful at a time. Reduced-motion
preferences disable these animations.

Engineering and documentation results are grouped separately. Lucide icons
identify artifact types. Expand **Show connection path** for a visual chain,
and **Show relationship evidence** for stored edges and traversal directions.
The right-hand **On this page** navigation appears only for analyzed changes
and adapts to a link row on smaller screens.

Changing the form clears the previous report until you run the analysis again.
The steam example returns only its directly connected documentation topic.
The browser loads `/data/coffee-machine.json` and runs `web/analyzer.js` locally.
It makes no analysis API requests. The optional local server listens only on
`127.0.0.1` and retains its Python API for reference checks.

## Publish the static demo

```sh
sh scripts/build-static.sh
```

This copies only public assets into `dist/`, including the model, browser engine,
case-study page, and original case-study document. No Python or npm dependencies
are needed for the build or hosting. To preview the actual static output locally:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory dist
```

Python in this command is just an optional file server, not the analyzer.

For Vercel, import the GitHub repository and choose the **Other** framework preset.
The checked-in `vercel.json` sets `sh scripts/build-static.sh` as the build command
and `dist` as the output directory, with a route for `/case-study`. No Functions
are required. Verify the generated deployment URL, then optionally connect a
subdomain such as `impact.danielng.co` and link to it from the portfolio.
Render static hosting can use the same build command and publish directory.

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
static browser interface, and automated engine, JavaScript parity, and HTTP checks are implemented.
All three engineering scenarios support a complete change → review → explanation
demo. The dataset contains 15 entities and 13 relationships across six types.

Validation includes fourteen Python engine tests, five browser-engine parity tests,
and seven HTTP integration tests covering
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

## Scenario catalog and reference API

`GET /api/scenarios` returns supported change scenarios with `entity_id`,
`kind`, `current`, and `proposed`, plus `unit` for parameters. Suggestions are
stored in the model and used by both the browser and CLI. The static browser
derives this catalog locally using `ImpactAnalyzer.supportedScenarios`; the API
is retained only in the optional local Python server. For example,
`python3 impact_analyzer.py --entity PARAM-003` now defaults to 10 bar.
Pressure behaviour also includes a suggested three-second ramp proposal.

Every engine candidate includes a `review_question`, shared by API, browser,
and CLI reports. Questions authored for a stored proposal apply only when that
proposal is selected; custom proposals use general questions by artifact type.
Model validation rejects missing descriptions, non-finite parameter values,
missing units, invalid question references, and empty questions.

## Review findings

Each candidate defaults to **Needs change** as a demo starting state, not an
engineering conclusion. Three icon buttons on every card select **Needs change**,
**Needs investigation**, or **No change needed** in one click. The selected
button is highlighted and each icon has a tooltip and accessible label.

Selecting Needs investigation opens and focuses the note field. The separate
note icon also opens it without moving the artifact text. Notes update the report
as you type; a sentence-ending full stop briefly shows **Report updated**.
**Enter** finishes the note and closes the editor; **Shift+Enter** adds a new
line. Trailing line breaks are trimmed. Click outside or press Escape to close.
No change needed cards become grey and compact, retaining their type, title,
ID, and status controls. Switching status restores the details.

The icon counts in **Your review findings** filter the cards when clicked.
Click the selected filter again to show all. An open editor stays available
until its note is finished, even if its new status no longer matches the filter.
Filtering affects card visibility only; the generated report always includes
all candidates. A fresh analysis resets the visible filter.

Findings are held in page memory for each exact proposal. Rerunning the same
proposal or returning to it restores its findings; a different proposal starts
with the default Needs change status even when it shares candidates. Refreshing or closing the page
clears findings. Saving and reopening reviews is a future enhancement.

An unchanged proposal returns no candidates and an explicit **No change proposed**
message. Numeric values are compared numerically; behaviour descriptions are
compared as text after trimming surrounding whitespace. The analyzer does not
infer semantic equivalence between differently worded descriptions.

## Live review report

The expanded **Review report** updates when statuses or notes change. It includes
the current/proposed change, analysis timestamp, status totals, findings, and
connection paths. No change needed artifacts appear as concise line items in a
shared section, including any note. Other artifacts retain their review questions
and detailed paths. Light Markdown highlighting improves readability.

The copy icon copies the exact Markdown shown and briefly changes to a checkmark.
If clipboard access is unavailable, the report is selected for manual copying.
Editing the proposal clears the old report until you analyze it again. There is
no download, database, or server-side storage.

Behaviour reports also offer **Show text changes**: separate Current and Proposed
sentences with subtle highlights for removed and added words. The text comparison
does not infer engineering consequences.

Use **Case study** in the header for the browser-readable narrative. The footer's
**Coffee-machine model** link opens the original Markdown document.

## Portfolio scope

This single-user learning demo illustrates explicit entities and
relationships, bounded graph traversal, and explainable review candidates.
It supports parameter and behaviour changes with temporary review findings.
It does not infer dependencies from free text, simulate engineering outcomes,
or guarantee complete coverage. Requirements are review targets rather than
change inputs; persistence, collaboration, and alerts-project
integration are deferred. The [case study](docs/portfolio-case-study.md) explains
these boundaries with examples and is available at `/case-study` in the browser.

## Browser verification

A Safari walkthrough on 7 October 2026 checked the initial reveal of controls,
parameter and behaviour analysis, all three status buttons, investigation note
focus, multiline notes and Enter-to-finish, live report updates, compact no-change
cards, status-filter switching/reset, clipboard success feedback, visual paths
and stored-edge evidence, returning to a proposal with its findings preserved,
and unchanged numeric and behaviour proposals. The case-study link and updated
browser narrative also loaded successfully.

The finishing pass fixed initial-layout CSS specificity and keyboard focus when
finishing a note hides its card under an active filter. CSS is grouped by component
with responsive variants together; obsolete heading, dropdown, and graph styles
were removed. These browser checks complement the 21 engine/HTTP tests rather
than replacing them.

The static build was also checked in Safari: local JavaScript analysis returned
six temperature candidates and four behaviour candidates, an unchanged numeric
proposal returned none, and notes, status filters, the text diff, and report
copying worked through a plain file server. Automated parity tests additionally
cover unchanged behaviour proposals and verify the public build contents.
