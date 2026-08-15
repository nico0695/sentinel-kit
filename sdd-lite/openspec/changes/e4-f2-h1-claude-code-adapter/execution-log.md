# Execution Log

## ST-1 — `errors.ts` + `envelope.ts` (pure, no execa)

**Status:** completed
**Files created:**
- `src/adapters/driven/engines/claude-code/errors.ts` — `ClaudeCodeUnavailableError`, `ClaudeCodeInvocationError` (optional `cause`), `ClaudeCodeReviewError`. Three flat `Error` subclasses, no shared base class, per design.md.
- `src/adapters/driven/engines/claude-code/envelope.ts` — `ClaudeCodeEnvelope` interface, `parseEnvelope`, `extractSuccess`, `buildReviewErrorMessage`. Pure JSON-envelope parsing, no `execa` import. Imports `ReviewResult`/`ReviewUsage` from `../../../../core/run/index.js`, matching `fake-engine.ts`'s import line exactly.

**Fixture re-verification (`fixtures/claude-code/noisy-output.json`):** `usage.output_tokens: 529`, `cache_read_input_tokens: 21886`, `cache_creation_input_tokens: 3810` — confirmed directly, `envelope.ts` never names either cache field.

**Validation (independently re-run by the orchestrator, not just executor-reported):**
- `npm run check`: `Checked 82 files in 86ms. No fixes applied.` / `tsc --noEmit` clean / `✔ no dependency violations found (58 modules, 106 dependencies cruised)`.
- `npm test`: `Test Files 16 passed (16)` / `Tests 226 passed (226)` — unchanged from the measured baseline (leaf files, nothing imports them yet).
- `git status --short`: only `src/adapters/driven/engines/claude-code/` is new — no other file touched.

**Judgment calls (A-level, disclosed, not escalated):**
- Literal wording of error messages (design.md specifies behavior, not exact strings) — kept short, English, prefixed `claude-code:` for consistency with the adapter's own error style.
- `buildReviewErrorMessage` treats an empty `.result` string as "absent" (falls through to the exit-code/signal fallback) — a reading of design.md's "`.result` when present," doesn't affect any ST-1 fixture.

---

## ST-2 — `process-runner.ts` (execa seam)

**Status:** completed
**File created:**
- `src/adapters/driven/engines/claude-code/process-runner.ts` — `ClaudeCodeProcessRunOptions`, `ClaudeCodeProcessRunner`, `ClaudeCodeProcessResult` types, plus `createDefaultRunProcess(binaryPath: string): ClaudeCodeProcessRunner`. Factory name follows `git-cli.ts`'s `createGitCliAdapter` (`create<Thing>`) convention, scoped to this narrower seam — per plan.md's own note that this naming choice is an A-level executor decision, not a new one to escalate.

Implementation matches design.md's exact snippet: `execa(binaryPath, args, { cwd, ...input spread, ...timeout/killSignal:"SIGTERM"/forceKillAfterDelay:2000 spread, reject: false })`, conditional `exitCode`/`signal` spreads (`exactOptionalPropertyTypes`-safe). Zero dependency on `errors.ts`/`envelope.ts` or `src/core/**` — pure process plumbing, `execa` the only import (syntax matches `git-cli.ts`'s own `import { execa } from "execa"` usage).

**Validation (independently re-run by the orchestrator):**
- `npm run check`: `Checked 83 files in 75ms. No fixes applied.` / `tsc --noEmit` clean / `✔ no dependency violations found (59 modules, 107 dependencies cruised)`.
- `npm test`: `Test Files 16 passed (16)` / `Tests 226 passed (226)` — unchanged (still a leaf file, `claude-code-adapter.ts` doesn't exist yet to import it).
- `git status --short`: only `process-runner.ts` is new.

**Judgment calls:** none of real weight. Factory name (`createDefaultRunProcess`) was the one open naming choice design.md left; consistent with the repo's `create<Thing>` convention.

## ST-3 — pending (not yet started)

## ST-3 — pending (not yet started)

## ST-4 — pending (not yet started)

## ST-5 — pending (not yet started, includes the manual AC-24 verification run)
