# SDDL Review Runtime

Load this module only when a 4R or judgment-day review is requested, offered, resumed, or returns results. `SDDL-RUNTIME.md` remains the routing authority; the owning review skill remains the protocol authority.

Resolve package paths relative to the package root supplied by the active wrapper/config; resolve `./sdd-lite/` paths relative to the consuming project root.

## Operating Rules

- Freeze the target first using a commit SHA, diff hash, or artifact digest. Every worker reviews the same immutable reference.
- `sddl-code-review` and `sddl-judgment-day` are mutually exclusive per target. Judgment-day is explicit opt-in and replaces 4R for that target.
- Lenses, judges, and refuters are read-only and return `findings`; only the main orchestrator merges and writes `review-ledger.md` under `skills/_shared/sddl-review-ledger-contract.md`.
- Per-dimension review fan-out is allowed only over the same frozen target and does not permit per-file delegation elsewhere.
- Enforce every owning-skill budget: selected lens sweeps, one full-4R refuter pass, and at most two fix rounds per lineage.
- Review never closes a change. Final `sddl-qa-review` is the sole closer and consumes the ledger as evidence.

## Review Worker Envelope

Extend the standard handoff with:

```yaml
sddl_role: review-worker
stage: sddl-code-review # or sddl-judgment-day
execution_profile: sddl-reviewer
orchestration_allowed: false
runtime_loading_allowed: false
```

Include the role prompt from `references/lens-prompts.md` or `references/judge-prompt.md`, immutable target and exact scope, relevant injected standards, and a read-only/no-state-changing-command boundary. Expect the common result contract with `findings` rows.

Judgment-day judges receive byte-identical envelopes except for judge letter and never see each other's output before merge.

## Platform Execution

| Capability | Execution |
|---|---|
| parallel workers | launch each selected lens/judge/refuter as `sddl-reviewer` and wait for every result |
| native sub-agents | same waited fan-out; never fire-and-forget |
| host concurrency cap | if the host cap is below the batch size, run sequential batches — lenses first, then the refuter |
| inline fallback | run passes sequentially, retaining only each findings result; note weaker judge blindness in the ledger |

The active wrapper selects the mechanism. Worker boundaries and ledger ownership never change.

## Triage and Offer

After successful execution, use the 4R rubric from `skills/sddl-code-review/SKILL.md`. `trivial` skips silently; `standard` and `full-4r` raise `review_gate` in interactive mode or chain in auto mode.

Standalone review writes only `./sdd-lite/openspec/reviews/{target-slug}/review-ledger.md`. Resume it from the current ledger digest.

## Result Merge

When a review result returns:

1. Reject and audit any worker file write; distrust that worker's findings.
2. Validate findings against the shared ledger contract.
3. Merge ids, status transitions, convergence, digest, and risk mapping as defined by that contract.
4. Wait for all blind peers before judgment-day convergence.
5. Apply the owning skill's refuter and fix-round caps.
6. Return to `SDDL-RUNTIME.md` result processing and routing.

## Fix Routing

Severe confirmed findings never trigger direct edits. Raise `review_gate`; the user chooses:

- active/in-scope: rerun `sddl-plan` with confirmed ledger ids, then `stage_approval`, then `sddl-executor`
- active/out-of-scope: reopen `sddl-design`/`sddl-plan` or record a `scope_change` follow-up
- standalone/bounded: open a mini change seeded from the ledger, starting with `proposal.md`
- standalone/substantial: open a full change seeded from the ledger

Scoped re-review uses the frozen ledger and immutable fix delta. Never reset a lineage to evade the two-round cap.
