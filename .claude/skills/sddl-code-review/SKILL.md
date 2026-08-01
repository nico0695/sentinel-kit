---
name: sddl-code-review
description: |
  4R code review protocol for sdd-lite (Risk, Readability, Reliability, Resilience).
  Risk-triages a frozen diff, runs read-only lens reviews, merges findings into
  review-ledger.md, and corroborates severe inferential findings with one refuter pass.
  The sddl orchestrator executes this protocol and owns the ledger. Triggered on-demand
  after an execution stage or standalone. Triggers on: "code review", "4R review",
  "review this diff", "review this PR", "review my changes".
---

# sddl-code-review

You are the 4R code review protocol for `sdd-lite`.

## Goal

Produce a precise, evidence-backed findings ledger for one frozen code target (a diff, PR, branch, or execution-stage change set), sized to its real risk: most targets get zero or one review lens, hot targets get the full 4R set plus corroboration.

This protocol judges the quality of the change itself.
It does not replace `sddl-qa-review`, which judges the change against its spec and plan and remains the only lifecycle closer.

## Execution Model

Unlike linear stages, this skill is a protocol the orchestrator executes:

- the orchestrator freezes the target, triages it, and launches each lens as a fresh read-only worker using the Review Worker Envelope (see `SDDL-ORCHESTRATOR.md`, Review Operations)
- lens and refuter prompts are injected from `references/lens-prompts.md`
- workers return `findings` rows and stop; they never write artifacts
- only the orchestrator merges findings and writes `review-ledger.md`
- platform execution: parallel workers where the wrapper supports it, sequential inline passes otherwise (same rules either way)

## Runtime operating rules

- Freeze the target first: record an immutable reference (commit SHA, diff hash) and review only that.
- Use `## Project Standards (auto-resolved)` when available; fall back to `./sdd-lite/skill-catalog.md`.
- Budgets are hard caps, not suggestions: one sweep per lens (two in full-4r), one refuter pass, two fix rounds per review lineage.
- Findings before optimistic summary language.
- Never edit code, tests, configs, or upstream artifacts from this protocol.

## Scope

This protocol should:

- triage the target into `trivial`, `standard`, or `full-4r`
- run the selected lens reviews against the frozen target
- corroborate severe inferential findings with one refuter pass (full-4r only)
- merge results into `review-ledger.md` and sync `review_summary` in `state.yaml` when a change is active
- route confirmed severe findings into the fix flow (always through `plan.md`)

This protocol should not:

- run when `sddl-judgment-day` already covers the same target (they are mutually exclusive per target)
- close a change or set `lifecycle_status: completed`
- apply fixes directly or bypass `stage_approval`
- re-review `WARNING` or `SUGGESTION` findings, or let them block anything
- audit unchanged code beyond what the target's blast radius requires

## Reads

- the frozen diff, PR, or change set under review
- `./sdd-lite/openspec/config.yaml`
- `./sdd-lite/skill-catalog.md` when standards were not injected
- `./sdd-lite/openspec/changes/{change-name}/state.yaml`, `plan.md`, `execution-log.md` when a change is active
- existing `review-ledger.md` for the same target when resuming or re-reviewing
- `references/lens-prompts.md` (lens and refuter prompts)
- `sdd-lite/skills/_shared/sddl-review-ledger-contract.md` (ledger rules shared with judgment-day)

## Writes

Orchestrator-owned writes only:

- `./sdd-lite/openspec/changes/{change-name}/review-ledger.md` when a change is active
- `./sdd-lite/openspec/reviews/{target-slug}/review-ledger.md` when standalone
- `state.yaml` (`review_summary`, checkpoints, decisions, open risks) when a change is active

Use `sdd-lite/templates/artifacts/review-ledger.md` as the baseline shape.
Standalone reviews persist nothing except the ledger; its digest is the resume anchor.

## Triage Rubric

| Tier | Criteria | Lenses |
|---|---|---|
| `trivial` | only docs, comments, formatting, or string typos — zero executable code and zero config changed | none; record the skip and stop |
| `standard` | everything else | exactly one lens: the dominant risk signal below |
| `full-4r` | touches auth, security, payments, sensitive data, or migrations; or > 400 changed lines | all four lenses plus one refuter pass |

Dominant risk signal for `standard`:

| Signal in the diff | Lens |
|---|---|
| naming, structure, maintainability, small refactors | `readability` |
| behavior, state, tests, determinism, regressions | `reliability` |
| process/shell integration, partial failures, recovery, degraded dependencies | `resilience` |
| security, permissions, data exposure, dependencies, architecture boundaries | `risk` |

When several signals match, pick the highest-impact one. Never add lenses to a `standard` review.

## Corroboration (Refuter)

Full-4r only. After merging lens findings:

- collect `BLOCKER`/`CRITICAL` findings with `evidence_class: inferential` (deterministic findings are never refuted)
- launch exactly one refuter worker with the full candidate list (never one refuter per finding)
- outcomes per finding: `corroborated`, `refuted`, `inconclusive`; a malformed or missing verdict means the finding stands
- record outcomes in the ledger Corroboration Log; `refuted` findings leave the fix loop

## Fix Routing

Confirmed severe findings never trigger direct edits. The orchestrator interprets context and raises a `review_gate` checkpoint suggesting one route; the user decides:

| Context | Suggested route |
|---|---|
| active change, findings inside approved scope | rerun `sddl-plan` to insert a fix stage from confirmed ledger ids, then `stage_approval`, then `sddl-executor` |
| active change, findings exceed spec/design scope | reopen `sddl-design`/`sddl-plan` with the findings in the envelope, or record a follow-up (`scope_change`) |
| standalone, bounded findings | open a mini change: the ledger seeds `proposal.md`; expedited pass through spec, design, and plan, then normal execution |
| standalone, substantial findings | open a full new change with the ledger seeding `proposal.md` |

Scoped re-review after a fix round sees only the frozen ledger plus the immutable fix delta, never the original diff again. Maximum two fix rounds; whatever remains open is reported and the loop ends.

## User Interaction

- offer the review through a `review_gate` checkpoint after an execution stage in `interactive` mode; chain it in `auto` mode (trivial tier is skipped silently in both)
- ask before starting any fix round (`review_gate`)
- surface remaining open severe findings after round two instead of extending the loop
- persisted ledger content stays in English even if chat is Spanish

## Workflow

1. Freeze the target
   Resolve the exact diff/PR/stage change set and record its immutable reference.
2. Check exclusivity
   If judgment-day already reviewed this target, stop and point to its ledger.
3. Triage
   Apply the rubric; on `trivial`, record the skip and finish.
4. Run lens sweeps
   Launch the selected lens worker(s) with the Review Worker Envelope; one exhaustive sweep each (two allowed in full-4r).
5. Merge findings
   Deduplicate by location and claim, assign ids, apply the severity floor (`WARNING`/`SUGGESTION` become `status: info`).
6. Corroborate (full-4r only)
   Run the single refuter pass over severe inferential findings and update statuses.
7. Persist the ledger
   Write `review-ledger.md` with digest, findings, corroboration log, and verdict; sync `review_summary` when a change is active.
8. Route
   Raise the `review_gate` checkpoint with the fix routing suggestion, or report a clean result and the next safe step.

## Quality Bar

- Every finding names a concrete location and defensible evidence.
- The precision gate holds: no style or preference findings unless they obscure a defect.
- Only `introduced`, `behavior-activated`, or `worsened` findings block.
- The ledger digest alone must be enough to resume or route.

## Validation

Before finishing, verify:

- the target reference is immutable and recorded
- lens count matches the triage tier exactly
- no worker wrote any file; only the orchestrator touched the ledger and state
- severity floor applied: no `open` WARNING/SUGGESTION rows
- fix rounds used are within budget and recorded in the ledger

## Expected Output

On success, provide:

- `status: success`
- `review-ledger.md` path in `artifacts`
- the verdict (`pass`, `pass_with_warnings`, `fail`) and counts
- `findings` (merged ledger rows) in the result contract
- the suggested fix route or next safe step
- `context_resolution`, `standards_source`, `artifact_digests_used`, `recommended_next_stage`

Use `partial` when the review ran but a fix decision, an escalated finding, or an exhausted round budget still needs the user.
Use `blocked` when the target cannot be frozen or identified safely, or a judgment-day ledger already covers it.
