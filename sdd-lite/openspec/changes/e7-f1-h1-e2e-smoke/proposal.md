# Proposal

## Routing Digest

- change_name: e7-f1-h1-e2e-smoke
- objective: new-feature (backlog story; runs through execution, does not stop at plan)
- route: continue-lite
- digest_summary: >-
  Backlog story `[E7.F1.H1]` (issue #41), first story of E7. Create the repo's first `e2e/`
  root: a smoke test that provisions a temporary git repository, drives
  register -> review -> history against the FakeEngine, and asserts the artifacts actually
  persisted under an isolated `SENTINEL_HOME`. The `e2e` vitest project already exists and
  matches no files today.
- feasibility_signal: high on the flow and on isolation, medium on engine reachability
- scope_sketch_digest: >-
  New `e2e/` directory + one smoke suite + a hermetic temp-repo fixture. One composition-root
  question (how the FakeEngine is reached) and one toolchain question (e2e/ is invisible to
  biome/tsc/depcruise today) are B-level decisions handed to spec/design, not taken here.

## Summary

- change_name: e7-f1-h1-e2e-smoke
- objective: new-feature
- route: continue-lite
- proposal_status: ready-for-spec (gated by two B-level questions, Q1 and Q2)
- exploration_performed: true

## Problem And Desired Outcome

E0-E6 are merged and each layer is covered by its own suite — 1037 tests across core units,
adapter contract suites, and `src/main` wiring tests. Nothing exercises the layers *together*.
Every seam between them (path resolution, config persistence, worktree lifecycle, run
persistence, exit codes) is verified against a fake on one side, so a break that lives only in
the composition — the wiring graph handing a `clonesDir` that `review` never reads, a run
directory written where `runs list` does not look — passes the entire suite today. The
`vitest.config.ts` `e2e` project has been declared since E0.F2.H2 and still matches zero files.

Desired outcome: one smoke test that walks the real product flow end to end against a
throwaway git repository and a scripted engine, verifying the persisted artifacts, so that
"any piece of the flow breaks" becomes a red CI job rather than a discovery during dogfooding
(#42). Backlog acceptance: runs in CI, and fails if any piece of the flow breaks.

## Exploration Findings

Targeted read of the flow, the isolation seams, and the two orchestrator-flagged risks. All
grounded in code.

| # | Question | Finding |
|---|---|---|
| 1 | What are the concrete commands of "register -> review -> history"? | `sentinel repo add <url> [--local-path <abs>] [--base-branch <b>] [--harness <n>]` (`cli/commands/repo-commands.ts:60`), `sentinel review <repo> <branch> [--type <h>] [--engine <e>] [--timeout <ms>] [--changes-exit-code <n>]` (`review-command.ts:157`), `sentinel runs list <repo>` and `sentinel runs show <repo> <id>` (`runs-commands.ts:28,46`). `repo list` completes the register leg. |
| 2 | What is persisted, and where? | Under `resolveSentinelHome` (`src/main/paths.ts:68`): `<root>/config.yaml` and `<root>/repos.yaml` (ConfigStore), `<root>/clones`, `<root>/worktrees`, and `<root>/runs/<repoName>/<id>/` holding `metadata.json`, `result.md` (raw engine output), `prompt.md`, and `validations/` (`run-store-fs.ts:218-245`; read back at `:415-418`). These are the concrete files the acceptance criterion "verifying persisted artifacts" names. |
| 3 | Can the fixture stay off the network? | Yes. `registerRepo` skips `git.clone` entirely when `localPath` is given (`src/core/repos/register-repo.ts:81-86`); it must be absolute (`:66`). With `--base-branch` supplied, even `git.defaultBranch` is skipped (`:100-104`). So a local `git init` repo in `os.tmpdir()` registered by path needs no remote at all. |
| 4 | Is there a reusable hermetic temp-repo helper? | Not as a shared module. `src/adapters/driven/git/__test__/git-cli.test.ts` has the pattern and it is exactly the right one — `realpathSync(mkdtempSync(join(tmpdir(), ...)))` (`:72`, realpath because macOS `/var` -> `/private/var`), per-invocation `-c user.email=... -c user.name=...` (`:37-41`) so no global identity is needed, `git init --bare -b main` pinning the default branch rather than inheriting `init.defaultBranch`, and a `HERMETIC_GIT_ENV` (`:52-58`) setting `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_SYSTEM=/dev/null`, `GIT_TERMINAL_PROMPT=0`, `LC_ALL=C`, `LANG=C`. All of it is file-local consts, not exported. **risk-e7h1-002 is therefore solved in principle and unsolved in code**: the recipe exists and is proven in CI, but reaching it from `e2e/` means extracting it or restating it. |
| 5 | Is the FakeEngine reachable through the built CLI? | No, confirming risk-e7h1-001. `EngineNameSchema = z.enum(["claude-code", "opencode"])` (`config-schemas.ts:14`) rejects any other name before wiring is reached; `createEngine` (`container.ts:~113`) is a closed switch whose default throws; `createWiringGraph(options)` takes only `env`/`homeDir` (`WiringGraphOptions`) and both surface projections (`createCliDeps`, `createTuiDeps`) build the engine internally, per invocation, inside the `runReview` thunk. There is **no injection seam today**. `createFakeEngine` is a shipped adapter exported from `adapters/driven/engines/index.ts`, and its own doc-comment already says "the future e2e smoke wires it as the real engine". |
| 6 | Which harness is safe for a smoke run? | `harnesses/quick/skills.yaml` is `skills: []`, `contextMode: inline` — no declared validations, so the `ProcessRunner` stage spawns nothing in the temp repo. `harnesses/` ships in `package.json#files` and is found via `resolvePackageRoot()` (`paths.ts:107`), which walks up to the nearest `package.json` — so it resolves from `dist/` and from `src/` alike. |
| 7 | Would a new `e2e/` root be covered by the quality gate? | **No, in all three tools.** `tsconfig.json` is `"include": ["src"]`; `biome.json#files.includes` is an explicit allowlist (`src/**` plus named root files); `npm run check` runs `depcruise src`. `vitest.config.ts` already includes `e2e/**/*.test.ts`, so the tests would *run* but would be neither typechecked nor linted. This is new evidence, not in the orchestrator's risk list. |
| 8 | Is isolation sufficient? | Yes, settled per the envelope: `SENTINEL_HOME` redirects the whole tree (`paths.ts:68`), so a per-test temp home leaves the developer's `~/.sentinel` untouched. |

## Initial Scope Sketch

### Likely In Scope

- A new top-level `e2e/` directory — the repo's first — with the smoke suite for the
  register -> review -> history flow.
- A hermetic temporary-git-repository fixture (seed commit on a pinned default branch, plus a
  feature branch carrying a diff so the review has something to review), following the proven
  `git-cli.test.ts` recipe.
- Per-test `SENTINEL_HOME` isolation and deterministic teardown of both temp roots.
- Assertions on the concrete persisted artifacts: `repos.yaml` after register; the run
  directory with `metadata.json`/`result.md`/`prompt.md` after review; the same run surfacing
  through `runs list` / `runs show`. Plus the review exit code, which is the `[E6.F1.H2]`
  contract the flow terminates on.
- Whatever minimal seam lets the FakeEngine be the engine for the smoke run (Q1 decides its
  shape).
- Bringing `e2e/` into the quality gate: `tsconfig.json`, `biome.json`, and possibly
  `.dependency-cruiser.cjs`/the `check` script (Q2).
- Confirming the suite runs in the existing CI `test` job on the Node 22/24 matrix — no new
  workflow expected, since `npm test` already runs every project.

### Likely Out Of Scope

- Any change to `src/core/**`. This story adds coverage, not behavior.
- Real engine invocation. `claude-code`/`opencode` are never spawned; that is #42 dogfooding.
- The TUI flow end to end. The TUI needs a TTY and is already covered in-process by scripted
  prompter doubles; the smoke targets the scripting surface.
- Exhaustive failure-path matrices (timeout, engine-error, validation-failed permutations).
  Those states are covered by unit and contract suites; the smoke is a happy-path safety net
  plus at most one negative case.
- The other E7 stories: #42 dogfooding, #43 user docs, #44 license, #45 release pipeline.
- Widening `EngineNameSchema` as a *user-facing* feature (a `fake` engine documented for end
  users) — if Q1 lands on option (b), it must be gated and undocumented, not a product surface.

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Flow reachability | Every leg of register -> review -> history is a shipped command, and `--local-path` keeps the whole thing off the network. | High |
| Isolation | `SENTINEL_HOME` + `mkdtemp` is already proven; nothing leaks into the developer's home. | High |
| CI determinism | The hermetic-git recipe is already green on ubuntu-latest across Node 22/24 in CI today. Cost is extraction, not invention. | High |
| Engine reachability | The single genuine unknown: there is no injection seam, and each candidate route trades public-surface cost against how much of the real binary is covered. Q1. | Medium |
| Toolchain | `e2e/` is outside biome/tsc/depcruise scope; small config edits, but they must be deliberate. Q2. | Medium |
| Gate | `main` @ `cbc878b`: `npm run check` clean, `npm test` 1037/1037, build OK. Nothing blocking. | High |

## Open Questions For Spec

Classified per the A/B/C decision protocol. Recommendations given; B items are the user's call.

| # | Level | Item | Why It Matters | Recommendation | Status |
|---|---|---|---|---|---|
| Q1 | **B** | How the smoke run reaches the FakeEngine. (a) a `ReviewEngine` override in `WiringGraphOptions`, used only by the e2e harness; (b) a `fake` member in `EngineNameSchema` gated by an env var; (c) in-process against `createCliDeps` with an injected engine. | This is the story's centre of gravity. Coverage differs sharply: (b) is the only route that exercises the **built `dist/cli.js` as a real subprocess** — argv parsing, commander dispatch, `process.exitCode`, stream flushing — but it puts a fake into the user-facing schema and into `sentinel review --engine` help/validation. (a) preserves the user-facing surface and covers the whole graph, but the harness must construct deps itself, so the entrypoint (`src/main/cli.ts`) and the bundle stay uncovered. (c) covers least: the CLI adapter and below, with the wiring graph partly bypassed. | Lean (a), with the seam typed as optional and documented as test-only, plus a thin separate assertion that `node dist/cli.js --version` still works (CI already does this in `build`). If the user weights "fails if ANY piece breaks" above surface purity, (b) with an env gate is the honest choice — say so explicitly rather than claiming (a) covers the binary. **Design must state, per route, exactly which layers go uncovered.** | open |
| Q2 | **B** | Whether `e2e/` joins the quality gate: `tsconfig.json` `include`, `biome.json` `files.includes`, and whether `check` cruises it (`depcruise src` today). | An unlinted, untypechecked directory rots. But adding `e2e` to `depcruise` means deciding whether the guards apply to a directory that legitimately reaches into both `src/main` and `src/adapters` — under the current rules that is not obviously a violation, but it has never been asked. Repo-structure decisions are B-level by the project protocol. | Add `e2e` to `tsconfig.json#include` and `biome.json#files.includes` (pure win). Leave `depcruise` scoped to `src`: the guards are the *core extraction* guarantee and e2e is not shipped code. Record the exclusion deliberately, do not let it be an accident. | open |
| Q3 | A | Whether the hermetic-git fixture is extracted into a shared helper or restated inside `e2e/`. | Extracting from `src/adapters/driven/git/__test__/` would make an `e2e/` file import from a `__test__` folder under `src` — new and slightly odd; restating duplicates ~25 lines of consts. | Restate it inside `e2e/`, self-contained, with a comment pointing at `git-cli.test.ts` as the origin. E2E fixtures owning their own world is the point. | open |
| Q4 | A | Which harness the smoke uses, and whether declared validations are exercised. | Validations spawn real processes in the temp worktree (E5.F1.H2) — nondeterministic in CI unless the commands are trivially available. | Use `quick` (empty `skills`, no validations). Cover the validations path only if a trivially portable command can be declared; otherwise leave it to the existing E5 suites. | open |
| Q5 | A | Whether the smoke asserts the review exit code, and which verdict the FakeEngine script yields. | Exit codes are the `[E6.F1.H2]` contract, and their computation sits at the very end of the flow — the most composition-dependent behavior there is. | Script an `approve` verdict for the happy path (exit 0), and consider one `request-changes` case pinning the `--changes-exit-code` default of 1. Feasible only if Q1's route reaches the exit-code layer. | open |
| Q6 | A | How many scenarios the smoke holds. | A smoke that grows into a matrix becomes slow and duplicates unit coverage. | One full happy path, plus at most one negative case. Keep it a safety net, not a second test suite. | open |
| Q7 | A | Teardown discipline for the two temp roots (repo fixture and `SENTINEL_HOME`) when an assertion fails mid-flow. | The review flow creates worktrees; a leaked worktree or temp home on a failing CI run is noise, and on a developer machine is litter. | `afterEach` with `rmSync(..., { recursive: true, force: true })` on both roots, unconditionally. Note that `runReview`'s own cleanup stage already removes the worktree on the success path. | open |

## Approval Notes

- Route stays `continue-lite`: new test directory plus at most a small typed seam in the
  composition root and three config-file edits. No core change.
- Q1 is the decision that shapes the story and must be answered before spec freezes acceptance
  criteria — the criterion "fails if any piece of the flow breaks" is only as true as the
  chosen route's coverage. Whichever route wins, the spec should state its blind spot in
  writing rather than let it be implied.
- Q2 touches repo structure and the quality gate, so it is B-level even though the edits are
  three lines.
- No decisions are taken by this stage.
