# Spec

## Routing Digest

- change_name: e3-f2-h1-pr-review-harness
- objective: new-feature
- route: continue-lite
- digest_summary: Create the `pr-review` factory harness (4 content files) that the existing loader/assembler infrastructure reads and composes into a deterministic code review prompt.
- scope_digest: 4 new Markdown/YAML files (`harnesses/pr-review/{harness.md, output.md, skills.yaml}`, `skills/code-quality.md`); remove 2 `.gitkeep` placeholders. Zero code changes.
- acceptance_digest: Files load via `loadHarness("pr-review")` + `loadSkill("code-quality")`; content follows PRD Section 5.2 conventions (REJECT/REQUIRE/PREFER keywords, VERDICT contract, severity levels, file:line format); each file is 100-200 lines.

## Summary

- change_name: e3-f2-h1-pr-review-harness
- objective: new-feature
- route: continue-lite
- spec_status: approved

## Scope Boundary

### In Scope

- `harnesses/pr-review/harness.md` -- role definition ("senior code reviewer") and review instructions organized by domain (correctness, design, maintainability, testing, documentation). Uses REJECT/REQUIRE/PREFER keywords per PRD Section 5.2. Target ~100-150 lines.
- `harnesses/pr-review/output.md` -- output format contract. Machine-parsable `VERDICT: approve|request-changes|comment` as the first non-empty line. Findings with `[SEV: blocker|major|minor|nit]` + `file:line`. Rules for verdict selection (blocker present = `request-changes`). Ambiguity definition (missing or contradictory verdict).
- `harnesses/pr-review/skills.yaml` -- skills list with `contextMode: inline`. References `code-quality` as the single skill for this harness.
- `skills/code-quality.md` -- composable, reusable code quality checklist covering naming, error handling, patterns, complexity, and test coverage expectations. Usable by `pr-review`, `security`, and `quick` harnesses.
- Remove `harnesses/.gitkeep` and `skills/.gitkeep` (replaced by real content).

### Out Of Scope

- No code changes to loaders, assemblers, schemas, adapters, or any `.ts` file.
- No test changes -- integration testing with FakeEngine is in later stories.
- No `security` harness content (E3.F2.H2) or `quick` harness content (E3.F2.H3).
- No `repos.yaml` per-repo skill overrides.
- No runtime validation or CI integration changes.

### Non-Goals

- Language-specific rules (the harness is language-agnostic; language-specific skills are a future composition concern).
- Framework-specific conventions (same reasoning).
- Tuning prompt wording for a specific engine -- dogfooding phase (E7.F1.H2) covers that.

## Expected Behavior

| Scenario | Expected Outcome | Evidence Or Notes |
|---|---|---|
| `loadHarness("pr-review")` | Returns `Harness` with `type: "pr-review"`, `instructions` from `harness.md`, `outputContract` from `output.md`, `skills: ["code-quality"]`, `contextMode: "inline"` | `harness-loader-fs.ts` reads these exact paths and fields |
| `loadSkill("code-quality")` | Returns `Skill` with `name: "code-quality"`, `content` from `skills/code-quality.md` | `loadSkill` reads `skills/<name>.md` |
| `assemblePrompt()` with resolved pr-review harness | Produces prompt with `<instructions>`, `<skills><skill name="code-quality">`, `<output-contract>`, `<diff>` sections in order | `assemble-prompt.ts` wraps each section deterministically |
| `harness.md` content | Contains REJECT/REQUIRE/PREFER keywords; covers correctness, design, maintainability, testing domains; is 100-200 lines | PRD Section 5.2 writing conventions |
| `output.md` content | First non-empty line is the VERDICT instruction; defines `VERDICT: approve\|request-changes\|comment`; findings use `[SEV: blocker\|major\|minor\|nit]` + `file:line` | PRD Section 5.2 output contract |
| `skills.yaml` content | Valid YAML parsed by `HarnessSkillsSchema`: `{ skills: ["code-quality"], contextMode: "inline" }` | `HarnessSkillsSchema` zod validation in loader |
| Missing verdict in engine response | Downstream parser marks the run as `ambiguous` (the output contract must document this rule) | PRD Section 5.2: "absence or contradiction = ambiguous" |

## Acceptance Criteria

| Criteria Id | Acceptance Criteria | Validation Hint | Priority |
|---|---|---|---|
| AC-1 | `harness.md` exists at `harnesses/pr-review/harness.md` and is 100-200 lines | `wc -l harnesses/pr-review/harness.md` | must |
| AC-2 | `harness.md` uses REJECT, REQUIRE, and PREFER keywords at least once each | `grep -cE 'REJECT\|REQUIRE\|PREFER' harnesses/pr-review/harness.md` | must |
| AC-3 | `output.md` exists at `harnesses/pr-review/output.md` and specifies `VERDICT: approve\|request-changes\|comment` as the first non-empty line of engine output | Read the file; the VERDICT instruction must be unambiguous | must |
| AC-4 | `output.md` defines finding format with `[SEV: blocker\|major\|minor\|nit]` and `file:line` | Pattern match in file content | must |
| AC-5 | `output.md` documents ambiguity rule: missing or contradictory verdict = `ambiguous` run | Explicit statement in the file | must |
| AC-6 | `skills.yaml` exists and passes `HarnessSkillsSchema` validation with `skills: ["code-quality"]` and `contextMode: "inline"` | Parse with `yaml` + zod schema in a test or manually | must |
| AC-7 | `skills/code-quality.md` exists with reusable quality checklist content | File exists and is non-trivial (>20 lines of actionable content) | must |
| AC-8 | `harnesses/.gitkeep` and `skills/.gitkeep` are deleted | `ls harnesses/.gitkeep skills/.gitkeep` should fail | should |
| AC-9 | `npm run check` passes (no lint, type, or architecture guard regressions) | Run `npm run check` | must |
| AC-10 | All file content is in English | Manual review | must |

## Risks And Trade-Offs

| Item | Impact | Notes |
|---|---|---|
| Prompt wording not validated against real engine output until E7 dogfooding | Low -- the harness content is iteratively tunable; the structure is what matters now, and it is mechanically validated by the loader/assembler infrastructure | Content refinement is explicitly deferred to E7.F1.H2 |
| Single skill (`code-quality`) may be too broad | Low -- splitting into focused skills (naming, error-handling, etc.) is a backward-compatible change; starting broad avoids premature decomposition | Proposal recommended starting with one; revisit after security harness (E3.F2.H2) reveals reuse patterns |

## Open Questions And Decisions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| Security awareness in `code-quality` skill | Should `code-quality` include lightweight security tips, or leave all security to the `security` harness skill (E3.F2.H2)? | design | resolved -- defer entirely to E3.F2.H2 per proposal recommendation; `code-quality` focuses on code quality only |
| Skill count for `pr-review` | One broad skill vs. multiple focused ones | design | resolved -- one `code-quality` skill per proposal recommendation; split later if needed |
| `.gitkeep` removal | Whether to remove placeholders when real files replace them | executor | resolved -- yes, trivial cleanup included in scope |

## Approval Notes

- All open questions from the proposal are resolved with the recommended options. No ambiguity remains.
- Pure content authoring into a well-tested infrastructure slot. No code risk.
- The harness serves as the reference pattern for `security` (E3.F2.H2) and `quick` (E3.F2.H3).

## Budget Notes

- 4 content files (Markdown + YAML), 2 `.gitkeep` deletions. No code changes.
- continue-lite route; design and plan stages should be compact.
