# Proposal

## Routing Digest

- change_name: e3-f1-h2-prompt-assembler
- objective: new-feature
- route: continue-lite
- digest_summary: Pure function `assemblePrompt` that deterministically composes a review prompt from resolved harness, diff, and optional validation output, with a documented section order and stable output for identical inputs.
- feasibility_signal: high confidence — all input types exist, no I/O needed, pure transformation
- scope_sketch_digest: one pure function + types + snapshot tests in core/review; no adapters, no ports

## Summary

- change_name: e3-f1-h2-prompt-assembler
- objective: new-feature
- route: continue-lite
- proposal_status: complete
- exploration_performed: false

## Problem And Desired Outcome

The review flow requires a fully assembled prompt string to pass to `ReviewEngine.review()` via `ReviewRequest.prompt`. PRD SS5.2 defines the prompt formula as: harness instructions + skills + output contract + diff + validation output. Currently no code exists to compose this string from its constituent parts.

The desired outcome is a pure, deterministic function `assemblePrompt` in `src/core/review/` that:
1. Accepts a `ResolvedHarness` (harness + resolved skills from E3.F1.H1), a `ReviewDiff` (from workspace module), and optional validation output (string array or similar).
2. Produces a single prompt string with clearly delimited, documented sections in a fixed order.
3. Guarantees same input produces same output — no timestamps, random IDs, or environment-dependent content injected.
4. Produces a string suitable for persistence in the run history for auditability.

## Initial Scope Sketch

### Likely In Scope

- Pure function `assemblePrompt` in `src/core/review/assemble-prompt.ts`
- Input type `AssemblePromptInput` grouping `ResolvedHarness`, `ReviewDiff`, and optional validations
- Documented, fixed section order with clear delimiters (markdown headers or fenced blocks):
  1. Harness instructions
  2. Skills (each skill name + content, in declaration order)
  3. Output contract (when present)
  4. Diff (file entries serialized deterministically)
  5. Validation output (when present)
- Export from `src/core/review/index.ts`
- Unit tests in `src/core/review/__test__/assemble-prompt.test.ts` with snapshot assertions for determinism
- Cross-module import of `ReviewDiff` via `../workspace/index.js` (architecture-compliant)

### Likely Out Of Scope

- Adapter code — this is pure core logic, no I/O
- New ports — the function is a pure transformation, not a driven port
- Prompt templating engine or string interpolation library — plain string concatenation suffices
- Token counting or prompt size management (separate concern, potentially E3.F1.H3 or later)
- The `contextMode` abstraction beyond inline (inline is MVP default per PRD SS6.3; tool mode is post-MVP)
- Validation output production — this story consumes it, does not produce it (that is E3.F2.x)

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Input types exist | `ResolvedHarness` (E3.F1.H1) and `ReviewDiff` (workspace module) are merged and exported | high |
| Consumer exists | `ReviewRequest.prompt: string` in `src/core/run/ports/review-engine.ts` is the target | high |
| No I/O required | Pure string assembly from in-memory structures, fully compatible with core constraints | high |
| Architecture fit | Function lives in `src/core/review/`, imports workspace via public index, no adapter dependency | high |
| Determinism achievable | All inputs are readonly, function is pure, no side effects — snapshot tests verify stability | high |

## Open Questions For Spec

| Item | Why It Matters | Status |
|---|---|---|
| Delimiter format for sections | Markdown headers (`## Section`) vs fenced blocks vs XML-style tags — affects engine parsing and readability | open — spec should decide based on engine expectations |
| Validation output shape | Currently untyped; needs at least `readonly string[]` or a lightweight interface for the assembler's input contract | open — spec should define the minimal type |
| Empty section handling | Whether to omit sections entirely when input is absent (no output contract, no validations) or emit an empty placeholder | open — spec should decide; omitting is simpler |
| Diff serialization format | How `DiffFileEntry[]` is rendered into the prompt string (unified diff, file-header + content, truncation markers) | open — spec should formalize the layout |

## Approval Notes

- No ambiguity in problem framing or scope — the PRD formula is explicit and the predecessor (E3.F1.H1) provides all needed input types.
- No risks above low severity; all open questions are refinement details for the spec stage, not blockers.
- Recommend advancing directly to `sddl-spec`.

## Budget Notes

- Keep this artifact lightweight. Target roughly 200 to 400 words.
- This artifact consolidates the idea before investing in a formal spec.
