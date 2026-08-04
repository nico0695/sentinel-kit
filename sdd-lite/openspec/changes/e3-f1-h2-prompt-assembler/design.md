# Design

## Routing Digest

- change_name: e3-f1-h2-prompt-assembler
- objective: new-feature
- route: continue-lite
- digest_summary: Pure function with inline section renderers; each XML section is a private helper returning `string | null`, joined by the public entry point.
- affected_areas_digest: `src/core/review/assemble-prompt.ts` (new), `src/core/review/index.ts` (re-export), `src/core/review/__test__/assemble-prompt.test.ts` (new)
- interfaces_digest: One new type `AssemblePromptInput`, one new function `assemblePrompt`. Consumes existing `ResolvedHarness` and `ReviewDiff`.

## Summary

- change_name: e3-f1-h2-prompt-assembler
- objective: new-feature
- route: continue-lite
- design_status: complete

## Design Overview

The implementation is a single file `src/core/review/assemble-prompt.ts` containing:

1. **`AssemblePromptInput`** -- exported readonly interface with three fields: `resolvedHarness`, `diff`, and optional `validationOutput`.
2. **`assemblePrompt`** -- exported public function. Calls five private section renderers in fixed order, filters out `null` returns (omitted sections), and joins the remaining strings with `\n\n`.
3. **Five private renderers** -- module-scoped functions, not exported:
   - `renderInstructions(harness)` -- always emits `<instructions>` tag.
   - `renderSkills(skills)` -- always emits `<skills>` tag (empty body when array is empty). Each skill wrapped in `<skill name="...">`.
   - `renderOutputContract(contract)` -- returns `null` when `outputContract` is `undefined`; otherwise emits `<output-contract>` tag.
   - `renderDiff(diff)` -- always emits `<diff>` tag with `totalLines`, `estimatedTokens`, `truncated` as attributes. Warnings as `<warning>` sub-tags before `<file>` entries. Null-content files get `[content not available]` marker. Truncated entries get a `truncated="true"` attribute.
   - `renderValidationOutput(lines)` -- returns `null` when `undefined` or empty array; otherwise emits `<validation-output>` with one line per string.

No classes, no state, no I/O. The function is a pure transformation.

## Affected Areas

| Path Or Module | Planned Change | Risk |
|---|---|---|
| `src/core/review/assemble-prompt.ts` | New file: function + input type + private renderers | low -- new file, no existing code to break |
| `src/core/review/index.ts` | Add re-exports for `assemblePrompt` and `AssemblePromptInput` | low -- append-only |
| `src/core/review/__test__/assemble-prompt.test.ts` | New file: snapshot + unit tests | low -- new file |
| `src/core/workspace/index.ts` | None -- already exports `ReviewDiff`, `DiffFileEntry`, `DiffWarning`, `DiffTruncatedWarning` | none |

## Interfaces, Data, And State

### New type

```typescript
// src/core/review/assemble-prompt.ts
import type { ReviewDiff } from "../workspace/index.js";
import type { ResolvedHarness } from "./ports/harness-schemas.js";

export interface AssemblePromptInput {
  readonly resolvedHarness: ResolvedHarness;
  readonly diff: ReviewDiff;
  readonly validationOutput?: readonly string[];
}
```

`ReviewDiff` is imported through the workspace module's public index (`../workspace/index.js`), satisfying AC-12 and the cross-module import rule. `ResolvedHarness` is local to the review module and imported from its own ports file.

### Function signature

```typescript
export function assemblePrompt(input: AssemblePromptInput): string
```

### Renderer signatures (private, not exported)

```typescript
function renderInstructions(instructions: string): string
function renderSkills(skills: readonly Skill[]): string
function renderOutputContract(contract: string | undefined): string | null
function renderDiff(diff: ReviewDiff): string
function renderValidationOutput(lines: readonly string[] | undefined): string | null
```

### Join logic

```typescript
const sections = [
  renderInstructions(input.resolvedHarness.harness.instructions),
  renderSkills(input.resolvedHarness.skills),
  renderOutputContract(input.resolvedHarness.harness.outputContract),
  renderDiff(input.diff),
  renderValidationOutput(input.validationOutput),
];
return sections.filter((s): s is string => s !== null).join("\n\n");
```

Sections separated by double newline. No trailing newline after the last section (deterministic).

### Diff tag attributes

The `<diff>` opening tag renders metadata as attributes:

```
<diff totalLines="123" estimatedTokens="456" truncated="false">
```

### File entry rendering

```
<file path="src/foo.ts" additions="10" deletions="3">
...unified diff content...
</file>
```

When truncated: `<file path="src/foo.ts" additions="10" deletions="3" truncated="true">`

When content is null: body is `[content not available]`

### Warning rendering

```
<warning>Diff truncated: kept 500 of 1200 lines (42% of 5 files truncated)</warning>
```

Uses the `message` field from `DiffTruncatedWarning`. Warnings appear inside `<diff>` before any `<file>` entries.

## Test Strategy

### Fixture builder

A `buildInput` helper in the test file constructs `AssemblePromptInput` with sensible defaults, allowing per-test overrides via partial arguments. This avoids boilerplate and keeps fixtures readable.

### Test cases (mapped to ACs)

| Test | Validates | Type |
|---|---|---|
| Full input snapshot | AC-1, AC-2, AC-3 | snapshot |
| Call twice, compare output | AC-1 | assertion |
| No outputContract | AC-4 | snapshot |
| No validationOutput | AC-4 | snapshot |
| Neither outputContract nor validationOutput | AC-4 | snapshot |
| Empty validationOutput array | AC-9 | assertion (no tag present) |
| Empty skills array | AC-5 | snapshot |
| Multiple skills in order | AC-5 | assertion (indexOf ordering) |
| Multi-file diff in order | AC-6 | snapshot |
| Null-content file entry | AC-7 | assertion (marker present) |
| Diff with DiffTruncatedWarning | AC-8 | assertion (warning before files) |

AC-10 is validated by `npm run check` passing with the new exports. AC-11 and AC-12 are validated by dependency-cruiser rules.

### Snapshot management

Vitest inline snapshots are preferred over external `.snap` files for this function since the output is a single string. This keeps the expected output visible in the test file and avoids snapshot file management overhead.

## Alternatives And Trade-Offs

| Option | Decision | Why |
|---|---|---|
| Separate file per renderer vs. inline private functions | Inline private functions | Five small functions (~5-10 lines each) do not justify separate files. The total file stays under 120 lines. |
| External snapshot files vs. inline snapshots | Inline snapshots | Output is a single string per test; inline keeps expected values visible in the test. |
| Template literal approach vs. string concatenation | Template literals | Cleaner for multi-line XML tags. Each renderer returns a template literal string. |
| `\n` vs. `\n\n` between sections | `\n\n` (double newline) | Visual separation between sections improves LLM prompt readability. Within a section, single `\n` between sub-elements. |

## Open Technical Questions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| (none) | -- | -- | All questions resolved in spec stage |

## Approval Notes

- Design is minimal and proportional to a single pure function with no I/O, no ports, and no adapter involvement.
- All spec decisions (XML tags, section omission, diff format) are carried forward without modification.
- No new open questions. No risks above low severity.
- The design provides enough detail for sddl-plan to produce a step-by-step implementation plan.

## Budget Notes

- Artifact is approximately 500 words plus tables, within the 400-600 word target.
