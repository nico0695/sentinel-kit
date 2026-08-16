# Plan

## Execution Digest

- change_name: e4-f2-h2-opencode-adapter
- objective: new-feature
- route: continue-lite
- digest_summary: Five sequential executor stages, mirroring H1's plan.md granularity one-to-one. ST-1 lands the three pure/self-contained, execa-free files (`errors.ts`, `envelope.ts`, `permission-config.ts`). ST-2 lands the execa seam (`process-runner.ts`, with the required `env` field). ST-3 lands the orchestration (`opencode-adapter.ts`) plus the barrel export. ST-4 writes the single test file covering all 24 ACs, including a dedicated execa-option-assertion test that is the only automatable proof of the SIGTERM-then-SIGKILL wiring (design.md's Open Technical Questions table names this the same unresolvable-by-stub gap H1's AC-16/17 had) and dedicated tests for the `OPENCODE_CONFIG` env-injection/temp-file lifecycle (AC-7, AC-8, AC-9 — genuinely new relative to H1, no analogue there). ST-5 is the manual AC-24 verification run plus the full gate (`npm run check && npm test`, scope check).
- stage_plan_digest: ST-1 errors.ts + envelope.ts + permission-config.ts (pure/fs-only, no execa) · ST-2 process-runner.ts (execa seam with required `env`, `defaultRunProcess` factory) · ST-3 opencode-adapter.ts orchestration + barrel export · ST-4 `__test__/opencode-adapter.test.ts` (contract harness + all AC-specific `it`s + the execa-option test + the temp-file lifecycle tests) · ST-5 manual AC-24 run + full gate.
- validation_digest: measured baseline `npm test` = **250/250 passing, 17 test files** (run before this plan was written; `npm run check` also green on the pre-existing tree, which already includes the merged H1 adapter). ST-1/ST-2/ST-3 are leaf-file stages (same pattern as H1's ST-1/ST-2/ST-3) — nothing imports the new code yet, so each exits on `npm run check` green and `npm test` unchanged at 250/250. ST-4 exits on `npx vitest run --project adapters -t "opencode"` green, then `npm run check && npm test` (250 existing + N new). ST-5 exits on the manual verification recorded in `execution-log.md` plus the final `npm run check && npm test && git diff --stat` gate.

## Summary

- change_name: e4-f2-h2-opencode-adapter
- objective: new-feature
- route: continue-lite
- planner_terminal: false
- execution_ready: true
- plan_status: complete

`design.md` already fixes every file's content: the five-file split rationale, the `OpenCodeProcessRunner`/`OpenCodeProcessResult` shapes, the `permission-config.ts` temp-file lifecycle, the three error classes' constructors, `review()`'s body, and the reused AC-19-equivalent timeout-precedence resolution. This plan fixes only the stage order, the per-stage exit check, and the two gaps design.md's own Open Technical Questions/Approval Notes left for plan to close explicitly: the SIGTERM-then-SIGKILL test strategy (same category of gap H1's plan.md already solved once — reused, not re-invented) and a concrete test plan for the `OPENCODE_CONFIG` lifecycle, which has no H1 precedent to copy.

**Why five stages, matching H1 exactly.** `permission-config.ts` could have been its own stage (six total), but it has zero dependents besides `opencode-adapter.ts` and no dependency on `process-runner.ts` or `envelope.ts` — the same "pure, no execa dependency, easiest to land first" profile design.md already assigned it alongside `errors.ts`/`envelope.ts`. Splitting it out would add a stage boundary with no risk-isolation benefit (all three ST-1 files are independently reviewable in one diff, none touches execa). Stage 4 stays a single test-writing stage (not split further, unlike H1 which needed no such split either) because — as in H1 — the automated suite and the manual AC-24 run have different exit conditions in kind (green `vitest` vs. a human reading real CLI output), which is what actually justifies ST-4/ST-5 being separate stages.

## Stage Plan

| Stage Id | Goal | Depends On | Expected Scope | Validation | Touches Code | Approval Required | Status |
|---|---|---|---|---|---|---|---|
| ST-1 | Land the three pure/self-contained, execa-free files: three typed error classes, the NDJSON parsing/outcome-extraction helpers, and the `OPENCODE_CONFIG` temp-file lifecycle | — | `src/adapters/driven/engines/opencode/errors.ts` (new — `OpenCodeUnavailableError`, `OpenCodeInvocationError`, `OpenCodeReviewError`, no `cause` field per design.md), `src/adapters/driven/engines/opencode/envelope.ts` (new — `OpenCodeEvent`/`OpenCodeTextPart`/`OpenCodeFinishPart` interfaces, `parseNdjsonLines`, `extractOutcome`, exact per design.md's AC-15..18 branching), `src/adapters/driven/engines/opencode/permission-config.ts` (new — `OpenCodePermissionConfig`, `DENY_CONFIG` constant, `createDenyConfigFile()` using `fs.mkdtemp`/`fs.writeFile`/`fs.rm`) | `npm run check` (biome + `tsc --noEmit` + `depcruise src`) green; `npm test` unchanged at 250/250 (leaf files, nothing imports them yet). Mechanically confirms AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18 (logic exists, not yet exercised by a test), AC-8, AC-9 (logic exists, not yet exercised) | yes | yes | pending |
| ST-2 | Land the `runProcess` injection seam and its execa-backed default, with the required `env` field | ST-1 (sequencing only — no import edge; see Dependencies) | `src/adapters/driven/engines/opencode/process-runner.ts` (new — `OpenCodeProcessRunOptions` with REQUIRED `env: Readonly<Record<string,string>>`, `OpenCodeProcessResult`, `OpenCodeProcessRunner` types, and `defaultRunProcess`/`createDefaultRunProcess(binaryPath)` — naming mirrors H1's ST-2 factory, executor records the exact name chosen in `execution-log.md`, not a new B-level decision — with `env` passed straight to `execa`'s own `env` option (relying on execa's default `extendEnv: true` merge behavior), `reject: false`, and the conditional `timeout`/`killSignal: "SIGTERM"`/`forceKillAfterDelay: 2000` spread, unchanged values from H1) | `npm run check` green; `npm test` unchanged at 250/250 (still a leaf file — `opencode-adapter.ts` doesn't exist yet to import it). Mechanically confirms AC-21-equivalent seam shape (type only, not yet exercised), `execa` imported only here | yes | yes | pending |
| ST-3 | Land the orchestration and wire the barrel export | ST-1, ST-2 (true import dependency: `review()` calls `createDenyConfigFile`/`cleanup` from ST-1, `parseNdjsonLines`/`extractOutcome` from ST-1, and the ST-2 factory as its default `runProcess`) | `src/adapters/driven/engines/opencode/opencode-adapter.ts` (new — `OpenCodeAdapterOptions` with `model` REQUIRED, `createOpenCodeAdapter`, `PREFLIGHT_TIMEOUT_MS = 5_000`, `review()`'s body exactly per design.md's pseudocode: create deny-config → try/finally → pre-flight → real invocation → parse → extract-outcome → cleanup), `src/adapters/driven/engines/index.ts` (modified — add `export { createOpenCodeAdapter } from "./opencode/opencode-adapter.js";` and `export type { OpenCodeAdapterOptions } from "./opencode/opencode-adapter.js";`, alongside the existing `createClaudeCodeAdapter`/`FakeEngine` exports, none removed; update the file's own doc-comment that currently says the opencode adapter "lands in `[E4.F2.H2]`") | `npm run check` green (in particular `depcruise src` — confirms architecture guards hold for the new import graph); `npm test` unchanged at 250/250 (still unimported by any test — the contract test lands in ST-4). Mechanically confirms AC-1, AC-2 (source inspection, `model` required at the type level), AC-19 (constant value) | yes | yes | pending |
| ST-4 | Write the single test file: the shared `reviewEngineContract` harness plus every AC-specific `it`, including the dedicated execa-option-wiring test and the `OPENCODE_CONFIG` lifecycle tests | ST-1, ST-2, ST-3 (imports the finished adapter, its errors, and — for the execa-option test — `process-runner.ts`'s factory directly) | `src/adapters/driven/engines/opencode/__test__/opencode-adapter.test.ts` (new — see "Timeout Test Strategy" and "OPENCODE_CONFIG Test Strategy" below, plus "Stage 4 Test Layout") | `npx vitest run --project adapters -t "opencode"` green first (fast loop), then `npm run check && npm test` full green (250 existing + N new, exact N recorded in `execution-log.md`, not assumed). Proves AC-3 through AC-18, AC-20 (execa options, wiring only — real escalation is out of stub reach, see below), AC-21, AC-22, AC-23 | yes | yes | pending |
| ST-5 | Manual AC-24 verification run, then the full closing gate | ST-4 (needs the finished, tested adapter to invoke for real) | No new source file. `sdd-lite/openspec/changes/e4-f2-h2-opencode-adapter/execution-log.md` gains the manual-verification record | Manual: invoke `createOpenCodeAdapter({ model })`'s default execa path once against the real, authenticated `opencode` CLI over a genuine diff (throwaway script, not committed — same convention H1's ST-5 used); record exact command, exit code, and the observed `VERDICT:` line, plus the installed `opencode --version` output (closes the version-drift open item as a side effect, same pattern H1's ST-5 used for `r-claude-cli-version-drift`). Then: `npm run check && npm test` full green, `git diff --stat` scope check (only `opencode/**`, its `__test__/`, and the one `engines/index.ts` change), a targeted `grep -rn 'from "execa"' src/adapters/driven/engines/opencode` returning exactly one match (`process-runner.ts`) | no | yes | pending |

## Timeout Test Strategy (the gap design.md flagged, resolved by direct reuse of H1's ST-4 solution)

Design.md's Open Technical Questions table restates the same limitation H1's design.md already found: a fixture-replaying `runProcess` stub cannot prove real SIGTERM-then-SIGKILL OS-level escalation — the seam carries no scheduling. H1's plan.md already solved this exact problem once; this plan reuses that solution unchanged rather than re-deriving it:

1. **The option-wiring test (the actual proof of the SIGTERM/SIGKILL config).** `vi.mock("execa")`, import `process-runner.ts`'s exported factory directly (not through the adapter), call the returned `OpenCodeProcessRunner` once with `{ cwd, input, timeoutMs: 5000, env: { OPENCODE_CONFIG: "/tmp/x" } }`, assert the mocked `execa` was called with `expect.objectContaining({ timeout: 5000, killSignal: "SIGTERM", forceKillAfterDelay: 2000, reject: false, env: { OPENCODE_CONFIG: "/tmp/x" } })`. A second `it` with `timeoutMs: 0` asserts the call options omit `timeout`/`killSignal`/`forceKillAfterDelay` entirely.
2. **The adapter-reaction tests.** Two `it`s using a scripted `runProcess` stub on the real-invocation call: one resolving a stream with no `text`/`step-finish` after a `step_start` and `signal: "SIGTERM"` (mirrors `timeout-sigterm-partial.ndjson`'s actual shape) → asserts `review()` rejects `OpenCodeReviewError`; one resolving fully empty stdout with `signal: "SIGKILL"` → asserts `review()` rejects `OpenCodeInvocationError` (zero parseable lines). These prove classification, not escalation — same distinction H1's plan.md drew.

What neither test proves — same accepted residual as H1's — is that a real child process actually receives SIGTERM first and only escalates to SIGKILL after a genuine grace window. ST-5's manual run only exercises this path if the review happens to exceed `timeoutMs`, which a successful AC-24 run (the literal ask) will not. Accepted, not fabricated around.

## OPENCODE_CONFIG Test Strategy (genuinely new — no H1 precedent)

Three `it`s specifically for `permission-config.ts` and its wiring into `review()`, since this is the one design surface with zero equivalent in H1's adapter:

1. **Content correctness (ST-1-level, in `permission-config.ts`'s own test block or inline in ST-4).** `createDenyConfigFile()` resolves a `path` that, when read back with `fs.readFile`, parses to exactly `DENY_CONFIG` (byte-exact `permission.{edit,bash,webfetch}: "deny"`).
2. **Injection-on-every-call (AC-7).** A recording `runProcess` stub asserts BOTH the pre-flight call and the real-invocation call carry the same `env.OPENCODE_CONFIG` value pointing at the created file — not just the real call.
3. **Concurrency and cleanup (AC-8, AC-9).** Two concurrent `review()` calls (both resolving) assert their recorded `env.OPENCODE_CONFIG` paths are distinct. A separate `it` with a `runProcess` stub that rejects on the real invocation still asserts `createDenyConfigFile`'s returned `cleanup` was invoked (spy on `fs.rm` or on `cleanup` itself if the module is mocked) — proving the `finally` block runs on the reject path, not only the resolve path.

## Stage 4 Test Layout (single file, `describe` groups)

- `reviewEngineContract(harness, "opencode")` — the shared suite, wired per design.md's harness example (fresh adapter per scenario factory, `--version` pre-check always stubbed to succeed, `resolving`/`rejecting` replaying `valid-verdict.ndjson`/`context-overflow.ndjson`). Proves AC-11/AC-13-equivalent generically, AC-21/AC-22 mechanically.
- `describe("factory options (AC-2)")` — asserts `model` is required (a `// @ts-expect-error` call site, checked by `tsc --noEmit` under `npm run check`, not a runtime test) and `binaryPath` defaults to `"opencode"` when omitted.
- `describe("invocation shape (AC-3, AC-4)")` — asserts `cwd` on both pre-flight and real calls equals `request.worktree.path`; asserts real-call `args` is exactly `["run", "-m", model, "--format", "json"]` and `input === request.prompt`.
- `describe("pre-flight gate (AC-5, AC-6)")` — rejecting `--version` stub and non-zero-exit `--version` stub, both asserting `OpenCodeUnavailableError` and that the real-invocation args were never recorded; one `it` for the exit-0 fall-through.
- `describe("OPENCODE_CONFIG lifecycle (AC-7, AC-8, AC-9)")` — the three tests from the section above.
- `describe("NDJSON parsing and outcome extraction (AC-10..AC-18)")` — a malformed-trailing-line stream still resolves using only the valid lines (AC-10); `valid-verdict.ndjson`/`no-verdict.ndjson`/`noisy-output.ndjson` → concatenated text passthrough (AC-11); `no-verdict.ndjson`'s two `step_finish` events → asserts the LAST one's tokens (`321`/`96`), not the first (AC-12); `valid-verdict.ndjson` → `totalTokens: 4786` (**not** `4965`, re-verified against the raw parsed fixture in this session, AC-13); `.tokens` absent → `result.usage` key itself absent (AC-14); `unknown-model-stdout.txt` → `OpenCodeInvocationError` (AC-15); `context-overflow.ndjson` → `OpenCodeReviewError` containing `"ContextOverflowError"` (AC-16); the SIGTERM-partial-shaped stub → `OpenCodeReviewError` fallback (AC-17); a mechanical check that `extractOutcome` has exactly three `throw` statements (AC-18).
- `describe("execa option wiring (timeout precedence)")` — the two `vi.mock("execa")` tests from the Timeout Test Strategy section.
- `describe("error translation (AC-23)")` — contract suite already covers `rejects.toBeInstanceOf(Error)` generically; a mechanical inspection note (not a runtime test) that no path in `review()` throws synchronously.

## Validation Strategy

- **Per stage.** ST-1/ST-2/ST-3 are leaf-file stages, same pattern H1's plan.md established: nothing in the existing tree imports the new files until ST-3 completes and ST-4 tests them, so their exit condition is `npm run check` green plus `npm test` staying at the measured baseline (250/250).
- **ST-4 is the only stage with new automated coverage** and is where AC-3 through AC-18/AC-20-AC-23 actually become provable. Fast loop first (`npx vitest run --project adapters -t "opencode"`), full gate only once green.
- **ST-5 is the only stage with a non-automatable exit condition.** Its manual run must be recorded with the literal command, exit code, and `VERDICT:` line in `execution-log.md` — not summarized as "ran successfully." The throwaway script used is not committed.
- **Cross-boundary note.** Same as H1: `.dependency-cruiser.cjs` excludes `__test__/` paths, so `vi.mock("execa")` usage in the test file is sanctioned test-only scaffolding, not a `core-no-io-libs` violation (this story touches no core file regardless).

## Dependencies And Sequencing

- ST-1 → ST-2: sequencing choice, not a true import dependency — `process-runner.ts` imports nothing from `errors.ts`/`envelope.ts`/`permission-config.ts`. Sequenced this way because ST-1's files are the ones design.md calls out as pure/self-contained and easiest to land first.
- ST-2 → ST-3: true dependency. `opencode-adapter.ts`'s factory calls the ST-2 factory as its default `runProcess`.
- ST-1 → ST-3: true dependency. `review()` calls `createDenyConfigFile` and `parseNdjsonLines`/`extractOutcome` from ST-1.
- ST-3 → ST-4: true dependency. The test file imports `createOpenCodeAdapter` (and, for the execa-option test, `process-runner.ts`'s factory directly).
- ST-4 → ST-5: true dependency. ST-5's manual run exercises the same adapter ST-4 just proved passes its automated suite.

## Planner Stop Note

- `objective` is `new-feature`, not `planner`: this plan is execution-ready and `sddl-plan` is not terminal here.
- The route is `continue-lite`, so no `macro-plan.md` is produced.

## Approval Notes

- Five code-touching stages (ST-5 touches no new source file but still requires approval — it is where the API-cost-incurring manual run happens and where the closing gate runs), each gated by its own `stage_approval` before the executor writes/runs anything.
- The SIGTERM/SIGKILL test-strategy gap is closed by direct reuse of H1's already-proven solution (the mocked-`execa` option-wiring test), not re-derived from scratch.
- The `OPENCODE_CONFIG` lifecycle gap — genuinely new, no H1 precedent — is closed above with three concretely-specified tests (content correctness, injection-on-every-call, concurrency+cleanup-on-reject).
- `docs/engines/opencode.md` version drift (informational, carried since spec.md) is not given its own stage — ST-5's manual AC-24 run is the natural point to record the installed `opencode --version` output, same pattern H1's ST-5 used.
- No settled design decision is reopened: the reused timeout mechanism (`timeout: request.timeoutMs`, `forceKillAfterDelay: 2000`) is implemented as specified in ST-2/ST-3, with its residual risk accepted as-is, matching H1's own acceptance.

## Budget Notes

- Measured baseline: `npm test` = **250 passed (250), 17 test files**; `npm run check` green — both run before this plan was written, on a tree that already includes the merged H1 adapter.
- Five stages against five new source files, one barrel-export update, and one new test file — proportionate to a 24-AC story. Slightly leaner than H1's plan (27 ACs, 4 source files, one previously-unsolved test-strategy gap) since the SIGTERM/SIGKILL gap is a direct reuse and only the `OPENCODE_CONFIG` lifecycle test strategy is genuinely new work for this plan to originate.
