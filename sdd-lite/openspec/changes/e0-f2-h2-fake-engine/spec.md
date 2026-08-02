# Spec

## Routing Digest

- change_name: e0-f2-h2-fake-engine
- objective: new-feature
- route: continue-lite
- digest_summary: Formalize [E0.F2.H2] (issue #6): a `FakeEngine` driven adapter implementing the frozen thin `ReviewEngine` port, the shared reusable `ReviewEngine.contract` suite every engine adapter must pass, and error-scenario coverage — plus the first vitest three-project config and the deferred `--passWithNoTests` removal, proven non-vacuously green.
- scope_digest: IN = FakeEngine adapter + shared `ReviewEngine.contract` suite + success/error scenario coverage + first vitest config (3 projects, only `adapters` populated) + `--passWithNoTests` removal + precise `__test__/` depcruise exclusion. OUT = real engines, run flow, verdict parser, ProcessRunner, any core-port/typed-error change, src/main wiring.
- acceptance_digest: FakeEngine passes the contract suite; suite is reusable verbatim by future adapters; failure scenarios reject with a plain `Error`; success scenarios resolve a `ReviewResult` (string output + optional usage); `npm test` green with real tests via `vitest run`; three vitest projects declared; `npm run check` stays green with a precise `__test__/` exclusion.

## Summary

- change_name: e0-f2-h2-fake-engine
- objective: new-feature
- route: continue-lite
- spec_status: success

Deliver, without any real engine, the test substrate the whole product converges on: a configurable `FakeEngine` adapter, the shared `ReviewEngine.contract` suite that every `ReviewEngine` implementation (fake now; claude-code/opencode in E4.F2) reuses verbatim, and error coverage. Because this is the repo's first real test, it also stands up the vitest project layout and fires the deferred `--passWithNoTests` removal, with the gate proving `npm test` is green on real, non-vacuous tests. The H1 `ReviewEngine` port is FROZEN and untouched (dec-004): thin `review(request): Promise<ReviewResult{output, usage?}>`, no verdict, no `TerminalState`.

## Scope Boundary

### In Scope

- `FakeEngine` — a driven adapter under `src/adapters/driven/engines/` implementing the frozen `ReviewEngine` port, with configurable per-invocation behavior that can script: success-with-output, ambiguous-output (both resolve a `ReviewResult`), error (rejects), and timeout (rejects). Success may carry optional `usage`.
- The shared, reusable `ReviewEngine.contract` suite (named per setup §5.4: `ReviewEngine.contract.ts`) — a parameterized suite that accepts any `ReviewEngine` factory and asserts the port contract, so future adapters reuse it verbatim.
- Error-scenario coverage: the contract suite asserts `rejects` (with a plain `Error`) for the failure scenarios.
- The first vitest config declaring all three projects — `core` (unit/in-memory fakes), `adapters` (contract), `e2e` (smoke) — per setup §5.4; only `adapters` carries test files in H2.
- Co-located tests under `src/adapters/driven/engines/__test__/` (dec-005): the contract suite + FakeEngine test live there.
- A precise `options.exclude` scoping edit to `.dependency-cruiser.cjs` matching only `(^|/)__test__/` so depcruise never cruises test code (which imports vitest).
- Remove `--passWithNoTests` from `package.json` `test` (`vitest run --passWithNoTests` → `vitest run`).

### Out Of Scope

- Real engine adapters claude-code / opencode (E4.F2.x).
- `runReview` flow (E4.F1.H1); verdict parser / ambiguity classification (E4.F1.H2).
- `ProcessRunner` (E5.F1.x).
- Any change to the frozen H1 core-port types (`ReviewEngine`, `ReviewRequest`, `ReviewResult`, `ReviewUsage`, `WorktreeRef`, `TerminalState`).
- Wiring `FakeEngine` into `src/main` (dec-006 — deferred, no consumer until E4.F1.H1).
- Real engine output fixtures from the E1 spike; populating `core`/`e2e` projects.

### Non-Goals

- No typed port error (e.g. `EngineError`) added to `src/core/run` in H2 (dec-004) — failure is a plain rejected `Error`; a typed error may arrive later (E4) without breaking this contract.
- The fake does NOT enforce `timeoutMs` / own wall-clock logic (dec-004) — it only MODELS a failed/timeout invocation; real timeout enforcement is the run flow's job (E4.F1.H1).
- No mapping of engine output to a verdict or `TerminalState` — ambiguity is downstream (E4.F1.H2); the fake yields raw output strings only.
- No relaxation of any of the five architecture guards or the core extraction guarantee — the `__test__/` exclusion exempts test infra only, without weakening any forbidden rule.

## Expected Behavior

| Scenario | Expected Outcome | Evidence Or Notes |
|---|---|---|
| Success (valid verdict) config | `review()` resolves a `ReviewResult` whose `output` is the configured raw string | Verdict interpretation is E4.F1.H2, not here |
| Ambiguous config | `review()` resolves a `ReviewResult` with the configured raw string; no special typing vs. success | Ambiguity is a downstream concern; fake just yields text |
| Optional usage config | When configured, the resolved `ReviewResult.usage` carries the given optional `ReviewUsage` fields; absent when not configured | `usage` and all its fields optional per H1 |
| Error config | `review()` REJECTS with a plain `Error` | dec-004; contract asserts `rejects` |
| Timeout config | `review()` REJECTS with a plain `Error` (timeout-like), WITHOUT enforcing `timeoutMs` | dec-004; models a failed invocation only |
| FakeEngine config API | A factory scripting per-invocation behavior (success output / optional usage / rejection); may script a sequence across multiple `review()` calls | Firm signature is design's job (dec-005/Q5) — prose here |
| Contract suite reuse | Same suite, given a different `ReviewEngine` factory, runs unchanged | Parameterized over a factory; reused verbatim by E4.F2 |
| `npm test` | `vitest run` (no `--passWithNoTests`) exits 0 with real `adapters` tests present; `core`/`e2e` match zero files without failing the overall run | dec-007 / risk-003 |
| `npm run check` | `biome check . && tsc --noEmit && depcruise src` stays exit 0; depcruise skips `__test__/`, all five guards green | dec-005; exclusion must be precise |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-1 | `FakeEngine` implements the frozen `ReviewEngine` port unchanged and passes the shared `ReviewEngine.contract` suite (issue #6 box 1) | Run the suite against a FakeEngine factory; all pass; H1 port files unmodified | must |
| AC-2 | The `ReviewEngine.contract` suite is reusable verbatim: it is parameterized over an arbitrary `ReviewEngine` factory with no fake-specific coupling (issue #6 box 2) | Suite entry takes a factory arg; no import of FakeEngine internals inside the shared assertions | must |
| AC-3 | Error scenarios covered: the contract suite asserts the failure configs REJECT with a plain `Error`; success/ambiguous configs RESOLVE a `ReviewResult` with a string `output` (issue #6 box 3; dec-004) | `expect(review()).rejects.toThrow` for error/timeout; `resolves` for success/ambiguous | must |
| AC-4 | Optional `usage` propagates: when a success config supplies `ReviewUsage`, the resolved result carries it; when omitted, `usage` is absent | Contract assertion over configured vs. omitted usage | must |
| AC-5 | `--passWithNoTests` removed from `package.json` `test`; `npm test` (`vitest run`) exits 0 on REAL, non-vacuous tests (carried duty; e0-f1-h3 risk-004 / dec-002) | `git diff` shows the flag gone; `npm test` green with adapters tests executed (>0 tests run) | must |
| AC-6 | First vitest config declares all three projects (`core`, `adapters`, `e2e`) per setup §5.4; only `adapters` is populated; `vitest run` stays green while `core`/`e2e` match zero files (dec-007 / risk-003) | Config lists 3 projects; overall `vitest run` exit 0 with adapters providing tests | must |
| AC-7 | Tests co-located under `src/adapters/driven/engines/__test__/`; `.dependency-cruiser.cjs` `options.exclude` matches ONLY `(^|/)__test__/`, never a production path; all five guards + extraction guarantee stay green (dec-005) | `npm run check` exit 0; exclusion regex reviewed for precision; no production file excluded | must |
| AC-8 | No scope leak: no core-port/type change, no typed port error, no `src/main` wiring, no real-engine adapter, no verdict/TerminalState logic (dec-004/006; H2 boundary) | `git diff` touches only engines adapter + `__test__/` + vitest config + depcruise exclude + package.json test script | must |
| AC-9 | `npm run check` AND `npm test` both green locally before PR (quality gate) | Both commands exit 0 | must |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| `__test__/` exclusion precision | medium | An over-broad regex could silently exempt production code from guards; must match only `(^|/)__test__/`. Verified at design, proven guard-green at the executor gate (risk-002 residual) |
| Vacuous green with flag removed | low | With `--passWithNoTests` gone, empty `core`/`e2e` projects must not fail `vitest run`; overall run has tests via `adapters` (risk-003 / dec-007) — proven at the gate |
| Contract-suite adapter coupling | low | The shared suite must import FakeEngine only from the adapter's public path in the fake's own test, not inside the reusable assertions, to preserve reuse and adapter isolation |

## Open Questions And Decisions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| Failure model (dec-004) | Port stays frozen; no E4 scope leak | — | RESOLVED: reject with plain `Error`; success = raw output string; fake ignores `timeoutMs` |
| Test location (dec-005) | Guards + extraction guarantee | — | RESOLVED: co-located `src/.../__test__/`; precise `(^|/)__test__/` depcruise exclude |
| src/main wiring (dec-006) | Guard-5 + YAGNI | — | RESOLVED: deferred; no wiring in H2 |
| Vitest projects (dec-007) | §5.4 layout vs. YAGNI | — | RESOLVED: declare 3, populate only `adapters` |
| FakeEngine config API shape (Q5) | Public test API future adapters reuse | sddl-design | OPEN (A-level design detail): factory scripting per-invocation behavior; firm signature settled in design |

## Approval Notes

- All four B decisions (dec-004..dec-007) are fixed constraints, baked into scope, AC, and non-goals above — not reopened here.
- No new B-level item discovered. Q5 (fake config API shape) is an A-level design detail for `sddl-design`.
- Route is safe to continue to `sddl-design`. Under auto mode (dec-003), the two blind validators (A: acceptance/scope vs. issue #6 + H2 boundary; B: PRD §4 + five guards + H1-port coherence) run against this spec; converge no-drift → auto-continue to design.

## Budget Notes

- Spec targets the firm scope boundary + AC concrete enough for QA; expected-behavior scenarios and AC map 1:1 to issue #6's three boxes plus the two carried duties.
