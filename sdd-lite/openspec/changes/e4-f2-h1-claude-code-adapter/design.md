# Design

## Routing Digest

- change_name: e4-f2-h1-claude-code-adapter
- objective: new-feature
- route: continue-lite
- digest_summary: Four files under `src/adapters/driven/engines/claude-code/` (`claude-code-adapter.ts` factory + `review()` orchestration, `process-runner.ts` the injectable seam + execa-backed default, `errors.ts` the 3 typed classes, `envelope.ts` the JSON parsing/extraction helpers), plus `__test__/claude-code-adapter.test.ts` and a barrel export added to `engines/index.ts`. AC-19 (timeout precedence) is fixed: the adapter's execa `timeout` is set to `request.timeoutMs` **exactly** (no artificial shortening) with an explicit, shortened `forceKillAfterDelay` (2000 ms, not execa's 5000 ms default) — this lets the outer race in `runEngineWithTimeout` win in the overwhelming majority of real executions (an OS-mediated process kill inherently settles later than the outer timer's synchronous `resolve()`), producing the semantically-correct `"timeout"` terminal state, while bounding worst-case child-process lifetime to `timeoutMs + ~2s`. The rare case where the adapter's own rejection wins the race degrades gracefully to `"engine-error"` (not a defect — `failure.error.cause` still carries the full typed error) and is recorded as an accepted residual risk, not silently hidden.
- affected_areas_digest: New directory only — `src/adapters/driven/engines/claude-code/**` (4 source files + `__test__/`) and one barrel-export line in `engines/index.ts`. Zero changes to `src/core/**`, `run-review.ts`, `engine-timeout.ts`, `review-engine.ts`, or `run-errors.ts` — all confirmed frozen by direct read.
- interfaces_digest: `createClaudeCodeAdapter(options?: ClaudeCodeAdapterOptions): ReviewEngine`; `ClaudeCodeAdapterOptions = { binaryPath?, model?, runProcess? }`; `ClaudeCodeProcessRunner = (args: readonly string[], opts: ClaudeCodeProcessRunOptions) => Promise<ClaudeCodeProcessResult>`; three `Error` subclasses (`ClaudeCodeUnavailableError`, `ClaudeCodeInvocationError`, `ClaudeCodeReviewError`).

## Summary

- change_name: e4-f2-h1-claude-code-adapter
- objective: new-feature
- route: continue-lite
- design_status: complete

This design fixes exactly what spec.md left open (Approval Notes, last bullet): internal file/function decomposition, the exact `ClaudeCodeProcessRunner`/`ClaudeCodeProcessResult` shapes, the three error classes' constructors, the pre-flight budget number, and AC-19's timeout-precedence ordering. All 27 spec ACs are restated as binding input, not reopened — this document does not touch `spec.md`'s firm rules (in particular AC-9/AC-11/AC-13/AC-14/AC-18's fixed error-class mapping, which is the load-bearing constraint AC-19's resolution below depends on).

## Design Overview

**File split rationale.** Four files, not one and not six. `claude-code-adapter.ts` (factory + orchestration) is kept separate from `process-runner.ts` (the execa seam) because the seam is the one piece a test double must replace wholesale (AC-20) — splitting it out makes the injection point visually obvious and keeps the default execa wiring (AC-21) isolated from orchestration logic. `errors.ts` is separated because three `Error` subclasses with doc-comments are a natural, self-contained unit reused nowhere else, matching `git-cli.ts`'s neighbor pattern in spirit (though `git-cli.ts` inlines its errors in `core/repos` since those are port errors — here the three classes are adapter-local, so they get their own file rather than polluting the orchestration file). `envelope.ts` is separated because JSON-envelope parsing/extraction (`.is_error`, `.result`, `.usage` → `ReviewUsage`) is a pure, independently-testable transformation with no process/execa dependency at all — keeping it pure and side-effect-free means it can be unit-tested with plain object literals, not just through the full `runProcess` stub seam. A leaner two-file split (adapter+runner merged, errors+envelope merged) was considered and rejected: `claude-code-adapter.ts` already has three responsibilities (pre-flight, invocation, timeout wiring) before adding execa details, and mixing pure parsing (`envelope.ts`) with typed-error construction (`errors.ts`) would make the errors file import unrelated parsing helpers it doesn't need.

**AC-19 resolution (see "Alternatives And Trade-Offs" for the full reasoning).** The adapter's own execa `timeout` for the real review invocation is set to `request.timeoutMs` unchanged — not a shortened budget. Combined with a short, explicit `forceKillAfterDelay: 2000`, this makes the outer `runEngineWithTimeout` race in `run-review.ts` win essentially every real invocation (verified against the actual source: `engine-timeout.ts:76-111`), producing `"timeout"` as the terminal state, while bounding the window in which `r-cleanup-races-abandoned-engine` (a still-alive child process racing worktree cleanup) can manifest to a fixed ~2s ceiling.

## Affected Areas

| Path Or Module | Planned Change | Risk |
|---|---|---|
| `src/adapters/driven/engines/claude-code/claude-code-adapter.ts` | New. `createClaudeCodeAdapter` factory + `review()`: pre-flight, invocation, timeout wiring, error translation. | low |
| `src/adapters/driven/engines/claude-code/process-runner.ts` | New. `ClaudeCodeProcessRunner`/`ClaudeCodeProcessRunOptions`/`ClaudeCodeProcessResult` types + `defaultRunProcess` (execa-backed). | low |
| `src/adapters/driven/engines/claude-code/errors.ts` | New. `ClaudeCodeUnavailableError`, `ClaudeCodeInvocationError`, `ClaudeCodeReviewError`. | low |
| `src/adapters/driven/engines/claude-code/envelope.ts` | New. Pure JSON-envelope parsing/extraction helpers (`.is_error`, `.result`, `.usage` → `ReviewUsage`). | low |
| `src/adapters/driven/engines/claude-code/__test__/claude-code-adapter.test.ts` | New. `reviewEngineContract` harness + AC-specific unit tests, fixture-replaying `runProcess` stubs. | low |
| `src/adapters/driven/engines/index.ts` | Add `export { createClaudeCodeAdapter } from "./claude-code/claude-code-adapter.js";` and its `ClaudeCodeAdapterOptions` type export. | low |
| `src/core/run/**` | None. Confirmed frozen by direct read (`review-engine.ts`, `run-review.ts`, `engine-timeout.ts`, `run-errors.ts`, `terminal-state.ts`). | — |

## Interfaces, Data, And State

### Factory and options

```ts
export interface ClaudeCodeAdapterOptions {
  readonly binaryPath?: string;   // default "claude"
  readonly model?: string;        // default "sonnet"
  readonly runProcess?: ClaudeCodeProcessRunner;
}

export function createClaudeCodeAdapter(
  options?: ClaudeCodeAdapterOptions,
): ReviewEngine;
```

Defaults are resolved once, inside the factory body, into local `const`s — never re-read per `review()` call (mirrors `git-cli.ts`'s pattern of closing over adapter-scoped config).

### `ClaudeCodeProcessRunner` — the injection seam (AC-20)

Modeled directly off execa 9.6.1's actual return/option shapes (`node_modules/execa/types/return/result.d.ts`, `.../arguments/options.d.ts`, read directly), narrowed to exactly what the adapter's logic branches on:

```ts
export interface ClaudeCodeProcessRunOptions {
  readonly cwd: string;
  readonly input?: string;       // stdin payload; absent for the --version pre-check
  readonly timeoutMs: number;    // 0/absent semantics: no timeout enforced by the runner itself
}

/**
 * Narrow process-invocation seam. Resolves for both a clean exit AND a
 * non-zero/signal-terminated exit — the adapter branches on `exitCode`/
 * `signal`, it does not rely on rejection to detect process failure. Only
 * a genuine spawn failure (ENOENT, permission denied) REJECTS.
 */
export type ClaudeCodeProcessRunner = (
  args: readonly string[],
  options: ClaudeCodeProcessRunOptions,
) => Promise<ClaudeCodeProcessResult>;

export interface ClaudeCodeProcessResult {
  readonly stdout: string;
  readonly exitCode?: number;    // undefined when terminated by a signal
  readonly signal?: string;      // e.g. "SIGTERM" / "SIGKILL"; undefined on a clean exit
  readonly timedOut: boolean;    // execa's own `timedOut` — true iff its own `timeout` option fired
}
```

**Resolve-not-reject design choice.** execa's default `reject: true` behavior throws an `ExecaError` on non-zero exit or signal termination — but that `ExecaError` object *carries the same fields* (`stdout`, `exitCode`, `signal`, `timedOut`) as a success `Result`, merged onto the thrown error (confirmed directly against `result.d.ts`: `CommonResult` is the base both `SuccessResult` and the error share). `defaultRunProcess` therefore calls execa with `{ reject: false }` and returns its `Result` directly as `ClaudeCodeProcessResult` in every case except a genuine spawn failure (execa still throws when the binary cannot be spawned at all, e.g. `ENOENT` — that is the one path `ClaudeCodeProcessRunner`'s Promise is allowed to reject on, per its own doc-comment above). This keeps the seam's contract simple for a fixture-replaying test double: a fixture double only ever needs to *resolve* with a scripted `{ stdout, exitCode, signal, timedOut }` tuple, matching each of the 6 fixtures' documented exit behavior (0 for the 4 `is_error`-carrying/successful fixtures, 143/SIGTERM or 137/SIGKILL for the two synthetic timeout scenarios spec.md's Expected Behavior table describes) — it never needs to construct a fake rejection to simulate a non-zero exit.

### `defaultRunProcess` — execa-backed default (AC-21)

```ts
async function defaultRunProcess(
  args: readonly string[],
  { cwd, input, timeoutMs }: ClaudeCodeProcessRunOptions,
): Promise<ClaudeCodeProcessResult> {
  const result = await execa(binaryPath, args, {
    cwd,
    ...(input !== undefined ? { input } : {}),
    ...(timeoutMs > 0 ? { timeout: timeoutMs, killSignal: "SIGTERM", forceKillAfterDelay: 2000 } : {}),
    reject: false,
  });
  return {
    stdout: result.stdout,
    ...(result.exitCode !== undefined ? { exitCode: result.exitCode } : {}),
    ...(result.signal !== undefined ? { signal: result.signal } : {}),
    timedOut: result.timedOut,
  };
}
```

`binaryPath` is closed over from the factory's resolved options (not a parameter) — the seam type stays engine-agnostic-looking on purpose (`args`/`options` only), matching `ClaudeCodeProcessRunner`'s narrow, single-purpose signature. `killSignal`/`forceKillAfterDelay` are only meaningful when `timeout` is set, hence the conditional spread (`exactOptionalPropertyTypes` compliance, same pattern `git-cli.ts` and `run-review.ts` already use throughout).

### Contract-test harness — one concrete example (proving the seam, AC-20/AC-22)

```ts
// __test__/claude-code-adapter.test.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../../../fixtures/claude-code/${name}`, import.meta.url)),
    "utf-8",
  );
}

const harness: ReviewEngineContractHarness = {
  resolving: (output, usage) =>
    createClaudeCodeAdapter({
      runProcess: async (args) => {
        if (args.includes("--version")) {
          return { stdout: "2.1.226 (Claude Code)", exitCode: 0, timedOut: false };
        }
        // "resolving" scenarios replay valid-verdict.json verbatim; output/usage
        // params let the shared contract suite assert generically (AC-9/AC-10).
        return { stdout: fixture("valid-verdict.json"), exitCode: 0, timedOut: false };
      },
    }),
  rejecting: () =>
    createClaudeCodeAdapter({
      runProcess: async (args) => {
        if (args.includes("--version")) {
          return { stdout: "2.1.226 (Claude Code)", exitCode: 0, timedOut: false };
        }
        return { stdout: fixture("auth-error.json"), exitCode: 1, timedOut: false };
      },
    }),
};

reviewEngineContract(harness, "claude-code");
```

This is a fresh `createClaudeCodeAdapter({ runProcess })` per scenario factory call (matching AC-20's "constructs a fresh adapter" requirement) and never touches `PATH`, `execa`, or any monkey-patch — the double is a plain async function literal. Additional non-shared `it` blocks in the same file cover AC-3 through AC-19 individually (recorded `cwd`/`args`/`input`, SIGTERM-before-SIGKILL ordering via a never-resolving stub plus fake timers, the pre-flight-failure short-circuit, etc.) — the shared `reviewEngineContract` only proves the port-level resolve/reject shape (AC-9's exact string, AC-10/AC-11's usage math via the `resolving(output, usage)` parameterization already built into the harness interface).

### Three error classes (AC-8/AC-13/AC-14/AC-5)

```ts
/** Thrown when the pre-flight `claude --version` check fails (AC-5). No `cause` — the pre-check's own rejection/non-zero exit is not itself informative beyond "the binary is unusable". */
export class ClaudeCodeUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaudeCodeUnavailableError";
  }
}

/** Thrown when stdout cannot be parsed as JSON, or parses but lacks a usable `.result` on `is_error:false` (AC-8, AC-9, AC-14). */
export class ClaudeCodeInvocationError extends Error {
  readonly cause?: unknown;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "ClaudeCodeInvocationError";
    if (options !== undefined && "cause" in options) this.cause = options.cause;
  }
}

/** Thrown when the real review invocation's own envelope reports `.is_error === true`, for ANY cause including an adapter-initiated SIGTERM kill that still flushed JSON (AC-13, AC-18). Message = `.result` when present, else a fallback naming exit code/signal. */
export class ClaudeCodeReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClaudeCodeReviewError";
  }
}
```

`ClaudeCodeInvocationError` alone carries `cause` (parse failures have a real underlying `SyntaxError` worth preserving); the other two are constructed from information the adapter has already extracted into a clear message, so a `cause` field would only duplicate it — same asymmetry `run-errors.ts`'s own family already models (`InvalidRunRequestError` has no `cause`, `EngineInvocationError`/`EngineTimeoutError` do). None extends a shared local base class — spec.md fixes exactly three flat `Error` subclasses, no family hierarchy implied.

### Envelope parsing (`envelope.ts`) — pure, no I/O

```ts
interface ClaudeCodeEnvelope {
  readonly is_error: boolean;
  readonly result?: string;
  readonly usage?: { readonly input_tokens?: number; readonly output_tokens?: number };
  readonly errors?: readonly string[];
}

/** Parses stdout; throws ClaudeCodeInvocationError on malformed/empty JSON (AC-8). */
function parseEnvelope(stdout: string): ClaudeCodeEnvelope;

/** Extracts { output, usage? } for the is_error:false path (AC-9, AC-10, AC-11, AC-12); throws ClaudeCodeInvocationError if `.result` is missing/non-string. */
function extractSuccess(envelope: ClaudeCodeEnvelope): ReviewResult;

/** Builds the ClaudeCodeReviewError message for the is_error:true path (AC-13): `.result` when present, else a fallback citing exit code/signal from ClaudeCodeProcessResult. */
function buildReviewErrorMessage(envelope: ClaudeCodeEnvelope, processResult: ClaudeCodeProcessResult): string;
```

`totalTokens` (AC-11) is computed inline in `extractSuccess`: `inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined`, built into `ReviewUsage` conditionally (`exactOptionalPropertyTypes`) — cache-token fields are never read from `.usage` at all, not merely excluded after reading (nothing in `envelope.ts` even names `cache_read_input_tokens`/`cache_creation_input_tokens`).

### `review()` orchestration (`claude-code-adapter.ts`)

```
async function review(request: ReviewRequest): Promise<ReviewResult> {
  // 1. Pre-flight (AC-5, AC-6, AC-15): runProcess(["--version"], { cwd, timeoutMs: PREFLIGHT_TIMEOUT_MS })
  //    reject OR exitCode !== 0  →  throw ClaudeCodeUnavailableError
  // 2. Real invocation (AC-3, AC-4, AC-16, AC-17): runProcess(
  //      ["-p", "--model", model, "--output-format", "json"],
  //      { cwd: request.worktree.path, input: request.prompt, timeoutMs: request.timeoutMs },
  //    )
  // 3. parseEnvelope(result.stdout)  →  ClaudeCodeInvocationError on failure (AC-8, AC-14)
  // 4. envelope.is_error === true    →  throw ClaudeCodeReviewError(buildReviewErrorMessage(...)) (AC-13, AC-18)
  // 5. envelope.is_error === false   →  return extractSuccess(envelope) (AC-9..AC-12)
}
```

`PREFLIGHT_TIMEOUT_MS = 5_000` (AC-15's "short, fixed internal budget") — a module-level constant, not derived from `request.timeoutMs`. Rationale: `claude --version` is a local, non-network call per the spike doc's own timing evidence; 5s is generous enough to absorb a cold-start (binary not yet cached by the OS, first invocation after install) while remaining far shorter than any realistic `request.timeoutMs` a review would configure (reviews run tens of seconds to minutes per the spike's own cost/duration figures). Passed through the *same* `runProcess` seam (point 8 of the required-reading list), proving the seam is genuinely uniform — no second injection mechanism for the pre-check.

The entire function body has no bare `throw` outside its own `async` scope (AC-23) — every throwing statement sits directly inside `review()` (an `async function`), so a synchronous throw becomes a promise rejection automatically; there is no synchronous helper called before the first `await` that could throw outside that boundary.

## Alternatives And Trade-Offs

| Option | Decision | Why |
|---|---|---|
| AC-19: adapter internal timeout **deliberately shorter** than `request.timeoutMs` (e.g. 90–95% margin) | Rejected | Spec's AC-13/AC-14/AC-18 already fix the adapter's own timeout-kill rejection to `ClaudeCodeReviewError`/`ClaudeCodeInvocationError` — never `EngineTimeoutError` (confirmed: these are the two error classes the *approved* spec names for exactly this scenario, and the core-exported `EngineTimeoutError` "escape hatch" `engine-timeout.ts`'s own catch clause supports — `error instanceof EngineTimeoutError → rethrow unwrapped` — is therefore unusable here without contradicting an already-approved AC). A shortened budget only makes the adapter's own (non-`EngineTimeoutError`) rejection settle *earlier*, which strictly *increases* the odds `pending` beats `expiry` in `Promise.race` and `runReview` reports `"engine-error"` instead of `"timeout"` — the opposite of the more informative outcome. It also silently caps the actual review budget below what the user configured (`--timeout`), a hidden, surprising product regression worse than an occasional terminal-state mislabel. |
| AC-19: adapter internal timeout **equal to** `request.timeoutMs` (chosen) | **Chosen** | Read `engine-timeout.ts:76-111` directly: `runEngineWithTimeout` calls `invoke()` first, *then* schedules its own `timeoutMs`-delay timer; the timer's callback is a synchronous `resolve(TIMED_OUT)` — no I/O wait. The adapter's own kill sequence (execa's internal `timeout` firing at the *same* nominal delay, sending `SIGTERM`, waiting for the child to actually exit, draining stdout, then settling its promise) inherently requires at least one additional OS-mediated round trip beyond that same instant — a process exit is never synchronous with the signal that requests it. So `expiry` reliably wins `Promise.race` in real execution without needing an artificial margin, producing `EngineTimeoutError` → `"timeout"` (the correct, informative terminal state) in the overwhelming majority of invocations, while the adapter still starts killing its child at the *earliest* possible instant (no wasted head-start), minimizing how long `r-cleanup-races-abandoned-engine`'s window stays open. `forceKillAfterDelay` is explicitly shortened to 2000 ms (execa's default is 5000 ms) to put a hard, small ceiling on that window rather than relying on execa's default. |
| AC-19: leave `forceKillAfterDelay` at execa's 5000 ms default | Rejected | Widens `r-cleanup-races-abandoned-engine`'s window unnecessarily (worktree cleanup in `run-review.ts` runs immediately after the pipeline settles, regardless of whether the abandoned child has actually exited yet) with no offsetting benefit — the CLI's own documented shutdown behavior (spike doc: "shuts down gracefully" on SIGTERM) does not need 5s of grace in the common case. 2000 ms is a deliberate, explicit override, not a silent inherited default. |
| File split: adapter+runner in one file, errors+envelope in one file (2-file layout) | Rejected | `claude-code-adapter.ts` alone already carries three responsibilities (pre-flight, invocation, timeout config); folding execa wiring into it too would bury the one seam AC-20 needs to be visually obvious behind orchestration logic. Pure envelope parsing has zero overlap with typed-error construction beyond "both get thrown/returned from the same `review()` call" — merging them would force `errors.ts` readers to also read unrelated JSON-shape code. |
| Pre-flight budget derived as a fraction of `request.timeoutMs` | Rejected | AC-15 explicitly requires the pre-check be bounded by "a short, fixed internal budget (**not** `timeoutMs`)" — deriving it from `timeoutMs` would violate that AC outright, not just be a worse design. |

## Open Technical Questions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| AC-19 residual: the rare real-world case where the adapter's own rejection wins the race (e.g. an unusually fast-exiting `claude` process, or a future refactor that delays when `invoke()`'s synchronous portion starts) | The terminal state degrades from `"timeout"` to `"engine-error"` for that one run — not a correctness bug (the review still fails cleanly, `failure.error.cause` still names the timeout explicitly), but a cosmetic inconsistency across otherwise-identical timeout scenarios. Cannot be eliminated without either changing `run-review.ts`/`engine-timeout.ts` (frozen, out of scope for this story) or having the adapter violate AC-13/AC-14/AC-18's fixed error-class mapping (not permitted — spec is approved). | Accept now; revisit only if a later story unfreezes `runEngineWithTimeout` | open, low severity, accepted — documented here and at the call site, not silently dropped |
| `r-claude-cli-version-drift` (flags verified only against `2.1.226`) | Carried forward unresolved from spec.md, as spec itself flagged (informational only, not design-blocking) | Before/during `sddl-executor`, per spec's own Open Questions row | open, informational, unchanged from spec |
| Contract-test coverage of AC-16/AC-17 (SIGTERM-then-SIGKILL ordering) needs a never-resolving `runProcess` stub combined with fake timers or an injected clock, since `defaultRunProcess`'s actual execa timing is not exercised by a fixture-replaying double | The `runProcess` seam type itself carries no scheduling — AC-16/17's ordering is a property of `defaultRunProcess`'s execa options, not of the seam contract, so a stub-based test can only assert the *adapter's* reaction to a `{ signal, timedOut }` result, not that execa itself escalates correctly. `execution-log.md`'s manual verification (AC-24) is the closest end-to-end proof of the real escalation; a stub-level unit test for AC-16/17 asserts the adapter *passes the right execa options*, not the OS-level escalation itself. | `sddl-plan` should sequence this as its own explicit test case, not assume it falls out of the contract suite | open, low severity — recorded so plan does not assume AC-16/17 is proven by `reviewEngineContract` alone |

## AC → Design Mapping (27/27 mapped)

| AC | Satisfied By |
|---|---|
| AC-1 | `claude-code-adapter.ts`: `createClaudeCodeAdapter(options?)` factory function, no class |
| AC-2 | `ClaudeCodeAdapterOptions` shape with the three stated defaults, resolved once in the factory body |
| AC-3 | `review()` step 1 & 2 both pass `cwd: request.worktree.path` to `runProcess` |
| AC-4 | `review()` step 2: exact args array, `input: request.prompt` (never argv) |
| AC-5 | `review()` step 1: pre-flight reject/non-zero → `ClaudeCodeUnavailableError`, real invocation never reached |
| AC-6 | `review()` step 1 → step 2 control flow: exit 0 falls through |
| AC-7 | Doc-comment on `review()` explicitly stating the pre-flight/real-invocation split, cross-referenced with AC-5/AC-13 tests |
| AC-8 | `envelope.ts`: `parseEnvelope` throws `ClaudeCodeInvocationError` on `JSON.parse` failure |
| AC-9 | `envelope.ts`: `extractSuccess` returns `.result` verbatim; throws `ClaudeCodeInvocationError` if missing/non-string |
| AC-10 | `envelope.ts`: `extractSuccess` reads `.usage.input_tokens`/`.output_tokens` only when both are numbers |
| AC-11 | `envelope.ts`: `totalTokens = inputTokens + outputTokens` inline computation, cache fields never read |
| AC-12 | `envelope.ts`: `usage` built conditionally (`exactOptionalPropertyTypes`), never assigned `undefined` |
| AC-13 | `review()` step 4 + `errors.ts`: `ClaudeCodeReviewError`, message from `buildReviewErrorMessage` |
| AC-14 | `envelope.ts`/`review()` step 3: unparseable stdout (any cause) → `ClaudeCodeInvocationError`, same path as AC-8 |
| AC-15 | `PREFLIGHT_TIMEOUT_MS = 5_000` module constant, used only for the pre-flight `runProcess` call |
| AC-16 | `defaultRunProcess`: execa `killSignal: "SIGTERM"` (also execa's own default, made explicit) |
| AC-17 | `defaultRunProcess`: execa `forceKillAfterDelay: 2000` |
| AC-18 | `review()` steps 3-4 unify: any timeout-kill outcome (flushed JSON or empty stdout) rejects via AC-13 or AC-14's path, never resolves |
| AC-19 | Resolved above: adapter timeout = `request.timeoutMs` exactly + `forceKillAfterDelay: 2000`; outer race wins in practice; residual documented in Open Technical Questions |
| AC-20 | `ClaudeCodeAdapterOptions.runProcess`, contract harness example above: plain async function doubles, no PATH/monkey-patch |
| AC-21 | `defaultRunProcess`: direct `execa()` call, no other spawn mechanism |
| AC-22 | `__test__/claude-code-adapter.test.ts`: `reviewEngineContract(harness, "claude-code")`, import unmodified from `ReviewEngine.contract.ts` |
| AC-23 | `review()` is a single `async function`; no bare `throw` outside it; every failure path is a `throw` inside the async body, which always rejects the returned Promise |
| AC-24 | `execution-log.md` entry at executor time — manual verification run, not covered by this design |
| AC-25 | `claude-code-adapter.ts`/`process-runner.ts`/`errors.ts`/`envelope.ts` import only `../../../../core/run/index.js` (`ReviewEngine`, `ReviewRequest`, `ReviewResult`, `ReviewUsage` types) — mirrors `fake-engine.ts`'s import line exactly; no import from `engines/fake/` or any other adapter folder; `execa` imported only in `process-runner.ts` |
| AC-26 | File list above is the complete diff surface: `claude-code/**`, its `__test__/`, and one barrel-export line in `engines/index.ts` |
| AC-27 | Standard gate, no design-level exception |

## Approval Notes

- All four spec-resolved risks (`r-isavailable-port-gap`, `r-binary-mocking-seam`, `r-is-error-classification`, `r-total-tokens-computation`) are restated as fixed inputs, not reopened.
- AC-19 (`r-timeout-budget-precedence`) is fixed in this document with a concrete mechanism (`timeout: request.timeoutMs`, `forceKillAfterDelay: 2000`) and a concrete, source-grounded justification (`engine-timeout.ts:76-111` read directly, not assumed) — the one item spec deliberately deferred is not punted further.
- The `EngineTimeoutError` "escape hatch" documented in `e4-f1-h1-run-review/state.yaml`'s `r-timeout-budget-precedence` entry was investigated and deliberately **not used**: it would require the adapter's own timeout-kill path to throw the core's `EngineTimeoutError` instead of `ClaudeCodeReviewError`/`ClaudeCodeInvocationError`, directly contradicting spec.md's already-approved AC-13/AC-14/AC-18. Not re-litigated as a spec change here — recorded as evidence the alternative was considered, not overlooked.
- `r-claude-cli-version-drift` carried forward unresolved, unchanged from spec — informational only.
- Recommended next stage: `sddl-plan`, to sequence roughly (1) `errors.ts` + `envelope.ts` (pure, no execa dependency, easiest to land and unit-test first), (2) `process-runner.ts` (the execa seam + `defaultRunProcess`), (3) `claude-code-adapter.ts` (orchestration wiring the first two together) + barrel export, (4) `__test__/claude-code-adapter.test.ts` covering all 27 ACs including the `reviewEngineContract` harness, then the full gate + the manual AC-24 verification run recorded in `execution-log.md`.

## Budget Notes

- Proportional to the story's own severity: 27 ACs, one previously-unresolved medium-severity risk (`r-timeout-budget-precedence`) requiring direct re-reading of two frozen core files to resolve correctly, and a genuinely narrow seam-design decision (`ClaudeCodeProcessRunner`) with no existing precedent in the repo (`git-cli.ts` has no mocking seam at all). Length reflects that investigation, not scope creep — the file/function decomposition itself is deliberately lean (4 source files, no class hierarchy, no speculative abstraction beyond what AC-20's seam requires).
