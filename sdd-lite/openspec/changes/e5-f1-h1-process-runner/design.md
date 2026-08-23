# Design

## Routing Digest

- change_name: e5-f1-h1-process-runner
- objective: new-feature
- route: continue-lite
- digest_summary: 4 new files, 4 modified. Core gains `ProcessRunner` + its request/result types, a plain guard-clause pre-flight (`validateProcessRunRequest`), and two errors on the existing `RunError` base. The adapter gains `createExecProcessRunner()` in `src/adapters/driven/exec/`, whose whole non-trivial content is one pure result-classifier — `classifyExecaResult` — that turns execa's single resolved value into either a `ProcessRunResult` or a `ProcessSpawnError`. Every empirical surprise from spec revision 2 is concentrated in that one pure function, so all of it is unit-testable without spawning anything.
- decisions_digest: D-1 pre-flight is plain guard clauses in core, no zod (matches `runReview`'s existing style; `run` has never imported zod); D-2 `cwd` absoluteness is checked in the adapter via `node:path`, not core, with an explicit in-repo precedent; D-3 the execa→port translation is one exported pure function taking a plain record, so all 6 revision-2 findings are unit-tested with zero child processes; D-4 `timedOut` is derived from elapsed time, not from `result.timedOut`, because truncation corrupts execa's flag; D-5 spawn failure is detected as "neither `exitCode` nor `signal`", the one condition empirically unique to a process that never ran; D-6 truncation flags derived per-stream by length comparison against the budget; D-7 the adapter owns the two numeric defaults as module constants, mirroring `PREFLIGHT_TIMEOUT_MS`.

## Summary

- change_name: e5-f1-h1-process-runner
- objective: new-feature
- route: continue-lite
- design_status: complete, 0 blocking open questions

## Design Overview

The story's difficulty is entirely in **interpreting one object**. Under `reject: false`, execa hands back a single resolved value for six materially different outcomes — clean exit, non-zero exit, timeout kill, output overflow, spawn failure, and overflow-then-hang — and spec revision 2 established that three of its own fields (`failed`, `timedOut`, `isMaxBuffer`) are unsound as direct signals. So the design puts **all** of that interpretation in one pure, exported function and leaves the impure part trivial.

### 1. Core: types + a plain pre-flight

`src/core/run/ports/process-runner.ts` declares the port and its two shapes (spec's In Scope, verbatim). No zod: the `run` module has never imported it, and `runReview`'s own request pre-flight is a run of guard clauses throwing `InvalidRunRequestError` (`run-review.ts:293-319`). `validateProcessRunRequest` mirrors that style exactly, one clause per rule, throwing `InvalidProcessRequestError`:

```ts
if (request.command.trim() === "") throw new InvalidProcessRequestError("command must not be empty");
if (request.cwd === "") throw new InvalidProcessRequestError("cwd must not be empty");
if (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0) …
if (request.maxOutputChars !== undefined && (!Number.isFinite(…) || … <= 0)) …
```

**`cwd` absoluteness is deliberately NOT checked here** (D-2). Deciding what "absolute" means is platform-specific and needs `node:path`, which the `core-no-io-libs` guard forbids; re-implementing it as a regex in core would be a worse, drift-prone copy of `isAbsolute`. This is not an invention — `run-review.ts:59-62` documents the identical split for the identical reason: *"Absoluteness is validated by `createReviewWorktree`, deliberately not re-validated here."* The adapter performs the check with `node:path`'s `isAbsolute` (as `git-cli.ts` already does) and throws the **core-owned** `InvalidProcessRequestError`, so the error type stays uniform regardless of which half caught it.

### 2. Adapter: one pure classifier + a thin impure shell

`src/adapters/driven/exec/classify-execa-result.ts` — the whole story, pure and childless:

```ts
export interface ExecaLikeResult {
  readonly stdout: string; readonly stderr: string;
  readonly exitCode?: number; readonly signal?: string;
  readonly isMaxBuffer: boolean; readonly code?: string;
}
export function classifyExecaResult(
  result: ExecaLikeResult, budget: number, timeoutMs: number, elapsedMs: number,
): ProcessRunResult   // throws ProcessSpawnError
```

Its four rules, each traceable to a revision-2 finding:

| Rule | Derivation | Why not the obvious field |
|---|---|---|
| **Never ran** (D-5) | `exitCode === undefined && signal === undefined` → throw `ProcessSpawnError` | Empirically the unique signature of `ENOENT` / `EACCES` / invalid `cwd`. A timeout kill has `signal`; an overflow has `exitCode`. `failed` is useless — a plain exit-1 sets it too (AC-16). |
| **Timed out** (D-4) | `signal !== undefined && elapsedMs >= timeoutMs` | `result.timedOut` is **false** when truncation preceded the kill (R5), so passing it through fails AC-17. Elapsed-vs-budget is the honest question being asked. |
| **Truncated** (D-6) | per stream: `isMaxBuffer && stream.length >= budget` | `isMaxBuffer` is global (R3); using it directly marks both streams truncated when only one overflowed, which AC-7's mutation catches. |
| **Exit code / signal** | conditional spreads, absent stays absent | `exactOptionalPropertyTypes`, the idiom both engine seams already use (AC-9). |

`process-runner-exec.ts` then holds nothing interesting: validate → `isAbsolute` check → `await execa(...)` with the spec's pinned option bag → `classifyExecaResult(...)`. It measures `elapsedMs` with its **own** clock rather than reading `result.durationMs`, so the derivation depends on one fewer execa semantic.

**Known boundary of D-4, stated rather than hidden**: a child that is signalled by something *other* than the timeout at almost exactly the budget instant would be reported `timedOut: true`. The window is a scheduling tick, the misreport is benign (the run did consume its whole budget), and the alternative — trusting `result.timedOut` — is wrong in a case that actually happens (R5). Recorded as `risk-006`.

## Affected Areas

| File | Status | Content |
|---|---|---|
| `src/core/run/ports/process-runner.ts` | new | `ProcessRunner`, `ProcessRunRequest`, `ProcessRunResult` |
| `src/core/run/process-run-request.ts` | new | `validateProcessRunRequest` guard clauses |
| `src/core/run/run-errors.ts` | modified | `InvalidProcessRequestError`, `ProcessSpawnError` |
| `src/core/run/index.ts` | modified | barrel: port types, validator, two errors |
| `src/adapters/driven/exec/classify-execa-result.ts` | new | the pure classifier (D-3) |
| `src/adapters/driven/exec/process-runner-exec.ts` | new | `createExecProcessRunner`, option bag, `isAbsolute` check |
| `src/adapters/driven/exec/index.ts` | modified | replaces the `export {}` placeholder |
| `src/core/run/__test__/process-run-request.test.ts` | new | AC-13 table-driven |
| `src/adapters/driven/exec/__test__/classify-execa-result.test.ts` | new | AC-6/7/9/10/14/16/17 without spawning |
| `src/adapters/driven/exec/__test__/ProcessRunner.contract.ts` | new | portable suite (5-suite convention) |
| `src/adapters/driven/exec/__test__/process-runner-exec.test.ts` | new | real children: AC-1..AC-5, AC-8, AC-11, AC-12, AC-14 |

No change to `src/core/run/run-review.ts`, `src/adapters/driven/git/**`, or `src/adapters/driven/engines/**` (AC-15). No new dependency — `execa@9.6.1` is already installed.

## Test Strategy

The split is deliberate and is what makes the surprising cases cheap to prove:

- **Childless unit tests** (`classify-execa-result.test.ts`) cover every revision-2 finding by constructing the result record directly — including the ones that are awkward or slow to reproduce for real (overflow-then-hang, `EACCES`, signal-without-exit-code). Each of the four rules gets the mutation the spec names.
- **Real-child tests** (`process-runner-exec.test.ts`) cover what only a real process can prove: that the timeout genuinely reaps a `SIGTERM`-trapping child (AC-1, the load-bearing test — child prints its pid as line 1, test parses it from `stdout` and asserts `process.kill(pid, 0)` throws `ESRCH`), byte-exact capture including the trailing newline (AC-4), stream separation (AC-5), `cwd` (AC-11), and no-shell (AC-12, asserting `; touch pwned` created nothing).
- **Contract suite** carries the assertions any future `ProcessRunner` must satisfy — resolve-not-reject on non-zero exit, typed errors, capture shape — and stays free of execa specifics so a non-execa implementation could run it.

Hermetic throughout: children are `node -e` one-liners, `cwd`s are `mkdtemp` dirs under `os.tmpdir()`, and the no-shell test asserts against its own temp dir so a false negative cannot be masked by a stray file elsewhere.

## AC Coverage Map

| AC | Where proven |
|---|---|
| AC-1 (real reaping) | `process-runner-exec.test.ts` — pid-liveness + `signal: "SIGKILL"` |
| AC-2, AC-3 (timeout flag, no false positive) | real-child + classifier units |
| AC-4, AC-5 (byte-exact stdout, separate stderr) | real-child |
| AC-6, AC-7 (truncation, per-stream) | classifier units (+ one real-child overflow) |
| AC-8, AC-9, AC-10 (exit code, signal, resolve-not-reject) | classifier units + real-child + contract suite |
| AC-11, AC-12 (cwd, no shell) | real-child |
| AC-13 (pre-flight) | `process-run-request.test.ts` + adapter's `isAbsolute` case |
| AC-14 (never ran) | classifier units + real `ENOENT`/`EACCES`/bad-`cwd` children |
| AC-15 (guards) | `npm run check` + `git diff --stat` closing gate |
| AC-16 (`failed` is not an error signal) | classifier unit with `failed: true, exitCode: 1` |
| AC-17 (truncation must not mask timeout) | classifier unit (`isMaxBuffer: true, timedOut: false, signal` set, `elapsed >= budget`) + one real-child flood-and-hang |

## Open Questions

None blocking. Two items deliberately settled rather than deferred: the `timedOut` derivation's boundary condition (recorded as `risk-006`) and the core/adapter split of request validation (D-2, with in-repo precedent).
