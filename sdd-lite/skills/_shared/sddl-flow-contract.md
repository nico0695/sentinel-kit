# sddl-flow-contract

This contract defines the canonical ids, execution flow, lifecycle, and result shape for `sdd-lite`.

## Scope

Use this contract to keep all lite skills aligned on:

- canonical objective ids
- route ids
- stage ids
- execution profile ids
- lifecycle rules
- thin-orchestrator rules
- context loading order
- common result structure

## Canonical ids

### Objective ids

| Value | Meaning |
|---|---|
| `new-feature` | introduce or expand behavior |
| `bug-fix` | correct a defect with regression awareness |
| `planner` | formalize the work without implementing it |
| `refactor-rework` | restructure code while preserving behavior unless explicitly stated otherwise |

### Route ids

| Value | Meaning |
|---|---|
| `continue-lite` | the request fits the normal lite flow |
| `macro-plan-first` | the request is too large to execute directly and should stop after an approved macro plan |
| `escalate-to-sdd-v2` | the request exceeds lite safety or complexity limits |

### Stage ids

These ids are the canonical change-stage names used in state and contracts.

| Value | Meaning |
|---|---|
| `sddl-deep-explorer` | bounded deep analysis when shallow context is not enough |
| `sddl-proposal` | lightweight problem framing, feasibility signal, and initial scope sketch |
| `sddl-spec` | formal functional specification with firm scope boundary and acceptance criteria |
| `sddl-design` | technical design: architecture, patterns, interfaces, affected areas |
| `sddl-plan` | staged execution plan with dependencies and validation strategy |
| `sddl-executor` | approved stage-by-stage execution |
| `sddl-code-review` | on-demand 4R code review of a frozen diff, producing `review-ledger.md` |
| `sddl-judgment-day` | opt-in adversarial dual review (two blind judges) of a code target or planning artifact |
| `sddl-qa-review` | stage review or final closeout |
| `sddl-delivery` | draft the commit message, pull request description, and ticket content for work already done |
| `sddl-archive` | move finished, planned, or abandoned changes into the archive tree |

Profile ids are not stage ids. Never write an execution profile into `state.yaml` `current_stage` or `stages`.

### Execution profile ids

Host CLI adapters. The named skill remains the phase algorithm. Source of truth for defaults: `templates/agents/profiles.yaml`.

| Profile | Skills it may execute | Capability | Tier |
|---|---|---|---|
| `sddl-light` | `sddl-archive`, `sddl-delivery` | workspace-write; prompt-scoped to `./sdd-lite/` | cheap |
| `sddl-framer` | `sddl-proposal` | workspace-write; prompt-scoped to `./sdd-lite/` | mid, high effort |
| `sddl-explorer` | `sddl-deep-explorer` | read-only | mid |
| `sddl-architect` | `sddl-spec`, `sddl-design` | workspace-write; prompt-scoped to `./sdd-lite/` | high |
| `sddl-sequencer` | `sddl-plan` | workspace-write; prompt-scoped to `./sdd-lite/` | mid |
| `sddl-executor` | `sddl-executor` | workspace-write; prompt-scoped to the approved stage | mid, high effort |
| `sddl-reviewer` | `sddl-code-review`, `sddl-judgment-day` | read-only | mid, high effort |
| `sddl-qa` | `sddl-qa-review` | workspace-write; prompt-scoped to its owned runtime artifacts | mid, high effort |

Tiering rule: decision stages (spec, design) run on the high tier, framing and execution over decided work run on the mid tier, mechanical stages run cheap, and verification (reviewer, QA) never runs below the code writer. Host models per tier live in `templates/agents/profiles.yaml`.

`workspace-write` grants access to the workspace; the narrower paths above are behavioral contract boundaries, not host-enforced subdirectory sandboxes.

| Stage | Profile |
|---|---|
| `sddl-proposal` | `sddl-framer` |
| `sddl-spec` | `sddl-architect` |
| `sddl-archive` | `sddl-light` |
| `sddl-delivery` | `sddl-light` |
| `sddl-deep-explorer` | `sddl-explorer` |
| `sddl-design` | `sddl-architect` |
| `sddl-plan` | `sddl-sequencer` |
| `sddl-executor` | `sddl-executor` |
| `sddl-code-review` | `sddl-reviewer` |
| `sddl-judgment-day` | `sddl-reviewer` |
| `sddl-qa-review` | `sddl-qa` |

`sddl-init` has no profile. It runs in the main session.

### Stage status ids

- `pending`
- `in_progress`
- `completed`
- `blocked`
- `skipped`

### Lifecycle status ids

| Value | Meaning |
|---|---|
| `draft` | change record exists but formalization is incomplete |
| `planning` | the change is being formalized or re-scoped |
| `planned` | planning is complete and the flow intentionally stops before implementation |
| `implementing` | approved execution is active |
| `reviewing` | QA review is in progress or required |
| `completed` | final QA closeout succeeded |
| `blocked` | safe progress cannot continue |
| `archived` | the change was moved out of the active tree by `sddl-archive` |

## Context ladder

Recover context in this order unless a stage-specific contract requires a tighter order:

1. `./sdd-lite/openspec/config.yaml`
2. `./sdd-lite/openspec/changes/{change-name}/state.yaml`
3. `./sdd-lite/skill-catalog.md` as the runtime standards registry
4. current change artifact digests or summaries
5. `./sdd-lite/project-context.md`
6. owned change artifacts when more detail is truly needed
7. maintained docs and executable project configuration
8. user clarification

Rules:

- persisted artifacts beat chat memory
- the orchestrator should prefer summaries and references before full artifact bodies
- executable repo evidence beats older summaries
- the user should only be asked after the recoverable evidence is exhausted

## Thin Orchestrator Rules

The orchestrator is an event loop, not a worker.

- Inline only local routing decisions that require at most 3 repo files.
- Delegate when routing, planning, execution, or QA requires 4 or more repo files.
- Delegate read-plus-write work together when implementation is likely.
- Do not perform multi-file code changes inline in the orchestrator.
- Do not perform installs, builds, or broad test runs inline in the orchestrator.
- Prefer artifact paths and short digests over copied artifact bodies.
- Treat `./sdd-lite/skill-catalog.md` as the source for `Project Standards (auto-resolved)`.
- Delegate to the mapped execution profile, which executes the named skill. Do not invent a profile per file.

## Worker handoff controls

Every delegated worker handoff must carry these controls before any stage-specific content:

```yaml
sddl_role: phase-worker # review-worker for lenses, judges, and refuters
stage: sddl-*
execution_profile: sddl-framer # or sddl-light | sddl-explorer | sddl-architect | sddl-sequencer | sddl-executor | sddl-reviewer | sddl-qa
orchestration_allowed: false
runtime_loading_allowed: false
```

Host wrappers evaluate these fields before sdd-lite activation. A matching worker executes only the named skill, does not read `orchestrator/SDDL-RUNTIME.md` or its modules, does not ask for session mode, does not route later stages, and does not launch descendants. The wrapper launches the CLI agent named in `execution_profile`. Missing controls are a malformed delegated handoff; the main orchestrator must correct it before retrying.

## Common result structure

Every lite stage result must be representable with:

### Required fields

| Field | Notes |
|---|---|
| `status` | `success`, `partial`, or `blocked` |
| `executive_summary` | short stage outcome |
| `artifacts` | created, updated, or referenced artifact paths |
| `next_action` | the safest recommended next step |
| `open_risks` | still-active risks after the stage |

### Optional fields

| Field | Notes |
|---|---|
| `decision_required` | true when the next safe step depends on the user |
| `decision_options` | structured options for the pending decision |
| `evidence` | commands, files, or observations backing the result |
| `findings` | structured review findings rows per `sddl-review-ledger-contract.md`; used by review workers (lenses, judges, refuter) |
| `errors` | structured blocking issues or validation failures |
| `context_resolution` | `injected_registry`, `fallback_registry`, `fallback_path`, or `none` |
| `standards_source` | registry path, version, or fallback note |
| `artifact_digests_used` | short list of digest sections or summaries consulted |
| `recommended_next_stage` | canonical stage id or terminal stop |

## Flow rules

- `sddl-init` is bootstrap-only and does not create change-scoped artifacts.
- `sddl-proposal` is the first canonical change stage and should initialize `state.yaml` when the change starts.
- `sddl-spec` requires `proposal.md` and defines the firm scope boundary and acceptance criteria.
- `sddl-design` requires `spec.md` and defines the technical approach and affected areas.
- `sddl-plan` requires `design.md` and defines the staged execution plan.
- `planner` stops after `sddl-plan` and leaves `lifecycle_status: planned`.
- `sddl-executor` must not start a code-touching stage without an explicit recorded approval.
- `sddl-deep-explorer` is read-only and on-demand.
- `sddl-qa-review` in `stage` mode never marks the change `completed`.
- `sddl-qa-review` in `final` mode is the only lite path that may set `lifecycle_status: completed`.
- `sddl-delivery` drafts delivery text and never changes `lifecycle_status`, never closes a change, and never archives one.
- `sddl-delivery` never executes a git write command and never calls an issue tracker: it produces text the user applies manually.
- `sddl-delivery` may read its source from `changes/{change-name}/` or from an archived copy, so archiving a change never blocks drafting its delivery text.
- `delivery-report.md` is not a resume anchor. Its absence never blocks resume, because delivery runs after closeout.
- `sddl-archive` is the only lite path that may set `lifecycle_status: archived`, and it writes that status only inside the archived copy.
- `sddl-archive` is opt-in and confirmed per change: it never runs automatically and never archives a change without a recorded decision.
- `sddl-archive` never deletes, never merges changes, and never archives a `fail` QA verdict.
- `planner` changes are archivable once they reach `planned`; `sddl-archive` records that as `disposition: planned`.
- `sddl-code-review` and `sddl-judgment-day` are review protocols executed by the orchestrator: their lens/judge workers are read-only, only the orchestrator writes `review-ledger.md`, and neither protocol may close a change or apply fixes directly.
- `sddl-code-review` and `sddl-judgment-day` are mutually exclusive per target; judgment-day replaces the 4R review for its target.
- `sddl-judgment-day` is opt-in only and never auto-routed.
- Review fixes always flow through `plan.md`: a fix stage from confirmed ledger ids, `stage_approval`, then `sddl-executor`.
- `macro-plan.md` exists only on the `macro-plan-first` route and only after explicit approval.
- `escalate-to-sdd-v2` should preserve lite state and recommendations without pretending the work is still safely executable in lite.
- Stage skills execute their own phase and must not become nested orchestrators by default.
- Runtime-critical rules should be inlined in the stage skill or injected via the handoff, not rediscovered through multi-hop document loading.

## Resume rules

- `state.yaml` is the operational resume anchor.
- `proposal.md`, `spec.md`, `design.md`, `plan.md`, `execution-log.md`, and `qa-report.md` hold the semantic detail for their owning stages.
- Resume should rebuild the next safe move from persisted files, not from chat memory.
