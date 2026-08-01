# sdd-lite

Status: MVP ready for use.

`sdd-lite` is a lighter SDD package for bounded changes.
It keeps explicit bootstrap, persisted artifacts, approvals, and resumability, but it now treats the orchestrator as a thin coordinator rather than a deep worker.

## What It Is

Use `sdd-lite` when you want:

- explicit bootstrap before change work
- persisted source of truth instead of chat-memory dependence
- compact functional and technical formalization
- one approved execution stage at a time
- unified QA for stage review and final closeout
- a lighter lifecycle than `sdd-v2`

`sdd-lite` is for bounded work.
It is not the right fit for migrations, broad redesigns, or repo-wide coordination problems.

## Runtime Model

`sdd-lite` follows a thin-orchestrator model:

- the orchestrator reads only the minimum persisted evidence needed to route safely
- real stage work runs in fresh workers
- the orchestrator passes artifact paths, short digests, and compact standards
- stage workers execute; they do not orchestrate other stages by default

This is the core rule:

- if a task inflates orchestrator context without need, delegate it

## Delegation Rules

Default runtime heuristics:

- inline only local routing decisions that require at most 3 repo files
- delegate bounded analysis when routing or planning needs 4 or more files
- delegate `sddl-proposal`, `sddl-spec`, `sddl-design`, `sddl-plan`, `sddl-executor`, and `sddl-qa-review` as fresh workers by default
- run `sddl-code-review` and `sddl-judgment-day` as orchestrator-executed protocols: read-only lens/judge workers, ledger written by the orchestrator
- do not run multi-file edits inline in the orchestrator
- do not run builds, installs, or broad test suites inline in the orchestrator
- do not delegate per file; delegate per phase or per approved execution stage

## Core Rules

- Bootstrap is mandatory before change routing.
- All runtime artifacts live under `./sdd-lite/`.
- `sdd-lite` never uses a root-level `openspec/`.
- Persisted files, contracts, schemas, templates, and generated Markdown stay in English.
- Chat interaction may be `es` or `en`.
- Every later stage requires explicit approval before it starts.
- `sddl-executor` must not perform hidden git side effects.
- `sddl-deep-explorer` is read-only.
- Review workers (4R lenses, judges, refuter) are read-only; only the orchestrator writes `review-ledger.md`.
- `sddl-judgment-day` is opt-in only and replaces the 4R review for its target.
- Review fixes always flow through `plan.md` and `stage_approval`; reviews never edit code directly.
- `sddl-qa-review` in `stage` mode never closes the change.
- Only `sddl-qa-review` in `final` mode may mark the change `completed`.
- Resume must be explainable from persisted state and artifacts, not from prior chat memory.

## Package Layout

```text
sdd/sdd-lite/
  README.md
  orchestrator/
    SDDL-ORCHESTRATOR.md
  skills/
    _shared/
      sddl-flow-contract.md
      sddl-persistence-contract.md
      sddl-user-interaction-contract.md
      sddl-project-standards-contract.md
      sddl-review-ledger-contract.md
    sddl-init/
      SKILL.md
    sddl-proposal/
      SKILL.md
    sddl-spec/
      SKILL.md
    sddl-design/
      SKILL.md
    sddl-plan/
      SKILL.md
    sddl-executor/
      SKILL.md
    sddl-code-review/
      SKILL.md
      references/
        lens-prompts.md
    sddl-judgment-day/
      SKILL.md
      references/
        judge-prompt.md
    sddl-deep-explorer/
      SKILL.md
    sddl-qa-review/
      SKILL.md
  templates/
    bootstrap/
      config.yaml
      project-context.md
      skill-catalog.md
    artifacts/
      proposal.md
      spec.md
      design.md
      plan.md
      execution-log.md
      qa-report.md
      macro-plan.md
      review-ledger.md
  schemas/
    config.schema.yaml
    state.schema.yaml
```

## Runtime Layout

All runtime files live under `./sdd-lite/`:

```text
./sdd-lite/
  project-context.md
  skill-catalog.md         # runtime standards registry
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
        macro-plan.md      # only when explicitly needed and approved
        review-ledger.md   # only when a 4R or judgment-day review ran
    reviews/
      {target-slug}/
        review-ledger.md   # standalone reviews without an active change
```

## Core Skills

| Skill | Role | Primary writes |
|---|---|---|
| `sddl-init` | bootstrap the repo for lite usage and build the runtime standards registry | `project-context.md`, `skill-catalog.md`, `openspec/config.yaml` |
| `sddl-proposal` | consolidate the change idea with optional lightweight exploration | `proposal.md`, `state.yaml` |
| `sddl-spec` | formal functional specification with firm scope boundary | `spec.md`, `state.yaml` |
| `sddl-design` | technical design: architecture, patterns, affected areas | `design.md`, `state.yaml` |
| `sddl-plan` | staged execution plan with dependencies and validation | `plan.md`, `state.yaml`, `macro-plan.md` when approved |
| `sddl-executor` | execute one approved stage at a time | repo files in approved scope, `execution-log.md`, `state.yaml` |
| `sddl-code-review` | 4R review protocol: triage, lens sweeps, refuter, findings ledger | `review-ledger.md`, `state.yaml` (orchestrator-written) |
| `sddl-judgment-day` | opt-in adversarial dual review with two blind judges (code or planning artifacts) | `review-ledger.md`, `state.yaml` (orchestrator-written) |
| `sddl-deep-explorer` | bounded read-only analysis | no persistent artifact by default |
| `sddl-qa-review` | stage review and final closeout | `qa-report.md`, `state.yaml` |

## Runtime Standards Registry

`./sdd-lite/skill-catalog.md` is the hot-path standards file for delegated work.

It should contain:

- skill triggers
- compact rules
- support-agent references
- delegation heuristics
- `Project Standards (auto-resolved)` blocks suitable for direct prompt injection

The orchestrator should resolve this file once and inject only the relevant compact rules into each worker prompt.

## Orchestrator Responsibilities

The orchestrator is the entry point.

It is responsible for:

- bootstrap preflight
- route selection
- resume behavior
- approval gating
- stage handoff safety
- stop conditions
- compact prompt assembly for delegated workers

It is not responsible for:

- replacing `sddl-init`
- deep repo exploration when delegation is cheaper
- multi-file implementation
- broad test/build/install work
- writing stage-owned artifacts
- trusting chat memory over persisted evidence

## Objectives And Routes

### Objectives

- `new-feature`
- `bug-fix`
- `planner`
- `refactor-rework`

### Routes

- `continue-lite`
- `macro-plan-first`
- `escalate-to-sdd-v2`

## Standard Flow

Normal flow:

```text
preflight
  -> sddl-init when bootstrap is missing or materially stale
  -> sddl-deep-explorer only when bounded evidence is needed
  -> sddl-proposal
  -> sddl-spec
  -> sddl-design
  -> sddl-plan
  -> sddl-executor (one approved stage at a time)
  -> sddl-code-review offer when the stage diff is non-trivial (trivial diffs skip silently)
  -> sddl-qa-review (stage) when useful
  -> sddl-executor / sddl-code-review / sddl-qa-review (stage) as needed
  -> sddl-qa-review (final, consumes review-ledger.md as evidence when it exists)
```

Key points:

- `proposal.md` owns problem framing and feasibility signal
- `spec.md` owns scope boundary and acceptance criteria
- `design.md` owns the technical approach and affected areas
- `plan.md` owns the execution plan
- `execution-log.md` owns implementation traceability
- `review-ledger.md` owns 4R / judgment-day findings and fix-round history
- `qa-report.md` owns review findings and closeout evidence
- the orchestrator should route from digests and metadata before rereading full artifacts

## Review Loops

Two review protocols complement the QA stage. Both produce `review-ledger.md`, run their reviewers as read-only workers, and never close a change or edit code — fixes always flow through a fix stage in `plan.md` with `stage_approval`.

### `sddl-code-review` (4R)

Default, cost-proportional diff review. The frozen target is triaged:

| Tier | Criteria | Lenses |
|---|---|---|
| trivial | only docs/comments/formatting | none |
| standard | everything else | exactly 1 (dominant risk) |
| full-4r | auth/security/payments/data, or > 400 changed lines | all 4 plus one refuter pass |

Severities: `BLOCKER/CRITICAL/WARNING/SUGGESTION`; only the first two enter the fix loop (max 2 rounds). Offered automatically after a non-trivial execution stage, or standalone ("review this diff/PR").

### `sddl-judgment-day`

Opt-in adversarial review (explicit request only: "judgment day", "dual review", "adversarial review"). Two blind judges review the same immutable target independently: both agree = `confirmed`, one reports = `suspect` (never auto-fixed), they contradict = `escalated` to the user. Works on code targets (`mode: code`, replaces 4R for that target) or planning artifacts (`mode: artifact`, feeds a rerun of the owning stage). Terminal states: `JUDGMENT: APPROVED` or `JUDGMENT: ESCALATED`.

### Standalone reviews

Both protocols run without an active change, persisting only `./sdd-lite/openspec/reviews/{target-slug}/review-ledger.md`. Confirmed severe findings suggest opening a change (mini or full) seeded from the ledger.

## Alternative Flows

### Planner Flow

```text
preflight
  -> sddl-proposal
  -> sddl-spec
  -> sddl-design
  -> sddl-plan
  -> stop(planned)
```

### Macro-Plan-First Flow

```text
preflight
  -> complexity assessment = macro-plan-first
  -> sddl-proposal
  -> sddl-spec
  -> sddl-design
  -> macro_plan_review checkpoint
  -> sddl-plan
  -> stop(planned)
```

### Escalation Flow

If the work behaves like a migration, large redesign, or broad coordination problem:

- stop lite routing
- persist the escalation reason in `state.yaml`
- recommend `sdd-v2`

## Artifact Ownership

| Artifact | Owner | Purpose |
|---|---|---|
| `project-context.md` | `sddl-init` | reusable repo context |
| `skill-catalog.md` | `sddl-init` | runtime standards registry |
| `config.yaml` | `sddl-init` | project identity, paths, quality commands |
| `state.yaml` | orchestrator + active stage | lifecycle, checkpoints, next action |
| `proposal.md` | `sddl-proposal` | problem framing and feasibility signal |
| `spec.md` | `sddl-spec` | scope boundary and acceptance criteria |
| `design.md` | `sddl-design` | technical approach and affected areas |
| `plan.md` | `sddl-plan` | staged execution plan |
| `execution-log.md` | `sddl-executor` | stage-by-stage execution ledger |
| `review-ledger.md` | orchestrator (via review protocols) | 4R / judgment-day findings and fix rounds |
| `qa-report.md` | `sddl-qa-review` | review findings and closeout evidence |

## Artifact Budget Guidance

Recommended runtime targets:

| Artifact | Budget |
|---|---|
| `proposal.md` | 200 to 400 words |
| `spec.md` | 300 to 500 words |
| `design.md` | 400 to 600 words |
| `plan.md` | 300 to 500 words |
| one `execution-log.md` stage entry | 150 to 300 words plus tables |
| `qa-report.md` stage summary | 300 to 500 words |
| `qa-report.md` final summary | 500 to 800 words |
| `review-ledger.md` | 200 to 400 words plus tables |

Each artifact should begin with a short digest that downstream stages can reuse cheaply.

## How To Use It

1. Run bootstrap first when `./sdd-lite/` is missing or stale.
2. Enter through the orchestrator for both new work and resume.
3. Let the orchestrator choose the route.
4. Use `sddl-proposal`, `sddl-spec`, `sddl-design`, and `sddl-plan` before implementation.
5. Approve execution stage by stage.
6. Use `sddl-qa-review` in `stage` mode when review is useful and in `final` mode at closeout.
7. Resume from `state.yaml` and owned artifacts, not from prior chat memory.

## How It Should Not Be Used

Do not use `sdd-lite` like this:

- jumping directly into `sddl-executor` without proposal, spec, design, and plan artifacts
- treating `stage` QA as if it were final completion
- using `macro-plan-first` as implicit approval to implement
- forcing oversized work to stay in lite after the orchestrator recommends escalation
- writing runtime artifacts outside `./sdd-lite/`
- letting git side effects happen implicitly
- turning the orchestrator into the main repo worker

## Relationship To `sdd-v2`

`sdd-lite` keeps the backbone of `sdd-v2`, but compresses the lifecycle:

| `sdd-v2` tendency | `sdd-lite` equivalent |
|---|---|
| more phases and artifacts | fewer phases and artifacts |
| heavier orchestration | thin coordinator plus delegated workers |
| separate stage QA and final verify | one `sddl-qa-review` skill with `stage` and `final` modes |
| heavier governance | faster flow with explicit escalation when safety drops |

Use `sdd-lite` first for bounded work.
Escalate to `sdd-v2` when the lite route is no longer safe.
