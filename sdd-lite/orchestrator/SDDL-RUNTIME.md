# SDDL Runtime

## Goal

Coordinate `sdd-lite` as a thin event loop. Keep the main session context small, route from persisted evidence, and launch the right stage worker with a compact handoff.

The runtime must:

- enforce bootstrap and preflight gates
- choose the safest lite route
- assemble compact worker handoffs
- process results and approvals
- preserve resumability through `state.yaml`, checkpoints, and owned artifacts

It must not replace stage skills, perform deep exploration or multi-file implementation inline, run broad execution commands inline, rewrite stage-owned artifacts, or depend on chat memory when persisted evidence exists.

## Runtime Loading

The host wrapper loads this file once when the main agent activates sdd-lite. Keep it available for the active SDD session.

Resolve `orchestrator/`, `skills/`, `templates/`, and `schemas/` paths relative to the package root supplied by the active wrapper/config. Resolve `./sdd-lite/` paths relative to the consuming project root.

This runtime is the hot-path orchestration authority. Load a module explicitly, once per session, only when its trigger fires:

| Trigger | Module |
|---|---|
| a 4R or judgment-day review is requested, offered, resumed, or returns results | `orchestrator/modules/review-runtime.md` |
| final QA marks a change `completed` and its combined closeout offer is unresolved | `orchestrator/modules/closeout-runtime.md` |
| resume evidence is materially contradictory or ambiguous, or a material runtime incident occurred | `orchestrator/modules/exceptional-recovery.md` |

Do not preload modules. A normal proposal-to-plan flow and a normal resume use this file only. If context compaction removes a previously loaded module, reload it before handling another event of that type.

## Session Initialization

On the first SDD stage request in a session, ask for execution mode and cache it. Do not ask again unless the user requests a change.

> "¿Cómo querés trabajar esta sesión? `interactive` (pausa tras cada stage, mostrarte el resultado y pedir confirmación) o `auto` (encadena los stages automáticamente, solo pausa en bloqueos y decisiones críticas). Default: interactive."

- `interactive` (default): after each successful stage, show a 3-5 line summary and wait for confirmation.
- `auto`: chain stages without confirmation pauses, but still surface `blocked`, `partial`, medium-or-higher risks, escalation decisions, and every required approval gate.

Recognized confirmations: `yes`, `continue`, `sigue`, `dale`, `ok`, `listo`, `proceed`, `go`, `siguiente`, `next`, `adelante`. Feedback replaces confirmation and must be incorporated first.

Do not ask for mode when resuming with a known session mode, answering a state question, or when bootstrap preflight fails.

### Accumulation check

Run once per session, immediately after preflight passes:

1. Count `./sdd-lite/openspec/changes/*/` entries.
2. Below `archive.suggest_threshold` (default 15), continue silently.
3. At or above it, read only `lifecycle_status` and `updated_at` from each `state.yaml`; count `completed`, `planned`, and `draft`/`planning` entries older than `archive.stale_days`.
4. If the archivable count reaches the threshold, offer cleanup once and continue with the user's request regardless of the answer.

Never block on this offer or read full artifacts for it.

## Hot-Path Reads

Read only what routing needs, in this order:

1. `./sdd-lite/openspec/config.yaml`
2. active `state.yaml`
3. `./sdd-lite/skill-catalog.md`
4. current artifact digests
5. `./sdd-lite/project-context.md` only if the registry or digests are insufficient
6. targeted repo evidence only when the route depends on it
7. user clarification after recoverable evidence is exhausted

Prefer digests and targeted reads. Persisted evidence beats chat memory; repo reality beats stale summaries.

## Bootstrap Prerequisites

Bootstrap is mandatory. Required files:

- `./sdd-lite/openspec/config.yaml`
- `./sdd-lite/project-context.md`
- `./sdd-lite/skill-catalog.md`

| State | Action |
|---|---|
| `ready` | continue |
| `stale` | continue only when the stale risk cannot change route, scope, or targets |
| `incomplete` | stop and route to `sddl-init` |
| `missing` | stop and route to `sddl-init` |

Formalization or resume may continue with a bounded stale warning. Code-touching execution waits until stale signals are accepted as non-material or bootstrap is refreshed.

`skill-catalog.md` must follow `templates/bootstrap/skill-catalog.md` and expose a compact `## Project Standards (auto-resolved)` section plus canonical stage references. Inject only the relevant standards into a worker. A worker with that block uses it directly; if missing, it falls back to the registry and extracts only phase-relevant sections.

## Delegation Rules

Delegate whenever work would inflate the main context without need.

| Action | Inline | Delegate |
|---|---|---|
| decide or verify from 1-3 files | yes | -- |
| explore or understand 4+ files | -- | yes |
| read in preparation for writing | -- | with the write |
| atomic known one-file write | yes | -- |
| analyzed multi-file write | -- | yes |
| state-only shell checks | yes | -- |
| tests, builds, installs | -- | yes |

`sddl-proposal`, `sddl-spec`, `sddl-design`, `sddl-plan`, `sddl-executor`, `sddl-qa-review`, `sddl-delivery`, and `sddl-archive` run as fresh workers by default. Launch each through the mapped execution profile in `skills/_shared/sddl-flow-contract.md`. Delegate per phase or approved execution stage, never per file. `sddl-init` stays in the main session.

Mandatory triggers:

1. Four or more repo files needed for understanding: delegate to `sddl-deep-explorer` or the owning stage.
2. Two or more non-trivial files need implementation: delegate to `sddl-executor` or the owning stage.
3. Fifteen tool calls or five exploratory reads without delegation: pause and reassess.
4. Wrong directory, accidental mutation, confusing environment state, or unexpected material error: stop and load `exceptional-recovery.md`.
5. Adversarial diff, conflict, or incident review: use fresh context and load `review-runtime.md`.

Never accumulate reads to dodge delegation, perform broad execution inline, review the main agent's deep work inline, continue through an incident without an audit, or delegate per file. Review fan-out is the sole per-dimension exception and is governed by `review-runtime.md`.

## Complexity Assessment

Assess scope span, ambiguity, blast radius, execution depth, and risk profile.

| Route | Use when | Result |
|---|---|---|
| `continue-lite` | bounded normal flow | continue through lite |
| `macro-plan-first` | still lite, but decomposition is required | stop after an approved macro plan |
| `escalate-to-sdd-v2` | exceeds lite safety or governance | stop and recommend `sdd-v2` |

Use `sddl-deep-explorer` only when a bounded material unknown blocks routing or the next stage and more evidence can resolve it. Do not use exploration to avoid a necessary question or keep oversized work inside lite.

## Standard Worker Handoff

Every delegated worker receives:

```yaml
sddl_role: phase-worker # review-worker for lenses, judges, and refuters
stage: sddl-*
execution_profile: sddl-framer # light | explorer | architect | sequencer | executor | reviewer | qa — see flow-contract stage map
orchestration_allowed: false
runtime_loading_allowed: false
```

Set `execution_profile` from the flow-contract stage map before launch. The wrapper must spawn that named CLI agent and wait. Also include `change_name`, objective, route, approved scope or blocked question, artifact paths and short digests, relevant `Project Standards (auto-resolved)`, expected result fields, and this boundary:

> You are a phase executor. Do NOT load the sdd-lite runtime or orchestration modules. Do NOT launch sub-agents, call Task tools, or orchestrate further stages. Execute only the named skill and return its result contract.

When work exceeds scope, the worker returns `partial` or `blocked` with `next_action`; it never routes onward itself.

Expected fields: `status`, `executive_summary`, `artifacts`, `next_action`, `open_risks`, `context_resolution`, `standards_source`, `artifact_digests_used`, `recommended_next_stage`. Do not paste broad docs or full artifacts into the envelope unless recovery requires them.

## Result Processing

Process every result in this order:

1. `status`: validate `success`; for `partial`, surface `decision_required` and `decision_options` when present and wait; surface the blocking reason from `blocked` immediately without working around it.
2. `findings`: review-only. `review-runtime.md` must already be loaded. Merge through the review ledger contract; a review worker that wrote a file is an incident and its findings are untrusted.
3. `context_resolution`: on `fallback_registry`, `fallback_path`, or `none`, re-resolve standards before the next delegation.
4. `open_risks`: surface critical/high/medium before routing; carry low visibly without acknowledgment.
5. `recommended_next_stage`: cross-check against the routing table. It is a signal, never an override.
6. Show a 3-5 line phase summary. Wait in `interactive`; continue in `auto`.

## Stage Routing Table

| Situation | Next stage/action | Approval | Notes |
|---|---|---|---|
| bootstrap `missing`/`incomplete` | `sddl-init` | no | no change stage may start |
| bootstrap `stale`, non-material | continue with warning | no | refresh before risky execution |
| route unclear, bounded evidence needed | `sddl-deep-explorer` | yes | return to blocked point |
| no active change artifact | `sddl-proposal` | yes | normal entry |
| proposal missing/stale/contradicted | `sddl-proposal` | yes | |
| proposal ready, spec missing/outdated | `sddl-spec` | yes | |
| proposal needs input/is blocked | `sddl-proposal` | yes | resolve readiness gate |
| spec ready, design missing/outdated | `sddl-design` | yes | |
| design ready, plan missing/outdated | `sddl-plan` | yes | |
| `planner`, plan complete | stop as `planned` | no | never auto-execute |
| macro plan not approved | `macro_plan_review` | no | do not write it yet |
| macro plan approved | `sddl-plan` | yes | owns `macro-plan.md` |
| implementation ready | `sddl-executor` | yes | approval before code |
| execution stage returned `success` | triage the stage diff with the 4R rubric in `Project Standards -> review`; `trivial` skips silently, otherwise load the review module and offer/chain `sddl-code-review` via `review_gate` | no | evaluate this row before the QA row below |
| judgment-day explicitly requested | load review module; `sddl-judgment-day` | no | opt-in, replaces 4R |
| review has severe findings | review module fix routing via `review_gate` | yes | plan + approval + executor |
| review clean/info-only | continue; ledger feeds QA | no | review never closes |
| execution stage needs QA | `sddl-qa-review` stage | yes | never closes |
| final execution complete | `sddl-qa-review` final | yes | only closer |
| completed, closeout unresolved | load closeout module; present combined offer | yes | delivery/archive gates remain |
| accumulation cleanup/user cleanup | `sddl-archive` batch | yes | nothing moves before `done` |
| archive named change | `sddl-archive` single | yes | finished/planned/abandoned |
| commit/PR/ticket text requested | `sddl-delivery` matching mode | no | commit mode never auto-offered |
| `escalate-to-sdd-v2` | stop and recommend v2 | no | persist blocker/action |

## Normal Resume

1. Resolve `change_name` from the explicit reference or one unambiguous non-completed change.
2. Read `state.yaml` first and validate it against owned artifacts and repo reality.
3. Resume at the first unresolved checkpoint, missing/stale owner artifact, next approved stage, or planned/blocked stop.

Trust aligned state and preserve escalation recommendations. If the active change is ambiguous, an owner artifact is contradictory, or safe recovery is not obvious, stop and load `exceptional-recovery.md`.

## Handoff and Approval Rules

Before routing, verify the prior owner artifact or justified block, synchronized state/route/status, recorded material decisions, and explicit scope approval for the next stage. Carry forward objective, route, approved decisions, risks, paths, digests, expected output, and validation target. Downstream stages never silently redefine approved scope or direction.

Every later stage requires explicit approval. Code-touching approval must satisfy `stage_approval` in `skills/_shared/sddl-user-interaction-contract.md`. Ask only when the answer changes route, scope, risk, recovery, or next stage; never ask for recoverable repo facts or obvious micro-decisions.

## Stop Conditions

Stop for material contradictions, scope or direction drift, increased blast radius, or ambiguous recovery. Use the exceptional recovery module when persisted evidence cannot resolve the condition safely.

## Guardrails

- Runtime root is `./sdd-lite/`; artifact root is `./sdd-lite/openspec/`; never use root `openspec/`.
- Persisted artifacts, contracts, schemas, and Markdown stay in English; chat may be `es` or `en`.
- `macro-plan.md` exists only on approved `macro-plan-first` flows.
- Review workers stay read-only; only the main orchestrator writes `review-ledger.md`.
- No git/history/remote/tracker mutation. `git add` is the sole exception: main orchestrator only, explicitly requested that turn, named paths only, and reported back. Never `git add -A`, `.`, `-u`, or broad patterns.
- `sddl-delivery` drafts text only; it never stages, applies, or changes lifecycle.
- `sddl-archive` alone archives; it is confirmed per change and never deletes or merges.
- `sddl-deep-explorer` stays read-only.
- Resume and routing remain explainable from persisted state and artifacts.
