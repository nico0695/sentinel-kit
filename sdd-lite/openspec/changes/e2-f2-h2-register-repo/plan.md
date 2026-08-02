# Plan: e2-f2-h2-register-repo

> Staged execution plan for the `registerRepo` use case implementation.

## Overview

Four sequential stages. Each stage is self-contained and produces a verifiable artifact. No stage depends on external systems — all validation is via `npm run check` and `npm test`.

---

## Stage 1: Error classes

**Goal**: Create the two domain error classes used by the use case.

### Files

| File | Action |
|------|--------|
| `src/core/repos/register-repo-errors.ts` | Create |

### Implementation

Create `register-repo-errors.ts` with:

1. `RepoRegistrationErrorOptions` interface — `{ readonly cause?: unknown }`.
2. `RepoRegistrationError` class extending `Error`:
   - Constructor `(message: string, options?: RepoRegistrationErrorOptions)`.
   - Sets `this.name = "RepoRegistrationError"`.
   - Conditionally stores `cause` via `if (options !== undefined && "cause" in options)` pattern (matches `GitError`/`ConfigError` pattern).
3. `InvalidRepoRequestError` class extending `Error`:
   - Constructor `(message: string)`.
   - Sets `this.name = "InvalidRepoRequestError"`.
   - No `cause` (validation errors are self-explanatory).

### Validation

- `npx tsc --noEmit` passes — types compile.
- `npx biome check src/core/repos/register-repo-errors.ts` passes — lint/format.
- File has no imports from `adapters/`, `main/`, or I/O libraries.

### Dependencies

None. This stage has zero imports.

---

## Stage 2: Use case function

**Goal**: Implement `registerRepo` with `deriveAlias`, request/result types, and dependency interface.

### Files

| File | Action |
|------|--------|
| `src/core/repos/register-repo.ts` | Create |

### Implementation

Create `register-repo.ts` with:

1. **Imports** (all `import type` except error classes):
   - `import type { RepoEntry, RepoRegistry } from "./ports/config-schemas.js"`
   - `import type { ConfigStore } from "./ports/config-store.js"`
   - `import type { GitPort } from "./ports/git-port.js"`
   - `import { GitError } from "./ports/git-port-errors.js"` (value import for `instanceof`)
   - `import { InvalidRepoRequestError, RepoRegistrationError } from "./register-repo-errors.js"`

2. **Exported types**:
   - `RegisterRepoRequest` interface (readonly: `url`, optional `localPath`, `baseBranch`, `defaultHarness`).
   - `RegisterRepoResult` interface (readonly: `alias`, `entry: RepoEntry`, `alreadyRegistered: boolean`).
   - `RegisterRepoDeps` interface (readonly: `git: GitPort`, `config: ConfigStore`, `clonesDir: string`).

3. **`deriveAlias(url: string): string`** (non-exported helper):
   - Trim input.
   - Strip trailing `.git`.
   - Branch on `://` (HTTPS) vs `:` (SSH) vs fallback.
   - Split into segments, filter empties, take last two, join with `/`.

4. **`registerRepo(request, deps): Promise<RegisterRepoResult>`** (exported):
   - Validate: empty URL throws `InvalidRepoRequestError`; non-absolute localPath throws `InvalidRepoRequestError`.
   - Derive alias.
   - Read registry; early return if alias exists.
   - Clone (URL path) or skip (local path).
   - Detect baseBranch (or use explicit).
   - Build `RepoEntry` with conditional spreads (exactOptionalPropertyTypes).
   - Write updated registry.
   - Return result.
   - Catch `GitError` instances in clone/defaultBranch and wrap in `RepoRegistrationError`.

### Validation

- `npx tsc --noEmit` passes.
- `npx biome check src/core/repos/register-repo.ts` passes.
- `npx depcruise src/core/repos/register-repo.ts` passes — no forbidden imports.
- Manual review: no `node:*` imports, no I/O, only port types + own errors.

### Dependencies

Stage 1 (error classes must exist for import).

---

## Stage 3: Index re-exports

**Goal**: Expose all new public symbols from the module's public API.

### Files

| File | Action |
|------|--------|
| `src/core/repos/index.ts` | Modify |

### Implementation

Add to `src/core/repos/index.ts`:

```typescript
// After existing exports, add:
export {
  InvalidRepoRequestError,
  RepoRegistrationError,
  type RepoRegistrationErrorOptions,
} from "./register-repo-errors.js";
export {
  registerRepo,
  type RegisterRepoDeps,
  type RegisterRepoRequest,
  type RegisterRepoResult,
} from "./register-repo.js";
```

Value exports for error classes and the use case function; `type` exports for interfaces (respects `verbatimModuleSyntax`).

### Validation

- `npx tsc --noEmit` passes.
- `npx biome check src/core/repos/index.ts` passes.
- `npm run check` passes (full quality gate including dependency-cruiser).

### Dependencies

Stages 1 and 2 (both files must exist for re-export).

---

## Stage 4: Unit tests

**Goal**: Implement all 9 test cases with in-memory fakes.

### Files

| File | Action |
|------|--------|
| `src/core/repos/__test__/register-repo.test.ts` | Create |

### Implementation

1. **Imports**:
   - `import { describe, it, expect, beforeEach } from "vitest"`
   - Use case, types, and errors from `../index.js` (public API).
   - `GitCloneError`, `GitNoDefaultBranchError` from `../index.js` (to construct fake errors).
   - Port types: `GitPort`, `ConfigStore`, `CloneRequest`, `DefaultBranchRequest` from `../index.js`.

2. **In-memory `ConfigStore` fake**:
   - Internal `repos: RepoRegistry` state (starts empty).
   - `readRepos()` returns current state.
   - `writeRepos(r)` replaces state.
   - `readConfig()` returns `{ defaultEngine: "claude-code", defaultBaseBranch: "main" }`.
   - `writeConfig()` stores (unused by registerRepo).

3. **In-memory `GitPort` fake**:
   - Configurable `defaultBranchReturn: string` (default `"main"`).
   - Optional `cloneError: Error` — if set, `clone()` throws it.
   - Optional `defaultBranchError: Error` — if set, `defaultBranch()` throws it.
   - `cloneCalls: CloneRequest[]` — records each `clone()` invocation.
   - `defaultBranchCalls: DefaultBranchRequest[]` — records each `defaultBranch()` invocation.
   - All other `GitPort` methods (`fetch`, `branches`, `worktreeAdd`, etc.) throw `Error("not implemented")`.

4. **Test constants**:
   - `CLONES_DIR = "/sentinel/clones"`
   - `TEST_URL = "https://github.com/test-owner/test-repo"`
   - `TEST_ALIAS = "test-owner/test-repo"`

5. **Tests** (inside `describe("registerRepo", ...)`):

   | # | `it(...)` | What it does |
   |---|-----------|-------------|
   | 1 | `"registers repo via URL (clone + detect branch)"` | Calls registerRepo with URL only. Asserts clone called with `CLONES_DIR/test-owner/test-repo`, defaultBranch called, entry persisted with baseBranch, result has alreadyRegistered=false. |
   | 2 | `"registers repo via local path (no clone)"` | Calls with localPath=`/repos/local`. Asserts clone NOT called (cloneCalls empty), defaultBranch called with localPath, entry has localPath field. |
   | 3 | `"returns existing entry when alias already registered"` | Pre-seeds registry with alias. Asserts clone NOT called, defaultBranch NOT called, writeRepos NOT called (spy or state check), result has alreadyRegistered=true with original entry. |
   | 4 | `"uses explicit baseBranch and skips defaultBranch detection"` | Calls with baseBranch=`"develop"`. Asserts defaultBranch NOT called, entry.baseBranch is `"develop"`. |
   | 5 | `"wraps clone failure in RepoRegistrationError"` | Configures fake to throw `GitCloneError` on clone. Asserts `rejects.toThrow(RepoRegistrationError)`, cause is the original GitCloneError. |
   | 6 | `"wraps defaultBranch failure in RepoRegistrationError"` | Configures fake to throw `GitNoDefaultBranchError` on defaultBranch. Asserts `rejects.toThrow(RepoRegistrationError)`, cause is the original error. |
   | 7 | `"rejects empty URL with InvalidRepoRequestError"` | Calls with `url: ""`. Asserts throws `InvalidRepoRequestError`, clone not called. |
   | 8 | `"rejects relative localPath with InvalidRepoRequestError"` | Calls with `localPath: "relative/path"`. Asserts throws `InvalidRepoRequestError`, clone not called. |
   | 9 | `"derives alias from multiple URL formats"` | Parametric: tests `deriveAlias` indirectly through registerRepo (or exports it for testing). Tests HTTPS, HTTPS+.git, SSH, ssh:// formats all produce `owner/repo`. Since `deriveAlias` is private, test via calling registerRepo with each URL format and checking the result alias. Use re-registration path (pre-seed registry) to avoid clone overhead. |

### Validation

- `npx vitest run --project core` passes — all 9 tests green.
- `npm run check` passes — full quality gate.
- `npm test` passes — full test suite including existing tests.

### Dependencies

Stages 1, 2, and 3 (tests import from `../index.js` which must re-export everything).

---

## Execution summary

| Stage | Files | Action | Depends on | Gate |
|-------|-------|--------|------------|------|
| 1 | `register-repo-errors.ts` | Create | none | `tsc --noEmit` + `biome check` |
| 2 | `register-repo.ts` | Create | Stage 1 | `tsc --noEmit` + `biome check` + `depcruise` |
| 3 | `index.ts` | Modify | Stages 1, 2 | `npm run check` |
| 4 | `register-repo.test.ts` | Create | Stages 1, 2, 3 | `npm run check` + `npm test` |

**Total new files**: 3 (`register-repo-errors.ts`, `register-repo.ts`, `register-repo.test.ts`).
**Modified files**: 1 (`index.ts`).
**Estimated implementation size**: ~120 lines production code + ~200 lines test code.
