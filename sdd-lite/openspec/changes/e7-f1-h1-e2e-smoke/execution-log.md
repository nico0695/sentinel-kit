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
| ST-4 | Negative case (S5) | pending | pending |
| ST-5 | AC-11 mutation verification | pending | pending |
| ST-6 | Full gate + closeout evidence | pending | pending |

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
