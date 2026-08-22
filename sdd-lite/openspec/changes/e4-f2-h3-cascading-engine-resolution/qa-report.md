# QA Report

## Closeout Digest

- change_name: e4-f2-h3-cascading-engine-resolution
- mode: **final**
- verdict: **pass_with_warnings**
- lifecycle effect: does NOT close the change — `lifecycle_status` stays `reviewing`; one `medium` finding (a literal mismatch between AC-1's "non-empty" wording and the implementation) requires an explicit user decision via a `final_review` checkpoint before completion

## Scope Reviewed

The full implemented change across ST-1..ST-3: `src/core/repos/ports/config-schemas.ts` + `src/core/repos/index.ts` (schema extraction), `src/core/run/resolve-engine.ts` (new) + `run-errors.ts` + `run/index.ts` (resolution function and its error), `src/core/run/run-review.ts` (echo field), and the two test files. Against `spec.md`'s 9 ACs, `design.md`, `plan.md`'s 3-stage plan, and the full `execution-log.md`.

## Independent Verification Performed (not trusted from prior logs)

- `npm run check`: `Checked 93 files in 80ms. No fixes applied.` / `tsc --noEmit` clean / `✔ no dependency violations found (67 modules, 129 dependencies cruised)`.
- `npm test`: `Test Files 19 passed (19)` / `Tests 293 passed (293)`.
- **Non-vacuity, by mutation** — three mutations independently introduced and reverted, each confirmed to fail the suite:
  - swapping the precedence order (repo evaluated before run) → 3 failed / 4 passed
  - removing the `EngineNameSchema` validation (never throw) → 2 failed / 5 passed
  - deleting the `engineName` echo spread from `runReview`'s return → 1 failed / 38 passed
  The tests genuinely pin the behavior; none is a vanity assertion. Working tree restored and re-verified clean afterward.
- **AC-6, exhaustive grep** (`grep -rn '"claude-code"' src/ --include=*.ts` and the `"opencode"` equivalent, excluding `__test__/`): exactly one `z.enum([...])` engine list in the codebase (`config-schemas.ts:14`). The remaining hits are `EngineNameSchema.default("claude-code")` (a default value, not a second list) and the opencode adapter's own `DEFAULT_BINARY_PATH = "opencode"` (adapter identity, an explicit non-goal in `spec.md`). AC-6 genuinely satisfied.
- **AC-9, direct diff read** of `src/core/run/run-review.ts`: the diff is exactly the two `engineName?: string` field additions plus one conditional spread. `RunStage`, `classifyFailure`, `executePipeline`'s stages and `performCleanup` are untouched.
- **Echo across terminal states** (probe, deleted after use): a run forced to `validation-failed` still returns `engineName: "opencode"` — the echo is correct on non-`ok` paths too, not only the happy path the suite covers.
- Story-scoped diff: exactly 8 files, all under `src/core/`; no `src/adapters/**` or `src/main/**` file appears — the change stayed core-only as scoped.
- `tsconfig.json` confirmed `strict: true` + `exactOptionalPropertyTypes: true`, so the conditional-spread pattern (rather than assigning `undefined`) is the required form for AC-8's "key absent, not `undefined`-valued".

## Review Ledger Consumption

No `review-ledger.md` exists for this change — no `sddl-code-review` or `sddl-judgment-day` protocol was run. This final QA is the first and only review pass over the diff. That is a deliberate proportionality call given the change's size (203 insertions, 8 files, all pure functions and data-shape additions) versus `[E4.F2.H2]`'s 1328-line adapter, which did warrant a full 4R sweep — but it does mean this report is the sole review evidence, which the verdict reflects.

## AC Coverage Summary

| ACs | Status |
|---|---|
| AC-2, AC-3 (repo-wins, global-fallback) | pass — automated, mutation-verified |
| **AC-1** (run override wins "whenever it is provided **and non-empty**") | **pass with a caveat** — the run-wins precedence is correct and mutation-verified, but the "non-empty" clause is not implemented; see finding QA-1 |
| AC-4, AC-5 (unknown-name rejection, message content) | pass — automated at both the run and repo levels, incl. the shadowed-invalid-value case |
| AC-6 (single `EngineNameSchema` definition) | pass — exhaustively grep-verified above |
| AC-7, AC-8 (echo present / key absent) | pass — automated; independently confirmed correct on non-`ok` states too |
| AC-9 (`run-review.ts` pipeline unchanged) | pass — direct diff read |

## Findings

| Id | Severity | Finding |
|---|---|---|
| QA-1 | medium | **`spec.md` says "non-empty", the code says "not `undefined`".** AC-1 requires the run override to win "whenever it is provided **and non-empty**", and the In Scope section defines the validated value as "the first **non-empty** one in precedence order". `resolveEngine` branches on `!== undefined`, so an empty-string override wins precedence and is then rejected. Directly reproduced: `resolveEngine({ globalDefault: "claude-code", repoOverride: "opencode", runOverride: "" })` throws `UnknownEngineError: Unknown engine "" from run override` instead of falling through to `"opencode"`. The same applies at the repo level. **No test pins either behavior**, so the suite is blind to it. Mitigating context: no production caller can currently reach it (the `--engine` flag does not exist yet — that is `E6.F1`; and `RepoEntrySchema.defaultEngine` is `EngineNameSchema.optional()`, so `""` is rejected by the schema before it could ever reach `resolveEngine` from `repos.yaml`). The implemented behavior is also arguably the safer of the two — erroring on an explicit `--engine ""` beats silently falling back. But it is a literal mismatch with an approved AC, and it should be closed by an explicit decision rather than left to drift. |
| QA-2 | low | The `engineName` echo is exercised by tests only on the `ok` path. Verified independently that it is correct on `validation-failed` as well (single unconditional spread in `runReview`'s only return statement), so this is a coverage gap, not a defect. |
| QA-3 | low | No `sddl-code-review` pass ran for this change, so this report is the only review over the diff. Proportionate to the change's size, but noted so the absence is a recorded decision rather than an oversight. |

## Verdict

**pass_with_warnings.** The implementation is correct, well-scoped, and genuinely verified: all 9 ACs are implemented, every behavioral claim was re-checked independently rather than trusted from `execution-log.md`, the new tests survive mutation testing, architecture guards hold, and the diff is exactly the 8 planned core-only files. It is not a clean `pass` solely because of **QA-1**: an approved acceptance criterion says "non-empty" and the code does not implement that clause, with no test pinning either reading. That is a small, unreachable-today discrepancy, but closing it needs a decision, not silence.

## Next Action

Per the skill's state-sync rules, `final` + `pass_with_warnings` keeps `lifecycle_status: reviewing` and requires a `final_review` checkpoint. QA-1 is a **B-level decision** (it affects the approved acceptance contract) with three viable routes:

1. **Amend the spec** — reword AC-1 and the In Scope clause to drop "non-empty", matching the implemented (and defensible) behavior, and add one test pinning that `""` rejects. Smallest change; makes the contract honest.
2. **Fix the code** — treat `""` as absent so it falls through the cascade, matching the spec as written, plus a test. Slightly more code; honors the approved wording literally.
3. **Accept as-is** — record QA-1 as a known, disclosed discrepancy and close. Not recommended: it leaves an approved AC contradicted by its own implementation with no test either way, the exact failure mode `[E4.F2.H2]`'s Amendment 1 was raised to avoid.

**Recommendation: option 1.** The implemented behavior is the better of the two (an explicit empty `--engine` should be an error, not a silent fallback), so the spec wording is what is wrong, and amending it plus adding the pinning test is a smaller, lower-risk delta than changing working resolution logic. QA-2 and QA-3 are non-blocking and need no action before closeout.
