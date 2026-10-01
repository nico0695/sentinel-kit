# sdd-lite — Flow

Other docs: [architecture.md](./architecture.md) · [orchestrator.md](./orchestrator.md) · [skills.md](./skills.md) · [review-protocols.md](./review-protocols.md) · [config-and-state.md](./config-and-state.md)

The end-to-end path a change takes, and the three ways it can branch off the standard path. For *why* the orchestrator picks a given branch, see [orchestrator.md](./orchestrator.md). For what each stage actually does, see [skills.md](./skills.md).

## Standard flow (`continue-lite`)

```mermaid
flowchart TD
    Start([Request]) --> Preflight{Preflight}
    Preflight -->|missing/stale| Init[sddl-init]
    Init --> Preflight
    Preflight -->|ready| Explorer{Material unknown<br/>blocking routing?}
    Explorer -->|yes, bounded| DeepExplorer[sddl-deep-explorer<br/>read-only]
    DeepExplorer --> Proposal
    Explorer -->|no| Proposal

    Proposal[sddl-proposal<br/>→ proposal.md] --> Spec[sddl-spec<br/>→ spec.md]
    Spec --> Design[sddl-design<br/>→ design.md]
    Design --> Plan[sddl-plan<br/>→ plan.md]
    Plan -->|stage_approval| Executor[sddl-executor<br/>1 approved stage<br/>→ execution-log.md]

    Executor --> Triage{Diff triage}
    Triage -->|trivial| SkipReview[skip review silently]
    Triage -->|standard/full-4r| ReviewOffer{review_gate:<br/>offer review}
    ReviewOffer -->|default| CodeReview[sddl-code-review 4R]
    ReviewOffer -->|explicit opt-in| JudgmentDay[sddl-judgment-day]
    ReviewOffer -->|skip| SkipReview

    CodeReview -->|confirmed severe| FixRoute[review_gate: fix route<br/>→ sddl-plan fix stage<br/>→ stage_approval → sddl-executor]
    JudgmentDay -->|confirmed| FixRoute
    JudgmentDay -->|contradiction| Contradiction[review_gate:<br/>user adjudicates]
    FixRoute --> Executor
    Contradiction --> FixRoute

    CodeReview -->|clean/info only| QAStage
    JudgmentDay -->|approved, info only| QAStage
    SkipReview --> QAStage

    QAStage[sddl-qa-review<br/>stage mode] -->|more stages planned| Executor
    QAStage -->|ready for closeout| QAFinal[sddl-qa-review<br/>final mode]

    QAFinal -->|fail| Blocked([lifecycle: blocked])
    QAFinal -->|pass / pass_with_warnings, accepted| Completed([lifecycle: completed])

    Completed --> Closeout{Closeout offer}
    Closeout -->|delivery| Delivery[sddl-delivery<br/>commit/pr/ticket]
    Closeout -->|archive| Archive[sddl-archive<br/>single mode]
    Closeout -->|both, delivery first| Delivery --> Archive
    Closeout -->|neither| StaysActive([stays in changes/])
```

Key ownership per artifact along this path:

- `proposal.md` — problem framing and feasibility signal
- `spec.md` — scope boundary and acceptance criteria
- `design.md` — technical approach and affected areas
- `plan.md` — staged execution plan
- `execution-log.md` — implementation traceability
- `review-ledger.md` — 4R / judgment-day findings and fix-round history (only exists if a review ran)
- `qa-report.md` — review findings and closeout evidence
- `delivery-report.md` / `archive-report.md` — only if those skills ran

The orchestrator routes from digests and metadata in these files before rereading full bodies — see [config-and-state.md](./config-and-state.md).

Launch uses execution profiles, not extra stages: proposal → `sddl-framer`; spec/design → `sddl-architect`; plan → `sddl-sequencer`; archive/delivery → `sddl-light`; deep-explorer → `sddl-explorer`; executor → `sddl-executor`; 4R/judgment-day → `sddl-reviewer`; QA → `sddl-qa`. `state.yaml` still records skill ids.

## Standalone review flows

Both review protocols also run with no active change, triggered directly:

```text
"review this diff/PR"      → sddl-code-review  (triage → lenses → ledger)
"judgment day on X"        → sddl-judgment-day  (2 blind judges → convergence → verdict)
```

These persist only `./sdd-lite/openspec/reviews/{target-slug}/review-ledger.md`. If a standalone review confirms severe findings, the orchestrator suggests opening a change (mini or full) seeded from the ledger — it never fixes directly. Details in [review-protocols.md](./review-protocols.md).

## `planner` flow

Formalize and plan only; no execution ever starts.

```mermaid
flowchart LR
    A[Preflight] --> B[sddl-proposal] --> C[sddl-spec] --> D[sddl-design] --> E[sddl-plan] --> F([stop: lifecycle = planned])
```

`sddl-plan` is the terminal stage for `objective: planner`. `next_action` never auto-routes to execution or QA. A `planner` change is archivable once it reaches `planned` (`disposition: planned`) — this is a deliberate divergence from `sdd-v2`, where planner changes never archive.

## `macro-plan-first` flow

Used when work still fits lite but must be decomposed before execution is safe to approve.

```mermaid
flowchart LR
    A[Preflight] --> B[complexity assessment<br/>= macro-plan-first]
    B --> C[sddl-proposal] --> D[sddl-spec] --> E[sddl-design]
    E --> F{macro_plan_review<br/>checkpoint}
    F -->|approved| G[sddl-plan<br/>→ macro-plan.md]
    G --> H([stop: lifecycle = planned])
    F -->|narrow scope / stop| I([back to proposal or stop])
```

`macro-plan.md` is never written before the `macro_plan_review` checkpoint is explicitly approved. This route does not silently downgrade back to `continue-lite`, and it stays intentionally non-executable until a later, separate approval starts implementation.

## Escalation flow

Triggered when the request behaves like a migration, large redesign, or repo-wide coordination problem — at initial complexity assessment or at any later stop-condition check.

```mermaid
flowchart LR
    A[Escalation trigger] --> B[stop lite routing]
    B --> C[persist escalation reason in state.yaml]
    C --> D([recommend sdd-v2])
```

The lite state keeps recording the escalation route rather than pretending the work is still safely executable in lite; nothing in the lite change is deleted.

## Delivery and archive, in the flow

`sddl-delivery` and `sddl-archive` are not stages in the proposal→plan→execute chain — they act on a change *after* `sddl-qa-review` final mode, or standalone (delivery over a bare commit range, archive in batch mode for cleanup). Neither one is a quality gate:

- `sddl-delivery` drafts commit/PR/ticket text only; it never runs git, never calls a tracker, never touches `lifecycle_status`. It can read from an active change or an already-archived one — archiving first never blocks drafting delivery for that change later.
- `sddl-archive` moves a change's folder into `archive/`; it trusts the QA verdict as-is and never re-reviews. It never archives a `fail` verdict.

Full mode details (`commit`/`pr`/`ticket`, `single`/`batch`) are in [skills.md](./skills.md).
