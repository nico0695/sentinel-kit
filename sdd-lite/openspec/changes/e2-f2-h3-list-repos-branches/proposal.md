# Proposal: [E2.F2.H3] List repos and branches

## Change

Add `listRepos` and `listBranches` use cases to `src/core/repos/`.

## Motivation

Story [E2.F2.H3] from E2 backlog. Depends on registerRepo (E2.F2.H2, merged). The review flow needs to enumerate registered repos and discover available branches (after fetch) for a given repo.

## Scope

- `listRepos`: read the repo registry from ConfigStore, return it.
- `listBranches`: given an alias, validate it exists in registry, resolve repo path, fetch remotes, list branches via GitPort.
- New error types: `RepoNotFoundError` (alias not in registry), `BranchListError` (wraps git failures).
- Unit tests with in-memory fakes following registerRepo pattern.
- Barrel update in `index.ts`.

## Out of scope

- Adapter changes (GitPort and ConfigStore implementations already support all needed operations).
- CLI/TUI commands (future stories).
- Branch filtering logic (BranchRef already tags local/remote; callers filter).

## Acceptance criteria (from issue #15)

- [ ] Branches reflect the remote after fetch.
- [ ] Non-existent repo = clear domain error.

## Decisions

- **A1**: listBranches returns all BranchRef (local + remote). The type tags `kind`, caller filters.
- **A2**: listRepos returns `RepoRegistry` directly — the registry is the domain model.
- **A3**: RepoNotFoundError + BranchListError in `list-branches-errors.ts`.
