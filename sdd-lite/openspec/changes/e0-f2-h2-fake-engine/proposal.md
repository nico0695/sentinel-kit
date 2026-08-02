# Proposal

## Routing Digest

- change_name: e0-f2-h2-fake-engine
- objective: new-feature
- route: continue-lite
- digest_summary: Land `FakeEngine` (driven adapter implementing the frozen thin `ReviewEngine` port) plus the shared, reusable `ReviewEngine.contract` suite every engine adapter must pass; establish the first vitest config and remove `--passWithNoTests`.
- feasibility_signal: high — bounded blast radius, port unchanged, all evidence pinned.
- scope_sketch_digest: IN = FakeEngine + shared contract suite + fixtures/scenarios + error coverage + first vitest config + `--passWithNoTests` removal. OUT = real engines (E4.F2), run flow (E4.F1.H1), verdict parser (E4.F1.H2), ProcessRunner (E5), any core-port change.

## Summary

- change_name: e0-f2-h2-fake-engine
- objective: new-feature
- route: continue-lite
- proposal_status: success
- exploration_performed: true

## Problem And Desired Outcome

The MVP must be buildable and testable end-to-end **before any real engine exists** (backlog [E0.F2.H2], issue #6). Today `src/adapters/driven/engines/index.ts` is `export {}`, there is no vitest config, `package.json` `test` is `vitest run --passWithNoTests`, and no real test has ever run. Desired outcome: (a) a `FakeEngine` driven adapter with configurable behavior, (b) a shared `ReviewEngine.contract` suite that **every** `ReviewEngine` implementation (fake now; claude-code/opencode in E4.F2) reuses verbatim, and (c) error-scenario coverage. This is the first real test in the repo, so it also establishes the vitest project layout and fires the deferred removal of `--passWithNoTests` (e0-f1-h3 risk-004 / dec-002), with the gate proving `npm test` is green on **real** tests, not vacuously.

## Initial Scope Sketch

### Likely In Scope

- `FakeEngine` under `src/adapters/driven/engines/` implementing the frozen thin port `review(request): Promise<ReviewResult{output, usage?}>`.
- Shared, reusable `ReviewEngine.contract` suite + its fixtures/scenarios.
- Error-scenario coverage (backlog's four responses: valid, ambiguous, timeout, error).
- First vitest config (at least the `adapters` project; core/e2e per §5.4).
- Remove `--passWithNoTests` from `package.json` `test`.

### Likely Out Of Scope

- Real engine adapters claude-code / opencode (E4.F2.x).
- runReview flow (E4.F1.H1); verdict parser / ambiguity (E4.F1.H2).
- ProcessRunner (E5.F1.x); any change to the frozen H1 core-port types.

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Port stability | Thin `ReviewEngine` frozen by H1 (dec-004/005); fake implements it as-is, no core edit | high |
| Blast radius | One adapter folder + test tree + vitest config + one-token `package.json` edit | high |
| Spec pinning | Issue #6 + backlog E0.F2.H2 + setup §5.4 (names `ReviewEngine.contract.ts`, three projects) | high |
| Guard risk | Test code imports vitest (npm); placement must not break core-no-io-libs / extraction guarantee (Q2) | medium |
| Semantic tension | Backlog "valid verdict/ambiguous/timeout/error" vs. thin port with no verdict/state — must map without leaking E4 scope (Q1) | medium |

## Open Questions For Spec

Each carries a recommendation; all are routed to spec/design (Q1 partly design-B per dec-002).

| # | Item | Why It Matters | Recommendation | Status |
|---|---|---|---|---|
| 1 | Thin-port failure model: how do the fake + contract express the four backlog responses given a verdict-less/state-less port? | Must not mutate the frozen port nor leak E4 verdict-parser/run-flow scope | Map "valid"/"ambiguous" to configurable raw **output strings** (both resolve — ambiguity is a downstream E4.F1.H2 concern, the fake just yields the raw text); map "error"/"timeout" to the async contract **rejecting**. Sub-Q (a) error surface: reject with a **plain `Error`** for now — do NOT define a typed port error in `src/core/run` (no consumer exists to translate it; adding one is E4 run-flow scope). Sub-Q (b) timeout: the fake does **not** enforce `timeoutMs`; it merely models a slow/failed invocation (e.g. reject with a timeout-like error, or optional delay) — real timeout enforcement is the run flow's job (E4.F1.H1). Keeps the H1 port UNCHANGED. | routed-to-design (B) |
| 2 | Test-tree location vs. guards: where do `ReviewEngine.contract` + FakeEngine tests live? | depcruise cruises `src`; vitest is an I/O/npm import; core-no-io-libs + extraction guarantee at stake | Prefer **Option A — tests entirely OUTSIDE `src`** (top-level `test/` tree) so depcruise never sees vitest and no guard-config edit is needed; the extraction guarantee stays untouched. Co-locating (`Option B`) would force a depcruise exclusion (a guard edit) — carry it only as fallback. Confirm the contract suite still imports FakeEngine from its adapter path without violating adapter-isolation. | routed-to-spec/design (B) |
| 3 | Vitest projects: define all three (core/adapters/e2e) now, or only `adapters`? | §5.4 defines three; only the contract suite lands now (YAGNI vs. forward setup) | Define the **three projects now** per §5.4, but only `adapters` carries real tests this story; `core`/`e2e` are empty-but-valid scaffolds (no globs matching yet). Avoids re-touching config in E4 and documents the intended layout, while `--passWithNoTests` removal still proves the `adapters` suite is non-vacuous. | routed-to-spec (B) |
| 4 | `src/main` wiring: wire FakeEngine into `src/main` now, or leave it unwired? | Guard 5 (wiring only in main) + YAGNI; no runReview consumer until E4.F1.H1 | **Do NOT wire it into `src/main` now** — there is no composition consumer yet. Prove only guard-compliant **placement** (adapter under `src/adapters/driven/engines/`, instantiated only in the contract suite/tests). Composition into `src/main` belongs to the story that introduces a `runReview` consumer (E4.F1.H1). | routed-to-spec (B) |
| 5 | FakeEngine configuration API shape (the "reusable fixtures") | Defines the public test API future adapters and the contract reuse | Sketch only: favor an explicit **factory taking a scripted behavior** — a per-call resolved `ReviewResult` (output + optional usage) for success and an error to reject with for failure, likely a small queue/sequence so one instance can script multiple invocations. Firm shape (single-behavior vs. queue vs. enum) settled in spec/design. | routed-to-spec/design (B) |

## Approval Notes

- Interactive mode (dec-001): pause here for user review of the proposal, then switch to auto with per-stage dual validators (dec-003).
- Standing gate (dec-002): Q1/Q2/Q4/Q5 are B-level; validate options + recommendation with the user BEFORE the design is formalized.
- No open question forces a STOP; all are resolvable in spec/design without contradicting the PRD or the frozen port. Route is safe to continue to `sddl-spec`.
