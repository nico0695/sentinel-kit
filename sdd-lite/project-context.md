# Project Context

## Metadata

- project_name: sentinel
- project_root: /home/user/sentinel-kit
- runtime_root: ./sdd-lite
- generated_at: 2026-08-01T13:14:29Z
- last_refreshed_at: 2026-08-28T00:00:00Z
- generated_by: sddl-init (surgical refresh by orchestrator, post-E6.F1.H1)

## Stack Summary

> E0 through E6.F1.H2 have landed on `main` @ `ac7a442` (PR #74). The stack below is **observed** in the working tree.
> Package: `@nico0695/sentinel` (ESM, bin `sentinel` + `snt`).

| Area | Value | Evidence |
|---|---|---|
| languages | typescript 5.9.3 | `package.json` devDependencies; `tsconfig.json` at root |
| frameworks | none — CLI application (`commander` installed; `@clack/prompts` still planned for the E6 TUI) | `docs/setup-tecnico-sentinel.md` §4; `package.json` dependencies |
| runtime | node >=22, runtime-agnostic code | `package.json` `engines.node: ">=22"`; `npm run dev` builds with tsup then runs `dist/cli.js` |
| package_manager | npm | `package-lock.json` (lockfileVersion 3) present |

Runtime dependencies installed: `commander ^15.0.0`, `execa ^9.6.1`, `yaml ^2.9.0`, `zod ^4.4.3`. Dev toolchain
installed and green: @biomejs/biome 2.5.6, typescript 5.9.3, @types/node 22.20.1, vitest 4.1.10,
dependency-cruiser 18.1.0, tsup 8.5.1. `commander` was ratified and installed by `[E6.F1.H1]` (the first E6
runtime dep). Still pending: `@clack/prompts` / picocolors (E6 TUI, `[E6.F2.x]`), changesets (E7 release) —
declared-only recommendations from `docs/setup-tecnico-sentinel.md` §4 until their story's design ratifies them.

## Important Directories

| Path | Role | Notes |
|---|---|---|
| `docs/` | Specification source of truth | PRD, technical setup, MVP backlog. The only authoritative content today. |
| `sdd-lite/` | Vendored sdd-lite package + runtime root | Package files and generated runtime artifacts share this directory. |
| `.claude/skills/` | Installed sdd-lite skills | Copy install, path-rewritten to project-relative. |
| `src/` | Source root per PRD §4.2 | Implemented: `core/{repos,workspace,review,run,history,shared}`, `adapters/driven/{engines/{fake,claude-code,opencode},git,storage,exec}`, `adapters/driving/cli/` (commander shell, `repo`/`runs`/`review` commands, renderers — from `[E6.F1.H1]`), `main/{cli.ts,container.ts,paths.ts}` (composition root — the only place adapters are instantiated). `adapters/driving/tui/` is **still an `export {}` placeholder** — the TUI is `[E6.F2.x]`. Tests live in `<module>/__test__/`. |
| `harnesses/` | Factory review harnesses (E3.F2) | `pr-review/`, `security/`, `quick/` — each `harness.md` + `output.md` + `skills.yaml`. Ships in the npm package. |
| `skills/` | Shared harness skills (E3) | `code-quality.md`, `security.md`. Ships in the npm package. |
| `fixtures/` | Real engine output fixtures (E1.F1.H3) | `claude-code/` (6 files) and `opencode/` (6 files) + provenance `README.md`. Feed the E4 adapter contract tests. |
| `docs/engines/` | Canonical headless invocation per engine (E1) | `claude-code.md`, `opencode.md` — invocation, permissions, failure-signature tables, limitations. **Authoritative input for E4.F2.** |

## Key Docs

| Path | Role | Notes |
|---|---|---|
| `CLAUDE.md` | Operating contract for Claude Code | Workflow rules, architecture guards, sdd-lite wrapper block. |
| `docs/prd-sentinel.md` | Product definition v0.3 (English) | §4 architecture rules are **mandatory**, not advisory. |
| `docs/setup-tecnico-sentinel.md` | Stack decisions | Recommendations — re-evaluate at implementation time with justification. |
| `docs/backlog-mvp-sentinel.md` | MVP backlog | 8 epics / 44 stories; mirrored 1:1 into GitHub Issues. |
| `create-issues.sh` | GitHub seeding script | One-shot: issues are **not** idempotent across runs. |

## Quality Commands

> All scripts are runnable. Verified exit 0 as of PR #74 merge against `main` @ `ac7a442`.

| Command Type | Command | Status |
|---|---|---|
| install | `npm ci` | Runnable — lockfile v3, full toolchain installs clean. |
| lint / typecheck / format / guards | `npm run check` | **Runnable, verified exit 0.** Full form: `biome check . && tsc --noEmit && depcruise src`, 0 violations. |
| test | `npm test` (`vitest run`) | **Runnable, verified 707/707 passing across 39 files.** Projects: `core`, `adapters` (also covers `src/main/**`), `e2e` (`e2e/**` still has no files — the smoke suite is `[E7.F1.H1]`). |
| dev | `npm run dev` | Runnable (`tsup --silent && node dist/cli.js`) — builds the bundle, then runs it. Changed in `[E6.F1.H1]`: NodeNext `.js` specifiers are not rewritten by `--experimental-strip-types`. |
| build | `npm run build` (`tsup`) | Runnable — tsup 8.5.1 installed, `tsup.config.ts` at root. |

`npm run check` is the single quality gate by design (no separate lint/typecheck/format commands) and already
covers the five architecture guards via `.dependency-cruiser.cjs`: `core-no-adapters`, `core-no-io-libs`,
`core-modules-via-index`, `adapters-isolated`, `wiring-only-in-main`. Run a single project with
`npx vitest run --project core`.

## Conventions

- Persisted bootstrap and change artifacts stay in English.
- Chat language may differ from artifact language (this project: chat `es`, artifacts `en`).
- Hexagonal boundary is enforced mechanically, not by review: `core/` imports no adapters, no `main/`, and no I/O
  library (whitelist: zod). A violating import fails CI.
- One PR per backlog story, titled `[E2.F1.H2] Title`. Max 5 open PRs. Never merge, never push to main.
- Conventional commits.
- Stories marked ⚪ (optional) are skipped unless explicitly requested.

## Risks And Unknowns

- ~~Pre-implementation repository~~ **Resolved 2026-08-01**: `[E0.F1.H1]` landed (PR #47). CI green since
  `[E0.F1.H3]` (PR #49).
- ~~Stack declared, not verified~~ **Resolved 2026-08-09**: the full toolchain is installed and verified together;
  `npm run check` and `npm test` both exit 0. Only E6/E7 deps (commander, @clack/prompts, picocolors, changesets)
  remain declared-only.
- ~~Two engine spikes are unresolved unknowns~~ **Resolved 2026-08-08** (`[E1.F1.H1]`, `[E1.F1.H2]`, `[E1.F1.H3]`,
  PR #63): canonical headless invocation, permission posture, timeout/kill behavior and failure signatures are
  documented per engine in `docs/engines/`, with 12 real output fixtures in `fixtures/`. **E4.F2 must build on
  those docs rather than re-deriving invocation details.** Residual risk: flags verified only against Claude Code
  `2.1.226` and OpenCode `1.17.9` — flag drift on version bumps is PRD risk #1.
- ~~The product has no user-facing surface yet.~~ **Partially resolved 2026-08-28** (`[E6.F1.H1]`, PR #73): the
  CLI is now reachable — `repo add|list`, `review`, `runs list|show`, `--version`, `--help`, each invoking its use
  case with zero logic in the command. `[E6.F1.H2]` (PR #74) added the documented exit-code contract
  (0 / configurable-default-1 / 2, fail-closed on ok-without-verdict, `--changes-exit-code`) for
  non-interactive/scriptable use; the TUI is `[E6.F2.x]` (current story: `[E6.F2.H1]` navigation flow);
  `[E7.F1.H1]` is what covers the flow end to end. Two spec-vs-behavior deltas carried
  from `[E6.F1.H1]`: `risk-e6h1-011` (`repo add` on an already-cloned repo prints `-` where the spec promised the
  local path) and the D14 persistence-failure exit semantics (verdict on stdout, diagnostic on stderr, exit 1
  without a sixth terminal state).
- **Residual E5 debt, non-blocking for E6.** `risk-006` (the `ProcessRunner` does not kill the whole process group
  on timeout, inherited from `[E5.F1.H1]`) and the info-tier `R3-001` / `R4-001` scope observations from the
  `[E5.F1.H2]` 4R review. Candidates for E7 dogfooding, not for this epic.
- **Unresolved PRD decisions.** Notably decision 6, the license (MIT vs private), tracked as `[E7.F2.H2]` and
  blocking first publish.
- **`[E1.F1.H4]` (context-mode measurement) was skipped** — ⚪ optional, issue #10 still open. The prompt
  assembler's `contextMode` option (`[E3.F1.H3]`) therefore ships without empirical comparison data.
- **npm scope `@nico0695/sentinel`** (bin `sentinel` + alias `snt`): now the real package name in `package.json`,
  and docs placeholders were updated with it. The scope reservation on npmjs.com remains user-owned.
