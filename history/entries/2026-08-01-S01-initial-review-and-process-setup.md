# S01 — Initial review, sdd-lite bootstrap, and audit system setup

- **Date**: 2026-08-01
- **Branch**: `claude/sentinel-cli-code-review-wl7ieg`
- **Scope**: pre-E0 — validation of documentation and development-process setup (no backlog story implemented yet)
- **sdd-lite changes**: — (session/process work, exempt per activation policy)

## Objective

Validate everything that exists (docs, backlog, scripts, sdd-lite, AI utilities) before starting
`[E0.F1.H1]`, and leave operational: automatic sdd-lite activation, the decision protocol, and the
audit system.

## Decisions

| ID | Decision | Alternatives considered | Why | Authorship |
|----|----------|-------------------------|-----|------------|
| S01-D1 | npm scope: `@nico0695/sentinel` (bin `sentinel` + alias `snt`) | Keep placeholder, decide at E7 | Unblocks E0.F1.H1 without debt; user picked their scope | `claude→user` |
| S01-D2 | Do not implement E0.F1.H1 yet; analysis only | Implement scaffold in the same session | User wanted to revalidate the process first | `user` |
| S01-D3 | Backlog seeded into GitHub via `create-issues.sh` run locally by the user (option A) | (B) seed issues without milestones via MCP; (C) manual milestones + issues via MCP | Remote env has no `gh` and no MCP tool for milestones; the script is the designed path and avoids duplicates | `claude→user` |
| S01-D4 | Unify epic E7 as `Wrap-up` in the backlog doc | Rename to `Closure` in the script | The script is what seeds GitHub; smaller change surface | `claude` |
| S01-D5 | Deterministic sdd-lite activation: every `[E*.F*.H*]` story and every multi-file change runs as an openspec change; trivial work exempt | Keep the generic wrapper's "suggest" mode | User asked for automatic use; suggestion mode depended on per-session judgment | `claude→user` |
| S01-D6 | A/B/C decision protocol in CLAUDE.md (autonomous / consult with recommendation / STOP) | Consult everything (slow) or unrecorded autonomy (opaque) | Defines when to ask for help and guarantees authorship traceability | `claude→user` |
| S01-D7 | Audit trail in `history/`: 1 entry per session + INDEX + template + `history-log` skill; mandatory at close | 1 entry per story/task; template-only without skill | Less reading friction; the skill standardizes generation | `claude→user` |
| S01-D8 | ~~History entries in Spanish~~ **Overridden by S01-D10** | English (persisted-artifacts convention) | Original rationale: process docs for direct user reading. Reversed by the user | `claude` |
| S01-D9 | sdd-lite bootstrap: `refresh_recommended: false` after refresh, with a mandatory re-refresh note for when E0.F1.H1 lands | Keep flag true until package.json exists | A true flag would by rule block executing the very story that creates the toolchain (circular); the pre-implementation state is documented, not stale | `claude` |
| S01-D10 | **Everything persisted is English** — code, comments, docs, history, commits, PRs/issues; chat may stay Spanish. Vendored `sdd-lite/` third-party files exempt | Spanish history (S01-D8); mixed-language docs | User decision: single language avoids drift and matches the English PRD and seeded issues. Codified as "Language policy" in CLAUDE.md | `user` |
| S01-D11 | Keep doc filenames (`setup-tecnico-sentinel.md`, `backlog-mvp-sentinel.md`) despite Spanish-derived names | Rename to English filenames | 44 seeded issue bodies and cross-references link these exact paths; renaming breaks them for zero content value | `claude` |

## Deviations

- **sdd-lite bootstrap carried paths from another machine**: `config.yaml` and `project-context.md`
  pointed to `/Users/nicolasschmidt/.../test-cr-cli`. Fixed to `/home/user/sentinel-kit` via
  `sddl-init` refresh. Also removed a reference to a non-existent `scripts/` directory and updated
  stale risks (npm scope decided, issues verified empty).
- **`create-issues.sh` not runnable in the remote environment** (requires `gh` CLI; GitHub MCP does
  not expose milestone creation). Resolved with S01-D3: the user ran it locally.
- **CLAUDE.md wrapper vs. project policy**: the sddl-init-generated block said "do not activate
  sdd-lite automatically". Replaced with a pointer to the new deterministic policy, which lives
  outside the block to survive regenerations.
- **Language reversal (S01-D8 → S01-D10)**: the initial `history/` files were written in Spanish
  under an autonomous decision; the user overrode it the same day. All history files and the
  `history-log` skill were rewritten in English; this entry was renamed from its Spanish slug.
- **Stale "in Spanish" labels in CLAUDE.md**: CLAUDE.md described `setup-tecnico` and `backlog-mvp`
  docs as Spanish, but both were already English on disk (verified by two independent translation
  agents finding nothing to translate). Labels removed.

## Work done

- Full review: PRD v0.3, technical setup, backlog (8 epics / 44 stories — counts consistent),
  `create-issues.sh` (correct; one-shot on issues), sdd-lite (functional, installed, valid schemas),
  11 detectable skills under `.claude/skills/`.
- Verified on GitHub: backlog seeded by the user — 8 milestones + 44 issues (#2–#45); `[E0.F1.H1]` = issue #2.
- Commit `8e2906e` — E7 epic name unified to `Wrap-up` (merged to `main` via PR #1 by the user).
- sdd-lite bootstrap refresh (`sdd-lite/openspec/config.yaml`, `sdd-lite/project-context.md`).
- CLAUDE.md: sdd-lite activation policy + A/B/C protocol + mandatory audit history + language policy.
- Created `history/` (README, TEMPLATE, INDEX, this entry) and the `.claude/skills/history-log` skill;
  later rewritten fully in English (S01-D10).
- Post-merge protocol applied after PR #1: branch rebased onto `main`; process commits carried into PR #46.

## Pending and next steps

- **User**: review and merge PR #46 (process infrastructure, now including the language policy).
- **Next session**: start `[E0.F1.H1]` (issue #2) as sdd-lite change `e0-f1-h1-scaffold`, npm scope
  `@nico0695/sentinel`; replace the `@<scope>` placeholder in docs within that same story.
- After E0.F1.H1: re-refresh the sdd-lite bootstrap (quality commands become runnable).
- Open PRD decisions: license (E7.F2.H2) and `sentinel open` (decision 5) — non-blocking.

## Open questions for the user

—
