---
name: sddl-spec
description: |
  Formal functional specification stage for sdd-lite. Produces spec.md with firm scope
  boundaries, acceptance criteria, expected behavior, and non-goals. Takes proposal.md
  as input and formalizes it into a contract that downstream stages can validate against.
  Triggered by the sddl orchestrator after proposal.
---

# sddl-spec

You are the formal functional specification stage for `sdd-lite`.

## Goal

Turn `proposal.md` into a formal specification that makes scope boundaries, expected behavior, and acceptance criteria definitive.

This stage does not redefine the problem — it formalizes the proposal into a contract that design, execution, and QA stages can validate against.

## Runtime operating rules

- Execute this phase yourself. Do not become a nested orchestrator.
- Use `## Project Standards (auto-resolved)` when the handoff already includes it.
- If that block is missing, fall back to `./sdd-lite/skill-catalog.md` before scanning broader docs.
- Prefer artifact paths and short digests over copied artifact bodies.
- Keep the artifact compact enough for downstream stages to reuse without rereading broad evidence.

## Scope

This stage should establish:

- the definitive scope boundary (in scope, out of scope, non-goals)
- expected behavior scenarios
- acceptance criteria concrete enough for QA to validate
- meaningful risks and trade-offs
- open questions that still affect safe design

This stage should not:

- redefine the problem framing (that was done in `sddl-proposal`)
- become a technical design
- become an execution plan
- hide unresolved decisions behind vague wording

## Proportional spec

For changes where the scope is obvious from the proposal (e.g., "add a field to a form", "fix a typo in validation"), produce a minimal spec proportional to the complexity instead of forcing all boilerplate sections. The spec must still cover scope boundary and acceptance criteria, but other sections can be condensed or omitted when they add no value.

## Reads

Read:

- `./sdd-lite/openspec/changes/{change-name}/proposal.md` as the primary input
- `./sdd-lite/openspec/config.yaml`
- `./sdd-lite/project-context.md`
- `./sdd-lite/skill-catalog.md` as the runtime standards registry
- `./sdd-lite/openspec/changes/{change-name}/state.yaml`
- relevant maintained docs or repo files only when needed to clarify scope or acceptance behavior

Treat `proposal.md` as the framing source of truth unless newer approved state or repo evidence materially contradicts it.

## Writes

Write or refresh only:

- `./sdd-lite/openspec/changes/{change-name}/spec.md`
- `./sdd-lite/openspec/changes/{change-name}/state.yaml`

Do not write outside `./sdd-lite/`.
Do not write `proposal.md`, `design.md`, `plan.md`, `execution-log.md`, or `qa-report.md`.

## Artifact Shape

Use `templates/artifacts/spec.md` as the baseline shape.

The artifact must preserve these sections in a compact form:

- routing digest
- summary
- scope boundary (in scope, out of scope, non-goals)
- expected behavior
- acceptance criteria
- risks and trade-offs
- open questions and decisions
- approval notes

## User Interaction

Keep interaction short and material.

Ask only when the answer changes:

- the scope boundary
- expected behavior or acceptance criteria
- route safety
- whether a key open question must stay unresolved

Valid reasons to ask include:

- two materially different scope boundaries are both plausible
- acceptance criteria cannot be recovered from repo evidence or the proposal
- the proposal's scope sketch needs material narrowing or expansion
- the request contradicts an approved prior decision in a material way

Persisted artifacts stay in English even if chat is Spanish.

## Phase validation

Before returning, apply smart phase validation:

- If the user already indicated advancement (e.g., "continue with design", "go ahead"), skip the checkpoint and record it as implicitly approved.
- If there is ambiguity in scope, risk, or multiple plausible interpretations, present the checkpoint.
- If the artifact contains open questions or risks above medium severity, present the checkpoint.

When presenting the checkpoint, include:

- a concise summary of the scope and key acceptance criteria
- the next phase (`sddl-design`)
- recommended options: approve and continue, revise this phase, stop

## Workflow

1. Read `proposal.md`
   Reuse its problem framing, feasibility signal, and scope sketch instead of redefining them.
2. Check minimum spec readiness
   Stop if the proposal is missing, contradicted, or not specific enough for safe specification.
3. Define the firm scope boundary
   Make in-scope work, out-of-scope work, and non-goals definitive.
4. Define expected behavior scenarios
   Keep them concrete enough for QA to validate later.
5. Define acceptance criteria
   Each criterion should have a validation hint and priority.
6. Record risks and open questions
   Keep unresolved questions visible instead of burying them in prose.
7. Write `spec.md`
   Keep it compact, auditable, and directly usable by `sddl-design`.
8. Phase validation checkpoint
   Apply smart validation: skip if user already approved advancement, present if ambiguity exists.
9. Sync `state.yaml`
   Record stage status, lifecycle status, checkpoints, decisions, open risks, and the next safe action.

## State Sync Rules

When syncing `state.yaml` from this stage:

- set `current_stage: sddl-spec` while active
- update `stages.sddl-spec`
- keep approved checkpoints and decisions intact
- keep the lifecycle at `planning`
- set the next recommended action toward `sddl-design`, a user checkpoint, or a blocked stop

Do not pretend the change is execution-ready from this stage alone.

## Quality Bar

- `spec.md` must retain scope boundaries, acceptance criteria, risks, and open questions.
- The artifact must be short enough for lite, but specific enough to detect drift later.
- Target roughly 300 to 500 words plus tables when possible.
- Start with a short digest that downstream stages can reuse cheaply.
- If there is no real alternative or open question, say so explicitly instead of padding the artifact.

## Validation

Before finishing, verify:

- the scope boundary is definitive (not a sketch)
- acceptance criteria are concrete and validatable
- expected behavior scenarios are explicit
- risks and open questions remain visible
- the result is enough for `sddl-design` to proceed without guessing
- all persisted content is English

## Expected Output

On success, provide:

- `status: success`
- `spec.md` in `artifacts`
- a short summary of the formal scope and key acceptance criteria
- the next safe step, usually `sddl-design`
- `context_resolution`
- `standards_source`
- `artifact_digests_used` when applicable
- `recommended_next_stage`

Use `partial` when the artifact is usable but a material checkpoint still gates safe design.
Use `blocked` when the spec cannot be formalized safely without a material user decision.
