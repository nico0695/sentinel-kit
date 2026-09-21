# Project Context

## Metadata

- project_name: sentinel
- project_root: /Users/nicolasschmidt/Documents/develop/test-cr-cli
- runtime_root: ./sdd-lite
- generated_at: 2026-08-01T13:14:29Z
- last_refreshed_at: 2026-09-21T01:34:01Z
- generated_by: sddl-init (shallow high-signal refresh, sdd-lite 0.4 adoption)

## Stack Summary

> E0 through E6 have landed on `main` (last merge: PR #78 @ `cbc878b`). Product code last changed in the
> PR #77 owner-review fix round (TUI `engine-text` / `tui-flow` hardening). The stack below is **observed**
> in the working tree. Package: `@nico0695/sentinel` (ESM, bin `sentinel` + `snt`).

| Area | Value | Evidence |
|---|---|---|
| languages | typescript 5.9.3 | `package.json` devDependencies; `tsconfig.json` at root |
| frameworks | none — CLI application (`commander` for the CLI, `@clack/prompts` for the TUI) | `docs/setup-tecnico-sentinel.md` §4; `package.json` dependencies |
| runtime | node >=22, runtime-agnostic code | `package.json` `engines.node: ">=22"`; `npm run dev` builds with tsup then runs `dist/cli.js` |
| package_manager | npm | `package-lock.json` (lockfileVersion 3) present |

Runtime dependencies: `commander ^15.0.0`, `execa ^9.6.1`, `yaml ^2.9.0`, `zod ^4.4.3`, `@clack/prompts 1.7.0` and
`picocolors 1.1.1` (both exact-pinned). Dev toolchain: @biomejs/biome 2.5.6, typescript 5.9.3, @types/node 22.20.1,
vitest 4.1.10, dependency-cruiser 18.1.0, tsup 8.5.1. The `adapters-isolated` guard keeps `@clack/prompts` confined to
`tui/clack-prompter.ts` and `picocolors` to `tui/colors.ts`; `marked-terminal` was rejected for the MVP. Still
declared-only: changesets (E7 release tooling), per `docs/setup-tecnico-sentinel.md` §4.

## Important Directories

| Path | Role | Notes |
|---|---|---|
| `docs/` | Specification source of truth | PRD, technical setup, MVP backlog, plus `architecture.md`, `coding-standards.md`, `testing.md` (human-readable standards) and `engines/` (canonical headless invocation per engine). |
| `sdd-lite/` | Vendored sdd-lite package + runtime root | Package files (`skills/`, `orchestrator/`, `templates/`, `schemas/`) and generated runtime artifacts (`openspec/`) share this directory. Package is on the 0.4 contract. |
| `.claude/skills/`, `.agents/skills/` | Installed sdd-lite skills (12) | Copy install, path-rewritten to project-relative. Other project skills (`history-log`, `4r-review`, `commit-closer`, `doc-writer`, `grill-me`) live beside them and are not owned by sdd-lite. |
| `.claude/agents/`, `.codex/agents/` | Execution-profile adapters (8 each) | Generated copies from `sdd-lite/templates/agents/`; regenerate with `sddl-init`, override via `config.yaml` `execution_profiles`. |
| `src/` | Source root per PRD §4.2 | `core/{repos,workspace,review,run,history,shared}`, `adapters/driven/{engines/{fake,claude-code,opencode},git,storage,exec}`, `adapters/driving/{cli,tui}`, `main/{cli.ts,container.ts,paths.ts}` (composition root — the only place adapters are instantiated). Tests live in `<module>/__test__/`. |
| `e2e/` | Vitest E2E project root | Holds the `[E7.F1.H1]` smoke (`e2e-smoke.test.ts`, `support/fake-cli.ts`): child-process CLI, temporary Git repo, private FakeEngine bootstrap. Uncommitted in the working tree at refresh time. |
| `harnesses/` | Factory review harnesses (E3.F2) | `pr-review/`, `security/`, `quick/` — each `harness.md` + `output.md` + `skills.yaml`. Ships in the npm package. |
| `skills/` | Shared harness skills (E3) | `code-quality.md`, `security.md`. Ships in the npm package. Not the sdd-lite skills. |
| `fixtures/` | Real engine output fixtures (E1.F1.H3) | `claude-code/` and `opencode/` + provenance `README.md`. Feed the adapter contract tests. |
| `history/` | Audit trail of the development process | One entry per session in `history/entries/`, indexed by `history/INDEX.md`; written via the `history-log` skill. |

## Key Docs

| Path | Role | Notes |
|---|---|---|
| `CLAUDE.md` | Operating contract for Claude Code | Workflow rules, architecture guards, decision protocol, sdd-lite activation policy, sdd-lite wrapper block (0.4). |
| `AGENTS.md` | sdd-lite wrapper for AGENTS.md agents | Contains only the sdd-lite 0.4 block; created by `sddl-init`. |
| `docs/prd-sentinel.md` | Product definition v0.3 (English) | §4 architecture rules are **mandatory**, not advisory. |
| `docs/setup-tecnico-sentinel.md` | Stack decisions | Recommendations — re-evaluate at implementation time with justification. |
| `docs/backlog-mvp-sentinel.md` | MVP backlog | 8 epics / 44 stories; mirrored 1:1 into GitHub Issues. |
| `docs/architecture.md`, `docs/coding-standards.md`, `docs/testing.md` | Standards distillation | Validate work against these; they must stay consistent with PRD §4 and `.dependency-cruiser.cjs`. |
| `README.md`, `CONTRIBUTING.md` | Contributor entry points | |
| `create-issues.sh` | GitHub seeding script | One-shot: issues are **not** idempotent across runs. |

## Quality Commands

> Verified exit 0 at refresh time against the working tree on `main`.

| Command Type | Command | Status |
|---|---|---|
| install | `npm ci` | Runnable — lockfile v3. |
| lint / typecheck / format / guards | `npm run check` | **Verified exit 0.** `biome check . && tsc --noEmit && depcruise src`; Biome checked 163 files, dependency-cruiser found 0 violations across 107 modules / 254 dependencies. |
| test | `npm test` (`vitest run`) | **Verified 1038/1038 passing across 50 files.** Projects: `core`, `adapters` (also covers `src/main/**`), `e2e` (now holds the `[E7.F1.H1]` smoke). |
| dev | `npm run dev` | Runnable (`tsup --silent && node dist/cli.js`) — builds the bundle, then runs it. |
| build | `npm run build` (`tsup`) | Runnable — `tsup.config.ts` at root. |

`npm run check` is the single quality gate by design (no separate lint/typecheck/format commands) and covers the five
architecture guards via `.dependency-cruiser.cjs`: `core-no-adapters`, `core-no-io-libs`, `core-modules-via-index`,
`adapters-isolated`, `wiring-only-in-main`. Run a single project with `npx vitest run --project core`.

## Conventions

Project conventions observed during bootstrap. Use `not established` when the evidence budget did not settle a row.

| Area | Convention | Evidence |
|---|---|---|
| naming and file placement | Kebab-case domain-named modules under `src/core/` (no `services/` or `utils/`); one folder per technology under `adapters/`; each module exposes a public `index.ts`; use cases are verb + noun camelCase; ports named by domain role; domain errors end in `Error` and live in their module. | `docs/coding-standards.md`; `src/core/run/` layout; `src/core/run/run-review.ts` |
| layering / architectural pattern | Hexagonal, dependencies inward; core modules import each other only via `index.js`; adapters instantiated only in `src/main/`. Enforced mechanically by dependency-cruiser, not by review. | `.dependency-cruiser.cjs`; `docs/architecture.md`; imports in `run-review.ts` |
| testing style | Vitest, three projects. Core = unit with in-memory port fakes; driven adapters = one shared parameterized contract suite per port; e2e = smoke through the public CLI with FakeEngine. Tests are co-located in `<module>/__test__/*.test.ts`. | `docs/testing.md`; `vitest.config.ts`; `src/core/run/__test__/run-review.test.ts` |
| error handling | Adapters translate raw exceptions into declared port errors; every run ends in exactly one terminal state (`ok \| ambiguous \| engine-error \| timeout \| validation-failed`); the run pipeline cannot throw and cleanup only annotates. | `docs/coding-standards.md`; `src/core/run/run-review.ts` header |

Additional repository-fixed conventions: strict TypeScript under NodeNext (`.js` specifiers on relative imports,
`import type` for type-only imports, conditionally built optional properties under `exactOptionalPropertyTypes`);
Biome formats with 2-space indentation and the recommended lint preset; source and test files open with a module-level
JSDoc block naming the PRD section or acceptance-criteria ids they cover.

Workflow conventions (from `CLAUDE.md`):

- One PR per backlog story, titled `[E2.F1.H2] Title`. Max 5 open PRs. Never merge, never push to `main`.
- Conventional commits. Everything persisted in the repository is English.
- Stories marked ⚪ (optional) are skipped unless explicitly requested.
- Every backlog story runs as an sdd-lite change named after the story id + slug; every session closes with a
  `history/entries/` entry.

sdd-lite conventions (fixed, not project-specific):

- Persisted bootstrap and change artifacts stay in English.
- Chat language may differ from artifact language (this project: chat `es`, artifacts `en`).

## Risks And Unknowns

- **E7 is the only open epic.** Its five required stories are E2E smoke (`[E7.F1.H1]`), one week of dogfooding, user
  documentation, license selection/application, and the first npm release.
- **`[E7.F1.H1]` is implemented but not delivered.** The change `e7-f1-h1-e2e-smoke` has all three executor stages
  complete and awaits `sddl-code-review` and final QA. Its work (`e2e/`, an injected engine-factory seam in
  `src/main/container.ts`) is uncommitted in the working tree of `main`; per the workflow contract it must land via
  a story branch and PR, not a push to `main`.
- **Process/terminal integration risk** carried from E6 (`risk-e6f2h2-014`, review row R4-002): the doubles-based
  suites do not exercise real process and terminal behavior; the E7 smoke targets it.
- **Residual E5 debt, non-blocking.** `risk-006` (the `ProcessRunner` does not kill the whole process group on
  timeout) and the info-tier `R3-001` / `R4-001` observations from the `[E5.F1.H2]` 4R review. Candidates for E7
  dogfooding.
- **Engine flag drift.** Invocation flags were verified only against Claude Code `2.1.226` and OpenCode `1.17.9`
  (`docs/engines/`); drift on version bumps is PRD risk #1.
- **Two `[E6.F1.H1]` spec-vs-behavior deltas:** `risk-e6h1-011` (`repo add` on an already-cloned repo prints `-`
  instead of the local path) and the D14 persistence-failure exit semantics.
- **Unresolved PRD decisions.** Notably decision 6, the license (MIT vs private), tracked as `[E7.F2.H2]` and blocking
  first publish. The npm scope `@nico0695/sentinel` reservation on npmjs.com is user-owned.
- **`[E1.F1.H4]` (context-mode measurement) was skipped** (⚪ optional, issue #10 still open); the prompt
  assembler's `contextMode` option ships without empirical comparison data.
- **Two wrappers installed.** `CLAUDE.md` and `AGENTS.md` both carry an sdd-lite wrapper. Hosts that load both together
  (Grok) see conflicting launch verbs; Claude Code and Codex are unaffected.
- **Untracked root files** unrelated to bootstrap (`mvp-traceability.md`, `hexagonal-architecture-review-e4-f1-h2.md`,
  modified `create-issues.sh`) are outside this refresh's scope.
