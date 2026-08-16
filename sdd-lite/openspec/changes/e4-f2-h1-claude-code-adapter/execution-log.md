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

## ST-4 — `__test__/claude-code-adapter.test.ts` (all 27 ACs)

**Status:** completed
**File created:** `src/adapters/driven/engines/claude-code/__test__/claude-code-adapter.test.ts` — 24 tests across `reviewEngineContract(harness, "claude-code")` (3) + 7 AC-specific `describe` blocks: factory defaults (AC-2), invocation shape (AC-3/4), pre-flight gate (AC-5/6/7), envelope parsing/success extraction (AC-8-12), `is_error:true` rejection (AC-13/14/18), execa option wiring (AC-16/17), error translation (AC-23).

**AC-16/17 execa-mock test:** `vi.mock("execa")` at file top; imports `createDefaultRunProcess` directly; asserts `execa` is called with `{timeout:5000, killSignal:"SIGTERM", forceKillAfterDelay:2000, reject:false}` when `timeoutMs>0`, and that those three keys are absent when `timeoutMs=0`.

**`noisy-output.json` totalTokens:** re-derived programmatically from fixture bytes inside the test itself (not hardcoded) — confirmed `531`, matching spec.md's corrected AC-11 figure.

### Blocking finding, resolved mid-stage

`ReviewEngine.contract.ts`'s frozen "propagates the configured usage" test configured a `usage` with only `totalTokens` set — a shape no derivation-based real engine can produce (`extractSuccess`'s approved AC-11 rule always computes `totalTokens = inputTokens + outputTokens` together). This refuted spec.md's AC-22 assumption that the shared suite "passes unmodified," and would identically block the future opencode adapter (#29).

Presented to the user with 3 options (fix the shared test / document a permanent exception / escalate with no recommendation). User chose: **fix the shared contract test** — changed the fixture from a lone `{totalTokens:42}` to a full `{inputTokens:10, outputTokens:32, totalTokens:42}` tuple, preserving the test's original intent (configured usage propagates) while making it achievable by any engine deriving usage from real parsed fields. Recorded as `d-st4-contract-usage-fix` in `state.yaml`.

**Validation after the fix (independently re-run by the orchestrator):**
- `npx vitest run --project adapters src/adapters/driven/engines/claude-code`: `Test Files 1 passed (1)` / `Tests 24 passed (24)`.
- `npm run check`: clean, 0 dependency violations.
- `npm test`: `Test Files 17 passed (17)` / `Tests 250 passed (250)` (226 baseline + 24 new).
- `git status --short`: `ReviewEngine.contract.ts` (modified, the approved exception) + the new `__test__/` directory — no other file touched.

**Orchestrator fix before acceptance:** the test file's own header comment referenced "the one contract scenario this still cannot satisfy" — stale after the fix landed. Corrected in place.

**Scope note:** `ReviewEngine.contract.ts`'s modification means the diff surface exceeds AC-26's originally-stated boundary (`claude-code/**` + `__test__/` + one barrel line) by one shared file — an explicit, user-approved exception, not a silent leak.

## ST-5 — closing gate done; manual AC-24 verification PENDING

**Status:** partial — the automatable half is done; the manual half is explicitly left pending, per user instruction ("documentala y dejala como pendiente").

**Done now (no real authenticated `claude` CLI needed):**
- `npm run check`: clean — `Checked 85 files in 149ms. No fixes applied.` / `tsc --noEmit` clean / `✔ no dependency violations found (60 modules, 113 dependencies cruised)`.
- `npm test`: `Test Files 17 passed (17)` / `Tests 250 passed (250)`.
- `git diff --stat origin/main...HEAD -- src/`: 7 files changed (the 4 new claude-code source files, the new test file, `engines/index.ts`, and `ReviewEngine.contract.ts` — the one explicitly user-approved exception to AC-26's original boundary, per `d-st4-contract-usage-fix`). No other file touched.
- `grep -rn 'from "execa"' src/adapters/driven/engines/claude-code`: exactly one match, `process-runner.ts` — reconfirms AC-25.

**Pending — AC-24 ("successful real review"), not attempted:**

Per spec.md AC-24, this requires invoking `createClaudeCodeAdapter()`'s default `execa`-backed path once against the real, authenticated `claude` CLI over a genuine diff, and recording the exact command, exit code, and observed `VERDICT:` line here.

A `claude` binary exists on this session's `PATH` (`/opt/node22/bin/claude`), but it was **not invoked** — using it here would mean spawning a real, authenticated agentic session as a side effect of a build task, under this session's own auth/session context, which is a materially different and riskier action than a throwaway local script running a headless CLI review. The user was asked whether real CLI access was available for this purpose and instead chose to document this step as pending rather than proceed.

**What's needed to close this:** run the finished adapter once against a real, authenticated `claude` CLI, over a genuine diff in a real worktree, and record here:
- the exact command invoked,
- the exit code,
- the observed `VERDICT:` line (or full relevant excerpt of `.result`).

Until that entry exists, issue #28's second checklist item ("Successful real review") is unverified, and the story cannot reach QA `final` mode / `lifecycle_status: completed` (per `CLAUDE.md`'s audit rules — only final QA may mark a change completed, and issue #28's own AC is unmet without this evidence).
