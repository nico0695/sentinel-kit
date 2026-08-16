# Spec

## Routing Digest

- change_name: e4-f2-h2-opencode-adapter
- objective: new-feature
- route: continue-lite
- digest_summary: Firms up `createOpenCodeAdapter(options?): ReviewEngine` (`src/adapters/driven/engines/opencode/opencode-adapter.ts`) as a testable contract, reusing H1's pre-resolved patterns (internal pre-flight `isAvailable()` check, injectable-runner seam, `totalTokens = inputTokens + outputTokens` only) without re-deriving them, and firmly resolving the three genuinely-new questions this engine raises: (1) NDJSON parsing splits on `\n`, parses each line independently, and silently drops any line that fails `JSON.parse` — covers both a truncated final line and stray non-JSON noise, with no line-position special-casing; (2) TWO distinct error classes, not one — `OpenCodeInvocationError` when stdout contains zero parseable NDJSON lines (the `unknown-model-stdout.txt` shape: a raw log dump, review never started), `OpenCodeReviewError` when at least one line parses but the stream carries an `error`-type event or never reaches a successful `step-finish` (the `context-overflow.ndjson` shape: a session started, the review itself failed); (3) `OPENCODE_CONFIG` is a JSON file written to a fresh OS-temp path per invocation (`fs.mkdtemp`-based), referenced via the env var, and best-effort removed after the call resolves or rejects — never a fixed/shared path, never the worktree.
- scope_digest: IN = the adapter factory, its options/injection shape (mirroring `ClaudeCodeAdapterOptions`), invocation/NDJSON-parsing/error-translation/timeout rules, 3 typed local `Error` subclasses, the `reviewEngineContract` suite passing against a fixture-replaying `runProcess` stub, the `OPENCODE_CONFIG` temp-file lifecycle. OUT = cascading resolution (#30), `ReviewEngine` port shape, `runReview` changes, persistence, `ProcessRunner`/`exec` adapter, exact adapter-vs-outer-race timeout precedence (same deferral H1 made, for the same reason — this is a repo-wide `runReview` concern, not per-adapter).
- acceptance_digest: 24 numbered ACs. Invocation/parsing ACs verified byte-for-byte against all 6 `fixtures/opencode/*` files (re-parsed directly with `python3 -c "import json; ..."`, not paraphrased from the proposal) — including the `step-finish.tokens` shape (`total`/`input`/`output`/`reasoning`/`cache.{read,write}`) and the confirmed fact that `.tokens.total` INCLUDES `reasoning` tokens, so it cannot be reused as `ReviewUsage.totalTokens` without breaking the `inputTokens + outputTokens` invariant H1 established. Contract suite green is the mechanical gate; "successful real review" (issue #29 AC-2) is a manual `execution-log.md` entry, same as H1's AC-24.

## Summary

- change_name: e4-f2-h2-opencode-adapter
- objective: new-feature
- route: continue-lite
- spec_status: complete

Story `[E4.F2.H2]` / issue #29: the second real `ReviewEngine` adapter, proving the port needs zero changes to add a structurally different engine. This spec formalizes proposal.md's scope sketch and resolves its three open questions as firm, testable rules (NDJSON parse-tolerance strategy, one-vs-two error classes, `OPENCODE_CONFIG` injection mechanism) — none carry forward to design. The two judgment calls proposal.md already ratified (reuse H1's `isAvailable()` pattern; reuse H1's `totalTokens` rule) are confirmed here as fixed ACs, not re-opened.

## Scope Boundary

### In Scope

- `createOpenCodeAdapter(options?: OpenCodeAdapterOptions): ReviewEngine` under `src/adapters/driven/engines/opencode/opencode-adapter.ts`, factory-function shape (no class), mirroring `createClaudeCodeAdapter`'s structure file-for-file (orchestration / process-runner seam / envelope parsing / typed errors, split the same way).
- The canonical invocation per `docs/engines/opencode.md`: cwd = `worktree.path`, prompt on stdin, command args `["run", "-m", <model>, "--format", "json"]`, with `OPENCODE_CONFIG` set in the child's environment on **every** invocation (pre-flight included) — no code path spawns `opencode` without it.
- Full NDJSON envelope handling: line-by-line parse tolerant of a trailing unparseable line, `text`-event concatenation for `ReviewResult.output`, last-`step-finish`-event token extraction, `error`-event and no-successful-completion detection.
- The `opencode --version` pre-flight check, run inside `review()` before the real invocation, bounded by the same short fixed internal budget H1 used (not `request.timeoutMs`).
- Adapter-owned SIGTERM→SIGKILL timeout enforcement using `request.timeoutMs`, reusing the same `execa` `{ timeout, killSignal, forceKillAfterDelay }` mechanism H1's `createDefaultRunProcess` established (no new timeout-handling code to design).
- The `runProcess` injection seam and its default `execa`-backed implementation, same shape as `ClaudeCodeProcessRunner`/`ClaudeCodeProcessResult` (renamed to the `OpenCode` prefix) — copied pattern, not a new one.
- The `OPENCODE_CONFIG` temp-file lifecycle: write a fresh deny-permission JSON file per `review()` call, pass its path via the env var, remove it in a `finally` block regardless of outcome.
- Three local, adapter-owned `Error` subclasses: `OpenCodeUnavailableError`, `OpenCodeInvocationError`, `OpenCodeReviewError` (all extend `Error`; none touch the `ReviewEngine` port).
- The `reviewEngineContract` harness (`<opencode>/__test__/opencode-adapter.test.ts`) built over fixture-replaying `runProcess` stubs, importing the shared suite unmodified — same file H1 already exercises.
- The manual-verification record for issue #29's "successful real review" AC, in `execution-log.md`.
- Barrel export addition in `src/adapters/driven/engines/index.ts` (`createOpenCodeAdapter` + its options type), updating the file's own doc-comment that currently says "The `opencode` adapter lands in `[E4.F2.H2]`".

### Out Of Scope

- **Cascading engine resolution** (issue #30) — `src/main/` composition-root wiring; depends on this story and H1 both landing.
- **Any change to the `ReviewEngine` port** (`src/core/run/ports/review-engine.ts`) or to `runReview`'s pipeline. Issue #29's third acceptance criterion IS this constraint; satisfying it means touching neither.
- **A live-network "successful real review" as an automated CI test.** Satisfied by manual verification (AC-24), same pattern as H1's AC-24.
- **Persistence of runs/usage** — `RunStore` is `E5.F2.H1`, not built.
- **`ProcessRunner`/`src/adapters/driven/exec/`** — this adapter spawns `opencode` directly, mirroring both `git-cli.ts` and the merged claude-code adapter.
- **Re-opening `isAvailable()` or `totalTokens` as design questions.** Both are confirmed reuse of H1's already-shipped, already-working resolutions (AC-5–7, AC-11 below) — not re-derived.
- **Model/provider selection UX** (e.g. picking a default model, validating it against `opencode models` output before invocation) — the adapter takes `model` as a required-with-default option exactly like H1 took `model: "sonnet"`; no new provider-discovery logic.
- **Session/state cleanup under `~/.local/share/opencode/`** — `docs/engines/opencode.md`'s own "Limitations" section notes this accumulates per-run state with no opt-out flag; out of scope for this adapter, same as H1 left claude-code's `~/.claude` session pollution unaddressed.
- **Exact adapter-vs-outer-race timeout precedence** — same deferral as H1's AC-19, for the identical reason: it is a `runReview`-level concern common to every engine adapter, not specific to this one.

### Non-Goals

- This story does not build a general NDJSON-stream utility reusable outside this adapter — the parser is local to `opencode/envelope.ts`, not a shared core/adapters utility.
- This story does not attempt to distinguish "unknown model" from "missing credentials" in the error message — per the spike, both produce an identical `ProviderModelNotFoundError` signature and are indistinguishable without calling `opencode models` separately (out of scope); the error message states the ambiguity and points at `opencode models`.
- This story does not change `fixtures/opencode/*` or `fixtures/README.md` — the 6 fixtures are consumed as-is.

## Expected Behavior

| Scenario | Expected Outcome | Evidence / Fixture |
|---|---|---|
| Binary missing / not on PATH | `review()` rejects with `OpenCodeUnavailableError` before the real review is ever invoked | pre-flight `runProcess(["--version"], …)` rejects or exits non-zero |
| Successful review, single step | `review()` resolves `{ output: <concatenated text events>, usage: { inputTokens, outputTokens, totalTokens } }` | `fixtures/opencode/valid-verdict.ndjson` (3 lines: `step_start`, `text` with `"VERDICT: request-changes\n…"`, `step_finish` with `reason:"stop"`, `tokens:{input:4720,output:66,reasoning:179,total:4965}`) — `totalTokens` computed as `4786`, NOT the stream's own `4965` |
| Successful review, multi-step (tool use in between) | Text events across ALL steps concatenate in stream order; usage comes from the LAST `step_finish` only | `fixtures/opencode/no-verdict.ndjson` (7 lines, two `step_finish` events — first `reason:"tool-calls"` `tokens:{input:4657,output:69}`, second/final `reason:"stop"` `tokens:{input:321,output:96}`) — `totalTokens = 321+96 = 417`, the FIRST step's tokens are never used |
| Successful review, verdict buried in fenced markdown | Same resolve path, verbatim text-event concatenation, no `VERDICT:` interpretation here | `fixtures/opencode/noisy-output.ndjson` (`tokens:{input:4698,output:152}` → `totalTokens:4850`) |
| Context overflow (in-stream error event) | `review()` rejects with `OpenCodeReviewError("ContextOverflowError: Input exceeds context window of this model")` | `fixtures/opencode/context-overflow.ndjson` — a valid `step_start` line followed by a `type:"error"` line (`error.name:"ContextOverflowError"`); no `step_finish` ever appears |
| Killed mid-run, no output produced yet | `review()` rejects with `OpenCodeReviewError` (fallback message: stream ended with no `text` event and no successful `step_finish`) | `fixtures/opencode/timeout-sigterm-partial.ndjson` — ONE complete, valid `step_start` line, then nothing (captured truncation is clean-at-line-boundary, not mid-line; parser must still tolerate a genuinely malformed trailing line per the doc's stated behavior even though this fixture doesn't exercise it) |
| Unknown model / missing credentials | `review()` rejects with `OpenCodeInvocationError` — stdout is NOT NDJSON at all (zero lines parse) | `fixtures/opencode/unknown-model-stdout.txt` — a raw `[timestamp] ERROR (#n): failed { ... }` log dump with unquoted JS-object keys; `JSON.parse` fails on line 1 |
| `.tokens` present with `reasoning`/`cache` fields | `totalTokens` excludes `reasoning` AND `cache.read`/`cache.write` — same invariant H1 fixed for claude-code's cache fields | every fixture above: `tokens.total` always exceeds `input+output` by exactly the `reasoning` value (e.g. `valid-verdict`: `4965 - (4720+66) = 179 = reasoning`) |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-1 | `createOpenCodeAdapter(options?: OpenCodeAdapterOptions): ReviewEngine` exists as a factory function (no class) at `src/adapters/driven/engines/opencode/opencode-adapter.ts` | mechanical inspection | must |
| AC-2 | `OpenCodeAdapterOptions` = `{ binaryPath?: string /* default "opencode" */; model: string /* no engine-wide safe default exists per the spike — "Model flag is mandatory in practice" — so `model` is REQUIRED, unlike H1's optional `model` with a `"sonnet"` default */; runProcess?: OpenCodeProcessRunner }` | unit test asserting `model` is required at the type level (`tsc --noEmit` on a call site omitting it) and `binaryPath` defaults when omitted | must |
| AC-3 | Every process invocation (pre-check and real review) uses `cwd = request.worktree.path` | contract test asserting recorded `cwd` on the `runProcess` stub | must |
| AC-4 | The real review call's args are exactly `["run", "-m", <model>, "--format", "json"]`; the prompt is passed as the runner's `input` (stdin), never as argv | contract test asserting recorded `args`/`input` | must |
| AC-5 | `review()` first calls `runProcess(["--version"], { cwd, timeoutMs, env: {} })`; if it rejects OR resolves with a non-zero exit code, `review()` rejects with `OpenCodeUnavailableError` and the real review invocation is NEVER issued — reuses H1's exact `isAvailable()`-inside-`review()` pattern, not re-derived | unit/contract test with a `--version`-failing stub, asserting the review args were never called | must |
| AC-6 | When the pre-flight check exits 0, `review()` proceeds to the real review invocation | unit/contract test | must |
| AC-7 | `OPENCODE_CONFIG` is set in the env of **both** the pre-flight and the real invocation, pointing at a per-`review()`-call temp JSON file with content `{"$schema":"https://opencode.ai/config.json","permission":{"edit":"deny","bash":"deny","webfetch":"deny"}}` — no invocation of `opencode` ever runs without it, since default `opencode run` writes files | contract test asserting the recorded `env.OPENCODE_CONFIG` value on every `runProcess` call resolves to a file, and reading that file back yields the exact deny-permission JSON | must |
| AC-8 | The temp config file is created via a fresh OS-temp path per `review()` invocation (`fs.mkdtemp`-based directory, one file inside it) — never a fixed path reused across calls (would race under concurrent reviews) and never written inside `request.worktree.path` (would pollute the diffed tree, per the spike's own rejected alternative) | contract test asserting two concurrent `review()` calls each get a distinct `OPENCODE_CONFIG` path | must |
| AC-9 | The temp config file (and its containing temp directory) is removed in a `finally` block after the real invocation settles, regardless of resolve/reject outcome; a removal failure (e.g. already gone) is swallowed, never surfaces as a `review()` rejection | contract test asserting cleanup happens on both a resolving and a rejecting stub | must |
| AC-10 | Real invocation stdout is split on `\n` into lines; each non-empty line is parsed independently with `JSON.parse`; a line that fails to parse is silently dropped (covers both a genuinely truncated final line and any stray non-JSON noise) — this is NOT the same as AC-13's "zero lines parsed" case | contract test with a stub appending a deliberately malformed line to an otherwise-valid stream, asserting the malformed line is ignored and the rest of the stream still resolves | must |
| AC-11 | `text`-type events are concatenated, in stream order, from `.part.text` — this becomes `ReviewResult.output` verbatim, across however many steps occur. No `VERDICT:` interpretation here (frozen boundary, same as H1's AC-9) | contract test against `valid-verdict.ndjson` and `no-verdict.ndjson` (multi-step) — concatenated text compared exactly | must |
| AC-12 | Token usage is read from the LAST `step-finish`-type event only (`.part.tokens.input` / `.part.tokens.output`), never an earlier step's — multi-step runs (tool use) have more than one `step-finish` event and only the final one reflects the completed review's total cost | contract test against `no-verdict.ndjson` (two `step_finish` events): asserts `inputTokens:321, outputTokens:96` (the LAST one), not `4657`/`69` (the first) | must |
| AC-13 | `ReviewUsage.totalTokens = inputTokens + outputTokens` when both are present; `undefined` otherwise. `.part.tokens.total`, `.reasoning`, and `.cache.{read,write}` are NEVER used — reuses H1's exact invariant (`totalTokens === inputTokens + outputTokens`, never the stream's own precomputed total, which includes `reasoning`) | contract test: `valid-verdict.ndjson` → `totalTokens = 4720+66 = 4786`, NOT the stream's `tokens.total:4965` | must |
| AC-14 | When no `step-finish` event is ever observed with `reason` other than absence (i.e. the stream never reaches a completion event), `ReviewResult.usage` is omitted, not set to `undefined` (`exactOptionalPropertyTypes`) | unit test + `tsc --noEmit` | must |
| AC-15 | If ZERO lines of stdout parse as valid JSON (the entire output is non-NDJSON, e.g. a raw log dump), `review()` rejects with `OpenCodeInvocationError` — this is the "review never started" class | contract test against `fixtures/opencode/unknown-model-stdout.txt`, asserting rejection with `OpenCodeInvocationError` and a message noting the model/credential ambiguity, pointing at `opencode models` | must |
| AC-16 | If AT LEAST ONE line parses but the stream contains a `type:"error"` event anywhere, `review()` rejects with `OpenCodeReviewError`, message built from `.error.name` + `.error.data.message` — this is the "a review session started but failed" class, distinct from AC-15 | contract test against `fixtures/opencode/context-overflow.ndjson`, asserting rejection with `OpenCodeReviewError` containing `"ContextOverflowError"` and `"Input exceeds context window"` | must |
| AC-17 | If at least one line parses, no `error` event occurs, but the stream never reaches a `step-finish` event with `reason:"stop"` (i.e. it was cut off — killed, or genuinely malformed truncation) AND no `text` event was ever captured, `review()` rejects with `OpenCodeReviewError` with a fallback message noting no output was produced | contract test against `fixtures/opencode/timeout-sigterm-partial.ndjson` (single valid `step_start` line, nothing else) | must |
| AC-18 | **(AMENDED — see Amendment 1)** AC-15, AC-16, and AC-17 are the only three rejection paths derived from the real invocation's **stdout content**; within stdout handling, every other observed shape (any `text` events present, regardless of whether a `step-finish reason:"stop"` was reached) is treated as a valid (if `no-verdict`-shaped) result, not an error, matching H1's "no `VERDICT:` interpretation at this layer" boundary. Resolving `review()` additionally requires the process-status gate of AC-25 to pass — stdout shape alone is no longer sufficient | mechanical inspection + contract test covering all 6 fixtures | must |
| AC-19 | `request.timeoutMs` bounds the real review invocation's wall-clock budget; the `--version` pre-check is bounded by the same short fixed internal budget H1 used (not `timeoutMs`) | unit test with a never-resolving pre-check stub, asserting eventual rejection | must |
| AC-20 | On the review invocation exceeding `timeoutMs`, the adapter sends SIGTERM first, escalating to SIGKILL after a bounded grace window if the process has not exited — identical mechanism to H1's `createDefaultRunProcess` (`execa`'s `timeout`/`killSignal`/`forceKillAfterDelay`), no new timeout code | contract test asserting SIGTERM-then-SIGKILL ordering, mirroring H1's AC-16/AC-17 tests | must |
| AC-21 | `createOpenCodeAdapter({ runProcess })` accepts an injectable `OpenCodeProcessRunner` as the SOLE binary-mocking seam — no `PATH` shimming, no monkey-patching `execa`. The default (`runProcess` unset) production path wraps `execa` directly | mechanical inspection of `<opencode>/__test__/opencode-adapter.test.ts` + the default factory | must |
| AC-22 | `reviewEngineContract(harness, "opencode")` (from `src/adapters/driven/engines/__test__/ReviewEngine.contract.ts`, imported unmodified) passes against the opencode harness | `npx vitest run --project adapters -t "opencode"` | must |
| AC-23 | Every raw failure (`runProcess` rejection, zero-parseable-lines, in-stream error event, no-output-produced, pre-flight failure, temp-file write failure) becomes a plain/typed `Error` instance before leaving `review()`; the function body never throws synchronously, only ever rejects its returned Promise (mirrors H1's AC-23 exactly) | contract test + mechanical inspection (no bare `throw` outside an `async` function body) | must |
| AC-24 | "Successful real review" (issue #29 checklist item 2) is satisfied by a MANUAL verification run: invoke the finished adapter once against the real, authenticated `opencode` CLI over a genuine diff; record the exact command, exit code, and observed `VERDICT:` line in `execution-log.md` — mirrors H1's AC-24. Explicitly NOT CI-enforced | manual verification, recorded in `execution-log.md` | must |
| AC-25 | **(NEW — Amendment 1, closes review finding R1-001)** The real invocation's process status gates resolution: after `extractOutcome` would return (i.e. none of AC-15/16/17 fired), `review()` rejects with `OpenCodeReviewError` if the process did NOT exit cleanly — that is, if `timedOut` is true, OR `signal` is set, OR `exitCode` is anything other than `0`. The message must name the terminating signal or the exit code and state that the review output is incomplete. Ordering is normative: stdout-derived rejections (AC-15/16/17) are evaluated FIRST so their specific diagnostics (`ContextOverflowError`, the `opencode models` hint) are never masked by a generic status message; the status gate only decides between "resolve" and "reject", never between two rejection messages | contract tests: `{stdout: <valid-verdict bytes>, signal:"SIGTERM", timedOut:true}` rejects; `{stdout: <valid-verdict bytes>, exitCode:1}` rejects; `{stdout: <valid-verdict bytes>, exitCode:0}` still resolves; `context-overflow.ndjson` with `exitCode:1` still rejects with the AC-16 `ContextOverflowError` message, NOT the status message | must |

## Amendment 1 — process-status gate (post-implementation, review-driven)

**Raised by:** 4R code review of `e9ee543`, finding **R1-001** (CRITICAL, introduced, blocking) — see `review-ledger.md`.
**Decided by:** user, at the `review_gate` checkpoint (`cp-review-gate-r1-001`), choosing "amend the spec and fix in this story" over shipping-as-known-defect or a cross-cutting redesign.
**Date:** 2026-08-16.

### What was wrong with the original spec

The original AC-18 declared AC-15/16/17 "the ONLY three rejection paths for the real invocation's stdout handling". That phrasing was accurate about *stdout*, and the implementation followed it faithfully — but **no AC in the original 24 ever addressed the process's own exit status**. `exitCode`, `signal`, and `timedOut` are produced by `OpenCodeProcessRunner` (AC-21's seam) and were simply never consumed for the real invocation. This was a gap in the specification, not a deviation by the implementation: the code did exactly what the approved contract said.

### Why it matters

Reproduced directly against the built adapter during review:

| Simulated process outcome | Original behavior | Correct behavior (AC-25) |
|---|---|---|
| `{stdout: <partial>, signal:"SIGTERM", timedOut:true}` | **resolved** `{"output":"VERDICT: approve\n[SEV: minor] partial..."}` | reject |
| `{stdout: <partial>, exitCode:1}` | **resolved** `{"output":"VERDICT: approve\ntruncated"}` | reject |

`docs/engines/opencode.md` documents that a killed run leaves a "partial NDJSON stream, truncated mid-line", and `fixtures/opencode/valid-verdict.ndjson` shows the `VERDICT:` line arrives in the **first** `text` chunk. Together those mean a truncated review keeps a confident verdict and silently loses the findings that justified it — `runReview` then lands `ok`/`ambiguous` instead of `engine-error`/`timeout`.

The sibling claude-code adapter is not exposed to this, but only *accidentally*: its single-JSON-document envelope fails closed when truncated. This adapter's deliberate line-level NDJSON tolerance (AC-10) removes that accidental protection, which is what makes the gap engine-specific and genuinely new.

### Scope of the amendment

- **AC-25 added**: the process-status gate, with normative ordering (stdout-derived rejections evaluated first).
- **AC-18 reworded**: narrowed from "the ONLY three rejection paths" to "the only three rejection paths *derived from stdout content*", with resolution now additionally conditioned on AC-25.
- **No other AC changes.** The remaining review findings routed into the same fix stage are *conformance* work against already-approved ACs, not amendments:
  - R2-001 — the code requires `.error !== undefined` where AC-16 says "the stream contains a `type:"error"` event **anywhere**". Straight code-vs-spec deviation; fix the code.
  - R3-002 — AC-11's "concatenated in stream order, compared exactly" has no asserting test (reversing the order survives the full suite). Missing test for an approved AC.
  - R3-003 — AC-19's own stated validation (which budget goes to which invocation) has no asserting test (swapping the budgets survives the full suite). Missing test for an approved AC.
  - R4-002 — AC-9's "removed regardless of outcome" does not hold when `createDenyConfigFile()` itself fails between `mkdtemp` and `writeFile`, orphaning the directory. Conformance with AC-9's intent.

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| `timeout-sigterm-partial.ndjson` fixture never exercises a genuinely mid-line-truncated line | low | AC-10's "drop unparseable lines" rule is written defensively per the doc's stated behavior, but the one captured kill-fixture happens to truncate cleanly at a line boundary — the mid-line case is spec'd from documented behavior, not fixture-verified. Same category of gap H1 had for `timeout-sigterm.json`'s SIGKILL/empty-stdout path (doc-derived, not fixture-derived). |
| `OPENCODE_CONFIG` temp-file lifecycle adds filesystem I/O (write + read-back-by-CLI + delete) to every single `review()` call | low | Cheap, local, no network; same order of magnitude as the pre-flight `--version` call H1 already accepts as a per-call cost. |
| Exact adapter-vs-outer-race timeout precedence left open | medium | Deliberately out of scope, identical to H1's AC-19 deferral — a `runReview`-level concern, not adapter-specific; resolving it per-adapter would produce two different answers for the same repo-wide question. |
| OpenCode CLI version drift (`1.17.9`, spike 8 days old) | low | Not re-verified for this story; same low-severity carry-forward pattern as H1's `r-claude-cli-version-drift`. |
| Model is a REQUIRED option here (AC-2), unlike H1's optional `model` with a `"sonnet"` default | low | Deliberate divergence from H1's shape, driven by the spike's own finding ("Model flag is mandatory in practice... without it OpenCode picks a default that depends on local state") — there is no safe engine-wide default to fall back to, so making it optional would silently reintroduce the exact non-determinism the spike warned against. |

## Open Questions And Decisions

All three questions this spec was scoped to resolve (NDJSON parse-tolerance, one-vs-two error classes, `OPENCODE_CONFIG` mechanism) are now firm rules above (AC-10, AC-15–18, AC-7–9 respectively) — **none carry forward to design**. One item remains explicitly open, already scoped as a design/later-story concern:

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| Exact adapter-vs-outer-race timeout precedence | Determines whether a slow-exiting engine surfaces as `engine-error` or `timeout` at the terminal-state layer — identical open item to H1's, deliberately not resolved per-adapter | `sddl-design` (or a future cross-cutting story, if H1 already settled it there — design should check H1's own design.md for whether this was in fact resolved and, if so, simply reuse the answer) | open, design-level, not spec-blocking |

## Approval Notes

- Re-verification of proposal.md's fixture claims against the raw bytes/parsed structure of all 6 `fixtures/opencode/*` files found the proposal's framing accurate, with one addition worth flagging: `context-overflow.ndjson` contains TWO `step_start`/`error` pairs (4 lines total, not the 2 a single attempt would produce) — read as OpenCode internally retrying once before giving up; the spec's AC-16 rule ("stream contains an `error` event anywhere") is robust to this without needing a retry-count rule.
- The `no-verdict.ndjson` fixture directly falsifies a naive "take the first/only `step_finish`" implementation: it has two `step_finish` events with materially different token counts (`4657`/`69` vs `321`/`96`), confirming AC-12's "last one only" rule is necessary, not cosmetic.
- `unknown-model-stdout.txt` was inspected byte-for-byte: it uses unquoted object keys (`ref:`, `error:`) and trailing commas — genuinely invalid JSON from line 1, confirming AC-15's "zero parseable lines" condition is met by this fixture, not a partial-parse edge case.
- The `isAvailable()` and `totalTokens` reuse decisions from proposal.md required no further verification — both are mechanical copies of H1's already-shipped, contract-tested behavior.
- Recommended next stage: `sddl-design`, to fix internal file/function decomposition (mirroring H1's `opencode-adapter.ts` / `process-runner.ts` / `envelope.ts` / `errors.ts` split), the exact `OpenCodeProcessRunner`/`OpenCodeProcessResult` field shapes (including the `env` passthrough AC-7 requires, which `ClaudeCodeProcessRunOptions` doesn't have today), the three error classes' exact constructors, and the temp-file creation/cleanup helper's exact placement.

## Budget Notes

- Lite artifact. One new adapter (four files mirroring H1's layout) against an already-frozen port and an already-captured fixture corpus. Length reflects the three open questions needing firm, fixture-verified resolution and the byte-level cross-checking each required — comparable rigor to H1's spec, lower novelty since most structural questions are inherited answers.
