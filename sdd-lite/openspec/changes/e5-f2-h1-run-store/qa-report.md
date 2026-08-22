# QA Report

## Closeout Digest

- change_name: e5-f2-h1-run-store
- mode: **final**
- verdict: **pass**
- lifecycle effect: **closes the change** — `lifecycle_status: completed`. `review-ledger.md`'s `pass_with_warnings` carries one non-blocking `info` row and zero open severe findings, which does not gate final QA's own `pass`.

## Scope Reviewed

The full implemented change across ST-1..ST-4 (`4497f01..HEAD`), against `spec.md` revision 2 (21 ACs), `design.md` (7 design decisions, D-1..D-7), `plan.md` (4 stages), the full `execution-log.md`, and `review-ledger.md` (full-4r, `pass_with_warnings`).

## Independent Verification Performed

Every check below was re-run fresh in this QA pass, not copied from `execution-log.md`:

- `npm run check`: `Checked 101 files in 86ms. No fixes applied.` / `tsc --noEmit` clean / `depcruise src`: `✔ no dependency violations found (72 modules, 142 dependencies cruised)`.
- `npm test`: `Test Files 21 passed (21)` / `Tests 326 passed (326)`.
- **AC-3**: `git diff --stat 4497f01..HEAD -- src/core/run` — empty. `src/core/run/**` is untouched across the entire story.
- **Full story diff scope**: `git diff --stat 4497f01..HEAD -- src/` — exactly 10 files, all under `src/core/history/**` (4) and `src/adapters/driven/storage/**` (6). No adapter other than `storage`, no `src/main/` file.
- **AC-17**: `grep -rn "process\.env" src/core/history src/adapters/driven/storage/run-store-fs.ts src/adapters/driven/storage/run-layout.ts src/adapters/driven/storage/index.ts` — zero matches, scoped to production files only (a first, unscoped grep attempt hit a comment in the test file that merely *documents* the AC-17 grep command as text — re-scoped and confirmed a false positive, not a real read).
- **AC-14**: `grep -n "Date\.now\|new Date()" src/adapters/driven/storage/run-store-fs.ts src/adapters/driven/storage/run-layout.ts` — zero matches; both `new Date(...)` call sites take `record.startedAtEpochMs`/`epochMs` as an explicit argument, confirmed by direct read.
- **AC-2**: Read `RunRecord`'s full interface body directly — the 7 required fields and 8 optional fields match spec.md's list exactly, field for field.
- **AC-16**: Confirmed `RunFailureRecord` imports and reuses `RunStage` from `run/index.js` (not a loose `string`) by direct read of `run-store.ts:10,34-35`.
- **AC-21**: `depcruise` (above) confirms zero architecture violations independently of `execution-log.md`'s claim.
- Re-ran the `-t "AC-18"` test filter directly: 22 passed, 0 failed, 0 skipped-that-should-have-run.

## Review Ledger Consumption

`review-ledger.md` (full-4r, target `4497f01..52e797c`): verdict `pass_with_warnings`, **`open_severe_findings: 0`**, 1 `info` row, 0 fix rounds.

- **R1/R3-001** (`CRITICAL`, merged, `refuted`) — concurrent-`save()`-of-the-identical-record race on the shared `stagingDir`. The refuter traced `save()`'s actual `await`-interleaving semantics and proved the losing concurrent caller is *guaranteed* to error (never silent), refuting the claim's load-bearing clause. A narrower residual nuance (possible content-mixing in the *winning* caller's directory) was folded into `risk-005` as a documentation refinement rather than escalated, since `save()` has no caller anywhere in this repo yet (`E6.F1` wires the composition root) — nothing can currently trigger it.
- **R4-001** (`WARNING`, `info`) — the best-effort staging cleanup on failure silently swallows its *own* failure (not the original error, which stays correctly preserved as `cause`), masking a secondary diagnostic signal. Real but low-impact; not pursued further, consistent with the severity floor.

The ledger itself is not amended by this QA pass — its findings and refutation stand as reported.

## AC Coverage Summary

| ACs | Status |
|---|---|
| AC-1 (port shape: single `save` method) | pass — direct read of `run-store.ts` |
| AC-2 (`RunRecord` field completeness) | pass — independently re-verified field-for-field against spec.md, this pass |
| AC-3 (`src/core/run` untouched) | pass — independently re-verified via fresh `git diff --stat`, this pass |
| AC-4 (exact `metadata.json` field set) | pass — `run-layout.test.ts` string-level (ST-2) + `run-store-fs.test.ts` on-disk (ST-4) |
| AC-5, AC-6 (byte-for-byte `result.md`/`prompt.md`) | pass — `run-store-fs.test.ts` |
| AC-7 (zero-padded `validations/NNN.log`) | pass — `run-store-fs.test.ts` |
| AC-8 (omission of absent artifacts) | pass — `run-store-fs.test.ts` |
| AC-9 (lexicographic == chronological) | pass — `run-layout.test.ts`, verified across ms/day/month/year boundaries, mutation-proven in spirit by ST-2's direct assertion |
| AC-10 (diff summary, no bodies) | pass — structural (port type has no `content` field) + `run-layout.test.ts` marker test |
| AC-11, AC-12 (atomicity, staging as sibling) | pass — mutation-proven in ST-4 (removed cleanup, secondary assertion caught it) |
| AC-13 (`RunAlreadyExistsError`, pre-existing run unmodified) | pass — `RunStore.contract.ts`, mutation-proven in ST-3 (disabled pre-check, the `rename` ENOTEMPTY backstop still produced the right *class* mismatch, proving the test's precision) |
| AC-14 (clockless determinism) | pass — mutation-proven in ST-4 (adapter reading `Date.now()` failed the test immediately with the exact fake-timer values) + independently re-verified by grep, this pass |
| AC-15 (first save creates the repo dir) | pass — `RunStore.contract.ts` |
| AC-16 (`RunFailureRecord` shape) | pass — independently re-verified by direct read, this pass |
| AC-17 (no `process.env`) | pass — inspection, independently re-run and re-scoped in this QA pass (one false-positive comment hit correctly excluded) |
| AC-18 (decoy redaction, `failure.message` excluded by design) | pass — proven at both the serializer-string level (ST-2) and the on-disk level (ST-4), mutation-proven in ST-2; independently re-run via `-t "AC-18"`, this pass |
| AC-19 (`InvalidRunRecordError` validation) | pass — `RunRecordPathFieldsSchema` + `RunStore.contract.ts`, 8 distinct rejection cases |
| AC-20 (fs failures translated, `cause` preserved) | pass — `run-store-fs.ts`'s single `catch` wrapping every staging step; the step-4 `stat` failure was also wrapped, a design refinement caught during ST-3 implementation |
| AC-21 (architecture guards, quality gate) | pass — `npm run check`/`npm test` independently re-run green in this pass; `depcruise` confirms zero violations |

21 of 21 ACs implemented and test-pinned or independently verified by inspection. No AC is manual-only.

## Findings

**None new.** Nothing surfaced in this final pass beyond what `review-ledger.md` already reported and resolved:

| Prior Item | Status |
|---|---|
| R1/R3-001 (ledger, `CRITICAL`) | **refuted** — the losing concurrent caller is guaranteed to error; residual nuance recorded as a `risk-005` refinement, not a defect |
| R4-001 (ledger, `WARNING`, `info`) | non-blocking; original error's `cause` correctly preserved regardless |
| The ST-1/ST-2/ST-3 mechanical biome-reformat deviations | cosmetic only, already resolved by `--write`, re-confirmed clean by this pass's fresh `npm run check` |
| ST-3's driver-file deviation (creating `run-store-fs.test.ts` earlier than plan.md's file list implied) | resolved transparently; the file exists exactly once, ST-4 extended it as planned, no duplication |

## Verdict

**pass.** The change is complete and honest: 21 of 21 ACs implemented and independently re-verified in this pass (not merely trusted from `execution-log.md`), all quality gates green (`npm run check`, `npm test` 326/326), the diff exactly 10 files confined to `src/core/history/**` and `src/adapters/driven/storage/**` with zero spill into `src/core/run/**`, any other adapter, or `src/main/`, architecture guards clean at 72 modules / 142 dependencies, and the one severe finding a full-4r review + refuter cycle produced was concretely refuted with a step-by-step correctness proof, not merely dismissed.

Worth recording plainly: unlike `[E4.F2.H3]`, this story reached a clean `pass` on its **first** final QA attempt — no amendment cycle was needed. That is a genuine difference in outcome, not a lower bar: the spec itself went through a directed re-analysis (revision 2) *before* any code was written, which is where `[E4.F2.H3]`'s equivalent gap-closing work happened instead.

## Next Action

`final` + `pass` → the change closes: `lifecycle_status: completed`, `next_action.kind: complete`.

Remaining work is outside this change:

1. **`history-log`** — the mandatory session audit entry must be written before closing the session (`CLAUDE.md`, Audit history).
2. **Offer the PR** — `[E5.F2.H1] RunStore: full persistence`, `Closes #33`. Per `CLAUDE.md`, do not open it unless the user explicitly asks; never merge, never push `main`.
3. **Downstream, not now** — `RunStore`/`createRunStoreFsAdapter` are intentionally not wired into any composition root; that is `E6.F1`, which depends on this story. The `E6.F1` author should also read `risk-005`'s refined text in `state.yaml` before any future work introduces concurrent calls to `save()`.
4. **`[E5.F2.H2]`** (`listRuns`/`getRun`, issue #34) is now unblocked — its own design will need to decide the read-side contract this story's write-only port deliberately deferred.
