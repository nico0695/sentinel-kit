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

Throughout this skill, a difference is **material** when it would change the scope boundary, an acceptance criterion, or the selected route. Anything that would not change one of those three is not material, and is not worth a question or a stop.

Severity, wherever this skill refers to it, uses `low`, `medium`, or `high` — the same scale `open_risks` carries in `state.yaml`.

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

## Inbound proposal contract

`proposal.md` is not just prose to reuse. Three of its fields are preconditions for this stage.

**`proposal_status`.** Formalize only when it is `ready`. `needs-input` means a readiness gate is still waiting on the user; `blocked` means the framing needs a decision beyond `sddl-proposal`. In either case there is no stable contract to formalize — return `blocked`, naming the status and what it is waiting on. Do not resolve the gate yourself.

**`Readiness Check`.** A gate left at `raised` with `high` severity is a blocking precondition: return `blocked` rather than formalize on a framing the proposal itself marked unresolved. A gate at `resolved` is fine — it was raised and settled.

**`Open Questions For Spec`.** This table is addressed to this stage. Every row must land somewhere:

- migrate each row into `Open Questions And Decisions` in `spec.md`
- resolve the ones current evidence can settle, and mark them `resolved`
- for the rest, fill the `Needed Before` column with `design` or `execution`
- a migrated row never disappears without either `resolved` or an explicit `Needed Before`

Rows the user explicitly skipped during the proposal's clarification block arrive here. They are open questions, not settled decisions — never treat a skipped question as an implicit answer.

## Proportional spec

Produce a minimal spec — scope boundary and acceptance criteria only, other sections condensed or omitted — when both hold:

- all three gates in the proposal's `Readiness Check` are `clear`
- the scope sketch touches a single surface (one module, one endpoint, one form)

Anything else gets the full artifact. When the two conditions disagree with your instinct that the change is trivial, follow the conditions — the whole point is that two runs over the same proposal reach the same shape.

## Reads

Read:

- `./sdd-lite/openspec/changes/{change-name}/proposal.md` as the primary input, including its `proposal_status`, `Readiness Check`, and `Open Questions For Spec`
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

Before returning, apply the `phase_validation` checkpoint as defined in `skills/_shared/sddl-user-interaction-contract.md`. It is conditional: skip it when the user already indicated advancement, and always present it when scope, risk, or interpretation is ambiguous, or when the artifact carries open questions or risks at `medium` or `high` severity.

Record the checkpoint in `state.yaml` with `type: phase_validation`, the artifact written, and the decision.

## Workflow

1. Read `proposal.md`
   Reuse its problem framing, feasibility signal, and scope sketch instead of redefining them.
2. Check the inbound proposal contract
   Apply `Inbound proposal contract`. Also stop if the proposal is missing, contradicted, or not specific enough for safe specification.
3. Migrate `Open Questions For Spec`
   Per `Inbound proposal contract`.
4. Define the firm scope boundary
   Make in-scope work, out-of-scope work, and non-goals definitive.
5. Define expected behavior scenarios
   Keep them concrete enough for QA to validate later.
6. Define acceptance criteria
   Each criterion should have a validation hint and priority.
7. Record risks and open questions
   Keep unresolved questions visible instead of burying them in prose.
8. Write `spec.md`
   Keep it compact, auditable, and directly usable by `sddl-design`.
9. Phase validation checkpoint
   Apply smart validation: skip if user already approved advancement, present if ambiguity exists.
10. Sync `state.yaml`
    Record stage status, lifecycle status, checkpoints, decisions, open risks, and the next safe action.

## State Sync Rules

When syncing `state.yaml` from this stage:

- set `current_stage: sddl-spec` while active
- update `stages.sddl-spec`
- update `artifacts.spec` with the artifact path
- refresh `open_risks` with the risks still active after this stage
- refresh `updated_at`
- keep approved checkpoints and decisions intact
- keep the lifecycle at `planning`
- set the next recommended action toward `sddl-design`, a user checkpoint, or a blocked stop

Do not pretend the change is execution-ready from this stage alone.

## Quality Bar

- `spec.md` must retain scope boundaries, acceptance criteria, risks, and open questions.
- The artifact must be short enough for lite, but specific enough to detect drift later.
- Respect the word budget stated in `templates/artifacts/spec.md`.
- Start with a short digest that downstream stages can reuse cheaply.
- If there is no real alternative or open question, say so explicitly instead of padding the artifact.

## Validation

Before finishing, verify:

- the scope boundary is definitive (not a sketch)
- acceptance criteria are concrete and validatable
- expected behavior scenarios are explicit
- risks and open questions remain visible
- every row of the proposal's `Open Questions For Spec` appears in `Open Questions And Decisions`, either `resolved` or with a `Needed Before`
- the result is enough for `sddl-design` to proceed without guessing
- all persisted content is English

## Expected Output

Return the common result structure from `skills/_shared/sddl-flow-contract.md`.

Required fields:

- `status`: `success`, `partial`, or `blocked`
- `executive_summary`: the formal scope and key acceptance criteria in a few lines
- `artifacts`: `spec.md` and `state.yaml`
- `next_action`: the next safe step, usually `sddl-design`
- `open_risks`: risks still active after this stage, with `low`, `medium`, or `high` severity. Return an empty list when there are none — never omit the field. The orchestrator surfaces `medium` and above to the user before routing.

Optional fields to include when they apply:

- `decision_required` and `decision_options` when a blocking precondition needs the user
- `context_resolution`
- `standards_source`
- `artifact_digests_used`
- `recommended_next_stage`

Use `partial` when the artifact is usable but a material checkpoint still gates safe design.
Use `blocked` when the spec cannot be formalized safely without a material user decision, or when the inbound proposal is not `ready`.
