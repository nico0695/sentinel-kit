# S21 — [E4.F2.H2] closeout + [E4.F2.H3] cascading engine resolution, end to end

- **Date**: 2026-08-22
- **Branch**: `claude/project-status-validation-9qh8xs`
- **Scope**: Close out `[E4.F2.H2]` (issue #29) and open PR #67; then run `[E4.F2.H3]` (issue #30) end to end — full sdd-lite cycle, 4R review, Amendment 1, two final QA passes
- **sdd-lite changes**: [`e4-f2-h2-opencode-adapter`](../../sdd-lite/openspec/changes/e4-f2-h2-opencode-adapter/) (closeout only) · [`e4-f2-h3-cascading-engine-resolution`](../../sdd-lite/openspec/changes/e4-f2-h3-cascading-engine-resolution/) (complete: proposal → spec → design → plan → ST-1..ST-4 → 4R review → QA seq 1 & 2, `lifecycle_status: completed`)

## Objective

Validate project status and close `[E4.F2.H2]` with a PR; then implement `[E4.F2.H3]` (engine cascade from PRD §3.1-D: global default → per-repo → per-run, unknown-engine validation, engine recorded in run metadata) through the full sdd-lite workflow.

## Decisions

| ID | Decision | Alternatives considered | Why | Authorship |
|----|----------|--------------------------|-----|------------|
| S21-D1 | Open PR #67 (`[E4.F2.H2] engines/opencode adapter`, `Closes #29`) against `main` from the current branch | Wait / batch with a future change | Explicit user instruction ("si, abre el pr"); 0 open PRs at the time, within the max-5 limit; `next_action.kind: halt` in state.yaml already recommended offering the PR | `user` |
| S21-D2 | Close `[E4.F2.H2]` and start `[E4.F2.H3]` sequentially, not in parallel | Run both sdd-lite changes concurrently | `[E4.F2.H3]` depends functionally on both H1 and H2 being finished; H2 still had an open `final_review` checkpoint to formally accept. Presented as a recommendation via `AskUserQuestion`; user selected it | `claude→user` |
| S21-D3 | H3 shape: `resolveEngine` as a **separate pure function**, not a new `runReview` internal step; "engine used" recorded as a symmetrical optional `engineName` echo field on `RunReviewRequest`/`RunReviewResult` | Fold the cascade into `runReview`; wait for a `RunStore` to exist before claiming "run metadata" | Keeps `run-review.ts`'s pipeline untouched beyond a 2-field diff and avoids coupling it to `repos`-module config shapes. No `src/core/history/` module exists yet, so the echo field is the honest scope for "recorded in run metadata" rather than an invented store | `claude` |
| S21-D4 | Extract a single shared `EngineNameSchema` in `config-schemas.ts`, reused by both cascade levels and `resolveEngine` | Leave the two inline `z.enum([...])` literals and add a third inside `resolveEngine` | Three literal engine lists to keep in sync is a real drift hazard; extraction is type-preserving (`z.infer` output unchanged) so existing `ConfigStore` contract tests act as the regression guard unmodified | `claude` |
| S21-D5 | 4R review triaged as **`standard` tier — one lens (`reliability`)**, no refuter pass | Run the full 4R set + refuter | Protocol rubric: 224 changed lines (< 400 threshold) and no auth/security/payments/sensitive-data/migration surface, verified by grep over the diff's added lines rather than assumed. The rubric explicitly forbids adding lenses to a `standard` review; the refuter is `full-4r`-only and applies solely to severe *inferential* findings, of which there were none | `claude` |
| S21-D6 | Resolve the QA-1 / R3-001 contract mismatch by **amending `spec.md`** (reword AC-1, add AC-10 + pinning tests), not by changing `resolveEngine`'s logic or accepting the discrepancy | (2) fix the code to cascade past `""`; (3) accept as a disclosed discrepancy | B-level. Presented at `cp-final-review` with three options and a recommendation, twice — once from QA seq 1, again after the 4R review independently confirmed the same defect. User chose option 1. The implemented behavior is the better reading: an explicit `--engine ""` is malformed input, and erroring beats silently substituting a different engine than the operator asked for | `claude→user` |
| S21-D7 | Do **not** amend `design.md`, and do **not** amend the frozen `review-ledger.md`, as part of Amendment 1 | Amend both for surface consistency | `design.md`'s pseudocode already showed `!== undefined` and was consistent with the shipped code all along — nothing to correct. The ledger is frozen to target `30c90aa`, where the old spec wording genuinely applied, so its claim text is accurate for its target; rewriting it to reflect a later fix would destroy the audit trail it exists to provide | `claude` |
| S21-D8 | Re-run final QA (seq 2) against the amended 10-AC spec instead of letting seq 1's `pass_with_warnings` stand | Accept the seq-1 verdict as the closing one | Seq 1 was issued against the old 9-AC spec and its sole warning no longer applied, making it stale as a closeout record. Recommended; user approved ("si") | `claude→user` |

## Deviations

- **Stale merge-base for the closing-gate diff.** `plan.md`'s ST-3 validation notes assumed the story diff could be scoped against `aa664bb` (the pre-H2 merge-base). PR #67 merged mid-session, making that base include all of H2's 1328 lines. Scoped the gate to this story's own commit range (`651fecb~1..HEAD`) instead, and recorded the substitution in `execution-log.md` rather than silently reporting an 8-file diff from a command that would have shown 13.
- **QA did not pass clean on the first attempt.** Seq 1 returned `pass_with_warnings` on QA-1; the 4R review then independently confirmed the same defect as R3-001. This drove Amendment 1 and ST-4 — recorded as a real cycle, not smoothed over. The clean `pass` came on the second attempt.
- **QA seq 2 deliberately did not re-run seq 1's production-code verifications.** Established via `git diff 30c90aa..HEAD -- src/` that production code was byte-identical (only the test file changed, +32 lines), so those checks still held; re-running identical checks on identical bytes would have manufactured the appearance of independence without adding evidence. Stated explicitly in `qa-report.md` instead of quietly repeating them.

## Work done

- **`[E4.F2.H2]` closeout**: opened [PR #67](https://github.com/nico0695/sentinel-kit/pull/67) (`Closes #29`) after confirming 0 open PRs and no repo PR template; verified `state.yaml` needed no edits. PR since **merged** by the user.
- **`[E4.F2.H3]` full cycle** (`651fecb`..`bd3194c`, 10 commits):
  - Artifacts: `651fecb` proposal · `c34beb3` spec (9 ACs) · `5c3daa3` design · `c774501` plan (3 stages)
  - Implementation: `e269e40` ST-1 (shared `EngineNameSchema`) · `3369c00` ST-2 (`resolveEngine` + `UnknownEngineError`, 7 tests) · `f5205eb` ST-3 (`engineName` echo + closing gate, 2 tests)
  - Review & closeout: `30c90aa` QA seq 1 (`pass_with_warnings`) · `1d304fa` 4R review (`standard` tier, `pass_with_warnings`, 0 open severe) · `58262a2` ST-4 (Amendment 1: AC-10 + 2 tests, **test-only, zero production changes**) · `bd3194c` QA seq 2 (**clean `pass`**, change `completed`)
- **Validations**: `npm run check` (biome + `tsc --noEmit` + depcruise) green at every stage; `npm test` 284 → 291 → 293 → 295, each delta exact. Final diff: 8 files, 235 insertions, **all under `src/core/`** — zero adapter or `src/main/` spill.
- **Verification method** (beyond running the suite): every new test proven non-vacuous by mutation — precedence swap, validation removal, echo-spread deletion, cascade-past-empty, and a level-mislabel mutation added during QA seq 2 specifically to prove the AC-10 tests pin the reported `level` and not merely that something throws. Tree restored and re-verified clean after each.

## Pending and next steps

- **Claude (next, this session)**: open the PR for `[E4.F2.H3]` — `Closes #30`.
- **User**: run AC-24 manual verification for `[E4.F2.H1]` (#28) and `[E4.F2.H2]` (#29) against real authenticated engine CLIs — `docs/todo/E4/manual-verification.md` items 1–2. Not automatable here. **`[E4.F2.H3]` adds nothing to this list**: it has no manual-only AC.
- **User**: decide whether to `subscribe_pr_activity` on the open PRs (offered for #67, not answered).
- **Downstream**: `resolveEngine` is deliberately not wired into any composition root — that is `E6.F1`, which depends on this story. Its author should read `review-ledger.md`'s R3-002 first: the conditional-spread call shape is required by this codebase's `exactOptionalPropertyTypes` convention (0 optional props use explicit `| undefined`; 14 conditional-spread call sites already exist).
- 7 non-blocking `info` findings from `[E4.F2.H2]`'s 4R review remain optional polish — not requested.

## Open questions for the user

—
