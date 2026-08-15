# Spec

## Routing Digest

- change_name: e4-f1-h1-run-review
- objective: new-feature
- route: continue-lite
- digest_summary: `runReview` use case in `src/core/run` — composes workspace (worktree, diff), review (harness, prompt) and the `ReviewEngine` port into one flow that always resolves with a `RunReviewResult` carrying exactly one `TerminalState`, enforces `timeoutMs` as its own wall clock, and guarantees worktree cleanup on every path without overriding the originating outcome.
- scope_digest: IN = `runReview` + `RunReviewRequest`/`Deps`/`Result` + run-owned error family + minimal internal verdict extraction behind an injectable seam + full failure→state mapping + unit tests. OUT = H2 defensive parser (#27), real engine adapters (#28-30), all of E5, CLI/TUI wiring, e2e smoke.
- acceptance_digest: happy path green against FakeEngine; all five terminal states reachable by unit test; `worktreeRemove` proven called on every path under `always` and proven skipped per policy; a cleanup fault never changes the terminal state; no throwable escapes `runReview`.

## Summary

- change_name: e4-f1-h1-run-review
- objective: new-feature
- route: continue-lite
- spec_status: complete-with-one-open-decision

Story `[E4.F1.H1]` / issue #26. This is the first code in the repo that turns "review this branch of this repo" into a result. Every dependency is merged on `main`; the work is pure composition inside `src/core`, verified with in-memory fakes and `createFakeEngine` only — no real engine, no filesystem, no `git` binary.

## Scope Boundary

### In Scope

- `runReview(request, deps): Promise<RunReviewResult>` in `src/core/run/run-review.ts`, exported from `src/core/run/index.ts`.
- The public shapes `RunReviewRequest`, `RunReviewDeps`, `RunReviewResult`, `RunFailure`, `RunCleanupOutcome`, and the `Verdict` domain type (PRD §9: `approve | request-changes | comment`).
- A run-owned error family in `src/core/run/run-errors.ts`: `RunError` base plus `InvalidRunRequestError`, `EngineInvocationError`, `EngineTimeoutError` — following the house pattern (`WorkspaceError`, `GitError`, `HarnessError`): `Error` suffix, `cause?: unknown` stored conditionally. Sanctioned by `d-dec004-scope`.
- Wall-clock `timeoutMs` enforcement inside `runReview` (the port has no abort channel and `FakeEngine` deliberately ignores `timeoutMs`). Sanctioned by `d-dec004-scope`.
- A complete, exhaustive failure→`TerminalState` mapping (see Expected Behavior) covering all five states.
- A cleanup guarantee: `cleanupWorktree` is invoked on every path where a worktree exists, and its outcome is reported without altering the terminal state.
- A **minimal internal verdict extraction** behind an injectable `deps.parseVerdict` seam (resolves `r-parse-seam`; boundary against H2 fixed in Non-Goals).
- The E5 validation seam as a pass-through: `RunReviewRequest.validationOutput?: readonly string[]`, forwarded verbatim to `assemblePrompt`. No E5 import, no new machinery.
- Unit tests in `src/core/run/__test__/` (vitest `core` project) reusing `workspace/__test__/workspace-git-fake.ts`, `review/__test__/fake-harness-loader.ts` and `createFakeEngine`.

### Out Of Scope

- `[E4.F1.H2]` verdict parser (#27): ANSI stripping, markdown-fence unwrapping, contradiction heuristics, the real E1 engine fixture corpus, and the ≥90% parse-rate success criterion.
- `[E4.F2.*]` real engine adapters (#28-30), `isAvailable()`, cascading engine resolution, engine process cancellation.
- All of E5: `ProcessRunner`, declared validations, `RunStore` persistence. This story writes no run anywhere.
- CLI/TUI wiring, exit codes (E6), and any `src/main/` composition.
- Changes to the `ReviewEngine` port interface, to `FakeEngine`, or to any workspace/review/repos module.
- Any e2e test; the `e2e` vitest project stays empty.

### Non-Goals

- **`runReview` does not own defensive parsing.** The built-in extraction is deliberately naive: it scans output lines for a trimmed, case-sensitive `VERDICT: approve|request-changes|comment`. Exactly one distinct match ⇒ that verdict; zero matches or two distinct conflicting matches ⇒ `ambiguous`. No normalization of any kind. It is module-private (not exported from `index.ts`) so H2 owns the public parser's name and outcome shape; H2 replaces the default and/or supplies `deps.parseVerdict`, and `runReview` itself does not change.
- Not a sixth terminal state. The PRD fixes exactly five; inventing an `infrastructure-error` would be a C-level contradiction. Infrastructure faults are carried by `failure.error` instead (see the mapping rationale).
- No engine cancellation. On timeout the engine promise is abandoned, not killed — real process kill is the adapter's job in E4.F2.
- No concurrency, retry, or partial-result recovery.

## Expected Behavior

### Flow order

1. **request** — `runReview` validates its own request (`timeoutMs > 0`, non-empty `harnessType`, non-empty refs, `baseRef`/`targetRef` not starting with `-` — an option-injection guard: they are later passed positionally to `git diff`/`git merge-base` without a `--` separator) → `InvalidRunRequestError`.
2. **harness** — resolve the harness. *Hoisted ahead of worktree creation* so an unknown harness never leaves an orphan worktree behind. This does not contradict the backlog sequence, which names "prompt", not "harness load".
3. **worktree** — `createReviewWorktree({ repoPath, commitish: targetRef, branchLabel: targetRef }, { git, worktreesDir, now? })`.
4. **diff** — `computeReviewDiff({ repoPath, baseRef, targetRef, limits? }, { git })`. Runs against the managed clone, not the worktree; semantics are already `merge-base(base, target)..target`.
5. *(E5 validations seam — not implemented; `request.validationOutput` passes straight through.)*
6. **prompt** — `assemblePrompt({ resolvedHarness, diff, validationOutput? })`.
7. **engine** — `deps.engine.review({ worktree: { path }, prompt, timeoutMs })`, raced against a `timeoutMs` wall clock owned by `runReview`. `timeoutMs` is still passed in the request so real adapters can self-enforce.
8. **parse** — `deps.parseVerdict ?? builtInExtraction` applied to `result.output`.
9. **cleanup** — `cleanupWorktree({ repoPath, worktreePath, policy, reviewSucceeded })`, always, in a `finally`-shaped guarantee.

### Failure → terminal state mapping (exhaustive)

The stage decides the family; the error class discriminates within it. Anything unrecognized in any stage falls through to `engine-error`, so **no throwable escapes `runReview`** and the "exactly one terminal state" invariant holds by construction.

| Stage | Fault | Terminal state |
|---|---|---|
| request | `InvalidRunRequestError` (`timeoutMs <= 0`, empty `harnessType`/`repoPath`/`baseRef`/`targetRef`) | `validation-failed` |
| harness | `HarnessNotFoundError`, `SkillNotFoundError`, `HarnessValidationError` | `validation-failed` |
| worktree | `InvalidWorktreeRequestError` (empty/relative `repoPath`, empty `commitish`/`branchLabel`/`worktreesDir`) | `validation-failed` |
| worktree | `WorktreeCreationError` (git `worktree add` failed) | `engine-error` |
| diff | `InvalidWorktreeRequestError` (non-absolute `repoPath`, empty `baseRef`/`targetRef`) | `validation-failed` |
| diff | `DiffSizePolicyError` (`maxLines <= 0` or `maxTokens <= 0`) — verified the *only* thing it is raised on, `compute-review-diff.ts:209,212` | `validation-failed` |
| diff | `GitMergeBaseError` / `GitDiffError` leaking through as non-workspace errors | `engine-error` |
| prompt | `ContextModeNotSupportedError` (non-`inline` harness) | `validation-failed` |
| engine | wall clock elapsed before the engine settled | `timeout` |
| engine | engine promise rejected (wrapped in `EngineInvocationError`, `cause` preserved) | `engine-error` |
| parse | exactly one distinct `VERDICT:` match | `ok` (+ `verdict`) |
| parse | zero matches, or two distinct conflicting matches | `ambiguous` |
| any | unrecognized throwable | `engine-error`, original preserved in `failure.error` |

`validation-failed` = pre-flight fault: the review never reached the engine because the request or configuration was invalid (`d-validation-failed-preflight`, user decided). `engine-error` is the complement: an execution or infrastructure fault that prevented a result. Mapping a git failure to `engine-error` is the lesser stretch, and `failure.stage` + `failure.error` let E6 render an accurate message ("failed to create worktree: …") without a sixth state.

`ok` does **not** mean "approved". `state: "ok"` + `verdict: "request-changes"` is a normal, successful run — the state describes the run, the verdict describes the review's opinion (PRD §5.2, §9).

### Result contract

| Field | Presence | Meaning |
|---|---|---|
| `state` | always | exactly one `TerminalState` |
| `verdict` | only when `state === "ok"` | `approve \| request-changes \| comment` |
| `worktreePath` | once stage 3 succeeded | the ephemeral worktree used |
| `diff` | once stage 4 succeeded | the full `ReviewDiff`, warnings included |
| `prompt` | once stage 6 succeeded | PRD §9 requires runs to persist the prompt |
| `engineOutput` | once stage 7 (engine) succeeded | raw, unparsed engine output — not only on `ok` / `ambiguous`: a parse-stage fault yields `engine-error` with `engineOutput` and `failure` both set (R2-003) |
| `usage` | when the engine reported it | `ReviewUsage` passthrough |
| `failure` | on any non-`ok`/non-`ambiguous` state | `{ stage, error }` — original domain error, `instanceof`-discriminable |
| `cleanup` | always | see below; never influences `state` |

Over-returning is deliberate: E5's `RunStore` and E6's rendering both consume this shape, and under-returning would force a breaking change. Nothing is persisted here, so the cost is zero.

### Cleanup semantics (resolves `r-cleanup-on-error`)

- Cleanup runs on every path where a worktree exists — success, engine failure, timeout, and post-worktree validation failures. Validation failures at stages 1–2 leave nothing to clean (`cleanup.attempted: false`).
- `reviewSucceeded` is passed as `state === "ok"`. Under `on-success` this keeps the worktree for `ambiguous` too. Literal reading of "success", and the conservative side (keeping a worktree) is cheap and reversible; deleting one someone wanted is not.
- **A cleanup fault annotates, it never overrides.** If `cleanupWorktree` throws `WorktreeCleanupError`, the terminal state and every other result field stay exactly as computed; the fault is recorded as `cleanup: { attempted: true, removed: false, reason: "cleanup-failed", error }`. It is never rethrown and never swallowed silently. The originating error therefore always survives a cleanup fault, and a cleanup fault on a happy path leaves `state: "ok"`.
- `cleanup.attempted: false` when no worktree was created; otherwise `{ attempted: true, removed, reason }` mirroring `CleanupWorktreeResult`, extended with `"cleanup-failed"`.

### Timeout semantics

- `runReview` races `engine.review(...)` against its own wall clock. The timer is always cleared once the race settles, so no test or process hangs.
- The losing engine promise is abandoned, not cancelled; a no-op rejection handler is attached so a late rejection never surfaces as an unhandled rejection.
- The timeout path must be provable deterministically, without real wall-clock waiting (fake timers or an injected delay — mechanism is `sddl-design`'s call).

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-1 | Happy path green against FakeEngine: fake `GitPort` + fake harness loader + `createFakeEngine` resolving `VERDICT: approve` ⇒ `state: "ok"`, `verdict: "approve"`, prompt/diff/output populated | unit test in `src/core/run/__test__/run-review.test.ts` | must |
| AC-2 | `ok` reachable | one distinct `VERDICT:` line in engine output | must |
| AC-3 | `ambiguous` reachable, two ways | (a) output with no `VERDICT:` line; (b) output with two distinct conflicting verdicts | must |
| AC-4 | `engine-error` reachable, two ways | (a) `createFakeEngine({ ok: false, error })`; (b) fake `GitPort` `addError: GitWorktreeError` ⇒ `WorktreeCreationError` | must |
| AC-5 | `timeout` reachable | engine that never settles, short `timeoutMs`, deterministic clock; asserts `state: "timeout"` and no hang | must |
| AC-6 | `validation-failed` reachable from every enumerated pre-flight producer | one case each: `timeoutMs <= 0`; `timeoutMs > 2147483647` (Node's `setTimeout` upper bound; review-driven A-level amendment, R3-004); empty `harnessType`; relative `repoPath`; `limits.maxLines = 0`; unknown harness; missing skill; non-`inline` `contextMode`; `baseRef`/`targetRef` starting with `-` (option-injection guard; review-driven A-level amendment, PR #64 Copilot comment) | must |
| AC-7 | Cleanup on every path: under `policy: "always"`, `git.worktreeRemove` is recorded in `removeCalls` for `ok`, `ambiguous`, `engine-error` and `timeout` | assert against the fake's `removeCalls` in each state test | must |
| AC-8 | Cleanup honours policy: `keep` never removes; `on-success` removes on `ok` and does not remove on `engine-error`/`timeout` | `removeCalls` length assertions per policy | must |
| AC-9 | A cleanup fault does not change the outcome: `removeError: GitWorktreeError` on a happy path ⇒ `state` stays `"ok"`, `cleanup.reason === "cleanup-failed"`, and the promise resolves (does not reject) | unit test | must |
| AC-10 | A cleanup fault does not swallow the originating error: engine rejection + `removeError` ⇒ `state: "engine-error"` **and** `failure.error` is the `EngineInvocationError` **and** `cleanup.reason === "cleanup-failed"` | unit test | must |
| AC-11 | No worktree is created for a stage-1/stage-2 validation failure; `cleanup.attempted === false` and `addCalls` is empty | unit test on unknown harness and on `timeoutMs <= 0` | must |
| AC-12 | `runReview` never rejects for any modeled path; an unrecognized throwable resolves as `engine-error` with the original in `failure.error` | test with a dep stub throwing a bare `TypeError` | must |
| AC-13 | The E5 seam is a pass-through: a supplied `validationOutput` appears in the assembled prompt; omitting it omits the section | assert on `result.prompt` | should |
| AC-14 | The parse seam is injectable: supplying `deps.parseVerdict` overrides the built-in extraction | unit test with a stub parser | should |
| AC-15 | Architecture guards hold: no import from `src/adapters/`, `src/main/`, or any I/O library; cross-module imports only via `../workspace/index.js` and `../review/index.js` | `npm run check` (depcruise) | must |
| AC-16 | `runReview` and its public types are exported from `src/core/run/index.ts`; the built-in extraction is **not** | source inspection + `npm run check` | must |
| AC-17 | No scope leak: the diff touches only `src/core/run/**`; no change to the `ReviewEngine` port, `FakeEngine`, workspace, review, or repos | `git diff --stat` | must |
| AC-18 | `npm run check` and `npm test` both green; the existing 163 tests still pass | local run before PR | must |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| The built-in extraction could be mistaken for "good enough", weakening the case for H2 (#27) | medium | Mitigated by Non-Goals wording, module-private placement, the injectable seam, and by H2 owning the fixture corpus and the ≥90% criterion — which the naive version cannot meet by construction. |
| Git/infrastructure faults surface as `engine-error` | medium | The PRD fixes five states; a sixth would be a C-level contradiction. `failure.stage` + `failure.error` preserve full fidelity for E6 rendering. Revisit only if E6 proves the label misleads users. |
| The catch-all maps genuine programming bugs to `engine-error`, which can mask them | low | Accepted for the "exactly one terminal state" invariant. The original throwable is preserved in `failure.error`, so nothing is lost — only relabelled. |
| Timeout abandons rather than cancels the engine; cleanup may remove a worktree a live process still holds | low here, real later | Inert in H1 (FakeEngine, in-memory git). `timeoutMs` is still passed to the engine so E4.F2 adapters own process kill. Flagged forward to #28-30. |
| Result shape is wide before any consumer exists | low | Deliberate. Nothing persists it yet, so widening costs nothing and under-returning would force a breaking change on E5's `RunStore`. |
| `runReview`'s dependency surface is the largest in the core | low | Inherent to a composition use case. Ports reach it only through the two public module indexes; guards are unaffected. |

## Open Questions And Decisions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| Parse seam (`r-parse-seam`) | Decides whether `ok`/`ambiguous` are distinguishable here and whether H1 pre-empts H2 | sddl-design | **decided (A)**: minimal module-private extraction + injectable `deps.parseVerdict`. Both states become provable; H2's hard part (defensive normalization, fixtures) stays untouched. |
| Timeout vs `engine-error` (`r-terminal-state-coverage`) | Two of five states depend on it | sddl-design | **decided (A, pre-sanctioned by `d-dec004-scope`)**: `runReview` owns the wall clock; engine rejection is wrapped in `EngineInvocationError`, timeout produces `EngineTimeoutError`. |
| `validation-failed` producers | Acceptance criterion "each terminal state reachable by test" | sddl-design | **decided (B, user, `d-validation-failed-preflight`)**: pre-flight faults, enumerated in the mapping table and AC-6. Reachable under either harness option below. |
| Cleanup fault handling (`r-cleanup-on-error`) | Whether the originating error survives | sddl-design | **decided (A)**: annotate, never override, never rethrow. AC-9/AC-10 prove both directions. |
| Result shape (`r-dependency-surface`, part 2) | E5 `RunStore` + E6 rendering consume it | sddl-design | **decided (A)**: return the wide shape in the Result Contract table. Prompt inclusion is directly required by PRD §9. |
| E5 validation seam (`r-e5-validation-seam`) | Must stay open without importing E5 | — | **decided (A)**: `request.validationOutput?: readonly string[]` forwarded verbatim to `assemblePrompt`. No new machinery. |
| **Harness resolution shape (`r-dependency-surface`, part 1)** | Sets the public API of the flagship use case and how much of E3 the CLI must assemble in E6 | **sddl-design — blocks the signature** | **OPEN (B-level, user decides)**. See below. |

### Open B-level decision — harness resolution

**Option A (recommended).** `runReview` takes `harnessType: string` in the request and resolves internally via `deps.harnesses: LoadHarnessesDeps` (the `{ factory, user }` `HarnessLoader` pair), calling `loadHarnesses`.
Rationale: the user's own settled semantics for `validation-failed` names "unknown harness" as a producer, and that fault only occurs *inside* the flow under this shape; the E4 DoD is `sentinel review <repo> <branch> --type pr-review`, i.e. a bare string from the CLI; and it keeps E6 from assembling E3 internals. Cost: a larger deps surface and the `HarnessLoader` port reaching the run module.

**Option B.** The caller resolves the harness and passes a `ResolvedHarness` in the request. `runReview` stays a pure composer with a two-port deps surface (`git`, `engine`).
Cost: `HarnessNotFoundError` / `SkillNotFoundError` move outside the flow, so E6 must own that error path and its terminal state, and the CLI must wire `loadHarnesses` itself.

Either option keeps all five terminal states reachable (`validation-failed` still has 5+ producers under Option B), so the acceptance criteria are safe either way. Everything else in this spec is option-independent.

## Approval Notes

- Six of the seven questions the proposal carried are resolved here; the seventh is presented as one clean B-level choice with a recommendation, per the decision protocol ("anything affecting public API" is B).
- The `d-dec004-scope` withdrawal is honoured: wall-clock enforcement and a typed run-domain error are treated as sanctioned work, not escalation.
- `d-change-scope` is upheld: no H2 parser work is absorbed, and the Non-Goals fix the boundary explicitly.
- No PRD conflict found. The flow, the five terminal states, the ephemeral-worktree rule and the `merge-base(base, target)..target` diff all match PRD §4.6, §5.1, §5.2 and §9.
- Recommended next stage: `sddl-design`, after the harness-resolution decision is taken at the spec gate.

## Budget Notes

- Above the 300–500 word target, in line with the other hot-path specs in this change set (`e2-f3-h1`, `e2-f3-h2`). The overage is concentrated in the exhaustive mapping table and the acceptance criteria, both of which exist to make "each terminal state reachable by test" auditable rather than aspirational.
