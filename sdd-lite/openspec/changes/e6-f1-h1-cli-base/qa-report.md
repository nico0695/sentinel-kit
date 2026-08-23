# QA Report

change_name: e6-f1-h1-cli-base
mode: stage
review_target: S1-S4 (commits f0de92a, a20dd5a, bd97131, 40a6deb on `claude/validar-estado-proyecto-rcvz8c`)
reviewed_at: "2026-08-24T05:00:00Z"

## Closeout Digest

- verdict: **pass**
- blockers: **0** · high: 0 · medium: 0 · low: 3 (all `info`, none blocking)
- gates re-run independently: `npm run check` exit **0**, `npm test` exit **0** (551 tests / 31 files)
- architecture guards: **clean in intent, not only by exit code** — every new core file imports
  either nothing, a same-module file, or the other module's public `index.js`; no Node builtin,
  no npm import, no adapter, no `src/main/` reference anywhere in `src/core/**`.
- **stage mode: this does NOT close the change.** S5-S11 are unimplemented and unapproved.
- recommended next stage: `sddl-executor` for S5, after a fresh `stage_approval`.

## Independent Validation (re-run, not quoted from the execution log)

| Command | Exit | Literal output |
|---|---|---|
| `npm run check` | **0** | `Checked 124 files in 125ms. No fixes applied.` · `✔ no dependency violations found (84 modules, 183 dependencies cruised)` |
| `npm test` | **0** | `Test Files 31 passed (31)` · `Tests 551 passed (551)` · `Duration 8.88s` |

Both match the expected baseline exactly (biome 124 files, depcruise 84 modules / 183 dependencies,
0 violations; 551 tests / 31 files). Nothing was skipped. `e2e/` does not exist and its project
matches no files — deliberate per AC-14 and `[E7.F1.H1]`, not a finding.

## Acceptance Criteria Verified

| AC | Owner stage | Status | Evidence |
|---|---|---|---|
| AC-5 | S4 | **met** | `persistRun(request, deps)` in `src/core/history/persist-run.ts`, exported from `history/index.ts` with its three types. Composed record checked field-by-field against `RunRecord` (`ports/run-store.ts`) and design §4: every field present, none invented, `diff` reduced by `toDiffSummary` to counts + warning **messages**, `failure` reduced to `{stage, message}` with no `cause`/stack/exception. Returns `{runDir, record}` where `runDir` is `store.save`'s resolution. Only cross-module import is the type-only `../run/index.js`. Tests cover `ok`, `engine-error` with `failure` populated and `verdict` absent, a non-`Error` throwable, and a `store.save` rejection propagated unchanged. |
| AC-8 | S2 | **met** | `reviewTimeoutMs: z.number().optional()` on `GlobalConfigSchema` — literal, no `.default()`, guarded by a test that asserts the key is absent after parsing a document without it. `DEFAULT_REVIEW_TIMEOUT_MS = 600_000` lives in `core/run`. Precedence implemented as `flags.timeoutMs ?? config.reviewTimeoutMs ?? DEFAULT_REVIEW_TIMEOUT_MS` with one test per level. Pre-story config shapes and an empty document still parse; `RepoEntrySchema` did not gain the field. |
| AC-9 | S1 | **met** | `package.json` runtime `dependencies` read back: `commander`, `execa`, `yaml`, `zod` — exactly four. No `picocolors`, no `@clack/prompts`, no `marked*`. The lockfile diff is precisely the promotion of the already-present transitive `commander@15.0.0` (removal of `"dev": true`) plus the root dependency entry — no other package added or bumped. |
| AC-14 | all | **met (for this batch)** | Both gates exit 0; 500 → 551 tests with **zero deletions in any pre-existing test file** (`git diff --numstat`: `+47/-0`, `+38/-0`, `+67/-0`). New tests all live in `<module>/__test__/*.test.ts` under the `core` project. |
| AC-1 (S2 precondition only) | S2 | **established** | The cascade lives in core as a pure function that also owns the registry lookup and the internal `resolveEngine` call, so the S7 command will have no precedence logic, no lookup and no engine branch left to hold. The remainder of AC-1 is S6/S7's and is untestable now. |

## Conformance To Design

- **S2 precedence table — verbatim.** All ten rows of design §"Precedence implemented by `resolveReviewRequest`" match the implementation, including the two that are easy to get wrong: `cleanupPolicy` is omitted (asserted with `Object.hasOwn`, so `runReview`'s `"always"` default stands) and `limits`/`validations`/`validationTimeoutMs` are conditionally spread rather than set to `undefined`, as `exactOptionalPropertyTypes` requires. No silent divergence found.
- **S4 `RunRecord` field table — verbatim.** Each of the 15 `RunRecord` fields traces to design's source column; `engine = result.engineName ?? request.engineName` and `validationOutput` from the **request** (correct: `RunReviewResult` carries none, `runReview` merges computed output back into it at line 437 of `run-review.ts`).
- **D1** honoured: no command exists yet, and nothing in this batch pre-empts the zero-logic rule — `main` and the adapters were not touched at all.
- **D3** honoured: `.optional()`, not `.default()`, with a dedicated mutation guard test.
- **D4** honoured: `commander` is the single addition.
- **D5** honoured: `resolveReviewRequest` + `DEFAULT_REVIEW_TIMEOUT_MS` + both input types exported from `run/index.ts`, pure, no I/O, path string-concatenated (no `node:path`).
- **D7** honoured: `toRunStorageKey` is exported from its own file for its two call sites but **absent from `history/index.ts`** — confirmed by reading the barrel diff, which adds only `persistRun` and its types.

## The S3 Regression Question

S3 changed the observable behaviour of two use cases merged by `[E5.F2.H2]`. Verified:

- **No pre-existing test was edited or deleted** — both files are pure appends (`+38/-0`, `+47/-0`).
- **The surviving suites are not vacuous.** The pre-existing `listRuns`/`getRun` assertions use separator-free aliases (`sentinel-kit`, `never-saved`), so they now exercise the *pass-through* branch of `toRunStorageKey` and still assert the exact argument reaching `store.list`/`store.get`. They remain a real regression guard for `[E5.F2.H2]`, just of the identity case.
- **The new coverage is the non-identity case**, including one test asserting the run **id** is not normalised — the correct boundary.
- **The adapter-side guard is intact.** `RunStore.contract.ts` (`save` with `repoName: "a/b"` rejected) and `run-store-fs.test.ts` (`adapter.get("a/b", "x")` rejects) were read and are unmodified, so the schema still refuses a separator; core now simply never hands it one. Nothing was edited that should not have been.
- **`persistRun` is consistent with both readers**: a run written under `owner__repo` is exactly the run `listRuns`/`getRun` read back.

## Test Quality

The new suites assert properties rather than restating the implementation: per-row precedence with
distinguishable values, `Object.hasOwn` absence checks (which `toEqual` cannot make), idempotency
`f(f(x)) === f(x)`, a negative-duration clamp, and an unchanged rejection propagation. One assertion
does not hold up — see F-1.

## Findings

| Id | Severity | Area | Finding | Evidence | Next action |
|---|---|---|---|---|---|
| F-1 | low (`info`) | test quality, S4 | **The "no diff body persisted" stringify assertion is vacuous.** `expect(JSON.stringify(record)).not.toContain(diffBody)` cannot fail: `diffBody` contains real newlines, which `JSON.stringify` emits as the two-character escape `\n`, so the raw substring is absent even from a record that persists the diff verbatim. Reproduced directly: stringifying `{diff:{files:[{path:"src/a.ts",content:diffBody}]}}` yields `contains raw diffBody? false`. | `src/core/history/__test__/persist-run.test.ts:193` | **Not blocking**: the sibling assertion on the same record, `not.toContain("src/a.ts")`, *is* sound (the same reproduction yields `contains src/a.ts? true`), and it fails for any record that leaks the `files` array — so AC-5's property is genuinely covered. Optional hardening in a later stage: assert on an escape-free token such as `"-old"`, or assert `Object.keys(record.diff)` directly. |
| F-2 | low (`info`) | dependency metadata | `commander@15.0.0` declares `engines.node >= 22.12.0`; `package.json` declares `>= 22`. Confirmed in `node_modules/commander/package.json`. CI pins node [22, 24] so it is unaffected; a consumer on Node 22.0-22.11 would see `EBADENGINE`. | `package.json`, `node_modules/commander/package.json` | Already tracked as `risk-e6h1-008` (open, low, decide before `[E7.F2.H3]`). Correctly not fixed in passing — S1's scope was "`package.json` … nothing else". No new action. |
| F-3 | low (`info`) | artifact hygiene | The `risk-e6h1-006` entry in `state.yaml` carries `summary` and `severity` but no `status:` field; every other risk has one. | `state.yaml` open_risks, last entry | Not corrected here: this stage is fenced out of `open_risks`. The orchestrator or the S9/S10 executor that owns that risk should add `status: open`. |

No BLOCKER or CRITICAL finding. No architecture-guard violation.

## Known Open Risks — Did S1-S4 Make Them Worse?

- **`risk-e6h1-009` (stored `owner__repo` echoed back in `repoName`) — unchanged, correctly scoped.**
  S4 could only have made it worse by persisting the raw alias, which the store's
  `RunRecordPathFieldsSchema` would reject on every registered repo; writing the storage key is the
  only correct choice and it keeps writer and readers consistent. The residue is purely a rendering
  concern and stays with S6/S7, which must echo the alias the user typed rather than
  `RunSummary.repoName`/`RunRecord.repoName`. Carried forward, unchanged severity (medium).
- **`risk-e6h1-006` (first full graph assembly) — narrowed, not worsened.** S2/S3/S4 removed the two
  integration mismatches that were most likely to surface in `main`: the missing timeout source and
  the alias/storage-key collision D7 predicted. The residual risk is exactly the wiring S8/S9 add,
  still mitigated only by S10's mandatory manual smoke. Unchanged severity (medium).

**Are S5-S7 safe to build on this foundation? Yes.** The three core additions are pure or
store-only, fully unit-covered, and shaped exactly as design fixed them, so the CLI stages can be
written as parse-and-delegate shells with no cascade, no lookup and no record composition left to
own. Two facts S5-S7 must carry: the renderer must not print the stored `repoName` (`risk-e6h1-009`),
and `--timeout` arrives from commander as a string that the command must parse to a number before it
type-checks against `ResolveReviewRequestFlags.timeoutMs`.

## Observations (not findings)

- `toRunStorageKey` maps `a/b` and a literal `a__b` to the same storage key. Unreachable in practice —
  `deriveAlias` builds `owner/repo` from URL segments — and rejecting it would put validation inside a
  pure mapping helper. Recorded only so a future multi-segment alias scheme reconsiders it.
- `DEFAULT_REVIEW_TIMEOUT_MS`'s doc comment says it lives "beside `DEFAULT_VALIDATION_TIMEOUT_MS`";
  the two are in the same module but different files, and the validation constant is module-private
  while this one is barrel-exported (as D5 requires). Substance matches AC-8; wording is loose.
- A negative or out-of-range `reviewTimeoutMs` in `config.yaml` passes `z.number()` and is caught later
  by `runReview`'s stage-1 guard (`run-review.ts:346-353`) as an `InvalidRunRequestError` — the same
  arrangement `validationTimeoutMs` already uses. Consistent, no change recommended.

## Verdict

**pass** — the S1-S4 batch delivers exactly what spec, design and plan authorised, both gates are
green on independent re-run, the architecture guards hold in intent, the S3 behaviour change left
`[E5.F2.H2]`'s suites meaningful and unedited, and the three findings are informational. Stage mode:
the change stays `implementing`; only `final` mode may close it.

## Next Action

Take a fresh `stage_approval` to the user for **S5** (CLI shell: `createCli`, `CliDeps`, error/version/
root-help behaviour), then run `sddl-executor` for S5 alone. No correction round is required before it.
