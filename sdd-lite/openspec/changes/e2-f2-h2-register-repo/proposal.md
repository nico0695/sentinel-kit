# Proposal

## Routing Digest

- change_name: e2-f2-h2-register-repo
- objective: new-feature
- route: continue-lite
- complexity: low-medium
- confidence: high

## Summary

Implement the `registerRepo` use case in `src/core/repos/` -- the product's entry door. The use case accepts two registration paths (by URL with managed clone, or by existing local path) and persists the repo entry in the registry via `ConfigStore`. It consumes the existing `GitPort` (clone, defaultBranch) and `ConfigStore` (readRepos, writeRepos, readConfig) ports with no adapter changes required.

## Problem Statement

There is currently no way to register a repository with sentinel. The `ConfigStore` and `GitPort` ports exist, but no use case wires them together to accept user input (a URL or local path), perform the necessary git operations (clone for URL path, validate for local path), detect the default branch, and persist a `RepoEntry` into `repos.yaml`. All downstream stories (listBranches, runReview, the full TUI flow) depend on repos being registered first.

## Dependencies

- **E2.F1.H1** -- GitPort with clone/fetch/branches/defaultBranch (merged).
- **E2.F2.H1** -- ConfigStore port + YAML adapter (merged, PR #55).
- Both ports are fully exported from `src/core/repos/index.ts`.

## Out of Scope

- CLI/TUI commands that invoke `registerRepo` (E6 interface stories).
- `listRepos` / `listBranches` use cases (E2.F2.H3).
- Delete/update registration (E2.F2.H4, optional).
- Adapter changes -- the existing `GitPort` and `ConfigStore` adapters are sufficient.
- Worktree creation -- that is workspace-domain work consumed by the run flow.

## Proposed Approach

### 1. Use case function signature

```typescript
// src/core/repos/register-repo.ts
export interface RegisterRepoRequest {
  /** Git remote URL (https or ssh). Mutually exclusive with localPath. */
  readonly url?: string;
  /** Absolute path to an existing local git repository. Mutually exclusive with url. */
  readonly localPath?: string;
  /** Override base branch (default: auto-detected via defaultBranch()). */
  readonly baseBranch?: string;
  /** Override default harness. */
  readonly defaultHarness?: string;
}

export interface RegisterRepoResult {
  /** The alias (key) under which the repo was registered. */
  readonly alias: string;
  /** The persisted RepoEntry. */
  readonly entry: RepoEntry;
  /** Whether this was a new registration or a re-registration of an existing alias. */
  readonly alreadyRegistered: boolean;
}

export function registerRepo(
  request: RegisterRepoRequest,
  deps: {
    readonly git: GitPort;
    readonly config: ConfigStore;
    readonly clonesDir: string; // absolute path to the managed clones directory
  },
): Promise<RegisterRepoResult>;
```

**Rationale**: The use case is a thin function (PRD §4.3 -- no ceremony classes). Dependencies are injected as a `deps` object -- the composition root in `src/main/` passes concrete adapters. The `clonesDir` is a pure string (the absolute path to sentinel's managed clones directory), not an I/O concern -- the core never touches the filesystem directly; it passes `clonesDir + alias` as the `targetPath` to `git.clone()`.

### 2. Two registration paths

**Path A -- Register by URL (managed clone)**:
1. Derive `alias` from the URL (see decision B1 below).
2. Read current registry via `config.readRepos()`.
3. If `alias` already exists in registry, return early with `alreadyRegistered: true` and the existing entry (no clone, no overwrite).
4. Compute `targetPath = join(clonesDir, alias)`.
5. Call `git.clone({ url, targetPath })`.
6. Detect `baseBranch` via `git.defaultBranch({ repoPath: targetPath })` (unless caller supplied an explicit override).
7. Build the `RepoEntry`: `{ url, baseBranch }` (plus optional `defaultHarness`).
8. Persist via `config.writeRepos({ ...existingRepos, [alias]: entry })`.
9. Return `{ alias, entry, alreadyRegistered: false }`.

**Path B -- Register by existing local path**:
1. Derive `alias` from the local path (see decision B1 below).
2. Read current registry via `config.readRepos()`.
3. If `alias` already exists, return early with `alreadyRegistered: true`.
4. Detect the remote URL from the git repo (not needed -- the `url` field in RepoEntry is required by the schema). **Schema observation**: `RepoEntrySchema` requires `url: z.string()` as non-optional. For local-path registrations, we need a URL. Two options:
   - **(Recommended)** Require the caller to also supply `url` when registering by local path, or read the `origin` remote URL from the repo via `git`. Since `GitPort` does not expose a "get remote URL" method and adding one is out of scope, the pragmatic approach is: **require `url` always** (both paths), and `localPath` is the optional field that says "don't clone, use this existing repo instead."
   - This aligns with `RepoEntrySchema` where `url` is required and `localPath` is optional.
5. Detect `baseBranch` via `git.defaultBranch({ repoPath: localPath })`.
6. Build the `RepoEntry`: `{ url, localPath, baseBranch }` (plus optional `defaultHarness`).
7. Persist and return.

**Revised signature after schema alignment**:
```typescript
export interface RegisterRepoRequest {
  /** Git remote URL -- always required (maps to RepoEntry.url). */
  readonly url: string;
  /** Absolute path to an existing local repo. When set, no clone is performed. */
  readonly localPath?: string;
  /** Override base branch. Default: auto-detected via git.defaultBranch(). */
  readonly baseBranch?: string;
  /** Override default harness. */
  readonly defaultHarness?: string;
}
```

This simplifies the use case: `url` is always present (matching the schema), `localPath` being set is the branch condition for "clone vs. use existing".

### 3. Alias derivation strategy (decision B1 -- consult)

The alias is the key in the `RepoRegistry` map (`Record<string, RepoEntry>`). It must be stable, human-readable, and collision-resistant.

**Option A -- `owner/repo` from URL (recommended)**:
- Parse the URL to extract `owner/repo`: `github.com/acme/widgets.git` -> `acme/widgets`.
- For local-path registrations, derive from the URL (which is always provided).
- Advantages: human-readable, matches how people think about repos, natural for CLI usage (`sentinel review acme/widgets`), collision-resistant (owner scoping).
- Disadvantages: requires URL parsing; edge cases for self-hosted git (gitlab.corp.com paths).

**Option B -- Repo name only**:
- Extract just the repo name: `github.com/acme/widgets.git` -> `widgets`.
- Simpler but collides across organizations (`acme/widgets` vs `bigco/widgets`).

**Option C -- Slugified full path**:
- Use the entire path: `github-com-acme-widgets`. Too noisy, poor ergonomics.

**Recommendation**: **Option A** (`owner/repo`). URL parsing is straightforward (strip protocol, host, `.git` suffix, take last two path segments). It is the same convention GitHub CLI uses. If two repos share the same `owner/repo` (different hosts), the second registration would be detected as "already registered" -- an acceptable edge case at MVP that a future `--alias` override could solve.

### 4. Managed clones directory (decision B2 -- consult)

The `clonesDir` parameter tells the use case where managed clones go. The core does not decide this -- the composition root provides it as a string.

**Option A -- `<configDir>/clones/` (recommended)**:
- Use the same base directory where `config.yaml` and `repos.yaml` live (the `basePath` from the ConfigStore adapter), with a `clones/` subdirectory.
- Consistent: all sentinel data under one root. The PRD says "clone managed in the tool's directory" (§5.1).
- Layout: `<configDir>/clones/acme/widgets/` (a bare or full clone).

**Option B -- `~/.local/share/sentinel/clones/`** (XDG-style):
- Separates config from data. More correct per XDG spec (config in `~/.config/sentinel/`, data in `~/.local/share/sentinel/`).
- More complex; XDG compliance is not an MVP requirement.

**Recommendation**: **Option A**. The composition root already knows the `basePath` for ConfigStore; passing `join(basePath, "clones")` as `clonesDir` to the use case is trivial and keeps everything together. The core only sees a string -- if the layout changes later, only `src/main/` changes.

### 5. Re-registration detection

When `alias` already exists in the registry (read from `config.readRepos()`), the use case returns immediately with `alreadyRegistered: true` and the existing entry. It does not clone, does not overwrite, does not throw. This is an expected domain outcome, not an error.

Rationale: the user may re-run a setup script or hit the command twice. Idempotent behavior (report + skip) is more user-friendly than throwing. Downstream stories (E2.F2.H4 update/delete) will handle intentional mutation.

### 6. Domain errors

New errors in `src/core/repos/`:

| Error | When | Base class |
|---|---|---|
| `RepoRegistrationError` | Wraps clone or defaultBranch failures during registration | `Error` (module-level, not extending GitError or ConfigError) |
| `InvalidRepoRequestError` | Request validation failures (empty URL, relative localPath) | `Error` |

Both follow the existing pattern: `Error` suffix, live in the `repos` module, carry optional `cause`.

- `RepoRegistrationError` catches `GitCloneError` and `GitNoDefaultBranchError` from port calls and wraps them with a registration-context message. The use case never lets raw git errors escape -- it translates them (PRD §4.6 / coding-standards).
- `InvalidRepoRequestError` is thrown synchronously for request validation (empty URL, non-absolute localPath) before any port call.

### 7. Use case return value (decision A1 -- autonomous)

The use case returns `RegisterRepoResult` (not void). Rationale: callers (TUI, CLI, future daemon) need the alias, the entry, and whether it was a re-registration to render appropriate user feedback. Returning the result avoids forcing callers to re-read the registry.

### 8. Test strategy

All tests live in `src/core/repos/__test__/register-repo.test.ts` (core unit tests with in-memory fakes, per testing.md).

**In-memory fakes needed**:
- `FakeConfigStore`: in-memory implementation of `ConfigStore` (holds `GlobalConfig` and `RepoRegistry` in plain objects). Simple enough to live in the test file or a shared test helper.
- `FakeGitPort`: in-memory implementation of `GitPort` that simulates `clone()` (records the call, succeeds), `defaultBranch()` (returns a configured value), and stubs the other methods. Already partially pattern-established by the GitPort contract tests.

**Test cases**:

1. **URL registration (happy path)**: registers by URL, clone is called with correct targetPath, defaultBranch is detected, entry is persisted with correct alias.
2. **Local path registration (happy path)**: registers with localPath, no clone called, defaultBranch detected from localPath, entry persisted with localPath field.
3. **Re-registration detection**: register the same alias twice, second call returns `alreadyRegistered: true` and the original entry, no clone attempted.
4. **Explicit baseBranch override**: when `baseBranch` is provided, `defaultBranch()` is not called.
5. **Clone failure**: `git.clone()` rejects with `GitCloneError`, use case wraps it in `RepoRegistrationError`.
6. **DefaultBranch failure**: `git.defaultBranch()` rejects with `GitNoDefaultBranchError`, use case wraps it in `RepoRegistrationError`.
7. **Invalid request -- empty URL**: throws `InvalidRepoRequestError` synchronously.
8. **Invalid request -- relative localPath**: throws `InvalidRepoRequestError`.
9. **Alias derivation**: multiple URL formats produce the expected `owner/repo` alias.

**No adapter tests needed** -- no adapter changes in this story.

## Files To Create Or Modify

| File | Action | Description |
|---|---|---|
| `src/core/repos/register-repo.ts` | Create | Use case function + request/result types |
| `src/core/repos/register-repo-errors.ts` | Create | `RepoRegistrationError`, `InvalidRepoRequestError` |
| `src/core/repos/index.ts` | Modify | Re-export use case, types, and errors |
| `src/core/repos/__test__/register-repo.test.ts` | Create | Unit tests with in-memory fakes |

## Open Questions for User Decision

### B1 -- Alias derivation strategy

How to derive the repo alias (the key in `RepoRegistry`) from a URL?

- **Option A (recommended)**: `owner/repo` extracted from URL. Human-readable, collision-resistant, matches GitHub CLI convention. Edge case: different hosts with same owner/repo would collide (solvable later with `--alias` override).
- **Option B**: Repo name only (`widgets`). Simpler but collides across orgs.
- **Option C**: Slugified full path (`github-com-acme-widgets`). Noisy ergonomics.

### B2 -- Managed clones directory convention

Where does the composition root place managed clones?

- **Option A (recommended)**: `<configDir>/clones/` -- same root as config.yaml/repos.yaml. Simple, everything together, the core only sees a `clonesDir` string.
- **Option B**: XDG-style `~/.local/share/sentinel/clones/`. More correct per spec but more complex; not an MVP requirement.

Note: This decision does not touch core code -- only `src/main/` passes the path. But establishing the convention now avoids churn.

## Open Risks

| Risk | Impact | Mitigation |
|---|---|---|
| URL parsing edge cases (self-hosted git, unusual paths) | Incorrect alias derivation | Start with a simple parser covering HTTPS + SSH GitHub/GitLab patterns; document limitation. Future `--alias` override covers the rest. |
| `RepoEntrySchema.url` is non-optional but local-path registrations may not have a remote | Request validation confusion | Require `url` always (aligns with schema). Document that for local repos the user provides the remote URL for identification. |
| Clone directory already exists on disk (orphaned from a previous failed registration) | `git.clone()` fails | Let the GitCloneError propagate wrapped in RepoRegistrationError. A future "repair" or "force" flag can handle this. |
