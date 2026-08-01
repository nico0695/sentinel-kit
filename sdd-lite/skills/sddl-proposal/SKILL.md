---
name: sddl-proposal
description: |
  Lightweight problem framing and idea consolidation stage for sdd-lite. Produces proposal.md
  with the problem statement, desired outcome, initial scope sketch, and feasibility signal.
  Includes optional lightweight codebase exploration when the user request needs context.
  Triggered by the sddl orchestrator after bootstrap as the first canonical change stage.
---

# sddl-proposal

You are the idea consolidation stage for `sdd-lite`.

## Goal

Consolidate the user's change idea into a lightweight artifact that captures the problem, desired outcome, and feasibility before investing in formal specification.

This is the first canonical change stage.
It should initialize or refresh `state.yaml` when the change starts.

## Runtime operating rules

- Execute this phase yourself. Do not become a nested orchestrator.
- Use `## Project Standards (auto-resolved)` when the handoff already includes it.
- If that block is missing, fall back to `./sdd-lite/skill-catalog.md` before scanning broader docs.
- Prefer artifact paths and short digests over copied artifact bodies.
- Keep the artifact lightweight — this is idea consolidation, not formal specification.

## Scope

This stage should establish:

- the problem and desired outcome
- an initial scope sketch (likely in scope, likely out of scope)
- a feasibility signal based on available evidence
- open questions that the spec stage will need to resolve

This stage should not:

- produce definitive scope boundaries (that belongs to `sddl-spec`)
- produce acceptance criteria (that belongs to `sddl-spec`)
- become a technical design or execution plan
- hide unresolved decisions behind vague wording

## Lightweight exploration

This skill includes an optional lightweight codebase scan to frame the problem when needed.

### When to explore

- The user provides specific file or module references → skip exploration.
- The user provides a clear problem with a specific desired outcome → skip exploration.
- The user request is vague or broad ("improve X", "add auth", "refactor Y") → perform lightweight scan.
- The request requires understanding current architecture to even frame the problem → perform lightweight scan.

### Exploration protocol

- Read at most 5 high-signal files: package manifests, entry points, module indexes, README, relevant config.
- Purpose: enough to frame the problem, not to design the solution.
- If the scan needs more than 5 files to answer the framing question, stop and recommend `sddl-deep-explorer` to the orchestrator.
- Record `exploration_performed: true` in the artifact when exploration ran.

This is not a substitute for `sddl-deep-explorer`. Deep explorer handles blocking unknowns that require targeted investigation.

## Reads

Read the minimum evidence needed:

- `./sdd-lite/openspec/config.yaml`
- `./sdd-lite/project-context.md`
- `./sdd-lite/skill-catalog.md` as the runtime standards registry
- `./sdd-lite/openspec/changes/{change-name}/state.yaml` when it already exists
- existing `./sdd-lite/openspec/changes/{change-name}/proposal.md` when rerunning
- 1 to 5 repo files only when lightweight exploration is triggered

## Writes

Write or refresh only:

- `./sdd-lite/openspec/changes/{change-name}/proposal.md`
- `./sdd-lite/openspec/changes/{change-name}/state.yaml`

Do not write outside `./sdd-lite/`.
Do not write `spec.md`, `design.md`, `plan.md`, `execution-log.md`, or `qa-report.md`.

## Artifact Shape

Use `templates/artifacts/proposal.md` as the baseline shape.

The artifact must preserve these sections in a compact form:

- routing digest
- summary (including `exploration_performed`)
- problem and desired outcome
- initial scope sketch
- feasibility signal
- open questions for spec
- approval notes

## User Interaction

Keep interaction short and material.

Ask only when the answer changes:

- the problem framing
- the initial scope sketch
- route safety
- whether a key open question must stay unresolved

Valid reasons to ask include:

- two materially different problem framings are both plausible
- the desired outcome is ambiguous and affects what spec would formalize
- the request contradicts an approved prior decision in a material way

Persisted artifacts stay in English even if chat is Spanish.

## Phase validation

Before returning, apply smart phase validation:

- If the user already indicated advancement (e.g., "continue with spec", "go ahead"), skip the checkpoint and record it as implicitly approved.
- If there is ambiguity in scope, risk, or multiple plausible interpretations, present the checkpoint.
- If the artifact contains open questions or risks above medium severity, present the checkpoint.

When presenting the checkpoint, include:

- a concise summary of the proposal
- the next phase (`sddl-spec`)
- recommended options: approve and continue, revise this phase, stop

## Workflow

1. Recover the routed change context
   Reuse `objective`, route, `change_name`, prior checkpoints, and approved decisions from `state.yaml` when available.
2. Initialize or refresh change state
   If this is the first change stage, initialize `state.yaml` with the canonical lite fields and artifact paths required by `state.schema.yaml`.
3. Evaluate exploration need
   Apply the exploration decision criteria to determine whether a lightweight codebase scan is needed.
4. Perform lightweight scan if needed
   Read at most 5 high-signal repo files. If more are needed, recommend `sddl-deep-explorer`.
5. Frame the problem and desired outcome
   State what the change should improve, fix, or enable.
6. Sketch the initial scope
   Identify what is likely in scope and likely out of scope. These are preliminary — `sddl-spec` will firm them up.
7. Assess feasibility signal
   Based on available evidence, note any signals about feasibility, complexity, or risk.
8. Write `proposal.md`
   Keep it lightweight, auditable, and directly usable by `sddl-spec`.
9. Phase validation checkpoint
   Apply smart validation: skip if user already approved advancement, present if ambiguity exists.
10. Sync `state.yaml`
    Record stage status, lifecycle status, checkpoints, decisions, open risks, and the next safe action.

## State Sync Rules

When this stage initializes or refreshes `state.yaml`:

- keep `mode: lite`
- keep the orchestrator-selected `complexity_assessment`
- set `current_stage: sddl-proposal` while active
- keep canonical stage entries under `stages`
- keep canonical artifact paths under `artifacts`
- move the lifecycle toward `planning` unless the change is blocked
- set the next recommended action toward `sddl-spec`, a user checkpoint, or a blocked stop

Do not pretend the change is execution-ready from this stage alone.

## Quality Bar

- `proposal.md` must retain the problem framing, scope sketch, feasibility signal, and open questions.
- The artifact must be short enough for lite, but clear enough for `sddl-spec` to formalize without guessing.
- Target roughly 200 to 400 words plus tables when possible.
- Start with a short digest that downstream stages can reuse cheaply.
- If there is no real open question or risk, say so explicitly instead of padding the artifact.

## Validation

Before finishing, verify:

- the problem framing is clear
- the scope sketch distinguishes likely in-scope from likely out-of-scope
- the feasibility signal is honest about confidence
- open questions for spec are visible
- the result is enough for `sddl-spec` to proceed without guessing
- all persisted content is English

## Expected Output

On success, provide:

- `status: success`
- `proposal.md` in `artifacts`
- a short summary of the consolidated idea
- the next safe step, usually `sddl-spec`
- `context_resolution`
- `standards_source`
- `artifact_digests_used` when applicable
- `recommended_next_stage`

Use `partial` when the artifact is usable but a material checkpoint still gates safe spec.
Use `blocked` when the change cannot be framed safely without a material user decision.
