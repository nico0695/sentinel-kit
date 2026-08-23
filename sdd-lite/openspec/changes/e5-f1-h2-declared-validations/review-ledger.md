# Review Ledger

## Review Digest

- target_identity: e5-f1-h2-declared-validations @ b7376e6 (base beb5d48)
- review_mode: 4r
- judgment_target_kind: code
- tier: full-4r
- scope: change:e5-f1-h2-declared-validations
- round: 1
- counts: confirmed=0 suspect=0 escalated=0 info=4
- open_severe_findings: 0
- verdict: pass_with_warnings
- next_action_digest: R1-001 (CRITICAL, deterministic, corroborated by direct code read) matched an already-accepted risk (risk-007, "low" severity, recorded during the proposal stage). Raised as cp-review-gate-r1-001; the user ratified risk-007 as already-decided and correctly scoped — R1-001 closed wont-fix/info, no code change. R1-002 reconciled as spec-conformant (not a defect) against R3's independent reading of AC-14. Zero open severe findings. Recommend sddl-qa-review in final mode.
- updated_at: "2026-08-23T17:20:00Z"

## Review History

| Review Seq | Target Identity | Mode | Tier | Rounds Used | Verdict | Reported At |
|---|---|---|---|---|---|---|

## Target

- description: Declared validations wired into runReview (src/core/run/run-validations.ts new; run-review.ts, run-errors.ts, run/index.ts, repos/ports/config-schemas.ts, history/ports/run-metadata-schemas.ts edited; 4 test files)
- target_kind: diff
- paths_or_diff_reference: `git diff beb5d48..b7376e6 -- src/`
- changed_lines: 1593 insertions, 8 deletions, 11 files
- immutable_reference: b7376e6 (base beb5d48)
- created_at: "2026-08-23T16:35:00Z"

## Findings Ledger

| Id | Lens/Judge | Location | Severity | Status | Evidence Class | Causal Disposition | Blocking | Claim | Proof Refs |
|---|---|---|---|---|---|---|---|---|---|
| R1-001 | risk | src/core/run/run-validations.ts:339-347 (fixed); originally src/core/run/run-review.ts:425-436, src/core/run/ports/process-runner.ts:35 | CRITICAL | fixed | deterministic | behavior-activated | no | A declared validation string with no rejected shell character (e.g. `env`, `printenv`) is not blocked by the tokenizer and will dump the reviewing process's own environment — potentially including the LLM API key and git/GitHub credentials — into stdout, which is captured verbatim and injected into the LLM prompt and persisted to disk. | Round-1 closure `wont-fix` (ratified as risk-007) was **superseded** by PR #72's formal "Changes Requested" review re-raising the identical mechanism. Round 2 (`cp-pr-review-r1-001-reopen`): fixed via `ProcessRunRequest.inheritEnv?:boolean` + a mandatory pre-flight guard + a strict `{PATH, HOME}` allowlist in `run-validations.ts`. Adversarially re-reviewed CLEAN (see Fix Rounds). |
| R1-002 | risk | src/core/run/run-validations.ts:203-224, 257-268 | WARNING | info | deterministic | introduced | no | `truncated` does not reflect a per-line character cut, only a window-elision or an adapter capture flag. | src/core/run/run-validations.ts:216-224,257-268 | RECONCILED as spec-conformant, not a defect: spec.md AC-14 pins `truncated` as "true when either capture flag was set **or** D6's window elided anything" — a per-line char cut is neither; R3's independent reading of the same code reached the same conclusion, citing the identical AC-14 clause. No fix required. |
| R3-001 | reliability | src/core/run/run-validations.ts (runValidations loop); src/core/run/process-run-request.ts:29-32 | WARNING | info | deterministic | introduced | no | `runValidations`/`validateProcessRunRequest` never enforce the `MAX_TIMEOUT_MS` (Node's 32-bit `setTimeout` ceiling) that `run-review.ts` documents and guards at its own call site; a future caller of the standalone `runValidations` (AC-18) that doesn't replicate that guard could pass an overflowing `timeoutMs` straight through. | src/core/run/run-review.ts:232-236,375-379; src/core/run/run-validations.ts; src/core/run/process-run-request.ts:29-32 |
| R4-001 | resilience | src/core/run/run-validations.ts (sequential loop); src/core/repos/ports/config-schemas.ts:41,46 | WARNING | info | deterministic | introduced | no | Declared validations run strictly sequentially with only a per-entry timeout; no cap on declaration count or aggregate stage duration, so a config with many entries can hold `runReview` for an effectively unbounded total time. | src/core/run/run-validations.ts; src/core/repos/ports/config-schemas.ts:41,46; src/core/run/run-review.ts:232 (MAX_TIMEOUT_MS bounds only a single entry) |

R1-003 (SUGGESTION, inferential, "no cap on declaration count") is the same substance as R4-001 (WARNING, deterministic) — deduplicated, R4-001's row kept as it carries the stronger evidence class.

Field rules and governing rules: per `sdd-lite/skills/_shared/sddl-review-ledger-contract.md` (severity floor, blocking requires `introduced`/`behavior-activated`/`worsened`, severity-to-risk mapping).

## Corroboration Log

| Finding Id | Mechanism | Outcome | Notes |
|---|---|---|---|
| R1-001 | direct code reading (deterministic — refuter not applicable per protocol; deterministic findings are never refuted) | corroborated | Orchestrator independently read `run-validations.ts:75-155` (`REJECTED_SHELL_CHARS`/`isRejectedChar`) and confirmed the bare word `env` (or `printenv`) contains no character in the rejection set and no control character, so `tokenizeDeclaration` accepts it unmodified. Cross-checked against `state.yaml`'s `risk-007`, recorded during the proposal stage: "A declared script that prints its environment still leaks secrets into the assembled prompt and into `validations/*.log`... severity: low", with the rationale "the script is one the repo owner declared in their own config, on their own machine, against their own repo." R1's independent, unbiased assessment rates the identical mechanism CRITICAL. The disagreement is on severity, not on the facts — both readings of the code agree on what happens. Not resolved unilaterally; raised to the user as `review_gate` per the Fix Routing table (active change, finding inside approved scope but conflicting with a prior self-authored, non-user-ratified risk acceptance). |
| R1-002 | direct code + spec cross-reference | refuted (as a defect) | Reconciled against R3's independent finding and the exact spec.md AC-14 text; not a fix candidate. See Findings Ledger note. |

## Fix Rounds

| Round | Ledger Ids | Fix Vehicle | Applied At | Scoped Re-review Outcome |
|---|---|---|---|---|
| 2 | R1-001 | ST-5 (plan.md fix stage, appended after PR #72's formal "Changes Requested" review re-raised the finding; `cp-pr-review-r1-001-reopen` authorized, superseding round 1's `wont-fix` closure) | 2026-08-23T20:45:00Z | Adversarial scoped re-review of `git diff 391f7d3..93290f7 -- src/` (9 files, the fix delta only, per protocol never re-litigating the original diff): CLEAN across all 6 checked dimensions (bypass paths, guard correctness, adapter mapping, test quality, regression scope, scope discipline). Orchestrator independently re-verified the single construction site and the pre-flight guard placement by direct code read. `ProcessRunRequest.inheritEnv?:boolean` (default true, preserves `[E5.F1.H1]` D2) + a mandatory pre-flight guard (load-bearing: `extendEnv:false` alone is a silent no-op in execa, confirmed by live probe) + a strict `{PATH, HOME}` allowlist for every declared validation's child process. R1-001: `wont-fix` → `fixed`.
