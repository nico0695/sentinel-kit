# Spec: [E2.F2.H3] List repos and branches

## Use case: listRepos

### Signature

```typescript
listRepos(deps: ListReposDeps): Promise<ListReposResult>
```

### Types

- `ListReposDeps`: `{ readonly config: ConfigStore }`
- `ListReposResult`: `{ readonly repos: RepoRegistry }`

### Behavior

1. Read registry via `deps.config.readRepos()`.
2. Return `{ repos }`.

### Errors

None specific — ConfigStore errors propagate as-is (ConfigReadError, ConfigValidationError).

---

## Use case: listBranches

### Signature

```typescript
listBranches(request: ListBranchesRequest, deps: ListBranchesDeps): Promise<ListBranchesResult>
```

### Types

- `ListBranchesRequest`: `{ readonly alias: string }`
- `ListBranchesDeps`: `{ readonly git: GitPort, readonly config: ConfigStore, readonly clonesDir: string }`
- `ListBranchesResult`: `{ readonly alias: string, readonly branches: readonly BranchRef[] }`

### Behavior

1. Read registry via `deps.config.readRepos()`.
2. Look up `request.alias` — if not found, throw `RepoNotFoundError`.
3. Resolve `repoPath`: `entry.localPath ?? clonesDir/alias`.
4. Fetch remotes: `deps.git.fetch({ repoPath })`.
5. List branches: `deps.git.branches(repoPath)`.
6. Return `{ alias, branches }`.

### Errors

- `RepoNotFoundError`: alias not found in registry. No cause.
- `BranchListError`: wraps `GitError` from fetch or branches. Has `cause`.

### Error translation table

| Source | Port error | Domain error |
|---|---|---|
| `git.fetch()` | `GitFetchError` | `BranchListError` with cause |
| `git.branches()` | `GitCommandError` | `BranchListError` with cause |

---

## Acceptance verification

| AC | Verified by |
|---|---|
| Branches reflect remote after fetch | Test: fetch is called before branches; branches returns post-fetch data |
| Non-existent repo = clear domain error | Test: unknown alias throws RepoNotFoundError |
