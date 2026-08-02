# Testing

How tests are organized and how to add one — especially the shared contract
suite every engine adapter must pass.

## The three vitest projects

Tests are split into projects (`docs/setup-tecnico-sentinel.md` §5.4), declared
in [`vitest.config.ts`](../vitest.config.ts):

| Project | What | Placement |
|---|---|---|
| `core` | unit tests with in-memory port fakes (no I/O) | `src/core/**/__test__/**/*.test.ts` |
| `adapters` | contract tests: the shared suite per port | `src/adapters/**/__test__/**/*.test.ts` |
| `e2e` | smoke of the full flow with FakeEngine | `e2e/**/*.test.ts` |

Test files live in **co-located `__test__/` folders** and are excluded from the
architecture-guard cruise, so their `vitest` import never affects guard
enforcement. As the project grows, only the `adapters` project is populated
today (the `ReviewEngine` contract suite); `core` and `e2e` fill in with their
stories.

## Commands

```bash
npm test                              # vitest run — all projects
npx vitest run --project adapters     # one project
npx vitest run -t "<test name>"       # one test by name
```

`npm test` is part of the quality gate: it and `npm run check` must both be
green before opening a PR.

## Test placement rules

- **Core**: unit tests with in-memory fakes of the ports. Most tests live here.
  They exercise domain logic, not I/O.
- **Driven adapters**: the **shared contract suite** for the port — every
  implementation passes the *same* suite. Contract tests cover the port
  contract, they do not re-test domain logic.
- **E2E**: a smoke test of the whole flow (register → review → history) with
  FakeEngine and a temporary git repo.

## The contract-suite pattern

A port's contract suite is written **once**, parameterized, and reused by every
adapter that implements the port. The `ReviewEngine` suite is the reference.

`ReviewEngine.contract.ts` exports a function that runs the assertions against a
caller-supplied **harness** of scenario factories — it imports only `vitest` and
core port **types**, never any concrete engine, so it stays reusable:

```ts
// src/adapters/driven/engines/__test__/ReviewEngine.contract.ts
export interface ReviewEngineContractHarness {
  readonly resolving: (output: string, usage?: ReviewUsage) => ReviewEngine;
  readonly rejecting: () => ReviewEngine;
}

export function reviewEngineContract(
  harness: ReviewEngineContractHarness,
  label?: string,
): void {
  /* describe/it asserting the ReviewEngine port contract */
}
```

Each adapter's test provides a harness and calls the suite:

```ts
// src/adapters/driven/engines/__test__/fake-engine.test.ts
const harness: ReviewEngineContractHarness = {
  resolving: (output, usage) =>
    createFakeEngine({ ok: true, result: usage === undefined ? { output } : { output, usage } }),
  rejecting: () => createFakeEngine({ ok: false, error: new Error("engine failed") }),
};

reviewEngineContract(harness, "FakeEngine");
```

### Adding a new engine adapter

When the real engines land (E4), a new adapter reuses the same suite verbatim:

1. Implement the port under `src/adapters/driven/engines/<engine>/`.
2. Add `<engine>/__test__/<engine>.test.ts` that builds a harness over your
   adapter (mocking the engine binary with fixtures) and calls
   `reviewEngineContract(harness, "<engine>")`.
3. Green suite = your adapter honors the contract, with **zero changes to the
   core** (PRD §4.7).

Rejections are asserted as `instanceof Error` (the base class), so a future
typed `EngineError extends Error` still satisfies the contract.

## Fixtures

`fixtures/` holds real engine outputs that feed the contract tests (captured in
the engine spike, E1). FakeEngine needs none — its "fixtures" are the scenarios
its harness scripts.
