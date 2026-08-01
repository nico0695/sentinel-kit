---
name: sddl-judgment-day
description: |
  Adversarial dual-review protocol for sdd-lite. Launches two blind, independent
  read-only judges against one immutable target and corroborates by convergence:
  both agree = confirmed, one reports = suspect, they contradict = escalated to the
  user. Works on code targets (replacing the 4R review for that target) or on
  planning artifacts (proposal, spec, design, plan). Never auto-routed. Triggers on:
  "judgment day", "dual review", "adversarial review", "juzgar".
---

# sddl-judgment-day

You are the adversarial dual-review protocol for `sdd-lite`.

## Goal

Raise confidence on one high-stakes target by having two blind judges review it independently and treating their convergence as the corroboration mechanism: agreement confirms, solitary findings stay suspect, contradiction escalates to the user.

This is the expensive, opt-in review path.
For routine diff review, `sddl-code-review` is the default; judgment-day replaces it for its target — never run both on the same target.

## Execution Model

Like `sddl-code-review`, this skill is a protocol the orchestrator executes:

- the orchestrator freezes the target, then launches Judge A and Judge B as fresh read-only workers with identical scope and criteria, using the Review Worker Envelope
- judge prompts come from `references/judge-prompt.md`; findings follow `skills/_shared/sddl-review-ledger-contract.md`
- judges are blind: neither sees the other's reasoning or results; wait for BOTH before merging — never accept a partial judgment
- only the orchestrator merges findings into `review-ledger.md` and updates state
- no refuter runs in judgment-day; two-judge convergence is the corroboration mechanism
- platform blindness: parallel workers give real isolation; inline-sequential platforms run Judge A, persist only its findings result, then run Judge B without showing it Judge A's output — weaker blindness, documented limitation

## Target Modes

| Mode | Target | Fix path |
|---|---|---|
| `code` | a frozen diff, PR, branch, or execution-stage change set | confirmed severe findings route through the fix flow (always via `plan.md`, like `sddl-code-review`) |
| `artifact` | one persisted planning artifact: `proposal.md`, `spec.md`, `design.md`, `plan.md`, or `macro-plan.md` | no fix loop; confirmed findings feed a rerun of the stage that owns the artifact, with the findings in the envelope |

If the target is unclear, ask one scope question and stop.

## Runtime operating rules

- Opt-in only: this protocol never starts without an explicit user request; the orchestrator never auto-routes into it.
- Freeze the target first: immutable reference (commit SHA, diff hash, or artifact digest) before any judge launches.
- Both judges receive the same target, criteria, and standards block — byte-identical except the judge letter.
- Budgets are hard caps: one sweep per judge per round, maximum two fix rounds and two scoped re-judgments, terminal states only `approved` or `escalated`.
- Fix only findings confirmed by BOTH judges; suspects are recorded, never auto-fixed.
- Never edit code or artifacts from this protocol.

## Scope

This protocol should:

- run two blind judges over one immutable target and merge their results by convergence
- classify every severe finding as `confirmed`, `suspect`, or `contradiction`
- escalate contradictions to an explicit user decision (`review_gate`)
- persist the merged ledger and sync `review_summary` when a change is active
- end in exactly one terminal state: `JUDGMENT: APPROVED` or `JUDGMENT: ESCALATED`

This protocol should not:

- run alongside `sddl-code-review` on the same target
- launch a refuter (convergence corroborates)
- auto-fix suspects or contradictions
- extend an exhausted lineage: after the second scoped re-judgment, remaining severe findings mean `escalated`
- close a change; only `sddl-qa-review` in `final` mode does that

## Reads

- the frozen target (code mode) or the target artifact (artifact mode)
- `./sdd-lite/openspec/config.yaml`
- `./sdd-lite/skill-catalog.md` when standards were not injected
- `./sdd-lite/openspec/changes/{change-name}/state.yaml` and sibling artifacts when a change is active
- existing `review-ledger.md` for the same target when resuming a round
- `references/judge-prompt.md` (judge and re-judgment prompts)
- `skills/_shared/sddl-review-ledger-contract.md` (row contract and convergence buckets)

## Writes

Orchestrator-owned writes only:

- `./sdd-lite/openspec/changes/{change-name}/review-ledger.md` when a change is active
- `./sdd-lite/openspec/reviews/{target-slug}/review-ledger.md` when standalone
- `state.yaml` (`review_summary`, checkpoints, decisions, open risks) when a change is active

Standalone reviews persist only the ledger; its digest is the resume anchor.

## Decision Gates

| Condition | Action |
|---|---|
| target unclear | ask one scope question and stop |
| both judges confirm a severe finding | ask before the round-one fix (`review_gate`), then route through the fix flow |
| only one judge reports it | record with `status: suspect`; do not auto-fix |
| judges contradict each other | escalate for explicit human decision (`review_gate`) |
| scoped re-judgment still fails before round two | the final bounded fix round may run, with approval |
| any confirmed severe finding remains open after round two | `JUDGMENT: ESCALATED`; stop |
| no confirmed severe findings remain open | `JUDGMENT: APPROVED`; suspects may remain and cap the ledger verdict at `pass_with_warnings` |

`WARNING`/`SUGGESTION` findings from either judge land in the `info` bucket: reported once, never blocking, never re-judged.

## Fix Routing (code mode)

Identical to `sddl-code-review`: confirmed severe findings route through `plan.md` (fix stage from confirmed ledger ids, `stage_approval`, `sddl-executor`) inside an active change, or seed a new/mini change when standalone. Scoped re-judgment sends BOTH judges only the frozen ledger plus the immutable fix delta — never the original target again.

## Artifact Mode Routing

Confirmed findings on a planning artifact do not open a fix loop. The orchestrator raises a `review_gate` recommending a rerun of the owner stage (for example `sddl-design` for `design.md`) with the confirmed findings injected in the handoff envelope. Suspects are attached as notes for the owner stage to consider. The re-run artifact may then be re-judged, consuming one of the two rounds.

## User Interaction

- confirm target and mode when not explicit (one question)
- `review_gate` before any fix round and for every contradiction
- report suspects honestly: they are unproven, not dismissed
- persisted ledger content stays in English even if chat is Spanish

## Workflow

1. Confirm target and mode
   Resolve the exact target, freeze its immutable reference, and check no 4R ledger already covers it.
2. Launch both judges
   Identical envelopes (except the judge letter), read-only, same criteria block for the selected mode. Wait for both results.
3. Merge by convergence
   Match findings by location and claim compatibility; classify `confirmed` / `suspect` / `contradiction`; apply the severity floor (`info` bucket).
4. Persist the ledger
   Write digest, findings, convergence log, and current verdict; sync `review_summary` when a change is active.
5. Gate the round
   Escalate contradictions; on confirmed severe findings, raise `review_gate` for the fix (code mode) or the owner-stage rerun (artifact mode).
6. Scoped re-judgment
   After a fix round, send both judges the frozen ledger plus fix delta only; update statuses (`fixed -> verified` or still open).
7. Terminate
   At most one repeat of steps 5-6. Emit `JUDGMENT: APPROVED` or `JUDGMENT: ESCALATED` with the final counts and next safe step.

## Quality Bar

- Judges stay blind: nothing from one judge reaches the other before both results are merged.
- Convergence matching is honest: only same-defect agreement counts as confirmation, not thematic similarity.
- Every escalation carries both judges' claims and evidence so the user can adjudicate.
- The ledger digest alone must be enough to resume or route.

## Validation

Before finishing, verify:

- both judges ran against the identical frozen reference; no partial judgment was accepted
- every severe finding sits in exactly one bucket: confirmed, suspect, or contradiction
- no fix was applied to a suspect or contradiction
- round and re-judgment budgets were respected
- the terminal state is exactly `approved` or `escalated`

## Expected Output

On success, provide:

- `status: success`
- `review-ledger.md` path in `artifacts`
- `JUDGMENT: APPROVED` or `JUDGMENT: ESCALATED`, the round, and the bucket counts
- `findings` (merged ledger rows) in the result contract
- the suggested next step (fix route, owner-stage rerun, or clean continuation)
- `context_resolution`, `standards_source`, `artifact_digests_used`, `recommended_next_stage`

Use `partial` when a round completed but a `review_gate` decision (fix approval, contradiction adjudication) is pending.
Use `blocked` when the target cannot be frozen, a judge result is missing or malformed, or a 4R ledger already covers the target.
