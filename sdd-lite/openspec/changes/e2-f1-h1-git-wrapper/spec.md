# Spec — e2-f1-h1-git-wrapper

Formal, testable contract for **[E2.F1.H1] Base git wrapper** (issue [#11](https://github.com/nico0695/sentinel-kit/issues/11)). Formalizes `proposal.md` with dec-001..dec-006 locked in.

## Goal
Declare a thin **`GitPort`** driven port in the core (owned by `src/core/repos/`, dec-001), define its typed error family, and ship one driven adapter under `src/adapters/driven/git/` that implements four operations — `clone`, `fetch`, `branches`, `defaultBranch` — over the `git` binary using **execa + machine-readable output**. Adapter translates every raw failure into a typed port error; **no raw exception leaks into the core**.

## Non-goals (HARD BOUNDARY — enforced by validator A)
- **No** `worktree add/remove/list` — H2 (#12).
- **No** `merge-base`, **no** `diff` (`--numstat`, `<base>..<target>`) — H2 (#12).
- **No** `ConfigStore` schemas / fs+yaml persistence — F2.H1 (#13).
- **No** `registerRepo` use case, **no** managed-clones directory layout — F2.H2 (#14).
- **No** `listRepos` / `listBranches` use cases — F2.H3 (#15).
- **No** engine wiring in `src/main/`; **no** CLI/TUI surface; **no** run-flow code.
- **No** touching `src/core/run/*` (frozen H1 `ReviewEngine` port + `TerminalState` + `WorktreeRef`).
- **No** pre-clone default-branch detection (`ls-remote --symref`, dec-003 deferred).

## Public API — types the core exports

Re-exported from `src/core/repos/index.ts` (guard 3: cross-module consumers only through the module index):

- `GitPort` — the interface.
- `CloneRequest`, `FetchRequest`, `FetchOptions`, `BranchRef`, `DefaultBranchRequest` — invocation types.
- `GitError`, `GitCloneError`, `GitFetchError`, `GitCommandError`, `GitNoDefaultBranchError` — error family.

Private, under `src/core/repos/ports/`:
- `git-port.ts` — the `GitPort` interface + invocation types.
- `git-port-errors.ts` — the error hierarchy (dec-006).

### `GitPort` interface (frozen contract for this change)

```ts
export interface GitPort {
  /**
   * Clone `request.url` into `request.targetPath` (absolute, dec-004). The
   * adapter refuses a relative path with a validation-time GitCloneError
   * before spawning git. Rejects with GitCloneError on any git/network
   * failure.
   */
  clone(request: CloneRequest): Promise<void>;

  /**
   * Fetch from `request.options.remote` (default `origin`, dec-005) in the
   * local repo at `request.repoPath`. Rejects with GitFetchError on any
   * git failure.
   */
  fetch(request: FetchRequest): Promise<void>;

  /**
   * List branches in the local repo at `repoPath`. Returns BOTH local
   * (refs/heads) and remote (refs/remotes) refs in a single tagged shape
   * (dec-002). Rejects with GitCommandError on any git failure.
   */
  branches(repoPath: string): Promise<readonly BranchRef[]>;

  /**
   * Detect the remote HEAD's branch of `request.remote` (default `origin`)
   * in the local repo at `request.repoPath`, via `git symbolic-ref`.
   * Returns the short branch name (e.g. `main`), never a full refname.
   * Rejects with GitNoDefaultBranchError when HEAD is not set for that
   * remote, or with GitCommandError on any other git failure (dec-003).
   */
  defaultBranch(request: DefaultBranchRequest): Promise<string>;
}

export interface CloneRequest {
  readonly url: string;
  readonly targetPath: string; // absolute; adapter validates
}

export interface FetchRequest {
  readonly repoPath: string;
  readonly options?: FetchOptions;
}
export interface FetchOptions {
  readonly remote?: string; // default 'origin'
}

export interface BranchRef {
  readonly name: string;                 // short name, e.g. 'main' or 'origin/main'
  readonly kind: 'local' | 'remote';
  readonly remote?: string;              // set iff kind === 'remote' (e.g. 'origin')
}

export interface DefaultBranchRequest {
  readonly repoPath: string;
  readonly remote?: string; // default 'origin'
}
```

### Error hierarchy (dec-006)

```ts
export class GitError extends Error {
  readonly cause?: unknown; // preserves the raw execa/git error for observability
}
export class GitCloneError extends GitError {}
export class GitFetchError extends GitError {}
export class GitCommandError extends GitError {}     // for `branches`, misc failures, validation
export class GitNoDefaultBranchError extends GitError {}
```

Every subclass sets `name = 'GitCloneError' | …` in its constructor (V8 stack readability). `cause` is optional; when built with an underlying error, the adapter stores it there — never leaks the raw `ExecaError` type into the core signature (`cause: unknown`, not `cause: ExecaError`, dec-006).

### exactOptionalPropertyTypes discipline
Every optional field above (`options`, `remote`, `cause`) is built **conditionally** by the adapter (e.g. `{ ... } as const` vs `{ ..., cause } as const`) — never assigned `undefined` explicitly (coding-standards).

## Adapter shape

Adapter path: `src/adapters/driven/git/git-cli.ts` (implementation) + `src/adapters/driven/git/index.ts` (public factory `createGitCliAdapter(): GitPort`).

### Machine-readable commands (setup-tecnico decision 2, PRD §5.1)
- **clone**: `git clone --quiet <url> <targetPath>`. `--quiet` prevents interactive progress on TTY-less runs; no output parsing needed (success is exit 0).
- **fetch**: `git -C <repoPath> fetch --quiet <remote>` (remote defaults to `origin`).
- **branches**: `git -C <repoPath> for-each-ref --format=%(refname) refs/heads refs/remotes`. Parser strips the `refs/heads/` / `refs/remotes/<remote>/` prefix; every entry is tagged `local` or `remote` with `remote` set for the remote case. `refs/remotes/<remote>/HEAD` is filtered out (symbolic ref, not a branch).
- **defaultBranch**: `git -C <repoPath> symbolic-ref --short refs/remotes/<remote>/HEAD` (remote defaults to `origin`). `--short` returns e.g. `origin/main`; the adapter strips the `<remote>/` prefix and returns `main`.

### Error translation table (exhaustive)
| Trigger in adapter | Raised port error | Notes |
|---|---|---|
| `clone` throws (execa non-zero, spawn error, non-absolute `targetPath`) | `GitCloneError` | Message = short summary; `cause` = raw error. |
| `fetch` throws (execa non-zero, unknown remote, spawn error) | `GitFetchError` | Message = short summary; `cause` = raw error. |
| `branches` throws (execa non-zero, not a git repo, spawn error) | `GitCommandError` | Message includes the git subcommand; `cause` = raw error. |
| `defaultBranch`: `git symbolic-ref` exits non-zero because HEAD isn't set | `GitNoDefaultBranchError` | No `cause` — this is an expected domain outcome, not a bug. |
| `defaultBranch`: any other execa failure (missing repo, spawn error) | `GitCommandError` | Message includes the git subcommand; `cause` = raw error. |
| Any thrown value that is not an `Error` | Wrapped into the appropriate `GitError` subclass | Never re-throws a raw non-Error value. |

Detection of the HEAD-unset case: exit code (git returns 128) **and** stderr matches `/ref .* is not a symbolic ref/` OR the stripped output is empty. The two-signal check is intentional — a single-signal check would misclassify unrelated 128s. Falls through to `GitCommandError` if neither signal fires.

## Acceptance criteria

Each AC is (i) verifiable by an automated test in the contract suite unless marked "gate-only", (ii) tagged with the issue-#11 acceptance box it satisfies.

- **AC-1 (issue #11 box 1) — clone works against a local repo fixture.**
  Given a bare source repo initialised in `os.tmpdir()`, `clone({ url: 'file://<bare>', targetPath })` resolves and the target directory contains a valid `.git`.

- **AC-2 (issue #11 box 1) — fetch works against a local repo fixture.**
  Given a working clone with a `file://` remote whose bare repo received a new commit, `fetch({ repoPath })` resolves and `git -C <repoPath> rev-parse <remote>/<default>` reflects the new commit.

- **AC-3 (issue #11 box 1, box 2) — branches returns a stable tagged shape.**
  Given a working clone with local branch `feat` and remote branch `origin/feat`, `branches(repoPath)` resolves to an array containing at least `{ name: 'feat', kind: 'local' }` and `{ name: 'origin/feat', kind: 'remote', remote: 'origin' }`. The `refs/remotes/origin/HEAD` symbolic ref is **not** present. Multiple invocations return the same order for the same inputs.

- **AC-4 (issue #11 box 1) — defaultBranch returns the short name.**
  Given a fresh clone of a bare repo whose default branch is `main`, `defaultBranch({ repoPath })` resolves to `'main'`. Given `remote: 'upstream'`, the adapter targets `refs/remotes/upstream/HEAD` and returns the short branch name.

- **AC-5 (issue #11 box 3) — no raw execa exception leaks.**
  For every operation, if the underlying `git` invocation fails (bad URL for clone, unknown remote for fetch, not-a-git-repo for branches, HEAD-unset for defaultBranch, missing repo for defaultBranch), the returned promise rejects with an `instanceof GitError` (never `ExecaError`, never a bare `Error`). The raw error is preserved in `cause` **except** for `GitNoDefaultBranchError` (expected outcome, no cause).

- **AC-6 (issue #11 box 3) — no I/O library reaches the core.**
  Guard 2 (`core-no-io-libs`) stays green after the change: `depcruise src` reports zero violations. The port types must be expressible without importing `execa`, `node:child_process`, `node:fs`, or any other Node builtin.

- **AC-7 — port types re-exported through the public index.**
  `src/core/repos/index.ts` re-exports `GitPort`, all invocation types, and all error classes. Cross-module imports use only this index (guard 3 green).

- **AC-8 — adapter reachable through the driven-git public index.**
  `src/adapters/driven/git/index.ts` exports `createGitCliAdapter` and re-exports **no** internals. The contract-suite test imports the factory only from this index (mirrors the E0.F2.H2 pattern for FakeEngine).

- **AC-9 — architecture guards stay green.**
  `npm run check` exits 0 (biome + tsc + depcruise). Specifically: no import from `src/adapters/…` inside `src/core/…`; no adapter-to-adapter import from `src/adapters/driven/git/…`; no instantiation of the adapter outside `src/main/` (this change does not wire; the guard passes trivially).

- **AC-10 — shared `GitPort.contract` suite.**
  A parameterized contract suite exists at `src/adapters/driven/git/__test__/GitPort.contract.ts`, exporting a `gitPortContract(harness, label?)` function that follows the `ReviewEngine.contract` pattern (imports only vitest + core port types, no concrete adapter). One test file `src/adapters/driven/git/__test__/git-cli.test.ts` provides a harness over `createGitCliAdapter()` and calls the suite. Setup of the local fixture (bare + working repo) lives in the harness, using `node:fs` / `execa` / `node:os.tmpdir()` — all confined to the adapter test tree, never to core tests.

- **AC-11 — English-only, coding-standards conformant.**
  Every persisted artifact and code identifier is English (project rule). Every relative import ends with `.js` (NodeNext). Every type re-export uses `export type`. No optional field is ever assigned `undefined` explicitly.

- **AC-12 — no touch to frozen scope.**
  Diff is confined to: `src/core/repos/ports/` (new), `src/core/repos/index.ts` (edit), `src/adapters/driven/git/index.ts` (edit), `src/adapters/driven/git/git-cli.ts` (new), `src/adapters/driven/git/__test__/GitPort.contract.ts` (new), `src/adapters/driven/git/__test__/git-cli.test.ts` (new), `package.json` (adds `execa` runtime dep), `package-lock.json` (regenerated), plus sdd-lite artifacts and (at close) `history/`. `src/core/run/*` is not modified. `src/main/cli.ts` is not modified.

- **AC-13 — package boundary discipline.**
  `execa` is added to `dependencies` (runtime) — the adapter needs it in production. The core still imports only `zod` (and even `zod` only when a story needs it — this change does not use zod).

- **AC-14 (gate-only) — quality gates green.**
  `npm run check` exits 0 and `npm test` exits 0 (all three vitest projects; only `adapters` gains new tests in this change; `core` and `e2e` stay empty and non-failing thanks to the aggregate rule already established in E0.F2.H2).

## Test strategy (feeds AC-1..AC-5)
- Fixture harness (in the test file): create two directories in `os.tmpdir()` per test using `fs.mkdtempSync` — a **bare** repo initialised with `git init --bare -b main` (so HEAD -> refs/heads/main is set for `defaultBranch`), and a **working** repo cloned from the bare via `file://`. Seed with at least one commit and one local branch `feat` + push it so `origin/feat` exists remotely.
- Every test uses a **fresh** pair of directories via `beforeEach`, cleaned up in `afterEach` with `fs.rmSync(dir, { recursive: true, force: true })`.
- The bare-init helper is inline in the test file (adapter tests may use `execa` / `node:fs` freely — they live under `__test__/`, excluded from the depcruise cruise, `.dependency-cruiser.cjs` `options.exclude`).
- **No network.** Every remote is `file://`. Fetch tests append a new commit to the bare repo (via a third throwaway working clone) and assert the working clone picks it up after `fetch`.

## Assumptions locked (not to be revisited)
- Node ≥22 shell environment with `git` on PATH (matches the CI matrix already defined in `docs/setup-tecnico-sentinel.md` §6 and the runtime declared in `package.json` `engines`). If `git` is absent, the adapter fails with `GitCommandError` (spawn error). No fallback / no probing.
- MVP is Linux/macOS. Windows path-separator normalisation is explicitly not in scope.
- The `git init --bare -b main` fixture assumes git ≥ 2.28 (`--initial-branch` support). This is the ambient CI/dev git.
