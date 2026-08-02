# Plan

## Execution Digest

- change_name: e0-f2-h2-fake-engine
- objective: new-feature
- route: continue-lite
- digest_summary: One precondition (`npm ci`, node_modules absent) + one code-touching stage (S1) that writes 4 new files and edits 4, in leaf→consumer→index→test-infra→config order, gated by `npm run check` (exit 0, all five guards, depcruise skips `__test__/`) + `npm test` (`vitest run` green, adapters tests executed non-vacuously) + an AC-8 diff-scope check over exactly 8 paths. Design is FROZEN; transcribe its signatures/edits verbatim.
- stage_plan_digest: P0 precondition (`npm ci`) → S1 single code stage (FakeEngine adapter + shared contract suite + fake test + vitest 3-project config + depcruise exclude + biome includes + package.json test flag) → acceptance gate.
- validation_digest: `npm run check` = 0 violations; `npm test` = `vitest run` exit 0 with >0 adapters tests run and empty core/e2e not failing the aggregate (risk-003 proof point); `git diff --name-only` = exactly the 8 enumerated paths (AC-8).

## Summary

- change_name: e0-f2-h2-fake-engine
- objective: new-feature
- route: continue-lite
- planner_terminal: true
- execution_ready: false
- plan_status: success

Terminal planner stage. After this artifact the flow HALTS at the executor gate for explicit user approval (the code-touching stage ALWAYS requires explicit OK, even under auto — dec-003). The plan is a single cohesive code stage: the change is bounded (one adapter folder + test infra + config), the eight edits are interdependent (the tree must be consistent to typecheck and to run), and no intermediate gate is meaningful mid-stage. Splitting would create filler stages with no independent validation value, so S1 stays atomic.

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| P0 | Restore toolchain: `npm ci` (node_modules ABSENT, package-lock PRESENT) | — | No source change; installs vitest 4.1.10, biome 2.5.6, typescript 5.9.3, dependency-cruiser 18.1.0, @types/node | `npm ci` exit 0; `node_modules/.bin/vitest` present | No | No (env prep) | pending |
| S1 | Implement FakeEngine adapter + shared ReviewEngine contract suite + fake test + first vitest 3-project config + depcruise `__test__/` exclude + biome includes + package.json test flag | P0 | The 8 files below, written in the fixed order | Acceptance gate (see Validation Strategy) | Yes | **Yes — explicit user OK at executor gate** | pending |

### S1 file order (leaf → port-consumer → index → test-infra → config; transcribe design.md exactly)

1. `src/adapters/driven/engines/fake/fake-engine.ts` (NEW) — `import type { ReviewEngine, ReviewRequest, ReviewResult } from "../../../../core/run/index.js";`; `FakeReviewOutcome = {readonly ok:true; readonly result:ReviewResult} | {readonly ok:false; readonly error:Error}`; `FakeEngineScript = FakeReviewOutcome | readonly FakeReviewOutcome[]`; `export function createFakeEngine(script: FakeEngineScript): ReviewEngine`. `async review()` consumes the next scripted outcome → returns `result` or `throw`s the plain `error`; single outcome repeats; array consumed in order; past-end rejects with a plain `Error`; `noUncheckedIndexedAccess`-safe exhaustion branch. No `timeoutMs`, no verdict/TerminalState, no typed port error (dec-004).
2. `src/adapters/driven/engines/index.ts` (EDIT) — replace `export {};` with `export { createFakeEngine } from "./fake/fake-engine.js";` + `export type { FakeEngineScript, FakeReviewOutcome } from "./fake/fake-engine.js";`
3. `src/adapters/driven/engines/__test__/ReviewEngine.contract.ts` (NEW) — `import { describe, it, expect } from "vitest";` + `import type { ReviewEngine, ReviewUsage } from "../../../../core/run/index.js";`; `export interface ReviewEngineContractHarness { readonly resolving: (output: string, usage?: ReviewUsage) => ReviewEngine; readonly rejecting: () => ReviewEngine }`; `export function reviewEngineContract(harness, label?): void`. Builds a minimal `ReviewRequest` inline; success → resolves with `output === config` + usage propagation, and `expect(result.usage).toBeUndefined()` when omitted (AC-4); `rejecting()` → `await expect(review(req)).rejects.toThrow()` + `instanceof Error` (AC-3). Harness builds `{output}` vs `{output, usage}` conditionally for `exactOptionalPropertyTypes`. Imports ONLY vitest + core types — never FakeEngine (AC-2).
4. `src/adapters/driven/engines/__test__/fake-engine.test.ts` (NEW) — imports `createFakeEngine` from `../index.js` (proves reachability, dec-006); builds a harness over `createFakeEngine`; calls `reviewEngineContract(harness, "FakeEngine")`.
5. `vitest.config.ts` (root, NEW) — `defineConfig` with three `test.projects` core/adapters/e2e, each `environment: "node"`, non-overlapping includes: core=`src/core/**/__test__/**/*.test.ts`, adapters=`src/adapters/**/__test__/**/*.test.ts`, e2e=`e2e/**/*.test.ts`. Only adapters matches files now.
6. `.dependency-cruiser.cjs` (EDIT) — add `options.exclude: { path: "(^|/)__test__/" }` (additive; no exclude key today).
7. `biome.json` (EDIT) — add `"vitest.config.ts"` to `files.includes` (dec-008).
8. `package.json` (EDIT) — `test`: `vitest run --passWithNoTests` → `vitest run`.

Optional deferred coverage (design Open-Q): an array-script multi-call sequence test in `fake-engine.test.ts`. **Recommendation: INCLUDE a minimal multi-call assertion** (script an array of two outcomes, assert order + past-end rejection) — it directly exercises the array/exhaustion branches that single-outcome contract scenarios never touch, at negligible cost. If it would bloat S1, drop it as OPTIONAL — AC-1..AC-9 all pass with single-outcome engines regardless.

## Validation Strategy

**Per-stage:**
- P0: `npm ci` exits 0; `node_modules/` present.
- S1 acceptance gate (all three must hold):
  1. **`npm run check` exit 0** — `biome check . && tsc --noEmit && depcruise src`, 0 violations. Proves all five architecture guards green, depcruise skips `(^|/)__test__/`, and the new `vitest.config.ts` is linted (biome includes edit). (AC-7, AC-9)
  2. **`npm test` exit 0** — `vitest run` (flag removed) with the **adapters** project executing >0 real, non-vacuous tests, AND empty **core**/**e2e** projects NOT failing the aggregate run. This is the risk-003 empirical proof point. (AC-5, AC-6, AC-9)
  3. **AC-8 diff-scope check** — `git diff --name-only` lists ONLY these 8 paths: `src/adapters/driven/engines/fake/fake-engine.ts`, `src/adapters/driven/engines/index.ts`, `src/adapters/driven/engines/__test__/ReviewEngine.contract.ts`, `src/adapters/driven/engines/__test__/fake-engine.test.ts`, `vitest.config.ts`, `.dependency-cruiser.cjs`, `biome.json`, `package.json`. No core-port/type change, no typed error, no src/main wiring, no real-engine adapter, no verdict/TerminalState. (biome.json is IN-scope per dec-008.)

## Dependencies And Sequencing

- P0 → S1: `npm ci` MUST run first; no `check`/`test` command can execute without the toolchain (node_modules absent).
- Within S1, follow the leaf→consumer→index→test-infra→config order (steps 1–8 above) so the tree is import-consistent at typecheck: `fake-engine.ts` before `index.ts` re-exports it; the contract suite before the fake test that imports the harness pattern; `vitest.config.ts` before `npm test`; `.dependency-cruiser.cjs` + `biome.json` + `package.json` before the gate.
- The gate runs once, after all 8 edits — no intermediate gate is meaningful mid-tree.

## Acceptance Criteria Traceability

| AC | Proven By |
|---|---|
| AC-1 | S1 step 1 (FakeEngine implements frozen `ReviewEngine`) + step 4 running `reviewEngineContract` green; H1 port files unmodified (AC-8 diff check confirms no `src/core/run` change) |
| AC-2 | S1 step 3 — suite parameterized over `ReviewEngineContractHarness`, imports only vitest + core types, never FakeEngine internals |
| AC-3 | S1 step 3 — `rejecting()` scenario asserts `rejects.toThrow()` + `instanceof Error`; success/ambiguous resolve a `ReviewResult` with string `output` |
| AC-4 | S1 step 3 — usage propagation assertion (deep-equal when supplied) + `expect(result.usage).toBeUndefined()` when omitted |
| AC-5 | S1 step 8 (flag removed) + gate check 2 (`npm test` green, adapters tests >0 executed) |
| AC-6 | S1 step 5 (three projects declared) + gate check 2 (aggregate `vitest run` green with only adapters populated; core/e2e zero-file, non-failing) |
| AC-7 | S1 steps 3–4 co-located under `__test__/` + step 6 precise `(^|/)__test__/` exclude + gate check 1 (`npm run check` exit 0, guards green) |
| AC-8 | Gate check 3 (`git diff --name-only` = exactly the 8 paths; biome.json ratified in-scope per dec-008) |
| AC-9 | Gate checks 1 + 2 both exit 0 before PR |

## Rollback

Single-stage, fully reversible:
- Delete the NEW files: `src/adapters/driven/engines/fake/` (fake-engine.ts + dir), `src/adapters/driven/engines/__test__/` (ReviewEngine.contract.ts + fake-engine.test.ts + dir), `vitest.config.ts`.
- Revert the 4 EDITs: `src/adapters/driven/engines/index.ts` back to `export {};`; remove `options.exclude` from `.dependency-cruiser.cjs`; revert `biome.json` `files.includes` (drop `"vitest.config.ts"`); restore `package.json` `test` to `vitest run --passWithNoTests`.
- Equivalent shortcut on a clean branch: `git checkout -- <8 paths>` + `rm -r` the two new dirs and `vitest.config.ts`. P0 (`npm ci`) needs no rollback (env-only).

## Planner Stop Note

- `objective` is `new-feature` on a `continue-lite` route, but `sddl-plan` is the terminal formalization stage for this planner objective: **this is the last planning artifact**. The change advances to `lifecycle_status: planned`.
- `next_action` does NOT auto-route to execution. The flow HALTS at the executor gate for explicit user approval (dec-003: the code-touching stage always needs explicit OK, even under auto). `execution_ready: false` until that approval.

## Approval Notes

- No new B-level decision surfaced during planning. All constraints (dec-004..dec-008) are inherited and baked into S1.
- One A-level planner recommendation: include the minimal array-script multi-call test (see S1 Optional). Reversible, within scope; executor may drop it if it bloats the stage.
- One inherited low-risk A-level assumption (design): e2e include points at a not-yet-existing `e2e/` root — commits zero files, freely changeable when E-level e2e lands. Non-blocking.
- Executor gate: present the S1 plan + the three-part acceptance gate; recommended options — approve and start S1, stop as planned, or revise.

## Budget Notes

- Proportional single-stage plan for a bounded adapter + test-infra change; interfaces transcribed verbatim from the frozen design so `sddl-executor` needs no reinterpretation.
