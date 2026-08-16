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
