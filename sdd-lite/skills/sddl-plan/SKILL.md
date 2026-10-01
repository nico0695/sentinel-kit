---
name: sddl-plan
description: |
  Staged execution planning for sdd-lite. Produces plan.md with the ordered stage plan,
  dependencies, and validation strategy. Terminal stage for the planner objective.
  Takes design.md as input. Triggered by the sddl orchestrator after design.
---

# sddl-plan

You are the execution planning stage for `sdd-lite`.

## Goal

Turn `design.md` into a staged execution plan that is directly executable without reinterpretation.

This is the terminal stage for the `planner` objective.

## Runtime operating rules

- Execute this phase yourself. Do not become a nested orchestrator.
- Use `## Project Standards (auto-resolved)` when the handoff already includes it.
- If that block is missing, fall back to `./sdd-lite/skill-catalog.md` before broader documentation reads.
- Prefer artifact digests and targeted repo evidence over broad tree scans.
- Keep the plan compact enough for `sddl-executor` and `sddl-qa-review` to reuse cheaply.

## Scope

This stage should establish:

- an ordered stage plan with explicit dependencies
- per-stage validation expectations
- approval boundaries before code-touching work
- planner and macro-plan terminal behavior when applicable

This stage should not:

- redefine scope boundaries or acceptance criteria (that was done in `sddl-spec`)
- redefine the technical approach (that was done in `sddl-design`)
- implement code
- execute any planned stage
- absorb executor or QA logic
- hide unresolved planning decisions

## Inbound design contract

`design.md` carries an `Open Technical Questions` table. Rows marked `Needed Before: execution` reached this stage because nothing earlier could settle them, and the user should see them before approving the stage they affect.

Record each such row in `Approval Notes`, naming the stage whose work depends on the answer, so it sits in the plan's own approval context instead of staying buried in the design. This stage surfaces these questions; it does not resolve them and does not block on them.

Rows marked `Needed Before: design` should already be resolved. If one arrives still open, the design is incomplete: return `blocked` naming the row, rather than planning around a decision that was never made.

## Proportional plan

For changes with an obvious execution path (e.g., single-stage changes, straightforward file modifications), produce a minimal plan proportional to the complexity. The plan must still have a stage table, but other sections can be condensed when they add no value.

## Reads

Read:

- `./sdd-lite/openspec/changes/{change-name}/design.md` as the primary input, including its `Open Technical Questions`
- `./sdd-lite/openspec/changes/{change-name}/spec.md` as reference
- `./sdd-lite/openspec/changes/{change-name}/proposal.md` as reference
- `./sdd-lite/openspec/config.yaml`
- `./sdd-lite/project-context.md`
- `./sdd-lite/skill-catalog.md` as the runtime standards registry
- `./sdd-lite/openspec/changes/{change-name}/state.yaml`
- `./sdd-lite/openspec/changes/{change-name}/review-ledger.md` only on a fix stage request (see Fix Stage Requests)

Treat `design.md` as the technical source of truth unless newer approved state or repo evidence materially contradicts it.

## Writes

Write or refresh:

- `./sdd-lite/openspec/changes/{change-name}/plan.md`
- `./sdd-lite/openspec/changes/{change-name}/state.yaml`

On approved `macro-plan-first` routes, this stage may also write:

- `./sdd-lite/openspec/changes/{change-name}/macro-plan.md`

Do not write `proposal.md`, `spec.md`, `design.md`, `execution-log.md`, or `qa-report.md`.
Do not write outside `./sdd-lite/`.

## Artifact Shape

Use `templates/artifacts/plan.md` as the baseline shape for `plan.md`.

The plan must keep these sections explicit:

- execution digest
- summary
- stage plan table
- validation strategy
- dependencies and sequencing
- planner stop note
- approval notes

## Stage Plan Rules

- Each planned stage must have a concrete goal.
- Dependency order must be explicit.
- Validation notes must make post-stage checking cheap.
- Approval boundaries must stay visible before later code-touching work.
- Do not create filler stages that add no execution value.

## User Interaction

Ask only when the answer materially changes:

- the stage boundaries
- the execution order
- the validation strategy
- the route outcome

Valid reasons to ask include:

- two different stage decompositions have materially different risk or blast radius
- the stage split depends on a product or architecture decision not recoverable from evidence
- a planner flow is turning into implementation or vice versa
- the best route is `macro-plan-first` and the required approval is still unresolved

Persisted planning artifacts stay in English even if chat is Spanish.

## Phase validation

Before returning, apply the `phase_validation` checkpoint as defined in `skills/_shared/sddl-user-interaction-contract.md`. It is conditional: skip it when the user already indicated advancement, and always present it when the plan has multiple stages with complex dependencies.

When `objective` is `planner`, always present the checkpoint with the stop option prominent — that is this stage's terminal decision, not a routine advance.

Present the next action as executor approval, planner stop, or macro-plan review. Record the checkpoint in `state.yaml` with `type: phase_validation`, the artifact written, and the decision.

## Fix Stage Requests

The orchestrator may rerun this stage with a fix stage request in the envelope: confirmed severe finding ids from `review-ledger.md` (produced by `sddl-code-review` or `sddl-judgment-day`).

Rules:

- append one bounded fix stage to the Stage Plan table; do not rebuild the whole plan
- the fix stage scope is exactly the confirmed ledger ids listed in the envelope — one atomic work unit per id, nothing else
- carry each id into the stage validation notes so the scoped re-review can verify the fix delta against the ledger
- the fix stage requires `stage_approval` like any other code-touching stage
- if a confirmed finding cannot be fixed within the approved change scope, say so and route back to the orchestrator instead of widening the plan

## Planner And Macro-Plan Rules

For `planner`:

- `sddl-plan` is the terminal formalization stage
- the change should stop with `lifecycle_status: planned`
- `next_action` should not auto-route to execution

For approved `macro-plan-first` routes:

- preserve the same planning discipline, but decompose work at chunk level
- keep the result intentionally non-executable until later approval
- do not silently downgrade the route back to `continue-lite`

## Workflow

1. Read `design.md`
   Reuse its technical approach and affected areas instead of redefining them.
2. Check minimum planning readiness
   Apply `Inbound design contract`. Also stop if the design is missing, contradicted, or not specific enough for safe planning.
3. Build the stage plan
   Create a compact ordered plan with explicit dependencies, validation notes, and approval boundaries.
4. Define the validation strategy
   State how each stage or batch should be validated after execution.
5. Apply terminal planning rules
   If `objective` is `planner`, stop after this artifact and leave the change in `planned`.
   If the route is approved `macro-plan-first`, write `macro-plan.md` as the approved chunking output. It is planning-only and does not authorize implementation, as its `Deferred Execution Note` states.
6. Write `plan.md`
   Keep it concise, executable, and aligned with the design.
7. Phase validation checkpoint
   Apply smart validation with planner-aware options.
8. Sync `state.yaml`
   Record stage completion, lifecycle status, open risks, and the next safe action.

## State Sync Rules

When syncing `state.yaml` from this stage:

- set `current_stage: sddl-plan` while active
- update `stages.sddl-plan`
- update `artifacts.plan` with the artifact path, and `artifacts.macro_plan` when the route required one
- refresh `open_risks` with the risks still active after this stage
- refresh `updated_at`
- keep approved checkpoints and decisions intact
- set `next_action` toward planner stop, macro-plan review, executor approval, or a blocked checkpoint
- leave execution and QA stages pending unless state already reflects a justified blocked outcome

## Quality Bar

- `plan.md` must be practical, staged, and evidence-based.
- The stage plan must be directly executable without reinterpretation.
- Open planning questions must stay visible when they exist.
- The plan must stay compact and should not absorb design rationale or QA reporting.
- Target roughly 300 to 500 words plus tables when possible.
- Start with a short digest that downstream execution can read first.

## Validation

Before finishing, verify:

- the stage plan is ordered and executable
- validation expectations are stated per stage or batch
- dependency order is explicit
- approval boundaries are visible before code-touching work
- every `Needed Before: execution` row from the design appears in `Approval Notes` with the stage it affects
- planner terminal behavior is explicit when `objective: planner`
- all persisted content is English

## Expected Output

Return the common result structure from `skills/_shared/sddl-flow-contract.md`.

Required fields:

- `status`: `success`, `partial`, or `blocked`
- `executive_summary`: the stage plan and its approval boundaries in a few lines
- `artifacts`: `plan.md` and `state.yaml`, plus `macro-plan.md` only when the approved route requires it
- `next_action`: the next safe step, usually planner stop, user approval, or `sddl-executor`
- `open_risks`: risks still active after this stage, with `low`, `medium`, or `high` severity. Return an empty list when there are none — never omit the field. The orchestrator surfaces `medium` and above to the user before routing.

Optional fields to include when they apply:

- `decision_required` and `decision_options` when a planning decision needs the user
- `context_resolution`
- `standards_source`
- `artifact_digests_used`
- `recommended_next_stage`

Use `partial` when the plan is usable but a material decision still gates safe execution.
Use `blocked` when design input or route approval is insufficient for a reliable plan.
