# QA Report: e2-f2-h2-register-repo

## Change metadata

- **Change**: e2-f2-h2-register-repo (registerRepo use case)
- **Mode**: final
- **Reviewed at**: 2026-08-02
- **Reviewer**: sddl-qa-review (automated)

---

## 1. Quality gate results

| Gate | Result | Detail |
|------|--------|--------|
| `npm test` | PASS | 48/48 tests pass (4 files, 9.07s) |
| `npm run check` (biome) | PASS | 39 files checked, no issues |
| `npm run check` (tsc --noEmit) | PASS | No type errors |
| `npm run check` (depcruise) | PASS | 32 modules, 33 dependencies, 0 violations |

## 2. Architecture guard compliance

| Guard | Status | Evidence |
|-------|--------|----------|
| Core never imports adapters | PASS | `grep 'from ["'\'']src/adapters'` over `src/core/repos/` returns zero matches |
| Core never imports I/O libraries | PASS | Only external import is `zod` (whitelisted in PRD section 4) |
| All imports use `.js` extensions | PASS | All 5 imports in `register-repo.ts` end with `.js` |
| No adapter instantiation in core | PASS | `register-repo.ts` receives deps via `RegisterRepoDeps` interface |
| Use case is the only public API | PASS | `index.ts` exports `registerRepo` as the use case; no logic in CLI/TUI |

## 3. Acceptance criteria verification matrix

### AC-1: URL registration (clone + branch detection + persistence)

- **Verdict**: PASS
- **Test**: `registers repo via URL with clone and branch detection` (line 103)
- **Evidence**: Test asserts `clone()` called with correct `targetPath`, `defaultBranch()` called, alias derived as `owner/repo`, entry persisted via `writeRepos`, `alreadyRegistered === false`.
- **Implementation**: `register-repo.ts` lines 79-95 (clone path), lines 101-113 (branch detection), lines 115-127 (entry construction + persist).
- **Bonus**: `derives alias from various URL formats` (line 212) covers HTTPS, HTTPS+.git, SSH colon, SSH protocol — all produce `owner/repo`.

### AC-2: Local path registration (no clone, localPath field)

- **Verdict**: PASS
- **Test**: `registers repo via local path without cloning` (line 118)
- **Evidence**: Test asserts `cloneCalls.length === 0`, `defaultBranchCalls[0].repoPath === "/repos/local"`, `entry.localPath === "/repos/local"`.
- **Implementation**: `register-repo.ts` lines 79-80 (localPath branch skips clone), line 117 (localPath spread into entry).

### AC-3: Re-registration detection (alreadyRegistered, no clone, no write)

- **Verdict**: PASS
- **Test**: `returns existing entry when alias already registered` (line 129)
- **Evidence**: Test pre-seeds registry, asserts `alreadyRegistered === true`, `entry.baseBranch === "develop"` (original value preserved), `cloneCalls.length === 0`, `defaultBranchCalls.length === 0`, `writeReposCalled === false`.
- **Implementation**: `register-repo.ts` lines 70-75 (early return on existing alias).

### AC-4: Explicit baseBranch skips detection

- **Verdict**: PASS
- **Test**: `uses explicit baseBranch and skips detection` (line 145)
- **Evidence**: Test asserts `entry.baseBranch === "develop"`, `defaultBranchCalls.length === 0`.
- **Implementation**: `register-repo.ts` lines 99-100 (baseBranch guard skips `defaultBranch()` call).

### AC-5: Clone failure wrapped in RepoRegistrationError

- **Verdict**: PASS
- **Test**: `wraps clone failure in RepoRegistrationError` (line 155)
- **Evidence**: Test injects `GitCloneError`, asserts thrown error is `RepoRegistrationError` with `cause instanceof GitCloneError`.
- **Implementation**: `register-repo.ts` lines 85-93 (catch `GitError`, wrap in `RepoRegistrationError` with `{ cause }`).

### AC-6: DefaultBranch failure wrapped in RepoRegistrationError

- **Verdict**: PASS
- **Test**: `wraps defaultBranch failure in RepoRegistrationError` (line 175)
- **Evidence**: Test injects `GitNoDefaultBranchError`, asserts thrown error is `RepoRegistrationError` with `cause instanceof GitNoDefaultBranchError`.
- **Implementation**: `register-repo.ts` lines 103-112 (catch `GitError`, wrap in `RepoRegistrationError` with `{ cause }`).

### AC-7: Invalid requests throw InvalidRepoRequestError

- **Verdict**: PASS
- **Tests**: `rejects empty URL with InvalidRepoRequestError` (line 195) + `rejects relative localPath with InvalidRepoRequestError` (line 205)
- **Evidence**: Empty string, whitespace-only string, and relative path all throw `InvalidRepoRequestError`. No clone attempted.
- **Implementation**: `register-repo.ts` lines 60-66 (validation guards at function entry).

## 4. Review ledger disposition

The 4R code review completed with:

- **0 BLOCKER** / **0 CRITICAL**: No blocking issues.
- **3 WARNING** (all accepted as MVP trade-offs):
  1. TOCTOU in concurrent readRepos/writeRepos — CLI-first single-user scope.
  2. No clone cleanup on partial failure — documented, deferred to `--force` flag.
  3. deriveAlias does not validate degenerate URLs — unlikely inputs, deferred to `--alias` override.
- **2 SUGGESTION** (informational):
  1. `cause` field shadows native ES2022 `Error.cause` — matches existing codebase pattern.
  2. Defensive `baseBranch` spread — TypeScript control flow justifies it.

All findings are consistent with MVP scope and documented trade-offs.

## 5. Files modified (change scope)

| File | Action |
|------|--------|
| `src/core/repos/register-repo.ts` | Added (use case) |
| `src/core/repos/register-repo-errors.ts` | Added (domain errors) |
| `src/core/repos/index.ts` | Modified (re-exports) |
| `src/core/repos/__test__/register-repo.test.ts` | Added (9 tests) |

## 6. Export completeness

All new public symbols are re-exported from `src/core/repos/index.ts`:
- `registerRepo` (use case function)
- `RegisterRepoRequest`, `RegisterRepoDeps`, `RegisterRepoResult` (types)
- `RepoRegistrationError`, `RepoRegistrationErrorOptions`, `InvalidRepoRequestError` (errors)

---

## Final verdict: PASS

All 7 acceptance criteria verified with passing tests and correct implementation. Quality gate clean (lint, typecheck, architecture guards). Code review ledger has no blockers. The change is ready to close.

**Recommended action**: close the change, commit, and open PR for story [E2.F2.H2].
