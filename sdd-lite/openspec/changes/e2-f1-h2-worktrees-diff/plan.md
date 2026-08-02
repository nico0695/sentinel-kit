# Plan — e2-f1-h2-worktrees-diff

Staged execution plan for `[E2.F1.H2] Worktrees & diff` (issue #12). Design frozen with dec-b1 (single GitPort), dec-b3 (diff shape), dec-a1..a3. Every stage has a strict scope, a validation gate, and a rollback signal. The executor gate requires explicit user OK before any code change is committed.

## Execution Digest

- change_name: e2-f1-h2-worktrees-diff
- objective: new-feature
- route: continue-lite
- digest_summary: Extend GitPort with 5 methods (worktreeAdd/Remove/List, mergeBase, diff), 3 error subclasses, 4 request types, 3 domain types. Adapter implementation + 14 contract tests with divergent-branch fixture.
- stage_plan_digest: P0 preflight, S1 core types, S2 adapter + tests, S3 post-executor checks, S4 code review, S5 QA final, S6 close
- validation_digest: Each code stage gates on `npm run check` + `npm test`. S3 verifies diff perimeter + hermeticity. S4 runs 4R review. S5 validates all 11 ACs.

## Summary

- change_name: e2-f1-h2-worktrees-diff
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true
- plan_status: approved

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| P0 | Verify environment is green before changes | — | No files touched | `npm run check` + `npm test` green, git clean, node >= 22 | No | No | pending |
| S1 | Core port extensions (types only, no I/O) | P0 | `git-port.ts`, `git-port-errors.ts`, `repos/index.ts` | `npm run check` (tsc + biome + depcruise), `npm test` (existing tests green), grep gate for I/O imports | Yes | Yes (executor gate) | pending |
| S2 | Adapter implementation + contract tests | S1 | `git-cli.ts`, `GitPort.contract.ts`, `git-cli.test.ts` | `npm run check` + `npm test` (all 14 new tests pass + existing tests green) | Yes | Yes (executor gate) | pending |
| S3 | Post-executor mechanical validation | S2 | No files touched | Diff perimeter check, hermeticity re-run, depcruise zero violations | No | No | pending |
| S4 | 4R code review | S3 | No files touched | Standard tier: `reliability` + `readability` lenses. 0 blocker/critical | No | No | pending |
| S5 | QA final | S4 | No files touched | AC-1..AC-11 verified against shipped code, `npm run check` + `npm test` independent re-run | No | No | pending |
| S6 | History entry + PR | S5 | History entry, sdd-lite state | Push branch, open PR `[E2.F1.H2] Worktrees & diff`, `Closes #12` | No | No | pending |

## Preflight — P0 (mechanical, no user gate)

Verifies the environment before touching source. Fails STOP if any check fails.

- `git status` — clean working tree on branch `claude/e2-f1-h2-worktrees-diff`.
- `node --version` reports >= v22.
- `git --version` reports >= 2.28.
- `[ -d node_modules ]` — already installed. Otherwise `npm ci`.
- `npm run check` and `npm test` — baseline green on the current tip (proves H1 code is intact before extending it).

Exit criteria: all green. Any failure STOP and consult (protocol C).

## Stage S1 — Core port extensions (types only, no I/O)

**Scope (files touched):**
- `src/core/repos/ports/git-port.ts` — EDIT (add 4 request types + 3 domain types + 5 method signatures to `GitPort`)
- `src/core/repos/ports/git-port-errors.ts` — EDIT (add `GitWorktreeError`, `GitMergeBaseError`, `GitDiffError`)
- `src/core/repos/index.ts` — EDIT (re-export all new types and errors)

**Actions in order:**
1. Add request types to `git-port.ts`: `WorktreeAddRequest`, `WorktreeRemoveRequest`, `MergeBaseRequest`, `DiffRequest` (all readonly interfaces, design exact shapes).
2. Add domain types to `git-port.ts`: `WorktreeInfo`, `FileStats`, `DiffResult` (design exact shapes).
3. Add 5 method signatures to the `GitPort` interface: `worktreeAdd`, `worktreeRemove`, `worktreeList`, `mergeBase`, `diff` (design exact signatures).
4. Update the module-level doc comment in `git-port.ts` to reflect H2 scope.
5. Add 3 error subclasses to `git-port-errors.ts`: `GitWorktreeError`, `GitMergeBaseError`, `GitDiffError` — identical constructor pattern to `GitCloneError`.
6. Re-export all new types and errors from `src/core/repos/index.ts`.
7. **Do NOT** add any I/O import (`execa`, `node:*`, `node:fs`) to core files.

**Validation gate:**
- `npx tsc --noEmit` — 0 errors (compile-only; existing adapter will need stubs or temporary `as unknown as GitPort` — BUT since the adapter returns an object literal typed as `GitPort`, tsc will fail because the 5 new methods are missing). **Resolution**: S1 commit will cause tsc to report missing methods in `git-cli.ts`. This is expected and acceptable — the adapter is incomplete until S2. The validation gate for S1 uses `npx tsc --noEmit 2>&1 | grep -v git-cli.ts` to confirm core types compile cleanly, then S2 fully resolves all tsc errors.
  - **Alternative (preferred)**: Temporarily add stub `throw new Error("not implemented")` methods to `git-cli.ts` in S1 so `npm run check` passes fully. These stubs are replaced with real implementations in S2. This keeps `npm run check` as a single clean gate at every stage.
- `npx biome check src/core/repos` — clean.
- `npx depcruise src` — 0 violations. Guard 2 (`core-no-io-libs`) is critical.
- Grep gate: `grep -REn 'execa|node:|from "fs"' src/core/repos/ports` — no hits.
- `npm test` — existing tests still pass (adapter stubs satisfy the type contract).

**Commit:**
- `feat(repos): extend GitPort with worktree/mergeBase/diff types (E2.F1.H2)`
- Includes sdd-lite `state.yaml` bump.

**Rollback:** `git reset --hard <parent>` — no external side-effect.

## Stage S2 — Adapter implementation + contract tests

**Scope (files touched):**
- `src/adapters/driven/git/git-cli.ts` — EDIT (replace 5 stubs with real implementations + 2 parsers)
- `src/adapters/driven/git/__test__/GitPort.contract.ts` — EDIT (add worktree, mergeBase, diff describe blocks; import new errors; extend `GitFixture` interface)
- `src/adapters/driven/git/__test__/git-cli.test.ts` — EDIT (extend `setupFixture` with divergent-branch setup; return new fixture fields)

**Actions in order:**
1. Implement `worktreeAdd` in `git-cli.ts`: `isAbsolute(targetPath)` pre-spawn guard, then `git -C repoPath worktree add --detach targetPath commitish`. Wrap failures as `GitWorktreeError`.
2. Implement `worktreeRemove`: `git -C repoPath worktree remove --force worktreePath`. Wrap as `GitWorktreeError`.
3. Implement `worktreeList`: `git -C repoPath worktree list --porcelain`. Parse with `parseWorktreeList`. Wrap as `GitWorktreeError`.
4. Implement `mergeBase`: `git -C repoPath merge-base commitA commitB`. Trim stdout, validate 40-hex. Wrap as `GitMergeBaseError`.
5. Implement `diff`: two spawns — `git -C repoPath diff from to` (raw unified) + `git -C repoPath diff --numstat from to` (stats). Parse numstat with `parseDiffNumstat`. Wrap as `GitDiffError`.
6. Add `parseWorktreeList` helper: parse `--porcelain` blocks into `WorktreeInfo[]`.
7. Add `parseDiffNumstat` helper: parse `<add>\t<del>\t<path>` lines into `FileStats[]`. Binary (`-\t-\t<path>`) maps to 0/0.
8. Import the 3 new error classes and 4 new request types from core index.
9. Extend `GitFixture` interface in `GitPort.contract.ts` with `featureBranch`, `forkPointSha`, `featureBranchChangedFiles`.
10. Extend `setupFixture` in `git-cli.test.ts`: create `feat-diverge` branch from main HEAD, add two files, commit; switch to main, add one file, commit; push both; record fork-point SHA. Fetch in working clone.
11. Add 14 contract test cases across 5 describe blocks (worktreeAdd, worktreeRemove, worktreeList, mergeBase, diff) as defined in design contract test plan.

**Validation gate:**
- `npm run check` — exit 0 (biome + tsc + depcruise all clean).
- `npm test` — exit 0. All 14 new tests pass, all H1 tests still pass. Expected total: >= 24 tests passed, 0 failed, 0 skipped.
- Diff-scope sanity: `git status --short` shows ONLY scope-listed files + sdd-lite artifacts.

**Commit:**
- `feat(git): implement worktree/mergeBase/diff + contract tests (E2.F1.H2)`
- Includes sdd-lite `state.yaml` bump.

**Rollback:** `git reset --hard <parent-of-S2>` — no external side-effect. Worktrees created by tests are cleaned up by the afterEach teardown.

## Executor gate — HUMAN APPROVAL

Between P0 and S1, and between each stage's validation gate and its commit, the executor pauses for explicit user OK. The practical bundling: one approval before starting S1+S2, with each commit visible as it lands. Finer-grained approval (S1, then S2 separately) is honoured if requested.

## Post-executor validation — S3 (mechanical)

- Full `git diff origin/main..HEAD` scoped to the 6 files in scope — anything outside the perimeter fails STOP.
- Hermeticity re-run from committed state: `npm run check` and `npm test` on clean working tree.
- `depcruise --output-type err src` — 0 violations.
- Executor diff digest: `git diff <parent>..HEAD | sha256sum | awk '{print $1}'` — recorded in state.yaml for the 4R stage.

## 4R code review — S4

Standard tier (one port extension + one adapter extension + tests, no cross-cutting change).
- Lenses: `reliability` (error translation, parsing edge cases, worktree lifecycle) + `readability` (naming, doc-comments, style consistency with H1).
- BLOCKER/CRITICAL findings STOP, fix, re-review same diff.
- WARNING/SUGGESTION findings recorded in `review-ledger.md`; addressed or explicitly deferred.

Exit criteria: verdict `pass` (0 blocker, 0 critical).

## QA final — S5

Runs `sddl-qa-review` in `mode: final`. Re-runs `npm run check` and `npm test` independently. Verifies AC-1..AC-11 against shipped code:
- Diff perimeter matches scope exactly.
- Core I/O imports absent (AC-11).
- All new types importable from `repos/index.ts` (AC-10).
- English-only across the change.

Exit criteria: verdict `pass`. Any FAIL routes back to executor.

## Close — S6

- History entry per `history/TEMPLATE.md`, committed to git.
- Update `history/INDEX.md`.
- Push branch `claude/e2-f1-h2-worktrees-diff -u origin`.
- Open PR: title `[E2.F1.H2] Worktrees & diff`, body `Closes #12` + summary + test plan.
- NEVER merge; the human reviews and merges.

## Validation Strategy

- Every code stage (S1, S2) gates on `npm run check` (biome + tsc + depcruise) and `npm test` (vitest).
- S1 adds temporary adapter stubs so the full check passes cleanly at every stage boundary.
- S3 independently re-validates from committed state (no trust of prior runs).
- S4 applies adversarial review lenses in parallel.
- S5 re-validates independently and verifies every AC against the shipped diff.

## Dependencies And Sequencing

```
P0 (preflight)
  └── S1 (core: types + errors + index + adapter stubs)
         └── S2 (adapter: real implementations + parsers + contract tests)
                └── S3 (post-executor mechanical checks)
                       └── S4 (4R code review)
                              └── S5 (QA final)
                                     └── S6 (history + PR)
```

Every arrow is a hard barrier; no stage runs until its predecessor's exit criteria are met.

## Architecture Constraints

- S1 must NOT import any I/O libraries in core (only zod is whitelisted, not needed here).
- S2 adapter uses only `execa` + `node:path` (already imported in git-cli.ts).
- Tests use hermetic `GIT_IDENTITY` and `HERMETIC_GIT_ENV` from H1.
- All code in English, conventional commits.

## Risks

- **R-P1 — S1 tsc breakage from incomplete adapter.** Mitigated by adding temporary stubs in S1 that are replaced in S2.
- **R-P2 — Fixture complexity in divergent-branch setup.** Mitigated by following the exact same `git(...)` helper pattern from H1; fixture is hermetic with `mkdtempSync`.
- **R-P3 — Worktree tests leave stale worktrees on failure.** Mitigated by `afterEach` teardown which `rmSync` the entire temp root (inherits H1 pattern).

## Approval Notes

- Design is frozen; no new decisions introduced by the plan.
- S1/S2 split follows the exact H1 pattern (core types first, adapter + tests second).
- The temporary-stubs approach in S1 is an A-level decision: technical, reversible, aligned with PRD. Ensures `npm run check` passes at every boundary.

## Budget Notes

- Target roughly 300 to 500 words plus tables for the full artifact when possible.
