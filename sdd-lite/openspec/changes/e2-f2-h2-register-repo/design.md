# Design: e2-f2-h2-register-repo

> Technical design for the `registerRepo` use case.

## Technical approach

### File layout

```
src/core/repos/
  register-repo.ts          # use case function + request/result types
  register-repo-errors.ts   # InvalidRepoRequestError, RepoRegistrationError
  index.ts                  # add re-exports for new symbols
  __test__/
    register-repo.test.ts   # 9 unit tests with in-memory fakes
```

All new files live inside `src/core/repos/` — no new modules, no adapter changes.

### Module boundaries

- `register-repo.ts` imports only from sibling files within `src/core/repos/`:
  - `./ports/config-schemas.js` — `RepoEntry`, `RepoRegistry` types
  - `./ports/config-store.js` — `ConfigStore` type
  - `./ports/git-port.js` — `GitPort`, `CloneRequest`, `DefaultBranchRequest` types
  - `./ports/git-port-errors.js` — `GitError` for `instanceof` catch
  - `./register-repo-errors.js` — own error classes
- `register-repo-errors.ts` has zero imports (standalone error classes).
- Test file imports from `../index.js` (public API) + error classes from `../register-repo-errors.js`.

### Architecture guard compliance

| Guard | Status | Rationale |
|-------|--------|-----------|
| `core-no-io-libs` | Pass | No I/O imports. Only `node:path` for `join()` — this is a pure utility, not I/O. Actually, even `node:path` should be avoided in strict mode. We use string concatenation `${clonesDir}/${alias}` instead. |
| `core-no-adapter-import` | Pass | Imports only from `./ports/*` within same module. |
| `core-module-via-index` | Pass | No cross-module imports. All within `repos`. |
| `adapter-no-cross-import` | N/A | No adapter files touched. |
| `adapter-instantiation-in-main` | N/A | No adapter instantiation. |

**Note on path joining**: To avoid importing `node:path` in core (which would be an I/O library import under the strictest interpretation of the guards), the target path for clones uses string concatenation: `` `${clonesDir}/${alias}` ``. The `alias` is always `owner/repo` (forward slash, no special characters), and `clonesDir` is always an absolute path provided by the composition root. This is safe and avoids a guard violation.

## Interface definitions

### Request and result types

```typescript
// register-repo.ts

import type { RepoEntry } from "./ports/config-schemas.js";
import type { ConfigStore } from "./ports/config-store.js";
import type { GitPort } from "./ports/git-port.js";

export interface RegisterRepoRequest {
  readonly url: string;
  readonly localPath?: string;
  readonly baseBranch?: string;
  readonly defaultHarness?: string;
}

export interface RegisterRepoResult {
  readonly alias: string;
  readonly entry: RepoEntry;
  readonly alreadyRegistered: boolean;
}

export interface RegisterRepoDeps {
  readonly git: GitPort;
  readonly config: ConfigStore;
  readonly clonesDir: string;
}

export async function registerRepo(
  request: RegisterRepoRequest,
  deps: RegisterRepoDeps,
): Promise<RegisterRepoResult>;
```

### Error classes

```typescript
// register-repo-errors.ts

export class InvalidRepoRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRepoRequestError";
  }
}

export interface RepoRegistrationErrorOptions {
  readonly cause?: unknown;
}

export class RepoRegistrationError extends Error {
  readonly cause?: unknown;
  constructor(message: string, options?: RepoRegistrationErrorOptions) {
    super(message);
    this.name = "RepoRegistrationError";
    if (options !== undefined && "cause" in options) {
      this.cause = options.cause;
    }
  }
}
```

The error classes follow the exact same pattern as `ConfigError` and `GitError`:
- Named constructor with `this.name` assignment.
- Options interface with optional `cause`.
- Conditional `cause` assignment via `"cause" in options` (respects `exactOptionalPropertyTypes`).

`InvalidRepoRequestError` has no `cause` — validation errors are self-explanatory.

## Alias derivation algorithm

```typescript
function deriveAlias(url: string): string {
  let s = url.trim();

  // Strip trailing .git
  if (s.endsWith(".git")) {
    s = s.slice(0, -4);
  }

  let segments: string[];

  if (s.includes("://")) {
    // HTTPS-style: https://github.com/owner/repo
    segments = s.split("/");
  } else if (s.includes(":")) {
    // SSH-style: git@github.com:owner/repo
    const afterColon = s.slice(s.indexOf(":") + 1);
    segments = afterColon.split("/");
  } else {
    // Fallback: treat as path-like
    segments = s.split("/");
  }

  // Filter empty segments (trailing slashes, double slashes)
  const nonEmpty = segments.filter((seg) => seg.length > 0);

  if (nonEmpty.length < 2) {
    // Cannot derive owner/repo — will be caught by validation or produce
    // a degenerate alias. The use case validates URL non-emptiness separately.
    // For a URL like "just-a-word", this returns "just-a-word" which is unusual
    // but not harmful — the use case's behavior for malformed URLs is not
    // specified beyond "url must be non-empty".
    return nonEmpty.join("/");
  }

  const owner = nonEmpty[nonEmpty.length - 2];
  const repo = nonEmpty[nonEmpty.length - 1];
  return `${owner}/${repo}`;
}
```

### URL format coverage

| Input | After strip | Split strategy | Result |
|-------|------------|----------------|--------|
| `https://github.com/owner/repo` | same | `://` split `/` | `owner/repo` |
| `https://github.com/owner/repo.git` | `https://github.com/owner/repo` | `://` split `/` | `owner/repo` |
| `git@github.com:owner/repo.git` | `git@github.com:owner/repo` | `:` split after | `owner/repo` |
| `ssh://git@github.com/owner/repo` | same | `://` split `/` | `owner/repo` |
| `https://gitlab.com/group/sub/repo` | same | `://` split `/` | `sub/repo` |

## Use case flow (detailed)

```
registerRepo(request, deps):
  // 1. Validate
  if url is empty/whitespace → throw InvalidRepoRequestError
  if localPath defined and not absolute → throw InvalidRepoRequestError

  // 2. Derive alias
  alias = deriveAlias(request.url)

  // 3. Check registry
  repos = await deps.config.readRepos()
  if alias in repos → return { alias, entry: repos[alias], alreadyRegistered: true }

  // 4. Clone or validate local
  repoPath: string
  if request.localPath is defined:
    repoPath = request.localPath
    // No clone — localPath is trusted to exist (validated by defaultBranch)
  else:
    targetPath = `${deps.clonesDir}/${alias}`
    try:
      await deps.git.clone({ url: request.url, targetPath })
    catch (error):
      if error instanceof GitError → throw RepoRegistrationError(msg, { cause: error })
      throw error  // unexpected — let it propagate
    repoPath = targetPath

  // 5. Detect base branch
  let baseBranch: string | undefined
  if request.baseBranch is defined:
    baseBranch = request.baseBranch
  else:
    try:
      baseBranch = await deps.git.defaultBranch({ repoPath })
    catch (error):
      if error instanceof GitError → throw RepoRegistrationError(msg, { cause: error })
      throw error

  // 6. Build entry (conditionally, respecting exactOptionalPropertyTypes)
  entry = { url: request.url }
  if localPath → entry.localPath = request.localPath
  if baseBranch → entry.baseBranch = baseBranch
  if defaultHarness → entry.defaultHarness = request.defaultHarness

  // 7. Persist
  repos[alias] = entry
  await deps.config.writeRepos(repos)

  // 8. Return
  return { alias, entry, alreadyRegistered: false }
```

## Error mapping

| Port error | Trigger | Use case error | Message pattern |
|------------|---------|----------------|-----------------|
| `GitCloneError` | `git.clone()` fails | `RepoRegistrationError` | `Failed to clone repository "${url}"` |
| `GitNoDefaultBranchError` | `git.defaultBranch()` — no HEAD | `RepoRegistrationError` | `Failed to detect default branch for "${alias}"` |
| `GitCommandError` | `git.defaultBranch()` — other git error | `RepoRegistrationError` | `Failed to detect default branch for "${alias}"` |
| (non-GitError) | Any port call | Re-thrown as-is | Unexpected errors propagate unchanged |

## RepoEntry construction detail

Due to `exactOptionalPropertyTypes` in tsconfig, optional fields cannot be assigned `undefined`. The entry must be built conditionally:

```typescript
const entry: RepoEntry = {
  url: request.url,
  ...(request.localPath !== undefined ? { localPath: request.localPath } : {}),
  ...(baseBranch !== undefined ? { baseBranch } : {}),
  ...(request.defaultHarness !== undefined ? { defaultHarness: request.defaultHarness } : {}),
};
```

This spread pattern is used throughout the codebase and is the standard way to handle `exactOptionalPropertyTypes`.

## Test design

All tests use in-memory fakes — no file system, no git binary.

### In-memory GitPort fake

```typescript
// Configurable responses for clone() and defaultBranch()
interface FakeGitConfig {
  defaultBranchResult?: string;      // what defaultBranch() returns
  cloneError?: Error;                // if set, clone() throws this
  defaultBranchError?: Error;        // if set, defaultBranch() throws this
}
```

The fake tracks calls (arguments received) so tests can assert on interaction:
- `cloneCalls: CloneRequest[]`
- `defaultBranchCalls: DefaultBranchRequest[]`

### In-memory ConfigStore fake

```typescript
// Wraps a mutable RepoRegistry in memory
// readRepos() returns current state
// writeRepos() replaces state
// readConfig() / writeConfig() return defaults (not exercised by registerRepo)
```

### Test matrix

| # | Test | Key assertions |
|---|------|---------------|
| 1 | URL registration happy path | clone called with correct targetPath, defaultBranch called, entry persisted, result correct |
| 2 | Local path registration | clone NOT called, defaultBranch called with localPath, entry has localPath |
| 3 | Re-registration | no clone, no defaultBranch, no writeRepos, returns existing entry with alreadyRegistered=true |
| 4 | Explicit baseBranch | defaultBranch NOT called, entry.baseBranch equals explicit value |
| 5 | Clone failure | throws RepoRegistrationError, cause is GitCloneError |
| 6 | DefaultBranch failure | throws RepoRegistrationError, cause is GitNoDefaultBranchError |
| 7 | Empty URL | throws InvalidRepoRequestError, no port calls |
| 8 | Relative localPath | throws InvalidRepoRequestError, no port calls |
| 9 | Alias derivation formats | parametric test over URL variants, all produce expected owner/repo |

## Affected files summary

| File | Action | Description |
|------|--------|-------------|
| `src/core/repos/register-repo-errors.ts` | Create | `InvalidRepoRequestError`, `RepoRegistrationError` |
| `src/core/repos/register-repo.ts` | Create | Use case function, request/result/deps types, `deriveAlias` helper |
| `src/core/repos/index.ts` | Modify | Add re-exports for all new public symbols |
| `src/core/repos/__test__/register-repo.test.ts` | Create | 9 unit tests with in-memory fakes |
