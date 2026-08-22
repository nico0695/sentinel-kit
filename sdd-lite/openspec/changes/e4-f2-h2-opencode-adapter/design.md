# Design

## Routing Digest

- change_name: e4-f2-h2-opencode-adapter
- objective: new-feature
- route: continue-lite
- digest_summary: Five files under `src/adapters/driven/engines/opencode/` — `opencode-adapter.ts` (factory + `review()` orchestration: deny-config lifecycle → pre-flight → real invocation → NDJSON outcome extraction), `process-runner.ts` (the injectable `OpenCodeProcessRunner` seam + execa-backed default, extended with a required `env` field H1's `ClaudeCodeProcessRunOptions` never needed), `permission-config.ts` (the `OPENCODE_CONFIG` temp-file lifecycle, a new self-contained unit with no H1 analogue), `envelope.ts` (pure NDJSON line-parsing + outcome extraction), `errors.ts` (3 typed classes) — plus `__test__/opencode-adapter.test.ts` and a barrel-export update to `engines/index.ts`. AC-19's deferred timeout-precedence question is resolved by **directly reusing H1's answer, not re-deciding it**: execa `timeout: request.timeoutMs` unchanged + explicit `forceKillAfterDelay: 2000`, identical mechanism, identical justification (`engine-timeout.ts:76-111`'s synchronous-`resolve()`-beats-OS-kill race applies equally to this adapter — nothing engine-specific about it).
- affected_areas_digest: New directory only — `src/adapters/driven/engines/opencode/**` (5 source files + `__test__/`) and one barrel-export update in `engines/index.ts`. Zero changes to `src/core/**` or any file H1 already confirmed frozen (`review-engine.ts`, `run-review.ts`, `engine-timeout.ts`, `run-errors.ts`).
- interfaces_digest: `createOpenCodeAdapter(options: OpenCodeAdapterOptions): ReviewEngine` (`model` REQUIRED, no default); `OpenCodeProcessRunner = (args, opts: { cwd, input?, timeoutMs, env }) => Promise<OpenCodeProcessResult>` (note the new required `env` field vs. H1's runner); `createDenyConfigFile(): Promise<{ path: string; cleanup(): Promise<void> }>`; three `Error` subclasses (`OpenCodeUnavailableError`, `OpenCodeInvocationError`, `OpenCodeReviewError`).

## Summary

- change_name: e4-f2-h2-opencode-adapter
- objective: new-feature
- route: continue-lite
- design_status: complete

This design fixes exactly what spec.md left for design: internal file/function decomposition, the `OpenCodeProcessRunner`/`OpenCodeProcessResult` shapes (including the `env` passthrough AC-7 requires), the three error classes' constructors, the `OPENCODE_CONFIG` temp-file helper's placement and signature, and the NDJSON module's function signatures. All 24 spec ACs are restated as binding input, not reopened. The one item spec deferred (adapter-vs-outer-race timeout precedence) is resolved here by directly reusing H1's already-shipped mechanism — see "Alternatives And Trade-Offs".

## Design Overview

**File split rationale — five files, one more than H1.** `opencode-adapter.ts`, `process-runner.ts`, `envelope.ts`, `errors.ts` mirror H1's four-file split file-for-file, same responsibilities. The fifth file, `permission-config.ts`, has no H1 analogue: H1's `-p` flag is read-only by construction, so H1 never needed a permission-config lifecycle at all. Folding temp-file create/write/cleanup into `opencode-adapter.ts` was considered and rejected — it is a self-contained, independently-testable unit (create a temp dir, write one fixed JSON payload, remove the dir) with its own failure mode (AC-9's "cleanup failure never rejects `review()`") that deserves isolated unit tests without pulling in the full `runProcess` orchestration seam, matching the same "pure, testable in isolation" reasoning H1 used to justify separating `envelope.ts` from `claude-code-adapter.ts`. It is NOT folded into `process-runner.ts` either, despite both doing I/O: `process-runner.ts` is specifically the binary-mocking seam (AC-21's "sole spawn mechanism"), and mixing filesystem lifecycle code into it would make a test double for one concern (process execution) also need to fake the other (temp-file I/O) — the two are cleanly separable and a contract-test double for `runProcess` never needs to touch the filesystem.

**NDJSON parsing is two pure functions in `envelope.ts`, not one.** `parseNdjsonLines` (split + per-line `JSON.parse` + drop failures, AC-10) is kept separate from `extractOutcome` (the AC-15/16/17/18 branching logic) because the first is a genuinely reusable, trivial transformation with no knowledge of "what makes a review succeed or fail", while the second encodes the story-specific outcome rules. Splitting them makes each independently unit-testable against a synthetic events array, without needing a full NDJSON string fixture for every outcome-logic test case.

**AC-19 resolution.** Not re-derived. H1's `design.md` already investigated the `EngineTimeoutError` "escape hatch" and rejected it (would contradict the fixed error-class mapping in AC-13/AC-14/AC-18-equivalent rules) in favor of `timeout: request.timeoutMs` (unshortened) + `forceKillAfterDelay: 2000`, reasoning from `engine-timeout.ts:76-111`'s actual race mechanics — reasoning that has nothing engine-specific in it (it is about `Promise.race` between a synchronous timer callback and an OS-mediated process exit, true for any adapter). This design applies the identical mechanism to `defaultRunProcess`'s execa options.

## Affected Areas

| Path Or Module | Planned Change | Risk |
|---|---|---|
| `src/adapters/driven/engines/opencode/opencode-adapter.ts` | New. `createOpenCodeAdapter` factory + `review()`: deny-config lifecycle, pre-flight, invocation, timeout wiring, error translation. | low |
| `src/adapters/driven/engines/opencode/process-runner.ts` | New. `OpenCodeProcessRunner`/`OpenCodeProcessRunOptions`/`OpenCodeProcessResult` types (with `env`) + `defaultRunProcess` (execa-backed). | low |
| `src/adapters/driven/engines/opencode/permission-config.ts` | New. `createDenyConfigFile()`: `fs.mkdtemp`-based temp dir + fixed deny-permission JSON file + `cleanup()`. | low |
| `src/adapters/driven/engines/opencode/errors.ts` | New. `OpenCodeUnavailableError`, `OpenCodeInvocationError`, `OpenCodeReviewError`. | low |
| `src/adapters/driven/engines/opencode/envelope.ts` | New. `parseNdjsonLines` + `extractOutcome` (pure, no I/O). | low |
| `src/adapters/driven/engines/opencode/__test__/opencode-adapter.test.ts` | New. `reviewEngineContract` harness + AC-specific unit tests, fixture-replaying `runProcess` stubs. | low |
| `src/adapters/driven/engines/index.ts` | Add `createOpenCodeAdapter` + `OpenCodeAdapterOptions` exports; update the file's own doc-comment (currently says "lands in `[E4.F2.H2]`"). | low |
| `src/core/run/**` | None. Same frozen surface H1 already confirmed. | — |

## Interfaces, Data, And State

### Factory and options

```ts
export interface OpenCodeAdapterOptions {
  readonly binaryPath?: string;  // default "opencode"
  readonly model: string;        // REQUIRED — no safe default (spec.md AC-2)
  readonly runProcess?: OpenCodeProcessRunner;
}

export function createOpenCodeAdapter(
  options: OpenCodeAdapterOptions,
): ReviewEngine;
```

Note `options` itself is required (not `options?`) because `model` has no default — mirrors the same "resolve once, close over `const`s" pattern H1 used, just with one fewer optional field.

### `OpenCodeProcessRunner` — the injection seam, extended with `env` (AC-7, AC-20-equivalent)

```ts
export interface OpenCodeProcessRunOptions {
  readonly cwd: string;
  readonly input?: string;                        // absent for the --version pre-check
  readonly timeoutMs: number;                      // 0/absent: no timeout enforced by the runner
  readonly env: Readonly<Record<string, string>>;  // ALWAYS carries OPENCODE_CONFIG (AC-7); required, not optional
}

export type OpenCodeProcessRunner = (
  args: readonly string[],
  options: OpenCodeProcessRunOptions,
) => Promise<OpenCodeProcessResult>;

export interface OpenCodeProcessResult {
  readonly stdout: string;
  readonly exitCode?: number;
  readonly signal?: string;
  readonly timedOut: boolean;
}
```

`env` is `required`, not `?`, on `OpenCodeProcessRunOptions` — a deliberate divergence from `ClaudeCodeProcessRunOptions`, which has no `env` field at all. Making it required at the type level is a compile-time guard against the exact correctness hazard AC-7/AC-8 exist to prevent: it is structurally impossible to call `runProcess` without deciding what `env` to pass, closing off a whole class of "forgot to inject `OPENCODE_CONFIG` on this call site" bugs before a test even runs. `OpenCodeProcessResult` is otherwise identical to `ClaudeCodeProcessResult` — same resolve-not-reject execa contract, same fields.

### `defaultRunProcess` — execa-backed default (mirrors H1's AC-21, `env` added)

```ts
function defaultRunProcess(binaryPath: string): OpenCodeProcessRunner {
  return async (args, { cwd, input, timeoutMs, env }) => {
    const result = await execa(binaryPath, args, {
      cwd,
      env,
      ...(input !== undefined ? { input } : {}),
      ...(timeoutMs > 0
        ? { timeout: timeoutMs, killSignal: "SIGTERM", forceKillAfterDelay: 2000 }
        : {}),
      reject: false,
    });
    return {
      stdout: result.stdout,
      ...(result.exitCode !== undefined ? { exitCode: result.exitCode } : {}),
      ...(result.signal !== undefined ? { signal: result.signal } : {}),
      timedOut: result.timedOut,
    };
  };
}
```

Passing `env: options.env` relies on execa's own documented default (`extendEnv: true`) to merge it onto `process.env` rather than replace it — confirmed against the installed `execa@9.6.1` types (same package H1 already validated). `killSignal`/`forceKillAfterDelay: 2000` are the exact values H1 chose, reused unchanged (AC-19 resolution above).

### `permission-config.ts` — the `OPENCODE_CONFIG` lifecycle (AC-7, AC-8, AC-9)

```ts
export interface OpenCodePermissionConfig {
  readonly path: string;
  cleanup(): Promise<void>;
}

const DENY_CONFIG = {
  $schema: "https://opencode.ai/config.json",
  permission: { edit: "deny", bash: "deny", webfetch: "deny" },
} as const;

/** Fresh fs.mkdtemp-backed dir + one file, per call (AC-8: no fixed/shared path). */
export async function createDenyConfigFile(): Promise<OpenCodePermissionConfig> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sentinel-opencode-"));
  const filePath = path.join(dir, "opencode-config.json");
  await fs.writeFile(filePath, JSON.stringify(DENY_CONFIG), "utf-8");
  return {
    path: filePath,
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}
```

`cleanup()` internally swallows its own rejection (`.catch(() => undefined)`, on top of `force: true` already tolerating "already gone") so AC-9's "removal failure never surfaces as a `review()` rejection" holds unconditionally — the caller in `opencode-adapter.ts` can `await` it in a `finally` block with no additional try/catch needed. `os.tmpdir()` (never `request.worktree.path`) satisfies AC-8's "never inside the diffed tree" rule directly, no extra logic required.

### Three error classes (mirrors H1's `errors.ts` shape and constructor style exactly)

```ts
/** Thrown when the pre-flight `opencode --version` check fails. */
export class OpenCodeUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenCodeUnavailableError";
  }
}

/** Thrown when zero lines of stdout parse as valid JSON (AC-15) — review never started. */
export class OpenCodeInvocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenCodeInvocationError";
  }
}

/** Thrown when a review session started but failed: an in-stream `error` event (AC-16) or no output ever produced (AC-17). */
export class OpenCodeReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenCodeReviewError";
  }
}
```

Neither `OpenCodeInvocationError` nor `OpenCodeReviewError` carries a `cause` field, unlike H1's `ClaudeCodeInvocationError`: H1's version wraps a genuine `JSON.parse` `SyntaxError` worth preserving, but AC-10 here deliberately *drops* unparseable lines silently rather than surfacing a single parse exception — there is no one underlying error object to attach. Both messages are built entirely from information already extracted (event contents, or the "zero lines"/"no output" fact itself).

### NDJSON parsing (`envelope.ts`) — pure, no I/O

```ts
interface OpenCodeTextPart { readonly type: "text"; readonly text: string }
interface OpenCodeFinishPart {
  readonly type: "step-finish";
  readonly tokens?: { readonly input?: number; readonly output?: number };
}
interface OpenCodeEvent {
  readonly type: string;                                  // "step_start" | "text" | "step_finish" | "tool_use" | "error"
  readonly part?: OpenCodeTextPart | OpenCodeFinishPart | Record<string, unknown>;
  readonly error?: { readonly name: string; readonly data?: { readonly message?: string } };
}

/** Splits stdout on \n; JSON.parse's each non-empty line; silently drops any line that fails (AC-10). Never throws. */
export function parseNdjsonLines(stdout: string): readonly OpenCodeEvent[];

/**
 * Implements AC-15..AC-18's outcome rules over an already-parsed event list:
 * - events.length === 0            -> throw OpenCodeInvocationError (AC-15)
 * - any event.type === "error"     -> throw OpenCodeReviewError (AC-16)
 * - concatenate all "text" events' part.text, in order, as `output`
 * - output === ""                  -> throw OpenCodeReviewError, fallback message (AC-17)
 * - else resolve { output, usage? }, usage from the LAST "step_finish" event only (AC-12)
 */
export function extractOutcome(events: readonly OpenCodeEvent[]): ReviewResult;
```

`totalTokens` (AC-13) is computed inline in `extractOutcome`, identical formula to H1: `inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined`, from the last matching `step-finish` event's `part.tokens.input`/`.output` only — `.tokens.total`, `.tokens.reasoning`, `.tokens.cache` are never read anywhere in this file (not merely excluded post-read, exactly as H1 never reads claude-code's cache fields).

### `review()` orchestration (`opencode-adapter.ts`)

```
async function review(request: ReviewRequest): Promise<ReviewResult> {
  const config = await createDenyConfigFile();          // AC-8
  try {
    // 1. Pre-flight (AC-5, AC-6, AC-19-timing): runProcess(["--version"], {
    //      cwd: request.worktree.path, timeoutMs: PREFLIGHT_TIMEOUT_MS,
    //      env: { OPENCODE_CONFIG: config.path },
    //    })
    //    reject OR exitCode !== 0  ->  throw OpenCodeUnavailableError
    // 2. Real invocation (AC-3, AC-4, AC-7): runProcess(
    //      ["run", "-m", model, "--format", "json"],
    //      { cwd: request.worktree.path, input: request.prompt,
    //        timeoutMs: request.timeoutMs, env: { OPENCODE_CONFIG: config.path } },
    //    )
    // 3. parseNdjsonLines(result.stdout)  (AC-10)
    // 4. return extractOutcome(events)    (AC-11..AC-18 — throws typed errors internally)
  } finally {
    await config.cleanup();                              // AC-9 — cleanup() never itself rejects
  }
}
```

`PREFLIGHT_TIMEOUT_MS = 5_000` — same constant, same rationale as H1 (`opencode --version` is a local, non-network call). The `finally` block guarantees `config.cleanup()` runs on every exit path (resolve, or any of the four throw points above) without needing a duplicated cleanup call at each one. The entire function body has no bare `throw` outside its own `async` scope (mirrors H1's AC-23-equivalent discipline) — every throwing statement is either directly inside `review()` or inside a function called with `await`, so nothing can escape as a synchronous throw.

### Contract-test harness — one concrete example

```ts
// __test__/opencode-adapter.test.ts
function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../../../fixtures/opencode/${name}`, import.meta.url)),
    "utf-8",
  );
}

const harness: ReviewEngineContractHarness = {
  resolving: (output, usage) =>
    createOpenCodeAdapter({
      model: "openai/gpt-5.4-mini",
      runProcess: async (args) => {
        if (args.includes("--version")) {
          return { stdout: "opencode 1.17.9", exitCode: 0, timedOut: false };
        }
        return { stdout: fixture("valid-verdict.ndjson"), exitCode: 0, timedOut: false };
      },
    }),
  rejecting: () =>
    createOpenCodeAdapter({
      model: "openai/gpt-5.4-mini",
      runProcess: async (args) => {
        if (args.includes("--version")) {
          return { stdout: "opencode 1.17.9", exitCode: 0, timedOut: false };
        }
        return { stdout: fixture("context-overflow.ndjson"), exitCode: 1, timedOut: false };
      },
    }),
};

reviewEngineContract(harness, "opencode");
```

Same fresh-adapter-per-scenario pattern as H1. Additional non-shared `it` blocks cover AC-3 through AC-19 individually, including one asserting the recorded `env.OPENCODE_CONFIG` resolves to a real, readable file with the exact deny-permission JSON (AC-7), and one spinning up two concurrent `review()` calls to assert distinct temp paths (AC-8).

## Amendment 1 — process-status gate (design delta for spec AC-25)

Driven by review finding R1-001; see `spec.md` § "Amendment 1" for provenance.

**Where the check goes.** In `opencode-adapter.ts`, as a small private helper, NOT in `envelope.ts`. `envelope.ts` is documented and designed as pure, process-unaware NDJSON→`ReviewResult` transformation; giving it a `OpenCodeProcessResult` parameter would break that boundary for every one of its callers. `process-runner.ts` is equally wrong — it is pure plumbing with no typed-error construction. The gate composes process status with a typed error, which is exactly the orchestration file's job.

**Ordering is the load-bearing detail.** `extractOutcome` must run FIRST and be allowed to throw:

```
const events = parseNdjsonLines(result.stdout);
const outcome = extractOutcome(events);   // AC-15/16/17 throw here if they apply
assertCleanExit(result);                  // NEW (AC-25): throws OpenCodeReviewError
return outcome;
```

Rationale: `fixtures/opencode/context-overflow.ndjson` and `unknown-model-stdout.txt` both come with a non-zero exit code in real life. Gating on status *before* parsing would replace their specific, actionable diagnostics (`ContextOverflowError: Input exceeds context window`, and the `opencode models` hint) with a generic "exited with code 1" — strictly worse for the operator. Because `extractOutcome` throws rather than returning a discriminated result, reaching `assertCleanExit` already proves no stdout-derived rejection applied, so no extra bookkeeping is needed.

**Helper shape:**

```ts
/** AC-25: reject a review whose process did not exit cleanly, even when its
 *  partial stdout parsed into usable-looking output. */
function assertCleanExit(result: OpenCodeProcessResult): void {
  if (result.timedOut) throw new OpenCodeReviewError("opencode: review timed out; output is incomplete");
  if (result.signal !== undefined) throw new OpenCodeReviewError(`opencode: review terminated by signal ${result.signal}; output is incomplete`);
  if (result.exitCode !== 0) throw new OpenCodeReviewError(`opencode: review exited with code ${result.exitCode}; output is incomplete`);
}
```

Checked in that order so the most specific cause is named first: a timeout kill sets both `timedOut` and `signal`, and a signal termination leaves `exitCode` undefined (which would otherwise fall into the third branch and print `code undefined` — the exact defect finding R3-001 reports on the pre-flight path).

**Error class choice:** `OpenCodeReviewError`, not `OpenCodeInvocationError`. A killed run did start a review session — it just did not finish one. That matches the class split spec.md AC-15/AC-16 already established ("review never started" vs "session started but failed").

**Conformance deltas bundled into the same fix stage** (no design change, listed so the plan can sequence them):

- R2-001: drop the `.error !== undefined` guard's silent fall-through in `envelope.ts:100-107` so an `error` event without a payload still rejects, per AC-16's actual wording. Message falls back to the event type when `.error` is absent.
- R4-002: wrap `permission-config.ts`'s `writeFile` so a failure removes the just-created `mkdtemp` directory before rethrowing — closes the leak while keeping `createDenyConfigFile`'s external contract unchanged.
- R3-002 / R3-003: add the two missing assertions (multi-`text` concatenation order compared exactly; `timeoutMs` asserted per invocation on the recorded `runProcess` options).

## Alternatives And Trade-Offs

| Option | Decision | Why |
|---|---|---|
| AC-19: re-derive a fresh timeout-precedence answer for this engine | Rejected | H1's `design.md` already investigated and fixed this with source-grounded reasoning (`engine-timeout.ts:76-111`) that is not engine-specific — the race is between `runEngineWithTimeout`'s synchronous timer callback and *any* adapter's OS-mediated process kill. Re-deriving it would either reach the same answer (wasted work) or, worse, reach a *different* answer for no principled reason, producing inconsistent timeout behavior across the two engines the cascading-resolution story (#30) is about to switch between. | 
| `env` optional on `OpenCodeProcessRunOptions`, defaulting to `{}` inside `defaultRunProcess` | Rejected | Would silently permit a call site to omit `OPENCODE_CONFIG` and still type-check, reintroducing exactly the "forgot to inject the deny config on this one path" hazard AC-7/AC-8 exist to close. Required `env` makes that mistake a compile error, not a runtime hazard depending on test coverage. |
| Fold `permission-config.ts` into `opencode-adapter.ts` | Rejected | Same reasoning H1 used to keep `envelope.ts` separate: a pure(ish), independently-testable unit with its own failure mode (cleanup-never-rejects) is easier to verify in isolation than as inline code inside an already-multi-responsibility orchestration function. |
| Single `parseAndExtract(stdout)` function instead of `parseNdjsonLines` + `extractOutcome` | Rejected | Splitting lets `extractOutcome`'s outcome-branching logic (AC-15–18, the genuinely story-specific rules) be unit-tested against a synthetic `OpenCodeEvent[]` literal directly, without constructing a raw NDJSON string for every one of the ~6 branch combinations. |
| `OpenCodeInvocationError`/`OpenCodeReviewError` carry a `cause` field like H1's `ClaudeCodeInvocationError` | Rejected | No single underlying exception object exists to attach — AC-10 deliberately drops unparseable lines without recording *which* line or *why* it failed; a `cause` field would either be `undefined` on every real invocation or require plumbing per-line parse errors through for no consumer that needs them. |

## Open Technical Questions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| AC-19 residual (inherited from H1 unchanged) | Same rare "adapter's own rejection wins the race" case H1 already documented and accepted — not re-litigated per adapter | Accept now, matches H1's own accepted residual | open, low severity, accepted (inherited) |
| Contract-test coverage of the execa-level SIGTERM-then-SIGKILL escalation (same caveat H1's design.md recorded for its own AC-16/17) | The `runProcess` seam type carries no scheduling; a stub-based test can only assert the adapter's reaction to a `{ signal, timedOut }` result, not that `execa` itself escalates correctly | `sddl-plan` should sequence this as its own explicit test case | open, low severity — recorded so plan does not assume it falls out of the contract suite alone |
| `docs/engines/opencode.md` version drift (`1.17.9`, spike now 8 days old) | Carried forward unresolved from spec.md, spec itself flagged it informational-only | Before/during `sddl-executor` | open, informational, unchanged from spec |

## AC → Design Mapping (24/24 mapped)

| AC | Satisfied By |
|---|---|
| AC-1 | `opencode-adapter.ts`: `createOpenCodeAdapter(options)` factory function, no class |
| AC-2 | `OpenCodeAdapterOptions` shape, `model` required, `binaryPath` defaulted, resolved once in the factory body |
| AC-3 | `review()` steps 1 & 2 both pass `cwd: request.worktree.path` |
| AC-4 | `review()` step 2: exact args array, `input: request.prompt` (never argv) |
| AC-5 | `review()` step 1: pre-flight reject/non-zero -> `OpenCodeUnavailableError`, real invocation never reached |
| AC-6 | `review()` step 1 -> step 2 control flow: exit 0 falls through |
| AC-7 | `env: { OPENCODE_CONFIG: config.path }` passed on BOTH `runProcess` calls in `review()`; `env` required (not optional) on `OpenCodeProcessRunOptions` closes the "forgot on one call site" hazard at compile time |
| AC-8 | `permission-config.ts`: `createDenyConfigFile()` uses `fs.mkdtemp(os.tmpdir(), ...)`, called fresh inside every `review()` invocation |
| AC-9 | `permission-config.ts`: `cleanup()` swallows its own rejection internally; `review()`'s `finally` block awaits it unconditionally |
| AC-10 | `envelope.ts`: `parseNdjsonLines` — split on `\n`, per-line `JSON.parse` in a try/catch, push only successes |
| AC-11 | `envelope.ts`: `extractOutcome` concatenates all `type: "text"` events' `part.text` in array order |
| AC-12 | `envelope.ts`: `extractOutcome` finds the LAST `type: "step-finish"` event via `findLast`/reverse-scan, not the first |
| AC-13 | `envelope.ts`: `totalTokens = inputTokens + outputTokens` inline, `.tokens.total`/`.reasoning`/`.cache` never read |
| AC-14 | `envelope.ts`: `usage` built conditionally (`exactOptionalPropertyTypes`), never assigned `undefined` |
| AC-15 | `envelope.ts`: `extractOutcome` — `events.length === 0` -> `OpenCodeInvocationError` |
| AC-16 | `envelope.ts`: `extractOutcome` — any `type: "error"` event -> `OpenCodeReviewError` from `.error.name`/`.error.data.message` |
| AC-17 | `envelope.ts`: `extractOutcome` — concatenated `output === ""` (no error event, no text) -> `OpenCodeReviewError`, fallback message |
| AC-18 | `envelope.ts`: `extractOutcome`'s three `throw` statements are the only ones in the function; every other path returns | 
| AC-19 | `PREFLIGHT_TIMEOUT_MS = 5_000` module constant, used only for the pre-flight `runProcess` call |
| AC-20 | `defaultRunProcess`: execa `timeout: request.timeoutMs`, `killSignal: "SIGTERM"`, `forceKillAfterDelay: 2000` — reused unchanged from H1's AC-19 resolution |
| AC-21 | `OpenCodeAdapterOptions.runProcess`, contract harness example above: plain async function doubles, no PATH/monkey-patch; `defaultRunProcess`: direct `execa()` call, no other spawn mechanism |
| AC-22 | `__test__/opencode-adapter.test.ts`: `reviewEngineContract(harness, "opencode")`, import unmodified from `ReviewEngine.contract.ts` |
| AC-23 | `review()` is a single `async function`; every throwing statement sits inside it or inside an `await`ed call; nothing escapes as a synchronous throw |
| AC-24 | `execution-log.md` entry at executor time — manual verification run, not covered by this design |

Spec's AC-25/26/27-equivalent gate items (architecture guards, no scope leak, `npm run check`/`npm test` green) are standard, mechanically checked at executor/QA time — same as H1, no design-level exception.

## Approval Notes

- All three spec-resolved open questions (NDJSON parse-tolerance, one-vs-two error classes, `OPENCODE_CONFIG` mechanism) are restated as fixed inputs above, not reopened.
- The deferred timeout-precedence item is fixed by direct reuse of H1's mechanism and reasoning, re-verified as engine-agnostic (the race is about `runEngineWithTimeout`'s timer vs. an OS-mediated kill, not about which CLI is being spawned) rather than re-derived from scratch.
- The `env`-required design choice on `OpenCodeProcessRunOptions` is the one genuinely new structural decision beyond "copy H1's shape" — recorded with its own Alternatives row since it is the load-bearing mechanism behind AC-7/AC-8's correctness guarantee.
- Recommended next stage: `sddl-plan`, to sequence roughly (1) `errors.ts` + `envelope.ts` + `permission-config.ts` (pure/self-contained, easiest to land and unit-test first, no execa dependency), (2) `process-runner.ts` (the execa seam + `defaultRunProcess`), (3) `opencode-adapter.ts` (orchestration wiring the first three together) + barrel export, (4) `__test__/opencode-adapter.test.ts` covering all 24 ACs including the `reviewEngineContract` harness, then the full gate + the manual AC-24 verification run recorded in `execution-log.md`.

## Budget Notes

- Proportional to the story's own severity: 24 ACs, one inherited-and-reused (not re-derived) medium risk, and one genuinely new structural decision (the `permission-config.ts` module + required `env` field). Lower novelty than H1's design, since the file-split rationale, error-class shape, and timeout mechanism are direct, justified reuses rather than first derivations.
