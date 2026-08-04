# Spec

## Routing Digest

- change_name: e3-f1-h2-prompt-assembler
- objective: new-feature
- route: continue-lite
- digest_summary: Pure function `assemblePrompt` that deterministically composes a review prompt from a `ResolvedHarness`, a `ReviewDiff`, and optional validation output into a single string with XML-delimited sections in a fixed order.
- scope_digest: one function + one input type + snapshot tests in `src/core/review/`; no adapters, no ports, no I/O
- acceptance_digest: stable snapshots for identical input; documented fixed section order; prompt string suitable for persistence in run history

## Summary

- change_name: e3-f1-h2-prompt-assembler
- objective: new-feature
- route: continue-lite
- spec_status: complete

## Scope Boundary

### In Scope

- Pure function `assemblePrompt(input: AssemblePromptInput): string` in `src/core/review/assemble-prompt.ts`
- Input type `AssemblePromptInput` with fields: `resolvedHarness: ResolvedHarness`, `diff: ReviewDiff`, `validationOutput?: readonly string[]`
- Fixed section order with XML-style tag delimiters (see Expected Behavior)
- Deterministic output: same input always produces the same string, no timestamps or environment-dependent content
- Export from `src/core/review/index.ts`
- Unit tests with snapshot assertions in `src/core/review/__test__/assemble-prompt.test.ts`
- Cross-module import of `ReviewDiff` type via `../workspace/index.js`

### Out Of Scope

- Adapter code (pure core logic, no I/O boundary)
- New driven ports (the function is a pure transformation, not a port)
- Token counting or prompt size management (separate concern for later stories)
- Producing validation output (this story consumes it; production is E3.F2.x)
- Agent/tool context mode (only inline mode; `contextMode` branching is post-MVP)
- Prompt templating engine or string interpolation library

### Non-Goals

- Supporting dynamic section ordering or user-configurable section templates
- Escaping or sanitizing prompt content (the engine receives it as-is)
- Handling encoding or character set concerns beyond standard UTF-8 strings

## Expected Behavior

### Section Order and Delimiters

The assembled prompt uses XML-style tags as section delimiters. XML tags are standard practice in LLM prompts for unambiguous section boundaries that do not conflict with markdown content inside skills or diffs.

Fixed section order (mandatory):

1. `<instructions>` -- `harness.instructions` content
2. `<skills>` -- each skill wrapped in `<skill name="...">` sub-tags, in declaration order from `resolvedHarness.skills`
3. `<output-contract>` -- `harness.outputContract` content (omitted entirely when absent)
4. `<diff>` -- serialized diff entries (see below)
5. `<validation-output>` -- joined validation lines (omitted entirely when absent)

| Scenario | Expected Outcome | Evidence Or Notes |
|---|---|---|
| Full input (all fields populated) | Prompt contains all 5 sections in order, each wrapped in its XML tag | PRD SS5.2 formula: harness + skills + output + diff + validation |
| No output contract | Sections 1, 2, 4 emitted; section 3 omitted entirely (no empty tag) | Simpler output, no misleading empty sections |
| No validation output | Sections 1-4 emitted; section 5 omitted entirely | Same rationale as above |
| No output contract AND no validations | Only sections 1, 2, 4 | Minimal prompt with required sections only |
| Empty skills array | `<skills>` section emitted but empty (no `<skill>` sub-tags) | Skills section is always present; an empty array is a valid state |
| Harness with one skill | `<skills>` contains one `<skill name="skill-name">` with its content | Skill ordering matches `resolvedHarness.skills` array order |
| Multiple skills | Skills appear in declaration order inside `<skills>` | Determinism: array order is the canonical order |
| Diff with truncated files | Files with `content: null` render path header + `[content not available]` marker | Truncated files must be visible in the prompt |
| Diff with warnings | Warnings rendered as a list inside `<diff>` before file entries | Truncation warnings are audit-relevant |
| Identical inputs called twice | Byte-identical output | Core determinism guarantee |

### Diff Serialization

Inside the `<diff>` tag, each file entry is rendered as:

```
<file path="path/to/file" additions="N" deletions="N">
{content or marker}
</file>
```

- `content`: the unified diff string from `DiffFileEntry.content`
- If `content` is `null`: emit `[content not available]`
- If `truncated` is `true` on the entry: append ` (truncated)` to the file tag attributes
- File entries appear in the same order as `diff.files`
- Diff-level metadata (`totalLines`, `estimatedTokens`, `truncated`) is rendered as attributes on the `<diff>` tag
- `DiffWarning` items are rendered as `<warning>` sub-tags at the top of `<diff>`, before file entries

### Validation Output Serialization

- Input type: `readonly string[]`
- Each string is rendered as a separate line inside `<validation-output>`
- Empty array is treated the same as absent: section is omitted

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-1 | Snapshot stability: calling `assemblePrompt` with identical input produces byte-identical output across invocations | Vitest snapshot test with a full-input fixture | must |
| AC-2 | Section order is fixed and documented: instructions, skills, output-contract, diff, validation-output | Snapshot test verifies tag order; this spec documents the order | must |
| AC-3 | Full prompt is a single string suitable for persistence in run history | Return type is `string`; no side effects, no references to external state | must |
| AC-4 | Optional sections (output-contract, validation-output) are omitted when input is absent | Unit tests for each combination of present/absent optional fields | must |
| AC-5 | Skills render in declaration order with name-attributed sub-tags | Unit test with multiple skills verifying order and name attributes | must |
| AC-6 | Diff entries render in array order with path, additions, deletions, and content | Unit test with multi-file diff fixture | must |
| AC-7 | Null-content diff entries render a `[content not available]` marker | Unit test with `content: null` entry | must |
| AC-8 | Diff warnings render before file entries | Unit test with a `DiffTruncatedWarning` in the diff | should |
| AC-9 | Empty validation array is treated as absent (section omitted) | Unit test confirming no `<validation-output>` tag for `[]` | should |
| AC-10 | Function and type exported from `src/core/review/index.ts` | Import test or `npm run check` passes with the new exports | must |
| AC-11 | No imports from `src/adapters/`, `src/main/`, or I/O libraries | `npm run check` (depcruise) passes; manual inspection | must |
| AC-12 | `ReviewDiff` imported via `../workspace/index.js`, not deep path | Source inspection; depcruise rule for cross-module imports | must |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| XML tags could conflict with diff content containing literal `</instructions>` etc. | low | Unlikely in practice for code diffs; LLM prompt parsers handle nested content well. No escaping needed for MVP; revisit if real collisions are observed. |
| Section order is hardcoded, not configurable | low | Deliberate simplicity for MVP. PRD defines one formula; configurability is not a stated need. |
| Validation output typed as `readonly string[]` rather than a richer interface | low | Sufficient for MVP consumer (E3.F2.x produces string messages). Can be widened later without breaking the assembler's contract since it only reads. |

## Open Questions And Decisions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| Delimiter format | Affects prompt clarity for LLM engines | sddl-design | **decided**: XML-style tags (`<instructions>`, `<skills>`, etc.) -- standard LLM prompt practice, unambiguous boundaries, no conflict with markdown content in skills/instructions |
| Validation output shape | Defines the assembler's input contract for this optional field | sddl-design | **decided**: `readonly string[]` -- minimal, sufficient for string messages from validation scripts; widening later is non-breaking |
| Empty section handling | Determines prompt size and clarity | sddl-design | **decided**: omit sections entirely when input is absent (no outputContract, no validationOutput, or empty validationOutput array) -- simpler, no misleading empty tags |
| Diff serialization format | Determines how code changes appear to the LLM | sddl-design | **decided**: XML `<file>` sub-tags with path/additions/deletions attributes, content as body, `<warning>` sub-tags for diff warnings -- structured, machine-readable, preserves all metadata |

## Approval Notes

- All four open questions from the proposal are resolved. Decisions are A-level (technical, reversible, aligned with PRD and LLM prompt best practices).
- No risks above low severity. No blockers for design.
- The function's contract is simple enough that design and implementation should be straightforward.

## Budget Notes

- Target roughly 300 to 500 words plus tables for the full artifact when possible.
- This spec is slightly above target due to the diff serialization detail, which prevents ambiguity in design.
