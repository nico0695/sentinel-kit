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

## ST-3 — `claude-code-adapter.ts` (orchestration) + barrel export

**Status:** completed
**Files:**
- `src/adapters/driven/engines/claude-code/claude-code-adapter.ts` (new) — `ClaudeCodeAdapterOptions`, `createClaudeCodeAdapter(options?)`, the five-step `review()` body: pre-flight `--version` check (AC-5/6/15, `PREFLIGHT_TIMEOUT_MS = 5_000` module constant) → real invocation (AC-3/4/16/17) → `parseEnvelope` (AC-8/14) → `is_error` branch → `ClaudeCodeReviewError` (AC-13/18) or `extractSuccess` (AC-9-12).
- `src/adapters/driven/engines/index.ts` (modified) — added `createClaudeCodeAdapter`/`ClaudeCodeAdapterOptions` exports (Biome's `organizeImports` alphabetized them ahead of `FakeEngine`'s, content unchanged).

First stage with a real cross-file import graph (adapter → `errors.js`/`envelope.js`/`process-runner.js` siblings + `core/run/index.js`). `depcruise` reports 0 violations (60 modules, 113 dependencies), confirming the `adapters-isolated`/`core-no-adapters` guards hold.

**Orchestrator fix before acceptance:** `engines/index.ts`'s header doc-comment still read "Public API today: the scripted `FakeEngine`..." after this same stage added `createClaudeCodeAdapter` to the barrel — stale as of this commit. Corrected to name both the landed claude-code adapter and the not-yet-built opencode adapter (#29). Same class of doc-staleness GitHub Copilot flagged post-hoc on H1/H2's PRs — caught here before any PR this time.

**Validation (independently re-run by the orchestrator):**
- `npm run check`: `Checked 84 files in 84ms. No fixes applied.` / `tsc --noEmit` clean / `✔ no dependency violations found (60 modules, 113 dependencies cruised)`.
- `npm test`: `Test Files 16 passed (16)` / `Tests 226 passed (226)` — unchanged (no test file yet — ST-4 writes it).
- `git diff --stat` / `git status --short`: exactly the two expected files touched (one new, one modified).

**Judgment calls:** none of real weight — design.md's pseudocode was implemented literally.

## ST-4 — pending (not yet started)

## ST-5 — pending (not yet started, includes the manual AC-24 verification run)
