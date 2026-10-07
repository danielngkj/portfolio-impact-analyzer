# Impact Analyzer

I built a tool that turns a proposed engineering change into an explainable
review plan. It models a fictional industrial coffee machine system, connecting
configuration parameters and behaviours to engineering artifacts and documentation topics.

The brew-temperature example shows the workflow:

- **Change:** raise the target from 93°C to 95°C.
- **Review:** see four engineering artifacts and two documentation topics.
- **Explain:** inspect the relationship path behind every candidate.

The diagram shows the review paths. Labels describe traversal;
stored relationships can point in the opposite direction.

![Review paths: configuration parameter → software module → behaviour → requirement → test, with documentation branches from the parameter and behaviour.](assets/review-paths.svg)

## The problem

**If something changes, what artifacts might be affected?**

Product knowledge is spread across engineering artifacts and documentation.
Engineers and technical writers need specific review targets, and reasons
for selecting them. A parameter reference reveals a direct connection.
Other artifacts may describe or verify the related behaviour.

## Modelling the connections

Three decisions keep the model small and the results inspectable:

- **Explicit relationships:** 15 synthetic entities cover parameters,
  software, behaviours, requirements, tests, and documentation topics.
  Each connection has a defined meaning, such as `configures` or `verifies`.
- **Specific documentation targets:** individual topics connect to parameters
  through `references` and to behaviours through `describes`.
- **Bounded review policy:** the analyzer follows only approved relationships
  and directions. A shared connection alone does not justify inclusion.

Relationship meaning and review policy are separate. The stored relationship
**behaviour → implementedBy → module** is followed backwards from the module.
The interface displays that step as **module → implements → behaviour**.

A separate steam-temperature branch checks the policy's boundaries.
Its parameter and documentation topic stay outside the brew result.

## From proposed change to review plan

The browser workflow has three steps:

1. Choose a type of change, select an item, and enter a value or description.
2. Review the engineering and documentation groups.
3. Expand **Show connection path** to inspect the explanation.

The brew-temperature example returns six candidates:

| Review group | Candidate | Why it appears |
| --- | --- | --- |
| Engineering | Temperature controller | Configured by the parameter |
| Engineering | Brew temperature regulation | Implemented by the controller |
| Engineering | Brew temperature tracking requirement | Realized by the behaviour |
| Engineering | Brew temperature tracking test | Verifies the requirement |
| Documentation | Set brew temperature | References the parameter |
| Documentation | Brew regulation specification | Describes the behaviour |

The tracking test has this complete explanation:

> Brew target temperature → configures → Temperature controller
> → implements → Brew temperature regulation → realizes → Brew temperature
> tracking → is verified by → Brew temperature tracking test

Each explanation includes the stored edges and traversal directions.
The engine uses breadth-first traversal and records visited entities.
It returns one deterministic shortest path per candidate.
Paths stop at tests and documentation topics.

## Behaviour changes and review findings

The [behaviour scenario](third-working-scenario.md) changes brew readiness from
reaching the configured temperature to staying within ±1°C for five continuous
seconds. Starting at the behaviour returns its implementing module, requirement,
verifying test, and documentation topic. Modules terminate traversal for behaviour
changes to avoid expanding through shared implementations into unrelated behaviours.

The browser shows current/proposed descriptions with an optional word-level diff
using separate Current and Proposed sentences with subtle highlights.
Lucide icons distinguish artifact types in cards and visual connection paths.
Backend review questions are shared by browser, API, and CLI. Scenario suggestions
come from the model through `/api/scenarios`.

Each candidate defaults to Needs change as a demo starting state, not a proven
engineering conclusion. Three direct icon buttons select Needs change, Needs
investigation, or No change needed. Selecting investigation opens the note editor.
Completed no-change cards become grey and compact. Status counts double as filters;
filtering changes card visibility without excluding artifacts from the report.

A visible Markdown report updates as statuses and notes change. It contains the
proposal, analysis timestamp, status summary, findings, and connection paths.
No change needed items are summarized together, with their notes. A copy icon
makes the report available for a change ticket without downloading a file.
Enter finishes a note; Shift+Enter inserts a line break. Trailing line breaks
are trimmed. Findings stay associated with each exact proposal while the page
is open and clear on refresh.

The initial centered card reveals fields and moves into a left sidebar after a
change type is selected. Editing preserves the sidebar layout; clearing the type
restores the initial card. Form controls fade in sequentially and results reveal
in groups sized to the viewport, respecting reduced-motion preferences.
A conditional right-hand table of contents helps
navigate long reports. The case study uses the same header and footer as the app.
An unchanged value or matching trimmed behaviour description returns zero
candidates and a No change proposed message.

Review questions are predefined guidance, not generated engineering conclusions.
The stored example uses authored questions; custom descriptions receive general
questions by artifact type. Candidate selection and explanation paths are computed
from recorded graph relationships and the traversal policy.

## Why documentation matters here

The two documentation candidates illustrate different review reasons:

- **Direct connection:** *Set brew temperature* references the parameter
  and states its current 93°C default.
- **Indirect connection:** *Brew regulation specification* describes the
  behaviour implemented by the controller. The changed parameter configures
  that controller.

**Relationships identify review candidates; they do not prove something
must change.** The tracking requirement illustrates this distinction.
It defines performance relative to the configured target, so its wording
may still apply at 95°C. Its connection still warrants review.

Proposed values and descriptions provide context; the graph and policy select the candidates.
The analyzer leaves the dataset unchanged and does not predict physical outcomes.

## Implementation and validation

The demo shares one analysis engine across both interfaces:

- **Python standard library:** graph validation, traversal, command-line
  reporting, and a local server, without third-party dependencies.
- **HTML, CSS, and JavaScript:** the browser interface calls the Python engine.
- **21 automated tests:** cover review selection, explanations, API behaviour,
  and model integrity, including scenario metadata validation, exact pressure
  candidates, shared-topic boundaries, and unchanged proposals. A Safari walkthrough
  on 7 October 2026 checked status buttons, filters, note entry, report copying,
  visual paths, text comparison, preserved findings, and unchanged proposals. The
  [README walkthrough](../README.md#test-the-scenarios-yourself) includes pressure
  and comparison of the shared documentation paths.

The [README](../README.md) provides run instructions and a test breakdown.

## Lessons and limits

Building the demo highlighted three lessons:

- Define relationship meanings before choosing traversal rules.
- Preserve evidence so users can assess each explanation.
- Model documentation topics to make review targets specific.

## Scope and limitations

This is a portfolio learning demo of entities, explicit relationship graphs,
and explainable review selection. Its scope is a local, single-user application
with a synthetic coffee-machine dataset, numeric parameter changes, and textual
behaviour changes. It includes review questions, explanation evidence, and
session-only human findings. Requirements and tests are review targets; they
cannot currently be selected as change starting points.

- **Recorded links determine coverage.** If the tracking test exists but its
  `verifies` relationship is missing, the analyzer omits it. A valid explanation
  proves that a recorded path exists, not that the candidate list is complete.
- **Proposal text does not create dependencies.** A description mentioning pump
  control does not add a connection to the pump controller. Semantic interpretation
  of free text is outside scope. The diff shows wording changes only.
- **Policy deliberately limits traversal.** Shared modules and documentation
  can otherwise connect unrelated branches. The chosen boundaries prevent that
  spread but are review rules, not a complete model of engineering causality.
- **Only one shortest path is shown.** An artifact reached through multiple
  valid paths may have additional review reasons the report does not display.
- **Documentation granularity is a topic.** The shared regulation specification
  is identified for review; the graph does not locate the affected paragraph.
- **Validation checks structure, not truth.** Valid types, references, descriptions,
  and values do not establish that relationships are complete or correct.
- **No physical simulation or measured benefit.** The tool cannot establish
  feasibility, safety, or real-world consequences. Real product data and
  review-time savings have not been evaluated.
- **Findings are temporary.** Refreshing or closing the page clears statuses
  and notes. Persistence, collaboration, and production hosting are outside
  this demo's scope. Integration with the separate alerts project is deferred.

The [pressure scenario](second-working-scenario.md) tests the same policy with
a separate pump-control branch. Both branches reach the shared Brew regulation
specification, with distinct explanation paths. Traversal stops at that topic,
so its shared connections do not pull the other engineering branch into results.
The current demo already supports its core task: **change a parameter or behaviour,
see what may need review, and understand why.**

## Try the demo

These guides explain how to run and inspect the project:

- Follow [the README](../README.md) to run the local demo.
- See [the first working scenario](first-working-scenario.md) for the model
  and traversal policy.
