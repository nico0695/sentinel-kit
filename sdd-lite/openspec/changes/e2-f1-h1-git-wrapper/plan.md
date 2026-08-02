# Plan — e2-f1-h1-git-wrapper

Staged execution plan for `[E2.F1.H1] Base git wrapper` (issue #11). Design frozen with dec-001..dec-007. Every stage below has a strict scope, a validation gate, and a rollback signal. The executor gate (S1/S2 combined into "code" for the standing kickoff gate) ALWAYS requires explicit user OK before any code change is committed.

## Preflight — P0 (mechanical, no user gate)

Verifies the environment before touching source. Fails STOP if any check fails.

- `git status` → clean working tree on branch `claude/e2-f1-h1-git-wrapper`.
- `git rev-parse HEAD` prints the current tip; recorded in `state.yaml` post-run.
- `node --version` reports ≥ v22.
- `git --version` reports ≥ 2.28 (for `git init --bare -b <name>`).
- `[ -d node_modules ]` — already installed at kickoff. Otherwise `npm ci` (idempotent).
- `npm run check` and `npm test` — baseline green on the current `main`-derived tip (proves the toolchain works before we change anything).

Note on ambient git identity (dec-008): the executor does NOT rely on `git config user.email` / `user.name` being globally set. The fixture in `git-cli.test.ts` passes them per-invocation as `git -c user.email=sentinel@test.local -c user.name=sentinel-test commit …` so tests are hermetic on any runner (fresh containers, CI, local dev) regardless of ambient config.

Exit criteria: all six green. If any fail, STOP and consult (protocol C).

## Stage S1 — Core port + errors + module public index

**Scope (files touched):**
- `src/core/repos/ports/git-port.ts` — NEW
- `src/core/repos/ports/git-port-errors.ts` — NEW
- `src/core/repos/index.ts` — EDIT (replace placeholder body)

**Actions in order:**
1. Create `src/core/repos/ports/` folder implicitly by writing the two port files (design §2.1, §2.2).
2. Replace the placeholder body in `src/core/repos/index.ts` with the re-exports listed in design §2.3.
3. **Do NOT** add any `execa` import, any `node:*` import, or any adapter import to the core.

**Validation gate (executed at the end of S1 before commit):**
- `npx tsc --noEmit` → 0 errors. (Compile-only; the port has no runtime yet.)
- `npx biome check src/core/repos` → clean.
- `npx depcruise src` → 0 violations. Guard 2 (`core-no-io-libs`) is the critical one — if it fires on the port file the design is wrong.
- Grep gate (POSIX extended-regex, portable across GNU/BSD grep): `grep -REn 'execa|node:|from "fs"' src/core/repos` → no hits (belt-and-braces; the depcruise pass is authoritative).

**Commit:**
- Conventional: `feat(repos): declare GitPort + typed error family (E2.F1.H1)`.
- Includes the sdd-lite state.yaml bump (`current_stage: sddl-executor`, `stage_progress: S1 committed`).

**Rollback:**
- `git reset --hard <parent>` — cheap, no external side-effect. Nothing under `node_modules` changed.

## Stage S2 — Adapter + tests + runtime dep

**Scope (files touched):**
- `package.json` — EDIT (add `"execa": "^9.6.0"` to a new `"dependencies"` object)
- `package-lock.json` — REGEN via `npm install execa@^9.6.0`
- `src/adapters/driven/git/git-cli.ts` — NEW (design §3.1)
- `src/adapters/driven/git/index.ts` — EDIT (design §3.2)
- `src/adapters/driven/git/__test__/GitPort.contract.ts` — NEW (design §4.1)
- `src/adapters/driven/git/__test__/git-cli.test.ts` — NEW (design §4.2)

**Actions in order:**
1. `npm install execa@^9.6.0 --save` (writes to `dependencies`; regenerates lockfile).
2. Write `git-cli.ts` verbatim from design §3.1. Confirm every relative import ends with `.js`.
3. Overwrite `src/adapters/driven/git/index.ts` per design §3.2.
4. Write the contract suite `GitPort.contract.ts` per design §4.1. Imports MUST be only `vitest` + `../../../../core/repos/index.js` (relative from `src/adapters/driven/git/__test__/`).
5. Write the harness `git-cli.test.ts` per design §4.2 (including the `upstream` bare + remote setup from dec-007 and the `fs.mkdirSync` fix).
6. Do NOT touch any file outside the scope list above. Do NOT wire the adapter in `src/main/`.

**Validation gate (executed at the end of S2 before commit):**
- `npm run check` → exit 0. Specifically:
  - biome check all files clean.
  - `tsc --noEmit` clean under strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`.
  - `depcruise src` reports 0 violations. Guards 1, 2, 4, 5 must NOT fire (guard 3 is trivially green — one core module).
- `npm test` → exit 0. Vitest runs 3 projects: `core` (still empty), `adapters` (grew by ~10 GitCliAdapter tests + still runs the 4 pre-existing FakeEngine tests), `e2e` (still empty). Report: no failing, no skipped, ≥14 passed.
- Fresh diff-scope sanity: `git status --short` shows ONLY the files in the scope list plus sdd-lite artifacts. No stray files.

**Commit (single commit for the stage):**
- Conventional: `feat(git): git CLI adapter + shared GitPort contract suite (E2.F1.H1)`.
- Includes: adapter, contract suite, harness test, package.json/lock changes for `execa`, sdd-lite state.yaml bump.

**Rollback:**
- `git reset --hard <parent-of-S2>` + `npm ci` (restores `execa` off/on precisely from the lockfile). No worktree state left behind.

## Executor gate — HUMAN APPROVAL (kickoff standing gate)

Between P0 and S1, and again between S1's validation gate and its commit, the executor pauses for explicit user OK. Even under `auto` mode. Recognised phrases per orchestrator: `ok`, `dale`, `sigue`, `proceed`, `go`. Feedback (anything else) is folded in before proceeding.

Because S1 is a pure types-only change (port + errors + index, ~120 LoC of code, zero runtime), the sensible practical unit for the user gate is ONCE at the start of the executor phase (approving S1+S2 as a bundle) — the user can still see each commit as it lands. If the user wants finer-grained approval (S1, then S2 separately), the executor honours that.

## Post-executor validation — S3 (mechanical)

Between the executor and the 4R code review. No new files; sanity checks only.

- Full `git diff origin/main..HEAD` scoped to the files in AC-12 — anything outside the perimeter fails STOP.
- Prove test hermeticity from a clean working tree: `git clean -fdx -e node_modules` on the committed state (untracked/generated files are removed; the tracked commit content is unchanged; `node_modules` is preserved to skip a needless reinstall). Then re-run `npm run check` and `npm test`. Do NOT use `git stash -u` here — by S3 the changes are already committed, so stash would capture nothing and the "retry" would be a no-op.
- `depcruise --output-type err src` produces zero violations.
- Executor diff digest — recorded in state.yaml `review_summary.immutable_reference` for the 4R stage. Preferred command (Linux runner, this env): `git diff <parent>..HEAD | sha256sum | awk '{print $1}'`. macOS-portable alternative: `git diff <parent>..HEAD | shasum -a 256 | awk '{print $1}'`. Either produces the same 64-char hex.

## 4R code review — S4

Runs `sddl-code-review` protocol on the frozen S2 diff. Kickoff directive replaces the per-stage validator pair with the 4R adversarial protocol for the code stage:
- Risk triage: **standard tier** (one new adapter + one new core port + tests, no cross-cutting change). Elevate to two lenses if the triage finds any HIGH signal.
- Lenses to run in parallel: `reliability` (error translation + edge cases) and `readability` (naming, doc-comments, style).
- Any BLOCKER / CRITICAL finding → STOP, fix, re-review the *same* frozen diff.
- WARNING / SUGGESTION findings → merged into `review-ledger.md`; the executor decides whether to address in this change or defer to a follow-up story (declared explicitly).

Exit criteria: verdict `pass` (0 blocker, 0 critical).

## QA final — S5

Runs `sddl-qa-review` in `mode: final`. Only this stage can mark the change `completed`. It re-runs `npm run check` and `npm test` INDEPENDENTLY (not trusting S3), verifies AC-1..AC-14 against the shipped code, and confirms:
- Diff perimeter matches AC-12 exactly.
- `src/core/run/*` untouched (frozen H1 port intact).
- English-only across the change.
- No sdd-lite artifact contradicts the shipped code.

Exit criteria: verdict `pass`. Any FAIL → back to executor (with explicit consult).

## Close — S6

- History entry `history/entries/2026-08-02-S08-e2-f1-h1-git-wrapper.md` per `history/TEMPLATE.md`, committed to git (remote env is ephemeral).
- Update `history/INDEX.md`.
- Push branch `claude/e2-f1-h1-git-wrapper -u origin`.
- Open PR: title `[E2.F1.H1] Base git wrapper`, body `Closes #11` + summary of what/why + test plan (`npm run check` and `npm test` green locally + description of the fixture strategy).
- NEVER merge; the human reviews and merges.

## Dependencies between stages

```
P0 (preflight)
  └── S1 (core: port + errors + index)
         └── S2 (adapter + tests + execa dep)
                └── S3 (post-executor mechanical checks)
                       └── S4 (4R code review)
                              └── S5 (QA final)
                                     └── S6 (history + PR)
```

Every arrow is a hard barrier; no stage may run until its predecessor's exit criteria are met.

## Risks bubbled up from design

- **R-D1..R-D5** carry over from `design.md` §7.
- **R-P1 — `npm install execa` fails behind the agent proxy.** Mitigation: proxy is pre-configured in this environment; if a 4xx surfaces, follow `/root/.ccr/README.md` (per env docs) and do NOT disable TLS verification. If unrecoverable, STOP and consult.
- **R-P2 — Contract-suite flakiness on temp dirs.** Mitigation: each test uses `mkdtempSync` + hermetic teardown; no shared `os.tmpdir()` collisions possible.
- **R-P3 — biome complains about the `wrapAs` generic constraint width.** Mitigation: if biome flags the `T extends new (...) => Error` shape, tighten to the exact constructor union — deferred to a bounded local fix at code time, no design change.

## Standing gates recap

- Executor code stage: EXPLICIT user OK before committing (kickoff gate).
- Any drift found by the 4R review that is CRITICAL/BLOCKER: STOP → fix → re-review same diff.
- Any B-item that surfaces at code time (unlikely given the design is frozen): STOP → consult with alternatives + recommendation before writing the code.
