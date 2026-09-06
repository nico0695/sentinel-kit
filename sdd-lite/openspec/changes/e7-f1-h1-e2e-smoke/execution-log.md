# Execution Log

## Change

- change_name: e7-f1-h1-e2e-smoke
- objective: new-feature (story `[E7.F1.H1]`, issue #41)
- route: continue-lite
- stage_source: `plan.md` → `Stage Plan`

## Stage Overview

| Stage Id | Goal | Approval | Status |
|---|---|---|---|
| ST-1 | Add the optional, test-only `ReviewEngine` seam (D-1/D-2/D-3) | cp-002 (approved) | completed |
| ST-2 | Bring `e2e/` into the quality gate (d-004, AC-8) | cp-003 (approved) | completed |
| ST-3 | Hermetic fixture + happy-path smoke (S1-S4) | cp-004 (approved) | completed |
| ST-4 | Negative case (S5) | cp-005 (approved) | completed |
| ST-5 | AC-11 mutation verification | cp-006 (approved) | completed — with finding (M2 blind spot) |
| ST-5b | Close the M2 blind spot: two worktree-location assertions | cp-007 (approved) | completed |
| ST-6 | Full gate + closeout evidence | cp-008 (approved) | completed |

## ST-1 — Test-only `ReviewEngine` seam in the composition root

- approval_reference: checkpoint `cp-002`, ST-1 only. ST-2..ST-6 explicitly not approved and not started.
- status: completed
- planned_scope: `src/main/container.ts` only — `readonly engineOverride?: ReviewEngine` on
  `CliDepsOptions` (`@internal` TSDoc, D-3) and on the private `WiringGraphOptions`; one `??` at the
  engine construction site inside the existing `runReview` thunk, with a comment naming d-003 and AC-7.
- actual_changed_files: `src/main/container.ts` (only). No file created, no file deleted.

### Pre-execution verification

The design's load-bearing assumption was checked in the code before editing, not assumed:

- `createCliDeps` (`container.ts:248` pre-edit) calls `createWiringGraph(options)` with its whole
  options object, so declaring the field on both interfaces makes the value flow with **zero**
  call-site change. D-1's "extend, do not restructure" holds; no forwarding rewrite was needed and
  none was made.
- `ReviewEngine` was already imported as a type from `../core/run/index.js`, so the seam adds no import.
- The module doc-comment's three properties were read first. Property 1 (`sentinelPaths()` called
  exactly once) is untouched: the new field is inert data on the options object and nothing about
  path derivation moved. Property 2 (engine built per invocation) is preserved by interposing
  *inside* the thunk rather than resolving an engine at graph-build time.
- `createEngine` was not modified and gained no parameter — it stays a pure name → constructor lookup
  (the design rejected the alternative).

### Applied edits (three, as planned)

1. `CliDepsOptions.engineOverride?: ReviewEngine` with a rationale-bearing TSDoc block tagged
   `@internal`: injected only by `e2e/`, unreachable from argv/config/env, `EngineNameSchema`
   deliberately not extended (d-003), and omitting it must reproduce today's behavior (AC-7).
2. The same optional field on the private `WiringGraphOptions`, with a one-line TSDoc pointing back
   to the full contract.
3. `engine: options.engineOverride ?? createEngine(request.engineName, env)` in the `runReview`
   thunk, preceded by a two-line comment naming AC-7 and d-003.

`exactOptionalPropertyTypes` is on, so the field is a plain optional: callers omit it rather than
pass `undefined`, and `??` therefore only short-circuits when an engine was genuinely supplied.

### Invariants verified (not assumed)

- **Omitted-override path is verbatim.** With the field absent the right-hand side of `??` is the
  pre-edit expression character for character: per-invocation construction, the
  `UnknownEngineError`-adjacent `default:` throw, and the `SENTINEL_OPENCODE_MODEL` failure path are
  behaviorally byte-identical. The diff below shows the old line surviving unchanged as the fallback.
- **`sentinelPaths()` still called exactly once per graph** — the single call site in
  `createWiringGraph` is outside the diff.
- **AC-7 core check**: `git diff src/core/repos/ports/config-schemas.ts` is empty.
- **Architecture guards**: no adapter instantiation was added or moved; `depcruise src` reports zero
  violations over 107 modules.

## Quick Checks

Planned by `plan.md` for ST-1 (the full gate, because this is the only production change): all four
were run; nothing was skipped.

| Check | Planned | Result |
|---|---|---|
| `npm run check` | clean | **clean** — biome: `Checked 163 files in 313ms. No fixes applied.`; `tsc --noEmit`: no output; depcruise: `✔ no dependency violations found (107 modules, 254 dependencies cruised)` |
| `npm test` | 1037/1037 across 49 files | **`Test Files 49 passed (49)` / `Tests 1037 passed (1037)`** — exact baseline match, no regression, no new test |
| `git diff src/main/container.ts` | limited to the three documented edits | **3 hunks, exactly the three edits** (see diff below) |
| `git diff src/core/repos/ports/config-schemas.ts` | empty | **empty** (AC-7) |

`git status --porcelain` after the stage:

```
 M sdd-lite/openspec/changes/e7-f1-h1-e2e-smoke/state.yaml
 M src/main/container.ts
```

`state.yaml` was already modified by the orchestrator before this stage began; the executor did not
write it. No `e2e/` file exists, and `tsconfig.json`, `biome.json`, `.dependency-cruiser.cjs` and
`package.json` are untouched — ST-2's scope was not anticipated in any way.

### `git diff src/main/container.ts`

```diff
@@ -84,6 +84,26 @@ export interface CliDepsOptions {
   readonly homeDir?: string;
   /** Output sink; defaults to the real streams. */
   readonly io?: CliIo;
+  /**
+   * Test-only seam: the engine the `review` path runs with, bypassing
+   * `createEngine`'s name → constructor lookup.
+   *
+   * Injected by the `e2e/` smoke suite and by nothing else. It is deliberately
+   * unreachable from argv, config or the environment: `EngineNameSchema`
+   * (`src/core/repos/ports/config-schemas.ts`) is NOT extended with a fake
+   * name (d-003), so no user-facing surface can select a stub engine and the
+   * production engine catalogue stays exactly the two shipped adapters.
+   *
+   * Omitting the field must reproduce today's behavior byte for byte —
+   * per-invocation construction (property 2 above), the `default:` throw and
+   * the `SENTINEL_OPENCODE_MODEL` failure path all intact. That is the
+   * seam's acceptance condition (AC-7), and the reason it is applied with a
+   * `??` at the construction site rather than by teaching `createEngine`
+   * about overrides.
+   *
+   * @internal
+   */
+  readonly engineOverride?: ReviewEngine;
 }
@@ -144,6 +164,8 @@ function createEngine(
 interface WiringGraphOptions {
   readonly env?: PathEnv;
   readonly homeDir?: string;
+  /** Test-only; the contract lives on `CliDepsOptions.engineOverride`. */
+  readonly engineOverride?: ReviewEngine;
 }
@@ -227,7 +249,9 @@ function createWiringGraph(options: WiringGraphOptions) {
     runReview: (request) =>
       runReview(request, {
         git,
-        engine: createEngine(request.engineName, env),
+        // `??`, so an omitted override leaves today's call verbatim (AC-7);
+        // the fake engine is injected here and never named (d-003).
+        engine: options.engineOverride ?? createEngine(request.engineName, env),
         harnesses,
         worktreesDir: paths.worktreesDir,
         processRunner,
```

## Blockers

None. No contradiction, no scope drift, no blast-radius expansion. The design's one checked
assumption (`createCliDeps` forwards its whole options object) held, so the STOP condition attached
to it did not fire.

## Open Risks Carried Forward

- `risk-e7h1-005` — a test-only field now exists in production code. Mitigated as designed: it is
  `@internal`, undocumented on any user surface, unreachable without a direct programmatic
  `createCliDeps` call, and `EngineNameSchema` is unchanged. Accepted, not open.
- `risk-e7h1-007` — AC-7 rests on reading the diff, since `src/main/__test__/` holds only
  `paths.test.ts` and no container regression test exists (design A-4). The evidence is the bounded
  diff above plus the empty `config-schemas.ts` diff. The seam stays unexercised at runtime until
  ST-3 injects a fake through it; until then `npm test` proves only that the fallback path is intact.

## Git Discipline

No commit, no stage, no branch, no stash, no checkout. All changes left in the working tree for the
orchestrator.

## QA Handoff

ST-1 touched production code in the composition root, which is a meaningful checkpoint even at a
three-edit blast radius, and both carried risks are review-verified rather than test-verified.
`sddl-qa-review` in stage mode is **recommended before ST-2** — QA's job here is to re-read the
`container.ts` diff against AC-7 and confirm the `config-schemas.ts` diff is empty. If the
orchestrator and user prefer to defer, ST-2 is the alternative next step and is independent of the
seam's semantics.

## Next Action

Return to the orchestrator for QA review of ST-1, or for `stage_approval` on ST-2
(`tsconfig.json#include` → `["src", "e2e"]`, `biome.json#files.includes` += `"e2e/**"`). ST-2 is not
approved and was not started.

---

## ST-2 — Bring `e2e/` into the quality gate

- approval_reference: checkpoint `cp-003` (decision `d-006`), ST-2 only. ST-3..ST-6 explicitly not
  approved and not started; no file was created under `e2e/`.
- status: completed
- planned_scope: `tsconfig.json#include` → `["src", "e2e"]`; `biome.json#files.includes` gains
  `"e2e/**"`. `.dependency-cruiser.cjs` and `package.json#scripts.check` deliberately UNCHANGED
  (non-goal N-2 — `depcruise` stays scoped to `src` because the architecture guards are the
  core-extraction guarantee and `e2e/` is neither shipped nor subject to the inward-dependency rule).
- actual_changed_files: `tsconfig.json`, `biome.json`. Exactly two files, two edits. No file created,
  no file deleted.

### Pre-execution verification

- Working tree before the stage held only the orchestrator-owned `state.yaml` modification; `HEAD` was
  `3ce1557` (ST-1, committed). No unrelated local change could be confused with this stage's edits.
- `e2e/` confirmed absent on disk (`ls e2e` → no such file or directory). This is the deliberate
  ordering of `risk-e7h1-008`: running the config edit before any `e2e/` file exists makes any new
  finding attributable to the config alone.

### Applied edits (two, as planned)

1. `tsconfig.json` — `"include": ["src"]` → `"include": ["src", "e2e"]`.
2. `biome.json` — `"e2e/**"` added to `files.includes`, immediately after `"src/**"`.

Nothing else in either file was reformatted or reordered.

### The open question this stage existed to answer

The handoff flagged an unknown: what `tsc` does when `include` names a directory that does not exist.

**Answer, measured rather than assumed: nothing.** `tsc --noEmit` exited silently, with no error and
no warning. TypeScript's "no inputs were found" diagnostic (TS18003) fires only when the *whole*
`include`/`files` set resolves to zero input files; a single include entry that matches nothing is
ignored as long as another entry (here `src`) matches. Biome behaves the same way — a glob matching no
path is not an error, and its file count is unchanged at 163.

Consequence for the plan: the ordering ST-2-before-ST-3 is sound and needs no revisiting. The config
is inert today and becomes load-bearing the moment ST-3 writes the first file under `e2e/`.

### Quick checks

Planned: `npm run check` only. No `npm test`, because this stage changes no runtime code path — it
changes which files two static tools look at, and `vitest.config.ts` (which already declares the `e2e`
project) was not touched. Skipping `npm test` here is a recorded choice, not an omission; ST-6 runs the
full gate.

Run: `npm run check` — **clean**, exit 0. Verbatim:

```
> @nico0695/sentinel@0.0.0 check
> biome check . && tsc --noEmit && depcruise src

Checked 163 files in 282ms. No fixes applied.

✔ no dependency violations found (107 modules, 254 dependencies cruised)
```

This matches the post-ST-1 baseline exactly (biome 163 files, `tsc` silent, depcruise 0 violations /
107 modules / 254 dependencies). No pre-existing finding surfaced, and no `tsup`/vitest
type-resolution interaction appeared — so the STOP condition the handoff described did not trigger.

Not verified here, by design: that the widened config *actually rejects* a bad `e2e/` file. Proving the
gate bites requires a file under `e2e/`, and `plan.md` assigns that spot check to ST-6 (deliberate type
error → `tsc --noEmit` fails → revert → re-run clean). Until then AC-8 is configured but unproven.

### `git diff`

```diff
diff --git a/biome.json b/biome.json
index 6ba5318..303d762 100644
--- a/biome.json
+++ b/biome.json
@@ -3,6 +3,7 @@
   "files": {
     "includes": [
       "src/**",
+      "e2e/**",
       "package.json",
       "tsconfig.json",
       "biome.json",
diff --git a/tsconfig.json b/tsconfig.json
index b806095..2de6f02 100644
--- a/tsconfig.json
+++ b/tsconfig.json
@@ -12,5 +12,5 @@
     "skipLibCheck": true,
     "resolveJsonModule": true
   },
-  "include": ["src"]
+  "include": ["src", "e2e"]
 }
```

`.dependency-cruiser.cjs` and `package.json` diffs are empty, as required by N-2.

### Blockers

None. The stage completed as planned with no contradiction, no scope drift, and no blast-radius
expansion.

### Open risks carried forward

- `risk-e7h1-008` — retired for this stage. The isolation experiment it prescribed was run and produced
  a clean result, so any `check` failure in ST-3/ST-4 is attributable to the new test files rather than
  to the gate configuration.
- AC-8 is **configured but not yet demonstrated**: the widened gate is inert while `e2e/` is empty. The
  ST-6 spot check is the evidence, and it must not be dropped.
- `risk-e7h1-005` and `risk-e7h1-007` carry forward unchanged from ST-1; this stage neither aggravates
  nor mitigates them.

### Git discipline

No commit, no stage, no branch, no stash, no checkout. Both changed files left in the working tree for
the orchestrator.

### QA handoff

Not recommended as a separate pass for ST-2 on its own. The stage is a two-line configuration change
with a fully observable outcome (the `npm run check` transcript above), it touches no production or
test code, and the deferral recorded in `d-006` — review once the seam and the suite that exercises it
both exist — applies here too. The ST-1 review remains deferred, not skipped.

### Next action

Return to the orchestrator for `stage_approval` on ST-3 (hermetic git fixture
`e2e/support/hermetic-git.ts` plus the happy-path smoke test `e2e/review-flow.test.ts`). ST-3 is not
approved and was not started; no file exists under `e2e/`.

## ST-3 — Hermetic git fixture + happy-path smoke

- approval_reference: checkpoint `cp-004`, ST-3 only. ST-4, ST-5 and ST-6 explicitly not approved and
  not started — no negative test was written, no mutation was applied, and the AC-8 deliberate-type-error
  spot check was not run.
- status: completed
- planned_scope: two NEW files, `e2e/support/hermetic-git.ts` (D-5) and `e2e/review-flow.test.ts`
  (D-4/D-6, test 1 only). No existing file modified.
- actual_changed_files: `e2e/support/hermetic-git.ts` (new), `e2e/review-flow.test.ts` (new). Nothing
  else: `git status --porcelain` reports the single untracked entry `?? e2e/` on top of ST-1's and
  ST-2's already-modified files.

### Pre-execution verification

The Amendment-1 corrections were re-verified against the code before the assertions were written,
because an assertion that merely *looks* right is the failure mode this stage exists to avoid:

- `run-store-fs.ts` writes `validations/` only when `record.validationOutput` is non-empty, and
  `harnesses/quick/skills.yaml` declares `skills: []` — so `validations/` is asserted **absent** (A-1).
- No CLI path calls `ConfigStore.writeConfig`, so only `<SENTINEL_HOME>/repos.yaml` is asserted (A-2).
- `serializeRunMetadata` (`run-layout.ts`) emits no `id` field, so run identity is verified by matching
  the run directory's basename against the id `runs list` printed (A-3).
- `metadata.json#engine` is **not** asserted, and the suite carries a comment saying why: the override
  interposes after name resolution, so the field records `claude-code` while the FakeEngine ran.
- `createFakeEngine` accepts a single `FakeReviewOutcome` that repeats on every call
  (`fake/fake-engine.ts`); the happy path scripts `{ ok: true, result: { output: … } }` with an output
  whose last line is `VERDICT: approve`, which is what `extractBuiltInVerdict`'s anchored
  `/^VERDICT:\s*(approve|request-changes|comment)$/` matches inside its tail window.

### Two corrections to the planned assertions (decision level A)

Both are factual corrections of the same family as Amendment 1 — the code disagreed with an artifact,
and the code won. Neither changes scope, and both make the assertion stronger rather than weaker:

1. **Run directory path.** `design.md` D-7 states runs land under `<SENTINEL_HOME>/runs/acme/widget/`.
   They do not. `persistRun` maps the alias through `toRunStorageKey` (`owner/repo` → `owner__repo`,
   `run-storage-key.ts`) before handing the record to the store, so the real path is
   `<SENTINEL_HOME>/runs/acme__widget/<ts>/`. The suite asserts the storage-key form and names the
   normalisation in a comment.
2. **`metadata.json#repo`.** `plan.md`'s validation strategy expects `repo: "acme/widget"`. The record's
   `repoName` is the *already normalised* storage key (`persist-run.ts:116`), and `serializeRunMetadata`
   copies it verbatim, so the persisted value is `acme__widget`. Asserting the alias there would have
   failed; asserting the storage key pins the real D7 contract, and it is also the assertion that a
   mutation of `toRunStorageKey` would break.

The `runs list` / `runs show` legs still use the **alias** `acme/widget` on argv and still see the alias
echoed back in the output — `list-runs` normalises the query input and `format-runs.ts` deliberately
prints the alias the caller typed rather than the stored key. Both halves of that contract are now
covered end to end.

### What the suite does

One test, `registers a repository, reviews a branch and reads the run back`, five argv legs through
`createCli(createCliDeps({ … })).run(argv)` with a fresh graph per leg (the way each real CLI process
builds exactly one):

1. `repo add https://example.test/acme/widget.git --local-path <tmp repo> --base-branch main
   --harness quick` — offline by construction (`registerRepo` skips `git.clone` with `localPath` and
   skips `git.defaultBranch` with an explicit base). Exit 0, one stdout record, empty stderr,
   `<SENTINEL_HOME>/repos.yaml` written and containing the alias.
2. `repo list` — the alias is printed back.
3. `review acme/widget feature/tighten-widget --type quick` — exit 0, empty stderr.
4. Persistence: exactly one run directory; `result.md` equals the scripted engine output **byte for
   byte**, `prompt.md` is non-empty, `metadata.json` carries `repo`, `baseRef`, `targetRef`,
   `state: "ok"`, `verdict: "approve"`; `validations/` absent.
5. `runs list acme/widget` then `runs show acme/widget <id>` — the printed id equals the run
   directory's basename, and the block reports `state ok` / `verdict approve`.

Isolation (S6/AC-3): `SENTINEL_HOME` is injected as `env` on `createCliDeps` and `process.env` is never
mutated; `homeDir` is pointed at `<fixture root>/dead-home`, a path that is never created, and the test
asserts it still does not exist at the end — so a `SENTINEL_HOME` regression that fell back to the home
directory would be caught rather than silently tolerated. Every asserted path is built with
`join(sentinelHome, …)`. Teardown is an unconditional `afterEach` over a module-level list of temp roots
(`rmSync(root, { recursive: true, force: true })`), outside any `try`, so a mid-flow assertion failure
still cleans up both roots.

The fixture (`e2e/support/hermetic-git.ts`) restates the proven recipe:
`realpathSync(mkdtempSync(join(tmpdir(), "sentinel-e2e-")))`, `git init --bare -b main`, clone,
per-invocation `-c user.email` / `-c user.name`, a seed commit on `main`, a feature branch with one
committed modification, both pushed, and `HERMETIC_GIT_ENV` pinning `GIT_CONFIG_GLOBAL=/dev/null`,
`GIT_CONFIG_SYSTEM=/dev/null`, `GIT_TERMINAL_PROMPT=0`, `LC_ALL=C`, `LANG=C`. Its header comment names
`src/adapters/driven/git/__test__/git-cli.test.ts` as the origin of the recipe. It is deliberately not a
`.test.ts` file, so the `e2e` project's include does not collect it as a suite.

### Quick checks

Planned (from `plan.md` ST-3): `npx vitest run --project e2e` green with more than zero tests, then
`npm run check` clean, then a second `e2e` run for determinism. All three were run; nothing was skipped.

```
$ npx vitest run --project e2e
 Test Files  1 passed (1)
      Tests  1 passed (1)
   Duration  2.06s
```

`npm run check` failed once on formatting only — biome would have wrapped two long lines. Fixed with
`npx biome check --write e2e` (formatting of the new files, no assertion touched), after which:

```
$ npm run check
> biome check . && tsc --noEmit && depcruise src
Checked 165 files in 215ms. No fixes applied.
✔ no dependency violations found (107 modules, 254 dependencies cruised)
```

The file count moved from 163 to 165 — exactly the two new `e2e/` files — which is the first positive
evidence that ST-2's gate widening actually reaches them (AC-8's spot check in ST-6 is still required
and is not replaced by this).

Determinism: the e2e project was run three further times after the formatting fix, each `1 passed (1)`
in 1.2–1.5s. No flake, no ordering dependence, no leftover temp directory.

`npm test` (the full 1037-test aggregate) was **not** run: it belongs to ST-6 and running it here would
not change the stage's outcome.

### Surprises worth recording

- The whole flow ran green on the first attempt, which is the strongest single signal so far that the
  composition root is wired correctly — this is the first time worktree → diff → prompt → engine →
  parse → persist has executed end to end against real git and a real filesystem.
- The two artifact-path corrections above are the only places where a persisted artifact disagreed with
  the planning documents. Both were in the same direction: the documents used the *alias* where the code
  uses the *storage key*. Worth flagging to QA as a documentation-accuracy item for `design.md` D-7,
  which will otherwise mislead the next reader.
- `git worktree add --detach` at a resolved sha means the review never contends with the clone's checked
  out branch, so the fixture is free to leave the clone parked on `main`. No serialization hazard showed
  up.

### Blockers

None. No contradiction, no scope drift, no blast-radius expansion. The stage stayed inside its two new
files.

### Open risks carried forward

- AC-8 remains **configured and now partially exercised** (biome and `tsc` demonstrably see `e2e/`), but
  the deliberate-type-error spot check of ST-6 is still the required evidence and must not be dropped.
- `risk-e7h1-005` (test-only seam in production code) and `risk-e7h1-007` (AC-7 verified by reading, not
  by a test) carry forward unchanged.
- AC-11 is entirely unproven until ST-5: the suite is green, and a green suite is not yet evidence that
  it would go red.

### Git discipline

No commit, no stage, no branch, no stash, no checkout. The two new files are left untracked in the
working tree for the orchestrator.

### QA handoff

Recommended before ST-4, at the orchestrator's discretion. The stage adds real test code with real
assertions and is the first stage whose output a reviewer can meaningfully disagree with — specifically
the two corrected assertions above, which a reviewer should confirm rather than take on trust. If the
orchestrator prefers one review covering the whole suite, deferring to after ST-4 is defensible: the
negative test is small and shares the file.

### Next action

Return to the orchestrator for `stage_approval` on ST-4 (the `request-changes` negative case, exit code
1, in the same file), or for a QA pass over ST-1..ST-3 first. ST-4 is not approved and was not started.

## ST-4 — Negative case: `request-changes` resolves the gate exit code

- approval_reference: checkpoint `cp-005`, ST-4 only. ST-5 and ST-6 explicitly not approved and not
  started — no mutation was applied and the AC-8 deliberate-type-error spot check was not run.
- status: completed
- planned_scope: one additional `it` appended to the existing `e2e/review-flow.test.ts` (S5; AC-6,
  AC-12). No new file, no `src/**` change.
- actual_changed_files: `e2e/review-flow.test.ts` (only). No file created, no file deleted.

### What was written

A second test scripting the FakeEngine to `VERDICT: request-changes`, driving `repo add` → `review`
through the same `createCli(createCliDeps({...})).run(argv)` path, and asserting:

- `run(argv)` returns **exit code 1** — the `--changes-exit-code` default from `[E6.F1.H2]`, returned
  in process as a value. `stderr` stays empty, which matters: a `1` accompanied by a diagnostic would
  mean a failure, not a verdict.
- the same three persisted files as the happy path, under `<SENTINEL_HOME>/runs/acme__widget/<ts>/`:
  `result.md` equal to the scripted output byte for byte, a non-empty `prompt.md`, and a
  `metadata.json` carrying `repo: "acme__widget"`, `baseRef`, `targetRef`, `state: "ok"` and
  `verdict: "request-changes"`.
- `validations/` **absent** — the `quick` harness declares `skills: []` (Amendment 1 A-1, N-4).

`state` is asserted `ok` on purpose: a blocking verdict is a *completed* run, and the exit code is the
only thing that differs from the happy path. That is the distinction the negative case exists to prove.

### Assertions deliberately not written

- `metadata.json#engine` — it records the resolved name `claude-code` while the FakeEngine ran
  (Amendment 1). Asserting it would pin a falsehood.
- `<SENTINEL_HOME>/config.yaml` — only `repos.yaml` is written (Amendment 1 A-2).
- `runs list` / `runs show` legs — the happy path already covers the history surface and run-identity
  by directory basename (there is no `id` key in `metadata.json`). Repeating them here would turn the
  smoke into a matrix, which AC-12 forbids. The verdict's persistence is already asserted directly in
  `metadata.json`.

### A-level decision — wiring inlined rather than shared

The new test repeats the fixture/home setup and the `run(argv)` closure instead of extracting a shared
factory. Two reasons, recorded because the duplication is visible and a reviewer will ask: (a) factoring
it out would require rewriting ST-3's test, which is outside this stage's approved scope; (b) a factory
used by only one of two tests would be worse than the duplication — it would leave two divergent ways to
build the same graph in one file. What *was* reused is everything already at module scope:
`REPO_URL`, `REPO_ALIAS`, `REPO_STORAGE_KEY`, `CapturedIo`/`createCapturedIo`, the `temporaryRoots`
teardown registry, and `createHermeticRepo`. Author: `claude` (A — reversible, local to one test file).
If QA prefers a shared helper, it is a one-stage follow-up that touches both tests at once.

### Quick checks

```
$ npx vitest run --project e2e
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Duration  1.91s

$ npm run check
> biome check . && tsc --noEmit && depcruise src
Checked 165 files in 253ms. No fixes applied.
✔ no dependency violations found (107 modules, 254 dependencies cruised)

$ npx vitest run --project e2e   # determinism re-run
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Duration  1.26s
```

The file count stays at 165 — no new file, as planned. `npm test` was **not** run: it belongs to ST-6.

No assertion was weakened to reach green. The exit code was `1` on the first run, so the
`[E6.F1.H2]` contract holds through the real composition root and not only in the unit test of
`resolveReviewExitCode`.

### Blockers

None. No contradiction, no scope drift, no blast-radius expansion.

### Open risks carried forward

- AC-11 remains entirely unproven until ST-5: two green tests are still not evidence that they would go
  red. This is now the single largest gap in the change.
- AC-8's deliberate-type-error spot check (ST-6) is still owed.
- `risk-e7h1-005` and `risk-e7h1-007` carry forward unchanged.

### Git discipline

No commit, no stage, no branch, no stash, no checkout. `git status --porcelain` shows only
`M e2e/review-flow.test.ts` (this stage) and `M sdd-lite/.../state.yaml` (orchestrator-owned, already
modified before this stage started and not touched here).

### QA handoff

Recommended now. ST-3 deferred its review with the argument that the negative case is small and shares
the file — that condition is now met, so one QA pass can cover the whole suite (ST-1..ST-4) before the
mutation stage. ST-5 is the natural point where a review would otherwise arrive too late to be cheap.

### Next action

Return to the orchestrator for a QA pass over ST-1..ST-4, or for `stage_approval` on ST-5 (AC-11
mutation verification). ST-5 and ST-6 are not approved and were not started.

## ST-5 — AC-11 mutation verification

- approval_reference: checkpoint `cp-006` (committed at `bf37aef`), ST-5 only. ST-6 explicitly **not** approved and
  not started: the AC-8 deliberate-type-error spot check, `npm test` and `npm run build` were not run.
- status: completed — with one material finding (M2 did not go red; see below)
- planned_scope: no net file change. Apply `design.md` D-8's mutations M1/M2/M3 one at a time, never
  stacked; per mutation run `npx vitest run --project e2e`, record the exact failing assertion,
  `git checkout -- <file>`, re-run green.
- actual_changed_files: **none under `src/` or `e2e/`** — every mutation was reverted and each revert
  was verified with an empty `git diff`. Only `execution-log.md` (this entry) was written.

### Baseline

```
$ npx vitest run --project e2e
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

### M1 — driven storage (`src/adapters/driven/storage/run-store-fs.ts`)

Mutation: the staged metadata file is written as `meta.json` instead of `metadata.json`
(line 219, the `writeFile(join(stagingDir, "metadata.json"), …)` call). The read site at line 70 was
deliberately left alone, per D-8, so the mutation models a real write-side regression.

Result: **RED — 2 tests failed of 2.** Exact failing assertions:

```
FAIL e2e/review-flow.test.ts > registers a repository, reviews a branch and reads the run back
Error: ENOENT: no such file or directory, open
  '/tmp/sentinel-home-2e0WRv/runs/acme__widget/20260906T161522464Z/metadata.json'
 ❯ e2e/review-flow.test.ts:192:5
    192|     readFileSync(join(runDir, "metadata.json"), "utf-8"),

FAIL e2e/review-flow.test.ts > reports a request-changes verdict with the configurable gate exit code
Error: ENOENT: no such file or directory, open
  '/tmp/sentinel-home-qQAKZ9/runs/acme__widget/20260906T161522713Z/metadata.json'
 ❯ e2e/review-flow.test.ts:311:5
    311|     readFileSync(join(runDir, "metadata.json"), "utf-8"),
```

Revert: `git checkout -- src/adapters/driven/storage/run-store-fs.ts`;
`git diff src/adapters/driven/storage/run-store-fs.ts` → empty; re-run → 2 passed (2).

Secondary observation (not a stage blocker, recorded for QA): the failure arrives at the test's own
`metadata.json` read, i.e. **before** any `runs show` assertion could fail. D-8 predicted S4
(`runs show`) would also go red. The suite still detects the regression — AC-11 is satisfied by M1 —
but the evidence does **not** demonstrate that `runs show` itself notices a missing `metadata.json`;
`run-store-fs.ts:380` carries a comment about tolerating exactly the "finalDir exists but
metadata.json is gone" case, so that tolerance may be by design. Untested either way here.

### M2 — composition root (`src/main/container.ts`) — **DID NOT GO RED**

Mutation: `createWiringGraph` hands `runReview` `worktreesDir: paths.clonesDir` instead of
`paths.worktreesDir` (line 256).

Result: **GREEN — 2 passed (2).** No assertion failed. Per the stage handoff this was not swapped for
an easier mutation; it is recorded as the finding it is.

Diagnosis (the blind spot, named precisely):

- The mutation is *live*, not dead code: `worktreesDir` flows `container.ts:256` →
  `run-review.ts:402` → `create-review-worktree.ts`, which builds
  `<worktreesDir>/<repoBasename>/<sanitizedLabel>-<timestamp>`. Under the mutation the ephemeral
  worktree is really created under `<SENTINEL_HOME>/clones/…` instead of `<SENTINEL_HOME>/worktrees/…`.
- It is unobservable to the smoke for two compounding reasons: (a) the fixture registers the repo with
  `--local-path`, so `clonesDir` is otherwise empty and nothing collides; (b) the suite asserts
  **nothing** about where the worktree lived, and nothing about `clones/` staying untouched — the
  worktree is created and cleaned up inside the review, so both directories are unobserved
  intermediate state.
- Why it would matter in production: `listOrphanWorktrees` scans `worktreesDir` and treats everything
  under it as orphan-cleanup candidates. A worktree created outside that root is invisible to orphan
  cleanup, and `<clonesDir>/<repoBasename>/…` sits in the same tree as managed clones at
  `<clonesDir>/<owner>/<repo>`. So M2 is a real defect class that this smoke does not catch.
- Scope note: adding an assertion for it (e.g. `<HOME>/worktrees` was used, `<HOME>/clones` stayed
  empty) is a change to `e2e/review-flow.test.ts` and therefore **outside ST-5's approved scope**
  (ST-5 is explicitly "no net file change"). Not done. Routed to the user/QA as a decision.

Revert: `git checkout -- src/main/container.ts`; `git diff src/main/container.ts` → empty;
re-run → 2 passed (2).

### M3 — driving CLI (`src/adapters/driving/cli/exit-code.ts`)

D-8 marked M3 optional "if M1 and M2 both behaved as expected". M2 did not, so M3 became **required**
to satisfy the stage's "at least two mutations, on different layers, each proven red" bar. It is a
mutation point already named in the approved D-8 list, so this is not scope expansion.

Mutation: `resolveReviewExitCode` returns `0` unconditionally once past the fail-closed guard
(`return verdict === "request-changes" ? changesExitCode : 0;` → `return 0;`).

Result: **RED — 1 failed, 1 passed of 2**, exactly the asymmetry D-8 predicted: the negative case
fails while the happy path stays green, which is the evidence that the second test earns its place.
Exact failing assertion:

```
FAIL e2e/review-flow.test.ts > reports a request-changes verdict with the configurable gate exit code
AssertionError: expected +0 to be 1 // Object.is equality
- Expected  1
+ Received  0
 ❯ e2e/review-flow.test.ts:295:25
    295|   expect(reviewed.code).toBe(1);
```

Revert: `git checkout -- src/adapters/driving/cli/exit-code.ts`;
`git diff src/adapters/driving/cli/exit-code.ts` → empty; re-run → 2 passed (2).

### AC-11 verdict

Satisfied, with a named gap. Two mutations on two different layers — **M1 (driven storage)** and
**M3 (driving CLI exit-code policy)** — each turned the suite red with a recorded, specific failing
assertion, and each reverted to green. The smoke is therefore demonstrably capable of failing when the
flow breaks; it is not a suite that passes vacuously. The gap is M2: the composition-root
worktree-location property is **not** covered.

### Ending-state evidence (revert proven, not assumed)

```
$ git status --porcelain
 M sdd-lite/openspec/changes/e7-f1-h1-e2e-smoke/state.yaml

$ git diff src/adapters/driven/storage/run-store-fs.ts   # empty
$ git diff src/main/container.ts                          # empty
$ git diff src/adapters/driving/cli/exit-code.ts          # empty
$ git diff --stat src/                                    # empty
```

`state.yaml` is orchestrator-owned and was already modified before this stage started; ST-5 did not
touch it. No production file is left modified. `e2e/` is unmodified (ST-4 is committed at `2872a28`).

### Quick checks

Planned for ST-5 (`plan.md`): the e2e project run per mutation plus `git status --porcelain`. All run,
as transcribed above — 6 e2e runs total (1 baseline + 3 mutated + reverts, each revert re-verified).
`npm run check` was **not** run and is not needed: `git diff --stat src/` is empty, so the compiled and
linted surface is byte-identical to the state ST-4 already proved clean at 165 files. `npm test` and
`npm run build` were **not** run — they belong to ST-6 and ST-6 is not approved.

### Blockers

None blocking the stage itself; ST-5 completed. One open decision for the user/QA (M2 coverage gap).

### Open risks carried forward

- **NEW `risk-e7h1-008` — worktree-location blind spot.** The smoke does not observe that reviews use
  `worktreesDir`; re-pointing it at `clonesDir` leaves the suite fully green. Impact: orphan-worktree
  cleanup regressions and clones/worktrees tree collisions are invisible to E2E. Options: (a) accept
  and document the gap for the MVP; (b) one-stage follow-up adding two assertions to
  `e2e/review-flow.test.ts` (worktree root used, `clones/` untouched) and re-running M2 to prove red.
  Recommendation: **(b)** — it is small, it closes the only demonstrated hole in the story's own
  headline claim, and M2 already exists as a ready-made proof. Level **B** (it changes the approved
  test scope), so the user decides.
- AC-8's deliberate-type-error spot check (ST-6) is still owed.
- `risk-e7h1-005` and `risk-e7h1-007` carry forward unchanged.

### Git discipline

No commit, no stage, no branch, no stash. The only git writes were the three
`git checkout -- <file>` reverts, each on a file this stage had just mutated itself — the one write
the ST-5 handoff permits. Nothing else was checked out.

### QA handoff

Recommended. The mutation evidence and, above all, the M2 finding should be reviewed before ST-6
closes the change — ST-6 is the last stage, so a gap accepted silently here ships.

### Next action

Return to the orchestrator with the M2 blind spot as an open level-B decision (accept the gap, or
approve a small follow-up stage that adds the worktree-location assertions and re-proves M2 red).
ST-6 is not approved and was not started.

## ST-5b — Close the M2 blind spot in the smoke

- approval_reference: checkpoint `cp-007`, ST-5b only (stage inserted after ST-5's finding; decision
  `d-010`, level B, user). ST-6 explicitly not approved and not started.
- status: completed
- planned_scope: `e2e/review-flow.test.ts` only — exactly two assertions added to the existing
  happy-path test, then M2 re-applied and reverted as the red/green proof.
- actual_changed_files: `e2e/review-flow.test.ts` (only). Net change under `src/`: none.

### What was added

Both assertions live at the end of the happy-path test, next to the existing `S6` isolation check,
and both carry a comment naming the blind spot they close so a later reader does not delete them as
redundant:

1. `expect(readdirSync(join(sentinelHome, "worktrees"))).toEqual([basename(fixture.repoPath)])` —
   the worktree root actually used. The worktree itself is gone by assertion time (cleanup removes it
   on the success path, `run-review.ts` stage 9), so the observable is its **parent**: `git worktree
   add` creates `<worktreesDir>/<repoBasename>/` on the way in and `git worktree remove` deletes only
   the leaf, leaving that directory behind as a durable trace. `readdirSync` is deliberate over
   `existsSync`: a directory that was never created makes it throw rather than pass vacuously, which
   is exactly the failure mode M2 produces. No race is involved — the review has fully returned.
2. `expect(existsSync(clonesDir) ? readdirSync(clonesDir) : []).toEqual([])` — `clones/` untouched by
   a `--local-path` registration. The ternary tolerates the directory not existing at all (which is
   the correct state today) without weakening the assertion when it does exist.

`node:path`'s `basename` was added to the existing import. No third test, no new fixture.

### Red/green proof (M2 as the ready-made mutation)

| Step | Command | Result |
|---|---|---|
| 1 | `npx vitest run --project e2e` (assertions in place, clean tree) | 2/2 passed |
| 2 | apply M2: `worktreesDir: paths.clonesDir` in `createWiringGraph` (`src/main/container.ts`) | `git diff --stat` = 1 file, 1 insertion, 1 deletion |
| 3 | `npx vitest run --project e2e` | **RED** — 1 failed, 1 passed |
| 3b | same, with assertion 1 temporarily neutralised, to prove assertion 2 bites independently | **RED** on assertion 2 |
| 4 | `git checkout -- src/main/container.ts` | reverted |
| 5 | `npx vitest run --project e2e` | 2/2 passed |
| 6 | `git diff src/main/container.ts` | **empty (0 bytes)** |
| 7 | `npm run check` | clean — biome 165 files, `tsc --noEmit` silent, depcruise 107 modules / 254 dependencies, no violations |

Verbatim failure at step 3 (assertion 1, the first to run):

```
FAIL  |e2e| e2e/review-flow.test.ts > registers a repository, reviews a branch and reads the run back
Error: ENOENT: no such file or directory, scandir '/tmp/sentinel-home-ApbJXq/worktrees'
 ❯ e2e/review-flow.test.ts:237:10
    237|   expect(readdirSync(join(sentinelHome, "worktrees"))).toEqual([
```

Verbatim failure at step 3b (assertion 2, proving it is not merely shadowed by assertion 1):

```
AssertionError: expected [ 'repo' ] to deeply equal []
- Expected
+ Received
- []
+ [
+   "repo",
+ ]
 ❯ e2e/review-flow.test.ts:244:63
```

The step-3b neutralisation was transient: the file was restored from a scratchpad copy immediately
afterwards, and the step-5 green run plus the final `git status --porcelain` confirm the only
surviving test-file change is the two assertions.

`risk-e7h1-008` is therefore **closed**: re-pointing `worktreesDir` at `clonesDir` no longer leaves
the suite green, and AC-11's claim ("fails if any piece of the flow breaks") no longer ships with a
demonstrated counter-example inside its own story.

### Quick checks

Planned for ST-5b: e2e project green, M2 red, revert clean, `npm run check`. All run, as transcribed
above. `npm test` and `npm run build` were **not** run, nor was AC-8's deliberate-type-error spot
check — they belong to ST-6, which is not approved.

### Blockers

None. ST-5b completed.

### Open risks carried forward

- `risk-e7h1-008` — **closed** by this stage.
- AC-8's deliberate-type-error spot check (ST-6) is still owed.
- `risk-e7h1-005` and `risk-e7h1-007` carry forward unchanged.

### Git discipline

No commit, no stage, no branch, no stash. The only git write was
`git checkout -- src/main/container.ts`, reverting the M2 mutation this stage applied itself — the
one write the ST-5b handoff permits. `plan.md` shows as modified in `git status` because a plan
worker is amending it concurrently; this stage did not touch it, nor `state.yaml`, `design.md`,
`spec.md` or `proposal.md`.

### QA handoff

Recommended, together with ST-5. The change now touches the e2e suite's assertions, and the closing
QA should confirm the two new assertions read as intentional and permanent.

### Next action

Return to the orchestrator. ST-6 (full gate: `npm test`, `npm run build`, AC-8 spot check, closeout
evidence) is the remaining stage and requires its own approval.

---

## ST-6 — Full gate + closeout evidence

- approval_reference: checkpoint `cp-008`, ST-6 only (the final execution stage). No further stage
  is approved; closeout belongs to `sddl-qa-review`.
- status: completed
- planned_scope: no code change beyond whatever the gate itself demands. The gate demanded nothing —
  every command below passed on the tree as committed at `02a1267` (`aeb62cb` on top adds only the
  `cp-008` approval record).
- actual_changed_files: none under `src/` or `e2e/`. This log entry is the only artifact written.
  The AC-8 spot check's deliberate type error was introduced and reverted inside this stage; its
  file ends the stage byte-identical to `HEAD`.

### 1. `npm run check`

```
> biome check . && tsc --noEmit && depcruise src

Checked 165 files in 279ms. No fixes applied.

✔ no dependency violations found (107 modules, 254 dependencies cruised)
```

Clean. 165 files is the post-ST-2 count — `e2e/review-flow.test.ts` and `e2e/support/hermetic-git.ts`
are inside the biome and `tsc` scopes, not merely adjacent to them.

### 2. `npm test`

```
 RUN  v4.1.10 /home/user/sentinel-kit

 Test Files  50 passed (50)
      Tests  1039 passed (1039)
   Start at  22:11:56
   Duration  14.92s
```

**1039 = the pre-story 1037 plus exactly the 2 new e2e tests**, across 50 files (49 + 1). The
expected number, hit exactly; no rationalisation needed.

**No pre-existing suite was modified — verified, not assumed.** The story's own commit range is
`e590a73~1..HEAD` (`e590a73` opens `[E7.F1.H1]`):

```
$ git diff --stat e590a73~1..HEAD -- src/ e2e/ tsconfig.json biome.json package.json
 biome.json                  |   1 +
 e2e/review-flow.test.ts     | 343 ++++++++++++++++++++++++++++++++++++++++++++
 e2e/support/hermetic-git.ts | 118 +++++++++++++++
 src/main/container.ts       |  26 +++-
 tsconfig.json               |   2 +-
 5 files changed, 488 insertions(+), 2 deletions(-)

$ git diff --name-only e590a73~1..HEAD -- 'src/**/__test__/**' | wc -l
0
```

Zero files under `src/**/__test__/` touched by the story; `package.json` untouched by it as well
(no new dependency, no new script — AC-8's gate widening rode entirely on `tsconfig.json` and
`biome.json`, per N-2). Note for readers of a `main...HEAD` diff: that wider range also carries the
already-merged `[E6.F2.H2]` TUI work, whose `src/adapters/driving/tui/__test__/**` changes belong to
that story, not this one. The commit-range diff above is the correct scope.

### 3. `npm run build`

```
> tsup

CLI Building entry: {"cli":"src/main/cli.ts"}
CLI Using tsconfig: tsconfig.json
CLI Target: node22
ESM Build start
ESM dist/cli.js 124.20 KB
ESM ⚡️ Build success in 38ms
```

Succeeded. Widening `tsconfig.json#include` to `["src", "e2e"]` did **not** pull `e2e/` into the
bundle: the entry is `src/main/cli.ts` and the output is a single 124.20 KB `dist/cli.js`, the same
shape as before ST-2.

### 4. `node dist/cli.js --version`

```
0.0.0
```

Prints the `package.json` version, as the CI `build` job's final step does.

### AC-8 spot check (risk-e7h1-009) — the gate over `e2e/` is live, not merely configured

ST-2 widened the gate; nothing had yet shown it *rejecting* anything under `e2e/`. Done here, once,
and reverted.

| Step | Action | Result |
|---|---|---|
| 1 | Append `const ac8SpotCheck: number = "not-a-number";` to `e2e/support/hermetic-git.ts` | 3 lines added at EOF |
| 2 | `npx tsc --noEmit` | **FAILED**, exit code `2` |
| 3 | `git checkout -- e2e/support/hermetic-git.ts` | reverted |
| 4 | `git diff e2e/support/hermetic-git.ts` | **empty (0 bytes)** |
| 5 | `npx tsc --noEmit` | exit code `0`, silent |

Verbatim failure at step 2:

```
e2e/support/hermetic-git.ts(121,7): error TS2322: Type 'string' is not assignable to type 'number'.
```

The reported path is the `e2e/` file itself, so the diagnostic came from the widened `include` and
not from some incidental import through `src/`. **AC-8 is met: a type error under `e2e/` fails
`npm run check`.** No file was left mutated — step 4's empty diff is the proof, and the closing
`git status --porcelain` below is the second.

### AC-10 — `.github/workflows/ci.yml` needs no edit

Confirmed by reading the file; not edited.

- The `test` job runs `npm ci` then **`npm test`** — the bare script, `vitest run` with no
  `--project` filter. `vitest.config.ts` declares three projects (`core`, `adapters`, `e2e`) and a
  filterless `vitest run` executes all of them, which is exactly what the local run above did
  (50 files / 1039 tests spans all three).
- That job carries `strategy.matrix.node: [22, 24]`, so the e2e smoke runs on **both** Node 22 and
  Node 24 with no per-project configuration.
- The `build` job already ends with `node dist/cli.js --version`, mirroring step 4 above.
- Hermeticity on a bare runner was checked too, since AC-10 is about CI and not only about this
  machine: `e2e/support/hermetic-git.ts` passes the commit identity per invocation via
  `-c user.email=… -c user.name=…` and pins `GIT_CONFIG_GLOBAL=/dev/null`,
  `GIT_CONFIG_SYSTEM=/dev/null`, `GIT_TERMINAL_PROMPT=0`. A runner with no `~/.gitconfig` and no
  configured identity still produces commits, and no ambient `commit.gpgsign` or `init.defaultBranch`
  can reach the fixture.

**No workflow change is required for AC-10, and none was made.**

### risk-e7h1-011 — closed, not carried

ST-5b's re-applied M2 turned the suite RED (`ENOENT … /worktrees` at `e2e/review-flow.test.ts:237`,
and independently `expected [ 'repo' ] to deeply equal []` at `:244`), then green after the revert.
The blind spot ST-5 found is closed by a demonstrated failure, not by an accepted note.

**Documentation defect worth one line (not a code defect):** the ST-5b entry above labels that
closure `risk-e7h1-008` in three places, while `plan.md` Amendment 1 and `state.yaml` register the
M2 blind spot as **`risk-e7h1-011`** (`risk-e7h1-008` is the ST-2 quality-gate interaction risk,
retired at ST-2). The evidence and the conclusion are correct; only the id is mistyped. Prior log
entries are append-only history and were **not** rewritten — flagged here for `sddl-qa-review` to
correct in `state.yaml`/`qa-report.md` if it wants the ids to reconcile.

### Quick checks

Planned for ST-6: `npm run check`, `npm test`, `npm run build`, `node dist/cli.js --version`, the
AC-8 spot check, and the AC-10 reading. **All six were run**; nothing was skipped and nothing was
deferred. Not run, deliberately: any new test, any change to a pre-existing suite, and any workflow
edit — all outside this stage.

### Blockers

None. The gate demanded no change.

### Open risks carried forward

- `risk-e7h1-009` — **closed** by the AC-8 spot check above.
- `risk-e7h1-011` — **closed** by ST-5b, confirmed here.
- `risk-e7h1-005` (test-only `engineOverride` seam living in production code) and `risk-e7h1-007`
  (AC-7 verified by reading the diff rather than by a test) carry forward unchanged and were
  accepted at plan time.
- New, cosmetic: the `risk-e7h1-008` / `risk-e7h1-011` id mismatch in the ST-5b entry, above.

### Ending state

```
$ git status --porcelain
(empty before this entry was written; only this file afterwards)
```

No net change under `src/` or `e2e/`. `state.yaml`, `plan.md`, `design.md`, `spec.md` and
`proposal.md` were not touched by this stage.

### Git discipline

No commit, no push, no stage, no branch, no stash. The only git write was
`git checkout -- e2e/support/hermetic-git.ts`, reverting the AC-8 type error this stage introduced
itself — the one write the ST-6 handoff permits.

### QA handoff

**Recommended, in `final` mode.** Every planned stage is executed and the full gate is green, so the
change is ready for closing QA. Suggested independent re-verification: re-run one ST-5 mutation
(prefer **M2**, the one whose behaviour ST-5b changed) and confirm it goes red, then confirm
`git status --porcelain` is clean afterwards. `sddl-executor` does not claim completion.

### Next action

Return to the orchestrator. No execution stage remains; route to `sddl-qa-review` (final mode).
