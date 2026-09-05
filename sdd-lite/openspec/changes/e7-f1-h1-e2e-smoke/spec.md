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
  **Amendment 1 (design's code-evidence corrections, A-1..A-3 + two notes)** adds no criterion
  and removes none: it amends AC-5 and AC-7 in place and corrects S3/S5 and the persisted-
  artifact list. The AC count stays 12.
- amendment_digest: three assertions in the original spec were contradicted by the code —
  `validations/` is never written under the `quick` harness, `<SENTINEL_HOME>/config.yaml` is
  never written by any CLI path, and `metadata.json` carries no `id` field. Scope, AC intent
  and non-goals N-1/N-2 are unchanged. See **Amendment 1**.

## Summary

- change_name: e7-f1-h1-e2e-smoke
- objective: new-feature
- route: continue-lite
- spec_status: formalized and **amended once** — Amendment 1 (`sddl-design`'s code-evidence
  corrections). Q1/Q2 settled by d-003/d-004; no open B-level question.

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
- Assertions on the concrete persisted artifacts and on the review exit code. **(Amendment 1)**
  The persisted set the smoke asserts is `<SENTINEL_HOME>/repos.yaml` plus the run directory;
  `config.yaml` is **not** in that set (A-2) and `validations/` is asserted **absent** (A-1).

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
| S3 persistence | A run directory `<SENTINEL_HOME>/runs/<repoName>/<id>/` exists with `metadata.json`, `result.md` (the FakeEngine's raw output) and `prompt.md`. **(Amendment 1, A-1)** `validations/` is **absent** and is asserted absent — `run-store-fs.ts:237-240` creates it only when `validationOutput` is non-empty, and the `quick` harness declares `skills: []`, so nothing populates it. No `<SENTINEL_HOME>/config.yaml` is expected either **(A-2)** | `run-store-fs.ts:218-245`; the original wording implying a present `validations/` is superseded |
| S4 history | `runs list <repo>` shows that run id and `runs show <repo> <id>` reads it back | `runs-commands.ts:28,46`; read path `run-store-fs.ts:415-418` |
| S5 review (negative) | The same flow with a scripted `request-changes` verdict resolves exit code `1` (the `--changes-exit-code` default) and still persists a run directory with the same three files as S3 | `[E6.F1.H2]` exit-code table; `review-command.ts:248` |
| S6 isolation | Nothing is written outside the two temp roots; both are removed in `afterEach` even when an assertion fails mid-flow | `rmSync(..., { recursive: true, force: true })`; `runReview`'s cleanup stage already removes the worktree on the success path |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-1 | `e2e/` exists and the `e2e` vitest project matches at least one test file | `npx vitest run --project e2e` runs >0 tests | must |
| AC-2 | The temp git fixture is hermetic: no network, no dependence on global git config/identity/`init.defaultBranch`, temp paths `realpath`ed | Suite green with `GIT_CONFIG_GLOBAL`/`GIT_CONFIG_SYSTEM` pinned to `/dev/null`; passes on ubuntu-latest, Node 22 and 24 | must |
| AC-3 | Each test runs under its own `SENTINEL_HOME` temp root; the developer's `~/.sentinel` is never touched | Assert every asserted artifact path is under the temp root | must |
| AC-4 | S1-S4 run as one continuous flow in a single test, driven through `createCli(createCliDeps({...})).run(argv)` with real argv arrays | Read the suite; each leg is an argv invocation, not a use-case call | must |
| AC-5 | **(amended by Amendment 1, A-1/A-3)** S3's three artifacts are asserted by existence **and** by content: `result.md` equals the scripted engine output, and `metadata.json` carries `repo`, `targetRef`/`baseRef` and `state: "ok"`. The **run id is the directory name**, not a field — identity is verified by matching the run directory's basename against the id `runs list` prints, never by reading an `id` key out of `metadata.json` (`serializeRunMetadata` emits none, `run-layout.ts:115-127`). `validations/` is asserted **absent**. The smoke must **not** assert `metadata.json#engine`: it reads `claude-code` while the FakeEngine actually ran, because the override interposes after name resolution — asserting it would encode a falsehood, not strengthen the test | Assertions present in the suite; QA greps the suite for any `engine` or `id`-field assertion and finds none | must |
| AC-6 | S2 asserts exit code `0`; S5 asserts exit code `1` | `run(argv)` return value asserted | must |
| AC-7 | **(amended by Amendment 1)** The `ReviewEngine` override is optional and test-only: `EngineNameSchema` is unchanged, no user-facing string mentions a fake engine, and omitting the override reproduces today's `createEngine` behavior | `git diff` on `src/core/repos/ports/config-schemas.ts` is empty, and QA verifies the seam by **reading the `container.ts` diff** — that the field is optional, that the `createEngine` call is reached unchanged when it is absent, and that it carries a test-only doc-comment. The original clause "existing `src/main` wiring tests still pass unmodified" is **superseded as vacuous**: `src/main/__test__/` contains only `paths.test.ts`, there is no container wiring test to be unmodified | must |
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
| **(Amendment 1)** `metadata.json#engine` says `claude-code` while the FakeEngine ran | low | Inherent to route (a): the override interposes after name resolution. Harmless for the smoke, misleading for a reader. AC-5 forbids asserting it; design/execution should note it where the seam is documented. |

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

## Amendment 1 — code-evidence corrections from `sddl-design`

Recorded as an amendment, not a rewrite: every original criterion above is still readable, with
its supersession or narrowing marked inline (the `[E6.F2.H2]` spec's Amendment 1 precedent).
**No scope change.** The in-scope/out-of-scope boundary, the intent of every AC, and non-goals
N-1 (route (a)'s coverage ceiling) and N-2 (`depcruise` stays on `src`) all stand unchanged.
AC numbering is preserved — AC-5 and AC-7 are amended in place, nothing is added or renumbered,
and the count stays **12**.

### Why the spec reopened

`sddl-design` ran against the code and found three assertions in this spec that the
implementation does not satisfy. They are factual errors in the spec, not disagreements about
what the story should do, so the spec must stop asserting them before execution encodes them as
tests that would either fail or be quietly weakened.

| Id | Corrected assertion | Code evidence | What changed here |
|---|---|---|---|
| **A-1** | `validations/` is **never written** under the `quick` harness | `src/adapters/driven/storage/run-store-fs.ts:237-240` creates the directory only when `record.validationOutput` is non-empty, and `repo add` exposes no `--validations` flag; `quick` declares `skills: []`, so no validation ever runs | S3 no longer lists `validations/` among the present files; the smoke asserts it **absent**. This is what non-goal N-4 already implied and now says outright. AC-5 amended accordingly |
| **A-2** | `<SENTINEL_HOME>/config.yaml` is **never written by any CLI path** | Only `ConfigStore.writeConfig` would write it, and no command calls it | The persisted-artifact list is narrowed to `repos.yaml` plus the run directory. `config.yaml` was an overreach carried in from the proposal's exploration table (finding 2, which described the store's capability, not the CLI's behavior) |
| **A-3** | `metadata.json` carries **no `id` field** — the run id *is* the directory name | `serializeRunMetadata` builds the object field-by-field (`src/adapters/driven/storage/run-layout.ts:115-127`): `version`, `repo`, `startedAt`, `durationMs`, `engine`, `harness`, `baseRef`, `targetRef`, `state`, `verdict`, `diff` — no `id` | AC-5 now satisfies run identity by matching the run directory's **basename** against the id `runs list` prints, instead of reading an `id` key |

### Two informational notes folded in

1. **AC-7's verification clause was vacuous.** `src/main/__test__/` contains only
   `paths.test.ts`; there is no container wiring test, so "existing wiring tests still pass
   unmodified" asserted nothing. AC-7 is restated against what exists: an empty diff on
   `config-schemas.ts`, plus QA reading the `container.ts` diff to confirm the field is
   optional, that absence reaches `createEngine` unchanged, and that the doc-comment marks it
   test-only.
2. **`metadata.json#engine` will read `claude-code` while the FakeEngine ran.** The override
   interposes *after* engine-name resolution, so the persisted name reflects the resolved
   configuration, not the object that executed. AC-5 explicitly **forbids** asserting that
   field — stated here so nobody later adds the assertion believing it strengthens the smoke.
   It would instead pin a falsehood and would break the moment the seam is documented honestly.

### Decision level

Level **A** for all five items: they are factual corrections to a spec, reversible, and they
narrow assertions rather than widen scope. No B-level item fired (no public API, no config
format, no new dependency, no repo-structure change). No C-level item — nothing here
contradicts the PRD, the backlog story, or decisions d-003/d-004.

## Approval Notes

- Route stays `continue-lite`. Blast radius: one new directory, one optional field threaded
  through two interfaces in the composition root, two config-file edits. No core change, no
  user-facing surface change.
- Both B-level questions were settled by the user before this spec; nothing here reopens them.
  N-1 and N-2 exist to keep those decisions' costs on the record.
- The only new item for design is Q8, which is A-level and mechanical.
- **(Amendment 1)** Design has since run and returned three code-evidence corrections plus two
  notes, absorbed above. The spec stays `continue-lite` and remains the contract execution and
  QA validate against; nothing in the amendment reopens d-003 or d-004.
