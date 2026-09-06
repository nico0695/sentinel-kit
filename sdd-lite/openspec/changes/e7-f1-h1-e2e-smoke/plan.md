# Plan

## Execution Digest

- change_name: e7-f1-h1-e2e-smoke
- objective: new-feature (story `[E7.F1.H1]`, issue #41)
- route: continue-lite
- digest_summary: >-
  Six ordered stages, plus **ST-5b inserted by Amendment 1** after ST-5 returned `partial`.
  The only production-code edit (the `engineOverride` seam in `src/main/container.ts`, D-1/D-2)
  is isolated as ST-1 so it is reviewable and revertible on its own; the quality-gate config
  edits (d-004) land as ST-2 before any `e2e/` file exists so a `check` failure there is
  attributable to the config alone; the suite lands in two stages (fixture + happy path, then
  the negative case); AC-11 mutation verification is its own stage; ST-5b closes the blind spot
  ST-5 demonstrated (risk-e7h1-011); a final gate stage proves `check` + `test` + `build` green
  and the tree clean.
- stage_plan_digest: ST-1 seam -> ST-2 gate config -> ST-3 fixture + happy path -> ST-4 negative
  case -> ST-5 AC-11 mutations -> **ST-5b worktree-location assertions (Amendment 1)** -> ST-6
  full gate and closeout. Strictly sequential; every stage is code-touching and requires
  `stage_approval`.
- validation_digest: >-
  Narrow first, full last. ST-1 runs the full gate (only production change; must prove zero
  regression against 1037 tests). ST-2 runs `npm run check` only. ST-3/ST-4 run
  `npx vitest run --project e2e` plus `npm run check`. ST-5 runs the e2e project repeatedly plus
  `git status --porcelain`. **ST-5b runs the e2e project four times — green with the new
  assertions, RED under a re-applied M2, green after the revert — plus an empty
  `git diff src/main/container.ts` and `npm run check`.** ST-6 runs `npm run check`, `npm test`,
  `npm run build`.

## Summary

- change_name: e7-f1-h1-e2e-smoke
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true (after plan approval + per-stage `stage_approval`)
- plan_status: ready-for-execution (ST-1..ST-5 executed; ST-5b and ST-6 pending)

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| ST-1 | Add the optional, test-only `ReviewEngine` seam (D-1/D-2/D-3) | — | `src/main/container.ts` only: `readonly engineOverride?: ReviewEngine` on `CliDepsOptions` (`@internal` TSDoc per D-3) and on the private `WiringGraphOptions`; one `??` at the engine site; one-line comment naming d-003 + AC-7 | `npm run check` clean; `npm test` still 1037/1037 across 49 files; `git diff src/main/container.ts` limited to the three documented edits; `git diff src/core/repos/ports/config-schemas.ts` empty (AC-7) | yes (production) | yes | **done (success)** |
| ST-2 | Bring `e2e/` into the quality gate (d-004, AC-8) | ST-1 | `tsconfig.json#include` -> `["src", "e2e"]`; `biome.json#files.includes` += `"e2e/**"`. `.dependency-cruiser.cjs` and `package.json#scripts.check` UNCHANGED (N-2) | `npm run check` clean (no `npm test` needed — no runtime change). Run before any `e2e/` file exists so any new finding is attributable to the config edit, not to new code. If `check` surfaces a pre-existing finding or a `tsup`/vitest type-resolution interaction, STOP and report rather than widening the edit | yes (config) | yes | **done (success; risk-e7h1-008 retired)** |
| ST-3 | Hermetic fixture + happy-path smoke (S1-S4; AC-1..AC-6, AC-12) | ST-2 | New `e2e/support/hermetic-git.ts` (D-5: `createHermeticRepo()` + `HERMETIC_GIT_ENV`, origin comment pointing at `src/adapters/driven/git/__test__/git-cli.test.ts`; not a `.test.ts` file). New `e2e/review-flow.test.ts` with test 1: `repo add` -> `repo list` -> `review` -> `runs list` -> `runs show`, each an argv array through `createCli(createCliDeps({ env: { SENTINEL_HOME: <tmp> }, homeDir: <dead tmp>, engineOverride: fake })).run(argv)`; unconditional `afterEach` removing both temp roots (D-6) | `npx vitest run --project e2e` green with >0 tests (AC-1); then `npm run check` clean. Re-run once to confirm determinism | yes (test) | yes | **done (success; corrections in risk-e7h1-010)** |
| ST-4 | Negative case (S5; AC-6, AC-12) | ST-3 | Test 2 in the same file: FakeEngine scripted to `VERDICT: request-changes`, exit code `1` asserted, same three persisted files asserted as S3 | `npx vitest run --project e2e` — 2 tests green; `npm run check` clean | yes (test) | yes | **done (success; committed at `2872a28`)** |
| ST-5 | AC-11 mutation verification | ST-4 | No net file change. Apply design's M1 (`run-store-fs.ts`: `metadata.json` -> `meta.json`), M2 (`createWiringGraph`: `worktreesDir: paths.clonesDir`), and optionally M3 (`resolveReviewExitCode` returns `0` for `request-changes`) — one at a time, never stacked | Per mutation: `npx vitest run --project e2e` red, record the exact failing assertion; `git checkout -- <file>`; re-run green. After the last revert: `git status --porcelain` shows only the intended new/modified files of ST-1..ST-4 and `git diff` on `run-store-fs.ts` / `container.ts` / the exit-code module shows no mutation residue. At least two mutations on different layers are required; a stray mutation left in the tree is a defect, not a nit | yes (temporary only) | yes | **done (`partial`) — M1 RED (2/2 failed, `ENOENT …/runs/acme__widget/<ts>/metadata.json` at `e2e/review-flow.test.ts:192` and `:311`), M3 RED (1 failed 1 passed, `expected +0 to be 1` at `:295`), M2 GREEN (2/2 still passed). AC-11 satisfied on two layers; M2's gap opened risk-e7h1-011 and is closed by ST-5b** |
| **ST-5b** | **Close the risk-e7h1-011 blind spot: make the smoke observe the worktree root it actually used (Amendment 1)** | ST-5 | **`e2e/review-flow.test.ts` only** (plus the temporary M2 mutation of `src/main/container.ts`, reverted within the stage). Two assertions, added to the happy-path test — no new test, no matrix: (a) the review really used `<SENTINEL_HOME>/worktrees/…` as its worktree root; (b) `<SENTINEL_HOME>/clones/` stayed untouched (empty or absent — the fixture registers with `--local-path`, so nothing legitimately writes there). The executor picks the observable signal that survives worktree cleanup and proves it non-vacuous with M2; the leading candidate is the residual `<SENTINEL_HOME>/worktrees/<repoBasename>/` parent directory that `worktreeAdd` creates and `worktree remove` leaves behind. **Zero net production change**; no `src/core/**`, no adapter, no config, no new file | 1. `npx vitest run --project e2e` -> 2/2 green with the new assertions. 2. Re-apply M2 (`container.ts:256`, `worktreesDir: paths.clonesDir`) -> **must be RED**, and record the exact failing assertion and line in `execution-log.md`, the same evidence shape ST-5 used for M1/M3. If it does not go red, the chosen signal is vacuous: STOP and report rather than weakening the assertion. 3. `git checkout -- src/main/container.ts`; `git diff src/main/container.ts` **empty**. 4. Re-run `npx vitest run --project e2e` -> 2/2 green. 5. `npm run check` clean; `git status --porcelain` shows `e2e/review-flow.test.ts` as the only source change | yes (test + temporary mutation) | yes | pending |
| ST-6 | Full gate + closeout evidence (AC-8, AC-9, AC-10) | **ST-5b** | No code change beyond fixes the gate demands | `npm run check` clean; `npm test` = previous 1037 + the 2 new tests, no pre-existing suite modified; `npm run build` OK; `node dist/cli.js --version` OK; record that AC-10 needs no workflow edit (`test` job already runs all vitest projects on the Node 22/24 matrix). One-off AC-8 spot check: introduce a deliberate type error in `e2e/`, confirm `tsc --noEmit` fails, revert, re-run clean. **Also confirm risk-e7h1-011 is closed by ST-5b's recorded RED, not carried as an accepted gap** | yes (verification) | yes | pending |

## Validation Strategy

- **Narrow per stage, full at the ends.** ST-1 is the only stage that must run the whole gate mid-flow, because it is the only production change and AC-7/AC-9 rest on it. ST-2 needs `npm run check` alone. ST-3/ST-4/ST-5b use `npx vitest run --project e2e` for the fast loop and `npm run check` once at stage end. ST-6 proves the full gate.
- **Amendment-1 corrections are binding on the assertions written in ST-3/ST-4** (do not write assertions that cannot pass):
  - assert `validations/` **absent** under the `quick` harness (A-1, N-4);
  - assert `<SENTINEL_HOME>/repos.yaml` only — never `config.yaml` (A-2; asserting `config.yaml` absent is optional);
  - verify run identity by matching the run directory **basename** against the id `runs list` prints — there is no `id` key in `metadata.json` (A-3);
  - **never** assert `metadata.json#engine` (it reads `claude-code` while the FakeEngine ran);
  - assert content, not just existence: `result.md` equals the scripted output exactly, `prompt.md` non-empty, `metadata.json` carries `repo: "acme/widget"`, `targetRef`, `state: "ok"`, `verdict: "approve"`.
- **A mutation that stays green is a finding, not a swap.** ST-5's rule stands and now governs ST-5b in reverse: ST-5b exists because M2 stayed green, and its own success condition is that the same mutation now turns the suite red. An assertion added in ST-5b that does not fail under M2 is vacuous and must not be kept as if it closed the gap.
- **AC-7 is verified by reading the diff**, not by a regression test: `src/main/__test__/` holds only `paths.test.ts`, so "existing wiring tests unmodified" is vacuous (risk-e7h1-007). Evidence is the bounded `container.ts` diff plus an empty diff on `config-schemas.ts`.
- **Every asserted path is built with `join(sentinelHome, ...)`**, which satisfies AC-3 by construction; `SENTINEL_HOME` is injected via `env`, never by mutating `process.env`.
- QA reruns one ST-5 mutation independently and confirms `git status` clean; after Amendment 1 it should prefer **M2**, because that is the mutation whose behaviour changed.

## Dependencies And Sequencing

- Strictly sequential: ST-1 -> ST-2 -> ST-3 -> ST-4 -> ST-5 -> **ST-5b** -> ST-6. No parallelization.
- ST-3 cannot start before ST-1 (the suite calls `engineOverride`) or ST-2 (otherwise the new files land outside the gate and a later `check` failure mixes two causes).
- ST-5 requires a green ST-4: a mutation is only evidence if the pre-mutation state was green.
- **ST-5b must run before ST-6** and not after: ST-6 closes the change, so a gap accepted there ships. ST-5b's re-applied M2 also needs a green two-test baseline, which only exists once ST-5's reverts are proven (they are — `git diff src/` empty at the end of ST-5).
- ST-2 is the one stage with an external interaction risk (tsc/biome/tsup/vitest seeing `e2e/` for the first time). Failure there is a STOP-and-report, not a scope expansion. **Retired at ST-2: the isolation run came back byte-identical to the baseline (risk-e7h1-008).**

## Planner Stop Note

- `objective` is `new-feature`, not `planner`: this change proceeds to `sddl-executor` after plan approval. Not a planner terminal stop, and not a `macro-plan-first` route.

## Approval Notes

- All stages touch the working tree, so each requires an explicit `stage_approval` before `sddl-executor` runs it; `interactive` mode does not waive this. **ST-5b is a new code-touching stage and carries its own `stage_approval`** — the approvals already granted for ST-1..ST-5 do not cover it.
- Blast radius unchanged from design plus ST-5b's two assertions: 2 new files, 3 substantive lines in `src/main/container.ts`, 2 config edits. No `src/core/**` change, no adapter change, no CI change, no user-facing surface change.
- Open risks carried into execution: risk-e7h1-005 (test-only seam in production code, mitigated by AC-7 and ST-1's diff check) and risk-e7h1-007 (AC-7 verified by reading, not by a test). Both are accepted, not open questions. **risk-e7h1-011 is no longer an open question either: the user chose option (b) — close it — and ST-5b is that closure.**
- Recommended next stage: `sddl-executor` at **ST-5b**.

## Budget Notes

- Plan kept compact; design rationale is not duplicated here — see `design.md` D-1..D-8.

---

## Amendment 1 — ST-5b inserted after ST-5

*Appended after `sddl-executor` returned `partial` for ST-5, under a level-B user decision. This is an insert, not a rebuild: ST-1..ST-6's goals, scopes, validation notes, the validation strategy bullets and the approval notes above are preserved; the Status cells of ST-1..ST-5 were rewritten from `pending` to their real outcome so the plan reflects execution rather than intention, ST-6's `Depends On` now reads ST-5b, and the digests name ST-5b. ST-6 is deliberately **not** renumbered — `execution-log.md`, `state.yaml` and the QA handoff already reference these ids.*

### Why

ST-5 proved AC-11 on two layers and, in doing so, produced the most valuable finding of the story: one of its three planned mutations does not turn the suite red.

| Mutation | Layer | Result | Evidence |
|---|---|---|---|
| M1 — `src/adapters/driven/storage/run-store-fs.ts:219`, `metadata.json` -> `meta.json` | driven storage | **RED**, 2 of 2 failed | `ENOENT … /runs/acme__widget/<ts>/metadata.json` at `e2e/review-flow.test.ts:192` and `:311` |
| M2 — `createWiringGraph`, `src/main/container.ts:256`, `worktreesDir: paths.clonesDir` | composition root | **GREEN**, 2 of 2 still passed | no assertion failed |
| M3 — `resolveReviewExitCode`, `src/adapters/driving/cli/exit-code.ts`, returns `0` unconditionally | driving CLI | **RED**, 1 failed 1 passed | `expected +0 to be 1` at `e2e/review-flow.test.ts:295` |

M2 is live code, not a dead branch: `container.ts:256` -> `run-review.ts:402` -> `create-review-worktree.ts`, which builds `<worktreesDir>/<repoBasename>/<label>-<ts>`. Under the mutation the ephemeral worktree really is created in the wrong tree and the suite notices nothing, because the fixture registers with `--local-path` (leaving `clonesDir` otherwise empty) and nothing asserts where the worktree lived. It matters in production, not only in the test: `listOrphanWorktrees` scans `worktreesDir`, so a worktree created outside it is invisible to orphan cleanup, and `<clonesDir>/<repoBasename>/` shares a tree with managed clones. Recorded as **risk-e7h1-011**.

Adding the assertion was correctly out of ST-5's approved scope ("no net file change"), so it was routed out rather than improvised.

### Decision

- **Level B**, decided by the **user**: option (b) — close the gap now — over option (a), accept and document it for the MVP. The trigger was that ST-6 closes the change, so a gap accepted silently there ships.
- Consequence: one inserted stage, **ST-5b**, scoped to `e2e/review-flow.test.ts` plus the temporary re-application of M2. No net production change, no spec change, no new acceptance criterion — ST-5b strengthens the evidence for the existing AC-11 rather than adding a requirement.
- **Level A**, decided by `sddl-plan`: insert as `ST-5b` rather than renumber ST-6, because downstream artifacts already reference the existing ids; and rewrite the ST-1..ST-5 Status cells rather than leave them historical, because a reader of this plan at the ST-5b gate needs to see which stages are already spent.

### Scope Guard

ST-5b is a smoke safety net addition, **two assertions, not a matrix** (`docs/testing.md`). Explicitly out of scope: a dedicated worktree-lifecycle test, an orphan-cleanup test, any assertion on the worktree's interior, a third e2e test, and any production fix — M2 is a *mutation*, and the code under it is correct as it stands.
