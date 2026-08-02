# Design — e2-f1-h1-git-wrapper

Technical design for `[E2.F1.H1] Base git wrapper` (issue #11). Formalises `spec.md` with dec-001..dec-006 locked in. Both blind validators returned `VERDICT: no-drift` on the spec — no design deviation is being introduced here; this document only makes the concrete file layout and code shape explicit for the plan and executor.

## 1. File map (frozen scope, mirrors AC-12)

```
src/core/repos/
├── ports/
│   ├── git-port.ts               NEW — interface + invocation types
│   └── git-port-errors.ts        NEW — GitError family (dec-006)
└── index.ts                      EDIT — re-export the port + types + errors

src/adapters/driven/git/
├── git-cli.ts                    NEW — createGitCliAdapter() → GitPort
├── index.ts                      EDIT — export the factory only
└── __test__/
    ├── GitPort.contract.ts       NEW — shared contract suite (parameterized)
    └── git-cli.test.ts           NEW — harness + fixture + call the suite

package.json                      EDIT — add "execa": "^9.6.0" to "dependencies"
package-lock.json                 REGEN — from `npm install`
```

Nothing else is touched. `src/core/run/*`, `src/main/cli.ts`, `docs/`, `.dependency-cruiser.cjs`, `vitest.config.ts`, `tsconfig.json`, `biome.json`, `tsup.config.ts` all stay as-is.

## 2. Core module — port + errors

### 2.1 `src/core/repos/ports/git-port-errors.ts`

```ts
/**
 * Core module: repos — GitPort error family (dec-006).
 *
 * Base class + one typed subclass per failure family so the future run flow
 * and use cases can discriminate by `instanceof` rather than a string code
 * (verbatimModuleSyntax-friendly, exhaustive under strict TS).
 *
 * `cause` is typed `unknown` on purpose: the adapter preserves the raw
 * ExecaError-or-similar for observability, but the core signature must NOT
 * name any I/O type (guard 2). Adapters build the shape CONDITIONALLY under
 * exactOptionalPropertyTypes — never assign `cause: undefined`.
 */
export class GitError extends Error {
  readonly cause?: unknown;
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message);
    this.name = "GitError";
    if (options !== undefined && "cause" in options) {
      this.cause = options.cause;
    }
  }
}

export class GitCloneError extends GitError {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = "GitCloneError";
  }
}

export class GitFetchError extends GitError {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = "GitFetchError";
  }
}

export class GitCommandError extends GitError {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = "GitCommandError";
  }
}

/**
 * Raised by defaultBranch() when the local repo has no symbolic HEAD for the
 * requested remote — an EXPECTED domain outcome, not a bug. `cause` is not
 * populated (spec §Error translation table).
 */
export class GitNoDefaultBranchError extends GitError {
  constructor(message: string) {
    super(message);
    this.name = "GitNoDefaultBranchError";
  }
}
```

Notes:
- Explicit `super()` call and manual `name` assignment ensure stack traces stay readable across engines (Node's default takes the class name only if the class extends Error directly, which is fine here — kept explicit to be robust).
- The `cause` property is set via `if ("cause" in options)` to honour exactOptionalPropertyTypes: never assign `cause: undefined`.
- The base class defines a single field once; subclasses inherit it. Passing `options` up through `super(message, options)` preserves cause propagation.

### 2.2 `src/core/repos/ports/git-port.ts`

```ts
/**
 * Core module: repos — driven port `GitPort` (PRD §4.3).
 *
 * Thin domain contract for source-control operations the review flow needs
 * (H1 scope: clone, fetch, branches, defaultBranch). Adapters live under
 * `src/adapters/driven/git/*`; the core never spawns a process. Worktrees,
 * merge-base and diff land in H2 — this port intentionally has NO methods
 * for them yet (spec §Non-goals).
 */

/** clone(url, targetPath) — targetPath must be ABSOLUTE (dec-004). */
export interface CloneRequest {
  readonly url: string;
  readonly targetPath: string;
}

/** fetch(repoPath, options?) — options.remote defaults to `origin` (dec-005). */
export interface FetchRequest {
  readonly repoPath: string;
  readonly options?: FetchOptions;
}
export interface FetchOptions {
  readonly remote?: string;
}

/**
 * A branch reference in a local repo, tagged by origin so downstream
 * consumers (H2 merge-base needs local; H3 listBranches needs remote) work
 * off the same shape without new methods (dec-002).
 */
export interface BranchRef {
  readonly name: string;
  readonly kind: "local" | "remote";
  readonly remote?: string;
}

/** defaultBranch(repoPath, remote?) — remote defaults to `origin` (dec-003). */
export interface DefaultBranchRequest {
  readonly repoPath: string;
  readonly remote?: string;
}

export interface GitPort {
  clone(request: CloneRequest): Promise<void>;
  fetch(request: FetchRequest): Promise<void>;
  branches(repoPath: string): Promise<readonly BranchRef[]>;
  defaultBranch(request: DefaultBranchRequest): Promise<string>;
}
```

### 2.3 `src/core/repos/index.ts` (edit)

Replaces the placeholder body with:

```ts
/**
 * Core module: repos — repo registration and configuration (PRD §4.2).
 *
 * Public API (types only in H1): the `GitPort` driven port + its invocation
 * types (dec-001), and its typed error family (dec-006). Use cases
 * (registerRepo, listRepos, listBranches) land in E2.F2.x.
 */
export type {
  BranchRef,
  CloneRequest,
  DefaultBranchRequest,
  FetchOptions,
  FetchRequest,
  GitPort,
} from "./ports/git-port.js";
export {
  GitCloneError,
  GitCommandError,
  GitError,
  GitFetchError,
  GitNoDefaultBranchError,
} from "./ports/git-port-errors.js";
```

- Interfaces are re-exported with `export type` (verbatimModuleSyntax).
- Error classes are re-exported with a runtime `export` (they exist at runtime).
- NodeNext `.js` specifiers on every relative import (coding-standards).

## 3. Adapter — `src/adapters/driven/git/`

### 3.1 `git-cli.ts` — sketch (executor writes the real file)

Structure the executor follows verbatim:

```ts
import { execa, type ExecaError } from "execa";
import type {
  BranchRef,
  CloneRequest,
  DefaultBranchRequest,
  FetchRequest,
  GitPort,
} from "../../../core/repos/index.js";
import {
  GitCloneError,
  GitCommandError,
  GitFetchError,
  GitNoDefaultBranchError,
} from "../../../core/repos/index.js";
import { isAbsolute } from "node:path";

const DEFAULT_REMOTE = "origin";

/** Factory: returns a fresh GitPort. Adapter is stateless. */
export function createGitCliAdapter(): GitPort {
  return {
    async clone({ url, targetPath }) {
      if (!isAbsolute(targetPath)) {
        throw new GitCloneError(
          `clone: targetPath must be absolute (received: ${targetPath})`,
        );
      }
      try {
        await execa("git", ["clone", "--quiet", url, targetPath]);
      } catch (raw) {
        throw wrapAs(GitCloneError, `git clone failed for ${url}`, raw);
      }
    },

    async fetch({ repoPath, options }) {
      const remote = options?.remote ?? DEFAULT_REMOTE;
      try {
        await execa("git", ["-C", repoPath, "fetch", "--quiet", remote]);
      } catch (raw) {
        throw wrapAs(GitFetchError, `git fetch ${remote} failed`, raw);
      }
    },

    async branches(repoPath) {
      let stdout: string;
      try {
        const result = await execa("git", [
          "-C", repoPath,
          "for-each-ref",
          "--format=%(refname)",
          "refs/heads", "refs/remotes",
        ]);
        stdout = result.stdout;
      } catch (raw) {
        throw wrapAs(GitCommandError, "git for-each-ref failed", raw);
      }
      return parseBranches(stdout);
    },

    async defaultBranch({ repoPath, remote }) {
      const target = remote ?? DEFAULT_REMOTE;
      const ref = `refs/remotes/${target}/HEAD`;
      try {
        const { stdout } = await execa("git", [
          "-C", repoPath,
          "symbolic-ref", "--short", ref,
        ]);
        const short = stdout.trim();
        if (short === "") {
          throw new GitNoDefaultBranchError(
            `default branch not set for remote '${target}'`,
          );
        }
        // `--short` returns `<remote>/<branch>`; strip the remote prefix.
        const prefix = `${target}/`;
        return short.startsWith(prefix) ? short.slice(prefix.length) : short;
      } catch (raw) {
        if (raw instanceof GitNoDefaultBranchError) throw raw;
        if (isHeadUnsetSignal(raw)) {
          throw new GitNoDefaultBranchError(
            `default branch not set for remote '${target}'`,
          );
        }
        throw wrapAs(GitCommandError, `git symbolic-ref ${ref} failed`, raw);
      }
    },
  };
}

// --- helpers ---------------------------------------------------------------

/** Parse `for-each-ref --format=%(refname)` output into tagged BranchRef[]. */
function parseBranches(stdout: string): readonly BranchRef[] {
  const refs: BranchRef[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;

    if (trimmed.startsWith("refs/heads/")) {
      const name = trimmed.slice("refs/heads/".length);
      refs.push({ name, kind: "local" });
      continue;
    }
    if (trimmed.startsWith("refs/remotes/")) {
      const rest = trimmed.slice("refs/remotes/".length);
      const slash = rest.indexOf("/");
      if (slash < 0) continue;
      const remote = rest.slice(0, slash);
      const branch = rest.slice(slash + 1);
      // Filter out the symbolic ref (e.g. refs/remotes/origin/HEAD -> origin/main)
      if (branch === "HEAD") continue;
      refs.push({ name: `${remote}/${branch}`, kind: "remote", remote });
    }
  }
  return refs;
}

/** Build a GitError subclass, preserving cause conditionally (exactOptional). */
function wrapAs<T extends new (msg: string, opts?: { readonly cause?: unknown }) => Error>(
  Ctor: T,
  message: string,
  cause: unknown,
): InstanceType<T> {
  const err = cause instanceof Error ? cause : new Error(String(cause));
  return new Ctor(`${message}: ${err.message}`, { cause: err }) as InstanceType<T>;
}

/**
 * git returns exit 128 with `fatal: ref refs/remotes/<remote>/HEAD is not a
 * symbolic ref` when HEAD is unset. Two-signal check (exit + stderr regex)
 * avoids misclassifying unrelated 128s (spec §Error translation).
 */
function isHeadUnsetSignal(raw: unknown): boolean {
  const err = raw as Partial<ExecaError> & { stderr?: string };
  if (err?.exitCode !== 128) return false;
  const stderr = typeof err.stderr === "string" ? err.stderr : "";
  return /is not a symbolic ref/i.test(stderr);
}
```

Notes:
- `wrapAs` is the single funnel that guarantees every raw failure becomes a typed `GitError` subclass with `cause` preserved (spec AC-5). Non-Error thrown values are wrapped in a plain `Error(String(x))` first so `cause` is always an `Error` — but the port `cause` field stays `unknown` (guard 2).
- `import type { ExecaError }` — types are erased at compile time (verbatimModuleSyntax; type-only), so no runtime dep on ExecaError's shape beyond what the type says.
- `parseBranches` uses only `String.prototype` methods and `Array.prototype.push` — no I/O.
- `defaultBranch` never returns an empty string (either short slice succeeds, or `GitNoDefaultBranchError` fires).

### 3.2 `index.ts` (edit)

```ts
/**
 * Driven adapter: git — GitPort implementation over the `git` binary
 * (execa + machine-readable output, PRD §5.1 / setup-tecnico decision 2).
 *
 * Public API: the `createGitCliAdapter` factory. Internals stay private.
 */
export { createGitCliAdapter } from "./git-cli.js";
```

## 4. Tests — `src/adapters/driven/git/__test__/`

### 4.1 `GitPort.contract.ts` — parameterized suite

Mirrors `ReviewEngine.contract.ts`. Imports only `vitest` and core port types + error classes. Never imports the concrete adapter.

Harness interface:
```ts
export interface GitPortContractHarness {
  /** Build the port under test. Called ONCE per test. */
  readonly build: () => GitPort;
  /**
   * Prepare a fresh local fixture and return the paths that satisfy every
   * scenario the suite runs. Called ONCE per test in beforeEach; cleanup is
   * the harness's job.
   */
  readonly setupFixture: () => Promise<GitFixture>;
  readonly teardownFixture: (fixture: GitFixture) => Promise<void>;
}

export interface GitFixture {
  readonly barePath: string;         // absolute; the primary bare remote
  readonly upstreamBarePath: string; // absolute; a second bare with a DIFFERENT default branch
  readonly upstreamRemoteName: string;   // e.g. "upstream" — added to `clonePath` at fixture time
  readonly upstreamDefaultBranch: string; // e.g. "trunk" — differs from `defaultBranch` on purpose
  readonly clonePath: string;        // absolute; a working clone of `barePath` with `upstream` remote added
  readonly emptyRepoPath: string;    // absolute; a git repo with no remote HEAD
  readonly nonRepoPath: string;      // absolute; an existing dir that is NOT a git repo
  readonly defaultBranch: string;    // e.g. "main"
  readonly localOnlyBranch: string;  // e.g. "feat-local"
  readonly pushedBranch: string;     // e.g. "feat-shared" — exists both local and origin/*
  /**
   * Append a new commit to `barePath` from a throwaway working clone and
   * return the resulting commit SHA. Used by the fetch test.
   */
  readonly addCommitToBare: () => Promise<string>;
}
```

The suite runs describe/it blocks that walk every AC-1..AC-5 case:
- `clone → success` (AC-1).
- `clone → rejects with GitCloneError on relative targetPath` (AC-5 validation).
- `clone → rejects with GitCloneError on bad URL (fs://…/does-not-exist)` (AC-5).
- `fetch → picks up a new commit on bare` (AC-2).
- `fetch → rejects with GitFetchError on unknown remote` (AC-5).
- `branches → returns tagged local + remote, excludes HEAD ref, stable order` (AC-3).
- `branches → rejects with GitCommandError on non-repo path` (AC-5).
- `defaultBranch → returns 'main' (default remote)` (AC-4 sentence 1).
- `defaultBranch → returns 'trunk' when remote='upstream' (targets refs/remotes/upstream/HEAD, strips <remote>/ prefix)` (AC-4 sentence 2 — needs a distinct default-branch name so the assertion cannot pass by accident on the primary remote).
- `defaultBranch → rejects with GitNoDefaultBranchError on repo without HEAD` (AC-4 error case + AC-5).
- `defaultBranch → rejects with GitCommandError on non-repo path` (AC-5).

Every rejection assertion checks `instanceof GitError` **and** the specific subclass — this is what the spec's AC-5 "never bare Error / never ExecaError" pins.

### 4.2 `git-cli.test.ts` — harness impl

Builds a `GitPortContractHarness` around `createGitCliAdapter()`. The fixture builder uses `execa` + `node:fs` + `node:os` + `node:path` (all allowed under `__test__/`, excluded from depcruise):

```ts
import { execa } from "execa";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGitCliAdapter } from "../index.js";
import { type GitPortContractHarness, gitPortContract } from "./GitPort.contract.js";

/**
 * Per-invocation git identity (dec-008): the fixture never reads or writes
 * global git config. Every `git commit` gets these via `-c` so the tests
 * pass on any runner regardless of ambient identity (fresh container, CI,
 * local dev).
 */
const GIT_IDENTITY = [
  "-c", "user.email=sentinel@test.local",
  "-c", "user.name=sentinel-test",
] as const;

const harness: GitPortContractHarness = {
  build: () => createGitCliAdapter(),
  setupFixture: async () => {
    const root = mkdtempSync(join(tmpdir(), "sentinel-git-"));
    const barePath         = join(root, "origin.git");
    const upstreamBarePath = join(root, "upstream.git");
    const seedPath         = join(root, "seed");
    const upstreamSeedPath = join(root, "upstream-seed");
    const clonePath        = join(root, "clone");
    const emptyRepoPath    = join(root, "empty");
    const nonRepoPath      = join(root, "not-a-repo");

    // Primary bare + seed commit + branches. Identity flags on every commit.
    await execa("git", ["init", "--bare", "-b", "main", barePath]);
    await execa("git", ["clone", "--quiet", barePath, seedPath]);
    await execa("git", [
      "-C", seedPath, ...GIT_IDENTITY,
      "commit", "--allow-empty", "-m", "init",
    ]);
    await execa("git", ["-C", seedPath, "branch", "feat-shared"]);
    await execa("git", ["-C", seedPath, "push", "-u", "origin", "main", "feat-shared"]);

    // Second bare with a DIFFERENT default branch ("trunk") — proves the
    // adapter reads remote-specific HEAD (spec AC-4 sentence 2) instead of
    // returning `main` by coincidence.
    await execa("git", ["init", "--bare", "-b", "trunk", upstreamBarePath]);
    await execa("git", ["clone", "--quiet", upstreamBarePath, upstreamSeedPath]);
    await execa("git", [
      "-C", upstreamSeedPath, ...GIT_IDENTITY,
      "commit", "--allow-empty", "-m", "upstream-init",
    ]);
    await execa("git", ["-C", upstreamSeedPath, "push", "-u", "origin", "trunk"]);

    // The user-visible working clone (fixture.clonePath) is a real, fresh
    // clone of the primary bare, with `upstream` added as a second remote
    // and fetched so refs/remotes/upstream/HEAD is populated locally.
    await execa("git", ["clone", "--quiet", barePath, clonePath]);
    await execa("git", ["-C", clonePath, "branch", "feat-local"]); // local-only
    await execa("git", ["-C", clonePath, "remote", "add", "upstream", upstreamBarePath]);
    await execa("git", ["-C", clonePath, "fetch", "--quiet", "upstream"]);
    await execa("git", [
      "-C", clonePath, "remote", "set-head", "upstream", "--auto",
    ]);

    // Empty repo: init but never set HEAD via a remote clone (no remote set).
    await execa("git", ["init", "-b", "main", emptyRepoPath]);

    // Non-repo dir: portable node:fs (no reliance on PATH `mkdir`).
    mkdirSync(nonRepoPath, { recursive: true });

    return {
      barePath, upstreamBarePath,
      upstreamRemoteName: "upstream",
      upstreamDefaultBranch: "trunk",
      clonePath, emptyRepoPath, nonRepoPath,
      defaultBranch: "main",
      localOnlyBranch: "feat-local",
      pushedBranch: "feat-shared",
      addCommitToBare: async () => {
        const throwaway = mkdtempSync(join(tmpdir(), "sentinel-git-push-"));
        await execa("git", ["clone", "--quiet", barePath, throwaway]);
        await execa("git", [
          "-C", throwaway, ...GIT_IDENTITY,
          "commit", "--allow-empty", "-m", "another",
        ]);
        await execa("git", ["-C", throwaway, "push", "origin", "main"]);
        const { stdout: sha } = await execa("git", [
          "-C", throwaway, "rev-parse", "HEAD",
        ]);
        rmSync(throwaway, { recursive: true, force: true });
        return sha.trim();
      },
    };
  },
  teardownFixture: async (fixture) => {
    // `rootPath` isn't exposed; derive it from any known child.
    const root = fixture.barePath.slice(0, fixture.barePath.lastIndexOf("/"));
    rmSync(root, { recursive: true, force: true });
  },
};

gitPortContract(harness, "GitCliAdapter");
```

- Each `it` in the suite calls `beforeEach → setupFixture` and `afterEach → teardownFixture`, so tests are hermetic. No shared state between tests, no ordering coupling.
- `mkdtempSync` is used (sync) so the harness surface stays simple; the amount of setup is small and this is test-only code.
- `nonRepoPath` is created with `node:fs.mkdirSync(nonRepoPath, { recursive: true })` — never via a shelled `mkdir` (portability + no reliance on PATH).
- Two bare repos with different default branches (`main` on `origin`, `trunk` on `upstream`) exist because AC-4 sentence 2 requires proving `defaultBranch({ remote: 'upstream' })` reads `refs/remotes/upstream/HEAD` — a same-name default would let the assertion pass by coincidence.
- The pattern deliberately mirrors `fake-engine.test.ts` (dec-006 of E0.F2.H2): the factory is imported from the adapter's PUBLIC index — proving reachability through the driven-git public API (spec AC-8).

## 5. Guards — proof each stays green

| Guard | How the design keeps it green |
|---|---|
| 1 (`core-no-adapters`) | Core code (`src/core/repos/*`) imports zero `src/adapters/*` / `src/main/*`. Adapter imports go the correct direction (adapter → core types). |
| 2 (`core-no-io-libs`) | Port types use only primitives + `readonly` + `Promise<T>` + `Error`. `cause` is `unknown`. `execa`, `node:path`, `node:fs`, `node:os` all live only under `src/adapters/driven/git/`. |
| 3 (`core-modules-via-index`) | External consumers (later stories, adapters) will import from `src/core/repos/index.ts`. This change re-exports the port + errors from that index. The adapter itself imports through that path (`../../../core/repos/index.js`). |
| 4 (`adapters-isolated`) | The adapter imports zero other `src/adapters/*` folders. Only core types + `execa` + `node:*`. |
| 5 (`wiring-only-in-main`) | No `src/main/*` edit. The adapter is instantiated only inside its own `__test__/` file (excluded from depcruise). |

## 6. Package management

`execa` becomes a **runtime** dep (`dependencies`, not `devDependencies`) — the adapter needs it in production once wired. Pinned to the current major (`^9.6.0` — the release line that ships alongside Node ≥22 and preserves the async API this design uses; `npm install execa` regenerates the exact minor). This is the first runtime dep of the project; `package.json` currently only has devDependencies. `npm install` is the way to add it (regenerates `package-lock.json`).

## 7. Risks & mitigations (design-level, incremental over the proposal)

- **R-D1 — Node's `Error(..., { cause })` erasure.** Node's native `Error` accepts `cause` in its options bag; passing `{ cause: err }` up through `super()` sets the property. Kept explicit (`if ("cause" in options)`) so behaviour is identical when the options bag is absent. Mitigation: unit-level test asserts `.cause === rawExecaError` on a caught adapter error.
- **R-D2 — `for-each-ref` order is deterministic but locale-affected.** `refs/heads` and `refs/remotes` sub-lists are alphabetical by ref name; combined ordering follows the argument order. Mitigation: the contract test asserts *presence and shape*, not full order, and asserts stability over two calls with the same fixture (AC-3). Explicit collation via `LC_ALL=C` is not necessary for ASCII branch names.
- **R-D3 — `git init --bare -b main` requires git ≥ 2.28.** Spec §Assumptions locked this — CI matrix (Node 22/24) runs on ubuntu-latest which ships git ≥ 2.34, safe.
- **R-D4 — Concurrent execa spawns on CI.** Each test spins up ~4 execa calls in `setupFixture`. Multiplied by ~10 tests, that is ~40 spawns; well within the vitest default worker budget. No mitigation needed.
- **R-D5 — `import type { ExecaError }`.** If a future execa major renames the export, the compile fails at that adapter file, not at any core file. Guard 2 stays inviolate.

## 8. What this design deliberately does NOT do

Out-of-scope in this change — the executor must not add any of these even opportunistically:
- **No** shallow-clone / bare-clone flags on `clone` beyond `--quiet`. If a caller wants shallow, they add it in H2+.
- **No** authentication handling (SSH agent, credential helper). Local `file://` fixtures obviate this for the contract suite; real remotes will surface auth errors as `GitCloneError` / `GitFetchError` naturally.
- **No** progress reporting, cancellation tokens, streamed stdout, or partial-fetch signals.
- **No** logging, telemetry, or debug flag on the port.
- **No** `simple-git` fallback — setup-tecnico decision 2 explicitly rejected it.

## 9. Locked decisions summary

| id | Q | Choice | Owner |
|---|---|---|---|
| dec-001 | — | Port owned by `src/core/repos` (public-index re-export). | claude (A) |
| dec-002 | Q1 | `branches()` returns BOTH local + remote in a single tagged shape. | claude→user (B) |
| dec-003 | Q2 | `defaultBranch()` via `git symbolic-ref` post-clone; unset → `GitNoDefaultBranchError`. | claude→user (B) |
| dec-004 | Q3 | `clone()` receives absolute `targetPath`; layout is a `registerRepo` concern. | claude→user (B) |
| dec-005 | Q4 | `fetch()` remote configurable, default `origin`; options object optional. | claude→user (B) |
| dec-006 | Q5 | Base `GitError` + typed subclasses (`GitCloneError`, `GitFetchError`, `GitCommandError`, `GitNoDefaultBranchError`). | claude→user (B) |
