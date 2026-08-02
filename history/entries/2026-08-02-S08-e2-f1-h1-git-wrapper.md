# S08 — Story [E2.F1.H1]: Base git wrapper (GitPort + git-cli adapter)

- **Date**: 2026-08-02
- **Branch**: `claude/e2-f1-h1-git-wrapper`
- **Scope**: [E2.F1.H1] Base git wrapper (issue #11) — first story of milestone E2 (Repos & git). E1 (engine spike) formally deferred (no auth for real engine CLIs in this environment).
- **sdd-lite changes**: [`e2-f1-h1-git-wrapper`](../../sdd-lite/openspec/changes/e2-f1-h1-git-wrapper/) — proposal / spec / design / plan / review-ledger / qa-report / state (`completed`).

## Objective

Ship the thin `GitPort` driven port + one adapter over the `git` binary covering the four base operations (`clone`, `fetch`, `branches`, `defaultBranch`), plus the shared `GitPort` contract suite reusable by future adapters. This unblocks E2 (worktrees, register repo, list branches). Strictly out of scope for this story: worktrees, `merge-base`, `diff`, `ConfigStore`, `registerRepo`, `listRepos`, `listBranches`.

## Decisions

| ID | Decision | Alternatives considered | Why | Authorship |
|----|----------|-------------------------|-----|------------|
| S08-D1 (dec-001) | Own the `GitPort` in `src/core/repos` (public-index re-export). | Also declare it in `src/core/workspace` per PRD §4.3 wording. | `repos` is the first consumer (E2.F2.H2 `registerRepo`); `workspace` (E2.F3.H1) will consume the same public type via the repos index. Single ownership, no phantom re-export. | claude |
| S08-D2 (dec-002, Q1) | `branches()` returns BOTH local + remote refs in one tagged shape `{ name, kind, remote? }`. | Only remote (post-fetch); only local. | One call to `for-each-ref refs/heads refs/remotes`; H2 (`merge-base` needs local) and H3 (`listBranches` needs remote) share the port without new methods. | claude→user |
| S08-D3 (dec-003, Q2) | `defaultBranch()` via `git symbolic-ref --short refs/remotes/<remote>/HEAD` on a cloned repo. HEAD-unset → `GitNoDefaultBranchError`. | `ls-remote --symref` (pre-clone, no clone required). | Deterministic, no network, no credentials; `registerRepo` (H2) always clones first, so post-clone detection covers every MVP consumer. | claude→user |
| S08-D4 (dec-004, Q3) | `clone()` receives an ABSOLUTE `targetPath`; adapter refuses a relative path with `GitCloneError` before spawning. | Adapter picks the layout from a repo-id. | Layout is a `registerRepo` (H2) concern; the port stays thin. | claude→user |
| S08-D5 (dec-005, Q4) | `fetch({ repoPath, options? })` — options is optional; `options.remote` defaults to `origin`. | Fixed `origin` only. | One-line surface today; H3 gets a configurable remote without a contract change. exactOptionalPropertyTypes-safe (options built conditionally). | claude→user |
| S08-D6 (dec-006, Q5) | Base `GitError extends Error` + typed subclasses `GitCloneError`, `GitFetchError`, `GitCommandError`, `GitNoDefaultBranchError`. | Base `GitError` with a `code` discriminator; single base only. | Matches `*Error`-suffix rule in `docs/coding-standards.md`; `instanceof` discrimination is exhaustive under strict TS; mirrors the `ReviewEngine` typed narrow-contract style. | claude→user |
| S08-D7 (dec-007) | Fixture gains a SECOND bare repo (`upstream.git` `-b trunk`, different from `main`); working clone adds `upstream` as a remote and fetches it so `refs/remotes/upstream/HEAD` populates locally. Contract test asserts `defaultBranch({ remote: 'upstream' }) === 'trunk'`. | Assert the `remote` parameter with `origin`-only fixtures. | Fix for the drift Validator A raised on the design: a same-name default would let AC-4 sentence 2 pass by coincidence (adapter could ignore `remote` and return `main` unconditionally). | claude |
| S08-D8 (dec-008) | Fixture `git commit` calls carry per-invocation identity (`-c user.email=... -c user.name=...`); non-repo dir created via `node:fs.mkdirSync`; S3 hermeticity retry uses `git clean -fdx -e node_modules` (not `git stash -u`); grep uses POSIX extended-regex; diff digest documents `sha256sum` + `shasum -a 256`. | Rely on ambient git identity; `git stash -u`; GNU-only `grep \|` / Linux-only `sha256sum`. | Fix for the three drifts Validator B raised on the plan: bare containers / CI runners without global identity would fail the fixture cold; `stash -u` on a committed state is a silent no-op; MVP includes macOS. | claude |
| S08-D9 (dec-009) | Adapter pins `LC_ALL=C` / `LANG=C` / `GIT_TERMINAL_PROMPT=0` on every `execa` call. Fixture `git()` wrapper pins the same + `GIT_CONFIG_GLOBAL=/dev/null` + `GIT_CONFIG_SYSTEM=/dev/null`. Port docstrings moved onto `GitPort` methods (not Request types). `git-port-errors.ts` header rewritten to be factual; every class documented. `wrapAs` renamed generic to `ErrorClass`, drops redundant cast, reuses exported `GitErrorOptions`. `addCommitToBare` wraps its four spawns in `try { … } finally { rmSync(throwaway, …) }`. | Ship the original code and rely on the environment. | Fix for the 4R review's 3 CRITICAL + 3 WARNING + 3 SUGGESTION findings on the initial S2 diff — non-English locales would misclassify `GitNoDefaultBranchError` as `GitCommandError`; ambient `~/.gitconfig` (gpg-sign, hooks) would break the fixture on other runners; docstrings misplacement made the primary port effectively undocumented at the point of use. | claude |

## Deviations

- **E1 (engine spike) deferred**: per kickoff directive. E1 needs the real Claude Code / OpenCode CLIs with authentication, not available in this remote environment. Not a scope change — the milestone stays open, moved to a later session. State captured in the session kickoff transcript; not touched by this change.
- **Two mid-stage A-level fixes to design and plan** (dec-007, dec-008): both were caught by the paired blind validators (A + B) before the design/plan froze, not after. Design and plan updated in-place under the same commit stream; no post-hoc drift.
- **4R review triggered STOP → fix → re-review** (dec-009): first pass surfaced 3 CRITICAL findings; the plan explicitly commits to re-reviewing the same frozen diff after a fix. The re-review confirmed 0 CRITICAL / 0 WARNING surviving.
- **One post-review fixture fix** (`feat-shared` local tracking branch, in-commit under S2) and **one biome auto-fix** (import ordering, in-commit under S2): both A-level fixture / cosmetic; recorded in `state.yaml.executor_run.s2_fixup`. No shape change to the port or adapter.

## Work done

- `76fd62a` chore(sdd-lite): open change e2-f1-h1-git-wrapper — proposal + kickoff state.
- `ca0faef` chore(sdd-lite): e2-f1-h1 spec + design + plan validated → HALT at executor gate. (Paired validators A + B on each of spec/design/plan: 4 no-drift + 2 drift resolved.)
- `10b0be1` feat(repos): declare GitPort + typed error family (E2.F1.H1). S1 gates green (biome + tsc + depcruise 0/20 modules; grep clean; 4/4 pre-existing tests).
- `902cbfe` feat(git): GitPort adapter over the git binary + shared contract suite (E2.F1.H1). S2 gates green (23/14; 17/17 tests). Adds `execa ^9.6.1` to `dependencies`.
- `5261a02` fix(git): pin locale + neutralise ambient git config in adapter and fixture (E2.F1.H1). dec-009 — 3 CRITICAL + 3 WARNING + 3 SUGGESTION from the first 4R pass all addressed.
- `59778e2` chore(sdd-lite): e2-f1-h1 4R review pass (3 critical fixed, verdict pass) → final QA. Ledger + docstring typo fix.
- `644e064` chore(sdd-lite): e2-f1-h1 final QA pass — change completed. QA re-ran both gates independently; verdict `pass`.
- This entry.
- Artifacts: `sdd-lite/openspec/changes/e2-f1-h1-git-wrapper/{proposal,spec,design,plan,review-ledger,qa-report,state}.md`.
- Validations run: 4 paired blind validators on spec/design/plan (2 rounds of A + B), 4R code review (2 lenses × 2 passes on frozen diffs), QA final (independent gate re-run).
- Repo runtime deps introduced: **execa ^9.6.1** (first entry in `dependencies`; core still imports zero I/O libs).

## Pending and next steps

- **This session**: push `claude/e2-f1-h1-git-wrapper`, open PR titled `[E2.F1.H1] Base git wrapper` with `Closes #11`. Never merge (workflow contract rule 5). Human reviews and merges.
- **Next story on E2.F1**: E2.F1.H2 (issue #12) — worktrees, `merge-base`, and `diff`. Depends on this change being merged (uses the same `GitPort` public shape).
- **Deferred backlog item follow-up (INFO #13 from 4R re-review)**: the fixture's `HERMETIC_GIT_ENV` does not scrub `GIT_CONFIG_COUNT` / `GIT_CONFIG_PARAMETERS` / `GIT_DIR`. Not observed on any known runner; noted in `review-ledger.md` for a future hardening story if a real runner ever surfaces the issue. Not blocking.

## Open questions for the user

—
