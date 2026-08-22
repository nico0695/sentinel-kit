# Review Ledger

## Review Digest

- target_identity: `30c90aa9150f20d56e0de89485560f517f25d16b` (story diff `651fecb~1..HEAD -- src/`)
- review_mode: 4r
- judgment_target_kind: code
- tier: standard
- scope: change:e4-f2-h3-cascading-engine-resolution
- round: 1
- counts: confirmed=0 suspect=0 escalated=0 info=2
- open_severe_findings: 0
- verdict: pass_with_warnings
- next_action_digest: >-
    No blocking finding. One WARNING (R3-001) independently confirms final QA's
    QA-1: an empty-string override wins precedence and throws instead of
    cascading, contradicting spec.md's "first non-empty one in precedence
    order". Two independent passes converge on the same severity
    (medium/WARNING), which is below the blocking floor — it does NOT enter
    the fix loop. The open `cp-final-review` decision on QA-1 stands as a
    user call, now better evidenced.
- updated_at: "2026-08-22T02:20:00Z"

## Review History

| Review Seq | Target Identity | Mode | Tier | Rounds Used | Verdict | Reported At |
|---|---|---|---|---|---|---|
| 1 | `30c90aa` | 4r | standard | 0 fix rounds | pass_with_warnings | 2026-08-22T02:20:00Z |

## Target

- description: Story `[E4.F2.H3]` "Cascading engine resolution" (issue #30) — the complete implemented change across ST-1..ST-3.
- target_kind: diff
- paths_or_diff_reference: `git diff 651fecb~1..HEAD -- src/` — 8 files, all under `src/core/`
- changed_lines: 224 (203 insertions / 5 deletions per `--stat`; 224 counting both `+` and `-` lines)
- immutable_reference: `30c90aa9150f20d56e0de89485560f517f25d16b`
- created_at: "2026-08-22T02:20:00Z"

## Triage Rationale

`standard` tier, one lens. The target is 224 changed lines (below the 400-line `full-4r` threshold) and touches no auth, security, payments, sensitive-data, or migration surface — verified by grepping the diff's added lines for those markers (zero matches), not assumed. Dominant risk signal is behavior/state/determinism/tests (precedence semantics, validation, a result-shape field), so the selected lens is **`reliability`**. Per the protocol, a `standard` review takes exactly one lens and no refuter pass; the refuter is `full-4r`-only and, independently, applies only to severe *inferential* findings — this review produced neither.

## Findings Ledger

| Id | Lens/Judge | Location | Severity | Status | Evidence Class | Causal Disposition | Blocking | Claim | Proof Refs |
|---|---|---|---|---|---|---|---|---|---|
| R3-001 | reliability | `src/core/run/resolve-engine.ts:23` | WARNING | info | deterministic | introduced | no | An empty-string override (`runOverride: ""` or `repoOverride: ""`) wins precedence and makes `resolveEngine` throw `UnknownEngineError` instead of cascading down to the next level, contradicting the approved contract's "first non-empty one in precedence order" / AC-1 "provided and non-empty", and no test covers the empty case in either direction. | Presence-only checks at `resolve-engine.ts:23` (`input.runOverride !== undefined`) and `:25`; `:29-31` `EngineNameSchema.safeParse("")` fails → `throw new UnknownEngineError("", "run")`. Contract: `spec.md` Scope Boundary + AC-1. `__test__/resolve-engine.test.ts` has no `""` case (7 tests: 4 precedence, 3 rejection). Orchestrator reproduced independently: `resolveEngine({globalDefault:"claude-code", repoOverride:"opencode", runOverride:""})` → `threw:UnknownEngineError:Unknown engine "" from run override`. |
| R3-002 | reliability | `src/core/run/resolve-engine.ts:17-18` | SUGGESTION | info | deterministic | introduced | no | Under `exactOptionalPropertyTypes`, the natural composition-root call shape `resolveEngine({ globalDefault, repoOverride: repoEntry.defaultEngine, runOverride: cliFlag })` does not compile, because `repoOverride?: string` excludes `undefined`, forcing conditional-spread construction at every future call site. | Orchestrator verified by compiling a probe call site under the project's own flags: `error TS2379: ... Type 'string | undefined' is not assignable to type 'string'`. **Contextualized, not a defect**: this is the codebase's established convention — `grep` over `src/core/**` (excluding tests) finds **zero** optional properties declared with an explicit `| undefined` and **14** conditional-spread call sites, e.g. `run-review.ts:332` `...(deps.now !== undefined ? { now: deps.now } : {})`. A future `E6.F1` caller would write the same spread 14 other places already write. Recorded so the `E6.F1` author is not surprised, not as work to do. |

Severity floor applied: both rows are `WARNING`/`SUGGESTION`, so both carry `status: info`, `Blocking: no`, and neither enters the fix loop or is ever re-reviewed. `open_severe_findings: 0`.

## Corroboration Log

| Finding Id | Mechanism | Outcome | Notes |
|---|---|---|---|
| — | — | — | No refuter pass ran. It is `full-4r`-only and applies solely to severe **inferential** findings; this `standard` review produced zero severe findings and both recorded findings are `deterministic`. |

Independent convergence worth noting even though it is not a formal corroboration mechanism: R3-001 was found by the `reliability` lens working from a fresh context with no sight of the QA report, and matches final QA's QA-1 claim and severity (WARNING maps to `medium` under the ledger's severity mapping). Two independent passes agreeing raises confidence that the defect is real — and equally, that it is genuinely below the blocking threshold rather than under-rated.

## Fix Rounds

| Round | Ledger Ids | Fix Vehicle | Applied At | Scoped Re-review Outcome |
|---|---|---|---|---|
| — | — | — | — | No fix round triggered: zero findings are `open`, so nothing is eligible for the fix loop. |

## Verdict Rationale

**pass_with_warnings.** The reliability lens ran one exhaustive sweep and found no correctness defect in the resolution logic itself: precedence ordering matches run > repo > global, the four presence/absence combinations are covered, rejection is tested at both reachable levels asserting `value`/`level`/message, the echo applies uniformly across all five terminal states (single return site), `AC-9` holds, no async/error-propagation gap exists (the function is synchronous and pure), no nondeterminism was introduced, and no vanity test was found — the lens specifically validated that the `try/expect.unreachable()/catch` pattern is sound here.

The one substantive finding, R3-001, is a **contract mismatch, not a logic error**: the code's behavior is coherent and arguably safer than the spec's wording (an explicit `--engine ""` erroring beats a silent fallback), but the approved AC says "non-empty" and the code implements "not undefined", with no test pinning either reading. At `WARNING` it sits below the blocking floor and does not gate this review — but it does not disappear either, and it remains the subject of the already-open `cp-final-review` decision.

## Next Recommended Action

No fix round is triggered by this review — there are no `open` severe findings, so per the protocol nothing routes into `plan.md`.

The open question is unchanged and remains a **B-level user decision** on the already-pending `cp-final-review` checkpoint, now with a second independent pass behind it:

1. **Amend `spec.md`** — drop "non-empty" from AC-1 and the Scope Boundary to match the implemented behavior, and add one test pinning that `""` rejects (recommended: the behavior is the better of the two, so the wording is what is wrong, and this closes R3-001's "no test covers the empty case in either direction" half too).
2. **Fix the code** — treat `""` as absent so it cascades, honoring the approved wording literally, plus the same pinning test.
3. **Accept as disclosed** — record and move on. Weaker than it looked before this review: both passes note the *untested* half independently, so accepting leaves an approved AC contradicted **and** unpinned by any test.

Either 1 or 2 closes R3-001 completely; both are a handful of lines. R3-002 needs no action.

## Budget Notes

- One sweep, one lens, zero refuter passes, zero fix rounds — within the `standard`-tier budget.
