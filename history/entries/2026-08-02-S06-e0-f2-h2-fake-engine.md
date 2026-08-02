# S06 — Story [E0.F2.H2]: FakeEngine + shared ReviewEngine contract suite

- **Date**: 2026-08-02
- **Branch**: `claude/e0-f2-h2-fake-engine-o4q9sz`
- **Scope**: `[E0.F2.H2]` (issue #6) — FakeEngine driven adapter + the shared reusable `ReviewEngine.contract` suite + the first vitest config + the deferred `--passWithNoTests` removal
- **sdd-lite changes**: [e0-f2-h2-fake-engine](../../sdd-lite/openspec/changes/e0-f2-h2-fake-engine/) (`lifecycle_status: completed`) — [proposal](../../sdd-lite/openspec/changes/e0-f2-h2-fake-engine/proposal.md) · [spec](../../sdd-lite/openspec/changes/e0-f2-h2-fake-engine/spec.md) · [design](../../sdd-lite/openspec/changes/e0-f2-h2-fake-engine/design.md) · [plan](../../sdd-lite/openspec/changes/e0-f2-h2-fake-engine/plan.md) · [execution-log](../../sdd-lite/openspec/changes/e0-f2-h2-fake-engine/execution-log.md) · [review-ledger](../../sdd-lite/openspec/changes/e0-f2-h2-fake-engine/review-ledger.md) · [qa-report](../../sdd-lite/openspec/changes/e0-f2-h2-fake-engine/qa-report.md)

## Objective

Land the first real test in the repo: a `FakeEngine` driven adapter implementing the frozen H1 `ReviewEngine` port, plus the shared `ReviewEngine.contract` suite every engine implementation must pass, so the whole MVP can be developed/tested without real engines. Establish the first vitest three-project config and fire the deferred `--passWithNoTests` removal (e0-f1-h3 risk-004).

## Decisions

| ID | Decision | Alternatives considered | Why | Authorship |
|----|----------|-------------------------|-----|------------|
| S06-D1 | Run as a full sdd-lite change; start `interactive`, switch to `auto` after the proposal with two blind parallel validators per stage; executor code gate always explicit | Manual confirmation each stage | User kickoff directive; keeps momentum while guarding drift | `user` |
| S06-D2 | Standing gate: validate any deviation/suggestion with alternatives + recommendation **before** formalizing design | Proceed silently on A-calls | Explicit user constraint at kickoff | `user` |
| S06-D3 | dec-004 — thin port surfaces failure by REJECTING with a plain `Error`; fake does not enforce `timeoutMs`; H1 core port UNCHANGED, no typed port error | Typed `EngineError` in core/run now; fake enforces the clock | Keeps the frozen H1 contract intact; no E4 run-flow/verdict scope leak; a typed error can arrive later without breaking the contract | `claude→user` |
| S06-D4 | dec-005 — tests co-located INSIDE `src` in per-module `__test__/` folders; add a precise `(^\|/)__test__/` exclude to `.dependency-cruiser.cjs` | Claude recommended a test tree OUTSIDE `src` (no guard-config edit) | User override; co-location kept next to the adapter, guards/extraction stay intact via the additive scoping exclude | `user` |
| S06-D5 | dec-006 — DEFER `src/main` wiring; H2 wires nothing (no consumer until E4.F1.H1) | Wire FakeEngine into src/main now | YAGNI; would be dead code a later story rewrites; guard-5 satisfied vacuously | `claude→user` |
| S06-D6 | dec-007 — declare all three vitest projects (core/adapters/e2e per §5.4), populate only `adapters` | Only the adapters project now | Scaffolding ready for later stories; aggregate `vitest run` green with empty projects (proven at gate) | `claude→user` |
| S06-D7 | dec-008 — keep the `biome.json` `files.includes` edit for `vitest.config.ts`; AC-8's diff ratified to include it | Drop it (tightest AC-8 diff) | Mirrors the existing `tsup.config.ts` entry; H2's own new config gets linted; not a scope leak; routed to the user only because the two design validators diverged (A should-fix vs B info) | `claude→user` |
| S06-D8 | dec-009 — approve the code-touching executor stage S1 + auto-chain the post-execution flow (4R → final QA), stopping only on a blocker | Hold at the gate | Explicit user approval at the mandatory code gate after planning validated end to end | `user` |
| S06-D9 | Elevate the 4R triage from `standard` (1 lens) to 2 blind lenses (Reliability + Readability) | Single lens | The shared contract governs all future engine adapters + the diff edits the guard config | `claude` |

## Deviations

- **Committer signature** — commits land Unverified (no signing key in this environment); the committer email is correct (`noreply@anthropic.com`). Same environmental limitation documented in S05; no action possible here.
- **dec-005 reversed the proposal's preference** — the proposal recommended a test tree outside `src`; the user chose co-location in `__test__/` with a depcruise exclude. Recorded as a user decision, not drift; both spec validators confirmed the exclude is additive and precise.
- **Formatter-only executor autofix** — one `biome check --write` pass (scoped to the touched files) reordered the two re-exports in `engines/index.ts` and reflowed a chained call in the contract suite; no logic/scope change.
- **risk-003 resolved empirically** — the fallback protocol (STOP+consult if empty vitest projects fail per-project strict) was carried but NOT triggered: `vitest run` stays green (4 tests) with empty core/e2e; `--passWithNoTests` stays removed.
- No PRD/backlog scope deviation: QA confirmed zero creep into E1/E4/E5 and the frozen H1 port is untouched.

## Work done

- **12 commits** `58e4441`..`4bdca6e` on the session branch. Feature: `1cfaac2 feat(engines): FakeEngine adapter + shared ReviewEngine contract suite` (8 files: `fake/fake-engine.ts`, `engines/index.ts`, `__test__/ReviewEngine.contract.ts`, `__test__/fake-engine.test.ts`, `vitest.config.ts`, `.dependency-cruiser.cjs` exclude, `biome.json` includes, `package.json` test flag). The rest are per-stage sdd-lite artifacts + validation checkpoints.
- **sdd-lite lite flow, fully validated**: proposal → spec → design → plan → executor → 4R review → final QA. **Three planning dual-validator passes** (spec, design, plan — acceptance/scope + PRD/architecture-or-tooling), all **no-drift**; validators verified claims against the real `.dependency-cruiser.cjs`, `tsconfig.json`, `package.json`, `biome.json`, and the frozen H1 port.
- **4R code review** (dec-003 code-stage role): target frozen at `1cfaac2` (diff sha256 `09def794…`), triaged `standard` → **elevated to 2 lenses** (reliability + readability) → **0 blocker / 0 critical, 5 SUGGESTION (info)**; verdict `pass`. Reliability empirically verified single/array/exhaustion/empty-array correctness + non-vacuous, fake-agnostic suite. [review-ledger](../../sdd-lite/openspec/changes/e0-f2-h2-fake-engine/review-ledger.md).
- **Final QA** (adversarial, final mode): independently re-ran the gates and judged **AC-1–AC-9 all PASS** → `lifecycle_status: completed`.
- **Gates green** (also re-run by the orchestrator): `npm run check` exit 0 (biome 25 files · tsc --noEmit · depcruise 0 violations, 18 modules, `__test__/` excluded, five guards) · `npm test` exit 0 (`vitest run`, **4 tests passed**, non-vacuous).
- Branch pushed to `origin/claude/e0-f2-h2-fake-engine-o4q9sz`.

## Pending and next steps

- **PR not opened** — per the task rule (no PR unless the user explicitly asks). Branch is pushed and green. **Owner: user** to request; Claude opens `[E0.F2.H2] FakeEngine + shared ReviewEngine contract suite` (`Closes #6`) on request. (Never merge / never push main; max 5 open PRs — S05's #5 PR is still unopened too.)
- **5 non-blocking review SUGGESTIONs** recorded in the ledger (repeat-rejection over-specification, empty-array test, PascalCase filename, single/sequence discriminator, redundant `as`). **Owner: user/future** — optional polish, not required to close.
- **E0.F2 complete** — both stories of the "Base contracts" feature (H1 #5, H2 #6) are implemented; E0 remaining epic work can proceed. **Owner: next session.**

## Open questions for the user

—
