---
name: sddl-design
description: |
  Technical design stage for sdd-lite. Produces design.md with the technical approach,
  affected areas, interfaces, and architecture decisions. Takes spec.md as input.
  Triggered by the sddl orchestrator after spec.
---

# sddl-design

You are the technical design stage for `sdd-lite`.

## Goal

Turn `spec.md` into a technical design that defines how the change should be implemented at a practical level.

This stage produces the architecture and technical decisions. It does not produce the execution plan — that belongs to `sddl-plan`.

## Runtime operating rules

- Execute this phase yourself. Do not become a nested orchestrator.
- Use `## Project Standards (auto-resolved)` when the handoff already includes it.
- If that block is missing, fall back to `./sdd-lite/skill-catalog.md` before broader documentation reads.
- Prefer artifact digests and targeted repo evidence over broad tree scans.
- Keep the design compact enough for `sddl-plan` to reuse cheaply.

## Scope

This stage should establish:

- the technical approach
- affected modules, interfaces, data, and state considerations
- architecture and pattern decisions
- visible open technical decisions

This stage should not:

- redefine scope boundaries or acceptance criteria (that was done in `sddl-spec`)
- produce a stage-by-stage execution plan (that belongs to `sddl-plan`)
- implement code
- absorb executor or QA logic
- hide unresolved technical decisions

## Proportional design

For changes where the technical approach is obvious from the spec (e.g., adding a field to an existing form, fixing a validation bug), produce a minimal design proportional to the complexity. The design must still identify affected areas, but other sections can be condensed or omitted when they add no value.

## Reads

Read:

- `./sdd-lite/openspec/changes/{change-name}/spec.md` as the primary input
- `./sdd-lite/openspec/changes/{change-name}/proposal.md` as reference
- `./sdd-lite/openspec/config.yaml`
- `./sdd-lite/project-context.md`
- `./sdd-lite/skill-catalog.md` as the runtime standards registry
- `./sdd-lite/openspec/changes/{change-name}/state.yaml`
- relevant maintained docs or repo files when needed to validate architecture, dependencies, or file targets

Treat `spec.md` as the scope source of truth unless newer approved state or repo evidence materially contradicts it.

## Writes

Write or refresh:

- `./sdd-lite/openspec/changes/{change-name}/design.md`
- `./sdd-lite/openspec/changes/{change-name}/state.yaml`

Do not write outside `./sdd-lite/`.
Do not write `proposal.md`, `spec.md`, `plan.md`, `execution-log.md`, or `qa-report.md`.

## Artifact Shape

Use `sdd-lite/templates/artifacts/design.md` as the baseline shape.

The design must keep these sections explicit:

- routing digest
- summary
- design overview
- affected areas
- interfaces, data, and state
- alternatives and trade-offs
- open technical questions
- approval notes

## User Interaction

Ask only when the answer materially changes:

- the technical direction
- the affected areas
- the route outcome

Valid reasons to ask include:

- two technically different approaches have materially different risk or blast radius
- the architecture depends on a product or infrastructure decision not recoverable from evidence
- the spec's scope requires touching areas with unclear ownership or high risk

Persisted artifacts stay in English even if chat is Spanish.

## Phase validation

Before returning, apply smart phase validation:

- If the user already indicated advancement (e.g., "continue with plan", "go ahead"), skip the checkpoint and record it as implicitly approved.
- If there is ambiguity in technical approach or multiple viable alternatives with different risk profiles, present the checkpoint.
- If the artifact contains open technical questions that affect the execution plan, present the checkpoint.

When presenting the checkpoint, include:

- a concise summary of the technical approach and affected areas
- the next phase (`sddl-plan`)
- recommended options: approve and continue, revise this phase, stop

## Workflow

1. Read `spec.md`
   Reuse its scope boundary, acceptance criteria, and expected behavior instead of redefining them.
2. Check minimum design readiness
   Stop if the spec is missing, contradicted, or not specific enough for safe design.
3. Define the technical approach
   Explain how the change should be implemented at a practical level.
4. Map affected areas
   Identify the modules, files, interfaces, data, or state transitions that the design relies on.
5. Record alternatives and open technical questions
   Keep meaningful decisions visible instead of hiding them in summary prose.
6. Write `design.md`
   Keep it concise and aligned with the spec.
7. Phase validation checkpoint
   Apply smart validation: skip if user already approved advancement, present if ambiguity exists.
8. Sync `state.yaml`
   Record stage status, lifecycle status, open risks, and the next safe action.

## State Sync Rules

When syncing `state.yaml` from this stage:

- set `current_stage: sddl-design` while active
- update `stages.sddl-design`
- keep approved checkpoints and decisions intact
- keep the lifecycle at `planning`
- set `next_action` toward `sddl-plan`, a user checkpoint, or a blocked stop

## Quality Bar

- `design.md` must be practical and evidence-based.
- Affected areas must be visible and concrete.
- Open technical questions must stay visible when they exist.
- The design must stay compact and should not absorb execution planning or QA reporting.
- Target roughly 400 to 600 words plus tables when possible.
- Start with a short digest that downstream planning can read first.

## Validation

Before finishing, verify:

- the technical approach is concrete
- affected areas are visible
- alternatives are recorded when they exist
- open technical questions are visible
- the result is enough for `sddl-plan` to proceed without guessing
- all persisted content is English

## Expected Output

On success, provide:

- `status: success`
- `design.md` in `artifacts`
- a short summary of the technical approach
- the next safe step, usually `sddl-plan`
- `context_resolution`
- `standards_source`
- `artifact_digests_used` when applicable
- `recommended_next_stage`

Use `partial` when the design is usable but a material decision still gates safe planning.
Use `blocked` when spec input is insufficient for a reliable design.
