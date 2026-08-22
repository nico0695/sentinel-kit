# Design

## Routing Digest

- change_name: e4-f2-h3-cascading-engine-resolution
- objective: new-feature
- route: continue-lite
- design_digest: >-
    3 files touched, 1 new: `repos/ports/config-schemas.ts` gains a shared
    `EngineNameSchema` (refactor, types unchanged); `run/resolve-engine.ts`
    is new (pure function + `UnknownEngineError`, following `RunError`'s
    existing subclass pattern); `run/run-review.ts` gains a 2-field
    echo-through (`engineName` on request and result) with zero pipeline
    changes. `run/index.ts` barrel gains the new exports.
- affected_areas_digest: >-
    src/core/repos/ports/config-schemas.ts (refactor) ·
    src/core/run/resolve-engine.ts (new) ·
    src/core/run/run-review.ts (2-field addition) ·
    src/core/run/index.ts (barrel exports). No adapters, no src/main/, no
    CLI. Two new test files.

## Summary

- change_name: e4-f2-h3-cascading-engine-resolution
- objective: new-feature
- route: continue-lite
- design_status: complete

## Design Overview

The change is entirely inside `src/core/`, split into two independent pieces
that only meet at the barrel export:

1. **`EngineNameSchema` extraction** (`repos/ports/config-schemas.ts`).
   `GlobalConfigSchema.defaultEngine` and `RepoEntrySchema.defaultEngine`
   currently each inline `z.enum(["claude-code", "opencode"])`. Extract:

   ```ts
   export const EngineNameSchema = z.enum(["claude-code", "opencode"]);
   export type EngineName = z.infer<typeof EngineNameSchema>;
   ```

   and reference it from both fields (`EngineNameSchema.default("claude-code")`,
   `EngineNameSchema.optional()`). `z.infer<typeof GlobalConfigSchema>` and
   `RepoEntry` are structurally unchanged — this is a pure refactor, not a
   contract change. Re-exported from `repos/index.ts` alongside the existing
   schema exports (AC-6).

2. **`resolveEngine`** (new file `run/resolve-engine.ts`, run module's public
   API). Signature:

   ```ts
   export interface ResolveEngineInput {
     readonly globalDefault: EngineName;
     readonly repoOverride?: string;
     readonly runOverride?: string;
   }

   export function resolveEngine(input: ResolveEngineInput): EngineName {
     const level =
       input.runOverride !== undefined
         ? ("run" as const)
         : input.repoOverride !== undefined
           ? ("repo" as const)
           : ("global" as const);
     const value =
       input.runOverride ?? input.repoOverride ?? input.globalDefault;
     const parsed = EngineNameSchema.safeParse(value);
     if (!parsed.success) {
       throw new UnknownEngineError(value, level);
     }
     return parsed.data;
   }
   ```

   `globalDefault` is typed `EngineName` (not `string`), not `string | undefined`
   — the caller already parsed `GlobalConfig` through `GlobalConfigSchema`
   upstream, so an invalid global default is structurally unreachable here;
   only `repoOverride`/`runOverride` (raw strings — a CLI flag, a `repos.yaml`
   entry — arrive unparsed) need `resolveEngine`'s own validation. This keeps
   AC-4's "throws on the winning value" behavior honest: the global level can
   still "win" (AC-3) without ever being a validation target, because it was
   already validated by the schema it came from.

3. **`UnknownEngineError`** (new class in `run-errors.ts`, alongside the
   existing `RunError` subclasses, same pattern — `Error` suffix, no `cause`
   since this is a deterministic input-shape failure, not a wrapped
   exception):

   ```ts
   export class UnknownEngineError extends RunError {
     constructor(value: string, level: "run" | "repo" | "global") {
       super(`Unknown engine "${value}" from ${level} override`);
       this.name = "UnknownEngineError";
     }
   }
   ```

   Deliberately NOT added to `classifyFailure`'s `validation-failed` mapping
   in `run-review.ts` — `resolveEngine` is called before `runReview` even
   starts (Non-Goal: `runReview` does not call it), so there is no pipeline
   stage for it to be thrown from. A future composition-root caller
   (`E6.F1`) that calls `resolveEngine` before `runReview` is responsible for
   handling this error itself.

4. **`RunReviewRequest`/`RunReviewResult` echo field** (`run-review.ts`).
   One field each, following the file's existing optional-field pattern
   exactly (see `prompt`/`diff`/`usage`):

   ```ts
   // RunReviewRequest
   readonly engineName?: string;
   // RunReviewResult
   readonly engineName?: string;
   ```

   In `runReview`'s return-object construction (the spread-based optional-field
   block at the end of the function), add one more conditional spread:
   `...(request.engineName !== undefined ? { engineName: request.engineName } : {})`.
   No other line in the file changes — `RunStage`, `classifyFailure`,
   `executePipeline`'s stages, and `performCleanup` are all untouched (AC-9).

## Affected Areas

| Area | Change | Reason |
|---|---|---|
| `src/core/repos/ports/config-schemas.ts` | Extract `EngineNameSchema`/`EngineName`, reference from both existing enum fields | AC-6 single source of truth |
| `src/core/repos/index.ts` | Add `EngineNameSchema`, `EngineName` to barrel exports | Makes the shared schema reachable from `run` module per the core-to-core-via-index guard |
| `src/core/run/resolve-engine.ts` (new) | `resolveEngine` function + `ResolveEngineInput` type | AC-1/AC-2/AC-3/AC-4/AC-5 |
| `src/core/run/run-errors.ts` | Add `UnknownEngineError` | AC-4/AC-5 |
| `src/core/run/run-review.ts` | Add `engineName?: string` to `RunReviewRequest` and `RunReviewResult`; one conditional spread in the return construction | AC-7/AC-8/AC-9 |
| `src/core/run/index.ts` | Export `resolveEngine`, `ResolveEngineInput`, `UnknownEngineError` | Public API of the module (guard: use cases/functions are the only API) |
| `src/core/run/__test__/resolve-engine.test.ts` (new) | Precedence matrix + unknown-name cases | AC-1..AC-5 |
| `src/core/repos/__test__/config-schemas.test.ts` (new, or extend an existing repos test file if one already covers schema shape) | Confirms `EngineNameSchema` reuse produces identical validation behavior to the pre-refactor inline enums | AC-6 regression guard |
| `src/core/run/__test__/run-review.test.ts` (existing) | Two new cases: echo present, echo absent | AC-7/AC-8 |

## Interfaces, Data, And State

- No new port, no new adapter, no persisted state. `resolveEngine` is a pure
  function (no I/O, no `deps` parameter) — it does not need dependency
  injection because it has nothing to inject.
- `EngineName` becomes the canonical type for "a known engine identifier";
  `resolveEngine`'s return type and `GlobalConfig.defaultEngine`'s type both
  narrow to it, so a caller composing them (future `E6.F1` work) gets
  compile-time alignment instead of a raw `string` on one side.
- `RunReviewRequest.engineName`/`RunReviewResult.engineName` are plain
  `string`, not `EngineName` — deliberate: `runReview` has no reason to
  depend on the `repos` module's engine enum just to echo a caller-supplied
  label, and importing it there would create a needless cross-module
  coupling for a field `runReview` never inspects or validates.

## Alternatives And Trade-Offs

| Alternative | Why Not Chosen |
|---|---|
| Fold `resolveEngine` directly into `runReview` (accept `globalDefault`/`repoOverride`/`runOverride` on `RunReviewRequest` instead of a pre-resolved `engineName`) | Rejected in spec (Non-Goal): would make `runReview` responsible for config-cascade knowledge it doesn't otherwise need, and couples the pipeline's `RunReviewRequest` to config shapes from the `repos` module beyond the single opaque `engineName` string. Keeping resolution external matches the existing pattern where `runReview` receives an already-constructed `ReviewEngine` instance, not the means to select one. |
| Type `RunReviewRequest.engineName`/`RunReviewResult.engineName` as `EngineName` instead of `string` | Rejected: would force `run-review.ts` to import `EngineName` from `repos/index.ts` for a field it only ever copies, not inspects — an avoidable cross-module dependency for zero behavioral gain. |
| Keep the two inline `z.enum([...])` literals instead of extracting `EngineNameSchema` | Rejected: AC-6 explicitly requires one source of truth; a third inline copy inside `resolveEngine` would make three literal lists to keep in sync instead of one. |

## Open Technical Questions

None. All three of spec's open questions were already resolved as firm
decisions; design surfaced no new one — `resolveEngine`'s pure-function shape
and the `EngineNameSchema` extraction are both direct, low-risk applications
of patterns already present in the codebase (`RunError` subclass family,
`z.infer`-derived domain types).

## Approval Notes

- User approved spec.md ("si") and this stage proceeds under the same
  advancement; design checkpoint presented below since it introduces one
  design-level decision beyond spec (the `EngineNameSchema` extraction
  location and shape) for explicit sign-off before planning execution
  stages.

## Budget Notes

- Target roughly 400 to 600 words plus tables when possible.
