# Review Ledger — e2-f1-h1-git-wrapper

## Protocol
`sddl-code-review` (4R) — standard tier, two lenses in parallel: `reliability` + `readability`. Re-review triggered by CRITICAL findings on the first pass; both lenses re-run on the fix commit (dec-009).

## Target — Pass 1 (initial S2 diff)
- Immutable reference: parent `ca0faef` → head `902cbfe`
- Diff sha256: `79704c8014dc858cfb7d48b74a91b2471ba3090c640c0c2acea068070a03ed98`
- Scope: full file list in AC-12.

### Findings — pass 1

| # | Lens | Class | File / line | Issue | Disposition |
|---|---|---|---|---|---|
| 1 | reliability | **CRITICAL** | `git-cli.ts:150-157` | `isHeadUnsetSignal` matches English `is not a symbolic ref` against inherited locale; under non-English locale (fr_FR, de_DE, es_ES) an expected `GitNoDefaultBranchError` downgrades silently to `GitCommandError`. | **fixed** — dec-009: `EXECA_BASE` pins `LC_ALL=C`, `LANG=C`, `GIT_TERMINAL_PROMPT=0` on every adapter spawn. |
| 2 | reliability | WARNING | `git-cli.test.ts` (fixture-wide) | Only `user.email`/`user.name` were pinned; runner with `commit.gpgsign=true` / `core.hooksPath` / `commit.template` / `init.templateDir` would fail `commit --allow-empty`. No `GIT_TERMINAL_PROMPT=0` either. | **fixed** — dec-009: all fixture spawns route through `git(args)` wrapper with `HERMETIC_GIT_ENV` (`GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_SYSTEM=/dev/null`, `GIT_TERMINAL_PROMPT=0`, `LC_ALL=C`, `LANG=C`). |
| 3 | reliability | WARNING | `git-cli.test.ts:addCommitToBare` | Temp dir leaked if any of the four intervening `execa` calls threw. | **fixed** — dec-009: wrapped in `try { … } finally { rmSync(throwaway, …) }`. |
| 4 | reliability | SUGGESTION | `git-cli.ts:141` | Redundant `as InstanceType<T>` cast on `wrapAs`. | **fixed** — dec-009: dropped the cast; constructor bound alone carries the return type. |
| 5 | reliability | INFO ×4 | `git-cli.ts:parseBranches`, `defaultBranch`, `wrapAs`, `--quiet` | Positive coverage confirmations (nested refnames, remote prefix stripping, `mkdtemp` atomicity, `--quiet` preserves `fatal:`). | **no action** — informational. |
| 6 | readability | **CRITICAL** | `git-port.ts:11,17,38` | `/** clone/fetch/defaultBranch(...) */` docstrings hung off the *Request* interfaces, not off the `GitPort` methods; reader hovering `git.clone(...)` gets no doc. | **fixed** — dec-009: docstrings moved onto the four `GitPort` methods, matching `review-engine.ts` style (WHY, not signature echo). Request types kept short. |
| 7 | readability | **CRITICAL** | `git-port-errors.ts:10-13` | Header instructed adapters to build `cause` conditionally, but the base constructor already gates on `"cause" in options` — future adapter writers would add dead defensive code. | **fixed** — dec-009: header rewritten to describe what the class actually does; adapters may pass `{ cause }` unconditionally. |
| 8 | readability | WARNING | `git-port-errors.ts:19,30,37,44` | Missing per-class docstrings on `GitError`, `GitCloneError`, `GitFetchError`, `GitCommandError`. | **fixed** — dec-009: every class now documented; `GitCommandError` explicitly labelled the catch-all. |
| 9 | readability | SUGGESTION | `git-cli.ts:141,146` | `Ctor` abbreviation in the `wrapAs` generic. | **fixed** — dec-009: renamed to `ErrorClass`. |
| 10 | readability | SUGGESTION | `git-cli.ts:143-145` | `wrapAs` inline duplicate of `{ readonly cause?: unknown }` where the core already exports `GitErrorOptions`. | **fixed** — dec-009: `wrapAs` now imports and reuses `GitErrorOptions`. |
| 11 | readability | SUGGESTION | `git-port.ts:11,17,38` | Request-type docstrings echoed the signature (WHAT vs WHY). | **fixed** as a side effect of finding #6 — port methods now state purpose + rejection contract. |
| 12 | readability | INFO | `GitPort.contract.ts:130` | `expect(sha).toMatch(/^[0-9a-f]{40}$/)` inside "picks up a new commit" test asserts fixture return shape rather than fetch behavior. | **kept** — the SHA assertion is a cheap sanity check on the fixture helper; the primary assertion right above it (`refs.some(... origin/main …)`) still owns the test's stated behavior. Not worth deleting. |

Result — pass 1: verdict `re-review-required` (3 CRITICAL). Applied all fixes as A-level under dec-009.

## Target — Pass 2 (re-review of the fixed diff)
- Immutable reference: parent `ca0faef` → head `5261a02` (fix commit) plus one comment-only follow-up (`isHeadUnsetSignal` docstring: `EXECA_ENV` → `EXECA_BASE`).
- Diff sha256 (pre-comment-fix): `565c23e5adf67a3df959994ee3640e80118b29821ed321157e0f481196f098c6`
- Every prior CRITICAL / WARNING / SUGGESTION verified fixed.

### Findings — pass 2

| # | Lens | Class | File / line | Issue | Disposition |
|---|---|---|---|---|---|
| 13 | reliability | INFO | `git-cli.test.ts:33` | `HERMETIC_GIT_ENV` does not scrub `GIT_CONFIG_COUNT` / `GIT_CONFIG_PARAMETERS` / `GIT_DIR`. | **kept** — not observed on any known runner; deferrable to a hardening story if a real runner ever surfaces the issue. |
| 14 | reliability | INFO | `git-cli.ts:37` | `EXECA_BASE` is `as const` but its `env` sub-object is not frozen at runtime. | **kept** — nothing in-tree mutates it; `Object.freeze` would be defensive-programming noise. |
| 15 | readability | WARNING | `git-cli.ts:183` | `isHeadUnsetSignal` docstring referenced `EXECA_ENV` (old identifier) instead of `EXECA_BASE`. | **fixed** — comment-only 1-word rename applied inline; no re-review needed. |

Result — pass 2: verdict `pass` (0 blocker / 0 critical / 0 warning surviving / 0 suggestion / 2 info kept as observations).

## Final verdict
`pass` — all CRITICAL findings resolved; no BLOCKER at any point. Deferred INFO items are documented above; nothing surviving is severe enough to gate the change.

## Follow-ups (not in this change)
- **INFO #13** could motivate scrubbing more `GIT_*` env vars in the fixture if a CI runner ever surfaces the issue. Track in a hardening story, not H1.
