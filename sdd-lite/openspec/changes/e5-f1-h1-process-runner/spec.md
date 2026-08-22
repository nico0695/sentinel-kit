# Spec

## Routing Digest

- change_name: e5-f1-h1-process-runner
- objective: new-feature
- route: continue-lite
- digest_summary: Add `ProcessRunner`, the second driven port of `src/core/run` and the last unimplemented port of the PRD §4.3 MVP catalog, plus its `execa`-backed adapter in the empty `src/adapters/driven/exec/`. `run(request)` takes an explicit `command` + `args[]` (never a shell string), an absolute `cwd`, a positive `timeoutMs` and an optional `env` overlay; it resolves with `{ stdout, stderr, exitCode?, signal?, timedOut, stdoutTruncated, stderrTruncated }` for any process that actually ran — including one that exited non-zero — and rejects with a typed `RunError` subclass only when the process could not be spawned or the request was malformed. The timeout is `SIGTERM` followed by a hard `SIGKILL`, and the acceptance bar is that the child is genuinely reaped, not merely that the promise settles.
- scope_digest: IN = `ProcessRunner` port + request/result types in `src/core/run/ports/process-runner.ts`, `ProcessSpawnError`/`InvalidProcessRequestError` in `run-errors.ts`, request validation, the `execa` adapter in `src/adapters/driven/exec/`, `ProcessRunner.contract.ts`, adapter tests against real child processes. OUT = the review flow's use of it (`[E5.F1.H2]`), retrofitting git-cli or the engine seams, the git adapter's missing timeout, composition-root wiring, streaming output, concurrency.
- acceptance_digest: 17 ACs. AC-1..AC-3 timeout (real reaping, flag, no false positive); AC-4..AC-7 capture (byte-exact stdout, separate stderr, per-stream truncation); AC-8..AC-10 exit code / signal / resolve-not-reject; AC-11..AC-12 cwd and no-shell; AC-13 pre-spawn request validation; AC-14 the never-ran case; AC-15 architecture guards; AC-16 `failed` is not an error signal; AC-17 truncation must not mask a timeout.

## Summary

- change_name: e5-f1-h1-process-runner
- objective: new-feature
- route: continue-lite
- spec_status: complete at revision 2, 16 acceptance criteria, 3 B-level decisions pending ratification (D1, D2, D3). Revision 1's execa assumptions were re-derived against the installed `execa@9.6.1` by direct empirical probing rather than from the README — four of them were wrong. See Revision Notes.

## Decisions Requiring Ratification

### D1 (B-level) — The "only declared scripts" guarantee lives in `[E5.F1.H2]`, not in this port

**Decision**: `ProcessRunner.run()` accepts a generic `{ command, args, cwd, timeoutMs, env? }` request. It does **not** know about repo config, declared validations, or an allowlist.

**Why this is now decidable** (it was `risk-001`, the proposal's highest open risk): `src/core/repos/ports/config-schemas.ts:38` already declares `validations: z.array(z.string()).optional()` on `RepoEntrySchema`. The declared-validation list is therefore **plain strings owned by the `repos` module**. For this port to enforce "only declared," `src/core/run` would have to import `repos`' config types and receive the registry on every call — coupling the run module to repo configuration for a guarantee that is, by construction, about *where the list came from*, not about the shape of one command. A port cannot verify provenance it was never given.

**What this port does instead** — the blast radius is reduced structurally, not by an allowlist:

- `command` + `args[]` are separate; the adapter never uses a shell (D3/AC-12). Injection through a validation string is impossible *by shape*, not by escaping.
- `cwd` must be absolute (AC-11), matching `git-cli.ts`'s pre-spawn `isAbsolute` guard.
- The port has no default command, no fallback, and no auto-detection of anything.

**Downstream consequence `[E5.F1.H2]` inherits, recorded here deliberately**: repo config's `validations` entries are strings like `"npm test"`, but this port takes `command` + `args`. `[E5.F1.H2]` must decide how a declared string becomes a `(command, args)` pair — and it must not do it by handing the string to a shell. That is a real, named constraint for the dependent story, not an omission here.

**Alternative rejected**: a narrower port taking an already-validated `DeclaredValidation` descriptor. It would make the guarantee structural, but the descriptor type would have to live in `run` while its only producer lives in `repos`, and it would make `ProcessRunner` unusable for any future non-validation process (the PRD names the port generically: *"Run validations with timeout and output capture"* — §4.3 — but places it in `run`, not in a validations-specific module).

### D2 (B-level) — `env` inherits the parent environment, with an optional explicit overlay

**Decision**: `request.env` is optional. When absent, the child inherits the parent process environment unchanged. When present, its entries are **overlaid on top of** the inherited environment (not a replacement).

**Why**: a declared validation is `npm test` or `pytest`. Both need a real `PATH`, `HOME`, language-runtime variables, and often a populated toolchain cache. A clean-slate environment would break essentially every realistic validation script, and the two engine seams already prove both shapes are workable (`claude-code` omits `env` and inherits; `opencode` requires it and relies on execa's `extendEnv: true`, which is *also* an overlay, not a replacement — so overlay-on-inherit is the existing house behavior in both).

**The counterpart risk, stated explicitly**: captured output is persisted (`validations/*.log`, `[E5.F2.H1]`) and injected into a prompt (`[E5.F1.H2]`), so a declared script that prints its environment would leak secrets into both. This spec does **not** try to solve that in the port, and says why: the script is one the repo owner declared in their own config, running on their own machine against their own repo, and the port cannot distinguish `env`-printing from any other output. Mitigating it inside `ProcessRunner` would mean scanning captured bytes for secret-shaped strings — a detection heuristic this codebase has deliberately avoided everywhere else. `[E5.F2.H1]`'s "nothing sensitive persisted" AC was satisfied by an **allowlist serializer**, and the equivalent boundary here is `[E5.F1.H2]`'s decision about what validation output reaches the prompt.

**Alternative rejected**: require `env` explicitly (the `opencode` shape). It would force every caller to reconstruct a working `PATH` by hand, and the port has no opinion about what a validation script needs.

### D3 (B-level, NEW in revision 2) — The adapter classifies `execa`'s resolved result itself; `reject: false` means *nothing* rejects

**Decision**: with `reject: false`, the adapter inspects the returned result and decides which outcomes are domain data (resolve) and which are infrastructure failures (throw `ProcessSpawnError`). The classification rule is: **a result carrying neither `exitCode` nor `signal` means the process never ran** → throw. Everything else → resolve.

**Why this is a decision and not a mechanic**: revision 1 assumed `reject: false` still let genuine spawn failures reject, so `ProcessSpawnError` would be a `catch` block. Empirically that is false (see Revision Notes R2). Under `reject: false` execa returns an `ExecaError` *instance as the resolved value* for **every** failure — non-zero exit, timeout kill, `maxBuffer` overflow, `ENOENT`, `EACCES`, and an invalid `cwd` alike. `failed: true` is therefore useless as an error signal: a validation script exiting `1` — the single most expected outcome this port has — also carries `failed: true`.

So the adapter cannot delegate the resolve-vs-throw judgment to execa. It must own it, and the rule must be stated in the spec rather than discovered during implementation.

**Alternative rejected**: use `reject: true` and a `try/catch`. It inverts the problem — the overwhelmingly common case (a validation exiting non-zero) would arrive as an exception to be un-thrown, and `[E5.F1.H2]` explicitly needs a failed validation to be evidence, not an error. Both existing engine seams chose `reject: false` for the same reason.

## Scope Boundary

### In Scope

- **`ProcessRunner` port** in `src/core/run/ports/process-runner.ts` — pure TypeScript types, zero npm imports:
  - `interface ProcessRunner { run(request: ProcessRunRequest): Promise<ProcessRunResult> }`
  - `ProcessRunRequest`: `{ command: string; args: readonly string[]; cwd: string; timeoutMs: number; env?: Readonly<Record<string, string>>; maxOutputChars?: number }`
  - `ProcessRunResult`: `{ stdout: string; stderr: string; exitCode?: number; signal?: string; timedOut: boolean; stdoutTruncated: boolean; stderrTruncated: boolean }`
- **Two errors** in `src/core/run/run-errors.ts`, extending the existing `RunError` base: `InvalidProcessRequestError` (malformed request, no `cause`, mirroring `InvalidRunRequestError`) and `ProcessSpawnError` (the process never ran — carries `cause`).
- **Request validation** in `src/core/run/` — a pure function checking the request shape before any adapter work: non-empty `command`, absolute `cwd`, `timeoutMs > 0`, finite positive `maxOutputChars` when present.
- **The `execa` adapter** in `src/adapters/driven/exec/` — `createExecProcessRunner()` implementing the port. Its option bag is pinned by revision 2's empirical findings and is **not** free for the implementer to vary:

  | Option | Value | Why it is pinned |
  |---|---|---|
  | `reject` | `false` | Non-zero exit must be data, not an exception (AC-10). Consequence: nothing rejects, so the adapter classifies (D3). |
  | `shell` | unset (default `false`) | Already the default; args-as-array is what guarantees no shell. Set explicitly only as documentation (AC-12). |
  | `timeout` | `request.timeoutMs` | AC-1/AC-2. |
  | `killSignal` | `"SIGTERM"` | Graceful first, matching both engine seams. |
  | `forceKillAfterDelay` | adapter constant | The `SIGKILL` that reaps a `SIGTERM`-ignoring child (AC-1). Confirmed to be the correct v9 option name. |
  | `maxBuffer` | `{ stdout: budget, stderr: budget }` (per-fd form) | AC-6/AC-7. |
  | `stripFinalNewline` | **`false`** | execa defaults this to `true` and applies it on the error path too, silently eating the trailing newline of every capture. Leaving the default would quietly violate AC-4's "no lost tail" (revision 2, R4). |
  | `env` / `extendEnv` | overlay per D2 | `extendEnv` defaults `true`, which is already overlay-on-inherit. |
- **`ProcessRunner.contract.ts`** in `src/adapters/driven/exec/__test__/`, following the five established contract suites' convention.
- **Adapter tests against real child processes**, hermetic (`node -e` children, `os.tmpdir()` cwds), proving each AC — including the reaping proof of AC-1.
- **Barrel export** from `src/core/run/index.ts` and `src/adapters/driven/exec/index.ts` (currently `export {}`).

### Out Of Scope

- **Running declared validations in the review flow** — `[E5.F1.H2]` (#32), which depends on this story. This port ships with no caller, exactly as `[E4.F2.H3]`'s `resolveEngine` and `[E5.F2.H1]`'s `RunStore` did.
- **Retrofitting `git-cli.ts` or the two engine `process-runner.ts` seams onto this port.** Recorded as duplication debt (`risk-004`), proposed as a follow-up backlog item, not done here.
- **The git adapter's missing `execa` timeout** — a real known gap owned by the git adapter, not by this story.
- **Composition-root wiring** — `E6.F1`, unchanged from the two prior stories' deferrals.
- **Streaming / incremental output, concurrency, process pools, cancellation tokens, retries.** None are named in issue #31 or the backlog.
- **Shell semantics of any kind** — no `shell: true`, no pipes, no globbing, no `&&`. Explicitly a non-goal, not an omission (AC-12).

### Non-Goals

- No secret detection or redaction of captured output (D2's rationale).
- No interpretation of the exit code. `exitCode: 1` is data handed to the domain, never an error this port raises (AC-10).
- No `PATH` resolution of `command` beyond what the OS does — the port does not search, guess, or fall back to a shell to resolve a name.

## Expected Behavior

| Scenario | Expected Outcome | Evidence Or Notes |
|---|---|---|
| A child that sleeps past `timeoutMs` | Resolves with `timedOut: true`; the child process is **dead** afterwards | AC-1, AC-2 |
| A child that traps and ignores `SIGTERM`, sleeping past `timeoutMs` | Still dead — `SIGKILL` via `forceKillAfterDelay` reaps it | AC-1 |
| A child that finishes well within `timeoutMs` | `timedOut: false`, normal result | AC-3 |
| A child writing to stdout only | Full stdout captured; `stderr` is `""` | AC-4 |
| A child writing to stderr only | Full stderr captured **separately**; `stdout` is `""` | AC-5 |
| A child writing interleaved to both | Each stream captured whole and independently; neither truncates nor reorders the other | AC-7 |
| A child emitting more than `maxOutputChars` on a stream | That stream is truncated to the budget, its `…Truncated` flag is `true`, the call still **resolves** | AC-6 |
| A child whose stderr overflows while stdout stays small | `stderrTruncated: true`, `stdoutTruncated: false` — per-stream, even though execa reports a single `isMaxBuffer` flag | AC-6, AC-7 |
| `npm test`-shaped child exiting `1` | Resolves with `exitCode: 1` — not a rejection | AC-8, AC-10 |
| A child killed by an external signal | `signal` populated, `exitCode` absent | AC-9 |
| `cwd` pointing at a real directory | The child observes that directory as its working directory | AC-11 |
| An **arg** containing shell metacharacters (`;`, `&&`, `$(…)`) | Arrives at the child verbatim as one argv entry — no shell interpretation, nothing executed | AC-12 |
| A **command** containing shell metacharacters | Treated as a literal binary name; the spawn fails and surfaces as `ProcessSpawnError` (not as a silently empty resolved result) | AC-14 |
| A child whose output exceeds the budget **and** which then outlives `timeoutMs` | `timedOut: true` and the child is dead — truncation must not mask the timeout | AC-17 |
| `cwd` relative, `command` empty, `timeoutMs <= 0` | Rejects with `InvalidProcessRequestError` **before any spawn** | AC-13 |
| `command` naming a nonexistent binary (`ENOENT`), a non-executable file (`EACCES`), or a `cwd` that does not exist | Rejects with `ProcessSpawnError` carrying the raw error as `cause` — never a raw execa error, and never a silently resolved empty result | AC-14 |
| Any failing outcome (non-zero exit, timeout, truncation, spawn failure) | `execa` returns an `ExecaError` **as the resolved value** with `failed: true` in every one of these cases; the adapter classifies by `exitCode`/`signal` presence, never by `failed` | AC-16 (D3) |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-1 | When `timeoutMs` elapses, the child process is **actually terminated** — a child that traps and ignores `SIGTERM` must still be reaped by the follow-up `SIGKILL`, and the result must prove which signal did it. | Two assertions, because each alone is weak. (a) A `SIGTERM`-trapping child (`process.on("SIGTERM", () => {})` + an open `setInterval`) run with a short `timeoutMs` must resolve with `signal: "SIGKILL"` — empirically confirmed against `execa@9.6.1`, which also sets `isForcefullyTerminated: true` for exactly this case. (b) A liveness check on the child's pid after the call resolves (`process.kill(pid, 0)` throwing `ESRCH`). **The port exposes no `pid`**, so the child must print `process.pid` as its first stdout line and the test parses it from `result.stdout` — a test that "captures the pid" any other way cannot be written against this port. The check is not racy: execa resolves off the `exit` event, which Node emits after libuv has already reaped, so the pid is gone rather than defunct. **This is the story's load-bearing test** — an adapter that leaks orphans must fail it. | must |
| AC-2 | A timed-out call **resolves** with `timedOut: true` (never rejects), with whatever output the child produced before termination preserved. | Child prints a line, then hangs past the timeout; assert `timedOut === true` and the line is present in `stdout`. | must |
| AC-3 | A child completing within budget resolves with `timedOut: false`. No false positives from a timer that fires late or a budget measured from the wrong instant. | Fast child, generous timeout; assert `timedOut === false` and `exitCode === 0`. | must |
| AC-4 | Full stdout is captured **byte-exactly**, including the trailing newline. execa's `stripFinalNewline` defaults to `true`, so the default option bag silently eats the last newline of every capture — the adapter must set it `false`. | Child writes `"a\n\n"`; assert `stdout === "a\n\n"` exactly, not "contains a". A test asserting "all N lines present" would pass against the buggy default and is therefore not acceptable evidence for this AC. | must |
| AC-5 | Full stderr is captured, **in its own field**, never merged into stdout. | Child writes distinct markers to each stream; assert each field contains only its own marker. | must |
| AC-6 | When a stream exceeds `maxOutputChars` (defaulted by the adapter when the request omits it), that stream is truncated to the budget and its `stdoutTruncated`/`stderrTruncated` flag is `true` — the call resolves normally, and the truncated content that *was* captured is returned rather than discarded. A verbose-but-successful validation is not an infrastructure failure. **Note the unit**: execa counts `maxBuffer` in **characters**, not bytes (its own overflow message reads *"larger than N characters"*), hence the field name. | Child emits well over the budget; assert resolved, flag `true`, captured length equals the budget, and the captured prefix is the child's real output. | must |
| AC-7 | Truncation is **per stream**: one stream overflowing never truncates, corrupts, reorders or drops the other. This must be derived by comparing each captured stream's length against the budget — `execa` reports only a single, non-per-stream `isMaxBuffer` flag, so trusting it directly would mark both streams truncated when only one was. | Child writes 50k to stderr and 2 chars to stdout; assert `stderrTruncated === true`, `stdoutTruncated === false`, and stdout's 2 chars intact. Mutation: set both flags from `isMaxBuffer` → this test fails. | must |
| AC-8 | The child's exit code is available to the domain as `exitCode`, for both zero and non-zero exits. | Children exiting 0, 1, 42; assert exact values. | must |
| AC-9 | When the child is terminated by a signal, `signal` is populated and `exitCode` is absent (not `0`, not `null`) — the `exactOptionalPropertyTypes` conditional-spread idiom both engine seams already use. | The child **self-signals** (`process.kill(process.pid, "SIGKILL")`), since the port exposes no handle for an external kill. Assert `signal` set and `"exitCode" in result === false`. | must |
| AC-10 | A non-zero exit **resolves** — it is never translated into a thrown error. Only a failure to spawn (AC-14) or an invalid request (AC-13) rejects. This is the resolve-not-reject contract both engine seams established, and it is what lets `[E5.F1.H2]` treat a failed validation as evidence rather than an aborted review. | Assert `await run(...)` for an exit-1 child does not reject. Mutation: set `reject: true` → the test fails. | must |
| AC-11 | `cwd` is honored: the child's working directory is the requested path. `cwd` must be **absolute**; a relative path is rejected by AC-13's validation before any spawn. | Child prints `process.cwd()`; assert it equals a fresh `mkdtemp` dir. | must |
| AC-12 | The adapter never invokes a shell: `command` and `args` are passed separately. Note this is execa's **default**, not a guard the adapter installs — passing `args` as an array with `shell` unset is already sufficient; setting `shell: false` explicitly is documentation, not enforcement. The real guarantee is the mutation test. | Pass `args` containing `; touch pwned`; assert no such file is created and the arg arrives verbatim in the child's `process.argv`. Mutation: enable `shell: true` → execa joins the args into one string, the file appears, and the test fails. | must |
| AC-13 | A malformed request rejects with `InvalidProcessRequestError` **before any process is spawned**: empty/blank `command`, non-absolute `cwd`, `timeoutMs <= 0` or non-finite, `maxOutputChars <= 0` or non-finite when present. | Table-driven rejection tests; assert `instanceof InvalidProcessRequestError` and `instanceof RunError`, and that no child was spawned. | must |
| AC-14 | A process that **never ran** rejects with `ProcessSpawnError` carrying the raw error as `cause`. This covers three empirically-confirmed cases that all present identically under `reject: false` — a nonexistent binary (`ENOENT`), a non-executable file (`EACCES`), and a `cwd` that does not exist (also surfaced as `ENOENT`, with execa's message *"The `cwd` option is invalid"*). None of them reject on their own; the adapter must detect and throw (D3). | All three cases; assert `ProcessSpawnError`, `instanceof RunError`, and `cause` populated. Mutation: remove the classification → the call resolves with an empty result instead, and the tests fail. | must |
| AC-15 | `depcruise src` reports 0 violations — in particular `src/core/run/ports/process-runner.ts` imports nothing from `execa`, `node:child_process`, or any adapter. `git diff --stat` shows no change to `src/core/run/run-review.ts`, `src/adapters/driven/git/**`, or `src/adapters/driven/engines/**`. `npm run check` and `npm test` green. | Closing gate, same discipline as the two prior E5 stories. | must |
| AC-17 | When a child **both** overflows the output budget **and** outlives `timeoutMs`, the result still reports `timedOut: true` and the child is still dead. This is not hypothetical: it is the single most likely real-world failure of a hung validation (a chatty test runner that stops making progress). Empirically, `execa@9.6.1` reports `timedOut: false` for this case — `handleMaxBuffer` sets the termination reason to `"other"` before the timeout's own reason can be recorded, so `result.timedOut` alone is an unsound source for this field and the adapter must derive it. | Child floods stdout past the budget, ignores `EPIPE`, and never exits; short `timeoutMs`. Assert `timedOut === true`, the truncation flag `true`, and the pid dead (AC-1's technique). Mutation: pass `result.timedOut` straight through → this test fails while every other timeout test still passes, which is exactly why this AC is separate from AC-2. | must |
| AC-16 | The adapter never uses `execa`'s `failed` flag to decide success. A plain non-zero exit sets `failed: true` while being the port's most expected outcome, so classification is by `exitCode`/`signal` presence alone (D3). | A child exiting `1` resolves with `exitCode: 1`. Mutation: classify on `failed` → every non-zero-exit test rejects, which is precisely the bug this AC exists to prevent. | must |

## Interface Notes

- **Port placement**: `src/core/run/ports/process-runner.ts`, alongside `review-engine.ts`. Errors go in the existing `src/core/run/run-errors.ts` (the module keeps its error family in one file — there is no `ports/*-errors.ts` split in `run`, unlike `repos`/`history`).
- **Naming**: `ProcessRunner` is fixed by PRD §4.3 and CLAUDE.md's port catalog. The adapter is named for its technology per the conventions (`createExecProcessRunner` in `src/adapters/driven/exec/`), never `ProcessService`.
- **Result shape** deliberately mirrors the two existing engine seams (`stdout`, `exitCode?`, `signal?`, `timedOut`) so a future retrofit (`risk-004`) is a mechanical substitution, and extends them with the two fields those seams did not need: `stderr` and the truncation flags.
- **`maxOutputBytes` default** is the adapter's, not the port's — the port declares the knob, the adapter picks the number, mirroring how `PREFLIGHT_TIMEOUT_MS` is an adapter constant rather than a port field.

## Downstream Constraints For `[E5.F1.H2]`

Recorded here so the dependent story inherits them explicitly rather than rediscovering them:

1. **String → `(command, args)`.** Repo config declares `validations: string[]` (e.g. `"npm test"`), but this port takes them separately and never shells out. `[E5.F1.H2]` must define that conversion, and must not do it by handing the string to a shell (D1).
2. **The failure classifier needs updating, and this story may not do it.** `src/core/run/run-review.ts` maps `InvalidRunRequestError` → `"validation-failed"` but falls through to `"engine-error"` for anything unrecognized. `InvalidProcessRequestError` — deliberately the mirror of `InvalidRunRequestError` — would therefore be classified as `"engine-error"`. Nothing breaks in this story (the port has no caller), and AC-15 pins `run-review.ts` untouched, so `[E5.F1.H2]` must add `InvalidProcessRequestError` to the `validation-failed` branch and decide where `ProcessSpawnError` belongs.
3. **Output reaching the prompt is the secret-exposure boundary** (D2), not this port.

## Traceability

| Issue #31 acceptance criterion | Covered by |
|---|---|
| Timeout kills the process | AC-1 (reaping proof), AC-2 (flag + preserved output), AC-3 (no false positive), AC-17 (timeout not masked by truncation) |
| Full output captured | AC-4 (stdout, byte-exact), AC-5 (stderr, separate), AC-6 (truncation), AC-7 (stream independence). **Stated deviation**: #31 says "complete". This story delivers *complete up to a declared budget, with any loss made visible via a `…Truncated` flag*. Unbounded capture is not implementable against a prompt with a token budget (`[E5.F1.H2]`), so the criterion is scoped rather than met literally — recorded as a deviation, not presented as coverage. |
| Exit code available to the domain | AC-8 (values), AC-9 (signal case), AC-10 (resolve-not-reject, so the code is reachable at all) |
| *(backlog: "cwd in the worktree")* | AC-11 (`cwd` honored + absolute), with the proposal's contradiction resolved: the port validates absoluteness, the **caller** supplies the worktree path — the port never learns what a worktree is |
| *(implied by the execution surface)* | AC-12 (no shell), AC-13 (pre-spawn validation), AC-14 (typed spawn failure), AC-15 (guards), AC-16 (`failed` is not an error signal) |

## Revision Notes

Revision 1 specified the adapter from the two in-repo engine seams and execa's README. Revision 2 re-derived every execa claim by **running probes against the installed `execa@9.6.1`** and reading its `lib/`. Four assumptions were wrong, and one of them was inherited from a false comment in the existing code.

| Id | Finding | Revision 1 said | Reality (empirically confirmed) | Fixed in |
|---|---|---|---|---|
| R1 | **`reject: false` means *nothing* rejects.** | AC-14: a spawn failure "rejects with `ProcessSpawnError`". | With `reject: false`, execa returns an `ExecaError` **as the resolved value** for every failure — including `ENOENT`, `EACCES`, and an invalid `cwd`. A nonexistent binary would have silently resolved as an all-empty result, indistinguishable from a signal-killed process. The adapter must classify and throw. **Both existing engine seams' doc comments assert the opposite** ("Only a genuine spawn failure … REJECTS"), so revision 1 inherited a wrong house idiom rather than a proven one — worth flagging to whoever owns `risk-004`'s eventual retrofit. | D3, AC-14, AC-16 |
| R2 | **`maxBuffer` counts characters, not bytes.** | `maxOutputBytes`; "captured length within budget". | execa's unit is `characters` (UTF-16 code units) unless `encoding: "buffer"`; its own overflow message reads *"larger than N characters"*. A "1 MB" budget would admit ~4 MB of multibyte output — material when the destination is a token-budgeted prompt. | Field renamed `maxOutputChars`; AC-6 |
| R3 | **`isMaxBuffer` is global, not per-stream.** | AC-6/AC-7 implied per-stream flags come from execa. | One boolean for the whole run; the per-fd detail is deleted internally before the result surfaces. Per-stream attribution must be derived by comparing each captured stream's length against the budget. Confirmed workable: on a stderr-only overflow, stderr is truncated to exactly the budget while stdout stays intact. | AC-7 (with the mutation that catches the naive version) |
| R4 | **`stripFinalNewline` defaults to `true`**, on the error path too. | AC-4: "no lost tail", with a "all N lines present" test. | The default silently eats the trailing newline of every capture — and the proposed test would have passed anyway. The option bag must set it `false` and AC-4 must assert byte-exact equality. | Option bag; AC-4 |
| R5 | **Truncation masks a timeout.** | AC-2 and AC-6 were specified independently; the combination was not considered. | A child that overflows the budget *and* then hangs resolves with `timedOut: false` even though the timeout is what killed it — `handleMaxBuffer` records the termination reason first and the timeout's own reason becomes a no-op. This is the most likely real-world hung-validation shape, and no revision-1 AC covered it. | New AC-17 |
| R6 | Test hints were unimplementable against the port. | AC-1 "capture its pid"; AC-9 "kill a child externally". | `ProcessRunResult` exposes no `pid` and `run()` returns a promise, not the subprocess — so neither hint can be written. The child must print its own pid to stdout, and self-signal for AC-9. (The liveness check itself was verified sound: execa resolves off `exit`, after libuv reaps, so no zombie/race problem.) | AC-1, AC-9 |
| R7 | Minor citation errors. | "four established contract suites"; `shell: false` framed as a guard. | There are **five** (`ReviewEngine`, `GitPort`, `ConfigStore`, `HarnessLoader`, `RunStore`). `shell: false` is execa's default — args-as-array is the actual guarantee, so the explicit setting is documentation. | Scope list; AC-12 |
