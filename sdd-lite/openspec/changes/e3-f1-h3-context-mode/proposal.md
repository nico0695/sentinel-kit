# Proposal: e3-f1-h3-context-mode

## Routing Digest

| Field | Value |
|---|---|
| change_name | e3-f1-h3-context-mode |
| story | [E3.F1.H3] contextMode option in harness |
| issue | #21 |
| complexity | low |
| exploration_performed | false |

## Summary

Add a `contextMode` option (`inline | agent`) to the harness schema and loading pipeline. `inline` is the MVP default (current behavior). `agent` is accepted by the schema but fails at prompt assembly time with an explicit "not yet implemented" error. This opens the door for autonomous mode (PRD §6.3) without implementing it.

## Problem

The harness system currently has no concept of how context (diff, skills, instructions) is delivered to the review engine. PRD §6.3 defines two delivery strategies — inline (tool assembles the prompt) and autonomous/agent (engine reads the diff itself) — and specifies that `contextMode` should exist as a harness option from the start, even though only `inline` is implemented in the MVP.

## Desired Outcome

- `Harness` interface and zod schema accept `contextMode: 'inline' | 'agent'` with `'inline'` as default.
- The fs adapter reads `contextMode` from `harness.md` frontmatter or `skills.yaml` and passes it through.
- `assemblePrompt` (or a guard before it) rejects `agent` mode with a clear domain error.
- Existing tests and snapshots remain green — `inline` is the default, so omitting `contextMode` produces identical behavior.

## Initial Scope Sketch

**In scope:**
- `ContextMode` type literal union in `harness-schemas.ts`
- `contextMode` field on `Harness` interface (optional, defaults to `inline`)
- Zod schema update in `HarnessSkillsSchema` (or a new schema for the full harness config)
- New domain error `ContextModeNotSupportedError` in `harness-errors.ts`
- Guard in `assemblePrompt` (or caller) that throws for `agent`
- Update fs adapter to parse `contextMode` from harness config
- Unit tests for schema validation, error on `agent`, default behavior
- Snapshot updates if any section shape changes

**Out of scope:**
- Implementing autonomous/agent context delivery
- Changes to the review engine or run domain
- TUI/CLI surface changes

## Feasibility Signal

Low complexity, high confidence. The change touches 4-6 files in well-understood modules (schemas, errors, assembler, fs adapter, tests). No new dependencies. No architectural boundary crossings — `contextMode` lives in core/review where the harness system already is. The fs adapter change is mechanical (add one parsed field).

## Open Questions for Spec

1. **Where to store `contextMode` on disk**: in `skills.yaml` (alongside skills) or as a new top-level field parsed from `harness.md` frontmatter? Current `skills.yaml` has only `{ skills: string[] }` — adding `contextMode` there is the simplest path. PRD §5.2 structure shows `harness.md` + `output.md` + `skills.yaml` — contextMode fits `skills.yaml` as harness-level config.
2. **Default handling**: should `contextMode` be truly optional (undefined → treated as inline) or always present after loading (adapter fills the default)? Recommendation: adapter fills the default so core code never sees undefined.

## Approval Notes

No ambiguity or risk above low. Story acceptance criteria map directly to implementation. Auto-approved for spec.
