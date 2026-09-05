# Spec

## Routing Digest

- change_name: e7-f1-h1-e2e-smoke
- objective: new-feature (backlog story; runs through execution)
- route: continue-lite
- digest_summary: >-
  Story `[E7.F1.H1]` (#41). Create the repo's first `e2e/` root: one smoke suite that drives
  register -> review -> history in-process over a hermetic temporary git repository and the
  shipped FakeEngine, asserting the persisted artifacts under an isolated `SENTINEL_HOME` and
  the review exit code. Requires one optional, test-only `ReviewEngine` seam in the
  composition root (d-003) and two quality-gate config edits (d-004).
- scope_digest: >-
  New `e2e/` directory (smoke suite + self-contained hermetic git fixture); optional
  `ReviewEngine` override on `WiringGraphOptions`/`CliDepsOptions`; `e2e` added to
  `tsconfig.json#include` and `biome.json#files.includes`. No `src/core/**` change, no
  user-facing surface change, no CI workflow change.
- acceptance_digest: >-
  AC-1..AC-12 below. The story's two checkboxes map to AC-10 ("runs in CI") and AC-11
  ("fails if any piece breaks", demonstrated by mutation), bounded by the non-goals in N-1.

## Summary

- change_name: e7-f1-h1-e2e-smoke
- objective: new-feature
- route: continue-lite
- spec_status: ready-for-design (Q1/Q2 settled by d-003/d-004; no open B-level question)

## Scope Boundary

### In Scope

- A new top-level `e2e/` directory holding one smoke suite, matched by the already-declared
  `e2e` vitest project (`vitest.config.ts`, `e2e/**/*.test.ts`, zero files today).
- A hermetic temporary-git-repository fixture restated inside `e2e/` (Q3, A-level): seed commit
  on a pinned default branch plus a feature branch carrying a diff. Origin comment must point
  at `src/adapters/driven/git/__test__/git-cli.test.ts`, whose recipe it reproduces
  (`realpathSync(mkdtempSync(...))`, per-invocation `-c user.email`/`-c user.name`,
  `git init -b main`, `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_SYSTEM=/dev/null`,
  `GIT_TERMINAL_PROMPT=0`, `LC_ALL=C`, `LANG=C`).
- Per-test isolated `SENTINEL_HOME` (`src/main/paths.ts:68`) and unconditional teardown of both
  temp roots (Q7).
- An **optional** `ReviewEngine` override on `WiringGraphOptions` — and, since `createCliDeps`
  forwards its options into the graph, on `CliDepsOptions` — typed optional and documented
  test-only (d-003). Omitting it must leave `createEngine`'s behavior byte-for-byte unchanged.
- `e2e` added to `tsconfig.json#include` and `biome.json#files.includes` (d-004).
- Assertions on the concrete persisted artifacts and on the review exit code.

### Out Of Scope

- Any change to `src/core/**`; any change to `EngineNameSchema`, `sentinel review --engine`
  help/validation, `config.yaml#defaultEngine`, or persisted run metadata shape.
- Real engine invocation (`claude-code`/`opencode` are never spawned) — that is #42.
- The TUI flow end to end; a CI workflow edit; a `depcruise` scope change.
- The other E7 stories: #42, #43, #44, #45.

### Non-Goals

- **N-1 (mandatory, explicit).** The smoke does **not** cover `src/main/cli.ts` (argv dispatch,
  `process.exitCode` assignment) nor the built `dist/cli.js` bundle. Route (a) drives the flow
  in-process through `createCli(createCliDeps({...})).run(argv)`, so the entrypoint and the
  bundle stay outside its blast radius. CI's existing `build` job runs
  `node dist/cli.js --version`, which is a **partial offset, not an equivalent one**: it proves
  the bundle boots and prints a version, and proves nothing about dispatch, subcommands,
  exit codes or stream flushing through the real binary. The story's criterion "fails if any
  piece of the flow breaks" is therefore **bounded at the composition-root boundary**: it holds
  for everything from `createCliDeps` inward (wiring graph, adapters, use cases, persistence,
  exit-code resolution) and does not hold above it.
- **N-2.** `e2e/` is deliberately excluded from `depcruise` (`npm run check` keeps running
  `depcruise src`). The architecture guards are the core-extraction guarantee; `e2e/` is not
  shipped (`package.json#files` is dist/harnesses/skills) and legitimately reaches into
  `src/main` and `src/adapters` at once. This is an intentional exclusion, not an oversight —
  do not "fix" it.
- **N-3.** Not an exhaustive failure matrix (timeout / engine-error / validation-failed
  permutations stay with the E4/E5 suites). One happy path plus at most one negative case (Q6).
- **N-4.** Declared-validations execution is not required (Q4): the smoke uses the `quick`
  harness (`skills: []`), so the `ProcessRunner` stage spawns nothing. Cover it only if a
  trivially portable command exists; otherwise leave it to E5's suites.

## Expected Behavior

| Scenario | Expected Outcome | Evidence Or Notes |
|---|---|---|
| S1 register | `repo add <name> --local-path <abs tmp repo> --base-branch main --harness quick` succeeds offline; `<SENTINEL_HOME>/repos.yaml` holds the entry and `repo list` prints it | `registerRepo` skips `git.clone` with `localPath` and skips `git.defaultBranch` with an explicit base (`src/core/repos/register-repo.ts:81-86,100-104`) |
| S2 review (happy) | `review <repo> <feature-branch> --type quick` with the FakeEngine scripted to an `approve` verdict reaches terminal state `ok` and resolves exit code `0` | Verdict line `VERDICT: approve` (`src/core/run/builtin-verdict-extraction.ts:22`); `run(argv)` returns the code (`create-cli.ts` property 1/3) |
| S3 persistence | A run directory `<SENTINEL_HOME>/runs/<repoName>/<id>/` exists with `metadata.json`, `result.md` (the FakeEngine's raw output), `prompt.md`, and `validations/` | `run-store-fs.ts:218-245` |
| S4 history | `runs list <repo>` shows that run id and `runs show <repo> <id>` reads it back | `runs-commands.ts:28,46`; read path `run-store-fs.ts:415-418` |
| S5 review (negative) | The same flow with a scripted `request-changes` verdict resolves exit code `1` (the `--changes-exit-code` default) and still persists a complete run directory | `[E6.F1.H2]` exit-code table; `review-command.ts:248` |
| S6 isolation | Nothing is written outside the two temp roots; both are removed in `afterEach` even when an assertion fails mid-flow | `rmSync(..., { recursive: true, force: true })`; `runReview`'s cleanup stage already removes the worktree on the success path |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-1 | `e2e/` exists and the `e2e` vitest project matches at least one test file | `npx vitest run --project e2e` runs >0 tests | must |
| AC-2 | The temp git fixture is hermetic: no network, no dependence on global git config/identity/`init.defaultBranch`, temp paths `realpath`ed | Suite green with `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM` pinned to `/dev/null`; passes on ubuntu-latest, Node 22 and 24 | must |
| AC-3 | Each test runs under its own `SENTINEL_HOME` temp root; the developer's `~/.sentinel` is never touched | Assert every asserted artifact path is under the temp root | must |
| AC-4 | S1-S4 run as one continuous flow in a single test, driven through `createCli(createCliDeps({...})).run(argv)` with real argv arrays | Read the suite; each leg is an argv invocation, not a use-case call | must |
| AC-5 | S3's four artifacts are asserted by existence **and** by content (at minimum: `result.md` equals the scripted engine output; `metadata.json` carries the run id, repo, branch and terminal state `ok`) | Assertions present in the suite | must |
| AC-6 | S2 asserts exit code `0`; S5 asserts exit code `1` | `run(argv)` return value asserted | must |
| AC-7 | The `ReviewEngine` override is optional and test-only: `EngineNameSchema` is unchanged, no user-facing string mentions a fake engine, and omitting the override reproduces today's `createEngine` behavior | `git diff` on `config-schemas.ts` is empty; existing `src/main` wiring tests still pass unmodified | must |
| AC-8 | `e2e` is in `tsconfig.json#include` and `biome.json#files.includes`; `depcruise` is still invoked as `depcruise src` | `npm run check` clean; a deliberate type error in `e2e/` fails `tsc --noEmit` | must |
| AC-9 | Full gate green: `npm run check` clean and `npm test` passes with the previous 1037 tests plus the new ones, no suite modified to accommodate the seam | Local run before PR | must |
| AC-10 | **Story checkbox 1 — runs in CI.** The smoke executes inside the existing `test` job (`npm ci` + `npm test`) on the Node 22/24 matrix with no workflow file change | CI run on the PR shows the e2e project's tests in both matrix legs | must |
| AC-11 | **Story checkbox 2 — fails if any piece breaks.** Demonstrated by mutation: with the suite green, deliberately break one composition-level piece (e.g. the run directory layout in `run-store-fs.ts`, or the `worktreesDir`/`clonesDir` handed out by `createWiringGraph`), observe the smoke go red, then revert. At least two distinct mutations, on different layers, recorded in the execution log or QA report; the tree is left unmutated | QA re-runs one mutation and confirms red, then `git status` clean | must |
| AC-12 | The suite holds at most two scenarios (one happy path, one negative) and uses the `quick` harness | Read the suite | should |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| Coverage ceiling of route (a) | medium | Accepted by d-003 and written down as N-1. Revisit only if a future story needs binary-level coverage. |
| A test-only seam in production code | low | Mitigated by AC-7: optional, documented, no behavior change when omitted. Design must decide where the doc-comment lives and how the "test-only" contract is made obvious to a reader of `container.ts`. |
| Hermetic-git duplication | low | ~25 lines restated in `e2e/` (Q3). Accepted: e2e fixtures own their world. Origin comment is required so the two copies do not silently diverge. |
| Smoke growing into a second suite | low | Bounded by AC-12 and N-3. |
| `e2e/` outside `depcruise` | low | Deliberate (N-2); recorded so a future reader does not undo it. |

## Open Questions And Decisions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| Q1 engine reachability | Shapes the story and the truth of the story's second checkbox | spec | **resolved — d-003, route (a), user** |
| Q2 quality gate for `e2e/` | Repo structure + gate scope | spec | **resolved — d-004, tsconfig + biome yes, depcruise stays `src`, user** |
| Q3 fixture placement | Duplication vs. importing a `__test__` folder from `src` | design | resolved (A) — restate inside `e2e/` |
| Q4 harness + validations | CI determinism | design | resolved (A) — `quick`, validations optional |
| Q5 exit-code assertions | Most composition-dependent behavior in the flow | spec | resolved (A) — **reachable under route (a)**: `createCli(...).run(argv)` returns the exit code as a value and never touches `process` (`create-cli.ts` properties 1 and 3), so AC-6 is testable in-process |
| Q6 scenario count | Keeps the smoke a smoke | design | resolved (A) — AC-12 |
| Q7 teardown | Leaked worktrees/temp homes | design | resolved (A) — unconditional `afterEach` |
| Q8 (new, A) | Where the optional engine field is threaded: `WiringGraphOptions` alone is not enough, because `createCliDeps` is the surface the smoke calls and its `CliDepsOptions` is a separate interface | design | open — design decides the exact shape (extend vs. duplicate the field); no user input needed |

## Approval Notes

- Route stays `continue-lite`. Blast radius: one new directory, one optional field threaded
  through two interfaces in the composition root, two config-file edits. No core change, no
  user-facing surface change.
- Both B-level questions were settled by the user before this spec; nothing here reopens them.
  N-1 and N-2 exist to keep those decisions' costs on the record.
- The only new item for design is Q8, which is A-level and mechanical.
- Recommended next stage: `sddl-design`.
