# Design

## Routing Digest

- change_name: e3-f2-h1-pr-review-harness
- objective: new-feature
- route: continue-lite
- digest_summary: Define the exact content structure for 4 harness/skill files that the existing loader/assembler infrastructure reads. Pure content design -- no interfaces, no state, no code.
- affected_areas_digest: `harnesses/pr-review/` (3 new files), `skills/` (1 new file), 2 `.gitkeep` deletions.
- interfaces_digest: No new interfaces. Files slot into existing `loadHarness` / `loadSkill` / `assemblePrompt` infrastructure unchanged.

## Summary

- change_name: e3-f2-h1-pr-review-harness
- objective: new-feature
- route: continue-lite
- design_status: approved

## Design Overview

This is a content-only change. The design defines the exact structure and section breakdown for each of the 4 files. No code, no interfaces, no schema changes. The assembler wraps each file in XML tags (`<instructions>`, `<skill name="...">`, `<output-contract>`), so file content must be raw instruction text -- no XML wrapping, no frontmatter.

### 1. harness.md -- Review Instructions

**Location**: `harnesses/pr-review/harness.md`
**Target**: 100-150 lines (AC-1 requires 100-200)
**Purpose**: Loaded as `Harness.instructions`, wrapped by assembler in `<instructions>...</instructions>`.

**Section structure**:

```
## Role
  - One-paragraph preamble: "You are a senior code reviewer..."
  - Scope statement: review the diff provided, nothing else.
  - Tone: direct, constructive, evidence-based.

## Review Domains
  ### Correctness
    - REJECT: off-by-one, null derefs, race conditions, logic inversions
    - REQUIRE: edge-case handling for boundary values
    - PREFER: early returns over nested conditionals

  ### Design
    - REJECT: circular dependencies, god objects, leaky abstractions
    - REQUIRE: single responsibility per module/class/function
    - PREFER: composition over inheritance, dependency injection

  ### Maintainability
    - REJECT: magic numbers/strings without constants, duplicated logic blocks
    - REQUIRE: meaningful names that reveal intent
    - PREFER: small functions (<30 lines), flat control flow

  ### Testing
    - REJECT: tests that pass regardless of implementation (tautological assertions)
    - REQUIRE: test coverage for new public API surface
    - PREFER: arrange-act-assert structure, descriptive test names

  ### Documentation
    - REQUIRE: doc comments on public API when intent is non-obvious
    - PREFER: self-documenting code over comments that restate the code

## Review Guidelines
  - Focus on the diff, not the entire file (unless context is needed to judge a change).
  - Flag patterns, not style preferences already handled by linters.
  - When unsure whether something is a bug or intentional, flag it as minor with a question.
  - Do not suggest changes outside the diff unless they are directly caused by it.
  - If skills are attached, apply their checklists as additional review criteria.
```

**Keyword coverage**: REJECT appears in Correctness, Design, Maintainability, Testing (AC-2). REQUIRE appears in Correctness, Design, Testing, Documentation (AC-2). PREFER appears in Correctness, Design, Maintainability, Testing, Documentation (AC-2).

**Key design decisions**:
- Five review domains (correctness, design, maintainability, testing, documentation) provide comprehensive coverage while remaining language-agnostic.
- Each domain uses the REJECT/REQUIRE/PREFER keyword hierarchy from PRD Section 5.2. The keywords carry semantic weight: REJECT = must not appear (blocker if found), REQUIRE = must be present (major if missing), PREFER = recommended (minor/nit if not followed).
- The "Review Guidelines" section at the end scopes the review behavior (diff-focused, pattern-oriented, interaction with skills).
- No language-specific or framework-specific rules (non-goal per spec).

### 2. output.md -- Output Format Contract

**Location**: `harnesses/pr-review/output.md`
**Target**: 40-70 lines
**Purpose**: Loaded as `Harness.outputContract`, wrapped by assembler in `<output-contract>...</output-contract>`.

**Section structure**:

```
## Verdict

The first non-empty line of your response MUST be exactly one of:

    VERDICT: approve
    VERDICT: request-changes
    VERDICT: comment

Verdict selection rules:
- If ANY finding has [SEV: blocker]: VERDICT MUST be `request-changes`.
- If ANY finding has [SEV: major] and none has [SEV: blocker]: VERDICT MUST be `request-changes`.
- If findings exist but none is blocker or major: use `comment`.
- If no findings: use `approve`.

## Findings

After the verdict line, list each finding in this format:

    [SEV: <level>] <file>:<line> — <summary>
    <explanation>

Where:
- <level> is one of: blocker, major, minor, nit
- <file> is the path relative to the repository root
- <line> is the line number in the diff where the issue occurs
- <summary> is a one-line description (max ~120 chars)
- <explanation> is 1-3 sentences of context, evidence, or suggested fix

Severity definitions:
- blocker: correctness bug, data loss risk, or security vulnerability that must be fixed before merge
- major: significant design flaw, missing required behavior, or will cause maintenance burden
- minor: improvement that would meaningfully benefit the code but is not blocking
- nit: style, naming, or trivial preference -- safe to ignore

## Summary

After all findings (or after the verdict if there are none), provide a brief summary paragraph (2-4 sentences) covering the overall quality of the change and any cross-cutting observations.

## Ambiguity Rule

If the verdict line is missing, contains a value other than the three allowed values, or the response contains contradictory verdicts: the run is classified as `ambiguous`. An ambiguous run is still persisted but marked as untrusted.
```

**Key design decisions**:
- Verdict line is first non-empty line with exact format `VERDICT: <value>` (AC-3). This makes machine parsing trivial: read line, split on `: `, validate value.
- Severity uses `[SEV: level]` bracket syntax followed by `file:line` (AC-4). The dash separator ` -- ` before the summary keeps it grep-friendly.
- Verdict selection rules are deterministic: any blocker or major forces `request-changes`. This prevents an engine from approving a PR while listing blockers.
- The ambiguity rule (AC-5) is explicit: missing, invalid, or contradictory verdict = `ambiguous` terminal state.
- Summary section is last, after findings, to keep the machine-parsable content at the top.

### 3. skills.yaml -- Skill Configuration

**Location**: `harnesses/pr-review/skills.yaml`
**Target**: 3 lines
**Purpose**: Parsed by `HarnessSkillsSchema` (zod) in the harness loader.

**Exact content**:

```yaml
skills:
  - code-quality
contextMode: inline
```

This matches `HarnessSkillsSchema = z.object({ skills: z.array(z.string()), contextMode: z.enum(["inline", "agent"]).default("inline") })` (AC-6). The `inline` mode means skill content is concatenated into the prompt by `assemblePrompt()` rather than provided via agent context.

### 4. code-quality.md -- Composable Quality Checklist

**Location**: `skills/code-quality.md`
**Target**: 50-80 lines (AC-7 requires >20 lines of actionable content)
**Purpose**: Loaded by `loadSkill("code-quality")`, wrapped by assembler in `<skill name="code-quality">...</skill>`.

**Section structure**:

```
# Code Quality Checklist

Apply each item below to the code under review. Flag violations as findings with the appropriate severity.

## Naming
  - Variables, functions, and types use descriptive names that reveal intent
  - Boolean variables/functions use is/has/can/should prefixes or read as predicates
  - Abbreviations are avoided unless they are domain-standard
  - Names are consistent with surrounding code conventions

## Error Handling
  - Errors are handled at the appropriate level, not swallowed silently
  - Error messages include enough context for debugging (what failed, with what input)
  - Async operations have explicit error paths (catch, error callbacks, Result types)
  - Retry logic has bounded attempts and backoff when present

## Patterns and Structure
  - Functions have a single responsibility and a clear return contract
  - Control flow is flat (early returns, guard clauses) rather than deeply nested
  - Shared logic is extracted when duplicated more than twice
  - Dependencies flow in one direction (no circular imports)
  - Side effects are explicit and isolated from pure computation

## Complexity
  - Functions are short enough to understand in a single reading (~30 lines guideline)
  - Conditional logic is simple; complex conditions are extracted to named predicates
  - No unnecessary abstractions (YAGNI) -- code solves the current problem
  - Data transformations are composed from small, testable steps

## Test Coverage
  - New public API surface has corresponding tests
  - Tests exercise both happy path and error/edge cases
  - Test assertions are specific (not just "no error thrown")
  - Test setup is minimal -- only what the test needs
  - Mocks/stubs replace external dependencies, not internal logic
```

**Key design decisions**:
- Five sections (naming, error handling, patterns, complexity, test coverage) mirror common quality concerns without overlapping with the review domains in `harness.md`. The harness says what to look for; the skill provides the detailed checklist.
- No security items -- deferred to `skills/security.md` in E3.F2.H2 (decision D-1).
- Language-agnostic: no language-specific APIs, frameworks, or syntax mentioned.
- Composable: the `security` and `quick` harnesses can reference this same skill in their `skills.yaml`.

## Affected Areas

| Path Or Module | Planned Change | Risk |
|---|---|---|
| `harnesses/pr-review/harness.md` | Create new file (review instructions) | None -- new file in existing directory |
| `harnesses/pr-review/output.md` | Create new file (output format contract) | None -- new file |
| `harnesses/pr-review/skills.yaml` | Create new file (skill configuration) | None -- must pass `HarnessSkillsSchema` |
| `skills/code-quality.md` | Create new file (quality checklist) | None -- new file |
| `harnesses/.gitkeep` | Delete | None -- replaced by real content |
| `skills/.gitkeep` | Delete | None -- replaced by real content |

## Interfaces, Data, And State

No new interfaces, data structures, or state transitions. All files slot into existing infrastructure:

- `harness.md` content becomes `Harness.instructions` (string) via `createHarnessLoaderAdapter`
- `output.md` content becomes `Harness.outputContract` (string | undefined) via the same loader
- `skills.yaml` is validated against `HarnessSkillsSchema` (zod) producing `HarnessSkillsConfig`
- `code-quality.md` content becomes `Skill.content` (string) via `loadSkill`
- `assemblePrompt()` wraps these in XML sections -- the file content must not duplicate that wrapping

## Alternatives And Trade-Offs

| Option | Decision | Why |
|---|---|---|
| Separate skills per domain (naming, errors, patterns) vs. one `code-quality` skill | One `code-quality` skill | Avoids premature decomposition; splitting is backward-compatible. Revisit after E3.F2.H2 reveals reuse patterns (decision D-2). |
| Include verdict selection rules in harness.md vs. output.md | Place in output.md | The verdict is an output concern. harness.md tells the engine *what* to review; output.md tells it *how to format* the response. Keeps separation clean. |
| Strict severity-to-verdict mapping vs. engine judgment | Strict deterministic mapping | Prevents the engine from approving a PR while listing blockers. If `blocker` or `major` is present, verdict must be `request-changes`. No room for engine discretion here. |

## Open Technical Questions

| Item | Why It Matters | Needed Before | Status |
|---|---|---|---|
| (none) | -- | -- | -- |

All technical questions from the spec are resolved. The design is straightforward content authoring with no ambiguity.

## Approval Notes

- Pure content design into well-tested infrastructure slots. Zero code risk.
- All 10 acceptance criteria are directly addressed by the section structures above.
- The keyword mapping (REJECT = blocker-worthy, REQUIRE = major-worthy, PREFER = minor/nit) gives semantic weight to the harness instructions without over-prescribing it -- the engine still judges individual instances.
- This design serves as the reference pattern for `security` (E3.F2.H2) and `quick` (E3.F2.H3) harnesses.

## Budget Notes

- 4 content files (Markdown + YAML), 2 `.gitkeep` deletions. No code changes.
- Design is proportionally compact for a content-only change (~500 words plus structure).
