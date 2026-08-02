# Spec + Design (combined) — docs-standards

Lightweight change: this artifact serves as both the functional spec (scope +
acceptance) and the technical design (file set + section outlines + wiring).

## Acceptance criteria

- AC-1: The five docs exist at the agreed paths, in English, each with the
  section structure below.
- AC-2: `docs/architecture.md` states the five architecture guards as
  ALLOWED / FORBIDDEN with at least one concrete example each, and references
  `.dependency-cruiser.cjs` as the enforcement and PRD §4 as the origin.
- AC-3: No doc invents, relaxes, or contradicts an existing rule (PRD §4, the
  guard file, `CLAUDE.md` conventions). Every rule stated is traceable to a
  source.
- AC-4: `CLAUDE.md` and `sdd-lite/skill-catalog.md` reference the standards docs
  as the human-readable source of truth for validations; the executable guard
  file remains the enforcement (no rule copied into a fourth place verbatim
  without a "see <source>" pointer).
- AC-5: Cross-links between the docs resolve (relative paths correct); no broken
  internal link.
- AC-6: No code, guard-config, PRD, or backlog change. `npm run check` and
  `npm test` remain green (docs-only; guards/tests unaffected).

## File set and placement

| Path | Role |
|---|---|
| `README.md` (root) | Entry point; GitHub renders it on the repo home. |
| `CONTRIBUTING.md` (root) | GitHub "contributing guidelines" special file. |
| `docs/architecture.md` | Canonical human architecture + guards explanation. |
| `docs/coding-standards.md` | Naming, errors, states, testing taxonomy, TS. |
| `docs/testing.md` | vitest projects, running tests, contract-suite pattern. |

## Section outlines

### README.md
- One-line what + one-paragraph description (from PRD §1/§8: AI-powered code
  review orchestrator CLI; delegation model; sentinel/snt bin).
- Status: pre-MVP, E0 (Foundations) complete; backlog progress pointer.
- Quickstart pointer (Node ≥22, `npm ci`, `npm run check`, `npm test`).
- Docs map: links to architecture, coding-standards, testing, contributing, and
  the source-of-truth docs (`docs/prd-sentinel.md`, setup, backlog).
- Language policy one-liner (repo is English) + license status (deferred, #44).

### CONTRIBUTING.md
- Prerequisites (Node ≥22, npm).
- Setup (`npm ci`) and the four commands (`dev`, `build`, `check`, `test`) with
  the quality-gate note (`check` + `test` green before any PR).
- Workflow contract (from CLAUDE.md): one PR per story, PR title
  `[E<epic>.F<feature>.H<story>] Title`, Conventional Commits, never merge /
  never push `main`, max 5 open PRs, human reviews/merges.
- sdd-lite in one paragraph + when it activates (link to CLAUDE.md policy).
- Pointer to architecture.md + coding-standards.md as the rules to follow.

### docs/architecture.md
- Style: hexagonal (ports & adapters, modules per domain) — from PRD §4.
- The six guiding principles (PRD §4.1), condensed.
- Structure map (`src/core|adapters|main`) with the module list (PRD §4.2).
- The border rule + ports owned by their domain module.
- **The five guards as ALLOWED / FORBIDDEN**, each with a concrete example,
  citing `.dependency-cruiser.cjs` (enforcement) + PRD §4.5 (origin) + the
  `zod`-only core whitelist + the `__test__/` exclude convention.
- Port catalog (PRD §4.3) — brief table.
- The review flow shape (worktree → diff → prompt → engine → parse → terminal
  state → cleanup) from PRD §5.1 + CLAUDE.md.
- Extraction guarantee (guards keep `core/` publishable).
- "What this means in practice": a short do / don't list.

### docs/coding-standards.md
- Naming (PRD §4.4): modules kebab-case by domain; ports by role; adapters by
  tech; use cases verb+noun camelCase; domain errors `Error`-suffixed; no
  `services/`/`utils/` in core.
- Errors: adapters translate raw exceptions into port errors; every run ends in
  a terminal state `ok | ambiguous | engine-error | timeout | validation-failed`.
- TypeScript: strict flags in use (NodeNext, verbatimModuleSyntax,
  exactOptionalPropertyTypes, noUncheckedIndexedAccess, isolatedModules) and
  what they imply (`import type`/`export type`, `.js` specifiers, conditional
  optional props).
- Testing taxonomy (one line, link to testing.md).
- Commits: Conventional Commits; English everything persisted.

### docs/testing.md
- The three vitest projects (core / adapters / e2e) — setup §5.4.
- Commands: `npm test`, single project (`npx vitest run --project adapters`),
  single test (`npx vitest run -t "<name>"`).
- Test placement: co-located under per-module `__test__/`, excluded from
  depcruise; core = unit with in-memory fakes, adapters = shared contract suite,
  e2e = smoke with FakeEngine.
- **Contract-suite pattern**: how a new engine adapter reuses
  `reviewEngineContract(harness)` — a concrete walkthrough using the FakeEngine
  test as the reference.
- Fixtures (`fixtures/`, real engine outputs — arrive with E1).

## Wiring design (AC-4)

- `sdd-lite/skill-catalog.md` "Project Standards (auto-resolved)": add a short
  lead-in that names `docs/architecture.md` + `docs/coding-standards.md` as the
  canonical human standards, keep the existing condensed bullets (they are the
  inject-into-prompt digest), and add "see <doc>" pointers. Do not delete the
  bullets — workers inject them directly.
- `CLAUDE.md`: add a one-line pointer under Architecture/Conventions to the new
  docs as the human-readable standards, without moving the mandatory rules.
- `.dependency-cruiser.cjs`: unchanged — remains the enforcement.

## Validation strategy

Single final blind read-only validator: check AC-1..AC-6 — English-only, every
stated rule traceable to PRD/guards/CLAUDE.md (no invented or relaxed rule),
cross-links resolve, and no code/guard/PRD/backlog change. Plus re-run
`npm run check` + `npm test` to confirm docs-only did not disturb the gate.
