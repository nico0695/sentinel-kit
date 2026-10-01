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
        delivery-report.md       # only when sddl-delivery ran for this change
    reviews/
      {target-slug}/
        review-ledger.md         # standalone reviews without an active change
    delivery/
      {target-slug}/
        delivery-report.md       # standalone delivery runs without an active change
    archive/
      {YYYY-MM-DD}-{change-name}/
        archive-report.md        # plus every artifact the change had
      _discarded/
        {YYYY-MM-DD}-{change-name}/   # abandoned, pending manual deletion
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
| delivery report | `./sdd-lite/openspec/changes/{change-name}/delivery-report.md` | `sddl-delivery` |
| archive report | `./sdd-lite/openspec/archive/{YYYY-MM-DD}-{change-name}/archive-report.md` | `sddl-archive` |

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

Standalone reviews are not archived. `sddl-archive` operates on `changes/` only.

## Standalone delivery artifacts

Delivery runs without an active change persist under `./sdd-lite/openspec/delivery/{target-slug}/`:

| Artifact | Canonical path | Owner |
|---|---|---|
| delivery report | `./sdd-lite/openspec/delivery/{target-slug}/delivery-report.md` | `sddl-delivery` |

`target-slug` follows the same charset and rules as a standalone review, with two additions: a bare commit range uses `commits-{first-short-sha}-{last-short-sha}`, and a delivery run sourced from an archived change uses that change's `change-name`.

A delivery run whose source is an archived change also writes here. `sddl-delivery` reads the archived folder but never writes into `archive/`, because an archived folder is fixed at archive time.

A standalone delivery run has no `state.yaml`. The digest at the top of its report is the only resume anchor and must always be current.

Standalone delivery runs are not archived. `sddl-archive` operates on `changes/` only.

## Archive artifacts

Archived changes live under `./sdd-lite/openspec/archive/`, owned by `sddl-archive`:

| Destination | Dispositions | Notes |
|---|---|---|
| `archive/{YYYY-MM-DD}-{change-name}/` | `closed`, `planned`, `superseded` | the durable record |
| `archive/_discarded/{YYYY-MM-DD}-{change-name}/` | `abandoned` | staged for manual deletion by the user |

Rules:

- `archive/` is a sibling of `changes/`, never a child. `changes/*/` therefore always lists active changes only, and `archive` is not a reserved `change-name`.
- `{YYYY-MM-DD}` is the archive date. The active `change-name` never carries a date.
- Archiving is a move of the whole folder. No artifact is pruned, rewritten, or merged on the way in.
- The archived `state.yaml` is the historical record: only `lifecycle_status`, `current_stage`, `stages.sddl-archive`, and `next_action` change.
- Nothing under `archive/` is ever deleted by a skill. `_discarded/` exists so the user can delete it manually with one literal path.
- Name collisions get a numeric suffix (`-2`, `-3`) recorded in `archive-report.md`; an existing archived folder is never overwritten.
- Reopening is a plain move back into `changes/{change-name}/` plus the state edit listed in the report.

## Ownership rules

- Project-scope bootstrap artifacts must not be silently rewritten by change stages.
- Each stage may rewrite its own primary artifact on rerun.
- Downstream stages may reference upstream artifacts but must not silently redefine approved scope or decisions.
- `state.yaml` may be updated before and after meaningful stage work.
- `sddl-deep-explorer` is read-only unless a future contract explicitly says otherwise.

## Artifact responsibility split

Use this split consistently:

- `project-context.md` for reusable repository context
- `skill-catalog.md` for the runtime standards registry, trigger map, compact rules, and execution-profile table
- `config.yaml` for project identity, canonical paths, bootstrap metadata, quality commands, and optional `execution_profiles`
- `proposal.md` for problem framing, desired outcome, initial scope sketch, and feasibility signal
- `spec.md` for firm scope boundary, acceptance criteria, expected behavior, and non-goals
- `design.md` for technical approach, architecture, patterns, interfaces, and affected areas
- `plan.md` for staged execution plan, dependencies, and validation strategy
- `execution-log.md` for stage-by-stage execution trace
- `qa-report.md` for stage review findings or final closeout findings
- `review-ledger.md` for 4R or judgment-day findings, corroboration, and fix-round history
- `delivery-report.md` for the frozen delivery target, the commit correlation evidence, the recorded commit SHAs, and which outputs were drafted
- `archive-report.md` for the disposition, final verdict, and explicit reopen steps of an archived change
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
- `delivery-report.md` must not exist unless `sddl-delivery` ran for that change or target.
- `delivery-report.md` is an audit and resume record, not a delivery surface: the drafted commit, PR, and ticket texts are always shown in chat as copyable blocks regardless of what was persisted.
- `sddl-delivery` may read from an archived change but never writes into `archive/`. The archived folder is fixed at archive time.
- Review workers (lenses, judges, refuter) never write files; only the orchestrator writes the review ledger.
- `sddl-qa-review` in `final` mode is the quality closeout point; `sddl-archive` is bookkeeping after it and never a second quality gate.
- If the safest path is `escalate-to-sdd-v2`, the lite change state should record that route and stop claiming lite completion.
