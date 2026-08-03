# Proposal

## Routing Digest

- change_name: e3-f1-h1-harness-loading
- objective: new-feature
- route: continue-lite
- digest_summary: First story to populate src/core/review/. New HarnessLoader port + storage adapter to load, validate, and resolve harnesses and skills from the filesystem. Well-bounded scope following established ConfigStore patterns.
- feasibility_signal: high — pattern proven by ConfigStore (E2.F2.H1), clear PRD spec (§5.2), all dependencies met
- scope_sketch_digest: domain types + zod schemas + HarnessLoader port + storage adapter + resolution logic + unit/contract tests

## Summary

- change_name: e3-f1-h1-harness-loading
- objective: new-feature
- route: continue-lite
- proposal_status: approved
- exploration_performed: false

## Problem And Desired Outcome

The `src/core/review/` module is an empty stub. The review flow (E3–E4) cannot begin until the system can load, validate, and resolve harnesses and skills from the filesystem. Without this, there is no way to know which review types are available or to assemble prompts for the engine.

**Desired outcome**: a `HarnessLoader` port in the review module that loads harness directories and skill files, validates their structure and references (missing skill = clear error), resolves the merge of factory + user harnesses (user overrides on name conflict), and produces deterministic, ordered data structures ready for the prompt assembler (E3.F1.H2).

## Initial Scope Sketch

### Likely In Scope

- Domain types in `src/core/review/`: `Harness`, `Skill`, `ResolvedHarness` (harness + its resolved skills)
- Zod schema for `skills.yaml` (skill reference list)
- `HarnessLoader` driven port in `src/core/review/ports/` with methods to list, load, and resolve harnesses and skills
- Error hierarchy: `HarnessError` base with `HarnessNotFoundError`, `HarnessValidationError`, `SkillNotFoundError`
- `loadHarnesses` use case in `src/core/review/` — orchestrates loading from two sources (factory + user), merges with user-wins precedence, validates skill references, resolves skills in deterministic order
- Storage adapter in `src/adapters/driven/storage/` — reads harness dirs and skill .md files from disk
- Unit tests for core logic (in-memory fake adapter)
- Contract test suite for HarnessLoader adapter
- Export public API from `src/core/review/index.ts`

### Likely Out Of Scope

- Prompt assembly from loaded harness+skills (E3.F1.H2)
- contextMode option (E3.F1.H3)
- Factory harness content — pr-review, security, quick (E3.F2.H1–H3)
- Changes to ConfigStore port or repos module
- CLI/TUI integration

## Feasibility Signal

| Signal | Observation | Confidence |
|---|---|---|
| Pattern precedent | ConfigStore (E2.F2.H1) established the exact pattern: zod schemas + port + YAML adapter + error hierarchy + contract tests | high |
| PRD spec clarity | §5.2 fully defines the filesystem layout, file roles, and composition model | high |
| Dependency met | E2.F2.H1 (ConfigStore) is complete; RepoEntrySchema already has `defaultHarness` and `extraSkills` fields | high |
| Architecture fit | review module is the designated owner (PRD §4.2); empty stub ready for population | high |

## Open Questions For Spec

| Item | Why It Matters | Status |
|---|---|---|
| HarnessLoader method signatures | Exact read/list/resolve method shapes need definition in spec | open — spec will formalize |
| Factory harness base path resolution | How the adapter locates the package-bundled harnesses dir at runtime (import.meta vs __dirname vs config) | open — design will resolve |
| skills.yaml schema details | Whether it supports ordering hints or metadata beyond the skill name list | open — spec will define minimal schema |

## Approval Notes

- Three B-level decisions pre-approved by user (A/A/A):
  - B1: New dedicated HarnessLoader port in review/ports (not extending ConfigStore)
  - B2: User harnesses override factory on name conflict
  - B3: Only harness.md is mandatory; output.md and skills.yaml are optional
- Scope is well-bounded: follows the same structural pattern as ConfigStore
- No PRD contradictions identified
- Story depends on E2.F2.H1 (complete); feeds E3.F1.H2 (prompt assembler)
