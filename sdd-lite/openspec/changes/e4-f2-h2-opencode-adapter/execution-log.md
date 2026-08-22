# Execution Log

## ST-1 — `errors.ts` + `envelope.ts` + `permission-config.ts` (pure, no execa)

**Status:** completed
**Files created:**
- `src/adapters/driven/engines/opencode/errors.ts` — `OpenCodeUnavailableError`, `OpenCodeInvocationError`, `OpenCodeReviewError`. Three flat `Error` subclasses, no shared base class, no `cause` field on any (per design.md — no single underlying exception to preserve, unlike H1's `ClaudeCodeInvocationError`).
- `src/adapters/driven/engines/opencode/envelope.ts` — `OpenCodeEvent`/`OpenCodeTextPart`/`OpenCodeFinishPart` interfaces, `parseNdjsonLines` (splits stdout on `\n`, `JSON.parse`s each non-empty line, silently drops failures, never throws — AC-10), `extractOutcome` (AC-15..18 branching: zero events → `OpenCodeInvocationError`; any `type:"error"` event → `OpenCodeReviewError`; concatenated `text` events → `output`; empty output → `OpenCodeReviewError` fallback; else resolve with usage from the LAST `step_finish` event only). Pure, no `execa` import. Imports `ReviewResult`/`ReviewUsage` from `../../../../core/run/index.js`, matching the claude-code adapter's import line.
- `src/adapters/driven/engines/opencode/permission-config.ts` — `OpenCodePermissionConfig`, `DENY_CONFIG` constant, `createDenyConfigFile()` using `node:fs/promises` (`mkdtemp`/`writeFile`/`rm`), `node:os` (`tmpdir`), `node:path` (`join`). `cleanup()` swallows its own rejection internally (`.catch(() => undefined)` on top of `force: true`).

**Fixture verification against real data (not just design.md's paraphrase):** wrote a throwaway `vitest` test (not committed — deleted after use, same convention as H1's throwaway verification scripts) exercising `parseNdjsonLines` + `extractOutcome` against all 6 `fixtures/opencode/*` files directly:
- `valid-verdict.ndjson` → resolves, `totalTokens: 4786` (input 4720 + output 66 — NOT the stream's own `tokens.total: 4965`, which includes `reasoning: 179`).
- `no-verdict.ndjson` → resolves using the LAST of its two `step_finish` events (`inputTokens: 321, outputTokens: 96`), not the first (`4657`/`69`) — confirmed the multi-step rule is load-bearing, not cosmetic.
- `noisy-output.ndjson` → resolves (usage computed, not asserted to a specific figure in the scratch test, just exercised).
- `context-overflow.ndjson` → rejects with `OpenCodeReviewError` containing `"ContextOverflowError"`.
- `timeout-sigterm-partial.ndjson` (one valid `step_start` line, nothing else) → rejects with `OpenCodeReviewError` (empty-output fallback path, AC-17).
- `unknown-model-stdout.txt` → `parseNdjsonLines` returns zero events (confirmed: the raw log dump has zero valid JSON lines); `extractOutcome` rejects with `OpenCodeInvocationError` (AC-15).

All 6 outcomes matched design.md's Expected Behavior table exactly. No implementation bug found; no fixture claim needed correction (unlike H1's ST-1, which found and fixed a stale `totalTokens` figure in its own draft).

**Validation:**
- `npm run check`: `Checked 88 files in 78ms. No fixes applied.` / `tsc --noEmit` clean / `✔ no dependency violations found (64 modules, 118 dependencies cruised)`. (One `biome check --write` pass was needed first — a multi-line union type formatting fix in `envelope.ts`, mechanical, no logic change.)
- `npm test`: `Test Files 17 passed (17)` / `Tests 250 passed (250)` — unchanged from the measured baseline (leaf files, nothing imports them yet).
- `git status --short`: only the three new files under `src/adapters/driven/engines/opencode/` — no other file touched.

**Judgment calls (A-level, disclosed, not escalated):**
- Literal error-message wording (design.md specifies behavior, not exact strings): `OpenCodeInvocationError`'s message includes a pointer to `opencode models`, matching spec.md's non-goal note about the unknown-model/missing-credential ambiguity; `OpenCodeReviewError`'s in-stream-error message is `"<name>: <message>"` when both are present, else just `<name>`.
- `isFinishEvent`/`isTextEvent` match on the event's outer `type` field (`"step_finish"`, `"text"`), which uses an underscore — confirmed directly against the raw fixture bytes this differs from the *inner* `part.type` field (`"step-finish"`, hyphenated). Both are handled: `isFinishEvent` checks both spellings defensively; `textOf`/`tokensOf` read `part` structurally (`"text" in part`, `"tokens" in part`) rather than checking `part.type`, so the hyphen/underscore distinction in `part.type` never needed to be relied on.

**Recommended next stage:** proceed to ST-2 (`process-runner.ts`) on user approval. Not auto-continuing.

---

## ST-2 — `process-runner.ts` (execa seam)

**Status:** completed
**File created:**
- `src/adapters/driven/engines/opencode/process-runner.ts` — `OpenCodeProcessRunOptions` (with `env: Readonly<Record<string,string>>` REQUIRED, the deliberate divergence from `ClaudeCodeProcessRunOptions` design.md calls for), `OpenCodeProcessResult`, `OpenCodeProcessRunner` types, plus `createDefaultRunProcess(binaryPath: string): OpenCodeProcessRunner`. Same factory name and shape as the merged claude-code adapter's `process-runner.ts`, read directly as the template and mirrored file-for-file, extended only with the `env` passthrough (`env` forwarded straight to execa's own `env` option, relying on execa's `extendEnv: true` default to merge onto `process.env` — no manual `...process.env` spread).

Implementation matches design.md's exact snippet: `execa(binaryPath, args, { cwd, env, ...input spread, ...timeout/killSignal:"SIGTERM"/forceKillAfterDelay:2000 spread, reject: false })`, conditional `exitCode`/`signal` spreads (`exactOptionalPropertyTypes`-safe). Zero dependency on `errors.ts`/`envelope.ts`/`permission-config.ts` or `src/core/**` — pure process plumbing, `execa` the only import, confirmed with `grep -n 'from "execa"' process-runner.ts` returning exactly one match.

**Validation:**
- `npm run check`: `Checked 89 files in 173ms. No fixes applied.` / `tsc --noEmit` clean / `✔ no dependency violations found (65 modules, 119 dependencies cruised)`.
- `npm test`: `Test Files 17 passed (17)` / `Tests 250 passed (250)` — unchanged (still a leaf file, `opencode-adapter.ts` doesn't exist yet to import it).
- `git status --short`: only `process-runner.ts` is new (untracked).

**Judgment calls:** none of real weight — design.md's shape and the merged claude-code adapter's template were followed literally; the only addition (`env` passthrough) was explicitly specified by design.md, not a new choice.

**Recommended next stage:** proceed to ST-3 (`opencode-adapter.ts` orchestration + barrel export) on user approval. Not auto-continuing.

---

## ST-3 — `opencode-adapter.ts` (orchestration) + barrel export

**Status:** completed
**Files:**
- `src/adapters/driven/engines/opencode/opencode-adapter.ts` (new) — `OpenCodeAdapterOptions` (`model` required), `createOpenCodeAdapter(options)`, `PREFLIGHT_TIMEOUT_MS = 5_000` module constant, `review()`: `createDenyConfigFile()` → `try { pre-flight → real invocation → parseNdjsonLines → extractOutcome } finally { config.cleanup() }`. `OPENCODE_CONFIG` env object built once (`{ OPENCODE_CONFIG: config.path }`) and passed to BOTH the pre-flight and real `runProcess` calls, satisfying AC-7 by construction (same object reference, not two separately-built env values that could drift).
- `src/adapters/driven/engines/index.ts` (modified) — added `createOpenCodeAdapter`/`OpenCodeAdapterOptions` exports; updated the file's header doc-comment, which still read "The opencode adapter lands in [E4.F2.H2]" — corrected to name both adapters as landed (same class of doc-staleness H1's ST-3 caught and fixed on this same file for its own claude-code line).

First stage with a real cross-file import graph for this story (adapter → `errors.js`/`envelope.js`/`permission-config.js`/`process-runner.js` siblings + `core/run/index.js`). `depcruise` reports 0 violations (66 modules, 126 dependencies cruised), confirming the `adapters-isolated`/`core-no-adapters` guards hold.

**End-to-end smoke verification (throwaway `vitest` test, not committed — deleted after use):**
- Full resolve path: `createOpenCodeAdapter({ model, runProcess: stub })`, stub replays `--version` success then `valid-verdict.ndjson` → resolves with `usage.totalTokens: 4786`; asserted both calls (pre-flight and real) recorded the SAME `env.OPENCODE_CONFIG` value (proves the deny-config is shared correctly, not rebuilt inconsistently).
- Pre-flight failure: `--version` stub returns `exitCode: 1` → `review()` rejects, and the real-invocation branch of the stub was never reached (asserted via a flag) — confirms `OpenCodeUnavailableError` short-circuits correctly.
- In-stream error: real invocation replays `context-overflow.ndjson` → rejects with a message containing `"ContextOverflowError"` — confirms `extractOutcome`'s rejection propagates through `review()` uncaught by the `finally`/cleanup wrapping.

All three outcomes matched design.md's pseudocode exactly. No implementation bug found.

**Validation:**
- `npm run check`: one mechanical `biome check --write` import-order fix needed first (no logic change), then `Checked 90 files in 117ms. No fixes applied.` / `tsc --noEmit` clean / `✔ no dependency violations found (66 modules, 126 dependencies cruised)`.
- `npm test`: `Test Files 17 passed (17)` / `Tests 250 passed (250)` — unchanged (still unimported by any committed test file — the contract test lands in ST-4).
- `git status --short` / `git diff --stat`: exactly the two expected files touched (`index.ts` modified, `opencode-adapter.ts` new) — `src/adapters/driven/engines/index.ts | 8 +++++---`.

**Judgment calls:** none of real weight — design.md's pseudocode was implemented literally, including building the `env` object once and reusing it for both calls (an implicit but load-bearing detail for AC-7's "both invocations carry the SAME config path" reading).

**QA review recommendation:** per the executor's QA Handoff Rules, this is the first stage with a non-trivial blast radius (real cross-module import graph, the story's core orchestration logic). Flagging `sddl-qa-review` as worth running before ST-4 writes the full test suite — a structured review now (stage mode) would catch orchestration-level issues before ~24 ACs' worth of tests get written against them. Not blocking; deferring to the user's call on timing (now vs. after ST-4's automated suite locks the same logic down anyway).

**Recommended next stage:** ST-4 (test suite) on user approval, optionally preceded by `sddl-qa-review` in stage mode. Not auto-continuing.

---

## Stage QA — ST-3 (stage mode)

**Status:** completed, verdict **pass**
**Report:** `qa-report.md`

Independent re-verification of ST-3's `opencode-adapter.ts`, targeted at what the deleted throwaway smoke test could not exercise: `config.cleanup()` awaited on every exit path (all four throw points plus resolve, via the single outer `try/finally`), the `env` object built once and shared by reference between both `runProcess` calls (not rebuilt), `PREFLIGHT_TIMEOUT_MS` vs `request.timeoutMs` used in the correct calls, diff scope clean (`git diff --stat` matches exactly), structural parity with the merged claude-code adapter confirmed. One low-severity, non-blocking observation: `createDenyConfigFile()`'s own creation-failure path sits outside `review()`'s `try/finally` and would surface as an untyped Node `fs` Error rather than one of the three typed classes — acceptable per AC-23 (`instanceof Error` still holds), flagged for ST-4 to consciously test or decline.

No medium/high findings. Does not close the change (stage mode).

---

## ST-4 — `__test__/opencode-adapter.test.ts` (all 24 ACs)

**Status:** completed
**File created:** `src/adapters/driven/engines/opencode/__test__/opencode-adapter.test.ts` — 25 tests across `reviewEngineContract(harness, "opencode")` (3) + 8 `describe` blocks: factory options (AC-2), invocation shape (AC-3/4), pre-flight gate (AC-5/6), OPENCODE_CONFIG lifecycle (AC-7/8/9, 5 tests), NDJSON parsing/outcome extraction (AC-10..18, 7 tests), execa option wiring (2 tests), error translation (AC-23).

**Contract suite required NO modification** — unlike H1's ST-4, which needed an approved exception to `ReviewEngine.contract.ts`'s "propagates the configured usage" fixture. That fixture was already fixed by H1 to use a full `{inputTokens, outputTokens, totalTokens}` tuple, which this derivation-based adapter satisfies unmodified. Confirmed by reading the shared file first, not assumed.

**execa-mock test (timeout precedence):** `vi.mock("execa")` at file top; imports `createDefaultRunProcess` directly; asserts `execa` is called with `{timeout:5000, killSignal:"SIGTERM", forceKillAfterDelay:2000, reject:false, env:{...}}` when `timeoutMs>0`, and that the first three keys are absent (but `env`/`reject` still present) when `timeoutMs=0`.

**OPENCODE_CONFIG lifecycle tests:** content correctness (temp file read back mid-flight via the stub, compared byte-exact to the deny-permission JSON), same config path on both pre-flight and real calls (AC-7), two concurrent `review()` calls get distinct paths (AC-8), cleanup directory verified gone (via `existsSync`) after both a resolving and a rejecting `review()` (AC-9).

**ST-3 QA note (`createDenyConfigFile()`'s own creation-failure path) — DECLINED, not tested.** Recorded rationale directly in the test file: simulating it would require `vi.mock`/`vi.resetModules` scoped to `permission-config.js` for a single test, but `vi.mock` calls are hoisted file-wide in Vitest, not block-scoped — doing so would risk destabilizing every other test in this file that relies on the real module. The behavior is already covered by contract (any raw `Error` still satisfies `instanceof Error`, AC-23) without a dedicated test. Documented in the test file itself, not silently dropped.

**Fixture re-verification (`fixtures/opencode/no-verdict.ndjson`):** independently re-derived (a from-scratch NDJSON line-parse inside the test, not a call into production `envelope.ts`) — confirms the fixture's LAST `step_finish` event carries `{input:321, output:96}`, distinct from the first (`{input:4657, output:69}`). One test-authoring correction made before acceptance: the first draft asserted `toEqual({input:321, output:96})` against the real token object, which also legitimately carries `reasoning`/`cache`/`total` fields — corrected to `toMatchObject` (structural match only), since the extra fields are real fixture data, not a bug.

**Validation:**
- `npx vitest run --project adapters src/adapters/driven/engines/opencode`: `Test Files 1 passed (1)` / `Tests 25 passed (25)` (after the `toEqual`→`toMatchObject` fix above; first run caught the one assertion issue immediately).
- `npm run check`: one mechanical `biome check --write` formatting fix needed first (line-wrapping only, no logic change), then `Checked 91 files in 90ms. No fixes applied.` / `tsc --noEmit` clean (confirms the `@ts-expect-error` directive for AC-2's required `model` compiles as expected — a stale directive with no actual error would itself fail `tsc --noEmit`) / `✔ no dependency violations found (66 modules, 126 dependencies cruised)`.
- `npm test`: `Test Files 18 passed (18)` / `Tests 275 passed (275)` (250 baseline + 25 new, exact — not assumed).
- `git status --short`: only the new `__test__/` directory — `ReviewEngine.contract.ts` untouched, no other file touched.

**Judgment calls:**
- Declined a dedicated test for `createDenyConfigFile()`'s own failure path (see above) — documented in-file, not silently skipped.
- `binaryPath` default ("opencode") proven indirectly (adapter still resolves without overriding it), same H1 precedent — not asserted via the execa mock, since that would require threading the factory's internal default through an extra code path not otherwise needed by any AC.

**Recommended next stage:** ST-5 (manual AC-24 verification run + full closing gate) on user approval. Not auto-continuing.

---

## 4R code review — full-4r sweep of `e9ee543`

**Status:** completed, verdict **fail** (1 blocking finding)
**Ledger:** `review-ledger.md`

Tier `full-4r` on two independent triggers (1062 changed lines; permissions surface). Four parallel read-only lens workers + one refuter pass. One CRITICAL blocking finding (**R1-001**), one CRITICAL **refuted** (R1-002, worktree config precedence — refuted on attribution, since the merged claude-code sibling passes no `env` at all and is strictly more exposed, and on threat model, since PRD §60 already executes reviewed-branch scripts by design), and 11 `info` findings.

R1-001 was raised independently by the `risk` and `resilience` lenses and **reproduced directly by the orchestrator**, which reclassified it from `inferential` to `deterministic` and therefore excluded it from refutation. The `reliability` lens recorded it only as an observation, arguing `runEngineWithTimeout` wins the race — that mitigation covers the adapter's-own-timeout sub-case only, not an external kill or a non-zero exit, both of which the reproduction exercised with no timer involved.

Routed to the user as `review_gate` (`cp-review-gate-r1-001`) rather than a direct fix, because closing it contradicts approved AC-18. **User chose to amend** (`dec-003`); spec.md, design.md and plan.md were amended accordingly and ST-6 was appended with ST-5 re-sequenced to depend on it.

---

## ST-6 — Fix stage (review-driven, Amendment 1)

**Status:** completed
**Approval:** `cp-st6-approval` (user: "ok avanza")

**Files changed (4 — exactly the approved scope; `process-runner.ts` and `engines/index.ts` deliberately untouched):**

| File | Ledger id | Change |
|---|---|---|
| `opencode-adapter.ts` | **R1-001** | New private `assertCleanExit(result)` + call site after `extractOutcome`. Checks `timedOut` → `signal` → `exitCode !== 0`, in that normative order, throwing `OpenCodeReviewError`. Header doc-comment updated to AC-25 and the `review()` walkthrough gained step 5 for the gate. |
| `envelope.ts` | **R2-001** | `if (errorEvent?.error !== undefined)` → `if (errorEvent !== undefined)`, so an `error` event always rejects per AC-16's actual wording; new `buildErrorEventMessage` helper degrades gracefully when `.error` is absent or renamed. `extractOutcome`'s doc-comment corrected and given an explicit note that process status is NOT its concern (AC-25 lives in the adapter). |
| `permission-config.ts` | **R4-002** | `writeFile` wrapped so a failure removes the just-created `mkdtemp` directory before rethrowing. External contract (`{path, cleanup}`) unchanged. |
| `__test__/opencode-adapter.test.ts` | R1-001, R2-001, R3-002, R3-003, R4-002 | 9 new tests (see below). |

**New tests (9):** 5 for AC-25's process-status gate (SIGTERM-killed rejects; signal named rather than `code undefined`; non-zero exit rejects; clean exit-0 still resolves; **AC-16's `ContextOverflowError` diagnostic still wins over the generic status message**, proving the ordering is normative and not incidental), 1 for R2-001 (payload-less `error` event rejects), 1 for R4-002 (no temp-directory leak on write failure), 1 for R3-002 (exact stream-order concatenation), 1 for R3-003 (per-invocation timeout budgets).

### Mutation re-verification (mandatory exit condition, all three PASSED)

A test that does not catch its own mutation is not a fix. Each mutation was applied, the suite run, and the mutation reverted:

| # | Mutation | Before ST-6 | After ST-6 |
|---|---|---|---|
| a | `envelope.ts`: `...map(textOf).reverse().join("")` | survived — 275/275 green | **FAILS** — `concatenates ALL text events in stream order` ✗ (1 failed / 33 passed) |
| b | `opencode-adapter.ts`: swap `PREFLIGHT_TIMEOUT_MS` ↔ `request.timeoutMs` | survived — 275/275 green | **FAILS** — `gives the pre-flight the fixed 5s budget…` ✗ (1 failed / 33 passed) |
| c | `opencode-adapter.ts`: comment out `assertCleanExit(result)` | n/a (gate did not exist) | **FAILS** — 3 AC-25 tests ✗ (3 failed / 31 passed) |

### Self-caught defect during this stage

The first draft of the R4-002 test set `TMPDIR` to a regular file, which makes **`mkdtemp` fail, not `writeFile`** — so it proved only that the function rejects, never exercising the new try/catch. That is a vanity test of exactly the kind the 4R review itself flagged elsewhere. Rewritten to use `vi.doMock` (block-scoped, unlike the file-wide hoisted `vi.mock` that ST-4 correctly declined) with a real `mkdtemp` and a failing `writeFile`, asserting the created directory is gone afterward. Verified non-vacuous by reverting the `permission-config.ts` fix and confirming the test then fails.

**R1-001 direct re-verification:** the review's own reproduction (`{stdout: <valid-verdict bytes>, signal:"SIGTERM", timedOut:true}`) now **rejects** with `OpenCodeReviewError` where it previously resolved with a truncated review carrying `VERDICT: approve`.

**Validation:**
- `npx vitest run --project adapters src/adapters/driven/engines/opencode`: `34 passed (34)` (25 pre-existing + 9 new).
- `npm run check`: two mechanical `biome --write` passes (line wrapping, then unused imports left over from the rewritten test), then `Checked 91 files`, `tsc --noEmit` clean, `✔ no dependency violations found (66 modules, 126 dependencies cruised)`.
- `npm test`: **`Tests 284 passed (284)`**, 18 files — 275 baseline + 9 new, counted, not assumed.
- `git diff --stat`: exactly the 4 in-scope files (+284/−15). `process-runner.ts` and `engines/index.ts` untouched, as required.

**Ledger status after ST-6:** R1-001, R2-001, R3-002, R3-003, R4-002 → `fixed`, pending a scoped re-review to move them to `verified`. The remaining 7 `info` findings were deliberately NOT touched (out of ST-6's approved scope).

**Recommended next stage:** a scoped re-review of the ST-6 fix delta against the ledger (protocol: re-review sees only the frozen ledger plus the immutable fix delta), then ST-5. Not auto-continuing.

---

## Scoped re-review (round 2) — ST-6 fix delta

**Status:** completed, verdict **pass_with_warnings** (`review-ledger.md`)

Independently re-verified all 5 findings closed by ST-6 against the immutable fix delta (`e9ee543..047116b`) — mechanism read directly in each source file, every new/changed test confirmed non-vacuous by reverting its fix and observing the test fail, all 3 original mutations plus 1 new one (reordering `assertCleanExit` before `extractOutcome`, testing the ordering claim directly) re-run independently and all 4 fail. No regression found. `open_severe_findings: 0`. Full account in `review-ledger.md`'s "Scoped Re-Review" section.

**Recommended next stage:** ST-5. Not auto-continuing.

---

## ST-5 — Manual AC-24 verification + closing gate

**Status:** partial — closing gate green; the manual half is EXPLICITLY left pending, per user decision.

**User decision (2026-08-16):** proceed to close the story without running AC-24's manual verification against a real, authenticated `opencode` CLI. Same category of deliberate, disclosed gap as `[E4.F2.H1]`'s own AC-24 (`e4-f2-h1-claude-code-adapter/execution-log.md`'s ST-5, still pending as of this entry — see `docs/todo/E4/manual-verification.md` items 1 and 2). Not silently marked satisfied.

**Closing gate (everything AC-24 does not require):**
- `npm run check`: `Checked 91 files in 181ms. No fixes applied.` / `tsc --noEmit` clean / `✔ no dependency violations found (66 modules, 126 dependencies cruised)`.
- `npm test`: `Test Files 18 passed (18)` / `Tests 284 passed (284)`.
- `git diff --stat aa664bb...HEAD -- src/` (full story diff vs. the pre-story `main` merge-base): exactly 7 files — `errors.ts`, `envelope.ts`, `permission-config.ts`, `process-runner.ts`, `opencode-adapter.ts`, `__test__/opencode-adapter.test.ts` (all new), `engines/index.ts` (modified, barrel export). Matches plan.md's approved scope; `ReviewEngine.contract.ts` untouched (unlike H1, no exception needed).
- `grep -rn 'from "execa"' src/adapters/driven/engines/opencode`: exactly one match, `process-runner.ts` — confirms `execa` is imported nowhere else (AC-21-equivalent).

**What AC-24 still needs, unresolved:** invoke `createOpenCodeAdapter({ model })`'s default `execa`-backed path once against the real, authenticated `opencode` CLI over a genuine diff; record the exact command, exit code, and observed `VERDICT:` line here. Steps are in `docs/todo/E4/manual-verification.md` item 2. Until that entry exists, this story's AC-24 stays open — recorded honestly, not glossed over.

**Story-level status:** all 25 automatable ACs (spec.md's 24 original + AC-25 from Amendment 1, minus AC-24 itself which is inherently manual) are satisfied and independently verified across ST-1 through ST-6 and the two review rounds. The 4R review's single blocking finding is fixed and verified. 7 non-blocking `info` findings remain as optional follow-up (see `review-ledger.md`), not required for closure. AC-24 is the sole open item, tracked in `docs/todo/E4/manual-verification.md`, not this story's `state.yaml` `next_action`.
