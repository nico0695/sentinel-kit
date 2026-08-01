# Project Context

## Metadata

- project_name: sentinel
- project_root: /home/user/sentinel-kit
- runtime_root: ./sdd-lite
- generated_at: 2026-08-01T13:14:29Z
- last_refreshed_at: 2026-08-01T14:39:32Z
- generated_by: sddl-init

## Stack Summary

> `[E0.F1.H1]` (scaffold, PR #47) landed: the stack below is now **observed** in the working tree, not just
> specified in `docs/`. Package: `@nico0695/sentinel` (ESM, bin `sentinel` + `snt`).

| Area | Value | Evidence |
|---|---|---|
| languages | typescript 7.0.2 | `package.json` devDependencies; `tsconfig.json` at root |
| frameworks | none — CLI application (commander + @clack/prompts planned) | `docs/setup-tecnico-sentinel.md` §4; no runtime deps installed yet |
| runtime | node >=22, runtime-agnostic code | `package.json` `engines.node: ">=22"`; `npm run dev` uses `--experimental-strip-types` |
| package_manager | npm | `package-lock.json` (lockfileVersion 3) present |

Runtime dependencies: **none installed yet** — the planned minimal set (commander, @clack/prompts, execa, zod,
yaml, picocolors, ±marked) arrives with its stories. Dev toolchain installed and green: @biomejs/biome 2.5.6,
typescript 7.0.2, @types/node 22.20.1. Still pending: vitest, dependency-cruiser, tsup, changesets.

## Important Directories

| Path | Role | Notes |
|---|---|---|
| `docs/` | Specification source of truth | PRD, technical setup, MVP backlog. The only authoritative content today. |
| `sdd-lite/` | Vendored sdd-lite package + runtime root | Package files and generated runtime artifacts share this directory. |
| `.claude/skills/` | Installed sdd-lite skills | Copy install, path-rewritten to project-relative. |
| `src/` | Source root per PRD §4.2 | 13 placeholder modules, zero imports: `core/{repos,workspace,review,run,history,shared}`, `adapters/driving/{cli,tui}`, `adapters/driven/{engines,git,exec,storage}`, `main/cli.ts`. |
| `harnesses/`, `skills/`, `fixtures/` | Packaged/support roots (`.gitkeep` placeholders) | `harnesses` and `skills` ship in the npm package (`files` in package.json); `fixtures/` holds adapter contract fixtures later. |

## Key Docs

| Path | Role | Notes |
|---|---|---|
| `CLAUDE.md` | Operating contract for Claude Code | Workflow rules, architecture guards, sdd-lite wrapper block. |
| `docs/prd-sentinel.md` | Product definition v0.3 (English) | §4 architecture rules are **mandatory**, not advisory. |
| `docs/setup-tecnico-sentinel.md` | Stack decisions | Recommendations — re-evaluate at implementation time with justification. |
| `docs/backlog-mvp-sentinel.md` | MVP backlog | 8 epics / 44 stories; mirrored 1:1 into GitHub Issues. |
| `create-issues.sh` | GitHub seeding script | One-shot: issues are **not** idempotent across runs. |

## Quality Commands

> Scripts exist in `package.json` (per setup §5.1). `check` and `dev` are runnable today (verified exit 0 on
> 2026-08-01); `build` and `test` are defined but their tools land in later stories.

| Command Type | Command | Status |
|---|---|---|
| install | `npm install` | Runnable — lockfile v3, dev toolchain installs clean. |
| lint / typecheck / format | `npm run check` | **Runnable, verified exit 0.** Currently `biome check . && tsc --noEmit`; `depcruise src` is appended by `[E0.F1.H2]`. |
| dev | `npm run dev` | Runnable, verified exit 0 (`node --experimental-strip-types src/main/cli.ts`). |
| build | `npm run build` (`tsup`) | Script defined; tsup not installed yet — lands in its own story. |
| test | `npm test` (`vitest run`) | Script defined; vitest not installed yet — lands with `[E0.F2.x]`; projects split core/adapters/e2e per §5.4. |

`npm run check` is the single quality gate by design (no separate lint/typecheck/format commands). It reaches its
full form — `biome check . && tsc --noEmit && depcruise src`, covering the five architecture guards — once
`[E0.F1.H2]` adds dependency-cruiser.

## Conventions

- Persisted bootstrap and change artifacts stay in English.
- Chat language may differ from artifact language (this project: chat `es`, artifacts `en`).
- Hexagonal boundary is enforced mechanically, not by review: `core/` imports no adapters, no `main/`, and no I/O
  library (whitelist: zod). A violating import fails CI.
- One PR per backlog story, titled `[E2.F1.H2] Title`. Max 5 open PRs. Never merge, never push to main.
- Conventional commits.
- Stories marked ⚪ (optional) are skipped unless explicitly requested.

## Risks And Unknowns

- ~~Pre-implementation repository~~ **Resolved 2026-08-01**: `[E0.F1.H1]` landed (PR #47) — `package.json`,
  lockfile, `tsconfig.json`, `biome.json`, and the PRD §4.2 `src/` skeleton exist; `npm run check` is green.
  CI is still pending (`[E0.F1.H2]`/`[E0.F1.H3]`).
- ~~Stack declared, not verified~~ **Partially resolved 2026-08-01**: the installed dev toolchain (biome 2.5.6,
  typescript 7.0.2, @types/node 22.20.1) is verified working together. Runtime deps and the remaining dev tools
  (vitest, depcruise, tsup, changesets) are still declared-only until their stories land.
- **Unresolved PRD decisions.** Notably decision 6, the license (MIT vs private), tracked as `[E7.F2.H2]` and
  blocking first publish.
- **Two engine spikes are unresolved unknowns** (`[E1.F1.H1]`, `[E1.F1.H2]`): headless invocation, non-interactive
  mode, timeouts, and whether OpenCode emits structured output at all. Much of E4 depends on their outcome.
- **npm scope `@nico0695/sentinel`** (bin `sentinel` + alias `snt`): now the real package name in `package.json`,
  and docs placeholders were updated with it. The scope reservation on npmjs.com remains user-owned.
