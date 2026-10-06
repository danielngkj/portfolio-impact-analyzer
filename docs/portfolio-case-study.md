# Portfolio Impact Analyzer

I built a tool that turns a proposed engineering change into an explainable
review plan. It models a fictional industrial coffee machine, connecting
configuration parameters to engineering artifacts and documentation topics.

The brew-temperature example shows the workflow:

- **Change:** raise the target from 93°C to 95°C.
- **Review:** see four engineering artifacts and two documentation topics.
- **Explain:** inspect the relationship path behind every candidate.

The diagram shows the allowed review paths. Its labels describe traversal;
stored relationships may point in the opposite direction.

![Review paths: configuration parameter → software module → behaviour → requirement → test, with documentation branches from the parameter and behaviour.](assets/review-paths.svg)

## The problem

**If something changes, what artifacts might be affected?**

Product knowledge is spread across engineering artifacts and documentation.
Engineers and technical writers need specific review targets, with reasons
for selecting them. A parameter mention reveals a direct connection.
Other artifacts may describe or verify the related behaviour.

## Modelling the connections

Three decisions keep the model small and the results inspectable:

- **Explicit relationships:** nine synthetic entities cover parameters,
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

1. Select a parameter and enter a proposed value.
2. Review the engineering and documentation groups.
3. Expand **Why review this?** to inspect the explanation.

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

Proposed values provide context; the graph and policy select the candidates.
The analyzer leaves the dataset unchanged and does not predict physical outcomes.

## Implementation and validation

The demo shares one analysis engine across both interfaces:

- **Python standard library:** graph validation, traversal, command-line
  reporting, and a local server, without third-party dependencies.
- **HTML, CSS, and JavaScript:** the browser interface calls the Python engine.
- **11 automated tests:** cover review selection, explanations, API behaviour,
  and model integrity. Manual browser checks cover both parameter examples,
  expandable paths, input validation, and clearing old results.

The [README](../README.md) provides run instructions and a test breakdown.

## Lessons and limits

Building the demo highlighted three lessons:

- Define relationship meanings before choosing traversal rules.
- Preserve evidence so users can assess each explanation.
- Model documentation topics to make review targets specific.

The prototype also has clear limits:

- A small synthetic dataset covers one main engineering scenario.
- Real product data and review-time savings have not been evaluated.
- Each candidate shows one shortest path; alternatives are omitted.
- Missing or incorrect relationships can affect the review plan.

A second engineering scenario would test the approach further.
The current demo already supports its core task: **change a parameter,
see what may need review, and understand why.**

## Try the demo

These guides explain how to run and inspect the project:

- Follow [the README](../README.md) to run the local demo.
- See [the first working scenario](first-working-scenario.md) for the model
  and traversal policy.
