# Spec

## Routing Digest

- change_name: e4-f2-h3-cascading-engine-resolution
- objective: new-feature
- route: continue-lite
- digest_summary: >-
    A pure core function `resolveEngine` implementing the run > repo >
    global precedence (PRD §3.1-D/§6.2), backed by a single shared
    `EngineNameSchema` (extracted from `config-schemas.ts`) as the one source
    of truth for known engine names. `RunReviewRequest`/`RunReviewResult`
    gain a symmetrical, optional `engineName` echo field so a caller that
    resolved an engine can carry that fact through a run without `runReview`
    itself knowing about resolution. No adapter or CLI changes.
- scope_digest: >-
    In: `resolveEngine` (new file, run module), `UnknownEngineError`, the
    shared `EngineNameSchema` extraction, the `engineName` echo field on
    `RunReviewRequest`/`RunReviewResult`, unit tests. Out: CLI `--engine`
    flag, composition-root wiring, `RunStore`/history persistence, new
    engines.
- acceptance_digest: >-
    9 ACs: 3-level precedence (run > repo > global), unknown-name rejection
    at each level, single-source-of-truth engine list, `runReview`'s own
    pipeline untouched beyond the echo field, symmetrical presence/absence
    of `engineName` between request and result.

## Summary

- change_name: e4-f2-h3-cascading-engine-resolution
- objective: new-feature
- route: continue-lite
- spec_status: complete

## Scope Boundary

### In Scope

- New pure function `resolveEngine(input): EngineName` in
  `src/core/run/resolve-engine.ts` (public API of the `run` module),
  precedence `runOverride > repoOverride > globalDefault`. `globalDefault`
  is a required input (the schema already guarantees `GlobalConfig` always
  carries one via its zod `.default()`), so there is no "all three absent"
  case to design for.
- `UnknownEngineError` (new, `run` module, extends the module's existing
  error family) thrown when the resolved value — the first non-empty one in
  precedence order — is not a recognized engine name. The message names both
  the offending value and which cascade level it came from.
- Extract `EngineNameSchema = z.enum(["claude-code", "opencode"])` in
  `src/core/repos/ports/config-schemas.ts`, and reuse it from
  `GlobalConfigSchema.defaultEngine` and `RepoEntrySchema.defaultEngine`
  (replacing their inline enum literals) so the known-engine set has exactly
  one definition in the codebase. Re-exported from `repos/index.ts`, imported
  by `resolveEngine` the same way `run-review.ts` already imports `GitPort`
  from `../repos/index.js` (guard: core modules interop only via public
  `index`).
- `RunReviewRequest` gains an optional `readonly engineName?: string` field;
  `RunReviewResult` gains the same field, echoed verbatim when the request
  carried one and omitted otherwise (following the file's existing
  optional-field convention, e.g. `verdict`, `prompt`). `runReview` does not
  call `resolveEngine` itself — resolution is the caller's job, done before
  constructing `RunReviewDeps.engine`; the echo field only carries the
  already-resolved fact through so a result consumer without a `RunStore`
  can still see which engine ran.
- Unit tests: full precedence matrix (8 presence/absence combinations across
  the 3 levels), unknown-name rejection at each level, `EngineNameSchema`
  reuse (no literal duplication), and `runReview`'s echo-through behavior in
  both directions (present/absent).

### Out Of Scope

- CLI `--engine` flag parsing (`src/adapters/driving/cli/index.ts` is still
  a scaffold; wiring belongs to `E6.F1`, which itself depends on this story
  per the backlog).
- Composition-root wiring translating a resolved `EngineName` into a
  constructed `ReviewEngine` adapter instance (`src/main/`, not touched by
  this story — no adapter files change).
- `RunStore`/history persistence — `src/core/history/` does not exist yet in
  this repo; "recorded in run metadata" is satisfied by the `engineName`
  echo field on `RunReviewResult`, not by a store write.
- Any new `ReviewEngine` implementation.

### Non-Goals

- Making `runReview` resolve its own engine internally — resolution stays a
  separate, composable step so `run-review.ts`'s existing pipeline (worktree
  → diff → prompt → engine → parse → cleanup) is not restructured.
- Retrofitting `EngineNameSchema` reuse into the two adapter modules
  (`claude-code`/`opencode`) — they already hardcode their own identity and
  do not read this enum.

## Expected Behavior

| Scenario | Expected Outcome | Evidence Or Notes |
|---|---|---|
| Only `globalDefault` provided | Resolves to `globalDefault` | Base case |
| `repoOverride` set, `runOverride` absent | Resolves to `repoOverride`, ignoring `globalDefault` | Repo wins over global |
| `runOverride` set, `repoOverride` also set | Resolves to `runOverride` | Run wins over repo (and transitively over global) |
| `runOverride` is an unrecognized string (e.g. `"codex"`) | Throws `UnknownEngineError` naming `"codex"` and `"run"` as the source | Validation applies to whichever level wins, not just the global default |
| `repoOverride` unrecognized but shadowed by a valid `runOverride` | Resolves to `runOverride`; the invalid `repoOverride` is never validated or reported | Validation only ever inspects the winning value — an overridden invalid value is not an error |
| `runReview` called with `request.engineName` set | `result.engineName` echoes the same value | No dependency on `resolveEngine` inside `run-review.ts` |
| `runReview` called without `request.engineName` | `result.engineName` is absent (key not present) | Symmetrical with existing optional-field omission pattern |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-1 | `resolveEngine` returns `runOverride` whenever it is provided and non-empty, regardless of `repoOverride`/`globalDefault` | Unit test, run-wins case | must |
| AC-2 | `resolveEngine` returns `repoOverride` whenever `runOverride` is absent and `repoOverride` is provided | Unit test, repo-wins case | must |
| AC-3 | `resolveEngine` returns `globalDefault` whenever both `runOverride` and `repoOverride` are absent | Unit test, global-fallback case | must |
| AC-4 | `resolveEngine` throws `UnknownEngineError` when the winning (precedence-resolved) value is not in `EngineNameSchema`'s enum | Unit test, one case per cascade level winning with an invalid value | must |
| AC-5 | `UnknownEngineError`'s message includes both the invalid value and the cascade level (`"run"`/`"repo"`/`"global"`) it came from | Unit test asserting on `error.message` | should |
| AC-6 | `EngineNameSchema` is defined exactly once (`repos/ports/config-schemas.ts`) and reused by `GlobalConfigSchema.defaultEngine`, `RepoEntrySchema.defaultEngine`, and `resolveEngine` — no second literal `["claude-code","opencode"]` list anywhere in `src/` | Grep-verified during QA; existing `ConfigStore` contract/schema tests still pass unmodified | must |
| AC-7 | `RunReviewRequest.engineName` and `RunReviewResult.engineName` are both optional; when the request sets it, the result echoes the identical value | Unit test on `runReview` (fake engine + fake git, minimal happy path) | must |
| AC-8 | When `request.engineName` is absent, `result.engineName` is absent (the key is not present on the result object, not `undefined`-valued) | Unit test using `"engineName" in result` or `Object.hasOwn` | must |
| AC-9 | `run-review.ts`'s pipeline stages, `RunStage` union, and `classifyFailure` are unchanged by this story — the only diff to that file is the two-field echo-through | Diff review at QA: `git diff` scoped to `run-review.ts` shows no stage/control-flow changes | must |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| `EngineNameSchema` extraction touches `repos/ports/config-schemas.ts`, a file outside the `run` module | Low — this module already owns the enum; extraction is a pure refactor, `z.infer` types are unchanged so `GlobalConfig`/`RepoEntry`'s public shape does not change | Existing `ConfigStore` contract suite and `repos` unit tests are the regression guard; no new zod behavior, only where the literal enum instance is declared |
| `resolveEngine` living outside `runReview` means nothing enforces a caller actually calls it before invoking `runReview` | Low — deliberate: this story's scope is resolution + optional echo-through, not enforcement. Composition-root wiring (`E6.F1`) is where "always resolve before running" becomes a real invariant | Documented as a non-goal, not silently assumed |
| Unknown-engine validation only inspects the winning value, never a shadowed lower-precedence one | None — matches how config validation already works elsewhere (e.g. an unused `repos.yaml` entry is never parsed against a schema it doesn't apply to) | Explicit scenario row above, not left implicit |

## Open Questions And Decisions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| Should H2 (opencode adapter) be merged before this story starts? | Proposal's open question 3 | spec | **resolved**: PR #67 merged to `main` 2026-08-22; both `[E4.F2.H1]` and `[E4.F2.H2]` are now fully merged, no blocker |
| Where does the per-run override enter the core? | Proposal's open question 1 | spec | **resolved**: a separate `resolveEngine` function, not a new `runReview` internal step (see Scope Boundary / Non-Goals) |
| Exact shape of "engine used" in run metadata | Proposal's open question 2 | spec | **resolved**: symmetrical optional `engineName` echo field on `RunReviewRequest`/`RunReviewResult`, since no `RunStore` exists yet (AC-7/AC-8) |

## Approval Notes

- User approved advancing directly ("quiero continuar con el sdd") — proposal-stage checkpoint treated as implicitly approved advancement into spec; this spec's own checkpoint is presented below since it resolves 3 previously-open questions into firm decisions.

## Budget Notes

- Target roughly 300 to 500 words plus tables for the full artifact when possible.
