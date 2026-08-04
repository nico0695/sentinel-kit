# QA Report: e3-f1-h3-context-mode

**Change**: [E3.F1.H3] contextMode option in harness
**Story issue**: #21
**Reviewer**: sddl-qa-review (automated)
**Date**: 2026-08-04

## Validation Gate Results

| Gate | Result |
|---|---|
| `npm run check` (lint + typecheck + architecture guards) | PASSED |
| `npm test` (14 test files, 162 tests) | PASSED |

## Acceptance Criteria Verification

| # | Criterion | Status | Evidence |
|---|---|---|---|
| AC1 | `HarnessSkillsSchema` accepts `contextMode: 'inline'` and `contextMode: 'agent'` | PASS | Contract test `loads harness with contextMode from skills.yaml` (agent); default path covers inline |
| AC2 | `HarnessSkillsSchema` defaults `contextMode` to `'inline'` when omitted | PASS | Contract test `defaults contextMode to inline when skills.yaml omits it`; contract test `loads minimal harness (harness.md only)` also asserts `h.contextMode === 'inline'` |
| AC3 | `HarnessSkillsSchema` rejects invalid `contextMode` values | PASS (implicit) | Zod `z.enum(["inline", "agent"])` inherently rejects any other value. Integration-level coverage via adapter contract test `invalid skills.yaml schema throws HarnessValidationError with fields`. See finding F1 below. |
| AC4 | `Harness.contextMode` is `ContextMode` (required, not optional) | PASS | Interface declares `readonly contextMode: ContextMode` without `?`. TypeScript compilation passes. |
| AC5 | `assemblePrompt` throws `ContextModeNotSupportedError` when `contextMode === 'agent'` | PASS | Unit test `throws ContextModeNotSupportedError when contextMode is agent` |
| AC6 | `assemblePrompt` works unchanged when `contextMode === 'inline'` | PASS | All 11 existing assemblePrompt tests pass; all use `contextMode: 'inline'` via default |
| AC7 | Fs adapter produces `Harness` with `contextMode` populated | PASS | Contract tests: `loads valid harness with all files` (inline default), `loads harness with contextMode from skills.yaml` (agent), `defaults contextMode to inline when skills.yaml omits it`, `loads minimal harness` (no skills.yaml, inline default) |
| AC8 | `ContextModeNotSupportedError` extends `HarnessError` | PASS | Unit test `ContextModeNotSupportedError extends HarnessError` verifies `instanceof`, `.mode`, `.message`, `.name` |

## Architecture Compliance

| Rule | Status | Evidence |
|---|---|---|
| `src/core/**` never imports from `src/adapters/**` or `src/main/**` | PASS | Grep for adapter/main imports in `src/core/review/` returns zero matches |
| Core imports no I/O libraries (whitelist: zod) | PASS | Grep for `node:`, `fs`, `path`, `child_process` imports in `src/core/` returns zero matches |
| Adapter imports only from core ports | PASS | `harness-loader-fs.ts` imports from `core/review/ports/harness-errors.js`, `core/review/ports/harness-loader.js`, `core/review/ports/harness-schemas.js` |
| Ports owned by domain module | PASS | `ContextMode` type and `ContextModeNotSupportedError` live in `src/core/review/ports/` |
| `dependency-cruiser` guards | PASS | `npm run check` includes `depcruise src` and passes |

## Code Quality Review

### Source files reviewed

1. **`harness-schemas.ts`** — Clean. `ContextMode` type is a simple union, `HarnessSkillsSchema` uses `.default("inline")` so parsed output always has the field. `Harness` interface uses required `readonly contextMode: ContextMode`. No issues.

2. **`harness-errors.ts`** — Clean. `ContextModeNotSupportedError` follows the existing pattern (extends `HarnessError`, sets `name`, stores the domain-relevant property `mode`). Error message `Context mode "${mode}" is not yet supported` is explicit, user-friendly, and matches the spec exactly.

3. **`assemble-prompt.ts`** — Clean. Guard is at the top of `assemblePrompt` before any rendering logic. Throws a hard error, not a warning. Consistent with spec FR4.

4. **`index.ts`** — Clean. Exports both `ContextMode` type and `ContextModeNotSupportedError`. All public API surface is exposed.

5. **`harness-loader-fs.ts`** — Clean. Initializes `contextMode` to `"inline"` before the try block, reads from `result.data.contextMode` on success. ENOENT path (no skills.yaml) correctly falls through to the default. Includes `contextMode` in the constructed `Harness` object.

### Test files reviewed

6. **`assemble-prompt.test.ts`** — Two new tests cover AC5 and AC8. `buildInput` helper correctly supports `contextMode` override. Existing tests all implicitly use inline mode via default.

7. **`HarnessLoader.contract.ts`** — Three tests cover adapter behavior: loads agent mode from skills.yaml, defaults to inline when omitted, defaults to inline on minimal harness. Existing "loads valid harness with all files" test also asserts `contextMode === "inline"`.

8. **`load-harnesses.test.ts`** — Harness fixtures updated to include `contextMode: "inline"`. Consistent with interface requirement.

## Findings

No blocking findings. The original F1 (missing explicit schema rejection test) was resolved in a subsequent commit — `assemble-prompt.test.ts` now includes `"HarnessSkillsSchema rejects invalid contextMode"` which calls `HarnessSkillsSchema.safeParse({ skills: [], contextMode: "foo" })` and asserts `success: false`.

## Edge Case Analysis

| Edge case | Handling | Status |
|---|---|---|
| `contextMode` omitted from `skills.yaml` | Zod `.default("inline")` fills it | Covered by contract test |
| `skills.yaml` missing entirely (ENOENT) | Variable initialized to `"inline"` before try block | Covered by contract test (minimal harness) |
| Invalid `contextMode` value in `skills.yaml` | Zod schema rejects, adapter throws `HarnessValidationError` | Covered by schema unit test |
| `contextMode: "agent"` at prompt assembly | `ContextModeNotSupportedError` thrown before rendering | Covered by unit test |
| Backward compatibility (existing harnesses without `contextMode`) | Default fills `"inline"` transparently | Covered by contract tests + all existing tests passing |

## Verdict

**PASS** — All acceptance criteria are met. The implementation is correct, well-structured, and architecturally compliant. One minor finding (F1) regarding an explicit schema rejection test does not block the change. The change is safe to merge.
