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
| ST-2 | Bring `e2e/` into the quality gate (d-004, AC-8) | pending | pending |
| ST-3 | Hermetic fixture + happy-path smoke (S1-S4) | pending | pending |
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
