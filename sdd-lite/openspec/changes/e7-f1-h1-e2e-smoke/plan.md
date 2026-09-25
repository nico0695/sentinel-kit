# Plan

## Execution Digest

- change_name: e7-f1-h1-e2e-smoke
- objective: new-feature (story `[E7.F1.H1]`, issue #41)
- route: continue-lite
- digest_summary: >-
  Six ordered stages, plus **ST-5b inserted by Amendment 1** after ST-5 returned `partial`,
  plus **ST-7 inserted by Amendment 2** after the full-4r review of the completed change
  returned `fail` on one open CRITICAL (R3-001). ST-1..ST-6 are all executed; ST-7 is fix
  **round 1 of a maximum 2** and is the only pending stage.
  The only production-code edit (the `engineOverride` seam in `src/main/container.ts`, D-1/D-2)
  is isolated as ST-1 so it is reviewable and revertible on its own; the quality-gate config
  edits (d-004) land as ST-2 before any `e2e/` file exists so a `check` failure there is
  attributable to the config alone; the suite lands in two stages (fixture + happy path, then
  the negative case); AC-11 mutation verification is its own stage; ST-5b closes the blind spot
  ST-5 demonstrated (risk-e7h1-011); a final gate stage proves `check` + `test` + `build` green
  and the tree clean. **ST-7 then closes the review's CRITICAL: the diff and prompt stages —
  the middle of the flow — are unobserved, so it makes them observable and proves it by
  mutation, and folds in eight cheap info rows.**
- stage_plan_digest: ST-1 seam -> ST-2 gate config -> ST-3 fixture + happy path -> ST-4 negative
  case -> ST-5 AC-11 mutations -> **ST-5b worktree-location assertions (Amendment 1)** -> ST-6
  full gate and closeout -> **ST-7 fix round 1: observe the diff and the prompt (Amendment 2)**.
  Strictly sequential; every stage is code-touching and requires `stage_approval`.
- validation_digest: >-
  Narrow first, full last. ST-1 runs the full gate (only production change; must prove zero
  regression against 1037 tests). ST-2 runs `npm run check` only. ST-3/ST-4 run
  `npx vitest run --project e2e` plus `npm run check`. ST-5 runs the e2e project repeatedly plus
  `git status --porcelain`. **ST-5b runs the e2e project four times — green with the new
  assertions, RED under a re-applied M2, green after the revert — plus an empty
  `git diff src/main/container.ts` and `npm run check`.** ST-6 runs `npm run check`, `npm test`,
  `npm run build`. **ST-7 is verified by mutation, not by a green run: R3-001 is the claim that
  certain breakages go unnoticed, so the proof is that at least two named mutations now turn the
  e2e project RED, with the failing assertion recorded, then reverted and proven reverted by an
  empty `git diff`, followed by `npm run check` and the full `npm test` (baseline 1039/1039
  across 50 files).**

## Summary

- change_name: e7-f1-h1-e2e-smoke
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true (after plan approval + per-stage `stage_approval`)
- plan_status: ready-for-execution (ST-1..ST-6 executed, including ST-5b; **ST-7 pending —
  fix round 1 of a maximum 2, inserted by Amendment 2**)

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| ST-1 | Add the optional, test-only `ReviewEngine` seam (D-1/D-2/D-3) | — | `src/main/container.ts` only: `readonly engineOverride?: ReviewEngine` on `CliDepsOptions` (`@internal` TSDoc per D-3) and on the private `WiringGraphOptions`; one `??` at the engine site; one-line comment naming d-003 + AC-7 | `npm run check` clean; `npm test` still 1037/1037 across 49 files; `git diff src/main/container.ts` limited to the three documented edits; `git diff src/core/repos/ports/config-schemas.ts` empty (AC-7) | yes (production) | yes | **done (success)** |
| ST-2 | Bring `e2e/` into the quality gate (d-004, AC-8) | ST-1 | `tsconfig.json#include` -> `["src", "e2e"]`; `biome.json#files.includes` += `"e2e/**"`. `.dependency-cruiser.cjs` and `package.json#scripts.check` UNCHANGED (N-2) | `npm run check` clean (no `npm test` needed — no runtime change). Run before any `e2e/` file exists so any new finding is attributable to the config edit, not to new code. If `check` surfaces a pre-existing finding or a `tsup`/vitest type-resolution interaction, STOP and report rather than widening the edit | yes (config) | yes | **done (success; risk-e7h1-008 retired)** |
| ST-3 | Hermetic fixture + happy-path smoke (S1-S4; AC-1..AC-6, AC-12) | ST-2 | New `e2e/support/hermetic-git.ts` (D-5: `createHermeticRepo()` + `HERMETIC_GIT_ENV`, origin comment pointing at `src/adapters/driven/git/__test__/git-cli.test.ts`; not a `.test.ts` file). New `e2e/review-flow.test.ts` with test 1: `repo add` -> `repo list` -> `review` -> `runs list` -> `runs show`, each an argv array through `createCli(createCliDeps({ env: { SENTINEL_HOME: <tmp> }, homeDir: <dead tmp>, engineOverride: fake })).run(argv)`; unconditional `afterEach` removing both temp roots (D-6) | `npx vitest run --project e2e` green with >0 tests (AC-1); then `npm run check` clean. Re-run once to confirm determinism | yes (test) | yes | **done (success; corrections in risk-e7h1-010)** |
| ST-4 | Negative case (S5; AC-6, AC-12) | ST-3 | Test 2 in the same file: FakeEngine scripted to `VERDICT: request-changes`, exit code `1` asserted, same three persisted files asserted as S3 | `npx vitest run --project e2e` — 2 tests green; `npm run check` clean | yes (test) | yes | **done (success; committed at `2872a28`)** |
| ST-5 | AC-11 mutation verification | ST-4 | No net file change. Apply design's M1 (`run-store-fs.ts`: `metadata.json` -> `meta.json`), M2 (`createWiringGraph`: `worktreesDir: paths.clonesDir`), and optionally M3 (`resolveReviewExitCode` returns `0` for `request-changes`) — one at a time, never stacked | Per mutation: `npx vitest run --project e2e` red, record the exact failing assertion; `git checkout -- <file>`; re-run green. After the last revert: `git status --porcelain` shows only the intended new/modified files of ST-1..ST-4 and `git diff` on `run-store-fs.ts` / `container.ts` / the exit-code module shows no mutation residue. At least two mutations on different layers are required; a stray mutation left in the tree is a defect, not a nit | yes (temporary only) | yes | **done (`partial`) — M1 RED (2/2 failed, `ENOENT …/runs/acme__widget/<ts>/metadata.json` at `e2e/review-flow.test.ts:192` and `:311`), M3 RED (1 failed 1 passed, `expected +0 to be 1` at `:295`), M2 GREEN (2/2 still passed). AC-11 satisfied on two layers; M2's gap opened risk-e7h1-011 and is closed by ST-5b** |
| **ST-5b** | **Close the risk-e7h1-011 blind spot: make the smoke observe the worktree root it actually used (Amendment 1)** | ST-5 | **`e2e/review-flow.test.ts` only** (plus the temporary M2 mutation of `src/main/container.ts`, reverted within the stage). Two assertions, added to the happy-path test — no new test, no matrix: (a) the review really used `<SENTINEL_HOME>/worktrees/…` as its worktree root; (b) `<SENTINEL_HOME>/clones/` stayed untouched (empty or absent — the fixture registers with `--local-path`, so nothing legitimately writes there). The executor picks the observable signal that survives worktree cleanup and proves it non-vacuous with M2; the leading candidate is the residual `<SENTINEL_HOME>/worktrees/<repoBasename>/` parent directory that `worktreeAdd` creates and `worktree remove` leaves behind. **Zero net production change**; no `src/core/**`, no adapter, no config, no new file | 1. `npx vitest run --project e2e` -> 2/2 green with the new assertions. 2. Re-apply M2 (`container.ts:256`, `worktreesDir: paths.clonesDir`) -> **must be RED**, and record the exact failing assertion and line in `execution-log.md`, the same evidence shape ST-5 used for M1/M3. If it does not go red, the chosen signal is vacuous: STOP and report rather than weakening the assertion. 3. `git checkout -- src/main/container.ts`; `git diff src/main/container.ts` **empty**. 4. Re-run `npx vitest run --project e2e` -> 2/2 green. 5. `npm run check` clean; `git status --porcelain` shows `e2e/review-flow.test.ts` as the only source change | yes (test + temporary mutation) | yes | **done — see `execution-log.md` for the recorded M2 result. The review independently re-confirmed the two assertions are non-vacuous (`readdirSync` throws where the directory was never created, rather than passing silently as `existsSync` would)** |
| ST-6 | Full gate + closeout evidence (AC-8, AC-9, AC-10) | **ST-5b** | No code change beyond fixes the gate demands | `npm run check` clean; `npm test` = previous 1037 + the 2 new tests, no pre-existing suite modified; `npm run build` OK; `node dist/cli.js --version` OK; record that AC-10 needs no workflow edit (`test` job already runs all vitest projects on the Node 22/24 matrix). One-off AC-8 spot check: introduce a deliberate type error in `e2e/`, confirm `tsc --noEmit` fails, revert, re-run clean. **Also confirm risk-e7h1-011 is closed by ST-5b's recorded RED, not carried as an accepted gap** | yes (verification) | yes | **done (success) — the change was frozen at `f5cd81f` and handed to the full-4r review, which is what produced Amendment 2** |
| **ST-7** | **Fix round 1 (Amendment 2): make the diff and prompt stages observable — R3-001 — and fold in the cheap info rows** | **ST-6** | **`e2e/review-flow.test.ts`, `e2e/support/hermetic-git.ts`, `vitest.config.ts`. Exactly nine ledger ids: R3-001 (CRITICAL, blocking) + R3-002, R3-003, R3-004, R4-001, R4-002, R1-001, R2-001, R2-002. No `src/**` change of any kind (mutations excepted, and reverted inside the stage), no third e2e test, no new dependency. Full per-id contract in Amendment 2 below** | **Mutation-first, not green-first. (1) `npx vitest run --project e2e` -> 2/2 green with the new assertions. (2) apply M4 (`compute-review-diff.ts:226`, `from: mergeBase` -> `from: request.baseRef`) -> must be RED; record the exact failing assertion and line. (3) `git checkout -- src/core/workspace/compute-review-diff.ts`; `git diff` on it **empty**; re-run green. (4) repeat (2)-(3) for M5 (`assemble-prompt.ts:25`, drop `renderDiff(input.diff)` from `sections`). M8 is mandatory too if R3-006 is taken. Any mutation that stays GREEN means the assertion is vacuous: STOP and report, do not weaken it. (5) `npm run check` clean. (6) `npm test` = **1039 or more** across 50 files, no pre-existing suite modified. (7) `git status --porcelain` shows only the three files above** | **yes (test + config + temporary mutations)** | **yes (`stage_approval`; the ST-1..ST-6 approvals do not cover it)** | pending |

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

---

## Amendment 2 — Fix round 1: ST-7 inserted after ST-6

*Appended under level-B user decision **d-012** at the review gate, after the `full-4r` review of the frozen target `f5cd81f` (diff sha256 `0e9569b4…`) returned `fail` on one open CRITICAL. This is an insert, not a rebuild: ST-1..ST-6's goals, scopes, validation notes, the Validation Strategy bullets, Dependencies And Sequencing, Amendment 1 and its Scope Guard above are all preserved verbatim. Two Status cells were rewritten (ST-5b and ST-6, from `pending` to `done`) because ST-7 follows a **completed** ST-6 rather than interrupting the sequence — the review ran after execution had finished, so nothing here reopens a stage. No id is renumbered: `execution-log.md`, `state.yaml`, the review ledger and the QA handoff already reference ST-1..ST-6.*

### Fix Digest

- authority: **d-012**, level B, decided by the **user**. Fix **round 1 of a maximum 2**. The two-round budget is a hard cap in the review protocol: if a scoped re-review of ST-7's delta opens another severe finding, exactly one more round is available and then the change must ship or stop. Zero rounds were spent before this one.
- scope: exactly nine confirmed ledger ids — **R3-001** (CRITICAL, blocking) plus the eight cheap info rows the user folded in: **R3-002, R3-003, R3-004, R4-001, R4-002, R1-001, R2-001, R2-002**. Two further rows, **R3-005** and **R3-006**, are handled explicitly under *Two Rows That Are Not Straightforward* below rather than folded in silently.
- one stage, **ST-7**, one `sddl-executor` invocation, one `stage_approval`.
- files: `e2e/review-flow.test.ts`, `e2e/support/hermetic-git.ts`, `vitest.config.ts`. Nothing else.
- guards: zero net `src/**` change (AC-7/AC-9 stand), zero `package.json`, zero `.dependency-cruiser.cjs` (d-004 keeps it scoped to `src`), no third e2e test (AC-12, N-3), no new dependency. Every mutation below is applied inside the stage and reverted inside the stage.
- what this fix round is **not**: a product fix. The review's own verdict says so — the flow behaves correctly end to end. R3-001 is a hole in the safety net the story exists to build, so every change here is to the net.

### Why R3-001 Cannot Be Validated By A Green Run

R3-001 is not "an assertion is wrong". It is "certain breakages are not noticed". A green suite is therefore **zero evidence** that it is fixed — the suite was green before the fix too. The only proof is that the named breakages now turn the suite red.

This is the ST-5 / ST-5b shape and the repo already has precedent for it in both directions: ST-5's M1 and M3 went red and proved AC-11 on two layers, and ST-5's M2 stayed **green**, which is exactly how the risk-e7h1-011 blind spot was found rather than assumed. ST-7 inherits that rule unchanged: **a mutation that stays green is a finding, not a swap.** If a planned mutation does not go red, the executor stops and reports; it does not weaken the mutation or soften the assertion until the pair agrees.

### R3-001 — What Must Become Observable

Confirmed by the orchestrator against the code, re-verified at plan time: `prompt.md` appears only inside two `.length > 0` assertions (`e2e/review-flow.test.ts:188`, `:328`); a grep for `metadata.diff`, `fileCount` and `totalLines` in the test file returns nothing; `run-layout.ts:115-138` already persists `diff.{fileCount,totalLines,estimatedTokens,truncated}`, so the metadata the test could assert is on disk and simply unread; `assemble-prompt.ts:20-28` renders instructions, skills, output contract and diff into one string, so a zero-file diff still yields several KB and `length > 0` cannot distinguish a full diff from none; `fake-engine.ts:51` takes `_request` and discards it, so nothing else in the suite observes the prompt.

Three groups of assertions, all added to the **happy-path test only** (the negative test keeps its existing shape — see A-3):

1. **`metadata.diff` is read.** `metadata.diff` is an object; `diff.fileCount` is `1`; `diff.totalLines` is greater than 0; `diff.truncated` is `false`. (`persist-run.ts:74` sets `fileCount: diff.files.length`, so `1` is the fixture's exact single changed file.)
2. **`prompt.md` carries the diff, by content.** It contains `<file path="widget.ts"`, it contains the added line `export const tightened = true;`, and — the load-bearing negative — it does **not** contain the base-only file introduced by the fixture change in group 3. Paired positively as required: a negative alone is satisfied by the prompt becoming empty, and `prompt.md` non-empty is exactly the assertion that failed to catch this.
3. **The fixture must diverge, or the most valuable mutation is undetectable.** *Verified at plan time and this is the one thing the executor must not skip.* `createHermeticRepo` today cuts `feature/tighten-widget` from the tip of `main` and never advances `main` again, so `merge-base(main, feature) == main` and the M4 mutation (`from: mergeBase` -> `from: request.baseRef`) produces a **byte-identical diff**. Written against today's fixture, every assertion above would stay green under M4 — the plan would have shipped a fix that cannot detect the very breakage the ledger names as most valuable. So ST-7 adds one commit to `main` *after* the feature branch is cut: a new file (suggested `unrelated.ts`) committed on `main` and pushed, using the existing `GIT_IDENTITY` and `git()` helper, with the clone left parked on `main` as it is today. `merge-base` then resolves to the seed commit, the correct diff is still `widget.ts` alone, and under M4 the diff becomes two files (`widget.ts` modified plus `unrelated.ts` deleted) — so `fileCount === 1` and the `unrelated.ts` negative both go red. `HermeticRepo` gains no new field unless the executor wants the base-only filename exported rather than duplicated as a constant (level A, executor's choice).

### The Eight Info Rows, Per Id

| Id | Change | Where |
|---|---|---|
| R3-002 | Assert the worktree **leaf** directory is empty, not just that the parent exists: `readdirSync(join(sentinelHome, "worktrees", basename(fixture.repoPath)))` equals `[]`. Keeps ST-5b's parent assertion — the two are complementary (parent proves the root used, leaf proves the worktree was removed) | `review-flow.test.ts`, happy path |
| R3-003 | Assert `reviewed.io.out` on the review leg, which no test reads today. Use the **`runDir` form**: `expect(reviewed.io.out).toContain(\`runDir\t${runDir}\`)`, because it is strictly better than a `state`/`verdict` line — it cross-verifies that the directory the command *reported* is the one the test then *read*. `REVIEW_OUTCOME_FIELDS` in `render/format-review.ts:58-69` is the contract; `runDir` is its tenth field. Placed after the persistence block, where `runDir` is in scope. Add `state\tok` and `verdict\tapprove` on the same channel while there | `review-flow.test.ts`, happy path |
| R3-004 | Add an explicit `testTimeout` **and** `hookTimeout` to the `e2e` project in `vitest.config.ts` (suggested 30000 each). Today the project sets neither at project or root level, so ~20 git spawns per test run under vitest's 5000 ms default while 49 other files compete for CPU. This is the one config edit; the `core` and `adapters` projects are untouched | `vitest.config.ts:27-34` |
| R4-001 | Wrap the ten `git(...)` spawns of `createHermeticRepo` in `try`/`catch` so a provisioning failure removes its own temp root (`rmSync(root, { recursive: true, force: true })`) **before rethrowing**. The root is created at `:76` and only reaches the caller through the `return`, so today a setup failure leaks it with its path unrecoverable. Rethrow the original error unchanged — do not wrap or swallow it | `hermetic-git.ts` |
| R4-002 | In the `afterEach`, isolate each `rmSync` in its own `try`/`catch` and **stop clearing the registry before deleting**: iterate a copy and clear only after the loop, so one `EACCES`/`EBUSY` no longer aborts the loop and destroys the record of the remaining roots. `force: true` suppresses `ENOENT` only | `review-flow.test.ts:88-95` |
| R1-001 | Explicitly set the five ambient git env names to `undefined` in `HERMETIC_GIT_ENV` — `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`, `GIT_CONFIG_COUNT` — so the doc-comment at `:30-36`, which claims no ambient `core.hooksPath` can reach the fixture, becomes true. The `GIT_CONFIG_COUNT/KEY/VALUE` channel can set exactly that. `execa` drops `undefined` entries rather than passing an empty string | `hermetic-git.ts:37-48` |
| R2-001 | Stop exporting `HERMETIC_GIT_ENV`. A repo-wide grep finds no external consumer — the only use site is the module's own `git()` helper at `:51`, and the `git-cli.test.ts:52` original it restates keeps its copy unexported. Drop `export`, keep the name and the doc comment | `hermetic-git.ts:40` |
| R2-002 | Restore the lost rationale comment on the second test's `run` helper (`:283-305`), byte-identical in body to the first (`:134-157`) but stripped of the doc comment explaining why a fresh dependency graph is built per CLI leg. Comment only — the duplication itself was reviewed on merit and judged acceptable | `review-flow.test.ts:286` |

### Mutation Verification (fix round 1)

Every mutation: apply it, run `npx vitest run --project e2e`, observe RED, **record the exact failing assertion and line number in `execution-log.md`** (the evidence shape ST-5 used for M1/M3 and ST-5b used for M2), `git checkout -- <file>`, prove the revert with an **empty** `git diff <file>`, re-run green. Never stack two mutations. The ledger names four surviving mutations; M4 and M5 are the two the user's decision requires, M4 being the one the ledger itself flags as most valuable.

| Id | Mandatory | Mutation | Expected red |
|---|---|---|---|
| **M4** | **yes** | `src/core/workspace/compute-review-diff.ts:226`, `from: mergeBase` -> `from: request.baseRef`. Destroys the `merge-base(base, target)..target` PR semantics CLAUDE.md §Architecture mandates | With the divergent fixture: `metadata.diff.fileCount` is 2 not 1, and `prompt.md` contains `unrelated.ts`. **If this stays green the fixture divergence did not land** — stop, do not proceed to M5 |
| **M5** | **yes** | `src/core/review/assemble-prompt.ts:25`, drop `renderDiff(input.diff)` from the `sections` array. A diff-less prompt that is still several KB — precisely what `length > 0` cannot see | `prompt.md` no longer contains `<file path="widget.ts"` or `export const tightened = true;` |
| M6 | optional | `src/core/history/persist-run.ts:74`, `fileCount: diff.files.length` -> `fileCount: 0` | the `fileCount === 1` assertion alone. Cheap, and isolates the metadata channel from the prompt channel |
| M7 | optional | `renderFile` in `assemble-prompt.ts:73-78` returns only its header line, dropping `body` | the added-line content assertion, without touching `fileCount` |
| M9 | optional (pairs with R3-002) | make the worktree cleanup a no-op (`cleanupPolicy` -> `keep`) | the new empty-leaf assertion |
| **M8** | **yes, if and only if R3-006 is taken** | hardcode the detected default branch in `register-repo.ts` to `"master"` | the happy-path `metadata.baseRef === "main"` assertion — which cannot fail today, because the test supplies that value itself |

### Two Rows That Are Not Straightforward — Handled Explicitly

**R3-005 (exit code 2) — recommendation: follow-up issue, not a spec amendment. Not in ST-7.**

A test for exit code 2 is a **third** scenario, and the spec scopes the suite at two: AC-12 ("the suite holds at most two scenarios — one happy path, one negative") and N-3 ("not an exhaustive failure matrix … one happy path plus at most one negative case", resolving Q6). Folding it in silently would break an acceptance criterion from inside a fix round whose whole justification is that assertions must mean what they claim.

Recommend a **follow-up issue** over a spec amendment, for three reasons. (1) The mapping itself is already exhaustively covered: `exit-code.test.ts` pins every non-`ok` state to 2 (`it.each(NON_OK_STATES)`) plus the fail-closed ok-without-verdict case — so the e2e gap is only the composition wiring of that arm, which is thinner than the ledger's SUGGESTION severity suggests. (2) Reaching state `ambiguous`/`engine-error` needs a third differently-scripted engine outcome, and N-3 explicitly assigns the failure-matrix permutations to the E4/E5 suites. (3) A spec amendment to raise the scenario ceiling in the same breath as a fix round is how a bounded round stops being bounded — and this is round 1 of 2, so the budget is better spent on R3-001.

If a future story does take it, the cheapest shape worth evaluating first is a **second `review` leg inside the existing negative test** driven by the FakeEngine's `readonly FakeReviewOutcome[]` sequence form (`fake-engine.ts:23-27`), which reaches the arm without adding a scenario. That is a judgement for that story, not a decision taken here.

**R3-006 (drop `--base-branch`) — recommendation: include in ST-7, with a hard STOP rule. Level B for the orchestrator; default is include.**

This one changes an existing test's shape rather than adding assertions, so it is named rather than folded. Recommend **including it**, for three reasons. (1) The fixture is already being edited in ST-7 for the divergent commit R3-001's mutation proof requires, so the marginal cost is one git call plus removing two argv elements. (2) It is the **same species** as R3-001 — an assertion that cannot fail. `metadata.baseRef` currently echoes a value the same test passed in three legs earlier (`review-flow.test.ts:216` against `:147-149`), and `register-repo.ts:80-113` runs `defaultBranch` detection only when `--base-branch` is absent. Fixing one species while leaving a known instance of it in the same file is the weaker outcome. (3) It comes with a real mutation proof, M8, which the current shape cannot have.

Two conditions on including it:

- **It is not a one-line flag removal.** Verified empirically at plan time: the fixture clones an *empty* bare origin and pushes afterwards, so `refs/remotes/origin/HEAD` is never set in the clone — `git symbolic-ref --short refs/remotes/origin/HEAD` exits 128 with `fatal: ref refs/remotes/origin/HEAD is not a symbolic ref`. `git-cli.ts:111-140` maps that to `GitNoDefaultBranchError`, so dropping the flag today makes `repo add` **fail**. `createHermeticRepo` must first set the head explicitly after the push (`git remote set-head origin main`, or `git symbolic-ref refs/remotes/origin/HEAD refs/remotes/origin/main`) — no network, deterministic.
- **Drop the flag from the happy-path test only.** The negative test keeps `--base-branch`, so both arms of `registerRepo`'s branch resolution stay exercised and only one test's shape moves.
- **STOP rule:** if `set-head` misbehaves or detection does not yield `main`, restore `--base-branch`, route R3-006 out as a follow-up, and report. Debugging the fixture's git plumbing is not in a bounded fix round's budget, and R3-006 is an info row — it must never put R3-001's fix at risk.

### Decisions Taken By This Append

All level **A** (technical, reversible, aligned with spec and design), authorship `claude`, taken here rather than left to the executor mid-stage.

- **A-1 — the fixture gains a divergent commit on `main`.** Forced, not preferred: without it M4 is undetectable and the fix round would ship an unprovable fix. Verified against `compute-review-diff.ts:217-228` and the current `createHermeticRepo` shape. This is the single highest-value line in ST-7.
- **A-2 — `prompt.md` is observed through its persisted content, not by capturing the `ReviewRequest`.** A recording wrapper around `createFakeEngine` would also work (and `fake-engine.ts` discards `_request`, so it would need one), but `prompt.md` is the artifact a user actually reads, it is already on disk, and it needs no new test-only seam. Asserting the persisted file also covers the store, which the wrapper would not.
- **A-3 — every new assertion lands in the happy-path test; the negative test takes only R2-002's comment and, if R3-006 is taken, keeps its `--base-branch`.** Duplicating the diff and prompt assertions into both tests doubles the maintenance for no new signal (both legs run the same diff and prompt stages) and drifts toward the second unit suite `docs/testing.md` forbids.
- **A-4 — ST-7 is one stage, not three.** The nine ids touch three files with no internal dependency beyond "the fixture change must precede the mutation runs", which is intra-stage ordering. Splitting would add two approval gates and two `sddl-executor` invocations for no reviewability gain: the diff is small and the blast radius is test-and-config only.
- **A-5 — `testTimeout` and `hookTimeout` go on the `e2e` project only.** The `core` and `adapters` projects have no measured problem; widening at the root would change 49 other files' behaviour from inside a fix round.
- **A-6 — the negative content assertion on `prompt.md` is paired with a positive one in the same test.** House rule from the previous change's fix round: an unpaired negative is satisfied by the content disappearing, which is the failure mode R3-001 already is.

### Deferred, Explicitly Not Fixed Here

- **R3-005** — follow-up issue as argued above. It is the strongest remaining candidate if a round 2 is ever spent, *unless* the scoped re-review of ST-7's delta opens something severe, which takes precedence.
- **R3-004's sibling ids R4-003 / R1-003** are the same finding merged across three lenses and are closed by the same `testTimeout` edit; they are not separate work.
- No ledger row is left unaddressed except **R3-005** (deferred) and, conditionally, **R3-006** (included by recommendation; deferred if its STOP rule fires).

### Dependencies And Sequencing (fix round 1)

- Hard chain: **ST-6 -> ST-7**. ST-7 comes after a completed ST-6; it does not reopen it. ST-6's evidence (`check` + `test` + `build` green, tree clean) is what makes ST-7's baseline trustworthy, exactly as ST-4's green made ST-5's mutations evidence.
- Intra-stage order is fixed and the executor may not reorder it: **(i)** fixture change (divergence, R4-001, R1-001, R2-001, and `set-head` if R3-006 is taken) -> **(ii)** `vitest.config.ts` timeouts -> **(iii)** test assertions and teardown -> **(iv)** green baseline -> **(v)** the mutation cycle M4 then M5 (then M8 if R3-006 landed) -> **(vi)** full gate. The mutations run **last**, against final code, so a RED is attributable to the mutation and not to a half-written assertion.
- ST-7 must complete before the change is closed: a CRITICAL accepted at closeout ships, which is the same reasoning that put ST-5b before ST-6.
- After ST-7: a **scoped re-review over the fix delta**, checked id by id against `review-ledger.md` (round 1 of 2 consumed), then `sddl-qa-review` in `final` mode — the only stage that may mark this change `completed`. Neither is a plan stage; neither is optional.

### Approval Notes (fix round 1)

- ST-7 touches repo-persisted files and requires its own explicit **`stage_approval`** before `sddl-executor` runs it. The approvals granted for ST-1..ST-6 do not cover it, and pacing mode does not waive it.
- **Level C standing guard:** if ST-7 finds itself needing a *net* edit under `src/**`, stop and ask. Nothing planned here requires one — every `src/**` touch in this stage is a mutation applied and reverted within it, and the stage's own exit condition is `git status --porcelain` showing only `e2e/review-flow.test.ts`, `e2e/support/hermetic-git.ts` and `vitest.config.ts`.
- **One open level-B item for the orchestrator**, at the ST-7 approval gate: whether to include **R3-006**. Recommendation above is *include*, with the verified prerequisite and the STOP rule. The default lets ST-7 proceed as written; declining it removes M8 and two argv elements from the stage's scope and changes nothing else.
- Executor stop rules apply unchanged: contradiction with spec or design, scope drift, blast-radius expansion, or **any planned mutation that stays green** means stop and report, do not improvise. No git side effects — the orchestrator owns commits and the PR.
- Spec impact: **none**. ST-7 strengthens the evidence for existing AC-11 and AC-12 rather than adding a criterion, and R3-005 was kept out precisely so AC-12 and N-3 stay intact.
