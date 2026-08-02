# Spec: e2-f2-h2-register-repo

> `registerRepo` use case — the product's entry door for managing repositories.

## Scope boundary

### In scope

- `registerRepo` use case function in `src/core/repos/register-repo.ts`.
- Two domain error classes (`RepoRegistrationError`, `InvalidRepoRequestError`) in `src/core/repos/register-repo-errors.ts`.
- Re-export of all new public symbols from `src/core/repos/index.ts`.
- Unit tests with in-memory fakes in `src/core/repos/__test__/register-repo.test.ts`.

### Out of scope

- CLI/TUI driving adapter for repository registration (E2.F2.H5).
- `listRepos` and `listBranches` use cases (E2.F2.H3, E2.F2.H4).
- Adapter implementations (git-cli, config-store-yaml) — already exist.
- Changes to existing port interfaces (`GitPort`, `ConfigStore`).
- Clone directory creation (composition root responsibility — `main/`).

## Acceptance criteria

### AC-1: URL registration (happy path)

Given a valid repository URL and injected `GitPort` + `ConfigStore` + `clonesDir`, when `registerRepo` is called without `localPath`, then:

1. The alias is derived as `owner/repo` from the URL.
2. `git.clone({ url, targetPath: <clonesDir>/<alias> })` is invoked.
3. `git.defaultBranch({ repoPath: <clonesDir>/<alias> })` is invoked to detect the base branch.
4. A `RepoEntry` is persisted via `config.writeRepos()` keyed by the alias.
5. The returned `RegisterRepoResult` contains `{ alias, entry, alreadyRegistered: false }`.

### AC-2: Local path registration (happy path)

Given a valid repository URL and an absolute `localPath`, when `registerRepo` is called, then:

1. No clone is performed.
2. `git.defaultBranch({ repoPath: localPath })` is called to validate the path is a git repo and detect the base branch.
3. The `RepoEntry` is persisted with `localPath` set.
4. The returned result has `alreadyRegistered: false`.

### AC-3: Re-registration detection

Given a URL whose derived alias already exists in the registry, when `registerRepo` is called, then:

1. No clone, no defaultBranch call, no write.
2. The existing entry is returned with `alreadyRegistered: true`.

### AC-4: Explicit baseBranch override

When `request.baseBranch` is provided, `git.defaultBranch()` is NOT called; the explicit value is used directly.

### AC-5: Error wrapping

- `GitCloneError` during clone is wrapped in `RepoRegistrationError` with the original as `cause`.
- `GitNoDefaultBranchError` / `GitCommandError` during defaultBranch detection is wrapped in `RepoRegistrationError` with the original as `cause`.

### AC-6: Request validation

- Empty or whitespace-only `url` rejects with `InvalidRepoRequestError`.
- Non-absolute `localPath` (does not start with `/`) rejects with `InvalidRepoRequestError`.
- Validation errors are thrown synchronously before any port interaction.

### AC-7: Alias derivation

The alias is derived from the URL by:
1. Stripping any trailing `.git` suffix.
2. Stripping the protocol + host (everything up to and including `://host/`).
3. Taking the last two path segments as `owner/repo`.
4. Works for: `https://github.com/owner/repo`, `https://github.com/owner/repo.git`, `git@github.com:owner/repo.git`, SSH variants.

## Input contract

```typescript
interface RegisterRepoRequest {
  readonly url: string;
  readonly localPath?: string;
  readonly baseBranch?: string;
  readonly defaultHarness?: string;
}
```

- `url`: required, non-empty. The remote repository URL.
- `localPath`: optional. When present, must be an absolute path. Skips cloning.
- `baseBranch`: optional. When present, skips `defaultBranch()` auto-detection.
- `defaultHarness`: optional. Stored verbatim in the `RepoEntry`.

### Dependencies injection

```typescript
interface RegisterRepoDeps {
  readonly git: GitPort;
  readonly config: ConfigStore;
  readonly clonesDir: string;
}
```

- `git`: driven port for clone + defaultBranch operations.
- `config`: driven port for reading/writing the repo registry.
- `clonesDir`: absolute path where managed clones live (provided by composition root).

## Output contract

```typescript
interface RegisterRepoResult {
  readonly alias: string;
  readonly entry: RepoEntry;
  readonly alreadyRegistered: boolean;
}
```

- `alias`: `owner/repo` key used in the registry.
- `entry`: the `RepoEntry` as persisted (or as found, if already registered).
- `alreadyRegistered`: `true` when the alias was already in the registry (early return, no side effects).

## Error contract

### InvalidRepoRequestError

- Thrown when request validation fails (empty URL, non-absolute localPath).
- Extends `Error` directly (not `GitError` or `ConfigError` — this is a use-case-level error).
- Constructor: `(message: string)`.
- `this.name = "InvalidRepoRequestError"`.

### RepoRegistrationError

- Thrown when a port operation fails during registration (clone failure, defaultBranch failure).
- Extends `Error` directly.
- Constructor: `(message: string, options?: { readonly cause?: unknown })`.
- `this.name = "RepoRegistrationError"`.
- Always wraps the original port error as `cause`.

Neither error class extends `GitError` or `ConfigError` — they are use-case-level errors owned by the `repos` module, independent of port error hierarchies.

## Behavioral rules

### B1: Alias derivation algorithm

```
deriveAlias(url: string): string
  1. let s = url.trim()
  2. strip trailing `.git` if present
  3. if s contains `://` → split on `/`, take last two segments
  4. if s contains `:` (SSH) → take the part after `:`, split on `/`, take last two segments
  5. join with `/` → result is `owner/repo`
```

### B2: Registration flow (URL path)

```
1. Validate request (AC-6)
2. Derive alias (B1)
3. Read registry via config.readRepos()
4. If alias exists → return early (AC-3)
5. Clone to clonesDir/alias via git.clone()
6. Detect baseBranch via git.defaultBranch() — skip if request.baseBranch provided (AC-4)
7. Build RepoEntry
8. Write updated registry via config.writeRepos()
9. Return RegisterRepoResult
```

### B3: Registration flow (local path)

```
1. Validate request (AC-6) — including localPath absolute check
2. Derive alias from URL (B1)
3. Read registry via config.readRepos()
4. If alias exists → return early (AC-3)
5. NO clone (localPath provided)
6. Detect baseBranch via git.defaultBranch({ repoPath: localPath }) — skip if request.baseBranch provided (AC-4)
7. Build RepoEntry with localPath set
8. Write updated registry via config.writeRepos()
9. Return RegisterRepoResult
```

### B4: RepoEntry construction

The `RepoEntry` stored in the registry is built conditionally (respecting `exactOptionalPropertyTypes`):

- `url`: always set from `request.url`.
- `localPath`: set only when `request.localPath` is provided.
- `baseBranch`: set from `request.baseBranch` or detected value.
- `defaultHarness`: set only when `request.defaultHarness` is provided.
- Other `RepoEntry` fields (`defaultEngine`, `extraSkills`, `validations`) are NOT set by `registerRepo`.

### B5: Path construction for managed clones

`targetPath = join(clonesDir, alias)` where `alias = "owner/repo"`. This creates a nested `clonesDir/owner/repo` directory structure. The `git.clone()` call creates intermediate directories as needed.

## Test plan

Nine unit tests, all using in-memory fakes for `GitPort` and `ConfigStore`:

| # | Name | Validates |
|---|------|-----------|
| 1 | registers repo via URL (happy path) | AC-1, B2 |
| 2 | registers repo via local path (happy path) | AC-2, B3 |
| 3 | detects re-registration | AC-3 |
| 4 | uses explicit baseBranch, skips defaultBranch | AC-4 |
| 5 | wraps clone failure in RepoRegistrationError | AC-5 |
| 6 | wraps defaultBranch failure in RepoRegistrationError | AC-5 |
| 7 | rejects empty URL with InvalidRepoRequestError | AC-6 |
| 8 | rejects relative localPath with InvalidRepoRequestError | AC-6 |
| 9 | derives alias from multiple URL formats | AC-7, B1 |
