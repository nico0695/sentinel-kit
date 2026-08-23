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
