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
