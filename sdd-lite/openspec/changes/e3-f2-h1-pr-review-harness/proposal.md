# Proposal

## Routing Digest

- change_name: e3-f2-h1-pr-review-harness
- objective: new-feature
- route: continue-lite
- digest_summary: Create the `pr-review` factory harness -- the product's main code review harness -- with harness.md (role + instructions), output.md (findings format + verdict contract), and skills.yaml (skills it includes).
- feasibility_signal: high -- all infrastructure (loader, assembler, schemas) is built and tested; this is content authoring into a well-defined slot.
- scope_sketch_digest: 4 new files in `harnesses/pr-review/` and `skills/`; no code changes.

## Summary

- change_name: e3-f2-h1-pr-review-harness
- objective: new-feature
- route: continue-lite
- proposal_status: approved
- exploration_performed: true

## Problem And Desired Outcome

The harness loading system (E3.F1.H1), prompt assembler (E3.F1.H2), and `contextMode` option (E3.F1.H3) are all merged. The infrastructure reads from `harnesses/<type>/` directories and composes deterministic prompts, but **no factory harness exists yet**. The `harnesses/` directory contains only `.gitkeep`.

The `pr-review` harness is the product's primary review type -- the default harness for general-purpose code review. Without it, the review pipeline has no content to assemble into a prompt.

**Desired outcome**: a complete, self-contained `pr-review` harness that the existing `loadHarness("pr-review")` and `assemblePrompt()` infrastructure can load and compose into a review prompt. The harness must follow PRD Section 5.2 conventions and serve as the reference pattern for the `security` (E3.F2.H2) and `quick` (E3.F2.H3) harnesses that depend on it.

## Initial Scope Sketch

### Likely In Scope

- `harnesses/pr-review/harness.md` -- role definition and review instructions using REJECT/REQUIRE/PREFER keywords (~100-200 lines total across files)
- `harnesses/pr-review/output.md` -- output format contract requiring `VERDICT: approve|request-changes|comment` at the top, findings with `[SEV: blocker|major|minor|nit]` + `file:line`
- `harnesses/pr-review/skills.yaml` -- skills list referencing composable skill files, with `contextMode: inline`
- `skills/code-quality.md` -- reusable code quality checklist (patterns, naming, error handling, tests) that `pr-review` includes and other harnesses can compose
- Removing `.gitkeep` from `harnesses/` and `skills/` once real content replaces the placeholders

### Likely Out Of Scope

- No code changes to loaders, assemblers, schemas, or adapters
- No test changes (testing with FakeEngine comes in later epics)
- No `security` or `quick` harness content (E3.F2.H2, E3.F2.H3)
- No `repos.yaml` per-repo skill configuration
- No runtime validation or CI integration changes

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Loader compatibility | `createHarnessLoaderAdapter` reads `harness.md`, `output.md`, `skills.yaml` from `harnesses/<type>/`; `HarnessSkillsSchema` validates `{ skills: string[], contextMode }`. Slot is fully defined. | high |
| Assembler integration | `assemblePrompt` wraps harness instructions in `<instructions>`, skills in `<skill name="...">`, output contract in `<output-contract>`. The format is deterministic and tested. | high |
| Skill resolution | `loadSkill(name)` reads `skills/<name>.md`. Skills are referenced by name in `skills.yaml`; non-existent skill = `SkillNotFoundError`. | high |
| Content authoring | Pure Markdown/YAML authoring with no code dependencies. PRD Section 5.2 provides clear writing conventions. Risk is near zero. | high |

## Open Questions For Spec

| Item | Why It Matters | Status |
|---|---|---|
| Skill granularity for security reuse | E3.F2.H2 wants a "reusable security checklist" skill. Should `pr-review` include a lightweight security awareness skill now, or should security concerns live entirely in the security harness? | open -- recommend deferring security skill to E3.F2.H2; `pr-review` focuses on code quality |
| Number of skills | Should `pr-review` reference one broad skill or multiple focused ones (e.g., `code-quality`, `pr-conventions`)? | open -- recommend starting with one `code-quality` skill to keep the first harness simple; split later if needed |
| `.gitkeep` removal | Should we remove `.gitkeep` from `harnesses/` and `skills/` in this PR since real files replace them? | open -- recommend yes, trivial cleanup |

## Approval Notes

- The handoff explicitly states "continue with spec" flow via `continue-lite` route. No ambiguity in scope or risk.
- All infrastructure is built and tested; this story is pure content authoring.
- The harness will serve as the reference implementation for subsequent factory harnesses (security, quick).

## Budget Notes

- Pure content authoring -- 4 files, all Markdown/YAML, no code changes.
- Straightforward continue-lite route; spec and design stages should be compact.
