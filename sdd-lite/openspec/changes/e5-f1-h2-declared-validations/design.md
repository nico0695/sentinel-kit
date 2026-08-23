# Design

## Routing Digest

- change_name: e5-f1-h2-declared-validations
- objective: new-feature
- route: continue-lite
- digest_summary: 3 new source files (1 production, 2 test), 6 modified. All of the story's quirky logic — the pinned rejection set, the tokenizer, D6's line window and AC-14's byte-exact element — lives in **pure, synchronous, module-private functions inside one file** (`src/core/run/run-validations.ts`), so the impure surface is a single `for…of` loop with one `await` and one `catch`. `runReview` gains two request fields, one optional dep, a conditional stage-1 guard block, a conditional stage-5 call, one `RunStage` member and two `classifyFailure` classes. No adapter, no port, no `src/main/` change.
- affected_areas_digest: `src/core/run/` (new `run-validations.ts`; `run-errors.ts`, `run-review.ts`, `index.ts` modified), `src/core/repos/ports/config-schemas.ts` (+1 optional field × 2 schemas), `src/core/history/ports/run-metadata-schemas.ts` (+1 array entry + 1 comment clause), 4 test files.
- interfaces_digest: `runValidations(RunValidationsRequest, RunValidationsDeps): Promise<RunValidationsResult>` where `RunValidationsResult = readonly string[]`; `validateValidationDeclarations(readonly string[]): void`; `InvalidValidationDeclarationError extends RunError`. Internal-only: `tokenizeDeclaration`, `windowStream`, `formatOutcomeElement`, `formatSpawnFailureElement`.
- decisions_digest: D-1 one production file, all pure logic module-private; D-2 the pre-flight IS the tokenizer (run twice, defined once) so stage 1 and stage 5 cannot drift; D-3 the rejection set is a literal `Set` + a codepoint range predicate, never a regex; D-4 the stage-1 hoist is one appended, fully conditional block that is a no-op at zero cost when no runner is wired; D-5 windowing happens inside the formatter, once per stream, returning `{ text, elided }` so AC-14's `truncated` flag has a single source; D-6 element assembly is explicit concatenation with a `terminated()` helper, never `parts.join("\n")`; D-7 the `ProcessRunner` fake gets its own `__test__/fake-process-runner.ts`, not a slot in `run-review-fixtures.ts`.

## Summary

- change_name: e5-f1-h2-declared-validations
- objective: new-feature
- route: continue-lite
- design_status: complete, 0 blocking open questions. Every pinned value in spec.md (AC-7's rejection set, AC-14's format, dec-006's three constants, `DEFAULT_VALIDATION_TIMEOUT_MS = 120_000`) is carried verbatim; nothing ratified was reopened. Signatures below were written against the working tree, not against the spec's paraphrase.

## Design Overview

The predecessor's central move was to concentrate every interpretive quirk into one pure function so that none of it needed a child process to test. The same move applies here, but the quirks are **three** and they are all string-shaped: the tokenizer/rejector, the D6 line window, and AC-14's byte-exact element. All three are pure and synchronous. What remains — iterate, `await run()`, catch exactly one class — is short enough to read in one screen.

### D-1 — One production file; the pure functions stay module-private

`src/core/run/run-validations.ts`, a sibling of `run-review.ts` and `process-run-request.ts` (spec E1: `run` gains **no** new port). It holds the use case, `validateValidationDeclarations`, `tokenizeDeclaration`, `windowStream`, `formatOutcomeElement`, `formatSpawnFailureElement` and the four constants. Only the first two plus the error are barrel-exported — exactly the list the spec's In Scope pins for `index.ts`.

*Alternative considered*: split into `validation-declaration.ts` + `validation-evidence.ts` + a thin `run-validations.ts`. Rejected on two grounds: the spec's In Scope table names one file and describes its contents, and AC-18's validation hint pins the new test to "imports only `run-validations.js` and a local fake" — a split would force it to import three modules to reach the pure functions. The pure functions stay reachable in test through `runValidations` + a canned fake `ProcessRunResult`, which is as direct as calling them and does not widen the public surface.

### D-2 — The pre-flight *is* the tokenizer, run twice and defined once

```ts
export function validateValidationDeclarations(declarations: readonly string[]): void {
  for (const entry of declarations) {
    tokenizeDeclaration(entry); // throws InvalidValidationDeclarationError; result discarded
  }
}
```

The hoisted stage-1 check and the per-entry stage-5 split therefore cannot disagree about what "malformed" means, because there is exactly one rule set. `runValidations` calls it **over the whole list first**, before the loop — that is what makes AC-8's "before any spawn" and AC-10's "throws before any `run()` call" true for a bad entry at index 3, not just index 0.

*Alternative considered*: a separate boolean `isValidDeclaration` consulted by both. Rejected — a predicate cannot carry AC-7's "names the offending character and the entry" message, so the message would have to be rebuilt at each call site.

### D-3 — Rejection is a literal set plus a codepoint predicate, never a regex

```ts
const REJECTED_SHELL_CHARS = new Set([
  "|","&",";","<",">","$","`","(",")","{","}","[","]","*","?","!","~","#","\\","'","\"",
]);
function isRejectedChar(ch: string): boolean {
  if (REJECTED_SHELL_CHARS.has(ch)) return true;
  const code = ch.codePointAt(0) ?? 0;
  if (code === 0x09) return false;          // tab: a separator, not a rejection (R2-8)
  return code <= 0x1f || code === 0x7f;
}
```

AC-7 demands a pinned list rather than a heuristic, and names the mutation that must fail (a regex that also rejects `=`). Iteration is `for (const ch of entry)` — codepoint-wise, so a surrogate pair is never split into halves that could each look like a control character.

**Message template, pinned** so the executor does not invent one and so AC-7's "contains both the character and the entry" is literally satisfied even for a control character:

```
Validation declaration "<entry>" contains the character "<ch>" (U+XXXX), which has a meaning in POSIX shell word expansion that sentinel cannot honor (shell: false)
```

Order inside `tokenizeDeclaration`: scan characters first, then split on `/[ \t]+/` after trimming those two characters, then reject a zero-token result (AC-8). That ordering is why `"a\nb"` is a rejected character and not a two-line declaration, and why `"\t"` reaches the zero-token branch.

### D-4 — The stage-1 hoist: one appended block, conditional on stage 5 actually running

Appended **after** every existing stage-1 guard in `executePipeline`, so no existing message or precedence moves:

```ts
const declarations = request.validations ?? [];
const validationsWillRun = deps.processRunner !== undefined && declarations.length > 0;
if (validationsWillRun) {
  if (request.validationTimeoutMs !== undefined) {
    if (!Number.isFinite(request.validationTimeoutMs) || request.validationTimeoutMs <= 0) {
      throw new InvalidRunRequestError("validationTimeoutMs must be a finite number greater than 0");
    }
    if (request.validationTimeoutMs > MAX_TIMEOUT_MS) {
      throw new InvalidRunRequestError(
        `validationTimeoutMs must not exceed ${MAX_TIMEOUT_MS} (Node's setTimeout upper bound)`,
      );
    }
  }
  validateValidationDeclarations(declarations);
}
```

`declarations` is a plain `readonly string[]` (`?? []`), so no aliased-condition narrowing is relied on. When no runner is wired the block evaluates two comparisons and does nothing else — byte-identical behavior per AC-1/R2-3, at zero I/O and zero allocation beyond one empty array. `declarations` is declared once here and **reused** at stage 5, so the two sites cannot see different lists.

Stage 5 then reads:

```ts
let validationOutput: readonly string[] | undefined = request.validationOutput;
/* --- 5. validations (optional; a runtime outcome is evidence, never a fault) --- */
const processRunner = deps.processRunner;
if (processRunner !== undefined && declarations.length > 0) {
  stage = "validations";
  const computed = await runValidations(
    {
      declarations,
      cwd: worktree.path,
      ...(request.validationTimeoutMs !== undefined ? { timeoutMs: request.validationTimeoutMs } : {}),
    },
    { processRunner },
  );
  validationOutput = [...(request.validationOutput ?? []), ...computed];   // AC-16 order
}
```

The local `const processRunner` is what makes `{ processRunner }` typecheck under `exactOptionalPropertyTypes`. Stage 6 substitutes `validationOutput` for `request.validationOutput` in its existing conditional spread — a one-identifier change. When stage 5 is skipped, `stage` is still `"diff"` entering stage 6 and `validationOutput` is still the caller's own reference: today's behavior, unregressed.

### D-5 — Windowing lives inside the formatter and reports what it did

```ts
interface WindowedStream { readonly text: string; readonly elided: boolean; }
function windowStream(raw: string): WindowedStream;
function formatOutcomeElement(entry: string, result: ProcessRunResult): string;
function formatSpawnFailureElement(entry: string, message: string): string;
```

`formatOutcomeElement` calls `windowStream` **once per stream** and computes
`truncated = result.stdoutTruncated || result.stderrTruncated || out.elided || err.elided`.
Because the window is the only producer of `elided` and the formatter is its only consumer, AC-14's flag and AC-15's window compose with no double-processing and no second traversal.

Line semantics, pinned per R2-4:

```ts
const hasTrailingNewline = raw.endsWith("\n");
const body = hasTrailingNewline ? raw.slice(0, -1) : raw;
const lines = body.split("\n");                     // "a\nb\n" -> ["a","b"] = 2 lines
// cut over-long retained lines FIRST (marker is inserted after and is never cut)
// if lines.length > HEAD + TAIL: [...head100, `... [${n} lines elided by sentinel] ...`, ...tail100]
const text = kept.join("\n") + (hasTrailingNewline ? "\n" : "");
```

`\r` is never a separator. A 200-line stream ending in `\n` (201 split segments) is untouched, which is the boundary AC-15 asserts. An empty stream never reaches the window: the formatter substitutes the literal `(empty)` first.

*Alternative considered*: window in `runValidations` and hand pre-windowed strings to a dumb formatter. Rejected — the `elided` flag would then have to be threaded through as two extra parameters purely to reach `truncated`, and the formatter would stop being provable from a single `ProcessRunResult` fixture.

### D-6 — Element assembly is explicit concatenation, not `join("\n")`

R2-5's rule ("a stream body is followed by `\n` iff it does not already end with one") is **not** expressible as a join: `parts.join("\n")` over a body that already ends in `\n` inserts a blank line before the next header. So:

```ts
const terminated = (body: string): string => (body.endsWith("\n") ? body : `${body}\n`);

// normal path
`$ ${entry}\n` +
`exit=${result.exitCode ?? "-"} signal=${result.signal ?? "-"} timedOut=${result.timedOut} truncated=${truncated}\n` +
`--- stdout ---\n` + terminated(out) +
`--- stderr ---\n` + terminated(err)

// spawn path (ProcessSpawnError only)
`$ ${entry}\n` + `spawn-failed\n` + `--- error ---\n` + terminated(error.message)
```

Every element therefore ends with exactly one `\n`, and `assemblePrompt`'s existing `elements.join("\n")` puts one blank line between consecutive elements — deterministic, and the only downstream consequence of the rule. No duration, no timestamp, no absolute path beyond the declaration's own text (AC-21).

### D-7 — The `ProcessRunner` fake gets its own file

`src/core/run/__test__/fake-process-runner.ts` — a call-recording fake with a scripted queue of `ProcessRunResult | (() => never)` outcomes. It cannot live in `run-review-fixtures.ts`: that file imports the adapters' `createFakeEngine`, the review module's `FakeHarnessLoader` and the workspace git fake, and AC-18's hint requires `run-validations.test.ts` to contain "no harness or git fixture". `run-review-fixtures.ts` imports the new fake for its `buildDeps` override surface and keeps returning valid deps with `processRunner` absent (AC-20's untouched-callers guarantee).

The fake's shape (sequential-order proof for AC-2): it records `{ command, args, cwd, timeoutMs }` per call, tracks `inFlight` and throws if a second `run()` starts while one is pending — so a `Promise.all` mutation fails on the fake's own assertion, not on a timing race.

## Affected Areas

| Path | Status | Content | ~Lines |
|---|---|---|---|
| `src/core/run/run-validations.ts` | new | use case + `validateValidationDeclarations` + 3 private pure functions + 4 constants | ~200 |
| `src/core/run/run-errors.ts` | modified | `InvalidValidationDeclarationError extends RunError`, no `cause` | +10 |
| `src/core/run/run-review.ts` | modified | 2 request fields, `deps.processRunner?`, stage-1 block (D-4), stage-5 call, `RunStage` + `"validations"`, 2 `classifyFailure` classes, `validationOutput` local | +45 |
| `src/core/run/index.ts` | modified | `runValidations`, its 3 types, `validateValidationDeclarations`, the new error | +6 |
| `src/core/repos/ports/config-schemas.ts` | modified | `validationTimeoutMs: z.number().optional()` appended to `GlobalConfigSchema` and `RepoEntrySchema`; no `z.default()` | +2 |
| `src/core/history/ports/run-metadata-schemas.ts` | modified | one `RUN_STAGES` entry + one comment clause (AC-19) | +2 |
| `src/core/run/__test__/fake-process-runner.ts` | new | the shared in-memory fake (D-7) | ~70 |
| `src/core/run/__test__/run-validations.test.ts` | new | AC-2..AC-4, AC-6..AC-8, AC-11..AC-16, AC-18, AC-21 | ~330 |
| `src/core/run/__test__/run-review.test.ts` | modified | AC-1, AC-4 rejection, AC-9..AC-13, AC-16, AC-17 through the pipeline | +140 |
| `src/core/run/__test__/run-review-fixtures.ts` | modified | re-export/wire the fake into `buildDeps` overrides | +5 |
| `src/core/repos/__test__/config-schemas.test.ts` | new | AC-5 (R2-6's only legal home) | ~50 |

Zero diff to `src/adapters/**`, `src/main/**`, `src/core/review/**`, `src/core/workspace/**`, `src/core/run/ports/process-runner.ts` and the rest of `repos/` and `history/` — AC-20's closing gate. No new dependency.

## Interfaces, Data, And State

```ts
export interface RunValidationsRequest {
  readonly declarations: readonly string[];
  readonly cwd: string;                 // worktree.path at stage 5 (AC-3)
  readonly timeoutMs?: number;          // DEFAULT_VALIDATION_TIMEOUT_MS when absent (AC-4)
}
export interface RunValidationsDeps { readonly processRunner: ProcessRunner; }
export type RunValidationsResult = readonly string[];   // 1:1 with declarations, always

export async function runValidations(
  request: RunValidationsRequest,
  deps: RunValidationsDeps,
): Promise<RunValidationsResult>;
```

Body, in full:

1. `validateValidationDeclarations(request.declarations)` — whole list, before anything runs.
2. `const timeoutMs = request.timeoutMs ?? DEFAULT_VALIDATION_TIMEOUT_MS`.
3. For each entry in order: `tokenizeDeclaration` → build `ProcessRunRequest { command, args, cwd, timeoutMs }` → `validateProcessRunRequest(req)` (lets `InvalidProcessRequestError` propagate to AC-9's branch) → `await deps.processRunner.run(req)` → push `formatOutcomeElement`.
4. `catch (error: unknown)`: `error instanceof ProcessSpawnError` → push `formatSpawnFailureElement(entry, error.message)` and `continue`; **anything else is rethrown** (R2-1) — that is what keeps `stage: "validations"` reachable and AC-9's branch alive.

`await` inside `for…of` is deliberate (AC-2) and has in-repo precedent (`review/load-harnesses.ts:44`). Constants: `DEFAULT_VALIDATION_TIMEOUT_MS = 120_000`, `VALIDATION_HEAD_LINES = 100`, `VALIDATION_TAIL_LINES = 100`, `VALIDATION_MAX_LINE_CHARS = 2_000` — module-private, not exported (E6 reaches the default only by omitting the field, per downstream constraint 1).

**`validationTimeoutMs` flow**: `config-schemas.ts` (permissive `z.number().optional()`, both levels, no default) → E6's cascade (out of scope) → `RunReviewRequest.validationTimeoutMs` → **stage-1 guard, the only range gate** (`InvalidRunRequestError` → `validation-failed`, `failure.stage: "request"`, no worktree) → `RunValidationsRequest.timeoutMs` → `ProcessRunRequest.timeoutMs`, re-checked per request by `validateProcessRunRequest` for the standalone caller who bypassed stage 1.

**`classifyFailure`**: `InvalidValidationDeclarationError` and `InvalidProcessRequestError` join the existing `validation-failed` disjunction; `ProcessSpawnError` is deliberately absent and gets a comment saying so, because AC-12 guarantees it can never arrive.

**`RunStage`**: `"validations"` inserted between `"diff"` and `"prompt"` in both the union and `RUN_STAGES`, keeping both in pipeline order; `tsc --noEmit` on `_AllRunStagesCovered` is the proof (AC-19).

## Test Strategy And AC Coverage

Two levels only. No adapter contract suite is touched (AC-20), and nothing here needs a child process — the `ProcessRunner` fake makes every runtime outcome (exit 1, spawn failure, timeout, flood) a one-line fixture.

| AC | Level | Where proven | Needs the fake? |
|---|---|---|---|
| AC-1 | core unit | `run-review.test.ts`: three cases (no `validations`, `[]`, no `processRunner`) assert `fake.calls.length === 0` and an unchanged result; plus a diff-wide grep | yes (call counter) |
| AC-2 | core unit | `run-validations.test.ts`: ordered `(command, args)` capture + the fake's `inFlight` overlap assertion | yes |
| AC-3 | core unit | `run-review.test.ts`: every captured `cwd` equals the fake git port's worktree path and differs from `repoPath` | yes |
| AC-4 | core unit | `run-validations.test.ts` (supplied / omitted `timeoutMs`) + `run-review.test.ts` (`0`, `-1`, `2_147_483_648` → `validation-failed`, stage `"request"`, zero worktrees) | yes |
| AC-5 | core unit | `repos/__test__/config-schemas.test.ts` — pre-story fixture, field-present fixture, `RepoEntrySchema.shape.validations` unchanged | no |
| AC-6, AC-7, AC-8 | core unit | `run-validations.test.ts`, table-driven: one rejection case per pinned character, accept cases for `- = . / : , + @ %`, zero-token cases | no (throws before any `run()`) |
| AC-9 | core unit | `run-review.test.ts`: assert `result.state` per injected error class | yes (to inject `InvalidProcessRequestError` via a bad computed request) |
| AC-10 | core unit | `run-review.test.ts` (zero `addWorktree` calls, `cleanup.attempted === false`, and the runner-absent counterpart) + a direct `runValidations` call asserting it throws before call 1 | yes |
| AC-11, AC-12, AC-13 | core unit | `run-review.test.ts`: fake resolving `exitCode: 1` / rejecting `ProcessSpawnError` on entry 1 / resolving `timedOut: true`; each asserts `state === "ok"` and the evidence in `result.prompt`. Plus the `new Error("boom")` case → `engine-error`, `failure.stage === "validations"` | yes |
| AC-14 | core unit | `run-validations.test.ts`: exact-string (`toBe`) assertions on both paths, one body with and one without a trailing `\n`, and `result.length === declarations.length` for a mixed batch | yes |
| AC-15 | core unit | `run-validations.test.ts`: 300-line stdout + 3-line stderr (exact marker, `N = 100`, 201 lines, stderr byte-identical); 250-line and 200-line-with-trailing-newline boundaries; one >2,000-char line | yes |
| AC-16 | core unit | `run-review.test.ts`: assert the exact array reaching `assemblePrompt` via `result.prompt` | yes |
| AC-17 | core unit | `run-review.test.ts` (`<validation-output>` present, `$ ` headers present) + `git diff` on `assemble-prompt.ts` | yes |
| AC-18 | structural | `run-validations.test.ts`'s own import list; barrel export compiles | yes (the local fake) |
| AC-19 | compile-time | `tsc --noEmit` + `git diff --stat` on `run-metadata-schemas.ts` | no |
| AC-20 | gate | `npm run check` + `npm test` + `git diff --stat` at close | no |
| AC-21 | core unit | `run-validations.test.ts`: run twice over identical fakes, `toEqual` on the arrays; strict equality on two `runReview` prompts | yes |

All 21 ACs are provable as specified. AC-1's "no `package.json`/Makefile inspection anywhere in the diff" is the only one whose proof is a manual grep rather than an executable assertion — noted, not a defect: it is a provenance property of the diff, not of the runtime.

## Alternatives And Trade-Offs

| Option | Decision | Why |
|---|---|---|
| Split the pure logic into 2–3 modules | rejected (D-1) | Spec's In Scope names one file; AC-18 pins the test's import list |
| Export the pure functions for direct unit testing | rejected (D-1) | The barrel list is pinned by the spec; a canned `ProcessRunResult` through the fake is equally direct |
| A separate `isValidDeclaration` predicate shared by both check sites | rejected (D-2) | Cannot carry AC-7's message; two message builders would drift |
| Regex-based metacharacter rejection | rejected (D-3) | AC-7 pins a literal list and names the regex mutation that must fail |
| Unconditional stage-1 declaration check | rejected (D-4) | Violates AC-1's byte-identical clause when no runner is wired (R2-3) |
| Window in `runValidations`, dumb formatter | rejected (D-5) | Forces `elided` through two extra params to reach AC-14's `truncated` |
| `parts.join("\n")` for the element | rejected (D-6) | Inserts a blank line before `--- stderr ---` when the body already ends in `\n` (R2-5) |
| Put the `ProcessRunner` fake in `run-review-fixtures.ts` | rejected (D-7) | That file drags in adapters/review/workspace fakes, which AC-18 forbids in the new test |
| Measure and report a per-script duration | rejected upstream (E2/dec-007) | `ProcessRunResult` has no duration field, and a wall clock in the prompt breaks PRD §6.3 |

## Open Technical Questions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| — | — | — | none |

None blocking. Two items settled here rather than deferred: the exact rejection-message template (D-3, pinned so AC-7's "contains the character" holds for control characters too) and the element-assembly rule being concatenation rather than a join (D-6, forced by R2-5).

## Approval Notes

- No ratified decision (`dec-001`..`dec-007`) was reopened; every pinned constant and format is carried verbatim.
- One file appears here that the spec's In Scope table does not name: `src/core/run/__test__/fake-process-runner.ts` (forced by AC-18's import restriction, D-7). It is test-only and inside `src/core/run/`, which AC-20 does not pin.
- Recommended next stage: `sddl-plan`.

## Amendment 1 — minimal allowlisted environment (fix round, PR #72 / cp-pr-review-r1-001-reopen)

Fix round for the CRITICAL re-raised on PR #72: a declared validation with no rejected shell character (`env`, `printenv`) still inherits the full reviewing-process environment today, because `tokenizeDeclaration`/`REJECTED_SHELL_CHARS` (D-3) reject syntax, not command identity, and `run-validations.ts`'s constructed `ProcessRunRequest` (line ~310-315) never sets `env`, so the adapter's existing overlay-on-inherit default (`[E5.F1.H1]` D2) hands the child the same `process.env` sentinel itself runs under. User-ratified mitigation: the declared validation's child process gets an explicit, minimal, non-secret environment instead of the inherited one — nothing more.

This amendment does **not** reopen D-1..D-7 above or any of dec-001..dec-007; it adds one new port field, one new pre-flight rule, one adapter option mapping, and one construction change inside `runValidations`'s existing loop (D-1's "one production file, pure logic module-private" shape is unchanged — the new logic is two lines of impure construction, not a new pure function).

### A-1 — Empirical findings (probed against the installed `execa@9.6.1`, not documentation)

Ran three cases via `node --experimental-strip-types -e '...'` with a real `SENTINEL_PROBE_SECRET` set on the probing process:

1. **`extendEnv: false` + explicit `env: { PATH, HOME }`** → child's `process.env` keys are exactly `["PATH","HOME"]`. `SENTINEL_PROBE_SECRET` is `undefined`. This is the mechanism the mitigation relies on, confirmed working as expected.
2. **`extendEnv: false` + NO `env` key at all** → **the child receives the full parent environment**, `SENTINEL_PROBE_SECRET` included, verbatim, alongside every other secret-shaped variable present on the probing process (`GITHUB_TOKEN`, `GH_TOKEN`, `AWS_SECRET_ACCESS_KEY`, `AWS_ACCESS_KEY_ID`, `ANTHROPIC_BASE_URL`, etc. were all present in the dump). **`extendEnv: false` is a no-op unless `env` is also supplied** — execa's own quirk, not a hypothetical. This is the single most important empirical fact in this amendment: a naive `inheritEnv: false` field with no accompanying guard would look safe in a diff and would not be safe at runtime.
3. **`extendEnv: false` + `env: {}`** → child's `process.env` is genuinely empty (`{}`). Confirms an explicit empty object, not just a present key, is what disables inheritance — so the guard in A-3 below (require `env` to be present, not merely truthy) is the correct shape.

Conclusion: the new field must be **paired with a mandatory pre-flight guard** that refuses to reach the adapter at all when the caller asks to not-inherit but supplies no explicit environment — silently falling back to an "empty env" or, worse, to execa's actual behavior (full inheritance) are both unacceptable; the second one is exactly the vulnerability this amendment closes.

### A-2 — New port field: `ProcessRunRequest.inheritEnv?: boolean`

`src/core/run/ports/process-runner.ts`, on `ProcessRunRequest`, immediately after the existing `env` field:

```ts
/**
 * Whether the child inherits the reviewing process's own environment.
 * `true` or absent (default): unchanged `[E5.F1.H1]` D2 behavior — `env`,
 * when present, overlays the full inherited parent environment. `false`:
 * the child receives ONLY `env` — the parent environment is not visible to
 * it at all. `env` MUST be present when this is `false`
 * (`InvalidProcessRequestError` otherwise, D2-amend below) — execa's own
 * `extendEnv:false` is a no-op without an accompanying `env`, empirically
 * confirmed (design.md Amendment 1, A-1), so this guard is not optional
 * hardening, it is what makes the field safe to expose at all.
 */
readonly inheritEnv?: boolean;
```

Additive, optional, defaults to the existing behavior when omitted — every caller that does not set it (there are currently none besides this story's own tests) is byte-identical, satisfying `[E5.F1.H1]` D2 verbatim: **D2 is not changed, `inheritEnv` is what lets a caller opt out of it.**

### A-3 — Pre-flight guard: `validateProcessRunRequest` (`src/core/run/process-run-request.ts`)

New rule, appended after the existing `maxOutputChars` check:

```ts
if (request.inheritEnv === false && request.env === undefined) {
  throw new InvalidProcessRequestError(
    "env must be provided when inheritEnv is false (execa's extendEnv:false alone still inherits the full parent environment when no env is given)",
  );
}
```

This function is already called from both real call sites — the adapter's `run()` (`process-runner-exec.ts:46`) and `runValidations`'s own per-entry pre-flight (`run-validations.ts:318`, immediately before `deps.processRunner.run`) — so the guard is exercised on every path with zero new call sites. A caller that sets `inheritEnv: false` and `env: {}` (an explicit, deliberately empty object) passes the guard and gets a genuinely empty child environment (A-1 case 3) — that is a legal, if unusual, request; only *absent* `env` is rejected.

*Alternative considered*: silently defaulting to `env: {}` when `inheritEnv:false` and `env` is omitted, instead of throwing. Rejected — a silent substitution hides a caller bug (they meant to pass an allowlist and forgot) behind behavior that happens to be safe today only because of this specific fallback; a thrown, named error is louder and matches the existing house style of `validateProcessRunRequest` (every other rule here throws rather than coerces).

### A-4 — Adapter translation (`src/adapters/driven/exec/process-runner-exec.ts`)

The existing conditional-spread env line:

```ts
...(request.env !== undefined ? { env: request.env } : {}),
```

becomes two conditional spreads, `extendEnv` only ever added when explicitly opting out:

```ts
...(request.inheritEnv === false ? { extendEnv: false } : {}),
...(request.env !== undefined ? { env: request.env } : {}),
```

When `inheritEnv` is `true` or absent, the option bag is byte-identical to today's — `extendEnv` is never mentioned, so execa's own default (`true`) governs, which is `[E5.F1.H1]` D2's overlay behavior, unchanged. When `inheritEnv` is `false`, `validateProcessRunRequest` (A-3) has already guaranteed `request.env` is present, so `extendEnv: false` is always paired with an explicit `env` in the option bag reaching execa — the A-1 case-2 footgun (case where `extendEnv:false` reaches execa alone) is structurally unreachable through this adapter.

### A-5 — `run-validations.ts`'s minimal allowlist

Two new module-private constants plus a two-line change to the per-entry request construction (still inside the existing `for…of` loop, D-1's shape unchanged):

```ts
/**
 * The complete, hardcoded, non-configurable set of environment variables a
 * declared validation's child process receives (PR #72 / R1-001 fix,
 * design.md Amendment 1). Deliberately minimal: PATH so the child can
 * locate its own interpreter/binary at all (npm, node, python, ...) and
 * HOME because most real-world build/test toolchains read it for config
 * or cache directories (npm's cache, git config lookup, venv resolution)
 * and fail or misbehave without it. Everything else the reviewing
 * process's own environment carries — cloud credentials
 * (AWS_SECRET_ACCESS_KEY, AWS_ACCESS_KEY_ID), CI/VCS tokens (GITHUB_TOKEN,
 * GH_TOKEN), and sentinel's own LLM API key — is excluded by construction:
 * this is a strict allowlist, so anything not named here never reaches the
 * child, full stop.
 */
const VALIDATION_ALLOWED_ENV_VAR_NAMES = ["PATH", "HOME"] as const;

function buildValidationEnv(): Readonly<Record<string, string>> {
  const env: Record<string, string> = {};
  for (const name of VALIDATION_ALLOWED_ENV_VAR_NAMES) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  return env;
}
```

computed **once**, before the `for…of` loop (not per entry — the value cannot change mid-run and recomputing would be pure waste), and threaded into the request built for every entry:

```ts
const validationEnv = buildValidationEnv();
// ...inside the loop, added to the existing processRequest literal...
const processRequest: ProcessRunRequest = {
  command,
  args,
  cwd: request.cwd,
  timeoutMs,
  inheritEnv: false,
  env: validationEnv,
};
```

`process.env` is a Node global read, not an import of an I/O library, so `depcruise`'s `core-no-io-libs` rule (which polices import specifiers) does not flag it — the same reasoning already lets `git-cli.ts` read `process.env` in an adapter; here it happens in core because the allowlist *is* domain logic the story owns (D-1's "one production file" already puts every interpretive quirk of this story in `run-validations.ts`), not an adapter concern. It is the one place in `src/core/run` that touches `process.env`, and it is documented as such. This is a deliberate, narrow, justified exception; it does not read any I/O library and does not make the function's *interpretive* logic (tokenizer, window, formatter — still 100% pure) impure — only the already-impure `for…of` body gains one more environment read alongside its existing `await deps.processRunner.run(...)`.

**What is deliberately excluded** (the allowlist makes this automatic, but naming the sharpest examples for the audit trail): `GITHUB_TOKEN` / `GH_TOKEN` (repo write credentials), `AWS_SECRET_ACCESS_KEY` / `AWS_ACCESS_KEY_ID` (cloud credentials), and sentinel's own LLM API key (`ANTHROPIC_API_KEY`-shaped) — all three classes were directly observed present in the A-1 probe's environment dump alongside the marker secret.

*Alternative considered*: a configurable allowlist (repo config gains a `validationEnv: string[]` field). Rejected — the spec explicitly scoped `[E5.F1.H2]` to zero new config surface beyond `validationTimeoutMs` (ST-1, already shipped), and a user-configurable allowlist reopens exactly the kind of public-config-format decision the spec's Out of Scope table already closed for this story; PATH+HOME is sufficient for the MVP's stated toolchains (`npm test`, `npm run check`-shaped commands) and a configurable allowlist is a clean, additive fast-follow if a real toolchain needs more.

### A-6 — New acceptance criterion: AC-22 (for `spec.md`)

> **AC-22**: A declared validation's spawned child process receives exactly the minimal allowlisted environment (`PATH`, `HOME`) and nothing else from the reviewing process's own environment — proven at two levels: (a) a real-child-process adapter test sets a marker environment variable on the *test* process, runs a validation-shaped request through the real `createExecProcessRunner()` with `inheritEnv: false` and an explicit `{ PATH, HOME }` env, and asserts the marker is **absent** from the child's captured `process.env` dump while `PATH` and `HOME` are **present** and match the values passed; (b) a `run-validations.ts` unit test (via the fake) asserts the exact `ProcessRunRequest` constructed for every declared entry carries `inheritEnv: false` and `env` equal to `{ PATH: process.env.PATH, HOME: process.env.HOME }` (whichever of the two is actually defined on the test process), proving the wiring independent of any real child process.

Proof sites: (a) `src/adapters/driven/exec/__test__/process-runner-exec.test.ts` (new case) and the shared `ProcessRunner.contract.ts` (new case, A-7); (b) `src/core/run/__test__/run-validations.test.ts` (new case, extending the existing per-entry request-shape assertions).

### A-7 — Backward compatibility: does `ProcessRunner.contract.ts` need a case?

**Yes — two new cases**, because the guarantee is a promise of the *port*, not an execa implementation detail:

1. `"rejects with InvalidProcessRequestError when inheritEnv is false and env is omitted"` — this is `validateProcessRunRequest`'s own rule (A-3), already exercised by every conforming adapter's `run()` by construction (the existing "malformed request" contract case already establishes that request pre-flight is a contract-suite-level concern, not an exec-only one).
2. `"the child receives none of the calling process's environment beyond an explicitly supplied allowlist when inheritEnv is false"` — spawns `process.execPath` with an inline script dumping `process.env` (matching the contract suite's existing `["-e", ...]` pattern), sets a marker var on the *test* process, passes `inheritEnv: false, env: { PATH: process.env.PATH ?? "" }`, and asserts the marker is absent while `PATH` is present. Any future non-execa `ProcessRunner` implementation must satisfy this or the shared suite fails for it — that is exactly what the contract suite exists to pin.

The execa-specific quirk itself (A-1 case 2: `extendEnv:false` alone still inherits everything) is **not** re-asserted in the contract suite — it is an implementation detail of one adapter, not a port promise, and is instead documented as a regression-guard comment (not a new production behavior) directly above the mapping in `process-runner-exec.ts` (A-4) and covered by the existing "malformed request" pre-flight rejection, which makes the dangerous state unreachable through this adapter regardless of which execa version is installed.

### A-8 — `spec.md` diff (for the plan/executor stage; not edited here)

- **New AC-22** appended after AC-21, exact text per A-6.
- **AC-20's untouched-files list**: remove `src/core/run/ports/process-runner.ts` and `src/adapters/driven/exec/**` from the pinned-untouched set. New complete touched-file list for this fix round (on top of the 11 files ST-1..ST-4 already touched, listed in Affected Areas above):
  - `src/core/run/ports/process-runner.ts` — modified (A-2, new `inheritEnv` field)
  - `src/core/run/process-run-request.ts` — modified (A-3, new pre-flight rule)
  - `src/core/run/__test__/process-run-request.test.ts` — modified (new case for A-3's rule)
  - `src/core/run/run-validations.ts` — modified (A-5, allowlist construction + `inheritEnv: false` in the built request)
  - `src/core/run/__test__/run-validations.test.ts` — modified (AC-22(b))
  - `src/core/run/__test__/fake-process-runner.ts` — modified (`FakeProcessRunnerCall` must additionally capture `env` and `inheritEnv` so AC-22(b) can assert on them; the fake does not otherwise change behavior)
  - `src/adapters/driven/exec/process-runner-exec.ts` — modified (A-4, `extendEnv` mapping)
  - `src/adapters/driven/exec/__test__/process-runner-exec.test.ts` — modified (AC-22(a), plus the A-1 case-2 regression-guard comment's paired test)
  - `src/adapters/driven/exec/__test__/ProcessRunner.contract.ts` — modified (A-7, two new cases)
- Still untouched by this fix round: `src/main/**`, `src/core/review/**`, `src/core/workspace/**`, `src/core/repos/**`, `src/core/history/**`, `src/adapters/driven/exec/classify-execa-result.ts` (result classification is unaffected — only the outbound option bag changes) and its test, `src/adapters/driven/git/**`, both engine seams' own `process-runner.ts` files (confirmed zero other production consumers of `createExecProcessRunner`, orchestrator grep). No new npm dependency.

### A-9 — Blast-radius statement

No file outside the nine listed in A-8 needs to change. The change is purely additive at the port (`inheritEnv?: boolean`, optional, unset = today's behavior) and purely additive at the adapter (a new conditional spread that only ever fires when the new field is explicitly `false`). `[E5.F1.H1]` D2 (`env` overlays the inherited environment by default) is preserved byte-for-byte for every caller that does not set `inheritEnv` — confirmed by A-4's mapping never emitting `extendEnv` unless `inheritEnv === false`, and confirmed by A-1 case 1 showing the opt-out mechanism itself works as intended once paired with the A-3 guard. `createExecProcessRunner` has zero other production consumers (orchestrator-confirmed grep, restated in the checkpoint), so the adapter's option-bag translation change has no blast radius beyond this story's own tests and the two new contract cases.

- Recommended next stage after this amendment: `sddl-plan` (fix stage — one new plan stage covering A-2..A-8, sequenced after the already-merged ST-1..ST-4, with its own targeted validation command and a mutation-testing note for the A-3 guard).
