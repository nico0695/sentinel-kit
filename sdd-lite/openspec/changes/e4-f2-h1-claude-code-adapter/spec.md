# Spec

## Routing Digest

- change_name: e4-f2-h1-claude-code-adapter
- objective: new-feature
- route: continue-lite
- digest_summary: Firms up `createClaudeCodeAdapter(options?): ReviewEngine` (`src/adapters/driven/engines/claude-code/claude-code-adapter.ts`) as a testable contract. Resolves all four open risks from proposal/state.yaml: (1) `isAvailable()` gap closed WITHOUT a port change — `review()` runs an internal `claude --version` pre-check before the real invocation, inside one async call; auth failure is instead surfaced clearly from the real invocation's own response shape, never as a raw crash; (2) binary-mocking seam is an injectable `runProcess: ClaudeCodeProcessRunner` option on the factory, defaulting to a real `execa`-backed runner; (3) `is_error: true` uniformly REJECTS `review()` regardless of cause (auth, context-overflow, or an adapter-initiated timeout kill that still flushed JSON) — never resolves with error text as output; (4) `totalTokens = inputTokens + outputTokens` only, cache fields excluded.
- scope_digest: IN = the adapter factory, its options/injection shape, invocation/parsing/error-translation/timeout rules, 3 typed local `Error` subclasses, the `reviewEngineContract` suite passing against a fixture-replaying `runProcess` stub. OUT = OpenCode adapter (#29), cascading resolution (#30), `ReviewEngine` port shape, `runReview` changes, persistence, `ProcessRunner`/`exec` adapter, isolation/hygiene CLI flags, exact adapter-vs-outer-race timeout precedence (carried to design per the already-ratified `d-timeout-ownership-in-scope`).
- acceptance_digest: 27 numbered ACs. Invocation/parsing ACs verified byte-for-byte against all 6 `fixtures/claude-code/*.json` files (re-read directly, not from the proposal's paraphrase). Contract suite (`reviewEngineContract`) green against a claude-code harness is the mechanical gate; "successful real review" (issue #28 AC-2) is explicitly a manual `execution-log.md` entry, not an automated test.

## Summary

- change_name: e4-f2-h1-claude-code-adapter
- objective: new-feature
- route: continue-lite
- spec_status: complete

Story `[E4.F2.H1]` / issue #28: the first real `ReviewEngine` adapter. This spec formalizes proposal.md's scope sketch and closes all four risks it deliberately left open (`r-isavailable-port-gap`, `r-binary-mocking-seam`, `r-is-error-classification`, `r-total-tokens-computation`) as firm, testable rules — none carry forward to design. Two narrower items stay explicitly open for design, per the proposal's own ratified decisions: the exact ordering between the adapter's internal timeout kill and `runReview`'s outer timeout race (`r-timeout-budget-precedence`), and CLI version-drift re-verification (`r-claude-cli-version-drift`) — both were already scoped as design/later-story concerns in state.yaml, not spec-blocking.

## Scope Boundary

### In Scope

- `createClaudeCodeAdapter(options?: ClaudeCodeAdapterOptions): ReviewEngine` under `src/adapters/driven/engines/claude-code/claude-code-adapter.ts`, factory-function shape (no class), following `git-cli.ts`'s precedent.
- The canonical invocation exactly as proposal.md fixed it: cwd = `worktree.path`, prompt on stdin, command args `["-p", "--model", <model>, "--output-format", "json"]`.
- Full JSON envelope handling: `.is_error`, `.result`, `.usage.input_tokens`/`.output_tokens` extraction, `totalTokens` derivation.
- The `claude --version` pre-flight check, run inside `review()` before the real invocation.
- Adapter-owned SIGTERM→SIGKILL timeout enforcement using `request.timeoutMs`.
- The `runProcess` injection seam and its default `execa`-backed implementation.
- Three local, adapter-owned `Error` subclasses: `ClaudeCodeUnavailableError`, `ClaudeCodeInvocationError`, `ClaudeCodeReviewError` (all extend `Error`; none touch the `ReviewEngine` port, which declares no error types).
- The `reviewEngineContract` harness (`<claude-code>/__test__/claude-code-adapter.test.ts`) built over fixture-replaying `runProcess` stubs.
- The manual-verification record for issue #28's "successful real review" AC, in `execution-log.md`.

### Out Of Scope

- **OpenCode adapter** (issue #29) — separate spike doc, separate fixtures. Not touched.
- **Cascading engine resolution** (global → per-repo → per-run, issue #30 / PRD §6.2) — `src/main/` composition-root wiring; does not exist yet.
- **Any change to the `ReviewEngine` port** (`src/core/run/ports/review-engine.ts`) or to `runReview`'s pipeline. Both are frozen `[E0.F2.H2]`/`[E4.F1.H1]` deliverables.
- **A live-network "successful real review" as an automated CI test.** Satisfied instead by a manual verification run (AC-24).
- **Persistence of runs/usage** — `RunStore` is `E5.F2.H1`, not built.
- **`ProcessRunner`/`src/adapters/driven/exec/`** — this adapter spawns `claude` directly, mirroring `git-cli.ts`, not through that future port.
- **Isolation/hygiene CLI flags** (`--setting-sources`, `--strict-mcp-config`, `--no-session-persistence`, `--max-budget-usd`, documented as "candidates" in `docs/engines/claude-code.md`) — proposal.md's scope line fixes the canonical invocation WITHOUT them; adding them is a follow-up, not this story. Recorded as a risk below, not silently dropped.
- **Exact adapter-vs-outer-race timeout precedence** (`r-timeout-budget-precedence`) — carried to `sddl-design` per `d-timeout-ownership-in-scope`; this spec fixes only the adapter's OWN kill behavior (AC-15–19), not its ordering against `runEngineWithTimeout`'s race.

### Non-Goals

- This story does not build a general "engine health check" facility, a `--max-budget-usd` cost cap, or any config surface beyond `binaryPath`/`model`/`runProcess`.
- This story does not attempt to detect authentication failure *before* spawning the real review (no dummy-prompt pre-flight probe) — see AC-7's justification.
- This story does not change `fixtures/claude-code/*.json` or `fixtures/README.md` — the 6 fixtures are consumed as-is.

## Expected Behavior

| Scenario | Expected Outcome | Evidence / Fixture |
|---|---|---|
| Binary missing / not on PATH | `review()` rejects with `ClaudeCodeUnavailableError` before the real review is ever invoked | pre-flight `runProcess(["--version"], …)` rejects or exits non-zero |
| Successful review | `review()` resolves `{ output: <.result>, usage: { inputTokens, outputTokens, totalTokens } }` | `fixtures/claude-code/valid-verdict.json` (`is_error:false`, `.result` = `"VERDICT: request-changes\n\n…"`, `usage.input_tokens:2, output_tokens:167`) |
| Successful review, no verdict marker | Same resolve path — this adapter does NOT interpret `.result`'s content | `fixtures/claude-code/no-verdict.json` (`is_error:false`) |
| Successful review, verdict buried in fenced markdown | Same resolve path, verbatim `.result` passthrough | `fixtures/claude-code/noisy-output.json` (`is_error:false`) |
| Auth failure | `review()` rejects with `ClaudeCodeReviewError("Invalid API key · Fix external API key")` | `fixtures/claude-code/auth-error.json` (`is_error:true`, `api_error_status:401`, `.result` present, `subtype:"success"` — confirmed unreliable) |
| Context overflow | `review()` rejects with `ClaudeCodeReviewError("Prompt is too long · …")` | `fixtures/claude-code/context-overflow.json` (`is_error:true`, `api_error_status:400`, `.result` present) |
| Adapter-initiated SIGTERM, process flushes JSON before dying | `review()` rejects with `ClaudeCodeReviewError` (fallback message: no `.result` field, `errors` array present instead) | `fixtures/claude-code/timeout-sigterm.json` (`is_error:true`, `subtype:"error_during_execution"`, NO `.result`, `errors:["[ede_diagnostic] …"]`) — confirms proposal.md's claim directly |
| Adapter escalates to SIGKILL, empty stdout | `review()` rejects with `ClaudeCodeInvocationError` (JSON parse failure) | doc's failure-signature table (`docs/engines/claude-code.md`): "stdout and stderr both empty", exit 137 |
| `.usage` present with cache fields | `totalTokens` excludes cache reads/writes | `fixtures/claude-code/noisy-output.json` (`cache_read_input_tokens:21886, cache_creation_input_tokens:3810` alongside `input_tokens:2, output_tokens:529` — totalTokens must be 531, not 26227) |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-1 | `createClaudeCodeAdapter(options?: ClaudeCodeAdapterOptions): ReviewEngine` exists as a factory function (no class) at `src/adapters/driven/engines/claude-code/claude-code-adapter.ts` | mechanical inspection | must |
| AC-2 | `ClaudeCodeAdapterOptions` = `{ binaryPath?: string /* default "claude" */; model?: string /* default "sonnet" */; runProcess?: ClaudeCodeProcessRunner }` | unit test asserting defaults when `options` omitted | must |
| AC-3 | Every process invocation (pre-check and real review) uses `cwd = request.worktree.path` | contract test asserting recorded `cwd` on the `runProcess` stub | must |
| AC-4 | The real review call's args are exactly `["-p", "--model", <model>, "--output-format", "json"]`; the prompt is passed as the runner's `input` (stdin), never as argv | contract test asserting recorded `args`/`input` | must |
| AC-5 | `review()` first calls `runProcess(["--version"], { cwd, timeoutMs })`; if it rejects OR resolves with a non-zero exit code, `review()` rejects with `ClaudeCodeUnavailableError` and the real review invocation is NEVER issued | unit/contract test with a `--version`-failing stub, asserting the review args were never called | must |
| AC-6 | When the pre-flight check exits 0, `review()` proceeds to the real review invocation | unit/contract test | must |
| AC-7 | Auth failure is NOT detected by the pre-flight check (`--version` performs no auth handshake, per `docs/engines/claude-code.md`'s own `isAvailable()` note) — it is recognized only from the real invocation's response (`is_error:true`, `api_error_status:401`, AC-13). This is the deliberate, documented resolution of "missing/unauthenticated … before running" (issue #28 AC-3): "missing" is caught pre-flight inside the same `review()` call, before the real invocation runs; "unauthenticated" is caught with a clear, typed error at the point the real invocation's own response reveals it — not as a raw ENOENT/JSON-parse crash. A dummy-prompt auth pre-probe was considered and rejected: it would add cost and latency to every `review()` call and the spike never validated it | mechanical inspection of adapter doc-comment + AC-5/AC-13 tests together | must |
| AC-8 | stdout of the real review call is parsed with `JSON.parse`; a parse failure (empty/malformed stdout) makes `review()` reject with `ClaudeCodeInvocationError`, `cause` = the raw parse error | contract test with a stub resolving empty/malformed stdout | must |
| AC-9 | When `.is_error === false`, `.result` (string) becomes `ReviewResult.output` **verbatim** — no `VERDICT:` interpretation here (frozen boundary, `d-json-envelope-in-scope`). If `.result` is missing or non-string despite `is_error:false`, `review()` rejects with `ClaudeCodeInvocationError` | contract test against `valid-verdict.json`, `noisy-output.json`, `no-verdict.json` byte-for-byte (`.result` compared exactly) | must |
| AC-10 | `.usage.input_tokens` → `ReviewUsage.inputTokens`, `.usage.output_tokens` → `ReviewUsage.outputTokens`, read only when `.usage` is present and both are numbers | contract test against `valid-verdict.json` (`inputTokens:2, outputTokens:167`) | must |
| AC-11 | `ReviewUsage.totalTokens = inputTokens + outputTokens` when both are present; `undefined` otherwise. `cache_read_input_tokens`/`cache_creation_input_tokens` are NEVER summed in — rationale: keeps `totalTokens === inputTokens + outputTokens` an invariant a caller can rely on, and usage is documented "best-effort," not a cost/billing model (`ReviewUsage`'s own doc-comment) | contract test: `valid-verdict.json` → `totalTokens = 2 + 167 = 169`; `noisy-output.json` → `totalTokens = 2 + 529 = 531`, NOT `26227` | must |
| AC-12 | When `.usage` is absent, `ReviewResult.usage` is omitted (not set to `undefined`, per `exactOptionalPropertyTypes`) | unit test + `tsc --noEmit` | must |
| AC-13 | When `.is_error === true` — for ANY cause (auth, context-overflow, unknown-model, or an adapter-initiated SIGTERM kill that still flushed JSON) — `review()` REJECTS with `ClaudeCodeReviewError`; it never resolves with the error text as `output`. Message = `.result` when present; a fallback message referencing exit code/signal when absent (the `timeout-sigterm.json` shape) | contract test against `auth-error.json`, `context-overflow.json`, `timeout-sigterm.json` — all three reject | must |
| AC-14 | When the runner reports an unparseable/empty stdout regardless of cause (e.g. an adapter-initiated SIGKILL), `review()` rejects with `ClaudeCodeInvocationError` — same path as AC-8, not a distinct one | contract test with a stub simulating empty stdout + `signal: "SIGKILL"` | must |
| AC-15 | `request.timeoutMs` bounds the real review invocation's wall-clock budget; the `--version` pre-check is bounded by a short, fixed internal budget (not `timeoutMs`) so a hung pre-check cannot hang `review()` indefinitely | unit test with a never-resolving pre-check stub, asserting eventual rejection | must |
| AC-16 | On the review invocation exceeding `timeoutMs`, the adapter sends SIGTERM to the child process first | contract test asserting SIGTERM is the first signal observed by the runner | must |
| AC-17 | If the process has not exited within a bounded grace window after SIGTERM, the adapter escalates to SIGKILL. Recommended concrete mechanism: `execa` 9.6.1 (already a project dependency, confirmed installed) supports this natively via its `timeout` + `killSignal` + `forceKillAfterDelay` options — no hand-rolled timer/kill logic needed in the default `runProcess` implementation | contract test asserting SIGKILL follows a non-exiting stub after the grace window | must |
| AC-18 | Regardless of which signal terminated the process, `review()` never resolves when the adapter's own timeout initiated the kill — it always rejects (unifies with AC-13 for the SIGTERM-flushed-JSON case, AC-8/AC-14 for the SIGKILL/empty-stdout case) | contract test, both signal outcomes assert rejection, never resolution | must |
| AC-19 | The exact precedence between the adapter's internal timeout (AC-15–18) and `runReview`'s outer race (`runEngineWithTimeout`/`EngineTimeoutError`, both nominally keyed off the same `request.timeoutMs`) is explicitly OUT OF SCOPE here — left for `sddl-design` per `d-timeout-ownership-in-scope`. Design must fix whether the adapter's internal budget runs deliberately shorter than `timeoutMs` (deterministic adapter-wins) or the two race non-deterministically | N/A — explicit deferral, not an AC to satisfy in this story | must (as a deferral, not an implementation) |
| AC-20 | `createClaudeCodeAdapter({ runProcess })` accepts an injectable `ClaudeCodeProcessRunner` as the SOLE binary-mocking seam — no `PATH` shimming, no monkey-patching `execa`. Its `resolving`/`rejecting` contract-harness factories each construct a fresh adapter with a scripted `runProcess` double replaying exact bytes from one of the 6 fixtures | mechanical inspection of `<claude-code>/__test__/claude-code-adapter.test.ts` | must |
| AC-21 | The default (`runProcess` unset) production path wraps `execa` directly — no other spawn mechanism, mirroring `git-cli.ts`'s pattern | mechanical inspection | must |
| AC-22 | `reviewEngineContract(harness, "claude-code")` (from `src/adapters/driven/engines/__test__/ReviewEngine.contract.ts`, imported unmodified) passes against the claude-code harness | `npx vitest run --project adapters -t "claude-code"` | must |
| AC-23 | Every raw failure (`runProcess` rejection, JSON parse failure, `is_error:true`, pre-flight failure) becomes a plain/typed `Error` instance before leaving `review()`; the function body never throws synchronously, only ever rejects its returned Promise (mirrors `git-cli.ts`'s `wrapAs`; satisfies `ReviewEngine.contract.ts`'s `rejects.toBeInstanceOf(Error)` assertion, confirmed present at line 57) | contract test + mechanical inspection (no bare `throw` outside an `async` function body) | must |
| AC-24 | "Successful real review" (issue #28 checklist item 2) is satisfied by a MANUAL verification run, not an automated test: invoke the finished adapter once against the real, authenticated `claude` CLI over a genuine diff; record the exact command, exit code, and observed `VERDICT:` line in `execution-log.md` — mirrors the spike's own acceptance run and the `d-st1-evidence-obligation` precedent (`e4-f1-h2-verdict-parser`). Explicitly NOT CI-enforced | manual verification, recorded in `execution-log.md` | must |
| AC-25 | Architecture guards hold: adapter imports only `../../../../core/run/index.js` port types from core (mirrors `fake-engine.ts`); no import from another adapter folder outside `driven/engines/`; no adapter instantiation outside a future `src/main/` | `npm run check` (depcruise) | must |
| AC-26 | No scope leak: diff touches only `src/adapters/driven/engines/claude-code/**`, its `__test__/`, and the barrel export addition in `src/adapters/driven/engines/index.ts` — no change to `src/core/run/**` or the `ReviewEngine`/`ReviewRequest`/`ReviewResult`/`ReviewUsage` types | `git diff --stat` | must |
| AC-27 | `npm run check` and `npm test` both green | local run before PR | must |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| `r-timeout-budget-precedence` left open (AC-19) | medium | Deliberately deferred to `sddl-design` per the proposal's own ratified `d-timeout-ownership-in-scope` — not one of the four risks this spec was scoped to close; resolving it here would be scope creep into an ordering decision the proposal explicitly reserved for design. |
| `r-claude-cli-version-drift` (flags verified only against `2.1.226`, spike is 7 days old) | low | Not re-verified for this story; carried forward unresolved, matching state.yaml's own severity rating. No fixture or doc evidence suggests drift has occurred. |
| Relying on `execa`'s `forceKillAfterDelay` default (5000ms) grace window (AC-17) | low | Confirmed present in the installed `execa@9.6.1`; the exact grace-window value (default vs. explicit override) is a design-level tuning choice, not fixed here. |
| Isolation/hygiene flags excluded from the canonical invocation (Out Of Scope) | low | Every review inherits the operator's full `~/.claude` config and pollutes session history, per `docs/engines/claude-code.md`'s own "Limitations" section — accepted for this story since proposal.md's scope line never committed to them; a natural follow-up, not a regression this story introduces. |
| Two-step `review()` (pre-check + real call) doubles process-spawn count per review | low | Cheap per the spike (`claude --version` is a local, non-network call); no fixture or doc evidence suggests this is measurably slow. |

## Open Questions And Decisions

All four risks this spec was scoped to resolve (`r-isavailable-port-gap`, `r-binary-mocking-seam`, `r-is-error-classification`, `r-total-tokens-computation`) are now firm rules above (AC-5–7, AC-20–21, AC-13, AC-11 respectively) — **none carry forward to design**. Two narrower items remain explicitly open, both already scoped as design/later-story concerns by proposal.md and state.yaml, not spec-blocking:

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| Exact adapter-vs-outer-race timeout precedence (`r-timeout-budget-precedence`) | Determines whether a slow-exiting engine surfaces as `engine-error` or `timeout` at the terminal-state layer | `sddl-design` | open, design-level (not a spec blocker — `d-timeout-ownership-in-scope` already reserved this for design) |
| CLI flag drift re-verification (`r-claude-cli-version-drift`) | Flags verified only against `2.1.226`; a version bump could silently break the invocation | Before/during `sddl-executor` | open, low severity, informational |

## Approval Notes

- Re-verification of proposal.md's fixture claims against the raw bytes of all 6 `fixtures/claude-code/*.json` files found **no factual error** to correct: `.is_error` is confirmed the only reliable success flag (`.subtype` reads `"success"` on both `auth-error.json` and `context-overflow.json`); `timeout-sigterm.json` is confirmed to genuinely lack `.result` (only an `errors` array); `auth-error.json` and `context-overflow.json` both DO carry a string `.result` message, matching the proposal's "present on success and most `is_error` cases" framing exactly (3 of 4 `is_error:true` fixtures have it).
- The `isAvailable()` resolution (option (a), AC-5–7) required no port change and no B/C-level escalation: "before running" is satisfied because the pre-check and the real invocation both happen inside one `review()` call, in order — exactly the reading proposal.md flagged as the open question to settle.
- The `ReviewEngine.contract.ts` suite (`src/adapters/driven/engines/__test__/ReviewEngine.contract.ts`) was read directly: it is fake-agnostic (imports only `vitest` + core port types) and asserts `rejects.toBeInstanceOf(Error)` at line 57 — confirmed, not assumed, before writing AC-23.
- `execa@9.6.1` (`node_modules/execa/package.json`, `node_modules/execa/types/arguments/options.d.ts`) was inspected directly and confirmed to support `timeout`/`killSignal`/`forceKillAfterDelay` — the exact SIGTERM-then-SIGKILL escalation `docs/engines/claude-code.md` documents, available out of the box rather than needing hand-rolled process-management code. This is evidence supporting AC-17's feasibility, not a design decision — the concrete option wiring is `sddl-design`'s job.
- **Orchestrator correction (post-spec-draft verification)**: the Expected Behavior table and AC-11's validation hint originally cited `noisy-output.json`'s `usage` fields as `output_tokens:164`, `cache_read_input_tokens:16246`, `cache_creation_input_tokens:9386`, `totalTokens:166` (`NOT 22794`). Direct re-parse of the fixture (`python3 -c "import json; ..."`) found the real values are `output_tokens:529`, `cache_read_input_tokens:21886`, `cache_creation_input_tokens:3810`, so the correct `totalTokens` is `531`, not `166` — the wrong figure would have shipped as a literal test assertion under AC-11's own validation hint. This was a spec-authoring error, not a proposal.md error (proposal.md never cited these specific numbers) — both cited spots corrected in place before this spec was accepted.
- Recommended next stage: `sddl-design`, to fix internal file/function decomposition, the exact `ClaudeCodeProcessRunner`/`ClaudeCodeProcessResult` field shapes, the three error classes' exact constructors, and the AC-19 timeout-precedence ordering.

## Budget Notes

- Lite artifact, full rigor at spec (per the story's HIGH-severity risk count). One new adapter file plus its contract-test harness, three local error classes, and a barrel-export addition — no new core module, no port change. Length reflects the four risks that needed firm, testable resolution and the byte-level fixture cross-checking each required.
