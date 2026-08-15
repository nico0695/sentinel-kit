# Design

## Routing Digest

- change_name: e4-f1-h1-run-review
- objective: new-feature
- route: continue-lite
- digest_summary: `runReview` = a thin public shell over one private, non-throwing pipeline function. The pipeline's return type (`PipelineOutcome`, which carries a mandatory `TerminalState`) plus its single catch-all make "exactly one terminal state, no throwable escapes" a compile-time property. Cleanup runs *after* the pipeline returns — sequentially, not in a `finally` — so it can annotate without overriding. The timeout is a race against an injectable, cancellable `TimeoutScheduler` seam (the `now?` precedent), so no test touches the wall clock.
- affected_areas_digest: `src/core/run/` only — new `run-review.ts`, `run-errors.ts`, `verdict.ts`, `engine-timeout.ts`, `builtin-verdict-extraction.ts`; `index.ts` extended; new `__test__/run-review.test.ts` + `__test__/run-review-fixtures.ts`.
- interfaces_digest: 1 use case (`runReview`), 8 exported types (`RunReviewRequest`/`Deps`/`Result`, `RunFailure`, `RunStage`, `RunCleanupOutcome`, `RunCleanupReason`, `Verdict`, `VerdictParser`, `TimeoutScheduler`), 4 exported error classes. 3 module-private units (`extractBuiltInVerdict`, `classifyFailure`, `defaultTimeoutScheduler`).

## Summary

- change_name: e4-f1-h1-run-review
- objective: new-feature
- route: continue-lite
- design_status: complete

All spec decisions are carried forward unchanged, including the two user-settled ones (`d-harness-resolution` Option A, `d-validation-failed-preflight`). This stage settles only what the spec left open: concrete shapes, file layout, the timeout test seam, the by-construction argument for the mapping, and the cleanup control flow.

## Design Overview

`runReview` decomposes into four sequential parts, in one file:

1. **`executePipeline(request, deps, draft)`** — private, `async`, **declared never to throw**. Runs stages 1–8, mutating a `RunDraft` with partial results as they become available, and returns `PipelineOutcome`. Every exit path is a `return` of an object whose `state: TerminalState` is mandatory, so the compiler rejects any path that forgets a state, and the single `catch (error: unknown)` at the top level makes escape impossible. This is the whole "by construction" claim: the invariant is a type obligation plus one exhaustive catch, not discipline spread over eight call sites.
2. **`classifyFailure(error)`** — private, pure, total: an `instanceof` chain over the exact classes the spec enumerates, with `return "engine-error"` as the fall-through. Keyed on the **error class alone**, not on `(stage, class)`: every class in the spec's table maps to the same state in every row it appears in, so the pair adds nothing. The stage is recorded independently in `failure.stage` for E6.
3. **`performCleanup(...)`** — private, `async`, also never throws: it converts any throwable into `{ attempted: true, removed: false, reason: "cleanup-failed", error }`. Called from `runReview` *after* `executePipeline` has returned, sequentially. Because the pipeline cannot throw, cleanup cannot be skipped — the guarantee is structural, and no `finally` block exists to swallow or override the computed outcome.
4. **Result assembly** — a single object literal with conditional spreads (`exactOptionalPropertyTypes: true` forbids `{ verdict: undefined }`), producing the wide `RunReviewResult`.

The engine step delegates to `runEngineWithTimeout` in `engine-timeout.ts`, which owns the race, the wrapping into `EngineInvocationError` / `EngineTimeoutError`, the no-op late-rejection handler, and the `finally { cancel(); }` that always clears the timer.

## Affected Areas

| Path Or Module | Planned Change | Risk |
|---|---|---|
| `src/core/run/run-review.ts` | New. Use case + `RunReviewRequest`/`Deps`/`Result`/`RunFailure`/`RunStage`/`RunCleanupOutcome`/`RunCleanupReason` + the four private units | medium — the hot path; largest file in the change |
| `src/core/run/run-errors.ts` | New. `RunError` base + `InvalidRunRequestError`, `EngineInvocationError`, `EngineTimeoutError` | low — mirrors `workspace-errors.ts` exactly |
| `src/core/run/verdict.ts` | New. `Verdict`, `VerdictParser` | low |
| `src/core/run/engine-timeout.ts` | New. `TimeoutScheduler`, `defaultTimeoutScheduler` (private), `runEngineWithTimeout` (private) | medium — async race; the only concurrency in the core |
| `src/core/run/builtin-verdict-extraction.ts` | New. `extractBuiltInVerdict`, module-private (never re-exported) | low — deliberately naive per Non-Goals |
| `src/core/run/index.ts` | Extended, append-only. Adds the use case, the public types, `TimeoutScheduler`, the error classes. Does **not** export `extractBuiltInVerdict`, `defaultTimeoutScheduler`, `runEngineWithTimeout`, `classifyFailure` (AC-16) | low |
| `src/core/run/__test__/run-review.test.ts` | New. All behavioural ACs | low |
| `src/core/run/__test__/run-review-fixtures.ts` | New. Request/deps builders, harness fixture, diff fixture, `createManualScheduler` | low |
| workspace / review / repos / `ReviewEngine` port / `FakeEngine` | **None** (AC-17) | none |

## Interfaces, Data, And State

### Public shapes (`run-review.ts`)

```typescript
import type { GitPort } from "../repos/index.js";
import type { CleanupPolicy, CleanupWorktreeResult, ReviewDiff } from "../workspace/index.js";
import type { LoadHarnessesDeps } from "../review/index.js";
import type { ReviewEngine, ReviewUsage } from "./ports/review-engine.js";
import type { TimeoutScheduler } from "./engine-timeout.js";
import type { Verdict, VerdictParser } from "./verdict.js";
import type { TerminalState } from "./terminal-state.js";

export interface RunReviewRequest {
  readonly repoPath: string;          // managed clone; absoluteness is validated by createReviewWorktree
  readonly baseRef: string;
  readonly targetRef: string;
  readonly harnessType: string;       // d-harness-resolution: a bare string, resolved internally
  readonly timeoutMs: number;
  readonly cleanupPolicy?: CleanupPolicy;                                   // default "always"
  readonly limits?: { readonly maxLines: number; readonly maxTokens: number };
  readonly validationOutput?: readonly string[];                            // E5 seam, pass-through
}

export interface RunReviewDeps {
  readonly git: GitPort;
  readonly engine: ReviewEngine;
  readonly harnesses: LoadHarnessesDeps;   // { factory, user }
  readonly worktreesDir: string;
  readonly now?: () => number;             // forwarded to createReviewWorktree
  readonly parseVerdict?: VerdictParser;   // H2 seam
  readonly scheduleTimeout?: TimeoutScheduler;
}

export type RunStage =
  | "request" | "harness" | "worktree" | "diff" | "prompt" | "engine" | "parse";
// "cleanup" is deliberately absent: a cleanup fault is structurally incapable of
// becoming a RunFailure.

export interface RunFailure {
  readonly stage: RunStage;
  readonly error: unknown;   // instanceof-discriminable; `unknown` because the catch-all is total
}

export type RunCleanupReason = CleanupWorktreeResult["reason"] | "cleanup-failed";

export type RunCleanupOutcome =
  | { readonly attempted: false }
  | {
      readonly attempted: true;
      readonly removed: boolean;
      readonly reason: RunCleanupReason;
      readonly error?: unknown;
    };

export interface RunReviewResult {
  readonly state: TerminalState;
  readonly verdict?: Verdict;
  readonly worktreePath?: string;
  readonly diff?: ReviewDiff;
  readonly prompt?: string;
  readonly engineOutput?: string;
  readonly usage?: ReviewUsage;
  readonly failure?: RunFailure;
  readonly cleanup: RunCleanupOutcome;   // the only always-present field besides state
}
```

`GitPort`, `CleanupPolicy`, `ReviewDiff`, `CleanupWorktreeResult` and `LoadHarnessesDeps` all arrive through the other modules' public `index.js` (AC-15).

### Internal state

```typescript
interface RunDraft {              // mutable, private, never returned as-is
  worktreePath?: string;
  diff?: ReviewDiff;
  prompt?: string;
  engineOutput?: string;
  usage?: ReviewUsage;
}

interface PipelineOutcome {
  readonly state: TerminalState;  // mandatory => the compiler enforces "exactly one"
  readonly verdict?: Verdict;
  readonly failure?: RunFailure;
}
```

### Use case control flow

```typescript
export async function runReview(
  request: RunReviewRequest,
  deps: RunReviewDeps,
): Promise<RunReviewResult> {
  const draft: RunDraft = {};
  const outcome = await executePipeline(request, deps, draft);   // cannot throw
  const cleanup = await performCleanup(request, deps, draft, outcome.state === "ok");
  return {
    state: outcome.state,
    ...(outcome.verdict !== undefined ? { verdict: outcome.verdict } : {}),
    ...(draft.worktreePath !== undefined ? { worktreePath: draft.worktreePath } : {}),
    ...(draft.diff !== undefined ? { diff: draft.diff } : {}),
    ...(draft.prompt !== undefined ? { prompt: draft.prompt } : {}),
    ...(draft.engineOutput !== undefined ? { engineOutput: draft.engineOutput } : {}),
    ...(draft.usage !== undefined ? { usage: draft.usage } : {}),
    ...(outcome.failure !== undefined ? { failure: outcome.failure } : {}),
    cleanup,
  };
}
```

`executePipeline` body (abridged): a `let stage: RunStage = "request"` reassigned before each step, one `try` covering stages 1–8, one `catch (error: unknown) { return { state: classifyFailure(error), failure: { stage, error } }; }`. Stage specifics worth fixing here:

- **stage 2 (harness)** — `loadHarnesses(deps.harnesses)` returns a `Map` and **does not throw on an unknown type**; the lookup miss is `runReview`'s own: `throw new HarnessNotFoundError(request.harnessType)`. `SkillNotFoundError` comes out of `loadHarnesses` itself.
- **stage 1 (request)** — empty-string checks on `repoPath`/`baseRef`/`targetRef`/`harnessType` plus `Number.isFinite(timeoutMs) && timeoutMs > 0`. It deliberately does **not** re-validate path absoluteness: the spec maps a relative `repoPath` to the worktree stage, and duplicating the rule would silently move the stage label.
- **stage 6 (prompt)** — `validationOutput` forwarded with a conditional spread (`exactOptionalPropertyTypes`).
- **stage 8 (parse)** — `(deps.parseVerdict ?? extractBuiltInVerdict)(output)`; `null` ⇒ `{ state: "ambiguous" }`, otherwise `{ state: "ok", verdict }`. A throwing injected parser is caught like any other stage fault ⇒ `engine-error`, `stage: "parse"`.

### Failure classification (private, total)

```typescript
function classifyFailure(error: unknown): TerminalState {
  if (error instanceof EngineTimeoutError) return "timeout";
  if (
    error instanceof InvalidRunRequestError ||
    error instanceof InvalidWorktreeRequestError ||
    error instanceof DiffSizePolicyError ||
    error instanceof HarnessNotFoundError ||
    error instanceof SkillNotFoundError ||
    error instanceof HarnessValidationError ||
    error instanceof ContextModeNotSupportedError
  ) return "validation-failed";
  return "engine-error";
}
```

Cross-check against the spec's table: `WorktreeCreationError` and `WorktreeCleanupError` are `WorkspaceError` subclasses that are **not** listed, so they fall through to `engine-error` — which is exactly why the chain must never test the base classes `WorkspaceError`, `HarnessError` or `RunError`. `GitMergeBaseError` / `GitDiffError` leaking from the port, `EngineInvocationError`, and any bare throwable also fall through (AC-12).

### Timeout seam (`engine-timeout.ts`)

```typescript
export type TimeoutScheduler = (ms: number, onElapsed: () => void) => () => void;

const defaultTimeoutScheduler: TimeoutScheduler = (ms, onElapsed) => {
  const handle = setTimeout(onElapsed, ms);
  return () => { clearTimeout(handle); };
};

async function runEngineWithTimeout(
  invoke: () => Promise<ReviewResult>,
  timeoutMs: number,
  schedule: TimeoutScheduler,
): Promise<ReviewResult> {
  const pending = invoke();
  void pending.catch(() => {});          // a late rejection is never unhandled
  let cancel: () => void = () => {};
  const expiry = new Promise<typeof TIMED_OUT>((resolve) => {
    cancel = schedule(timeoutMs, () => { resolve(TIMED_OUT); });   // executor runs sync
  });
  try {
    const settled = await Promise.race([pending, expiry]);
    if (settled === TIMED_OUT) throw new EngineTimeoutError(timeoutMs);
    return settled;
  } catch (error) {
    if (error instanceof EngineTimeoutError) throw error;
    throw new EngineInvocationError("Engine invocation failed", { cause: error });
  } finally {
    cancel();                            // the timer is cleared on every path
  }
}
```

`TIMED_OUT` is a module-private `Symbol`, so it can never collide with a `ReviewResult`.

**Why an injected scheduler and not fake timers** (the spec left the mechanism to this stage): the scheduler is a cancellable seam, so it proves *both* halves of the spec's timeout contract — the timeout fires (AC-5) *and* the timer is always cleared. Vitest fake timers can prove the first but not the second, are process-global, force `advanceTimersByTimeAsync` interleaving with an eight-stage await chain, and would be the repo's only use of them. The scheduler follows the module-local injection precedent already set by `CreateReviewWorktreeDeps.now?`, and the tests stay plain `await`s with zero real wall-clock time. Cost: one more optional dep field.

`setTimeout`/`clearTimeout` are used as **globals, never imported**. Guard `core-no-io-libs` is import-based (`node:timers` and bare `timers` are both banned as specifiers), and `Date.now()` in `create-review-worktree.ts` is the standing precedent for a runtime global in core.

### Error family (`run-errors.ts`)

`RunError extends Error` with `readonly cause?: unknown` stored conditionally via `if ("cause" in options)` — byte-for-byte the `WorkspaceError` / `HarnessError` / `GitError` pattern. `InvalidRunRequestError` takes no options (like `InvalidWorktreeRequestError`); `EngineInvocationError` takes options and preserves the raw rejection in `cause`; `EngineTimeoutError` carries `readonly timeoutMs: number`. Every subclass sets `this.name`.

### Built-in extraction (`builtin-verdict-extraction.ts`, never re-exported)

```typescript
const VERDICT_LINE = /^VERDICT:\s*(approve|request-changes|comment)$/;

export function extractBuiltInVerdict(output: string): Verdict | null {
  const found = new Set<Verdict>();
  for (const line of output.split("\n")) {
    const match = VERDICT_LINE.exec(line.trim());
    if (match !== null) found.add(match[1] as Verdict);
  }
  const [only] = [...found];
  return found.size === 1 && only !== undefined ? only : null;
}
```

Case-sensitive, anchored, no ANSI stripping, no fence unwrapping, no normalization — the Non-Goals boundary against H2. Two identical `VERDICT:` lines collapse to one distinct value ⇒ that verdict; zero or two distinct values ⇒ `null` ⇒ `ambiguous`. `VerdictParser = (output: string) => Verdict | null` is the seam H2 replaces.

### Cleanup

```typescript
async function performCleanup(request, deps, draft, reviewSucceeded): Promise<RunCleanupOutcome> {
  if (draft.worktreePath === undefined) return { attempted: false };
  try {
    const result = await cleanupWorktree(
      { repoPath: request.repoPath, worktreePath: draft.worktreePath,
        policy: request.cleanupPolicy ?? "always", reviewSucceeded },
      { git: deps.git },
    );
    return { attempted: true, removed: result.removed, reason: result.reason };
  } catch (error) {
    return { attempted: true, removed: false, reason: "cleanup-failed", error };
  }
}
```

`catch (error: unknown)` covers `WorktreeCleanupError` *and* any raw throwable `cleanupWorktree` rethrows unwrapped. Nothing here can touch `outcome.state` — it is already computed and passed in read-only as `reviewSucceeded`.

## Test Strategy

Two new files under `src/core/run/__test__/` (vitest `core` project).

`run-review-fixtures.ts` provides: `buildRequest(overrides)`; `buildDeps(overrides)`; `buildHarnessDeps({ contextMode?, skills?, missingSkill? })` wrapping two `FakeHarnessLoader` instances (factory + user); `SAMPLE_DIFF_RESULT` (`raw: "diff --git a/src/a.ts b/src/a.ts\n+added\n"` with a matching `stats` entry, so `computeReviewDiff` yields a non-empty `ReviewDiff`); and `createManualScheduler({ fireImmediately? })` returning `{ scheduler, calls, cancelCount }`.

Reused fakes, verified against source before relying on them:

| Fake | Path | Capability this design depends on |
|---|---|---|
| `createFakeGitPort` | `src/core/workspace/__test__/workspace-git-fake.ts` | `addCalls`, `removeCalls`, `addError`, `removeError`, `mergeBaseResult`, `diffResult` — all present (AC-4, AC-7, AC-8, AC-9, AC-11) |
| `FakeHarnessLoader` | `src/core/review/__test__/fake-harness-loader.ts` | `addHarness`/`addSkill`; `loadHarness` throws `HarnessNotFoundError`, missing skill ⇒ `SkillNotFoundError` from `loadHarnesses` |
| `createFakeEngine` | `src/adapters/driven/engines/fake/fake-engine.ts` | `{ ok: true, result }` / `{ ok: false, error }`; sequences |

`addError` / `removeError` must be injected as `GitWorktreeError` instances — `createReviewWorktree` and `cleanupWorktree` only wrap that class and rethrow anything else raw.

**Cross-boundary test imports are legal and verified**: the run tests import `createFakeEngine` from `src/adapters/…` and the git fake from another core module's `__test__/`. `.dependency-cruiser.cjs` sets `options.exclude.path: "(^|/)__test__/"` (dec-005), so `depcruise src` never cruises these files; `tsc --noEmit` still typechecks them (`include: ["src"]`). AC-15 therefore applies to production files only, which is where it bites. This is the first cross-module fake reuse in the repo — recorded as an A-level decision rather than left implicit.

| AC | Test |
|---|---|
| AC-1, AC-2 | happy path: single `VERDICT: approve` ⇒ `ok` + verdict + `prompt`/`diff`/`engineOutput` populated |
| AC-3 | (a) no `VERDICT:` line; (b) `approve` + `request-changes` ⇒ `ambiguous`, no `verdict` |
| AC-4 | (a) `createFakeEngine({ ok: false, error })`; (b) `addError: new GitWorktreeError(...)` ⇒ `engine-error`; asserts `failure.stage` = `"engine"` / `"worktree"` |
| AC-5 | never-settling engine + `createManualScheduler({ fireImmediately: true })` ⇒ `timeout`, resolves promptly; plus `calls[0].ms === timeoutMs` and `timeoutMs` forwarded in the engine's `ReviewRequest` |
| AC-6 | seven cases, one per enumerated producer; an eighth (a `HarnessLoader` stub throwing `HarnessValidationError`) is cheap and closes the classifier's last row |
| AC-7 | `policy: "always"` × {`ok`, `ambiguous`, `engine-error`, `timeout`} ⇒ `removeCalls.length === 1` each |
| AC-8 | `keep` ⇒ 0 removes; `on-success` ⇒ removes on `ok`, not on `engine-error`/`timeout` |
| AC-9 | `removeError` on the happy path ⇒ `state: "ok"`, `cleanup.reason === "cleanup-failed"`, resolves |
| AC-10 | engine rejection + `removeError` ⇒ `engine-error` **and** `failure.error instanceof EngineInvocationError` **and** `cleanup.reason === "cleanup-failed"` |
| AC-11 | unknown harness and `timeoutMs: 0` ⇒ `addCalls.length === 0`, `cleanup.attempted === false` |
| AC-12 | a dep stub throwing a bare `TypeError` ⇒ resolves as `engine-error`, `failure.error` is that `TypeError` |
| AC-13 | with/without `validationOutput` ⇒ `<validation-output>` present/absent in `result.prompt` |
| AC-14 | `deps.parseVerdict: () => "comment"` overrides the built-in |
| — | timer hygiene: happy path leaves `cancelCount === 1` |
| AC-15/16/17/18 | `npm run check`, `npm test`, source inspection, `git diff --stat` |

## Alternatives And Trade-Offs

| Option | Decision | Why |
|---|---|---|
| Timeout: vitest fake timers vs. injected `delay(ms)` promise vs. injected cancellable scheduler | **Cancellable scheduler** | A bare `delay` promise cannot be cleared, so the production default would keep the event loop alive after a fast review. Fake timers cannot prove cancellation and are process-global. The scheduler mirrors the existing `now?` seam. |
| Classify on `(stage, errorClass)` vs. `errorClass` alone | **Class alone** | Every class in the spec's table maps to one state across all its rows; the pair adds a second source of truth. `failure.stage` still carries the stage for E6. |
| Cleanup in a `finally` vs. sequentially after an exhaustive catch | **Sequential** | The spec asks for a "`finally`-shaped guarantee", and an exhaustive catch delivers the same guarantee without the classic hazard of a `finally` altering the returned value (AC-9/AC-10 are exactly that hazard). |
| Pipeline as inline try/catch in `runReview` vs. a private function returning `PipelineOutcome` | **Private function** | Makes "exactly one terminal state" a return-type obligation the compiler checks, instead of relying on definite-assignment analysis of a `let state`. |
| `VerdictParser` ⇒ `Verdict \| null` vs. a discriminated result object | **`\| null`** | Two outcomes only (`ok`/`ambiguous`). H2 owns the richer shape and adapts at the seam; a speculative result object would pre-empt H2's public API. |
| Extraction in `run-review.ts` vs. its own file | **`builtin-verdict-extraction.ts`** | Keeps the hot file lean and leaves the obvious names (`parse-verdict.ts`, `parseVerdict`) free for H2. Not re-exported (AC-16). |
| `cleanupPolicy` required vs. optional defaulting to `"always"` | **Optional, default `"always"`** | A-level. No config default exists yet (`config-schemas.ts` has no cleanup key), PRD §5.1 lists `always` first as the normal mode, and E6/E5 can add the config wiring without a breaking signature change. |
| `RunReviewRequest.extraSkills` (the `loadHarnesses` second parameter) | **Omitted** | Not in the spec's In Scope; adding a public field for an un-specced CLI flag would be scope leak. `loadHarnesses(deps.harnesses)` is called with no extras; adding the field later is additive. |
| `failure.error: unknown` vs. `Error` | **`unknown`** | The catch-all is total, so a non-`Error` throwable is reachable (AC-12). Matches the house `cause?: unknown`. Cost: E6 must narrow. |
| Request/deps/result types in `run-review.ts` vs. a `run-types.ts` | **Co-located** | Matches `create-review-worktree.ts` / `compute-review-diff.ts`, which co-locate their own request/deps/result shapes. |

## Open Technical Questions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| (none blocking) | — | — | Every question the spec routed to design is settled above |
| `r-engine-not-cancellable` | On timeout the engine promise is abandoned; cleanup may later remove a worktree a live process holds | E4.F2 (#28-30) | Carried forward unchanged. Inert in H1 (FakeEngine, in-memory git). `timeoutMs` is still passed to the engine so real adapters own process kill. |
| Cross-module `__test__` fake reuse | First time in the repo; could look like a guard violation in review | executor | Resolved A-level with evidence (`options.exclude.path` in `.dependency-cruiser.cjs`); called out here so QA does not re-litigate it. |

## Approval Notes

- No PRD conflict. Five terminal states, ephemeral worktree, `merge-base(base, target)..target`, prompt persisted in the result — all as PRD §4.6, §5.1, §5.2, §9.
- Both user-settled decisions are honoured verbatim: `harnessType: string` + `deps.harnesses` (`d-harness-resolution`), and `validation-failed` as a pre-flight-only state (`d-validation-failed-preflight`). Neither is reopened.
- `d-change-scope` upheld: no H2 parser work absorbed; the built-in extraction is naive, module-private, and behind `deps.parseVerdict`.
- `d-dec004-scope` honoured: the wall clock and the typed error family are implemented as sanctioned scope, with no change to the frozen `ReviewEngine` port or to `FakeEngine`.
- Nothing outside `src/core/run/**` is touched (AC-17).
- Ready for `sddl-plan`: file list, per-file content, control flow and the AC→test map are all fixed, so the plan can be a pure ordering exercise.

## Budget Notes

- Above the 400–600 word target, as the spec was. The overage is concentrated in code blocks that fix exact signatures under `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`, and in the AC→test table. Both exist so the executor writes the hot path once instead of discovering the strict-mode constraints during implementation.
