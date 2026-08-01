# Project Context

## Metadata

- project_name: sentinel
- project_root: /home/user/sentinel-kit
- runtime_root: ./sdd-lite
- generated_at: 2026-08-01T13:14:29Z
- last_refreshed_at: 2026-08-01T13:42:35Z
- generated_by: sddl-init

## Stack Summary

> The repository is **pre-implementation**: no commits, no manifest, no source tree. Every stack value below is
> *specified* in `docs/`, not yet *observed* in the working tree. Treat them as the approved target, and re-validate
> once `[E0.F1.H1]` (scaffold) lands.

| Area | Value | Evidence |
|---|---|---|
| languages | typescript | `docs/setup-tecnico-sentinel.md` §1 (decided, with analysis) |
| frameworks | none — CLI application (commander + @clack/prompts) | `docs/setup-tecnico-sentinel.md` §4 |
| runtime | node >=22, runtime-agnostic code | `docs/setup-tecnico-sentinel.md` §2; `docs/prd-sentinel.md` |
| package_manager | npm | `docs/setup-tecnico-sentinel.md` §5.1 (`npm run` scripts, npm publish with provenance) |

Planned runtime dependencies (7 total, deliberately minimal): commander, @clack/prompts, execa, zod, yaml,
picocolors, ±marked. Dev toolchain: vitest, Biome, dependency-cruiser, tsup, changesets.

## Important Directories

| Path | Role | Notes |
|---|---|---|
| `docs/` | Specification source of truth | PRD, technical setup, MVP backlog. The only authoritative content today. |
| `sdd-lite/` | Vendored sdd-lite package + runtime root | Package files and generated runtime artifacts share this directory. |
| `.claude/skills/` | Installed sdd-lite skills | Copy install, path-rewritten to project-relative. |
| `src/` | **Does not exist yet** | Target layout is PRD §4.2: `core/`, `adapters/{driving,driven}/`, `main/`. |

## Key Docs

| Path | Role | Notes |
|---|---|---|
| `CLAUDE.md` | Operating contract for Claude Code | Workflow rules, architecture guards, sdd-lite wrapper block. |
| `docs/prd-sentinel.md` | Product definition v0.3 (English) | §4 architecture rules are **mandatory**, not advisory. |
| `docs/setup-tecnico-sentinel.md` | Stack decisions (Spanish) | Recommendations — re-evaluate at implementation time with justification. |
| `docs/backlog-mvp-sentinel.md` | MVP backlog (Spanish) | 8 epics / 44 stories; mirrored 1:1 into GitHub Issues. |
| `create-issues.sh` | GitHub seeding script | One-shot: issues are **not** idempotent across runs. |

## Quality Commands

> None of these are runnable yet — no `package.json` exists. They come from `docs/setup-tecnico-sentinel.md` §5.1
> and become real with story `[E0.F1.H1]`.

| Command Type | Candidate Commands | Evidence |
|---|---|---|
| install | `npm install` | inferred from npm-based scripts |
| test | `npm test` (`vitest run`) | setup §5.1; projects split core/adapters/e2e per §5.4 |
| build | `npm run build` (`tsup`) | setup §5.1 |
| lint | `npm run check` | setup §5.1 — combined command |
| typecheck | `npm run check` | setup §5.1 — combined command |

`npm run check` = `biome check . && tsc --noEmit && depcruise src`. It is a single gate covering lint/format,
typecheck, **and the five architecture guards**. There are no separate lint/typecheck/format commands by design.

## Conventions

- Persisted bootstrap and change artifacts stay in English.
- Chat language may differ from artifact language (this project: chat `es`, artifacts `en`).
- Hexagonal boundary is enforced mechanically, not by review: `core/` imports no adapters, no `main/`, and no I/O
  library (whitelist: zod). A violating import fails CI.
- One PR per backlog story, titled `[E2.F1.H2] Title`. Max 5 open PRs. Never merge, never push to main.
- Conventional commits.
- Stories marked ⚪ (optional) are skipped unless explicitly requested.

## Risks And Unknowns

- **Pre-implementation repository.** Only docs are committed (repo `nico0695/sentinel-kit`, product `sentinel`);
  no CI in place yet — the first stages produce the very toolchain that later stages validate against.
- **Stack is declared, not verified.** Library choices are documented decisions that have never been installed or
  exercised together.
- **Unresolved PRD decisions.** Notably decision 6, the license (MIT vs private), tracked as `[E7.F2.H2]` and
  blocking first publish.
- **Two engine spikes are unresolved unknowns** (`[E1.F1.H1]`, `[E1.F1.H2]`): headless invocation, non-interactive
  mode, timeouts, and whether OpenCode emits structured output at all. Much of E4 depends on their outcome.
- **npm scope decided 2026-08-01**: `@nico0695/sentinel` (bin `sentinel` + alias `snt`). Docs still carry the
  `@<scope>` placeholder; update them when `[E0.F1.H1]` writes the real package.json.
- GitHub Issues verified empty on 2026-08-01: `create-issues.sh` is pending — the user runs it locally with
  authenticated `gh` (one-shot; a second run duplicates all 44 issues).
