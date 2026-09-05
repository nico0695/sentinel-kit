# Plan

## Execution Digest

- change_name: e7-f1-h1-e2e-smoke
- objective: new-feature (story `[E7.F1.H1]`, issue #41)
- route: continue-lite
- digest_summary: >-
  Six ordered stages. The only production-code edit (the `engineOverride` seam in
  `src/main/container.ts`, D-1/D-2) is isolated as ST-1 so it is reviewable and revertible on
  its own; the quality-gate config edits (d-004) land as ST-2 before any `e2e/` file exists so a
  `check` failure there is attributable to the config alone; the suite lands in two stages
  (fixture + happy path, then the negative case); AC-11 mutation verification is its own stage;
  a final gate stage proves `check` + `test` + `build` green and the tree clean.
- stage_plan_digest: ST-1 seam -> ST-2 gate config -> ST-3 fixture + happy path -> ST-4 negative
  case -> ST-5 AC-11 mutations -> ST-6 full gate and closeout. Strictly sequential; every stage
  is code-touching and requires `stage_approval`.
- validation_digest: >-
  Narrow first, full last. ST-1 runs the full gate (only production change; must prove zero
  regression against 1037 tests). ST-2 runs `npm run check` only. ST-3/ST-4 run
  `npx vitest run --project e2e` plus `npm run check`. ST-5 runs the e2e project repeatedly plus
  `git status --porcelain`. ST-6 runs `npm run check`, `npm test`, `npm run build`.

## Summary

- change_name: e7-f1-h1-e2e-smoke
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true (after plan approval + per-stage `stage_approval`)
- plan_status: ready-for-execution

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| ST-1 | Add the optional, test-only `ReviewEngine` seam (D-1/D-2/D-3) | — | `src/main/container.ts` only: `readonly engineOverride?: ReviewEngine` on `CliDepsOptions` (`@internal` TSDoc per D-3) and on the private `WiringGraphOptions`; one `??` at the engine site; one-line comment naming d-003 + AC-7 | `npm run check` clean; `npm test` still 1037/1037 across 49 files; `git diff src/main/container.ts` limited to the three documented edits; `git diff src/core/repos/ports/config-schemas.ts` empty (AC-7) | yes (production) | yes | pending |
| ST-2 | Bring `e2e/` into the quality gate (d-004, AC-8) | ST-1 | `tsconfig.json#include` -> `["src", "e2e"]`; `biome.json#files.includes` += `"e2e/**"`. `.dependency-cruiser.cjs` and `package.json#scripts.check` UNCHANGED (N-2) | `npm run check` clean (no `npm test` needed — no runtime change). Run before any `e2e/` file exists so any new finding is attributable to the config edit, not to new code. If `check` surfaces a pre-existing finding or a `tsup`/vitest type-resolution interaction, STOP and report rather than widening the edit | yes (config) | yes | pending |
| ST-3 | Hermetic fixture + happy-path smoke (S1-S4; AC-1..AC-6, AC-12) | ST-2 | New `e2e/support/hermetic-git.ts` (D-5: `createHermeticRepo()` + `HERMETIC_GIT_ENV`, origin comment pointing at `src/adapters/driven/git/__test__/git-cli.test.ts`; not a `.test.ts` file). New `e2e/review-flow.test.ts` with test 1: `repo add` -> `repo list` -> `review` -> `runs list` -> `runs show`, each an argv array through `createCli(createCliDeps({ env: { SENTINEL_HOME: <tmp> }, homeDir: <dead tmp>, engineOverride: fake })).run(argv)`; unconditional `afterEach` removing both temp roots (D-6) | `npx vitest run --project e2e` green with >0 tests (AC-1); then `npm run check` clean. Re-run once to confirm determinism | yes (test) | yes | pending |
| ST-4 | Negative case (S5; AC-6, AC-12) | ST-3 | Test 2 in the same file: FakeEngine scripted to `VERDICT: request-changes`, exit code `1` asserted, same three persisted files asserted as S3 | `npx vitest run --project e2e` — 2 tests green; `npm run check` clean | yes (test) | yes | pending |
| ST-5 | AC-11 mutation verification | ST-4 | No net file change. Apply design's M1 (`run-store-fs.ts`: `metadata.json` -> `meta.json`), M2 (`createWiringGraph`: `worktreesDir: paths.clonesDir`), and optionally M3 (`resolveReviewExitCode` returns `0` for `request-changes`) — one at a time, never stacked | Per mutation: `npx vitest run --project e2e` red, record the exact failing assertion; `git checkout -- <file>`; re-run green. After the last revert: `git status --porcelain` shows only the intended new/modified files of ST-1..ST-4 and `git diff` on `run-store-fs.ts` / `container.ts` / the exit-code module shows no mutation residue. At least two mutations on different layers are required; a stray mutation left in the tree is a defect, not a nit | yes (temporary only) | yes | pending |
| ST-6 | Full gate + closeout evidence (AC-8, AC-9, AC-10) | ST-5 | No code change beyond fixes the gate demands | `npm run check` clean; `npm test` = previous 1037 + the 2 new tests, no pre-existing suite modified; `npm run build` OK; `node dist/cli.js --version` OK; record that AC-10 needs no workflow edit (`test` job already runs all vitest projects on the Node 22/24 matrix). One-off AC-8 spot check: introduce a deliberate type error in `e2e/`, confirm `tsc --noEmit` fails, revert, re-run clean | yes (verification) | yes | pending |

## Validation Strategy

- **Narrow per stage, full at the ends.** ST-1 is the only stage that must run the whole gate mid-flow, because it is the only production change and AC-7/AC-9 rest on it. ST-2 needs `npm run check` alone. ST-3/ST-4 use `npx vitest run --project e2e` for the fast loop and `npm run check` once at stage end. ST-6 proves the full gate.
- **Amendment-1 corrections are binding on the assertions written in ST-3/ST-4** (do not write assertions that cannot pass):
  - assert `validations/` **absent** under the `quick` harness (A-1, N-4);
  - assert `<SENTINEL_HOME>/repos.yaml` only — never `config.yaml` (A-2; asserting `config.yaml` absent is optional);
  - verify run identity by matching the run directory **basename** against the id `runs list` prints — there is no `id` key in `metadata.json` (A-3);
  - **never** assert `metadata.json#engine` (it reads `claude-code` while the FakeEngine ran);
  - assert content, not just existence: `result.md` equals the scripted output exactly, `prompt.md` non-empty, `metadata.json` carries `repo: "acme/widget"`, `targetRef`, `state: "ok"`, `verdict: "approve"`.
- **AC-7 is verified by reading the diff**, not by a regression test: `src/main/__test__/` holds only `paths.test.ts`, so "existing wiring tests unmodified" is vacuous (risk-e7h1-007). Evidence is the bounded `container.ts` diff plus an empty diff on `config-schemas.ts`.
- **Every asserted path is built with `join(sentinelHome, ...)`**, which satisfies AC-3 by construction; `SENTINEL_HOME` is injected via `env`, never by mutating `process.env`.
- QA reruns one ST-5 mutation independently and confirms `git status` clean.

## Dependencies And Sequencing

- Strictly sequential: ST-1 -> ST-2 -> ST-3 -> ST-4 -> ST-5 -> ST-6. No parallelization.
- ST-3 cannot start before ST-1 (the suite calls `engineOverride`) or ST-2 (otherwise the new files land outside the gate and a later `check` failure mixes two causes).
- ST-5 requires a green ST-4: a mutation is only evidence if the pre-mutation state was green.
- ST-2 is the one stage with an external interaction risk (tsc/biome/tsup/vitest seeing `e2e/` for the first time). Failure there is a STOP-and-report, not a scope expansion.

## Planner Stop Note

- `objective` is `new-feature`, not `planner`: this change proceeds to `sddl-executor` after plan approval. Not a planner terminal stop, and not a `macro-plan-first` route.

## Approval Notes

- All six stages touch the working tree, so each requires an explicit `stage_approval` before `sddl-executor` runs it; `interactive` mode does not waive this.
- Blast radius unchanged from design: 2 new files, 3 substantive lines in `src/main/container.ts`, 2 config edits. No `src/core/**` change, no adapter change, no CI change, no user-facing surface change.
- Open risks carried into execution: risk-e7h1-005 (test-only seam in production code, mitigated by AC-7 and ST-1's diff check) and risk-e7h1-007 (AC-7 verified by reading, not by a test). Both are accepted, not open questions.
- Recommended next stage: `sddl-executor` at ST-1.

## Budget Notes

- Plan kept compact; design rationale is not duplicated here — see `design.md` D-1..D-8.
