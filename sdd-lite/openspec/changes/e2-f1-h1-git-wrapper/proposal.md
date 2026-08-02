# Proposal — e2-f1-h1-git-wrapper

## Backlog identity
- Story: **[E2.F1.H1] Base git wrapper** (GitHub issue [#11](https://github.com/nico0695/sentinel-kit/issues/11))
- Milestone / Epic: **E2 — Repos & git · F1 Git wrapper · required (🔴)**
- Depends on: **E0.F1.H1** (scaffold + `npm run check`) — landed.
- Blocks: E2.F1.H2 (worktrees + merge-base + diff), E2.F2.H2 (register repo), E2.F2.H3 (list repos and branches).

## Problem
The core has one thin driven port so far (`ReviewEngine`) but **zero** implementation of the review-flow border operations against git. Every downstream story (worktrees, diff, register/list repos) hard-depends on being able to clone, fetch, list branches, and detect the remote default branch through a stable, port-shaped contract. Without this base wrapper the E2 milestone cannot start.

## Desired outcome
A **thin, stable `GitPort`** owned by the domain module(s) that need it (`repos` and `workspace` — see PRD §4.3 and `docs/architecture.md` port catalog), plus one driven adapter under `src/adapters/driven/git/` that fulfils the four base operations against a real `git` binary and translates every raw failure into a typed **port error** so nothing raw leaks into the core.

Acceptance the story (issue #11) already spells out:
1. `clone`, `fetch`, `branches`, `default-branch` work against a real repo *and* against a test repo.
2. Stable parsed output.
3. No raw exceptions leaking into the core.

## Initial scope sketch (HARD boundary for H1)

**IN** (this change):
- Declare `GitPort` in the core, in `src/core/repos/ports/git-port.ts` (`repos` is the natural owner — E2.F2.H2 will need it first; `workspace` will *reuse* the same port when H2 lands, see PRD §4.3 "declared by: `repos` / `workspace`"). Types only; core stays I/O-free.
- Public-index re-export via `src/core/repos/index.ts` (`export type { GitPort, … } from …`).
- Adapter in `src/adapters/driven/git/` implementing the four operations via **execa + machine-readable output** (`--porcelain`, `for-each-ref --format`, `symbolic-ref refs/remotes/origin/HEAD` and/or `ls-remote --symref`) — decision 2 in `docs/setup-tecnico-sentinel.md`, PRD §5.1.
- Adapter translates every raw `execa`/`git` failure into a **typed port error** declared beside the port; the core never catches an `ExecaError`.
- Shared **contract suite** for `GitPort` under `src/adapters/driven/git/__test__/` following the `ReviewEngine.contract.ts` pattern (`docs/testing.md`) — harness of scenario factories; run once against the real adapter with a temporary local git repo (bare + working repo, both created in `os.tmpdir()`) as the fixture; **not** against the network.
- No instantiation outside `src/main/` (guard 5).

**OUT** (later stories, do NOT touch here):
- `worktree add/remove/list --porcelain`, `merge-base`, `diff base..target`, `--numstat` → **E2.F1.H2 (#12)**.
- `ConfigStore` schemas + fs/yaml persistence → **E2.F2.H1 (#13)**.
- `registerRepo` use case, managed clones dir layout → **E2.F2.H2 (#14)**.
- `listRepos`, `listBranches` use cases → **E2.F2.H3 (#15)**.
- Real engine adapters, CLI wiring, `runReview` — later epics.

## Alignment with PRD §4 / guards
- Port declared in the domain module that needs it (`repos`) — PRD §4.2 / rule "one port per domain need".
- Core imports zero I/O libs — guard 2 (`core-no-io-libs`); `execa` lives only in the adapter.
- Adapter isolated from other adapters — guard 4; only depends on core port types.
- Only `src/main/` may instantiate the adapter — guard 5. This change does **not** wire it (no use case exists yet); it only guarantees the wiring can happen without a rule violation.
- Cross-module type consumption via public `index.ts` — guard 3.

## Feasibility signal
- **Confidence: high.** The port surface is deliberately narrow (4 operations, all read-shaped except `clone`/`fetch`), all parseable with `git`'s built-in machine-readable flags. Contract-suite pattern is already established by E0.F2.H2. Real-repo fixture is trivial (`git init --bare`, `git init`, a couple of commits). Blast radius is bounded: one new port file + adapter file(s) + one contract file + one test file. `npm run check` and `npm test` gates already exist and are green on `main`.
- **Assumptions to validate in spec/design**:
  - Behavior on network / auth failures during `clone`/`fetch` (translated to `GitCloneError` / `GitFetchError` — no raw execa leak).
  - Behavior when a repo has no remote or no `HEAD` for default-branch detection (declared port error, not a crash).
  - `branches` shape (local, remote, both, per-repo — the story wording says "branches"; the natural need downstream — `listBranches` use case in H3 — is *remote* branches after fetch, but `merge-base` in H2 also needs to resolve local refs).
- **B decisions to raise before design freezes** (see §"Open questions").

## Risks / mitigations
- **R1 — scope creep into H2 (worktrees, diff).** Mitigation: the OUT list above is enforced as-is; per-stage validator B checks no `worktree` / `merge-base` / `diff` code lands.
- **R2 — flaky tests due to network `clone`.** Mitigation: the contract suite operates entirely against local `file://` remotes in `os.tmpdir()` (a bare repo initialised in-test) — zero network I/O in CI. Real-repo assurance from AC-1 is satisfied by treating a locally-initialised git repo as the "real repo" (matches `docs/testing.md` "temporary git repo" phrasing for e2e / adapter fixtures).
- **R3 — leaking `execa` types (`ExecaError`, `Options`) into the core via port typings.** Mitigation: port is written with only primitive/string types + core-owned error classes; guard 2 enforces this at build time.
- **R4 — non-determinism on Windows path separators / line endings.** Mitigation: MVP targets Linux/macOS shells (Node ≥22 on those OSes); adapter uses `--porcelain` (`\n`-separated, machine-stable). Windows is not in MVP scope.

## Open questions (raise as B before design)
- **Q1 — `branches` scope.** Local, remote, or both? Recommendation: return **both**, tagged (e.g. `{ name, kind: 'local' | 'remote', remote?: string }`), so H2 (`merge-base`, needs local refs) and H3 (`listBranches`, needs remote) both use the same port without new methods. Requires `for-each-ref refs/heads refs/remotes` — one shell call.
- **Q2 — default-branch source.** `symbolic-ref refs/remotes/<remote>/HEAD` (post-clone) vs. `ls-remote --symref <url> HEAD` (works without a clone). Recommendation: use `symbolic-ref` (needs the clone; `registerRepo` in H2 will always clone first) and raise a port error if `HEAD` isn't set. `ls-remote` is deferred until a story actually needs pre-clone detection.
- **Q3 — `clone` target directory ownership.** Should the port receive the target absolute path (caller owns layout) or a repo id (adapter picks the layout)? Recommendation: **caller owns the path** — layout is a `registerRepo` concern (H2), not a git-wrapper concern. Keeps the port thin.
- **Q4 — `fetch` remote name.** Fixed `origin` or configurable? Recommendation: configurable, default `origin` (`fetch(repoPath, { remote?: string })`) — one line, keeps the door open for H3 without a follow-up port change.
- **Q5 — error hierarchy shape.** One base `GitError` with a `code` discriminator vs. one class per operation. Recommendation: one base `GitError extends Error` + typed subclasses per failure family (`GitCloneError`, `GitFetchError`, `GitCommandError`, `GitNoDefaultBranchError`) — matches the coding-standards `Error` suffix rule and lets the run flow discriminate later.

These are **B decisions** — the design gate will present alternatives with recommendations for user pick before the design is formalized (per kickoff standing gate).

## Standing gates (from kickoff)
- **Mode**: start `interactive` for the proposal review; if the proposal validates cleanly, switch to `auto` with two blind read-only validators in parallel per stage. Any drift / disagreement → STOP and consult (protocol B / C).
- **Design gate**: any deviation or B-item is validated with the user BEFORE the design is formalized.
- **Executor gate**: always requires explicit user OK, even under `auto` mode.
- **History**: entry S08 lands before the change closes; committed to git.

## Terminology
- "GitPort" (with `Port` suffix): PRD §4.4 allows the suffix because the role name "Git" alone would be ambiguous.
- Adapter folder is `git/`, not `git-cli/` — the folder says "how" (git binary), the port says "what" (source-control operations).
