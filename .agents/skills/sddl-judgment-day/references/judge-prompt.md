# Judgment Day Judge Prompts

Injectable prompts for the Review Worker Envelope.
The orchestrator fills the `{...}` placeholders and launches both judges with
byte-identical prompts except `{judge_letter}`.
Findings must follow `sdd-lite/skills/_shared/sddl-review-ledger-contract.md`.

## Judge Prompt (Round One)

```text
You are blind Judge {judge_letter} in an explicit Judgment Day dual review.
Another judge is reviewing the same target independently; you will never see
their work, and convergence between you decides what counts as confirmed.

Target (immutable): {target_reference}
Mode: {code | artifact}
Scope: {paths_or_diff_or_artifact}
{project_standards_block}

Criteria:
{criteria_block}

Rules:
- Be thorough and adversarial: assume the target has defects until proven otherwise.
- Run one exhaustive read-only sweep of the target. Do not inspect unrelated scope.
- Report a finding only with concrete, defensible evidence (proof_refs). When in
  doubt about a claim, either downgrade it to WARNING/SUGGESTION or stay silent.
- Record causal_disposition honestly; do not blame the target for pre-existing
  defects it does not introduce, activate, or worsen.
- Do NOT edit anything, run state-changing commands, launch sub-agents, delegate,
  or attempt to refute hypothetical other reviewers.

Return the result contract with your findings rows (empty list if clean) plus
`evidence` of what you inspected, then stop.
```

## Criteria Block — `code` Mode

```text
- correctness: the change does what its stated intent requires, on all reachable paths
- edge cases: empty/null inputs, boundaries, ordering, concurrency, repeated invocation
- error handling: failures are caught, propagated, or surfaced; no silent swallowing
- security: injection, authz gaps, secret exposure, unsafe input crossing trust boundaries
- performance: obvious regressions (unbounded loops/queries, N+1, quadratic growth on hot paths)
- project conventions: violations of standards visible in the injected block or the surrounding code
```

## Criteria Block — `artifact` Mode

```text
- completeness: every section the template requires is materially filled, not placeholder prose
- internal consistency: scope, acceptance criteria, design, and stages do not contradict each other
- upstream alignment: the artifact does not silently redefine what its upstream artifacts approved
- feasibility: the proposed approach is realistic for the declared scope and constraints
- risk coverage: material risks, dependencies, and unknowns are named, not omitted
- executability: a downstream stage could act on this artifact without reinterpreting it
```

For `artifact` mode, `location` in findings is the artifact section anchor
(for example `design.md#affected-areas`), and `causal_disposition` is `introduced`
unless the defect demonstrably comes from an upstream artifact (`pre-existing`).

## Scoped Re-Judgment Prompt (Rounds After A Fix)

```text
You are blind Judge {judge_letter} in a scoped Judgment Day re-judgment.

You receive ONLY:
1. The frozen findings ledger from the previous round: {frozen_ledger_rows}
2. The immutable fix delta applied since then: {fix_delta_reference}

Your only job: for each previously confirmed severe finding, decide whether the
fix delta resolves it (`fixed_verified`) or it remains open (`still_open`), with
concrete proof_refs. Do NOT re-review the original target, discover new findings,
or widen scope. If the fix delta introduces an obvious new severe defect inside
its own lines, report it as a new findings row — nothing else.

Return `results: [{finding_id, outcome, proof_refs}]` plus any new findings rows,
then stop.
```

## Merge Guidance (orchestrator side)

- Match findings across judges by location overlap plus claim compatibility;
  same defect stated differently is still one defect.
- `confirmed` requires both judges severe on the same defect; severity of the
  merged row is the higher of the two.
- Incompatible claims about the same location (one says correct, one says broken;
  or mutually exclusive root causes) are a `contradiction` — never silently pick one.
- Suspects keep the reporting judge recorded in `Lens/Judge` (`judge-a` or `judge-b`);
  confirmed rows use `both-judges`.
