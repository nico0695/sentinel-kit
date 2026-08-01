# sddl-persistence-contract

This contract defines where `sdd-lite` stores durable data, who owns each artifact, and how writes stay contained.

## Canonical runtime layout

```text
./sdd-lite/
  project-context.md
  skill-catalog.md
  openspec/
    config.yaml
    changes/
      {change-name}/
        state.yaml
        proposal.md
        spec.md
        design.md
        plan.md
        execution-log.md
        qa-report.md
        macro-plan.md            # only when explicitly approved
        review-ledger.md         # only when a review ran for this change
    reviews/
      {target-slug}/
        review-ledger.md         # standalone reviews without an active change
```

No persisted lite artifact should be written outside `./sdd-lite/`.
`skill-catalog.md` is the runtime standards registry even though the file name stays the same for compatibility.

## `change-name` rule

`change-name` must use lowercase kebab-case:

```text
^[a-z0-9]+(?:-[a-z0-9]+)*$
```

Rules:

- no spaces
- no slashes
- no dates in the active change name
- the active path is always `./sdd-lite/openspec/changes/{change-name}/`

## Project-scope artifacts

| Artifact | Canonical path | Owner |
|---|---|---|
| project context | `./sdd-lite/project-context.md` | `sddl-init` |
| skill catalog | `./sdd-lite/skill-catalog.md` | `sddl-init` internal helper |
| project config | `./sdd-lite/openspec/config.yaml` | `sddl-init` |

## Change-scope artifacts

| Artifact | Canonical path | Owner |
|---|---|---|
| change state | `./sdd-lite/openspec/changes/{change-name}/state.yaml` | orchestrator plus active stage |
| proposal | `./sdd-lite/openspec/changes/{change-name}/proposal.md` | `sddl-proposal` |
| spec | `./sdd-lite/openspec/changes/{change-name}/spec.md` | `sddl-spec` |
| design | `./sdd-lite/openspec/changes/{change-name}/design.md` | `sddl-design` |
| plan | `./sdd-lite/openspec/changes/{change-name}/plan.md` | `sddl-plan` |
| execution ledger | `./sdd-lite/openspec/changes/{change-name}/execution-log.md` | `sddl-executor` |
| QA report | `./sdd-lite/openspec/changes/{change-name}/qa-report.md` | `sddl-qa-review` |
| macro plan | `./sdd-lite/openspec/changes/{change-name}/macro-plan.md` | `sddl-plan` on approved macro-plan-first flows |
| review ledger | `./sdd-lite/openspec/changes/{change-name}/review-ledger.md` | orchestrator, running the `sddl-code-review` or `sddl-judgment-day` protocol |

## Standalone review artifacts

Reviews without an active change persist under `./sdd-lite/openspec/reviews/{target-slug}/`:

| Artifact | Canonical path | Owner |
|---|---|---|
| review ledger | `./sdd-lite/openspec/reviews/{target-slug}/review-ledger.md` | orchestrator |

`target-slug` rules (same charset as `change-name`):

- a PR target uses `pr-{number}`
- a branch target uses the branch name in kebab-case
- any other target uses a short kebab-case slug of the target description

A standalone review has no `state.yaml`; the Review Digest at the top of its ledger is the only resume anchor and must always be current.

## Ownership rules

- Project-scope bootstrap artifacts must not be silently rewritten by change stages.
- Each stage may rewrite its own primary artifact on rerun.
- Downstream stages may reference upstream artifacts but must not silently redefine approved scope or decisions.
- `state.yaml` may be updated before and after meaningful stage work.
- `sddl-deep-explorer` is read-only unless a future contract explicitly says otherwise.

## Artifact responsibility split

Use this split consistently:

- `project-context.md` for reusable repository context
- `skill-catalog.md` for the runtime standards registry, trigger map, compact rules, and support-agent references
- `config.yaml` for project identity, canonical paths, bootstrap metadata, and quality commands
- `proposal.md` for problem framing, desired outcome, initial scope sketch, and feasibility signal
- `spec.md` for firm scope boundary, acceptance criteria, expected behavior, and non-goals
- `design.md` for technical approach, architecture, patterns, interfaces, and affected areas
- `plan.md` for staged execution plan, dependencies, validation strategy, and planning status
- `execution-log.md` for stage-by-stage execution trace
- `qa-report.md` for stage review findings or final closeout findings
- `review-ledger.md` for 4R or judgment-day findings, corroboration, and fix-round history
- `state.yaml` for lifecycle, resume, checkpoints, decisions, escalation route, and next action

`state.yaml` is operational memory, not a chat transcript and not a substitute for the stage artifacts.

## Artifact transfer rules

- Prefer artifact paths plus compact digests over pasted artifact bodies.
- Downstream stages should read the smallest artifact section that answers the current need.
- Each main artifact should begin with a short digest that the orchestrator can pass forward cheaply.
- Broad artifact rereads should happen only when the digest is insufficient or contradicted by repo reality.

## Artifact budget guidance

These are runtime targets, not hard schema limits:

| Artifact | Recommended budget |
|---|---|
| `proposal.md` | 200 to 400 words |
| `spec.md` | 300 to 500 words |
| `design.md` | 400 to 600 words |
| `plan.md` | 300 to 500 words |
| one `execution-log.md` stage entry | 150 to 300 words plus tables |
| `qa-report.md` stage summary | 300 to 500 words |
| `qa-report.md` final summary | 500 to 800 words |
| `review-ledger.md` | 200 to 400 words plus tables |

Rules:

- digests should stay shorter than the artifact body by a wide margin
- risks, open questions, and next action should appear near the top
- avoid repeating the same long narrative in both `state.yaml` and the stage artifact

## Lite persistence rules

- `macro-plan.md` must not exist unless the route is `macro-plan-first` and the user approved that path.
- `review-ledger.md` must not exist unless a `sddl-code-review` or `sddl-judgment-day` protocol ran for that change or target.
- Review workers (lenses, judges, refuter) never write files; only the orchestrator writes the review ledger.
- `sdd-lite` does not define archive persistence in the MVP.
- `sddl-qa-review` in `final` mode is the closeout point; there is no archive phase after it.
- If the safest path is `escalate-to-sdd-v2`, the lite change state should record that route and stop claiming lite completion.
