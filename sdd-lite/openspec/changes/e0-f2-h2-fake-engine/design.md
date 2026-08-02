# Design

## Routing Digest

- change_name: e0-f2-h2-fake-engine
- objective: new-feature
- route: continue-lite
- digest_summary: FakeEngine adapter (`createFakeEngine` factory scripting resolve/reject outcomes) + a fake-agnostic parameterized `ReviewEngine.contract` suite driven by a harness of scenario factories + first three-project vitest config + precise `(^|/)__test__/` depcruise exclude + `--passWithNoTests` removal + biome includes for the config file. No core-port, no src/main, no typed port error.
- affected_areas_digest: `src/adapters/driven/engines/{index.ts,fake/fake-engine.ts,__test__/ReviewEngine.contract.ts,__test__/fake-engine.test.ts}`, root `vitest.config.ts`, `.dependency-cruiser.cjs` (add `options.exclude`), `biome.json` (add config file to includes), `package.json` (test script).
- interfaces_digest: `createFakeEngine(script: FakeEngineScript): ReviewEngine`; `FakeReviewOutcome = {ok:true;result:ReviewResult} | {ok:false;error:Error}`; `FakeEngineScript = FakeReviewOutcome | readonly FakeReviewOutcome[]`; `reviewEngineContract(harness: ReviewEngineContractHarness, label?: string): void` with `harness = { resolving(output, usage?) => ReviewEngine; rejecting() => ReviewEngine }`.

## Summary

- change_name: e0-f2-h2-fake-engine
- objective: new-feature
- route: continue-lite
- design_status: success

Implement the FakeEngine as a shipped driven adapter (used later by e2e smoke, so it lives in production `src`, not in `__test__`), expose it through the engines public index, and add a shared, fake-agnostic contract suite the future claude-code/opencode adapters reuse verbatim. Stand up the vitest three-project layout, remove `--passWithNoTests`, and exempt only test infra from the architecture guards.

## Design Overview

- **FakeEngine (production):** `createFakeEngine(script)` returns an object implementing `ReviewEngine`. `review()` is `async`; it consumes the next scripted outcome and either returns the outcome's `ReviewResult` or `throw`s the outcome's plain `Error` (throwing in an async fn rejects the promise — dec-004; no typed port error, no `timeoutMs` enforcement, no verdict/TerminalState). A single-outcome script repeats on every call; an array script is consumed in order, and a call past the end rejects with a plain `Error` (`noUncheckedIndexedAccess` makes the exhaustion branch explicit).
- **Contract suite (test infra, fake-agnostic):** `reviewEngineContract(harness, label?)` calls vitest `describe/it`. It builds a minimal valid `ReviewRequest` internally and, via the caller-supplied `harness` factories, obtains a fresh engine per scenario and asserts the port contract. It imports **only** `vitest` + core port **types** — never FakeEngine (AC-2). Reuse assertion: rejection is checked as `instanceof Error` (base class), so a future E4 `EngineError extends Error` still satisfies it while the fake supplies a plain `Error` (AC-3).
- **FakeEngine test:** imports `createFakeEngine` from the engines public index (`../index.js`) — proving reachability (dec-006) — builds the harness, and calls `reviewEngineContract(harness, "FakeEngine")`.
- **vitest.config.ts:** `defineConfig` with three `test.projects` (`core`, `adapters`, `e2e`), each `environment: "node"`, non-overlapping `include` globs; only `adapters` matches files today. Empty `core`/`e2e` do not fail the aggregate run because ≥1 test file exists overall (vitest 4 aggregate `passWithNoTests` semantics) — proven at the executor gate (risk-003).
- **depcruise:** add `options.exclude: { path: "(^|/)__test__/" }` so `depcruise src` never cruises test code (which imports vitest). Matches only a `__test__/` path segment; no production file path contains it.
- **biome:** add `"vitest.config.ts"` to `files.includes` (mirrors `tsup.config.ts`) so the new config is linted/formatted; `src/**` already covers the new adapter + test files.
- **package.json:** `test` = `vitest run` (drop `--passWithNoTests`).

## Affected Areas

| Path Or Module | Planned Change | Risk |
|---|---|---|
| `src/adapters/driven/engines/fake/fake-engine.ts` | New: `createFakeEngine` + `FakeReviewOutcome`/`FakeEngineScript` types; imports core port types via `../../../../core/run/index.js` | low |
| `src/adapters/driven/engines/index.ts` | Replace `export {};` with `export { createFakeEngine }` + `export type { FakeEngineScript, FakeReviewOutcome }` from `./fake/fake-engine.js` | low |
| `src/adapters/driven/engines/__test__/ReviewEngine.contract.ts` | New shared suite `reviewEngineContract(harness, label?)`; imports vitest + core types (`../../../../core/run/index.js`) only | low |
| `src/adapters/driven/engines/__test__/fake-engine.test.ts` | New: harness over `createFakeEngine`, invokes the shared suite | low |
| `vitest.config.ts` (root, new) | Three projects; only `adapters` populated | med |
| `.dependency-cruiser.cjs` | Add `options.exclude: { path: "(^|/)__test__/" }` | med |
| `biome.json` | Add `vitest.config.ts` to `files.includes` | low |
| `package.json` | `test`: drop `--passWithNoTests` | low |

## Interfaces, Data, And State

```ts
// fake/fake-engine.ts
import type { ReviewEngine, ReviewRequest, ReviewResult }
  from "../../../../core/run/index.js";
export type FakeReviewOutcome =
  | { readonly ok: true;  readonly result: ReviewResult }
  | { readonly ok: false; readonly error: Error };
export type FakeEngineScript = FakeReviewOutcome | readonly FakeReviewOutcome[];
export function createFakeEngine(script: FakeEngineScript): ReviewEngine;

// __test__/ReviewEngine.contract.ts
import { describe, it, expect } from "vitest";
import type { ReviewEngine, ReviewUsage } from "../../../../core/run/index.js";
export interface ReviewEngineContractHarness {
  readonly resolving: (output: string, usage?: ReviewUsage) => ReviewEngine;
  readonly rejecting: () => ReviewEngine;
}
export function reviewEngineContract(
  harness: ReviewEngineContractHarness, label?: string,
): void;
```

- Contract assertions: `resolving("SUCCESS")` → resolves, `output === "SUCCESS"`, `usage` undefined; `resolving("...", usage)` → `result.usage` deep-equals; `resolving` without usage → `expect(result.usage).toBeUndefined()` (AC-4); `rejecting()` → `await expect(review(req)).rejects.toThrow()` and error `instanceof Error` (AC-3).
- `exactOptionalPropertyTypes`: the harness builds `{ output }` vs `{ output, usage }` conditionally (never `usage: undefined`).
- vitest project globs (non-overlapping): `core`=`src/core/**/__test__/**/*.test.ts`; `adapters`=`src/adapters/**/__test__/**/*.test.ts` (matches `fake-engine.test.ts`; the non-`*.test.ts` `ReviewEngine.contract.ts` is imported, not collected); `e2e`=`e2e/**/*.test.ts` (root dir, absent today → zero files, outside `depcruise src` and `src/**`).

## Alternatives And Trade-Offs

| Option | Decision | Why |
|---|---|---|
| Reachability: export fake via engines `index.ts` vs. import concrete path in test | Export via `index.ts` | Fake is a shipped adapter (e2e uses it); the index is its public API and matches how future consumers import it (dec-006) |
| Config shape: `ReviewResult \| Error` + `instanceof` vs. discriminated `{ok}` union | Discriminated union | Explicit, avoids `instanceof` ambiguity, plays cleanly with `strict`/`exactOptionalPropertyTypes` |
| depcruise exclude form: bare string vs. `{ path }` object | `{ path: "(^|/)__test__/" }` | Matches the config's existing `{ path }` style; matches only a `__test__/` segment, no production path |
| e2e project home: `e2e/` root vs. under `src/**/__test__/` | `e2e/` root | Cross-module smoke isn't one module's `__test__`; outside `src` it never touches guards/extraction; zero files now |
| Rejection assertion: exact `Error` vs. `instanceof Error` | `instanceof Error` | Keeps the suite reusable when E4 adds `EngineError extends Error`; fake still supplies a plain `Error` |

## Open Technical Questions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| e2e project include = `e2e/` root dir | Soft repo-structure assumption; commits zero files, freely changeable when E-level e2e lands | E-level e2e story | Assumption (A-level, vetoable) — flagged for transparency, not blocking |
| Array-script sequence test | Optional coverage of multi-call scripting; AC-1..4 pass with single-outcome engines | sddl-plan | Optional (plan decides) |

## Approval Notes

- All settled decisions are A-level within dec-004..dec-007. No NEW B-level decision surfaced: the config-API shape, contract-suite signature, file layout, and depcruise form were pre-assigned to design as A-level by the spec/handoff.
- One low-risk A-level assumption (e2e include points at a not-yet-existing `e2e/` root) is flagged above per the dec-002 standing gate; it commits no files and is trivially changeable, so it does not gate planning.
- Guards verified: adapter imports only core types (`core→adapter` never occurs); no adapter→adapter; no src/main; the `(^|/)__test__/` exclude exempts test infra only. Extraction guarantee intact.

## Budget Notes

- Design proportional to a bounded single-adapter + test-infra change; interfaces given as exact signatures so `sddl-plan` needs no guessing.
